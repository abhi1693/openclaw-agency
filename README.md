# OpenClaw Mission Control

[![CI](https://github.com/abhi1693/openclaw-mission-control/actions/workflows/ci.yml/badge.svg)](https://github.com/abhi1693/openclaw-mission-control/actions/workflows/ci.yml)

Web UI + API for operating OpenClaw: managing boards, tasks, agents, approvals, and gateway connections.

## Active development

OpenClaw Mission Control is under active development. Expect breaking changes and incomplete features as we iterate.

- Use at your own risk for production workloads.
- We welcome **bug reports**, **feature requests**, and **PRs** — see GitHub Issues: https://github.com/abhi1693/openclaw-mission-control/issues

- **Frontend:** Next.js app (default http://localhost:3000)
- **Backend:** FastAPI service (default http://localhost:8000)
- **Data:** Postgres + Redis
- **Gateway integration:** see [`docs/openclaw_gateway_ws.md`](./docs/openclaw_gateway_ws.md)

## Authentication

Mission Control supports multiple authentication modes via the `AUTH_MODE` environment variable:

| Mode | Use Case | External Dependencies |
|------|----------|----------------------|
| `clerk` (default) | Production, multi-user, SaaS | Requires Clerk account |
| `local_bearer` | Self-hosted, single-user, homelab | None |
| `disabled` | Local development only | None |

### Clerk Mode (Default)

Full-featured authentication using [Clerk](https://clerk.com/). Requires:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in frontend
- `CLERK_JWKS_URL` in backend

### Local Bearer Mode

Simple token-based authentication for self-hosted deployments:

```bash
# Backend
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=your-random-token

# Frontend
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=your-random-token
```

See [docs/authentication-configuration.md](./docs/authentication-configuration.md) for detailed configuration.

### Disabled Mode

No authentication for local development:

```bash
AUTH_MODE=disabled
```

> ⚠️ **Warning:** Only use for localhost development. Never expose to networks.

> Note on auth (Clerk)
>
> Clerk is **optional** for local/self-host. The frontend enables Clerk **only** when
> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set. If you don't want to configure Clerk,
> set `AUTH_MODE=local_bearer` or `AUTH_MODE=disabled`.
>
> See [docs/authentication-configuration.md](./docs/authentication-configuration.md) for details.

## Quick start (self-host with Docker Compose)

### Prerequisites

- Docker + Docker Compose v2 (`docker compose`)

### Run

```bash
cp .env.example .env

# REQUIRED: ensure the browser can reach the backend API.
# NEXT_PUBLIC_API_URL must be reachable from the *browser* (host), not an internal Docker network name.
# If you change ports/hosts, update NEXT_PUBLIC_API_URL in .env accordingly.
# (Missing/blank NEXT_PUBLIC_API_URL will break frontend API calls like Activity feed.)

# IMPORTANT: if you are not configuring Clerk, disable it by ensuring
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is NOT set.
# (The default `frontend/.env.example` contains placeholders that you should delete/blank.)

docker compose -f compose.yml --env-file .env up -d --build
```

Open:

- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/healthz

### Stop

```bash
docker compose -f compose.yml --env-file .env down
```

### Common Compose commands

```bash
# Tail logs
docker compose -f compose.yml --env-file .env logs -f --tail=200

# Rebuild a single service
docker compose -f compose.yml --env-file .env up -d --build backend

# Reset data (DESTRUCTIVE: deletes Postgres/Redis volumes)
docker compose -f compose.yml --env-file .env down -v
```

## Quick start (local development)

This is the fastest workflow for contributors: run Postgres/Redis via Docker, and run the backend + frontend in dev mode.

### Prerequisites

- Docker + Docker Compose v2
- Python **3.12+** + [`uv`](https://github.com/astral-sh/uv)
- Node.js (recommend 18+) + npm

### 1) Start Postgres + Redis

```bash
cp .env.example .env

docker compose -f compose.yml --env-file .env up -d db redis
```

### 2) Backend (FastAPI)

```bash
cd backend

cp .env.example .env

# deps
uv sync --extra dev

# run API on :8000
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Notes:

- If you run the DB/Redis containers, the backend should use the defaults in `backend/.env` (`localhost:5432` and `localhost:6379`).
- Database migrations:

  ```bash
  cd backend
  uv run alembic upgrade head
  ```

### 3) Frontend (Next.js)

```bash
cd frontend

# Configure API URL (REQUIRED) and optionally disable Clerk for local dev by removing/blanking Clerk env vars
cp .env.example .env.local

# If you run the backend locally on :8000, this should be:
# NEXT_PUBLIC_API_URL=http://localhost:8000

npm install
npm run dev
```

Open http://localhost:3000.

### Cypress E2E (local)

When running Cypress (`cd frontend && npm run e2e`), make sure `NEXT_PUBLIC_API_URL` is set (either in `frontend/.env.local` or your shell env). In CI we run the frontend on `http://localhost:3000`, so `NEXT_PUBLIC_API_URL` is set to `http://localhost:3000` for the E2E job.

## Key concepts / high-level architecture

- **Mission Control backend** exposes a REST API at `/api/v1/*` and also hosts health endpoints (`/healthz`, `/readyz`).
- **Mission Control frontend** calls the backend via `NEXT_PUBLIC_API_URL`.
- **Postgres** stores boards/tasks/agents/etc.
- **Redis** is used for background work (RQ).
- **OpenClaw Gateway** connectivity is over WebSockets; protocol details live in [`docs/openclaw_gateway_ws.md`](./docs/openclaw_gateway_ws.md).

## Common commands

- Testing notes: [`docs/testing/README.md`](./docs/testing/README.md)

### CI test suites (canonical commands)

CI (`.github/workflows/ci.yml`) runs these suites on PRs:

- **Backend**: `make backend-coverage` (includes `pytest` + coverage artifacts)
- **Frontend**: `make frontend-test` (Vitest + coverage)
- **E2E (Cypress)**: runs only when a `cypress.config.*` is present in the repo (job `e2e`).

### Coverage policy

CI enforces a **scoped 100% coverage gate** (statements + branches) for a small set of unit-testable modules.
See `docs/coverage-policy.md`.

From repo root:

```bash
make help
make setup
make lint
make typecheck
make test
make check
```

## Troubleshooting

More: [`docs/troubleshooting/README.md`](./docs/troubleshooting/README.md)

### Frontend keeps redirecting / Clerk errors

You likely have `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set (even to a placeholder). To run without Clerk:

- Remove the `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` line from `frontend/.env.local`, **or** set it to an empty value.

### Backend can’t connect to Postgres/Redis

- Confirm containers are up:

  ```bash
  docker compose -f compose.yml --env-file .env ps
  ```

- If you’re running backend locally (not in compose), make sure `backend/.env` points to `localhost`:
  - `DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/mission_control`
  - `REDIS_URL=redis://localhost:6379/0`

### Port already in use

Adjust ports in `.env` (copied from `.env.example`):

- `FRONTEND_PORT`
- `BACKEND_PORT`
- `POSTGRES_PORT`
- `REDIS_PORT`

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=abhi1693/openclaw-mission-control&type=date&legend=top-left)](https://www.star-history.com/#abhi1693/openclaw-mission-control&type=date&legend=top-left)
