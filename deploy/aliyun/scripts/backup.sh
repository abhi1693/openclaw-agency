#!/usr/bin/env bash
# backup.sh — Backup ApsaraDB RDS PostgreSQL to local storage or Alibaba Cloud OSS.
#
# Usage:
#   ./backup.sh                    # Backup to local BACKUP_DIR
#   UPLOAD_TO_OSS=1 ./backup.sh    # Backup and upload to OSS
#
# Cron example (daily at 2 AM):
#   0 2 * * * /opt/deploy/aliyun/scripts/backup.sh >> /var/log/mc-backup.log 2>&1
#
# Prerequisites:
#   - pg_dump (postgresql-client)
#   - ossutil64 (for OSS upload, optional)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}[ERROR]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../env/.env.production"

# Load env file if present
if [ -f "${ENV_FILE}" ]; then
    # shellcheck source=/dev/null
    source "${ENV_FILE}"
fi

# --- Configuration ---
: "${RDS_HOST:?RDS_HOST is required}"
: "${RDS_USER:?RDS_USER is required}"
: "${RDS_PASS:?RDS_PASS is required}"
: "${RDS_DB:=mission_control}"
: "${RDS_PORT:=5432}"

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/mc}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
UPLOAD_TO_OSS="${UPLOAD_TO_OSS:-0}"
OSS_BUCKET="${OSS_BUCKET:-}"
OSS_PATH="${OSS_PATH:-mc-backups}"

TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/mc_${RDS_DB}_${TIMESTAMP}.sql.gz"

# --- Pre-flight ---
mkdir -p "${BACKUP_DIR}"

if ! command -v pg_dump &>/dev/null; then
    log_error "pg_dump not found. Install postgresql-client."
    exit 1
fi

# --- Step 1: Dump database ---
log_info "Starting backup of '${RDS_DB}' from ${RDS_HOST}..."

export PGPASSWORD="${RDS_PASS}"
pg_dump \
    -h "${RDS_HOST}" \
    -p "${RDS_PORT}" \
    -U "${RDS_USER}" \
    -d "${RDS_DB}" \
    --format=plain \
    --no-owner \
    --no-privileges \
    | gzip > "${BACKUP_FILE}"
unset PGPASSWORD

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
log_info "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# --- Step 2: Upload to OSS (optional) ---
if [ "${UPLOAD_TO_OSS}" = "1" ]; then
    if [ -z "${OSS_BUCKET}" ]; then
        log_error "OSS_BUCKET not set. Skipping upload."
    elif ! command -v ossutil64 &>/dev/null; then
        log_error "ossutil64 not found. Install Alibaba Cloud ossutil."
    else
        log_info "Uploading to OSS: oss://${OSS_BUCKET}/${OSS_PATH}/..."
        ossutil64 cp "${BACKUP_FILE}" "oss://${OSS_BUCKET}/${OSS_PATH}/" --force
        log_info "Upload complete."
    fi
fi

# --- Step 3: Clean up old backups ---
log_info "Removing backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "mc_${RDS_DB}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED_COUNT}" -gt 0 ]; then
    log_info "Removed ${DELETED_COUNT} old backup(s)."
else
    log_info "No old backups to remove."
fi

log_info "Backup process complete."
