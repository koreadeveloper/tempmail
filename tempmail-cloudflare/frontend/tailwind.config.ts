import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                tm: {
                    bg: "var(--tm-bg)",
                    ink: "var(--tm-ink)",
                    muted: "var(--tm-muted)",
                    border: "var(--tm-border)",
                    from: "#8560F7",
                    to: "#516EFF",
                },
            },
            fontFamily: {
                sans: [
                    "Pretendard Variable", "Pretendard", "-apple-system", "BlinkMacSystemFont",
                    "system-ui", "Roboto", "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo",
                    "Noto Sans KR", "Malgun Gothic", "sans-serif",
                ],
            },
            borderRadius: {
                tm: "20px",
            },
        },
    },
    plugins: [],
};
export default config;
