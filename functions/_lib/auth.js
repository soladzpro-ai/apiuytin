const encoder = new TextEncoder();

export const WEB_CALLBACK = 'https://apiuytin.pages.dev/auth/google/callback';
export const PROJECT_CALLBACK = 'https://apiuytin.pages.dev/oauth/google/callback';
export const GITHUB_CALLBACK = 'https://apiuytin.pages.dev/api/auth/github/callback';
export const API_BASE = 'https://apiuytin.pages.dev/api/auth';
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 30;
export const TRANSACTION_MAX_AGE = 10 * 60;
export const CODE_MAX_AGE = 5 * 60;
export const PASSWORD_RESET_MAX_AGE = 15 * 60;
export const PASSWORD_RESET_RESEND_SECONDS = 60;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
// Cloudflare Workers currently supports PBKDF2 iteration counts up to 100000.
// Keep this at the runtime ceiling so local registration and production agree.
export const PASSWORD_HASH_ITERATIONS = 100000;
const PASSWORD_HASH_ALGORITHM = 'pbkdf2-sha256';
const PASSWORD_HASH_BITS = 256;
const PASSWORD_SALT_BYTES = 16;

export function requireSecret(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET chưa được cấu hình');
  return env.SESSION_SECRET;
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64url(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), character => character.charCodeAt(0));
}

async function digest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

async function verifyHmac(value, signature, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, decodeBase64url(signature), encoder.encode(value));
}

export async function hash(value) { return digest(value); }

async function derivePasswordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, PASSWORD_HASH_BITS));
}

export async function hashPassword(password) {
  if (typeof password !== 'string') throw new Error('Mật khẩu không hợp lệ');
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const derived = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  return `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_ITERATIONS}$${base64url(salt)}$${base64url(derived)}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [algorithm, iterationText, saltText, digestText] = encoded.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !Number.isInteger(iterations) || iterations < 100000 || iterations > 500000 || !saltText || !digestText) return false;
  try {
    const expected = decodeBase64url(digestText);
    const actual = await derivePasswordHash(password, decodeBase64url(saltText), iterations);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

async function encryptionKey(secret) {
  return crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret))), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), encoder.encode(value)));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return base64url(combined);
}

export async function decryptSecret(value, secret) {
  if (!value) return null;
  try {
    const combined = decodeBase64url(value);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, await encryptionKey(secret), combined.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function signedValue(value, secret) {
  return `${base64url(encoder.encode(value))}.${await hmac(value, secret)}`;
}

export async function readSignedValue(value, secret) {
  if (!value) return null;
  try {
    const separator = value.lastIndexOf('.');
    if (separator <= 0) return null;
    const encoded = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    if (!signature) return null;
    const raw = new TextDecoder().decode(decodeBase64url(encoded));
    if (!(await verifyHmac(raw, signature, secret))) return null;
    return raw;
  } catch {
    return null;
  }
}

export function cookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header || !name) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim() || null;
  }
  return null;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(), ...extra } });
}

export function cors() {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
}

export function redirect(location, headers = {}) {
  const responseHeaders = new Headers({ location });
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'set-cookie' && Array.isArray(value)) {
      for (const cookieValue of value) responseHeaders.append('Set-Cookie', cookieValue);
    } else {
      responseHeaders.set(name, value);
    }
  }
  return new Response(null, { status: 302, headers: responseHeaders });
}

export function randomSecret(prefix) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}${base64url(bytes)}`;
}

export function randomOtp() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 1_000_000).padStart(6, '0');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function passwordResetEmailHtml(otp, env) {
  const baseUrl = String(env.PUBLIC_BASE_URL || 'https://apiuytin.pages.dev').replace(/\/$/, '');
  const logoUrl = `${baseUrl}/logoweb.png`;
  const otpDigits = String(otp || '').split('').map(digit => `<span style="display:inline-block;min-width:38px;margin:0 3px;padding:10px 4px;border:1px solid #cfe2f2;border-radius:8px;background:#ffffff;color:#1e3b58;font-family:'Courier New',monospace;font-size:30px;font-weight:700;line-height:1.1;text-align:center;">${escapeHtml(digit)}</span>`).join('');
  return `<!doctype html>
<html lang="vi">
<head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mã OTP APIUYTIN</title></head>
<body style="margin:0;background:#eaf4ff;color:#1e3b58;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eaf4ff;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #cfe2f2;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 20px;text-align:center;">
          <img src="${logoUrl}" width="72" height="72" alt="APIUYTIN" style="display:block;width:72px;height:72px;margin:0 auto 16px;border:1px solid #cfe2f2;border-radius:50%;object-fit:cover;">
          <div style="font-size:12px;letter-spacing:.14em;font-weight:700;color:#4f91c5;text-transform:uppercase;">APIUYTIN</div>
          <h1 style="margin:12px 0 8px;font-size:26px;line-height:1.2;color:#1e3b58;">Mã xác minh đổi mật khẩu</h1>
          <p style="margin:0;color:#5f7b99;font-size:15px;line-height:1.6;">Bạn vừa yêu cầu đổi mật khẩu tài khoản APIUYTIN.</p>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;text-align:center;">
          <div style="margin:8px 0 18px;padding:18px 8px;border:1px solid #8fc7ee;border-radius:12px;background:#f5fbff;color:#1e3b58;white-space:nowrap;">${otpDigits}</div>
          <p style="margin:0 0 20px;color:#5f7b99;font-size:13px;line-height:1.6;">Mã có hiệu lực trong 15 phút và chỉ dùng một lần. Nếu không phải bạn, hãy bỏ qua email này.</p>
          <p style="margin:18px 0 0;color:#8da6bf;font-size:12px;line-height:1.5;">Nếu Gmail nhận diện được mã xác minh, Gmail sẽ tự hiển thị nút <strong>Sao chép mã</strong> ở phía trên email.</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fcff;color:#8da6bf;font-size:11px;line-height:1.5;text-align:center;">APIUYTIN · Hạ tầng danh tính an toàn</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(to, otp, env) {
  const endpoint = String(env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  let parsed;
  try {
    parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com') throw new Error('invalid mail endpoint');
  } catch {
    throw new Error('GOOGLE_APPS_SCRIPT_URL chưa được cấu hình');
  }
  const response = await fetch(parsed.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, subject: 'Mã OTP đổi mật khẩu APIUYTIN', text: `Mã xác minh APIUYTIN / Verification code: ${otp}\nMã có hiệu lực trong 15 phút và chỉ dùng một lần.`, html: passwordResetEmailHtml(otp, env), name: 'APIUYTIN' }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Gửi email OTP không thành công');
  const result = await response.json().catch(() => ({}));
  if (result?.success !== true) throw new Error('Google Apps Script không xác nhận gửi email');
  return true;
}

export async function createSession(payload, env, maxAge = 60 * 60 * 24 * 7) {
  const value = JSON.stringify({ ...payload, exp: Date.now() + maxAge * 1000 });
  return signedValue(value, requireSecret(env)).then(token => cookie('apiuytin_session', token, { maxAge }));
}

export async function session(request, env) {
  const signed = await readSignedValue(getCookie(request, 'apiuytin_session'), requireSecret(env));
  if (!signed) return null;
  try {
    const value = JSON.parse(signed);
    return value.exp > Date.now() ? value : null;
  } catch {
    return null;
  }
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

export function validUsername(value) {
  return typeof value === 'string' && /^[a-z0-9]{3,32}$/.test(value);
}

export async function normalizeStoredUsername(document, env) {
  const original = typeof document?.username === 'string' ? document.username : '';
  const lowered = original.trim().toLowerCase();
  if (original && lowered !== original && validUsername(lowered)) {
    try {
      await sanityMutate([{ patch: { id: document._id, ifRevisionID: document._rev, set: { username: lowered, updatedAt: new Date().toISOString() } } }], env);
      return { ...document, username: lowered };
    } catch {
      return document;
    }
  }
  return document;
}

export async function resolveApiUser(document, env, seen = new Set()) {
  if (!document || typeof document.mergedInto !== 'string' || !document.mergedInto || seen.has(document._id)) return document;
  const nextSeen = new Set(seen).add(document._id);
  const parent = await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: document.mergedInto }, env);
  return parent ? resolveApiUser(parent, env, nextSeen) : document;
}

export async function sessionWithCompleteEmail(request, env) {
  const user = await session(request, env);
  if (!user) return { response: json({ error: 'unauthorized' }, 401) };
  const account = await resolveApiUser(await normalizeStoredUsername(await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: user.userId }, env), env), env);
  if (!account) return { response: json({ error: 'account_not_found' }, 404) };
  if (!validEmail(normalizeEmail(account.email))) return { response: json({ error: 'email_required' }, 403) };
  if (account.username && !validUsername(account.username)) return { response: json({ error: 'username_required' }, 403) };
  return { user: { ...user, userId: account._id || user.userId }, account };
}

function sanityUrl(env, path) {
  return `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2023-05-03/${path}`;
}

async function delay(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchSanity(url, options, attempts = 1) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
      if (response.ok || response.status < 500 && response.status !== 429) return response;
      lastError = new Error(`Sanity request failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await delay(150 * (2 ** attempt) + Math.floor(Math.random() * 100));
  }
  throw lastError || new Error('Sanity request failed');
}

export async function sanityQuery(query, params, env, attempts = 3) {
  const search = new URLSearchParams({ query, ...Object.fromEntries(Object.entries(params || {}).map(([key, value]) => [`$${key}`, JSON.stringify(value)])) });
  const response = await fetchSanity(sanityUrl(env, `data/query/${env.SANITY_DATASET}?${search}`), { headers: { Authorization: `Bearer ${env.SANITY_API_TOKEN}` } }, attempts);
  if (!response.ok) throw new Error('Truy vấn Sanity không thành công');
  return (await response.json()).result;
}

export async function sanityMutate(mutations, env) {
  // Mutations are deliberately bounded but not retried here. Callers must make
  // retries explicit and idempotent (CAS, createIfNotExists, or deterministic
  // delete IDs) so an unknown network outcome cannot duplicate a write.
  const response = await fetchSanity(sanityUrl(env, `data/mutate/${env.SANITY_DATASET}?visibility=sync`), { method: 'POST', headers: { Authorization: `Bearer ${env.SANITY_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ mutations }) }, 1);
  if (!response.ok) throw new Error('Ghi dữ liệu Sanity không thành công');
  return response.json();
}

export async function sanityUploadImage(file, env) {
  const filename = String(file?.name || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'avatar';
  const response = await fetchSanity(sanityUrl(env, `assets/images/${encodeURIComponent(filename)}`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SANITY_API_TOKEN}`,
      'content-type': file.type
    },
    body: await file.arrayBuffer()
  }, 1);
  if (!response.ok) throw new Error('Tải avatar lên Sanity không thành công');
  const payload = await response.json();
  const document = payload.document || payload;
  const id = document?._id || document?.assetId || '';
  const url = String(document?.url || '');
  try {
    const parsed = new URL(url);
    if (!id || parsed.protocol !== 'https:' || parsed.hostname !== 'cdn.sanity.io') throw new Error('invalid asset URL');
  } catch {
    throw new Error('Sanity không trả về URL avatar hợp lệ');
  }
  return { id, url };
}

export async function sanityMutateBatched(mutations, env, chunkSize = 50, concurrency = 6) {
  const chunks = [];
  for (let index = 0; index < mutations.length; index += chunkSize) chunks.push(mutations.slice(index, index + chunkSize));
  const results = [];
  for (let index = 0; index < chunks.length; index += concurrency) {
    const batch = chunks.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map(chunk => sanityMutate(chunk, env))));
  }
  return results;
}

export async function googleToken(code, env, redirectUri) {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID || env.CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET || env.CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Đổi token Google không thành công');
  const result = await response.json();
  if (!result?.access_token) throw new Error('Google token exchange không trả về access token');
  return result;
}

export async function googleUser(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Không thể lấy userinfo Google');
  return response.json();
}

export function googleAuthorize(clientId, state, redirectUri) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', access_type: 'offline', prompt: 'select_account', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function githubConfig(env) {
  const clientId = String(env.GITHUB_CLIENT_ID || '').trim();
  const clientSecret = String(env.GITHUB_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('GitHub OAuth chưa được cấu hình');
  return { clientId, clientSecret };
}

export function githubAuthorize(clientId, state, redirectUri) {
  const params = new URLSearchParams({ client_id: String(clientId || ''), redirect_uri: redirectUri, scope: 'read:user user:email', state });
  return `https://github.com/login/oauth/authorize?${params}`;
}

function githubHeaders(accessToken) {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${accessToken}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'APIUYTIN-OAuth' };
}

export async function githubToken(code, env, redirectUri) {
  const { clientId, clientSecret } = githubConfig(env);
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Đổi token GitHub không thành công');
  const result = await response.json();
  if (!result?.access_token) throw new Error('GitHub token exchange không trả về access token');
  return result;
}

export async function githubUser(accessToken) {
  const profileResponse = await fetch('https://api.github.com/user', { headers: githubHeaders(accessToken), signal: AbortSignal.timeout(8000) });
  if (!profileResponse.ok) throw new Error('Không thể lấy userinfo GitHub');
  const profile = await profileResponse.json();
  const emailResponse = await fetch('https://api.github.com/user/emails', { headers: githubHeaders(accessToken), signal: AbortSignal.timeout(8000) });
  if (!emailResponse.ok) throw new Error('Không thể lấy email GitHub');
  const emails = await emailResponse.json();
  const selectedEmail = Array.isArray(emails)
    ? emails.find(item => item?.primary && item?.verified) || emails.find(item => item?.verified) || emails.find(item => item?.primary)
    : null;
  return { ...profile, email: selectedEmail?.verified === true ? selectedEmail.email : '', verified_email: selectedEmail?.verified === true };
}

export async function findProjectByPublishKey(publishKey, env) {
  return sanityQuery('*[_type == "apiProject" && publishKey == $publishKey][0]', { publishKey }, env);
}

export async function findProjectById(id, env) {
  return sanityQuery('*[_type == "apiProject" && _id == $id][0]', { id }, env);
}

export function validateRedirectUri(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.hash || url.username || url.password || url.href.length > 2048) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function firstHttpsPicture(...values) {
  for (const value of values) {
    try {
      const pictureUrl = new URL(String(value || ''));
      if (pictureUrl.protocol === 'https:') return pictureUrl.toString();
    } catch {
      // Try the next stored source so an invalid custom value cannot hide Google fallback.
    }
  }
  return '';
}

export function profileFromGoogle(profile, userId) {
  const picture = firstHttpsPicture(profile.picture);
  return {
    id: userId,
    sub: userId,
    email: profile.email || '',
    name: profile.name || profile.email || '',
    displayName: profile.name || profile.email || '',
    nickname: '',
    picture,
    given_name: profile.given_name || '',
    family_name: profile.family_name || '',
    locale: profile.locale || '',
    verified_email: profile.verified_email === true || profile.email_verified === true
  };
}

export function profileFromGithub(profile, userId) {
  const picture = firstHttpsPicture(profile.avatar_url, profile.picture);
  const nameParts = String(profile.name || profile.login || profile.email || '').trim().split(/\s+/).filter(Boolean);
  return {
    id: userId,
    sub: userId,
    email: profile.email || '',
    name: profile.name || profile.login || profile.email || '',
    displayName: profile.name || profile.login || profile.email || '',
    nickname: '',
    picture,
    given_name: profile.given_name || nameParts[0] || '',
    family_name: profile.family_name || nameParts.slice(1).join(' '),
    locale: profile.locale || '',
    verified_email: profile.verified_email === true
  };
}

export async function upsertApiUser(profile, env) {
  if (!profile?.sub) throw new Error('Hồ sơ Google không có subject ổn định');
  const providerSubjectHash = await hash(`google:${profile.sub}`);
  const googleUserId = `user-${providerSubjectHash.slice(0, 32)}`;
  const normalizedEmail = normalizeEmail(profile.email);
  const [googleMatch, emailMatch] = await Promise.all([
    sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: googleUserId }, env),
    normalizedEmail ? sanityQuery('*[_type == "apiUser" && lower(email) == $email][0]', { email: normalizedEmail }, env) : Promise.resolve(null)
  ]);
  const [byGoogleId, byEmail] = await Promise.all([
    resolveApiUser(googleMatch, env),
    resolveApiUser(emailMatch, env)
  ]);
  if (byGoogleId && byEmail && byGoogleId._id !== byEmail._id) throw new Error('Google email đã liên kết với hai tài khoản APIUYTIN khác nhau');
  const existing = byGoogleId || byEmail;
  const userId = existing?._id || googleUserId;
  const normalized = profileFromGoogle({ ...profile, email: normalizedEmail }, userId);
  const now = new Date().toISOString();
  const googleFields = {
    providerSubjectHash,
    googleAccountId: profile.sub,
    googleEmail: normalized.email,
    googleName: normalized.name,
    googleDisplayName: normalized.displayName,
    googlePicture: normalized.picture,
    googleGivenName: normalized.given_name,
    googleFamilyName: normalized.family_name,
    googleLocale: normalized.locale,
    googleVerifiedEmail: normalized.verified_email,
    name: normalized.name,
    displayName: normalized.displayName,
    picture: normalized.picture,
    given_name: normalized.given_name,
    family_name: normalized.family_name,
    locale: normalized.locale,
    verified_email: normalized.verified_email,
    updatedAt: now
  };
  const create = { createIfNotExists: { _id: userId, _type: 'apiUser', provider: 'google', ...googleFields, email: normalized.email, nickname: '', displayNameSource: 'google', pictureSource: 'google', createdAt: now } };
  const patch = existing && { patch: { id: userId, ifRevisionID: existing._rev, set: { ...googleFields, ...(!existing.email ? { email: normalized.email } : {}) }, setIfMissing: { nickname: '', displayNameSource: 'google', pictureSource: existing.customPicture ? 'apiuytin' : 'google' } } };
  try {
    await sanityMutate([...(existing ? [] : [create]), ...(patch ? [patch] : [])], env);
  } catch (error) {
    // A concurrent first login can win the deterministic create or CAS patch.
    // Re-read before failing so the API identity and email remain immutable.
    const current = await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: userId }, env, 1);
    if (!current) throw error;
    return profileFromStoredUser({ ...current, userId });
  }
  const current = await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: userId }, env, 3);
  if (!current) throw new Error('Không thể xác nhận hồ sơ APIUYTIN sau khi ghi');
  return profileFromStoredUser({ ...current, userId });
}

export async function upsertGithubUser(profile, env) {
  if (!profile?.id) throw new Error('Hồ sơ GitHub không có ID ổn định');
  const githubSubjectHash = await hash(`github:${profile.id}`);
  const githubUserId = `user-github-${githubSubjectHash.slice(0, 32)}`;
  const normalizedEmail = normalizeEmail(profile.email);
  const [githubMatch, emailMatch] = await Promise.all([
    sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: githubUserId }, env),
    normalizedEmail ? sanityQuery('*[_type == "apiUser" && lower(email) == $email][0]', { email: normalizedEmail }, env) : Promise.resolve(null)
  ]);
  const [byGithubId, byEmail] = await Promise.all([
    resolveApiUser(githubMatch, env),
    resolveApiUser(emailMatch, env)
  ]);
  if (byGithubId && byEmail && byGithubId._id !== byEmail._id) throw new Error('GitHub email đã liên kết với hai tài khoản APIUYTIN khác nhau');
  const existing = byGithubId || byEmail;
  const userId = existing?._id || githubUserId;
  const normalized = profileFromGithub({ ...profile, email: normalizedEmail }, userId);
  const now = new Date().toISOString();
  const googleIsReference = Boolean(existing?.googleAccountId);
  const googleReference = googleIsReference ? {
    name: existing.googleName || existing.name || normalized.name,
    displayName: existing.googleDisplayName || existing.googleName || existing.name || existing.displayName || normalized.displayName,
    picture: existing.googlePicture || existing.picture || normalized.picture,
    given_name: existing.googleGivenName ?? existing.given_name ?? normalized.given_name,
    family_name: existing.googleFamilyName ?? existing.family_name ?? normalized.family_name,
    locale: existing.googleLocale ?? existing.locale ?? normalized.locale,
    verified_email: existing.googleVerifiedEmail ?? existing.verified_email ?? normalized.verified_email
  } : normalized;
  const githubFields = {
    githubSubjectHash,
    githubAccountId: String(profile.id),
    githubEmail: normalized.email,
    githubName: normalized.name,
    githubDisplayName: normalized.displayName,
    githubPicture: normalized.picture,
    githubGivenName: normalized.given_name,
    githubFamilyName: normalized.family_name,
    githubLocale: normalized.locale,
    githubVerifiedEmail: normalized.verified_email,
    name: googleReference.name,
    displayName: googleReference.displayName,
    picture: googleReference.picture,
    given_name: googleReference.given_name,
    family_name: googleReference.family_name,
    locale: googleReference.locale,
    verified_email: googleReference.verified_email,
    profileSource: googleIsReference ? 'google' : 'github',
    updatedAt: now
  };
  const create = { createIfNotExists: { _id: userId, _type: 'apiUser', provider: 'github', ...githubFields, email: normalized.email, nickname: '', displayNameSource: googleIsReference ? 'google' : 'github', pictureSource: googleIsReference && !existing.customPicture ? 'google' : (existing?.customPicture ? 'apiuytin' : 'github'), createdAt: now } };
  const patch = existing && { patch: { id: userId, ifRevisionID: existing._rev, set: { ...githubFields, ...(!existing.email ? { email: normalized.email } : {}) }, setIfMissing: { nickname: '', displayNameSource: googleIsReference ? 'google' : 'github', pictureSource: googleIsReference && !existing.customPicture ? 'google' : (existing.customPicture ? 'apiuytin' : 'github') } } };
  try {
    await sanityMutate([...(existing ? [] : [create]), ...(patch ? [patch] : [])], env);
  } catch (error) {
    const current = await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: userId }, env, 1);
    if (!current) throw error;
    return profileFromStoredUser({ ...current, userId });
  }
  const current = await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: userId }, env, 3);
  if (!current) throw new Error('Không thể xác nhận hồ sơ APIUYTIN sau khi ghi');
  return profileFromStoredUser({ ...current, userId });
}

export async function ensureDevice(request, env) {
  const active = await getActiveDevice(request, env);
  if (active) return { token: active.token, deviceHash: active.deviceHash, setCookie: null };

  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  if (!state) throw new Error('device_bootstrap_state_required');
  const userAgent = request.headers.get('user-agent') || '';
  const bootstrapHash = state ? await hash(`device-bootstrap:${state}:${userAgent}`) : null;
  const token = randomSecret('dv_');
  const deviceHash = await hash(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_MAX_AGE * 1000).toISOString();
  const deviceId = `device-${bootstrapHash || deviceHash}`;
  const existing = await sanityQuery('*[_type == "apiDevice" && _id == $id][0]', { id: deviceId }, env, 1);
  if (existing && bootstrapHash && Date.parse(existing.expiresAt) > Date.now()) {
    return { token: null, deviceHash: existing.deviceHash, setCookie: null };
  }
  const tokenHash = await hash(token);
  try {
    await sanityMutate(existing
      ? [{ patch: { id: deviceId, ifRevisionID: existing._rev, set: { deviceHash, deviceTokenHash: tokenHash, lastSeenAt: now.toISOString(), expiresAt, bootstrapHash } } }]
      : [{ createIfNotExists: { _id: deviceId, _type: 'apiDevice', deviceHash, deviceTokenHash: tokenHash, bootstrapHash, createdAt: now.toISOString(), lastSeenAt: now.toISOString(), expiresAt } }], env);
  } catch (error) {
    const current = await sanityQuery('*[_type == "apiDevice" && _id == $id][0]', { id: deviceId }, env, 1);
    if (!current) throw error;
    return { token: current.deviceTokenHash === tokenHash ? token : null, deviceHash: current.deviceHash, setCookie: current.deviceTokenHash === tokenHash ? cookie('apiuytin_device', token, { maxAge: DEVICE_MAX_AGE }) : null };
  }
  const current = bootstrapHash ? await sanityQuery('*[_type == "apiDevice" && _id == $id][0]', { id: deviceId }, env, 3) : null;
  if (bootstrapHash && !current) throw new Error('Không thể xác nhận phiên thiết bị sau khi ghi');
  const won = current.deviceTokenHash === tokenHash;
  return { token: won ? token : null, deviceHash: current?.deviceHash || deviceHash, setCookie: won ? cookie('apiuytin_device', token, { maxAge: DEVICE_MAX_AGE }) : null };
}

export async function getActiveDevice(request, env) {
  const token = getCookie(request, 'apiuytin_device');
  if (!token) return null;
  const deviceHash = await hash(token);
  const record = await sanityQuery('*[_type == "apiDevice" && deviceHash == $deviceHash && expiresAt > $now][0]', { deviceHash, now: new Date().toISOString() }, env);
  return record ? { token, deviceHash, record } : null;
}

export async function linkDeviceAccount(deviceHash, profile, env, identity = {}) {
  const now = new Date().toISOString();
  const id = `device-account-${(await hash(`${deviceHash}:${profile.id}`)).slice(0, 40)}`;
  const identityFields = {
    ...(identity.provider ? { provider: identity.provider } : {}),
    ...(identity.googleAccountId ? { googleAccountId: String(identity.googleAccountId) } : {}),
    ...(identity.githubAccountId ? { githubAccountId: String(identity.githubAccountId) } : {})
  };
  await sanityMutate([
    { createIfNotExists: { _id: id, _type: 'apiDeviceAccount', deviceHash, userId: profile.id, username: profile.username || '', email: profile.email, name: profile.name, displayName: profile.displayName || profile.name, nickname: profile.nickname || '', picture: profile.picture, given_name: profile.given_name, family_name: profile.family_name, locale: profile.locale, verified_email: profile.verified_email, ...identityFields, createdAt: now } },
    { patch: { id, set: { username: profile.username || '', email: profile.email, name: profile.name, displayName: profile.displayName || profile.name, nickname: profile.nickname || '', picture: profile.picture, given_name: profile.given_name, family_name: profile.family_name, locale: profile.locale, verified_email: profile.verified_email, ...identityFields, lastSeenAt: now } } }
  ], env);
}

export async function listDeviceAccounts(deviceHash, env) {
  return sanityQuery('*[_type == "apiDeviceAccount" && deviceHash == $deviceHash] | order(displayName asc, name asc)', { deviceHash }, env);
}

const PROFILE_NAME_SOURCES = new Set(['apiuytin', 'google', 'github']);
const PROFILE_PICTURE_SOURCES = new Set(['apiuytin', 'google', 'github']);

function sourceOrFallback(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

export function profileSourceOptions(user = {}) {
  const apiuytinName = user.apiuytinDisplayName || user.displayName || user.name || user.email || '';
  const googleName = user.googleDisplayName || user.googleName || (user.googleAccountId ? user.name || user.displayName || '' : '');
  const githubName = user.githubDisplayName || user.githubName || (user.githubAccountId && !user.googleAccountId ? user.displayName || user.name || '' : '');
  const apiuytinPicture = firstHttpsPicture(user.apiuytinPicture, user.customPicture);
  const googlePicture = firstHttpsPicture(user.googlePicture);
  const githubPicture = firstHttpsPicture(user.githubPicture);
  const nameFallback = PROFILE_NAME_SOURCES.has(user.displayNameSource) ? user.displayNameSource : 'apiuytin';
  const pictureFallback = apiuytinPicture ? 'apiuytin' : (googlePicture ? 'google' : (githubPicture ? 'github' : 'apiuytin'));
  return {
    name: {
      selected: sourceOrFallback(user.displayNameSource, PROFILE_NAME_SOURCES, nameFallback),
      options: { apiuytin: apiuytinName, google: googleName, github: githubName }
    },
    picture: {
      selected: sourceOrFallback(user.pictureSource, PROFILE_PICTURE_SOURCES, pictureFallback),
      options: { apiuytin: apiuytinPicture, google: googlePicture, github: githubPicture }
    }
  };
}

export function profileFromStoredUser(user) {
  const sources = profileSourceOptions(user);
  const names = sources.name.options;
  const pictures = sources.picture.options;
  const displayName = names[sources.name.selected] || names.apiuytin || names.google || names.github || user.email || '';
  const picture = firstHttpsPicture(pictures[sources.picture.selected], pictures.apiuytin, pictures.google, pictures.github);
  return {
    id: user.userId || user._id || '',
    sub: user.userId || user._id || '',
    email: user.email || '',
    name: displayName,
    displayName,
    nickname: user.nickname || '',
    picture,
    given_name: user.given_name || '',
    family_name: user.family_name || '',
    locale: user.locale || '',
    verified_email: user.verified_email === true
  };
}

export async function publicProject(project, _env, includeApiKey = false) {
  const result = { id: project._id, name: project.name, clientId: project.publishKey, redirectUri: project.redirectUri, createdAt: project.createdAt, status: project.status || 'active' };
  if (includeApiKey && project.apiKey) result.apiKey = project.apiKey;
  return result;
}

export function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

