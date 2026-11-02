(() => {
  'use strict';

  const nameElement = document.getElementById('profileName');
  const idElement = document.getElementById('profileId');
  const avatar = document.getElementById('studentAvatar');
  const status = document.getElementById('profileStatus');
  const nameInput = document.getElementById('editFullName');
  const profileStatus = document.getElementById('editProfileStatus');
  const passwordStatus = document.getElementById('passwordStatus');
  let user = null;

  function initials(name) {
    return name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0].toUpperCase()).join('');
  }

  async function loadProfile() {
    try {
      ({ user } = await window.CampusFlow.apiFetch('/auth/me'));
      nameElement.textContent = user.fullName;
      idElement.textContent = `Student ID: ${user.campusId}`;
      document.getElementById('profileRole').textContent = user.role.replaceAll('_', ' ');
      avatar.textContent = initials(user.fullName) || 'ST';
      if (nameInput) nameInput.value = user.fullName;
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message || 'Could not load your account details. Refresh the page to try again.';
      status.classList.add('error');
    }
  }

  document.getElementById('profileForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    profileStatus.textContent = '';
    try {
      const result = await window.CampusFlow.apiFetch('/auth/profile', {
        method: 'PATCH', body: JSON.stringify({ fullName: nameInput.value.trim() }),
      });
      user = result.user;
      nameElement.textContent = user.fullName;
      avatar.textContent = initials(user.fullName) || 'ST';
      profileStatus.textContent = 'Profile updated.';
    } catch (error) { profileStatus.textContent = error.message; profileStatus.classList.add('error'); }
    finally { button.disabled = false; }
  });

  document.getElementById('passwordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    passwordStatus.textContent = '';
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = await window.CampusFlow.apiFetch('/auth/password', { method: 'POST', body: JSON.stringify(data) });
      passwordStatus.textContent = result.message || 'Password changed successfully.';
      form.reset();
    } catch (error) { passwordStatus.textContent = error.message; passwordStatus.classList.add('error'); }
    finally { button.disabled = false; }
  });

  loadProfile();
})();
