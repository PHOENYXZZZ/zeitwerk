// ============================================================
//  MANUAL ENTRY
// ============================================================
function addManualEntry() {
  const date = document.getElementById('manDate').value;
  const from = document.getElementById('manFrom').value;
  const to = document.getElementById('manTo').value;
  if (!date || !from || !to) { alert('Bitte Datum, Von und Bis ausfüllen.'); return; }
  // Prüfe ob Bis vor Von liegt
  const _fMins = toMin(from);
  const _tMins = toMin(to);
  if (_tMins < _fMins && !confirm('Achtung: "Bis" liegt vor "Von". Nachtschicht?\nOK = Speichern, Abbrechen = Korrigieren.')) return;

  const custSel = document.getElementById('manCustomer');
  const locSel = document.getElementById('manLocation');

  addEntry({
    date, from, to,
    breakMin: parseInt(document.getElementById('manBreak').value) || 0,
    customerId: custSel.value,
    customerName: custSel.options[custSel.selectedIndex]?.text || '',
    locationId: locSel.value,
    locationName: locSel.options[locSel.selectedIndex]?.text || '',
    task: document.getElementById('manTask').value,
    title: document.getElementById('manTitle').value,
    note: document.getElementById('manNote').value,
    travelMin: parseInt(document.getElementById('manTravelMin').value) || 0,
    travelKm: parseFloat(document.getElementById('manTravelKm').value) || 0
  });

  ['manFrom', 'manTo', 'manNote', 'manTitle'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('manBreak').value = '0';
  document.getElementById('manTravelMin').value = '0';
  document.getElementById('manTravelKm').value = '0';
}

// ============================================================
//  ÜBERLAPPUNGSCHECK
// ============================================================
function findOverlappingEntries(entry, excludeId = null) {
  const nFrom = toMin(entry.from), nTo = toMin(entry.to);
  return data.entries.filter(e => {
    if (String(e.id) === String(excludeId)) return false;
    if (e.date !== entry.date) return false;
    return toMin(e.from) < nTo && toMin(e.to) > nFrom;
  });
}

function addEntry(e) {
  e.id = crypto.randomUUID();
  e._modifiedAt = new Date().toISOString();
  // Duplikat-Check: exakt gleicher Eintrag schon vorhanden?
  const dupKey = `${e.date}|${e.from}|${e.to}|${String(e.customerName||e.customerId||'')}|${e.task||''}`;
  const isDup = data.entries.some(x => {
    return `${x.date}|${x.from}|${x.to}|${String(x.customerName||x.customerId||'')}|${x.task||''}` === dupKey;
  });
  if (isDup) {
    showToast('Eintrag existiert bereits – nicht erneut hinzugefügt.', 'error');
    return;
  }
  // Überlappungswarnung
  const overlaps = findOverlappingEntries(e, e.id);
  if (overlaps.length > 0) {
    showToast(`⚠ Zeitüberschneidung mit ${overlaps.map(o => o.from + '–' + o.to).join(', ')}`, 'error');
  }
  data.entries.unshift(e);
  data.entries.sort((a, b) => (b.date + b.from).localeCompare(a.date + a.from));
  save();
  renderSaldo();
  if (getAutoSyncEnabled()) syncNow();
}

// deleteEntry + duplicateEntry defined below

// ============================================================
//  RENDER ENTRIES
// ============================================================
function getFilteredEntries() {
  const month       = document.getElementById('filterMonth')?.value || '';
  const customer    = document.getElementById('filterCustomer')?.value || '';
  const task        = document.getElementById('filterTask')?.value || '';
  const transferred = document.getElementById('filterTransferred')?.value || '';
  const search      = (document.getElementById('filterSearch')?.value || '').toLowerCase().trim();
  return data.entries.filter(e => {
    if (e.task === '__VACATION__') return false; // Hide vacation markers from entry list
    if (month && !e.date.startsWith(month)) return false;
    if (customer && String(e.customerId) !== String(customer)) return false;
    if (task && e.task !== task) return false;
    if (transferred === 'pending' && e.transferred) return false;
    if (transferred === 'done' && !e.transferred) return false;
    if (search) {
      const hay = [e.customerName, e.locationName, e.title, e.note, e.task].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function renderEntryCard(e) {
  const dur = calcDuration(e.from, e.to, e.breakMin);
  const breakInfo = e.breakMin > 0 ? `<div class="entry-break">${e.breakMin}min Pause</div>` : '';
  const travelInfo = (e.travelMin > 0 || e.travelKm > 0)
    ? `<div class="entry-travel">${e.travelMin ? e.travelMin + 'min' : ''}${e.travelMin && e.travelKm ? ' · ' : ''}${e.travelKm ? e.travelKm + 'km' : ''} Anfahrt</div>`
    : '';
  const titleStr = e.title ? `<div class="entry-title">${escapeHtml(e.title)}</div>` : '';
  const noteStr = e.note ? `<div class="entry-desc">${escapeHtml(e.note)}</div>` : '';
  const taskBadge = e.task ? `<span class="entry-task ${taskClass(e.task)}">${escapeHtml(e.task)}</span>` : '';
  const loc = e.locationName && e.locationName !== '– Standort wählen –' ? escapeHtml(e.locationName) : '';
  const cust = e.customerName && e.customerName !== '– Kunde wählen –' ? escapeHtml(e.customerName) : '–';
  const safeFrom = escapeHtml(e.from);
  const safeTo = escapeHtml(e.to);
  const safeId = escapeHtml(String(e.id));
  return `
    <div class="entry${e.transferred ? ' transferred' : ''}" id="entry-${safeId}">
      <div class="entry-left">
        <div class="entry-times">${safeFrom} <span>→</span> ${safeTo}</div>
      </div>
      <div class="entry-meta">
        <div class="entry-customer">${cust}${loc ? ` <span style="color:var(--muted)">·</span> <span class="entry-location">${loc}</span>` : ''}</div>
        ${taskBadge}${titleStr}${noteStr}
      </div>
      <div class="entry-right">
        <div class="entry-duration">${dur.h}h ${String(dur.m).padStart(2,'0')}m</div>
        ${breakInfo}${travelInfo}
        <button class="transfer-btn ${e.transferred ? 'done' : ''}" data-transfer-id="${safeId}"
          onclick="toggleTransferred('${safeId}')"
          title="${e.transferred ? 'Als ausstehend markieren' : 'Als übertragen markieren'}">✓</button>
      </div>
      <div class="entry-actions">
        <button class="entry-dup"    onclick="duplicateEntry('${safeId}')"  title="Kopieren">📋 <span class="btn-label">Kopieren</span></button>
        <button class="entry-split"  onclick="openSplitModal('${safeId}')"  title="Aufteilen">⚡ <span class="btn-label">Aufteilen</span></button>
        <button class="entry-edit"   onclick="editEntry('${safeId}')"       title="Bearbeiten">✎ <span class="btn-label">Bearbeiten</span></button>
        <button class="entry-delete" data-delete-id="${safeId}" onclick="deleteEntry('${safeId}')" title="Löschen">× <span class="btn-label">Löschen</span></button>
      </div>
    </div>`;
}

function renderEntries() {
  const list = document.getElementById('entriesList');
  if (!list) return;
  const filtered = getFilteredEntries();

  // Week summary
  const today = new Date();
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today); monday.setDate(today.getDate() - dow);
  const mondayStr = isoDate(monday);
  const weekMins = data.entries.filter(e => e.date >= mondayStr && e.task !== '__VACATION__')
    .reduce((s, e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const weekSollM = getWeekSollMins(monday);
  const weekDiffM = weekMins - weekSollM;
  const diffSign = weekDiffM >= 0 ? '+' : '−';
  const diffAbs = Math.abs(weekDiffM);
  const diffStr = `${diffSign}${Math.floor(diffAbs/60)}h${String(diffAbs%60).padStart(2,'0')}m`;
  const diffCol = weekDiffM > 0 ? 'var(--green)' : weekDiffM < 0 ? 'var(--red)' : 'var(--accent)';
  const el = document.getElementById('weekSummary');
  if (el) el.innerHTML = `Diese Woche: ${fmtDur(weekMins)} &nbsp;<span style="color:${diffCol};font-size:0.7rem">${diffStr}</span>`;

  // Filter chips + summary
  renderFilterChips();
  const totalMins = filtered.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const sumEl = document.getElementById('entriesSummary');
  if (sumEl) sumEl.textContent = filtered.length
    ? `${filtered.length} Einträge · ${fmtDur(totalMins)}`
    : '';
  const exportRow = document.getElementById('exportRow');
  if (exportRow) exportRow.style.display = filtered.length ? '' : 'none';

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state">Keine Einträge gefunden.</div>';
    return;
  }

  // Group by date
  const groups = {};
  filtered.forEach(e => { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
  const todayStr = isoDate(new Date());
  const yesterdayStr = isoDate(new Date(Date.now() - 86400000));
  const weekdays = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  list.innerHTML = Object.keys(groups).sort().reverse().map(date => {
    const entries = groups[date];
    const dayMins = entries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    const d = new Date(date + 'T12:00');
    const dateLabel = date === todayStr ? 'Heute'
      : date === yesterdayStr ? 'Gestern'
      : `${weekdays[d.getDay()]} · ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
    const pendingCount = entries.filter(e => !e.transferred).length;
    const pendingBadge = pendingCount > 0
      ? `<span class="day-pending">${pendingCount} offen</span>` : '';
    return `
      <div class="day-group">
        <div class="day-header">
          <span class="day-label">${dateLabel}${pendingBadge}</span>
          <span class="day-total">${fmtDur(dayMins)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem">
          ${entries.map(renderEntryCard).join('')}
        </div>
      </div>`;
  }).join('');
}

function toggleTransferred(id) {
  const e = data.entries.find(x => String(x.id) === String(id));
  if (!e) return;
  e.transferred = !e.transferred;
  e._modifiedAt = new Date().toISOString();
  save(); // debounced push via save()
  // Update in-place — no full re-render needed
  const btn = document.querySelector(`[data-transfer-id="${id}"]`);
  if (btn) {
    btn.classList.toggle('done', e.transferred);
    btn.title = e.transferred ? 'Als ausstehend markieren' : 'Als übertragen markieren';
  }
  const entryEl = document.getElementById(`entry-${id}`);
  if (entryEl) entryEl.classList.toggle('transferred', e.transferred);
  // Refresh day-header pending badge
  renderEntries();
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  if (!container) return;
  const mSel = document.getElementById('filterMonth');
  const cSel = document.getElementById('filterCustomer');
  const tSel = document.getElementById('filterTask');
  const search = document.getElementById('filterSearch')?.value?.trim();
  const chips = [];
  const trSel = document.getElementById('filterTransferred');
  if (mSel?.value) chips.push(`<span class="filter-chip">${mSel.options[mSel.selectedIndex].text} <button onclick="clearFilter('month')">×</button></span>`);
  if (cSel?.value) chips.push(`<span class="filter-chip">${cSel.options[cSel.selectedIndex].text} <button onclick="clearFilter('customer')">×</button></span>`);
  if (tSel?.value) chips.push(`<span class="filter-chip">${tSel.value} <button onclick="clearFilter('task')">×</button></span>`);
  if (trSel?.value) chips.push(`<span class="filter-chip">${trSel.options[trSel.selectedIndex].text} <button onclick="clearFilter('transferred')">×</button></span>`);
  if (search) chips.push(`<span class="filter-chip">„${escapeHtml(search)}" <button onclick="clearFilter('search')">×</button></span>`);
  container.innerHTML = chips.join('');
  const btn = document.getElementById('filterToggleBtn');
  const active = [mSel?.value, cSel?.value, tSel?.value, trSel?.value].filter(Boolean).length;
  if (btn) { btn.textContent = active ? `Filter (${active})` : 'Filter'; btn.classList.toggle('active', active > 0); }
}

function clearFilter(type) {
  if (type === 'month')       document.getElementById('filterMonth').value = '';
  if (type === 'customer')    document.getElementById('filterCustomer').value = '';
  if (type === 'task')        document.getElementById('filterTask').value = '';
  if (type === 'transferred') document.getElementById('filterTransferred').value = '';
  if (type === 'search')      document.getElementById('filterSearch').value = '';
  renderEntries();
}

function toggleFilterPanel() {
  const panel = document.getElementById('filterPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function populateFilterSelects() {
  const months = [...new Set(data.entries.map(e => e.date.slice(0, 7)))].sort().reverse();
  const mSel = document.getElementById('filterMonth');
  const cur = mSel.value;
  mSel.innerHTML = '<option value="">Alle Monate</option>' +
    months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${m === cur ? 'selected' : ''}>${label}</option>`;
    }).join('');

  const cSel = document.getElementById('filterCustomer');
  const curC = cSel.value;
  cSel.innerHTML = '<option value="">Alle Kunden</option>' +
    data.customers.map(c => `<option value="${escapeHtml(c.id)}" ${c.id == curC ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}

