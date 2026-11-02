(() => {
  'use strict';
  const { $, esc, apiFetch, toast } = window.CampusFlow;
  const grid = $('clubsGrid');
  const detail = $('clubDetail');
  const statusLabel = $('clubStatus');
  const clubId = new URLSearchParams(location.search).get('id');

  const membershipAction = (club) => {
    const count = Number(club.declinedCount || 0);
    const status = club.membershipStatus;
    const canRequest = typeof club.canRequest === 'boolean'
      ? club.canRequest
      : !['approved', 'pending'].includes(status) && count < 2;
    if (status === 'approved') return '<span class="portal-badge approved">Member</span>';
    if (status === 'pending') return '<span class="portal-badge pending">Pending</span>';
    if (status === 'removed' && count >= 2) return '<div class="membership-feedback"><span class="portal-badge rejected">Request blocked</span><p class="muted">You can\'t request this club again because your requests were declined twice.</p></div>';
    if (status === 'removed') return `<div class="membership-feedback"><span class="portal-badge rejected">Membership removed</span><button class="btn btn-primary" type="button" data-join="${Number(club.id)}">Request to join</button></div>`;
    if (status === 'declined' && count >= 2) {
      return '<div class="membership-feedback"><span class="portal-badge rejected">Request blocked</span><p class="muted">You can\'t request this club again because your requests were declined twice.</p></div>';
    }
    if (status === 'declined') {
      return `<div class="membership-feedback"><span class="portal-badge rejected">Declined, you can try again</span><p class="muted">Reason: ${esc(club.declineReason || 'No reason provided')}</p>${canRequest ? `<button class="btn btn-primary" type="button" data-join="${Number(club.id)}">Request again</button>` : ''}</div>`;
    }
    return canRequest ? `<button class="btn btn-primary" type="button" data-join="${Number(club.id)}">Request to join</button>`
      : '<span class="portal-badge rejected">Request blocked</span>';
  };
  function renderCard(club) {
    return `<article class="portal-card"><span class="club-mark" aria-hidden="true">${esc(club.name.slice(0, 1).toUpperCase())}</span><h2>${esc(club.name)}</h2><p>${esc(club.description || 'No description provided.')}</p><p class="muted">${Number(club.memberCount || 0)} approved members</p><div class="portal-actions"><a class="text-link" href="club-details.html?id=${Number(club.id)}">View details</a>${membershipAction(club)}</div></article>`;
  }
  async function refreshDirectory() {
    statusLabel.textContent = 'Loading clubs…';
    grid.setAttribute('aria-busy', 'true');
    try {
      const { clubs } = await apiFetch('/clubs');
      grid.innerHTML = clubs.map(renderCard).join('') || '<div class="portal-empty">No clubs have been created yet.</div>';
      statusLabel.textContent = `${clubs.length} ${clubs.length === 1 ? 'club' : 'clubs'} available`;
      grid.setAttribute('aria-busy', 'false');
    } catch (error) { statusLabel.textContent = error.message; grid.setAttribute('aria-busy', 'false'); }
  }
  async function refreshDetail() {
    detail.setAttribute('aria-busy', 'true');
    try {
      if (!clubId || !/^\d+$/.test(clubId)) throw new Error('Choose a valid club from the directory.');
      const { club } = await apiFetch(`/clubs/${encodeURIComponent(clubId)}`);
      detail.innerHTML = `<span class="club-mark" aria-hidden="true">${esc(club.name.slice(0, 1).toUpperCase())}</span><h1>${esc(club.name)}</h1><p>${esc(club.description || 'No description provided.')}</p><p class="muted">${Number(club.memberCount || 0)} approved members</p><div class="portal-actions">${membershipAction(club)}</div>`;
      detail.dataset.clubId = club.id;
      detail.setAttribute('aria-busy', 'false');
    } catch (error) { detail.textContent = error.message; detail.setAttribute('aria-busy', 'false'); }
  }
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-join]');
    if (!button) return;
    button.disabled = true;
    try {
      await apiFetch(`/clubs/${encodeURIComponent(button.dataset.join)}/memberships`, { method: 'POST', body: '{}' });
      toast('Membership request sent.');
      if (grid) await refreshDirectory();
      if (detail) await refreshDetail();
    } catch (error) { toast(error.message); button.disabled = false; }
  });
  if (grid) refreshDirectory();
  if (detail) refreshDetail();
})();
