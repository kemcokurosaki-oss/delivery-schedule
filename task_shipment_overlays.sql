-- 入出荷一覧：工程表「工場出荷」タスク行の補完データ（tasks.id は bigint）
-- 初回作成用（未作成の場合はそのまま実行）

CREATE TABLE IF NOT EXISTS task_shipment_overlays (
  task_id        BIGINT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,

  time_slot      TEXT,
  status         TEXT,
  from_to        TEXT,
  transport      TEXT,
  size           TEXT,
  weight         TEXT,
  quantity       TEXT,
  unit           TEXT,
  sales_rep      TEXT,
  mfg_rep        TEXT,
  assembly_rep   TEXT,
  note           TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT task_shipment_overlays_status_check
    CHECK (status IS NULL OR status IN ('予定', '確定'))
);

COMMENT ON TABLE task_shipment_overlays IS '入出荷一覧で工程表連携出荷行に補完したフィールド（tasks.id と1:1）';

CREATE OR REPLACE FUNCTION task_shipment_overlays_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_shipment_overlays_updated_at ON task_shipment_overlays;
CREATE TRIGGER trg_task_shipment_overlays_updated_at
  BEFORE UPDATE ON task_shipment_overlays
  FOR EACH ROW
  EXECUTE FUNCTION task_shipment_overlays_set_updated_at();

ALTER TABLE task_shipment_overlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_task_shipment_overlays" ON task_shipment_overlays;
CREATE POLICY "anon_read_task_shipment_overlays"
  ON task_shipment_overlays FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_write_task_shipment_overlays" ON task_shipment_overlays;
CREATE POLICY "anon_write_task_shipment_overlays"
  ON task_shipment_overlays FOR ALL USING (true);
