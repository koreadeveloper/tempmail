import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomTabs from "@/components/tm/BottomTabs";

const SITE_URL = 'https://mail.sia.kr';
const TITLE = 'TempMail — 1회용 이메일';
const DESCRIPTION = '회원가입 없이 즉시 사용 가능한 임시 이메일 — 1시간 후 자동 삭제';

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: TITLE,
    description: DESCRIPTION,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
        capable: true,
        title: 'TempMail',
        statusBarStyle: 'default',
    },
    openGraph: {
        type: 'website',
        url: SITE_URL,
        siteName: 'TempMail',
        title: TITLE,
        description: DESCRIPTION,
    },
    twitter: {
        card: 'summary_large_image',
        title: TITLE,
        description: DESCRIPTION,
    },
};

export const viewport: Viewport = {
    themeColor: '#F9FBFF',
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <head>
                {/* ?k= 비밀키가 외부 이미지/링크 요청의 Referer로 유출되는 것을 차단 */}
                <meta name="referrer" content="no-referrer" />
                <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
                />
                <script
                    dangerouslySetInnerHTML={{
                        __html: "try{if(localStorage.getItem('tm-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
                    }}
                />
            </head>
            <body className="min-h-screen bg-tm-bg text-tm-ink font-sans antialiased">
                {children}
                <BottomTabs />
            </body>
        </html>
    );
}
