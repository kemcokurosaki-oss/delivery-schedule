function bindTableOverlayListeners() {
  const tbody = document.getElementById('table-body');
  if (!tbody || tbody.dataset.overlayBound) return;
  tbody.dataset.overlayBound = '1';
  tbody.addEventListener('mousedown', e => {
    const inp = e.target.closest('input.task-inline-input.ghost');
    if (!inp || !tbody.contains(inp)) return;
    const trG = inp.closest('tr.row-from-task');
    if (trG && trG.dataset.taskCompleted === '1') return;
    if (inp.readOnly) e.preventDefault();
  }, true);
  tbody.addEventListener('click', e => {
    const dateTrig = e.target.closest('.task-shipment-date-trigger');
    if (dateTrig) {
      const tr = dateTrig.closest('tr.row-from-task');
      if (tr && tr.dataset.taskCompleted === '1') return;
      const tid = dateTrig.dataset.taskId;
      if (tid) openTaskShipmentDateModal(Number(tid));
    }
  });
  tbody.addEventListener('dblclick', e => {
    const trBlock = e.target.closest('tr.row-from-task');
    if (trBlock && trBlock.dataset.taskCompleted === '1') return;
    const inp = e.target.closest('input.task-inline-input.ghost');
    if (inp && tbody.contains(inp)) {
      const tr = inp.closest('tr.row-from-task') || inp.closest('tr.row-manual-delivery');
      if (tr) {
        if (tr.dataset.deliveryCompleted === '1') return;
        e.preventDefault();
        inp.readOnly = false;
        inp.focus();
        try {
          inp.select();
        } catch (_) {}
        return;
      }
    }
    const btn = e.target.closest('.task-pick-display');
    if (!btn) return;
    const wrap = btn.closest('[data-pick-wrap]');
    const tr = wrap && (wrap.closest('tr.row-from-task') || wrap.closest('tr.row-manual-delivery'));
    if (!wrap || !tr) return;
    if (tr.dataset.deliveryCompleted === '1' && wrap.getAttribute('data-pick-wrap') !== 'status') return;
    if (wrap.getAttribute('data-pick-wrap') === 'time_slot') {
      const editor = wrap.querySelector('.task-timeslot-editor');
      if (!editor) return;
      e.preventDefault();
      btn.style.display = 'none';
      editor.style.display = 'flex';
      const tsSel = editor.querySelector('.task-timeslot-select');
      const tsCustom = editor.querySelector('.task-timeslot-custom');
      if (tsSel && tsSel.value === '__custom__' && tsCustom) {
        tsCustom.focus();
      } else if (tsSel) {
        tsSel.value = '__open_sentinel__';
        tsSel.focus();
      }
      return;
    }
    const sel = wrap.querySelector('select.task-pick-control');
    if (!sel) return;
    e.preventDefault();
    btn.style.display = 'none';
    sel.style.display = '';
    sel.focus();
  });
  tbody.addEventListener('change', e => {
    const t = e.target;
    // time_slot: selectで午前/午後/自由入力が選択されたとき（data-overlay属性がないので先に処理）
    if (t.classList && t.classList.contains('task-timeslot-select')) {
      const wrap = t.closest('[data-pick-wrap="time_slot"]');
      if (!wrap) return;
      const trTask2 = wrap.closest('tr.row-from-task');
      const trMan2 = wrap.closest('tr.row-manual-delivery');
      if (trTask2 && trTask2.dataset.taskCompleted === '1') return;
      const custom = wrap.querySelector('.task-timeslot-custom');
      const hidden = wrap.querySelector('input[type="hidden"][data-overlay="time_slot"]');
      const effectiveVal = t.value === '__open_sentinel__' ? '' : t.value;
      if (effectiveVal === '__custom__') {
        if (custom) { custom.style.display = ''; custom.focus(); }
      } else {
        if (hidden) hidden.value = effectiveVal;
        if (custom) { custom.style.display = 'none'; custom.value = ''; }
        collapseTimeslotEditor(wrap);
        if (trTask2) schedulePersistTaskOverlay(trTask2);
        else if (trMan2) schedulePersistDelivery(trMan2);
      }
      return;
    }
    if (!t || !t.dataset || !t.dataset.overlay) return;
    const trTask = t.closest('tr.row-from-task');
    const trMan = t.closest('tr.row-manual-delivery');
    if (trTask && trTask.dataset.taskCompleted === '1') return;
    if (trTask) schedulePersistTaskOverlay(trTask);
    else if (trMan) schedulePersistDelivery(trMan);
    if (t.tagName === 'SELECT' && t.classList.contains('task-pick-control')) {
      collapseTaskPickSelect(t);
      if (t.dataset.overlay === 'status') {
        const targetTr = trMan || trTask;
        if (targetTr) {
          if (t.value === '完了') {
            targetTr.classList.add('row-delivery-completed');
            targetTr.dataset.deliveryCompleted = '1';
          } else {
            targetTr.classList.remove('row-delivery-completed');
            delete targetTr.dataset.deliveryCompleted;
          }
        }
      }
    }
  });
  tbody.addEventListener('blur', e => {
    const t = e.target;
    // time_slot: selectのblur（—を再選択した場合など変更イベントが発火しないケース対応）
    if (t.classList && t.classList.contains('task-timeslot-select')) {
      const wrap = t.closest('[data-pick-wrap="time_slot"]');
      if (!wrap) return;
      // フォーカス先が同じラップ内（custom inputへの切替）なら閉じない
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      const trTask2 = wrap.closest('tr.row-from-task');
      const trMan2 = wrap.closest('tr.row-manual-delivery');
      if (trTask2 && trTask2.dataset.taskCompleted === '1') return;
      collapseTimeslotEditor(wrap);
      if (trTask2) schedulePersistTaskOverlay(trTask2);
      else if (trMan2) schedulePersistDelivery(trMan2);
      return;
    }
    // time_slot: 自由入力inputのblur
    if (t.classList && t.classList.contains('task-timeslot-custom')) {
      const wrap = t.closest('[data-pick-wrap="time_slot"]');
      if (!wrap) return;
      // フォーカス先が同じラップ内（selectへの切替）なら閉じない
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      const trTask2 = wrap.closest('tr.row-from-task');
      const trMan2 = wrap.closest('tr.row-manual-delivery');
      if (trTask2 && trTask2.dataset.taskCompleted === '1') return;
      const hidden = wrap.querySelector('input[type="hidden"][data-overlay="time_slot"]');
      if (hidden) hidden.value = t.value.trim();
      collapseTimeslotEditor(wrap);
      if (trTask2) schedulePersistTaskOverlay(trTask2);
      else if (trMan2) schedulePersistDelivery(trMan2);
      return;
    }
    const trTask = t.closest('tr.row-from-task');
    const trMan = t.closest('tr.row-manual-delivery');
    const tr = trTask || trMan;
    if (!tr) return;
    if (trTask && trTask.dataset.taskCompleted === '1') return;
    if (t.tagName === 'SELECT' && t.classList.contains('task-pick-control')) {
      collapseTaskPickSelect(t);
      if (trTask) schedulePersistTaskOverlay(trTask);
      else if (trMan) schedulePersistDelivery(trMan);
      return;
    }
    if (t.tagName === 'INPUT' && t.classList.contains('ghost')) {
      if (trTask) schedulePersistTaskOverlay(trTask);
      else if (trMan) schedulePersistDelivery(trMan);
      t.readOnly = true;
    }
  }, true);
  tbody.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const ghost = e.target.closest('input.task-inline-input.ghost');
      if (ghost && tbody.contains(ghost) && !ghost.readOnly) {
        e.preventDefault();
        ghost.blur();
        return;
      }
      const tsCustom = e.target.closest('.task-timeslot-custom');
      if (tsCustom && tbody.contains(tsCustom)) {
        e.preventDefault();
        tsCustom.blur();
        return;
      }
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trig = e.target.closest('.task-shipment-date-trigger');
    if (!trig || !tbody.contains(trig)) return;
    const trDt = trig.closest('tr.row-from-task');
    if (trDt && trDt.dataset.taskCompleted === '1') return;
    e.preventDefault();
    const tid = trig.dataset.taskId;
    if (tid) openTaskShipmentDateModal(Number(tid));
  });
}

/** rowspan の日付・曜日は先頭行のみ。同日の2行目以降をホバーしても日付列をハイライトする */
function bindDayHoverDateHighlight() {
  const tbody = document.getElementById('table-body');
  if (!tbody || tbody.dataset.dayHoverBound) return;
  tbody.dataset.dayHoverBound = '1';

  let activeDateStr = null;

  function clearDayHoverDateHighlight() {
    tbody.querySelectorAll('.td-date.day-date-dow-hover, .td-dow.day-date-dow-hover').forEach(td => {
      td.classList.remove('day-date-dow-hover');
    });
    activeDateStr = null;
  }

  function applyDayHoverDateHighlight(dateStr) {
    if (activeDateStr === dateStr) return;
    clearDayHoverDateHighlight();
    activeDateStr = dateStr;
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(dateStr) : dateStr;
    const rows = tbody.querySelectorAll(`tr[data-date="${esc}"]`);
    if (!rows.length) return;
    const first = rows[0];
    first.querySelectorAll('.td-date, .td-dow').forEach(td => {
      td.classList.add('day-date-dow-hover');
    });
  }

  tbody.addEventListener('mouseover', e => {
    const tr = e.target.closest('tr');
    if (!tr || !tbody.contains(tr)) return;
    if (tr.dataset.date) applyDayHoverDateHighlight(tr.dataset.date);
    else clearDayHoverDateHighlight();
  });
  tbody.addEventListener('mouseleave', () => {
    clearDayHoverDateHighlight();
  });
}

function hideDeliveryContextMenu() {
  const menu = document.getElementById('delivery-ctx-menu');
  if (!menu) return;
  menu.style.display = 'none';
  menu.setAttribute('aria-hidden', 'true');
}

function showDeliveryContextMenu(clientX, clientY, deliveryId, currentYmd) {
  const menu = document.getElementById('delivery-ctx-menu');
  if (!menu || !deliveryId) return;
  menu.dataset.deliveryId = deliveryId;
  menu.dataset.deliveryDate = currentYmd || '';
  menu.style.display = 'block';
  menu.setAttribute('aria-hidden', 'false');
  const w = menu.offsetWidth || 180;
  const h = menu.offsetHeight || 80;
  let x = clientX + 2;
  let y = clientY + 2;
  x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function bindManualDeliveryContextMenu() {
  const tbody = document.getElementById('table-body');
  if (!tbody || tbody.dataset.manualCtxBound) return;
  tbody.dataset.manualCtxBound = '1';
  tbody.addEventListener('contextmenu', e => {
    const tr = e.target.closest('tr.row-manual-delivery');
    if (!tr || !tbody.contains(tr)) return;
    e.preventDefault();
    const id = tr.dataset.deliveryId;
    const ymd = tr.dataset.deliveryDate || '';
    if (!id) return;
    showDeliveryContextMenu(e.clientX, e.clientY, id, ymd);
  });
}

function onDeliveryCtxChangeDate() {
  const menu = document.getElementById('delivery-ctx-menu');
  const id = menu && menu.dataset.deliveryId;
  const cur = menu && menu.dataset.deliveryDate;
  hideDeliveryContextMenu();
  if (!id) return;
  openDeliveryMoveDateModal(id, cur);
}

function onDeliveryCtxDelete() {
  const menu = document.getElementById('delivery-ctx-menu');
  const id = menu && menu.dataset.deliveryId;
  hideDeliveryContextMenu();
  if (!id) return;
  if (!confirm('このタスクを削除しますか？')) return;
  executeDeleteDelivery(id);
}

function openDeliveryMoveDateModal(deliveryId, currentYmd) {
  document.getElementById('delivery-move-date-id').value = deliveryId;
  const inp = document.getElementById('delivery-move-date-input');
  inp.value = (currentYmd || '').slice(0, 10);
  document.getElementById('delivery-move-date-overlay').classList.add('show');
  inp.focus();
}

function closeDeliveryMoveDateModal() {
  document.getElementById('delivery-move-date-overlay').classList.remove('show');
}

async function saveDeliveryMoveDate() {
  const rawId = document.getElementById('delivery-move-date-id').value;
  const newDate = document.getElementById('delivery-move-date-input').value;
  if (!rawId || !newDate) {
    showToast('日付を選んでください', 'error');
    return;
  }
  const entry = deliveries.find(e => String(e.id) === String(rawId));
  if (!entry) {
    showToast('データが見つかりません', 'error');
    closeDeliveryMoveDateModal();
    await loadAndRender();
    return;
  }
  const oldSlice = (entry.date || '').slice(0, 10);
  if (oldSlice === newDate) {
    closeDeliveryMoveDateModal();
    return;
  }
  const { error } = await sb
    .from('deliveries')
    .update({ date: newDate, updated_at: new Date().toISOString() })
    .eq('id', rawId);
  if (error) {
    showToast('日付の更新に失敗しました: ' + error.message, 'error');
    return;
  }
  closeDeliveryMoveDateModal();
  showToast('日付を変更しました', 'success');
  requestScrollAfterNextRender({ deliveryId: rawId });
  await loadAndRender();
}

async function executeDeleteDelivery(id) {
  if (id == null || id === '') return;
  const { error } = await sb.from('deliveries').delete().eq('id', id);
  if (error) {
    showToast('削除に失敗しました: ' + error.message, 'error');
    return;
  }
  deliveries = deliveries.filter(e => String(e.id) !== String(id));
  showToast('削除しました', 'success');
  renderCalendar();
}
