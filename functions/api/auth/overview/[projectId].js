import { json, sanityQuery, sessionWithCompleteEmail } from '../../../_lib/auth.js';

export async function onRequestGet({ request, env, params }) {
  const authenticated = await sessionWithCompleteEmail(request, env);
  if (authenticated.response) return authenticated.response;
  const { user } = authenticated;
  const projectId = params.projectId;
  const project = await sanityQuery('*[_type == "apiProject" && _id == $id && ownerId == $ownerId && status == "active"][0]', { id: projectId, ownerId: user.userId }, env);
  if (!project) return json({ error: 'project_not_found' }, 404);
  const users = await sanityQuery('*[_type == "apiProjectUser" && projectId == $projectId] | order(displayName asc)', { projectId }, env);
  return json({ project: { id: project._id, name: project.name }, users: users.map(item => ({ id: item.userId || item._id, email: item.email, displayName: item.displayName || item.name, nickname: item.nickname || '', avatar: item.avatar || item.picture || '', given_name: item.given_name || '', family_name: item.family_name || '', locale: item.locale || '', verified_email: item.verified_email === true, firstLoginAt: item.firstLoginAt, lastLoginAt: item.lastLoginAt })) });
}
