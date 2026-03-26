# Meta App Review — Instagram cross-post

Deenly uses the **Instagram Content Publishing** flow (Graph API) for optional “share to Instagram” after a user publishes media. This requires a **Meta developer app** configured for **Facebook Login** and the Instagram product.

## Prerequisites

- Instagram account is **Professional** (Business or Creator).
- It is **linked to a Facebook Page** the user can grant access to.
- Media URLs passed to Instagram are **public HTTPS** (e.g. CloudFront origin); expiring presigned URLs may fail if they expire before Instagram finishes fetching.

## Suggested permissions / features

Request the minimum needed for your use case; names change over time—verify in [Meta documentation](https://developers.facebook.com/docs/instagram-api/guides/content-publishing).

Typical scopes used in this codebase:

- `pages_show_list`
- `pages_read_engagement`
- `instagram_basic`
- `instagram_content_publish`

## OAuth redirect

Set `META_OAUTH_REDIRECT_URI` to the exact backend URL registered in the Meta app, for example:

`https://<api-host>/api/v1/instagram/oauth/callback`

The callback redirects the browser to `APP_BASE_URL/account` with query parameters `instagram_connected=1` or `instagram_error=...`.

## Review assets

- Short screen recording: Account → Connect Instagram → consent → return to app → Create post with media → “Also share to Instagram”.
- Privacy policy URL (hosted) describing Meta data use and token storage.
- Explanation that only the authenticated user’s Page/Instagram is accessed.

## Environment (production)

- `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`
- `META_TOKEN_ENCRYPTION_KEY` (32-byte key; do not rely on JWT secret derivation in production)
- `META_OAUTH_STATE_SECRET` (recommended separate secret for OAuth `state` JWTs)
- `APP_BASE_URL` must match the web app used for post-login redirect.
