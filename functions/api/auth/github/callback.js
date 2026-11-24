import { GITHUB_CALLBACK, cookie, createSession, ensureDevice, getCookie, githubToken, githubUser, linkDeviceAccount, randomSecret, redirect, readSignedValue, requireSecret, upsertGithubUser } from '../../../_lib/auth.js';
import { getOAuthTransaction, transactionIsActive } from '../../../_lib/oauth.js';

function failure(message, requestId, cookies = ['apiuytin_oauth_state']) {
  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  for (const name of cookies) headers.append('set-cookie', cookie(name, '', { maxAge: 0 }));
  if (requestId) headers.set('x-request-id', requestId);
  return new Response(message, { status: 400, headers });
}

function consentRedirect(request, transaction) {
  const url = new URL('/oauth/consent', request.url);
  url.searchParams.set('transaction', transaction);
  return url.toString();
}

async function projectAccountCallback({ request, env, url, state, code, signed }) {
  const stateValue = JSON.parse(signed);
  if (stateValue.kind !== 'project_add_account_github' || typeof stateValue.state !== 'string' || stateValue.state.length < 16 || stateValue.state.length > 256 || stateValue.exp < Date.now()) throw new Error('State GitHub không hợp lệ.');
  const transaction = await getOAuthTransaction(stateValue.transaction, env);
  if (!transactionIsActive(transaction)) throw new Error('Giao dịch OAuth đã hết hạn.');
  if (url.searchParams.get('error') || !code) return redirect(consentRedirect(request, stateValue.transaction));

  const token = await githubToken(code, env, GITHUB_CALLBACK);
  const githubProfile = await githubUser(token.access_token);
  const profile = await upsertGithubUser(githubProfile, env);
  const device = await ensureDevice(request, env);
  if (device.deviceHash !== transaction.deviceHash) throw new Error('Phiên thiết bị đã thay đổi.');
  await linkDeviceAccount(device.deviceHash, profile, env, { provider: 'github', githubAccountId: githubProfile.id });
  return redirect(consentRedirect(request, stateValue.transaction), device.setCookie ? { 'set-cookie': device.setCookie } : {});
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const requestId = randomSecret('github_err_').slice(0, 24);
  try {
    const secret = requireSecret(env);
    const projectSigned = await readSignedValue(state, secret);
    if (projectSigned) {
      try {
        return await projectAccountCallback({ request, env, url, state, code, signed: projectSigned });
      } catch (error) {
        console.error(JSON.stringify({ event: 'oauth_github_project_callback_failed', requestId, error: error?.name || 'Error' }));
        return failure(`Đăng nhập OAuth cho dự án không thành công. Mã lỗi: ${requestId}`, requestId, ['apiuytin_project_state']);
      }
    }

    const stateValue = await readSignedValue(getCookie(request, 'apiuytin_oauth_state'), secret);
    const clearState = cookie('apiuytin_oauth_state', '', { maxAge: 0 });
    if (!stateValue) return new Response('State OAuth bị thiếu hoặc đã hết hạn.', { status: 400, headers: { 'cache-control': 'no-store', 'set-cookie': clearState } });
    if (url.searchParams.get('error') || !code) return new Response('Đăng nhập GitHub đã bị hủy.', { status: 400, headers: { 'cache-control': 'no-store', 'set-cookie': clearState } });

    const expected = JSON.parse(stateValue);
    if (expected.kind !== 'github_web' || expected.state !== state || expected.exp < Date.now()) throw new Error('State OAuth không hợp lệ.');
    const token = await githubToken(code, env, GITHUB_CALLBACK);
    const githubProfile = await githubUser(token.access_token);
    const profile = await upsertGithubUser(githubProfile, env);
    const device = await ensureDevice(request, env);
    await linkDeviceAccount(device.deviceHash, profile, env, { provider: 'github', githubAccountId: githubProfile.id });
    const sessionCookie = await createSession({ userId: profile.id, ...profile }, env);
    const cookies = [sessionCookie, clearState];
    if (device.setCookie) cookies.push(device.setCookie);
    return redirect('/', { 'set-cookie': cookies });
  } catch (error) {
    console.error(JSON.stringify({ event: 'oauth_github_callback_failed', requestId, error: error?.name || 'Error' }));
    return failure(`Đăng nhập GitHub không thành công. Mã lỗi: ${requestId}`, requestId);
  }
}
