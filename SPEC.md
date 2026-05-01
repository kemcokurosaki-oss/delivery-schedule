# 入出荷一覧表 — 設計仕様書

> **Cursor向け実装ガイド**
> このファイルを `@SPEC.md` で参照しながら実装・修正を進めてください。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|---|---|
| ファイル | `C:\Users\kurosaki\Desktop\工程表作成\入出荷一覧表\delivery.html` |
| 関連アプリ | `C:\Users\kurosaki\Desktop\工程表作成\全体工程表\index.html` |
| データベース | Supabase（同一プロジェクト） |
| 目的 | 製品の出荷予定・長納期品の入荷予定をカレンダー形式で管理。工程表と自動連携。 |

---

## 2. Supabase 接続情報

```javascript
const S_URL = "https://dgekjzkrybrswsxlcbvh.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnZWtqemtyeWJyc3dzeGxjYnZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODQ3MjIsImV4cCI6MjA4NDQ2MDcyMn0.BsEj53lV3p76yE9fMPTaLn7ocKTNzYPTqIAnBafYItU";
```

---

## 3. Supabase テーブル設計

### 3-1. `deliveries` テーブル（新規作成が必要）

```sql
CREATE TABLE deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE NOT NULL,
  type          TEXT CHECK (type IN ('入荷', '出荷')),
  time_slot     TEXT,                          -- 例: '午前', '午後', '昼前後'
  status        TEXT CHECK (status IN ('確定', '予定')),
  project_number TEXT,                         -- 工番（tasksテーブルとのリンクキー）
  machine_unit  TEXT,                          -- 機械ユニット（例: PCLU, RCMU）
  product_name  TEXT,                          -- 製品名（例: ジーローターポンプ）
  from_to       TEXT,                          -- From or to
  transport     TEXT,                          -- 輸送手段（例: 自社便, 10トン重）
  size          TEXT,                          -- サイズ (WxBxH/単)
  weight        TEXT,                          -- 単重（例: 約700kg）
  quantity      TEXT,                          -- 数量
  unit          TEXT,                          -- 単位（例: P/L, 式）
  sales_rep     TEXT,                          -- 営業担当
  mfg_rep       TEXT,                          -- 製造資材
  assembly_rep  TEXT,                          -- 組立担当
  note          TEXT,                          -- 備考
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security（必要に応じて設定）
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON deliveries FOR SELECT USING (true);
CREATE POLICY "anon_write" ON deliveries FOR ALL USING (true);
```

### 3-2. 既存テーブル（参照のみ）

#### `tasks` テーブル（工程表のデータ）
| フィールド | 内容 | 入出荷一覧での用途 |
|---|---|---|
| `project_number` | 工番 | **リンクキー** |
| `machine` | 機械ユニット | 工番入力時に自動補完 |
| `major_item` | 製品名 | 工番入力時に自動補完 |
| `text` | タスク名 | `'工場出荷'` のものの `end_date` が出荷予定日 |
| `end_date` | 終了日 | 出荷予定日として参照 |

#### `holidays` テーブル（工程表と共用）
| フィールド | 内容 |
|---|---|
| `date` | 休日日付（DATE型、"YYYY-MM-DD"） |

---

## 4. 工程表との自動連携

### 連携フロー

```
【出荷エントリの工番入力時】
  工番(project_number) 入力
    → tasks テーブルを検索
    → machine_unit = tasks.machine
    → product_name = tasks.major_item
    → 出荷タイプの場合: tasks.text='工場出荷' の end_date を日付候補として提示

【将来拡張: Realtime連携】
  工程表で '工場出荷' タスクの end_date が変更される
    → Supabase Realtime で検知
    → deliveries テーブルの該当レコードの date を自動更新
    （または、表示時に tasks から動的に取得してハイライト表示）
```

---

## 5. 画面設計

### 5-1. ヘッダーエリア

```
[← 前月]  2026年 3月  [次月 →]     [入荷のみ] [出荷のみ] [全表示]     [+ 新規追加]
```

### 5-2. カレンダーテーブル

列構成（Excelと同じ順序）:

| # | 列名 | DB列 | 幅 | 備考 |
|---|---|---|---|---|
| 1 | 日付 | date | 80px | 同日複数行は結合表示 |
| 2 | 曜日 | — | 40px | 自動計算 |
| 3 | 入荷/出荷 | type | 65px | |
| 4 | 時間帯 | time_slot | 70px | |
| 5 | 予定状態 | status | 60px | |
| 6 | 工番 | project_number | 60px | |
| 7 | 機械ユニット | machine_unit | 80px | |
| 8 | 製品 | product_name | 160px | |
| 9 | From or to | from_to | 100px | |
| 10 | 輸送手段 | transport | 80px | |
| 11 | サイズ(WxBxH)/単 | size | 120px | |
| 12 | 単重 | weight | 70px | |
| 13 | 数量 | quantity | 50px | |
| 14 | 単位 | unit | 50px | |
| 15 | 営業担当 | sales_rep | 70px | |
| 16 | 製造資材 | mfg_rep | 70px | |
| 17 | 組立担当 | assembly_rep | 70px | |
| 18 | 備考 | note | 180px | |
| 19 | 操作 | — | 60px | 編集/削除ボタン |

### 5-3. 行の色分け

| 条件 | 背景色 |
|---|---|
| 日曜 | `#fce4ec`（薄ピンク）|
| 土曜 | `#e3f2fd`（薄ブルー）|
| 祝日（holidays テーブル） | `#fce4ec`（薄ピンク）|
| 平日 | 白 |
| 出荷行 | 左ボーダー `#2E7D32`（緑）|
| 入荷行 | 左ボーダー `#1976D2`（青）|

### 5-4. 追加/編集モーダル

```
┌─────────────────────────────┐
│ 入出荷エントリ 追加/編集    │
├─────────────────────────────┤
│ 日付: [____]  入荷/出荷: [▼]│
│ 時間帯: [▼]  予定状態: [▼] │
│ 工番: [____] [🔍 検索]      │  ← 入力後に tasks から自動補完
│ 機械ユニット: [____]        │  ← 自動補完
│ 製品: [____________________]│  ← 自動補完
│ From or to: [______________]│
│ 輸送手段: [________________]│
│ サイズ: [__________________]│
│ 単重: [____] 数量: [__] 単位: [__] │
│ 営業担当: [__] 製造資材: [__] 組立担当: [__] │
│ 備考: [____________________]│
├─────────────────────────────┤
│           [保存]  [キャンセル] │
└─────────────────────────────┘
```

---

## 6. 実装ファイル構成

```
入出荷一覧表/
├── delivery.html    ← メインファイル（単一HTMLで完結）
└── SPEC.md          ← この仕様書
```

---

## 7. 技術スタック

- **Supabase JS SDK** v2（CDN）: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- **フォント**: Noto Sans JP（Google Fonts）
- **フレームワーク**: なし（Vanilla JS）
- **外部ライブラリ**: なし

---

## 8. 実装済み機能（delivery.html）

- [x] カレンダー表示（月単位、前月/次月ナビゲーション）
- [x] Supabaseからdeliveriesデータ読み込み
- [x] Supabaseからholidaysデータ読み込み（行の色分け）
- [x] 工番入力時にtasksテーブルから機械ユニット・製品名を自動補完
- [x] 追加/編集/削除モーダル
- [x] 入荷/出荷フィルター
- [x] 土日・祝日の色分け

## 9. 今後の拡張候補

- [ ] 工程表との Realtime 連携（Supabase Realtime で tasks の変更を検知して deliveries を更新）
- [ ] 工程表の「工場出荷」タスクから出荷エントリを一括生成するボタン
- [ ] Excel エクスポート機能
- [ ] 印刷レイアウト（@media print）
- [ ] ログイン認証（工程表と同じ auth 機構を流用）
