const form = document.querySelector('#account-settings-form');
const content = document.querySelector('#account-settings-content');
const loading = document.querySelector('#account-settings-loading');
const login = document.querySelector('#account-settings-login');
const notice = document.querySelector('#account-settings-notice');
const displayNameInput = document.querySelector('#display-name');
const nicknameInput = document.querySelector('#nickname');
const emailInput = document.querySelector('#account-email');
const idInput = document.querySelector('#account-id');
const googleAccountIdInput = document.querySelector('#google-account-id');
const headingName = document.querySelector('#account-heading-name');
const headingEmail = document.querySelector('#account-heading-email');
const avatarFile = document.querySelector('#avatar-file');
const avatarFileName = document.querySelector('#avatar-file-name');
const avatarPreview = document.querySelector('#account-avatar-preview');
const avatarFallback = document.querySelector('#account-avatar-fallback');
const editorImage = document.querySelector('#account-avatar-editor-image');
const editorFallback = document.querySelector('#account-avatar-editor-fallback');
const saveButton = document.querySelector('#account-save');
const resetButton = document.querySelector('#account-reset');
const logoutButton = document.querySelector('#account-logout');
const nameSourceButtons = [...document.querySelectorAll('[data-profile-source="name"]')];
const pictureSourceButtons = [...document.querySelectorAll('[data-profile-source="picture"]')];

const state = { profile: null, file: null, objectUrl: null, nameSource: 'apiuytin', pictureSource: 'apiuytin' };
const maxAvatarBytes = 5 * 1024 * 1024;
const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const accountMessages = {
  invalid_email: 'Email chưa đúng định dạng. Hãy nhập một email hợp lệ.',
  email_exists: 'Email này đã được dùng cho tài khoản khác.',
  email_already_set: 'Tài khoản này đã có email và không thể thay đổi.',
  username_exists: 'Tên đăng nhập này đã được dùng cho tài khoản khác.',
  username_already_set: 'Tên đăng nhập này đã hợp lệ và không thể thay đổi.',
  invalid_username: 'Tên đăng nhập chỉ gồm 3–32 chữ cái hoặc chữ số, viết thường.',
  invalid_profile_fields: 'Thông tin tài khoản chưa hợp lệ.',
  invalid_profile_source: 'Nguồn thông tin không hợp lệ.',
  profile_source_unavailable: 'Nguồn này chưa có dữ liệu để sử dụng.'
};

function initials(profile) {
  const value = profile?.displayName || profile?.name || profile?.email || 'A';
  return value.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'A';
}

function setNotice(message, error = false) {
  notice.hidden = !message;
  notice.classList.toggle('is-error', error);
  notice.textContent = message || '';
}

function setAvatar(image, fallback, profile, url = profile?.picture) {
  const value = typeof url === 'string' && url.startsWith('https://') ? url : '';
  image.hidden = !value;
  fallback.hidden = Boolean(value);
  fallback.textContent = initials(profile);
  if (value) image.src = value;
  else image.removeAttribute('src');
}

function sourceData(profile = state.profile) {
  return profile?.profileSources || {
    name: { selected: 'apiuytin', options: { apiuytin: profile?.displayName || profile?.name || profile?.email || '', google: '', github: '' } },
    picture: { selected: 'apiuytin', options: { apiuytin: '', google: profile?.picture || '', github: '' } }
  };
}

function sourceValue(kind, source, profile = state.profile) {
  const data = sourceData(profile);
  return data?.[kind]?.options?.[source] || '';
}

function renderSourceControls(profile = state.profile) {
  const groups = [
    ['name', nameSourceButtons, state.nameSource],
    ['picture', pictureSourceButtons, state.pictureSource]
  ];
  for (const [kind, buttons, selected] of groups) {
    for (const button of buttons) {
      const source = button.dataset.source;
      const value = sourceValue(kind, source, profile);
      const pendingUpload = kind === 'picture' && source === 'apiuytin' && Boolean(state.file);
      const available = Boolean(value) || pendingUpload;
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(source === selected));
      button.classList.toggle('is-selected', source === selected);
      const valueNode = button.querySelector('[data-source-value]');
      if (valueNode) valueNode.textContent = kind === 'picture' ? (available ? `Ảnh ${source === 'apiuytin' ? 'APIUYTIN' : source[0].toUpperCase() + source.slice(1)}` : 'Chưa có ảnh') : (value || 'Chưa có tên');
      const image = button.querySelector('[data-source-avatar]');
      if (image) {
        image.hidden = !value;
        if (value) image.src = value;
      }
    }
  }
}

function selectProfileSource(kind, source) {
  const value = sourceValue(kind, source);
  if (!value) return;
  if (kind === 'name') {
    state.nameSource = source;
    displayNameInput.value = value;
  } else {
    if (state.file && source !== 'apiuytin') clearSelectedFile();
    state.pictureSource = source;
    setAvatar(editorImage, editorFallback, state.profile, value);
  }
  renderSourceControls();
  setNotice('Đã chọn nguồn thông tin. Bấm “Lưu thay đổi” để áp dụng.');
}

function renderProfile(profile) {
  state.profile = profile;
  const data = sourceData(profile);
  state.nameSource = data.name.selected;
  state.pictureSource = data.picture.selected;
  const name = profile.displayName || profile.name || profile.email || 'Tài khoản APIUYTIN';
  displayNameInput.value = profile.displayName || profile.name || profile.email || '';
  nicknameInput.value = profile.nickname || '';
  emailInput.value = profile.email || '';
  idInput.value = profile.id || '';
  document.querySelector('#account-username').value = profile.username || '';
  googleAccountIdInput.value = profile.googleAccountId || '';
  headingName.textContent = name;
  headingEmail.textContent = profile.email || 'Email chưa được cung cấp';
  setAvatar(avatarPreview, avatarFallback, profile);
  setAvatar(editorImage, editorFallback, profile);
  renderSourceControls(profile);
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(accountMessages[data.error] || data.error || 'Không thể hoàn tất thao tác.');
  return data;
}

async function loadProfile() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) {
      loading.hidden = true;
      login.hidden = false;
      return;
    }
    const data = await readResponse(response);
    renderProfile(data.user);
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    loading.textContent = error.message || 'Không thể tải thông tin tài khoản.';
    loading.classList.add('is-error');
  }
}

function clearSelectedFile() {
  state.file = null;
  avatarFile.value = '';
  avatarFileName.textContent = 'Chưa chọn ảnh mới.';
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  setAvatar(editorImage, editorFallback, state.profile);
}

for (const button of [...nameSourceButtons, ...pictureSourceButtons]) {
  button.addEventListener('click', () => selectProfileSource(button.dataset.profileSource, button.dataset.source));
}

displayNameInput?.addEventListener('input', () => {
  if (!state.profile) return;
  state.nameSource = 'apiuytin';
  renderSourceControls();
});

avatarFile?.addEventListener('change', () => {
  const file = avatarFile.files?.[0];
  if (!file) return clearSelectedFile();
  if (!allowedAvatarTypes.has(file.type)) {
    clearSelectedFile();
    setNotice('Ảnh phải là JPG, PNG, WEBP hoặc GIF.', true);
    return;
  }
  if (file.size <= 0 || file.size > maxAvatarBytes) {
    clearSelectedFile();
    setNotice('Ảnh đại diện phải nhỏ hơn hoặc bằng 5 MB.', true);
    return;
  }
  state.file = file;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  state.pictureSource = 'apiuytin';
  editorImage.src = state.objectUrl;
  editorImage.hidden = false;
  editorFallback.hidden = true;
  avatarFileName.textContent = file.name;
  renderSourceControls();
  setNotice('Ảnh đã sẵn sàng. Bấm “Lưu thay đổi” để tải lên Sanity.');
});

resetButton?.addEventListener('click', () => {
  if (state.profile) renderProfile(state.profile);
  clearSelectedFile();
  setNotice('Đã khôi phục các thay đổi chưa lưu.');
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.profile || saveButton.disabled) return;
  saveButton.disabled = true;
  saveButton.textContent = 'Đang lưu...';
  setNotice('Đang cập nhật thông tin tài khoản...');
  try {
    const profilePayload = { displayName: displayNameInput.value, nickname: nicknameInput.value, displayNameSource: state.nameSource };
    if (!state.file) profilePayload.pictureSource = state.pictureSource;
    const profileResponse = await fetch('/api/auth/me', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(profilePayload)
    });
    let data = await readResponse(profileResponse);
    if (state.file) {
      const formData = new FormData();
      formData.append('avatar', state.file, state.file.name);
      const avatarResponse = await fetch('/api/auth/me/avatar', { method: 'POST', credentials: 'same-origin', body: formData });
      data = await readResponse(avatarResponse);
    }
    renderProfile(data.user);
    clearSelectedFile();
    setNotice('Đã lưu thông tin tài khoản.');
  } catch (error) {
    setNotice(error.message || 'Không thể lưu thông tin tài khoản.', true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Lưu thay đổi';
  }
});

document.addEventListener('apiuytin:email-complete', event => {
  if (!event.detail?.user || !state.profile) return;
  renderProfile({ ...state.profile, ...event.detail.user });
  setNotice('Đã bổ sung email cho tài khoản APIUYTIN.');
});

logoutButton?.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } finally { location.href = '/'; }
});

loadProfile();
