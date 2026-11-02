/* Shared API access and rendering helpers for CampusFlow. */
(() => {
  'use strict';
  const STORAGE_KEY = 'campusflow.session.registrations';
  const CATEGORY_LABELS = { technology: 'Technology', cultural: 'Cultural', careers: 'Careers', sports: 'Sports', other: 'Other' };
  async function apiFetch(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (!tokenResponse.ok) throw new Error('Could not start a secure session. Refresh the page and try again.');
      const tokenData = await tokenResponse.json();
      if (!tokenData.csrfToken) throw new Error('Could not start a secure session. Refresh the page and try again.');
      headers.set('X-CSRFToken', tokenData.csrfToken);
    }
    let response = await fetch(`/api${path}`, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    let data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    // Flask rejects a stale CSRF token before dispatching the route. Refresh once and retry.
    if (response.status === 400 && data.error?.code === 'csrf_failed' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        if (tokenData.csrfToken) {
          headers.set('X-CSRFToken', tokenData.csrfToken);
          response = await fetch(`/api${path}`, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
          data = response.status === 204 ? {} : await response.json().catch(() => ({}));
        }
      }
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || `Request failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.code = data.error?.code;
      if (response.status === 401 && !location.pathname.endsWith('login.html')) location.href = 'login.html';
      throw error;
    }
    return data;
  }
  async function loadEvents() { return (await apiFetch('/events')).events; }
  async function loadRegistrations() {
    const data = await apiFetch('/registrations');
    return Object.fromEntries(data.registrations.filter((r) => r.status === 'active').map((r) => [String(r.eventId), 'confirmed']));
  }
  async function loadRegistrationRows() { return (await apiFetch('/registrations')).registrations; }
  async function registerForEvent(id) {
    const data = await apiFetch(`/events/${encodeURIComponent(id)}/registrations`, { method: 'POST', body: '{}' });
    return data.registration;
  }
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isUpcoming = (e) => new Date(`${e.date}T23:59:59`) >= new Date();
  const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;
  let toastTimer;
  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  function statusMarkup(state) {
    return state === 'confirmed' || state === 'active'
      ? '<span class="status status--ok"><span aria-hidden="true">✓</span> Registration confirmed</span>'
      : '<span class="status status--pending"><span aria-hidden="true">⏳</span> Pending confirmation</span>';
  }
  function eventCard(e, registrations) {
    const state = registrations[e.id];
    const action = state ? statusMarkup(state) : Number(e.availableSeats) < 1
      ? '<span class="status status--pending">Event full</span>'
      : `<button class="btn btn-primary" type="button" data-register="${esc(e.id)}" aria-label="Register for ${esc(e.title)}">Register</button>`;
    return `<article class="event-card"><div class="event-visual" data-category="${esc(e.category)}" aria-hidden="true"></div><div class="event-body"><span class="tag">${esc(CATEGORY_LABELS[e.category] || e.category)}</span><h3>${esc(e.title)}</h3><ul class="meta"><li>${icon('calendar')}<span>${formatDate(e.date)}</span></li><li>${icon('clock')}<span>${esc(e.time)}</span></li><li>${icon('pin')}<span>${esc(e.venue)}</span></li></ul><p class="event-desc">${esc(e.description)}</p><p class="muted">${Number(e.availableSeats ?? 0)} seats available</p><div class="event-actions"><a class="event-link" href="event-details.html?id=${encodeURIComponent(e.id)}">View details<span class="sr-only"> for ${esc(e.title)}</span> →</a>${action}</div></div></article>`;
  }
  window.CampusFlow = { STORAGE_KEY, CATEGORY_LABELS, loadEvents, loadRegistrations, loadRegistrationRows, registerForEvent, apiFetch, $, esc, isUpcoming, formatDate, icon, toast, statusMarkup, eventCard };
})();
