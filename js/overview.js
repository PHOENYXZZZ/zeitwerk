
function renderSaldo() {
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today); monday.setDate(today.getDate() - dow);

  // Current week
  const weekMins = data.entries
    .filter(e => e.date >= isoDate(monday))
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const weekSoll = getWeekSollMins(monday);
  const weekDiff = weekMins - weekSoll;

  // Current month
  const mStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const monthMins = data.entries
    .filter(e => e.date.startsWith(mStr))
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  let monthSollMins = 0;
  const cur = new Date(today.getFullYear(), today.getMonth(), 1);
  while (cur <= today) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) monthSollMins += WOCHENSOLL_MIN / 5;
    cur.setDate(cur.getDate() + 1);
  }
  const monthDiff = monthMins - monthSollMins;

  const wv = document.getElementById('saldoWeekVal');
  const ws = document.getElementById('saldoWeekSub');
  const mv = document.getElementById('saldoMonthVal');
  const ms = document.getElementById('saldoMonthSub');
  const ss = document.getElementById('saldoSollSub');
  const inp = document.getElementById('wochensollInput');

  if (wv) { wv.textContent = fmtSaldo(weekDiff); wv.className = `saldo-val ${saldoClass(weekDiff)}`; }
  if (ws) ws.textContent = `${fmtDur(weekMins)} von ${fmtDur(Math.round(weekSoll))}`;
  if (mv) { mv.textContent = fmtSaldo(monthDiff); mv.className = `saldo-val ${saldoClass(monthDiff)}`; }
  if (ms) ms.textContent = `${fmtDur(monthMins)} von ${fmtDur(Math.round(monthSollMins))}`;
  if (ss) ss.textContent = `Mo–Fr · ${(WOCHENSOLL_MIN/5/60).toFixed(2).replace('.','.')}h/Tag`;
  if (inp) inp.textContent = (WOCHENSOLL_MIN/60).toFixed(1);
}

// updateWochensoll removed – weekly hours are now per-user, set via admin panel

// ============================================================
//  ÜBERSICHT (Woche / Monat / Jahr)
// ============================================================
let uebersichtMode = 'week';
let weekOffset = 0;   // 0 = current week
let monthOffset = 0;  // 0 = current month
let yearOffset = 0;   // 0 = current year

function switchUebersicht(mode) {
  uebersichtMode = mode;
  document.querySelectorAll('.u-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('uTab-' + mode).classList.add('active');
  document.querySelectorAll('.u-view').forEach(v => v.style.display = 'none');
  document.getElementById('uView-' + mode).style.display = '';
  renderUebersicht();
}

function renderUebersicht() {
  if (uebersichtMode === 'week') renderWeekView();
  else if (uebersichtMode === 'month') renderMonthView();
  else renderYearView();
}

function navWeek(d) { weekOffset += d; renderWeekView(); }
function navMonth(d) { monthOffset += d; renderMonthView(); }
function navYear(d) { yearOffset += d; renderYearView(); }

function getWeekStart(offset) {
  const today = new Date();
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow + offset * 7);
  monday.setHours(0,0,0,0);
  return monday;
}

function renderWeekView() {
  const monday = getWeekStart(weekOffset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const todayStr = isoDate(new Date());

  document.getElementById('weekRangeLabel').textContent =
    monday.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' }) +
    ' – ' + sunday.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  const dayNames = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  let totalWeekMins = 0;
  let html = '';

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday); day.setDate(monday.getDate() + i);
    const dayStr = isoDate(day);
    const dayEntries = data.entries.filter(e => e.date === dayStr)
      .sort((a,b) => a.from.localeCompare(b.from));
    const dayMins = dayEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    totalWeekMins += dayMins;
    const isToday = dayStr === todayStr;

    html += `<div class="week-day-col${isToday ? ' week-day-today' : ''}">
      <div class="week-day-header">
        <div>
          <div class="week-day-name">${dayNames[i]}</div>
          <div class="week-day-date">${day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</div>
        </div>
        ${dayMins > 0 ? `<div class="week-day-total">${fmtDur(dayMins)}</div>` : ''}
      </div>
      <div class="week-entries">`;

    if (dayEntries.length === 0) {
      html += `<div class="week-day-empty">– kein Einsatz –</div>`;
    } else {
      dayEntries.forEach(e => {
        const dur = calcDuration(e.from, e.to, e.breakMin);
        const cust = (e.customerName && e.customerName !== '– Kunde wählen –') ? escapeHtml(e.customerName) : '–';
        const loc = (e.locationName && e.locationName !== '– Standort wählen –') ? ` · ${escapeHtml(e.locationName)}` : '';
        html += `<div class="week-entry-row">
          <div class="week-entry-time">${escapeHtml(e.from)} → ${escapeHtml(e.to)}</div>
          <div class="week-entry-customer">${cust}<span style="color:var(--muted);font-size:0.65rem">${loc}</span>
            ${e.task ? `<span class="entry-task ${taskClass(e.task)}" style="margin-left:0.3rem">${escapeHtml(e.task)}</span>` : ''}
            ${e.title ? `<div style="font-size:0.7rem;color:var(--text);margin-top:0.15rem">${escapeHtml(e.title)}</div>` : ''}
          </div>
          <div class="week-entry-dur">${dur.h}h ${String(dur.m).padStart(2,'0')}m</div>
        </div>`;
      });
    }

    html += `</div></div>`;
  }

  // Saldo for this week view
  const monday2 = getWeekStart(weekOffset);
  const weekSollM = weekOffset === 0 ? getWeekSollMins(monday2) : WOCHENSOLL_MIN;
  const weekDiffM = totalWeekMins - weekSollM;
  const diffColor = weekDiffM > 0 ? 'var(--green)' : weekDiffM < 0 ? 'var(--red)' : 'var(--accent)';

  html += `<div class="week-total-bar">
    <span class="week-total-label">Gesamte Woche</span>
    <span style="display:flex;gap:1.5rem;align-items:center">
      <span style="font-size:0.75rem;color:var(--muted)">Soll: ${fmtDur(Math.round(weekOffset===0?weekSollM:WOCHENSOLL_MIN))}</span>
      <span style="font-family:'Fraunces',serif;font-size:1rem;font-weight:300;color:${diffColor}">${fmtSaldo(weekDiffM)}</span>
      <span class="week-total-val">${fmtDur(totalWeekMins)}</span>
    </span>
  </div>`;

  document.getElementById('weekGrid').innerHTML = html;
  // Auto-Scroll zum heutigen Tag (nur aktuelle Woche, mit Delay wegen showPage scrollTo(0,0))
  if (weekOffset === 0) {
    setTimeout(() => {
      const todayEl = document.querySelector('.week-day-today');
      if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
}

function renderMonthView() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;
  const baseDate = new Date(year, month, 1);
  const y = baseDate.getFullYear(), m = baseDate.getMonth();
  const todayStr = isoDate(new Date());

  document.getElementById('monthLabel').textContent =
    baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  // Calendar grid: starts Monday
  const firstDay = new Date(y, m, 1);
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const totalDays = new Date(y, m+1, 0).getDate();

  const dayHeaders = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  let cal = `<div class="month-cal-grid">`;
  dayHeaders.forEach(d => cal += `<div class="month-cal-header-cell">${d}</div>`);

  // Fill leading blanks
  for (let i = 0; i < startDow; i++) {
    const prevDate = new Date(y, m, 1 - (startDow - i));
    const dayEntries = data.entries.filter(e => e.date === isoDate(prevDate));
    const dayMins = dayEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    cal += buildCalCell(prevDate, dayEntries, dayMins, true, isoDate(prevDate) === todayStr);
  }

  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(y, m, d);
    const dateStr = isoDate(date);
    const dayEntries = data.entries.filter(e => e.date === dateStr)
      .sort((a,b) => a.from.localeCompare(b.from));
    const dayMins = dayEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    cal += buildCalCell(date, dayEntries, dayMins, false, dateStr === todayStr);
  }

  // Trailing blanks
  const lastDay = new Date(y, m, totalDays);
  const endDow = lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1;
  for (let i = 1; i < 7 - endDow; i++) {
    const nextDate = new Date(y, m, totalDays + i);
    const dayEntries = data.entries.filter(e => e.date === isoDate(nextDate));
    const dayMins = dayEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    cal += buildCalCell(nextDate, dayEntries, dayMins, true, false);
  }

  cal += `</div>`;

  // Week summaries below calendar
  const monthEntries = data.entries.filter(e => e.date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`));
  const monthMins = monthEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);

  // Group by calendar week
  const weekMap = {};
  monthEntries.forEach(e => {
    const d = new Date(e.date + 'T12:00');
    const kw = getISOWeek(d);
    if (!weekMap[kw]) weekMap[kw] = 0;
    weekMap[kw] += calcDuration(e.from, e.to, e.breakMin).total;
  });

  let wSummary = `<div style="margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted)">Monatsgesamt</span>
    <span style="font-family:'Fraunces',serif;font-size:1.4rem;font-weight:300;color:var(--accent)">${fmtDur(monthMins)}</span>
  </div><div class="month-summary-list">`;

  Object.keys(weekMap).sort().forEach(kw => {
    wSummary += `<div class="month-summary-week">
      <span class="month-summary-week-label">KW ${kw}</span>
      <span class="month-summary-week-val">${fmtDur(weekMap[kw])}</span>
    </div>`;
  });
  wSummary += `</div>`;

  document.getElementById('monthGrid').innerHTML = cal + wSummary;
  // Auto-Scroll zur Heute-Zelle (nur aktueller Monat)
  if (monthOffset === 0) {
    setTimeout(() => {
      const todayCell = document.querySelector('.today-cell');
      if (todayCell) todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
}

function buildCalCell(date, entries, dayMins, otherMonth, isToday) {
  let cell = `<div class="month-cal-cell${otherMonth ? ' other-month' : ''}${isToday ? ' today-cell' : ''}">
    <div class="month-cal-cell-day">${date.getDate()}</div>`;
  const shown = entries.slice(0, 3);
  shown.forEach(e => {
    const cust = (e.customerName && e.customerName !== '– Kunde wählen –') ? e.customerName : '–';
    cell += `<span class="month-cal-entry-dot">${escapeHtml(e.from)} ${escapeHtml(cust)}</span>`;
  });
  if (entries.length > 3) cell += `<span style="font-size:0.58rem;color:var(--muted)">+${entries.length-3} weitere</span>`;
  if (dayMins > 0) cell += `<span class="month-cal-total">${fmtDur(dayMins)}</span>`;
  cell += `</div>`;
  return cell;
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

function renderYearView() {
  const now = new Date();
  const y = now.getFullYear() + yearOffset;
  document.getElementById('yearLabel').textContent = y;

  const yearEntries = data.entries.filter(e => e.date.startsWith(`${y}-`));
  const yearMins = yearEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const yearDays = [...new Set(yearEntries.map(e => e.date))].length;
  const yearCustomers = [...new Set(yearEntries.map(e => e.customerId).filter(Boolean))].length;

  // Totals panel
  let html = `<div class="year-total-panel">
    <div class="year-total-item">
      <div class="year-total-label">Gesamtstunden</div>
      <div class="year-total-val">${fmtDur(yearMins)}</div>
    </div>
    <div class="year-total-item">
      <div class="year-total-label">Arbeitstage</div>
      <div class="year-total-val" style="font-size:1.8rem">${yearDays}</div>
    </div>
    <div class="year-total-item">
      <div class="year-total-label">Kunden</div>
      <div class="year-total-val" style="font-size:1.8rem">${yearCustomers}</div>
    </div>
  </div>`;

  // Max month for bar scaling
  const monthTotals = Array.from({length:12}, (_,i) => {
    const mStr = `${y}-${String(i+1).padStart(2,'0')}`;
    const mEntries = yearEntries.filter(e => e.date.startsWith(mStr));
    return mEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  });
  const maxMins = Math.max(...monthTotals, 1);

  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  html += `<div class="year-month-grid">`;
  for (let mi = 0; mi < 12; mi++) {
    const mStr = `${y}-${String(mi+1).padStart(2,'0')}`;
    const mEntries = yearEntries.filter(e => e.date.startsWith(mStr));
    const mMins = monthTotals[mi];
    const mDays = [...new Set(mEntries.map(e => e.date))].length;

    // Customer breakdown for month
    const byC = {};
    mEntries.forEach(e => {
      const k = e.customerId || '__none__';
      const name = (e.customerName && e.customerName !== '– Kunde wählen –') ? e.customerName : '–';
      if (!byC[k]) byC[k] = { name, mins: 0 };
      byC[k].mins += calcDuration(e.from, e.to, e.breakMin).total;
    });
    const topC = Object.values(byC).sort((a,b) => b.mins - a.mins).slice(0,3);

    html += `<div class="year-month-card${mMins > 0 ? ' has-entries' : ''}">
      <div class="year-month-card-name">${monthNames[mi]}</div>
      ${mMins > 0 ? `
        <div class="year-month-hours">${fmtDur(mMins)}</div>
        <div class="year-month-stat">${mDays} Tag${mDays !== 1 ? 'e' : ''}</div>
        <div class="year-month-bar-wrap"><div class="year-month-bar" style="width:${Math.round(mMins/maxMins*100)}%"></div></div>
        <div class="year-month-customer-list">
          ${topC.map(c => `<div class="year-mc-row"><span class="year-mc-name">${escapeHtml(c.name)}</span><span class="year-mc-h">${fmtDur(c.mins)}</span></div>`).join('')}
        </div>
      ` : `<div style="font-size:0.72rem;color:var(--muted);margin-top:0.5rem">– kein Einsatz –</div>`}
    </div>`;
  }
  html += `</div>`;

  document.getElementById('yearGrid').innerHTML = html;
}

// ============================================================
