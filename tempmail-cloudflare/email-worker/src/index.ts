/**
 * Cloudflare Email Worker for TempMail
 * 
 * Receives all incoming emails via Cloudflare Email Routing,
 * parses them using postal-mime, and stores in Supabase.
 */

import PostalMime from 'postal-mime';

export interface Env {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
}

export default {
    async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
        console.log(`Received email for: ${message.to}`);
        console.log(`From: ${message.from}`);

        try {
            // Read raw email content
            const rawEmail = await new Response(message.raw).arrayBuffer();

            // Parse email using postal-mime
            const parser = new PostalMime();
            const parsed = await parser.parse(rawEmail);

            // Prepare data for Supabase
            const emailData = {
                recipient: message.to.toLowerCase(),  // Normalize to lowercase
                sender: message.from,
                subject: parsed.subject || '(제목 없음)',
                body_text: parsed.text || '',
                body_html: parsed.html || '',
            };

            console.log(`Parsed email: ${emailData.subject}`);

            // POST to Supabase REST API
            const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/emails`;

            const response = await fetch(supabaseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': env.SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify(emailData),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Supabase insert failed: ${response.status} - ${errorText}`);
                throw new Error(`Supabase error: ${response.status}`);
            }

            console.log(`Email saved successfully for ${message.to}`);

        } catch (error) {
            console.error('Failed to process email:', error);
            // Optionally, forward to a fallback address on error
            // await message.forward("fallback@yourdomain.com");
        }
    },
};
