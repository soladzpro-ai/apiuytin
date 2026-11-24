const form = document.querySelector('#auth-form');
const alertBox = document.querySelector('#auth-alert');
const submit = document.querySelector('#auth-submit');
const mode = document.body.dataset.authMode;

const usernameInput = document.querySelector('#username');
if (mode === 'register') usernameInput?.addEventListener('input', () => {
  const start = usernameInput.selectionStart;
  const next = usernameInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');
  usernameInput.value = next;
  if (start !== null) usernameInput.setSelectionRange(Math.min(start, next.length), Math.min(start, next.length));
});

document.querySelectorAll('[data-password-toggle]').forEach(toggle => {
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

function showError(message) {
  alertBox.textContent = message;
  alertBox.setAttribute('role', 'alert');
}

form?.addEventListener('submit', async event => {
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
    showError(error.message || messages.internal_error);
    submit.disabled = false;
    submit.textContent = mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập';
  }
});
