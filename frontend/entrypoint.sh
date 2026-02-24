#!/bin/sh
# entrypoint.sh — Runtime NEXT_PUBLIC_API_URL injection for Railway deployment.
#
# Problem: Next.js embeds NEXT_PUBLIC_* variables at build time into static JS
# chunks. When deploying to Railway the backend URL is not known at build time.
#
# Solution: Build with a placeholder string, then sed-replace it at container
# startup with the actual value from the environment variable.
#
# The placeholder must be the SAME length or the JS chunk offsets break.
# We use a fixed-length 64-char pad: __NEXT_PUBLIC_API_URL_PLACEHOLDER_64CHAR__
# and right-pad the actual URL with spaces to match, so the replacement is safe.

set -e

PLACEHOLDER="__NEXT_PUBLIC_API_URL_PLACEHOLDER_64CHAR__"
PLACEHOLDER_LEN=${#PLACEHOLDER}

ACTUAL_URL="${NEXT_PUBLIC_API_URL:-}"

if [ -z "$ACTUAL_URL" ]; then
  echo "[entrypoint] WARNING: NEXT_PUBLIC_API_URL is not set. API calls may fail."
else
  # Pad the actual URL with spaces to match placeholder length (safe for JS strings)
  PAD_LEN=$(( PLACEHOLDER_LEN - ${#ACTUAL_URL} ))
  if [ "$PAD_LEN" -lt 0 ]; then
    echo "[entrypoint] ERROR: NEXT_PUBLIC_API_URL is longer than the placeholder ($PLACEHOLDER_LEN chars)."
    echo "[entrypoint] Please shorten the URL (remove trailing slashes, use a shorter domain)."
    exit 1
  fi

  PADDED_URL="$ACTUAL_URL"
  i=0
  while [ "$i" -lt "$PAD_LEN" ]; do
    PADDED_URL="${PADDED_URL} "
    i=$(( i + 1 ))
  done

  echo "[entrypoint] Injecting NEXT_PUBLIC_API_URL into .next/static chunks..."
  # Replace in all compiled JS files (both server and static client bundles)
  find /app/.next -type f -name "*.js" | xargs -r \
    sed -i "s|${PLACEHOLDER}|${PADDED_URL}|g"
  echo "[entrypoint] Done. API URL = ${ACTUAL_URL}"
fi

# Hand off to the Next.js standalone server
exec node /app/server.js
