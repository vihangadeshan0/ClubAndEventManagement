(() => {
  'use strict';
  const { $, esc, isUpcoming, formatDate, eventCard, toast, loadEvents, registerForEvent, apiFetch } = window.CampusFlow;
  let events = [];
  let registrations = {};
  let registrationRows = [];
  let pendingRequests = 0;
  let announcements = [];
  let notifications = { notifications: [], unreadCount: 0 };
  const dateTime = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

  $('todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function renderStats() {
    const activeEvents = events.filter(isUpcoming).length;
    const myRegistrations = registrationRows.filter((row) => row.status === 'active').length;
    const cards = [['Active Events', activeEvents], ['My Registrations', myRegistrations], ['Pending Requests', pendingRequests]];
    $('stats').innerHTML = cards.map(([label, value]) => `<article class="stat"><p class="stat-value">${Number(value) || 0}</p><p class="stat-name">${esc(label)}</p></article>`).join('');
  }

  function renderFeatured(upcoming) {
    const featured = $('featuredEvents');
    featured.setAttribute('aria-busy', 'false');
    featured.innerHTML = upcoming.length
      ? upcoming.slice(0, 4).map((event) => eventCard(event, registrations)).join('')
      : '<p class="portal-empty">No upcoming events yet. New published events will appear here.</p>';
  }

  function renderEvents(upcoming) {
    const wrapper = $('eventGrid');
    const body = $('eventRows');
    wrapper.setAttribute('aria-busy', 'false');
    $('eventCount').textContent = `${upcoming.length} ${upcoming.length === 1 ? 'event' : 'events'}`;
    body.innerHTML = upcoming.length ? upcoming.map((event) => {
      const seats = Math.max(0, Number(event.availableSeats) || 0);
      const capacity = Math.max(0, Number(event.capacity) || 0);
      const full = seats < 1;
      const registered = registrations[event.id];
      const state = registered
        ? '<span class="spots-pill open">Registered</span>'
        : `<span class="spots-pill ${full ? 'full' : 'open'}">${full ? 'Full' : `Open · ${seats}/${capacity}`}</span>`;
      const action = registered
        ? '<span class="muted">Registered</span>'
        : full
          ? '<button class="btn btn-secondary" type="button" disabled>Full</button>'
          : `<button class="btn btn-primary" type="button" data-register="${esc(event.id)}">Register</button>`;
      return `<tr><td data-label="Event Name"><strong>${esc(event.title)}</strong></td><td data-label="Date / Time">${formatDate(event.date)} · ${esc(event.time)}</td><td data-label="Venue">${esc(event.venue)}</td><td data-label="Spots Left">${state}</td><td data-label="Action"><div class="dashboard-event-actions">${action}<a class="quiet-link" href="event-details.html?id=${encodeURIComponent(event.id)}">Details</a></div></td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="portal-empty">No upcoming events are available right now.</div></td></tr>';
  }

  function renderRegistrations() {
    const recent = [...registrationRows].sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || '')).slice(0, 4);
    $('regList').innerHTML = recent.length ? recent.map((row) => {
      const title = row.event?.title || 'Event details unavailable';
      const date = row.event?.date ? formatDate(row.event.date) : dateTime(row.registeredAt);
      return `<li><a class="reg-title" href="event-details.html?id=${encodeURIComponent(row.eventId)}">${esc(title)}</a><span class="reg-meta">${esc(date)} · ${esc(row.status)}</span></li>`;
    }).join('') : '<li class="muted">No registrations yet. Browse events to find one.</li>';
  }

  function renderUpdates(announcements, notifications) {
    const unreadCount = Number(notifications?.unreadCount ?? 0);
    $('notificationSummary').textContent = unreadCount ? `${unreadCount} unread` : 'No unread notifications';
    const notificationRows = Array.isArray(notifications?.notifications) ? notifications.notifications : [];
    const updates = [
      ...notificationRows.slice(0, 3).map((item) => ({ ...item, kind: 'Notification', timestamp: item.createdAt })),
      ...announcements.slice(0, 3).map((item) => ({ ...item, kind: item.clubId ? 'Club announcement' : 'Campus announcement', timestamp: item.createdAt })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
    $('updatesList').innerHTML = updates.length ? updates.map((item) => `<li class="dashboard-update-item"><strong>${esc(item.title)} <span class="update-kind">· ${esc(item.kind)}</span></strong><p>${esc(item.body)}</p><time datetime="${esc(item.timestamp)}" title="${esc(dateTime(item.timestamp))}">${esc(dateTime(item.timestamp))}</time></li>`).join('') : '<li class="muted">No recent notifications or announcements.</li>';
  }

  function renderAll() {
    const upcoming = events.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date));
    renderStats();
    renderFeatured(upcoming);
    renderEvents(upcoming);
    renderRegistrations();
    renderUpdates(announcements, notifications);
  }

  function showLoading() {
    $('eventGrid').setAttribute('aria-busy', 'true');
    $('eventRows').innerHTML = '<tr><td colspan="5">Loading available events…</td></tr>';
    $('featuredEvents').setAttribute('aria-busy', 'true');
    $('featuredEvents').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    $('stats').innerHTML = '<div class="skeleton skeleton--stat"></div>'.repeat(3);
  }

  async function init() {
    showLoading();
    try {
      const [eventRows, registrationData, me, announcementData, membershipData, notificationData] = await Promise.all([
        loadEvents(), apiFetch('/registrations?history=1'), apiFetch('/auth/me'), apiFetch('/announcements'),
        apiFetch('/memberships'), apiFetch('/notifications'),
      ]);
      events = eventRows;
      registrationRows = registrationData.registrations || [];
      registrations = Object.fromEntries(registrationRows.filter((row) => row.status === 'active').map((row) => [String(row.eventId), 'confirmed']));
      pendingRequests = (membershipData.memberships || []).filter((membership) => membership.status === 'pending').length;
      announcements = announcementData.announcements || [];
      notifications = {
        notifications: Array.isArray(notificationData?.notifications) ? notificationData.notifications : [],
        unreadCount: Number(notificationData?.unreadCount ?? 0),
      };
      $('welcomeTitle').textContent = `Welcome back, ${me.user.fullName.split(' ')[0]}!`;
      $('welcomeTitle').setAttribute('aria-label', `Welcome back, ${me.user.fullName}`);
      renderAll();
    } catch (error) {
      $('eventGrid').setAttribute('aria-busy', 'false');
      $('featuredEvents').setAttribute('aria-busy', 'false');
      $('eventRows').innerHTML = `<tr><td colspan="5" role="alert">${esc(error.message || 'Could not load dashboard data.')}</td></tr>`;
      $('featuredEvents').innerHTML = '<p class="portal-empty">Could not load featured events.</p>';
      $('stats').innerHTML = '';
      $('regList').innerHTML = '<li class="muted">Could not load registrations.</li>';
      $('updatesList').innerHTML = '<li class="muted">Could not load campus updates.</li>';
    }
  }

  async function handleRegister(event) {
    const button = event.target.closest('[data-register]');
    if (!button) return;
    const id = String(button.dataset.register);
    if (registrations[id]) return;
    button.disabled = true;
    try {
      const registration = await registerForEvent(id);
      registrations[id] = 'confirmed';
      const eventRow = events.find((row) => String(row.id) === id);
      if (eventRow) {
        eventRow.availableSeats = Math.max(0, Number(eventRow.availableSeats) - 1);
        registrationRows.unshift({ ...registration, status: 'active', registeredAt: new Date().toISOString(), event: eventRow });
      }
      renderAll();
      toast(`${eventRow?.title || 'Event'}: registration confirmed.`);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  }

  $('eventGrid').addEventListener('click', handleRegister);
  $('featuredEvents').addEventListener('click', handleRegister);
  init();
})();
