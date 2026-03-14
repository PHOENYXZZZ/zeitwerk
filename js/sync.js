//  SUPABASE SYNC
// ============================================================
const SUPABASE_URL = 'https://iebdwwrdyipbyrkgikud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lACmpenof0zSNdiEW_5YQw_eiqoY-OU';

let _supabaseClient = null;
let currentUser = null;  // { id, code, name, role }
let syncBusy = false;
let _realtimeChannel = null;
let _realtimeMasterdataChannel = null;
let _realtimePauseUntil = 0; // Timestamp-basiert statt Boolean (verhindert Race-Conditions)
let _syncRetryCount = 0;
let _syncRetryTimer = null;
let _lastSyncAt = null; // ISO timestamp des letzten erfolgreichen Pull
let _syncQueued = false; // Queue: wenn syncBusy, nach Ende nachholen

function getSupabase() {
  if (!_supabaseClient) {
    _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}


// Restore session from localStorage via secure RPC
(function restoreSession() {
  const sb = getSupabase();
  const savedCode = localStorage.getItem('blitz_user_code');
  const savedId   = localStorage.getItem('blitz_user_id');
  if (!savedCode || !savedId) { renderSyncPage(); return; }
  sb.rpc('login_with_code', { p_code: savedCode }).then(({ data: profile, error }) => {
    if (profile && !error) {
      currentUser = { id: profile.id, code: profile.code, name: profile.name, role: profile.role, weekly_hours: profile.weekly_hours || 39 };
      WOCHENSOLL_MIN = (currentUser.weekly_hours) * 60;
      localStorage.setItem('blitz_wochensoll', currentUser.weekly_hours);
      updateAdminUI(); updateSyncTab(); renderSyncPage();
      // syncNow: Pull zuerst (Server-Stand holen), dann Push (lokale Änderungen hochladen)
      syncNow().then(() => { renderEntries(); renderSaldo(); populateAllSelects(); });
      setupRealtimeSync();
    } else {
      localStorage.removeItem('blitz_user_code'); localStorage.removeItem('blitz_user_id');
      renderSyncPage();
    }
  });
})();

function setSyncStatus(state, text, sub) {
  const bar = document.getElementById('syncStatusBar');
  const icon = document.getElementById('syncStatusIcon');
  const txt = document.getElementById('syncStatusText');
  const last = document.getElementById('syncLastSync');
  const dot = document.getElementById('headerSyncDot');
  if (bar) {
    bar.className = `sync-status-bar sync-${state}`;
    const icons = { idle: '○', ok: '✓', busy: '⟳', error: '✕', pending: '⏳' };
    if (icon) { icon.textContent = icons[state] || '○'; icon.className = state === 'busy' ? 'spin' : ''; }
    if (txt) txt.textContent = text;
    if (sub && last) last.textContent = sub;
  }
  if (dot) {
    const dotIcons = { idle: '', ok: '✓ Sync', busy: '⟳ Sync', error: '✕ Sync', pending: '⏳ Sync' };
    const dotColors = { idle: 'var(--muted)', ok: 'var(--green)', busy: 'var(--accent)', error: 'var(--red)', pending: 'var(--accent2)' };
    dot.textContent = dotIcons[state] || '';
    dot.style.color = dotColors[state] || 'var(--muted)';
  }
  const bnavIcon = document.getElementById('bnavSyncIcon');
  if (bnavIcon) {
    bnavIcon.textContent = state === 'ok' ? '✓' : state === 'error' ? '✕' : state === 'busy' ? '⟳' : '☁';
  }
}

function updateSyncTab() {
  const tab = document.getElementById('syncTab');
  if (!tab) return;
  tab.textContent = currentUser ? '✓ Sync' : '☁ Sync';
  tab.style.color = currentUser ? 'var(--green)' : '';
}

function renderSyncPage() {
  const login = document.getElementById('syncLogin');
  const connected = document.getElementById('syncConnected');
  if (!login) return;
  if (!currentUser) {
    login.style.display = ''; connected.style.display = 'none';
    setSyncStatus('idle', 'Nicht angemeldet');
  } else {
    login.style.display = 'none'; connected.style.display = '';
    document.getElementById('syncUserName').textContent = currentUser.name;
    const roleLabels = { admin: 'Admin', moderator: 'Moderator', worker: 'Mitarbeiter' };
    document.getElementById('syncUserRole').textContent = roleLabels[currentUser.role] || 'Mitarbeiter';
    document.getElementById('syncEntryCount').textContent = data.entries.length;
    setSyncStatus('ok', 'Angemeldet als ' + currentUser.name);
  }
}

async function loginWithCode() {
  const input = document.getElementById('codeInput');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  const code = (input?.value || '').trim().toLowerCase();
  if (!code) { errEl.textContent = 'Bitte Code eingeben.'; errEl.style.display = ''; return; }
  const sb = getSupabase();
  if (!sb) return;
  setSyncStatus('busy', 'Anmelden…');
  try {
    const { data: profile, error } = await sb.rpc('login_with_code', { p_code: code });
    if (error || !profile) throw new Error('Unbekannter Code – bitte Administrator kontaktieren');
    const previousUserId = localStorage.getItem('blitz_user_id');
    currentUser = { id: profile.id, code: profile.code, name: profile.name, role: profile.role, weekly_hours: profile.weekly_hours || 39 };
    WOCHENSOLL_MIN = (currentUser.weekly_hours) * 60;
    localStorage.setItem('blitz_user_code', code);
    localStorage.setItem('blitz_user_id', profile.id);
    localStorage.setItem('blitz_wochensoll', currentUser.weekly_hours);
    if (previousUserId === profile.id && (data.entries.length > 0 || data.customers.length > 0)) {
      // Gleicher User → Offline-Einträge hochladen
      await syncPush();
    } else if (previousUserId !== profile.id) {
      // Anderer User → lokalen Cache leeren um Datenvermischung zu verhindern
      data = { entries: [], customers: [], locations: [], deletedIds: [] };
      localStorage.setItem('blitz_v2', JSON.stringify(data));
    }
    await syncPull();
    setupRealtimeSync();
    updateAdminUI();
    updateSyncTab();
    renderSyncPage();
    renderEntries();
    renderSaldo();
    populateAllSelects();
  } catch(e) {
    setSyncStatus('error', e.message);
    errEl.textContent = e.message;
    errEl.style.display = '';
  }
}

async function logout() {
  if (!confirm('Abmelden?')) return;
  // Erst ausstehende Änderungen hochladen, bevor der Cache geleert wird
  if (syncPushTimer) {
    clearTimeout(syncPushTimer);
    syncPushTimer = null;
    await syncPush();
  }
  const sb = getSupabase();
  if (sb && _realtimeChannel) { sb.removeChannel(_realtimeChannel); _realtimeChannel = null; }
  if (sb && _realtimeMasterdataChannel) { sb.removeChannel(_realtimeMasterdataChannel); _realtimeMasterdataChannel = null; }
  currentUser = null;
  localStorage.removeItem('blitz_user_code');
  localStorage.removeItem('blitz_user_id');
  // Lokalen Cache leeren damit beim nächsten Login keine fremden Daten auftauchen
  data = { entries: [], customers: [], locations: [], deletedIds: [] };
  localStorage.setItem('blitz_v2', JSON.stringify(data));
  // SW-Cache leeren damit keine sensiblen Daten im Browser verbleiben
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
  setSyncStatus('idle', 'Nicht angemeldet');
  updateSyncTab();
  renderSyncPage();
  updateAdminUI();
}

async function syncPush(_fromSyncNow = false) {
  if (!currentUser) return;
  if (!_fromSyncNow) {
    if (syncBusy) { _syncQueued = true; return; }
    syncBusy = true;
  }
  _realtimePauseUntil = Date.now() + 10000;
  const sb = getSupabase();
  if (!sb) { if (!_fromSyncNow) syncBusy = false; return; }
  setSyncStatus('busy', 'Lade hoch…');
  try {
    // Vor dem Push lokale Duplikate bereinigen
    deduplicateLocalEntries();
    const uid = currentUser.id;
    // Alte Timestamp-IDs in UUIDs migrieren (einmalig)
    let migrated = false;
    for (const e of data.entries) {
      if (!isUUID(String(e.id))) { e.id = ensureUUID(e.id); migrated = true; }
      if (e.customerId && !isUUID(String(e.customerId))) { e.customerId = ensureUUID(e.customerId); migrated = true; }
      if (e.locationId && !isUUID(String(e.locationId))) { e.locationId = ensureUUID(e.locationId); migrated = true; }
    }
    for (const c of data.customers) { if (!isUUID(String(c.id))) { c.id = ensureUUID(c.id); migrated = true; } }
    for (const l of data.locations) { if (!isUUID(String(l.id))) { l.id = ensureUUID(l.id); migrated = true; } }
    // Non-UUID Tombstones entfernen (können nicht auf dem Server existieren)
    // Hinweis: Alte Timestamp-IDs wurden bei Migration durch neue UUIDs ersetzt,
    // daher sind non-UUID Tombstones ohnehin verwaist und können sicher entfernt werden.
    data.deletedIds = (data.deletedIds || []).filter(id => isUUID(String(id)));
    if (migrated) localStorage.setItem('blitz_v2', JSON.stringify(data));
    // Helper: Nur gültige UUIDs durchlassen, alles andere → null
    // (verhindert "operator does not exist: text = uuid" Fehler)
    const uuidOrNull = v => (v && isUUID(String(v))) ? String(v) : null;
    const allEntries = [
      ...data.entries.map(e => ({
        id: String(e.id), date: e.date,
        from_time: e.from, to_time: e.to, break_min: e.breakMin || 0,
        customer_id: uuidOrNull(e.customerId), customer_name: e.customerName || null,
        location_id: uuidOrNull(e.locationId), location_name: e.locationName || null,
        task: e.task || null, title: e.title || null, note: e.note || null,
        transferred: e.transferred || false, deleted: false,
        travel_min: e.travelMin || 0, travel_km: e.travelKm || 0
      })),
      ...(data.deletedIds || []).map(id => ({
        id: String(id), date: '1970-01-01',
        from_time: '00:00', to_time: '00:00', break_min: 0,
        deleted: true
      }))
    ];
    if (allEntries.length > 0) {
      const { error } = await sb.rpc('upsert_entries_for_code', {
        p_code: currentUser.code,
        p_entries: allEntries
      });
      if (error) throw error;
    }
    // Kunden & Standorte atomar synchronisieren (eine Transaktion)
    {
      const { error } = await sb.rpc('sync_masterdata_for_code', {
        p_code: currentUser.code,
        p_customers: data.customers.map(c => ({ id: String(c.id), name: c.name })),
        p_locations: data.locations.map(l => ({ id: String(l.id), customer_id: uuidOrNull(l.customerId), name: l.name }))
      });
      if (error) throw error;
    }
    const ts = new Date().toLocaleTimeString('de-DE');
    setSyncStatus('ok', 'Synchronisiert', `Zuletzt: ${ts}`);
    const el = document.getElementById('syncLastUp');
    if (el) el.textContent = ts;
    const ec = document.getElementById('syncEntryCount');
    if (ec) ec.textContent = data.entries.length;
    _syncRetryCount = 0; // Erfolg → Reset
  } catch(e) {
    const isNetworkError = !navigator.onLine || (e instanceof TypeError && e.message.includes('fetch'));
    if (isNetworkError && _syncRetryCount < 3) {
      setSyncStatus('pending', 'Offline – Erneuter Versuch...');
      scheduleSyncRetry();
    } else {
      setSyncStatus('error', 'Upload fehlgeschlagen: ' + e.message);
    }
  }
  if (!_fromSyncNow) {
    syncBusy = false;
    _realtimePauseUntil = Math.max(_realtimePauseUntil, Date.now() + 3000);
    if (_syncQueued) { _syncQueued = false; setTimeout(() => syncNow(), 500); }
  }
}

function scheduleSyncRetry() {
  if (_syncRetryTimer) clearTimeout(_syncRetryTimer);
  _syncRetryCount++;
  const delays = [5000, 15000, 30000];
  const delay = delays[Math.min(_syncRetryCount - 1, delays.length - 1)];
  const secs = Math.round(delay / 1000);
  setSyncStatus('pending', `Offline – Erneuter Versuch in ${secs}s...`);
  _syncRetryTimer = setTimeout(() => {
    _syncRetryTimer = null;
    if (navigator.onLine) syncNow();
    else if (_syncRetryCount < 3) scheduleSyncRetry();
    else setSyncStatus('error', 'Sync fehlgeschlagen – bitte manuell versuchen');
  }, delay);
}

function deduplicateLocalEntries() {
  if (!data.entries || data.entries.length === 0) return false;
  const seen = new Map();
  const toDelete = [];
  // Sortieren: älteste zuerst behalten (nach ID als Fallback)
  const sorted = [...data.entries].sort((a, b) => {
    const cmp = (a.date + a.from).localeCompare(b.date + b.from);
    return cmp !== 0 ? cmp : String(a.id).localeCompare(String(b.id));
  });
  for (const e of sorted) {
    // Breiterer Key: Datum + Zeiten + Kunde + Aufgabe (Kern-Identität eines Eintrags)
    const key = `${e.date}|${e.from}|${e.to}|${String(e.customerName||e.customerId||'')}|${e.task||''}`;
    if (seen.has(key)) {
      toDelete.push(e.id);
    } else {
      seen.set(key, e.id);
    }
  }
  if (toDelete.length > 0) {
    data.entries = data.entries.filter(e => !toDelete.includes(e.id));
    data.deletedIds = [...new Set([...(data.deletedIds || []), ...toDelete])];
    save();
    showToast(`${toDelete.length} Duplikat${toDelete.length === 1 ? '' : 'e'} bereinigt`);
    return true;
  }
  return false;
}

async function syncPull(_fromSyncNow = false) {
  if (!currentUser) return;
  if (!_fromSyncNow) {
    if (syncBusy) { _syncQueued = true; return; }
    syncBusy = true;
  }
  const sb = getSupabase();
  if (!sb) { if (!_fromSyncNow) syncBusy = false; return; }
  setSyncStatus('busy', 'Lade Daten…');
  try {
    const uid = currentUser.id;
    const results = await Promise.all([
      sb.rpc('get_entries_for_code', { p_code: currentUser.code }),
      sb.rpc('get_customers_for_code', { p_code: currentUser.code }),
      sb.rpc('get_locations_for_code', { p_code: currentUser.code })
    ]);
    // ALLE RPC-Fehler prüfen (nicht nur den ersten)
    const errors = results.map((r, i) => r.error).filter(Boolean);
    if (errors.length > 0) throw errors[0];
    const [{ data: allEntriesRaw }, { data: custsRaw }, { data: locsRaw }] = results;

    // Lokale Tombstones merken, bevor wir data.deletedIds überschreiben
    const localDeletedIds = [...(data.deletedIds || [])];
    const allRaw = allEntriesRaw || [];
    // STRIKTER user_id-Filter: Nur eigene Einträge akzeptieren.
    const entriesRaw = allRaw.filter(e => !e.deleted && (e.user_id === uid || e.user_id === undefined));
    const deletedRaw = allRaw.filter(e => e.deleted && (e.user_id === uid || e.user_id === undefined));
    // Dedup by ID (server-seitige ID-Duplikate verhindern)
    const seenIds = new Set();
    const uniqueEntries = entriesRaw.filter(e => {
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id); return true;
    });
    // Content-basierte Dedup direkt beim Import (gleicher Tag + gleiche Zeiten + gleicher Kunde = Duplikat)
    const seenContent = new Map();
    const dedupedEntries = [];
    for (const e of uniqueEntries) {
      const key = `${e.date}|${e.from_time}|${e.to_time}|${e.customer_name||''}|${e.task||''}`;
      if (!seenContent.has(key)) {
        seenContent.set(key, e.id);
        dedupedEntries.push(e);
      } else {
        localDeletedIds.push(e.id);
      }
    }
    const serverEntries = dedupedEntries.map(e => ({
      id: e.id, date: e.date, from: e.from_time, to: e.to_time,
      breakMin: e.break_min, customerId: e.customer_id, customerName: e.customer_name,
      locationId: e.location_id, locationName: e.location_name,
      task: e.task, title: e.title, note: e.note, transferred: e.transferred,
      travelMin: e.travel_min || 0, travelKm: e.travel_km || 0
    }));

    // ── CRITICAL FIX: Lokale noch-nicht-gepushte Einträge bewahren ──
    // Einträge die lokal existieren aber NICHT auf dem Server sind,
    // wurden gerade erst hinzugefügt und noch nicht hochgeladen.
    // Diese dürfen beim Pull nicht verloren gehen!
    const serverEntryIds = new Set(allRaw.map(e => e.id));
    const serverDeletedIds = new Set(deletedRaw.map(e => e.id));
    const pendingLocalEntries = data.entries.filter(e =>
      !serverEntryIds.has(e.id) &&         // nicht auf Server
      !serverDeletedIds.has(e.id) &&       // nicht auf Server gelöscht
      !localDeletedIds.includes(e.id)      // nicht lokal gelöscht
    );

    // ── Konflikt-Erkennung ──
    const conflicts = [];
    if (_lastSyncAt) {
      const serverEntryMap = new Map(serverEntries.map(e => [e.id, e]));
      for (const localEntry of data.entries) {
        if (!localEntry._modifiedAt || localEntry._modifiedAt <= _lastSyncAt) continue;
        const serverVersion = serverEntryMap.get(localEntry.id);
        if (!serverVersion) continue;
        // Vergleiche Content-Hash
        const localHash = entryContentHash(localEntry);
        const serverHash = entryContentHash(serverVersion);
        if (localHash !== serverHash) {
          conflicts.push({ local: { ...localEntry }, server: { ...serverVersion } });
        }
      }
    }

    data.entries = [...serverEntries, ...pendingLocalEntries];
    data.entries.sort((a, b) => (b.date + b.from).localeCompare(a.date + a.from));

    // Bei Konflikten: Lokale Versionen temporär behalten bis User entscheidet
    if (conflicts.length > 0) {
      for (const c of conflicts) {
        const idx = data.entries.findIndex(e => e.id === c.local.id);
        if (idx !== -1) data.entries[idx] = c.local; // Lokale Version erstmal behalten
      }
    }

    // ── Kunden & Standorte mergen (Schutz vor Race-Condition) ──
    // Wenn Server-Locations NULL customer_id haben (wegen FK-CASCADE zwischen
    // sync_customers DELETE und sync_locations INSERT), lokale Zuordnung bewahren.
    const serverCustomers = (custsRaw || []).map(c => ({ id: c.id, name: c.name }));
    const serverLocations = (locsRaw || []).map(l => ({ id: l.id, customerId: l.customer_id, name: l.name }));

    // Lokale customer_id-Mappings als Fallback merken
    const localLocCustMap = new Map();
    for (const l of data.locations) {
      if (l.customerId) localLocCustMap.set(l.id, l.customerId);
    }
    // Pendiente lokale Locations bewahren (noch nicht gepusht)
    const serverLocIds = new Set(serverLocations.map(l => l.id));
    const pendingLocalLocs = data.locations.filter(l => !serverLocIds.has(l.id));

    data.customers = serverCustomers;
    data.locations = [...serverLocations, ...pendingLocalLocs];

    // Fix: Wenn Server-Location NULL customer_id hat aber lokal war sie zugewiesen,
    // und der Kunde noch existiert → lokale Zuordnung wiederherstellen
    const customerIds = new Set(data.customers.map(c => c.id));
    for (const l of data.locations) {
      if (!l.customerId && localLocCustMap.has(l.id)) {
        const localCustId = localLocCustMap.get(l.id);
        if (customerIds.has(localCustId)) {
          l.customerId = localCustId;
        }
      }
    }

    // deletedIds MERGEN statt überschreiben
    data.deletedIds = [...new Set([...localDeletedIds, ...(deletedRaw || []).map(e => e.id)])];
    localStorage.setItem('blitz_v2', JSON.stringify(data));
    renderEntries();
    renderSaldo();
    populateAllSelects();
    renderSyncPage();
    _lastSyncAt = new Date().toISOString();
    const ts = new Date().toLocaleTimeString('de-DE');
    setSyncStatus('ok', 'Synchronisiert', `Zuletzt: ${ts}`);
    const el = document.getElementById('syncLastDown');
    if (el) el.textContent = ts;

    // Konflikte anzeigen (nach Render, damit UI aktuell ist)
    if (conflicts.length > 0) {
      showConflictModal(conflicts);
    }
  } catch(e) {
    setSyncStatus('error', 'Download fehlgeschlagen: ' + e.message);
  }
  if (!_fromSyncNow) {
    syncBusy = false;
    if (_syncQueued) { _syncQueued = false; setTimeout(() => syncNow(), 500); }
  }
}

function entryContentHash(e) {
  return [e.date, e.from, e.to, e.breakMin, e.customerId, e.task, e.title, e.note, e.transferred, e.travelMin, e.travelKm].join('|');
}

// ── Konflikt-Modal ──
let _pendingConflicts = [];
let _conflictIdx = 0;

function showConflictModal(conflicts) {
  _pendingConflicts = conflicts;
  _conflictIdx = 0;
  renderConflict();
  document.getElementById('conflictModalOverlay').classList.remove('hidden');
}

function renderConflict() {
  if (_conflictIdx >= _pendingConflicts.length) {
    document.getElementById('conflictModalOverlay').classList.add('hidden');
    save();
    if (getAutoSyncEnabled()) syncPush();
    return;
  }
  const c = _pendingConflicts[_conflictIdx];
  const dateLabel = new Date(c.local.date + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('conflictTitle').textContent = `\u26A0 Sync-Konflikt \u00b7 ${dateLabel}`;
  document.getElementById('conflictVersions').innerHTML = `
    <div class="conflict-version local">
      <div class="conflict-version-label">Deine Version</div>
      <div>${c.local.from} \u2192 ${c.local.to} \u00b7 ${escapeHtml(c.local.customerName || '\u2013')}</div>
      <div style="font-size:0.72rem;color:var(--muted)">${escapeHtml(c.local.task || '')} ${c.local.breakMin ? '\u00b7 ' + c.local.breakMin + 'min Pause' : ''} ${c.local.title ? '\u00b7 ' + escapeHtml(c.local.title) : ''}</div>
    </div>
    <div class="conflict-version server">
      <div class="conflict-version-label">Server-Version</div>
      <div>${c.server.from} \u2192 ${c.server.to} \u00b7 ${escapeHtml(c.server.customerName || '\u2013')}</div>
      <div style="font-size:0.72rem;color:var(--muted)">${escapeHtml(c.server.task || '')} ${c.server.breakMin ? '\u00b7 ' + c.server.breakMin + 'min Pause' : ''} ${c.server.title ? '\u00b7 ' + escapeHtml(c.server.title) : ''}</div>
    </div>`;
  document.getElementById('conflictCounter').textContent =
    `${_conflictIdx + 1} von ${_pendingConflicts.length}`;
}

function resolveConflict(choice) {
  const c = _pendingConflicts[_conflictIdx];
  if (choice === 'server') {
    const idx = data.entries.findIndex(e => e.id === c.local.id);
    if (idx !== -1) data.entries[idx] = c.server;
  }
  // 'local' → entry bleibt wie es ist, wird beim nächsten Push hochgeladen
  _conflictIdx++;
  renderConflict();
  renderEntries();
  renderSaldo();
}

async function syncNow() {
  if (syncBusy) {
    _syncQueued = true; // Nicht verwerfen, sondern nachholen
    return;
  }
  syncBusy = true; // Lock für gesamte Pull+Push Sequenz
  clearTimeout(syncPushTimer);
  _realtimePauseUntil = Date.now() + 15000;
  try {
    // Pull ZUERST: Server-Stand holen, damit Stammdaten (DELETE+INSERT)
    // Änderungen vom anderen Gerät nicht überschrieben werden.
    await syncPull(true);
    await syncPush(true);
  } catch (e) {
    setSyncStatus('error', 'Sync fehlgeschlagen: ' + e.message);
  }
  syncBusy = false;
  _realtimePauseUntil = Date.now() + 3000;
  // Warteschlange abarbeiten (z.B. Realtime-Event während Sync)
  if (_syncQueued) {
    _syncQueued = false;
    setTimeout(() => syncNow(), 500);
  }
}

function _onRealtimeChange() {
  // Eigene Push-Events ignorieren (verhindert Sync-Loop)
  if (Date.now() <= _realtimePauseUntil) return;
  if (syncBusy) {
    // Nicht verwerfen! Nach Ende nachholen.
    _syncQueued = true;
    return;
  }
  // Pull holt entries + customers + locations in einem Rutsch
  syncPull();
}

function setupRealtimeSync() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  if (_realtimeChannel) sb.removeChannel(_realtimeChannel);
  // Entries-Channel (primär, bewährt)
  _realtimeChannel = sb.channel('blitz-entries')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${currentUser.id}` }, _onRealtimeChange)
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Realtime-Channel Fehler:', status, err);
        setTimeout(() => setupRealtimeSync(), 5000);
      }
    });
  // Optionaler Stammdaten-Channel (kann fehlschlagen wenn Realtime nicht aktiviert)
  if (_realtimeMasterdataChannel) { try { sb.removeChannel(_realtimeMasterdataChannel); } catch(e) {} }
  try {
    _realtimeMasterdataChannel = sb.channel('blitz-masterdata')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `user_id=eq.${currentUser.id}` }, _onRealtimeChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations', filter: `user_id=eq.${currentUser.id}` }, _onRealtimeChange)
      .subscribe(); // Fehler still ignorieren — Pull-vor-Push ist der Hauptschutz
  } catch(e) { _realtimeMasterdataChannel = null; /* Stammdaten-Realtime nicht verfügbar – kein Problem */ }
}

function updateAdminUI() {
  const isAdmin = currentUser?.role === 'admin';
  const isModerator = currentUser?.role === 'moderator';
  const showTeam = isAdmin || isModerator;
  const teamTab = document.getElementById('teamTab');
  const bnavTeam = document.getElementById('bnav-team');
  const benutzerItem = document.getElementById('mehrBenutzerItem');
  if (teamTab) teamTab.style.display = showTeam ? '' : 'none';
  if (bnavTeam) bnavTeam.style.display = showTeam ? '' : 'none';
  if (benutzerItem) benutzerItem.style.display = isAdmin ? 'flex' : 'none'; // Nur Admin
}
