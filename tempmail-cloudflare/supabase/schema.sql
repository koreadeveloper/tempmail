-- Supabase SQL Schema for TempMail
-- Run this in Supabase SQL Editor

-- Create emails table (public inboxes)
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    recipient TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    attachments JSONB NOT NULL DEFAULT '[]',
    keep BOOLEAN NOT NULL DEFAULT false,
    raw_mime TEXT
);

-- Create index on recipient for faster lookups
CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails (recipient);

-- Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails (created_at DESC);

-- Locked inboxes land here — no public policies, RPC-only access
CREATE TABLE IF NOT EXISTS emails_locked (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    recipient TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    attachments JSONB NOT NULL DEFAULT '[]',
    keep BOOLEAN NOT NULL DEFAULT false,
    raw_mime TEXT
);
CREATE INDEX IF NOT EXISTS idx_emails_locked_recipient ON emails_locked (recipient);
CREATE INDEX IF NOT EXISTS idx_emails_locked_created_at ON emails_locked (created_at DESC);
ALTER TABLE emails_locked ENABLE ROW LEVEL SECURITY;

-- Per-inbox lock keys (created at address generation; no public access)
-- expires_at: 잠금 TTL — 생성 후 24시간. NULL = 만료 없음(공개 수신함은 항상 NULL)
CREATE TABLE IF NOT EXISTS inbox_keys (
    address TEXT PRIMARY KEY,
    secret TEXT NOT NULL,
    locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);
ALTER TABLE inbox_keys ENABLE ROW LEVEL SECURITY;

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

-- Policy: Allow anyone to delete emails (temp mailbox semantics - no auth)
CREATE POLICY "Allow public delete access" ON emails
    FOR DELETE
    USING (true);

-- Policy: Allow anyone to update (keep toggle) — public inbox semantics
CREATE POLICY "Allow public update" ON emails
    FOR UPDATE
    USING (true);

-- Attachments bucket (public read, 5MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', true, 5242880)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Allow public read attachments" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'attachments');

-- RPC: claim an inbox (first-come; locked=true → secret required to read)
-- 잠금 TTL 24시간. 만료된 잠금 주소는 재점유 가능.
CREATE OR REPLACE FUNCTION create_inbox(p_address text, p_secret text, p_locked boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM inbox_keys WHERE address = lower(p_address);
  IF FOUND THEN
    IF r.locked AND (r.expires_at IS NULL OR r.expires_at > now()) THEN
      RETURN json_build_object('ok', true, 'locked', true, 'existing', true);
    ELSIF r.locked THEN
      -- 만료된 잠금 → 새 파라미터로 재점유
      UPDATE inbox_keys
         SET secret = p_secret,
             locked = p_locked,
             expires_at = CASE WHEN p_locked THEN now() + interval '24 hours' ELSE NULL END
       WHERE address = lower(p_address);
      RETURN json_build_object('ok', true, 'locked', p_locked, 'existing', false);
    END IF;
    RETURN json_build_object('ok', true, 'locked', false, 'existing', true);
  END IF;
  INSERT INTO inbox_keys(address, secret, locked, expires_at)
  VALUES (lower(p_address), p_secret, p_locked,
          CASE WHEN p_locked THEN now() + interval '24 hours' ELSE NULL END);
  RETURN json_build_object('ok', true, 'locked', p_locked, 'existing', false);
END $$;

-- RPC: fetch emails — locked inbox requires matching secret, reads emails_locked
-- 잠금이 만료(expires_at 경과)되면 공개 수신함으로 취급
CREATE OR REPLACE FUNCTION get_emails(p_address text, p_secret text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; eff_locked boolean;
BEGIN
  SELECT * INTO r FROM inbox_keys WHERE address = lower(p_address);
  eff_locked := FOUND AND r.locked AND (r.expires_at IS NULL OR r.expires_at > now());
  IF eff_locked THEN
    IF p_secret IS NULL OR p_secret <> r.secret THEN RETURN json_build_object('error','locked'); END IF;
    RETURN (SELECT coalesce(json_agg(row_to_json(e) ORDER BY e.created_at DESC),'[]'::json) FROM emails_locked e WHERE e.recipient = lower(p_address));
  END IF;
  RETURN (SELECT coalesce(json_agg(row_to_json(e) ORDER BY e.created_at DESC),'[]'::json) FROM emails e WHERE e.recipient = lower(p_address));
END $$;

CREATE OR REPLACE FUNCTION delete_email(p_id uuid, p_address text, p_secret text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; eff_locked boolean;
BEGIN
  SELECT * INTO r FROM inbox_keys WHERE address = lower(p_address);
  eff_locked := FOUND AND r.locked AND (r.expires_at IS NULL OR r.expires_at > now());
  IF eff_locked AND (p_secret IS NULL OR p_secret <> r.secret) THEN RETURN json_build_object('error','locked'); END IF;
  IF eff_locked THEN DELETE FROM emails_locked WHERE id=p_id AND recipient=lower(p_address);
  ELSE DELETE FROM emails WHERE id=p_id AND recipient=lower(p_address); END IF;
  RETURN json_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION set_keep(p_id uuid, p_address text, p_keep boolean, p_secret text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; eff_locked boolean;
BEGIN
  SELECT * INTO r FROM inbox_keys WHERE address = lower(p_address);
  eff_locked := FOUND AND r.locked AND (r.expires_at IS NULL OR r.expires_at > now());
  IF eff_locked AND (p_secret IS NULL OR p_secret <> r.secret) THEN RETURN json_build_object('error','locked'); END IF;
  IF eff_locked THEN UPDATE emails_locked SET keep=p_keep WHERE id=p_id AND recipient=lower(p_address);
  ELSE UPDATE emails SET keep=p_keep WHERE id=p_id AND recipient=lower(p_address); END IF;
  RETURN json_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION create_inbox(text,text,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_emails(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_email(uuid,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_keep(uuid,text,boolean,text) TO anon, authenticated;

-- Optional: Auto-delete emails older than 1 hour using pg_cron
-- You need to enable the pg_cron extension first in Supabase Dashboard
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--     'delete-old-emails',
--     '*/5 * * * *',
--     $$DELETE FROM emails WHERE keep = false AND created_at < NOW() - INTERVAL '1 hour'$$
-- );
-- SELECT cron.schedule(
--     'delete-old-emails-locked',
--     '*/5 * * * *',
--     $$DELETE FROM emails_locked WHERE keep = false AND created_at < NOW() - INTERVAL '1 hour'$$
-- );
-- 잠금 TTL 만료 처리 (24시간 지난 잠금 해제 → 공개 수신함 복귀)
-- SELECT cron.schedule(
--     'expire-inbox-locks',
--     '*/5 * * * *',
--     $$UPDATE inbox_keys SET locked=false WHERE locked=true AND expires_at IS NOT NULL AND expires_at < now()$$
-- );
-- 삭제/만료된 메일의 첨부파일 오브젝트 정리 (매시간 — 어느 메일 행에도 속하지 않는 1일+ 경과 오브젝트)
-- SELECT cron.schedule(
--     'delete-orphan-attachments',
--     '17 * * * *',
--     $$DELETE FROM storage.objects o WHERE o.bucket_id='attachments' AND o.created_at < now() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id::text = split_part(o.name,'/',1)) AND NOT EXISTS (SELECT 1 FROM emails_locked el WHERE el.id::text = split_part(o.name,'/',1))$$
-- );
