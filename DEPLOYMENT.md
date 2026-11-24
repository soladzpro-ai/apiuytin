# Deploy

1. Install dependencies with `npm install`.
2. Create a Cloudflare Pages project named `apiuytin`.
3. Set the secrets from `.env.example` in Pages Functions settings. Map `CLIENT_ID`/`CLIENT_SECRET` from `googleOAuth.env` to `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
4. Add the existing `wrangler.toml` vars and deploy with `npm run deploy`.
5. In Google Cloud Console, keep both exact callbacks:
   - `https://apiuytin.pages.dev/auth/google/callback`
   - `https://apiuytin.pages.dev/oauth/google/callback`

The workspace currently has `deploy.env`, not `api-deploy.env`; no deployment command was run with an assumed credential. Cloudflare Pages also requires the project name/account context to be confirmed in Wrangler.

Project integrations use `client_id` plus server-side `api_key`. Do not configure
or document a project `secretKey`; Google client credentials above are platform
secrets and are separate from project API keys.

## Integration smoke test after deployment

1. Open the dashboard and create a staging project with an HTTPS callback.
2. Confirm the create response is the only place the plaintext `apiKey` appears.
3. Start `/oauth/google` with `client_id`, the registered `redirect_uri`, and a fresh random `state`.
4. Complete the chooser flow with an account already remembered on the device.
5. Complete the add-account flow on a fresh device and confirm it returns to the same consent transaction.
6. Exchange the returned code from a backend request containing only `client_id`, `api_key`, `code`, and `redirect_uri`.
7. Call `/userinfo`, `/project-info`, and `/allusers` with the correct bearer token type.
8. Rotate the key, verify the new key works, and verify the old key returns `invalid_api_key`.
9. Revoke the staging project and verify access is rejected immediately; background cleanup may finish afterward.
10. Confirm `/docs`, `/docs.js`, `/docs.css`, and `/oauth-consent.js` load without CSP or console errors.
