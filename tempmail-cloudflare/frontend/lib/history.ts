'use client';

/** 최근 사용 주소/수신자 + 즐겨찾기 — localStorage 기반 (기존 tempmail_history 호환) */

export interface AddrEntry {
    addr: string;      // full email (without ?k=)
    key?: string;      // locked inbox secret
    at: number;        // last used epoch ms
    fav: boolean;
}

export const HISTORY_KEY = 'tempmail_history';
const META_KEY = 'tempmail_history_meta';
const FAV_KEY = 'tempmail_favs';
export const RECIPIENTS_KEY = 'tempmail_recipients';

function readJSON<T>(k: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return fallback; }
}

export function readFavs(): string[] {
    return readJSON<string[]>(FAV_KEY, []);
}

export function toggleFav(addr: string): boolean {
    const favs = readFavs();
    const i = favs.indexOf(addr);
    if (i >= 0) favs.splice(i, 1); else favs.push(addr);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    window.dispatchEvent(new Event('history-updated'));
    return i < 0;
}

/** storageKey: 'tempmail_history' (inbox) or 'tempmail_recipients' (sent-to) */
export function readEntries(storageKey: string = HISTORY_KEY): AddrEntry[] {
    if (typeof window === 'undefined') return [];
    const raw = readJSON<(string | { addr: string; key?: string; at?: number })[]>(storageKey, []);
    const meta = readJSON<Record<string, number>>(META_KEY, {});
    const favs = new Set(readFavs());
    const seen = new Set<string>();
    const out: AddrEntry[] = [];
    for (const e of raw) {
        const s = typeof e === 'string' ? e : e.addr + (e.key ? `?k=${e.key}` : '');
        const [addr, key] = s.split('?k=');
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        out.push({ addr, key, at: (typeof e === 'object' && e.at) || meta[addr] || 0, fav: favs.has(addr) });
    }
    return out;
}

export function addEntry(addrWithKey: string, storageKey: string = HISTORY_KEY) {
    const [addr, key] = addrWithKey.split('?k=');
    const entries = readEntries(storageKey).filter(e => e.addr !== addr);
    entries.unshift({ addr, key, at: Date.now(), fav: entries.find(e => e.addr === addr)?.fav ?? false });
    const trimmed = entries.slice(0, 12);
    // 원본 형식(문자열 배열) 유지 — 기존 코드/버전과 호환
    localStorage.setItem(storageKey, JSON.stringify(trimmed.map(e => e.addr + (e.key ? `?k=${e.key}` : ''))));
    const meta = readJSON<Record<string, number>>(META_KEY, {});
    meta[addr] = Date.now();
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    window.dispatchEvent(new Event('history-updated'));
}

export function timeAgo(at: number): string {
    if (!at) return '';
    const m = Math.floor((Date.now() - at) / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return `약 ${m}분 전 사용`;
    const h = Math.floor(m / 60);
    if (h < 24) return `약 ${h}시간 전 사용`;
    return `약 ${Math.floor(h / 24)}일 전 사용`;
}
