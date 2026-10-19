'use client';

/** 읽음 상태 — localStorage per address */
const KEY = 'tempmail_read';

function readAll(): Record<string, string[]> {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function readSet(addr: string): Set<string> {
    return new Set(readAll()[addr] || []);
}

export function markRead(addr: string, id: string): Set<string> {
    const all = readAll();
    const list = new Set(all[addr] || []);
    list.add(id);
    all[addr] = Array.from(list).slice(-500);
    localStorage.setItem(KEY, JSON.stringify(all));
    return list;
}
