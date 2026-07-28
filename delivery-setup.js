const S_URL = "https://dgekjzkrybrswsxlcbvh.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnZWtqemtyeWJyc3dzeGxjYnZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODQ3MjIsImV4cCI6MjA4NDQ2MDcyMn0.BsEj53lV3p76yE9fMPTaLn7ocKTNzYPTqIAnBafYItU";

const sb = supabase.createClient(S_URL, S_KEY);

let deliveries   = [];
/** 当月の tasks（text=工場出荷/梱包出荷）メタ1件＝1タスク（日付展開前、_spanStart/_spanEnd） */
let taskShipmentBases = [];
/** 当月の tasks（text=工場出荷/梱包出荷）を一覧用に正規化した行（補完マージ済み） */
let taskShipments = [];
/** task_id → task_shipment_overlays の1行（当月に該当するタスクのみ） */
let taskOverlaysMap = new Map();
const overlaySaveTimers = new Map();
const deliverySaveTimers = new Map();
/** renderCalendar 直後に該当行へスクロール（{ deliveryId } または { taskId }） */
let pendingScrollSpec = null;
/** 日付跨ぎで「今日」行を付け直すための 0 時タイマー */
let midnightRenderTimer = null;

function attrSel(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function requestScrollAfterNextRender(spec) {
  if (!spec || (spec.deliveryId == null && spec.taskId == null)) {
    pendingScrollSpec = null;
    return;
  }
  pendingScrollSpec = {
    deliveryId: spec.deliveryId != null ? String(spec.deliveryId) : null,
    taskId: spec.taskId != null ? String(spec.taskId) : null,
  };
}

function applyPendingScroll() {
  if (!pendingScrollSpec) return;
  const { deliveryId, taskId } = pendingScrollSpec;
  pendingScrollSpec = null;
  requestAnimationFrame(() => {
    if (deliveryId) {
      const tr = document.querySelector(
        `tr.row-manual-delivery[data-delivery-id="${attrSel(deliveryId)}"]`
      );
      if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (taskId) {
      const tr = document.querySelector(`tr.row-from-task[data-task-id="${attrSel(taskId)}"]`);
      if (tr) tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

/** 備考クリックの連続発火（ダブルクリック等）でモーダルが二重に開かないよう抑止 */
let lastTaskShipmentDateModalOpen = 0;

let holidaySet   = new Set();
let currentFilter = 'all';
let autoFillTimer = null;
/** app_settings.sales_person_map: project_number → 営業担当名 */
let salesPersonMap = {};

function getViewRange() {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth(); // 0-indexed
  let sy = cy, sm = cm - 1;
  if (sm < 0) { sm = 11; sy--; }
  let ey = cy, em = cm + 6;
  if (em > 11) { em -= 12; ey++; }
  return { startYear: sy, startMonth: sm + 1, endYear: ey, endMonth: em + 1 };
}

const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

const TASK_OVERLAY_KEYS = [
  'time_slot', 'status', 'mfg_rep', 'product_name', 'note',
];

/** 工程表ベース行に task_shipment_overlays を上書きマージ（空の overlay 値は無視） */
function mergeTaskOverlayRow(base, overlay) {
  const out = { ...base };
  if (!overlay) return out;
  for (const k of TASK_OVERLAY_KEYS) {
    const v = overlay[k];
    if (v != null && String(v).trim() !== '') out[k] = v;
  }
  return out;
}

function ymdCmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function orderedSpan(startYmd, endYmd) {
  if (!startYmd || !endYmd) return null;
  return ymdCmp(startYmd, endYmd) <= 0
    ? { start: startYmd, end: endYmd }
    : { start: endYmd, end: startYmd };
}

function parseYmdLocalNoon(ymd) {
  const [yy, mm, dd] = ymd.split('-').map(Number);
  return new Date(yy, mm - 1, dd, 12, 0, 0, 0);
}

function formatYmdFromDate(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** 期間同士の交差 [a,b]、なければ null（いずれも YYYY-MM-DD） */
function ymdRangeIntersection(start, end, winStart, winEnd) {
  if (ymdCmp(end, winStart) < 0 || ymdCmp(start, winEnd) > 0) return null;
  const a = ymdCmp(start, winStart) < 0 ? winStart : start;
  const b = ymdCmp(end, winEnd) > 0 ? winEnd : end;
  return ymdCmp(a, b) <= 0 ? [a, b] : null;
}

function enumerateYmdInclusive(startYmd, endYmd) {
  const out = [];
  let cur = parseYmdLocalNoon(startYmd);
  const endDt = parseYmdLocalNoon(endYmd);
  while (cur.getTime() <= endDt.getTime()) {
    out.push(formatYmdFromDate(cur));
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
