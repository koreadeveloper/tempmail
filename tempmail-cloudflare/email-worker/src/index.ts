/**
 * Cloudflare Email Worker for TempMail
 *
 * RLS 지원 버전 - service_role key 사용
 * - URL trailing slash 자동 처리
 * - 상세 디버깅 로그
 * - 실패 시 message.setReject()로 발신자에게 반송 (조용한 드랍 방지)
 * - 잠금 인박스(inbox_keys.locked=true, expires_at 미만) → emails_locked 테이블로 라우팅
 *   잠금은 생성 후 24시간(TTL) 뒤 자동 해제되어 공개 수신함으로 복귀
 * - 첨부파일 → Supabase Storage 'attachments' 버킷 업로드 (실패해도 메일 저장은 계속)
 * - 인라인 이미지(cid: 참조)도 Storage에 업로드 후 본문 HTML의 cid: 를 공개 URL로 치환
 * - raw_mime 컬럼에 원본 MIME 저장 (300KB 이하만)
 * - FORWARD_MAP 기반 자동 전달 (DB 저장 성공 후에만, 실패해도 반송 안 함)
 */

import PostalMime from 'postal-mime';

export interface Env {
    SUPABASE_URL: string;               // 예: https://xxxxx.supabase.co (끝에 / 없이)
    SUPABASE_SERVICE_ROLE_KEY?: string; // Supabase service_role key (RLS 우회)
    SUPABASE_SERVICE_KEY?: string;      // 구버전 이름 (하위 호환)
    SUPABASE_ANON_KEY?: string;         // 현재 배포된 바인딩 이름 (하위 호환)
    FORWARD_MAP?: string;               // 선택: JSON 문자열, 예: {"me":"real@example.com"}
}

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 첨부 1개당 최대 5MB
const MAX_ATTACHMENTS = 10;                  // 메일당 최대 첨부 업로드 시도 수
const MAX_RAW_MIME_SIZE = 300_000;           // raw_mime 저장 상한 (300KB)

interface AttachmentMeta {
    name: string;        // 원본 파일명 (없으면 safeName)
    size: number;        // 바이트 크기
    contentType: string; // MIME 타입
    path: string;        // attachments 버킷 내 오브젝트 경로 (인코딩 안 한 raw safeName 사용)
}

// 파일명을 스토리지 경로에 안전한 문자만 남기도록 정리 (한글 허용)
function sanitizeFilename(name: string | null | undefined): string {
    const cleaned = (name || '').replace(/[^\w.\-가-힣]/g, '_');
    return cleaned || 'file';
}

// postal-mime 버전에 따라 contentType으로 올 수도 있어 둘 다 확인
function attachmentContentType(att: { mimeType?: string; contentType?: string }): string {
    return att.mimeType || att.contentType || 'application/octet-stream';
}

// FORWARD_MAP(JSON 문자열)에서 수신자 localpart에 매핑된 전달 주소 조회
function resolveForwardTarget(env: Env, recipient: string): string | null {
    if (!env.FORWARD_MAP) {
        return null;
    }
    try {
        const map = JSON.parse(env.FORWARD_MAP) as Record<string, unknown>;
        const localpart = recipient.split('@')[0];
        const target = map[localpart];
        return typeof target === 'string' && target.length > 0 ? target : null;
    } catch (e) {
        console.error('⚠️ FORWARD_MAP JSON 파싱 실패:', e);
        return null;
    }
}

export default {
    // 헬스체크용 HTTP 엔드포인트
    async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
        return new Response('tempmail-email-worker ok', { status: 200 });
    },

    async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log('========== EMAIL RECEIVED ==========');
        console.log(`To: ${message.to}`);
        console.log(`From: ${message.from}`);

        const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;

        try {
            console.log(`SUPABASE_URL 설정됨: ${env.SUPABASE_URL ? 'YES' : 'NO'}`);
            console.log(`service key 설정됨: ${serviceKey ? 'YES' : 'NO'}`);

            if (!env.SUPABASE_URL || !serviceKey) {
                throw new Error('환경 변수가 설정되지 않음! SUPABASE_URL과 service key를 확인하세요.');
            }

            // ⚠️ URL 조립 - trailing slash 안전하게 처리
            const baseUrl = env.SUPABASE_URL.replace(/\/+$/, ''); // 끝의 슬래시 모두 제거
            const recipient = message.to.toLowerCase();

            // ===== 1) 잠금 인박스 여부 조회 → 테이블 결정 =====
            const lockUrl = `${baseUrl}/rest/v1/inbox_keys?address=eq.${encodeURIComponent(recipient)}&select=locked,expires_at`;
            console.log(`인박스 잠금 조회: ${lockUrl}`);

            const lockRes = await fetch(lockUrl, {
                method: 'GET',
                headers: {
                    'apikey': serviceKey,
                    'Authorization': `Bearer ${serviceKey}`,
                },
            });

            if (!lockRes.ok) {
                const lockErr = await lockRes.text();
                console.error(`❌ inbox_keys 조회 실패!`);
                console.error(`Status: ${lockRes.status}`);
                console.error(`Error: ${lockErr}`);
                // 잠금 여부를 모르면 잘못된 테이블에 넣지 않고 반송 (발신자 재시도 유도)
                throw new Error(`inbox_keys lookup failed: ${lockRes.status} - ${lockErr}`);
            }

            const lockRows = (await lockRes.json()) as { locked?: boolean; expires_at?: string | null }[];
            const lockRow = lockRows[0];
            // 잠금은 expires_at 전까지만 유효 — 만료 시 공개 수신함으로 복귀
            const locked = lockRow?.locked === true &&
                (!lockRow.expires_at || new Date(lockRow.expires_at).getTime() > Date.now());
            const table = locked ? 'emails_locked' : 'emails';
            console.log(`인박스 상태: ${locked ? '🔒 LOCKED' : '🔓 unlocked'} → 테이블: ${table}`);

            // ===== 2) 원본 읽기 + 파싱 =====
            const rawEmail = await new Response(message.raw).arrayBuffer();

            const parser = new PostalMime();
            const parsed = await parser.parse(rawEmail);

            const emailId = crypto.randomUUID();
            console.log(`Email ID: ${emailId}`);

            // ===== 3) 첨부파일 → Supabase Storage 업로드 =====
            const metas: AttachmentMeta[] = [];
            const attachments = parsed.attachments || [];
            console.log(`첨부파일 개수: ${attachments.length}`);

            // 인라인(cid:) 이미지 → 본문 src 치환용 매핑
            const cidUrls: { cid: string; filename: string; url: string }[] = [];

            let uploadCount = 0;

            for (const att of attachments) {
                const isInline = att.related === true && !!att.contentId;
                if (att.related === true && !att.contentId) {
                    continue; // cid 없는 인라인 관련 첨부는 치환 불가 → 스킵
                }
                if (uploadCount >= MAX_ATTACHMENTS) {
                    console.log(`⚠️ 첨부파일 최대 ${MAX_ATTACHMENTS}개 초과 — 나머지 스킵`);
                    break;
                }

                const originalName = att.filename || '';
                const bareCid = att.contentId ? att.contentId.replace(/^<|>$/g, '') : '';
                // 인라인 첨부는 파일명이 없는 경우가 많음 → cid로 대체 경로 생성
                const safeName = originalName
                    ? sanitizeFilename(originalName)
                    : (isInline && bareCid ? sanitizeFilename(`inline-${bareCid}`) : 'file');

                try {
                    // content가 string(base64 등)으로 올 수도 있으므로 바이트로 통일
                    const bytes = typeof att.content === 'string'
                        ? new TextEncoder().encode(att.content)
                        : att.content;

                    if (!bytes || bytes.byteLength === 0) {
                        console.log(`⚠️ 빈 첨부파일 스킵: ${safeName}`);
                        continue;
                    }
                    if (bytes.byteLength > MAX_ATTACHMENT_SIZE) {
                        console.log(`⚠️ 첨부파일 크기 초과 스킵: ${safeName} (${bytes.byteLength} bytes > 5MB)`);
                        continue;
                    }

                    const contentType = attachmentContentType(att);
                    const objectUrl = `${baseUrl}/storage/v1/object/attachments/${encodeURIComponent(emailId)}/${encodeURIComponent(safeName)}`;

                    uploadCount++;
                    const upRes = await fetch(objectUrl, {
                        method: 'POST',
                        headers: {
                            'apikey': serviceKey,
                            'Authorization': `Bearer ${serviceKey}`,
                            'Content-Type': contentType,
                            'x-upsert': 'true',
                        },
                        body: bytes,
                    });

                    if (!upRes.ok) {
                        const upErr = await upRes.text();
                        console.error(`⚠️ 첨부파일 업로드 실패 (${upRes.status}): ${safeName}`);
                        console.error(`Error: ${upErr}`);
                        continue; // 업로드 실패해도 메일 저장은 계속
                    }

                    if (isInline && att.contentId) {
                        const publicUrl = `${baseUrl}/storage/v1/object/public/attachments/${encodeURIComponent(emailId)}/${encodeURIComponent(safeName)}`;
                        cidUrls.push({ cid: bareCid, filename: originalName, url: publicUrl });
                        console.log(`🖼️ 인라인 이미지 업로드: ${safeName} (cid:${bareCid})`);
                    } else {
                        metas.push({
                            name: originalName || safeName,
                            size: bytes.byteLength,
                            contentType,
                            path: `${emailId}/${safeName}`,
                        });
                        console.log(`📎 첨부파일 저장 완료: ${safeName} (${bytes.byteLength} bytes)`);
                    }
                } catch (attErr) {
                    // 첨부 하나 실패해도 메일 자체는 저장
                    console.error(`⚠️ 첨부파일 처리 예외: ${safeName}`, attErr);
                }
            }

            console.log(`업로드된 첨부파일 수: ${metas.length}, 인라인 이미지 수: ${cidUrls.length}`);

            // 본문 HTML의 cid: 참조를 Storage 공개 URL로 치환
            let bodyHtml = parsed.html || '';
            if (bodyHtml && cidUrls.length > 0) {
                for (const c of cidUrls) {
                    const refs = [c.cid, `<${c.cid}>`, c.filename, encodeURIComponent(c.filename)]
                        .filter((r): r is string => !!r);
                    for (const ref of refs) {
                        bodyHtml = bodyHtml.split(`cid:${ref}`).join(c.url);
                    }
                }
                console.log(`cid: 치환 완료 (${cidUrls.length}개 매핑)`);
            }

            // ===== 4) raw_mime (300KB 초과 시 null) =====
            const raw_mime = rawEmail.byteLength <= MAX_RAW_MIME_SIZE
                ? new TextDecoder().decode(rawEmail)
                : null;
            console.log(`raw_mime 저장 여부: ${raw_mime !== null ? `YES (${rawEmail.byteLength} bytes)` : `NO (${rawEmail.byteLength} bytes > 300KB)`}`);

            // ===== 5) DB INSERT =====
            const emailData = {
                id: emailId,
                recipient,
                sender: message.from,
                subject: parsed.subject || '(제목 없음)',
                body_text: parsed.text || '',
                body_html: bodyHtml,
                attachments: metas,
                raw_mime,
            };

            console.log(`Subject: ${emailData.subject}`);

            const supabaseUrl = `${baseUrl}/rest/v1/${table}`;
            console.log(`API URL: ${supabaseUrl}`);

            const response = await fetch(supabaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': serviceKey,
                    'Authorization': `Bearer ${serviceKey}`,
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(emailData),
            });

            console.log(`Response Status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Supabase INSERT 실패! (table: ${table})`);
                console.error(`Status: ${response.status}`);
                console.error(`Error: ${errorText}`);
                throw new Error(`Supabase error: ${response.status} - ${errorText}`);
            }

            console.log(`✅ 이메일 저장 성공! table: ${table}, recipient: ${emailData.recipient}`);

            // ===== 6) 자동 전달 (반드시 DB 저장 성공 후에, 실패해도 반송 안 함) =====
            const forwardTarget = resolveForwardTarget(env, recipient);
            if (forwardTarget) {
                try {
                    await message.forward(forwardTarget);
                    console.log(`📤 자동 전달 완료: ${recipient} → ${forwardTarget}`);
                } catch (fwdErr) {
                    console.error(`⚠️ 자동 전달 실패 (저장은 유지됨): ${forwardTarget}`, fwdErr);
                }
            }

            console.log('=====================================');

        } catch (error) {
            console.error('❌ 이메일 처리 실패:', error);
            console.log('=====================================');
            // 조용히 삼키지 않고 반송 처리 → 발신자에게 바운스 메일이 감
            message.setReject(`TempMail processing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
};
