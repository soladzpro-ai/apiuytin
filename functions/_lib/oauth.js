import { CODE_MAX_AGE, TRANSACTION_MAX_AGE, decryptSecret, encryptSecret, hash, randomSecret, redirect, requireSecret, sanityMutate, sanityQuery } from './auth.js';

export async function createOAuthTransaction({ project, redirectUri, clientState, deviceHash }, env) {
  const token = randomSecret('tx_');
  const transactionHash = await hash(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRANSACTION_MAX_AGE * 1000).toISOString();
  const transaction = {
    _id: `oauth-transaction-${transactionHash}`,
    _type: 'apiOAuthTransaction',
    transactionHash,
    projectId: project._id,
    clientId: project.publishKey,
    projectName: project.name,
    redirectUri,
    clientState: clientState || '',
    deviceHash: deviceHash || null,
    expiresAt,
    createdAt: now.toISOString()
  };
  await sanityMutate([{ create: transaction }], env);
  return token;
}

export async function getOAuthTransaction(token, env) {
  if (!token) return null;
  const transactionHash = await hash(token);
  return sanityQuery('*[_type == "apiOAuthTransaction" && transactionHash == $transactionHash][0]', { transactionHash }, env);
}

export function transactionIsActive(transaction) {
  return transactionStatus(transaction) === 'active';
}

export function transactionStatus(transaction) {
  if (!transaction) return 'missing';
  if (transaction.canceledAt) return 'canceled';
  if (!Number.isFinite(Date.parse(transaction.expiresAt)) || Date.parse(transaction.expiresAt) <= Date.now()) return 'expired';
  if (transaction.selectedAt) return 'selected';
  return 'active';
}

export function callbackRedirect(transaction, values = {}) {
  const destination = new URL(transaction.redirectUri);
  if (transaction.clientState) destination.searchParams.set('state', transaction.clientState);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) destination.searchParams.set(key, value);
  }
  return redirect(destination.toString());
}

async function codeMutation(code, transaction, profile) {
  const codeHash = await hash(code);
  return { createIfNotExists: {
    _id: `code-${codeHash}`,
    _type: 'apiAuthCode',
    codeHash,
    projectId: transaction.projectId,
    clientId: transaction.clientId,
    redirectUri: transaction.redirectUri,
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    displayName: profile.displayName || profile.name,
    nickname: profile.nickname || '',
    picture: profile.picture,
    given_name: profile.given_name,
    family_name: profile.family_name,
    locale: profile.locale,
    verified_email: profile.verified_email,
    expiresAt: new Date(Date.now() + CODE_MAX_AGE * 1000).toISOString()
  } };
}

export async function issueAuthorizationCode(transaction, profile, env, extraMutations = []) {
  let current = transaction;
  let code = current.encryptedCode ? await decryptSecret(current.encryptedCode, requireSecret(env)) : null;

  if (!code) {
    code = randomSecret('code_');
    const encryptedCode = await encryptSecret(code, requireSecret(env));
    try {
      await sanityMutate([
        { patch: {
          id: current._id,
          ifRevisionID: current._rev,
          set: {
            selectedUserId: profile.id,
            selectedProfile: profile,
            codeHash: await hash(code),
            encryptedCode,
            selectedAt: new Date().toISOString()
          }
        } },
        ...extraMutations,
        await codeMutation(code, current, profile)
      ], env);
      return code;
    } catch {
      current = await getOAuthTransactionByHash(current.transactionHash, env);
      code = current?.encryptedCode ? await decryptSecret(current.encryptedCode, requireSecret(env)) : null;
      if (!code) throw new Error('Giao dịch OAuth đã được chọn trước đó');
    }
  }

  if (current.selectedUserId && current.selectedUserId !== profile.id) {
    throw new Error('Giao dịch OAuth đã chọn một tài khoản khác');
  }
  const selectedProfile = current.selectedProfile || profile;
  await sanityMutate([...extraMutations, await codeMutation(code, current, selectedProfile)], env);
  return code;
}

async function getOAuthTransactionByHash(transactionHash, env) {
  return sanityQuery('*[_type == "apiOAuthTransaction" && transactionHash == $transactionHash][0]', { transactionHash }, env);
}

export async function getReusableAuthorizationCode(transaction, env) {
  if (!transaction?.encryptedCode || !transaction.codeHash) return null;
  const code = await decryptSecret(transaction.encryptedCode, requireSecret(env));
  if (!code) return null;
  const authCode = await sanityQuery('*[_type == "apiAuthCode" && codeHash == $codeHash][0]', { codeHash: transaction.codeHash }, env);
  const expiresAt = authCode && Date.parse(authCode.expiresAt);
  if (!authCode || authCode.consumedAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return code;
}

export async function cancelOAuthTransaction(transaction, env) {
  if (!transaction?.canceledAt && !transaction?.selectedAt) {
    await sanityMutate([{ patch: { id: transaction._id, ifRevisionID: transaction._rev, set: { canceledAt: new Date().toISOString() } } }], env);
  }
}

