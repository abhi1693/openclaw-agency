#!/bin/sh
# entrypoint.sh — Runtime NEXT_PUBLIC_API_URL injection for Railway deployment.

set -e

# The placeholder must be exactly 64 characters and must match the string baked
# into the Next.js build by frontend/Dockerfile. If they diverge, the sed
# replacement below will silently fail and the API URL will not be injected.
EXPECTED_PLACEHOLDER_LEN=64
PLACEHOLDER="__NEXT_PUBLIC_API_URL_PLACEHOLDER_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

if [ "${#PLACEHOLDER}" -ne "$EXPECTED_PLACEHOLDER_LEN" ]; then
  echo "[entrypoint] ERROR: Placeholder length (${#PLACEHOLDER}) does not match expected length ($EXPECTED_PLACEHOLDER_LEN)."
  echo "[entrypoint] Ensure frontend/entrypoint.sh and frontend/Dockerfile use the same 64-character placeholder string."
  exit 1
fi

PLACEHOLDER_LEN=${#PLACEHOLDER}

ACTUAL_URL="${NEXT_PUBLIC_API_URL:-}"

if [ -z "$ACTUAL_URL" ]; then
  echo "[entrypoint] WARNING: NEXT_PUBLIC_API_URL is not set. API calls may fail."
else
  PAD_LEN=$(( PLACEHOLDER_LEN - ${#ACTUAL_URL} ))
  if [ "$PAD_LEN" -lt 0 ]; then
    echo "[entrypoint] ERROR: NEXT_PUBLIC_API_URL is longer than the placeholder ($PLACEHOLDER_LEN chars)."
    exit 1
  fi

  PADDED_URL="$ACTUAL_URL"
  i=0
  while [ "$i" -lt "$PAD_LEN" ]; do
    PADDED_URL="${PADDED_URL} "
    i=$(( i + 1 ))
  done

  echo "[entrypoint] Injecting NEXT_PUBLIC_API_URL into .next/static chunks..."
  find /app/.next -type f -name "*.js" | xargs -r sed -i "s|${PLACEHOLDER}|${PADDED_URL}|g"
  echo "[entrypoint] Done. API URL = ${ACTUAL_URL}"
fi

exec node /app/server.js
