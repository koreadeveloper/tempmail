import type { Email } from './supabase';

/** 개발 전용 QA 목업 — ?mock=1 일 때만 사용 (프로덕션 번들 영향 없음) */
export const MOCK_EMAILS: Email[] = [
    {
        id: 'mock-1', recipient: 'demo@sia.kr', sender: 'OpenAI <noreply@openai.com>',
        subject: 'Your verification code', body_text: 'Hi there, Use the following verification code to continue: 317921. This code expires in 10 minutes.',
        body_html: '<p>Hi there,</p><p>Use the following verification code to continue:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">317921</p><p>This code expires in 10 minutes.</p>',
        attachments: [], keep: false, created_at: new Date(Date.now() - 2 * 60000).toISOString(), raw_mime: '',
    },
    {
        id: 'mock-2', recipient: 'demo@sia.kr', sender: 'Google <no-reply@accounts.google.com>',
        subject: '보안 알림: 새로운 로그인', body_text: '내 계정에 새로운 기기에서 로그인했습니다. 본인이 아니라면 계정을 확인하세요.',
        body_html: '', attachments: [], keep: false, created_at: new Date(Date.now() - 34 * 60000).toISOString(), raw_mime: '',
    },
    {
        id: 'mock-3', recipient: 'demo@sia.kr', sender: 'Discord <noreply@discord.com>',
        subject: '이메일 주소를 확인해주세요', body_text: 'Welcome! Please verify your email address to activate your account.',
        body_html: '', attachments: [], keep: true, created_at: new Date(Date.now() - 46 * 60000).toISOString(), raw_mime: '',
    },
    {
        id: 'mock-4', recipient: 'demo@sia.kr', sender: 'Notion <notify@mail.notion.so>',
        subject: '팀 스페이스 초대장이 도착했습니다', body_text: '워크스페이스 초대를 수락하려면 링크를 눌러주세요.',
        body_html: '', attachments: [{ name: 'invite.pdf', path: 'demo/invite.pdf', size: 48200, contentType: 'application/pdf' }], keep: false,
        created_at: new Date(Date.now() - 55 * 60000).toISOString(), raw_mime: '',
    },
    {
        id: 'mock-5', recipient: 'demo@sia.kr', sender: '네이버 <no_reply@naver.com>',
        subject: '[네이버] 로그인 인증번호 안내', body_text: '인증번호 582410을 입력해주세요.',
        body_html: '', attachments: [], keep: false, created_at: new Date(Date.now() - 57 * 60000).toISOString(), raw_mime: '',
    },
    {
        id: 'mock-6', recipient: 'demo@sia.kr', sender: 'GitHub <noreply@github.com>',
        subject: '[GitHub] A personal access token has been added', body_text: 'A personal access token was recently added to your account.',
        body_html: '', attachments: [], keep: false, created_at: new Date(Date.now() - 59 * 60000).toISOString(), raw_mime: '',
    },
];
