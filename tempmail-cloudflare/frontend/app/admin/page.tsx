'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
    ArrowLeft,
    Clock,
    Lock,
    Mail,
    MailOpen,
    Paperclip,
    Pin,
    RefreshCcw,
    Send,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import { adminDeleteEmail, adminGetEmail, adminListEmails, adminSendEmail, AdminEmailRow, Email } from '@/lib/supabase';
import { extractOtp } from '@/lib/otp';

const SESSION_KEY = 'tempmail_admin_key';

export default function AdminPage() {
    const router = useRouter();
    const [key, setKey] = useState('');
    const [keyInput, setKeyInput] = useState('');
    const [authError, setAuthError] = useState(false);
    const [checking, setChecking] = useState(false);

    const [rows, setRows] = useState<AdminEmailRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Email | null>(null);
    const [selectedLoading, setSelectedLoading] = useState(false);
    const [filter, setFilter] = useState('');

    // 발신 폼
    const [showSend, setShowSend] = useState(false);
    const [fromLocalpart, setFromLocalpart] = useState('');
    const [fromDomain, setFromDomain] = useState('sia.kr');
    const [fromName, setFromName] = useState('');
    const [sendTo, setSendTo] = useState('');
    const [sendSubject, setSendSubject] = useState('');
    const [sendText, setSendText] = useState('');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

    // 세션에 저장된 키로 자동 로그인
    useEffect(() => {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) void load(stored);
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

    const handleSend = async () => {
        if (!fromLocalpart || !sendTo || !sendSubject || !sendText || sending) return;
        setSending(true);
        setSendResult(null);
        try {
            const res = await adminSendEmail(key, {
                fromLocalpart,
                fromDomain,
                fromName: fromName || undefined,
                to: sendTo,
                subject: sendSubject,
                text: sendText,
            });
            setSendResult({ ok: true, msg: `발송 완료 (id: ${res.id ?? '-'})` });
            setSendSubject('');
            setSendText('');
        } catch (e) {
            setSendResult({ ok: false, msg: e instanceof Error ? e.message : '발송 실패' });
        } finally {
            setSending(false);
        }
    };

    const filtered = rows.filter(r =>
        !filter ||
        r.recipient.includes(filter) ||
        (r.sender || '').includes(filter) ||
        (r.subject || '').includes(filter)
    );
    const publicCount = rows.filter(r => r.box === 'public').length;
    const lockedCount = rows.length - publicCount;

    /* ===== 키 게이트 ===== */
    if (!key) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-md">
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center p-4 bg-indigo-100 rounded-2xl mb-4">
                            <ShieldCheck className="h-8 w-8 text-indigo-600" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900">관리자</h1>
                        <p className="text-sm text-gray-500 mt-2">관리자 키를 입력하세요</p>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            placeholder="관리자 키"
                            value={keyInput}
                            onChange={(e) => setKeyInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            className="flex-1 h-12 px-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                            onClick={handleLogin}
                            disabled={!keyInput || checking}
                            className="h-12 px-5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
                        >
                            {checking ? '확인 중...' : '확인'}
                        </button>
                    </div>
                    {authError && (
                        <p className="text-sm text-red-500 mt-3 text-center">키가 올바르지 않습니다</p>
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

    /* ===== 대시보드 ===== */
    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8 pb-24">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <button onClick={() => router.push('/')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                <ArrowLeft className="h-5 w-5 text-gray-600" />
                            </button>
                            <div className="p-3 bg-indigo-100 rounded-xl">
                                <ShieldCheck className="h-6 w-6 text-indigo-600" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">관리자 대시보드</h1>
                                <p className="text-sm text-gray-500">전체 수신 메일 관리</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-700">
                                    전체 {rows.length} · 공개 {publicCount} · 잠금 {lockedCount}
                                </p>
                                <p className="text-xs text-gray-400">최근 200개</p>
                            </div>
                            <button
                                onClick={() => setShowSend(v => !v)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                <Send className="h-4 w-4" />
                                메일 보내기
                            </button>
                            <button
                                onClick={() => void load(key)}
                                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                <RefreshCcw className="h-5 w-5 text-gray-600" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Send panel */}
                {showSend && (
                    <div className="bg-white rounded-2xl shadow-lg border border-indigo-100 p-6 space-y-3">
                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Send className="h-4 w-4 text-indigo-500" />
                            메일 보내기 (@sia.kr 발신)
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                type="text"
                                placeholder="로컬파트 (예: notice)"
                                value={fromLocalpart}
                                onChange={(e) => setFromLocalpart(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                                className="h-11 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                            />
                            <select
                                value={fromDomain}
                                onChange={(e) => setFromDomain(e.target.value)}
                                className="h-11 px-3 bg-gray-100 rounded-lg text-gray-600 border-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="sia.kr">@sia.kr</option>
                                <option value="mail.sia.kr">@mail.sia.kr</option>
                            </select>
                            <input
                                type="text"
                                placeholder="표시 이름 (선택)"
                                value={fromName}
                                onChange={(e) => setFromName(e.target.value)}
                                className="h-11 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-[140px]"
                            />
                        </div>
                        <input
                            type="email"
                            placeholder="받는 사람 (to@example.com)"
                            value={sendTo}
                            onChange={(e) => setSendTo(e.target.value)}
                            className="w-full h-11 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                            type="text"
                            placeholder="제목"
                            value={sendSubject}
                            onChange={(e) => setSendSubject(e.target.value)}
                            className="w-full h-11 px-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <textarea
                            placeholder="본문 (텍스트)"
                            value={sendText}
                            onChange={(e) => setSendText(e.target.value)}
                            rows={5}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                        />
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSend}
                                disabled={!fromLocalpart || !sendTo || !sendSubject || !sendText || sending}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
                            >
                                <Send className="h-4 w-4" />
                                {sending ? '발송 중...' : '발송'}
                            </button>
                            {sendResult && (
                                <p className={`text-sm ${sendResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                                    {sendResult.msg}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Filter */}
                <input
                    type="text"
                    placeholder="수신자 / 보낸 사람 / 제목 검색"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full h-11 px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                {/* Email table */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                            불러오는 중...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Mail className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                            메일이 없습니다
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filtered.map((r) => (
                                <div
                                    key={r.id}
                                    onClick={() => openDetail(r)}
                                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-4"
                                >
                                    <div className={`p-2 rounded-full shrink-0 ${r.box === 'locked' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                                        {r.box === 'locked'
                                            ? <Lock className="h-4 w-4 text-indigo-500" />
                                            : <MailOpen className="h-4 w-4 text-gray-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-gray-900 truncate">{r.recipient}</p>
                                            {r.box === 'locked' && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-600">잠금</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 truncate">
                                            {r.sender} — {r.subject || '(제목 없음)'}
                                        </p>
                                    </div>
                                    <div className="text-right flex items-center gap-2 shrink-0">
                                        <span className="text-xs text-gray-400">
                                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ko })}
                                        </span>
                                        {r.attachment_count > 0 && <Paperclip className="h-4 w-4 text-gray-400" />}
                                        {r.keep && <Pin className="h-4 w-4 text-green-500" />}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
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

            {/* Detail modal */}
            {selected && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">{selected.subject || '(제목 없음)'}</h2>
                            <div className="mt-2 text-sm text-gray-500 space-y-1">
                                <p>받는 주소: {selected.recipient}</p>
                                <p>보낸 사람: {selected.sender}</p>
                                <p>받은 시간: {new Date(selected.created_at).toLocaleString('ko-KR')}</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-6">
                            {(() => {
                                const otp = extractOtp(selected);
                                return otp && (
                                    <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                                        <span className="text-xs font-semibold text-green-600">인증번호</span>
                                        <span className="font-mono font-bold text-green-700">{otp}</span>
                                    </div>
                                );
                            })()}
                            <div
                                className="prose max-w-none"
                                dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(selected.body_html || selected.body_text || '')
                                }}
                            />
                        </div>
                        <div className="p-4 border-t border-gray-100 flex justify-between">
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {selected.keep ? '보관됨 — 자동 삭제 안 됨' : '1시간 후 자동 삭제 대상'}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleDelete(selected.id)}
                                    className="px-4 py-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                                >
                                    삭제
                                </button>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {selectedLoading && (
                <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
                    <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div>
                </div>
            )}
        </main>
    );
}
