/**
 * Browser Notification helpers. SSR-safe — all functions no-op when
 * window/Notification is unavailable (server render, unsupported browser).
 */

export function requestNotifyPermission(): void {
    if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'default'
    ) {
        try {
            void Notification.requestPermission();
        } catch {
            // Older browsers may throw synchronously — ignore.
        }
    }
}

export function notifyNewMail(sender: string, subject: string): void {
    if (
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        Notification.permission !== 'granted'
    ) {
        return;
    }

    try {
        new Notification('새 메일 도착', {
            body: `${sender} — ${subject || '(제목 없음)'}`,
        });
    } catch {
        // Some environments (e.g. mobile Chrome) require a ServiceWorkerRegistration
        // and the constructor throws — ignore.
    }
}
