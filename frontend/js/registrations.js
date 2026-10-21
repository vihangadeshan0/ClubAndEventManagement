(() => {
  'use strict';

  const { $, esc, isUpcoming, formatDate, icon, statusMarkup, loadEvents, loadRegistrations, STORAGE_KEY, CATEGORY_LABELS } = window.CampusFlow;

  const content = $('regContent');
  const statsEl = $('stats');

  let events = [];
  let registrations = loadRegistrations();
  let loaded = false;

  const plural = (n) => `${n} ${n === 1 ? 'event' : 'events'}`;

  /* ---------- Rendering ---------- */
  function regCard(e, past) {
    return `
      <li class="reg-card${past ? ' reg-card--past' : ''}">
        <div class="reg-main">
          <span class="tag">${esc(CATEGORY_LABELS[e.category] || e.category)}</span>
          <h3><a class="reg-title-link" href="event-details.html?id=${encodeURIComponent(e.id)}">${esc(e.title)}</a></h3>
          <ul class="meta">
            <li>${icon('calendar')}<span>${formatDate(e.date)}</span></li>
            <li>${icon('clock')}<span>${esc(e.time)}</span></li>
            <li>${icon('pin')}<span>${esc(e.venue)}</span></li>
          </ul>
        </div>
        <div class="reg-side">
          ${statusMarkup(registrations[e.id])}
          ${past ? '<span class="muted">This event has ended</span>' : ''}
        </div>
      </li>`;
  }

  function section(id, title, items, past, emptyHtml) {
    return `
      <section class="block" aria-labelledby="${id}">
        <div class="block-head">
          <h2 id="${id}">${title}</h2>
          <span class="section-count">${plural(items.length)}</span>
        </div>
        ${items.length
          ? `<ul class="reg-cards">${items.map((e) => regCard(e, past)).join('')}</ul>`
          : `<p class="muted empty-note">${emptyHtml}</p>`}
      </section>`;
  }

  function renderStats(mine, upcoming) {
    const confirmed = mine.filter((e) => registrations[e.id] === 'confirmed').length;
    const pending = mine.length - confirmed;
    const cards = [
      ['Total', mine.length, 'Registered Events', "Events you've signed up for"],
      ['Coming up', upcoming.length, 'Upcoming', 'Still to attend'],
      ['Confirmed', confirmed, 'Confirmed', 'Registration confirmed'],
      ['Waiting', pending, 'Pending', 'Awaiting confirmation'],
    ];
    statsEl.innerHTML = cards.map(([label, value, name, desc]) => `
      <article class="stat">
        <p class="stat-label">${esc(label)}</p>
        <p class="stat-value">${String(value).padStart(2, '0')}</p>
        <p class="stat-name">${esc(name)}</p>
        <p class="stat-desc">${esc(desc)}</p>
      </article>`).join('');
  }

  function render() {
    if (!loaded) return;
    content.setAttribute('aria-busy', 'false');

    // Only registrations that match a known event are shown (stale ids are ignored)
    const mine = events.filter((e) => registrations[e.id]);
    const upcoming = mine.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date));
    const past = mine.filter((e) => !isUpcoming(e)).sort((a, b) => b.date.localeCompare(a.date));
    renderStats(mine, upcoming);

    if (!mine.length) {
      content.innerHTML = `
        <div class="state-box">
          <h2>No registrations yet</h2>
          <p class="muted">When you register for an event, it will show up here.</p>
          <a class="btn btn-primary" href="events.html">Browse events</a>
        </div>`;
      return;
    }

    content.innerHTML =
      section('upcomingTitle', 'Upcoming registrations', upcoming, false,
        'No upcoming registrations. <a class="text-link" href="events.html">Browse events</a> to sign up for something new.') +
      section('pastTitle', 'Past registrations', past, true,
        'Registrations move here after the event date.');
  }

  function showLoading() {
    content.setAttribute('aria-busy', 'true');
    statsEl.innerHTML = '<div class="skeleton skeleton--stat"></div>'.repeat(4);
    content.innerHTML = '<div class="skeleton skeleton--row"></div><div class="skeleton skeleton--row"></div>';
  }

  function showError() {
    content.setAttribute('aria-busy', 'false');
    statsEl.innerHTML = '';
    content.innerHTML = `
      <div class="state-box" role="alert">
        <h2>Couldn't load your registrations</h2>
        <p class="muted">Check your connection and try again.</p>
        <button class="btn btn-primary" type="button" id="retryBtn">Try again</button>
      </div>`;
  }

  async function init() {
    loaded = false;
    showLoading();
    try {
      events = await loadEvents();
      registrations = loadRegistrations();
      loaded = true;
      render();
    } catch {
      showError();
    }
  }

  /* ---------- Interactions ---------- */
  content.addEventListener('click', (ev) => {
    if (ev.target.closest('#retryBtn')) init();
  });

  // Keep this page in sync if registrations change in another tab on this device
  window.addEventListener('storage', (ev) => {
    if (ev.key !== null && ev.key !== STORAGE_KEY) return;
    registrations = loadRegistrations();
    render();
  });

  init();
})();
