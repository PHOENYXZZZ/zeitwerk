
function renderSaldo() {
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today); monday.setDate(today.getDate() - dow);

  // Current week (exclude vacation entries from totals)
  const weekMins = data.entries
    .filter(e => e.date >= isoDate(monday) && e.task !== '__VACATION__')
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const weekSoll = getWeekSollMins(monday);
  const weekDiff = weekMins - weekSoll;

  // Current month (exclude vacation entries, use adjusted soll)
  const mStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const monthMins = data.entries
    .filter(e => e.date.startsWith(mStr) && e.task !== '__VACATION__')
    .reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  let monthSollMins = 0;
  const cur = new Date(today.getFullYear(), today.getMonth(), 1);
  while (cur <= today) {
    monthSollMins += getAdjustedDaySoll(isoDate(cur));
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
    const dayEntries = data.entries.filter(e => e.date === dayStr && e.task !== '__VACATION__')
      .sort((a,b) => a.from.localeCompare(b.from));
    const dayMins = dayEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    totalWeekMins += dayMins;
    const isToday = dayStr === todayStr;
    const vacation = isVacationDay(dayStr);
    const holidayName = getHolidayName(dayStr);

    html += `<div class="week-day-col${isToday ? ' week-day-today' : ''}">
      <div class="week-day-header">
        <div>
          <div class="week-day-name">${dayNames[i]}${vacation ? ' <span class="month-day-badge vacation-badge">Urlaub</span>' : ''}${holidayName ? ` <span class="month-day-badge holiday-badge">${escapeHtml(holidayName)}</span>` : ''}</div>
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
  const totalDays = new Date(y, m+1, 0).getDate();
  const mStr = `${y}-${String(m+1).padStart(2,'0')}`;

  document.getElementById('monthLabel').textContent =
    baseDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  // ── Mini-Kalender ──
  const firstDay = new Date(y, m, 1);
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const dayHeaders = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  let cal = `<div class="mini-cal-grid">`;
  dayHeaders.forEach(d => cal += `<div class="mini-cal-header">${d}</div>`);

  // Leading days from prev month
  for (let i = 0; i < startDow; i++) {
    const prevDate = new Date(y, m, 1 - (startDow - i));
    cal += buildMiniCalDay(prevDate, todayStr, true);
  }
  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    cal += buildMiniCalDay(new Date(y, m, d), todayStr, false);
  }
  // Trailing days
  const lastDay = new Date(y, m, totalDays);
  const endDow = lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1;
  for (let i = 1; i < 7 - endDow; i++) {
    cal += buildMiniCalDay(new Date(y, m, totalDays + i), todayStr, true);
  }
  cal += `</div>`;

  // ── Tages-Detailliste, gruppiert nach KW ──
  const dayNames = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  let totalMonthMins = 0;
  let dayListHtml = '';
  let currentKW = null;
  let kwMins = 0;

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(y, m, d);
    const dateStr = isoDate(date);
    const kw = getISOWeek(date);

    // KW group header
    if (kw !== currentKW) {
      if (currentKW !== null) {
        // Close previous week group with total
        dayListHtml += `<div class="month-week-group"><span>KW ${currentKW}</span><span class="month-week-group-val">${fmtDur(kwMins)}</span></div>`;
      }
      currentKW = kw;
      kwMins = 0;
    }

    const workEntries = data.entries.filter(e => e.date === dateStr && e.task !== '__VACATION__')
      .sort((a,b) => a.from.localeCompare(b.from));
    const dayMins = workEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
    totalMonthMins += dayMins;
    kwMins += dayMins;

    const isToday = dateStr === todayStr;
    const vacation = isVacationDay(dateStr);
    const holidayName = getHolidayName(dateStr);
    const hasContent = workEntries.length > 0 || vacation || holidayName;

    // Skip empty weekdays that are not holidays/vacation (keep weekends hidden if empty)
    if (!hasContent) continue;

    let headerClass = 'month-day-header';
    if (isToday) headerClass += ' today-header';
    else if (vacation) headerClass += ' vacation-header';
    else if (holidayName) headerClass += ' holiday-header';

    dayListHtml += `<div class="month-day-card" id="month-day-${dateStr}">
      <div class="${headerClass}">
        <div>
          <div class="month-day-name">${dayNames[date.getDay()]}</div>
          <div class="month-day-date">${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</div>
        </div>
        <div style="text-align:right">
          ${holidayName ? `<span class="month-day-badge holiday-badge">${escapeHtml(holidayName)}</span>` : ''}
          ${vacation ? `<span class="month-day-badge vacation-badge">Urlaub</span>` : ''}
          ${dayMins > 0 ? `<div class="month-day-total">${fmtDur(dayMins)}</div>` : ''}
        </div>
      </div>`;

    if (workEntries.length > 0) {
      dayListHtml += `<div class="month-day-entries">`;
      workEntries.forEach(e => {
        const dur = calcDuration(e.from, e.to, e.breakMin);
        const cust = (e.customerName && e.customerName !== '– Kunde wählen –') ? escapeHtml(e.customerName) : '–';
        const loc = (e.locationName && e.locationName !== '– Standort wählen –') ? ` · ${escapeHtml(e.locationName)}` : '';
        dayListHtml += `<div class="month-day-entry-row">
          <div style="font-size:0.7rem;color:var(--muted)">${escapeHtml(e.from)} → ${escapeHtml(e.to)}</div>
          <div>${cust}<span style="color:var(--muted);font-size:0.65rem">${loc}</span>
            ${e.task && e.task !== '__VACATION__' ? `<span class="entry-task ${taskClass(e.task)}" style="margin-left:0.3rem">${escapeHtml(e.task)}</span>` : ''}
            ${e.title ? `<div style="font-size:0.7rem;color:var(--text);margin-top:0.15rem">${escapeHtml(e.title)}</div>` : ''}
          </div>
          <div style="font-family:'Fraunces',serif;font-size:0.9rem;font-weight:300;color:var(--accent)">${dur.h}h ${String(dur.m).padStart(2,'0')}m</div>
        </div>`;
      });
      dayListHtml += `</div>`;
    } else if (!vacation && !holidayName) {
      dayListHtml += `<div class="month-day-empty">– kein Einsatz –</div>`;
    }

    // Vacation toggle button (only for weekdays, not holidays)
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6 && !holidayName) {
      dayListHtml += `<div class="month-day-actions">
        <button class="btn-vacation-toggle${vacation ? ' remove' : ''}" onclick="${vacation ? `removeVacationDay('${dateStr}');renderMonthView()` : `addVacationDay('${dateStr}');renderMonthView()`}">
          ${vacation ? '✕ Urlaub entfernen' : '☀ Als Urlaub markieren'}
        </button>
      </div>`;
    }

    dayListHtml += `</div>`;
  }

  // Close last KW group
  if (currentKW !== null) {
    dayListHtml += `<div class="month-week-group"><span>KW ${currentKW}</span><span class="month-week-group-val">${fmtDur(kwMins)}</span></div>`;
  }

  // Month total
  let monthTotal = `<div style="margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted)">Monatsgesamt</span>
    <span style="font-family:'Fraunces',serif;font-size:1.4rem;font-weight:300;color:var(--accent)">${fmtDur(totalMonthMins)}</span>
  </div>`;

  document.getElementById('monthGrid').innerHTML = cal + monthTotal + dayListHtml;

  // Auto-scroll to today
  if (monthOffset === 0) {
    setTimeout(() => {
      const todayCard = document.getElementById('month-day-' + todayStr);
      if (todayCard) todayCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
}

function buildMiniCalDay(date, todayStr, otherMonth) {
  const dateStr = isoDate(date);
  const workEntries = data.entries.filter(e => e.date === dateStr && e.task !== '__VACATION__');
  const hasEntries = workEntries.length > 0;
  const vacation = isVacationDay(dateStr);
  const holiday = isHoliday(dateStr);

  let cls = 'mini-cal-day';
  if (otherMonth) cls += ' other-month';
  if (dateStr === todayStr) cls += ' today';
  if (hasEntries) cls += ' has-entries';
  if (vacation) cls += ' vacation';
  if (holiday) cls += ' holiday';

  const title = holiday ? getHolidayName(dateStr) : (vacation ? 'Urlaub' : '');
  return `<div class="${cls}" data-date="${dateStr}" onclick="scrollToMonthDay('${dateStr}')" title="${escapeHtml(title)}">${date.getDate()}</div>`;
}

function scrollToMonthDay(dateStr) {
  const el = document.getElementById('month-day-' + dateStr);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  const yearEntries = data.entries.filter(e => e.date.startsWith(`${y}-`) && e.task !== '__VACATION__');
  const yearMins = yearEntries.reduce((s,e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const yearDays = [...new Set(yearEntries.map(e => e.date))].length;
  const yearCustomers = [...new Set(yearEntries.map(e => e.customerId).filter(Boolean))].length;
  const vacDays = getVacationDaysInYear(y);

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
    <div class="year-total-item">
      <div class="year-total-label">Urlaubstage</div>
      <div class="year-total-val" style="font-size:1.8rem;color:var(--blue)">${vacDays} / ${data.settings.annualVacationDays}</div>
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
