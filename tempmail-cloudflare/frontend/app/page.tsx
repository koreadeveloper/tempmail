'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Lock } from 'lucide-react';
import { createInbox } from '@/lib/supabase';

const DOMAINS = ['sia.kr', 'mail.sia.kr'];

export default function Home() {
    const [username, setUsername] = useState('');
    const [domain, setDomain] = useState(DOMAINS[0]);
    const [locked, setLocked] = useState(false);
    const router = useRouter();
    const [history, setHistory] = useState<string[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem('tempmail_history');
        if (stored) {
            try {
                setHistory(JSON.parse(stored));
            } catch {
                setHistory([]);
            }
        }
    }, []);

    const handleCreate = async () => {
        if (!username) return;
        const fullEmail = `${username.toLowerCase()}@${domain}`;
        // Always generate a secret — it reserves the address; `locked` controls privacy
        const secret = crypto.randomUUID();

        try {
            const res = await createInbox(fullEmail, secret, locked);
            if (res.existing && res.locked === true && !locked) {
                alert('이 주소는 이미 잠긴 수신함입니다');
                return;
            }
        } catch (e) {
            // Don't block UX — still navigate even if reservation fails
            console.error('createInbox failed:', e);
        }

        // Save to history (keep ?k=secret for locked inboxes so deep links keep the key)
        const entry = locked ? `${fullEmail}?k=${secret}` : fullEmail;
        const newHistory = [entry, ...history.filter(h => h.split('?k=')[0] !== fullEmail)].slice(0, 10);
        localStorage.setItem('tempmail_history', JSON.stringify(newHistory));
        window.dispatchEvent(new Event('history-updated'));

        router.push(`/inbox/${encodeURIComponent(fullEmail)}${locked ? `?k=${secret}` : ''}`);
    };

    const openEntry = (entry: string) => {
        const [addr, key] = entry.split('?k=');
        router.push(`/inbox/${encodeURIComponent(addr)}${key ? `?k=${key}` : ''}`);
    };

    // 헷갈리는 문자 제외: l(소문자L) i 1 o 0 — 육안으로 읽고 입력하기 쉬운 문자만 사용
    const RANDOM_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
    const handleRandom = () => {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        setUsername(Array.from(bytes, b => RANDOM_CHARS[b % RANDOM_CHARS.length]).join(''));
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-blue-50">
            <div className="w-full max-w-md">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <img src="/logo.svg" alt="TempMail" className="h-12 w-12 mx-auto mb-4" />
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">TempMail</h1>
                    <p className="text-gray-500">회원가입 없이 바로 사용하는 1회용 이메일</p>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                    <div className="space-y-4">
                        {/* Email Input */}
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="아이디 입력"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9.-]/g, ''))}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                className="flex-1 h-12 px-4 text-lg border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {DOMAINS.length > 1 ? (
                                <select
                                    value={domain}
                                    onChange={(e) => setDomain(e.target.value)}
                                    className="h-12 px-3 bg-gray-100 rounded-lg text-gray-500 font-medium border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                >
                                    {DOMAINS.map(d => (
                                        <option key={d} value={d}>@{d}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="h-12 px-4 flex items-center bg-gray-100 rounded-lg text-gray-500 font-medium">
                                    @{domain}
                                </div>
                            )}
                        </div>

                        {/* Private Inbox Checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                            <input
                                type="checkbox"
                                checked={locked}
                                onChange={(e) => setLocked(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            />
                            <Lock className="h-4 w-4 text-gray-500" />
                            <span className="text-sm text-gray-700">비공개 수신함 (비밀키로만 열람 · 24시간 후 자동 해제)</span>
                        </label>

                        {/* Random Button */}
                        <button
                            onClick={handleRandom}
                            className="w-full flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors py-2"
                        >
                            <Sparkles className="h-4 w-4" />
                            랜덤 아이디 생성
                        </button>

                        {/* Create Button */}
                        <button
                            onClick={handleCreate}
                            disabled={!username}
                            className="w-full h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                            이메일 생성하기
                            <ArrowRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Recent Emails */}
                {history.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-sm text-gray-500 mb-3 px-1">최근 사용한 이메일</h3>
                        <div className="space-y-2">
                            {history.map(entry => {
                                const [addr, key] = entry.split('?k=');
                                return (
                                    <div
                                        key={entry}
                                        onClick={() => openEntry(entry)}
                                        className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                                    >
                                        <span className="text-gray-700 flex items-center gap-1.5">
                                            {addr}
                                            {key && <Lock className="h-3.5 w-3.5 text-gray-400" />}
                                        </span>
                                        <ArrowRight className="h-4 w-4 text-gray-400" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <p className="text-center text-xs text-gray-400 mt-8">
                    수신된 이메일은 1시간 후 자동 삭제됩니다
                </p>
            </div>
        </main>
    );
}
