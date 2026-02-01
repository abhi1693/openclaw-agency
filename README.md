# OpenClaw Agency — Pilot (Kanban)

MVP: **Next.js (frontend)** + **FastAPI (backend)** + **PostgreSQL**.

No auth (yet). The goal is simple visibility: everyone can see what exists and who owns it.

## Repo layout

- `frontend/` — Next.js App Router (TypeScript)
- `backend/` — FastAPI + SQLAlchemy + Alembic

## Database

Uses local Postgres:

- user: `postgres`
- password: `REDACTED`
- db: `openclaw_agency`

## Environment

Do **not** commit real `.env` files.

- Backend: copy `backend/.env.example` → `backend/.env`
- Frontend: copy `frontend/.env.example` → `frontend/.env.local`

If you want to test from another device (phone/laptop), make sure:

- both servers bind to `0.0.0.0`
- `NEXT_PUBLIC_API_URL` is set to `http://<YOUR_MACHINE_IP>:8000` (not `127.0.0.1`)
- backend `CORS_ORIGINS` includes `http://<YOUR_MACHINE_IP>:3000`

## Run backend (LAN-accessible)

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
# or from another machine:
# curl http://<YOUR_MACHINE_IP>:8000/health
```

## Run frontend (LAN-accessible)

```bash
cd frontend
npm run dev:lan
```

Open:

- local: http://localhost:3000
- LAN: `http://<YOUR_MACHINE_IP>:3000`

## API

- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/{id}`
- `DELETE /tasks/{id}`
