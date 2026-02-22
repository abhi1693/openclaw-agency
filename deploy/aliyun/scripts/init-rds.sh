#!/usr/bin/env bash
# init-rds.sh — Initialize ApsaraDB RDS PostgreSQL for first-time deployment.
#
# This script:
#   1. Creates the application database (if not exists)
#   2. Creates the application user with scoped privileges
#   3. Enables required PostgreSQL extensions
#   4. Runs the initial Alembic migration
#
# Usage:
#   RDS_ADMIN_HOST=<rds-endpoint> \
#   RDS_ADMIN_USER=postgres \
#   RDS_ADMIN_PASS=<admin-password> \
#   RDS_DB=mission_control \
#   RDS_USER=mc_admin \
#   RDS_PASS=<app-password> \
#     ./init-rds.sh
#
# Prerequisites:
#   - psql client installed (apt-get install postgresql-client)
#   - Network access to RDS endpoint (same VPC or public endpoint)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Required environment variables ---
: "${RDS_ADMIN_HOST:?RDS_ADMIN_HOST is required (RDS endpoint)}"
: "${RDS_ADMIN_USER:?RDS_ADMIN_USER is required (e.g. postgres)}"
: "${RDS_ADMIN_PASS:?RDS_ADMIN_PASS is required}"
: "${RDS_DB:=mission_control}"
: "${RDS_USER:=mc_admin}"
: "${RDS_PASS:?RDS_PASS is required (application user password)}"
: "${RDS_PORT:=5432}"

PSQL_ADMIN="psql -h ${RDS_ADMIN_HOST} -p ${RDS_PORT} -U ${RDS_ADMIN_USER}"
export PGPASSWORD="${RDS_ADMIN_PASS}"

# --- Step 1: Create database ---
log_info "Creating database '${RDS_DB}' (if not exists)..."
${PSQL_ADMIN} -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '${RDS_DB}'" \
    | grep -q 1 \
    || ${PSQL_ADMIN} -d postgres -c "CREATE DATABASE ${RDS_DB};"

# --- Step 2: Create application user ---
log_info "Creating application user '${RDS_USER}' (if not exists)..."
${PSQL_ADMIN} -d postgres -tc \
    "SELECT 1 FROM pg_roles WHERE rolname = '${RDS_USER}'" \
    | grep -q 1 \
    || ${PSQL_ADMIN} -d postgres -c "CREATE USER ${RDS_USER} WITH PASSWORD '${RDS_PASS}';"

# --- Step 3: Grant privileges ---
log_info "Granting privileges..."
${PSQL_ADMIN} -d "${RDS_DB}" <<SQL
-- Grant connect and usage
GRANT CONNECT ON DATABASE ${RDS_DB} TO ${RDS_USER};
GRANT USAGE ON SCHEMA public TO ${RDS_USER};

-- Grant table and sequence privileges
GRANT CREATE ON SCHEMA public TO ${RDS_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RDS_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${RDS_USER};
SQL

# --- Step 4: Enable extensions ---
log_info "Enabling PostgreSQL extensions..."
${PSQL_ADMIN} -d "${RDS_DB}" <<SQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL

unset PGPASSWORD
log_info "RDS initialization complete."
log_info ""
log_info "Next steps:"
log_info "  1. Set DATABASE_URL in your .env.production:"
log_info "     DATABASE_URL=postgresql+psycopg://${RDS_USER}:<password>@${RDS_ADMIN_HOST}:${RDS_PORT}/${RDS_DB}"
log_info "  2. Run deploy.sh to apply Alembic migrations and start services."
