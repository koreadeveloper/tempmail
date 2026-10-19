-- 잠금 수신함 TTL: 생성 후 24시간 뒤 자동 해제
-- Supabase SQL Editor에서 실행

-- 1) expires_at 컬럼 추가 + 기존 잠금 행 백필 (created_at 기준 +24h)
ALTER TABLE inbox_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE inbox_keys SET expires_at = created_at + interval '24 hours'
WHERE locked = true AND expires_at IS NULL;

-- 2) create_inbox: 잠금 생성 시 expires_at 설정, 만료된 잠금은 재점유 가능
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

-- 3) get_emails: 만료된 잠금은 공개 수신함으로 취급
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

-- 4) delete_email / set_keep: 동일한 유효 잠금 판정
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

-- 5) 만료된 잠금 행 정리 (5분마다 — locked=false로 되돌림)
SELECT cron.schedule(
    'expire-inbox-locks',
    '*/5 * * * *',
    $$UPDATE inbox_keys SET locked=false WHERE locked=true AND expires_at IS NOT NULL AND expires_at < now()$$
);
