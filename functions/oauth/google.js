import { findProjectByPublishKey, ensureDevice, json, redirect, validateRedirectUri } from '../_lib/auth.js';
import { createOAuthTransaction } from '../_lib/oauth.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = validateRedirectUri(url.searchParams.get('redirect_uri'));
  const clientState = url.searchParams.get('state') || '';
  if (!clientId || clientId.length > 256 || !redirectUri || !clientState || clientState.length > 2048) {
    return json({ error: 'Bắt buộc có client_id, redirect_uri và state; redirect_uri phải là URL HTTPS hợp lệ.' }, 400);
  }

  try {
    const project = await findProjectByPublishKey(clientId, env);
    if (!project || project.status !== 'active' || project.redirectUri !== redirectUri) return json({ error: 'Client không tồn tại hoặc redirect_uri chưa được đăng ký.' }, 401);

    const device = await ensureDevice(request, env);
    const transaction = await createOAuthTransaction({ project, redirectUri, clientState, deviceHash: device.deviceHash }, env);
    const consentUrl = new URL('/oauth/consent', request.url);
    consentUrl.searchParams.set('transaction', transaction);
    const headers = device.setCookie ? { 'set-cookie': device.setCookie } : {};
    return redirect(consentUrl.toString(), headers);
  } catch {
    return json({ error: 'oauth_unavailable' }, 503);
  }
}

