// Playwright screenshot runner — 390×845 모바일 + 1440×900 데스크톱
// usage: node shots.mjs [round]
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = new URL('./shots/', import.meta.url).pathname;
const round = process.argv[2] || 'r1';
const dir = `${OUT}${round}/`;
fs.mkdirSync(dir, { recursive: true });

const MOBILE = { width: 390, height: 845 };
const DESKTOP = { width: 1440, height: 900 };

const seed = async (page) => {
    await page.addInitScript(() => {
        localStorage.setItem('tempmail_history', JSON.stringify([
            '7vg2761m@sia.kr', 'test.mail@sia.kr?k=aaaa-1111', 'hello123@mail.sia.kr',
            'kim@sju.ac.kr', 'team@sia.kr'
        ]));
        localStorage.setItem('tempmail_history_meta', JSON.stringify({
            '7vg2761m@sia.kr': Date.now() - 3600000,
            'test.mail@sia.kr': Date.now() - 7200000,
            'hello123@mail.sia.kr': Date.now() - 172800000,
            'kim@sju.ac.kr': Date.now() - 259200000,
            'team@sia.kr': Date.now() - 345600000,
        }));
        localStorage.setItem('tempmail_favs', JSON.stringify(['test.mail@sia.kr', 'hello123@mail.sia.kr', 'team@sia.kr']));
        localStorage.setItem('tempmail_recipients', JSON.stringify(['koreaprogrammer@naver.com', 'design_test@sia.kr', 'kim@sju.ac.kr']));
        sessionStorage.setItem('tempmail_admin_key', 'acc44355-c077-4dac-ac18-496e579e18ac');
    });
    // 시각 QA용: 관리자 RPC를 고정 응답으로 인터셉트 (goto 전 등록)
    await page.route('**/rest/v1/rpc/admin_*', route => {
        const url = route.request().url();
        if (url.includes('admin_list_emails')) {
            return route.fulfill({ json: [
                { id: 'm1', created_at: new Date(Date.now() - 3600000).toISOString(), recipient: '7vg2761m@sia.kr', sender: 'koreaprogrammer@naver.com', subject: '회원가입을 완료해주세요', keep: false, attachment_count: 0, has_raw: true, box: 'locked' },
                { id: 'm2', created_at: new Date(Date.now() - 7200000).toISOString(), recipient: 'sadadsa@sia.kr', sender: 'kim@sju.ac.kr', subject: 'Dd', keep: false, attachment_count: 0, has_raw: false, box: 'public' },
            ] });
        }
        return route.fulfill({ json: null });
    });
};

const adminReady = async (p) => {
    // 관리자 대시보드 또는 키 게이트 중 먼저 나타나는 쪽 대기
    await p.waitForSelector('button:has-text("메일 보내기"):visible, input[placeholder="관리자 키"]', { timeout: 40000 });
    if (await p.locator('button:has-text("메일 보내기"):visible').count() === 0) {
        await p.fill('input[placeholder="관리자 키"]', 'acc44355-c077-4dac-ac18-496e579e18ac');
        await p.locator('button:has-text("확인")').click();
        await p.waitForSelector('button:has-text("메일 보내기"):visible', { timeout: 40000 });
    }
};

const shots = [
    { name: '01_home', url: '/', vp: MOBILE },
    { name: '02_inbox', url: '/inbox/demo%40sia.kr?mock=1', vp: MOBILE },
    { name: '03_detail', url: '/inbox/demo%40sia.kr?mock=1', vp: MOBILE,
      act: async (p) => { await p.locator('.tm-mail-item').first().click({ timeout: 8000 }); await p.waitForTimeout(500); } },
    { name: '04_compose', url: '/admin', vp: MOBILE,
      act: async (p) => {
          await adminReady(p);
          await p.locator('button:has-text("메일 보내기"):visible').first().click();
          await p.waitForTimeout(500);
      } },
    { name: '05_picker', url: '/inbox/demo%40sia.kr?mock=1', vp: MOBILE,
      act: async (p) => {
          await p.waitForTimeout(600);
          await p.locator('button:has-text("주소 선택")').last().click();
          await p.waitForTimeout(500);
      } },
    { name: '06_success', url: '/admin', vp: MOBILE,
      act: async (p) => {
          await p.route('**/api/admin/send', r => r.fulfill({ json: { ok: true, id: 'qa-mock-id' } }));
          await adminReady(p);
          await p.locator('button:has-text("메일 보내기"):visible').first().click();
          await p.waitForTimeout(400);
          await p.fill('input[placeholder*="로컬파트"]', 'notice');
          await p.fill('input[placeholder*="받는 사람 이메일"]', 'friend@example.com');
          await p.locator('input[placeholder*="받는 사람 이메일"]').press('Enter');
          await p.fill('input[placeholder*="메일 제목"]', 'QA 테스트 발송');
          await p.fill('textarea', '테스트 본문입니다.');
          await p.locator('button:has-text("보내기")').first().click();
          await p.waitForTimeout(300);
          await p.locator('button:has-text("발송")').last().click();
          await p.waitForTimeout(800);
      } },
    { name: 'd01_home', url: '/', vp: DESKTOP },
    { name: 'd02_inbox', url: '/inbox/demo%40sia.kr?mock=1', vp: DESKTOP,
      act: async (p) => {
          const n = await p.locator('.tm-mail-item:visible').count();
          console.log('   d02 items:', n);
          await p.locator('.tm-mail-item:visible').first().click({ timeout: 8000 });
          await p.waitForTimeout(500);
      } },
    { name: 'd03_admin', url: '/admin', vp: DESKTOP,
      act: async (p) => {
          await adminReady(p);
          await p.waitForTimeout(800);
      } },
];

const browser = await chromium.launch();
for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2, locale: 'ko-KR' });
    const page = await ctx.newPage();
    await seed(page);
    try {
        await page.goto(BASE + s.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1000);
        if (s.act) await s.act(page);
        await page.screenshot({ path: `${dir}${s.name}.png` });
        console.log('OK', s.name);
    } catch (e) {
        console.log('FAIL', s.name, e.message.split('\n')[0]);
        try { await page.screenshot({ path: `${dir}${s.name}_fail.png` }); } catch {}
    }
    await ctx.close();
}
await browser.close();
console.log('done →', dir);
