import { API_BASE, bearer, cookie, createSession, hash, hashPassword, json, normalizeEmail as sharedNormalizeEmail, normalizeStoredUsername, normalizeUsername as sharedNormalizeUsername, profileFromStoredUser, publicProject, randomSecret, readSignedValue, requireSecret, resolveApiUser, sanityMutate, sanityMutateBatched, sanityQuery, sanityUploadImage, session, sessionWithCompleteEmail, signedValue, validateRedirectUri, validEmail as sharedValidEmail, validUsername as sharedValidUsername, verifyPassword } from '../../_lib/auth.js';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function createProject(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const redirectUri = typeof body.redirectUri === 'string' ? validateRedirectUri(body.redirectUri) : null;
  if (!name || name.length > 120 || !redirectUri) return json({ error: 'Bắt buộc có tên và redirectUri HTTPS hợp lệ.' }, 400);

  const clientId = randomSecret('pk_');
  const apiKey = randomSecret('CHUOTAPI_');
  const projectId = `project-${await hash(clientId)}`;
  const createdAt = new Date().toISOString();
  await sanityMutate([{ create: {
    _id: projectId,
    _type: 'apiProject',
    ownerId: user.userId,
    name,
    redirectUri,
    publishKey: clientId,
    apiKeyHash: await hash(apiKey),
    createdAt,
    status: 'active'
  } }], env);

  return json({
    project: await publicProject({ _id: projectId, name, redirectUri, publishKey: clientId, apiKey, createdAt, status: 'active' }, env, true),
    warning: 'API key chỉ hiển thị một lần. Hãy lưu key ở server-side của ứng dụng tích hợp.'
  }, 201);
}

function profileFromCode(authCode) {
  return {
    id: authCode.userId || '',
    sub: authCode.userId || '',
    email: authCode.email || '',
    name: authCode.displayName || authCode.name || authCode.email || '',
    displayName: authCode.displayName || authCode.name || authCode.email || '',
    nickname: authCode.nickname || '',
    picture: authCode.picture || '',
    given_name: authCode.given_name || '',
    family_name: authCode.family_name || '',
    locale: authCode.locale || '',
    verified_email: authCode.verified_email === true
  };
}

async function accountDocument(userId, env) {
  return resolveApiUser(await normalizeStoredUsername(await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: userId }, env), env), env);
}

function accountResponse(userId, document) {
  const stableUserId = document?._id || userId;
  const response = { userId: stableUserId, ...profileFromStoredUser({ ...document, userId: stableUserId }) };
  if (typeof document.username === 'string' && document.username) response.username = document.username;
  if (typeof document.provider === 'string' && document.provider) response.provider = document.provider;
  if (typeof document.googleAccountId === 'string' && document.googleAccountId) response.googleAccountId = document.googleAccountId;
  return response;
}

function normalizeUsername(value) {
  return sharedNormalizeUsername(value);
}

function normalizeEmail(value) {
  return sharedNormalizeEmail(value);
}

function validUsername(value) {
  return sharedValidUsername(value);
}

function validEmail(value) {
  return sharedValidEmail(value);
}

function hasCompleteEmail(value) {
  return validEmail(normalizeEmail(value));
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

async function registerAccount(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const allowedFields = new Set(['username', 'email', 'password', 'confirmPassword']);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedFields.has(key))) return json({ error: 'invalid_request' }, 400);

  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  if (!validUsername(username)) return json({ error: 'invalid_username' }, 400);
  if (!validEmail(email)) return json({ error: 'invalid_email' }, 400);
  if (!validPassword(body.password)) return json({ error: 'invalid_password' }, 400);
  if (body.password !== body.confirmPassword) return json({ error: 'password_mismatch' }, 400);

  const userId = `user-local-${(await hash(`local:${username}`)).slice(0, 32)}`;
  const existing = await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: userId }, env);
  if (existing) return json({ error: 'account_exists' }, 409);
  const existingEmail = await sanityQuery('*[_type == "apiUser" && lower(email) == $email][0]', { email }, env);
  if (existingEmail) return json({ error: 'email_exists' }, 409);

  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();
  const document = {
    _id: userId,
    _type: 'apiUser',
    provider: 'password',
    username,
    passwordHash,
    email,
    name: username,
    displayName: username,
    nickname: '',
    picture: '',
    given_name: '',
    family_name: '',
    locale: 'vi',
    verified_email: false,
    createdAt: now
  };

  try {
    await sanityMutate([{ createIfNotExists: document }], env);
  } catch {
    const current = await accountDocument(userId, env);
    if (!current) throw new Error('Không thể tạo tài khoản APIUYTIN');
    return json({ error: 'account_exists' }, 409);
  }

  const current = await accountDocument(userId, env);
  if (!current) throw new Error('Không thể xác nhận tài khoản APIUYTIN sau khi tạo');
  if (current.passwordHash !== passwordHash) return json({ error: 'account_exists' }, 409);
  const profile = accountResponse(userId, current);
  return json({ user: profile }, 201, { 'set-cookie': await createSession({ userId, ...profile }, env) });
}

async function loginAccount(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const allowedFields = new Set(['username', 'password']);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedFields.has(key))) return json({ error: 'invalid_request' }, 400);
  const identifier = typeof body.username === 'string' ? body.username.trim() : '';
  if (!validPassword(body.password)) return json({ error: 'invalid_credentials' }, 401);

  let account = null;
  if (identifier.includes('@')) {
    const email = normalizeEmail(identifier);
    if (validEmail(email)) {
      account = await normalizeStoredUsername(await sanityQuery('*[_type == "apiUser" && provider == "password" && lower(email) == $email][0]', { email }, env), env);
    }
  } else {
    const username = normalizeUsername(identifier);
    if (validUsername(username)) {
      account = await normalizeStoredUsername(await sanityQuery('*[_type == "apiUser" && provider == "password" && lower(username) == $username][0]', { username }, env), env);
    }
  }
  if (!account || !(await verifyPassword(body.password, account.passwordHash))) return json({ error: 'invalid_credentials' }, 401);
  const profile = accountResponse(account._id, account);
  return json({ user: profile }, 200, { 'set-cookie': await createSession({ userId: account._id, ...profile }, env) });
}

async function syncProfileCopies(profile, source, env, attempt = 0) {
  const [deviceAccounts, projectUsers] = await Promise.all([
    sanityQuery('*[_type == "apiDeviceAccount" && userId == $userId]{_id,_rev,profileUpdatedAt}', { userId: profile.id }, env),
    sanityQuery('*[_type == "apiProjectUser" && userId == $userId]{_id,_rev,profileUpdatedAt}', { userId: profile.id }, env)
  ]);
  const profileUpdatedAt = source.updatedAt || source.profileUpdatedAt || new Date().toISOString();
  const fields = {
    userId: profile.id,
    email: profile.email,
    name: source.name || profile.name,
    displayName: profile.displayName || profile.name,
    nickname: profile.nickname || '',
    picture: profile.picture,
    avatar: profile.picture,
    customPicture: source.customPicture || '',
    googlePicture: source.googlePicture || source.picture || '',
    given_name: profile.given_name,
    family_name: profile.family_name,
    locale: profile.locale,
    verified_email: profile.verified_email,
    profileUpdatedAt
  };
  const copies = [...deviceAccounts, ...projectUsers].filter(item => item?._id && (!item.profileUpdatedAt || Date.parse(item.profileUpdatedAt) < Date.parse(profileUpdatedAt)));
  if (!copies.length) return;
  try {
    await sanityMutateBatched(copies.map(item => ({ patch: { id: item._id, ifRevisionID: item._rev, set: fields } })), env);
  } catch (error) {
    if (attempt < 2) return syncProfileCopies(profile, source, env, attempt + 1);
    throw error;
  }
}

function scheduleProfileSync(task, waitUntil) {
  if (typeof waitUntil === 'function') {
    waitUntil(Promise.resolve().then(task).catch(() => undefined));
    return null;
  }
  return task();
}

async function accountMe(request, env) {
  const user = await session(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const document = await accountDocument(user.userId, env);
  if (!document) return json({ error: 'account_not_found' }, 404);
  return json({ user: accountResponse(user.userId, document) });
}

function hasImmutableProfileField(body) {
  return ['id', 'sub', 'googleId', 'google_id', 'providerSubjectHash'].some(field => Object.hasOwn(body, field));
}

async function updateAccountProfile(request, env, waitUntil) {
  const user = await session(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400);
  if (hasImmutableProfileField(body)) return json({ error: 'immutable_profile_fields' }, 400);
  if (Object.keys(body).some(key => !['displayName', 'nickname', 'email', 'username'].includes(key))) return json({ error: 'invalid_profile_fields' }, 400);
  if (Object.values(body).some(value => typeof value !== 'string')) return json({ error: 'invalid_profile_fields' }, 400);

  const document = await accountDocument(user.userId, env);
  if (!document) return json({ error: 'account_not_found' }, 404);
  const emailRequested = Object.hasOwn(body, 'email');
  if (!hasCompleteEmail(document.email) && !emailRequested) return json({ error: 'email_required' }, 403);
  const usernameRequested = Object.hasOwn(body, 'username');
  const storedUsername = typeof document.username === 'string' ? document.username : '';
  let username = storedUsername;
  if (usernameRequested) {
    if (validUsername(storedUsername)) return json({ error: 'username_already_set' }, 409);
    username = normalizeUsername(body.username);
    if (!validUsername(username)) return json({ error: 'invalid_username' }, 400);
    const existingUsername = await sanityQuery('*[_type == "apiUser" && lower(username) == $username && _id != $id][0]', { username, id: document._id }, env);
    if (existingUsername) return json({ error: 'username_exists' }, 409);
  }
  const storedEmail = normalizeEmail(document.email);
  let email = storedEmail;
  if (emailRequested) {
    if (storedEmail) return json({ error: 'email_already_set' }, 409);
    email = normalizeEmail(body.email);
    if (!validEmail(email)) return json({ error: 'invalid_email' }, 400);
    const existingEmail = await sanityQuery('*[_type == "apiUser" && lower(email) == $email && _id != $id][0]', { email, id: document._id }, env);
    if (existingEmail) return json({ error: 'email_exists' }, 409);
  }
  const displayName = Object.hasOwn(body, 'displayName') ? body.displayName.trim() : (document.displayName || document.name || document.email || '');
  const nickname = Object.hasOwn(body, 'nickname') ? body.nickname.trim() : (document.nickname || '');
  if (!displayName || displayName.length > 120 || nickname.length > 80) return json({ error: 'profile_field_too_long' }, 400);

  await sanityMutate([{ patch: { id: document._id, ifRevisionID: document._rev, set: { displayName, nickname, ...(emailRequested ? { email } : {}), ...(usernameRequested ? { username } : {}), updatedAt: new Date().toISOString() } } }], env);
  const nextDocument = { ...document, displayName, nickname, ...(emailRequested ? { email } : {}), ...(usernameRequested ? { username } : {}) };
  const profile = { ...profileFromStoredUser({ ...nextDocument, userId: user.userId }), username: nextDocument.username || '' };
  await scheduleProfileSync(() => syncProfileCopies(profile, nextDocument, env), waitUntil);
  const sessionCookie = await createSession({ userId: user.userId, ...profile }, env);
  return json({ user: accountResponse(user.userId, nextDocument) }, 200, { 'set-cookie': sessionCookie });
}

async function uploadAccountAvatar(request, env, waitUntil) {
  const user = await session(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let form;
  try { form = await request.formData(); } catch { return json({ error: 'invalid_form_data' }, 400); }
  const file = form.get('avatar') || form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'avatar_required' }, 400);
  if (!AVATAR_TYPES.has(file.type)) return json({ error: 'avatar_type_not_allowed' }, 400);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_AVATAR_BYTES) return json({ error: 'avatar_too_large' }, 400);

  const document = await accountDocument(user.userId, env);
  if (!document) return json({ error: 'account_not_found' }, 404);
  if (!hasCompleteEmail(document.email)) return json({ error: 'email_required' }, 403);
  const asset = await sanityUploadImage(file, env);
  const googlePicture = document.googlePicture || document.picture || '';
  try {
    await sanityMutate([{ patch: {
      id: document._id,
      ifRevisionID: document._rev,
      set: {
        customPicture: asset.url,
        avatarAsset: { _type: 'reference', _ref: asset.id },
        picture: document.picture || googlePicture,
        googlePicture,
        updatedAt: new Date().toISOString()
      }
    } }], env);
  } catch (error) {
    const current = await accountDocument(user.userId, env);
    if (current?.customPicture !== asset.url) {
      try { await sanityMutate([{ delete: { id: asset.id } }], env); } catch { /* orphan cleanup is best effort */ }
      if (current) return json({ error: 'profile_changed_retry' }, 409);
      throw error;
    }
  }

  const nextDocument = { ...document, customPicture: asset.url, avatarAsset: { _type: 'reference', _ref: asset.id }, googlePicture };
  const profile = profileFromStoredUser({ ...nextDocument, userId: user.userId });
  await scheduleProfileSync(() => syncProfileCopies(profile, nextDocument, env), waitUntil);
  const sessionCookie = await createSession({ userId: user.userId, ...profile }, env);
  return json({ user: accountResponse(user.userId, nextDocument), asset: { url: asset.url } }, 200, { 'set-cookie': sessionCookie });
}

async function token(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const allowedFields = new Set(['client_id', 'api_key', 'code', 'redirect_uri']);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowedFields.has(key)) || !Object.values(body).every(value => typeof value === 'string') || !body.client_id || !body.api_key || !body.code || !body.redirect_uri) return json({ error: 'invalid_client' }, 401);
  if (body.client_id.length > 256 || body.api_key.length > 256 || body.code.length > 512 || body.redirect_uri.length > 2048) return json({ error: 'invalid_client' }, 401);

  const project = await sanityQuery('*[_type == "apiProject" && publishKey == $clientId][0]', { clientId: body.client_id }, env);
  if (!project || project.status !== 'active' || project.apiKeyHash !== await hash(body.api_key) || body.redirect_uri !== project.redirectUri) return json({ error: 'invalid_client' }, 401);

  const authCode = await sanityQuery('*[_type == "apiAuthCode" && codeHash == $codeHash][0]', { codeHash: await hash(body.code) }, env);
  const authCodeExpiresAt = authCode && Date.parse(authCode.expiresAt);
  if (!authCode || !Number.isFinite(authCodeExpiresAt) || authCode.projectId !== project._id || authCode.clientId !== project.publishKey || authCode.redirectUri !== project.redirectUri || authCode.consumedAt || authCodeExpiresAt < Date.now()) return json({ error: 'invalid_grant' }, 400);
  if (!authCode.userId) return json({ error: 'invalid_grant' }, 400);
  if (!hasCompleteEmail(authCode.email)) return json({ error: 'email_required' }, 403);

  try {
    await sanityMutate([{ patch: { id: authCode._id, ifRevisionID: authCode._rev, set: { consumedAt: new Date().toISOString() } } }], env);
  } catch {
    return json({ error: 'invalid_grant' }, 400);
  }

  const profile = profileFromCode(authCode);
  const accessToken = await signedValue(JSON.stringify({ projectId: project._id, profile, exp: Date.now() + 3600 * 1000 }), requireSecret(env));
  return json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, user: profile });
}

async function projectFromApiKey(request, env) {
  const apiKey = bearer(request);
  if (!apiKey) return null;
  return sanityQuery('*[_type == "apiProject" && apiKeyHash == $apiKeyHash && status == "active"][0]', { apiKeyHash: await hash(apiKey) }, env);
}

async function userinfo(request, env) {
  const tokenValue = bearer(request);
  const signed = tokenValue && await readSignedValue(tokenValue, requireSecret(env));
  if (!signed) return json({ error: 'unauthorized' }, 401);
  try {
    const value = JSON.parse(signed);
    if (!Number.isFinite(value.exp) || value.exp < Date.now()) return json({ error: 'token_expired' }, 401);
    const project = await sanityQuery('*[_type == "apiProject" && _id == $id && status == "active"][0]', { id: value.projectId }, env);
    if (!project || !value.profile) return json({ error: 'project_revoked' }, 401);
    let currentProfile = value.profile;
    try {
      const account = await resolveApiUser(await sanityQuery('*[_type == "apiUser" && _id == $id][0]', { id: value.profile.id }, env), env);
      if (account?._type === 'apiUser') currentProfile = profileFromStoredUser(account);
    } catch {
      // The signed snapshot remains a safe fallback when the profile read is transiently unavailable.
    }
    if (!hasCompleteEmail(currentProfile.email)) return json({ error: 'email_required' }, 403);
    return json(currentProfile);
  } catch {
    return json({ error: 'unauthorized' }, 401);
  }
}

async function projectInfo(request, env) {
  const project = await projectFromApiKey(request, env);
  if (!project) return json({ error: 'invalid_api_key' }, 401);
  return json({ id: project._id, name: project.name, clientId: project.publishKey, redirectUri: project.redirectUri, status: project.status || 'active' });
}

async function allUsers(request, env) {
  const project = await projectFromApiKey(request, env);
  if (!project) return json({ error: 'invalid_api_key' }, 401);
  const users = await sanityQuery('*[_type == "apiProjectUser" && projectId == $projectId] | order(displayName asc)', { projectId: project._id }, env);
  return json({ project: { id: project._id, name: project.name }, users: users.map(item => ({ id: item.userId || item._id, email: item.email, displayName: item.displayName || item.name, nickname: item.nickname || '', avatar: item.avatar || item.picture || '', given_name: item.given_name || '', family_name: item.family_name || '', locale: item.locale || '', verified_email: item.verified_email === true, firstLoginAt: item.firstLoginAt, lastLoginAt: item.lastLoginAt })) });
}

async function cleanupRevokedProject(env, projectId) {
  const [codes, projectUsers, transactions] = await Promise.all([
    sanityQuery('*[_type == "apiAuthCode" && projectId == $projectId]._id', { projectId }, env),
    sanityQuery('*[_type == "apiProjectUser" && projectId == $projectId]._id', { projectId }, env),
    sanityQuery('*[_type == "apiOAuthTransaction" && projectId == $projectId]._id', { projectId }, env)
  ]);
  const childIds = [...new Set([...codes, ...projectUsers, ...transactions])];
  const childMutations = childIds.map(id => ({ delete: { id } }));
  // Queries retry transient failures; mutations are bounded and intentionally
  // not retried blindly. A later revoke call can safely resume by re-reading
  // the deterministic child IDs if a mutation outcome is unknown.
  if (childMutations.length) await sanityMutateBatched(childMutations, env);
  await sanityMutate([{ delete: { id: projectId } }], env);
  return childMutations.length + 1;
}

async function revokeProject(request, env, user, projectId, waitUntil) {
  let project = await sanityQuery('*[_type == "apiProject" && _id == $id && ownerId == $ownerId][0]', { id: projectId, ownerId: user.userId }, env, 1);
  if (!project) return json({ error: 'project_not_found' }, 404);
  if (project.status !== 'revoked') {
    try {
      await sanityMutate([{ patch: {
        id: project._id,
        ifRevisionID: project._rev,
        set: { status: 'revoked', revokedAt: new Date().toISOString(), cleanupStatus: 'pending' }
      } }], env);
    } catch (error) {
      project = await sanityQuery('*[_type == "apiProject" && _id == $id && ownerId == $ownerId][0]', { id: projectId, ownerId: user.userId }, env, 1);
      if (project?.status !== 'revoked') throw error;
    }
  }

  const cleanup = cleanupRevokedProject(env, projectId).catch(async () => {
    try {
      const current = await sanityQuery('*[_type == "apiProject" && _id == $id][0]', { id: projectId }, env);
      if (current) await sanityMutate([{ patch: {
        id: current._id,
        ifRevisionID: current._rev,
        set: { cleanupStatus: 'failed', cleanupFailedAt: new Date().toISOString() }
      } }], env);
    } catch {
      // Keep revoke fail-closed even if cleanup status cannot be recorded.
    }
  });

  if (typeof waitUntil === 'function') {
    waitUntil(cleanup);
    return json({ ok: true, revokedProjectId: projectId, cleanupScheduled: true, alreadyRevoked: project.status === 'revoked' });
  }

  await cleanup;
  return json({ ok: true, revokedProjectId: projectId, cleanupScheduled: false, alreadyRevoked: project.status === 'revoked' });
}

async function rotateApiKey(request, env, user, projectId) {
  const project = await sanityQuery('*[_type == "apiProject" && _id == $id && ownerId == $ownerId && status != "revoked"][0]', { id: projectId, ownerId: user.userId }, env);
  if (!project) return json({ error: 'project_not_found' }, 404);
  const apiKey = randomSecret('CHUOTAPI_');
  const apiKeyHash = await hash(apiKey);
  try {
    await sanityMutate([{ patch: { id: project._id, ifRevisionID: project._rev, set: { apiKeyHash, apiKeyRotatedAt: new Date().toISOString() } } }], env);
  } catch (error) {
    // A timeout can leave the write outcome unknown. Re-read before deciding
    // whether this exact generated key was committed or another rotation won.
    const current = await sanityQuery('*[_type == "apiProject" && _id == $id && ownerId == $ownerId && status != "revoked"][0]', { id: projectId, ownerId: user.userId }, env, 1);
    if (!current) throw error;
    if (current.apiKeyHash !== apiKeyHash) return json({ error: 'key_rotation_conflict' }, 409);
  }
  return json({ project: await publicProject({ ...project, apiKey }, env, true), warning: 'API key cũ đã bị vô hiệu hóa. Key mới chỉ hiển thị một lần.' });
}

export async function onRequest({ request, env, params, waitUntil }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' } });
  const pathParam = params.path || '';
  const path = Array.isArray(pathParam) ? pathParam.join('/') : pathParam;

  try {
    if (path === '' && request.method === 'GET') return json({ service: 'apiuytin-auth', baseUrl: API_BASE, endpoints: { authorize: '/oauth/google', token: `${API_BASE}/oauth/token`, register: `${API_BASE}/register`, login: `${API_BASE}/login`, userinfo: `${API_BASE}/userinfo`, me: `${API_BASE}/me`, meAvatar: `${API_BASE}/me/avatar`, projectInfo: `${API_BASE}/project-info`, allUsers: `${API_BASE}/allusers`, projects: `${API_BASE}/projects`, rotateKey: `${API_BASE}/projects/:id/rotate-key` } });
    if (path === 'health' && request.method === 'GET') return json({ ok: true, service: 'apiuytin-auth', baseUrl: API_BASE });
    if (path === 'register' && request.method === 'POST') return registerAccount(request, env);
    if (path === 'login' && request.method === 'POST') return loginAccount(request, env);
    if (path === 'userinfo' && request.method === 'GET') return userinfo(request, env);
    if (path === 'project-info' && request.method === 'GET') return projectInfo(request, env);
    if (path === 'allusers' && request.method === 'GET') return allUsers(request, env);
    if (path === 'session' && request.method === 'GET') {
      const user = await session(request, env);
      if (!user) return json({ user: null, projects: [] });
      const account = await accountDocument(user.userId, env);
      const currentUser = account ? accountResponse(user.userId, account) : user;
      const emailRequired = !hasCompleteEmail(currentUser.email);
      const projects = emailRequired ? [] : await sanityQuery('*[_type == "apiProject" && ownerId == $ownerId && (!defined(status) || status != "revoked")] | order(createdAt desc)', { ownerId: currentUser.userId || user.userId }, env);
      return json({ user: currentUser, emailRequired, projects: await Promise.all(projects.map(item => publicProject(item, env))) });
    }
    if (path === 'me' && request.method === 'GET') return accountMe(request, env);
    if (path === 'me' && request.method === 'PATCH') return updateAccountProfile(request, env, waitUntil);
    if (path === 'me/avatar' && request.method === 'POST') return uploadAccountAvatar(request, env, waitUntil);
    if (path === 'logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('apiuytin_session', '', { maxAge: 0 }) });

    const rotateMatch = path.match(/^projects\/([^/]+)\/rotate-key$/);
    if (rotateMatch && request.method === 'POST') {
      const authenticated = await sessionWithCompleteEmail(request, env);
      if (authenticated.response) return authenticated.response;
      return rotateApiKey(request, env, authenticated.user, rotateMatch[1]);
    }

    const revokeMatch = path.match(/^projects\/([^/]+)\/revoke$/);
    if (revokeMatch && request.method === 'POST') {
      const authenticated = await sessionWithCompleteEmail(request, env);
      if (authenticated.response) return authenticated.response;
      return revokeProject(request, env, authenticated.user, revokeMatch[1], waitUntil);
    }

    if (path === 'projects' && request.method === 'GET') {
      const authenticated = await sessionWithCompleteEmail(request, env);
      if (authenticated.response) return authenticated.response;
      const projects = await sanityQuery('*[_type == "apiProject" && ownerId == $ownerId && (!defined(status) || status != "revoked")] | order(createdAt desc)', { ownerId: authenticated.user.userId }, env);
      return json({ projects: await Promise.all(projects.map(item => publicProject(item, env))) });
    }
    if (path === 'projects' && request.method === 'POST') {
      const authenticated = await sessionWithCompleteEmail(request, env);
      if (authenticated.response) return authenticated.response;
      return createProject(request, env, authenticated.user);
    }
    if (path === 'oauth/token' && request.method === 'POST') return token(request, env);
    return json({ error: 'not_found' }, 404);
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
}

