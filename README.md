# 📧 일회용 이메일 서비스 (TempMail) 배포 가이드

이 문서는 이 프로젝트를 실제 서버(Ubuntu VPS 기준)에 배포하여 서비스하는 방법을 상세하게 설명합니다.

## 📋 1. 준비물

1.  **도메인 (Domain)**: 예: `mytempmail.com`
    *   Namecheap, Godaddy, 가비아 등에서 구입 가능합니다.
2.  **클라우드 서버 (VPS)**: AWS EC2, DigitalOcean, Vultr, Linode 등.
    *   **중요**: **25번 포트(SMTP)**가 열려 있어야 메일을 수신할 수 있습니다. 일부 클라우드(Google Cloud, AWS 일부 인스턴스)는 기본적으로 25번 포트 수신을 차단할 수 있으니 확인이 필요합니다.
    *   OS 권장: **Ubuntu 22.04 LTS**
    *   사양 권장: 2GB RAM 이상 (Node.js 서비스 2개 + Redis + Haraka 구동).

---

## 🌐 2. DNS 설정

도메인 관리 페이지의 DNS 설정에서 다음 레코드를 추가해야 합니다.

| 유형 (Type) | 호스트 (Host/Name) | 값 (Value/Points to) | 설명 |
| :--- | :--- | :--- | :--- |
| **A** | `@` | `서버_IP_주소` | 루트 도메인 (예: mytempmail.com) 연결 |
| **A** | `www` | `서버_IP_주소` | www 서브도메인 연결 |
| **A** | `mail` | `서버_IP_주소` | 메일 서버 호스트명 |
| **MX** | `@` | `mail.mytempmail.com` | **중요**: 메일 수신을 위한 MX 레코드 (우선순위 10) |

> **참고**: DNS 변경 사항이 전파되는 데 최대 24시간이 걸릴 수 있습니다.

---

## 🛠️ 3. 서버 초기 설정 (Ubuntu)

SSH로 서버에 접속한 후 다음 명령어를 실행하여 필수 패키지를 설치합니다.

### 3.1 Docker 설치

```bash
# 패키지 목록 업데이트
sudo apt update
sudo apt upgrade -y

# 필수 패키지 설치
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y

# Docker GPG 키 추가
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Docker Repository 추가
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker 설치
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y

# Docker 서비스 시작 확인
sudo systemctl status docker
```

---

## 🚀 4. 프로젝트 설치 및 실행

### 4.1 프로젝트 다운로드

```bash
# 홈 디렉토리로 이동
cd ~

# 프로젝트 클론 (GitHub 주소 입력)
git clone https://your-repository-url/tempmail.git

# 디렉토리 이동
cd tempmail
```

> 만약 로컬에 있는 코드를 올리는 경우라면, `scp`나 `ftp`를 이용해 서버로 파일을 전송하세요.

### 4.2 프로덕션 환경 최적화 (선택 사항)

`docker-compose.yml` 파일에서 `frontend` 서비스를 빌드할 때 프로덕션용으로 설정되어 있는지 확인합니다. 현재 설정은 그대로 사용해도 무방합니다.

### 4.3 서비스 실행

```bash
# 백그라운드 모드(-d)로 Docker Compose 실행
sudo docker compose up -d --build
```

실행 후 상태 확인:
```bash
sudo docker compose ps
```
모든 컨테이너(`tempmail-frontend`, `tempmail-backend`, `tempmail-smtp`, `tempmail-redis`)가 `Up` 상태여야 합니다.

---

## 🔒 5. HTTPS 적용 (Nginx & Let's Encrypt)

웹 브라우저에서 보안 경고가 뜨지 않게 하고 80/443 포트를 사용하려면 **Nginx**를 앞단에 두는 것이 좋습니다.

### 5.1 Nginx설치

```bash
sudo apt install nginx -y
```

### 5.2 Nginx 설정 파일 작성

`/etc/nginx/sites-available/tempmail` 파일을 생성합니다.

```nginx
server {
    server_name mytempmail.com www.mytempmail.com;

    location / {
        proxy_pass http://localhost:3000; # Frontend Next.js
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io 및 API 요청 프록시 (Backend)
    # 클라이언트(프론트엔드) 코드에서 Socket 연결 주소를 도메인으로 변경해야 함에 유의
    location /socket.io/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

> **주의**: 프론트엔드 코드(`frontend/app/inbox/[address]/page.tsx`) 내의 `API_URL`을 `http://localhost:8080`에서 `https://mytempmail.com` (본인 도메인)으로 변경하고 다시 빌드해야 합니다.

### 5.3 설정 적용

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/tempmail /etc/nginx/sites-enabled/

# 기본 설정 제거 (필요시)
sudo rm /etc/nginx/sites-enabled/default

# 문법 검사 및 재시작
sudo nginx -t
sudo systemctl restart nginx
```

### 5.4 SSL 인증서 발급 (Certbot)

무료 SSL 인증서인 Let's Encrypt를 적용합니다.

```bash
sudo apt install certbot python3-certbot-nginx -y

# 인증서 발급 및 Nginx 자동 설정
sudo certbot --nginx -d mytempmail.com -d www.mytempmail.com
```

---

## ✅ 6. 최종 확인

1.  브라우저에서 `https://mytempmail.com` 접속.
2.  아이디 입력 후 이메일 생성.
3.  다른 이메일(Gmail, Naver 등)에서 방금 생성한 주소(`user@mytempmail.com`)로 메일 발송.
4.  웹페이지 수신함에 메일이 실시간으로 도착하는지 확인.

## ❓ 문제 해결 (Troubleshooting)

*   **메일이 오지 않을 때**:
    *   서버의 25번 포트가 열려 있는지 확인 (`telnet YourServerIP 25` 를 외부에서 실행해보기).
    *   Docker 로그 확인: `sudo docker compose logs -f smtp`.
    *   DNS MX 레코드가 올바른지 확인 (`dig mx mytempmail.com`).

*   **웹사이트 접속 불가**:
    *   보안 그룹(방화벽)에서 80, 443 포트가 열려 있는지 확인.
    *   Nginx 상태 확인: `sudo systemctl status nginx`.
