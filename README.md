# APIUYTIN

Cloudflare Pages Functions identity broker with an APIUYTIN account chooser,
Google bootstrap authentication, Sanity persistence, and OAuth 2.0 callbacks.

## Fixed URLs

- Dashboard Google bootstrap: `https://apiuytin.pages.dev/auth/google`
- Project OAuth start: `https://apiuytin.pages.dev/oauth/google`
- Platform Google callback: `https://apiuytin.pages.dev/oauth/google/callback`
- API base: `https://apiuytin.pages.dev/api/auth`

## Required secrets

Configure these as Cloudflare Pages secrets or local `.dev.vars` values:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN`
- `SESSION_SECRET`

The Google credentials are only used to create or add APIUYTIN accounts. Project
integrations use a `client_id` and a server-side `api_key`; there is no project
`secretKey` or OAuth `client_secret`.

## Account chooser flow

1. The consuming web app generates a random `state` and redirects to
   `/oauth/google?client_id=...&redirect_uri=...&state=...`.
2. APIUYTIN validates the exact registered HTTPS callback and opens the account
   chooser for the current device.
3. The user selects an APIUYTIN account and accepts the requested profile
   sharing.
4. APIUYTIN redirects to the registered callback with a one-time `code` and the
   original `state`.
5. The consuming web app exchanges the code server-side:

```json
{
  "code": "ONE_TIME_CODE",
  "client_id": "pk_YOUR_CLIENT_ID",
  "api_key": "CHUOTAPI_YOUR_API_KEY",
  "redirect_uri": "https://app.example.com/auth/callback"
}
```

New devices or the “Add account” action use Google once, create/update the
APIUYTIN account, and bind it to a 30-day HttpOnly device session.

## Profile contract

The token response and `/api/auth/userinfo` return APIUYTIN-owned identity
fields: `id`, `sub`, `email`, `name`, `picture`, `given_name`, `family_name`,
`locale`, and `verified_email`. `id` and `sub` are not the Google subject.

Google access and refresh tokens are never stored or returned.

## Project credentials

Creating a project returns `clientId` and an API key exactly once. The API key
is stored only as a hash. Owners can call
`POST /api/auth/projects/:projectId/rotate-key` to invalidate the old key and
receive a new one once. Dashboard reloads and `project-info` never return the
API key.

## API contract

- `GET /api/auth/health`
- `GET /api/auth/session`
- `POST /api/auth/projects`
- `GET /api/auth/projects`
- `PATCH /api/auth/projects/:id`
- `POST /api/auth/projects/:id/rotate-key`
- `POST /api/auth/projects/:id/revoke` (vô hiệu hóa ngay, dọn dữ liệu OAuth ở background)
- `GET /api/auth/project-info` with `Authorization: Bearer CHUOTAPI_...`
- `GET /api/auth/allusers` with `Authorization: Bearer CHUOTAPI_...`
- `POST /api/auth/oauth/token` with `client_id`, `api_key`, `code`, and `redirect_uri`
- `GET /api/auth/userinfo` with an APIUYTIN access token
- `POST /api/auth/logout`

The API key must stay in the consuming app’s server-side environment. It must
not be placed in browser JavaScript, HTML, query strings, cookies, or
`localStorage`.

## Third-party integration runbook

Use the detailed guides in this order:

1. Read [`HUONG_DAN_TICH_HOP_APIUYTIN_OAUTH_CHOOSER.md`](./HUONG_DAN_TICH_HOP_APIUYTIN_OAUTH_CHOOSER.md) for the complete contract, security rules, endpoint reference, retry policy, and backend examples.
2. Use [`bổ sung phương thức vào đây.md`](./bổ%20sung%20phương%20thức%20vào%20đây.md) as the method-level implementation checklist for state, callback parsing, token exchange, userinfo, project management, and error handling.
3. Configure one HTTPS callback per project/environment. The same exact callback must be used in the browser authorization URL and server-side token exchange.
4. Generate a fresh server-side `state` for every login, bind it to the browser session, consume it once, and handle `access_denied` without calling the token endpoint.
5. Keep `apiKey` only in the integration backend. The browser receives neither the API key nor the token-exchange request.
6. Apply an HTTP timeout in the integration backend. Do not blindly retry a token exchange, create, rotate, revoke, or any request whose mutation outcome is unknown.
7. Create the local application session only after validating the APIUYTIN token response and the APIUYTIN-owned profile ID.

The current authorization start contract requires all three query parameters:
`client_id`, `redirect_uri`, and a non-empty `state`. The token contract accepts
exactly `client_id`, `api_key`, `code`, and `redirect_uri`; `client_secret` and
unknown fields are rejected with `invalid_client`.

