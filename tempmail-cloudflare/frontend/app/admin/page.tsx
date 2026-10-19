'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
    ArrowLeft, ArrowRight, Check, Clock, FileText, Lock, Mail,
    MailOpen, Paperclip, RefreshCcw, Search, Send, ShieldCheck, Star, Trash2, User, X,
} from 'lucide-react';
import { adminDeleteEmail, adminGetEmail, adminListEmails, adminSendEmail, AdminEmailRow, Email } from '@/lib/supabase';
import { extractOtp } from '@/lib/otp';
import { addEntry, readEntries, RECIPIENTS_KEY } from '@/lib/history';
import Logo from '@/components/tm/Logo';
import AddressPicker from '@/components/tm/AddressPicker';
import { senderAvatar } from '@/components/tm/MailDetail';

const SESSION_KEY = 'tempmail_admin_key';
const DOMAINS = ['sia.kr', 'mail.sia.kr'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type View = 'list' | 'compose' | 'success';

export default function AdminPage() {
    const router = useRouter();
    const [key, setKey] = useState('');
    const [keyInput, setKeyInput] = useState('');
    const [authError, setAuthError] = useState(false);
    const [checking, setChecking] = useState(false);

    const [view, setView] = useState<View>('list');
    const [rows, setRows] = useState<AdminEmailRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Email | null>(null);
    const [selectedLoading, setSelectedLoading] = useState(false);
    const [filter, setFilter] = useState('');

    // 작성 폼
    const [recipients, setRecipients] = useState<string[]>([]);
    const [toInput, setToInput] = useState('');
    const [fromLocalpart, setFromLocalpart] = useState('');
    const [fromDomain, setFromDomain] = useState('sia.kr');
    const [fromName, setFromName] = useState('');
    const [sendSubject, setSendSubject] = useState('');
    const [sendText, setSendText] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sentInfo, setSentInfo] = useState<{ id?: string; to: string; from: string; subject: string } | null>(null);
    const [recentRecipients, setRecentRecipients] = useState<ReturnType<typeof readEntries>>([]);

    const load = useCallback(async (k: string) => {
        setLoading(true);
        try {
            const data = await adminListEmails(k);
            setRows(data);
            setAuthError(false);
            sessionStorage.setItem(SESSION_KEY, k);
            setKey(k);
        } catch (e) {
            if (e instanceof Error && e.message === 'forbidden') {
                setAuthError(true);
                sessionStorage.removeItem(SESSION_KEY);
                setKey('');
            } else {
                console.error(e);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) void load(stored);
        setRecentRecipients(readEntries(RECIPIENTS_KEY));
    }, [load]);

    const handleLogin = () => {
        const k = keyInput.trim();
        if (!k || checking) return;
        setChecking(true);
        void load(k).finally(() => setChecking(false));
    };

    const openDetail = async (row: AdminEmailRow) => {
        setSelectedLoading(true);
        try {
            const full = await adminGetEmail(key, row.id);
            if (full) setSelected(full);
        } finally {
            setSelectedLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminDeleteEmail(key, id);
            setRows(prev => prev.filter(r => r.id !== id));
            if (selected?.id === id) setSelected(null);
        } catch (e) {
            console.error(e);
        }
    };

    /* ===== 작성 폼 로직 ===== */
    const addRecipient = (raw: string) => {
        const addr = raw.trim().toLowerCase().replace(/[,;\s]+$/, '');
        if (!addr || !EMAIL_RE.test(addr) || recipients.includes(addr)) return;
        setRecipients(prev => [...prev, addr]);
        setToInput('');
    };

    const toInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            addRecipient(toInput);
        } else if (e.key === 'Backspace' && !toInput && recipients.length) {
            setRecipients(prev => prev.slice(0, -1));
        }
    };

    const fromAddr = `${fromLocalpart || '…'}@${fromDomain}`;
    const canSend = !!fromLocalpart && recipients.length > 0 && !!sendSubject.trim() && !!sendText.trim() && !sending;

    const doSend = async () => {
        if (!canSend) return;
        setConfirmOpen(false);
        setSending(true);
        setSendError('');
        try {
            // 수신자별 개별 발송 (API는 단일 수신자)
            const results = await Promise.all(recipients.map(to =>
                adminSendEmail(key, {
                    fromLocalpart, fromDomain, fromName: fromName || undefined,
                    to, subject: sendSubject, text: sendText,
                })
            ));
            recipients.forEach(to => addEntry(to, RECIPIENTS_KEY));
            setRecentRecipients(readEntries(RECIPIENTS_KEY));
            setSentInfo({ id: results[0]?.id, to: recipients.join(', '), from: fromAddr, subject: sendSubject });
            setView('success');
            setRecipients([]); setSendSubject(''); setSendText('');
        } catch (e) {
            setSendError(e instanceof Error ? e.message : '발송 실패');
        } finally {
            setSending(false);
        }
    };

    const filtered = rows.filter(r =>
        !filter || r.recipient.includes(filter) || (r.sender || '').includes(filter) || (r.subject || '').includes(filter)
    );
    const publicCount = rows.filter(r => r.box === 'public').length;

    /* ===== 키 게이트 ===== */
    if (!key) {
        return (
            <main className="min-h-[100dvh] bg-tm-bg flex items-center justify-center p-5">
                <div className="tm-card p-7 w-full max-w-md text-center">
                    <img src="/assets/tempmail/cat-mailbox.png" alt="" className="w-[150px] mx-auto -mt-2 pointer-events-none" />
                    <h1 className="text-[19px] font-extrabold text-tm-ink flex items-center justify-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-tm-from" />관리자
                    </h1>
                    <p className="text-[13px] text-tm-muted mt-1.5">관리자 키를 입력하세요</p>
                    <div className="flex gap-2 mt-4">
                        <input
                            type="password"
                            placeholder="관리자 키"
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            className="tm-input flex-1 h-12 px-4 text-[14px]"
                        />
                        <button onClick={handleLogin} disabled={!keyInput || checking} className="tm-btn-gradient h-12 px-5 text-[14px]">
                            {checking ? '확인 중' : '확인'}
                        </button>
                    </div>
                    {authError && <p className="text-[13px] text-[#E15B7B] font-medium mt-3">키가 올바르지 않습니다</p>}
                    <button onClick={() => router.push('/')} className="w-full mt-5 inline-flex items-center justify-center gap-2 text-[13.5px] text-tm-muted hover:text-tm-ink transition-colors">
                        <ArrowLeft className="h-4 w-4" />홈으로 돌아가기
                    </button>
                </div>
            </main>
        );
    }

    /* ===== 발송 완료 ===== */
    if (view === 'success' && sentInfo) {
        return (
            <main className="min-h-[100dvh] bg-tm-bg flex flex-col">
                <header className="flex items-center justify-between h-14 px-4 max-w-6xl w-full mx-auto">
                    <Logo />
                </header>
                <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20 -mt-8">
                    <img src="/assets/tempmail/cat-plane.png" alt="" className="w-[300px] max-w-[80vw] pointer-events-none" />
                    <span className="w-14 h-14 rounded-full bg-[#DFF6E8] flex items-center justify-center -mt-4">
                        <Check className="h-7 w-7 text-[#1FA45B]" strokeWidth={3} />
                    </span>
                    <h1 className="text-[24px] font-extrabold tracking-tight mt-5 text-center">
                        메일 <span className="tm-text-grad">발송 요청이 접수</span>되었어요!
                    </h1>
                    <p className="text-[13.5px] text-tm-muted text-center leading-relaxed mt-2.5 max-w-[300px]">
                        {sentInfo.from} → {sentInfo.to}<br />
                        실제 전달까지는 잠시 시간이 걸릴 수 있어요.
                    </p>
                    <div className="w-full max-w-[340px] mt-8 space-y-2.5">
                        <button
                            onClick={() => setView('compose')}
                            className="tm-btn-gradient w-full h-[52px] inline-flex items-center justify-center gap-2 text-[15.5px]"
                        >
                            새 메일 보내기<ArrowRight className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setView('list')}
                            className="w-full h-[52px] rounded-[14px] border-[1.5px] border-[#D8DEF0] text-tm-ink font-bold text-[15.5px] inline-flex items-center justify-center gap-2 bg-white hover:bg-[#F7F9FF] transition-colors"
                        >
                            받은 메일로 이동<ArrowRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    /* ===== 메일 작성 ===== */
    if (view === 'compose') {
        return (
            <main className="min-h-[100dvh] bg-tm-bg">
                <header className="flex items-center justify-between h-14 px-4 max-w-3xl w-full mx-auto">
                    <Logo />
                    <button onClick={() => setView('list')} aria-label="닫기" className="tm-icon-btn h-10 w-10">
                        <X className="h-6 w-6" />
                    </button>
                </header>
                <div className="max-w-3xl mx-auto px-5 pb-10">
                    <div className="flex items-end justify-between">
                        <div>
                            <h1 className="text-[25px] font-extrabold tracking-tight">
                                새 메일 <span className="tm-text-grad">보내기</span>
                            </h1>
                            <p className="text-[12.5px] text-tm-muted mt-1 leading-relaxed">
                                관리자 전용 발신입니다. 받는 사람과 내용을 입력하세요.
                            </p>
                        </div>
                        <img src="/assets/tempmail/cat-compose.png" alt="" className="w-[110px] -mb-2 pointer-events-none" />
                    </div>

                    {/* 받는 사람 */}
                    <div className="tm-card p-4 mt-3">
                        <label className="flex items-center gap-2 text-[13px] font-bold text-tm-ink mb-2.5">
                            <User className="h-4 w-4 text-tm-from" />받는 사람
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            {recipients.map(addr => {
                                const av = senderAvatar(addr);
                                return (
                                    <span key={addr} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-[#F0EDFE] text-[13px] font-semibold text-[#5B4BB5]">
                                        <span className="w-5 h-5 rounded-full text-[10px] text-white flex items-center justify-center font-bold" style={{ background: av.color }}>{av.initial}</span>
                                        {addr}
                                        <button onClick={() => setRecipients(prev => prev.filter(a => a !== addr))} aria-label="제거" className="hover:text-[#E15B7B]">
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                );
                            })}
                            <input
                                value={toInput}
                                onChange={(e) => setToInput(e.target.value)}
                                onKeyDown={toInputKeyDown}
                                onBlur={() => addRecipient(toInput)}
                                placeholder={recipients.length ? '' : '받는 사람 이메일 입력'}
                                className="flex-1 min-w-[140px] h-9 text-[14px] outline-none bg-transparent placeholder:text-[#B4BCCF]"
                            />
                            <button onClick={() => setPickerOpen(true)} className="tm-btn-soft h-9 px-3 inline-flex items-center gap-1.5 text-[12.5px] shrink-0">
                                <User className="h-3.5 w-3.5" />받는 사람 추가
                            </button>
                        </div>
                        {recentRecipients.length > 0 && (
                            <div className="mt-3">
                                <p className="text-[11.5px] font-bold text-tm-muted mb-1.5">최근 받은 사람</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {recentRecipients.slice(0, 5).map(e => (
                                        <button
                                            key={e.addr}
                                            onClick={() => addRecipient(e.addr)}
                                            disabled={recipients.includes(e.addr)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-tm-border text-[12px] font-medium text-tm-ink hover:bg-[#F4F6FD] disabled:opacity-40"
                                        >
                                            <span className="w-4 h-4 rounded-full text-[9px] text-white flex items-center justify-center font-bold" style={{ background: senderAvatar(e.addr).color }}>
                                                {senderAvatar(e.addr).initial}
                                            </span>
                                            {e.addr}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 발신 주소 */}
                    <div className="tm-card p-4 mt-3">
                        <label className="flex items-center gap-2 text-[13px] font-bold text-tm-ink mb-2.5">
                            <Mail className="h-4 w-4 text-tm-from" />보내는 주소
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                value={fromLocalpart}
                                onChange={(e) => setFromLocalpart(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                                placeholder="로컬파트 (예: notice)"
                                className="tm-input h-11 px-3 text-[14px] flex-1 min-w-[140px]"
                            />
                            <select
                                value={fromDomain}
                                onChange={(e) => setFromDomain(e.target.value)}
                                className="h-11 px-3 bg-[#F4F6FD] rounded-[14px] text-tm-muted text-[13.5px] font-semibold border-0 cursor-pointer"
                            >
                                {DOMAINS.map(d => <option key={d} value={d}>@{d}</option>)}
                            </select>
                            <input
                                value={fromName}
                                onChange={(e) => setFromName(e.target.value)}
                                placeholder="표시 이름 (선택)"
                                className="tm-input h-11 px-3 text-[14px] flex-1 min-w-[120px]"
                            />
                        </div>
                    </div>

                    {/* 제목 */}
                    <div className="tm-card p-4 mt-3">
                        <label className="flex items-center gap-2 text-[13px] font-bold text-tm-ink mb-2.5">
                            <FileText className="h-4 w-4 text-tm-from" />제목
                        </label>
                        <input
                            value={sendSubject}
                            onChange={(e) => setSendSubject(e.target.value)}
                            placeholder="메일 제목을 입력하세요."
                            className="tm-input w-full h-11 px-3 text-[14px]"
                        />
                    </div>

                    {/* 내용 */}
                    <div className="tm-card p-4 mt-3">
                        <label className="flex items-center gap-2 text-[13px] font-bold text-tm-ink mb-2.5">
                            <MailOpen className="h-4 w-4 text-tm-from" />내용
                        </label>
                        <textarea
                            value={sendText}
                            onChange={(e) => setSendText(e.target.value)}
                            placeholder="메일 내용을 입력하세요."
                            rows={7}
                            maxLength={5000}
                            className="tm-input w-full px-3 py-2.5 text-[14px] resize-y leading-relaxed"
                        />
                        <p className="text-right text-[11.5px] text-tm-muted mt-1">{sendText.length.toLocaleString()} / 5,000</p>
                    </div>

                    {sendError && <p className="mt-3 text-[13px] text-[#E15B7B] font-medium">{sendError}</p>}

                    <button
                        onClick={() => setConfirmOpen(true)}
                        disabled={!fromLocalpart || recipients.length === 0 || !sendSubject.trim() || !sendText.trim()}
                        className="tm-btn-gradient w-full h-[54px] mt-5 inline-flex items-center justify-center gap-2 text-[16px]"
                    >
                        <Send className="h-5 w-5" />
                        보내기
                    </button>
                    <p className="text-center text-[11.5px] text-tm-muted mt-2.5">
                        발신은 관리자 전용입니다 — 인증된 @sia.kr 도메인으로만 보낼 수 있어요.
                    </p>
                </div>

                {/* 발송 확인 */}
                {confirmOpen && (
                    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-end lg:items-center justify-center" onClick={() => setConfirmOpen(false)}>
                        <div className="tm-card w-full lg:max-w-md p-6 !rounded-t-[24px] lg:!rounded-[24px]" onClick={e => e.stopPropagation()}>
                            <h2 className="text-[17px] font-extrabold text-tm-ink">이 내용으로 보낼까요?</h2>
                            <div className="mt-4 space-y-2.5 text-[13.5px]">
                                <p><span className="text-tm-muted">보내는 사람</span><br /><strong>{fromName ? `${fromName} <${fromAddr}>` : fromAddr}</strong></p>
                                <p><span className="text-tm-muted">받는 사람</span><br /><strong>{recipients.join(', ')}</strong></p>
                                <p><span className="text-tm-muted">제목</span><br /><strong>{sendSubject}</strong></p>
                            </div>
                            <div className="flex gap-2.5 mt-6">
                                <button onClick={() => setConfirmOpen(false)} className="flex-1 h-12 rounded-[14px] border border-tm-border font-bold text-[14.5px] text-tm-ink hover:bg-[#F7F9FF]">취소</button>
                                <button onClick={doSend} disabled={sending} className="tm-btn-gradient flex-1 h-12 inline-flex items-center justify-center gap-2 text-[14.5px]">
                                    {sending ? '발송 중...' : '발송'}
                                    <Send className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {pickerOpen && (
                    <AddressPicker
                        mode="recipient"
                        onClose={() => setPickerOpen(false)}
                        onSelect={(addr) => addRecipient(addr)}
                    />
                )}
            </main>
        );
    }

    /* ===== 대시보드 (목록) ===== */
    const todayCount = rows.filter(r => Date.now() - new Date(r.created_at).getTime() < 86400000).length;
    return (
        <main className="min-h-[100dvh] bg-tm-bg lg:flex">
            {/* 데스크톱 사이드바 (미션 센터 시안) */}
            <aside className="hidden lg:flex flex-col w-[240px] shrink-0 border-r border-tm-border bg-[var(--tm-card)] min-h-screen sticky top-0">
                <div className="h-16 flex items-center px-5 border-b border-tm-border">
                    <Logo size={30} />
                </div>
                <nav className="flex-1 p-3 space-y-1">
                    <p className="px-3 pt-2 pb-1 text-[11px] font-bold text-tm-muted tracking-wider">메일 센터</p>
                    {[
                        { label: '받은 메일함', icon: MailOpen, active: true, onClick: () => {} },
                        { label: '메일 보내기', icon: Send, active: false, onClick: () => setView('compose') },
                        { label: '새로고침', icon: RefreshCcw, active: false, onClick: () => void load(key) },
                    ].map(({ label, icon: Icon, active, onClick }) => (
                        <button
                            key={label}
                            onClick={onClick}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-colors ${
                                active ? 'bg-[var(--tm-soft)] text-[var(--tm-soft-ink)]' : 'text-tm-muted hover:bg-[#F4F6FD] hover:text-tm-ink'
                            }`}
                        >
                            <Icon className="h-[18px] w-[18px]" />{label}
                        </button>
                    ))}
                    <p className="px-3 pt-4 pb-1 text-[11px] font-bold text-tm-muted tracking-wider">서비스</p>
                    {[
                        { label: '홈으로', icon: ArrowLeft, onClick: () => router.push('/') },
                    ].map(({ label, icon: Icon, onClick }) => (
                        <button
                            key={label}
                            onClick={onClick}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[14px] font-semibold text-tm-muted hover:bg-[#F4F6FD] hover:text-tm-ink transition-colors"
                        >
                            <Icon className="h-[18px] w-[18px]" />{label}
                        </button>
                    ))}
                </nav>
                <div className="p-3">
                    <div className="tm-card !bg-[var(--tm-soft)] !border-0 p-4">
                        <div className="flex items-center gap-2.5">
                            <img src="/assets/tempmail/logo-badge.png" alt="" className="w-9 h-9 rounded-[10px]" />
                            <div className="min-w-0">
                                <p className="text-[13px] font-bold text-tm-ink truncate">관리자</p>
                                <p className="text-[11px] text-tm-muted">인증됨 · 세션 유지</p>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="flex-1 min-w-0 max-w-5xl mx-auto px-5 lg:px-8 pb-24">
                <header className="flex items-center justify-between h-14 lg:h-16">
                    <div className="flex items-center gap-2 lg:hidden">
                        <button onClick={() => router.push('/')} className="tm-icon-btn h-10 w-10" aria-label="홈">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <Logo />
                    </div>
                    <div className="hidden lg:block" />
                    <div className="flex items-center gap-2">
                        <button onClick={() => setView('compose')} className="tm-btn-gradient h-10 px-4 inline-flex items-center gap-1.5 text-[13.5px]">
                            <Send className="h-4 w-4" />메일 보내기
                        </button>
                        <button onClick={() => void load(key)} className="tm-icon-btn h-10 w-10 bg-[var(--tm-card)] border border-tm-border" aria-label="새로고침">
                            <RefreshCcw className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                        </button>
                    </div>
                </header>

                <div className="flex items-end justify-between mt-2">
                    <div>
                        <p className="hidden lg:block text-[11.5px] font-bold tracking-[0.14em] text-tm-from">MAIL MISSION CENTER</p>
                        <h1 className="text-[24px] lg:text-[30px] font-extrabold tracking-tight flex items-center gap-2 lg:mt-0.5">
                            <span className="lg:hidden">관리자 대시보드</span>
                            <span className="hidden lg:inline">메일 미션 센터</span>
                            <ShieldCheck className="h-5 w-5 text-tm-from" />
                        </h1>
                        <p className="text-[12.5px] text-tm-muted mt-1">전체 수신 메일 관리 · 최근 200개</p>
                    </div>
                    <div className="flex items-center gap-3 max-md:hidden">
                        <div className="tm-card px-4 py-2 flex items-center gap-2">
                            <span className="text-[11.5px] text-tm-muted font-semibold">오늘 수신</span>
                            <span className="text-[15px] font-extrabold tm-text-grad">{todayCount}개</span>
                        </div>
                        <img src="/assets/tempmail/cat-mailbox.png" alt="" className="w-[110px] -mb-1 pointer-events-none" />
                    </div>
                </div>

                <div className="flex gap-3 mt-4">
                    <div className="tm-card flex-1 px-4 py-3">
                        <p className="text-[20px] font-extrabold text-tm-ink">{rows.length}</p>
                        <p className="text-[11.5px] text-tm-muted">전체 메일</p>
                    </div>
                    <div className="tm-card flex-1 px-4 py-3">
                        <p className="text-[20px] font-extrabold text-tm-ink">{publicCount}</p>
                        <p className="text-[11.5px] text-tm-muted">공개 수신함</p>
                    </div>
                    <div className="tm-card flex-1 px-4 py-3">
                        <p className="text-[20px] font-extrabold text-tm-ink">{rows.length - publicCount}</p>
                        <p className="text-[11.5px] text-tm-muted">잠금 수신함</p>
                    </div>
                </div>

                <div className="relative mt-4">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 h-[18px] w-[18px] text-tm-muted" />
                    <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="수신자 / 보낸 사람 / 제목 검색"
                        className="tm-input w-full h-11.5 h-[46px] pl-10 pr-3 text-[14px]"
                    />
                </div>

                <div className="tm-card mt-3 overflow-hidden">
                    <div className="hidden lg:grid grid-cols-[52px_1.4fr_2fr_120px_96px] gap-3 px-4 py-2.5 border-b border-tm-border bg-[#F7F9FF] text-[11.5px] font-bold text-tm-muted">
                        <span>구분</span><span>수신함</span><span>보낸 사람 · 제목</span><span>시간</span><span className="text-right">관리</span>
                    </div>
                    {loading ? (
                        <div className="p-12 text-center text-tm-muted">
                            <div className="animate-spin h-8 w-8 border-4 border-tm-from border-t-transparent rounded-full mx-auto mb-4" />
                            불러오는 중...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center">
                            <Mail className="h-14 w-14 text-tm-border mx-auto mb-3" />
                            <p className="text-[14px] text-tm-muted">메일이 없습니다</p>
                        </div>
                    ) : (
                        filtered.map((r) => {
                            const av = senderAvatar(r.recipient);
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => openDetail(r)}
                                    className="tm-mail-item w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-[#F1F4FB] last:border-0"
                                >
                                    <span
                                        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                                        style={{ background: r.box === 'locked' ? '#EEE9FE' : '#F4F6FD' }}
                                    >
                                        {r.box === 'locked'
                                            ? <Lock className="h-4.5 w-4.5 h-[18px] w-[18px] text-tm-from" />
                                            : <MailOpen className="h-4.5 w-4.5 h-[18px] w-[18px] text-tm-muted" />}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate font-bold text-[14px] text-tm-ink">{r.recipient}</span>
                                            {r.box === 'locked' && (
                                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#EEE9FE] text-tm-from whitespace-nowrap">잠금</span>
                                            )}
                                        </span>
                                        <span className="block truncate text-[12.5px] text-tm-muted mt-0.5">
                                            {r.sender} — {r.subject || '(제목 없음)'}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] text-tm-muted">
                                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ko })}
                                        </span>
                                        {r.attachment_count > 0 && <Paperclip className="h-4 w-4 text-tm-muted" />}
                                        {r.keep && <Star className="h-4 w-4 fill-[#FFC93C] text-[#FFC93C]" />}
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), handleDelete(r.id))}
                                            className="tm-icon-btn h-8 w-8"
                                            aria-label="삭제"
                                        >
                                            <Trash2 className="h-4 w-4 text-tm-muted hover:text-[#E15B7B]" />
                                        </span>
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* 상세 모달 */}
            {selected && (
                <div className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-sm flex items-end lg:items-center justify-center lg:p-6" onClick={() => setSelected(null)}>
                    <div
                        className="bg-tm-bg w-full lg:max-w-3xl max-h-[92vh] lg:rounded-tm rounded-t-[24px] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-tm-border bg-white">
                            <h2 className="text-[17px] font-extrabold text-tm-ink">{selected.subject || '(제목 없음)'}</h2>
                            <div className="mt-1.5 text-[12.5px] text-tm-muted space-y-0.5">
                                <p>받는 주소: {selected.recipient}</p>
                                <p>보낸 사람: {selected.sender}</p>
                                <p>받은 시간: {new Date(selected.created_at).toLocaleString('ko-KR')}</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">
                            {(() => {
                                const otp = extractOtp(selected);
                                return otp && (
                                    <div className="mb-4 tm-card !bg-[#DFF6E8] !border-[#B5ECD0] p-3.5 flex items-center gap-2">
                                        <span className="text-[11.5px] font-bold text-[#1FA45B]">인증번호</span>
                                        <span className="font-mono font-extrabold text-[#1FA45B] text-[16px]">{otp}</span>
                                    </div>
                                );
                            })()}
                            <div className="tm-card p-5">
                                <div
                                    className="prose max-w-none text-[14px] leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.body_html || selected.body_text || '') }}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-tm-border bg-white flex justify-between items-center">
                            <span className="text-[11.5px] text-tm-muted flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true, locale: ko })} 수신
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleDelete(selected.id)}
                                    className="h-10 px-4 rounded-xl bg-[#FDE3EC] text-[#E15B7B] font-bold text-[13.5px] hover:bg-[#FBD5E2] transition-colors"
                                >
                                    삭제
                                </button>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="h-10 px-4 rounded-xl bg-[#F4F6FD] text-tm-ink font-bold text-[13.5px] hover:bg-[#EAEFFD] transition-colors"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {selectedLoading && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20">
                    <div className="animate-spin h-8 w-8 border-4 border-tm-from border-t-transparent rounded-full" />
                </div>
            )}
        </main>
    );
}
