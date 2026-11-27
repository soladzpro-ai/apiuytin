const messages = {
  invalid_username: 'Tên tài khoản chỉ gồm 3–32 chữ cái hoặc chữ số, viết thường.',
  invalid_email: 'Email bắt buộc phải đúng định dạng, ví dụ: ban@example.com.',
  invalid_password: 'Mật khẩu phải có từ 8 đến 128 ký tự.',
  password_mismatch: 'Mật khẩu xác nhận chưa trùng khớp.',
  account_exists: 'Tên tài khoản này đã được sử dụng. Hãy chọn tên khác hoặc đăng nhập.',
  email_exists: 'Email này đã được sử dụng. Hãy dùng email khác hoặc đăng nhập.',
  invalid_credentials: 'Tài khoản hoặc mật khẩu không đúng.',
  invalid_request: 'Thông tin gửi lên chưa hợp lệ. Hãy kiểm tra lại biểu mẫu.',
  internal_error: 'Hệ thống tạm thời chưa thể xử lý. Hãy thử lại sau.'
};

export function initializeAuthForm(form, requestedMode = '') {
  if (!form || form.dataset.authInitialized === 'true') return;

  const mode = requestedMode || form.dataset.authMode || document.body.dataset.authMode;
  if (mode !== 'login' && mode !== 'register') return;

  const alertBox = form.querySelector('[data-auth-alert], #auth-alert');
  const submit = form.querySelector('[data-auth-submit], #auth-submit');
  const usernameInput = form.querySelector('[name="username"]');
  if (!alertBox || !submit) return;

  form.dataset.authInitialized = 'true';
  form.dataset.authMode = mode;

  if (mode === 'register') usernameInput?.addEventListener('input', () => {
    const start = usernameInput.selectionStart;
    const next = usernameInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    usernameInput.value = next;
    if (start !== null) usernameInput.setSelectionRange(Math.min(start, next.length), Math.min(start, next.length));
  });

  form.querySelectorAll('[data-password-toggle]').forEach(toggle => {
    const input = document.getElementById(toggle.dataset.target);
    const label = toggle.querySelector('.sr-only');
    if (!input) return;

    const initialVisible = input.type !== 'password';
    toggle.dataset.passwordVisible = String(initialVisible);
    toggle.setAttribute('aria-pressed', String(initialVisible));

    toggle.addEventListener('click', () => {
      const shouldShow = input.type === 'password';
      input.type = shouldShow ? 'text' : 'password';
      toggle.dataset.passwordVisible = String(shouldShow);
      toggle.setAttribute('aria-pressed', String(shouldShow));
      toggle.setAttribute('aria-label', shouldShow ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      if (label) label.textContent = shouldShow ? 'Ẩn mật khẩu' : 'Hiện mật khẩu';
      input.focus({ preventScroll: true });
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    alertBox.textContent = '';
    submit.disabled = true;
    submit.textContent = mode === 'register' ? 'Đang tạo tài khoản...' : 'Đang đăng nhập...';
    const values = Object.fromEntries(new FormData(form));
    const payload = mode === 'register'
      ? { username: values.username, email: values.email, password: values.password, confirmPassword: values.confirmPassword }
      : { username: values.username, password: values.password };
    try {
      const response = await fetch('/api/auth/' + mode, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messages[data.error] || messages.internal_error);
      window.location.assign('/');
    } catch (error) {
      alertBox.textContent = error.message || messages.internal_error;
      alertBox.setAttribute('role', 'alert');
      submit.disabled = false;
      submit.textContent = mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập';
    }
  });
}

const pageForm = document.querySelector('#auth-form');
if (pageForm) initializeAuthForm(pageForm);
