import type { Metadata } from "next";
import "./globals.css";
import MultiMailBar from "@/components/MultiMailBar";

export const metadata: Metadata = {
    title: "TempMail - 1회용 이메일",
    description: "회원가입 없이 즉시 사용 가능한 임시 이메일 — 1시간 후 자동 삭제",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body className="min-h-screen bg-background font-sans antialiased pb-24">
                {children}
                <MultiMailBar />
            </body>
        </html>
    );
}
