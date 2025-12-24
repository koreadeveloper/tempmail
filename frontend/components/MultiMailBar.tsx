'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MultiMailBar() {
    const [history, setHistory] = useState<string[]>([]);
    const router = useRouter();

    useEffect(() => {
        const stored = localStorage.getItem('tempmail_history');
        if (stored) {
            setHistory(JSON.parse(stored));
        }

        // Listen for storage events to sync across tabs
        const handleStorage = () => {
            const updated = localStorage.getItem('tempmail_history');
            if (updated) setHistory(JSON.parse(updated));
        };
        window.addEventListener('storage', handleStorage);
        // Custom event for same-tab updates
        window.addEventListener('history-updated', handleStorage);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('history-updated', handleStorage);
        };
    }, []);

    const removeEmail = (email: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newHistory = history.filter(h => h !== email);
        setHistory(newHistory);
        localStorage.setItem('tempmail_history', JSON.stringify(newHistory));
    };

    if (history.length === 0) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-2 shadow-lg z-50">
            <div className="max-w-5xl mx-auto flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <span className="text-xs font-bold text-slate-400 uppercase mr-2 whitespace-nowrap">My Emails:</span>
                {history.map(email => (
                    <div
                        key={email}
                        onClick={() => router.push(`/inbox/${email}`)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                    >
                        <Mail className="h-3 w-3" />
                        {email}
                        <div
                            role="button"
                            onClick={(e) => removeEmail(email, e)}
                            className="ml-1 p-0.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600"
                        >
                            <X className="h-3 w-3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
