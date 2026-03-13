// ============================================================
//  SECURITY HELPERS
// ============================================================
// Prüft ob ein String eine gültige UUID ist
function isUUID(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// Konvertiert alte Timestamp-IDs zu UUIDs (für Migration alter localStorage-Daten)
function ensureUUID(id) {
  const s = String(id);
  if (isUUID(s)) return s;
  return crypto.randomUUID();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-show'));
  setTimeout(() => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 280); }, 2800);
}

// ── Live-Dauerberechnung ──────────────────────────────────
function updateDurPreview(fromId, toId, breakId, previewId) {
  const from = document.getElementById(fromId)?.value;
  const to   = document.getElementById(toId)?.value;
  const brk  = parseInt(document.getElementById(breakId)?.value) || 0;
  const el   = document.getElementById(previewId);
  if (!el) return;
  if (!from || !to) { el.textContent = ''; return; }
  const dur = calcDuration(from, to, brk);
  if (dur.total <= 0) { el.style.color = 'var(--red)'; el.textContent = '→ Zeitangabe prüfen'; return; }
  el.style.color = 'var(--accent)';
  el.textContent = `→ ${dur.h}h ${String(dur.m).padStart(2,'0')}m netto`;
}

// ============================================================
//  DURATION HELPER
// ============================================================
function calcDuration(from, to, breakMin) {
  let mins = toMin(to) - toMin(from) - (breakMin || 0);
  if (mins < 0) mins += 24 * 60;
  return { h: Math.floor(mins / 60), m: mins % 60, total: mins };
}

function fmtDur(total) {
  const h = Math.floor(total / 60), m = total % 60;
  return `${h}h ${String(m).padStart(2,'0')}m`;
}

function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fromMin(m) { return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }

function fmtSaldo(mins) {
  const abs = Math.abs(mins), h = Math.floor(abs/60), m = abs%60;
  return `${mins >= 0 ? '+' : '−'}${h}h ${String(m).padStart(2,'0')}m`;
}
function saldoClass(mins) { return mins > 0 ? 'saldo-plus' : mins < 0 ? 'saldo-minus' : 'saldo-neutral'; }

// ============================================================
//  TASK COLOR
// ============================================================
function taskClass(task) {
  if (!task) return 'task-other';
  const t = task.toLowerCase();
  if (t.includes('install')) return 'task-installation';
  if (t.includes('wart')) return 'task-wartung';
  if (t.includes('stör') || t.includes('stor')) return 'task-stoerung';
  return 'task-other';
}

// ============================================================
//  GERMAN HOLIDAYS (Feiertage)
// ============================================================
function computeEaster(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getGermanHolidays(year) {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const easter = computeEaster(year);

  return [
    { date: `${year}-01-01`, name: 'Neujahr' },
    { date: fmt(addDays(easter, -2)), name: 'Karfreitag' },
    { date: fmt(addDays(easter, 1)), name: 'Ostermontag' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit' },
    { date: fmt(addDays(easter, 39)), name: 'Christi Himmelfahrt' },
    { date: fmt(addDays(easter, 50)), name: 'Pfingstmontag' },
    { date: `${year}-10-03`, name: 'Tag der Dt. Einheit' },
    { date: `${year}-12-25`, name: '1. Weihnachtstag' },
    { date: `${year}-12-26`, name: '2. Weihnachtstag' },
  ];
}

// Cache holidays per year for performance
const _holidayCache = {};
function getHolidaysForYear(year) {
  if (!_holidayCache[year]) _holidayCache[year] = getGermanHolidays(year);
  return _holidayCache[year];
}

function isHoliday(dateStr) {
  const year = parseInt(dateStr.substring(0, 4));
  return getHolidaysForYear(year).some(h => h.date === dateStr);
}

function getHolidayName(dateStr) {
  const year = parseInt(dateStr.substring(0, 4));
  const h = getHolidaysForYear(year).find(h => h.date === dateStr);
  return h ? h.name : null;
}

function isVacationDay(dateStr) {
  return data.entries.some(e => e.date === dateStr && e.task === '__VACATION__');
}

// Adjusted daily soll: returns 0 for weekends, holidays, vacation days
function getAdjustedDaySoll(dateStr) {
  if (isHoliday(dateStr) || isVacationDay(dateStr)) return 0;
  const dow = new Date(dateStr + 'T12:00').getDay();
  if (dow === 0 || dow === 6) return 0;
  return WOCHENSOLL_MIN / 5;
}

// Vacation helpers
function addVacationDay(dateStr) {
  if (isVacationDay(dateStr)) return;
  data.entries.push({
    id: crypto.randomUUID(),
    date: dateStr,
    from: '00:00',
    to: '00:00',
    breakMin: 0,
    task: '__VACATION__',
    title: 'Urlaub',
    customerId: null, customerName: null,
    locationId: null, locationName: null,
    note: ''
  });
  save();
}

function removeVacationDay(dateStr) {
  data.entries = data.entries.filter(e => !(e.date === dateStr && e.task === '__VACATION__'));
  save();
}

function getVacationDaysInYear(year) {
  return data.entries.filter(e => e.date.startsWith(`${year}-`) && e.task === '__VACATION__').length;
}
