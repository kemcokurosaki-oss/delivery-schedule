/**
 * 入出荷予定一覧（index.html）と同じ集合・同じ二重排除ルールで
 * 「今週・翌週」（月曜〜日曜×2、Asia/Tokyo）の行を集め、Gmail で通知する。
 *
 * Secrets: SUPABASE_URL, SUPABASE_SECRET_KEY, GMAIL_USER, GMAIL_APP_PASSWORD
 *          DELIVERY_NOTIFY_TO（任意・フォールバック。本番宛先は delivery_notify_recipients テーブル優先）
 * テストモード（TEST_MODE=true）の宛先: TEST_RECIPIENT_EMAIL（コード内定数）
 */

const nodemailer = require('nodemailer');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const NOTIFY_TO_RAW = process.env.DELIVERY_NOTIFY_TO || '';
const TEST_MODE = process.env.TEST_MODE === 'true';

/** 手動テスト（TEST_MODE）時の宛先（本番は DB または DELIVERY_NOTIFY_TO） */
const TEST_RECIPIENT_EMAIL = 'e-kurosaki@kusakabe.com';

const TASK_OVERLAY_KEYS = ['time_slot', 'status', 'quantity', 'mfg_rep', 'product_name'];

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

function requireEnv(name, v) {
  if (!v || !String(v).trim()) {
    throw new Error(`環境変数 ${name} が未設定です`);
  }
}

async function loadRecipientsFromDb() {
  try {
    const rows = await supabaseFetch(
      'delivery_notify_recipients?select=email&active=eq.true&order=email.asc'
    );
    return [...new Set((rows || []).map((r) => (r.email || '').trim()).filter(Boolean))];
  } catch (e) {
    console.warn(
      'delivery_notify_recipients を読めませんでした（未作成の場合は SQL を実行し CSV を取り込んでください）。フォールバックします。',
      e.message
    );
    return [];
  }
}

async function supabaseFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
  return res.json();
}

function normalizeHolidayDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const parts = s.split('/');
  if (parts.length === 3 && parts[0].length === 4) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function ymdFromTaskDate(raw) {
  if (raw == null) return null;
  const n = normalizeHolidayDate(raw);
  if (n) return n;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : (s.length >= 10 ? s.slice(0, 10) : null);
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

function ymdRangeIntersection(start, end, winStart, winEnd) {
  if (ymdCmp(end, winStart) < 0 || ymdCmp(start, winEnd) > 0) return null;
  const a = ymdCmp(start, winStart) < 0 ? winStart : start;
  const b = ymdCmp(end, winEnd) > 0 ? winEnd : end;
  return ymdCmp(a, b) <= 0 ? [a, b] : null;
}

/** Tokyo のカレンダー日付 YYYY-MM-DD */
function tokyoYmd(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** ymd の JST 正午付近の UTC エポック（曜日計算用） */
function jstNoonUtcMs(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 3, 0, 0);
}

function addDaysTokyo(ymd, n) {
  const ms = jstNoonUtcMs(ymd) + n * 86400000;
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function tokyoWeekdaySun0(ymd) {
  const dowEn = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(new Date(jstNoonUtcMs(ymd)));
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dowEn];
}

/** その日を含む週の月曜日（月曜始まり、Tokyo） */
function mondayOfWeekContainingTokyo(ymd) {
  const sun0 = tokyoWeekdaySun0(ymd);
  const daysSinceMonday = (sun0 + 6) % 7;
  return addDaysTokyo(ymd, -daysSinceMonday);
}

function enumerateYmdInclusive(startYmd, endYmd) {
  const out = [];
  let cur = startYmd;
  while (ymdCmp(cur, endYmd) <= 0) {
    out.push(cur);
    cur = addDaysTokyo(cur, 1);
  }
  return out;
}

function mergeTaskOverlayRow(base, overlay) {
  const out = { ...base };
  if (!overlay) return out;
  for (const k of TASK_OVERLAY_KEYS) {
    const v = overlay[k];
    if (v != null && String(v).trim() !== '') out[k] = v;
  }
  return out;
}

function buildTaskShipmentDisplayRow(meta, displayYmd, overlay) {
  const row = {
    _fromTask: true,
    _taskId: meta._taskId,
    date: displayYmd,
    _spanStart: meta._spanStart,
    _spanEnd: meta._spanEnd,
    type: '出荷',
    time_slot: null,
    status: '予定',
    project_number: meta.project_number,
    machine_unit: meta.machine_unit,
    product_name: meta.product_name,
    quantity: null,
    sales_rep: meta.sales_rep,
    mfg_rep: null,
    note: null,
  };
  return mergeTaskOverlayRow(row, overlay);
}

function expandTaskShipmentsForView(metas, overlaysByTaskId, viewStart, viewEnd) {
  const rows = [];
  for (const meta of metas) {
    const inter = ymdRangeIntersection(meta._spanStart, meta._spanEnd, viewStart, viewEnd);
    if (!inter) continue;
    const [segA, segB] = inter;
    const ov = overlaysByTaskId.get(String(meta._taskId));
    for (const ymd of enumerateYmdInclusive(segA, segB)) {
      rows.push(buildTaskShipmentDisplayRow(meta, ymd, ov));
    }
  }
  return rows;
}

function taskShipmentVisibleForDay(taskRow, dayDeliveriesAllTypes) {
  const pn = (taskRow.project_number || '').trim();
  if (!pn) return true;
  return !dayDeliveriesAllTypes.some(
    (e) => e.type === '出荷' && (e.project_number || '').trim() === pn
  );
}

function buildDayEntries(dateStr, deliveries, taskShipments) {
  const deliveriesThisDay = deliveries.filter((e) => (e.date || '').slice(0, 10) === dateStr);
  const dayDeliveries = deliveriesThisDay;
  const dayTasks = taskShipments.filter(
    (t) => t.date === dateStr && taskShipmentVisibleForDay(t, deliveriesThisDay)
  );
  return [...dayDeliveries, ...dayTasks];
}

function formatEntryLine(entry) {
  const span =
    entry._fromTask && entry._spanStart && entry._spanEnd && entry._spanStart !== entry._spanEnd
      ? `（出荷期間 ${entry._spanStart}～${entry._spanEnd}）`
      : '';
  const parts = [
    entry.type || '',
    entry.time_slot ? `時間帯:${entry.time_slot}` : null,
    entry.status ? `状態:${entry.status}` : null,
    entry.project_number ? `工番:${entry.project_number}` : null,
    entry.machine_unit ? `機械:${entry.machine_unit}` : null,
    entry.product_name ? `品名:${entry.product_name}` : null,
    entry.quantity ? `数量:${entry.quantity}` : null,
    entry.sales_rep ? `営業:${entry.sales_rep}` : null,
    entry.mfg_rep ? `製造資材:${entry.mfg_rep}` : null,
    entry.from_to ? `From/To:${entry.from_to}` : null,
    entry.transport ? `輸送:${entry.transport}` : null,
    entry.size ? `サイズ:${entry.size}` : null,
    entry.weight ? `重量:${entry.weight}` : null,
    entry.unit ? `単位:${entry.unit}` : null,
    entry.assembly_rep ? `組立:${entry.assembly_rep}` : null,
    entry.note ? `備考:${entry.note}` : null,
    entry._fromTask ? `メモ:工場出荷${span}` : null,
  ].filter(Boolean);
  return `  - ${parts.join(' / ')}`;
}

function weekLabelYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}/${m}/${d}`;
}

async function main() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SUPABASE_SECRET_KEY', SUPABASE_KEY);
  requireEnv('GMAIL_USER', GMAIL_USER);
  requireEnv('GMAIL_APP_PASSWORD', GMAIL_PASS);

  let recipients = await loadRecipientsFromDb();
  if (recipients.length === 0) {
    recipients = NOTIFY_TO_RAW.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!TEST_MODE && recipients.length === 0) {
    throw new Error(
      '送信先がありません。Supabase の delivery_notify_recipients に CSV で登録するか、GitHub Secret の DELIVERY_NOTIFY_TO（カンマ区切り）を設定してください。'
    );
  }

  const todayTokyo = tokyoYmd(new Date());
  const week1Mon = mondayOfWeekContainingTokyo(todayTokyo);
  const week1Sun = addDaysTokyo(week1Mon, 6);
  const week2Mon = addDaysTokyo(week1Mon, 7);
  const week2Sun = addDaysTokyo(week1Mon, 13);

  const winStart = week1Mon;
  const winEnd = week2Sun;

  const [deliveries, spRows] = await Promise.all([
    supabaseFetch(
      `deliveries?select=*&date=gte.${winStart}&date=lte.${winEnd}&order=date.asc&order=created_at.asc`
    ),
    supabaseFetch(`app_settings?select=value&key=eq.sales_person_map`),
  ]);

  const spRow = (spRows && spRows[0]) || null;
  let salesPersonMap = {};
  try {
    if (spRow && spRow.value) salesPersonMap = JSON.parse(spRow.value);
  } catch {
    salesPersonMap = {};
  }

  const factoryShip = encodeURIComponent('工場出荷');
  const taskRows = await supabaseFetch(
    `tasks?select=id,project_number,machine,text,start_date,end_date&text=eq.${factoryShip}&end_date=gte.${winStart}`
  );

  const metas = (taskRows || [])
    .map((t) => {
      const endYmd = ymdFromTaskDate(t.end_date);
      if (!endYmd) return null;
      const startRaw = t.start_date != null ? ymdFromTaskDate(t.start_date) : null;
      const startYmd = startRaw || endYmd;
      const span = orderedSpan(startYmd, endYmd);
      if (!span) return null;
      if (ymdRangeIntersection(span.start, span.end, winStart, winEnd) == null) return null;
      return {
        _fromTask: true,
        _taskId: t.id,
        _spanStart: span.start,
        _spanEnd: span.end,
        project_number: t.project_number,
        machine_unit: t.machine,
        sales_rep: salesPersonMap[t.project_number] || null,
        product_name: undefined,
      };
    })
    .filter(Boolean);

  const taskIds = [...new Set(metas.map((b) => b._taskId).filter((id) => id != null))];
  let overlays = [];
  if (taskIds.length) {
    const inList = taskIds.join(',');
    overlays = await supabaseFetch(`task_shipment_overlays?select=*&task_id=in.(${inList})`);
  }
  const overlaysByTaskId = new Map();
  (overlays || []).forEach((r) => overlaysByTaskId.set(String(r.task_id), r));

  const taskShipments = expandTaskShipmentsForView(metas, overlaysByTaskId, winStart, winEnd);

  const lines = [];
  let totalEntries = 0;
  const weekLabels = ['今週', '翌週'];
  for (let wi = 0; wi < weekLabels.length; wi++) {
    const label = weekLabels[wi];
    if (wi === 1) lines.push('');
    const wStart = label === '今週' ? week1Mon : week2Mon;
    const wEnd = label === '今週' ? week1Sun : week2Sun;
    lines.push(`━━ ${label} ━━`);
    let any = false;
    for (const ymd of enumerateYmdInclusive(wStart, wEnd)) {
      const entries = buildDayEntries(ymd, deliveries || [], taskShipments);
      if (entries.length === 0) continue;
      any = true;
      const dow = DOW_JA[tokyoWeekdaySun0(ymd)];
      lines.push(`${ymd}（${dow}）`);
      entries.forEach((e) => {
        lines.push(formatEntryLine(e));
        totalEntries += 1;
      });
      lines.push('');
    }
    if (!any) lines.push('  （この週に表示対象の予定はありません）\n');
  }

  if (totalEntries === 0) {
    console.log('通知対象の入出荷行がありません。メールは送信しません。');
    return;
  }

  const body = `${lines.join('\n')}\n\n※このメールは自動送信です。\n`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  const toList = TEST_MODE ? [TEST_RECIPIENT_EMAIL] : recipients;
  const subject =
    (TEST_MODE ? '【テスト】' : '') +
    `【入出荷予定】${weekLabelYmd(week1Mon)}週・翌週のお知らせ`;

  await transporter.sendMail({
    from: `"入出荷予定通知" <${GMAIL_USER}>`,
    to: toList.join(', '),
    subject,
    text: body,
  });

  console.log(`送信完了: ${toList.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
