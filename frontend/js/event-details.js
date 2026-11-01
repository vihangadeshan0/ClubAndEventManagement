(() => {
  'use strict';

  const { $, esc, isUpcoming, formatDate, icon, toast, statusMarkup, loadEvents, loadRegistrations, registerForEvent, CATEGORY_LABELS } = window.CampusFlow;

  const root = $('detailContent');
  const eventId = (new URLSearchParams(window.location.search).get('id') || '').trim();

  let events = [];
  let registrations = {};
  let current = null;
  let loaded = false;

  /* ---------- Registration panel ---------- */
  function registrationMarkup() {
    const state = registrations[current.id];
    const ended = !isUpcoming(current);

    if (state) {
      const note = 'Your seat is reserved.';
      return `
        <div class="reg-state" id="regState" tabindex="-1">${statusMarkup(state)}</div>
        <p class="muted">${note}${ended ? ' This event has ended.' : ''}</p>`;
    }
    if (ended) {
      return '<p class="muted" id="regState">Registration is closed because this event has ended.</p>';
    }
    if (Number(current.availableSeats) < 1) return '<p class="muted" id="regState">This event is full.</p>';
    return `
      <button class="btn btn-primary" type="button" id="registerBtn">Register for this event</button>
      <p class="muted">Your seat is reserved when the server confirms your registration.</p>`;
  }

  /* ---------- Page states ---------- */
  function renderDetail() {
    const label = CATEGORY_LABELS[current.category] || current.category;
    document.title = `${current.title} | Campus Events`;
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = `
      <div class="event-visual detail-visual" data-category="${esc(current.category)}" aria-hidden="true"></div>
      <div class="detail-layout">
        <article class="panel detail-main" aria-labelledby="eventTitle">
          <span class="tag">${esc(label)}</span>
          <h1 id="eventTitle">${esc(current.title)}</h1>
          <dl class="facts">
            <div><dt>${icon('calendar')}Date</dt><dd>${formatDate(current.date)}</dd></div>
            <div><dt>${icon('clock')}Time</dt><dd>${esc(current.time)}</dd></div>
            <div><dt>${icon('pin')}Venue</dt><dd>${esc(current.venue)}</dd></div>
            <div><dt>Capacity</dt><dd>${Number(current.capacity)} seats</dd></div>
            <div><dt>Available</dt><dd>${Number(current.availableSeats)} seats</dd></div>
          </dl>
          <h2>About this event</h2>
          <p class="detail-desc">${esc(current.description)}</p>
        </article>
        <section class="panel reg-panel" aria-labelledby="regHeading">
          <h2 id="regHeading">Registration</h2>
          <div id="regBody">${registrationMarkup()}</div>
        </section>
      </div>`;
  }

  function renderNotFound() {
    document.title = 'Event not found | Campus Events';
    root.setAttribute('aria-busy', 'false');
    const detail = eventId
      ? `We couldn't find an event with the ID "${esc(eventId)}". It may have been removed, or the link may be incorrect.`
      : 'This link has no event ID. Pick an event from the list to see its details.';
    root.innerHTML = `
      <div class="state-box">
        <h1>Event not found</h1>
        <p class="muted">${detail}</p>
        <a class="btn btn-primary" href="events.html">Back to events</a>
      </div>`;
  }

  function showLoading() {
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = '<div class="skeleton skeleton--detail"></div>';
  }

  function showError() {
    document.title = 'Something went wrong | Campus Events';
    root.setAttribute('aria-busy', 'false');
    root.innerHTML = `
      <div class="state-box" role="alert">
        <h1>Couldn't load this event</h1>
        <p class="muted">Check your connection and try again.</p>
        <button class="btn btn-primary" type="button" id="retryBtn">Try again</button>
      </div>`;
  }

  function render() {
    current = eventId ? events.find((e) => e.id === eventId) || null : null;
    if (current) renderDetail();
    else renderNotFound();
  }

  async function init() {
    loaded = false;
    showLoading();
    try {
      const [eventRows, registrationRows] = await Promise.all([loadEvents(), loadRegistrations()]);
      events = eventRows;
      registrations = registrationRows;
      loaded = true;
      render();
    } catch {
      showError();
    }
  }

  /* ---------- Interactions ---------- */
  root.addEventListener('click', async (ev) => {
    if (ev.target.closest('#retryBtn')) { init(); return; }
    if (!ev.target.closest('#registerBtn') || !current) return;

    if (registrations[current.id]) return; // prevent duplicate registrations
    if (!isUpcoming(current)) return;      // past events are closed

    const button = ev.target.closest('#registerBtn');
    if (button) button.disabled = true;
    try {
      await registerForEvent(current.id);
      registrations[current.id] = 'confirmed';
    } catch (error) {
      toast(error.message);
      if (button) button.disabled = false;
      return;
    }
    $('regBody').innerHTML = registrationMarkup();
    toast(`${current.title}: registration confirmed.`);
    const status = $('regState');
    if (status) status.focus(); // the button was replaced, so keep keyboard focus in the panel
  });

  // Keep the status in sync if registrations change in another tab on this device
  init();
})();
