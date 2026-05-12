-- 入出荷一覧の「工場出荷」期間表示用。未作成なら Supabase SQL で実行。
-- end_date と同じ型に合わせてください（DATE または TIMESTAMPTZ）。

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;

COMMENT ON COLUMN tasks.start_date IS '工程表タスク開始日（工場出荷の期間表示・入出荷一覧と連携）';
