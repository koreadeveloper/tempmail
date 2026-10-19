export default function Logo({ size = 32 }: { size?: number }) {
    return (
        <span className="inline-flex items-center gap-2 select-none">
            {/* 시안에서 추출한 실제 로고 배지 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/tempmail/logo-badge.png" alt="" width={size} height={size} className="rounded-[10px]" />
            <span className="font-extrabold text-[19px] tracking-tight text-tm-ink">TempMail</span>
        </span>
    );
}
