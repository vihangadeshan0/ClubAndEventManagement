(() => {
  'use strict';
  const { $, esc, apiFetch, toast } = window.CampusFlow;
  const status = $('adminStatus');
  const dialog = $('editor');
  const clubManager = $('clubManager');
  let role = '';
  let students = [], events = [], clubs = [], announcements = [];
  let managedClub = null, managedMembers = [];
  const titles = { overview: ['Today’s Overview', 'A live view of campus activity and operations.'], students: ['Students', 'Review student accounts and approvals.'], events: ['Events', 'Create, publish, and monitor campus events.'], clubs: ['Clubs', 'Manage campus communities and membership.'], memberships: ['Membership Requests', 'Review students requesting to join clubs.'], announcements: ['Announcements', 'Publish updates for the campus community.'], notifications: ['Notifications', 'Updates sent to your administrator account.'] };
  const say = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  const dateLabel = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const emptyRow = (cols, message) => `<tr><td colspan="${cols}" class="empty-cell">${esc(message)}</td></tr>`;
  const action = (label, key, id, extra = '') => `<button class="table-action ${extra}" type="button" data-action="${key}" data-id="${Number(id)}">${label}</button>`;
  const localTarget = (target) => { if (!target) return ''; try { const url = new URL(target, location.href); return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : ''; } catch { return ''; } };

  function navigate(section) {
    if (section === 'memberships' && !['events_admin', 'clubs_admin'].includes(role)) return;
    const hasAdminAccess = ['events_admin', 'clubs_admin'].includes(role);
    const allowed = { overview: true, students: true, events: hasAdminAccess, clubs: hasAdminAccess, memberships: hasAdminAccess, announcements: hasAdminAccess, notifications: true };
    if (!allowed[section]) section = 'overview';
    document.querySelectorAll('.admin-section').forEach((node) => { node.hidden = node.id !== `section-${section}`; });
    document.querySelectorAll('#adminNav [data-section]').forEach((link) => {
      if (link.dataset.section === section) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('sectionTitle').textContent = titles[section][0]; $('sectionSubtitle').textContent = titles[section][1];
    history.replaceState(null, '', `#${section}`);
    loadSection(section);
  }

  async function loadOverview() {
    const { overview } = await apiFetch('/admin/overview');
    const cards = [['STUDENTS', overview.students], ['PENDING APPROVAL', overview.pendingStudents], ['EVENTS', overview.events], ['UPCOMING', overview.upcomingEvents], ['CLUBS', overview.clubs], ['REGISTRATIONS', overview.registrations]];
    $('metrics').innerHTML = cards.map(([label, value], index) => `<article class="metric-card metric-${index}"><span>${label}</span><strong>${value}</strong><small>Live database total</small></article>`).join('');
    if (role === 'events_admin') {
      const response = await apiFetch('/admin/events'); events = response.events;
      const upcoming = events.filter((event) => event.startsAt && new Date(event.startsAt) >= new Date()).slice(0, 5);
      $('overviewEvents').innerHTML = overviewEventTable(upcoming);
    } else {
      const response = await apiFetch('/admin/clubs'); clubs = response.clubs;
      $('overviewEvents').innerHTML = `<div class="overview-clubs">${clubs.slice(0, 5).map((c) => `<div><span class="club-mark">${esc(c.name.slice(0, 1).toUpperCase())}</span><b>${esc(c.name)}</b><small>${c.members} members · ${c.pending} pending</small></div>`).join('') || '<p class="empty-cell">No clubs have been created yet.</p>'}</div>`;
    }
  }
  function overviewEventTable(rows) {
    const body = rows.map((event) => `<tr><td><b>${esc(event.title)}</b></td><td>${esc(event.venue)}</td><td>${dateLabel(event.date)}</td><td>${esc(event.time)}</td><td>${Number(event.availableSeats) || 0} / ${Number(event.capacity) || 0}</td><td><span class="pill ${event.published ? 'good' : 'pending'}">${event.published ? 'Published' : 'Draft'}</span></td></tr>`).join('');
    return `<div class="table-scroll"><table class="campus-pulse-table"><thead><tr><th>Title</th><th>Venue</th><th>Date</th><th>Time</th><th>Seats left</th><th>Status</th></tr></thead><tbody>${body || emptyRow(6, 'No upcoming events to show.')}</tbody></table></div>`;
  }
  function studentRows() {
    const q = $('studentSearch').value.trim().toLowerCase(), filter = $('studentFilter').value;
    const rows = students.filter((s) => (!q || s.fullName.toLowerCase().startsWith(q) || s.campusId.toLowerCase().startsWith(q)) && (filter === 'all' || filter === s.verificationStatus));
    $('studentsRows').innerHTML = rows.map((s) => `<tr><td><b>${esc(s.fullName)}</b></td><td>${esc(s.campusId)}</td><td><span class="pill ${s.verificationStatus === 'approved' ? 'good' : s.verificationStatus === 'declined' ? 'danger' : 'pending'}">${esc(s.verificationStatus)}</span>${s.declineReason ? `<small>${esc(s.declineReason)}</small>` : ''}</td><td><span class="pill ${s.isActive ? 'good' : 'pending'}">${s.isActive ? 'Active' : 'Inactive'}</span></td><td>${dateLabel(s.createdAt)}</td><td><div class="row-actions">${action('Details', 'student-details', s.id)}${action('Edit', 'student-edit', s.id)}${action('Reset password', 'student-password', s.id)}${s.verificationStatus === 'pending' ? `${action('Approve', 'approve-student', s.id, 'accent-action')}${action('Decline', 'decline-student', s.id, 'danger-action')}` : s.verificationStatus === 'approved' ? action(s.isActive ? 'Deactivate' : 'Activate', 'student-toggle', s.id, s.isActive ? 'danger-action' : 'accent-action') : ''}</div></td></tr>`).join('') || emptyRow(6, 'No matching students.');
  }
  async function loadStudents() { students = (await apiFetch('/admin/students')).students; studentRows(); $('pendingBadge').textContent = students.filter((s) => s.verificationStatus === 'pending').length || ''; }
  function eventRows(rows, withActions = true) {
    return rows.map((e) => `<tr><td><b>${esc(e.title)}</b><small>${esc(e.venue)}</small></td><td>${dateLabel(e.date)}<small>${esc(e.time)}</small></td><td>${e.capacity}</td><td>${e.registrations || 0}</td><td><span class="pill ${e.published ? 'good' : 'pending'}">${e.published ? 'Published' : 'Draft'}</span></td><td>${withActions ? `<div class="row-actions">${action('Edit', 'edit-event', e.id)}${action(e.published ? 'Unpublish' : 'Publish', 'toggle-event', e.id)}${action('Attendees', 'attendees', e.id)}${action('Delete', 'delete-event', e.id, 'danger-action')}</div>` : ''}</td></tr>`).join('') || emptyRow(withActions ? 6 : 5, 'No events to show.');
  }
  async function loadEvents() { events = (await apiFetch('/admin/events')).events; renderEvents(); }
  function renderEvents() {
    const q = $('eventSearch').value.trim().toLowerCase(), filter = $('eventFilter').value;
    const rows = events.filter((e) => (!q || e.title.toLowerCase().startsWith(q)) && (filter === 'all' || (filter === 'published') === e.published));
    $('eventsRows').innerHTML = eventRows(rows);
  }
  async function loadClubs() {
    clubs = (await apiFetch('/admin/clubs')).clubs;
    $('clubsRows').innerHTML = clubs.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.description || '—')}</td><td>${c.members}</td><td>${c.pending}</td><td><div class="row-actions">${action('Manage', 'club-manage', c.id, 'accent-action')}${action('Members', 'club-members', c.id)}${action('Edit', 'edit-club', c.id)}${action('Delete', 'delete-club', c.id, 'danger-action')}</div></td></tr>`).join('') || emptyRow(5, 'Create your first club.');
  }
  function setClubManagerStatus(message, error = false) {
    const node = $('clubManagerStatus');
    node.textContent = message;
    node.classList.toggle('error', error);
  }
  async function loadClubManagerMembers() {
    if (!managedClub) return;
    const container = $('clubManagerMembers');
    container.setAttribute('aria-busy', 'true');
    setClubManagerStatus('Loading members…');
    try {
      const data = await apiFetch(`/clubs/${managedClub.id}/members`);
      managedMembers = data.members;
      $('clubManagerMemberCount').textContent = String(managedMembers.length);
      container.innerHTML = managedMembers.length
        ? `<div class="club-member-list">${managedMembers.map((member) => `<article class="club-member-row"><div><strong>${esc(member.fullName)}</strong><small>${esc(member.campusId)}</small></div><button class="table-action danger-action" type="button" data-remove-membership="${Number(member.membershipId)}">Remove member</button></article>`).join('')}</div>`
        : '<p class="empty-cell">No approved members yet.</p>';
      $('clubNoticeSubmit').disabled = managedMembers.length === 0;
      setClubManagerStatus(managedMembers.length ? 'Member list is up to date.' : 'Add an approved member before sending a club update.');
    } catch (error) {
      container.innerHTML = `<p class="empty-cell">${esc(error.message)}</p>`;
      $('clubNoticeSubmit').disabled = true;
      setClubManagerStatus(error.message, true);
    } finally { container.setAttribute('aria-busy', 'false'); }
  }
  async function openClubManager(club) {
    managedClub = club;
    managedMembers = [];
    $('clubManagerTitle').textContent = club.name;
    $('clubManagerDescription').textContent = club.description || 'No description provided.';
    $('clubNoticeForm').reset();
    $('clubNoticeSubmit').disabled = true;
    $('clubManagerMembers').innerHTML = '<p class="empty-cell">Loading members…</p>';
    $('clubManagerMemberCount').textContent = '…';
    clubManager.showModal();
    await loadClubManagerMembers();
  }
  async function loadMemberships() {
    const rows = (await apiFetch('/admin/memberships')).memberships;
    $('membershipRows').innerHTML = rows.map((m) => `<tr><td><b>${esc(m.fullName)}</b></td><td>${esc(m.campusId)}</td><td>${esc(m.club)}</td><td>Pending</td><td><div class="row-actions">${action('Approve', 'membership-approve', m.id, 'accent-action')}${action('Reject', 'membership-reject', m.id, 'danger-action')}</div></td></tr>`).join('') || emptyRow(5, 'No pending membership requests.');
  }
  async function loadAnnouncements() {
    announcements = (await apiFetch('/announcements')).announcements;
    $('announcementRows').innerHTML = announcements.map((a) => `<article class="announcement-card"><div><p class="eyebrow">${a.clubId ? 'CLUB UPDATE' : 'CAMPUS-WIDE'} · ${dateLabel(a.createdAt)}</p><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p></div><div class="row-actions">${action('Edit', 'edit-announcement', a.id)}${action('Delete', 'delete-announcement', a.id, 'danger-action')}</div></article>`).join('') || '<p class="empty-cell">No announcements have been published.</p>';
  }
  async function loadNotifications() {
    const { notifications, unreadCount } = await apiFetch('/notifications');
    updateNotificationBadge(unreadCount);
    $('markAdminAllRead').hidden = unreadCount === 0;
    $('notificationRows').innerHTML = notifications.map((n) => { const target = localTarget(n.targetUrl); return `<article class="announcement-card"><div><p class="eyebrow">${n.read ? 'READ' : 'UNREAD'} · ${dateLabel(n.createdAt)}</p><h3>${target ? `<a href="${esc(target)}">${esc(n.title)}</a>` : esc(n.title)}</h3><p>${esc(n.body)}</p></div>${n.read ? '' : action('Mark read', 'read-notification', n.id)}</article>`; }).join('') || '<p class="empty-cell">No notifications for this administrator account.</p>';
  }
  function updateNotificationBadge(value = 0) {
    const badge = $('adminUnreadBadge');
    if (!badge) return;
    const count = Math.max(0, Number(value) || 0);
    badge.textContent = count ? String(count) : '';
    badge.hidden = count === 0;
    badge.setAttribute('aria-label', `${count} unread notifications`);
  }
  async function loadSection(section) {
    say('');
    try {
      if (section === 'overview') await loadOverview();
      if (section === 'students') await loadStudents();
      if (section === 'events') await loadEvents();
      if (section === 'clubs') await loadClubs();
      if (section === 'memberships') await loadMemberships();
      if (section === 'announcements') await loadAnnouncements();
      if (section === 'notifications') await loadNotifications();
    } catch (error) { say(error.message || 'Could not load this section.', true); }
  }
  function openEditor(title, fields, initial, save) {
    $('editorTitle').textContent = title; $('editorError').textContent = '';
    $('editorFields').innerHTML = fields.map((f) => `<label>${esc(f.label)}${f.type === 'textarea' ? `<textarea name="${f.name}" maxlength="${f.max || 500}" ${f.required ? 'required' : ''}>${esc(initial?.[f.name] ?? '')}</textarea>` : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(initial?.[f.name] ?? '')}" maxlength="${f.max || 200}" ${f.required ? 'required' : ''} ${f.min ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`}</label>`).join('');
    dialog.showModal();
    $('editorForm').onsubmit = async (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
      try { await save(data); dialog.close(); toast('Saved successfully.'); loadSection(currentSection()); }
      catch (error) { $('editorError').textContent = error.message; }
    };
  }
  function currentSection() { return location.hash.slice(1) || 'overview'; }
  function editEvent(event = null) {
    const start = event ? new Date(event.startsAt).toISOString().slice(0, 16) : '';
    openEditor(event ? 'Edit event' : 'Create event', [
      { label: 'Event title', name: 'title', required: true, max: 160 }, { label: 'Description', name: 'description', type: 'textarea', max: 5000 },
      { label: 'Category', name: 'category', required: true, max: 40 }, { label: 'Start date and time', name: 'startsAt', type: 'datetime-local', required: true },
      { label: 'Venue', name: 'venue', required: true, max: 160 }, { label: 'Capacity', name: 'capacity', type: 'number', required: true, min: 1 }
    ], event ? { ...event, startsAt: start, capacity: event.capacity } : { category: 'other', capacity: 50 }, async (data) => {
      data.capacity = Number(data.capacity); data.startsAt = new Date(data.startsAt).toISOString();
      if (event) await apiFetch(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(data) });
      else await apiFetch('/events', { method: 'POST', body: JSON.stringify({ ...data, published: true }) });
    });
  }
  function editClub(club = null) {
    openEditor(club ? 'Edit club' : 'Create club', [{ label: 'Club name', name: 'name', required: true, max: 120 }, { label: 'Description', name: 'description', type: 'textarea' }], club || {}, async (data) => {
      await apiFetch(club ? `/clubs/${club.id}` : '/clubs', { method: club ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    });
  }
  function editAnnouncement(item = null) {
    openEditor(item ? 'Edit announcement' : 'New announcement', [{ label: 'Title', name: 'title', required: true, max: 160 }, { label: 'Message', name: 'body', type: 'textarea', required: true, max: 500 }], item || {}, async (data) => {
      await apiFetch(item ? `/announcements/${item.id}` : '/announcements', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    });
  }

  $('adminNav').addEventListener('click', (event) => { const link = event.target.closest('[data-section]'); if (!link) return; event.preventDefault(); navigate(link.dataset.section); });
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
  $('studentSearch').addEventListener('input', studentRows); $('studentFilter').addEventListener('change', studentRows);
  $('eventSearch').addEventListener('input', renderEvents); $('eventFilter').addEventListener('change', renderEvents);
  $('newEvent').addEventListener('click', () => editEvent()); $('newClub').addEventListener('click', () => editClub()); $('newAnnouncement').addEventListener('click', () => editAnnouncement());
  $('studentsRows').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const student = students.find((s) => String(s.id) === btn.dataset.id); if (!student) return;
    try {
      if (btn.dataset.action === 'student-details') { const { student: detail } = await apiFetch(`/admin/students/${student.id}`); alert(`${detail.fullName}\nCampus ID: ${detail.campusId}\nApproval: ${detail.verified ? 'Approved' : 'Pending'}\nAccount: ${detail.isActive ? 'Active' : 'Inactive'}\nJoined: ${dateLabel(detail.createdAt)}`); return; }
      if (btn.dataset.action === 'student-edit') return openEditor('Edit student', [{ label: 'Full name', name: 'fullName', required: true, max: 120 }, { label: 'Campus ID', name: 'campusId', required: true, max: 64 }], student, async (data) => { await apiFetch(`/admin/students/${student.id}`, { method: 'PATCH', body: JSON.stringify(data) }); });
      if (btn.dataset.action === 'student-password') { const password = prompt(`Enter a new password for ${student.fullName} (at least 8 characters):`); if (password === null) return; await apiFetch(`/admin/students/${student.id}/password`, { method: 'POST', body: JSON.stringify({ newPassword: password }) }); toast('Password reset. Share the new password securely.'); }
      if (btn.dataset.action === 'student-toggle') await apiFetch(`/admin/students/${student.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !student.isActive }) });
      if (btn.dataset.action === 'approve-student') await apiFetch(`/admin/users/${student.id}/verify`, { method: 'POST', body: '{}' });
      if (btn.dataset.action === 'decline-student') { const reason = prompt(`Reason for declining ${student.fullName}'s registration (required):`); if (reason === null) return; await apiFetch(`/admin/users/${student.id}/verification`, { method: 'PATCH', body: JSON.stringify({ status: 'declined', reason }) }); }
      await Promise.all([loadStudents(), loadOverview()]);
    } catch (error) { say(error.message, true); }
  });
  $('eventsRows').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const item = events.find((e) => String(e.id) === btn.dataset.id); if (!item) return;
    try {
      if (btn.dataset.action === 'edit-event') return editEvent(item);
      if (btn.dataset.action === 'toggle-event') await apiFetch(`/events/${item.id}`, { method: 'PATCH', body: JSON.stringify({ published: !item.published }) });
      if (btn.dataset.action === 'delete-event' && confirm(`Delete “${item.title}”?`)) await apiFetch(`/events/${item.id}`, { method: 'DELETE' });
      if (btn.dataset.action === 'attendees') { const data = await apiFetch(`/events/${item.id}/registrations`); alert(data.registrations.length ? data.registrations.map((r) => `${r.fullName} (${r.campusId})`).join('\n') : 'No registrations yet.'); return; }
      await Promise.all([loadEvents(), loadOverview()]);
    } catch (error) { say(error.message, true); }
  });
  $('clubsRows').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return; const item = clubs.find((c) => String(c.id) === btn.dataset.id); if (!item) return;
    try { if (btn.dataset.action === 'club-manage') return openClubManager(item); if (btn.dataset.action === 'edit-club') return editClub(item); if (btn.dataset.action === 'club-members') { const { members } = await apiFetch(`/clubs/${item.id}/members`); alert(members.length ? members.map((m) => `${m.fullName} (${m.campusId})`).join('\n') : 'No approved members yet.'); return; } if (confirm(`Delete “${item.name}”?`)) await apiFetch(`/clubs/${item.id}`, { method: 'DELETE' }); await Promise.all([loadClubs(), loadOverview()]); }
    catch (error) { say(error.message, true); }
  });
  $('clubManagerMembers').addEventListener('click', async (ev) => {
    const button = ev.target.closest('[data-remove-membership]');
    if (!button || !managedClub) return;
    const member = managedMembers.find((item) => String(item.membershipId) === button.dataset.removeMembership);
    if (!member || !confirm(`Remove ${member.fullName} from ${managedClub.name}? Their membership history will be kept.`)) return;
    button.disabled = true;
    try {
      await apiFetch(`/admin/clubs/${managedClub.id}/memberships/${member.membershipId}`, { method: 'DELETE' });
      toast(`${member.fullName} removed from ${managedClub.name}.`);
      await Promise.all([loadClubManagerMembers(), loadClubs(), loadOverview()]);
    } catch (error) { setClubManagerStatus(error.message, true); button.disabled = false; }
  });
  $('clubNoticeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!managedClub || managedMembers.length === 0) return;
    const form = ev.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    $('clubNoticeSubmit').disabled = true;
    setClubManagerStatus('Sending update…');
    try {
      await apiFetch('/announcements', { method: 'POST', body: JSON.stringify({ ...data, clubId: managedClub.id }) });
      toast(`Update sent to ${managedMembers.length} approved member${managedMembers.length === 1 ? '' : 's'}.`);
      form.reset();
      setClubManagerStatus('Club update sent.');
    } catch (error) { setClubManagerStatus(error.message, true); }
    finally { $('clubNoticeSubmit').disabled = managedMembers.length === 0; }
  });
  clubManager.addEventListener('click', (ev) => {
    if (ev.target === clubManager || ev.target.closest('[data-close-club-manager]')) clubManager.close();
  });
  $('membershipRows').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const approving = btn.dataset.action === 'membership-approve';
    const reason = approving ? '' : prompt('Reason for declining this membership request (optional):');
    if (!approving && reason === null) return;
    try { await apiFetch(`/admin/memberships/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify(approving ? { status: 'approved' } : { status: 'declined', reason }) }); await Promise.all([loadMemberships(), loadClubs(), loadOverview()]); }
    catch (error) { say(error.message, true); }
  });
  $('announcementRows').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return; const item = announcements.find((a) => String(a.id) === btn.dataset.id); if (!item) return;
    try { if (btn.dataset.action === 'edit-announcement') return editAnnouncement(item); if (confirm(`Delete “${item.title}”?`)) await apiFetch(`/announcements/${item.id}`, { method: 'DELETE' }); await loadAnnouncements(); }
    catch (error) { say(error.message, true); }
  });
  $('notificationRows').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action="read-notification"]'); if (!btn) return;
    try { await apiFetch(`/notifications/${btn.dataset.id}/read`, { method: 'POST', body: '{}' }); await loadNotifications(); }
    catch (error) { say(error.message, true); }
  });
  $('markAdminAllRead').addEventListener('click', async () => {
    const button = $('markAdminAllRead'); button.disabled = true;
    try { await apiFetch('/notifications/read-all', { method: 'POST', body: '{}' }); await loadNotifications(); }
    catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
  $('todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' });
  apiFetch('/auth/me').then(({ user }) => {
    if (!['events_admin', 'clubs_admin'].includes(user.role)) { location.replace('dashboard.html'); return; }
    role = user.role; $('adminIdentity').textContent = `${user.fullName} · Administrator`;
    apiFetch('/notifications').then(({ unreadCount }) => updateNotificationBadge(unreadCount)).catch(() => updateNotificationBadge(0));
    document.querySelectorAll('[data-role="events"]').forEach((el) => { el.hidden = !['events_admin', 'clubs_admin'].includes(role); });
    document.querySelectorAll('[data-role="clubs"], [data-role="announcements"]').forEach((el) => { el.hidden = !['events_admin', 'clubs_admin'].includes(role); });
    navigate(location.hash.slice(1) || 'overview');
  }).catch((error) => { say(error.message || 'Administrator sign-in required.', true); });
})();
