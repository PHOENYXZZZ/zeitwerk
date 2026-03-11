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
