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

const googleProviderIcon = `<svg class="provider-mark provider-mark-google" viewBox="0 0 24 24" aria-hidden="true">
  <path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z"></path>
  <path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z"></path>
  <path fill="#FBBC05" d="M6.54 13.58A5.85 5.85 0 0 1 6.23 12c0-.55.1-1.08.31-1.58V7.89H3.3A9.5 9.5 0 0 0 2.25 12c0 1.49.36 2.9 1.05 4.11l3.24-2.53Z"></path>
  <path fill="#EA4335" d="M12 6.39c1.43 0 2.72.49 3.73 1.45l2.79-2.79C16.84 3.46 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 8.11 9.46 6.39 12 6.39Z"></path>
</svg>`;

const githubProviderIcon = `<svg class="provider-mark provider-mark-github" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.56-3.9-1.56-.53-1.37-1.3-1.74-1.3-1.74-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.57-.29-5.27-1.29-5.27-5.73 0-1.27.45-2.3 1.2-3.11-.12-.3-.52-1.47.11-3.07 0 0 .98-.31 3.16 1.19A10.96 10.96 0 0 1 12 5.68c.99 0 1.98.13 2.91.38 2.18-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.77.11 3.07.75.81 1.2 1.84 1.2 3.11 0 4.45-2.71 5.43-5.29 5.72.42.36.78 1.08.78 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"></path></svg>`;

const apiuytinProviderIcon = '<img class="provider-mark provider-mark-apiuytin" src="/logoweb.png" alt="" aria-hidden="true">';

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
    : '<a class="primary-button provider-button" aria-label="Thêm tài khoản bằng Google" href="' + googleAddAccountLink + '">' + googleProviderIcon + '<span>Google</span></a>';
  const localLoginUrl = '/oauth/consent/local-login?transaction=' + encodeURIComponent(transaction);
  const addAccountLink = '<p class="add-account-row"><a class="secondary-button provider-button" aria-label="Thêm bằng Google" href="' + googleAddAccountLink + '">' + googleProviderIcon + '<span>Google</span></a><a class="secondary-button provider-button" aria-label="Thêm bằng GitHub" href="' + githubAddAccountLink + '">' + githubProviderIcon + '<span>GitHub</span></a><a class="secondary-button provider-button" aria-label="Đăng nhập bằng tài khoản APIUYTIN" href="' + localLoginUrl + '">' + apiuytinProviderIcon + '<span>APIUYTIN</span></a></p>';

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
<body class="oauth-consent-page">
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
<body class="oauth-local-login-page">
  <main class="consent-shell">
    <section class="consent-card oauth-local-login-card" role="dialog" aria-modal="true" aria-labelledby="local-login-title" aria-describedby="local-login-description">
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
