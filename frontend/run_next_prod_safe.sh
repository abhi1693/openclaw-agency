#!/bin/bash
# run_next_prod_safe.sh — démarrage PROD sûr du hub Next.js :3000.
#
# Garde-fous (CONTEXT_LOCK 2026-06-03, contrainte #3) :
#   1. Refuse de démarrer si .next/BUILD_ID absent (build manquant → HMR-less prod casserait).
#   2. Scanne le port 3000.
#   3. kill -15 (SIGTERM) sur tout process Node zombie qui squatte :3000, escalade -9 si récalcitrant.
#   4. Seulement ALORS, lance `next start`.
#
# Modèle dérivé du pattern prouvé ~/cof-trading/hub/safe-restart.sh (mono-process, vérif port).
# Cible canon : composant React :3000/cofiatrading-world-control (next start -H 127.0.0.1 -p 3000).
set -euo pipefail

FRONTEND_DIR="${FRONTEND_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
HOST="${NEXT_HOST:-127.0.0.1}"
PORT="${NEXT_PORT:-3000}"
cd "$FRONTEND_DIR"

echo "[safe-start] frontend dir : $FRONTEND_DIR"

# ── 1. Précondition build ────────────────────────────────────────────────────
BUILD_ID_FILE="$FRONTEND_DIR/.next/BUILD_ID"
if [ ! -f "$BUILD_ID_FILE" ]; then
  echo "[safe-start] ❌ .next/BUILD_ID absent — build PROD manquant."
  echo "[safe-start]    Lance d'abord :  npm run build"
  exit 1
fi
echo "[safe-start] ✅ BUILD_ID présent : $(cat "$BUILD_ID_FILE")"

# ── 2. Scan port + 3. kill -15 des zombies Node ──────────────────────────────
echo "[safe-start] scan port $PORT…"
ZOMBIE_PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true)"

if [ -n "$ZOMBIE_PIDS" ]; then
  for pid in $ZOMBIE_PIDS; do
    CMD="$(ps -p "$pid" -o comm= 2>/dev/null || echo '')"
    # On ne tue QUE des process Node (zombies next-server), jamais autre chose.
    if printf '%s' "$CMD" | grep -qiE 'node|next'; then
      echo "[safe-start] kill -15 zombie Node PID $pid ($CMD) sur :$PORT"
      kill -15 "$pid" 2>/dev/null || true
    else
      echo "[safe-start] ⚠️  PID $pid ($CMD) occupe :$PORT mais n'est PAS Node — abandon (pas de kill aveugle)."
      exit 1
    fi
  done

  # Attendre la libération du SIGTERM (grace), escalade -9 si encore là.
  for _i in $(seq 1 10); do
    sleep 1
    STILL="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true)"
    [ -z "$STILL" ] && break
  done
  STILL="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true)"
  if [ -n "$STILL" ]; then
    for pid in $STILL; do
      echo "[safe-start] ⚠️  PID $pid survit au SIGTERM → kill -9"
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 2
  fi
fi

# Vérif finale : port libre avant de lancer.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[safe-start] ❌ port $PORT toujours occupé après nettoyage — abandon."
  exit 1
fi
echo "[safe-start] ✅ port $PORT libre."

# ── 4. Démarrage autorisé ────────────────────────────────────────────────────
echo "[safe-start] → next start -H $HOST -p $PORT"
exec ./node_modules/next/dist/bin/next start -H "$HOST" -p "$PORT"
