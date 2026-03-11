// ============================================================
//  STATS
// ============================================================
function populateStatsMonths() {
  const months = [...new Set(data.entries.map(e => e.date.slice(0, 7)))].sort().reverse();
  const sel = document.getElementById('statsMonth');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Alle Zeit</option>' +
    months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${m === cur ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

function renderStats() {
  const month = document.getElementById('statsMonth')?.value || '';
  const filtered = data.entries.filter(e => !month || e.date.startsWith(month));

  const totalMins = filtered.reduce((s, e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const days = [...new Set(filtered.map(e => e.date))].length;
  const avgMins = days > 0 ? Math.round(totalMins / days) : 0;

  const grid = document.getElementById('statsGrid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Gesamtstunden</div>
      <div class="stat-value">${Math.floor(totalMins/60)}<span style="font-size:1rem">h</span></div>
      <div class="stat-sub">${totalMins % 60} Minuten</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Arbeitstage</div>
      <div class="stat-value">${days}</div>
      <div class="stat-sub">Einsätze erfasst</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ø pro Tag</div>
      <div class="stat-value">${Math.floor(avgMins/60)}<span style="font-size:1rem">h</span></div>
      <div class="stat-sub">${avgMins % 60} Minuten</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Kunden</div>
      <div class="stat-value">${[...new Set(filtered.map(e => e.customerId).filter(Boolean))].length}</div>
      <div class="stat-sub">aktiv in Zeitraum</div>
    </div>
  `;

  // Customer breakdown
  const byCustomer = {};
  filtered.forEach(e => {
    const key = e.customerId || '__none__';
    const name = (e.customerName && e.customerName !== '– Kunde wählen –') ? e.customerName : '(kein Kunde)';
    if (!byCustomer[key]) byCustomer[key] = { name, mins: 0 };
    byCustomer[key].mins += calcDuration(e.from, e.to, e.breakMin).total;
  });
  const sorted = Object.values(byCustomer).sort((a, b) => b.mins - a.mins);
  const maxMins = sorted[0]?.mins || 1;
  document.getElementById('customerBreakdown').innerHTML = sorted.map(c => `
    <div class="cb-row">
      <span class="cb-name">${escapeHtml(c.name)}</span>
      <div class="cb-bar-wrap"><div class="cb-bar" style="width:${Math.round(c.mins/maxMins*100)}%"></div></div>
      <span class="cb-hours">${fmtDur(c.mins)}</span>
    </div>`).join('') || '<div style="color:var(--muted);font-size:0.8rem;padding:1rem 0">Keine Daten</div>';
}

// ============================================================
//  STAMMDATEN
// ============================================================
function addCustomer() {
  const name = document.getElementById('newCustomer').value.trim();
  if (!name) return;
  data.customers.push({ id: crypto.randomUUID(), name });
  document.getElementById('newCustomer').value = '';
  save();
  renderStammdaten();
  populateAllSelects();
}

function deleteCustomer(id) {
  data.customers = data.customers.filter(c => c.id !== id);
  data.locations = data.locations.filter(l => l.customerId !== id);
  save(); renderStammdaten(); populateAllSelects();
}

function addLocation() {
  const customerId = document.getElementById('newLocationCustomer').value;
  const name = document.getElementById('newLocation').value.trim();
  if (!customerId || !name) { alert('Bitte Kunde und Standortname angeben.'); return; }
  data.locations.push({ id: crypto.randomUUID(), customerId, name });
  document.getElementById('newLocation').value = '';
  save(); renderStammdaten();
}

function deleteLocation(id) {
  data.locations = data.locations.filter(l => l.id !== id);
  save(); renderStammdaten();
}

function renderStammdaten() {
  // Customer list
  document.getElementById('customerList').innerHTML = data.customers.length
    ? data.customers.map(c => `
        <li class="stamm-item">
          <span>${escapeHtml(c.name)}</span>
          <button class="entry-delete" onclick="deleteCustomer('${escapeHtml(c.id)}')">×</button>
        </li>`).join('')
    : '<li style="color:var(--muted);font-size:0.75rem;padding:0.5rem">Noch keine Kunden</li>';

  // Location customer filter
  const lcf = document.getElementById('locationCustomerFilter');
  const lcfCur = lcf.value;
  lcf.innerHTML = '<option value="">Alle Kunden</option>' +
    data.customers.map(c => `<option value="${c.id}" ${c.id === lcfCur ? 'selected' : ''}>${c.name}</option>`).join('');

  // New location customer select
  const nlc = document.getElementById('newLocationCustomer');
  nlc.innerHTML = '<option value="">Kunde wählen</option>' +
    data.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  renderLocationList();
  populateAllSelects();
}

function renderLocationList() {
  const filter = document.getElementById('locationCustomerFilter').value;
  const locs = filter ? data.locations.filter(l => l.customerId === filter) : data.locations;
  document.getElementById('locationList').innerHTML = locs.length
    ? locs.map(l => {
        const cust = data.customers.find(c => c.id === l.customerId);
        return `<li class="stamm-item">
          <span>${escapeHtml(l.name)} <span class="stamm-sub">${cust ? '· ' + escapeHtml(cust.name) : ''}</span></span>
          <button class="entry-delete" onclick="deleteLocation('${escapeHtml(l.id)}')">×</button>
        </li>`;}).join('')
    : '<li style="color:var(--muted);font-size:0.75rem;padding:0.5rem">Keine Standorte</li>';
}

function populateAllSelects() {
  const custOpts = '<option value="">– Kunde wählen –</option>' +
    data.customers.slice().sort((a,b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  ['timerCustomer', 'manCustomer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const cur = el.value; el.innerHTML = custOpts; el.value = cur; }
  });
  // Quick entry: customers alphabetically + "new customer" option at end
  const quickSel = document.getElementById('quickCustomerSel');
  if (quickSel) {
    const cur = quickSel.value;
    quickSel.innerHTML = custOpts + '<option value="__new__">+ Neuer Kunde…</option>';
    if (cur) quickSel.value = cur;
  }
  onTimerCustomerChange();
  onManCustomerChange();
}

function locationOptionsFor(customerId) {
  const locs = customerId
    ? data.locations.filter(l => l.customerId === customerId)
    : data.locations;
  return '<option value="">– Standort wählen –</option>' +
    locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('') +
    '<option value="_free_">Freie Eingabe...</option>';
}

function onTimerCustomerChange() {
  const sel = document.getElementById('timerLocation');
  if (sel) sel.innerHTML = locationOptionsFor(document.getElementById('timerCustomer').value);
}

function onManCustomerChange() {
  const sel = document.getElementById('manLocation');
  if (sel) sel.innerHTML = locationOptionsFor(document.getElementById('manCustomer').value);
}

// ============================================================
