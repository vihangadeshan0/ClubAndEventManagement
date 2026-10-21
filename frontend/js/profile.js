(() => {
  'use strict';

  const STORAGE_KEY = 'campusflow.mock.profile';
  const DEFAULT_PROFILE = {
    fullName: 'Ayesha Perera',
    studentId: 'CF-2026-0142',
    email: 'ayesha.perera@example.edu',
    faculty: 'Faculty of Computing',
    department: 'Information Technology',
    phone: '+94 77 123 4567',
  };

  const form = document.getElementById('profileForm');
  const editButton = document.getElementById('editProfileButton');
  const cancelButton = document.getElementById('cancelEditButton');
  const status = document.getElementById('profileStatus');
  let profile = loadProfile();

  function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        return { ...DEFAULT_PROFILE, ...saved, studentId: DEFAULT_PROFILE.studentId };
      }
    } catch {
      // Fall back to the clearly marked sample profile when storage is unavailable or invalid.
    }
    return { ...DEFAULT_PROFILE };
  }

  function initials(name) {
    return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }

  function render() {
    document.getElementById('profileName').textContent = profile.fullName;
    document.getElementById('studentAvatar').textContent = initials(profile.fullName) || 'ST';
    document.getElementById('profileId').textContent = `Student ID: ${profile.studentId}`;
    document.getElementById('profileEmail').textContent = profile.email;
    document.getElementById('profileFaculty').textContent = profile.faculty;
    document.getElementById('profileDepartment').textContent = profile.department;
    document.getElementById('profilePhone').textContent = profile.phone;
  }

  function fillForm() {
    form.elements.fullName.value = profile.fullName;
    form.elements.studentId.value = profile.studentId;
    form.elements.email.value = profile.email;
    form.elements.phone.value = profile.phone;
    form.elements.faculty.value = profile.faculty;
    form.elements.department.value = profile.department;
  }

  function closeForm() {
    form.hidden = true;
    editButton.setAttribute('aria-expanded', 'false');
    editButton.focus();
  }

  editButton.addEventListener('click', () => {
    fillForm();
    status.textContent = '';
    form.hidden = false;
    editButton.setAttribute('aria-expanded', 'true');
    form.elements.fullName.focus();
  });

  cancelButton.addEventListener('click', closeForm);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.textContent = '';
    if (!form.reportValidity()) return;

    profile = {
      fullName: form.elements.fullName.value.trim(),
      studentId: DEFAULT_PROFILE.studentId,
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      faculty: form.elements.faculty.value.trim(),
      department: form.elements.department.value.trim(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      status.textContent = 'Demo profile updated in this browser only. It was not sent to a server.';
    } catch {
      status.textContent = 'Demo profile updated for this page only; browser storage is unavailable.';
    }
    render();
    closeForm();
  });

  render();
})();
