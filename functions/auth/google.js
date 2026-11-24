import { WEB_CALLBACK, createSession, googleAuthorize, randomSecret, redirect, signedValue, cookie, requireSecret } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const state = randomSecret('st_');
  const stateCookie = await signedValue(JSON.stringify({ state, kind: 'web', exp: Date.now() + 10 * 60 * 1000 }), requireSecret(env));
  const clientId = env.GOOGLE_CLIENT_ID || env.CLIENT_ID;
  if (!clientId) return new Response('Đăng nhập Google chưa được cấu hình.', { status: 500 });
  return redirect(googleAuthorize(clientId, state, WEB_CALLBACK), { 'set-cookie': cookie('apiuytin_oauth_state', stateCookie, { maxAge: 600 }) });
}
