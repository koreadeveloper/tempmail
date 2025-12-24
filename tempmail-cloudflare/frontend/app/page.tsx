'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ArrowRight, Sparkles } from 'lucide-react';

export default function Home() {
    const [username, setUsername] = useState('');
    const [domain] = useState('sia.kr'); // Your domain here
    const router = useRouter();
    const [history, setHistory] = useState<string[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem('tempmail_history');
        if (stored) {
            setHistory(JSON.parse(stored));
        }
    }, []);

    const handleCreate = () => {
        if (!username) return;
        const fullEmail = `${username.toLowerCase()}@${domain}`;

        // Save to history
        const newHistory = [fullEmail, ...history.filter(h => h !== fullEmail)].slice(0, 10);
        localStorage.setItem('tempmail_history', JSON.stringify(newHistory));

        router.push(`/inbox/${encodeURIComponent(fullEmail)}`);
    };

    const handleRandom = () => {
        const randomName = Math.random().toString(36).substring(2, 10);
        setUsername(randomName);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-blue-50">
            <div className="w-full max-w-md">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center p-4 bg-blue-500 rounded-2xl mb-4">
                        <Mail className="h-12 w-12 text-white" />
                    </div>
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
                            <div className="h-12 px-4 flex items-center bg-gray-100 rounded-lg text-gray-500 font-medium">
                                @{domain}
                            </div>
                        </div>

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
                            {history.map(email => (
                                <div
                                    key={email}
                                    onClick={() => router.push(`/inbox/${encodeURIComponent(email)}`)}
                                    className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                                >
                                    <span className="text-gray-700">{email}</span>
                                    <ArrowRight className="h-4 w-4 text-gray-400" />
                                </div>
                            ))}
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
