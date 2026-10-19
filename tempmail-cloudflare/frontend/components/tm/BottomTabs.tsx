'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Inbox, ListChecks, ShieldCheck } from 'lucide-react';
import AddressPicker from './AddressPicker';

const HISTORY_KEY = 'tempmail_history';

/** 모바일 하단 탭 바 — 실제 기능과만 연결 (홈/받은메일/주소선택/관리자) */
export default function BottomTabs() {
    const pathname = usePathname();
    const router = useRouter();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [lastInbox, setLastInbox] = useState<string | null>(null);

    useEffect(() => {
        const read = () => {
            try {
                const h: string[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
                setLastInbox(h[0] || null);
            } catch { setLastInbox(null); }
        };
        read();
        window.addEventListener('history-updated', read);
        return () => window.removeEventListener('history-updated', read);
    }, [pathname]);

    // 관리자 화면에서는 자체 탭 흐름이 있으므로 하단 탭 숨김
    if (pathname?.startsWith('/admin')) return null;

    const onInbox = pathname?.startsWith('/inbox');
    const goInbox = () => {
        if (onInbox) return;
        if (lastInbox) {
            const [addr, key] = lastInbox.split('?k=');
            router.push(`/inbox/${encodeURIComponent(addr)}${key ? `?k=${key}` : ''}`);
        } else {
            setPickerOpen(true);
        }
    };

    const tabs = [
        { key: 'home', label: '홈', icon: Home, active: pathname === '/', onClick: () => router.push('/') },
        { key: 'inbox', label: '받은 메일', icon: Inbox, active: !!onInbox, onClick: goInbox },
        { key: 'picker', label: '주소 선택', icon: ListChecks, active: pickerOpen, onClick: () => setPickerOpen(true) },
        { key: 'admin', label: '관리자', icon: ShieldCheck, active: false, onClick: () => router.push('/admin') },
    ];

    return (
        <>
            <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 backdrop-blur border-t border-tm-border tm-safe-bottom">
                <div className="grid grid-cols-4 h-[62px] max-w-md mx-auto">
                    {tabs.map(({ key, label, icon: Icon, active, onClick }) => (
                        <button
                            key={key}
                            onClick={onClick}
                            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                                active ? 'text-tm-from' : 'text-tm-muted hover:text-tm-ink'
                            }`}
                        >
                            <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                            <span className="text-[11px] font-semibold">{label}</span>
                        </button>
                    ))}
                </div>
            </nav>
            {pickerOpen && <AddressPicker mode="inbox" onClose={() => setPickerOpen(false)} />}
        </>
    );
}
