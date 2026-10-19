'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
    ArrowLeft,
    CheckCircle,
    Clock,
    Copy,
    Download,
    FileText,
    Forward,
    Lock,
    Mail,
    Paperclip,
    Pin,
    RefreshCcw,
    Trash2,
    X,
} from 'lucide-react';
import { attachmentUrl, deleteEmail, Email, getEmails, setKeep, subscribeToEmails } from '@/lib/supabase';
import { extractOtp } from '@/lib/otp';
import { notifyNewMail, requestNotifyPermission } from '@/lib/notify';

const ONE_HOUR_MS = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;
const NOW_TICK_MS = 30 * 1000;

function expiryLabel(email: Email, now: number): string {
    const msLeft = new Date(email.created_at).getTime() + ONE_HOUR_MS - now;
    const minutes = Math.ceil(msLeft / 60000);
    if (minutes < 0) return '삭제 예정';
    if (minutes < 1) return '곧 삭제';
    return `삭제까지 ${minutes}분`;
}

function InboxContent() {
    const params = useParams();
    const router = useRouter();
    const secret = useSearchParams().get('k');
    const address = decodeURIComponent(params.address as string);

    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [unlockKey, setUnlockKey] = useState('');
    const [unlockError, setUnlockError] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [otpCopied, setOtpCopied] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    const [toast, setToast] = useState<{ sender: string; subject: string } | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const knownIdsRef = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Toast + browser notification for newly arrived emails
    const announceNewEmails = useCallback((fresh: Email[]) => {
        if (fresh.length === 0) return;
        fresh.forEach((email) => notifyNewMail(email.sender, email.subject || '(제목 없음)'));
        const latest = fresh[0];
        setToast({ sender: latest.sender, subject: latest.subject || '(제목 없음)' });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    }, []);

    const fetchEmails = useCallback(async (options?: { silent?: boolean }) => {
        if (!options?.silent) setLoading(true);
        try {
            const data = await getEmails(address, secret ?? undefined);
            if (initializedRef.current) {
                announceNewEmails(data.filter((e) => !knownIdsRef.current.has(e.id)));
            }
            knownIdsRef.current = new Set(data.map((e) => e.id));
            initializedRef.current = true;
            setEmails(data);
            setLocked(false);
            setNow(Date.now());
        } catch (error) {
            if (error instanceof Error && error.message === 'locked') {
                setLocked(true);
            } else {
                console.error('Failed to fetch emails:', error);
            }
        } finally {
            if (!options?.silent) setLoading(false);
        }
    }, [address, secret, announceNewEmails]);

    // Ask for notification permission once on mount
    useEffect(() => {
        requestNotifyPermission();
    }, []);

    // Initial load + realtime (public) or polling (locked inbox via ?k=)
    useEffect(() => {
        fetchEmails();

        if (secret) {
            const interval = setInterval(() => fetchEmails({ silent: true }), POLL_INTERVAL_MS);
            return () => clearInterval(interval);
        }

        const subscription = subscribeToEmails(address, (newEmail: Email) => {
            const isNew = !knownIdsRef.current.has(newEmail.id);
            knownIdsRef.current.add(newEmail.id);
            if (isNew && initializedRef.current) {
                announceNewEmails([newEmail]);
            }
            setEmails((prev) => (prev.some((e) => e.id === newEmail.id) ? prev : [newEmail, ...prev]));
        });

        return () => subscription.unsubscribe();
    }, [address, secret, fetchEmails, announceNewEmails]);

    // Tick `now` so expiry chips stay fresh
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
        return () => clearInterval(interval);
    }, []);

    // Cleanup pending toast timer
    useEffect(() => () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    }, []);

    const handleUnlock = async () => {
        const key = unlockKey.trim();
        if (!key || unlocking) return;
        setUnlocking(true);
        setUnlockError(false);
        try {
            const data = await getEmails(address, key);
            knownIdsRef.current = new Set(data.map((e) => e.id));
            initializedRef.current = true;
            setEmails(data);
            setLocked(false);
            setLoading(false);
            router.replace(`?k=${encodeURIComponent(key)}`);
        } catch {
            setUnlockError(true);
        } finally {
            setUnlocking(false);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(address);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleCopyOtp = async (code: string) => {
        await navigator.clipboard.writeText(code);
        setOtpCopied(true);
        setTimeout(() => setOtpCopied(false), 2000);
    };

    const handleToggleKeep = async (email: Email) => {
        const next = !email.keep;
        // Optimistic update
        setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, keep: next } : e)));
        if (selectedEmail?.id === email.id) setSelectedEmail({ ...email, keep: next });
        try {
            await setKeep(email.id, address, next, secret ?? undefined);
        } catch (error) {
            // Revert on failure
            setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, keep: !next } : e)));
            if (selectedEmail?.id === email.id) setSelectedEmail({ ...email, keep: !next });
            console.error('Failed to toggle keep:', error);
        }
    };

    const handleDelete = async (emailId: string) => {
        try {
            await deleteEmail(emailId, address, secret ?? undefined);
            setEmails((prev) => prev.filter((e) => e.id !== emailId));
            knownIdsRef.current.delete(emailId);
            if (selectedEmail?.id === emailId) {
                setSelectedEmail(null);
            }
        } catch (error) {
            if (error instanceof Error && error.message === 'locked') {
                alert('잠긴 수신함입니다. 비밀번호를 확인해주세요.');
            } else {
                console.error('Failed to delete email:', error);
            }
        }
    };

    const handleDownloadEml = (email: Email) => {
        if (!email.raw_mime) return;
        const blob = new Blob([email.raw_mime], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${email.subject || 'mail'}.eml`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleForward = (email: Email) => {
        const subject = encodeURIComponent(`Fwd: ${email.subject || ''}`);
        const body = encodeURIComponent((email.body_text || '').slice(0, 2000));
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    const openEmail = (email: Email) => {
        setSelectedEmail(email);
        setShowRaw(false);
        setOtpCopied(false);
    };

    const keptCount = emails.filter((e) => e.keep).length;
    const selectedOtp = selectedEmail ? extractOtp(selectedEmail) : null;

    // Locked inbox — password gate
    if (locked) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-md">
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-2xl mb-4">
                            <Lock className="h-8 w-8 text-blue-600" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900">잠긴 수신함입니다</h1>
                        <p className="text-sm text-gray-500 mt-2">{address}</p>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            placeholder="비밀번호 입력"
                            value={unlockKey}
                            onChange={(e) => setUnlockKey(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            className="flex-1 h-12 px-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                            onClick={handleUnlock}
                            disabled={!unlockKey || unlocking}
                            className="h-12 px-5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                        >
                            {unlocking ? '확인 중...' : '잠금 해제'}
                        </button>
                    </div>
                    {unlockError && (
                        <p className="text-sm text-red-500 mt-3 text-center">비밀번호가 올바르지 않습니다</p>
                    )}
                    <button
                        onClick={() => router.push('/')}
                        className="w-full mt-6 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        홈으로 돌아가기
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8 pb-24">
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
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-700">
                                    전체 {emails.length} · 보관 {keptCount}
                                </p>
                                <p className="text-xs text-gray-400">
                                    메일은 도착 후 1시간 뒤 자동 삭제 (보관 제외)
                                </p>
                            </div>
                            <button
                                onClick={() => fetchEmails()}
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
                            <p className="text-sm text-gray-400 mt-2">이 주소로 이메일을보내면 여기에 표시됩니다</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {emails.map((email) => {
                                const otp = extractOtp(email);
                                const hasAttachments = !!email.attachments && email.attachments.length > 0;
                                return (
                                    <div
                                        key={email.id}
                                        onClick={() => openEmail(email)}
                                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-4"
                                    >
                                        <div className="p-2 bg-gray-100 rounded-full shrink-0">
                                            <Mail className="h-4 w-4 text-gray-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 truncate">{email.sender}</p>
                                            <p className="text-sm text-gray-600 truncate">{email.subject || '(제목 없음)'}</p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                {otp && (
                                                    <>
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                                            인증번호 {otp}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigator.clipboard.writeText(otp);
                                                            }}
                                                            className="p-1 hover:bg-green-100 rounded transition-colors"
                                                        >
                                                            <Copy className="h-3.5 w-3.5 text-green-600" />
                                                        </button>
                                                    </>
                                                )}
                                                {email.keep ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                                        보관됨
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                                                        <Clock className="h-3 w-3" />
                                                        {expiryLabel(email, now)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-2 shrink-0">
                                            <span className="text-xs text-gray-400">
                                                {formatDistanceToNow(new Date(email.created_at), { addSuffix: true, locale: ko })}
                                            </span>
                                            {hasAttachments && (
                                                <Paperclip className="h-4 w-4 text-gray-400" />
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleKeep(email);
                                                }}
                                                className="p-1.5 hover:bg-green-100 rounded-lg transition-colors"
                                                title={email.keep ? '보관 해제' : '보관'}
                                            >
                                                <Pin className={`h-4 w-4 ${email.keep ? 'text-green-500' : 'text-gray-400'}`} />
                                            </button>
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
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* New mail toast */}
            {toast && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md bg-blue-500 text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
                    <Mail className="h-5 w-5 shrink-0" />
                    <p className="flex-1 min-w-0 text-sm font-medium truncate">
                        새 메일 도착 — {toast.sender} {toast.subject}
                    </p>
                    <button
                        onClick={() => setToast(null)}
                        className="p-1 hover:bg-blue-600 rounded-lg transition-colors shrink-0"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Email Detail Modal */}
            {selectedEmail && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setSelectedEmail(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
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
                            {selectedOtp && (
                                <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold text-green-600 mb-1">인증번호</p>
                                        <p className="text-3xl font-mono font-bold text-green-700 tracking-wider">{selectedOtp}</p>
                                    </div>
                                    <button
                                        onClick={() => handleCopyOtp(selectedOtp)}
                                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                                    >
                                        {otpCopied ? '복사됨' : '복사'}
                                    </button>
                                </div>
                            )}

                            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                                <div className="mb-6">
                                    <p className="text-xs font-semibold text-gray-500 mb-2">첨부파일</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedEmail.attachments.map((a) => (
                                            <a
                                                key={a.path}
                                                href={attachmentUrl(a.path)}
                                                target="_blank"
                                                rel="noreferrer"
                                                download
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                                            >
                                                <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                                                {a.name} · {Math.ceil(a.size / 1024)}KB
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showRaw && selectedEmail.raw_mime ? (
                                <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto whitespace-pre-wrap break-all font-mono text-gray-700">
                                    {selectedEmail.raw_mime}
                                </pre>
                            ) : (
                                <div
                                    className="prose max-w-none"
                                    dangerouslySetInnerHTML={{
                                        __html: DOMPurify.sanitize(selectedEmail.body_html || selectedEmail.body_text || '')
                                    }}
                                />
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-100 flex flex-wrap justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => handleToggleKeep(selectedEmail)}
                                    className={`px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-2 ${
                                        selectedEmail.keep
                                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <Pin className="h-4 w-4" />
                                    {selectedEmail.keep ? '보관 해제' : '보관'}
                                </button>
                                {selectedEmail.raw_mime && (
                                    <>
                                        <button
                                            onClick={() => setShowRaw((v) => !v)}
                                            className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center gap-2"
                                        >
                                            <FileText className="h-4 w-4" />
                                            {showRaw ? '본문 보기' : '원본 보기'}
                                        </button>
                                        <button
                                            onClick={() => handleDownloadEml(selectedEmail)}
                                            className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center gap-2"
                                        >
                                            <Download className="h-4 w-4" />
                                            EML 다운로드
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => handleForward(selectedEmail)}
                                    className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center gap-2"
                                >
                                    <Forward className="h-4 w-4" />
                                    내 메일로 전달
                                </button>
                            </div>
                            <div className="flex gap-2">
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
                </div>
            )}
        </main>
    );
}

export default function InboxPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
                    <div className="max-w-5xl mx-auto">
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center text-gray-500">
                            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                            이메일을 불러오는 중...
                        </div>
                    </div>
                </main>
            }
        >
            <InboxContent />
        </Suspense>
    );
}
