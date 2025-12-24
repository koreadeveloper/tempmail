'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { RefreshCcw, Copy, Clock, Mail, Trash2, ArrowLeft, CheckCircle } from 'lucide-react';
import { getEmailsByRecipient, subscribeToEmails, deleteEmail, Email } from '@/lib/supabase';

export default function InboxPage() {
    const params = useParams();
    const router = useRouter();
    const address = decodeURIComponent(params.address as string);

    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [timeLeft, setTimeLeft] = useState(3600);

    // Fetch emails function
    const fetchEmails = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getEmailsByRecipient(address);
            setEmails(data);
        } catch (error) {
            console.error('Failed to fetch emails:', error);
        } finally {
            setLoading(false);
        }
    }, [address]);

    // Initial load and realtime subscription
    useEffect(() => {
        fetchEmails();

        // Subscribe to realtime updates
        const subscription = subscribeToEmails(address, (newEmail) => {
            setEmails(prev => [newEmail, ...prev]);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [address, fetchEmails]);

    // Timer countdown
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(prev => (prev <= 0 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(address);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleDelete = async (emailId: string) => {
        try {
            await deleteEmail(emailId);
            setEmails(prev => prev.filter(e => e.id !== emailId));
            if (selectedEmail?.id === emailId) {
                setSelectedEmail(null);
            }
        } catch (error) {
            console.error('Failed to delete email:', error);
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.push('/')}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5 text-gray-600" />
                            </button>
                            <div className="p-3 bg-blue-100 rounded-xl">
                                <Mail className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold text-gray-900">{address}</h1>
                                    <button
                                        onClick={handleCopy}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        {copySuccess ? (
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4 text-gray-400" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-sm text-gray-500">이 주소로 이메일을 보내세요</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${timeLeft < 300 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                <Clock className="h-4 w-4" />
                                <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                            </div>
                            <button
                                onClick={fetchEmails}
                                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <RefreshCcw className="h-5 w-5 text-gray-600" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Email List */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h2 className="font-semibold text-gray-900">수신함 ({emails.length})</h2>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                            이메일을 불러오는 중...
                        </div>
                    ) : emails.length === 0 ? (
                        <div className="p-12 text-center">
                            <Mail className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-500">아직 수신된 이메일이 없습니다</p>
                            <p className="text-sm text-gray-400 mt-2">이 주소로 이메일을 보내면 여기에 표시됩니다</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {emails.map(email => (
                                <div
                                    key={email.id}
                                    onClick={() => setSelectedEmail(email)}
                                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-4"
                                >
                                    <div className="p-2 bg-gray-100 rounded-full">
                                        <Mail className="h-4 w-4 text-gray-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 truncate">{email.sender}</p>
                                        <p className="text-sm text-gray-600 truncate">{email.subject || '(제목 없음)'}</p>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                        <span className="text-xs text-gray-400">
                                            {formatDistanceToNow(new Date(email.created_at), { addSuffix: true, locale: ko })}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(email.id);
                                            }}
                                            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Email Detail Modal */}
            {selectedEmail && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setSelectedEmail(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">{selectedEmail.subject || '(제목 없음)'}</h2>
                            <div className="mt-2 text-sm text-gray-500">
                                <p>보낸 사람: {selectedEmail.sender}</p>
                                <p>받은 시간: {new Date(selectedEmail.created_at).toLocaleString('ko-KR')}</p>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-auto p-6">
                            <div
                                className="prose max-w-none"
                                dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(selectedEmail.body_html || selectedEmail.body_text || '')
                                }}
                            />
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() => handleDelete(selectedEmail.id)}
                                className="px-4 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                            >
                                삭제
                            </button>
                            <button
                                onClick={() => setSelectedEmail(null)}
                                className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
