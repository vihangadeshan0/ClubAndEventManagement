(() => {
  'use strict';
  const { $, esc, apiFetch, toast } = window.CampusFlow;
  const list = $('notificationsList');
  const summary = $('unreadCount');
  const markAll = $('markAllRead');
  const date = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const localTarget = (target) => {
    if (!target) return '';
    try {
      const url = new URL(target, location.href);
      return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : '';
    } catch { return ''; }
  };
  async function load() {
    list.setAttribute('aria-busy', 'true');
    try {
      const { notifications, unreadCount } = await apiFetch('/notifications');
      summary.textContent = `${unreadCount} unread · ${notifications.length} total`;
      markAll.hidden = unreadCount === 0;
      list.innerHTML = notifications.length ? notifications.map((n) => {
        const target = localTarget(n.targetUrl);
        const title = target ? `<a class="text-link" href="${esc(target)}">${esc(n.title)}</a>` : esc(n.title);
        return `<article class="portal-card notification-card ${n.read ? 'is-read' : 'is-unread'}"><div class="portal-actions"><h2>${title}</h2><span class="portal-badge ${n.read ? 'read' : 'unread'}">${n.read ? 'Read' : 'Unread'}</span></div><p>${esc(n.body)}</p><p class="muted">${date(n.createdAt)}</p>${target ? `<a class="text-link" href="${esc(target)}">View related club</a>` : ''}${n.read ? '' : `<button class="btn btn-secondary" type="button" data-mark-read="${Number(n.id)}">Mark as read</button>`}</article>`;
      }).join('') : '<div class="portal-empty">You have no notifications yet.</div>';
      list.setAttribute('aria-busy', 'false');
    } catch (error) { summary.textContent = error.message; list.setAttribute('aria-busy', 'false'); }
  }
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-mark-read]'); if (!button) return;
    button.disabled = true;
    try { await apiFetch(`/notifications/${encodeURIComponent(button.dataset.markRead)}/read`, { method: 'POST', body: '{}' }); toast('Notification marked as read.'); await load(); }
    catch (error) { toast(error.message); button.disabled = false; }
  });
  markAll.addEventListener('click', async () => {
    markAll.disabled = true;
    try {
      await apiFetch('/notifications/read-all', { method: 'POST', body: '{}' });
      toast('All notifications marked as read.');
      await load();
    } catch (error) { toast(error.message); }
    finally { markAll.disabled = false; }
  });
  load();
})();
