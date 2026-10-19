'use client';

import { useState } from 'react';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
    Check, ChevronLeft, Copy, Download, FileText, Forward,
    MoreHorizontal, Paperclip, Pin, Reply, Star, Trash2,
} from 'lucide-react';
import { attachmentUrl, Email } from '@/lib/supabase';
import { extractOtp } from '@/lib/otp';
import Logo from './Logo';

const AVATAR_HUES = ['#8560F7', '#4F7CF7', '#F46B8C', '#F59E0B', '#22B8A6', '#E15B7B'];

export function senderAvatar(sender: string) {
    const name = sender.replace(/<.*>/, '').trim() || sender;
    const initial = (name[0] || '?').toUpperCase();
    const color = AVATAR_HUES[(name.charCodeAt(0) || 0) % AVATAR_HUES.length];
    return { name, initial, color };
}

interface Props {
    email: Email;
    address: string;
    onClose?: () => void;
    onToggleKeep: (e: Email) => void;
    onDelete: (id: string) => void;
    onForward: (e: Email) => void;
    pane?: boolean;   // 데스크톱 3단 중앙 패널 모드
}

export default function MailDetail({ email, address, onClose, onToggleKeep, onDelete, onForward, pane }: Props) {
    const [otpCopied, setOtpCopied] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const otp = extractOtp(email);
    const av = senderAvatar(email.sender);

    const copyOtp = async () => {
        if (!otp) return;
        await navigator.clipboard.writeText(otp);
        setOtpCopied(true);
        setTimeout(() => setOtpCopied(false), 2000);
    };

    const downloadEml = () => {
        if (!email.raw_mime) return;
        const blob = new Blob([email.raw_mime], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${email.subject || 'mail'}.eml`; a.click();
        URL.revokeObjectURL(url);
    };

    const replyMailto = () => {
        const to = email.sender.match(/<(.+)>/)?.[1] || email.sender;
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Re: ${email.subject || ''}`)}`;
    };

    return (
        <div className={`flex flex-col min-h-0 bg-tm-bg ${pane ? 'h-full' : 'fixed inset-0 z-[60]'}`}>
            {/* Header */}
            <header className="relative flex items-center justify-between h-14 px-3 shrink-0 bg-tm-bg">
                {pane ? (
                    <Logo size={30} />
                ) : (
                    <>
                        <button onClick={onClose} aria-label="뒤로" className="tm-icon-btn h-10 w-10">
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                        <span className="absolute left-1/2 -translate-x-1/2"><Logo size={30} /></span>
                    </>
                )}
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => onToggleKeep(email)}
                        aria-label="보관"
                        className="tm-icon-btn h-10 w-10"
                    >
                        <Star className={`h-5 w-5 ${email.keep ? 'fill-[#FFC93C] text-[#FFC93C]' : 'text-tm-muted'}`} />
                    </button>
                    <button onClick={() => onDelete(email.id)} aria-label="삭제" className="tm-icon-btn h-10 w-10">
                        <Trash2 className="h-5 w-5 text-tm-muted" />
                    </button>
                    <div className="relative">
                        <button onClick={() => setMoreOpen(v => !v)} aria-label="더보기" className="tm-icon-btn h-10 w-10">
                            <MoreHorizontal className="h-5 w-5 text-tm-muted" />
                        </button>
                        {moreOpen && (
                            <div className="absolute right-0 top-11 tm-card p-1.5 w-44 z-50 shadow-lg" onMouseLeave={() => setMoreOpen(false)}>
                                {email.raw_mime ? (
                                    <>
                                        <button onClick={() => { setShowRaw(v => !v); setMoreOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13.5px] font-medium hover:bg-[#F4F6FD]">
                                            <FileText className="h-4 w-4 text-tm-muted" />{showRaw ? '본문 보기' : '원본 보기'}
                                        </button>
                                        <button onClick={() => { downloadEml(); setMoreOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13.5px] font-medium hover:bg-[#F4F6FD]">
                                            <Download className="h-4 w-4 text-tm-muted" />EML 다운로드
                                        </button>
                                    </>
                                ) : (
                                    <p className="px-3 py-2.5 text-[12.5px] text-tm-muted">추가 작업 없음</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-4">
                {/* 발신 카드 */}
                <div className="tm-card p-4 flex items-start gap-3">
                    <span
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-[18px] shrink-0"
                        style={{ background: av.color }}
                    >
                        {av.initial}
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] text-tm-ink truncate">{av.name}</p>
                        <p className="text-[12px] text-tm-muted truncate">{email.sender}</p>
                        <p className="text-[12px] text-tm-muted mt-0.5 truncate">받는 사람 <span className="text-[#4F7CF7] font-medium">{address}</span></p>
                    </div>
                    <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#DFF6E8] text-[#1FA45B] text-[11px] font-bold">
                            <Check className="h-3 w-3" strokeWidth={3} />받은 메일
                        </span>
                        <p className="text-[11px] text-tm-muted mt-1.5">
                            {formatDistanceToNow(new Date(email.created_at), { addSuffix: true, locale: ko })}
                        </p>
                    </div>
                </div>

                {/* 제목 */}
                <h2 className="text-[20px] font-extrabold text-tm-ink leading-snug mt-4 mb-3 px-1">
                    {email.subject || '(제목 없음)'}
                </h2>

                {/* OTP 카드 (인증번호 감지 시) */}
                {otp && (
                    <div className="tm-card relative overflow-visible p-4 mb-3">
                        <img src="/assets/tempmail/cat-peek.png" alt="" className="absolute -top-12 right-2 w-[88px] pointer-events-none" />
                        <p className="text-[12.5px] font-bold text-tm-muted">이메일 인증 코드</p>
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                            {otp.split('').map((ch, i) => (
                                <span key={i} className="w-9 h-11 rounded-xl bg-[#F4F6FD] border border-tm-border flex items-center justify-center text-[20px] font-extrabold text-tm-ink">
                                    {ch}
                                </span>
                            ))}
                            <button
                                onClick={copyOtp}
                                className="tm-btn-gradient h-10 px-4 ml-1.5 inline-flex items-center gap-1.5 text-[13.5px] !rounded-xl"
                            >
                                {otpCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {otpCopied ? '복사됨' : '복사하기'}
                            </button>
                        </div>
                        <p className="mt-3 text-[11.5px] text-[#B8860B] bg-[#FFF8E1] rounded-lg px-3 py-2 font-medium">
                            이 인증 코드는 보안을 위해 일정 시간이 지나면 만료됩니다.
                        </p>
                    </div>
                )}

                {/* 본문 카드 */}
                <div className="tm-card p-5">
                    {showRaw && email.raw_mime ? (
                        <pre className="text-[11.5px] bg-[#F7F9FF] rounded-xl p-3.5 overflow-auto whitespace-pre-wrap break-all font-mono text-tm-muted max-h-[50vh]">
                            {email.raw_mime}
                        </pre>
                    ) : email.body_html ? (
                        <div
                            className="prose max-w-none text-[14px] leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body_html) }}
                        />
                    ) : (
                        <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-tm-ink">{email.body_text}</p>
                    )}
                </div>

                {/* 첨부파일 */}
                {email.attachments && email.attachments.length > 0 && (
                    <div className="tm-card p-4 mt-3">
                        <p className="text-[12.5px] font-bold text-tm-muted mb-2.5">첨부파일 {email.attachments.length}개</p>
                        <div className="flex flex-wrap gap-2">
                            {email.attachments.map((a) => (
                                <a
                                    key={a.path}
                                    href={attachmentUrl(a.path)}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F4F6FD] hover:bg-[#EAEFFD] rounded-xl text-[13px] font-medium text-tm-ink transition-colors"
                                >
                                    <Paperclip className="h-3.5 w-3.5 text-tm-muted" />
                                    {a.name} · {Math.ceil(a.size / 1024)}KB
                                </a>
                            ))}
                        </div>
                    </div>
                )}
                <div className="h-2" />
            </div>

            {/* 하단 액션 바 */}
            <div className="shrink-0 px-4 pt-2 pb-5 tm-safe-bottom bg-tm-bg border-t border-tm-border/60">
                <div className="flex gap-2.5">
                    <button
                        onClick={replyMailto}
                        className="flex-1 h-12 rounded-[14px] border-[1.5px] border-[#B9A8F5] text-[#7B5CE8] font-bold text-[14.5px] inline-flex items-center justify-center gap-2 bg-white hover:bg-[#F8F5FF] transition-colors"
                    >
                        <Reply className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                        답장
                    </button>
                    <button
                        onClick={() => onForward(email)}
                        className="flex-1 h-12 rounded-[14px] border-[1.5px] border-[#B9A8F5] text-[#7B5CE8] font-bold text-[14.5px] inline-flex items-center justify-center gap-2 bg-white hover:bg-[#F8F5FF] transition-colors"
                    >
                        <Forward className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                        전달
                    </button>
                    <button
                        onClick={() => onToggleKeep(email)}
                        className="flex-1 h-12 rounded-[14px] bg-[#F0EDFE] text-[#6A5AE0] font-bold text-[14.5px] inline-flex items-center justify-center gap-2 hover:bg-[#E6E0FD] transition-colors"
                    >
                        <Pin className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                        {email.keep ? '보관 해제' : '임시 저장'}
                    </button>
                </div>
            </div>
        </div>
    );
}
