function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function initials(account) {
  return escapeHtml((account.name || account.email || '?').trim().slice(0, 1).toUpperCase());
}

function safePicture(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? escapeHtml(url.toString()) : null;
  } catch {
    return null;
  }
}

export function renderConsentPage({ project, transaction, accounts }) {
  const callbackHost = new URL(project.redirectUri).host;
  const accountCards = accounts.length
    ? accounts.map((account, index) => {
      const picture = safePicture(account.picture);
      const avatar = picture
        ? `<img src="${picture}" alt="" class="account-avatar">`
        : `<span class="account-avatar account-avatar-fallback" aria-hidden="true">${initials(account)}</span>`;
      const accountName = account.name || account.displayName || (account.username ? '@' + account.username : account.email || 'Tài khoản APIUYTIN');
      const accountDetail = account.email || (account.username ? 'Tài khoản APIUYTIN' : '');
      const providerTags = [
        account.googleAccountId || account.provider === 'google' ? '<span class="account-provider-tag account-provider-google">Google</span>' : '',
        account.githubAccountId || account.provider === 'github' ? '<span class="account-provider-tag account-provider-github">GitHub</span>' : ''
      ].filter(Boolean).join('');
      return `<label class="account-option">
        <input type="radio" name="account_id" value="${escapeHtml(account._id)}"${index === 0 ? ' checked' : ''}>
        <span class="account-card">${avatar}<span class="account-copy"><strong>${escapeHtml(accountName)}</strong><small>${escapeHtml(accountDetail)}</small>${providerTags ? `<span class="account-provider-tags" aria-label="Nhà cung cấp đăng nhập">${providerTags}</span>` : ''}</span><span class="account-check" aria-hidden="true">✓</span></span>
      </label>`;
    }).join('')
    : '<p class="empty-state">Chưa có tài khoản APIUYTIN nào trên thiết bị này.</p>';

  const transactionQuery = encodeURIComponent(transaction);
  const googleAddAccountLink = '/oauth/consent/add-account?transaction=' + transactionQuery;
  const githubAddAccountLink = '/oauth/consent/add-account?provider=github&transaction=' + transactionQuery;
  const continueButton = accounts.length
    ? '<button class="primary-button" type="submit" name="intent" value="continue">Tiếp tục</button>'
    : '<a class="primary-button" href="' + googleAddAccountLink + '">Thêm tài khoản bằng Google</a>';
  const addAccountLink = '<p class="add-account-row"><a class="secondary-button" href="' + googleAddAccountLink + '">Thêm bằng Google</a><a class="secondary-button" href="' + githubAddAccountLink + '">Thêm bằng GitHub</a></p>';
  const localLoginLink = '<p class="add-account-row"><a class="secondary-button" href="/oauth/consent/local-login?transaction=' + encodeURIComponent(transaction) + '">Đăng nhập bằng tài khoản APIUYTIN</a></p>';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/logoweb.png">
  <title>Đăng nhập vào ${escapeHtml(project.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Sans+Mono:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/oauth-consent.css">
  <script src="/oauth-consent.js" defer></script>
</head>
<body>
  <main class="consent-shell">
    <section class="consent-card" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">
      <div class="consent-intro">
        <div class="brand-lockup"><span class="brand-mark"><img src="/logoweb.png" alt="APIUYTIN logo"></span><span>APIUYTIN</span></div>
        <p class="eyebrow">Đăng nhập an toàn</p>
        <h1 id="consent-title">Chọn tài khoản để tiếp tục</h1>
        <p id="consent-description" class="lead"><strong>${escapeHtml(project.name)}</strong> đang yêu cầu đăng nhập qua APIUYTIN.</p>
        <p class="callback-note">Callback đã đăng ký: <span>${escapeHtml(callbackHost)}</span></p>
        <div class="consent-trust" aria-label="Thông tin bảo mật">
          <span class="consent-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-3.6 7-9V5l-7-2-7 2v7c0 5.4 7 9 7 9Z"></path><path d="m9 12 2 2 4-4"></path></svg></span>
          <span><strong>Chuyển giao có kiểm soát</strong><small>Chỉ chia sẻ profile đã được liệt kê.</small></span>
        </div>
      </div>
      <div class="consent-panel">
        <form method="post" action="/oauth/consent" class="consent-form">
          <input type="hidden" name="transaction" value="${escapeHtml(transaction)}">
          <fieldset>
            <legend>Tài khoản APIUYTIN</legend>
            <div class="account-list">${accountCards}</div>
          </fieldset>
          ${addAccountLink}
          ${localLoginLink}
          <p class="share-note">Sau khi tiếp tục, ứng dụng sẽ nhận ID APIUYTIN, tên, email, avatar và thông tin hồ sơ được phép chia sẻ.</p>
          <div class="consent-actions">
            <button class="secondary-button" type="submit" name="intent" value="cancel">Hủy</button>
            ${continueButton}
          </div>
        </form>
        <p class="privacy-note">Bạn có thể hủy bất cứ lúc nào. APIUYTIN không chia sẻ mật khẩu hoặc token Google.</p>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function renderLocalLoginPage({ project, transaction, error = '' }) {
  const callbackHost = new URL(project.redirectUri).host;
  const errorMarkup = error ? `<p class="local-login-error" role="alert">${escapeHtml(error)}</p>` : '';
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/logoweb.png">
  <title>Đăng nhập tài khoản APIUYTIN</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Sans+Mono:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/oauth-consent.css">
</head>
<body>
  <main class="consent-shell">
    <section class="consent-card" role="dialog" aria-modal="true" aria-labelledby="local-login-title" aria-describedby="local-login-description">
      <div class="consent-intro">
        <div class="brand-lockup"><span class="brand-mark"><img src="/logoweb.png" alt="APIUYTIN logo"></span><span>APIUYTIN</span></div>
        <p class="eyebrow">Đăng nhập tài khoản</p>
        <h1 id="local-login-title">Đăng nhập để tiếp tục</h1>
        <p id="local-login-description" class="lead"><strong>${escapeHtml(project.name)}</strong> đang yêu cầu đăng nhập qua APIUYTIN.</p>
        <p class="callback-note">Callback đã đăng ký: <span>${escapeHtml(callbackHost)}</span></p>
      </div>
      <div class="consent-panel">
        <form method="post" action="/oauth/consent/local-login" class="consent-form">
          <input type="hidden" name="transaction" value="${escapeHtml(transaction)}">
          <fieldset class="local-login-fields">
            <legend>Tài khoản APIUYTIN</legend>
            <label class="local-login-field" for="local-username"><span>Tên tài khoản hoặc email</span><input id="local-username" name="username" autocomplete="username" minlength="3" maxlength="254" placeholder="Tên tài khoản hoặc email" required></label>
            <label class="local-login-field" for="local-password"><span>Mật khẩu</span><input id="local-password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label>
          </fieldset>
          <p class="local-login-forgot"><a href="/forgot-password.html">Quên mật khẩu?</a></p>
          ${errorMarkup}
          <div class="consent-actions">
            <a class="secondary-button" href="/oauth/consent?transaction=${encodeURIComponent(transaction)}">Quay lại</a>
            <button class="primary-button" type="submit">Đăng nhập và tiếp tục</button>
          </div>
        </form>
        <p class="local-login-register">Chưa có tài khoản? <a href="/register.html">Tạo tài khoản APIUYTIN</a></p>
        <p class="privacy-note">Mật khẩu chỉ được dùng để xác thực APIUYTIN và không được gửi cho website tích hợp.</p>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function renderConsentError(message) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" type="image/png" href="/logoweb.png"><title>Không thể đăng nhập</title><link rel="stylesheet" href="/oauth-consent.css"></head><body><main class="consent-shell"><section class="consent-card consent-card-error" role="alert"><div class="brand-lockup"><span class="brand-mark"><img src="/logoweb.png" alt="APIUYTIN logo"></span><span>APIUYTIN</span></div><h1>Không thể tiếp tục</h1><p class="error-message">${escapeHtml(message)}</p><a class="primary-button" href="/">Về trang chủ</a></section></main></body></html>`;
}
