import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "TempMail - 1회용 이메일",
    description: "회원가입 없이 즉시 사용 가능한 임시 이메일 서비스",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body className="min-h-screen bg-background font-sans antialiased">
                {children}
            </body>
        </html>
    );
}
