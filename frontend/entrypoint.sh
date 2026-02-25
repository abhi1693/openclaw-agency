#!/bin/sh
# entrypoint.sh — Runtime NEXT_PUBLIC_API_URL injection for Railway deployment.

set -e

# 这里我将占位符真正扩充到了 64 个字符长度！
PLACEHOLDER="__NEXT_PUBLIC_API_URL_PLACEHOLDER_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
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
