(() => {
  'use strict';

  const { $, isUpcoming, eventCard, toast, loadEvents, loadRegistrations, saveRegistrations, CATEGORY_LABELS, STORAGE_KEY } = window.CampusFlow;

  const grid = $('eventGrid');
  const search = $('eventSearch');
  const count = $('resultCount');
  const chips = [...document.querySelectorAll('.chip')];

  let events = [];
  let registrations = loadRegistrations();
  let loaded = false;
  const state = { q: '', category: 'all' };

  /* ---------- Initial filters from the URL (?category=sports&q=lab) ---------- */
  const params = new URLSearchParams(window.location.search);
  const urlCategory = params.get('category');
  if (urlCategory && CATEGORY_LABELS[urlCategory]) state.category = urlCategory;
  state.q = params.get('q') || '';
  search.value = state.q;

  function syncChips() {
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.category === state.category)));
  }

  function updateUrl() {
    const next = new URLSearchParams();
    if (state.category !== 'all') next.set('category', state.category);
    if (state.q.trim()) next.set('q', state.q.trim());
    const mock = params.get('mock');
    if (mock) next.set('mock', mock);
    const qs = next.toString();
    try {
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    } catch { /* some browsers block this on file:// pages; filters still work */ }
  }

  /* ---------- Filtering ---------- */
  function visibleEvents() {
    // Each search word must match the START of a word (so "lab" finds "Computer Lab" but not "collaborative")
    const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
      .map((t) => new RegExp(`(^|[^a-z0-9])${escapeRe(t)}`));
    return events
      .filter(isUpcoming)
      .filter((e) => state.category === 'all' || e.category === state.category)
      .filter((e) => {
        const haystack = [e.title, e.description, e.venue, CATEGORY_LABELS[e.category]].join(' ').toLowerCase();
        return patterns.every((re) => re.test(haystack));
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------- Rendering ---------- */
  function render() {
    if (!loaded) return;
    const list = visibleEvents();
    const total = events.filter(isUpcoming).length;
    grid.setAttribute('aria-busy', 'false');

    if (!total) {
      count.textContent = '';
      grid.innerHTML = `<div class="state-box"><h2>No upcoming events yet</h2><p class="muted">New events will show up here as soon as they're published.</p></div>`;
      return;
    }

    count.textContent = `Showing ${list.length} of ${total} upcoming ${total === 1 ? 'event' : 'events'}`;

    if (!list.length) {
      grid.innerHTML = `
        <div class="state-box">
          <h2>No events match your search</h2>
          <p class="muted">Try a different word or switch to another category.</p>
          <button class="btn btn-secondary" type="button" id="clearFilters">Clear filters</button>
        </div>`;
      return;
    }
    grid.innerHTML = list.map((e) => eventCard(e, registrations)).join('');
  }

  function showLoading() {
    grid.setAttribute('aria-busy', 'true');
    count.textContent = 'Loading events…';
    grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  }

  function showError() {
    grid.setAttribute('aria-busy', 'false');
    count.textContent = '';
    grid.innerHTML = `
      <div class="state-box" role="alert">
        <h2>Couldn't load events</h2>
        <p class="muted">Check your connection and try again.</p>
        <button class="btn btn-primary" type="button" id="retryBtn">Try again</button>
      </div>`;
  }

  async function init() {
    loaded = false;
    showLoading();
    try {
      events = await loadEvents();
      loaded = true;
      render();
    } catch {
      showError();
    }
  }

  /* ---------- Interactions ---------- */
  search.addEventListener('input', () => {
    state.q = search.value;
    render();
    updateUrl();
  });

  $('chips').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    state.category = chip.dataset.category;
    syncChips();
    render();
    updateUrl();
  });

  grid.addEventListener('click', (ev) => {
    if (ev.target.closest('#retryBtn')) { init(); return; }

    if (ev.target.closest('#clearFilters')) {
      state.q = '';
      state.category = 'all';
      search.value = '';
      syncChips();
      render();
      updateUrl();
      search.focus();
      return;
    }

    const btn = ev.target.closest('[data-register]');
    if (!btn) return;

    const id = btn.dataset.register;
    if (registrations[id]) return; // prevent duplicate registrations

    // Mock only: saved in this browser, not sent anywhere
    registrations[id] = 'pending';
    saveRegistrations(registrations);
    render();
    const e = events.find((x) => x.id === id);
    toast(`${e ? e.title : 'Event'}: saved locally as pending. Mock data only, nothing was sent to a backend.`);
    // Re-rendering removed the clicked button, so move focus to the same card's link
    const link = grid.querySelector(`.event-link[href$="id=${encodeURIComponent(id)}"]`);
    if (link) link.focus();
  });

  // Keep this page in sync if registrations change in another tab (e.g. the dashboard)
  window.addEventListener('storage', (ev) => {
    if (ev.key !== null && ev.key !== STORAGE_KEY) return;
    registrations = loadRegistrations();
    render();
  });

  syncChips();
  init();
})();
