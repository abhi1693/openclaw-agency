# Ops / runbooks (operator hub)

This page is the operator entrypoint. It links to the existing deep-dive docs and provides **copy/paste checklists**.

## ⚠️ Safety callouts (read before copy/paste)

### Data loss risk: `docker compose down -v`
- `docker compose down -v` **deletes volumes** (including Postgres data).
- Treat as **destructive**. Use only when you are intentionally resetting the DB and you have a verified backup/restore path.

### Migration risk: `DB_AUTO_MIGRATE=true`
- The compose reference stack defaults `DB_AUTO_MIGRATE=true`, meaning the backend may run DB migrations on startup.
- This can cause downtime or irreversible schema changes if used carelessly.
- For production-like environments, confirm the repo’s migration guidance + rollback policy before enabling auto-migrate.

---

## Deep dives (authoritative)

- [Deployment](deployment/README.md) (compose operations, persistence, reset patterns)
- [Production](production/README.md) (reverse proxy, firewall posture, systemd example, baseline backups)
- [Troubleshooting](troubleshooting/README.md)

## What’s running (reference topology)

The repo provides a reference **Docker Compose** topology (see `compose.yml`):

- `db`: Postgres 16 (port 5432)
- `backend`: FastAPI (port 8000)
- `frontend`: Next.js (port 3000)

> Production may differ (compose vs k8s vs managed services). If your production topology differs, treat the commands below as **reference/dev** only.

## Common operator tasks (compose reference)

### Start / restart
- Start:
  - `docker compose up -d`
- Check status:
  - `docker compose ps`
- Tail backend logs:
  - `docker compose logs -f backend`
- Stop (non-destructive):
  - `docker compose down`

**What you should see**
- `docker compose ps` shows `db`, `backend`, `frontend` as `running`.
- Backend logs show startup without repeated crash loops.

### Health verification

Backend health endpoints exist in `backend/app/main.py`:

- `curl -fsS http://localhost:8000/health`
- `curl -fsS http://localhost:8000/healthz`
- `curl -fsS http://localhost:8000/readyz`

Frontend:
- `curl -fsS http://localhost:3000/` (expect HTTP 200)

**What you should see**
- All backend endpoints return HTTP 200.
- `/readyz` returns ready only after dependencies (notably DB) are reachable.

## First 30 minutes (incident checklist)

1) **Confirm impact**
- [ ] What’s broken: UI, API, auth, gateway integration?
- [ ] All users or subset/one tenant?
- [ ] Regression window: did this start after a deploy/config change?

2) **Check the basics (fast signal)**
- [ ] Backend readiness: `GET /readyz` (200?)
- [ ] Backend liveness: `GET /healthz` (200?)
- [ ] Frontend loads and can reach backend API.
- [ ] Check Postgres reachability from backend (`DATABASE_URL`).

3) **Auth sanity (Clerk footgun)**
- [ ] Frontend: confirm you did **not** accidentally load `.env.example` with placeholder Clerk keys.
- [ ] Frontend: if Clerk is enabled, confirm the expected publishable key is set.
- [ ] Backend: confirm `CLERK_SECRET_KEY` (if Clerk is used) is correct.

4) **Stop the bleeding**
- [ ] If a deploy just happened and errors spiked: consider rollback to last-known-good.
- [ ] If background activity is amplifying impact: pause/scale down workers (if applicable to your topology) before it corrupts data.

5) **Capture evidence**
- [ ] Save: error samples, timestamps, deploy/config diff, request IDs/correlation IDs.
- [ ] Snapshot key dashboards (error rate, latency, saturation) if you have metrics.

6) **Communicate**
- [ ] Post an initial update: impact + mitigation in progress + next update time.

## Backups / restore

See [Production](production/README.md). Treat backup/restore as a regular drill, not a one-time setup.
