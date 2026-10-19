'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
    ArrowLeft, ArrowUpDown, Check, CheckCircle, Clock, Copy, KeyRound,
    Link2, Lock, Mail, Menu, Paperclip, RefreshCcw, Search, Star, X, Zap,
} from 'lucide-react';
import { attachmentUrl, deleteEmail, Email, getEmails, setKeep, subscribeToEmails } from '@/lib/supabase';
import { extractOtp } from '@/lib/otp';
import { notifyNewMail, requestNotifyPermission } from '@/lib/notify';
import { markRead, readSet } from '@/lib/read';
import { MOCK_EMAILS } from '@/lib/mock';
import Logo from '@/components/tm/Logo';
import MailDetail, { senderAvatar } from '@/components/tm/MailDetail';
import AddressPicker from '@/components/tm/AddressPicker';

const ONE_HOUR_MS = 60 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;
const NOW_TICK_MS = 30 * 1000;
const IS_DEV = process.env.NODE_ENV === 'development';

function expiryLabel(email: Email, now: number): string {
    const msLeft = new Date(email.created_at).getTime() + ONE_HOUR_MS - now;
    const minutes = Math.ceil(msLeft / 60000);
    if (email.keep) return '보관됨';
    if (minutes < 0) return '삭제 예정';
    if (minutes < 1) return '곧 삭제';
    return `${minutes}분 후 삭제`;
}

type Filter = 'all' | 'unread' | 'keep';

function InboxContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const secret = searchParams.get('k');
    const useMock = IS_DEV && searchParams.get('mock') === '1';
    const address = decodeURIComponent(params.address as string);

    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState(false);
    const [unlockKey, setUnlockKey] = useState('');
    const [unlockError, setUnlockError] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [toast, setToast] = useState<{ sender: string; subject: string } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [linkBannerDismissed, setLinkBannerDismissed] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [sortDesc, setSortDesc] = useState(true);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const knownIdsRef = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

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

    useEffect(() => { requestNotifyPermission(); }, []);
    useEffect(() => { setReadIds(readSet(address)); }, [address]);

    // 목업 모드 (개발 전용 시각 QA)
    useEffect(() => {
        if (!useMock) return;
        setEmails(MOCK_EMAILS.map(e => ({ ...e, recipient: address })));
        setLoading(false);
        setLocked(false);
        initializedRef.current = true;
    }, [useMock, address]);

    // 실제 로드 + realtime(공개)/폴링(잠금)
    useEffect(() => {
        if (useMock) return;
        fetchEmails();
        if (secret) {
            const interval = setInterval(() => fetchEmails({ silent: true }), POLL_INTERVAL_MS);
            return () => clearInterval(interval);
        }
        const subscription = subscribeToEmails(address, (newEmail: Email) => {
            const isNew = !knownIdsRef.current.has(newEmail.id);
            knownIdsRef.current.add(newEmail.id);
            if (isNew && initializedRef.current) announceNewEmails([newEmail]);
            setEmails((prev) => (prev.some((e) => e.id === newEmail.id) ? prev : [newEmail, ...prev]));
        });
        return () => subscription.unsubscribe();
    }, [address, secret, fetchEmails, announceNewEmails, useMock]);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
        return () => clearInterval(interval);
    }, []);
    useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

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

    const handleCopyLink = async () => {
        await navigator.clipboard.writeText(window.location.href);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    const handleToggleKeep = async (email: Email) => {
        const next = !email.keep;
        setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, keep: next } : e)));
        if (selectedEmail?.id === email.id) setSelectedEmail({ ...email, keep: next });
        if (useMock) return;
        try {
            await setKeep(email.id, address, next, secret ?? undefined);
        } catch (error) {
            setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, keep: !next } : e)));
            if (selectedEmail?.id === email.id) setSelectedEmail({ ...email, keep: !next });
            console.error('Failed to toggle keep:', error);
        }
    };

    const handleDelete = async (emailId: string) => {
        setEmails((prev) => prev.filter((e) => e.id !== emailId));
        knownIdsRef.current.delete(emailId);
        if (selectedEmail?.id === emailId) setSelectedEmail(null);
        if (useMock) return;
        try {
            await deleteEmail(emailId, address, secret ?? undefined);
        } catch (error) {
            if (error instanceof Error && error.message === 'locked') {
                alert('잠긴 수신함입니다. 비밀키를 확인해주세요.');
            } else {
                console.error('Failed to delete email:', error);
            }
        }
    };

    const handleForward = (email: Email) => {
        const subject = encodeURIComponent(`Fwd: ${email.subject || ''}`);
        const body = encodeURIComponent((email.body_text || '').slice(0, 1200));
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    const openEmail = (email: Email) => {
        setSelectedEmail(email);
        setReadIds(markRead(address, email.id));
    };

    // 파생 목록
    const unreadCount = emails.filter(e => !readIds.has(e.id)).length;
    const filtered = useMemo(() => {
        let list = emails;
        if (filter === 'unread') list = list.filter(e => !readIds.has(e.id));
        if (filter === 'keep') list = list.filter(e => e.keep);
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(e =>
                (e.sender || '').toLowerCase().includes(q) ||
                (e.subject || '').toLowerCase().includes(q) ||
                (e.body_text || '').toLowerCase().includes(q)
            );
        }
        return [...list].sort((a, b) =>
            sortDesc
                ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
    }, [emails, filter, search, sortDesc, readIds]);

    /* ===== 메일 목록 아이템 ===== */
    const mailItem = (email: Email) => {
        const unread = !readIds.has(email.id);
        const otp = extractOtp(email);
        const hasAtt = !!email.attachments && email.attachments.length > 0;
        const av = senderAvatar(email.sender);
        return (
            <button
                key={email.id}
                onClick={() => openEmail(email)}
                className={`tm-mail-item w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-[#F1F4FB] last:border-0 ${
                    selectedEmail?.id === email.id ? 'bg-[#F4F1FF]' : ''
                }`}
            >
                <span className={`w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-[#516EFF]' : 'bg-transparent'}`} />
                <span
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-extrabold text-[15px] shrink-0"
                    style={{ background: av.color }}
                >
                    {av.initial}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                        <span className={`truncate text-[14.5px] ${unread ? 'font-extrabold' : 'font-bold'} text-tm-ink`}>{av.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-tm-muted">
                            {formatDistanceToNow(new Date(email.created_at), { addSuffix: true, locale: ko })}
                        </span>
                    </span>
                    <span className={`block truncate text-[13px] mt-0.5 ${unread ? 'font-semibold text-tm-ink' : 'font-medium text-[#4A5570]'}`}>
                        {email.subject || '(제목 없음)'}
                    </span>
                    <span className="flex items-center gap-1.5 mt-1">
                        <span className="truncate text-[12px] text-tm-muted flex-1">
                            {(email.body_text || '').replace(/\s+/g, ' ').slice(0, 60) || ' '}
                        </span>
                        {otp && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#DFF6E8] text-[#1FA45B] text-[10.5px] font-bold">OTP</span>
                        )}
                        {hasAtt && <Paperclip className="h-3.5 w-3.5 text-tm-muted shrink-0" />}
                    </span>
                </span>
                <span className="flex flex-col items-center gap-1.5 shrink-0">
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleToggleKeep(email); }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), handleToggleKeep(email))}
                        aria-label="보관"
                        className="tm-icon-btn h-8 w-8"
                    >
                        <Star className={`h-[19px] w-[19px] ${email.keep ? 'fill-[#FFC93C] text-[#FFC93C]' : 'text-[#C9D0E2]'}`} />
                    </span>
                    <span className="text-[10px] text-tm-muted flex items-center gap-0.5">
                        {!email.keep && <Clock className="h-2.5 w-2.5" />}
                        {expiryLabel(email, now)}
                    </span>
                </span>
            </button>
        );
    };

    const listBody = loading ? (
        <div className="p-12 text-center text-tm-muted">
            <div className="animate-spin h-8 w-8 border-4 border-tm-from border-t-transparent rounded-full mx-auto mb-4" />
            이메일을 불러오는 중...
        </div>
    ) : filtered.length === 0 ? (
        <div className="p-12 text-center">
            <Mail className="h-14 w-14 text-tm-border mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-tm-ink">
                {emails.length === 0 ? '아직 수신된 이메일이 없습니다' : '조건에 맞는 메일이 없습니다'}
            </p>
            <p className="text-[13px] text-tm-muted mt-1.5">이 주소로 이메일을 보내면 여기에 표시됩니다</p>
        </div>
    ) : (
        <div>{filtered.map(mailItem)}</div>
    );

    /* ===== 잠금 게이트 ===== */
    if (locked) {
        return (
            <main className="min-h-[100dvh] bg-tm-bg flex items-center justify-center p-5">
                <div className="tm-card p-7 w-full max-w-md text-center">
                    <img src="/assets/tempmail/cat-picker.png" alt="" className="w-[150px] mx-auto -mt-2 pointer-events-none" />
                    <h1 className="text-[19px] font-extrabold text-tm-ink">잠긴 수신함입니다</h1>
                    <p className="text-[13px] text-tm-muted mt-1.5">{address}</p>
                    <p className="text-[12.5px] text-tm-muted mt-3 leading-relaxed">
                        이 수신함은 생성 시 자동 발급된 <strong>비밀키</strong>로만 열립니다.
                        비밀키는 수신함 링크의 <code className="bg-[#F4F6FD] px-1 rounded">?k=</code> 부분입니다.
                    </p>
                    <div className="flex gap-2 mt-4">
                        <input
                            type="password"
                            placeholder="비밀키 입력"
                            value={unlockKey}
                            onChange={(e) => setUnlockKey(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            className="tm-input flex-1 h-12 px-4 text-[14px]"
                        />
                        <button
                            onClick={handleUnlock}
                            disabled={!unlockKey || unlocking}
                            className="tm-btn-gradient h-12 px-5 text-[14px]"
                        >
                            {unlocking ? '확인 중' : '잠금 해제'}
                        </button>
                    </div>
                    {unlockError && <p className="text-[13px] text-[#E15B7B] font-medium mt-3">비밀키가 올바르지 않습니다</p>}
                    <button
                        onClick={() => router.push('/')}
                        className="w-full mt-5 inline-flex items-center justify-center gap-2 text-[13.5px] text-tm-muted hover:text-tm-ink transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        홈으로 돌아가기
                    </button>
                </div>
            </main>
        );
    }

    /* ===== 본문 ===== */
    return (
        <main className="min-h-[100dvh] bg-tm-bg">
            {/* ===== 모바일 ===== */}
            <div className="lg:hidden pb-28">
                <header className="flex items-center justify-between h-14 px-3">
                    <button onClick={() => setMenuOpen(v => !v)} aria-label="메뉴" className="tm-icon-btn h-10 w-10 relative">
                        <Menu className="h-[22px] w-[22px]" />
                    </button>
                    <span className="absolute left-1/2 -translate-x-1/2"><Logo size={30} /></span>
                    <div className="flex items-center gap-0.5">
                        <button onClick={() => searchRef.current?.focus()} aria-label="검색" className="tm-icon-btn h-10 w-10">
                            <Search className="h-5 w-5" />
                        </button>
                        <button onClick={() => fetchEmails()} aria-label="새로고침" className="tm-icon-btn h-10 w-10">
                            <RefreshCcw className="h-5 w-5" />
                        </button>
                    </div>
                </header>
                {menuOpen && (
                    <div className="absolute left-3 top-13 top-[52px] tm-card p-1.5 w-44 z-50 shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
                        <button onClick={() => router.push('/')} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">새 주소 만들기</button>
                        <button onClick={() => { setPickerOpen(true); setMenuOpen(false); }} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">주소 선택</button>
                        <button onClick={handleCopy} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">주소 복사</button>
                        <button onClick={() => router.push('/admin')} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">관리자</button>
                    </div>
                )}

                <div className="px-5">
                    {/* 히어로 */}
                    <div className="flex items-end justify-between">
                        <div className="pb-1">
                            <div className="flex items-center gap-2">
                                <h1 className="text-[26px] font-extrabold tracking-tight">받은 메일</h1>
                                <span className="tm-btn-gradient !rounded-full px-2.5 py-0.5 text-[13px] !shadow-none">{unreadCount}</span>
                            </div>
                            <p className="text-[12.5px] text-tm-muted mt-1">도착한 메일을 실시간으로 확인해요</p>
                        </div>
                        <img src="/assets/tempmail/cat-mailbox.png" alt="" className="w-[120px] -mb-2 -mr-2 pointer-events-none" />
                    </div>

                    {/* 주소 pill */}
                    <button
                        onClick={handleCopy}
                        className="tm-card w-full flex items-center gap-2.5 px-4 py-3 mt-1 mb-3"
                    >
                        <Mail className="h-4.5 w-4.5 h-[18px] w-[18px] text-tm-from shrink-0" />
                        <span className="flex-1 min-w-0 text-left font-bold text-[14.5px] text-tm-ink truncate">{address}</span>
                        {copySuccess
                            ? <span className="text-[11.5px] font-bold text-[#1FA45B] flex items-center gap-1"><Check className="h-3.5 w-3.5" />복사됨</span>
                            : <Copy className="h-4 w-4 text-tm-muted shrink-0" />}
                    </button>

                    {/* 비밀 링크 배너 (잠금함만) */}
                    {secret && !linkBannerDismissed && (
                        <div className="tm-card !border-[#B9A8F5] !bg-[#F4F1FF] p-3.5 mb-3 flex items-center gap-2.5">
                            <KeyRound className="h-4.5 w-4.5 h-[18px] w-[18px] text-tm-from shrink-0" />
                            <p className="flex-1 min-w-0 text-[12px] text-[#5B4BB5] leading-snug">
                                비밀 링크로만 열리는 수신함입니다 — <strong>링크를 저장</strong>해두세요. 24시간 뒤 잠금이 해제됩니다.
                            </p>
                            <button onClick={handleCopyLink} className="tm-btn-gradient h-8 px-3 text-[12px] !rounded-lg inline-flex items-center gap-1 shrink-0">
                                {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                                {linkCopied ? '복사됨' : '링크'}
                            </button>
                            <button onClick={() => setLinkBannerDismissed(true)} aria-label="닫기" className="tm-icon-btn h-7 w-7 shrink-0">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* 검색 */}
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 h-[18px] w-[18px] text-tm-muted" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="보낸 사람, 제목으로 검색하세요"
                            className="tm-input w-full h-11.5 h-[46px] pl-10 pr-3 text-[14px]"
                        />
                    </div>

                    {/* 필터 칩 */}
                    <div className="flex items-center gap-2 mt-3.5 mb-1 overflow-x-auto tm-scrollbar-none">
                        <button onClick={() => setFilter('all')} className={`tm-chip ${filter === 'all' ? 'tm-chip-active' : ''}`}>전체</button>
                        <button onClick={() => setFilter('unread')} className={`tm-chip ${filter === 'unread' ? 'tm-chip-active' : ''}`}>안읽음</button>
                        <button onClick={() => setFilter('keep')} className={`tm-chip ${filter === 'keep' ? 'tm-chip-active' : ''}`}>보관</button>
                        <button
                            onClick={() => setSortDesc(v => !v)}
                            className="tm-chip ml-auto inline-flex items-center gap-1 shrink-0"
                        >
                            <ArrowUpDown className="h-3 w-3" />
                            {sortDesc ? '최신순' : '오래된순'}
                        </button>
                    </div>

                    {/* 목록 */}
                    <div className="tm-card mt-2 overflow-hidden">{listBody}</div>
                </div>
            </div>

            {/* ===== 데스크톱 ===== */}
            <div className="hidden lg:block">
                <header className="flex items-center justify-between h-16 px-8 max-w-7xl mx-auto">
                    <Logo />
                    <nav className="flex items-center gap-1 text-[14px] font-semibold">
                        <button onClick={() => router.push('/')} className="px-4 py-2 rounded-xl text-tm-muted hover:bg-[#F4F6FD]">홈</button>
                        <button className="px-4 py-2 rounded-xl text-tm-ink bg-[#F0EDFE]">받은 메일</button>
                        <button onClick={() => setPickerOpen(true)} className="px-4 py-2 rounded-xl text-tm-muted hover:bg-[#F4F6FD]">주소 선택</button>
                        <button onClick={() => router.push('/admin')} className="px-4 py-2 rounded-xl text-tm-muted hover:bg-[#F4F6FD]">관리자</button>
                    </nav>
                </header>

                <div className="max-w-7xl mx-auto px-8">
                    {/* 주소 히어로 */}
                    <div className="tm-card p-6 flex items-center gap-5">
                        <img src="/assets/tempmail/cat-mailbox.png" alt="" className="w-[150px] pointer-events-none" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                                <h1 className="text-[26px] font-extrabold tracking-tight truncate">{address}</h1>
                                <button onClick={handleCopy} className="tm-icon-btn h-9 w-9 shrink-0" aria-label="주소 복사">
                                    {copySuccess ? <CheckCircle className="h-4.5 w-4.5 h-[18px] w-[18px] text-[#1FA45B]" /> : <Copy className="h-4.5 w-4.5 h-[18px] w-[18px]" />}
                                </button>
                            </div>
                            <p className="text-[13.5px] text-tm-muted mt-1">이 주소로 오는 모든 메일을 실시간으로 받아요.</p>
                            <div className="flex gap-3 mt-4">
                                <div className="bg-[#F4F6FD] rounded-xl px-4 py-2.5">
                                    <p className="text-[18px] font-extrabold text-tm-ink">{emails.length}</p>
                                    <p className="text-[11.5px] text-tm-muted">전체 메일</p>
                                </div>
                                <div className="bg-[#F4F6FD] rounded-xl px-4 py-2.5">
                                    <p className="text-[18px] font-extrabold text-tm-ink">{emails.filter(e => e.keep).length}</p>
                                    <p className="text-[11.5px] text-tm-muted">보관한 메일</p>
                                </div>
                                <div className="bg-[#F4F6FD] rounded-xl px-4 py-2.5">
                                    <p className="text-[18px] font-extrabold text-tm-ink">1시간</p>
                                    <p className="text-[11.5px] text-tm-muted">자동 삭제</p>
                                </div>
                                <button onClick={() => router.push('/')} className="tm-btn-gradient px-5 ml-auto self-center text-[14px] h-11 inline-flex items-center gap-2">
                                    새 메일 주소 만들기
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 3단 레이아웃 */}
                    <div className="grid grid-cols-[420px_1fr_280px] gap-5 mt-5 pb-12">
                        {/* 목록 */}
                        <div className="tm-card overflow-hidden flex flex-col max-h-[70vh]">
                            <div className="p-3.5 border-b border-tm-border">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tm-muted" />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="보낸 사람, 제목으로 검색하세요"
                                        className="tm-input w-full h-10 pl-9 pr-3 text-[13.5px]"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5 mt-2.5">
                                    <button onClick={() => setFilter('all')} className={`tm-chip !text-[12px] !px-3 !py-1.5 ${filter === 'all' ? 'tm-chip-active' : ''}`}>전체</button>
                                    <button onClick={() => setFilter('unread')} className={`tm-chip !text-[12px] !px-3 !py-1.5 ${filter === 'unread' ? 'tm-chip-active' : ''}`}>읽지 않음</button>
                                    <button onClick={() => setFilter('keep')} className={`tm-chip !text-[12px] !px-3 !py-1.5 ${filter === 'keep' ? 'tm-chip-active' : ''}`}>보관됨</button>
                                    <button onClick={() => setSortDesc(v => !v)} className="tm-chip !text-[12px] !px-3 !py-1.5 ml-auto inline-flex items-center gap-1">
                                        <ArrowUpDown className="h-3 w-3" />{sortDesc ? '최신순' : '오래된순'}
                                    </button>
                                    <button onClick={() => fetchEmails()} className="tm-icon-btn h-8 w-8" aria-label="새로고침">
                                        <RefreshCcw className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto">{listBody}</div>
                        </div>

                        {/* 상세 */}
                        <div className="tm-card overflow-hidden max-h-[70vh]">
                            {selectedEmail ? (
                                <MailDetail
                                    email={selectedEmail}
                                    address={address}
                                    pane
                                    onClose={() => setSelectedEmail(null)}
                                    onToggleKeep={handleToggleKeep}
                                    onDelete={handleDelete}
                                    onForward={handleForward}
                                />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                                    <img src="/assets/tempmail/cat-compose.png" alt="" className="w-[190px] pointer-events-none" />
                                    <p className="text-[15px] font-bold text-tm-ink mt-2">메일을 선택해 주세요</p>
                                    <p className="text-[13px] text-tm-muted mt-1">왼쪽 목록에서 메일을 누르면 여기에 표시돼요.</p>
                                </div>
                            )}
                        </div>

                        {/* 우측 사이드바 */}
                        <div className="space-y-4">
                            {secret && !linkBannerDismissed && (
                                <div className="tm-card !border-[#B9A8F5] !bg-[#F4F1FF] p-4">
                                    <div className="flex items-start gap-2.5">
                                        <KeyRound className="h-4.5 w-4.5 h-[18px] w-[18px] text-tm-from shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12.5px] text-[#5B4BB5] leading-snug">비밀 링크로만 열리는 수신함입니다 — 링크를 저장해두세요.</p>
                                            <button onClick={handleCopyLink} className="mt-2 text-[12px] font-bold text-tm-from inline-flex items-center gap-1">
                                                <Link2 className="h-3.5 w-3.5" />{linkCopied ? '복사됨' : '링크 복사'}
                                            </button>
                                        </div>
                                        <button onClick={() => setLinkBannerDismissed(true)} className="tm-icon-btn h-6 w-6"><X className="h-3.5 w-3.5" /></button>
                                    </div>
                                </div>
                            )}
                            <div className="tm-card p-5">
                                <h3 className="text-[14px] font-bold text-tm-ink mb-3 flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-[#F59E0B]" />빠른 사용 팁
                                </h3>
                                <ul className="space-y-2.5 text-[12.5px] text-tm-muted leading-relaxed">
                                    <li>메일은 도착 후 1시간 뒤 자동 삭제됩니다.</li>
                                    <li>별표(보관)한 메일은 삭제되지 않습니다.</li>
                                    <li>인증번호는 자동 감지돼 카드로 표시됩니다.</li>
                                </ul>
                            </div>
                            <div className="tm-card p-5">
                                <h3 className="text-[14px] font-bold text-tm-ink mb-2">오늘 받은 메일</h3>
                                <p className="text-[26px] font-extrabold tm-text-grad">{emails.filter(e => now - new Date(e.created_at).getTime() < 86400000).length}개</p>
                                <div className="h-1.5 bg-[#F0EDFE] rounded-full mt-2 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, emails.length * 12)}%`, background: 'linear-gradient(105deg,#8560F7,#516EFF)' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 새 메일 토스트 */}
            {toast && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-md tm-btn-gradient !rounded-2xl px-4 py-3.5 flex items-center gap-3 text-white shadow-xl">
                    <Mail className="h-5 w-5 shrink-0" />
                    <p className="flex-1 min-w-0 text-[13.5px] font-bold truncate">
                        새 메일 도착 — {toast.sender}
                    </p>
                    <button onClick={() => setToast(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors shrink-0" aria-label="닫기">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* 모바일 상세 (전체화면) */}
            {selectedEmail && (
                <div className="lg:hidden">
                    <MailDetail
                        email={selectedEmail}
                        address={address}
                        onClose={() => setSelectedEmail(null)}
                        onToggleKeep={handleToggleKeep}
                        onDelete={handleDelete}
                        onForward={handleForward}
                    />
                </div>
            )}

            {pickerOpen && <AddressPicker mode="inbox" onClose={() => setPickerOpen(false)} />}
        </main>
    );
}

export default function InboxPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-[100dvh] bg-tm-bg flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 border-4 border-tm-from border-t-transparent rounded-full" />
                </main>
            }
        >
            <InboxContent />
        </Suspense>
    );
}
