const mode = document.body.dataset.passwordResetMode;
const forgotForm = document.querySelector('#forgot-password-form');
const resetForm = document.querySelector('#reset-password-form');
const alertBox = document.querySelector('#password-reset-alert');
const forgotSubmit = document.querySelector('#forgot-password-submit');
const verifySubmit = document.querySelector('#verify-otp-submit');
const resetSubmit = document.querySelector('#reset-password-submit');
const passwordFields = document.querySelector('#password-fields');
let verifiedToken = '';

const messages = {
  invalid_json: 'Dữ liệu gửi lên chưa hợp lệ. Hãy thử lại.',
  invalid_request: 'Hãy điền đủ thông tin theo đúng định dạng.',
  invalid_otp: 'Mã OTP không đúng hoặc đã bị từ chối.',
  otp_expired: 'Mã OTP đã hết hạn hoặc đã bị khóa. Hãy yêu cầu mã mới.',
  invalid_reset_token: 'Liên kết đổi mật khẩu không hợp lệ hoặc đã hết hạn.',
  invalid_verified_token: 'Phiên xác nhận OTP không hợp lệ hoặc đã hết hạn.',
  otp_already_used: 'Mã OTP này đã được sử dụng. Hãy yêu cầu mã mới.',
  invalid_password: 'Mật khẩu phải có từ 8 đến 128 ký tự.',
  password_mismatch: 'Mật khẩu xác nhận chưa trùng khớp.',
  password_reset_retry: 'Thông tin tài khoản vừa thay đổi. Hãy yêu cầu mã OTP mới.',
  internal_error: 'Hệ thống tạm thời chưa thể xử lý. Hãy thử lại sau.'
};

function showMessage(message, isError = true) {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.dataset.status = isError ? 'error' : 'success';
  alertBox.setAttribute('role', isError ? 'alert' : 'status');
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messages[data.error] || messages.internal_error);
  return data;
}

forgotForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const identifier = new FormData(forgotForm).get('identifier');
  showMessage('');
  if (forgotSubmit) {
    forgotSubmit.disabled = true;
    forgotSubmit.textContent = 'Đang gửi mã...';
  }
  try {
    const data = await postJson('/api/auth/password/forgot', { identifier });
    const token = typeof data.reset_token === 'string' ? data.reset_token : '';
    const target = token ? `/reset-password.html?token=${encodeURIComponent(token)}` : '/reset-password.html';
    window.location.assign(target);
  } catch (error) {
    showMessage(error.message || messages.internal_error);
    if (forgotSubmit) {
      forgotSubmit.disabled = false;
      forgotSubmit.textContent = 'Gửi mã OTP';
    }
  }
});

const otpInput = document.querySelector('#otp');
otpInput?.addEventListener('input', () => {
  otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
});

verifySubmit?.addEventListener('click', async () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const otp = otpInput?.value?.trim() || '';
  if (!token) {
    showMessage(messages.invalid_reset_token);
    return;
  }
  if (!/^\d{6}$/.test(otp)) {
    showMessage('Hãy nhập đủ mã OTP gồm 6 số.');
    otpInput?.focus();
    return;
  }
  verifySubmit.disabled = true;
  verifySubmit.textContent = 'Đang xác nhận...';
  showMessage('');
  try {
    const data = await postJson('/api/auth/password/verify-otp', { reset_token: token, otp });
    verifiedToken = typeof data.verified_token === 'string' ? data.verified_token : '';
    if (!verifiedToken) throw new Error(messages.invalid_verified_token);
    otpInput.readOnly = true;
    verifySubmit.hidden = true;
    passwordFields.hidden = false;
    showMessage('Mã OTP hợp lệ. Hãy tạo mật khẩu mới.', false);
    document.querySelector('#password')?.focus();
  } catch (error) {
    showMessage(error.message || messages.internal_error);
    verifySubmit.disabled = false;
    verifySubmit.textContent = 'Xác nhận mã';
  }
});

resetForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!verifiedToken) {
    showMessage('Hãy xác nhận mã OTP trước.');
    return;
  }
  const values = Object.fromEntries(new FormData(resetForm));
  showMessage('');
  if (resetSubmit) {
    resetSubmit.disabled = true;
    resetSubmit.textContent = 'Đang cập nhật...';
  }
  try {
    await postJson('/api/auth/password/reset', {
      verified_token: verifiedToken,
      password: values.password,
      confirmPassword: values.confirmPassword
    });
    showMessage('Đổi mật khẩu thành công. Đang chuyển về trang đăng nhập...', false);
    window.setTimeout(() => window.location.assign('/login.html'), 900);
  } catch (error) {
    showMessage(error.message || messages.internal_error);
    if (resetSubmit) {
      resetSubmit.disabled = false;
      resetSubmit.textContent = 'Đổi mật khẩu';
    }
  }
});
