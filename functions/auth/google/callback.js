import { WEB_CALLBACK, createSession, getCookie, googleToken, googleUser, redirect, readSignedValue, cookie, requireSecret, ensureDevice, linkDeviceAccount, upsertApiUser } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url); const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
  const stateValue = await readSignedValue(getCookie(request, 'apiuytin_oauth_state'), requireSecret(env));
  const clearState = cookie('apiuytin_oauth_state', '', { maxAge: 0 });
  if (!stateValue) return new Response('State OAuth bị thiếu hoặc đã hết hạn.', { status: 400, headers: { 'cache-control': 'no-store', 'set-cookie': clearState } });
  if (url.searchParams.get('error') || !code) return new Response('Đăng nhập Google đã bị hủy.', { status: 400, headers: { 'cache-control': 'no-store', 'set-cookie': clearState } });
  try {
    const expected = JSON.parse(stateValue); if (expected.kind !== 'web' || expected.state !== state || expected.exp < Date.now()) throw new Error('State OAuth không hợp lệ.');
    const token = await googleToken(code, env, WEB_CALLBACK);
    const googleProfile = await googleUser(token.access_token);
    const profile = await upsertApiUser(googleProfile, env);
    const device = await ensureDevice(request, env);
    await linkDeviceAccount(device.deviceHash, profile, env);
    const sessionCookie = await createSession({ userId: profile.id, ...profile }, env);
    const cookies = [sessionCookie, clearState];
    if (device.setCookie) cookies.push(device.setCookie);
    return redirect('/', { 'set-cookie': cookies });
  } catch { return new Response('Đăng nhập Google không thành công.', { status: 400, headers: { 'cache-control': 'no-store', 'set-cookie': clearState } }); }
}
