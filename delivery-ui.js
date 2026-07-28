// ─── モーダル（新規追加のみ）─────────────────────────────
function openModal(dateStr) {
  clearForm();
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = '入荷/出荷タスク追加';
  if (dateStr) document.getElementById('f-date').value = dateStr;
  overlay.classList.add('show');
  document.getElementById('f-date').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

function openTaskShipmentDateModal(taskId) {
  const now = Date.now();
  if (now - lastTaskShipmentDateModalOpen < 400) return;
  lastTaskShipmentDateModalOpen = now;
  const idStr = String(taskId);
  const meta = taskShipmentBases.find(t => String(t._taskId) === idStr);
  if (!meta) return;
  if (meta._taskIsCompleted) {
    showToast('工程表で完了済みのため、ここから出荷期間は変更できません', 'error');
    return;
  }
  document.getElementById('task-date-edit-id').value = idStr;
  document.getElementById('task-date-edit-start').value = meta._spanStart;
  document.getElementById('task-date-edit-end').value = meta._spanEnd;
  const pnEl = document.getElementById('task-date-edit-pn');
  if (pnEl) {
    pnEl.textContent = meta.project_number != null && String(meta.project_number).trim() !== ''
      ? String(meta.project_number)
      : '—';
  }
  document.getElementById('task-date-modal-overlay').classList.add('show');
  document.getElementById('task-date-edit-start').focus();
}

function closeTaskShipmentDateModal() {
  document.getElementById('task-date-modal-overlay').classList.remove('show');
}

async function saveTaskShipmentDate() {
  const rawId = document.getElementById('task-date-edit-id').value;
  const startIn = document.getElementById('task-date-edit-start').value;
  const endIn = document.getElementById('task-date-edit-end').value;
  if (!startIn || !endIn) {
    return;
  }
  const span = orderedSpan(startIn, endIn);
  if (!span) {
    return;
  }
  const taskId = Number(rawId);
  if (!rawId || Number.isNaN(taskId)) return;

  const { data, error } = await sb
    .from('tasks')
    .update({ start_date: span.start, end_date: span.end })
    .eq('id', taskId)
    .in('text', ['工場出荷', '梱包出荷'])
    .select('id');

  if (error) {
    return;
  }
  if (!data || !data.length) {
    return;
  }

  showToast('工程表の出荷期間を更新しました', 'success');
  closeTaskShipmentDateModal();
  requestScrollAfterNextRender({ taskId: taskId });
  await loadAndRender();
}

function clearForm() {
  ['f-date','f-type','f-time-slot','f-status','f-project-number',
   'f-machine-unit','f-product-name','f-sales-rep',
   'f-mfg-rep','f-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
  const customInp = document.getElementById('f-time-slot-custom');
  if (customInp) { customInp.value = ''; customInp.style.display = 'none'; }
  hideModalAutofillHints();
}

function toggleModalTimeslotCustom() {
  const sel = document.getElementById('f-time-slot');
  const inp = document.getElementById('f-time-slot-custom');
  if (!sel || !inp) return;
  if (sel.value === '__custom__') {
    inp.style.display = '';
    inp.focus();
  } else {
    inp.style.display = 'none';
    inp.value = '';
  }
}

function hideModalAutofillHints() {
  ['autofill-hint', 'autofill-hint-machine', 'autofill-hint-sales'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ─── 保存 ──────────────────────────────────────────────
async function saveEntry() {
  const date = document.getElementById('f-date').value;
  const type = document.getElementById('f-type').value;
  if (!date) return;
  if (!type) return;

  const payload = {
    date:           date,
    type:           type,
    time_slot:      (() => { const s = document.getElementById('f-time-slot'); return s.value === '__custom__' ? (document.getElementById('f-time-slot-custom').value.trim() || null) : (s.value || null); })(),
    status:         document.getElementById('f-status').value || null,
    project_number: document.getElementById('f-project-number').value || null,
    machine_unit:   document.getElementById('f-machine-unit').value || null,
    product_name:   document.getElementById('f-product-name').value || null,
    sales_rep:      document.getElementById('f-sales-rep').value || null,
    mfg_rep:        document.getElementById('f-mfg-rep').value || null,
    note:           document.getElementById('f-note').value || null,
    updated_at:     new Date().toISOString(),
  };

  const { data: inserted, error } = await sb.from('deliveries').insert(payload).select('id').maybeSingle();

  if (error) {
    showToast('保存に失敗しました: ' + error.message, 'error');
    return;
  }

  showToast('保存しました', 'success');
  closeModal();
  if (inserted && inserted.id != null) {
    requestScrollAfterNextRender({ deliveryId: inserted.id });
  }
  await loadAndRender();
}

// ─── 工事番号から自動補完（機械・営業担当のみ）─────────────────
function onProjectNumberInput() {
  clearTimeout(autoFillTimer);
  const pn = document.getElementById('f-project-number').value.trim();
  if (!pn) {
    hideModalAutofillHints();
    return;
  }
  autoFillTimer = setTimeout(() => autoFillFromTasks(pn), 600);
}

async function autoFillFromTasks(projectNumber) {
  hideModalAutofillHints();

  const { data } = await sb.from('tasks')
    .select('machine')
    .eq('project_number', projectNumber)
    .limit(50);

  if (document.getElementById('f-project-number').value.trim() !== projectNumber) return;

  const machineInput  = document.getElementById('f-machine-unit');
  const salesRepInput = document.getElementById('f-sales-rep');
  let filledMachine = false;
  let filledSales = false;

  if (data && data.length > 0) {
    const sample = data.find(t => t.machine) || data[0];
    if (!machineInput.value && sample.machine) {
      machineInput.value = sample.machine;
      filledMachine = true;
    }
  }
  if (!salesRepInput.value && salesPersonMap[projectNumber]) {
    salesRepInput.value = salesPersonMap[projectNumber];
    filledSales = true;
  }

  if (document.getElementById('f-project-number').value.trim() !== projectNumber) return;

  if (filledMachine || filledSales) {
    document.getElementById('autofill-hint').style.display = 'block';
    if (filledMachine) document.getElementById('autofill-hint-machine').style.display = 'block';
    if (filledSales) document.getElementById('autofill-hint-sales').style.display = 'block';
  }
}

// ─── 今日の日付へスクロール ────────────────────────────
function scrollToToday() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const row = document.querySelector(`tr[data-date="${todayStr}"]`);
  if (!row) return;
  // 今日の行をビューポートの上から約25%の位置に表示
  const targetY = Math.round(window.innerHeight * 0.25);
  const top = Math.max(0, window.pageYOffset + row.getBoundingClientRect().top - targetY);
  window.scrollTo({ top, behavior: 'instant' });
}

let saveBannerDismissTimer = null;
let saveBannerFallbackTimer = null;
let saveBannerAbort = null;
let saveBannerSession = 0;

function hideSaveBannerCompletely(banner) {
  banner.classList.remove('is-open', 'is-closing', 'is-success', 'is-error');
  banner.textContent = '';
  banner.setAttribute('aria-hidden', 'true');
}

// ─── 通知バナー（ページヘッダーと列ヘッダーの間）─────────────────
function showToast(msg, type = '') {
  const banner = document.getElementById('save-banner');
  if (!banner) return;
  if (saveBannerAbort) {
    saveBannerAbort.abort();
    saveBannerAbort = null;
  }
  if (saveBannerDismissTimer) {
    clearTimeout(saveBannerDismissTimer);
    saveBannerDismissTimer = null;
  }
  if (saveBannerFallbackTimer) {
    clearTimeout(saveBannerFallbackTimer);
    saveBannerFallbackTimer = null;
  }

  const session = ++saveBannerSession;

  saveBannerAbort = new AbortController();
  const sig = saveBannerAbort.signal;

  banner.classList.remove('is-closing', 'is-open');
  banner.textContent = msg;
  banner.className = 'save-banner ' + (type === 'error' ? 'is-error' : 'is-success');
  banner.removeAttribute('aria-hidden');
  void banner.offsetWidth;
  requestAnimationFrame(() => {
    banner.classList.add('is-open');
  });

  saveBannerDismissTimer = setTimeout(() => {
    saveBannerDismissTimer = null;
    if (session !== saveBannerSession) return;
    banner.classList.remove('is-open');
    banner.classList.add('is-closing');
    let finished = false;
    const done = () => {
      if (session !== saveBannerSession || finished) return;
      finished = true;
      hideSaveBannerCompletely(banner);
      if (saveBannerFallbackTimer) {
        clearTimeout(saveBannerFallbackTimer);
        saveBannerFallbackTimer = null;
      }
    };
    const onTe = ev => {
      if (ev.target !== banner) return;
      if (ev.propertyName !== 'transform' && ev.propertyName !== 'opacity') return;
      done();
    };
    try {
      banner.addEventListener('transitionend', onTe, { signal: sig, once: true });
    } catch {
      done();
      return;
    }
    saveBannerFallbackTimer = setTimeout(done, 500);
  }, 4000);
}

// ─── オーバーレイクリックで閉じる ─────────────────────
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('task-date-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeTaskShipmentDateModal();
});

document.getElementById('delivery-move-date-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDeliveryMoveDateModal();
});
document.getElementById('delivery-ctx-change-date').addEventListener('click', onDeliveryCtxChangeDate);
document.getElementById('delivery-ctx-delete').addEventListener('click', onDeliveryCtxDelete);
document.addEventListener('mousedown', e => {
  const menu = document.getElementById('delivery-ctx-menu');
  if (!menu || menu.style.display === 'none') return;
  if (menu.contains(e.target)) return;
  hideDeliveryContextMenu();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeHelp();
  hideDeliveryContextMenu();
  const dm = document.getElementById('delivery-move-date-overlay');
  if (dm && dm.classList.contains('show')) closeDeliveryMoveDateModal();
});

// ─── 使い方ガイド ────────────────────────────────────────
var HELP_TIPS = [
  { id: 'view-range',    title: '表示期間',      text: '前月〜翌6か月先までの計8か月分を表示', noBullets: true },
  { id: 'filter-all',    title: '全表示',        text: 'すべての入荷・出荷予定を表示します', noBullets: true },
  { id: 'filter-nyuuka', title: '入荷のみ',      text: '入荷予定の行だけに絞り込みます', noBullets: true },
  { id: 'filter-shukka', title: '出荷のみ',      text: '出荷予定の行だけに絞り込みます', noBullets: true },
  { id: 'help_btn',      title: '使い方ガイド',  text: '各所の説明吹き出しを表示します\n背景の暗い部分をクリックで閉じます', closeOnClick: true, noBullets: true },
];

function openHelp() {
  var helpBtn = document.getElementById('help_btn');
  if (helpBtn.classList.contains('help-active')) return;
  helpBtn.classList.add('help-active');
  var guideBtn = document.getElementById('guide_btn');
  guideBtn.style.display = '';
  requestAnimationFrame(function() {
    var r = helpBtn.getBoundingClientRect();
    guideBtn.style.top  = (r.top + r.height / 2) + 'px';
    guideBtn.style.left = (r.left - guideBtn.offsetWidth - 12) + 'px';
  });
  var container = document.getElementById('help_tips_container');
  container.innerHTML = '<div id="help_overlay_bg"></div>';
  document.getElementById('help_overlay_bg').addEventListener('click', closeHelp);
  container.classList.add('open');

  HELP_TIPS.forEach(function(tipDef) {
    var el = document.getElementById(tipDef.id);
    if (!el) return;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    addHelpItem(container, tipDef, rect);
  });

  var tbl = document.getElementById('delivery-table');
  if (tbl) {
    var tr = tbl.getBoundingClientRect();
    if (tr.width > 0 && tr.height > 0) {
      var headerEl = document.querySelector('.header');
      var headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
      var clampedTop    = Math.max(tr.top, headerBottom);
      var clampedBottom = Math.min(tr.bottom, window.innerHeight);
      if (clampedBottom > clampedTop) {
        addHelpItem(container, {
          title: '入出荷一覧テーブル',
          text: 'セルをクリックして直接編集できます\n[工程表]タグ付きの行は工程表と連携した行\n手動追加行は右クリックで日付変更・削除が可能',
          wide: true
        }, { top: clampedTop, left: tr.left, right: tr.right, bottom: clampedBottom });
      }
    }
  }

  var addBtn = document.querySelector('.add-day');
  if (addBtn) {
    var abr = addBtn.getBoundingClientRect();
    if (abr.width > 0 && abr.height > 0) {
      addHelpItem(container, {
        title: '＋ 追加ボタン',
        text: 'クリックするとその日の入荷・出荷予定を手動追加できます',
        noBullets: true
      }, abr);
    }
  }

  var taskTag = document.querySelector('.task-source-tag');
  if (taskTag) {
    var ttr = taskTag.getBoundingClientRect();
    if (ttr.width > 0 && ttr.height > 0) {
      addHelpItem(container, {
        title: '[工程表] タグ',
        text: '工程表の「工場出荷」タスクから自動取り込みされた行\nクリックすると工程表の出荷期間を直接変更できます',
        noBullets: true
      }, ttr);
    }
  }
}

function formatHelpTipText(raw, noBullets) {
  if (raw == null || raw === '') return '';
  if (noBullets) {
    return String(raw).split(/\n/).map(function(l) { return l.replace(/^\s+|\s+$/g, ''); }).filter(function(l) { return l.length > 0; }).join('<br>');
  }
  var lines = String(raw).split(/\n/).map(function(l) { return l.replace(/^\s+|\s+$/g, ''); }).filter(function(l) { return l.length > 0; });
  if (lines.length <= 1) return lines[0] || '';
  return lines.map(function(l) { return '・' + l; }).join('<br>');
}

function addHelpItem(container, tip, rect) {
  var hl = document.createElement('div');
  hl.className = 'help-highlight';
  hl.style.top    = rect.top    + 'px';
  hl.style.left   = rect.left   + 'px';
  hl.style.width  = (rect.right  - rect.left) + 'px';
  hl.style.height = (rect.bottom - rect.top)  + 'px';
  if (tip.closeOnClick) {
    hl.style.cursor = 'pointer';
    hl.addEventListener('click', closeHelp);
  }
  container.appendChild(hl);

  var tipDiv = document.createElement('div');
  tipDiv.className = 'help-tip';
  if (tip.wide) tipDiv.classList.add('help-tip--wide');
  tipDiv.innerHTML = '<div class="help-tip-title">' + (tip.title || '') + '</div>' + formatHelpTipText(tip.text, tip.noBullets);
  container.appendChild(tipDiv);

  requestAnimationFrame(function() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var tw = tipDiv.offsetWidth;
    var th = tipDiv.offsetHeight;
    var top  = rect.bottom + 8;
    var left = rect.left;
    if (left + tw > vw - 8) left = vw - tw - 8;
    if (left < 4) left = 4;
    if (top + th > vh - 8) {
      top = rect.top - th - 8;
      if (top < 4) top = 4;
      tipDiv.classList.add('tip-above');
    }
    tipDiv.style.top  = top  + 'px';
    tipDiv.style.left = left + 'px';
  });

  hl.addEventListener('mouseenter', function() { tipDiv.classList.add('tip-visible'); });
  hl.addEventListener('mouseleave', function() { tipDiv.classList.remove('tip-visible'); });
}

function closeHelp() {
  var btn = document.getElementById('help_btn');
  if (btn) btn.classList.remove('help-active');
  var guideBtn = document.getElementById('guide_btn');
  if (guideBtn) guideBtn.style.display = 'none';
  var container = document.getElementById('help_tips_container');
  container.classList.remove('open');
  container.innerHTML = '';
}
// ===== 使い方ガイド ここまで =====

// ─── 起動 ──────────────────────────────────────────────
init();
