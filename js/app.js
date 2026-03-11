// ============================================================
//  NAVIGATION
// ============================================================
// Seiten die unter "Mehr" fallen → bnav-mehr bleibt aktiv
const MEHR_PAGES = new Set(['zeiterfassung','auswertung','stammdaten','sync','team','benutzer']);

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  // Desktop tabs
  [...document.querySelectorAll('.tab')].forEach(t => {
    if (t.getAttribute('onclick')?.includes(`'${id}'`)) t.classList.add('active');
    if (MEHR_PAGES.has(id) && t.getAttribute('onclick')?.includes("'mehr'")) t.classList.add('active');
  });
  // Bottom nav
  const navId = MEHR_PAGES.has(id) ? 'mehr' : id;
  const bnav = document.getElementById('bnav-' + navId);
  if (bnav) bnav.classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'neu')        { renderQuickSaldo(); }
  if (id === 'mehr')       { renderMehrSaldo(); }
  if (id === 'eintraege')  { populateFilterSelects(); renderEntries(); }
  if (id === 'sync')       { renderSyncPage(); }
  if (id === 'team')       { renderTeamPage(); }
  if (id === 'benutzer')   { renderBenutzerPage(); }
  if (id === 'uebersicht') { renderUebersicht(); }
  if (id === 'auswertung') { populateStatsMonths(); renderStats(); }
  if (id === 'stammdaten') { renderStammdaten(); updatePinSettingsUI(); }
}

//  TIMER BANNER (Page Visibility)
// ============================================================
function showTimerBanner() {
  if (!timerStart) return;
  const now = Date.now();
  let elapsed = now - timerStart - totalBreakMs;
  if (onBreak) elapsed -= (now - breakStart);
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('timerBannerTime').textContent = `${pad(h)}:${pad(m)}`;
  document.getElementById('timerBanner').classList.add('visible');
}

function hideTimerBanner() {
  document.getElementById('timerBanner').classList.remove('visible');
}

let _lastSyncTs = 0;
// Zentrale Funktion: Push-then-Pull wenn Tab/App wieder aktiv wird
// Push zuerst, damit lokale Einträge nicht beim Pull verloren gehen
async function syncOnResume() {
  if (!currentUser || syncBusy || Date.now() - _lastSyncTs < 60000) return;
  _lastSyncTs = Date.now();
  // Erst pushen (damit pending-Einträge auf den Server kommen), dann pullen
  await syncPush();
  await syncPull();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (timerStart) { showTimerBanner(); setTimeout(hideTimerBanner, 5000); }
    syncOnResume();
  }
});

window.addEventListener('focus', () => { syncOnResume(); });



// ============================================================
//  OFFLINE INDIKATOR
// ============================================================
function updateOnlineStatus() {
  const dot = document.getElementById('offlineDot');
  if (!dot) return;
  if (navigator.onLine) {
    dot.style.background = '#4caf50';
    dot.title = 'Online';
  } else {
    dot.style.background = '#f59e0b';
    dot.title = 'Offline – Daten werden lokal gespeichert';
  }
}

function showNetworkToast(msg) {
  let toast = document.getElementById('networkToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'networkToast';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '5.5rem', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(20,20,20,0.88)', color: '#fff',
      padding: '0.55rem 1.1rem', borderRadius: '20px',
      fontSize: '0.76rem', zIndex: '9999', pointerEvents: 'none',
      transition: 'opacity 0.4s', opacity: '0', whiteSpace: 'nowrap'
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

window.addEventListener('online',  () => { updateOnlineStatus(); showNetworkToast('✅ Wieder online'); });
window.addEventListener('offline', () => { updateOnlineStatus(); showNetworkToast('⚠️ Offline – Daten werden lokal gespeichert'); });

// ============================================================
//  SCROLL-TO-TODAY BUTTON (Einträge-Seite)
// ============================================================
function scrollToToday() {
  const firstGroup = document.querySelector('#entriesList .day-group');
  if (firstGroup) firstGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;
  const isEntriesPage = document.getElementById('page-eintraege')?.classList.contains('active');
  if (isEntriesPage && window.scrollY > 300) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
});

// ============================================================
//  SERVICE WORKER REGISTRIERUNG
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'UPDATE_AVAILABLE') {
      const banner = document.getElementById('updateBanner');
      if (banner) banner.classList.add('visible');
    }
  });
}

// Beim Start: existierende Duplikate bereinigen (alle Module geladen)
if (typeof deduplicateLocalEntries === 'function') deduplicateLocalEntries();

// Timer-Wiederherstellung nach App-Neustart
(function restoreTimer() {
  const saved = localStorage.getItem('zt_start');
  if (!saved) return;
  timerStart = parseInt(saved);
  totalBreakMs = parseInt(localStorage.getItem('zt_break') || '0');
  const savedBreakStart = localStorage.getItem('zt_breakstart');
  if (savedBreakStart) { onBreak = true; breakStart = parseInt(savedBreakStart); }
  timerInterval = setInterval(updateTimerDisplay, 1000);
  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnBreak').style.display = '';
  document.getElementById('btnStop').style.display = '';
  if (onBreak) document.getElementById('btnBreak').textContent = '▶ Weiter';
  updateTimerDisplay();
  setTimeout(showTimerBanner, 500);
})();
