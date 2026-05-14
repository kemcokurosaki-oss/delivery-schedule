-- 既存 DB 向け：工程表連携出荷行の製品を task_shipment_overlays に保存（tasks.major_item とは独立）
-- task_shipment_overlays が未作成の場合は先に task_shipment_overlays.sql を実行してください。

ALTER TABLE task_shipment_overlays
  ADD COLUMN IF NOT EXISTS product_name TEXT;

COMMENT ON COLUMN task_shipment_overlays.product_name IS '入出荷一覧の製品（工程表 tasks とは別に一覧側で入力・保存）';
