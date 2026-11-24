import { GITHUB_CALLBACK, PROJECT_CALLBACK, getActiveDevice, githubAuthorize, googleAuthorize, json, randomSecret, redirect, requireSecret, signedValue } from '../../_lib/auth.js';
import { getOAuthTransaction, transactionIsActive } from '../../_lib/oauth.js';

async function handleAddAccount({ request, env }) {
  const url = new URL(request.url);
  const transactionToken = url.searchParams.get('transaction');
  const provider = url.searchParams.get('provider') === 'github' ? 'github' : 'google';
  const transaction = await getOAuthTransaction(transactionToken, env);
  if (!transactionIsActive(transaction)) return json({ error: 'Giao dịch OAuth đã hết hạn.' }, 400);

  const device = await getActiveDevice(request, env);
  if (!device) return json({ error: 'device_session_required' }, 401);
  if (device.deviceHash !== transaction.deviceHash) return json({ error: 'device_session_mismatch' }, 403);

  const state = randomSecret('st_');
  const kind = provider === 'github' ? 'project_add_account_github' : 'project_add_account';
  const stateValue = await signedValue(JSON.stringify({ kind, state, transaction: transactionToken, exp: Date.now() + 10 * 60 * 1000 }), requireSecret(env));
  if (provider === 'github') {
    const clientId = String(env.GITHUB_CLIENT_ID || '').trim();
    if (!clientId) return json({ error: 'github_oauth_unavailable' }, 503);
    return redirect(githubAuthorize(clientId, stateValue, GITHUB_CALLBACK));
  }
  return redirect(googleAuthorize(env.GOOGLE_CLIENT_ID || env.CLIENT_ID, stateValue, PROJECT_CALLBACK));
}

export async function onRequestGet({ request, env }) {
  try {
    return await handleAddAccount({ request, env });
  } catch {
    return json({ error: 'oauth_unavailable' }, 503);
  }
}

