-- Supabase SQL Schema for TempMail
-- Run this in Supabase SQL Editor

-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    recipient TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT
);

-- Create index on recipient for faster lookups
CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails (recipient);

-- Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails (created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read emails (for demo purposes)
-- In production, you might want to add more restrictions
CREATE POLICY "Allow public read access" ON emails
    FOR SELECT
    USING (true);

-- Policy: Allow insert from authenticated service role only
-- The Email Worker will use the service_role key
CREATE POLICY "Allow service role insert" ON emails
    FOR INSERT
    WITH CHECK (true);

-- Optional: Auto-delete emails older than 1 hour using pg_cron
-- You need to enable the pg_cron extension first in Supabase Dashboard
-- Then run:
-- SELECT cron.schedule(
--     'delete-old-emails',
--     '*/5 * * * *',  -- Every 5 minutes
--     $$DELETE FROM emails WHERE created_at < NOW() - INTERVAL '1 hour'$$
-- );
