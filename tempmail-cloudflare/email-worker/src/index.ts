/**
 * Cloudflare Email Worker for TempMail
 * 
 * RLS 지원 버전 - service_role key 사용
 * - URL trailing slash 자동 처리
 * - 상세 디버깅 로그
 * - service_role key 사용 (RLS 활성화 상태에서 INSERT 가능)
 */

import PostalMime from 'postal-mime';

export interface Env {
    SUPABASE_URL: string;              // 예: https://xxxxx.supabase.co (끝에 / 없이)
    SUPABASE_SERVICE_ROLE_KEY: string; // Supabase service_role key (RLS 우회)
}

export default {
    async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log('========== EMAIL RECEIVED ==========');
        console.log(`To: ${message.to}`);
        console.log(`From: ${message.from}`);

        try {
            // 환경 변수 확인 로그
            console.log(`SUPABASE_URL 설정됨: ${env.SUPABASE_URL ? 'YES' : 'NO'}`);
            console.log(`SUPABASE_SERVICE_ROLE_KEY 설정됨: ${env.SUPABASE_SERVICE_ROLE_KEY ? 'YES' : 'NO'}`);

            if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
                throw new Error('환경 변수가 설정되지 않음! SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인하세요.');
            }

            // Read raw email content
            const rawEmail = await new Response(message.raw).arrayBuffer();

            // Parse email using postal-mime
            const parser = new PostalMime();
            const parsed = await parser.parse(rawEmail);

            // Prepare data for Supabase
            const emailData = {
                recipient: message.to.toLowerCase(),
                sender: message.from,
                subject: parsed.subject || '(제목 없음)',
                body_text: parsed.text || '',
                body_html: parsed.html || '',
            };

            console.log(`Subject: ${emailData.subject}`);

            // ⚠️ URL 조립 - trailing slash 안전하게 처리
            const baseUrl = env.SUPABASE_URL.replace(/\/+$/, ''); // 끝의 슬래시 모두 제거
            const supabaseUrl = `${baseUrl}/rest/v1/emails`;

            console.log(`API URL: ${supabaseUrl}`);

            // POST to Supabase REST API
            const response = await fetch(supabaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(emailData),
            });

            console.log(`Response Status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Supabase INSERT 실패!`);
                console.error(`Status: ${response.status}`);
                console.error(`Error: ${errorText}`);
                throw new Error(`Supabase error: ${response.status} - ${errorText}`);
            }

            console.log(`✅ 이메일 저장 성공! recipient: ${emailData.recipient}`);
            console.log('=====================================');

        } catch (error) {
            console.error('❌ 이메일 처리 실패:', error);
            console.log('=====================================');
        }
    },
};
