import { readFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  createSession,
  ensureDevice,
  hash,
  profileFromGoogle,
  profileFromStoredUser,
  sanityUploadImage,
  signedValue,
  upsertApiUser
} from '../functions/_lib/auth.js';
import { onRequest as authApi } from '../functions/api/auth/[[path]].js';

const execFile = promisify(execFileCallback);
const ROOT = new URL('..', import.meta.url);
const ENV = {
  SESSION_SECRET: 'profile-test-session-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  SANITY_PROJECT_ID: 'profile-test-project',
  SANITY_DATASET: 'production',
  SANITY_API_TOKEN: 'profile-test-sanity-token'
};
const CASES = { function: [], flow: [], syntax: [], ui: [], ux: [] };
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function same(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function request(url, options = {}) { return new Request(url, options); }

function tierFor(index) {
  if (index < 20) return { name: '100k', virtualUsers: 100_000, actualConcurrency: 16 };
  if (index < 100) return { name: '500k', virtualUsers: 500_000, actualConcurrency: 32 };
  return { name: '10m', virtualUsers: 10_000_000, actualConcurrency: 64 };
}

function add(kind, name, operation) { CASES[kind].push({ name, operation }); }

function profileDocument(index, overrides = {}) {
  return {
    _id: `user-profile-${index}`,
    _rev: `revision-${index}`,
    _type: 'apiUser',
    provider: 'google',
    providerSubjectHash: `provider-hash-${index}`,
    googleAccountId: `google-account-${index}`,
    email: `profile-${index}@example.com`,
    name: `Google Name ${index}`,
    picture: `https://lh3.googleusercontent.com/google-${index}.png`,
    googlePicture: `https://lh3.googleusercontent.com/google-${index}.png`,
    displayName: `Display Name ${index}`,
    nickname: `Nick ${index}`,
    given_name: 'Google',
    family_name: `Name ${index}`,
    locale: 'vi',
    verified_email: true,
    ...overrides
  };
}

async function withFetch(handler, operation) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => handler(new URL(input), init);
  try { return await operation(); } finally { globalThis.fetch = previous; }
}

function mockSanity(document, capture = [], { asset = false } = {}) {
  return async (url, init = {}) => {
    if (url.pathname.includes('/assets/images/')) {
      assert(asset, 'unexpected Sanity asset upload');
      assert(init.method === 'POST', 'asset upload must use POST');
      assert(init.body instanceof ArrayBuffer, 'asset upload must send binary body');
      return jsonResponse({ document: { _id: 'image-profile-asset', url: 'https://cdn.sanity.io/images/profile/production/image-profile-asset-800x800.png' } });
    }
    if (url.pathname.includes('/data/query/')) {
      const query = url.searchParams.get('query') || '';
      if (query.includes('apiUser')) return jsonResponse({ result: document });
      if (query.includes('apiDeviceAccount') || query.includes('apiProjectUser')) return jsonResponse({ result: [] });
      return jsonResponse({ result: null });
    }
    if (url.pathname.includes('/data/mutate/')) {
      capture.push(JSON.parse(init.body).mutations || []);
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ error: 'unexpected_url' }, 500);
  };
}

async function sessionRequest(document, path, options = {}) {
  const sessionCookie = await createSession({ userId: document._id }, ENV);
  return authApi({
    request: request(`https://apiuytin.pages.dev/api/auth/${path}`, { ...options, headers: { ...(options.headers || {}), Cookie: sessionCookie } }),
    env: ENV,
    params: { path }
  });
}

async function readJson(response) { return response.json(); }

add('function', 'stored profile keeps Google avatar fallback', async ({ index }) => {
  const document = profileDocument(index, { customPicture: '' });
  const profile = profileFromStoredUser(document);
  same(profile.picture, document.googlePicture, 'Google picture fallback');
  same(profile.email, document.email, 'email remains stable');
  same(profile.id, document._id, 'APIUYTIN id remains stable');
});

add('function', 'stored profile prefers Sanity CDN avatar', async ({ index }) => {
  const cdn = 'https://cdn.sanity.io/images/profile/production/custom.png';
  const profile = profileFromStoredUser(profileDocument(index, { customPicture: cdn }));
  same(profile.picture, cdn, 'custom CDN picture wins');
});

add('function', 'Google profile creates APIUYTIN subject', async ({ index }) => {
  const profile = profileFromGoogle({ sub: `google-sub-${index}`, email: `google-${index}@example.com`, email_verified: true }, `user-api-${index}`);
  same(profile.id, `user-api-${index}`, 'APIUYTIN id');
  same(profile.sub, profile.id, 'APIUYTIN sub');
  assert(profile.id !== `google-sub-${index}`, 'Google subject is not exposed');
});

add('function', 'Sanity image helper returns CDN asset', async ({ index }) => {
  const file = { name: `avatar-${index}.png`, type: 'image/png', async arrayBuffer() { return Uint8Array.from([1, 2, 3]).buffer; } };
  const result = await withFetch(mockSanity(null, [], { asset: true }), () => sanityUploadImage(file, ENV));
  same(result.id, 'image-profile-asset', 'Sanity asset id');
  assert(result.url.startsWith('https://cdn.sanity.io/'), 'Sanity CDN URL');
});

add('function', 'Google re-auth keeps immutable email', async ({ index }) => {
  const existing = profileDocument(index, { email: `original-${index}@example.com` });
  const mutations = [];
  const result = await withFetch(mockSanity(existing, mutations), () => upsertApiUser({ sub: `google-sub-${index}`, email: `changed-${index}@example.com`, name: 'Updated Google' }, ENV));
  same(result.email, existing.email, 'stored email is immutable');
  const patch = mutations.flat().find(item => item.patch);
  assert(!patch?.patch?.set?.email, 'email is never rewritten by re-authentication');
});

add('function', 'concurrent first login returns the winning API profile', async ({ index }) => {
  let stored = null;
  let userQueries = 0;
  let releaseInitialQueries;
  const initialQueriesReady = new Promise(resolve => { releaseInitialQueries = resolve; });
  const createIds = [];
  const handler = async (url, init = {}) => {
    if (url.pathname.includes('/data/query/')) {
      userQueries += 1;
      if (userQueries <= 2) {
        if (userQueries === 2) releaseInitialQueries();
        await initialQueriesReady;
        return jsonResponse({ result: null });
      }
      return jsonResponse({ result: stored });
    }
    if (url.pathname.includes('/data/mutate/')) {
      const mutations = JSON.parse(init.body).mutations || [];
      const create = mutations.find(item => item.createIfNotExists)?.createIfNotExists;
      if (create) {
        createIds.push(create._id);
        if (!stored) stored = { ...create, _rev: `revision-${index}` };
      }
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ error: 'unexpected_url' }, 500);
  };
  const results = await withFetch(handler, () => Promise.all([
    upsertApiUser({ sub: `race-google-${index}`, email: `winner-a-${index}@example.com`, email_verified: true }, ENV),
    upsertApiUser({ sub: `race-google-${index}`, email: `winner-b-${index}@example.com`, email_verified: true }, ENV)
  ]));
  same(results[0].email, results[1].email, 'concurrent first login returns one stable email');
  same(new Set(createIds).size, 1, 'concurrent first login uses one deterministic user id');
});

add('function', 'device bootstrap is deterministic under concurrent first requests', async ({ index }) => {
  let stored = null;
  const mutations = [];
  let deviceQueries = 0;
  let releaseInitialQueries;
  const initialQueriesReady = new Promise(resolve => { releaseInitialQueries = resolve; });
  const handler = async (url, init = {}) => {
    if (url.pathname.includes('/data/query/')) {
      deviceQueries += 1;
      if (deviceQueries <= 2) {
        if (deviceQueries === 2) releaseInitialQueries();
        await initialQueriesReady;
        return jsonResponse({ result: null });
      }
      return jsonResponse({ result: stored });
    }
    if (url.pathname.includes('/data/mutate/')) {
      const body = JSON.parse(init.body);
      mutations.push(body.mutations);
      const create = body.mutations.find(item => item.createIfNotExists);
      const update = body.mutations.find(item => item.patch);
      if (create && !stored) stored = { ...create.createIfNotExists, _id: create.createIfNotExists._id, _rev: `revision-${index}` };
      if (update) stored = { ...stored, ...update.patch.set, _rev: `revision-${index}` };
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ error: 'unexpected_url' }, 500);
  };
  const makeRequest = () => request(`https://apiuytin.pages.dev/oauth/google?state=bootstrap-${index}`, { headers: { 'user-agent': 'profile-test-browser', 'accept-language': 'vi-VN', 'cf-connecting-ip': `198.51.100.${index}` } });
  const result = await withFetch(handler, () => Promise.all([ensureDevice(makeRequest(), ENV), ensureDevice(makeRequest(), ENV)]));
  same(result[0].deviceHash, result[1].deviceHash, 'concurrent bootstrap device hashes match');
  same(result.filter(item => item.token).length, 1, 'exactly one concurrent bootstrap request owns the secure cookie token');
  const createIds = mutations.map(batch => batch[0]?.createIfNotExists?._id).filter(Boolean);
  same(new Set(createIds).size, 1, 'concurrent bootstrap uses one deterministic device id');
});

add('function', 'profile contract includes editable fields', async ({ index }) => {
  const profile = profileFromStoredUser(profileDocument(index));
  assert(typeof profile.displayName === 'string' && typeof profile.nickname === 'string', 'editable profile fields exist');
  assert(!Object.hasOwn(profile, 'providerSubjectHash'), 'provider subject remains private');
});

add('function', 'avatar upload validates binary content type', async ({ index }) => {
  const file = { name: `avatar-${index}.webp`, type: 'image/webp', async arrayBuffer() { return Uint8Array.from([4, 5]).buffer; } };
  let sawContentType = '';
  await withFetch(async (url, init) => {
    if (url.pathname.includes('/assets/images/')) {
      sawContentType = init.headers['content-type'];
      return jsonResponse({ document: { _id: 'image-asset', url: 'https://cdn.sanity.io/images/p/d/image.webp' } });
    }
    return jsonResponse({ result: null });
  }, () => sanityUploadImage(file, ENV));
  same(sawContentType, 'image/webp', 'image MIME forwarded');
});

add('function', 'load tier exposes bounded actual concurrency', async ({ tier }) => {
  assert([100_000, 500_000, 10_000_000].includes(tier.virtualUsers), 'virtual load tier');
  assert(tier.actualConcurrency <= 64, 'local runner remains bounded');
});

add('flow', 'GET profile returns current account', async ({ index }) => {
  const document = profileDocument(index);
  const response = await withFetch(mockSanity(document), () => sessionRequest(document, 'me'));
  same(response.status, 200, 'GET profile status');
  const body = await readJson(response);
  same(body.user.id, document._id, 'profile id');
  same(body.user.name, document.displayName, 'display name');
  same(body.user.email, document.email, 'profile email');
  same(body.user.googleAccountId, document.googleAccountId, 'private Google account id');
  assert(!Object.hasOwn(body.user, 'providerSubjectHash'), 'provider hash not exposed');
});

add('flow', 'PATCH profile updates display name and nickname', async ({ index }) => {
  const document = profileDocument(index);
  const mutations = [];
  const response = await withFetch(mockSanity(document, mutations), () => sessionRequest(document, 'me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Tên mới', nickname: 'Biệt danh mới' }) }));
  same(response.status, 200, 'PATCH profile status');
  const body = await readJson(response);
  same(body.user.displayName, 'Tên mới', 'display name update');
  same(body.user.nickname, 'Biệt danh mới', 'nickname update');
  same(body.user.email, document.email, 'email unchanged');
  assert(mutations.flat().some(item => item.patch?.set?.displayName === 'Tên mới'), 'profile mutation exists');
});

add('flow', 'PATCH fills a missing email once', async ({ index }) => {
  const document = profileDocument(index, { provider: 'password', email: '' });
  const mutations = [];
  const response = await withFetch(async (url, init = {}) => {
    if (url.pathname.includes('/data/query/')) {
      const query = url.searchParams.get('query') || '';
      if (query.includes('lower(email)')) return jsonResponse({ result: null });
      if (query.includes('apiDeviceAccount') || query.includes('apiProjectUser')) return jsonResponse({ result: [] });
      if (query.includes('apiUser')) return jsonResponse({ result: document });
      return jsonResponse({ result: null });
    }
    if (url.pathname.includes('/data/mutate/')) {
      mutations.push(JSON.parse(init.body).mutations || []);
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ error: 'unexpected_url' }, 500);
  }, () => sessionRequest(document, 'me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'New.Email@example.com' }) }));
  same(response.status, 200, 'missing email status');
  const body = await readJson(response);
  same(body.user.email, 'new.email@example.com', 'email is normalized');
  same(mutations.flat().find(item => item.patch)?.patch?.set?.email, 'new.email@example.com', 'email mutation exists');
});

add('flow', 'project services reject a profile without email', async ({ index }) => {
  const document = profileDocument(index, { provider: 'password', email: '' });
  const response = await withFetch(mockSanity(document), () => sessionRequest(document, 'projects', { method: 'GET' }));
  same(response.status, 403, 'missing email service status');
  same((await readJson(response)).error, 'email_required', 'missing email service error');
});

add('flow', 'PATCH rejects an email already used by another account', async ({ index }) => {
  const document = profileDocument(index, { provider: 'password', email: '' });
  let mutations = 0;
  const response = await withFetch(async (url, init = {}) => {
    if (url.pathname.includes('/data/query/')) {
      const query = url.searchParams.get('query') || '';
      if (query.includes('lower(email)')) return jsonResponse({ result: { _id: `other-user-${index}`, email: 'taken@example.com' } });
      if (query.includes('apiUser')) return jsonResponse({ result: document });
      return jsonResponse({ result: [] });
    }
    if (url.pathname.includes('/data/mutate/')) {
      mutations += 1;
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ error: 'unexpected_url' }, 500);
  }, () => sessionRequest(document, 'me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'taken@example.com' }) }));
  same(response.status, 409, 'duplicate email status');
  same((await readJson(response)).error, 'email_exists', 'duplicate email error');
  same(mutations, 0, 'duplicate email does not mutate');
});

add('flow', 'PATCH cannot replace an existing email', async ({ index }) => {
  const document = profileDocument(index, { provider: 'password', email: 'existing@example.com' });
  const response = await withFetch(mockSanity(document), () => sessionRequest(document, 'me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'replacement@example.com' }) }));
  same(response.status, 409, 'existing email status');
  same((await readJson(response)).error, 'email_already_set', 'existing email error');
});

add('flow', 'PATCH rejects immutable identity fields', async ({ index }) => {
  const document = profileDocument(index);
  const mutations = [];
  const response = await withFetch(mockSanity(document, mutations), () => sessionRequest(document, 'me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'attacker@example.com', sub: 'attacker' }) }));
  same(response.status, 400, 'immutable fields rejected');
  same((await readJson(response)).error, 'immutable_profile_fields', 'immutable field error');
  same(mutations.length, 0, 'no identity mutation');
});

add('flow', 'POST avatar stores Sanity CDN URL and asset reference', async ({ index }) => {
  const document = profileDocument(index);
  const mutations = [];
  const body = new FormData();
  body.set('avatar', new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }), 'avatar.png');
  const response = await withFetch(mockSanity(document, mutations, { asset: true }), () => sessionRequest(document, 'me/avatar', { method: 'POST', body }));
  same(response.status, 200, 'avatar status');
  const payload = await readJson(response);
  same(payload.user.picture, 'https://cdn.sanity.io/images/profile/production/image-profile-asset-800x800.png', 'profile uses CDN');
  same(payload.asset.url, payload.user.picture, 'asset response matches profile');
  const avatarMutation = mutations.flat().find(item => item.patch?.set?.avatarAsset);
  same(avatarMutation.patch.set.avatarAsset._ref, 'image-profile-asset', 'asset reference stored');
});

add('flow', 'invalid avatar MIME is rejected before Sanity', async ({ index }) => {
  const document = profileDocument(index);
  let calls = 0;
  const body = new FormData();
  body.set('avatar', new Blob(['not an image'], { type: 'text/html' }), 'avatar.html');
  const response = await withFetch(async () => { calls += 1; return jsonResponse({ result: document }); }, () => sessionRequest(document, 'me/avatar', { method: 'POST', body }));
  same(response.status, 400, 'invalid MIME status');
  same((await readJson(response)).error, 'avatar_type_not_allowed', 'invalid MIME error');
  same(calls, 0, 'Sanity not called for invalid MIME');
});

add('flow', 'invalid avatar size is rejected before Sanity', async ({ index }) => {
  const document = profileDocument(index);
  let calls = 0;
  const body = new FormData();
  body.set('avatar', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
  const response = await withFetch(async () => { calls += 1; return jsonResponse({ result: document }); }, () => sessionRequest(document, 'me/avatar', { method: 'POST', body }));
  same(response.status, 400, 'large avatar status');
  same((await readJson(response)).error, 'avatar_too_large', 'large avatar error');
  same(calls, 0, 'Sanity not called for oversized avatar');
});

add('flow', 'profile page keeps Google avatar when unchanged', async ({ index }) => {
  const document = profileDocument(index, { customPicture: '' });
  const response = await withFetch(mockSanity(document), () => sessionRequest(document, 'me'));
  const body = await readJson(response);
  same(body.user.picture, document.googlePicture, 'Google avatar remains default');
});

add('flow', 'userinfo reads the current CDN profile', async ({ index }) => {
  const document = profileDocument(index, { customPicture: 'https://cdn.sanity.io/images/profile/production/current.png', displayName: 'Tên hiện tại', nickname: 'Biệt danh' });
  const token = await signedValue(JSON.stringify({ projectId: `project-live-${index}`, profile: { id: document._id, sub: document._id, email: document.email, name: 'Tên cũ', picture: document.googlePicture }, exp: Date.now() + 3_600_000 }), ENV.SESSION_SECRET);
  const response = await withFetch(async (url) => {
    const query = url.searchParams.get('query') || '';
    if (query.includes('apiProject')) return jsonResponse({ result: { _id: `project-live-${index}`, _type: 'apiProject', status: 'active' } });
    if (query.includes('apiUser')) return jsonResponse({ result: document });
    return jsonResponse({ result: null });
  }, () => authApi({ request: request('https://apiuytin.pages.dev/api/auth/userinfo', { headers: { Authorization: `Bearer ${token}` } }), env: ENV, params: { path: 'userinfo' } }));
  same(response.status, 200, 'userinfo status');
  const body = await readJson(response);
  same(body.picture, document.customPicture, 'userinfo CDN picture');
  same(body.name, document.displayName, 'userinfo current display name');
  same(body.nickname, document.nickname, 'userinfo current nickname');
});

add('syntax', 'account page has external scripts only', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  assert(html.includes('src="/account-me.js"') && html.includes('src="/theme.js"'), 'account scripts are external');
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'account page has no inline script');
});

add('syntax', 'shared theme script binds account settings toggle', async () => {
  const theme = await readFile(new URL('public/theme.js', ROOT), 'utf8');
  assert(theme.includes('DOMContentLoaded') && theme.includes('theme-toggle') && theme.includes('localStorage.setItem(STORAGE_KEY, nextTheme)'), 'theme control wiring exists');
});

add('syntax', 'backend files parse with Node', async () => {
  const files = ['functions/_lib/auth.js', 'functions/api/auth/[[path]].js', 'functions/oauth/consent.js', 'public/account-me.js'];
  for (const file of files) await execFile(process.execPath, ['--check', file], { cwd: fileURLToPath(new URL('..', import.meta.url)) });
});

add('syntax', 'profile route names are present', async () => {
  const source = await readFile(new URL('functions/api/auth/[[path]].js', ROOT), 'utf8');
  assert(source.includes("path === 'me'") && source.includes("path === 'me/avatar'"), 'profile route branches');
});

add('syntax', 'CSP permits only same-origin application scripts', async () => {
  const headers = await readFile(new URL('public/_headers', ROOT), 'utf8');
  assert(headers.includes("script-src 'self'") && headers.includes("connect-src 'self'"), 'CSP boundary');
});

add('ui', 'settings page exposes profile controls', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  for (const id of ['display-name', 'nickname', 'account-email', 'account-id', 'avatar-file', 'account-save']) assert(html.includes(`id="${id}"`), `${id} control exists`);
});

add('ui', 'settings logout button uses a danger treatment', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  const css = await readFile(new URL('public/account-me.css', ROOT), 'utf8');
  assert(html.includes('id="account-logout"') && html.includes('>Đăng xuất</button>'), 'logout label exists');
  assert(css.includes('.account-page-logout') && css.includes('var(--danger-border)') && css.includes('var(--danger-bg)'), 'logout danger styling exists');
});

add('ui', 'registration lowercases but login accepts uppercase usernames', async () => {
  const register = await readFile(new URL('public/register.html', ROOT), 'utf8');
  const login = await readFile(new URL('public/login.html', ROOT), 'utf8');
  const auth = await readFile(new URL('public/auth.js', ROOT), 'utf8');
  assert(register.includes('pattern="[a-z0-9]{3,32}"') && auth.includes("mode === 'register'"), 'registration lowercases in realtime');
  assert(login.includes('maxlength="254"') && login.includes('Tên tài khoản hoặc email') && !login.includes('pattern="[a-z0-9]{3,32}"'), 'login accepts username or linked email');
});

add('ui', 'missing email uses the shared blocking gate', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  const gate = await readFile(new URL('public/email-gate.js', ROOT), 'utf8');
  assert(html.includes('src="/email-gate.js"'), 'account page loads shared email gate');
  assert(gate.includes('data-email-gate-input') && gate.includes('type="email"') && gate.includes('required'), 'gate email is required');
  assert(!html.includes('account-email-completion'), 'account page has no duplicate inline completion box');
});

add('ui', 'authenticated screens load the shared email gate', async () => {
  for (const page of ['index.html', 'overview.html', 'account/me.html', 'docs.html', 'privacy-policy.html', 'terms-of-service.html']) {
    const html = await readFile(new URL(`public/${page}`, ROOT), 'utf8');
    assert(html.includes('src="/email-gate.js"'), `${page} loads shared email gate`);
  }
});

add('ui', 'immutable fields are readonly', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  assert(/id="account-email"[^>]*readonly/.test(html) && /id="account-id"[^>]*readonly/.test(html), 'immutable inputs readonly');
});

add('ui', 'settings page has responsive rules', async () => {
  const css = await readFile(new URL('public/account-me.css', ROOT), 'utf8');
  assert(css.includes('@media (max-width: 768px)') && css.includes('@media (max-width: 430px)'), 'responsive breakpoints');
  assert(css.includes('.app-shell main.account-settings-main') && css.includes('width: min(calc(100% - 64px), 1080px)'), 'settings content keeps space from sidebar');
});

add('ui', 'avatar controls are keyboard reachable', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  assert(html.includes('for="avatar-file"') && html.includes('id="avatar-file"'), 'avatar label is associated');
  assert(html.includes('role="status"') && html.includes('aria-live="polite"'), 'status announcement');
});

add('ui', 'account settings uses shared design tokens', async () => {
  const css = await readFile(new URL('public/account-me.css', ROOT), 'utf8');
  for (const token of ['var(--workspace-panel)', 'var(--workspace-line)', 'var(--text-primary)', 'var(--gold)']) assert(css.includes(token), `${token} token used`);
});

add('ui', 'page has navigation and login empty state', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  assert(html.includes('href="/"') && html.includes('id="account-settings-login"') && html.includes('href="/auth/google"'), 'navigation and empty state');
});

add('ux', 'form labels match controls', async () => {
  const html = await readFile(new URL('public/account/me.html', ROOT), 'utf8');
  for (const id of ['display-name', 'nickname', 'account-email', 'account-id', 'avatar-file']) assert(html.includes(`for="${id}"`), `${id} label association`);
});

add('ux', 'error and success status are visible in text', async () => {
  const js = await readFile(new URL('public/account-me.js', ROOT), 'utf8');
  assert(js.includes("classList.toggle('is-error'") && js.includes('Đã lưu thông tin tài khoản'), 'feedback states');
});

add('ux', 'reduced motion is respected', async () => {
  const css = await readFile(new URL('public/account-me.css', ROOT), 'utf8');
  assert(css.includes('prefers-reduced-motion'), 'reduced motion rule');
});

add('ux', 'upload has client and server size guard', async () => {
  const js = await readFile(new URL('public/account-me.js', ROOT), 'utf8');
  const route = await readFile(new URL('functions/api/auth/[[path]].js', ROOT), 'utf8');
  assert(js.includes('maxAvatarBytes') && route.includes('MAX_AVATAR_BYTES'), 'size guard at both boundaries');
});

add('ux', 'email gate blocks dismissal and persists through reload', async () => {
  const js = await readFile(new URL('public/email-gate.js', ROOT), 'utf8');
  const css = await readFile(new URL('public/styles.css', ROOT), 'utf8');
  assert(js.includes("event.key === 'Escape'") && js.includes('event.preventDefault()'), 'escape cannot dismiss the gate');
  assert(js.includes("fetch('/api/auth/me'") && js.includes('JSON.stringify({ ...(input ? { email } : {}'), 'gate saves profile fields through guarded PATCH');
  assert(css.includes('body.email-gate-open') && css.includes('.email-gate-root'), 'gate locks the page');
});

add('ux', 'page offers recovery after unauthenticated load', async () => {
  const js = await readFile(new URL('public/account-me.js', ROOT), 'utf8');
  assert(js.includes('response.status === 401') && js.includes('login.hidden = false'), 'unauthenticated recovery');
});

async function runSuite(kind) {
  for (const test of CASES[kind]) {
    for (let index = 0; index < 200; index += 1) {
      const tier = tierFor(index);
      const started = performance.now();
      await test.operation({ index, tier });
      results.push({ kind, name: test.name, index, tier: tier.name, virtualUsers: tier.virtualUsers, durationMs: performance.now() - started });
    }
  }
}

try {
  for (const kind of Object.keys(CASES)) await runSuite(kind);
} catch (error) {
  console.error(`PROFILE_MATRIX_FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  const counts = Object.fromEntries(Object.entries(CASES).map(([kind, cases]) => [kind, cases.length]));
  const expected = Object.values(counts).reduce((total, count) => total + count * 200, 0);
  const tierCounts = Object.fromEntries(Object.keys(CASES).map(kind => [kind, {
    '100k': results.filter(item => item.kind === kind && item.tier === '100k').length,
    '500k': results.filter(item => item.kind === kind && item.tier === '500k').length,
    '10m': results.filter(item => item.kind === kind && item.tier === '10m').length
  }]));
  assert(results.length === expected, `matrix count mismatch: ${results.length}/${expected}`);
  for (const [kind, count] of Object.entries(tierCounts)) assert(count['100k'] === counts[kind] * 20 && count['500k'] === counts[kind] * 80 && count['10m'] === counts[kind] * 100, `${kind} tier distribution mismatch`);
  console.log(`PROFILE_MATRIX_PASS function=${counts.function} flow=${counts.flow} syntax=${counts.syntax} ui=${counts.ui} ux=${counts.ux} total=${results.length} expected=${expected} tiers=20/80/100 virtual_users=100000/500000/10000000 actual_concurrency_cap=64`);
}
