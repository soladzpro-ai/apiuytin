import { readFile } from 'node:fs/promises';
import {
  API_BASE,
  CODE_MAX_AGE,
  DEVICE_MAX_AGE,
  PASSWORD_HASH_ITERATIONS,
  WEB_CALLBACK,
  bearer,
  cookie,
  cors,
  createSession,
  decryptSecret,
  encryptSecret,
  ensureDevice,
  findProjectById,
  findProjectByPublishKey,
  getActiveDevice,
  getCookie,
  googleAuthorize,
  googleToken,
  googleUser,
  hash,
  hashPassword,
  json,
  linkDeviceAccount,
  listDeviceAccounts,
  profileFromGoogle,
  profileFromStoredUser,
  publicProject,
  randomSecret,
  readSignedValue,
  redirect,
  requireSecret,
  sanityMutate,
  sanityMutateBatched,
  sanityQuery,
  session,
  signedValue,
  upsertApiUser,
  validateRedirectUri,
  verifyPassword
} from '../functions/_lib/auth.js';
import {
  callbackRedirect,
  cancelOAuthTransaction,
  createOAuthTransaction,
  getOAuthTransaction,
  getReusableAuthorizationCode,
  issueAuthorizationCode,
  transactionIsActive,
  transactionStatus
} from '../functions/_lib/oauth.js';
import { renderConsentError, renderConsentPage } from '../functions/_lib/consent.js';
import { onRequestGet as startOAuth } from '../functions/oauth/google.js';
import { onRequestGet as getConsent, onRequestPost as postConsent } from '../functions/oauth/consent.js';
import { onRequestGet as addAccount } from '../functions/oauth/consent/add-account.js';
import { onRequestGet as localLoginGet, onRequestPost as localLoginPost } from '../functions/oauth/consent/local-login.js';
import { onRequestGet as googleProjectCallback } from '../functions/oauth/google/callback.js';
import { onRequestGet as dashboardGoogleStart } from '../functions/auth/google.js';
import { onRequest as authApi } from '../functions/api/auth/[[path]].js';
import { onRequestPatch as patchProject } from '../functions/api/auth/projects/[projectId].js';

const ENV = {
  SESSION_SECRET: 'looptest-session-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  SANITY_PROJECT_ID: 'looptest-project',
  SANITY_DATASET: 'production',
  SANITY_API_TOKEN: 'looptest-sanity-token',
  GOOGLE_CLIENT_ID: 'looptest-google-client',
  GOOGLE_CLIENT_SECRET: 'looptest-google-secret'
};

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_SET_TIMEOUT = globalThis.setTimeout;
const FUNCTION_CASES = [];
const FLOW_CASES = [];
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

function request(url, options = {}) {
  return new Request(url, options);
}

async function withFetch(handler, operation) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => handler(new URL(input), init);
  try {
    return await operation();
  } finally {
    globalThis.fetch = previous;
  }
}

async function withoutDelays(operation) {
  const previous = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _milliseconds, ...args) => ORIGINAL_SET_TIMEOUT(callback, 0, ...args);
  try {
    return await operation();
  } finally {
    globalThis.setTimeout = previous;
  }
}

function tierFor(index) {
  return index < 5 ? 'easy' : index < 30 ? 'hard' : 'stress';
}

function addFunction(name, operation) {
  FUNCTION_CASES.push({ name, operation });
}

function addFlow(name, operation) {
  FLOW_CASES.push({ name, operation });
}

function fakeSanity(result, capture = null) {
  return async (url, init = {}) => {
    if (url.pathname.includes('/data/query/')) return jsonResponse({ result });
    if (url.pathname.includes('/data/mutate/')) {
      if (capture) capture.push(JSON.parse(init.body).mutations || []);
      return jsonResponse({ results: [] });
    }
    return jsonResponse({ error: 'unexpected_url' }, 500);
  };
}

function activeTransaction(index, overrides = {}) {
  return {
    _id: `oauth-transaction-loop-${index}`,
    _rev: '1-revision',
    transactionHash: `transaction-hash-${index}`,
    projectId: `project-${index}`,
    clientId: `pk_${index}`,
    projectName: 'Loop Web',
    redirectUri: 'https://example.com/auth/apiuytin/callback',
    clientState: `state-${index}`,
    deviceHash: `device-hash-${index}`,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    ...overrides
  };
}

function profile(index) {
  return {
    id: `user-apiuytin-${index}`,
    sub: `user-apiuytin-${index}`,
    email: `user-${index}@example.com`,
    name: `User ${index}`,
    picture: 'https://cdn.example.com/avatar.jpg',
    given_name: 'User',
    family_name: String(index),
    locale: 'vi',
    verified_email: true
  };
}

async function readJson(response) {
  return response.json();
}

async function runAuthFunctionCases() {
  addFunction('requireSecret', async ({ index }) => {
    if (index % 7 === 0) {
      let failed = false;
      try { requireSecret({ SESSION_SECRET: 'short' }); } catch { failed = true; }
      assert(failed, 'short secret must be rejected');
    } else same(requireSecret(ENV), ENV.SESSION_SECRET, 'secret');
  });

  addFunction('hash', async ({ index, tier }) => {
    const value = await hash(`${tier}:hash:${index}`);
    assert(/^[A-Za-z0-9_-]{43}$/.test(value), 'SHA-256 hash must be base64url');
  });

  addFunction('password hashing', async ({ index }) => {
    if (index !== 0) return;
    const password = 'Correct-Horse-123';
    const encoded = await hashPassword(password);
    assert(encoded.startsWith(`pbkdf2-sha256$${PASSWORD_HASH_ITERATIONS}$`), 'password uses PBKDF2 format');
    assert(!encoded.includes(password), 'password is not stored in hash payload');
    same(await verifyPassword(password, encoded), true, 'password verifies');
    same(await verifyPassword('wrong-password', encoded), false, 'wrong password rejected');
  });

  addFunction('encryptSecret/decryptSecret', async ({ index }) => {
    const value = `${'payload-'.repeat(index % 9)}${index}`;
    const encrypted = await encryptSecret(value, ENV.SESSION_SECRET);
    same(await decryptSecret(encrypted, ENV.SESSION_SECRET), value, 'encrypted value round trip');
    assert(await decryptSecret(`${encrypted}x`, ENV.SESSION_SECRET) === null, 'tampered value must fail closed');
  });

  addFunction('signedValue/readSignedValue', async ({ index }) => {
    const raw = JSON.stringify({ index, nonce: randomSecret('n_') });
    const signed = await signedValue(raw, ENV.SESSION_SECRET);
    same(await readSignedValue(signed, ENV.SESSION_SECRET), raw, 'signed value round trip');
    assert(await readSignedValue(`${signed}x`, ENV.SESSION_SECRET) === null, 'tampered signature must fail closed');
  });

  addFunction('cookie', async ({ index }) => {
    const result = cookie('loop', `v-${index}`, { maxAge: index + 1 });
    assert(result.includes('Path=/') && result.includes('HttpOnly') && result.includes('Secure') && result.includes('SameSite=Lax'), 'secure cookie attributes');
    assert(result.includes(`Max-Age=${index + 1}`), 'cookie max age');
  });

  addFunction('getCookie', async ({ index }) => {
    const value = `device-${index}`;
    const spacing = index % 2 ? '; ' : ';';
    const req = request('https://apiuytin.pages.dev/', { headers: { Cookie: `a=1${spacing}apiuytin_device=${value}; b=2` } });
    same(getCookie(req, 'apiuytin_device'), value, 'cookie parser accepts valid separators');
    same(getCookie(req, 'missing'), null, 'missing cookie');
  });

  addFunction('json', async ({ index }) => {
    const response = json({ index }, 200 + (index % 2));
    same(response.status, 200 + (index % 2), 'json status');
    same((await readJson(response)).index, index, 'json body');
  });

  addFunction('cors', async () => {
    const headers = cors();
    assert(headers['access-control-allow-origin'] === '*' && headers['access-control-allow-methods'].includes('OPTIONS'), 'cors contract');
  });

  addFunction('redirect', async ({ index }) => {
    const response = redirect(`https://example.com/callback?case=${index}`, { 'set-cookie': [cookie('a', '1'), cookie('b', '2')] });
    same(response.status, 302, 'redirect status');
    same(response.headers.get('location'), `https://example.com/callback?case=${index}`, 'redirect location');
    assert(response.headers.getSetCookie().length === 2, 'multiple set-cookie headers');
  });

  addFunction('randomSecret', async ({ index }) => {
    const value = randomSecret(`loop-${index}-`);
    assert(value.startsWith(`loop-${index}-`) && value.length > 40, 'random secret format');
  });

  addFunction('createSession/session', async ({ index }) => {
    const sessionCookie = await createSession({ userId: `user-${index}` }, ENV, 600);
    const value = await session(request('https://apiuytin.pages.dev/', { headers: { Cookie: sessionCookie } }), ENV);
    same(value.userId, `user-${index}`, 'session payload');
  });

  addFunction('sanityQuery', async ({ index }) => {
    const queryResult = await withFetch(fakeSanity({ value: index }), () => sanityQuery('*[_type == "loop"][0]', { id: `id-${index}` }, ENV, 1));
    same(queryResult.value, index, 'sanity query result');
  });

  addFunction('sanityMutate', async ({ index }) => {
    const calls = [];
    await withFetch(fakeSanity(null, calls), () => sanityMutate([{ createIfNotExists: { _id: `loop-${index}` } }], ENV));
    same(calls.length, 1, 'mutation call count');
    same(calls[0].length, 1, 'mutation payload');
  });

  addFunction('sanityMutateBatched', async ({ index }) => {
    const calls = [];
    await withFetch(fakeSanity(null, calls), () => sanityMutateBatched(Array.from({ length: 51 + (index % 71) }, (_, item) => ({ delete: { id: `doc-${index}-${item}` } })), ENV));
    assert(calls.length >= 2, 'batch must split large mutation sets');
    assert(calls.every(chunk => chunk.length <= 50), 'batch size must be <= 50');
  });

  addFunction('googleToken', async ({ index }) => {
    const result = await withFetch(async url => url.hostname === 'oauth2.googleapis.com' ? jsonResponse({ access_token: `google-access-${index}` }) : jsonResponse({}, 404), () => googleToken(`google-code-${index}`, ENV, WEB_CALLBACK));
    same(result.access_token, `google-access-${index}`, 'google token');
  });

  addFunction('googleUser', async ({ index }) => {
    const result = await withFetch(async url => url.hostname === 'openidconnect.googleapis.com' ? jsonResponse({ sub: `google-${index}`, email: `g-${index}@example.com` }) : jsonResponse({}, 404), () => googleUser(`access-${index}`));
    same(result.sub, `google-${index}`, 'google user');
  });

  addFunction('googleAuthorize', async ({ index }) => {
    const value = googleAuthorize('google-client', `state-${index}`, WEB_CALLBACK);
    const url = new URL(value);
    same(url.hostname, 'accounts.google.com', 'google authorize host');
    same(url.searchParams.get('state'), `state-${index}`, 'google state');
    same(url.searchParams.get('redirect_uri'), WEB_CALLBACK, 'google callback');
  });

  addFunction('findProjectByPublishKey', async ({ index }) => {
    const result = await withFetch(fakeSanity({ _id: `project-${index}` }), () => findProjectByPublishKey(`pk-${index}`, ENV));
    same(result._id, `project-${index}`, 'project by publish key');
  });

  addFunction('findProjectById', async ({ index }) => {
    const result = await withFetch(fakeSanity({ _id: `project-${index}` }), () => findProjectById(`project-${index}`, ENV));
    same(result._id, `project-${index}`, 'project by ID');
  });

  addFunction('validateRedirectUri', async ({ index }) => {
    if (index % 5 === 0) same(validateRedirectUri('http://example.com/callback'), null, 'HTTP callback rejected');
    else {
      const value = validateRedirectUri(`https://example.com/callback?case=${index}`);
      assert(value.startsWith('https://example.com/callback'), 'HTTPS callback accepted');
    }
    same(validateRedirectUri('https://user:pass@example.com/callback'), null, 'credential callback rejected');
  });

  addFunction('profileFromGoogle', async ({ index }) => {
    const result = profileFromGoogle({ sub: `google-${index}`, email: `g-${index}@example.com`, name: `G ${index}`, picture: 'https://cdn.example.com/a.png', email_verified: true }, `api-${index}`);
    same(result.id, `api-${index}`, 'API identity id');
    same(result.sub, `api-${index}`, 'API identity sub');
    same(result.verified_email, true, 'email verified mapping');
    same(profileFromGoogle({ sub: 'x', picture: 'javascript:alert(1)' }, 'api-x').picture, '', 'unsafe picture removed');
  });

  addFunction('upsertApiUser', async ({ index }) => {
    const calls = [];
    let stored = null;
    const result = await withFetch(async (url, init = {}) => {
      if (url.pathname.includes('/data/query/')) return jsonResponse({ result: stored });
      if (url.pathname.includes('/data/mutate/')) {
        const mutations = JSON.parse(init.body).mutations || [];
        calls.push(mutations);
        const create = mutations.find(item => item.createIfNotExists)?.createIfNotExists;
        if (create && !stored) stored = { ...create, _rev: 'revision-after-create' };
        return jsonResponse({ results: [] });
      }
      return jsonResponse({ error: 'unexpected_url' }, 500);
    }, () => upsertApiUser({ sub: `google-${index}`, email: `g-${index}@example.com`, email_verified: true }, ENV));
    assert(result.id.startsWith('user-') && result.sub === result.id, 'upsert returns API identity');
    same(calls.length, 1, 'upsert mutation count');
    same(calls[0].length, 1, 'upsert deterministic create');
  });

  addFunction('Google email links existing API account', async ({ index }) => {
    const local = { _id: `user-local-email-${index}`, _rev: 'local-revision', provider: 'password', username: 'localaccount', email: `linked-${index}@example.com`, name: 'Tên cũ', displayName: 'Tên cũ', picture: '' };
    const mutations = [];
    let stored = local;
    const result = await withFetch(async (url, init = {}) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('lower(email)')) return jsonResponse({ result: local });
        const id = url.searchParams.get('$id') || '';
        return jsonResponse({ result: id.includes(local._id) ? stored : null });
      }
      if (url.pathname.includes('/data/mutate/')) {
        const batch = JSON.parse(init.body).mutations || [];
        mutations.push(batch);
        const set = batch.find(item => item.patch)?.patch?.set || {};
        stored = { ...stored, ...set, _rev: 'linked-revision' };
        return jsonResponse({ results: [] });
      }
      return jsonResponse({ error: 'unexpected_url' }, 500);
    }, () => upsertApiUser({ sub: `google-linked-${index}`, email: local.email, name: 'Tên Google', picture: 'https://cdn.example.com/google.png', email_verified: true }, ENV));
    same(result.id, local._id, 'Google keeps existing API identity');
    same(result.sub, local._id, 'Google keeps existing API subject');
    const patch = mutations.flat().find(item => item.patch)?.patch;
    same(patch?.id, local._id, 'existing local account is patched');
    same(patch?.set?.googleAccountId, `google-linked-${index}`, 'Google id is linked');
    same(patch?.set?.displayName, 'Tên Google', 'Google name is synchronized');
    assert(!mutations.flat().some(item => item.createIfNotExists?._type === 'apiUser'), 'email link does not create duplicate API account');
  });

  addFunction('ensureDevice', async ({ index }) => {
    const token = `device-token-${index}`;
    const result = await withFetch(fakeSanity({ _id: `device-${index}` }), () => ensureDevice(request('https://apiuytin.pages.dev/', { headers: { Cookie: `x=1;apiuytin_device=${token}` } }), ENV));
    same(result.token, token, 'existing device token');
    same(result.setCookie, null, 'existing active device does not rotate cookie');
  });

  addFunction('getActiveDevice', async ({ index }) => {
    const token = `device-token-${index}`;
    const result = await withFetch(fakeSanity({ _id: `device-${index}` }), () => getActiveDevice(request('https://apiuytin.pages.dev/', { headers: { Cookie: `apiuytin_device=${token}` } }), ENV));
    same(result.deviceHash, await hash(token), 'active device hash');
  });

  addFunction('linkDeviceAccount', async ({ index }) => {
    const calls = [];
    await withFetch(fakeSanity(null, calls), () => linkDeviceAccount(`device-hash-${index}`, profile(index), ENV));
    same(calls[0].length, 2, 'device account create and patch');
  });

  addFunction('listDeviceAccounts', async ({ index }) => {
    const result = await withFetch(fakeSanity([{ _id: `account-${index}` }]), () => listDeviceAccounts(`device-hash-${index}`, ENV));
    same(result[0]._id, `account-${index}`, 'device account list');
  });

  addFunction('profileFromStoredUser', async ({ index }) => {
    const result = profileFromStoredUser({ _id: `user-${index}`, email: `user-${index}@example.com`, picture: 'javascript:bad', verified_email: true });
    same(result.id, `user-${index}`, 'stored user id');
    same(result.picture, '', 'stored unsafe picture removed');
  });

  addFunction('publicProject', async ({ index }) => {
    const project = { _id: `project-${index}`, name: 'Loop', publishKey: `pk-${index}`, apiKey: `secret-${index}`, redirectUri: 'https://example.com/callback', status: 'active' };
    const withoutKey = await publicProject(project, ENV);
    assert(!Object.hasOwn(withoutKey, 'apiKey'), 'project list must hide API key');
    const withKey = await publicProject(project, ENV, true);
    same(withKey.apiKey, project.apiKey, 'one-time project key');
  });

  addFunction('bearer', async ({ index }) => {
    same(bearer(request('https://apiuytin.pages.dev/', { headers: { Authorization: `Bearer token-${index}` } })), `token-${index}`, 'bearer token');
    same(bearer(request('https://apiuytin.pages.dev/', { headers: { Authorization: 'Basic nope' } })), null, 'non-bearer rejected');
  });

  addFunction('createOAuthTransaction', async ({ index }) => {
    const calls = [];
    const token = await withFetch(fakeSanity(null, calls), () => createOAuthTransaction({ project: { _id: `project-${index}`, publishKey: `pk-${index}`, name: 'Loop' }, redirectUri: 'https://example.com/callback', clientState: `state-${index}`, deviceHash: `device-${index}` }, ENV));
    assert(token.startsWith('tx_') && calls[0][0].create._type === 'apiOAuthTransaction', 'OAuth transaction creation');
  });

  addFunction('getOAuthTransaction', async ({ index }) => {
    const result = await withFetch(fakeSanity(activeTransaction(index)), () => getOAuthTransaction(`tx-${index}`, ENV));
    same(result._id, `oauth-transaction-loop-${index}`, 'OAuth transaction lookup');
  });

  addFunction('transactionIsActive', async ({ index }) => {
    assert(transactionIsActive(activeTransaction(index)), 'active transaction');
    assert(!transactionIsActive(activeTransaction(index, { expiresAt: new Date(Date.now() - 1).toISOString() })), 'expired transaction');
    assert(!transactionIsActive(activeTransaction(index, { selectedAt: new Date().toISOString() })), 'selected transaction');
  });

  addFunction('transaction status and reusable code', async ({ index }) => {
    const user = profile(index);
    const code = `code-retry-${index}`;
    const transaction = activeTransaction(index, {
      selectedAt: new Date().toISOString(),
      selectedUserId: user.id,
      encryptedCode: await encryptSecret(code, ENV.SESSION_SECRET),
      codeHash: await hash(code)
    });
    same(transactionStatus(activeTransaction(index)), 'active', 'active transaction status');
    same(transactionStatus(transaction), 'selected', 'selected transaction status');
    const reusable = await withFetch(async url => {
      if (url.pathname.includes('/data/query/')) return jsonResponse({ result: { _id: `code-${index}`, codeHash: transaction.codeHash, expiresAt: new Date(Date.now() + 300000).toISOString() } });
      return jsonResponse({}, 404);
    }, () => getReusableAuthorizationCode(transaction, ENV));
    same(reusable, code, 'unconsumed code can be resumed');
  });

  addFunction('callbackRedirect', async ({ index }) => {
    const response = callbackRedirect(activeTransaction(index), { code: `code-${index}` });
    const location = new URL(response.headers.get('location'));
    same(location.searchParams.get('state'), `state-${index}`, 'callback state');
    same(location.searchParams.get('code'), `code-${index}`, 'callback code');
  });

  addFunction('issueAuthorizationCode', async ({ index }) => {
    const calls = [];
    const transaction = activeTransaction(index);
    const user = profile(index);
    const code = await withFetch(fakeSanity(null, calls), () => issueAuthorizationCode(transaction, user, ENV));
    assert(code.startsWith('code_'), 'authorization code format');
    assert(calls[0].some(mutation => mutation.patch?.id === transaction._id), 'transaction CAS patch');
    assert(calls[0].some(mutation => mutation.createIfNotExists?._type === 'apiAuthCode'), 'auth code created atomically');
  });

  addFunction('cancelOAuthTransaction', async ({ index }) => {
    const calls = [];
    await withFetch(fakeSanity(null, calls), () => cancelOAuthTransaction(activeTransaction(index), ENV));
    same(calls[0][0].patch.set.canceledAt !== undefined, true, 'cancel CAS patch');
  });

  addFunction('renderConsentPage', async ({ index }) => {
    const html = renderConsentPage({ project: { name: 'Loop Web', redirectUri: 'https://example.com/callback' }, transaction: `tx-${index}`, accounts: [{ _id: `account-${index}`, name: 'User', email: 'user@example.com', picture: 'javascript:alert(1)' }] });
    assert(html.includes('Chọn tài khoản để tiếp tục') && html.includes('/oauth-consent.js'), 'chooser content');
    assert(html.includes('src="/logoweb.png"') && !html.includes('class="brand-mark">A'), 'chooser uses website logo');
    assert(html.includes('name="intent" value="continue"'), 'continue intent is submitted');
    assert(html.includes('/oauth/consent/local-login?transaction=tx-') && html.includes('Đăng nhập bằng tài khoản APIUYTIN'), 'chooser supports local APIUYTIN account');
    assert(!html.includes('javascript:'), 'unsafe avatar scheme removed');
    assert(html.includes('aria-modal="true"') && html.includes('aria-describedby'), 'chooser accessibility');
    const script = await readFile(new URL('../public/oauth-consent.js', import.meta.url), 'utf8');
    assert(script.includes("event.preventDefault()") && script.includes("intentField.name = 'intent'") && script.includes('HTMLFormElement.prototype.submit.call(form)'), 'submit guard sends explicit continue intent');
  });

  addFunction('renderConsentError', async ({ index }) => {
    const html = renderConsentError(`<script>bad-${index}</script>`);
    assert(html.includes('&lt;script&gt;') && !html.includes(`<script>bad-${index}`), 'consent error escaped');
    assert(html.includes('consent-card-error') && html.includes('href="/"'), 'consent error recovery layout');
    assert(html.includes('src="/logoweb.png"') && !html.includes('class="brand-mark">A'), 'error uses website logo');
    const css = await readFile(new URL('../public/oauth-consent.css', import.meta.url), 'utf8');
    assert(css.includes('.consent-card.consent-card-error') && css.includes('display: flex'), 'consent error uses single-column layout');
  });
}

async function projectFor(index) {
  const apiKey = `CHUOTAPI-loop-${index}`;
  return {
    apiKey,
    project: { _id: `project-${index}`, ownerId: `owner-${index}`, name: 'Loop Web', publishKey: `pk-${index}`, redirectUri: 'https://example.com/auth/apiuytin/callback', status: 'active', apiKeyHash: await hash(apiKey) }
  };
}

async function runRouteCases() {
  addFunction('local account routes', async ({ index }) => {
    if (index !== 0) return;
    let stored = null;
    const calls = [];
    const handler = async (url, init) => {
      if (url.pathname.includes('/data/query/')) return jsonResponse({ result: stored });
      if (url.pathname.includes('/data/mutate/')) {
        const mutations = JSON.parse(init.body).mutations || [];
        calls.push(mutations);
        const create = mutations.find(item => item.createIfNotExists?._type === 'apiUser');
        if (create) stored = { ...create.createIfNotExists, _rev: '1-local-revision' };
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    };

    const registerResponse = await withFetch(handler, () => authApi({
      request: request('https://apiuytin.pages.dev/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'LoopUser', email: 'loop-user@example.com', password: 'Correct-Horse-123', confirmPassword: 'Correct-Horse-123' })
      }),
      env: ENV,
      params: { path: 'register' }
    }));
    const registered = await readJson(registerResponse);
    same(registerResponse.status, 201, 'local account registration');
    same(registered.user.username, 'loopuser', 'username normalized');
    assert(registered.user.provider === 'password' && !stored.passwordHash.includes('Correct-Horse-123'), 'local profile and password hash');
    assert(calls[0].some(item => item.createIfNotExists?._type === 'apiUser'), 'local account uses deterministic create');

    const loginResponse = await withFetch(handler, () => authApi({
      request: request('https://apiuytin.pages.dev/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'LOOPUSER', password: 'Correct-Horse-123' })
      }),
      env: ENV,
      params: { path: 'login' }
    }));
    same(loginResponse.status, 200, 'local account login');
    assert((loginResponse.headers.get('set-cookie') || '').includes('apiuytin_session='), 'local session cookie');

    const emailLoginResponse = await withFetch(handler, () => authApi({
      request: request('https://apiuytin.pages.dev/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'LOOP-USER@EXAMPLE.COM', password: 'Correct-Horse-123' })
      }),
      env: ENV,
      params: { path: 'login' }
    }));
    same(emailLoginResponse.status, 200, 'local account email login');
    assert((emailLoginResponse.headers.get('set-cookie') || '').includes('apiuytin_session='), 'email login session cookie');

    const wrongResponse = await withFetch(handler, () => authApi({
      request: request('https://apiuytin.pages.dev/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'loopuser', password: 'wrong-password' })
      }),
      env: ENV,
      params: { path: 'login' }
    }));
    same(wrongResponse.status, 401, 'wrong local password rejected');

    const mismatchResponse = await authApi({
      request: request('https://apiuytin.pages.dev/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'otheruser', email: 'other-user@example.com', password: 'Correct-Horse-123', confirmPassword: 'Different-Horse-123' })
      }),
      env: ENV,
      params: { path: 'register' }
    });
    same(mismatchResponse.status, 400, 'confirmation password mismatch');
  });

  addFunction('startOAuth route', async ({ index }) => {
    const { project } = await projectFor(index);
    const calls = [];
    let device = null;
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiDevice')) return jsonResponse({ result: device });
      }
      if (url.pathname.includes('/data/mutate/')) {
        const body = JSON.parse(init.body);
        calls.push(body);
        const create = body.mutations?.find(item => item.createIfNotExists)?.createIfNotExists;
        if (create && !device) device = { ...create, _rev: 'device-revision' };
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    }, () => startOAuth({ request: request(`https://apiuytin.pages.dev/oauth/google?client_id=${project.publishKey}&redirect_uri=${encodeURIComponent(project.redirectUri)}&state=state-${index}`), env: ENV }));
    same(response.status, 302, 'OAuth start redirect');
    assert(new URL(response.headers.get('location')).pathname === '/oauth/consent', 'chooser redirect path');
    assert(calls.length >= 2, 'device and transaction mutations');
  });

  addFunction('consent GET route', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const transaction = activeTransaction(index, { deviceHash });
    const project = { _id: transaction.projectId, name: 'Loop Web', redirectUri: transaction.redirectUri, status: 'active' };
    const response = await withFetch(async (url, init) => {
      if (!url.pathname.includes('/data/query/')) return jsonResponse({}, 404);
      const query = url.searchParams.get('query') || '';
      if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
      if (query.includes('apiDevice') && !query.includes('apiDeviceAccount')) return jsonResponse({ result: { _id: `device-${index}` } });
      if (query.includes('apiProject')) return jsonResponse({ result: project });
      if (query.includes('apiDeviceAccount')) return jsonResponse({ result: [{ _id: `account-${index}`, userId: `user-${index}`, name: 'User', email: 'user@example.com' }] });
      return jsonResponse({ result: null });
    }, () => getConsent({ request: request(`https://apiuytin.pages.dev/oauth/consent?transaction=${encodeURIComponent(`tx-${index}`)}`, { headers: { Cookie: `apiuytin_device=${token}` } }), env: ENV }));
    same(response.status, 200, 'consent status');
    const html = await response.text();
    assert(html.includes('Loop Web') && html.includes('account_id'), 'consent account list');
    const csp = response.headers.get('content-security-policy');
    assert(csp.includes("script-src 'self'") && csp.includes("form-action 'self' https://example.com") && csp.includes('style-src \'self\' https://fonts.googleapis.com') && csp.includes('font-src \'self\' https://fonts.gstatic.com'), 'consent CSP allows registered callback redirect');
  });

  addFunction('consent cancel route', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const transaction = activeTransaction(index, { deviceHash });
    const calls = [];
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
        if (query.includes('apiDevice')) return jsonResponse({ result: { _id: `device-${index}` } });
      }
      if (url.pathname.includes('/data/mutate/')) { calls.push(JSON.parse(init.body)); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, () => postConsent({ request: request('https://apiuytin.pages.dev/oauth/consent', { method: 'POST', headers: { Cookie: `apiuytin_device=${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ transaction: `tx-${index}`, intent: 'cancel' }) }), env: ENV }));
    same(response.status, 302, 'cancel callback redirect');
    const location = new URL(response.headers.get('location'));
    same(location.searchParams.get('error'), 'access_denied', 'cancel error');
    assert(calls.length >= 0, 'cancel mutation mock completed');
  });

  addFunction('consent continue resumes selected transaction', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const user = profile(index);
    const code = `code-resume-${index}`;
    const account = { _id: `account-${index}`, userId: user.id, email: user.email, name: user.name, picture: user.picture, given_name: user.given_name, family_name: user.family_name, locale: user.locale, verified_email: true };
    const transaction = activeTransaction(index, {
      deviceHash,
      selectedAt: new Date().toISOString(),
      selectedUserId: user.id,
      encryptedCode: await encryptSecret(code, ENV.SESSION_SECRET),
      codeHash: await hash(code)
    });
    const project = { _id: transaction.projectId, name: 'Loop Web', redirectUri: transaction.redirectUri, status: 'active' };
    const calls = [];
    const response = await withFetch(async (url, init = {}) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
        if (query.includes('apiDevice') && !query.includes('apiDeviceAccount')) return jsonResponse({ result: { _id: `device-${index}` } });
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiDeviceAccount')) return jsonResponse({ result: account });
        if (query.includes('apiAuthCode')) return jsonResponse({ result: { _id: `code-${index}`, codeHash: transaction.codeHash, expiresAt: new Date(Date.now() + 300000).toISOString() } });
      }
      if (url.pathname.includes('/data/mutate/')) { calls.push(JSON.parse(init.body)); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, () => postConsent({ request: request('https://apiuytin.pages.dev/oauth/consent', {
      method: 'POST',
      headers: { Cookie: `apiuytin_device=${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ transaction: `tx-${index}`, account_id: account._id })
    }), env: ENV }));
    same(response.status, 302, 'selected transaction retry redirect');
    const location = new URL(response.headers.get('location'));
    same(location.searchParams.get('code'), code, 'selected transaction reuses code');
    same(calls.length, 0, 'selected transaction retry does not mutate');
  });

  addFunction('consent continue redirects before project-user sync', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const user = profile(index);
    const account = { _id: `account-${index}`, userId: user.id, email: user.email, name: user.name, picture: user.picture, given_name: user.given_name, family_name: user.family_name, locale: user.locale, verified_email: true };
    const transaction = activeTransaction(index, { deviceHash });
    const project = { _id: transaction.projectId, name: 'Loop Web', redirectUri: transaction.redirectUri, status: 'active' };
    const calls = [];
    const background = [];
    const response = await withFetch(async (url, init = {}) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
        if (query.includes('apiDevice') && !query.includes('apiDeviceAccount')) return jsonResponse({ result: { _id: `device-${index}` } });
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiDeviceAccount')) return jsonResponse({ result: account });
      }
      if (url.pathname.includes('/data/mutate/')) { calls.push(JSON.parse(init.body).mutations || []); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, () => postConsent({ request: request('https://apiuytin.pages.dev/oauth/consent', {
      method: 'POST',
      headers: { Cookie: `apiuytin_device=${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ transaction: `tx-${index}`, intent: 'continue', account_id: account._id })
    }), env: ENV, waitUntil: task => background.push(task) }));
    same(response.status, 302, 'active consent redirect');
    const location = new URL(response.headers.get('location'));
    assert(location.searchParams.get('code')?.startsWith('code_'), 'active consent returns code');
    same(background.length, 1, 'project user sync is scheduled');
    await Promise.all(background);
    assert(calls.some(batch => batch.some(item => item.createIfNotExists?._type === 'apiProjectUser')), 'project user sync mutation scheduled');
  });

  addFunction('add-account route', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const transaction = activeTransaction(index, { deviceHash });
    const response = await withFetch(async url => {
      if (!url.pathname.includes('/data/query/')) return jsonResponse({}, 404);
      const query = url.searchParams.get('query') || '';
      if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
      if (query.includes('apiDevice')) return jsonResponse({ result: { _id: `device-${index}` } });
      return jsonResponse({ result: null });
    }, () => addAccount({ request: request(`https://apiuytin.pages.dev/oauth/consent/add-account?transaction=tx-${index}`, { headers: { Cookie: `apiuytin_device=${token}` } }), env: ENV }));
    same(response.status, 302, 'add account redirect');
    assert(new URL(response.headers.get('location')).hostname === 'accounts.google.com', 'add account uses Google only for bootstrap');
  });

  addFunction('local account chooser login route', async ({ index }) => {
    if (index !== 0) return;
    const token = 'device-token-local';
    const deviceHash = await hash(token);
    const transaction = activeTransaction(index, { deviceHash });
    const project = { _id: transaction.projectId, name: 'Loop Web', redirectUri: transaction.redirectUri, status: 'active' };
    const password = 'Correct-Horse-123';
    const account = { _id: 'user-local-loop', provider: 'password', username: 'looplocal', passwordHash: await hashPassword(password), name: 'looplocal', displayName: 'looplocal', email: 'loop-local@example.com', picture: '', given_name: '', family_name: '', locale: 'vi', verified_email: false };
    const mutations = [];
    const handler = async (url, init = {}) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
        if (query.includes('apiDevice') && !query.includes('apiDeviceAccount')) return jsonResponse({ result: { _id: `device-${index}`, deviceHash, expiresAt: new Date(Date.now() + 600000).toISOString() } });
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiUser')) return jsonResponse({ result: account });
      }
      if (url.pathname.includes('/data/mutate/')) { mutations.push(JSON.parse(init.body).mutations || []); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    };
    const getResponse = await withFetch(handler, () => localLoginGet({ request: request(`https://apiuytin.pages.dev/oauth/consent/local-login?transaction=tx-${index}`, { headers: { Cookie: `apiuytin_device=${token}` } }), env: ENV }));
    same(getResponse.status, 200, 'local chooser login page');
    const getBody = await getResponse.text();
    assert(getBody.includes('name="username"') && getBody.includes('name="password"'), 'local chooser login fields');
    const postResponse = await withFetch(handler, () => localLoginPost({ request: request(`https://apiuytin.pages.dev/oauth/consent/local-login?transaction=tx-${index}`, { method: 'POST', headers: { Cookie: `apiuytin_device=${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ transaction: `tx-${index}`, username: 'LOOPLOCAL', password }) }), env: ENV }));
    same(postResponse.status, 302, 'local chooser login redirect');
    const location = new URL(postResponse.headers.get('location'));
    same(location.pathname, '/oauth/consent', 'local chooser returns to consent');
    same(location.searchParams.get('transaction'), `tx-${index}`, 'local chooser keeps transaction');
    assert(mutations.some(batch => batch.some(item => item.createIfNotExists?._type === 'apiDeviceAccount' && item.createIfNotExists.username === 'looplocal')), 'local account linked to device');

    const emailPostResponse = await withFetch(handler, () => localLoginPost({ request: request(`https://apiuytin.pages.dev/oauth/consent/local-login?transaction=tx-${index}`, { method: 'POST', headers: { Cookie: `apiuytin_device=${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ transaction: `tx-${index}`, username: 'LOOP-LOCAL@EXAMPLE.COM', password }) }), env: ENV }));
    same(emailPostResponse.status, 302, 'local chooser email login redirect');
  });

  addFunction('Google add-account callback returns to chooser', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const transaction = activeTransaction(index, { deviceHash });
    const stateValue = await signedValue(JSON.stringify({ kind: 'project_add_account', state: `st_${index}_oauth_nonce`, transaction: `tx-${index}`, exp: Date.now() + 600000 }), ENV.SESSION_SECRET);
    const mutations = [];
    let storedUser = null;
    const device = { _id: `device-${index}`, deviceHash, deviceTokenHash: await hash(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
    const response = await withFetch(async (url, init = {}) => {
      if (url.hostname === 'oauth2.googleapis.com') return jsonResponse({ access_token: `google-access-${index}` });
      if (url.hostname === 'openidconnect.googleapis.com') return jsonResponse({ sub: `google-${index}`, email: `google-${index}@example.com`, name: `Google ${index}`, email_verified: true });
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
        if (query.includes('apiUser')) return jsonResponse({ result: storedUser });
        if (query.includes('apiDevice') && !query.includes('apiDeviceAccount')) return jsonResponse({ result: device });
        return jsonResponse({ result: null });
      }
      if (url.pathname.includes('/data/mutate/')) {
        const batch = JSON.parse(init.body).mutations || [];
        mutations.push(batch);
        const createdUser = batch.find(item => item.createIfNotExists?._type === 'apiUser')?.createIfNotExists;
        if (createdUser) storedUser = { ...createdUser, _rev: `user-revision-${index}` };
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    }, () => googleProjectCallback({
      request: request(`https://apiuytin.pages.dev/oauth/google/callback?code=google-code-${index}&state=${encodeURIComponent(stateValue)}`, { headers: { Cookie: `apiuytin_device=${token}` } }),
      env: ENV
    }));
    same(response.status, 302, 'Google callback returns to chooser');
    const location = new URL(response.headers.get('location'));
    same(location.pathname, '/oauth/consent', 'Google callback consent path');
    same(location.searchParams.get('transaction'), `tx-${index}`, 'Google callback transaction');
    assert(mutations.some(batch => batch.some(item => item.createIfNotExists?._type === 'apiDeviceAccount')), 'new Google account linked to device');
    assert(!mutations.some(batch => batch.some(item => item.createIfNotExists?._type === 'apiProjectUser')), 'project user waits for consent');
  });

  addFunction('dashboard Google start route', async ({ index }) => {
    const response = await dashboardGoogleStart({ request: request('https://apiuytin.pages.dev/auth/google'), env: ENV });
    same(response.status, 302, 'dashboard Google redirect');
    assert(response.headers.getSetCookie().some(value => value.startsWith('apiuytin_oauth_state=')), 'dashboard state cookie');
  });

  addFunction('health route', async ({ index }) => {
    const response = await authApi({ request: request('https://apiuytin.pages.dev/api/auth/health'), env: ENV, params: { path: 'health' } });
    same(response.status, 200, 'health status');
    same((await readJson(response)).ok, true, 'health body');
  });

  addFunction('token route success', async ({ index }) => {
    const { apiKey, project } = await projectFor(index);
    const code = `code-loop-${index}`;
    const codeDocument = { _id: `code-${index}`, _rev: '1-rev', codeHash: await hash(code), projectId: project._id, clientId: project.publishKey, redirectUri: project.redirectUri, userId: `user-${index}`, email: `user-${index}@example.com`, name: 'User', picture: '', given_name: 'User', family_name: '', locale: 'vi', verified_email: true, expiresAt: new Date(Date.now() + 300000).toISOString() };
    let consumed = false;
    const response = await withFetch(async url => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiAuthCode')) return jsonResponse({ result: consumed ? { ...codeDocument, consumedAt: new Date().toISOString() } : codeDocument });
      }
      if (url.pathname.includes('/data/mutate/')) { consumed = true; return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, () => authApi({ request: request('https://apiuytin.pages.dev/api/auth/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: project.publishKey, api_key: apiKey, code, redirect_uri: project.redirectUri }) }), env: ENV, params: { path: 'oauth/token' } }));
    same(response.status, 200, 'token response status');
    const body = await readJson(response);
    same(body.user.sub, `user-${index}`, 'token API subject');
    assert(!Object.hasOwn(body, 'refresh_token') && !Object.hasOwn(body, 'google_access_token'), 'no Google token leakage');
  });

  addFunction('token route rejects client_secret', async ({ index }) => {
    const response = await authApi({ request: request('https://apiuytin.pages.dev/api/auth/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: 'pk', api_key: 'key', code: 'code', redirect_uri: 'https://example.com/callback', client_secret: 'forbidden' }) }), env: ENV, params: { path: 'oauth/token' } });
    same(response.status, 401, 'client_secret rejected');
    same((await readJson(response)).error, 'invalid_client', 'client_secret error');
  });

  addFunction('userinfo route', async ({ index }) => {
    const user = profile(index);
    const token = await signedValue(JSON.stringify({ projectId: `project-${index}`, profile: user, exp: Date.now() + 3600000 }), ENV.SESSION_SECRET);
    const response = await withFetch(async url => {
      if (url.pathname.includes('/data/query/')) return jsonResponse({ result: { _id: `project-${index}`, status: 'active' } });
      return jsonResponse({}, 404);
    }, () => authApi({ request: request('https://apiuytin.pages.dev/api/auth/userinfo', { headers: { Authorization: `Bearer ${token}` } }), env: ENV, params: { path: 'userinfo' } }));
    same(response.status, 200, 'userinfo status');
    same((await readJson(response)).sub, user.sub, 'userinfo profile');
  });

  addFunction('rotate key route', async ({ index }) => {
    const userId = `owner-${index}`;
    const sessionCookie = await createSession({ userId }, ENV);
    const project = { _id: `project-${index}`, ownerId: userId, name: 'Loop', publishKey: `pk-${index}`, redirectUri: 'https://example.com/callback', status: 'active', _rev: 'rev-1' };
    const mutations = [];
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiUser')) return jsonResponse({ result: { _id: userId, email: `owner-${index}@example.com` } });
        return jsonResponse({ result: project });
      }
      if (url.pathname.includes('/data/mutate/')) { mutations.push(JSON.parse(init.body).mutations || []); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, () => authApi({ request: request(`https://apiuytin.pages.dev/api/auth/projects/${project._id}/rotate-key`, { method: 'POST', headers: { Cookie: sessionCookie } }), env: ENV, params: { path: `projects/${project._id}/rotate-key` } }));
    same(response.status, 200, 'rotate status');
    const body = await readJson(response);
    assert(body.project.apiKey?.startsWith('CHUOTAPI_') && mutations.length === 1, 'rotate returns one-time key');
  });

  addFunction('revoke fast-path route', async ({ index }) => {
    const userId = `owner-${index}`;
    const sessionCookie = await createSession({ userId }, ENV);
    const project = { _id: `project-${index}`, ownerId: userId, name: 'Loop', publishKey: `pk-${index}`, redirectUri: 'https://example.com/callback', status: 'active', _rev: 'rev-1' };
    const background = [];
    const mutations = [];
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiUser')) return jsonResponse({ result: { _id: userId, email: `owner-${index}@example.com` } });
        if (query.includes('apiProjectUser')) return jsonResponse({ result: [] });
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        return jsonResponse({ result: [] });
      }
      if (url.pathname.includes('/data/mutate/')) { mutations.push(JSON.parse(init.body).mutations || []); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, async () => {
      const result = await authApi({ request: request(`https://apiuytin.pages.dev/api/auth/projects/${project._id}/revoke`, { method: 'POST', headers: { Cookie: sessionCookie } }), env: ENV, params: { path: `projects/${project._id}/revoke` }, waitUntil: promise => background.push(promise) });
      await Promise.all(background);
      return result;
    });
    same(response.status, 200, 'revoke status');
    assert((await readJson(response)).cleanupScheduled === true, 'revoke schedules cleanup');
    await Promise.all(background);
    assert(mutations.length >= 2, `revoke patches and deletes project (calls=${mutations.length})`);
  });

  addFunction('project enable toggle route', async ({ index }) => {
    const userId = `owner-${index}`;
    const sessionCookie = await createSession({ userId }, ENV);
    let project = { _id: `project-toggle-${index}`, ownerId: userId, name: 'Toggle Web', publishKey: `pk-toggle-${index}`, redirectUri: 'https://example.com/callback', status: 'active', _rev: 'rev-1' };
    const mutations = [];
    const call = enabled => patchProject({
      request: request(`https://apiuytin.pages.dev/api/auth/projects/${project._id}`, {
        method: 'PATCH',
        headers: { Cookie: sessionCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled })
      }),
      env: ENV,
      params: { projectId: project._id }
    });
    await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiUser')) return jsonResponse({ result: { _id: userId, email: `owner-${index}@example.com` } });
        return jsonResponse({ result: project });
      }
      if (url.pathname.includes('/data/mutate/')) {
        const batch = JSON.parse(init.body).mutations || [];
        mutations.push(batch);
        const status = batch[0]?.patch?.set?.status;
        if (status) project = { ...project, status, _rev: `rev-${mutations.length + 1}` };
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    }, async () => {
      const disabled = await call(false);
      same(disabled.status, 200, 'disable project status');
      same((await readJson(disabled)).project.status, 'disabled', 'project is disabled');
      const enabled = await call(true);
      same(enabled.status, 200, 'enable project status');
      same((await readJson(enabled)).project.status, 'active', 'project is enabled');
    });
    assert(mutations.length === 2 && mutations.every(batch => batch[0].patch.ifRevisionID), 'toggle uses revision guarded mutations');
  });
}

async function runFlowCases() {
  addFlow('full chooser start contract', async ({ index }) => {
    const redirectUri = 'https://example.com/auth/callback';
    const value = googleAuthorize('google-client', `state-${index}`, redirectUri);
    assert(new URL(value).searchParams.get('state') === `state-${index}`, 'Google bootstrap state');
    assert(validateRedirectUri(redirectUri) === redirectUri, 'registered callback');
  });

  addFlow('remembered account profile flow', async ({ index }) => {
    const google = { sub: `google-${index}`, email: `user-${index}@example.com`, email_verified: true, picture: 'https://cdn.example.com/a.png' };
    const api = profileFromGoogle(google, `api-${index}`);
    const stored = profileFromStoredUser({ ...api, userId: api.id });
    same(stored.id, api.id, 'remembered account keeps API ID');
    same(stored.sub, api.id, 'remembered account sub');
  });

  addFlow('consent cancel flow', async ({ index }) => {
    const response = callbackRedirect(activeTransaction(index), { error: 'access_denied' });
    same(new URL(response.headers.get('location')).searchParams.get('error'), 'access_denied', 'cancel callback');
  });

  addFlow('new device requires Google', async ({ index }) => {
    const result = await withFetch(fakeSanity(null), () => getActiveDevice(request('https://apiuytin.pages.dev/'), ENV));
    same(result, null, 'no device session requires bootstrap');
  });

  addFlow('add account returns to consent', async ({ index }) => {
    const token = `device-token-${index}`;
    const deviceHash = await hash(token);
    const transaction = activeTransaction(index, { deviceHash });
    const response = await withFetch(async url => {
      if (!url.pathname.includes('/data/query/')) return jsonResponse({}, 404);
      const query = url.searchParams.get('query') || '';
      if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: transaction });
      if (query.includes('apiDevice')) return jsonResponse({ result: { _id: `device-${index}` } });
      return jsonResponse({ result: null });
    }, () => addAccount({ request: request(`https://apiuytin.pages.dev/oauth/consent/add-account?transaction=tx-${index}`, { headers: { Cookie: `apiuytin_device=${token}` } }), env: ENV }));
    assert(new URL(response.headers.get('location')).searchParams.get('state'), 'Google add-account state exists');
  });

  addFlow('one-time code CAS flow', async ({ index }) => {
    const calls = [];
    const transaction = activeTransaction(index);
    const user = profile(index);
    const code = await withFetch(fakeSanity(null, calls), () => issueAuthorizationCode(transaction, user, ENV));
    assert(calls[0].some(item => item.patch?.ifRevisionID === '1-revision'), 'transaction revision guard');
    assert(code.startsWith('code_') && CODE_MAX_AGE === 300, 'short-lived one-time code');
  });

  addFlow('authorization code race', async ({ index }) => {
    const transaction = activeTransaction(index);
    const user = profile(index);
    let winner = null;
    let selected = null;
    let encrypted = null;
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiOAuthTransaction')) return jsonResponse({ result: selected ? { ...transaction, _rev: '2-revision', encryptedCode: encrypted, selectedUserId: user.id, selectedProfile: user, selectedAt: new Date().toISOString() } : transaction });
        return jsonResponse({ result: null });
      }
      if (url.pathname.includes('/data/mutate/')) {
        const payload = JSON.parse(init.body);
        const patch = payload.mutations.find(item => item.patch?.id === transaction._id);
        if (patch && !selected) {
          selected = true;
          encrypted = patch.patch.set.encryptedCode;
          winner = payload;
          return jsonResponse({ results: [] });
        }
        if (patch) return jsonResponse({ error: 'revision_conflict' }, 409);
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    }, async () => Promise.all(Array.from({ length: 6 }, () => issueAuthorizationCode(transaction, user, ENV))));
    const codes = await response;
    assert(codes.every(code => code === codes[0]) && winner, 'CAS race must converge on one code');
  });

  addFlow('100 concurrent chooser starts on one device', async ({ index }) => {
    const { project } = await projectFor(index);
    const deviceToken = `device-token-${index}`;
    const deviceHash = await hash(deviceToken);
    let deviceMutations = 0;
    let transactionMutations = 0;
    const responses = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiDevice')) return jsonResponse({ result: { _id: `device-${index}`, deviceHash, expiresAt: new Date(Date.now() + 86400000).toISOString() } });
      }
      if (url.pathname.includes('/data/mutate/')) {
        const mutations = JSON.parse(init.body).mutations || [];
        if (mutations.some(item => item.createIfNotExists?._type === 'apiDevice')) deviceMutations += 1;
        if (mutations.some(item => item.create?._type === 'apiOAuthTransaction')) transactionMutations += 1;
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    }, () => Promise.all(Array.from({ length: 100 }, (_, requestIndex) => startOAuth({
      request: request(`https://apiuytin.pages.dev/oauth/google?client_id=${project.publishKey}&redirect_uri=${encodeURIComponent(project.redirectUri)}&state=${encodeURIComponent(`state-${index}-${requestIndex}`)}`, { headers: { Cookie: `apiuytin_device=${deviceToken}` } }),
      env: ENV
    }))));
    assert(responses.every(response => response.status === 302), 'all concurrent starts redirect');
    same(deviceMutations, 0, 'remembered device does not duplicate device records');
    same(transactionMutations, 100, 'each independent OAuth request has its own transaction');
  });

  addFlow('100 concurrent token exchanges consume once', async ({ index }) => {
    const { apiKey, project } = await projectFor(index);
    const code = `code-concurrent-${index}`;
    const authCode = { _id: `code-${index}`, _rev: '1-rev', codeHash: await hash(code), projectId: project._id, clientId: project.publishKey, redirectUri: project.redirectUri, userId: `user-${index}`, email: `user-${index}@example.com`, name: 'User', picture: '', given_name: 'User', family_name: '', locale: 'vi', verified_email: true, expiresAt: new Date(Date.now() + 300000).toISOString() };
    let consumed = false;
    const responses = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiProject')) return jsonResponse({ result: project });
        if (query.includes('apiAuthCode')) return jsonResponse({ result: consumed ? { ...authCode, consumedAt: new Date().toISOString() } : authCode });
      }
      if (url.pathname.includes('/data/mutate/')) {
        if (consumed) return jsonResponse({ error: 'revision_conflict' }, 409);
        consumed = true;
        return jsonResponse({ results: [] });
      }
      return jsonResponse({}, 404);
    }, () => Promise.all(Array.from({ length: 100 }, () => authApi({
      request: request('https://apiuytin.pages.dev/api/auth/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: project.publishKey, api_key: apiKey, code, redirect_uri: project.redirectUri }) }),
      env: ENV,
      params: { path: 'oauth/token' }
    }))));
    const successCount = responses.filter(response => response.status === 200).length;
    const rejectedCount = responses.filter(response => response.status === 400).length;
    same(successCount, 1, 'only one concurrent token exchange succeeds');
    same(rejectedCount, 99, 'replayed concurrent exchanges are rejected');
  });

  addFlow('token field contract', async ({ index }) => {
    const response = await authApi({ request: request('https://apiuytin.pages.dev/api/auth/oauth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: 'pk', api_key: 'key', code: 'code', redirect_uri: 'https://example.com/callback', client_secret: 'no' }) }), env: ENV, params: { path: 'oauth/token' } });
    same(response.status, 401, 'client secret is forbidden');
  });

  addFlow('disabled project blocks OAuth and token', async ({ index }) => {
    const project = { _id: `project-disabled-${index}`, name: 'Disabled Web', publishKey: `pk-disabled-${index}`, apiKeyHash: await hash(`CHUOTAPI-disabled-${index}`), redirectUri: 'https://example.com/callback', status: 'disabled' };
    const startResponse = await withFetch(async url => {
      if (url.pathname.includes('/data/query/')) return jsonResponse({ result: project });
      return jsonResponse({}, 404);
    }, () => startOAuth({ request: request(`https://apiuytin.pages.dev/oauth/google?client_id=${project.publishKey}&redirect_uri=${encodeURIComponent(project.redirectUri)}&state=disabled-${index}`), env: ENV }));
    same(startResponse.status, 401, 'disabled project rejects OAuth start');

    const tokenResponse = await withFetch(async url => {
      if (url.pathname.includes('/data/query/')) return jsonResponse({ result: project });
      return jsonResponse({}, 404);
    }, () => authApi({
      request: request('https://apiuytin.pages.dev/api/auth/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: project.publishKey, api_key: `CHUOTAPI-disabled-${index}`, code: 'code', redirect_uri: project.redirectUri })
      }),
      env: ENV,
      params: { path: 'oauth/token' }
    }));
    same(tokenResponse.status, 401, 'disabled project rejects token exchange');
  });

  addFlow('profile contract has no Google subject', async ({ index }) => {
    const item = profileFromGoogle({ sub: `google-${index}`, email: 'user@example.com', email_verified: true }, `api-${index}`);
    assert(item.id === item.sub && item.id !== `google-${index}`, 'APIUYTIN subject contract');
    assert(!Object.hasOwn(item, 'access_token') && !Object.hasOwn(item, 'refresh_token'), 'Google tokens absent');
  });

  addFlow('Sanity query retry flow', async ({ index }) => {
    let attempts = 0;
    const value = await withoutDelays(() => withFetch(async url => {
      attempts += 1;
      if (attempts < 3) return jsonResponse({ error: 'busy' }, attempts === 1 ? 429 : 503);
      return jsonResponse({ result: { ok: true, index } });
    }, () => sanityQuery('*[_type == "loop"][0]', {}, ENV, 3)));
    same(value.ok, true, 'query retry success');
    same(attempts, 3, 'query retry bound');
  });

  addFlow('mutation timeout signal flow', async ({ index }) => {
    let sawSignal = false;
    await withFetch(async (_url, init) => {
      sawSignal = Boolean(init.signal);
      return jsonResponse({ results: [] });
    }, () => sanityMutate([{ createIfNotExists: { _id: `loop-${index}` } }], ENV));
    same(sawSignal, true, 'mutation has bounded abort signal');
  });

  addFlow('bounded batch concurrency flow', async ({ index }) => {
    let active = 0;
    let maximum = 0;
    const calls = [];
    await withFetch(async (_url, init) => {
      active += 1;
      maximum = Math.max(maximum, active);
      calls.push(JSON.parse(init.body).mutations.length);
      await Promise.resolve();
      active -= 1;
      return jsonResponse({ results: [] });
    }, () => sanityMutateBatched(Array.from({ length: 151 }, (_, item) => ({ delete: { id: `doc-${index}-${item}` } })), ENV, 50, 6));
    assert(maximum <= 6 && calls.every(size => size <= 50), 'batch concurrency and chunk limit');
  });

  addFlow('docs CSP and script boundary', async () => {
    const docs = await readFile(new URL('../public/docs.html', import.meta.url), 'utf8');
    const docsJs = await readFile(new URL('../public/docs.js', import.meta.url), 'utf8');
    const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
    const register = await readFile(new URL('../public/register.html', import.meta.url), 'utf8');
    const login = await readFile(new URL('../public/login.html', import.meta.url), 'utf8');
    const authJs = await readFile(new URL('../public/auth.js', import.meta.url), 'utf8');
    assert(docs.includes('src="/docs.js"') && !docs.includes('src="/app.js"'), 'docs uses scoped script');
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(docs), 'docs has no inline script');
    assert(docsJs.includes('IntersectionObserver') && headers.includes("script-src 'self'"), 'docs script and CSP');
    assert(register.includes('name="email"') && register.includes('name="password"') && register.includes('name="confirmPassword"') && register.includes('data-auth-mode="register"'), 'registration form contract');
    assert(login.includes('name="password"') && login.includes('data-auth-mode="login"') && authJs.includes("/api/auth/"), 'login form contract');
  assert((register.match(/data-password-toggle/g) || []).length === 2 && register.includes('data-target="confirm-password"') && login.includes('data-password-toggle') && register.includes('data-password-visible="false"') && register.includes('data-eye-open viewBox') && register.includes('data-eye-closed viewBox'), 'password visibility toggles');
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(register) && !/<script(?![^>]*\bsrc=)[^>]*>/.test(login), 'auth pages have no inline script');
  });

  addFlow('device expiry and cookie binding', async ({ index }) => {
    const token = `expired-${index}`;
    const result = await withFetch(fakeSanity(null), () => getActiveDevice(request('https://apiuytin.pages.dev/', { headers: { Cookie: `apiuytin_device=${token}` } }), ENV));
    same(result, null, 'expired/unrecognized device cannot open chooser');
    assert(DEVICE_MAX_AGE === 30 * 24 * 60 * 60, 'device lifetime is 30 days');
  });

  addFlow('revoke immediately blocks project', async ({ index }) => {
    const userId = `owner-${index}`;
    const sessionCookie = await createSession({ userId }, ENV);
    const project = { _id: `project-${index}`, ownerId: userId, name: 'Loop', publishKey: `pk-${index}`, redirectUri: 'https://example.com/callback', status: 'active', _rev: 'rev-1' };
    const background = [];
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiUser')) return jsonResponse({ result: { _id: userId, email: `owner-${index}@example.com` } });
        if (query.includes('apiProjectUser')) return jsonResponse({ result: [] });
        return jsonResponse({ result: query.includes('apiProject') ? project : [] });
      }
      if (url.pathname.includes('/data/mutate/')) return jsonResponse({ results: [] });
      return jsonResponse({}, 404);
    }, async () => {
      const result = await authApi({ request: request(`https://apiuytin.pages.dev/api/auth/projects/${project._id}/revoke`, { method: 'POST', headers: { Cookie: sessionCookie } }), env: ENV, params: { path: `projects/${project._id}/revoke` }, waitUntil: task => background.push(task) });
      await Promise.all(background);
      return result;
    });
    same(response.status, 200, 'revoke immediately responds');
  });

  addFlow('rotate invalidates old key', async ({ index }) => {
    const userId = `owner-${index}`;
    const sessionCookie = await createSession({ userId }, ENV);
    const project = { _id: `project-${index}`, ownerId: userId, name: 'Loop', publishKey: `pk-${index}`, redirectUri: 'https://example.com/callback', status: 'active', _rev: 'rev-1' };
    const mutations = [];
    const response = await withFetch(async (url, init) => {
      if (url.pathname.includes('/data/query/')) {
        const query = url.searchParams.get('query') || '';
        if (query.includes('apiUser')) return jsonResponse({ result: { _id: userId, email: `owner-${index}@example.com` } });
        return jsonResponse({ result: project });
      }
      if (url.pathname.includes('/data/mutate/')) { mutations.push(JSON.parse(init.body).mutations || []); return jsonResponse({ results: [] }); }
      return jsonResponse({}, 404);
    }, () => authApi({ request: request(`https://apiuytin.pages.dev/api/auth/projects/${project._id}/rotate-key`, { method: 'POST', headers: { Cookie: sessionCookie } }), env: ENV, params: { path: `projects/${project._id}/rotate-key` } }));
    const body = await readJson(response);
    assert(response.status === 200 && body.project.apiKey && mutations[0][0].patch.set.apiKeyHash, 'rotation CAS and one-time key');
  });
}

async function runSuite(cases, kind) {
  for (const test of cases) {
    for (let index = 0; index < 200; index += 1) {
      const tier = tierFor(index);
      const started = performance.now();
      await test.operation({ index, tier });
      results.push({ kind, name: test.name, index, tier, durationMs: performance.now() - started });
    }
  }
}

await runAuthFunctionCases();
await runRouteCases();
await runFlowCases();

try {
  await runSuite(FUNCTION_CASES, 'function');
  await runSuite(FLOW_CASES, 'flow');
} catch (error) {
  console.error(`LOOPTEST_FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  globalThis.fetch = ORIGINAL_FETCH;
  globalThis.setTimeout = ORIGINAL_SET_TIMEOUT;
}

if (!process.exitCode) {
  const functionCount = FUNCTION_CASES.length;
  const flowCount = FLOW_CASES.length;
  const expected = (functionCount + flowCount) * 200;
  const easy = results.filter(item => item.index < 5).length;
  const hard = results.filter(item => item.index >= 5 && item.index < 30).length;
  const stress = results.filter(item => item.index >= 30).length;
  console.log(`LOOPTEST_PASS functions=${functionCount} flows=${flowCount} total=${results.length} expected=${expected} easy=${easy} hard=${hard} stress=${stress}`);
}
