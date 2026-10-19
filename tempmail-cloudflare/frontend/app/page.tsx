'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight, ChevronRight, Clock, HelpCircle, Lock, Menu, Mail,
    ShieldCheck, Shuffle, Trash2, User, Zap,
} from 'lucide-react';
import { createInbox } from '@/lib/supabase';
import { addEntry, readEntries, timeAgo } from '@/lib/history';
import Logo from '@/components/tm/Logo';
import AddressPicker from '@/components/tm/AddressPicker';
import ThemeToggle from '@/components/tm/ThemeToggle';

const DOMAINS = ['sia.kr', 'mail.sia.kr'];
// 헷갈리는 문자 제외: l(소문자L) i 1 o 0
const RANDOM_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

const FEATURES = [
    { icon: Zap, color: '#F59E0B', bg: '#FEF3D8', title: '몇 초 만에 생성', desc: '지금 바로 사용 가능' },
    { icon: ShieldCheck, color: '#4F7CF7', bg: '#E4EDFE', title: '개인정보 보호', desc: '회원가입 없이 안전하게' },
    { icon: Trash2, color: '#F46B8C', bg: '#FDE3EC', title: '자동 삭제', desc: '1시간 후 자동 삭제' },
    { icon: Mail, color: '#8560F7', bg: '#EEE9FE', title: '다양한 서비스에 활용', desc: '회원가입 · 이벤트 · 테스트' },
];

export default function Home() {
    const [username, setUsername] = useState('');
    const [domain, setDomain] = useState(DOMAINS[0]);
    const [locked, setLocked] = useState(false);
    const [history, setHistory] = useState<ReturnType<typeof readEntries>>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tipOpen, setTipOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    useEffect(() => {
        const read = () => setHistory(readEntries());
        read();
        window.addEventListener('history-updated', read);
        return () => window.removeEventListener('history-updated', read);
    }, []);

    const handleCreate = async () => {
        const id = username.trim().toLowerCase();
        if (!id || creating) return;
        setCreating(true);
        setError('');
        const fullEmail = `${id}@${domain}`;
        const secret = crypto.randomUUID();
        try {
            const res = await createInbox(fullEmail, secret, locked);
            if (res.existing && res.locked === true && !locked) {
                setError('이 주소는 비공개 수신함으로 사용 중입니다 — 비밀 링크가 필요해요');
                setCreating(false);
                return;
            }
        } catch (e) {
            console.error('createInbox failed:', e); // 생성 실패해도 진입은 허용 (공개함은 예약 불필요)
        }
        const entry = locked ? `${fullEmail}?k=${secret}` : fullEmail;
        addEntry(entry);
        router.push(`/inbox/${encodeURIComponent(fullEmail)}${locked ? `?k=${secret}` : ''}`);
    };

    const handleRandom = () => {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        setUsername(Array.from(bytes, b => RANDOM_CHARS[b % RANDOM_CHARS.length]).join(''));
        setError('');
    };

    const openEntry = (addr: string, key?: string) => {
        router.push(`/inbox/${encodeURIComponent(addr)}${key ? `?k=${key}` : ''}`);
    };

    const createCard = (
        <div className="w-full">
            {/* 아이디 + 도메인 — 하나의 필드 안에 */}
            <div className="tm-input flex items-center h-[54px] rounded-[16px] overflow-hidden focus-within:border-[#8560F7] focus-within:shadow-[0_0_0_3px_rgba(133,96,247,.12)]">
                <User className="ml-4 h-[18px] w-[18px] text-tm-muted shrink-0" />
                <input
                    type="text"
                    placeholder="원하는 아이디를 입력하세요"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value.replace(/[^a-zA-Z0-9.-]/g, '')); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    className="flex-1 min-w-0 h-full px-3 bg-transparent outline-none text-[15px] text-tm-ink placeholder:text-[#B4BCCF]"
                    autoComplete="off"
                    autoCapitalize="none"
                />
                <span className="w-px h-7 bg-tm-border shrink-0" aria-hidden />
                <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="h-full pl-2.5 pr-3 bg-transparent text-[14px] font-semibold text-tm-ink outline-none cursor-pointer shrink-0"
                    aria-label="도메인"
                >
                    {DOMAINS.map(d => <option key={d} value={d}>@{d}</option>)}
                </select>
            </div>

            {/* 비공개 체크 */}
            <label className="flex items-center gap-2 cursor-pointer select-none mt-4 px-0.5">
                <input
                    type="checkbox"
                    checked={locked}
                    onChange={(e) => setLocked(e.target.checked)}
                    className="h-[18px] w-[18px] rounded accent-[#8560F7]"
                />
                <span className="text-[13.5px] text-tm-ink font-medium">비공개 수신함 (비밀번호로 열람)</span>
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setTipOpen(v => !v); }}
                    aria-label="비공개 수신함 설명"
                    className="tm-icon-btn h-5 w-5 -ml-0.5"
                >
                    <HelpCircle className="h-4 w-4 text-tm-muted" />
                </button>
            </label>
            {tipOpen && (
                <p className="mt-2 text-[12px] text-tm-muted leading-relaxed bg-[#F7F9FF] rounded-xl p-3">
                    생성 시 비밀키가 자동 발급되어 링크에 포함됩니다. 링크를 저장해두세요 — 24시간 후 잠금이 자동 해제됩니다.
                </p>
            )}

            {error && <p className="mt-3 text-[13px] text-[#E15B7B] font-medium">{error}</p>}

            {/* 생성 CTA */}
            <button
                onClick={handleCreate}
                disabled={!username.trim() || creating}
                className="tm-btn-gradient w-full h-[54px] mt-4 inline-flex items-center justify-center gap-2 text-[16px]"
            >
                <Mail className="h-[18px] w-[18px]" />
                {creating ? '생성 중...' : '이메일 생성하기'}
                <ArrowRight className="h-5 w-5" />
            </button>

            {/* 랜덤 */}
            <button
                onClick={handleRandom}
                className="tm-btn-soft w-full h-[50px] mt-2.5 inline-flex items-center justify-center gap-2 text-[14.5px]"
            >
                <Shuffle className="h-4 w-4" />
                랜덤 아이디 생성
            </button>
        </div>
    );

    const featureRow = (
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5 w-full">
            {FEATURES.slice(0, 3).map(({ icon: Icon, color, bg, title, desc }) => (
                <div key={title} className="tm-card px-3 py-4 flex flex-col items-center text-center lg:hidden">
                    <span className="p-2 rounded-xl mb-2" style={{ background: bg }}>
                        <Icon className="h-5 w-5" style={{ color }} />
                    </span>
                    <p className="text-[12.5px] font-bold text-tm-ink leading-tight">{title}</p>
                    <p className="text-[10.5px] text-tm-muted mt-1 leading-tight">{desc}</p>
                </div>
            ))}
            {FEATURES.map(({ icon: Icon, color, bg, title, desc }) => (
                <div key={title + '-d'} className="tm-card px-4 py-5 hidden lg:flex items-center gap-3.5">
                    <span className="p-2.5 rounded-xl shrink-0" style={{ background: bg }}>
                        <Icon className="h-6 w-6" style={{ color }} />
                    </span>
                    <span>
                        <p className="text-[15px] font-bold text-tm-ink">{title}</p>
                        <p className="text-[12.5px] text-tm-muted mt-0.5">{desc}</p>
                    </span>
                </div>
            ))}
        </div>
    );

    const recentList = (
        <div className="w-full mt-7">
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-tm-ink">
                    <Clock className="h-4 w-4 text-tm-muted" />
                    최근 사용한 이메일
                </h3>
                {history.length > 0 && (
                    <button
                        onClick={() => setPickerOpen(true)}
                        className="text-[13px] font-semibold text-tm-from inline-flex items-center gap-0.5"
                    >
                        전체 보기
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            {history.length === 0 ? (
                <div className="tm-card p-6 text-center text-[13px] text-tm-muted">
                    아직 사용한 주소가 없어요 — 위에서 바로 만들어보세요
                </div>
            ) : (
                <div className="space-y-2">
                    {history.slice(0, 4).map(e => (
                        <button
                            key={e.addr}
                            onClick={() => openEntry(e.addr, e.key)}
                            className="tm-card w-full flex items-center gap-3 px-4 py-3.5 text-left hover:shadow-[0_4px_16px_-4px_rgba(24,37,66,.10)] transition-shadow"
                        >
                            <span className="p-2 bg-[#F4F6FD] rounded-xl shrink-0">
                                <Mail className="h-4 w-4 text-tm-muted" />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5 font-semibold text-[14px] text-tm-ink truncate">
                                    {e.addr}
                                    {e.key && <Lock className="h-3.5 w-3.5 text-tm-from shrink-0" />}
                                </span>
                                <span className="block text-[11.5px] text-tm-muted mt-0.5">{timeAgo(e.at)}</span>
                            </span>
                            <ChevronRight className="h-4.5 w-4.5 h-[18px] w-[18px] text-tm-muted shrink-0" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <main className="min-h-[100dvh] bg-tm-bg">
            {/* ===== 모바일 ===== */}
            <div className="lg:hidden pb-28">
                <header className="flex items-center justify-between h-14 px-4">
                    <Logo size={34} />
                    <div className="flex items-center gap-1 relative">
                        <ThemeToggle />
                        <button onClick={() => setMenuOpen(v => !v)} aria-label="메뉴" className="tm-icon-btn h-10 w-10">
                            <Menu className="h-5.5 w-5.5 h-[22px] w-[22px]" />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-11 tm-card p-1.5 w-40 z-50 shadow-lg" onMouseLeave={() => setMenuOpen(false)}>
                                <button onClick={() => router.push('/')} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">홈</button>
                                <button onClick={() => setPickerOpen(true)} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">주소 선택</button>
                                <button onClick={() => router.push('/admin')} className="w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[#F4F6FD]">관리자</button>
                            </div>
                        )}
                    </div>
                </header>

                <div className="px-5">
                    <img
                        src="/assets/tempmail/cat-hero.png"
                        alt="편지를 든 고양이"
                        className="w-[340px] max-w-[88vw] mx-auto -mt-1 -mb-3 pointer-events-none"
                    />
                    <h1 className="text-center text-[26px] font-extrabold leading-[1.3] tracking-tight mt-1">
                        회원가입 없이 바로 쓰는<br />
                        <span className="tm-text-grad">1회용 메일</span>
                    </h1>
                    <p className="text-center text-[13.5px] text-tm-muted leading-relaxed mt-2.5 mb-5">
                        복잡한 절차 없이 지금 바로 시작하세요.<br />
                        일회용 이메일로 간편하게 메일을 받아보세요.
                    </p>
                    {createCard}
                    <div className="mt-5">{featureRow}</div>
                    {recentList}
                    <p className="text-center text-[12px] text-tm-muted mt-8">
                        수신된 이메일은 1시간 후 자동 삭제됩니다
                    </p>
                </div>
            </div>

            {/* ===== 데스크톱 ===== */}
            <div className="hidden lg:block">
                <header className="flex items-center justify-between h-16 px-8 max-w-6xl mx-auto">
                    <Logo />
                    <nav className="flex items-center gap-1 text-[14px] font-semibold">
                        <button onClick={() => router.push('/')} className="px-4 py-2 rounded-xl text-tm-ink bg-[var(--tm-soft)]">홈</button>
                        <button onClick={() => setPickerOpen(true)} className="px-4 py-2 rounded-xl text-tm-muted hover:bg-[#F4F6FD]">받은 메일</button>
                        <button onClick={() => router.push('/admin')} className="px-4 py-2 rounded-xl text-tm-muted hover:bg-[#F4F6FD]">관리자</button>
                        <ThemeToggle />
                    </nav>
                </header>

                <div className="max-w-6xl mx-auto px-8">
                    {/* 히어로 3단 */}
                    <div className="grid grid-cols-[1fr_minmax(380px,460px)_1fr] gap-6 items-center pt-8">
                        <img src="/assets/tempmail/cat-hero-desktop.png" alt="" className="w-full max-w-[340px] justify-self-end pointer-events-none" />
                        <div className="text-center">
                            <h1 className="text-[38px] font-extrabold leading-[1.25] tracking-tight">
                                회원가입 없이 바로 쓰는<br />
                                <span className="tm-text-grad">1회용 메일</span>
                            </h1>
                            <p className="text-[15px] text-tm-muted leading-relaxed mt-3 mb-6">
                                복잡한 절차 없이 지금 바로 시작하세요.<br />
                                일회용 이메일로 간편하게 메일을 받아보세요.
                            </p>
                            <div className="tm-card p-6 text-left">{createCard}</div>
                        </div>
                        <img src="/assets/tempmail/mailbox-desktop.png" alt="" className="w-full max-w-[340px] pointer-events-none" />
                    </div>

                    <div className="mt-10">{featureRow}</div>

                    <div className="grid grid-cols-2 gap-5 mt-8 mb-14">
                        {recentList}
                        <div className="tm-card p-6 mt-7">
                            <h3 className="text-[15px] font-bold text-tm-ink mb-4 flex items-center gap-2">
                                <Zap className="h-4.5 w-4.5 h-[18px] w-[18px] text-[#F59E0B]" />
                                빠른 사용 팁
                            </h3>
                            <ul className="space-y-3 text-[13.5px] text-tm-muted leading-relaxed">
                                <li className="flex gap-2"><span className="text-tm-from font-bold">1</span>원하는 아이디나 랜덤 주소로 즉시 수신함을 만드세요.</li>
                                <li className="flex gap-2"><span className="text-tm-from font-bold">2</span>비공개 수신함은 비밀 링크로만 열립니다 — 링크를 저장하세요.</li>
                                <li className="flex gap-2"><span className="text-tm-from font-bold">3</span>인증번호는 자동으로 추출돼 한 번에 복사됩니다.</li>
                                <li className="flex gap-2"><span className="text-tm-from font-bold">4</span>보관함 표시한 메일은 자동 삭제되지 않습니다.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {pickerOpen && <AddressPicker mode="inbox" onClose={() => setPickerOpen(false)} />}
        </main>
    );
}
