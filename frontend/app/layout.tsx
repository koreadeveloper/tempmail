import type { Metadata } from "next";
// import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import MultiMailBar from "@/components/MultiMailBar";

// const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "TempMail - 1 Hour Email",
    description: "Secure, anonymous, disposable email service.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={cn("min-h-screen bg-background font-sans antialiased pb-16")}>
                {children}
                <MultiMailBar />
            </body>
        </html>
    );
}
