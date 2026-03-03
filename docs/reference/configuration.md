# Configuration reference

This page collects the most important config values.

## Root `.env` (Compose)

See `.env.example` for defaults and required values.

### `NEXT_PUBLIC_API_URL`

- **Where set:** `.env` (frontend container environment)
- **Purpose:** Public URL the browser uses to call the backend.
- **Gotcha:** Must be reachable from the *browser* (host), not a Docker network alias.

### `LOCAL_AUTH_TOKEN`

- **Where set:** `.env` (backend)
- **When required:** `AUTH_MODE=local`
- **Policy:** Must be non-placeholder and at least 50 characters.

## Security response headers

These environment variables control security headers added to every API response. Set any variable to blank (`""`) to disable the corresponding header.

### `SECURITY_HEADER_X_CONTENT_TYPE_OPTIONS`

- **Default:** `nosniff`
- **Purpose:** Prevents browsers from MIME-type sniffing responses.

### `SECURITY_HEADER_X_FRAME_OPTIONS`

- **Default:** `DENY`
- **Purpose:** Prevents the API from being embedded in iframes.
- **Note:** If your deployment embeds the API in an iframe, set this to `SAMEORIGIN` or blank.

### `SECURITY_HEADER_REFERRER_POLICY`

- **Default:** `strict-origin-when-cross-origin`
- **Purpose:** Controls how much referrer information is sent with requests.

### `SECURITY_HEADER_PERMISSIONS_POLICY`

- **Default:** _(blank — disabled)_
- **Purpose:** Restricts browser features (camera, microphone, etc.) when set.
