# DB reset + seed (dev-machine)

This repo uses Alembic migrations as schema source-of-truth.

## Reset to the current seed

```bash
cd backend
./scripts/reset_db.sh
```

Environment variables (optional):

- `DB_NAME` (default `openclaw_agency`)
- `DB_USER` (default `postgres`)
- `DB_HOST` (default `127.0.0.1`)
- `DB_PORT` (default `5432`)
- `DB_PASSWORD` (default `postgres`)

## Updating the seed

The seed is a **data-only** dump (not schema). Regenerate it from the current DB state:

```bash
cd backend
PGPASSWORD=postgres pg_dump \
  --data-only \
  --column-inserts \
  --disable-triggers \
  --no-owner \
  --no-privileges \
  -U postgres -h 127.0.0.1 -d openclaw_agency \
  > scripts/seed_data.sql

# IMPORTANT: do not include alembic_version in the seed (migrations already set it)
# (our committed seed already has this removed)
```
