import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// These should be set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Lazy client — module import must not throw during prerender when env vars are
// absent (e.g. local builds). The error surfaces only when actually called.
let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
    if (!_client) {
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
        }
        _client = createClient(supabaseUrl, supabaseAnonKey);
    }
    return _client;
}
export const supabase = new Proxy({} as SupabaseClient, {
    get: (_t, prop) => {
        const client = getClient() as unknown as Record<string | symbol, unknown>;
        const value = client[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    },
});
export const SUPABASE_URL = supabaseUrl ?? ''; // exported for building storage URLs

export interface Attachment {
    name: string;
    size: number;
    contentType: string;
    path: string;
}

export interface Email {
    id: string;
    created_at: string;
    recipient: string;
    sender: string;
    subject: string;
    body_text: string;
    body_html: string;
    attachments: Attachment[];
    keep: boolean;
    raw_mime?: string | null;
}

function normalizeAddress(address: string): string {
    return address.trim().toLowerCase();
}

function isLocked(data: unknown): boolean {
    return (
        !!data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        (data as { error?: string }).error === 'locked'
    );
}

/**
 * Fetch emails for an inbox via the get_emails RPC.
 * The RPC returns either an array of email rows or { error: 'locked' }.
 * Throws Error('locked') when the inbox is locked and the secret doesn't match.
 */
export async function getEmails(address: string, secret?: string | null): Promise<Email[]> {
    const p_address = normalizeAddress(address);

    const { data, error } = await supabase.rpc('get_emails', {
        p_address,
        p_secret: secret ?? null,
    });

    if (error) throw error;
    if (data && data.error === 'locked') throw new Error('locked');

    return ((data ?? []) as Email[]).map(row => ({
        ...row,
        attachments: row.attachments ?? [],
    }));
}

/**
 * Delete an email via the delete_email RPC.
 * Throws Error('locked') when the inbox is locked and the secret doesn't match.
 */
export async function deleteEmail(
    id: string,
    address: string,
    secret?: string | null
): Promise<void> {
    const { data, error } = await supabase.rpc('delete_email', {
        p_id: id,
        p_address: normalizeAddress(address),
        p_secret: secret ?? null,
    });

    if (error) throw error;
    if (isLocked(data)) throw new Error('locked');
}

/**
 * Set/clear the keep flag on an email via the set_keep RPC.
 * Throws Error('locked') when the inbox is locked and the secret doesn't match.
 */
export async function setKeep(
    id: string,
    address: string,
    keep: boolean,
    secret?: string | null
): Promise<void> {
    const { data, error } = await supabase.rpc('set_keep', {
        p_id: id,
        p_address: normalizeAddress(address),
        p_keep: keep,
        p_secret: secret ?? null,
    });

    if (error) throw error;
    if (isLocked(data)) throw new Error('locked');
}

/**
 * Reserve an inbox address via the create_inbox RPC.
 * Returns { ok, locked, existing } — `existing` means the address was already
 * reserved; `locked` reports the stored locked state (useful when `existing`).
 */
export async function createInbox(
    address: string,
    secret: string,
    locked: boolean
): Promise<{ ok: boolean; locked: boolean; existing: boolean }> {
    const { data, error } = await supabase.rpc('create_inbox', {
        p_address: normalizeAddress(address),
        p_secret: secret,
        p_locked: locked,
    });

    if (error) throw error;

    return {
        ok: !!data?.ok,
        locked: !!data?.locked,
        existing: !!data?.existing,
    };
}

/**
 * Subscribe to realtime INSERTs on public.emails for a recipient.
 * NOTE: works for PUBLIC inboxes only — locked inboxes aren't in the realtime
 * publication; callers should poll instead.
 */
export function subscribeToEmails(
    address: string,
    onNewEmail: (email: Email) => void
): { unsubscribe(): void } {
    const normalizedAddress = normalizeAddress(address);

    const channel = supabase
        .channel(`emails-${normalizedAddress}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'emails',
                filter: `recipient=eq.${normalizedAddress}`,
            },
            (payload) => {
                const email = payload.new as Email;
                email.attachments = email.attachments ?? [];
                onNewEmail(email);
            }
        )
        .subscribe();

    return {
        unsubscribe() {
            void supabase.removeChannel(channel);
        },
    };
}

/**
 * Build a public Supabase Storage URL for an attachment path.
 * Each /-separated path segment is URI-encoded so spaces/special chars survive.
 */
export function attachmentUrl(path: string): string {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${SUPABASE_URL}/storage/v1/object/public/attachments/${encodedPath}`;
}
