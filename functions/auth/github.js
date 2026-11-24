import { GITHUB_CALLBACK, cookie, githubAuthorize, randomSecret, redirect, requireSecret, signedValue } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const clientId = String(env.GITHUB_CLIENT_ID || '').trim();
  if (!clientId) return new Response('Đăng nhập GitHub chưa được cấu hình.', { status: 500 });
  const state = randomSecret('st_');
  const stateCookie = await signedValue(JSON.stringify({ state, kind: 'github_web', exp: Date.now() + 10 * 60 * 1000 }), requireSecret(env));
  return redirect(githubAuthorize(clientId, state, GITHUB_CALLBACK), { 'set-cookie': cookie('apiuytin_oauth_state', stateCookie, { maxAge: 600 }) });
}
