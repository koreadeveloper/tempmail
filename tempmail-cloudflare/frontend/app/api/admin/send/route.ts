import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_DOMAINS = new Set(['sia.kr', 'mail.sia.kr']);
const RESEND_API = 'https://api.resend.com/emails';

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const { secret, fromLocalpart, fromDomain, fromName, to, subject, text } = body ?? {};

    if (!secret || !fromLocalpart || !to || !subject || !text) {
        return NextResponse.json({ error: 'missing fields' }, { status: 400 });
    }

    // 관리자 키 검증 (공개 anon 키 + RPC로 확인 — service key를 프론트 env에 둘 필요 없음)
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: ok } = await supabase.rpc('admin_ok', { p_secret: secret });
    if (ok !== true) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 503 });
    }

    // 발신자 조립 — 로컬파트는 화이트리스트 문자만, 도메인은 허용 목록만
    const localpart = String(fromLocalpart).toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^\.+|\.+$/g, '');
    if (!localpart) {
        return NextResponse.json({ error: 'invalid localpart' }, { status: 400 });
    }
    const domain = ALLOWED_DOMAINS.has(fromDomain) ? fromDomain : 'sia.kr';
    const addr = `${localpart}@${domain}`;
    const safeName = String(fromName || '').replace(/[<>"]/g, '').trim();
    const from = safeName ? `${safeName} <${addr}>` : addr;

    const toAddr = String(to).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toAddr)) {
        return NextResponse.json({ error: 'invalid recipient' }, { status: 400 });
    }

    const resendRes = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: [toAddr],
            subject: String(subject).slice(0, 200),
            text: String(text).slice(0, 50_000),
        }),
    });

    const data = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
        return NextResponse.json({ error: data?.message || `resend ${resendRes.status}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, id: data.id });
}
