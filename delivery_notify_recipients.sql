-- 入出荷週次通知の送信先一覧（Excel → CSV → Supabase テーブル取り込み用）
-- Supabase SQL Editor で実行してから、Table Editor で CSV を Import してください。

CREATE TABLE IF NOT EXISTS delivery_notify_recipients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_notify_recipients_email_unique UNIQUE (email)
);

COMMENT ON TABLE delivery_notify_recipients IS '週次入出荷通知の宛先。active=false で送信から外す。';

CREATE INDEX IF NOT EXISTS idx_delivery_notify_recipients_active
  ON delivery_notify_recipients (active)
  WHERE active = TRUE;

ALTER TABLE delivery_notify_recipients ENABLE ROW LEVEL SECURITY;

-- anon / 認証ユーザーからは読めない（メールアドレスの漏えい防止）
-- GitHub Actions の service_role / sb_secret は RLS をバイパスして SELECT 可能
