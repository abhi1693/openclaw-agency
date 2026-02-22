#!/usr/bin/env bash
# deploy.sh — Pull latest images from ACR, run migrations, and deploy services.
#
# Usage:
#   ./deploy.sh                  # Deploy with :latest tag
#   TAG=abc123 ./deploy.sh       # Deploy a specific image tag
#   SKIP_MIGRATION=1 ./deploy.sh # Skip Alembic migration step

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
ENV_FILE="${DEPLOY_DIR}/env/.env.production"

TAG="${TAG:-latest}"
SKIP_MIGRATION="${SKIP_MIGRATION:-0}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:80/healthz}"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Pre-flight checks ---

if [ ! -f "${ENV_FILE}" ]; then
    log_error "Missing env file: ${ENV_FILE}"
    log_error "Copy env/.env.production.example to env/.env.production and fill in values."
    exit 1
fi

if ! command -v docker &>/dev/null; then
    log_error "docker is not installed or not in PATH."
    exit 1
fi

# Source env file to get ACR_REGISTRY, RDS_* vars
# shellcheck source=/dev/null
source "${ENV_FILE}"

if [ -z "${ACR_REGISTRY:-}" ]; then
    log_error "ACR_REGISTRY not set in ${ENV_FILE}."
    exit 1
fi

# --- Save current tag for rollback ---
PREVIOUS_TAG=""
if docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | head -1 | grep -q "api-server"; then
    PREVIOUS_TAG=$(docker compose -f "${COMPOSE_FILE}" config 2>/dev/null | grep -oP 'image:.*:(\K[^\s]+)' | head -1 || true)
fi

log_info "Deploying with TAG=${TAG} from ${ACR_REGISTRY}"

# --- Step 1: Pull images ---
log_info "Pulling images..."
export TAG
docker compose -f "${COMPOSE_FILE}" pull api-server frontend

# --- Step 2: Run database migration ---
if [ "${SKIP_MIGRATION}" = "1" ]; then
    log_warn "Skipping Alembic migration (SKIP_MIGRATION=1)."
else
    log_info "Running Alembic database migration..."
    docker compose -f "${COMPOSE_FILE}" run --rm --no-deps \
        -e DATABASE_URL="postgresql+psycopg://${RDS_USER}:${RDS_PASS}@${RDS_HOST}/${RDS_DB}" \
        api-server \
        alembic upgrade head

    log_info "Migration completed."
fi

# --- Step 3: Deploy services ---
log_info "Starting services..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

# --- Step 4: Health check ---
log_info "Waiting for services to become healthy..."
healthy=false
for i in $(seq 1 ${HEALTH_CHECK_RETRIES}); do
    if curl -sf "${HEALTH_CHECK_URL}" >/dev/null 2>&1; then
        healthy=true
        break
    fi
    log_info "  Health check attempt ${i}/${HEALTH_CHECK_RETRIES}..."
    sleep "${HEALTH_CHECK_INTERVAL}"
done

if [ "${healthy}" = true ]; then
    log_info "Deployment successful! Services are healthy."
    docker compose -f "${COMPOSE_FILE}" ps
    exit 0
fi

# --- Rollback on failure ---
log_error "Health check failed after ${HEALTH_CHECK_RETRIES} attempts."

if [ -n "${PREVIOUS_TAG}" ] && [ "${PREVIOUS_TAG}" != "${TAG}" ]; then
    log_warn "Rolling back to previous tag: ${PREVIOUS_TAG}"
    TAG="${PREVIOUS_TAG}" docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans
    log_warn "Rollback initiated. Check service status manually."
else
    log_error "No previous tag available for rollback. Check logs:"
    log_error "  docker compose -f ${COMPOSE_FILE} logs --tail=50"
fi

exit 1
