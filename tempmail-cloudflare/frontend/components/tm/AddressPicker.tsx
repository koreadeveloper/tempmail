'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronLeft, Mail, Search, Shuffle, Star } from 'lucide-react';
import { AddrEntry, readEntries, toggleFav, timeAgo, HISTORY_KEY, RECIPIENTS_KEY } from '@/lib/history';

interface Props {
    mode: 'inbox' | 'recipient';
    onClose: () => void;
    onSelect?: (addr: string) => void;  // recipient 모드: 선택 주소 반환
}

/** 받는 사람/주소 선택 — PRIMARY 05 시안 */
export default function AddressPicker({ mode, onClose, onSelect }: Props) {
    const router = useRouter();
    const storageKey = mode === 'recipient' ? RECIPIENTS_KEY : HISTORY_KEY;
    const [entries, setEntries] = useState<AddrEntry[]>([]);
    const [q, setQ] = useState('');
    const [tab, setTab] = useState<'recent' | 'fav'>('recent');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    useEffect(() => {
        setEntries(readEntries(storageKey));
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [storageKey]);

    const filtered = useMemo(() => {
        let list = entries;
        if (tab === 'fav') list = list.filter(e => e.fav);
        if (q) list = list.filter(e => e.addr.toLowerCase().includes(q.toLowerCase()));
        return list;
    }, [entries, tab, q]);

    const favCount = entries.filter(e => e.fav).length;

    const toggleSelect = (addr: string) => {
        setSelected(prev => {
            const n = new Set(prev);
            if (mode === 'recipient') {
                if (n.has(addr)) n.delete(addr); else n.add(addr);
            } else {
                n.clear(); n.add(addr);
            }
            return n;
        });
    };

    const confirm = () => {
        if (selected.size === 0) return;
        if (mode === 'recipient' && onSelect) {
            selected.forEach(a => onSelect(a));
        } else {
            const addr = Array.from(selected)[0];
            const e = entries.find(x => x.addr === addr);
            router.push(`/inbox/${encodeURIComponent(addr)}${e?.key ? `?k=${e.key}` : ''}`);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] bg-tm-bg flex flex-col lg:items-center lg:justify-center lg:bg-black/40" onClick={onClose}>
            <div
                className="flex-1 flex flex-col min-h-0 w-full lg:max-w-md lg:flex-none lg:h-[780px] lg:max-h-[92vh] lg:bg-tm-bg lg:rounded-tm lg:overflow-hidden lg:shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="relative flex items-center justify-center h-14 shrink-0 px-4">
                    <button onClick={onClose} aria-label="뒤로" className="tm-icon-btn absolute left-3 h-10 w-10">
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                    <h1 className="text-[17px] font-bold text-tm-ink">
                        {mode === 'recipient' ? '받는 사람 선택' : '주소 선택'}
                    </h1>
                </header>

                <div className="flex-1 overflow-y-auto min-h-0 px-5 pb-4">
                    <p className="text-center text-[13px] text-tm-muted leading-relaxed mt-1">
                        {mode === 'recipient'
                            ? '메일을 보낼 주소를 선택하거나 직접 입력해보세요.'
                            : '사용할 임시 이메일 주소를 선택하거나 새로 만들어보세요.'}
                    </p>

                    {/* 고양이 + 말풍선 */}
                    <div className="flex items-end justify-center gap-0 mt-2 -mb-1 pointer-events-none">
                        <img src="/assets/tempmail/cat-picker.png" alt="" className="w-[180px] h-auto object-contain" />
                        <div className="relative bg-white border border-tm-border rounded-2xl px-3.5 py-2.5 mb-10 -ml-4 shadow-[0_4px_14px_-4px_rgba(24,37,66,.10)] max-w-[150px]">
                            <p className="text-[11.5px] font-semibold text-tm-ink leading-snug">
                                {mode === 'recipient' ? '받는 사람을 골라주세요!' : '원하는 주소를 선택해서 바로 사용해보세요!'}
                            </p>
                            <span className="absolute -left-1.5 bottom-3 w-3 h-3 bg-white border-l border-b border-tm-border rotate-45" />
                        </div>
                    </div>

                    {/* 검색 + 새로 만들기 */}
                    <div className="flex gap-2 mt-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-tm-muted" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="주소를 검색하세요"
                                className="tm-input w-full h-11 pl-10 pr-3 text-[14px]"
                            />
                        </div>
                        <button
                            onClick={() => { onClose(); router.push('/'); }}
                            className="tm-btn-soft h-11 px-3.5 inline-flex items-center gap-1.5 text-[13px] shrink-0"
                        >
                            <Shuffle className="h-4 w-4" />
                            새로 만들기
                        </button>
                    </div>

                    {/* 탭 */}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => setTab('recent')}
                            className={`tm-chip ${tab === 'recent' ? 'tm-chip-active' : ''}`}
                        >
                            최근 사용 {entries.length}
                        </button>
                        <button
                            onClick={() => setTab('fav')}
                            className={`tm-chip ${tab === 'fav' ? 'tm-chip-active' : ''}`}
                        >
                            즐겨찾기 {favCount}
                        </button>
                    </div>

                    {/* 목록 */}
                    <div className="mt-3 space-y-2">
                        {filtered.length === 0 && (
                            <div className="tm-card p-8 text-center">
                                <Mail className="h-10 w-10 text-tm-border mx-auto mb-2" />
                                <p className="text-[13px] text-tm-muted">
                                    {tab === 'fav' ? '즐겨찾기한 주소가 없어요' : '최근 사용한 주소가 없어요'}
                                </p>
                            </div>
                        )}
                        {filtered.map((e) => {
                            const sel = selected.has(e.addr);
                            return (
                                <div
                                    key={e.addr}
                                    onClick={() => toggleSelect(e.addr)}
                                    className={`tm-card flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all ${
                                        sel ? '!border-tm-from !bg-[#F4F1FF] shadow-[0_4px_14px_-4px_rgba(104,100,248,.25)]' : ''
                                    }`}
                                >
                                    <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                        sel ? 'bg-tm-from border-tm-from' : 'border-[#D5DBEC] bg-white'
                                    }`}>
                                        {sel && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                    </span>
                                    <span className={`p-2 rounded-xl shrink-0 ${sel ? 'bg-white' : 'bg-[#F4F6FD]'}`}>
                                        <Mail className={`h-4.5 w-4.5 h-[18px] w-[18px] ${sel ? 'text-tm-from' : 'text-tm-muted'}`} />
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-bold text-[14px] text-tm-ink truncate">{e.addr}</span>
                                        <span className="block text-[11.5px] text-tm-muted mt-0.5">{timeAgo(e.at) || '최근 사용'}</span>
                                    </span>
                                    <button
                                        onClick={(ev) => {
                                            ev.stopPropagation();
                                            toggleFav(e.addr);
                                            setEntries(readEntries(storageKey));
                                        }}
                                        aria-label="즐겨찾기"
                                        className="tm-icon-btn h-9 w-9 shrink-0"
                                    >
                                        <Star className={`h-[19px] w-[19px] ${e.fav ? 'fill-[#FFC93C] text-[#FFC93C]' : 'text-[#C9D0E2]'}`} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 하단 CTA */}
                <div className="shrink-0 px-5 pt-2 pb-6 tm-safe-bottom bg-gradient-to-t from-tm-bg via-tm-bg to-transparent">
                    <button
                        onClick={confirm}
                        disabled={selected.size === 0}
                        className="tm-btn-gradient w-full h-[54px] inline-flex items-center justify-center gap-2 text-[16px]"
                    >
                        <Check className="h-5 w-5" strokeWidth={2.5} />
                        선택 완료{selected.size > 0 ? ` (${selected.size})` : ''}
                        <ArrowRight className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
