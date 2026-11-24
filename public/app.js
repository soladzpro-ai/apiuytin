/* ==========================================================================
   APIUYTIN - FRONTEND INTERACTION & THEME ENGINE
   Preserves 100% backend contracts, endpoints, and data payloads
   ========================================================================== */

const API = '/api/auth';
const state = { projects: [], user: null };
const googleMark = '<svg class="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z"></path><path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z"></path><path fill="#FBBC05" d="M6.54 13.58A5.85 5.85 0 0 1 6.23 12c0-.55.1-1.08.31-1.58V7.89H3.3A9.5 9.5 0 0 0 2.25 12c0 1.49.36 2.9 1.05 4.11l3.24-2.53Z"></path><path fill="#EA4335" d="M12 6.39c1.43 0 2.72.49 3.73 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 8.11 9.46 6.39 12 6.39Z"></path></svg>';

// Element Selectors
const projectDialog = document.querySelector('#project-dialog');
const projectForm = document.querySelector('#project-form');
const projectsEl = document.querySelector('#projects');
const noticeEl = document.querySelector('#notice');
const newProjectBtn = document.querySelector('#new-project');
const projectDialogTitle = document.querySelector('#project-dialog-title');
const projectSubmit = document.querySelector('#project-submit');
let editingProjectId = null;

/* ==========================================================================
   THEME TOGGLE ENGINE (Dark / Light Theme Swap)
   ========================================================================== */
function initTheme() {
  const savedTheme = localStorage.getItem('apiuytin_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtons(savedTheme);

  document.querySelectorAll('.theme-toggle').forEach(button => {
    if (button.dataset.themeToggleBound === 'true') return;
    button.dataset.themeToggleBound = 'true';
    button.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('apiuytin_theme', newTheme);
      updateThemeButtons(newTheme);
    });
  });
}

function updateThemeButtons(theme) {
  document.querySelectorAll('.theme-toggle').forEach(button => {
    button.setAttribute('aria-label', theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối');
    button.setAttribute('title', theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối');
  });
}

/* ==========================================================================
   HELPER UTILITIES
   ========================================================================== */
let toastTimer;
let toastHideTimer;

function showToast(message) {
  let toast = document.querySelector('.toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="toast-text"></span>
    `;
    document.body.appendChild(toast);
  }
  toast.querySelector('.toast-text').textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function notice(message, error = false) {
  const messages = (Array.isArray(message) ? message : [message])
    .filter(item => !/^THÔNG BÁO\s+\d+$/i.test(String(item).trim()));
  let toast = document.querySelector('[data-apiuytin-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.dataset.apiuytinToast = 'true';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    Object.assign(toast.style, {
      position: 'fixed', top: '24px', right: '24px', zIndex: '1000',
      maxWidth: 'min(420px, calc(100vw - 32px))', padding: '14px 18px',
      background: 'var(--bg-surface, #162632)', color: 'var(--text-primary, #fff)',
      border: '1px solid var(--accent-primary, #b7f34a)', borderRadius: '8px',
      boxShadow: '0 12px 30px rgba(0, 0, 0, .2)', fontFamily: 'inherit',
      lineHeight: '1.5', opacity: '0', transform: 'translateY(-8px)',
      transition: 'opacity .2s ease, transform .2s ease'
    });
    document.body.appendChild(toast);
  }
  toast.replaceChildren(...messages.map(item => {
    const line = document.createElement('div');
    line.textContent = String(item);
    return line;
  }));
  toast.dataset.error = error ? 'true' : 'false';
  toast.style.background = error ? '#b91c1c' : '#15803d';
  toast.style.color = '#ffffff';
  toast.style.borderColor = error ? '#991b1b' : '#166534';
  toast.style.visibility = 'visible';
  toast.style.pointerEvents = 'auto';
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toastHideTimer = setTimeout(() => {
      toast.style.visibility = 'hidden';
      toast.style.pointerEvents = 'none';
    }, 220);
  }, 3000);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

const apiErrorMessages = {
  invalid_json: 'Dữ liệu gửi lên không phải JSON hợp lệ.',
  invalid_request: 'Yêu cầu không hợp lệ.',
  invalid_client: 'Client ID, API key hoặc callback không hợp lệ.',
  invalid_grant: 'Mã đăng nhập không hợp lệ, đã hết hạn hoặc đã được sử dụng.',
  invalid_api_key: 'API key không hợp lệ hoặc đã bị vô hiệu hóa.',
  not_found: 'Không tìm thấy tài nguyên được yêu cầu.',
  device_session_required: 'Thiết bị cần được xác thực trước khi tiếp tục.',
  device_session_mismatch: 'Phiên thiết bị không khớp. Hãy xác thực lại.',
  unauthorized: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  email_required: 'Hãy bổ sung email hợp lệ để tiếp tục sử dụng dịch vụ.',
  username_required: 'Hãy đặt lại tên đăng nhập hợp lệ để tiếp tục sử dụng dịch vụ.',
  username_exists: 'Tên đăng nhập này đã được dùng cho tài khoản khác.',
  project_not_found: 'Không tìm thấy dự án hoặc dự án đã bị thu hồi.',
  project_revoked: 'Dự án đã bị thu hồi.',
  token_expired: 'Token đã hết hạn. Hãy đăng nhập lại.',
  key_rotation_conflict: 'Có một lần cấp lại API key khác vừa hoàn tất. Hãy tải lại dự án.',
  oauth_unavailable: 'Dịch vụ đăng nhập tạm thời chưa khả dụng. Hãy thử lại sau.',
  internal_error: 'Hệ thống gặp lỗi tạm thời. Hãy thử lại sau.'
};

function userFacingError(value, fallback = 'Không thể hoàn tất thao tác.') {
  const message = String(value || '');
  return apiErrorMessages[message] || (message.includes('_') ? fallback : message) || fallback;
}

function masked(value) {
  if (!value) return '';
  return value.length < 16
    ? `${value.slice(0, 4)}••••••••`
    : `${value.slice(0, 10)}••••••••••${value.slice(-6)}`;
}

async function copyValue(value, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      if (!document.execCommand('copy')) throw new Error('Không thể truy cập bộ nhớ tạm.');
      input.remove();
    }
    const originalHtml = button.innerHTML;
    button.classList.add('copied');
    button.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Đã chép</span>
    `;
    showToast('✓ Đã sao chép vào bộ nhớ tạm');
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = originalHtml;
    }, 1500);
  } catch {
    notice('Không thể sao chép tự động. Hãy chọn và sao chép giá trị thủ công.', true);
  }
}

/* ==========================================================================
   MOBILE NAVIGATION & DRAWER ENGINE
   ========================================================================== */
function initMobileNavigation() {
  const drawer = document.querySelector('.mobile-drawer');
  const backdrop = document.querySelector('.drawer-backdrop');
  const toggleBtns = document.querySelectorAll('.dock-drawer-toggle');
  const closeBtns = document.querySelectorAll('.drawer-close');
  const drawerLinks = document.querySelectorAll('.drawer-link');
  const dock = document.querySelector('.mobile-bottom-dock');

  function openDrawer() {
    drawer?.classList.add('open');
    backdrop?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer?.classList.remove('open');
    backdrop?.classList.remove('open');
    document.body.style.overflow = '';
  }

  toggleBtns.forEach(btn => btn.addEventListener('click', openDrawer));
  closeBtns.forEach(btn => btn.addEventListener('click', closeDrawer));
  backdrop?.addEventListener('click', closeDrawer);
  drawerLinks.forEach(link => link.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !drawer?.classList.contains('open')) return;
    closeDrawer();
    toggleBtns[0]?.focus();
  });

  if (!dock) return;

  // Sliding indicator for active dock item
  let indicator = dock.querySelector('.dock-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'dock-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    dock.prepend(indicator);
  }

  function moveIndicatorTo(targetItem, animate = true) {
    if (!dock || !targetItem || !indicator) return;
    const dockRect = dock.getBoundingClientRect();
    const itemRect = targetItem.getBoundingClientRect();

    if (dockRect.width === 0 || itemRect.width === 0) return;

    const left = itemRect.left - dockRect.left;
    const width = itemRect.width;

    if (!animate) {
      indicator.style.transition = 'none';
    } else {
      indicator.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), width 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
    }

    indicator.style.transform = `translate3d(${left}px, 0, 0)`;
    indicator.style.width = `${width}px`;
    indicator.style.opacity = '1';

    if (!animate) {
      void indicator.offsetHeight;
      indicator.style.transition = '';
    }
  }

  const path = window.location.pathname;
  let activeItem = null;
  const dockItems = dock.querySelectorAll('.dock-item');

  dockItems.forEach(item => {
    const href = item.getAttribute('href');
    if (href) {
      if (href === path || (href === '/' && (path === '' || path === '/index.html'))) {
        item.classList.add('active');
        activeItem = item;
      } else if (href !== '/' && path.includes(href)) {
        item.classList.add('active');
        activeItem = item;
      } else {
        item.classList.remove('active');
      }
    }
  });

  if (!activeItem) {
    activeItem = dock.querySelector('.dock-item.active') || dockItems[0];
    if (activeItem) activeItem.classList.add('active');
  }

  // Smoothly position indicator on page load
  const positionInitial = () => {
    const current = dock.querySelector('.dock-item.active') || activeItem;
    if (current && dock.offsetWidth > 0) {
      moveIndicatorTo(current, false);
    }
  };

  if (document.readyState === 'complete') {
    positionInitial();
  } else {
    window.addEventListener('load', positionInitial);
  }
  setTimeout(positionInitial, 60);

  // Click interaction: animate indicator gliding from previous item to newly selected item
  dockItems.forEach(item => {
    item.addEventListener('click', () => {
      dockItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      moveIndicatorTo(item, true);
    });
  });

  // Handle window resize / orientation change
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const current = dock.querySelector('.dock-item.active') || activeItem;
      if (current) moveIndicatorTo(current, false);
    }, 100);
  });
}

function credential(label, value) {
  const safeValue = escapeHtml(value);
  return `
    <div class="credential-row">
      <span class="credential-label">${label}</span>
      <span class="credential-value" title="${safeValue}">${masked(value)}</span>
      <button class="copy-button" type="button" data-copy="${safeValue}" aria-label="Sao chép ${label}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Sao chép</span>
      </button>
    </div>
  `;
}

/* ==========================================================================
   PROJECT RENDERING & LIST
   ========================================================================== */
function renderProjects() {
  if (!projectsEl) return;

  if (!state.projects.length) {
    projectsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
        </div>
        <h3>Chưa có dự án nào</h3>
        <p>${state.user ? 'Tạo dự án đầu tiên để bắt đầu tích hợp Google OAuth.' : 'Đăng nhập bằng Google để tạo dự án và nhận thông tin xác thực API độc quyền.'}</p>
        ${state.user ? '' : `<a class="button button-primary" href="/register.html">Tạo tài khoản</a><a class="button button-primary" href="/login.html">Đăng nhập</a><a class="button button-outline google-action" href="/auth/google">${googleMark}<span>Google</span></a>`}
      </div>
    `;
    return;
  }

  projectsEl.innerHTML = state.projects.map(project => {
    const safeName = escapeHtml(project.name);
    const safeRedirect = escapeHtml(project.redirectUri);
    const createdDate = project.createdAt ? new Date(project.createdAt).toLocaleDateString('vi-VN') : 'Mới tạo';
    const isEnabled = project.status !== 'disabled';
    const statusLabel = isEnabled ? 'ĐANG HOẠT ĐỘNG' : 'ĐANG TẮT';
    const toggleLabel = isEnabled ? 'Đang bật' : 'Đang tắt';
    const toggleAction = isEnabled ? 'Tắt project' : 'Bật project';

    return `
      <article class="project-card">
        <div>
          <div class="project-title">
            <h3>${safeName}</h3>
            <span class="status-badge${isEnabled ? '' : ' status-badge-disabled'}">${statusLabel}</span>
          </div>
          <div class="credential">
            ${credential('Client ID', project.clientId)}
            ${project.apiKey ? credential('API key', project.apiKey) : '<div class="credential-row credential-row-muted"><span class="credential-label">API key</span><span class="credential-value">Chỉ hiện lúc tạo hoặc cấp lại</span></div>'}
          </div>
        </div>
        <div class="project-meta">
          <p><strong>URL callback trực tiếp</strong>${safeRedirect}</p>
          <p><strong>Endpoint OAuth</strong>https://apiuytin.pages.dev/oauth/google</p>
          <p><strong>Ngày khởi tạo</strong>${createdDate}</p>
          <div class="project-actions">
            <button class="project-toggle${isEnabled ? ' is-on' : ''}" type="button" data-toggle-project="${project.id}" aria-pressed="${String(isEnabled)}" aria-label="${toggleAction}">
              <span class="project-toggle-track" aria-hidden="true"><span class="project-toggle-thumb"></span></span>
              <span class="project-toggle-label">${toggleLabel}</span>
            </button>
            <button class="button button-outline" type="button" data-edit="${project.id}">Sửa callback</button>
            <button class="button button-outline" type="button" data-rotate="${project.id}">Cấp lại API key</button>
            <button class="revoke-button" type="button" data-revoke="${project.id}">Thu hồi dự án</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  projectsEl.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', () => copyValue(button.dataset.copy, button));
  });
  projectsEl.querySelectorAll('[data-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const project = state.projects.find(item => item.id === button.dataset.edit);
      if (!project) return;
      editingProjectId = project.id;
      projectForm.elements.name.value = project.name;
      projectForm.elements.redirectUri.value = project.redirectUri;
      projectForm.elements.name.disabled = true;
      projectDialogTitle.textContent = 'Chỉnh sửa dự án';
      projectSubmit.textContent = 'Lưu callback URL';
      projectDialog?.showModal();
    });
  });
  projectsEl.querySelectorAll('[data-toggle-project]').forEach(button => {
    button.addEventListener('click', async () => {
      const projectId = button.dataset.toggleProject;
      const project = state.projects.find(item => item.id === projectId);
      if (!project) return;
      const nextEnabled = project.status === 'disabled';
      button.disabled = true;
      button.classList.add('is-loading');
      const label = button.querySelector('.project-toggle-label');
      if (label) label.textContent = nextEnabled ? 'Đang bật...' : 'Đang tắt...';
      try {
        const response = await fetchWithTimeout(`${API}/projects/${encodeURIComponent(projectId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(userFacingError(data.error, 'Không thể cập nhật hiệu lực project.'));
        state.projects = state.projects.map(item => item.id === projectId ? data.project : item);
        renderProjects();
        notice(nextEnabled ? 'Project đã được bật và có thể đăng nhập lại.' : 'Project đã được tắt. Các lượt đăng nhập mới sẽ bị từ chối.');
      } catch (error) {
        notice(error.message || 'Không thể cập nhật hiệu lực project.', true);
        button.disabled = false;
        button.classList.remove('is-loading');
        if (label) label.textContent = nextEnabled ? 'Đang tắt' : 'Đang bật';
      }
    });
  });
  projectsEl.querySelectorAll('[data-revoke]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Thu hồi dự án này? Dự án sẽ bị vô hiệu hóa ngay và dữ liệu OAuth liên quan sẽ được dọn dẹp ở nền.')) return;
      button.disabled = true;
      button.textContent = 'Đang thu hồi...';
      try {
        const response = await fetchWithTimeout(`${API}/projects/${encodeURIComponent(button.dataset.revoke)}/revoke`, { method: 'POST', credentials: 'same-origin' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(userFacingError(data.error, 'Không thể thu hồi dự án.'));
        state.projects = state.projects.filter(project => project.id !== button.dataset.revoke);
        renderProjects();
        notice(data.cleanupScheduled ? 'Dự án đã bị vô hiệu hóa. Dữ liệu liên quan đang được dọn dẹp ở nền.' : 'Dự án đã bị vô hiệu hóa.');
      } catch (error) {
        notice(error.message || 'Không thể thu hồi dự án.', true);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = 'Thu hồi dự án';
        }
      }
    });
  });

  projectsEl.querySelectorAll('[data-rotate]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Cấp lại API key? Key cũ sẽ bị vô hiệu hóa ngay lập tức.')) return;
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = 'Đang cấp lại...';
      try {
        const response = await fetchWithTimeout(`${API}/projects/${encodeURIComponent(button.dataset.rotate)}/rotate-key`, { method: 'POST', credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) throw new Error(userFacingError(data.error, 'Không thể cấp lại API key.'));
        state.projects = state.projects.map(project => project.id === button.dataset.rotate ? data.project : project);
        renderProjects();
        notice('API key mới chỉ hiển thị lần này. Hãy lưu ở máy chủ của ứng dụng tích hợp.');
      } catch (error) {
        notice(error.message, true);
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

/* ==========================================================================
   SESSION & AUTH MANAGEMENT
   ========================================================================== */
async function loadSession() {
  try {
    const response = await fetchWithTimeout(`${API}/session`, { credentials: 'same-origin' }, 10000);
    if (!response.ok) {
      renderProjects();
      return;
    }
    const data = await response.json();
    state.user = data.user;
    state.projects = data.projects || [];

    if (data.user) {
      const loginToastKey = `apiuytin_login_toast:${data.user.userId || data.user.email}`;
      if (!sessionStorage.getItem(loginToastKey)) {
        notice(['Đăng nhập APIUYTIN thành công', `Xin chào ${data.user.name || data.user.email}`]);
        sessionStorage.setItem(loginToastKey, 'shown');
      }
    }

    const accountSlot = document.querySelector('#account-slot');
    if (data.user && accountSlot) {
      const name = escapeHtml(data.user.name || data.user.email);
      const email = escapeHtml(data.user.email || (data.user.username ? `@${data.user.username}` : ''));
      const avatar = data.user.picture
        ? `<img class="account-avatar" src="${escapeHtml(data.user.picture)}" alt="Avatar của ${name}">`
        : '<span class="account-avatar account-avatar-fallback" aria-hidden="true">A</span>';

      accountSlot.innerHTML = `
        <a class="account-settings-link" href="/account/me?setting=page" aria-label="Mở cài đặt tài khoản">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M4.5 20c.8-3.2 3.3-5 7.5-5s6.7 1.8 7.5 5"></path></svg>
          <span>Cài đặt</span>
        </a>
        <div class="account-profile">
          ${avatar}
          <span class="account-details">
            <strong>${name}</strong>
            <small>${email}</small>
          </span>
          <button class="button button-outline" id="logout" type="button">Thoát</button>
        </div>
      `;

      document.querySelector('#logout')?.addEventListener('click', async () => {
        Object.keys(sessionStorage).filter(key => key.startsWith('apiuytin_login_toast:')).forEach(key => sessionStorage.removeItem(key));
        await fetchWithTimeout(`${API}/logout`, { method: 'POST', credentials: 'same-origin' }, 10000);
        location.reload();
      });
    }

    renderProjects();
  } catch (error) {
    console.error('Session load error:', error);
    renderProjects();
  }
}

/* ==========================================================================
   EVENT LISTENERS & MODAL DIALOG
   ========================================================================== */
if (newProjectBtn) {
  newProjectBtn.addEventListener('click', () => {
    if (!state.user) {
      location.href = '/auth/google';
      return;
    }
    editingProjectId = null;
    projectForm?.reset();
    projectForm.elements.name.disabled = false;
    projectDialogTitle.textContent = 'Tạo dự án mới';
    projectSubmit.textContent = 'Cấp thông tin xác thực';
    projectDialog?.showModal();
  });
}

document.querySelectorAll('[data-dialog-cancel]').forEach(button => {
  button.addEventListener('click', () => {
    projectForm?.reset();
    editingProjectId = null;
    projectForm.elements.name.disabled = false;
    projectDialogTitle.textContent = 'Tạo dự án mới';
    projectSubmit.textContent = 'Cấp thông tin xác thực';
    projectDialog?.close();
  });
});

if (projectForm) {
  projectForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (event.submitter?.value !== 'default') return;
    const submit = projectForm.querySelector('[value="default"]');
    if (!submit) return;

    submit.disabled = true;
    const originalText = submit.textContent;
    submit.textContent = editingProjectId ? 'Đang lưu callback...' : 'Đang cấp thông tin xác thực...';

    const payload = Object.fromEntries(new FormData(projectForm));
    const wasEditing = Boolean(editingProjectId);

    try {
      const response = await fetchWithTimeout(editingProjectId ? `${API}/projects/${encodeURIComponent(editingProjectId)}` : `${API}/projects`, {
        method: editingProjectId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(userFacingError(data.error, 'Không thể tạo dự án.'));
      }

      projectDialog?.close();
      projectForm.reset();
      projectForm.elements.name.disabled = false;
      projectDialogTitle.textContent = 'Tạo dự án mới';
      projectSubmit.textContent = 'Cấp thông tin xác thực';
      if (wasEditing) {
        state.projects = state.projects.map(project => project.id === editingProjectId ? data.project : project);
      } else {
        state.projects.unshift(data.project);
      }
      editingProjectId = null;
      renderProjects();
      notice(wasEditing ? 'URL callback đã được cập nhật.' : 'Dự án đã được tạo. API key chỉ hiển thị một lần, hãy lưu ở máy chủ.');
    } catch (error) {
      notice(error.message, true);
    } finally {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  });
}

/* ==========================================================================
   GLOBAL COPY BUTTONS (Static buttons outside #projects)
   ========================================================================== */
function initGlobalCopyButtons() {
  // Wire up all [data-copy] buttons that are NOT inside #projects
  // (i.e., terminal-card, code-block buttons in hero & docs sections)
  document.querySelectorAll('[data-copy]').forEach(button => {
    // Skip buttons inside #projects – those are handled by renderProjects()
    if (projectsEl && projectsEl.contains(button)) return;
    button.addEventListener('click', () => copyValue(button.dataset.copy, button));
  });
}

// Initialize Theme, Mobile Navigation, Static Copy Buttons & Session on DOM ready
initTheme();
initMobileNavigation();
initGlobalCopyButtons();
loadSession();
