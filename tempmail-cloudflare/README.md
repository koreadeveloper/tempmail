# 📧 TempMail - Cloudflare + Supabase 서버리스 구현

VPS 없이 **완전 서버리스**로 동작하는 1회용 이메일 서비스입니다.

## 🏗️ 아키텍처

```
[외부 메일] → MX → [Cloudflare Email Routing] → [Email Worker] → [Supabase DB]
                                                                      ↑
[사용자 브라우저] → [Cloudflare Pages / Vercel] → [Supabase Client] ――|
```

## 📁 프로젝트 구조

```
tempmail-cloudflare/
├── supabase/
│   └── schema.sql          # DB 스키마
├── email-worker/           # Cloudflare Email Worker
│   ├── src/index.ts
│   ├── wrangler.toml
│   └── package.json
└── frontend/               # Next.js 프론트엔드
    ├── app/
    ├── lib/supabase.ts
    └── ...
```

---

## 🚀 배포 가이드

### 1️⃣ Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. **SQL Editor**에서 `supabase/schema.sql` 실행
3. **Settings > API**에서 다음 정보 확인:
   - `Project URL` (예: `https://xxxx.supabase.co`)
   - `anon` public key
   - `service_role` secret key

> ⚠️ **중요**: Realtime 기능을 사용하려면:
> **Database > Replication**에서 `emails` 테이블에 대해 **Realtime 활성화** 필요

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

# 환경 변수 설정 (시크릿)
npx wrangler secret put SUPABASE_URL
# → https://your-project.supabase.co 입력

npx wrangler secret put SUPABASE_SERVICE_KEY
# → service_role 키 입력

# 배포
npm run deploy
```

배포 후 Cloudflare Dashboard > Email Routing에서 Worker를 Catch-all 대상으로 지정합니다.

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
3. 외부 메일(Gmail 등)에서 해당 주소로 메일 발송
4. 수신함에서 메일 실시간 수신 확인

---

## 💰 비용

| 서비스 | 무료 한도 |
|--------|-----------|
| **Cloudflare Email Routing** | 무제한 |
| **Cloudflare Workers** | 100,000 요청/일 |
| **Supabase** | 500MB DB, 50,000 rows |
| **Vercel** | 100GB 대역폭/월 |

**소규모 서비스라면 완전 무료로 운영 가능!** 🎉

---

## 🔧 자동 삭제 설정 (선택)

Supabase에서 1시간 지난 이메일 자동 삭제:

1. **Database > Extensions**에서 `pg_cron` 활성화
2. SQL Editor에서 실행:

```sql
SELECT cron.schedule(
    'delete-old-emails',
    '*/5 * * * *',
    $$DELETE FROM emails WHERE created_at < NOW() - INTERVAL '1 hour'$$
);
```

---

## 📝 환경 변수 정리

### Email Worker (`wrangler secret`)
| 변수명 | 설명 |
|--------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_KEY` | service_role 키 |

### Frontend (`.env.local`)
| 변수명 | 설명 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 공개 키 |
