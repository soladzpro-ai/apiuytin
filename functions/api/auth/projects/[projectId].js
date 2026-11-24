import { json, publicProject, sanityMutate, sanityQuery, sessionWithCompleteEmail, validateRedirectUri } from '../../../_lib/auth.js';

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'PATCH, OPTIONS'
    }
  });
}

export async function onRequestPatch({ request, env, params }) {
  const authenticated = await sessionWithCompleteEmail(request, env);
  if (authenticated.response) return authenticated.response;
  const { user } = authenticated;

  const project = await sanityQuery(
    '*[_type == "apiProject" && _id == $id && ownerId == $ownerId][0]',
    { id: params.projectId, ownerId: user.userId },
    env
  );
  if (!project || project.status === 'revoked') return json({ error: 'project_not_found' }, 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400);

  const hasRedirectUri = Object.hasOwn(body, 'redirectUri');
  const hasEnabled = Object.hasOwn(body, 'enabled');
  if (!hasRedirectUri && !hasEnabled) return json({ error: 'invalid_request' }, 400);

  const redirectUri = hasRedirectUri ? validateRedirectUri(body.redirectUri) : project.redirectUri;
  if (hasRedirectUri && !redirectUri) return json({ error: 'redirectUri phải là URL HTTPS hợp lệ, không chứa thông tin đăng nhập hoặc fragment.' }, 400);
  if (hasEnabled && typeof body.enabled !== 'boolean') return json({ error: 'enabled phải là boolean.' }, 400);

  const currentEnabled = (project.status || 'active') === 'active';
  const nextEnabled = hasEnabled ? body.enabled : currentEnabled;
  const nextStatus = nextEnabled ? 'active' : 'disabled';
  const set = {};
  if (hasRedirectUri && redirectUri !== project.redirectUri) set.redirectUri = redirectUri;
  if (hasEnabled && nextStatus !== (project.status || 'active')) set.status = nextStatus;
  if (!Object.keys(set).length) {
    return json({ project: await publicProject(project, env), unchanged: true });
  }

  set.updatedAt = new Date().toISOString();
  await sanityMutate([{
    patch: {
      id: project._id,
      ifRevisionID: project._rev,
      set
    }
  }], env);

  return json({
    project: await publicProject({ ...project, ...set }, env)
  });
}
