'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, X } from 'lucide-react';

// Entries are strings: "user@sia.kr" (public) or "user@sia.kr?k=SECRET" (locked)
const parseEntry = (entry: string): { addr: string; key: string | undefined } => {
    const [addr, key] = entry.split('?k=');
    return { addr, key };
};

export default function MultiMailBar() {
    const [history, setHistory] = useState<string[]>([]);
    const router = useRouter();

    useEffect(() => {
        const load = () => {
            const stored = localStorage.getItem('tempmail_history');
            if (stored) {
                try {
                    setHistory(JSON.parse(stored));
                } catch {
                    setHistory([]);
                }
            } else {
                setHistory([]);
            }
        };

        load();
        window.addEventListener('storage', load);
        window.addEventListener('history-updated', load);
        return () => {
            window.removeEventListener('storage', load);
            window.removeEventListener('history-updated', load);
        };
    }, []);

    const openEntry = (entry: string) => {
        const { addr, key } = parseEntry(entry);
        router.push(`/inbox/${encodeURIComponent(addr)}${key ? `?k=${key}` : ''}`);
    };

    const removeEntry = (entry: string) => {
        const next = history.filter(h => h !== entry);
        setHistory(next);
        localStorage.setItem('tempmail_history', JSON.stringify(next));
        window.dispatchEvent(new Event('history-updated'));
    };

    if (history.length === 0) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur border-t border-gray-200">
            <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
                {history.map(entry => {
                    const { addr, key } = parseEntry(entry);
                    return (
                        <div
                            key={entry}
                            className="flex items-center gap-1 bg-gray-100 rounded-full pl-3 pr-1.5 py-1.5 shrink-0"
                        >
                            <button
                                onClick={() => openEntry(entry)}
                                className="flex items-center gap-1.5"
                            >
                                <Mail className="h-3.5 w-3.5 text-gray-500" />
                                <span className="text-sm text-gray-700 whitespace-nowrap">{addr}</span>
                                {key && <Lock className="h-3 w-3 text-gray-400" />}
                            </button>
                            <button
                                onClick={() => removeEntry(entry)}
                                aria-label="삭제"
                                className="p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
