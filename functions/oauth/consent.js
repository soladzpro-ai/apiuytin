import { getActiveDevice, hash, profileFromStoredUser, listDeviceAccounts, sanityMutate, sanityQuery } from '../_lib/auth.js';
import { callbackRedirect, cancelOAuthTransaction, getOAuthTransaction, getReusableAuthorizationCode, issueAuthorizationCode, transactionStatus } from '../_lib/oauth.js';
import { renderConsentError, renderConsentPage } from '../_lib/consent.js';

function html(body, status = 200, callbackOrigin = '') {
  const formAction = callbackOrigin ? `'self' ${callbackOrigin}` : "'self'";
  return new Response(body, { status, headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  } });
}

async function loadContext(request, env) {
  const token = new URL(request.url).searchParams.get('transaction');
  const transaction = await getOAuthTransaction(token, env);
  const status = transactionStatus(transaction);
  if (status === 'missing' || status === 'expired') return { error: 'Phiên đăng nhập đã hết hạn. Hãy thử lại từ website tích hợp.' };
  if (status !== 'active') return { error: 'Phiên đăng nhập này đã được xử lý. Hãy bắt đầu lại từ website tích hợp.' };
  const device = await getActiveDevice(request, env);
  if (!device || device.deviceHash !== transaction.deviceHash) return { error: 'Thiết bị này chưa được xác thực cho phiên đăng nhập.' };
  const project = await sanityQuery('*[_type == "apiProject" && _id == $id && status == "active"][0]', { id: transaction.projectId }, env);
  if (!project || project.redirectUri !== transaction.redirectUri) return { error: 'Dự án không còn hoạt động hoặc callback đã thay đổi.' };
  return { token, transaction, project, deviceHash: device.deviceHash };
}

export async function onRequestGet({ request, env }) {
  try {
    const context = await loadContext(request, env);
    if (context.error) return html(renderConsentError(context.error), 400);
    const records = await listDeviceAccounts(context.deviceHash, env);
    return html(renderConsentPage({ project: context.project, transaction: context.token, accounts: records }), 200, new URL(context.project.redirectUri).origin);
  } catch {
    return html(renderConsentError('Không thể tải phiên đăng nhập.'), 500);
  }
}

async function handleConsentPost({ request, env, waitUntil }) {
  let form;
    try { form = await request.formData(); } catch { return html(renderConsentError('Dữ liệu biểu mẫu đồng ý không hợp lệ.'), 400); }

  const token = String(form.get('transaction') || '');
  const transaction = await getOAuthTransaction(token, env);
  const status = transactionStatus(transaction);
  if (status === 'missing' || status === 'expired') return html(renderConsentError('Phiên đăng nhập đã hết hạn. Hãy thử lại từ website tích hợp.'), 400);
  if (status === 'canceled') return html(renderConsentError('Phiên đăng nhập này đã bị hủy. Hãy bắt đầu lại từ website tích hợp.'), 400);

  const accountId = String(form.get('account_id') || '');
  const submittedIntent = String(form.get('intent') || '').trim().toLowerCase();
  const intent = submittedIntent || (accountId ? 'continue' : '');
  if (intent !== 'cancel' && intent !== 'continue') return html(renderConsentError('Thao tác đồng ý không hợp lệ.'), 400);

  const device = await getActiveDevice(request, env);
  if (!device || device.deviceHash !== transaction.deviceHash) return html(renderConsentError('Thiết bị này chưa được xác thực cho phiên đăng nhập.'), 403);

  if (intent === 'cancel') {
    if (status !== 'active') return html(renderConsentError('Phiên đăng nhập này đã được xử lý. Hãy bắt đầu lại từ website tích hợp.'), 409);
    await cancelOAuthTransaction(transaction, env);
    return callbackRedirect(transaction, { error: 'access_denied' });
  }

  const deviceHash = device.deviceHash;

  const project = await sanityQuery('*[_type == "apiProject" && _id == $id && status == "active"][0]', { id: transaction.projectId }, env);
  if (!project || project.redirectUri !== transaction.redirectUri) return html(renderConsentError('Dự án không còn hoạt động hoặc callback đã thay đổi.'), 400);

  const account = await sanityQuery('*[_type == "apiDeviceAccount" && _id == $id && deviceHash == $deviceHash][0]', { id: accountId, deviceHash }, env);
  if (!account) return html(renderConsentError('Tài khoản đã chọn không thuộc thiết bị này.'), 403);

  const profile = profileFromStoredUser(account);
  if (transaction.selectedUserId && transaction.selectedUserId !== profile.id) return html(renderConsentError('Phiên đăng nhập này đã được chọn tài khoản khác.'), 409);
  if (status === 'selected') {
    const code = await getReusableAuthorizationCode(transaction, env);
    if (!code) return html(renderConsentError('Mã đăng nhập của phiên này đã được sử dụng hoặc hết hạn. Hãy bắt đầu lại từ website tích hợp.'), 409);
    return callbackRedirect(transaction, { code });
  }

  const projectUserId = `project-user-${(await hash(`${project._id}:${profile.id}`)).slice(0, 40)}`;
  const now = new Date().toISOString();
  const projectUserMutations = [
    { createIfNotExists: { _id: projectUserId, _type: 'apiProjectUser', projectId: project._id, userId: profile.id, email: profile.email, name: profile.name, displayName: profile.displayName || profile.name, nickname: profile.nickname || '', avatar: profile.picture, picture: profile.picture, given_name: profile.given_name, family_name: profile.family_name, locale: profile.locale, verified_email: profile.verified_email, firstLoginAt: now } },
    { patch: { id: projectUserId, set: { userId: profile.id, email: profile.email, name: profile.name, displayName: profile.displayName || profile.name, nickname: profile.nickname || '', avatar: profile.picture, picture: profile.picture, given_name: profile.given_name, family_name: profile.family_name, locale: profile.locale, verified_email: profile.verified_email, lastLoginAt: now } } }
  ];
  try {
    const code = await issueAuthorizationCode(transaction, profile, env);
    const persistProjectUser = sanityMutate(projectUserMutations, env).catch(error => {
      console.error(JSON.stringify({ event: 'oauth_project_user_sync_failed', error: error?.name || 'Error' }));
    });
    if (typeof waitUntil === 'function') waitUntil(persistProjectUser);
    else await persistProjectUser;
    return callbackRedirect(transaction, { code });
  } catch {
    return html(renderConsentError('Phiên đăng nhập này vừa được xử lý bằng một tài khoản khác.'), 409);
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  try {
    return await handleConsentPost({ request, env, waitUntil });
  } catch {
    return html(renderConsentError('Dịch vụ consent tạm thời không khả dụng. Hãy thử lại từ website tích hợp.'), 503);
  }
}

