# APIUYTIN Current Construction

This document supersedes the previous project integration notes. The current
implementation is an OAuth Account Chooser backed by APIUYTIN accounts.

## Runtime components

- Cloudflare Pages static assets in `public/`.
- Pages Functions under `functions/`.
- Sanity stores APIUYTIN users, projects, device links, OAuth transactions,
  project user history, and one-time authorization codes.
- Google OAuth is used only for account bootstrap or adding an account on a new
  device.

## Current OAuth flow

```text
client_id + redirect_uri + state
  -> /oauth/google
  -> validate registered HTTPS callback
  -> device account chooser
  -> optional Google bootstrap for a new account/device
  -> selected account + consent
  -> one-time code at registered callback
  -> server-side token exchange with client_id + api_key
```

The device cookie is HttpOnly, Secure and SameSite=Lax. Its default lifetime is
30 days. The chooser only lists accounts linked to that device session.

## Project contract

The project contract has two values:

1. `clientId` - public project identifier, internally retained as the existing
   `publishKey` field for data compatibility.
2. `apiKey` - server-side secret. It is hashed in Sanity and returned only once
   after project creation or API key rotation.

The project no longer creates or accepts a project `secretKey` or OAuth
`client_secret`. Existing API key hashes continue to work until rotation.

## Token request

```json
{
  "code": "ONE_TIME_CODE",
  "client_id": "pk_YOUR_CLIENT_ID",
  "api_key": "CHUOTAPI_YOUR_API_KEY",
  "redirect_uri": "https://app.example.com/auth/callback"
}
```

The token endpoint verifies the exact project, callback, API key hash, code
expiry, project status and code revision. A successful consume is one-time and
returns a signed one-hour access token.

## Profile contract

```json
{
  "id": "user-apiuytin-...",
  "sub": "user-apiuytin-...",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://...",
  "given_name": "User",
  "family_name": "Name",
  "locale": "vi",
  "verified_email": true
}
```

`id` and `sub` are APIUYTIN identifiers. Google subject identifiers and Google
access/refresh tokens are not returned or stored as tokens.

## Endpoint map

- `GET /oauth/google` - start APIUYTIN chooser.
- `GET /oauth/consent` - render chooser.
- `POST /oauth/consent` - continue or cancel consent.
- `GET /oauth/consent/add-account` - start Google bootstrap for a new account.
- `GET /oauth/google/callback` - complete Google bootstrap and return to chooser.
- `GET /api/auth/health` - public health check.
- `GET /api/auth/session` - dashboard session and project metadata.
- `POST /api/auth/projects` - create project and return one-time API key.
- `GET /api/auth/projects` - list project metadata without API keys.
- `PATCH /api/auth/projects/:id` - update the HTTPS callback.
- `POST /api/auth/projects/:id/rotate-key` - invalidate old key and return new key once.
- `POST /api/auth/projects/:id/revoke` - revoke project immediately and clean related OAuth records in the background.
- `POST /api/auth/oauth/token` - exchange code with `client_id` and `api_key`.
- `GET /api/auth/userinfo` - return APIUYTIN profile from access token.
- `GET /api/auth/project-info` - return project metadata using API key.
- `GET /api/auth/allusers` - return project login history using API key.
- `POST /api/auth/logout` - clear dashboard session cookie.

## Async and concurrency rules

- All external I/O is asynchronous.
- Sanity reads retry up to three times for transient 429/5xx responses with
  exponential backoff and jitter.
- Large mutation sets are chunked into 50 mutations and run at most six chunks
  concurrently.
- User, device and device-account writes use deterministic IDs and
  `createIfNotExists`.
- OAuth transactions and codes use short expiry, hashes and CAS/revision guards.
- The implementation reduces duplicate fan-out but cannot bypass provider rate
  limits imposed by Google, Sanity or Cloudflare.

## Security boundaries

- Never put API keys in browser JavaScript, HTML, query strings, client cookies
  or localStorage.
- Never expose Google client secrets or provider tokens to consuming apps.
- Keep callback URLs exact and HTTPS-only.
- Treat all authorization codes as short-lived, single-use credentials.
- Keep consent UI free of inline script so the existing self-only CSP remains
  effective.

