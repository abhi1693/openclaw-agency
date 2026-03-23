#!/bin/bash
# deploy.sh — pull latest code, migrate, restart backend and frontend
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "==> Pulling latest code"
cd "$REPO_ROOT"
git pull origin master

echo "==> Running database migrations"
cd "$REPO_ROOT/backend"
source .venv/bin/activate
alembic upgrade head

echo "==> Restarting services"
pm2 restart mc-backend
pm2 restart mc-frontend

echo "==> Waiting for backend health check"
sleep 3
curl -sf http://localhost:8000/health > /dev/null && echo "✅ Backend healthy" || echo "⚠️  Backend health check failed — check logs: pm2 logs mc-backend"

echo "✅ Deploy complete ($(date))"
