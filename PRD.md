📋 AI 코드 에디터용 마스터 프롬프트
프롬프트 제목: 회원가입 없는 1시간 제한 일회용 이메일 서비스(RUU.kr 스타일) 구축

[프로젝트 개요] 회원가입 없이 즉시 임시 이메일 주소를 생성하고, 1시간 동안만 메일을 수신할 수 있는 '게릴라 메일' 서비스를 개발하고자 합니다. 1시간이 지나면 Redis의 TTL 기능을 이용해 데이터가 자동 삭제되어야 합니다.

[기술 스택]

Backend: Node.js (Fastify 프레임워크)

Mail Server: Haraka (SMTP 서버, Node.js 기반)

Database: Redis (메일 저장 및 1시간 TTL 관리)

Frontend: Next.js 14+ (App Router, Tailwind CSS, Shadcn UI)

Real-time: Socket.io (새 메일 도착 알림)

Library: mailparser (메일 파싱), DOMPurify (XSS 방지)

[단계별 구현 요청]

1단계: Backend - Haraka SMTP 서버 및 파싱 로직

Haraka 서버를 설정하고, 들어오는 모든 메일을 수신하는 플러그인을 작성해줘.

mailparser를 사용하여 수신된 메일에서 from, subject, text, html, date를 추출해줘.

추출된 데이터를 Redis에 리스트(RPUSH) 형태로 저장하고, 해당 키에 3600초(1시간)의 EXPIRE를 설정하는 로직을 작성해줘.

Redis Key 형식: inbox:{email_address}

2단계: Backend - Fastify API 및 Socket.io

특정 이메일 주소의 메일 목록을 가져오는 GET /api/inbox/:address 엔드포인트를 만들어줘.

특정 메일을 삭제하는 API를 만들어줘.

Haraka에서 메일 저장 성공 시, Socket.io를 통해 해당 주소를 보고 있는 클라이언트에게 NEW_MAIL_RECEIVED 이벤트를 발생시켜줘.

3단계: Frontend - Next.js 메인 및 수신함 UI

메인 페이지: 아이디 입력 필드와 도메인 선택 드롭다운, '생성' 버튼을 만들어줘. (RUU.kr 스타일의 직관적 UI)

수신함 페이지:

현재 남은 시간(1시간 타이머) 표시.

메일 목록 테이블(보낸이, 제목, 시간, 삭제 버튼).

메일 클릭 시 본문을 보여주는 상세 보기 모달(HTML 출력 시 반드시 XSS 필터링 적용).

LocalStorage를 사용하여 사용자가 최근에 생성한 메일 주소 최대 100개를 관리하는 '멀티 메일' 하단 바 기능을 구현해줘.

4단계: 프로젝트 구조 및 환경 설정

위 구성 요소들을 docker-compose로 한 번에 띄울 수 있도록 설정 파일(Dockerfile, docker-compose.yml)을 작성해줘.

SMTP 포트(25)와 API 포트 설정을 포함해줘.

[특이사항]

모든 코드는 성능 최적화를 위해 비동기(async/await)로 작성해줘.

보안을 위해 클라이언트에서 HTML 본문을 렌더링할 때 dangerouslySetInnerHTML과 dompurify를 조합해서 안전하게 처리해줘.