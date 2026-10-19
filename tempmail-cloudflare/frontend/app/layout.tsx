import type { Metadata, Viewport } from "next";
import "./globals.css";
import MultiMailBar from "@/components/MultiMailBar";

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
    themeColor: '#4f46e5',
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
            </head>
            <body className="min-h-screen bg-background font-sans antialiased pb-24">
                {children}
                <MultiMailBar />
            </body>
        </html>
    );
}
