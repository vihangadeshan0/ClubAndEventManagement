/* Shared mobile sidebar menu (used by every page that has the CampusFlow shell). */
(() => {
  'use strict';

  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('menuToggle');
  const backdrop = document.getElementById('backdrop');
  const main = document.getElementById('main');
  if (!sidebar || !toggle || !backdrop || !main) return;

  const mobileQuery = window.matchMedia('(max-width: 767px)');
  const isOpen = () => sidebar.classList.contains('open');

  function openMenu() {
    sidebar.inert = false;
    main.inert = true; // keeps Tab inside the menu while it is open
    sidebar.classList.add('open');
    backdrop.hidden = false;
    document.body.classList.add('no-scroll');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    sidebar.querySelector('a').focus();
  }

  function closeMenu(returnFocus = true) {
    sidebar.classList.remove('open');
    main.inert = false;
    backdrop.hidden = true;
    document.body.classList.remove('no-scroll');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    if (returnFocus) toggle.focus(); // move focus out before the sidebar becomes inert
    sidebar.inert = mobileQuery.matches; // hidden off-canvas menu must not be tabbable
  }

  function syncSidebarForViewport() {
    if (mobileQuery.matches) {
      sidebar.inert = !isOpen();
    } else {
      closeMenu(false);
      sidebar.inert = false;
    }
  }

  toggle.addEventListener('click', () => (isOpen() ? closeMenu() : openMenu()));
  backdrop.addEventListener('click', () => closeMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) closeMenu();
  });
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('a') && mobileQuery.matches && isOpen()) closeMenu(false);
  });
  mobileQuery.addEventListener('change', syncSidebarForViewport);
  syncSidebarForViewport();
})();
