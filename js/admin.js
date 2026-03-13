async function renderBenutzerPage() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const sb = getSupabase();
  const container = document.getElementById('benutzerList');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--muted);padding:1rem 0;text-align:center">Lade…</div>';
  const { data: users, error } = await sb.rpc('get_all_users_admin', { p_admin_code: currentUser.code });
  if (error) { container.innerHTML = `<div style="color:var(--red)">${escapeHtml(error.message)}</div>`; return; }
  container.innerHTML = (users || []).map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-weight:500">${escapeHtml(u.name)}</div>
        <div style="font-size:0.72rem;color:var(--muted)">Code: <code>${escapeHtml(u.code)}</code> · ${u.role === 'admin' ? 'Admin' : u.role === 'moderator' ? 'Moderator' : 'Mitarbeiter'}</div>
        <div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.3rem">
          <input type="number" min="1" max="60" step="0.5" value="${u.weekly_hours || 39}"
            style="width:50px;font-size:0.8rem;padding:0.15rem 0.3rem;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--fg)"
            onchange="updateUserHours('${escapeHtml(u.id)}', this.value, this)">
          <span style="font-size:0.72rem;color:var(--muted)">h/Woche</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem">
        ${u.id !== currentUser.id ? `<button class="btn-danger" style="padding:0.3rem 0.6rem;font-size:0.72rem" onclick="deleteUser('${escapeHtml(u.id)}',this)">✕</button>` : '<span style="font-size:0.72rem;color:var(--muted)">Du</span>'}
      </div>
    </div>`).join('');
}

async function addUser() {
  const code = (document.getElementById('newUserCode').value || '').trim().toLowerCase();
  const name = (document.getElementById('newUserName').value || '').trim();
  const role = document.getElementById('newUserRole').value;
  const hours = parseFloat(document.getElementById('newUserHours').value) || 39;
  const err = document.getElementById('addUserError');
  const ok  = document.getElementById('addUserSuccess');
  err.style.display = 'none'; ok.style.display = 'none';
  if (!code || !name) { err.textContent = 'Bitte Code und Name eingeben.'; err.style.display = ''; return; }
  const sb = getSupabase();
  const { data: result, error } = await sb.rpc('admin_create_user', {
    p_admin_code: currentUser.code, p_code: code, p_name: name, p_role: role, p_weekly_hours: hours
  });
  if (error) {
    err.textContent = error.message.includes('unique') || error.message.includes('duplicate')
      ? `Code "${code}" ist bereits vergeben.` : error.message;
    err.style.display = '';
  } else {
    ok.textContent = `✓ ${name} wurde angelegt. Code: ${code}`;
    ok.style.display = '';
    document.getElementById('newUserCode').value = '';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserHours').value = '39';
    renderBenutzerPage();
  }
}

async function deleteUser(id, btn) {
  const name = btn.closest('div[style]')?.querySelector('div[style*="font-weight"]')?.textContent || 'Benutzer';
  if (!confirm(`${name} wirklich löschen? Alle Einträge dieser Person werden ebenfalls gelöscht.`)) return;
  const sb = getSupabase();
  const { error } = await sb.rpc('admin_delete_user', { p_admin_code: currentUser.code, p_user_id: id });
  if (error) { alert('Fehler: ' + error.message); return; }
  renderBenutzerPage();
}

async function updateUserHours(userId, val, inputEl) {
  const h = parseFloat(val);
  if (isNaN(h) || h < 1 || h > 60) { inputEl.style.borderColor = 'var(--red)'; showToast('Wert muss zwischen 1 und 60 liegen', 'error'); return; }
  inputEl.style.borderColor = 'var(--border)';
  const sb = getSupabase();
  const { error } = await sb.rpc('admin_update_user_hours', {
    p_admin_code: currentUser.code, p_user_id: userId, p_weekly_hours: h
  });
  if (error) { alert('Fehler: ' + error.message); return; }
  inputEl.style.borderColor = 'var(--green)';
  setTimeout(() => { inputEl.style.borderColor = 'var(--border)'; }, 1500);
  // Update own value if editing self
  if (userId === currentUser.id) {
    currentUser.weekly_hours = h;
    WOCHENSOLL_MIN = h * 60;
    localStorage.setItem('blitz_wochensoll', h);
    renderSaldo();
  }
}

async function renderTeamPage() {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) return;
  const sb = getSupabase();
  if (!sb) return;

  // Populate month selector
  const sel = document.getElementById('teamMonthSel');
  if (sel && sel.options.length === 0) {
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  const month = sel?.value || new Date().toISOString().slice(0,7);
  const container = document.getElementById('teamContainer');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Lade…</div>';

  const { data: allEntries, error } = await sb.rpc('get_team_entries_admin', {
    p_admin_code: currentUser.code, p_month: month
  });

  if (error) {
    container.innerHTML = `<div style="color:var(--red)">Fehler: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const byUser = {};
  for (const e of (allEntries || [])) {
    const name = e.user_name || 'Unbekannt';
    if (!byUser[name]) byUser[name] = { entries: [], weekly_hours: e.weekly_hours || 39 };
    byUser[name].entries.push(e);
  }

  if (Object.keys(byUser).length === 0) {
    container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Keine Einträge in diesem Monat</div>';
    return;
  }

  // Calculate month soll (weekdays in selected month up to today)
  const [mY, mM] = month.split('-').map(Number);
  const today = new Date(); today.setHours(0,0,0,0);
  const monthStart = new Date(mY, mM - 1, 1);
  const monthEnd = new Date(mY, mM, 0); // last day of month

  // Speichere Daten für Detail-View
  window._teamData = byUser;
  window._teamMonth = month;

  let html = '';
  for (const [name, { entries, weekly_hours }] of Object.entries(byUser).sort()) {
    const totalMin = entries.reduce((sum, e) => {
      const dur = calcDuration(e.from_time || '', e.to_time || '', e.break_min || 0);
      return sum + dur.total;
    }, 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const pending = entries.filter(e => !e.transferred).length;
    // Calculate month soll for this user (mit Feiertagen)
    const userDayMin = (weekly_hours * 60) / 5;
    let monthSollMin = 0;
    const endDate = monthEnd < today ? monthEnd : today;
    const cur = new Date(monthStart);
    while (cur <= endDate) {
      const ds = isoDate(cur);
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6 && !isHoliday(ds)) monthSollMin += userDayMin;
      cur.setDate(cur.getDate() + 1);
    }
    const diffMin = totalMin - monthSollMin;
    const diffSign = diffMin >= 0 ? '+' : '−';
    const diffAbs = Math.abs(Math.round(diffMin));
    const diffCol = diffMin >= 0 ? 'var(--green)' : 'var(--red)';
    const safeName = escapeHtml(name);
    html += `<div class="panel team-member-panel" style="margin-bottom:0.75rem" onclick="showTeamMemberDetail('${safeName.replace(/'/g, "\\'")}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:500;font-size:0.95rem">${safeName}</div>
        <div style="color:var(--accent);font-family:'DM Mono',monospace;font-size:1.1rem">${h}h ${String(m).padStart(2,'0')}m</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.3rem">
        <div style="color:var(--muted);font-size:0.72rem">
          ${entries.length} Einträge · ${pending > 0 ? `<span style="color:var(--accent2)">${pending} nicht übertragen</span>` : '<span style="color:var(--green)">alle übertragen</span>'}
        </div>
        <div style="font-size:0.75rem">
          <span style="color:var(--muted)">Soll: ${fmtDur(Math.round(monthSollMin))}</span>
          <span style="color:${diffCol};margin-left:0.5rem;font-weight:500">${diffSign}${Math.floor(diffAbs/60)}h${String(diffAbs%60).padStart(2,'0')}m</span>
        </div>
      </div>
      <div style="color:var(--muted);font-size:0.65rem;margin-top:0.15rem">${weekly_hours}h/Woche</div>
    </div>`;
  }
  container.innerHTML = html;
}

function showTeamMemberDetail(name) {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) return;
  const userData = window._teamData?.[name];
  if (!userData) return;
  const { entries, weekly_hours } = userData;

  const container = document.getElementById('teamContainer');
  if (!container) return;

  // Sortiere nach Datum+Zeit
  entries.sort((a, b) => (a.date + (a.from_time || '')).localeCompare(b.date + (b.from_time || '')));

  // Gruppiere nach Tag
  const groups = {};
  entries.forEach(e => {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });

  const totalMin = entries.reduce((sum, e) => sum + calcDuration(e.from_time || '', e.to_time || '', e.break_min || 0).total, 0);
  const weekdays = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  let html = `<button class="back-btn" onclick="renderTeamPage()" style="margin-bottom:1rem">← Zurück zur Teamliste</button>`;
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
    <div style="font-weight:500;font-size:1.1rem">${escapeHtml(name)}</div>
    <div style="color:var(--accent);font-family:'DM Mono',monospace;font-size:1.1rem">${fmtDur(totalMin)}</div>
  </div>`;
  html += `<div style="color:var(--muted);font-size:0.72rem;margin-bottom:1rem">${entries.length} Einträge · ${weekly_hours}h/Woche · ${window._teamMonth || ''}</div>`;

  const sortedDates = Object.keys(groups).sort().reverse();
  html += sortedDates.map(date => {
    const dayEntries = groups[date];
    const dayMins = dayEntries.reduce((s, e) => s + calcDuration(e.from_time || '', e.to_time || '', e.break_min || 0).total, 0);
    const d = new Date(date + 'T12:00');
    const dateLabel = `${weekdays[d.getDay()]} · ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}`;

    return `<div class="day-group">
      <div class="day-header">
        <span class="day-label">${dateLabel}</span>
        <span class="day-total">${fmtDur(dayMins)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.3rem">
        ${dayEntries.map(e => {
          const dur = calcDuration(e.from_time || '', e.to_time || '', e.break_min || 0);
          const taskBadge = e.task ? `<span class="entry-task ${taskClass(e.task)}">${escapeHtml(e.task)}</span>` : '';
          const custName = e.customer_name || '\u2013';
          const locName = e.location_name && e.location_name !== '\u2013 Standort wählen \u2013' ? e.location_name : '';
          const travelStr = (e.travel_min > 0 || e.travel_km > 0) ? `<div class="entry-travel">${e.travel_min ? e.travel_min + 'min' : ''}${e.travel_min && e.travel_km ? ' · ' : ''}${e.travel_km ? e.travel_km + 'km' : ''} Anfahrt</div>` : '';
          return `<div class="entry${e.transferred ? ' transferred' : ''}">
            <div class="entry-left">
              <div class="entry-times">${escapeHtml(e.from_time || '')} <span>→</span> ${escapeHtml(e.to_time || '')}</div>
            </div>
            <div class="entry-meta">
              <div class="entry-customer">${escapeHtml(custName)}${locName ? ` <span style="color:var(--muted)">·</span> <span class="entry-location">${escapeHtml(locName)}</span>` : ''}</div>
              ${taskBadge}${e.title ? `<div class="entry-title">${escapeHtml(e.title)}</div>` : ''}${e.note ? `<div class="entry-desc">${escapeHtml(e.note)}</div>` : ''}
            </div>
            <div class="entry-right">
              <div class="entry-duration">${dur.h}h ${String(dur.m).padStart(2,'0')}m</div>
              ${e.break_min > 0 ? `<div class="entry-break">${e.break_min}min Pause</div>` : ''}
              ${travelStr}
              <span class="transfer-btn ${e.transferred ? 'done' : ''}" style="pointer-events:none" title="${e.transferred ? 'Übertragen' : 'Ausstehend'}">✓</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  container.innerHTML = html;
}

// ============================================================
