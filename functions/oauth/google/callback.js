import { PROJECT_CALLBACK, cookie, ensureDevice, googleToken, googleUser, linkDeviceAccount, randomSecret, redirect, readSignedValue, requireSecret, upsertApiUser } from '../../_lib/auth.js';
import { getOAuthTransaction, transactionIsActive } from '../../_lib/oauth.js';

function failure(message, requestId) {
  const headers = {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': cookie('apiuytin_project_state', '', { maxAge: 0 })
  };
  if (requestId) headers['x-request-id'] = requestId;
  return new Response(message, { status: 400, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const signed = await readSignedValue(state, requireSecret(env));
  if (!signed) return failure('State OAuth bị thiếu hoặc đã hết hạn.');

  const requestId = randomSecret('oauth_err_').slice(0, 24);
  let stage = 'validate_state';
  try {
    const stateValue = JSON.parse(signed);
    if (stateValue.kind !== 'project_add_account' || typeof stateValue.state !== 'string' || stateValue.state.length < 16 || stateValue.state.length > 256 || stateValue.exp < Date.now()) throw new Error('State OAuth không hợp lệ.');
    stage = 'load_transaction';
    const transaction = await getOAuthTransaction(stateValue.transaction, env);
    if (!transactionIsActive(transaction)) throw new Error('Giao dịch OAuth đã hết hạn.');

    if (url.searchParams.get('error') || !code) {
      const consentUrl = new URL('/oauth/consent', request.url);
      consentUrl.searchParams.set('transaction', stateValue.transaction);
      return redirect(consentUrl.toString());
    }

    stage = 'exchange_google_code';
    const token = await googleToken(code, env, PROJECT_CALLBACK);
    stage = 'load_google_profile';
    const googleProfile = await googleUser(token.access_token);
    stage = 'upsert_api_user';
    const profile = await upsertApiUser(googleProfile, env);
    stage = 'verify_device';
    const device = await ensureDevice(request, env);
    if (device.deviceHash !== transaction.deviceHash) throw new Error('Phiên thiết bị đã thay đổi.');
    stage = 'link_device_account';
    await linkDeviceAccount(device.deviceHash, profile, env);

    // Project access is granted only after the user presses Continue on the
    // chooser. The consent POST owns the project-user mutation; doing it here
    // made Google bootstrap fail before the chooser could reopen.
    stage = 'return_to_consent';
    const consentUrl = new URL('/oauth/consent', request.url);
    consentUrl.searchParams.set('transaction', stateValue.transaction);
    const headers = device.setCookie ? { 'set-cookie': device.setCookie } : {};
    return redirect(consentUrl.toString(), headers);
  } catch (error) {
    console.error(JSON.stringify({ event: 'oauth_google_callback_failed', requestId, stage, error: error?.name || 'Error' }));
    return failure(`Đăng nhập OAuth cho dự án không thành công. Mã lỗi: ${requestId}`, requestId);
  }
}

