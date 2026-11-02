/* Shared CampusFlow navigation, identity footer and responsive sidebar. */
(() => {
  'use strict';

  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('menuToggle');
  const backdrop = document.getElementById('backdrop');
  const main = document.getElementById('main');
  if (!sidebar || !toggle || !backdrop || !main) return;

  const icons = {
    dashboard: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    events: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
    registrations: '<path d="M4 5h16v14H4zM8 9h8M8 13h5"/><path d="M6 3v4m12-4v4"/>',
    clubs: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20a6 6 0 0 1 12 0m0-4a4 4 0 0 1 6 3"/>',
    myclubs: '<path d="M4 5h16v14H4zM8 9h8M8 13h5"/>',
    notifications: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  };
  const studentGroups = [
    ['Main', [
      ['dashboard.html', 'Dashboard', 'dashboard'],
      ['events.html', 'Events', 'events'],
      ['registrations.html', 'My Registrations', 'registrations'],
      ['notifications.html', 'Notifications', 'notifications'],
      ['profile.html', 'Profile', 'profile'],
    ]],
    ['Clubs', [
      ['clubs.html', 'Club Directory', 'clubs'],
      ['my-clubs.html', 'My Clubs', 'myclubs'],
    ]],
  ];

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'nav-icon');
    svg.innerHTML = icons[name] || '';
    return svg;
  }

  function addLogout(container) {
    if (!container || container.querySelector('[data-signout]')) return;
    const signOut = document.createElement('button');
    signOut.type = 'button';
    signOut.textContent = 'Sign out';
    signOut.setAttribute('data-signout', '');
    signOut.addEventListener('click', async () => {
      signOut.disabled = true;
      try {
        await window.CampusFlow.apiFetch('/auth/logout', { method: 'POST', body: '{}' });
        location.href = 'login.html';
      } catch (error) {
        signOut.disabled = false;
        window.CampusFlow.toast(error.message);
      }
    });
    container.append(signOut);
  }

  function addStudentChrome() {
    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('.topbar-profile')) {
      const profile = document.createElement('a');
      profile.href = 'profile.html';
      profile.className = 'topbar-profile';
      profile.setAttribute('aria-label', 'Open profile');
      profile.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
      topbar.append(profile);
    }
    const bottom = document.createElement('nav');
    bottom.className = 'mobile-bottom-nav';
    bottom.setAttribute('aria-label', 'Quick navigation');
    [['dashboard.html', 'Home', 'dashboard'], ['events.html', 'Events', 'events'],
      ['clubs.html', 'Clubs', 'clubs'], ['notifications.html', 'Updates', 'notifications']].forEach(([href, label, glyph]) => {
      const link = document.createElement('a');
      link.href = href;
      link.innerHTML = `${icon(glyph).outerHTML}<span>${label}</span>`;
      if (location.pathname.endsWith(href)) link.setAttribute('aria-current', 'page');
      bottom.append(link);
    });
    document.body.append(bottom);
  }

  if (!document.body.classList.contains('admin-page')) {
    const nav = sidebar.querySelector('nav');
    if (nav) {
      nav.replaceChildren();
      studentGroups.forEach(([label, links]) => {
        const group = document.createElement('section');
        group.className = 'nav-group';
        const heading = document.createElement('p');
        heading.className = 'nav-label';
        heading.textContent = label;
        const list = document.createElement('ul');
        links.forEach(([href, text, glyph]) => {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = href;
          link.append(icon(glyph), document.createTextNode(text));
          if (location.pathname.endsWith(href)) link.setAttribute('aria-current', 'page');
          item.append(link);
          list.append(item);
        });
        group.append(heading, list);
        nav.append(group);
      });
      const identity = document.createElement('div');
      identity.className = 'sidebar-user';
      identity.innerHTML = '<strong>CampusFlow account</strong><small>Loading profile…</small>';
      sidebar.append(identity);
      addLogout(identity);
      addStudentChrome();
      window.CampusFlow.apiFetch('/auth/me').then(({ user }) => {
        identity.querySelector('strong').textContent = user.fullName;
        identity.querySelector('small').textContent = user.role.replaceAll('_', ' ');
      }).catch(() => {});
    }
  } else {
    addLogout(sidebar.querySelector('.admin-sidebar-bottom'));
    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('.topbar-profile')) {
      const avatar = document.createElement('span');
      avatar.className = 'topbar-profile';
      avatar.setAttribute('role', 'img');
      avatar.setAttribute('aria-label', 'Administrator account');
      avatar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
      topbar.append(avatar);
    }
  }

  const mobileQuery = window.matchMedia('(max-width: 899px)');
  const isOpen = () => sidebar.classList.contains('open');
  function openMenu() {
    sidebar.inert = false;
    main.inert = true;
    sidebar.classList.add('open');
    backdrop.hidden = false;
    document.body.classList.add('no-scroll');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    sidebar.querySelector('a')?.focus();
  }
  function closeMenu(returnFocus = true) {
    sidebar.classList.remove('open');
    main.inert = false;
    backdrop.hidden = true;
    document.body.classList.remove('no-scroll');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    if (returnFocus) toggle.focus();
    sidebar.inert = mobileQuery.matches;
  }
  function syncSidebarForViewport() {
    if (mobileQuery.matches) sidebar.inert = !isOpen();
    else { closeMenu(false); sidebar.inert = false; }
  }
  toggle.addEventListener('click', () => isOpen() ? closeMenu() : openMenu());
  backdrop.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) closeMenu(); });
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a') && mobileQuery.matches && isOpen()) closeMenu(false);
  });
  mobileQuery.addEventListener('change', syncSidebarForViewport);
  syncSidebarForViewport();
})();
