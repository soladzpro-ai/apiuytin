import { PROJECT_CALLBACK, getActiveDevice, googleAuthorize, json, randomSecret, redirect, requireSecret, signedValue } from '../../_lib/auth.js';
import { getOAuthTransaction, transactionIsActive } from '../../_lib/oauth.js';

async function handleAddAccount({ request, env }) {
  const url = new URL(request.url);
  const transactionToken = url.searchParams.get('transaction');
  const transaction = await getOAuthTransaction(transactionToken, env);
  if (!transactionIsActive(transaction)) return json({ error: 'Giao dịch OAuth đã hết hạn.' }, 400);

  const device = await getActiveDevice(request, env);
  if (!device) return json({ error: 'device_session_required' }, 401);
  if (device.deviceHash !== transaction.deviceHash) return json({ error: 'device_session_mismatch' }, 403);

  const state = randomSecret('st_');
  const stateValue = await signedValue(JSON.stringify({ kind: 'project_add_account', state, transaction: transactionToken, exp: Date.now() + 10 * 60 * 1000 }), requireSecret(env));
  return redirect(googleAuthorize(env.GOOGLE_CLIENT_ID || env.CLIENT_ID, stateValue, PROJECT_CALLBACK));
}

export async function onRequestGet({ request, env }) {
  try {
    return await handleAddAccount({ request, env });
  } catch {
    return json({ error: 'oauth_unavailable' }, 503);
  }
}

