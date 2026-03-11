//  PIN LOCK
// ============================================================
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 5 * 60 * 1000; // 5 Minuten

function isPinLockedOut() {
  return Date.now() < parseInt(localStorage.getItem('blitz_pin_lockout') || '0', 10);
}
function getPinLockoutRemaining() {
  return Math.max(0, Math.ceil((parseInt(localStorage.getItem('blitz_pin_lockout') || '0', 10) - Date.now()) / 1000));
}
function registerFailedPinAttempt() {
  const attempts = parseInt(localStorage.getItem('blitz_pin_attempts') || '0', 10) + 1;
  localStorage.setItem('blitz_pin_attempts', String(attempts));
  if (attempts >= PIN_MAX_ATTEMPTS) {
    localStorage.setItem('blitz_pin_lockout', String(Date.now() + PIN_LOCKOUT_MS));
  }
  return attempts;
}
function resetPinAttempts() {
  localStorage.removeItem('blitz_pin_attempts');
  localStorage.removeItem('blitz_pin_lockout');
}

let pinBuffer = '';
let pinMode = 'unlock'; // 'unlock' | 'setup1' | 'setup2'
let pinSetupFirst = '';

async function pinHash(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function initPinLock() {
  const stored = localStorage.getItem('blitz_pin');
  // Migration: alte schwache Hashes (kein 64-stelliger Hex) entfernen
  if (stored && !/^[0-9a-f]{64}$/.test(stored)) {
    localStorage.removeItem('blitz_pin');
    return updatePinSettingsUI();
  }
  if (stored) {
    // Show lock screen
    document.getElementById('pinOverlay').classList.remove('hidden');
    document.getElementById('appContainer').style.display = 'none';
    pinMode = 'unlock';
    document.getElementById('pinModeLabel').textContent = 'PIN eingeben';
    document.getElementById('pinSetupHint').textContent = '';
  }
  updatePinSettingsUI();
}

function updatePinSettingsUI() {
  const stored = localStorage.getItem('blitz_pin');
  const info = document.getElementById('pinStatusInfo');
  const btnSet = document.getElementById('btnSetPin');
  const btnRemove = document.getElementById('btnRemovePin');
  if (!info) return;
  if (stored) {
    info.innerHTML = '<span style="color:var(--green)">✓ PIN-Schutz aktiv</span> — die App ist beim Öffnen gesperrt.';
    btnSet.textContent = 'PIN ändern';
    btnRemove.style.display = '';
  } else {
    info.textContent = 'Kein PIN gesetzt — die App öffnet ohne Sperre.';
    btnSet.textContent = 'PIN festlegen';
    btnRemove.style.display = 'none';
  }
}

function startPinSetup() {
  pinBuffer = '';
  pinMode = 'setup1';
  pinSetupFirst = '';
  document.getElementById('pinOverlay').classList.remove('hidden');
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('pinModeLabel').textContent = 'Neuen PIN eingeben';
  document.getElementById('pinSetupHint').textContent = '4-stellige Zahl wählen — du brauchst sie beim nächsten Öffnen.';
  document.getElementById('pinError').textContent = '';
  updatePinDots();
}

function pinKey(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) {
    setTimeout(() => handlePinComplete(), 120);
  }
}

function pinDel() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
  document.getElementById('pinError').textContent = '';
  document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('error'));
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    dot.classList.toggle('filled', i < pinBuffer.length);
    dot.classList.remove('error');
  }
}

async function handlePinComplete() {
  if (pinMode === 'unlock') {
    // Lockout-Prüfung
    if (isPinLockedOut()) {
      document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
      document.getElementById('pinError').textContent = `Gesperrt. Bitte ${getPinLockoutRemaining()}s warten.`;
      setTimeout(() => { pinBuffer = ''; updatePinDots(); }, 700);
      return;
    }
    const stored = localStorage.getItem('blitz_pin');
    if (await pinHash(pinBuffer) === stored) {
      // Correct!
      resetPinAttempts();
      document.getElementById('pinOverlay').classList.add('hidden');
      document.getElementById('appContainer').style.display = '';
    } else {
      // Wrong
      const attempts = registerFailedPinAttempt();
      document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
      if (isPinLockedOut()) {
        document.getElementById('pinError').textContent = `Zu viele Fehlversuche. Gesperrt für 5 Minuten.`;
      } else {
        const remaining = PIN_MAX_ATTEMPTS - attempts;
        document.getElementById('pinError').textContent = `Falscher PIN. Noch ${remaining} Versuch${remaining === 1 ? '' : 'e'}.`;
      }
      setTimeout(() => {
        pinBuffer = '';
        updatePinDots();
      }, 700);
    }
  } else if (pinMode === 'setup1') {
    pinSetupFirst = pinBuffer;
    pinBuffer = '';
    pinMode = 'setup2';
    document.getElementById('pinModeLabel').textContent = 'PIN bestätigen';
    document.getElementById('pinSetupHint').textContent = 'Bitte denselben PIN nochmal eingeben.';
    document.getElementById('pinError').textContent = '';
    updatePinDots();
  } else if (pinMode === 'setup2') {
    if (pinBuffer === pinSetupFirst) {
      localStorage.setItem('blitz_pin', await pinHash(pinBuffer));
      document.getElementById('pinOverlay').classList.add('hidden');
      document.getElementById('appContainer').style.display = '';
      updatePinSettingsUI();
      alert('✓ PIN gespeichert! Ab jetzt ist die App beim Öffnen geschützt.');
    } else {
      document.querySelectorAll('.pin-dot').forEach(d => d.classList.add('error'));
      document.getElementById('pinError').textContent = 'PINs stimmen nicht überein.';
      setTimeout(() => {
        pinBuffer = '';
        pinMode = 'setup1';
        pinSetupFirst = '';
        document.getElementById('pinModeLabel').textContent = 'Neuen PIN eingeben';
        document.getElementById('pinSetupHint').textContent = '4-stellige Zahl wählen.';
        document.getElementById('pinError').textContent = '';
        updatePinDots();
      }, 800);
    }
  }
}

function removePin() {
  if (!confirm('PIN-Schutz wirklich entfernen?')) return;
  localStorage.removeItem('blitz_pin');
  updatePinSettingsUI();
}

// Keyboard support for PIN
document.addEventListener('keydown', e => {
  if (!document.getElementById('pinOverlay').classList.contains('hidden')) {
    if (e.key >= '0' && e.key <= '9') pinKey(e.key);
    if (e.key === 'Backspace') pinDel();
  }
});

// ============================================================
