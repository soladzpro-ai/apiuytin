(() => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const messages = {
    email_exists: 'Email này đã được dùng cho tài khoản khác.',
    email_already_set: 'Tài khoản này đã có email. Hãy tải lại trang để đồng bộ.',
    invalid_email: 'Email chưa đúng định dạng. Hãy nhập một email hợp lệ.',
    email_required: 'Bạn cần bổ sung email để tiếp tục sử dụng dịch vụ.',
    username_exists: 'Tên đăng nhập này đã được dùng cho tài khoản khác.',
    username_already_set: 'Tên đăng nhập này đã hợp lệ và không thể thay đổi.',
    invalid_username: 'Tên đăng nhập chỉ gồm 3–32 chữ cái hoặc chữ số, viết thường.',
    username_required: 'Bạn cần đặt lại tên đăng nhập hợp lệ để tiếp tục.'
  };
  let gate = null;
  let inertElements = [];

  function hasValidEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return email.length <= 254 && emailPattern.test(email);
  }

  function hasValidUsername(value) {
    return typeof value === 'string' && /^[a-z0-9]{3,32}$/.test(value);
  }

  function setError(message) {
    const error = gate?.querySelector('[data-email-gate-error]');
    const input = gate?.querySelector('[data-email-gate-input], [data-username-gate-input]');
    if (!error || !input) return;
    error.hidden = !message;
    error.textContent = message || '';
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function restorePage() {
    inertElements.forEach(element => { element.inert = false; });
    inertElements = [];
    document.body.classList.remove('email-gate-open');
    gate?.remove();
    gate = null;
  }

  function announceCompletion(user) {
    document.dispatchEvent(new CustomEvent('apiuytin:email-complete', { detail: { user } }));
    restorePage();
  }

  async function saveEmail(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector('[data-email-gate-input]');
    const usernameInput = form.querySelector('[data-username-gate-input]');
    const button = form.querySelector('[data-email-gate-submit]');
    const email = input?.value.trim().toLowerCase() || '';
    const username = usernameInput?.value || '';
    if (!hasValidEmail(email) && !usernameInput) {
      setError('Nhập một email hợp lệ, ví dụ: ban@example.com.');
      input?.focus();
      return;
    }
    if (usernameInput && !hasValidUsername(username)) {
      setError('Tên đăng nhập chỉ gồm 3–32 chữ cái hoặc chữ số, viết thường.');
      usernameInput.focus();
      return;
    }
    if (input && !hasValidEmail(email)) {
      setError('Nhập một email hợp lệ, ví dụ: ban@example.com.');
      input.focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Đang lưu...';
    setError('');
    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(input ? { email } : {}), ...(usernameInput ? { username } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messages[data.error] || data.error || 'Không thể lưu email. Hãy thử lại.');
      if (input && !hasValidEmail(data.user?.email)) throw new Error('Máy chủ chưa xác nhận email hợp lệ. Hãy thử lại.');
      if (usernameInput && !hasValidUsername(data.user?.username)) throw new Error('Máy chủ chưa xác nhận tên đăng nhập hợp lệ. Hãy thử lại.');
      announceCompletion(data.user);
    } catch (error) {
      setError(error.message || 'Không thể lưu email. Hãy thử lại.');
      button.disabled = false;
      button.textContent = 'Lưu email và tiếp tục';
      input.focus();
    }
  }

  function trapFocus(event) {
    if (!gate) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...gate.querySelectorAll('input, button')].filter(element => !element.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showGate() {
    if (gate) return;
    gate = document.createElement('div');
    gate.className = 'email-gate-root';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'email-gate-title');
    gate.setAttribute('aria-describedby', 'email-gate-description');
    const needsEmail = !hasValidEmail(window.__apiuytinGateUser?.email);
    const needsUsername = typeof window.__apiuytinGateUser?.username === 'string' && window.__apiuytinGateUser.username !== '' && !hasValidUsername(window.__apiuytinGateUser.username);
    gate.innerHTML = `
      <section class="email-gate-card">
        <div class="email-gate-mark" aria-hidden="true">@</div>
        <p class="email-gate-kicker">Hoàn tất tài khoản APIUYTIN</p>
        <h1 id="email-gate-title">Bổ sung email để tiếp tục</h1>
        <p id="email-gate-description" class="email-gate-description">Tài khoản của bạn chưa có email. Email hợp lệ giúp hồ sơ APIUYTIN hoạt động đầy đủ trên các dịch vụ đã tích hợp.</p>
        <form class="email-gate-form" novalidate>
          ${needsEmail ? '<label class="email-gate-field" for="email-gate-input"><span>Email</span><input id="email-gate-input" data-email-gate-input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="ví dụ: ban@example.com"></label>' : ''}
          ${needsUsername ? '<label class="email-gate-field" for="username-gate-input"><span>Tên đăng nhập mới</span><input id="username-gate-input" data-username-gate-input name="username" type="text" autocomplete="username" minlength="3" maxlength="32" required placeholder="ví dụ: chuotdev"></label>' : ''}
          <p class="email-gate-error" data-email-gate-error role="alert" hidden></p>
          <button class="button button-primary email-gate-submit" data-email-gate-submit type="submit">Lưu email và tiếp tục</button>
        </form>
        <p class="email-gate-note">Email không được trùng với tài khoản APIUYTIN khác. Hộp này không thể đóng cho đến khi email hợp lệ được lưu.</p>
      </section>`;
    document.body.append(gate);
    inertElements = [...document.body.children].filter(element => element !== gate);
    inertElements.forEach(element => { element.inert = true; });
    document.body.classList.add('email-gate-open');
    gate.querySelector('form').addEventListener('submit', saveEmail);
    gate.querySelector('[data-username-gate-input]')?.addEventListener('input', event => {
      event.currentTarget.value = event.currentTarget.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    });
    document.addEventListener('keydown', trapFocus, true);
    gate.querySelector('[data-email-gate-input], [data-username-gate-input]').focus();
  }

  async function init() {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.user && (!hasValidEmail(data.user.email) || (typeof data.user.username === 'string' && data.user.username !== '' && !hasValidUsername(data.user.username)))) {
        window.__apiuytinGateUser = data.user;
        showGate();
      }
    } catch {
      // A failed session check must not trap a user in a modal without proof of authentication.
    }
  }

  document.addEventListener('apiuytin:email-complete', () => {
    document.removeEventListener('keydown', trapFocus, true);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
