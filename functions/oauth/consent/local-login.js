import { getActiveDevice, linkDeviceAccount, normalizeEmail, normalizeStoredUsername, normalizeUsername, profileFromStoredUser, sanityQuery, validEmail, validUsername, verifyPassword, redirect } from '../../_lib/auth.js';
import { getOAuthTransaction, transactionStatus } from '../../_lib/oauth.js';
import { renderConsentError, renderLocalLoginPage } from '../../_lib/consent.js';

function html(body, status = 200) {
  return new Response(body, { status, headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  } });
}

function errorMessage(status) {
  if (status === 'missing' || status === 'expired') return 'Phiên đăng nhập đã hết hạn. Hãy thử lại từ website tích hợp.';
  if (status === 'canceled') return 'Phiên đăng nhập này đã bị hủy. Hãy bắt đầu lại từ website tích hợp.';
  return 'Phiên đăng nhập này đã được xử lý. Hãy bắt đầu lại từ website tích hợp.';
}

async function loadContext(request, env, transactionToken) {
  const token = transactionToken || new URL(request.url).searchParams.get('transaction') || '';
  const transaction = await getOAuthTransaction(token, env);
  const status = transactionStatus(transaction);
  if (status !== 'active') return { error: errorMessage(status) };

  const device = await getActiveDevice(request, env);
  if (!device || device.deviceHash !== transaction.deviceHash) return { error: 'Thiết bị này chưa được xác thực cho phiên đăng nhập.' };

  const project = await sanityQuery('*[_type == "apiProject" && _id == $id && status == "active"][0]', { id: transaction.projectId }, env);
  if (!project || project.redirectUri !== transaction.redirectUri) return { error: 'Dự án không còn hoạt động hoặc callback đã thay đổi.' };
  return { token, transaction, project, device };
}

export async function onRequestGet({ request, env }) {
  try {
    const context = await loadContext(request, env);
    if (context.error) return html(renderConsentError(context.error), 400);
    return html(renderLocalLoginPage({ project: context.project, transaction: context.token }));
  } catch {
    return html(renderConsentError('Không thể tải màn hình đăng nhập tài khoản.'), 503);
  }
}

export async function onRequestPost({ request, env }) {
  let form;
  try { form = await request.formData(); } catch { return html(renderConsentError('Dữ liệu đăng nhập không hợp lệ.'), 400); }

  const identifier = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  const context = await loadContext(request, env, String(form.get('transaction') || ''));
  if (context.error) return html(renderConsentError(context.error), 400);

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
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return html(renderLocalLoginPage({ project: context.project, transaction: context.token, error: 'Tên tài khoản hoặc mật khẩu không đúng.' }), 401);
  }

  const profile = { ...profileFromStoredUser({ ...account, userId: account._id }), username: account.username || normalizeUsername(identifier) };
  await linkDeviceAccount(context.device.deviceHash, profile, env);
  const consentUrl = new URL('/oauth/consent', request.url);
  consentUrl.searchParams.set('transaction', context.token);
  return redirect(consentUrl.toString());
}
