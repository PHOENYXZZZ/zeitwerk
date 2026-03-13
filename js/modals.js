//  EDIT ENTRY MODAL
// ============================================================
let _editId = null;
let _deleteTimers = {};

function editEntry(id) {
  const e = data.entries.find(x => String(x.id) === String(id));
  if (!e) return;
  _editId = id;

  document.getElementById('editDate').value = e.date || '';
  document.getElementById('editFrom').value = e.from || '';
  document.getElementById('editTo').value = e.to || '';
  document.getElementById('editBreak').value = e.breakMin || 0;
  document.getElementById('editTitle').value = e.title || '';
  document.getElementById('editNote').value = e.note || '';

  // Populate customer select
  const cSel = document.getElementById('editCustomer');
  cSel.innerHTML = '<option value="">– Kunde –</option>' +
    data.customers.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === e.customerId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');

  // Populate location select based on customer
  populateEditLocations(e.customerId, e.locationId);

  // Task
  document.getElementById('editTask').value = e.task || '';

  // Travel
  document.getElementById('editTravelMin').value = e.travelMin || 0;
  document.getElementById('editTravelKm').value = e.travelKm || 0;

  document.getElementById('editModalOverlay').classList.remove('hidden');
  // Dauer-Vorschau sofort aktualisieren
  updateDurPreview('editFrom','editTo','editBreak','editDurPreview');
}

function populateEditLocations(customerId, selectedId) {
  const lSel = document.getElementById('editLocation');
  const locs = customerId ? data.locations.filter(l => l.customerId === customerId) : data.locations;
  lSel.innerHTML = '<option value="">– Standort –</option>' +
    locs.map(l => `<option value="${escapeHtml(l.id)}" ${l.id === selectedId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('');
}

function closeEditModal() {
  document.getElementById('editModalOverlay').classList.add('hidden');
  _editId = null;
}

function saveEditEntry() {
  if (_editId === null) return;
  const e = data.entries.find(x => x.id === _editId);
  if (!e) return;

  const from = document.getElementById('editFrom').value;
  const to = document.getElementById('editTo').value;
  const date = document.getElementById('editDate').value;
  if (!date || !from || !to) { alert('Bitte Datum, Von und Bis ausfüllen.'); return; }
  // Prüfe ob Bis vor Von liegt
  const _fMins = toMin(from);
  const _tMins = toMin(to);
  if (_tMins < _fMins && !confirm('Achtung: "Bis" liegt vor "Von". Nachtschicht?\nOK = Speichern, Abbrechen = Korrigieren.')) return;

  e.date = date;
  e.from = from;
  e.to = to;
  e.breakMin = parseInt(document.getElementById('editBreak').value) || 0;
  e.title = document.getElementById('editTitle').value;
  e.note = document.getElementById('editNote').value;
  e.task = document.getElementById('editTask').value;

  const cSel = document.getElementById('editCustomer');
  e.customerId = cSel.value;
  e.customerName = cSel.options[cSel.selectedIndex]?.text || '';

  const lSel = document.getElementById('editLocation');
  e.locationId = lSel.value;
  e.locationName = lSel.options[lSel.selectedIndex]?.text || '';

  e.travelMin = parseInt(document.getElementById('editTravelMin').value) || 0;
  e.travelKm = parseFloat(document.getElementById('editTravelKm').value) || 0;
  e._modifiedAt = new Date().toISOString();

  // Überlappungswarnung
  const overlaps = findOverlappingEntries(e, e.id);
  if (overlaps.length > 0) {
    showToast(`⚠ Zeitüberschneidung mit ${overlaps.map(o => o.from + '–' + o.to).join(', ')}`, 'error');
  }
  save();
  renderEntries();
  renderSaldo();
  closeEditModal();
  if (getAutoSyncEnabled()) syncNow();
}

function deleteEntry(id) {
  const btn = document.querySelector(`button[data-delete-id="${id}"]`);
  if (!btn) return;

  if (_deleteTimers[id]) {
    // Zweiter Klick → wirklich löschen
    clearTimeout(_deleteTimers[id]);
    delete _deleteTimers[id];
    data.entries = data.entries.filter(e => String(e.id) !== String(id));
    // Tombstone: track deleted id so sync pull never brings it back
    if (!data.deletedIds) data.deletedIds = [];
    if (!data.deletedIds.includes(id)) data.deletedIds.push(id);
    save();
    renderEntries();
    renderSaldo();
    // Tombstone sofort pushen (ohne Pull, damit gelöschter Eintrag nicht zurückkommt)
    clearTimeout(syncPushTimer);
    _realtimePauseUntil = Date.now() + 5000; // Realtime-Pull unterdrücken
    syncPush();
  } else {
    // Erster Klick → Bestätigung anzeigen
    btn.classList.add('confirm');
    btn.textContent = 'Sicher?';
    _deleteTimers[id] = setTimeout(() => {
      delete _deleteTimers[id];
      // Eintrag noch vorhanden? Button zurücksetzen
      const b = document.querySelector(`button[data-delete-id="${id}"]`);
      if (b) { b.classList.remove('confirm'); b.textContent = '×'; }
    }, 2500);
  }
}

// ============================================================
//  SPLIT ENTRY
// ============================================================
let _splitParentId = null;
let _splitSegments = []; // [{ from, to, task, title }]

function openSplitModal(id) {
  const e = data.entries.find(x => String(x.id) === String(id));
  if (!e) return;
  _splitParentId = id;

  const totalMins = calcDuration(e.from, e.to, 0).total;
  const midMin = toMin(e.from) + Math.floor(totalMins / 2);

  _splitSegments = [
    { from: e.from, to: fromMin(midMin), task: e.task || '', title: e.title || '' },
    { from: fromMin(midMin), to: e.to,  task: e.task || '', title: e.title || '' }
  ];

  const cust = (e.customerName && e.customerName !== '– Kunde wählen –') ? e.customerName : '–';
  const loc  = (e.locationName && e.locationName !== '– Standort wählen –') ? ` · ${e.locationName}` : '';
  document.getElementById('splitInfoHeader').innerHTML =
    `<strong>${e.from} → ${e.to}</strong>  ·  ${escapeHtml(cust)}${escapeHtml(loc)}` +
    (e.task ? `  ·  <span class="entry-task ${taskClass(e.task)}" style="display:inline">${escapeHtml(e.task)}</span>` : '');

  renderSplitSegments();
  document.getElementById('splitModalOverlay').classList.remove('hidden');
}

function closeSplitModal() {
  document.getElementById('splitModalOverlay').classList.add('hidden');
  _splitParentId = null;
  _splitSegments = [];
}

function addSplitSegment() {
  if (_splitSegments.length === 0) return;
  const last = _splitSegments[_splitSegments.length - 1];
  const parent = data.entries.find(x => String(x.id) === String(_splitParentId));
  if (!parent) return;
  const lastToMin = toMin(last.to);
  const parentToMin = toMin(parent.to);
  if (lastToMin >= parentToMin) {
    showToast('Letztes Segment reicht bereits bis zum Ende.', 'error'); return;
  }
  const midMin = lastToMin + Math.floor((parentToMin - lastToMin) / 2);
  last.to = fromMin(midMin);
  _splitSegments.push({ from: fromMin(midMin), to: parent.to, task: parent.task || '', title: '' });
  renderSplitSegments();
}

function renderSplitSegments() {
  const list = document.getElementById('splitSegmentsList');
  const isLast = i => i === _splitSegments.length - 1;
  list.innerHTML = _splitSegments.map((seg, i) => {
    const durMins = toMin(seg.to) - toMin(seg.from);
    const durStr = durMins > 0 ? fmtDur(durMins) : '–';
    const isLastSeg = i === _splitSegments.length - 1;
    return `
    <div class="split-segment">
      <div class="split-segment-header">
        <span>Abschnitt ${i + 1}</span>
        <span class="split-seg-dur">${durStr}</span>
      </div>
      <div class="split-time-row">
        <div class="split-time-block split-time-readonly">
          <div class="split-field-label">Von</div>
          <input type="time" value="${seg.from}" readonly>
        </div>
        <span class="split-time-arrow">→</span>
        <div class="split-time-block">
          <div class="split-field-label">Bis${!isLastSeg ? ' <span style="color:var(--accent);font-size:0.6rem">✎</span>' : ''}</div>
          <input type="time" value="${seg.to}"
            ${isLastSeg ? 'readonly style="opacity:0.5"' : `onchange="updateSplitSegment(${i},'to',this.value)"`}>
        </div>
      </div>
      <div class="split-field">
        <div class="split-field-label">Tätigkeit</div>
        <select onchange="updateSplitSegment(${i},'task',this.value)">
          <option value="" ${!seg.task ? 'selected' : ''}>– Tätigkeit wählen –</option>
          <option value="Installation"    ${seg.task==='Installation'?'selected':''}>Installation</option>
          <option value="Wartung"          ${seg.task==='Wartung'?'selected':''}>Wartung</option>
          <option value="Störung"          ${seg.task==='Störung'?'selected':''}>Störung</option>
          <option value="Inbetriebnahme"   ${seg.task==='Inbetriebnahme'?'selected':''}>Inbetriebnahme</option>
          <option value="Planung"          ${seg.task==='Planung'?'selected':''}>Planung</option>
          <option value="Sonstiges"        ${seg.task==='Sonstiges'?'selected':''}>Sonstiges</option>
        </select>
      </div>
      <div class="split-field">
        <div class="split-field-label">Titel / Beschreibung</div>
        <input type="text" value="${escapeHtml(seg.title)}" placeholder="z.B. Schaltschrank Erdgeschoss"
          onchange="updateSplitSegment(${i},'title',this.value)">
      </div>
    </div>`;
  }).join('');
  updateSplitBalance();
}

function updateSplitSegment(i, field, val) {
  _splitSegments[i][field] = val;
  if (field === 'to' && i + 1 < _splitSegments.length) {
    _splitSegments[i + 1].from = val;
    renderSplitSegments();
    return;
  }
  updateSplitBalance();
}

function updateSplitBalance() {
  const parent = data.entries.find(x => String(x.id) === String(_splitParentId));
  if (!parent) return;
  const totalParent = calcDuration(parent.from, parent.to, 0).total;
  const totalSegs = _splitSegments.reduce((s, seg) => s + calcDuration(seg.from, seg.to, 0).total, 0);
  const diff = totalSegs - totalParent;
  const el = document.getElementById('splitBalance');
  if (diff === 0) {
    el.className = 'split-balance ok';
    el.textContent = `✓ Zeitbilanz korrekt: ${fmtDur(totalSegs)} (${_splitSegments.length} Segmente)`;
  } else {
    el.className = 'split-balance warn';
    el.textContent = `⚠ Zeitdifferenz: ${diff > 0 ? '+' : ''}${diff}min (Summe: ${fmtDur(totalSegs)}, Original: ${fmtDur(totalParent)})`;
  }
}

function confirmSplit() {
  const parent = data.entries.find(x => String(x.id) === String(_splitParentId));
  if (!parent) return;

  // 1. Validierung
  for (let i = 0; i < _splitSegments.length; i++) {
    const seg = _splitSegments[i];
    if (!seg.from || !seg.to) { showToast(`Segment ${i+1}: Von/Bis fehlt.`, 'error'); return; }
    if (toMin(seg.from) >= toMin(seg.to)) { showToast(`Segment ${i+1}: Von muss vor Bis liegen.`, 'error'); return; }
    if (i > 0 && seg.from !== _splitSegments[i-1].to) {
      showToast(`Lücke zwischen Segment ${i} und ${i+1}.`, 'error'); return;
    }
  }
  const totalParent = calcDuration(parent.from, parent.to, 0).total;
  const totalSegs = _splitSegments.reduce((s, seg) => s + calcDuration(seg.from, seg.to, 0).total, 0);
  if (Math.abs(totalSegs - totalParent) > 1) {
    showToast(`Zeitbilanz stimmt nicht (Diff: ${totalSegs - totalParent}min). Bitte korrigieren.`, 'error');
    return;
  }

  const n = _splitSegments.length;

  // 2. Neue Segmente erstellen und ZUERST speichern
  const newEntries = _splitSegments.map((seg, idx) => ({
    id: crypto.randomUUID(),
    date: parent.date,
    from: seg.from,
    to: seg.to,
    breakMin: 0,
    task: seg.task,
    title: seg.title,
    note: parent.note || '',
    customerId: parent.customerId,
    customerName: parent.customerName,
    locationId: parent.locationId,
    locationName: parent.locationName,
    user_code: parent.user_code,
    transferred: false,
    travelMin: idx === 0 ? (parent.travelMin || 0) : 0,
    travelKm: idx === 0 ? (parent.travelKm || 0) : 0
  }));

  newEntries.forEach(e => data.entries.unshift(e));
  data.entries.sort((a, b) => (b.date + b.from).localeCompare(a.date + a.from));
  save(); // Checkpoint 1: neue Einträge gesichert

  // 3. Original löschen
  const originalId = _splitParentId;
  const originalIndex = data.entries.findIndex(x => String(x.id) === String(originalId));
  if (originalIndex !== -1) data.entries.splice(originalIndex, 1);
  if (!data.deletedIds) data.deletedIds = [];
  if (!data.deletedIds.includes(originalId)) data.deletedIds.push(originalId);
  save(); // Checkpoint 2: Original gelöscht

  renderEntries();
  renderSaldo();
  closeSplitModal();
  showToast(`✓ In ${n} Segmente aufgeteilt`, 'success');
  if (getAutoSyncEnabled()) syncNow();
}
