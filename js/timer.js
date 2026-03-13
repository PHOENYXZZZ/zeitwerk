// ============================================================
//  CLOCK
// ============================================================
function updateClock() {
  const now = new Date();
  document.getElementById('liveClock').textContent = now.toLocaleTimeString('de-DE');
  document.getElementById('liveDate').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
//  TIMER
// ============================================================
function updateTimerDisplay() {
  if (!timerStart) return;
  const now = Date.now();
  let elapsed = now - timerStart - totalBreakMs;
  if (onBreak) elapsed -= (now - breakStart);
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  const pad = n => String(n).padStart(2, '0');
  const breakInfo = onBreak ? ' <span style="color:var(--accent2)">[Pause]</span>' : '';
  document.getElementById('timerDisplay').innerHTML =
    `<span class="status-dot"></span>${pad(h)}:${pad(m)}:${pad(s)}${breakInfo}`;
  document.title = `⏱ ${pad(h)}:${pad(m)}:${pad(s)} – BLITZ`;
}

function startTimer() {
  timerStart = Date.now();
  totalBreakMs = 0; onBreak = false;
  localStorage.setItem('zt_start', timerStart);
  localStorage.setItem('zt_break', '0');
  timerInterval = setInterval(updateTimerDisplay, 1000);
  document.getElementById('btnStart').style.display = 'none';
  document.getElementById('btnBreak').style.display = '';
  document.getElementById('btnStop').style.display = '';
  updateTimerDisplay();
}

function toggleBreak() {
  if (!onBreak) {
    onBreak = true; breakStart = Date.now();
    localStorage.setItem('zt_breakstart', breakStart);
    document.getElementById('btnBreak').textContent = '▶ Weiter';
  } else {
    totalBreakMs += Date.now() - breakStart;
    onBreak = false; breakStart = null;
    localStorage.setItem('zt_break', totalBreakMs);
    localStorage.removeItem('zt_breakstart');
    document.getElementById('btnBreak').textContent = '⏸ Pause';
  }
}

function stopTimer() {
  if (!timerStart) return;
  clearInterval(timerInterval);
  if (onBreak) { totalBreakMs += Date.now() - breakStart; onBreak = false; }

  const end = Date.now();
  const startDate = new Date(timerStart);
  const endDate = new Date(end);
  const breakMin = Math.round(totalBreakMs / 60000);

  const customerId = document.getElementById('timerCustomer').value;
  const customerName = document.getElementById('timerCustomer').options[document.getElementById('timerCustomer').selectedIndex]?.text || '';
  const locationId = document.getElementById('timerLocation').value;
  const locationName = document.getElementById('timerLocation').options[document.getElementById('timerLocation').selectedIndex]?.text || '';
  const task = document.getElementById('timerTask').value;
  const title = document.getElementById('timerTitle').value;
  const note = document.getElementById('timerNote').value;

  const travelMin = parseInt(document.getElementById('timerTravelMin').value) || 0;
  const travelKm = parseFloat(document.getElementById('timerTravelKm').value) || 0;

  addEntry({
    date: isoDate(startDate),
    from: startDate.toTimeString().slice(0, 5),
    to: endDate.toTimeString().slice(0, 5),
    breakMin,
    customerId, customerName,
    locationId, locationName,
    task, title, note,
    travelMin, travelKm
  });

  timerStart = null;
  localStorage.removeItem('zt_start');
  localStorage.removeItem('zt_break');
  localStorage.removeItem('zt_breakstart');
  document.title = 'BLITZ – Zeiterfassung';
  document.getElementById('timerDisplay').textContent = '';
  document.getElementById('btnStart').style.display = '';
  document.getElementById('btnBreak').style.display = 'none';
  document.getElementById('btnStop').style.display = 'none';
  document.getElementById('btnBreak').textContent = '⏸ Pause';
  document.getElementById('timerNote').value = '';
  document.getElementById('timerTitle').value = '';
  document.getElementById('timerTravelMin').value = '0';
  document.getElementById('timerTravelKm').value = '0';
}
