//  EXPORT
// ============================================================
function exportCSV() {
  const filtered = getFilteredEntries();
  const rows = [['Datum','Von','Bis','Pause (min)','Nettostunden','Kunde','Standort','Tätigkeit','Titel','Beschreibung']];
  filtered.forEach(e => {
    const dur = calcDuration(e.from, e.to, e.breakMin);
    const hours = (dur.total / 60).toFixed(2).replace('.', ',');
    rows.push([
      e.date, e.from, e.to, e.breakMin || 0, hours,
      e.customerName || '', e.locationName || '', e.task || '', e.title || '', e.note || ''
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blitz_export_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  localStorage.setItem('blitz_last_export', Date.now());
}


// ============================================================
//  PDF EXPORT DIALOG
// ============================================================
function showPDFExportDialog(prefillFrom, prefillTo) {
  const sel = document.getElementById('pdfCustomer');
  sel.innerHTML = '<option value="">Alle Kunden</option>';
  (data.customers || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  if (prefillFrom !== undefined) document.getElementById('pdfFrom').value = prefillFrom || '';
  if (prefillTo   !== undefined) document.getElementById('pdfTo').value   = prefillTo   || '';
  document.getElementById('pdfExportModal').style.display = 'flex';
}

function closePDFModal() {
  document.getElementById('pdfExportModal').style.display = 'none';
}

function pdfPreset(preset) {
  const today = new Date();
  let from, to;
  if (preset === 'this-week') {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    from = new Date(today); from.setDate(today.getDate() - dow);
    to   = new Date(from);  to.setDate(from.getDate() + 6);
  } else if (preset === 'last-week') {
    const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - dow);
    from = new Date(thisMonday); from.setDate(thisMonday.getDate() - 7);
    to   = new Date(from);       to.setDate(from.getDate() + 6);
  } else if (preset === 'last7') {
    from = new Date(today); from.setDate(today.getDate() - 7);
    to   = today;
  } else if (preset === 'last30') {
    from = new Date(today); from.setDate(today.getDate() - 30);
    to   = today;
  } else if (preset === 'this-month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    to   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (preset === 'last-month') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to   = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (preset === 'all') {
    document.getElementById('pdfFrom').value = '';
    document.getElementById('pdfTo').value   = '';
    return;
  }
  document.getElementById('pdfFrom').value = isoDate(from);
  document.getElementById('pdfTo').value   = isoDate(to);
}

function confirmPDFExport() {
  const fromDate   = document.getElementById('pdfFrom').value || undefined;
  const toDate     = document.getElementById('pdfTo').value   || undefined;
  const customerId = document.getElementById('pdfCustomer').value || undefined;
  closePDFModal();
  exportPDF(fromDate, toDate, customerId);
}

function exportCurrentWeekPDF() {
  const monday = getWeekStart(weekOffset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  exportPDF(isoDate(monday), isoDate(sunday));
}

function exportCurrentMonthPDF() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  exportPDF(isoDate(base), isoDate(last));
}

function exportCurrentYearPDF() {
  const y = new Date().getFullYear() + yearOffset;
  exportPDF(`${y}-01-01`, `${y}-12-31`);
}

function exportPDF(fromDate, toDate, customerId) {
  let filtered = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
  if (fromDate)   filtered = filtered.filter(e => e.date >= fromDate);
  if (toDate)     filtered = filtered.filter(e => e.date <= toDate);
  if (customerId) filtered = filtered.filter(e => String(e.customerId) === String(customerId));

  if (filtered.length === 0) { alert('Keine Eintr\u00e4ge f\u00fcr den gew\u00e4hlten Zeitraum.'); return; }

  const totalMins = filtered.reduce((s, e) => s + calcDuration(e.from, e.to, e.breakMin).total, 0);
  const totalH = Math.floor(totalMins / 60);
  const totalM = totalMins % 60;

  function fmtDate(iso) {
    return new Date(iso + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  let periodLabel;
  if (fromDate && toDate) periodLabel = fmtDate(fromDate) + ' \u2013 ' + fmtDate(toDate);
  else if (fromDate)      periodLabel = 'ab ' + fmtDate(fromDate);
  else if (toDate)        periodLabel = 'bis ' + fmtDate(toDate);
  else                    periodLabel = 'Alle Zeitr\u00e4ume';

  const customerObj   = customerId ? data.customers.find(c => String(c.id) === String(customerId)) : null;
  const customerLabel = customerObj ? customerObj.name : 'Alle Kunden';

  const rows = filtered.map(e => {
    const dur = calcDuration(e.from, e.to, e.breakMin);
    const dateStr = new Date(e.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    const taskColors = { Installation: '#1a6b3a', Wartung: '#1a3d6b', St\u00f6rung: '#6b1a1a', Sonstiges: '#5a3a1a' };
    const taskBg = e.task ? (taskColors[e.task] || '#5a3a1a') : '';
    const taskBadge = e.task ? `<span style="background:${taskBg};color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;letter-spacing:0.5px">${e.task}</span>` : '';
    const breakStr = e.breakMin > 0 ? `${e.breakMin} min` : '\u2013';
    const desc = [e.title, e.note].filter(Boolean).join(' \u00b7 ') || '';
    return `
      <tr>
        <td>${dateStr}</td>
        <td>${e.from} \u2013 ${e.to}</td>
        <td style="text-align:center">${breakStr}</td>
        <td style="text-align:right;font-weight:600">${dur.h}h ${String(dur.m).padStart(2,'0')}m</td>
        <td>${e.customerName || '\u2013'}</td>
        <td>${e.locationName && e.locationName !== '\u2013 Standort w\u00e4hlen \u2013' ? e.locationName : '\u2013'}</td>
        <td>${taskBadge}</td>
        <td style="color:#555;font-size:10px">${desc}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
<title>Stundenzettel \u2013 ${periodLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 2cm 1.8cm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid #c8a832; }
  .logo { font-size: 22px; font-weight: 700; color: #c8a832; letter-spacing: -1px; }
  .company { font-size: 10px; color: #666; margin-top: 2px; }
  .meta { text-align: right; }
  .meta-label { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
  .meta-val { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
  th { background: #f5f0e0; color: #555; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 8px; text-align: left; border-bottom: 2px solid #c8a832; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #fafaf7; }
  tr:last-child td { border-bottom: none; }
  .total-row { background: #f5f0e0 !important; font-weight: 700; }
  .total-row td { border-top: 2px solid #c8a832; font-size: 12px; padding: 8px; }
  .summary { display: flex; gap: 2rem; margin-top: 1.5rem; padding: 1rem; background: #f9f6ec; border-left: 3px solid #c8a832; }
  .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 3px; }
  .summary-val { font-size: 18px; font-weight: 700; color: #c8a832; }
  .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; font-size: 9px; color: #999; display: flex; justify-content: space-between; }
  @media print { body { padding: 1cm; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">BLITZ</div>
    <div class="company">Elektro \u00b7 Energie &amp; Geb\u00e4udetechnik</div>
  </div>
  <div class="meta">
    <div class="meta-label">Zeitraum</div>
    <div class="meta-val">${periodLabel}</div>
    <div style="font-size:10px;color:#888;margin-top:4px">${customerLabel}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Datum</th>
      <th>Zeit</th>
      <th style="text-align:center">Pause</th>
      <th style="text-align:right">Netto</th>
      <th>Kunde</th>
      <th>Standort</th>
      <th>T\u00e4tigkeit</th>
      <th>Beschreibung</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="total-row">
      <td colspan="3">Gesamt (${filtered.length} Eintr\u00e4ge)</td>
      <td style="text-align:right">${totalH}h ${String(totalM).padStart(2,'0')}m</td>
      <td colspan="4"></td>
    </tr>
  </tbody>
</table>

<div class="summary">
  <div class="summary-item">
    <div class="summary-label">Gesamtstunden</div>
    <div class="summary-val">${totalH}h ${String(totalM).padStart(2,'0')}m</div>
  </div>
  <div class="summary-item">
    <div class="summary-label">Eintr\u00e4ge</div>
    <div class="summary-val">${filtered.length}</div>
  </div>
  <div class="summary-item">
    <div class="summary-label">Zeitraum</div>
    <div class="summary-val" style="font-size:13px">${periodLabel}</div>
  </div>
</div>

<div class="footer">
  <span>Erstellt mit BLITZ \u00b7 ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
  <span>PHOENYXZZZ \u00b7 Elektro \u00b7 Energie &amp; Geb\u00e4udetechnik</span>
</div>

<script>window.onload = () => { window.print(); window.addEventListener("afterprint", () => window.close()); };<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ============================================================
