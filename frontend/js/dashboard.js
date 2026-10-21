(() => {
  "use strict";

  const {
    $,
    esc,
    isUpcoming,
    statusMarkup,
    eventCard,
    toast,
    loadEvents,
    loadRegistrations,
    saveRegistrations,
  } = window.CampusFlow;

  let events = [];
  let registrations = loadRegistrations();

  /* ---------- Header date ---------- */
  $("todayDate").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  /* ---------- Rendering ---------- */
  function renderStats() {
    const upcoming = events.filter(isUpcoming);
    const registeredIds = Object.keys(registrations).filter((id) =>
      events.some((e) => e.id === id),
    );
    const registeredUpcoming = upcoming.filter((e) => registrations[e.id]);
    const open = upcoming.filter((e) => !registrations[e.id]);
    const past = events.filter((e) => !isUpcoming(e));

    const cards = [
      [
        "My activity",
        registeredIds.length,
        "Registered Events",
        "Events you've signed up for",
      ],
      [
        "Coming up",
        registeredUpcoming.length,
        "Upcoming Events",
        "Your next campus activities",
      ],
      ["Discover", open.length, "Available Events", "Open for registration"],
      [
        "Your history",
        past.length,
        "Past Events",
        "Events that already happened",
      ],
    ];

    $("stats").innerHTML = cards
      .map(
        ([label, value, name, desc]) => `
      <article class="stat">
        <p class="stat-label">${esc(label)}</p>
        <p class="stat-value">${String(value).padStart(2, "0")}</p>
        <p class="stat-name">${esc(name)}</p>
        <p class="stat-desc">${esc(desc)}</p>
      </article>`,
      )
      .join("");
  }

  function renderEvents() {
    const grid = $("eventGrid");
    const upcoming = events
      .filter(isUpcoming)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
    grid.setAttribute("aria-busy", "false");

    if (!upcoming.length) {
      grid.innerHTML = `<div class="state-box"><h3>No upcoming events yet</h3><p class="muted">New events will show up here as soon as they're published.</p></div>`;
      return;
    }
    grid.innerHTML = upcoming.map((e) => eventCard(e, registrations)).join("");
  }

  function renderRegistrations() {
    const list = $("regList");
    const mine = events
      .filter((e) => registrations[e.id])
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);

    list.innerHTML = mine.length
      ? mine
          .map(
            (e) =>
              `<li><span class="reg-title">${esc(e.title)}</span>${statusMarkup(registrations[e.id])}</li>`,
          )
          .join("")
      : `<li class="muted">You haven't registered for any events yet. Pick one above to get started.</li>`;
  }

  function renderAll() {
    renderStats();
    renderEvents();
    renderRegistrations();
  }

  function showLoading() {
    $("eventGrid").setAttribute("aria-busy", "true");
    $("eventGrid").innerHTML =
      '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    $("stats").innerHTML = '<div class="skeleton skeleton--stat"></div>'.repeat(
      4,
    );
  }

  function showError() {
    const grid = $("eventGrid");
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `
      <div class="state-box" role="alert">
        <h3>Couldn't load events</h3>
        <p class="muted">Check your connection and try again.</p>
        <button class="btn btn-primary" type="button" id="retryBtn">Try again</button>
      </div>`;
    $("stats").innerHTML = "";
  }

  async function init() {
    showLoading();
    try {
      events = await loadEvents();
      renderAll();
    } catch {
      showError();
    }
  }

  /* ---------- Register (mock: saved locally, starts as pending) ---------- */
  $("eventGrid").addEventListener("click", (ev) => {
    const retry = ev.target.closest("#retryBtn");
    if (retry) {
      init();
      return;
    }

    const btn = ev.target.closest("[data-register]");
    if (!btn) return;

    const id = btn.dataset.register;
    if (registrations[id]) return; // prevent duplicate registrations

    registrations[id] = "pending";
    saveRegistrations(registrations);
    renderAll();
    const e = events.find((x) => x.id === id);
    toast(
      `${e ? e.title : "Event"}: saved locally as pending. Mock data only, nothing was sent to a backend.`,
    );
    // Re-rendering removed the clicked button, so move focus to the same card's link
    const link = $("eventGrid").querySelector(
      `.event-link[href$="id=${encodeURIComponent(id)}"]`,
    );
    if (link) link.focus();
  });

  init();
})();
