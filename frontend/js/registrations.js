(() => {
  'use strict';
  const { $, esc, formatDate, icon, apiFetch, toast, CATEGORY_LABELS } = window.CampusFlow;
  const content = $('regContent');
  const stats = $('stats');
  const stamp = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable';
  function render(rows) {
    content.setAttribute('aria-busy', 'false');
    const active = rows.filter((r) => r.status === 'active');
    const cards = [
      ['Total', rows.length, 'Registration history'], ['Active', active.length, 'Current reservations'],
      ['Cancelled', rows.filter((r) => r.status === 'cancelled').length, 'Cancelled registrations'],
    ];
    stats.innerHTML = cards.map(([label, value, name]) => `<article class="stat"><p class="stat-label">${label}</p><p class="stat-value">${String(value).padStart(2, '0')}</p><p class="stat-name">${name}</p></article>`).join('');
    if (!rows.length) { content.innerHTML = '<div class="state-box"><h2>No registrations yet</h2><p class="muted">When you register for an event, it will show here.</p><a class="btn btn-primary" href="events.html">Browse events</a></div>'; return; }
    content.innerHTML = `<section class="block"><div class="block-head"><h2>Registration history</h2><span class="section-count">${rows.length} ${rows.length === 1 ? 'event' : 'events'}</span></div><ul class="reg-cards">${rows.map((r) => {
      const e = r.event;
      const status = r.status === 'active' ? '<span class="portal-badge approved">Active</span>' : `<span class="portal-badge ${r.status === 'cancelled' ? 'rejected' : ''}">${esc(r.status)}</span>`;
      const canCancel = r.status === 'active' && e && e.startsAt && new Date(e.startsAt) > new Date();
      return `<li class="reg-card"><div class="reg-main">${e ? `<span class="tag">${esc(CATEGORY_LABELS[e.category] || e.category)}</span><h3><a class="reg-title-link" href="event-details.html?id=${encodeURIComponent(r.eventId)}">${esc(e.title)}</a></h3><ul class="meta"><li>${icon('calendar')}<span>${formatDate(e.date)}</span></li><li>${icon('clock')}<span>${esc(e.time)}</span></li><li>${icon('pin')}<span>${esc(e.venue)}</span></li></ul>` : '<h3>Event details unavailable</h3>'}<p class="muted">Registered: ${stamp(r.registeredAt)}</p></div><div class="reg-side">${status}${canCancel ? `<button class="btn btn-secondary" type="button" data-cancel="${Number(r.id)}">Cancel registration</button>` : ''}</div></li>`;
    }).join('')}</ul></section>`;
  }
  async function load() {
    content.setAttribute('aria-busy', 'true');
    content.innerHTML = '<div class="skeleton skeleton--row"></div><div class="skeleton skeleton--row"></div>';
    try { const { registrations } = await apiFetch('/registrations?history=1'); render(registrations); }
    catch (error) { content.setAttribute('aria-busy', 'false'); stats.innerHTML = ''; content.innerHTML = `<div class="state-box" role="alert"><h2>Could not load registrations</h2><p class="muted">${esc(error.message)}</p><button class="btn btn-primary" id="retryBtn" type="button">Try again</button></div>`; }
  }
  content.addEventListener('click', async (event) => {
    if (event.target.closest('#retryBtn')) return load();
    const button = event.target.closest('[data-cancel]'); if (!button) return;
    button.disabled = true;
    try { await apiFetch(`/registrations/${encodeURIComponent(button.dataset.cancel)}`, { method: 'DELETE' }); toast('Registration cancelled.'); await load(); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  load();
})();
