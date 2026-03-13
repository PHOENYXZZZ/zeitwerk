//  INIT
// ============================================================
document.getElementById('manDate').value = isoDate(new Date());
document.getElementById('wochensollInput').textContent = (WOCHENSOLL_MIN/60).toFixed(1);
populateAllSelects();
renderEntries();
renderSaldo();
updateSyncTab();
initPinLock();
initQuickEntry();

// Sync is handled by restoreSession() above and Supabase realtime subscriptions

// ============================================================
//  QUICK ENTRY – Neu-Seite
// ============================================================
let _quickCustomerId = '', _quickCustomerName = '';

function initQuickEntry() {
  document.getElementById('quickDate').value = isoDate(new Date());
  updateQuickDate();
  renderQuickSaldo();
}

function quickDateShift(d) {
  const el = document.getElementById('quickDate');
  const cur = new Date(el.value + 'T12:00');
  cur.setDate(cur.getDate() + d);
  el.value = isoDate(cur);
  updateQuickDate();
}

function updateQuickDate() {
  const val = document.getElementById('quickDate').value;
  if (!val) return;
  const d = new Date(val + 'T12:00');
  const today = isoDate(new Date());
  const weekdays = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  document.getElementById('qd-weekday').textContent = val === today ? 'Heute' : weekdays[d.getDay()];
  document.getElementById('qd-date-val').textContent =
    d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('quickDateDisplay').classList.toggle('qd-today', val === today);
  document.getElementById('quickTodayLabel').textContent =
    d.toLocaleDateString('de-DE', { weekday: 'long' });
}

function updateQuickDuration() {
  const from = document.getElementById('quickFrom').value;
  const to   = document.getElementById('quickTo').value;
  const brk  = parseInt(document.getElementById('quickBreak').value) || 0;
  const el   = document.getElementById('quickDuration');
  if (from && to) {
    const dur = calcDuration(from, to, brk);
    if (dur.total > 0) {
      el.textContent = `${dur.h}h ${String(dur.m).padStart(2,'0')}m`;
      el.style.color = 'var(--green)';
    } else {
      el.textContent = '(ungültige Zeit)';
      el.style.color = 'var(--red)';
    }
  } else {
    el.innerHTML = '&nbsp;';
  }
}

function onQuickCustomerChange() {
  const sel = document.getElementById('quickCustomerSel');
  const newWrap = document.getElementById('quickNewCustWrap');
  const locWrap = document.getElementById('quickLocWrap');
  const newLocWrap = document.getElementById('quickNewLocWrap');
  const val = sel.value;

  if (val === '__new__') {
    _quickCustomerId = '';
    _quickCustomerName = '';
    newWrap.style.display = '';
    locWrap.style.display = 'none';
    newLocWrap.style.display = 'none';
    return;
  }

  newWrap.style.display = 'none';

  if (!val) {
    _quickCustomerId = '';
    _quickCustomerName = '';
    locWrap.style.display = 'none';
    newLocWrap.style.display = 'none';
    return;
  }

  const cust = data.customers.find(c => String(c.id) === String(val));
  _quickCustomerId = val;
  _quickCustomerName = cust ? cust.name : '';

  // Populate location select with this customer's known locations
  const locs = data.locations.filter(l => String(l.customerId) === String(val));
  const locSel = document.getElementById('quickLocSel');
  locSel.innerHTML = '<option value="">– Standort wählen –</option>' +
    locs.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('') +
    '<option value="__new__">+ Neuer Standort…</option>';
  locWrap.style.display = '';
  newLocWrap.style.display = 'none';
}

function onQuickLocChange() {
  const locSel = document.getElementById('quickLocSel');
  const newLocWrap = document.getElementById('quickNewLocWrap');
  newLocWrap.style.display = locSel.value === '__new__' ? '' : 'none';
}

function saveQuickEntry() {
  const date = document.getElementById('quickDate').value;
  const from = document.getElementById('quickFrom').value;
  const to   = document.getElementById('quickTo').value;
  if (!date || !from || !to) { alert('Bitte Datum, Von und Bis ausfüllen.'); return; }
  // Prüfe ob Bis vor Von liegt
  const _fMins = toMin(from);
  const _tMins = toMin(to);
  if (_tMins < _fMins && !confirm('Achtung: "Bis" liegt vor "Von". Nachtschicht?\nOK = Speichern, Abbrechen = Korrigieren.')) return;

  // New customer: create record on the fly
  const custSel = document.getElementById('quickCustomerSel');
  if (custSel.value === '__new__') {
    const newName = document.getElementById('quickNewCustInput').value.trim();
    if (!newName) { alert('Bitte Kundenname eingeben.'); return; }
    const newCust = { id: crypto.randomUUID(), name: newName };
    data.customers.push(newCust);
    _quickCustomerId = newCust.id;
    _quickCustomerName = newCust.name;
    save();
    populateAllSelects();
  }

  // Location: from select or new input
  const locSel = document.getElementById('quickLocSel');
  let locationId = '', locationName = '';
  if (locSel && _quickCustomerId) {
    if (locSel.value === '__new__') {
      const newLocName = document.getElementById('quickNewLocInput').value.trim();
      if (newLocName) {
        const newLoc = { id: crypto.randomUUID(), name: newLocName, customerId: _quickCustomerId };
        data.locations.push(newLoc);
        locationId = newLoc.id;
        locationName = newLoc.name;
        save();
        populateAllSelects();
      }
    } else if (locSel.value) {
      const existing = data.locations.find(l => String(l.id) === String(locSel.value));
      if (existing) { locationId = String(existing.id); locationName = existing.name; }
    }
  }

  addEntry({
    date, from, to,
    breakMin:     parseInt(document.getElementById('quickBreak').value) || 0,
    customerId:   _quickCustomerId,
    customerName: _quickCustomerName,
    locationId,
    locationName,
    task:         document.getElementById('quickTask').value,
    title:        document.getElementById('quickTitle').value,
    note:         document.getElementById('quickNote').value,
    travelMin:    parseInt(document.getElementById('quickTravelMin').value) || 0,
    travelKm:     parseFloat(document.getElementById('quickTravelKm').value) || 0,
  });

  // Reset Zeitfelder, Datum + Kunde bleiben
  document.getElementById('quickFrom').value = '';
  document.getElementById('quickTo').value   = '';
  document.getElementById('quickDuration').innerHTML = '&nbsp;';
  document.getElementById('quickTitle').value = '';
  document.getElementById('quickNote').value  = '';
  const quickLocSel = document.getElementById('quickLocSel');
  if (quickLocSel) quickLocSel.value = '';
  document.getElementById('quickNewLocWrap').style.display = 'none';
  document.getElementById('quickTravelMin').value = '0';
  document.getElementById('quickTravelKm').value = '0';

  // Erfolgs-Feedback
  const btn = document.getElementById('btnSaveQuick');
  btn.textContent = '✓ Gespeichert';
  btn.classList.add('saved');
  setTimeout(() => { btn.textContent = '+ Speichern'; btn.classList.remove('saved'); }, 1800);

  renderQuickSaldo();
}

function renderQuickSaldo() {
  const today = new Date();
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today); monday.setDate(today.getDate() - dow);
  const weekMins = data.entries.filter(e => e.date >= isoDate(monday) && e.task !== '__VACATION__')
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const diff = weekMins - getWeekSollMins(monday);
  const h = Math.floor(weekMins/60), m = weekMins%60;
  const pad = n => String(n).padStart(2,'0');
  const sign = diff >= 0 ? '+' : '−';
  const da = Math.abs(diff);
  const col = diff >= 0 ? 'var(--green)' : 'var(--red)';
  const el = document.getElementById('quickSaldoText');
  if (el) el.innerHTML =
    `Woche: <strong>${h}h ${pad(m)}m</strong> <span style="color:${col}">${sign}${Math.floor(da/60)}h${pad(da%60)}m</span>`;
}

function renderMehrSaldo() {
  // Week (exclude vacation entries)
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today); monday.setDate(today.getDate() - dow);
  const weekMins = data.entries.filter(e => e.date >= isoDate(monday) && e.task !== '__VACATION__')
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const weekDiff = weekMins - getWeekSollMins(monday);
  // Month (exclude vacation entries, use adjusted soll)
  const mStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const monthMins = data.entries.filter(e => e.date.startsWith(mStr) && e.task !== '__VACATION__')
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  let monthSoll = 0;
  const cur = new Date(today.getFullYear(), today.getMonth(), 1);
  while (cur <= today) { monthSoll += getAdjustedDaySoll(isoDate(cur)); cur.setDate(cur.getDate()+1); }
  const monthDiff = monthMins - monthSoll;

  const wv = document.getElementById('mehrWeekVal');
  const ws = document.getElementById('mehrWeekSub');
  const mv = document.getElementById('mehrMonthVal');
  const ms = document.getElementById('mehrMonthSub');
  if (wv) { wv.textContent = fmtSaldo(weekDiff); wv.className = `mehr-saldo-val ${saldoClass(weekDiff)}`; }
  if (ws) ws.textContent = fmtDur(weekMins);
  if (mv) { mv.textContent = fmtSaldo(monthDiff); mv.className = `mehr-saldo-val ${saldoClass(monthDiff)}`; }
  if (ms) ms.textContent = fmtDur(monthMins);

  // Vacation panel
  renderVacationPanel();
}

function renderVacationPanel() {
  const panel = document.getElementById('vacationPanel');
  if (!panel) return;
  const y = new Date().getFullYear();
  const used = getVacationDaysInYear(y);
  const total = data.settings.annualVacationDays;
  const remaining = total - used;
  const pct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;

  // Overtime calculation: sum all work mins this year - sum all soll mins for worked weekdays
  const yearStart = `${y}-01-01`;
  const todayStr = isoDate(new Date());
  const yearWorkMins = data.entries
    .filter(e => e.date >= yearStart && e.date <= todayStr && e.task !== '__VACATION__')
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  let yearSollMins = 0;
  const d = new Date(y, 0, 1);
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  while (d <= todayDate) {
    yearSollMins += getAdjustedDaySoll(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  const overtimeMins = yearWorkMins - yearSollMins + (data.settings.overtimeCarryoverMins || 0);

  panel.innerHTML = `
    <div class="vacation-header">
      <span class="vacation-header-label">Urlaub ${y}</span>
      <span class="vacation-count">${used} / ${total}</span>
    </div>
    <div class="vacation-bar-wrap">
      <div class="vacation-bar" style="width:${pct}%"></div>
    </div>
    <div class="vacation-details">
      <span>Resturlaub: ${remaining} Tage</span>
      <span>Feiertage: ${getHolidaysForYear(y).length}</span>
    </div>
    <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span class="vacation-header-label">Überstunden</span>
      <span class="overtime-val ${saldoClass(overtimeMins)}">${fmtSaldo(overtimeMins)}</span>
    </div>
    <div class="vacation-settings-row">
      <label>Jahresurlaub</label>
      <input type="number" min="0" max="50" value="${total}" onchange="updateVacationSettings('annualVacationDays', parseInt(this.value))">
      <label>ÜStd. Vortrag (h)</label>
      <input type="number" step="0.5" value="${((data.settings.overtimeCarryoverMins || 0)/60).toFixed(1)}" onchange="updateVacationSettings('overtimeCarryoverMins', Math.round(parseFloat(this.value)*60))">
    </div>`;
}

function updateVacationSettings(key, value) {
  if (isNaN(value)) return;
  data.settings[key] = value;
  save();
  renderVacationPanel();
}

// ============================================================
//  EINTRAG DUPLIZIEREN
// ============================================================
function duplicateEntry(id) {
  const e = data.entries.find(x => String(x.id) === String(id));
  if (!e) return;
  const copy = { ...e, id: crypto.randomUUID(), date: isoDate(new Date()) };
  data.entries.unshift(copy);
  save();
  renderEntries();
  renderSaldo();
  editEntry(copy.id); // Edit-Modal öffnen damit Datum angepasst werden kann
}


// ============================================================
