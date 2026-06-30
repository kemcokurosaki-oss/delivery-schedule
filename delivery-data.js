function gatherOverlayPayloadFromRow(tr) {
  const get = key => {
    const el = tr.querySelector(`[data-overlay="${key}"]`);
    if (!el) return null;
    const raw = el.value != null ? String(el.value).trim() : '';
    return raw === '' ? null : raw;
  };
  return {
    time_slot: get('time_slot'),
    status: get('status'),
    mfg_rep: get('mfg_rep'),
    product_name: get('product_name'),
    note: get('note'),
  };
}

/** 補完が実質空なら DB 行を削除する（既定の「予定」のみ等） */
function shouldDeleteOverlayRow(data) {
  const textKeys = ['time_slot', 'mfg_rep', 'product_name', 'note'];
  if (textKeys.some(k => data[k])) return false;
  if (data.status === '確定') return false;
  return true;
}

function schedulePersistTaskOverlay(tr) {
  const id = tr.dataset.taskId;
  if (!id) return;
  const prev = overlaySaveTimers.get(id);
  if (prev) clearTimeout(prev);
  overlaySaveTimers.set(id, setTimeout(() => {
    overlaySaveTimers.delete(id);
    persistTaskRowOverlay(tr);
  }, 400));
}

async function persistTaskRowOverlay(tr) {
  const rawId = tr.dataset.taskId;
  const taskId = Number(rawId);
  if (!rawId || Number.isNaN(taskId)) return;

  const gathered = gatherOverlayPayloadFromRow(tr);
  const base = taskShipmentBases.find(b => String(b._taskId) === String(taskId));

  if (gathered.status === '完了') {
    const { error } = await sb.from('tasks').update({ is_completed: true }).eq('id', taskId);
    if (error) {
      showToast('完了の保存に失敗しました: ' + error.message, 'error');
      await loadAndRender();
      return;
    }
    if (base) base._taskIsCompleted = true;
    await loadAndRender();
    return;
  }

  if (base && base._taskIsCompleted) {
    const { error } = await sb.from('tasks').update({ is_completed: false }).eq('id', taskId);
    if (error) {
      showToast('完了解除の保存に失敗しました: ' + error.message, 'error');
      await loadAndRender();
      return;
    }
    if (base) base._taskIsCompleted = false;
  }

  if (shouldDeleteOverlayRow(gathered)) {
    if (!taskOverlaysMap.has(String(taskId))) return;
    const { error } = await sb.from('task_shipment_overlays').delete().eq('task_id', taskId);
    if (error) {
      await loadAndRender();
      return;
    }
    taskOverlaysMap.delete(String(taskId));
  } else {
    const existing = taskOverlaysMap.get(String(taskId));
    const payload = {
      task_id: taskId,
      time_slot: gathered.time_slot,
      status: gathered.status === '確定' ? '確定' : null,
      sales_rep: gathered.sales_rep,
      mfg_rep: gathered.mfg_rep,
      product_name: gathered.product_name,
      note: gathered.note,
    };
    const { data: savedRows, error } = await sb
      .from('task_shipment_overlays')
      .upsert(payload, { onConflict: 'task_id' })
      .select();
    if (error) {
      await loadAndRender();
      return;
    }
    const saved = savedRows && savedRows[0];
    taskOverlaysMap.set(String(taskId), saved || { ...payload });
  }

  const meta = taskShipmentBases.find(b => String(b._taskId) === String(taskId));
  const overlayRow = taskOverlaysMap.get(String(taskId));
  if (meta) {
    taskShipments = taskShipments.map(row =>
      row._fromTask && String(row._taskId) === String(taskId)
        ? buildTaskShipmentDisplayRow(meta, row.date, overlayRow)
        : row
    );
  }
}

function gatherDeliveryPayloadFromRow(tr) {
  const get = key => {
    const el = tr.querySelector(`[data-overlay="${key}"]`);
    if (!el) return null;
    const raw = el.value != null ? String(el.value).trim() : '';
    return raw === '' ? null : raw;
  };
  return {
    type: get('type'),
    time_slot: get('time_slot'),
    status: get('status'),
    project_number: get('project_number'),
    machine_unit: get('machine_unit'),
    product_name: get('product_name'),
    sales_rep: get('sales_rep'),
    mfg_rep: get('mfg_rep'),
    note: get('note'),
  };
}

function schedulePersistDelivery(tr) {
  const id = tr.dataset.deliveryId;
  if (!id) return;
  const prev = deliverySaveTimers.get(id);
  if (prev) clearTimeout(prev);
  deliverySaveTimers.set(id, setTimeout(() => {
    deliverySaveTimers.delete(id);
    persistDeliveryRow(tr);
  }, 400));
}

async function persistDeliveryRow(tr) {
  const rawId = tr.dataset.deliveryId;
  if (!rawId) return;

  const gathered = gatherDeliveryPayloadFromRow(tr);
  const typeVal = (gathered.type && String(gathered.type).trim()) || null;
  if (!typeVal) {
    await loadAndRender();
    return;
  }

  const payload = {
    type: typeVal,
    time_slot: gathered.time_slot,
    status: gathered.status || null,
    project_number: gathered.project_number,
    machine_unit: gathered.machine_unit,
    product_name: gathered.product_name,
    sales_rep: gathered.sales_rep,
    mfg_rep: gathered.mfg_rep,
    note: gathered.note,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('deliveries').update(payload).eq('id', rawId);
  if (error) {
    showToast('保存に失敗しました: ' + error.message, 'error');
    await loadAndRender();
    return;
  }

  const i = deliveries.findIndex(e => String(e.id) === String(rawId));
  const prevRow = i >= 0 ? { ...deliveries[i] } : null;
  if (i >= 0) Object.assign(deliveries[i], payload);
  const typeChanged = prevRow && (prevRow.type || '') !== (payload.type || '');
  const pnChanged =
    prevRow &&
    String(prevRow.project_number || '').trim() !== String(payload.project_number || '').trim();
  if (typeChanged || pnChanged) {
    requestScrollAfterNextRender({ deliveryId: rawId });
    renderCalendar();
  }
}

/** holidays.date が "YYYY/M/D" でもカレンダー日付（YYYY-MM-DD）と一致するよう正規化（工程表 gantt-resource.js と同じ） */
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

/** tasks の日付列 → YYYY-MM-DD */
function ymdFromTaskDate(raw) {
  if (raw == null) return null;
  const n = normalizeHolidayDate(raw);
  if (n) return n;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : (s.length >= 10 ? s.slice(0, 10) : null);
}

// ─── 初期化 ───────────────────────────────────────────
async function init() {
  const { data: hols, error: holErr } = await sb.from('holidays').select('date');
  if (holErr) { /* 祝日データは無くても一覧は利用可 */ }
  if (hols) {
    hols.forEach(r => {
      const ymd = normalizeHolidayDate(r.date);
      if (ymd) holidaySet.add(ymd);
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    refreshTodayRowIfDateChanged();
  });
  await loadAndRender();
  scrollToToday();
}

async function loadAndRender() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('delivery-table').style.display = 'none';

  const { startYear, startMonth, endYear, endMonth } = getViewRange();
  const startDate = `${startYear}-${String(startMonth).padStart(2,'0')}-01`;
  const lastDayEnd = new Date(endYear, endMonth, 0).getDate();
  const endDate   = `${endYear}-${String(endMonth).padStart(2,'0')}-${String(lastDayEnd).padStart(2,'0')}`;

  // sales_person_map を取得（deliveries と並列）
  const [
    { data, error },
    { data: spMapRow },
  ] = await Promise.all([
    sb.from('deliveries')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('created_at'),
    sb.from('app_settings')
      .select('value')
      .eq('key', 'sales_person_map')
      .maybeSingle(),
  ]);

  if (spMapRow && spMapRow.value) {
    try { salesPersonMap = JSON.parse(spMapRow.value); } catch { salesPersonMap = {}; }
  } else {
    salesPersonMap = {};
  }

  if (error) {
    pendingScrollSpec = null;
    return;
  }
  deliveries = data || [];

  // start_date 未使用のDBでは列追加が必要。終了日が表示範囲より後のタスクも拾い、期間と表示範囲の重なりで絞る
  const { data: taskData, error: taskErr } = await sb.from('tasks')
    .select('id, project_number, machine, text, start_date, end_date, is_completed')
    .eq('text', '工場出荷')
    .gte('end_date', startDate);

  if (taskErr) {
    taskShipmentBases = [];
    taskShipments = [];
    taskOverlaysMap = new Map();
  } else {
    const metas = (taskData || [])
      .map(t => {
        const endYmd = ymdFromTaskDate(t.end_date);
        if (!endYmd) return null;
        const startRaw = t.start_date != null ? ymdFromTaskDate(t.start_date) : null;
        const startYmd = startRaw || endYmd;
        const span = orderedSpan(startYmd, endYmd);
        if (!span) return null;
        if (!ymdRangeIntersection(span.start, span.end, startDate, endDate)) return null;
        return {
          _fromTask: true,
          _taskId: t.id,
          _spanStart: span.start,
          _spanEnd: span.end,
          project_number: t.project_number,
          machine_unit: t.machine,
          sales_rep: salesPersonMap[t.project_number] || null,
          _taskIsCompleted: !!t.is_completed,
        };
      })
      .filter(Boolean);

    taskShipmentBases = metas;
    taskOverlaysMap = new Map();
    const taskIds = [...new Set(metas.map(b => b._taskId).filter(id => id != null))];
    if (taskIds.length) {
      const { data: ovRows, error: ovErr } = await sb
        .from('task_shipment_overlays')
        .select('*')
        .in('task_id', taskIds);
      if (ovErr) {
        /* 補完なしで一覧表示 */
      } else if (ovRows) {
        ovRows.forEach(r => taskOverlaysMap.set(String(r.task_id), r));
      }
    }

    taskShipments = expandTaskShipmentsForView(metas, startDate, endDate);
  }

  renderCalendar();
  bindTableOverlayListeners();
  bindDayHoverDateHighlight();
  bindManualDeliveryContextMenu();
}
