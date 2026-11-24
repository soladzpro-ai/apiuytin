const sessionUrl = '/api/auth/session';
const select = document.querySelector('#project-select');
const stateEl = document.querySelector('#overview-state');
const listEl = document.querySelector('#user-list');
const projectNameEl = document.querySelector('#project-name');
const countEl = document.querySelector('#user-count');
const refreshButton = document.querySelector('#refresh-users');
const refreshStatusEl = document.querySelector('#overview-refresh-status');
const pollingCountdownEl = document.querySelector('#overview-polling-countdown');
const POLLING_INTERVAL_SECONDS = 60;
let refreshTimer = 0;
let activeController = null;
let requestSequence = 0;
let pollingSeconds = POLLING_INTERVAL_SECONDS;

function escapeHtml(value) { return String(value || '').replace(/[&<>\'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function renderUsers(users) {
  countEl.textContent = users.length;
  if (!users.length) { listEl.innerHTML = ''; stateEl.hidden = false; stateEl.textContent = 'Chưa có tài khoản nào đăng nhập qua dự án này.'; return; }
  stateEl.hidden = true;
  listEl.innerHTML = users.map(user => { const name = escapeHtml(user.displayName || user.email); const email = escapeHtml(user.email); const avatar = user.avatar ? `<img class="user-avatar" src="${escapeHtml(user.avatar)}" alt="Avatar của ${name}">` : `<span class="user-avatar" aria-hidden="true">${escapeHtml((user.displayName || user.email || '?').slice(0, 1).toUpperCase())}</span>`; const login = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('vi-VN') : 'Chưa rõ'; return `<article class="user-row"><div>${avatar}</div><div class="user-primary"><strong>${name}</strong><small>Tài khoản APIUYTIN</small></div><div class="user-email">${email}</div><div class="user-login">Lần cuối<br>${login}</div></article>`; }).join('');
}
function setRefreshBusy(isBusy) {
  if (!refreshButton) return;
  refreshButton.disabled = isBusy || !select?.value;
  refreshButton.setAttribute('aria-busy', String(isBusy));
  refreshButton.classList.toggle('is-loading', isBusy);
  const label = refreshButton.querySelector('span');
  if (label) label.textContent = isBusy ? 'Đang cập nhật...' : 'Làm mới';
}

function setRefreshStatus(message, isError = false) {
  if (!refreshStatusEl) return;
  refreshStatusEl.textContent = message;
  refreshStatusEl.classList.toggle('is-error', isError);
}

function formatRefreshTime() {
  return `Đã cập nhật lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

function setPollingCountdown(seconds) {
  if (!pollingCountdownEl) return;
  if (seconds <= 0) {
    pollingCountdownEl.textContent = 'Đang cập nhật tự động...';
    pollingCountdownEl.classList.add('is-polling');
    return;
  }
  pollingCountdownEl.textContent = `Cập nhật tự động sau ${seconds} giây`;
  pollingCountdownEl.classList.remove('is-polling');
}

function resetPollingCountdown() {
  pollingSeconds = POLLING_INTERVAL_SECONDS;
  setPollingCountdown(pollingSeconds);
}

async function loadOverview(projectId, { background = false, preserve = false } = {}) {
  if (!projectId) return;
  activeController?.abort();
  const controller = new AbortController();
  const requestId = ++requestSequence;
  const hadUsers = listEl.childElementCount > 0;
  activeController = controller;
  setRefreshBusy(true);
  setRefreshStatus(background && hadUsers ? 'Đang kiểm tra cập nhật...' : 'Đang tải danh sách tài khoản...');
  if (background) setPollingCountdown(0);

  if (!preserve) {
    listEl.innerHTML = '';
    stateEl.hidden = false;
    stateEl.textContent = 'Đang tải danh sách tài khoản...';
  }

  try {
    const response = await fetch(`/api/auth/overview/${encodeURIComponent(projectId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error === 'email_required' ? 'Hãy bổ sung email hợp lệ để tiếp tục sử dụng dịch vụ.' : data.error === 'username_required' ? 'Hãy đặt lại tên đăng nhập hợp lệ để tiếp tục sử dụng dịch vụ.' : (data.error || 'Không thể tải trang tổng quan.'));
    if (requestId !== requestSequence) return;
    projectNameEl.textContent = data.project.name;
    renderUsers(data.users || []);
    setRefreshStatus(formatRefreshTime());
    resetPollingCountdown();
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== requestSequence) return;
    if (!preserve || !hadUsers) {
      stateEl.hidden = false;
      stateEl.textContent = error.message;
      countEl.textContent = '0';
    }
    setRefreshStatus(error.message, true);
    resetPollingCountdown();
  } finally {
    if (requestId === requestSequence) {
      activeController = null;
      setRefreshBusy(false);
    }
  }
}

function startPolling() {
  window.clearInterval(refreshTimer);
  resetPollingCountdown();
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !select?.value || activeController) return;
    if (pollingSeconds <= 1) {
      pollingSeconds = 0;
      setPollingCountdown(0);
      loadOverview(select.value, { background: true, preserve: true });
      return;
    }
    pollingSeconds -= 1;
    setPollingCountdown(pollingSeconds);
  }, 1000);
}

async function init() {
  try {
    const response = await fetch(sessionUrl, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.user) {
      stateEl.textContent = 'Hãy đăng nhập để xem trang tổng quan của dự án.';
      return;
    }
    if (data.emailRequired) {
      stateEl.textContent = 'Hãy bổ sung email hợp lệ để tiếp tục sử dụng dịch vụ.';
      return;
    }
    const projects = data.projects || [];
    if (!projects.length) {
      stateEl.textContent = 'Bạn chưa có dự án nào.';
      return;
    }
    select.innerHTML = projects.map(project => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('');
    select.addEventListener('change', () => loadOverview(select.value));
    refreshButton?.addEventListener('click', () => loadOverview(select.value, { preserve: true }));
    refreshButton && (refreshButton.disabled = false);
    await loadOverview(projects[0].id);
    startPolling();
  } catch {
    stateEl.textContent = 'Không thể tải phiên đăng nhập.';
    setRefreshStatus('Không thể kết nối máy chủ.', true);
  }
}

window.addEventListener('pagehide', () => {
  window.clearInterval(refreshTimer);
  activeController?.abort();
});

init();
