function buildTaskShipmentDisplayRow(meta, displayYmd, overlay) {
  const row = {
    _fromTask: true,
    _taskId: meta._taskId,
    _taskText: meta._taskText,
    date: displayYmd,
    _spanStart: meta._spanStart,
    _spanEnd: meta._spanEnd,
    type: '出荷',
    time_slot: null,
    status: '予定',
    project_number: meta.project_number,
    machine_unit: meta.machine_unit,
    product_name: meta.product_name,
    sales_rep: meta.sales_rep,
    mfg_rep: null,
    note: null,
  };
  const merged = mergeTaskOverlayRow(row, overlay);
  const done = !!meta._taskIsCompleted;
  merged._taskIsCompleted = done;
  if (done) {
    merged.status = '完了';
  }
  return merged;
}

function expandTaskShipmentsForView(metas, viewStart, viewEnd) {
  const rows = [];
  for (const meta of metas) {
    const inter = ymdRangeIntersection(meta._spanStart, meta._spanEnd, viewStart, viewEnd);
    if (!inter) continue;
    const [segA, segB] = inter;
    const ov = taskOverlaysMap.get(String(meta._taskId));
    for (const ymd of enumerateYmdInclusive(segA, segB)) {
      rows.push(buildTaskShipmentDisplayRow(meta, ymd, ov));
    }
  }
  return rows;
}

/** 複数日にまたがる工程表出荷のみ：入荷/出荷列用「1/3日」 */
function taskSpanDayBadgeHtml(entry) {
  if (!entry || !entry._fromTask || !entry._spanStart || !entry._spanEnd) return '';
  if (entry._spanStart === entry._spanEnd) return '';
  const days = enumerateYmdInclusive(entry._spanStart, entry._spanEnd);
  const total = days.length;
  if (total <= 1) return '';
  const disp = String(entry.date).slice(0, 10);
  const idx = days.indexOf(disp);
  if (idx < 0) return '';
  const n = idx + 1;
  const CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  const ch = CIRCLE_NUMS[n - 1] || `(${n})`;
  const title = `出荷期間 ${entry._spanStart} ～ ${entry._spanEnd}（全${total}日）／この行は${n}日目`;
  return `<span class="task-span-day-badge" title="${escapeAttr(title)}">${ch}</span>`;
}

/** 入荷/出荷セル：内側グリッドでバッジ位置を統一し、塊を列中央に */
function typeCellInnerHtml(entry) {
  const dayPart = taskSpanDayBadgeHtml(entry);
  return `<div class="type-cell-row">
    <div class="type-cell-inner">
      <span class="type-cell-badge">${typeBadge(entry.type)}</span>
      <span class="type-cell-right">${dayPart}</span>
    </div>
  </div>`;
}

/** 手動 deliveries 行：入荷／出荷をプルダウンで切替 */
function deliveryTypePickCell(entry) {
  let v = (entry.type || '').trim();
  if (v !== '入荷' && v !== '出荷') v = '出荷';
  const opts = ['入荷', '出荷'].map(o =>
    `<option value="${o}"${v === o ? ' selected' : ''}>${o}</option>`
  ).join('');
  return `<div class="task-pick-wrap" data-pick-wrap="type">
    <button type="button" class="task-pick-display task-pick-type" aria-label="入荷／出荷をダブルクリックで編集">${typeBadge(v)}</button>
    <select data-overlay="type" class="task-pick-control" style="display:none">${opts}</select>
  </div>`;
}

function taskShipmentNoteTriggerHtml(entry) {
  const label = entry._taskText || '工場出荷';
  return `<span class="task-shipment-date-trigger" data-task-id="${entry._taskId}" role="button" tabindex="0" title="クリックで工程表の出荷期間を変更"><span class="task-source-tag">工程表</span>${escapeAttr(label)}</span>`;
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/\r?\n/g, ' ');
}

/** 時間帯: 通常はテキスト表示、ダブルクリックでプルダウン */
function taskTimeSlotPickCell(entry) {
  const rawV = (entry.time_slot || '').trim();
  const v = (!rawV && entry._fromTask) ? '未定' : rawV;
  const fixedOpts = ['午前', '午後', '未定'];
  const isFixed = fixedOpts.includes(v);
  const selectVal = isFixed ? v : (v ? '__custom__' : '');
  const opts = fixedOpts.map(o =>
    `<option value="${o}"${selectVal === o ? ' selected' : ''}>${o}</option>`
  ).join('');
  const disp = v ? escapeAttr(v) : '<span class="task-pick-placeholder">—</span>';
  return `<div class="task-pick-wrap" data-pick-wrap="time_slot">
    <button type="button" class="task-pick-display task-pick-time" aria-label="時間帯をダブルクリックで編集">${disp}</button>
    <div class="task-timeslot-editor">
      <select class="task-timeslot-select">
        <option value="__open_sentinel__" style="display:none"></option>
        ${opts}
        <option value="__custom__"${selectVal === '__custom__' ? ' selected' : ''}>自由入力</option>
      </select>
      <input type="text" class="task-timeslot-custom" placeholder="入力..." value="${!isFixed ? escapeAttr(v) : ''}" style="${selectVal === '__custom__' ? '' : 'display:none;'}">
    </div>
    <input type="hidden" data-overlay="time_slot" value="${escapeAttr(v)}">
  </div>`;
}

/** 予定状態: 通常は色付きバッジ、ダブルクリックでプルダウン */
function taskStatusPickCell(entry) {
  const isK = entry.status === '確定';
  const isC = entry.status === '完了';
  const badge = isC
    ? '<span class="status-badge kanryo">完了</span>'
    : isK
      ? '<span class="status-badge kakutei">確定</span>'
      : '<span class="status-badge yotei">予定</span>';
  const completedOption = `<option value="完了"${isC ? ' selected' : ''}>完了</option>`;
  return `<div class="task-pick-wrap" data-pick-wrap="status">
    <button type="button" class="task-pick-display task-pick-status" aria-label="予定状態をダブルクリックで編集">${badge}</button>
    <select data-overlay="status" class="task-pick-control" style="display:none">` +
    `<option value="予定"${!isK && !isC ? ' selected' : ''}>予定</option>` +
    `<option value="確定"${isK ? ' selected' : ''}>確定</option>` +
    completedOption +
    `</select>
  </div>`;
}

function syncPickDisplay(wrap) {
  if (!wrap) return;
  const pick = wrap.getAttribute('data-pick-wrap');
  const btn = wrap.querySelector('.task-pick-display');
  if (!btn) return;
  if (pick === 'type') {
    const sel = wrap.querySelector('select.task-pick-control');
    if (!sel) return;
    const v = (sel.value || '').trim();
    btn.innerHTML = v === '入荷' || v === '出荷' ? typeBadge(v) : '<span class="task-pick-placeholder">—</span>';
  } else if (pick === 'time_slot') {
    const hidden = wrap.querySelector('input[type="hidden"][data-overlay="time_slot"]');
    const v = hidden ? (hidden.value || '').trim() : '';
    btn.innerHTML = v ? escapeAttr(v) : '<span class="task-pick-placeholder">—</span>';
  } else if (pick === 'status') {
    const sel = wrap.querySelector('select.task-pick-control');
    if (!sel) return;
    const v = sel.value;
    btn.innerHTML = v === '確定'
      ? '<span class="status-badge kakutei">確定</span>'
      : v === '完了'
        ? '<span class="status-badge kanryo">完了</span>'
        : '<span class="status-badge yotei">予定</span>';
  }
}

function collapseTimeslotEditor(wrap) {
  if (!wrap) return;
  const editor = wrap.querySelector('.task-timeslot-editor');
  if (editor) editor.style.display = 'none';
  const btn = wrap.querySelector('.task-pick-display');
  if (btn) btn.style.display = '';
  syncPickDisplay(wrap);
}

function collapseTaskPickSelect(sel) {
  if (!sel || sel.tagName !== 'SELECT' || !sel.classList.contains('task-pick-control')) return;
  const wrap = sel.closest('[data-pick-wrap]');
  if (!wrap) return;
  syncPickDisplay(wrap);
  sel.style.display = 'none';
  const btn = wrap.querySelector('.task-pick-display');
  if (btn) btn.style.display = '';
  if (document.activeElement === sel) sel.blur();
}

function taskInlineTextInput(field, entry, extraStyle = '', extraClass = '') {
  const val = escapeAttr(entry[field] || '');
  const c = 'task-inline-input ghost' + (extraClass ? ' ' + extraClass : '');
  return `<input type="text" data-overlay="${field}" class="${c}" value="${val}" style="${extraStyle}" readonly title="ダブルクリックで編集">`;
}

/** 営業担当セル: 常に読み取り専用（DBから自動補完） */
function taskSalesRepCell(entry) {
  return `<span class="sales-rep-auto">${escapeAttr(entry.sales_rep || '')}</span>`;
}

function typeBadge(type) {
  if (!type) return '';
  const cls = type === '入荷' ? 'nyuuka' : 'shukka';
  return `<span class="type-badge ${cls}">${escapeAttr(type)}</span>`;
}

function dowColor(dow, isHol) {
  if (dow === 0 || isHol) return '#C8323C';
  if (dow === 6) return '#1F5FAD';
  return '#4B5563';
}

/** 同日・同工事番号の手動出荷があれば工程表タスク行は二重表示しない */
function taskShipmentVisibleForDay(taskRow, dayDeliveriesAllTypes) {
  const pn = (taskRow.project_number || '').trim();
  if (!pn) return true;
  return !dayDeliveriesAllTypes.some(
    e => e.type === '出荷' && (e.project_number || '').trim() === pn
  );
}

// ─── カレンダー描画 ────────────────────────────────────
function renderCalendar() {
  const { startYear, startMonth, endYear, endMonth } = getViewRange();
  document.getElementById('view-range').textContent =
    `${startYear}年${startMonth}月 〜 ${endYear}年${endMonth}月`;

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    // 月ヘッダー行
    const mhTr = document.createElement('tr');
    mhTr.innerHTML = `<td colspan="13" class="month-header">${y}年 ${m}月</td>`;
    tbody.appendChild(mhTr);

    const lastDay = new Date(y, m, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const dateObj  = new Date(y, m - 1, d);
      const dow      = dateObj.getDay(); // 0=日, 6=土
      const dateStr  = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isHol    = holidaySet.has(dateStr);
      const rowClass =
        dow === 0 ? 'sunday'
        : isHol ? 'sunday holiday'
        : dow === 6 ? 'saturday'
        : 'weekday';

      const dayDeliveries = deliveries.filter(e => {
        if (e.date.slice(0,10) !== dateStr) return false;
        if (currentFilter === 'all') return true;
        return e.type === currentFilter;
      });

      const deliveriesThisDay = deliveries.filter(e => e.date.slice(0, 10) === dateStr);
      const dayTasks = (currentFilter === '入荷' ? [] : taskShipments)
        .filter(t => t.date === dateStr && taskShipmentVisibleForDay(t, deliveriesThisDay));

      const dayEntries = [...dayDeliveries, ...dayTasks];

      if (dayEntries.length === 0) {
        // 入出荷なし → 1行（日付・曜日・＋ボタンのみ）
        const tr = document.createElement('tr');
        tr.className = rowClass + ' empty-day' + (dateStr === todayStr ? ' today' : '');
        tr.dataset.date = dateStr;
        tr.innerHTML = `
          <td class="td-date">${m}/${d}${dateStr === todayStr ? '<span class="today-label">今日</span>' : ''}</td>
          <td class="td-dow" style="color:${dowColor(dow, isHol)}">${DOW_NAMES[dow]}</td>
          <td colspan="10"></td>
          <td style="text-align:center;">
            <button class="op-btn add-day" onclick="openModal('${dateStr}')" title="この日にエントリを追加">＋</button>
          </td>`;
        tbody.appendChild(tr);
      } else {
        dayEntries.forEach((entry, idx) => {
          const tr = document.createElement('tr');
          const fromTask = !!entry._fromTask;
          tr.className =
            rowClass +
            (fromTask ? ' row-from-task' : ' row-manual-delivery') +
            (dateStr === todayStr ? ' today' : '');
          if (fromTask) {
            tr.dataset.taskId = String(entry._taskId);
            if (entry._taskIsCompleted) {
              tr.classList.add('row-task-completed');
              tr.dataset.taskCompleted = '1';
            } else if (entry.status === '完了') {
              tr.classList.add('row-delivery-completed');
              tr.dataset.deliveryCompleted = '1';
            }
          } else {
            tr.dataset.deliveryId = String(entry.id);
            tr.dataset.deliveryDate = (entry.date || '').slice(0, 10);
            tr.title = '右クリックで日付変更・削除';
            if (entry.status === '完了') {
              tr.classList.add('row-delivery-completed');
              tr.dataset.deliveryCompleted = '1';
            }
          }
          tr.dataset.date = dateStr;
          const dateCell = idx === 0
            ? `<td class="td-date" rowspan="${dayEntries.length}">${m}/${d}${dateStr === todayStr ? '<span class="today-label">今日</span>' : ''}</td>
               <td class="td-dow" rowspan="${dayEntries.length}" style="color:${dowColor(dow, isHol)}">${DOW_NAMES[dow]}</td>`
            : '';
          const linkCell = fromTask ? taskShipmentNoteTriggerHtml(entry) : '';
          const noteCell = taskInlineTextInput('note', entry);
          const opCell = fromTask
            ? (idx === 0 ? `<button type="button" class="op-btn add-day" onclick="openModal('${dateStr}')" title="同じ日に手動で追加">＋</button>` : '')
            : (idx === 0 ? `<button type="button" class="op-btn add-day" onclick="openModal('${dateStr}')" title="同じ日に追加">＋</button>` : '');
          if (fromTask) {
            tr.innerHTML = `
            ${dateCell}
            <td class="td-type-cell">${typeCellInnerHtml(entry)}</td>
            <td style="text-align:center;">${taskTimeSlotPickCell(entry)}</td>
            <td class="td-col-status">${taskStatusPickCell(entry)}</td>
            <td style="text-align:center;">${escapeAttr(entry.project_number)}</td>
            <td class="td-col-machine-unit">${escapeAttr(entry.machine_unit)}</td>
            <td>${taskInlineTextInput('product_name', entry)}</td>
            <td class="td-col-sales-rep">${taskSalesRepCell(entry)}</td>
            <td>${taskInlineTextInput('mfg_rep', entry)}</td>
            <td>${noteCell}</td>
            <td>${linkCell}</td>
            <td style="text-align:center;">${opCell}</td>`;
          } else {
            tr.innerHTML = `
            ${dateCell}
            <td class="td-type-cell"><div class="type-cell-row"><div class="type-cell-inner">${deliveryTypePickCell(entry)}</div></div></td>
            <td style="text-align:center;">${taskTimeSlotPickCell(entry)}</td>
            <td class="td-col-status">${taskStatusPickCell(entry)}</td>
            <td style="text-align:center;">${taskInlineTextInput('project_number', entry, 'text-align:center;')}</td>
            <td class="td-col-machine-unit">${taskInlineTextInput('machine_unit', entry, 'text-align:center;')}</td>
            <td>${taskInlineTextInput('product_name', entry)}</td>
            <td class="td-col-sales-rep">${taskInlineTextInput('sales_rep', entry, 'text-align:center;')}</td>
            <td>${taskInlineTextInput('mfg_rep', entry)}</td>
            <td>${noteCell}</td>
            <td>${linkCell}</td>
            <td style="text-align:center;">${opCell}</td>`;
          }
          tbody.appendChild(tr);
        });
      }
    }

    m++;
    if (m > 12) { m = 1; y++; }
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('delivery-table').style.display = '';
  applyPendingScroll();
  scheduleMidnightCalendarRefresh();
}

function localTodayYmd() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** 表示中の「今日」行の data-date が実日付とずれていれば再描画（0時跨ぎ・スリープ復帰用） */
function refreshTodayRowIfDateChanged() {
  const mark = document.querySelector('tr.today');
  if (!mark) return;
  if (mark.getAttribute('data-date') !== localTodayYmd()) {
    renderCalendar();
  }
}

function scheduleMidnightCalendarRefresh() {
  if (midnightRenderTimer) {
    clearTimeout(midnightRenderTimer);
    midnightRenderTimer = null;
  }
  const now = new Date();
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 3, 0) - now;
  midnightRenderTimer = setTimeout(() => {
    midnightRenderTimer = null;
    refreshTodayRowIfDateChanged();
    scheduleMidnightCalendarRefresh();
  }, Math.max(ms, 1000));
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const map = { all: 'filter-all', '入荷': 'filter-nyuuka', '出荷': 'filter-shukka' };
  document.getElementById(map[filter]).classList.add('active');
  renderCalendar();
}
