// ============================================================
//  STATE
// ============================================================
let timerStart = null, timerInterval = null, onBreak = false, breakStart = null, totalBreakMs = 0;

let data = {
  entries: [],
  customers: [],   // [{id, name}]
  locations: []    // [{id, customerId, name}]
};

function load() {
  // Migration: zeitwerk_v2 → blitz_v2
  const legacy = localStorage.getItem('zeitwerk_v2');
  if (legacy) { localStorage.setItem('blitz_v2', legacy); localStorage.removeItem('zeitwerk_v2'); }
  const saved = localStorage.getItem('blitz_v2');
  if (saved) {
    try { data = JSON.parse(saved); }
    catch (e) {
      console.error('Gespeicherte Daten beschädigt – verwende leere Daten:', e);
      localStorage.removeItem('blitz_v2');
      data = { entries: [], customers: [], locations: [], deletedIds: [] };
    }
  }
  data.deletedIds = data.deletedIds || [];
  // Migration: Nummer-IDs → UUIDs (Entries, Kunden, Standorte)
  let migrated = false;
  for (const e of (data.entries || [])) {
    if (!isUUID(String(e.id))) {
      e.id = crypto.randomUUID();
      migrated = true;
    }
  }
  const idMap = {};
  for (const c of (data.customers || [])) {
    if (!isUUID(String(c.id))) {
      const oldId = String(c.id);
      c.id = crypto.randomUUID();
      idMap[oldId] = c.id;
      migrated = true;
    }
  }
  for (const l of (data.locations || [])) {
    if (!isUUID(String(l.id))) {
      l.id = crypto.randomUUID();
      migrated = true;
    }
    if (l.customerId && idMap[l.customerId]) l.customerId = idMap[l.customerId];
  }
  for (const e of (data.entries || [])) {
    if (e.customerId && idMap[e.customerId]) e.customerId = idMap[e.customerId];
  }
  if (migrated) { data.deletedIds = []; localStorage.setItem('blitz_v2', JSON.stringify(data)); }
}
let syncPushTimer;
function save() {
  localStorage.setItem('blitz_v2', JSON.stringify(data));
  if (typeof currentUser !== 'undefined' && currentUser && !syncBusy && getAutoSyncEnabled()) {
    clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(() => syncPush(), 5000);
  }
}

load();

// ============================================================
//  AUTO-SYNC
// ============================================================
const AUTO_SYNC_KEY = 'blitz_auto_sync';
function getAutoSyncEnabled() { return localStorage.getItem(AUTO_SYNC_KEY) === 'true'; }
function setAutoSyncEnabled(v) { localStorage.setItem(AUTO_SYNC_KEY, v ? 'true' : 'false'); }

// ============================================================
//  STUNDEN-SALDO (Über-/Minusstunden)
// ============================================================
let WOCHENSOLL_MIN = (parseFloat(localStorage.getItem('blitz_wochensoll')) || 39) * 60;

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekSollMins(mondayDate) {
  // Determine how many worked weekdays in the week (up to today)
  const today = new Date(); today.setHours(0,0,0,0);
  let sollMins = 0;
  for (let i = 0; i < 5; i++) { // Mo-Fr
    const d = new Date(mondayDate); d.setDate(mondayDate.getDate() + i);
    if (d <= today) sollMins += WOCHENSOLL_MIN / 5;
  }
  return sollMins;
}
