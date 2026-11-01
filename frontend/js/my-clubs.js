(() => {
  'use strict';
  const { $, esc, apiFetch, toast } = window.CampusFlow;
  const list = $('myClubsList');
  const status = $('myClubsStatus');
  const date = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  async function load() {
    list.setAttribute('aria-busy', 'true');
    try {
      const { memberships } = await apiFetch('/memberships');
      list.innerHTML = memberships.length
        ? memberships.map((m) => {
            const declinedCount = Number(m.declinedCount || 0);
            const declinedOnce = m.status === 'declined' && declinedCount === 1;
            const removed = m.status === 'removed';
            const blocked = ['declined', 'removed'].includes(m.status) && declinedCount >= 2;
            const stateLabel = declinedOnce ? 'Declined, you can try again' : blocked ? 'Request blocked' : removed ? 'Membership removed' : m.status;
            const announcements = m.announcements.length
              ? `<ul class="portal-announcements">${m.announcements.map((a) => `<li><strong>${esc(a.title)}</strong><p>${esc(a.body)}</p><small>${date(a.createdAt)}</small></li>`).join('')}</ul>`
              : '<p class="muted">No club announcements yet.</p>';
            const requestAction = m.status === 'pending'
              ? `<button type="button" class="btn btn-secondary" data-cancel-membership="${Number(m.id)}">Cancel request</button>`
              : (declinedOnce || removed) && m.canRequest
                ? `<button type="button" class="btn btn-primary" data-rejoin-membership="${Number(m.clubId)}">${removed ? 'Request to join' : 'Request again'}</button>` : '';
            const declineMessage = declinedOnce
              ? `<p class="muted">Reason: ${esc(m.declineReason || 'No reason provided')}</p>`
              : blocked
                ? '<p class="muted">You can\'t request this club again because your requests were declined twice.</p>'
                : removed ? '<p class="muted">An administrator removed your membership. You may request to join again.</p>' : '';
            return `<article class="portal-card"><div class="portal-actions"><div><h2>${esc(m.club.name)}</h2><span class="portal-badge ${blocked || declinedOnce ? 'rejected' : esc(m.status)}">${esc(stateLabel)}</span></div>${requestAction}</div><p>${esc(m.club.description || 'No description provided.')}</p><p class="muted">Last request ${date(m.createdAt)}</p>${declineMessage}${m.status === 'approved' ? `<h3>Club announcements</h3>${announcements}` : ''}</article>`;
          }).join('')
        : '<div class="portal-empty">You have not requested to join any clubs yet. <a href="clubs.html">Explore clubs</a>.</div>';
      status.textContent = `${memberships.filter((m) => m.status === 'approved').length} joined · ${memberships.filter((m) => m.status === 'pending').length} pending`;
      list.setAttribute('aria-busy', 'false');
    } catch (error) { status.textContent = error.message; list.setAttribute('aria-busy', 'false'); }
  }
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-cancel-membership], [data-rejoin-membership]'); if (!button) return;
    button.disabled = true;
    try {
      if (button.hasAttribute('data-cancel-membership')) {
        await apiFetch(`/memberships/${encodeURIComponent(button.dataset.cancelMembership)}`, { method: 'DELETE' });
        toast('Request cancelled.');
      } else {
        await apiFetch(`/clubs/${encodeURIComponent(button.dataset.rejoinMembership)}/memberships`, { method: 'POST', body: '{}' });
        toast('Membership request sent.');
      }
      await load();
    }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  load();
})();
