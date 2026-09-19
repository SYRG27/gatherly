'use strict';
/* Host dashboard: stats, guest list (search/filter/delete), edit, export. */
(function () {
  const { api, copyText, toast, fmtDateTime } = window.Evite;
  const token = location.pathname.split('/manage/')[1]?.split('/')[0] || '';
  const dash = document.getElementById('dash');

  let event = null;
  let rsvps = [];
  let stats = null;
  let inviteUrl = '';
  let filter = 'all';
  let query = '';

  function statCard(cls, value, label) {
    const d = document.createElement('div');
    d.className = `stat-card ${cls}`;
    const b = document.createElement('b');
    b.textContent = value;
    const s = document.createElement('span');
    s.textContent = label;
    d.append(b, s);
    return d;
  }

  function badge(status) {
    const b = document.createElement('span');
    b.className = `badge badge-${status}`;
    b.textContent = status === 'yes' ? 'Yes 🎉' : status === 'no' ? 'No 💌' : 'Maybe 🤔';
    return b;
  }

  function render() {
    dash.replaceChildren();

    // header
    const head = document.createElement('div');
    head.className = 'dash-head';
    const h1 = document.createElement('h1');
    h1.textContent = event.title || 'Untitled event';
    const sub = document.createElement('p');
    sub.className = 'sub';
    const parts = [];
    if (event.starts_at) parts.push(fmtDateTime(event.starts_at));
    if (event.venue) parts.push(event.venue);
    sub.textContent = parts.join(' · ') || 'No date set yet';
    const actions = document.createElement('div');
    actions.className = 'dash-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-soft btn-sm';
    copyBtn.textContent = '🔗 Copy invite link';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(inviteUrl);
      toast(ok ? 'Invite link copied!' : 'Copy failed');
    });

    const editBtn = document.createElement('a');
    editBtn.className = 'btn btn-soft btn-sm';
    editBtn.href = `/create?manage=${encodeURIComponent(token)}`;
    editBtn.textContent = '✏️ Edit event';

    const csvBtn = document.createElement('a');
    csvBtn.className = 'btn btn-soft btn-sm';
    csvBtn.href = `/api/manage/${encodeURIComponent(token)}/export.csv`;
    csvBtn.textContent = '⬇️ Export CSV';

    const viewBtn = document.createElement('a');
    viewBtn.className = 'btn btn-primary btn-sm';
    viewBtn.href = inviteUrl;
    viewBtn.target = '_blank';
    viewBtn.rel = 'noopener';
    viewBtn.textContent = 'View invite →';

    actions.append(copyBtn, editBtn, csvBtn, viewBtn);
    head.append(h1, sub, actions);
    dash.append(head);

    // stats
    const grid = document.createElement('div');
    grid.className = 'stat-grid';
    grid.append(
      statCard('stat-yes', stats.yes, 'Yes'),
      statCard('stat-no', stats.no, 'No'),
      statCard('stat-maybe', stats.maybe, 'Maybe'),
      statCard('stat-guests', stats.total_guests, 'Expected guests'),
      statCard('', stats.total_rsvps, 'Responses')
    );
    dash.append(grid);

    // guest list panel
    const panel = document.createElement('section');
    panel.className = 'guest-panel';

    const tools = document.createElement('div');
    tools.className = 'guest-tools';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '🔍 Search guests…';
    search.value = query;
    search.setAttribute('aria-label', 'Search guests');
    search.addEventListener('input', () => { query = search.value; renderTable(); });
    const pills = document.createElement('div');
    pills.className = 'filter-pills';
    [['all', 'All'], ['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']].forEach(([val, label]) => {
      const p = document.createElement('button');
      p.className = 'pill';
      p.textContent = label;
      p.setAttribute('aria-pressed', filter === val ? 'true' : 'false');
      p.addEventListener('click', () => {
        filter = val;
        pills.querySelectorAll('.pill').forEach((x) => x.setAttribute('aria-pressed', x === p ? 'true' : 'false'));
        renderTable();
      });
      pills.append(p);
    });
    tools.append(search, pills);
    panel.append(tools);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-scroll';
    tableWrap.id = 'table-wrap';
    panel.append(tableWrap);
    dash.append(panel);

    renderTable();
  }

  function visibleRsvps() {
    const q = query.trim().toLowerCase();
    return rsvps.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (q && !(r.name.toLowerCase().includes(q) ||
                 (r.contact || '').toLowerCase().includes(q) ||
                 (r.message || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function renderTable() {
    const wrap = document.getElementById('table-wrap');
    wrap.replaceChildren();
    const rows = visibleRsvps();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const e = document.createElement('div');
      e.className = 'big-emoji';
      e.textContent = rsvps.length ? '🔍' : '📭';
      const p = document.createElement('p');
      p.textContent = rsvps.length ? 'No guests match your search.' : 'No RSVPs yet — share your invite link to get the party started!';
      empty.append(e, p);
      wrap.append(empty);
      return;
    }
    const table = document.createElement('table');
    table.className = 'guests';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Guest', 'Contact', 'Status', 'Party', 'Message', 'Responded', ''].forEach((t) => {
      const th = document.createElement('th');
      th.textContent = t;
      th.scope = 'col';
      hr.append(th);
    });
    thead.append(hr);
    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = r.name;
      tdName.append(strong);
      const tdContact = document.createElement('td');
      tdContact.textContent = r.contact || '—';
      const tdStatus = document.createElement('td');
      tdStatus.append(badge(r.status));
      const tdGuests = document.createElement('td');
      tdGuests.textContent = r.guests;
      const tdMsg = document.createElement('td');
      tdMsg.className = 'msg-cell';
      tdMsg.textContent = r.message || '—';
      const tdWhen = document.createElement('td');
      tdWhen.textContent = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
      const tdDel = document.createElement('td');
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '🗑️';
      del.title = `Remove ${r.name}'s RSVP`;
      del.setAttribute('aria-label', `Remove RSVP from ${r.name}`);
      del.addEventListener('click', () => removeRsvp(r));
      tdDel.append(del);
      tr.append(tdName, tdContact, tdStatus, tdGuests, tdMsg, tdWhen, tdDel);
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
  }

  async function removeRsvp(r) {
    if (!window.confirm(`Remove ${r.name}'s RSVP?`)) return;
    try {
      await api(`/api/manage/${encodeURIComponent(token)}/rsvps/${r.id}`, { method: 'DELETE' });
      await refresh();
      toast('RSVP removed');
    } catch (err) {
      toast(err.message || 'Could not remove RSVP');
    }
  }

  async function refresh() {
    const data = await api(`/api/manage/${encodeURIComponent(token)}`);
    event = data.event;
    rsvps = data.rsvps;
    stats = data.stats;
    inviteUrl = data.invite_url;
    render();
  }

  (async function init() {
    try {
      await refresh();
      document.title = `${event.title} — Manage`;
    } catch (err) {
      dash.replaceChildren();
      const p = document.createElement('p');
      p.style.cssText = 'padding:4rem 0;text-align:center;color:var(--ink-soft)';
      p.textContent = "We couldn't find that event. The manage link may be wrong.";
      dash.append(p);
    }
  })();
})();
