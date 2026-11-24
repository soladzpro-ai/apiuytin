const encoder = new TextEncoder();

export const WEB_CALLBACK = 'https://apiuytin.pages.dev/auth/google/callback';
export const PROJECT_CALLBACK = 'https://apiuytin.pages.dev/oauth/google/callback';
export const API_BASE = 'https://apiuytin.pages.dev/api/auth';
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 30;
export const TRANSACTION_MAX_AGE = 10 * 60;
export const CODE_MAX_AGE = 5 * 60;
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
  const googleFields = { providerSubjectHash, googleAccountId: profile.sub, name: normalized.name, displayName: normalized.displayName, picture: normalized.picture, googlePicture: normalized.picture, given_name: normalized.given_name, family_name: normalized.family_name, locale: normalized.locale, verified_email: normalized.verified_email, updatedAt: now };
  const create = { createIfNotExists: { _id: userId, _type: 'apiUser', provider: 'google', ...googleFields, email: normalized.email, nickname: '', createdAt: now } };
  const patch = existing && { patch: { id: userId, ifRevisionID: existing._rev, set: { ...googleFields, ...(!existing.email ? { email: normalized.email } : {}) }, setIfMissing: { nickname: '' } } };
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

export async function linkDeviceAccount(deviceHash, profile, env) {
  const now = new Date().toISOString();
  const id = `device-account-${(await hash(`${deviceHash}:${profile.id}`)).slice(0, 40)}`;
  await sanityMutate([
    { createIfNotExists: { _id: id, _type: 'apiDeviceAccount', deviceHash, userId: profile.id, username: profile.username || '', email: profile.email, name: profile.name, displayName: profile.displayName || profile.name, nickname: profile.nickname || '', picture: profile.picture, given_name: profile.given_name, family_name: profile.family_name, locale: profile.locale, verified_email: profile.verified_email, createdAt: now } },
    { patch: { id, set: { username: profile.username || '', email: profile.email, name: profile.name, displayName: profile.displayName || profile.name, nickname: profile.nickname || '', picture: profile.picture, given_name: profile.given_name, family_name: profile.family_name, locale: profile.locale, verified_email: profile.verified_email, lastSeenAt: now } } }
  ], env);
}

export async function listDeviceAccounts(deviceHash, env) {
  return sanityQuery('*[_type == "apiDeviceAccount" && deviceHash == $deviceHash] | order(displayName asc, name asc)', { deviceHash }, env);
}

export function profileFromStoredUser(user) {
  const picture = firstHttpsPicture(user.customPicture, user.picture, user.avatar, user.googlePicture);
  return {
    id: user.userId || user._id || '',
    sub: user.userId || user._id || '',
    email: user.email || '',
    name: user.displayName || user.name || user.email || '',
    displayName: user.displayName || user.name || user.email || '',
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

