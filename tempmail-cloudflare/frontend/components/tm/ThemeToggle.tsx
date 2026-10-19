'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/** 라이트/다크 토글 — html.dark 클래스 + localStorage 유지 */
export default function ThemeToggle() {
    const [dark, setDark] = useState(false);

    useEffect(() => {
        setDark(document.documentElement.classList.contains('dark'));
    }, []);

    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        try { localStorage.setItem('tm-theme', next ? 'dark' : 'light'); } catch {}
    };

    return (
        <button onClick={toggle} aria-label={dark ? '라이트 모드' : '다크 모드'} className="tm-icon-btn h-10 w-10">
            {dark ? <Sun className="h-[20px] w-[20px]" /> : <Moon className="h-[20px] w-[20px]" />}
        </button>
    );
}
