# 📧 TempMail — Cloudflare + Supabase 서버리스 구현

VPS 없이 **완전 서버리스**로 동작하는 1회용(1시간) 임시 이메일 서비스입니다.

> **Production**: [https://tempmail-fawn.vercel.app](https://tempmail-fawn.vercel.app) · 도메인 `sia.kr`

**기능 요약**: 즉시 주소 생성 · Supabase Realtime 실시간 수신함 · OTP/인증번호 자동 추출 ·
첨부파일(Storage, 개당 5MB) · 메일별 1시간 자동 삭제 + 보관(keep) 토글 ·
비밀 키(`?k=`) 잠금 수신함 · mailto 전달 · EML 다운로드 · 멀티 주소 바

## 🏗️ 아키텍처

```
[외부 메일] → MX → [Cloudflare Email Routing] → [Email Worker / postal-mime]
                                                  ├─ inbox_keys로 잠금 여부 조회
                                                  ├─ 공개 수신함 → emails 테이블
                                                  ├─ 잠금 수신함 → emails_locked 테이블
                                                  ├─ 첨부파일 → Storage 'attachments' 버킷
                                                  └─ FORWARD_MAP 매칭 시 → 실제 주소로 전달
[사용자 브라우저] → [Vercel / Next.js] → [Supabase]
                                       (Realtime 구독 + RPC: create_inbox / get_emails /
                                        delete_email / set_keep)
```

> 🔒 **잠금 수신함과 Realtime**: Realtime publication은 `emails`(공개) 테이블에만 적용됩니다.
> 잠금 수신함(`emails_locked`)은 RPC 폴링으로 조회되며, 비밀 키 없이는 내용을 볼 수 없습니다.

## 📁 프로젝트 구조

```
tempmail-cloudflare/
├── supabase/
│   └── schema.sql          # 테이블 + RLS + RPC + Storage 버킷 + pg_cron
├── email-worker/           # Cloudflare Email Worker
│   ├── src/index.ts        #   메일 파싱 → 잠금 라우팅 → DB/Storage 저장 → 전달
│   ├── wrangler.toml       #   [vars] SUPABASE_URL
│   └── package.json
└── frontend/               # Next.js 14 프론트엔드 (Vercel)
    ├── app/                #   page.tsx (주소 생성) · inbox/[address]/page.tsx (수신함) · icon.svg
    ├── lib/                #   supabase.ts (RPC/Realtime) · otp.ts (인증번호 추출) · notify.ts (알림)
    └── .env.example
```

---

## 🚀 배포 가이드

### 1️⃣ Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. **SQL Editor**에서 `supabase/schema.sql` 실행 — 한 번에 생성되는 것들:
   - 테이블: `emails` (공개 수신함) · `emails_locked` (잠금 수신함, RPC 전용) · `inbox_keys` (주소별 비밀 키/잠금 플래그)
   - RPC 함수: `create_inbox` · `get_emails` · `delete_email` · `set_keep` (`SECURITY DEFINER`, `anon`/`authenticated`에 EXECUTE 부여)
   - Storage 버킷: `attachments` — public, 파일당 최대 **5MB**
   - `pg_cron` 확장 활성화 (자동 삭제 job은 주석 처리되어 있음 — 아래 [자동 삭제](#🔧-자동-삭제-설정-pg_cron) 참조)
3. **Settings > API**에서 다음 정보 확인:
   - `Project URL` (예: `https://xxxx.supabase.co`)
   - `anon` public key
   - `service_role` secret key

> ⚠️ **중요**: 실시간 수신을 위해 **Database > Replication**에서
> `emails` 테이블의 **Realtime을 활성화**해야 합니다. (`emails_locked`은 불필요)

---

### 2️⃣ Cloudflare 설정

#### 2.1 도메인 추가
1. Cloudflare Dashboard에 도메인 추가
2. 네임서버를 Cloudflare로 변경

#### 2.2 Email Routing 설정
1. **Email > Email Routing** 메뉴 이동
2. **Enable Email Routing** 활성화
3. MX 레코드가 자동 설정되는지 확인
4. **Routing Rules**에서:
   - **Catch-all address** → **Send to a Worker** 선택
   - Worker로 `tempmail-email-worker` 지정 (배포 후)

---

### 3️⃣ Email Worker 배포

```bash
cd email-worker

# 의존성 설치
npm install

# Cloudflare 로그인
npx wrangler login

# 서비스 키 설정 (시크릿)
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# → Supabase service_role 키 입력
```

`SUPABASE_URL`은 `wrangler.toml`의 `[vars]`에 이미 설정되어 있습니다:

```toml
[vars]
SUPABASE_URL = "https://edktzwgvkptiptpkzond.supabase.co"  # 본인 프로젝트 URL로 교체
```

배포:

```bash
npm run deploy
```

배포 후 Cloudflare Dashboard > Email Routing에서 Worker를 Catch-all 대상으로 지정합니다.

#### (선택) FORWARD_MAP — 고정 주소 자동 전달

특정 localpart로 온 메일을 실제 메일함으로도 받고 싶다면 `wrangler.toml`에 추가:

```toml
[vars]
FORWARD_MAP = '{"my":"me@example.com","admin":"ops@example.com"}'
```

- `my@sia.kr`로 온 메일 → Supabase 저장 성공 후 `me@example.com`으로 전달
- 전달 실패해도 저장된 메일과 반송 여부에는 영향 없음 (로그만 남음)
- JSON 파싱이 실패하면 전달 없이 저장만 수행

---

### 4️⃣ 프론트엔드 배포

#### Vercel (추천)

```bash
cd frontend

# 환경 변수 파일 생성
cp .env.example .env.local
# .env.local 편집하여 Supabase URL과 anon key 입력

# 로컬 테스트
npm install
npm run dev

# Vercel 배포
npx vercel
```

#### Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy .next --project-name=tempmail
```

> **환경 변수**: Vercel/Pages 대시보드에서 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정

---

## ✅ 동작 확인

1. 브라우저에서 배포된 사이트 접속
2. 아이디 입력 후 이메일 생성 (예: `test@sia.kr`)
   - `비공개(잠금)` 체크 시 비밀 키가 발급되고 `?k=...`가 URL에 붙습니다 — **이 URL 없이는 수신함을 열 수 없으니** 링크를 보관하세요
3. 외부 메일(Gmail 등)에서 해당 주소로 메일 발송
4. 수신함에서 메일 실시간 수신 확인 (공개 수신함은 Realtime, 잠금 수신함은 폴링)
5. 첨부파일 열기 / OTP 복사 / 보관 토글 / EML 다운로드 확인

---

## �️ 데이터 구성 요약

| 대상 | 종류 | 접근 방식 |
|------|------|-----------|
| `emails` | 테이블 (공개 수신함) | anon 키로 직접 SELECT 가능 (RLS public read) + Realtime |
| `emails_locked` | 테이블 (잠금 수신함) | 공개 정책 없음 — RPC(`SECURITY DEFINER`)로만 접근 |
| `inbox_keys` | 테이블 (주소·비밀 키·잠금 플래그) | 공개 정책 없음 — RPC 및 service_role만 접근 |
| `attachments` | Storage 버킷 | public read, 파일당 5MB 제한, 경로 `{email_id}/{filename}` |
| `create_inbox` / `get_emails` / `delete_email` / `set_keep` | RPC 함수 | 잠금 수신함은 `p_secret` 검증 후 처리, 실패 시 `{error:'locked'}` 반환 |

메일 행에는 `attachments`(JSONB 메타데이터), `keep`(보관 플래그), `raw_mime`(원본, 300KB 이하만 — EML 다운로드용) 컬럼이 포함됩니다.

---

## 🔧 자동 삭제 설정 (pg_cron)

`schema.sql`이 `pg_cron` 확장을 활성화합니다. SQL Editor에서 아래 두 job을 등록하면
**1시간 지난 메일이 자동 삭제**됩니다 (`keep` 처리된 메일은 유지):

```sql
-- 공개 수신함 (5분마다)
SELECT cron.schedule(
    'delete-old-emails',
    '*/5 * * * *',
    $$DELETE FROM emails WHERE keep = false AND created_at < NOW() - INTERVAL '1 hour'$$
);

-- 잠금 수신함
SELECT cron.schedule(
    'delete-old-emails-locked',
    '*/5 * * * *',
    $$DELETE FROM emails_locked WHERE keep = false AND created_at < NOW() - INTERVAL '1 hour'$$
);
```

> 📎 첨부파일 오브젝트는 DB 행과 별개로 Storage에 남을 수 있으므로,
> 필요하면 Storage 측 정리 job/라이프사이클을 별도로 고려하세요.

---

## � 비용

| 서비스 | 무료 한도 |
|--------|-----------|
| **Cloudflare Email Routing** | 무제한 |
| **Cloudflare Workers** | 100,000 요청/일 |
| **Supabase** | 500MB DB · 1GB Storage · Realtime 포함 |
| **Vercel** | 100GB 대역폭/월 |

**소규모 서비스라면 완전 무료로 운영 가능!** 🎉

---

## 📝 환경 변수 정리

### Email Worker

| 변수명 | 위치 | 설명 |
|--------|------|------|
| `SUPABASE_URL` | `wrangler.toml` `[vars]` | Supabase 프로젝트 URL (현재: `edktzwgvkptiptpkzond`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `wrangler secret` | service_role 키 — RLS 우회하여 INSERT/Storage 업로드 |
| `FORWARD_MAP` | `wrangler.toml` `[vars]` (선택) | JSON `{"localpart":"dest@mail"}` — 매칭 주소 자동 전달 |

> 하위 호환: 코드는 `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` 이름의 바인딩도 읽지만,
> 새 배포에서는 `SUPABASE_SERVICE_ROLE_KEY`를 사용하세요.

### Frontend (`.env.local` / Vercel env)

| 변수명 | 설명 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 공개 키 (RLS + RPC로 보호) |
