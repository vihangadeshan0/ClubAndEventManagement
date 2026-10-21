/* Shared mock data, storage and card rendering for CampusFlow pages.
   MOCK DATA ONLY: replace the loaders with real API calls once the backend exists. */
(() => {
  'use strict';

  const STORAGE_KEY = 'campusflow.mock.registrations';

  const MOCK_EVENTS = [
    { id: 'hackathon-2026', title: 'Campus Hackathon 2026', category: 'technology', date: '2026-11-08', time: '9:00 AM', venue: 'Main Auditorium', description: 'A collaborative coding event for creative student projects.' },
    { id: 'cultural-fest', title: 'Campus Cultural Fest', category: 'cultural', date: '2026-11-14', time: '4:00 PM', venue: 'University Grounds', description: 'Music, performances and activities celebrating campus life.' },
    { id: 'career-day', title: 'Career & Innovation Day', category: 'careers', date: '2026-11-20', time: '10:00 AM', venue: 'Conference Hall', description: 'Meet industry representatives and explore career opportunities.' },
    { id: 'photo-walk', title: 'Campus Photography Walk', category: 'cultural', date: '2026-11-27', time: '8:30 AM', venue: 'Botanical Garden Gate', description: 'Explore campus with your camera and share your best shots.' },
    { id: 'inter-faculty-cup', title: 'Inter-Faculty Football Cup', category: 'sports', date: '2026-12-02', time: '3:30 PM', venue: 'Campus Stadium', description: 'Faculties compete in a knockout five-a-side tournament.' },
    { id: 'cyber-ctf', title: 'Beginner Cybersecurity CTF', category: 'technology', date: '2026-12-05', time: '10:00 AM', venue: 'Computer Lab 2', description: 'Solve beginner-friendly capture-the-flag challenges in teams.' },
    { id: 'ai-workshop', title: 'Intro to Machine Learning Workshop', category: 'technology', date: '2026-12-09', time: '1:00 PM', venue: 'Computer Lab 3', description: 'Hands-on session building your first model in Python.' },
    { id: 'cv-clinic', title: 'CV & Interview Clinic', category: 'careers', date: '2026-12-12', time: '11:00 AM', venue: 'Career Centre', description: 'Get your CV reviewed and practise interview questions with mentors.' },
    { id: 'fitness-challenge', title: 'Campus Fitness Challenge', category: 'sports', date: '2026-12-16', time: '7:00 AM', venue: 'Sports Complex', description: 'Team-based fitness stations for every level, from beginner up.' },
    { id: 'freshers-meetup', title: 'Freshers Meetup', category: 'cultural', date: '2026-09-12', time: '2:00 PM', venue: 'Student Centre', description: 'Welcome event for new students.' },
    { id: 'open-source-day', title: 'Open Source Contribution Day', category: 'technology', date: '2026-10-03', time: '10:00 AM', venue: 'Computer Lab 1', description: 'Make your first pull request with mentors.' },
  ];

  const DEFAULT_REGISTRATIONS = { 'hackathon-2026': 'confirmed', 'career-day': 'pending' };
  const CATEGORY_LABELS = { technology: 'Technology', cultural: 'Cultural', careers: 'Careers', sports: 'Sports' };

  /* ---------- Data layer (swap internals for fetch() later) ---------- */
  function loadEvents() {
    const mode = new URLSearchParams(window.location.search).get('mock'); // ?mock=error | ?mock=empty (for testing states)
    return new Promise((resolve, reject) => setTimeout(() => {
      if (mode === 'error') reject(new Error('Mock load failure'));
      else resolve(mode === 'empty' ? [] : MOCK_EVENTS);
    }, 600));
  }

  function loadRegistrations() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      // Guard against corrupted values such as "null", "[]" or "5"
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return { ...DEFAULT_REGISTRATIONS };
    } catch {
      return { ...DEFAULT_REGISTRATIONS };
    }
  }

  function saveRegistrations(regs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(regs)); } catch { /* storage unavailable */ }
  }

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isUpcoming = (e) => new Date(`${e.date}T23:59:59`) >= new Date();
  const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}" /></svg>`;

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  /* ---------- Shared markup ---------- */
  function statusMarkup(state) {
    return state === 'confirmed'
      ? '<span class="status status--ok"><span aria-hidden="true">✓</span> Registration confirmed</span>'
      : '<span class="status status--pending"><span aria-hidden="true">⏳</span> Pending confirmation</span>';
  }

  function eventCard(e, registrations) {
    const state = registrations[e.id];
    const action = state
      ? statusMarkup(state)
      : `<button class="btn btn-secondary" type="button" data-register="${esc(e.id)}" aria-label="Register for ${esc(e.title)}">Register</button>`;

    return `
      <article class="event-card">
        <div class="event-visual" data-category="${esc(e.category)}" aria-hidden="true"></div>
        <div class="event-body">
          <span class="tag">${esc(CATEGORY_LABELS[e.category] || e.category)}</span>
          <h3>${esc(e.title)}</h3>
          <ul class="meta">
            <li>${icon('calendar')}<span>${formatDate(e.date)}</span></li>
            <li>${icon('clock')}<span>${esc(e.time)}</span></li>
            <li>${icon('pin')}<span>${esc(e.venue)}</span></li>
          </ul>
          <p class="event-desc">${esc(e.description)}</p>
          <div class="event-actions">
            <a class="event-link" href="event-details.html?id=${encodeURIComponent(e.id)}">View details<span class="sr-only"> for ${esc(e.title)}</span> →</a>
            ${action}
          </div>
        </div>
      </article>`;
  }

  window.CampusFlow = {
    STORAGE_KEY, CATEGORY_LABELS,
    loadEvents, loadRegistrations, saveRegistrations,
    $, esc, isUpcoming, formatDate, icon, toast, statusMarkup, eventCard,
  };
})();
