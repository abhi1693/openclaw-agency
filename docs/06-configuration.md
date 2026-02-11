# Configuration

This page documents how Mission Control is configured across local dev, self-host, and production.

## Deep dives

- Deployment: [docs/deployment/README.md](deployment/README.md)
- Production notes: [docs/production/README.md](production/README.md)

## Config sources & precedence

Mission Control is a 3-service stack (`compose.yml`): Postgres (`db`), FastAPI backend (`backend`), and Next.js frontend (`frontend`). Configuration comes from a mix of **compose env files**, **service env vars**, and **app-specific env files**.

### Docker Compose (recommended local/self-host)

Precedence (highest → lowest):

1) **Explicit runtime environment** passed to Compose
- `docker compose ... -e NAME=value` (or exported in your shell)

2) **Compose env-file** used for interpolation
- `docker compose -f compose.yml --env-file .env up ...`
- Suggested workflow: copy repo root `.env.example` → `.env` and edit.

3) **Compose defaults** embedded in `compose.yml`
- e.g. `${BACKEND_PORT:-8000}`.

4) **Backend container env**
- `compose.yml` sets backend `env_file: ./backend/.env.example` (defaults)
- plus overrides in `compose.yml: services.backend.environment`.

5) **Frontend container env**
- `compose.yml` sets `NEXT_PUBLIC_API_URL` via `environment:` and also as a **build arg**.
- `compose.yml` optionally loads `frontend/.env` (user-managed), *not* `frontend/.env.example`.

### Backend env-file loading behavior (non-Compose)

When running the backend directly (e.g., `uvicorn`), settings load from env vars and from these files:
- `backend/.env` (always attempted)
- `.env` (repo root; optional)

This is intentional so running from repo root still picks up backend config.

### Frontend env-file behavior (non-Compose)

- Next.js uses `NEXT_PUBLIC_*` variables for browser-visible configuration.
- For local dev you typically create `frontend/.env.local` (Next.js convention) or `frontend/.env` (if you want Compose to read it).

## Environment variables

This table is based on `backend/app/core/config.py`, `.env.example`, `backend/.env.example`, `frontend/.env.example`, and `compose.yml`.

### Compose / shared (repo root `.env`)

| Variable | Used by | Purpose | Default / example | Footguns |
|---|---|---|---|---|
| `FRONTEND_PORT` | compose | Host port for frontend container | `3000` | Port conflicts on host are common |
| `BACKEND_PORT` | compose | Host port for backend container | `8000` | If changed, ensure frontend points at the new port |
| `POSTGRES_DB` | db/compose | Postgres database name | `mission_control` | Changing requires new DB or migration plan |
| `POSTGRES_USER` | db/compose | Postgres user | `postgres` | — |
| `POSTGRES_PASSWORD` | db/compose | Postgres password | `postgres` | Don’t use defaults in real deployments |
| `POSTGRES_PORT` | compose | Host port for Postgres | `5432` | Port conflicts on host are common |
| `CORS_ORIGINS` | backend/compose | Backend CORS allowlist | `http://localhost:3000` | Must include the real frontend origin |
| `DB_AUTO_MIGRATE` | backend/compose | Auto-run Alembic migrations at backend startup | `true` (in `.env.example`) | Can be risky in prod; see notes below |
| `NEXT_PUBLIC_API_URL` | frontend (build+runtime) | Browser-reachable backend URL | `http://localhost:8000` | Must be reachable from the **browser**, not just Docker |

### Backend (FastAPI)

> Settings are defined in `backend/app/core/config.py` and typically configured via `backend/.env`.

| Variable | Required? | Purpose | Default / example | Notes |
|---|---:|---|---|---|
| `ENVIRONMENT` | no | Environment name (drives defaults) | `dev` | In `dev`, `DB_AUTO_MIGRATE` defaults to true **if not explicitly set** |
| `DATABASE_URL` | no | Postgres connection string | `postgresql+psycopg://...@localhost:5432/...` | In Compose, overridden to use `db:5432` |
| `CORS_ORIGINS` | no | Comma-separated CORS origins | empty | Compose supplies a sane default |
| `BASE_URL` | no | External base URL for this service | empty | Used for absolute links/callbacks if needed |
| `CLERK_SECRET_KEY` | **yes** | Clerk secret key (backend auth) | (none) | `backend/app/core/config.py` enforces non-empty |
| `CLERK_API_URL` | no | Clerk API base | `https://api.clerk.com` | — |
| `CLERK_VERIFY_IAT` | no | Verify issued-at claims | `true` | — |
| `CLERK_LEEWAY` | no | JWT timing leeway seconds | `10.0` | — |
| `LOG_LEVEL` | no | Logging level | `INFO` | — |
| `LOG_FORMAT` | no | Log format | `text` | — |
| `LOG_USE_UTC` | no | Use UTC timestamps | `false` | — |
| `DB_AUTO_MIGRATE` | no | Auto-migrate DB on startup | `false` in backend `.env.example` | In `dev`, backend may flip this to true if unset |

### Frontend (Next.js)

| Variable | Required? | Purpose | Default / example | Footguns |
|---|---:|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | Backend base URL used by the browser | `http://localhost:8000` | Must be browser-reachable |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **yes** | Enables Clerk in the frontend | (none) | Must be a real publishable key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | optional | Fallback redirect | `/boards` | — |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` | optional | Post-logout redirect | `/` | — |

## Operational footguns

- **Frontend env template vs runtime env**: `frontend/.env.example` is a template and `compose.yml` intentionally does **not** load it at runtime. Use user-managed `frontend/.env` (for Compose) or `frontend/.env.local` (for Next dev).
- **`DB_AUTO_MIGRATE`**:
  - In `ENVIRONMENT=dev`, backend defaults `DB_AUTO_MIGRATE=true` if you didn’t set it explicitly.
  - In production, consider disabling auto-migrate and running migrations as an explicit step.
- **`NEXT_PUBLIC_API_URL` reachability**: must work from the browser’s network context (host), not only from within the Docker network.
