import { createClient } from '@supabase/supabase-js';

// These should be set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definition for email
export interface Email {
    id: string;
    created_at: string;
    recipient: string;
    sender: string;
    subject: string;
    body_text: string;
    body_html: string;
}

/**
 * Fetch emails for a specific recipient address
 * @param recipientAddress - The email address to fetch emails for (e.g., "user@sia.kr")
 */
export async function getEmailsByRecipient(recipientAddress: string): Promise<Email[]> {
    const normalizedAddress = recipientAddress.toLowerCase();

    const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('recipient', normalizedAddress)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching emails:', error);
        throw error;
    }

    return data || [];
}

/**
 * Subscribe to realtime email updates for a specific recipient
 * @param recipientAddress - The email address to watch
 * @param onNewEmail - Callback function when new email arrives
 */
export function subscribeToEmails(
    recipientAddress: string,
    onNewEmail: (email: Email) => void
) {
    const normalizedAddress = recipientAddress.toLowerCase();

    const subscription = supabase
        .channel('emails-channel')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'emails',
                filter: `recipient=eq.${normalizedAddress}`,
            },
            (payload) => {
                console.log('New email received:', payload.new);
                onNewEmail(payload.new as Email);
            }
        )
        .subscribe();

    return subscription;
}

/**
 * Delete an email by ID
 * @param emailId - The UUID of the email to delete
 */
export async function deleteEmail(emailId: string): Promise<void> {
    const { error } = await supabase
        .from('emails')
        .delete()
        .eq('id', emailId);

    if (error) {
        console.error('Error deleting email:', error);
        throw error;
    }
}
