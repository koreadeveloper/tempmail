-- 관리자 페이지용: admin_config 테이블 + 관리자 RPC
-- Supabase SQL Editor에서 실행

-- admin_config: RLS 정책 없음 → anon 키로 직접 읽기 불가, SECURITY DEFINER 함수만 접근
CREATE TABLE IF NOT EXISTS admin_config (
    k text PRIMARY KEY,
    v text NOT NULL
);
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

INSERT INTO admin_config (k, v)
VALUES ('admin_secret', 'acc44355-c077-4dac-ac18-496e579e18ac')
ON CONFLICT (k) DO NOTHING;

-- 관리자 키 검증 헬퍼
CREATE OR REPLACE FUNCTION admin_ok(p_secret text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM admin_config WHERE k='admin_secret' AND v=p_secret);
$$;

-- 전체 메일 목록 (공개+잠금, 본문 제외 — 목록용 경량 행)
CREATE OR REPLACE FUNCTION admin_list_emails(p_secret text, p_limit int DEFAULT 200)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT admin_ok(p_secret) THEN RETURN json_build_object('error','forbidden'); END IF;
  RETURN (
    SELECT coalesce(json_agg(t ORDER BY t.created_at DESC), '[]'::json) FROM (
      SELECT e.id, e.created_at, e.recipient, e.sender, e.subject, e.keep,
             jsonb_array_length(e.attachments) AS attachment_count,
             (e.raw_mime IS NOT NULL) AS has_raw,
             'public'::text AS box
        FROM emails e
      UNION ALL
      SELECT e.id, e.created_at, e.recipient, e.sender, e.subject, e.keep,
             jsonb_array_length(e.attachments), (e.raw_mime IS NOT NULL), 'locked'::text
        FROM emails_locked e
      ORDER BY created_at DESC
      LIMIT p_limit
    ) t
  );
END $$;

-- 단일 메일 상세 (본문 포함)
CREATE OR REPLACE FUNCTION admin_get_email(p_secret text, p_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data json;
BEGIN
  IF NOT admin_ok(p_secret) THEN RETURN json_build_object('error','forbidden'); END IF;
  SELECT row_to_json(e) INTO row_data FROM emails e WHERE e.id = p_id;
  IF row_data IS NULL THEN
    SELECT row_to_json(e) INTO row_data FROM emails_locked e WHERE e.id = p_id;
  END IF;
  RETURN coalesce(row_data, 'null'::json);
END $$;

-- 관리자 삭제 (양쪽 테이블에서 id로)
CREATE OR REPLACE FUNCTION admin_delete_email(p_secret text, p_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT admin_ok(p_secret) THEN RETURN json_build_object('error','forbidden'); END IF;
  DELETE FROM emails WHERE id = p_id;
  DELETE FROM emails_locked WHERE id = p_id;
  RETURN json_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION admin_list_emails(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_get_email(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_email(text, uuid) TO anon, authenticated;
