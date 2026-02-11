# Ops / runbooks

This is the operator entrypoint for Mission Control. It links to the deeper deployment and troubleshooting guides and provides a short “first 30 minutes” checklist for incidents.

## Deep dives

- [Deployment](deployment/README.md)
- [Production](production/README.md)
- [Troubleshooting](troubleshooting/README.md)

## Safety callouts (read first)

- **Data loss:** `docker compose down -v` deletes the Postgres volume. Use only when you are intentionally resetting the environment.
- **Migration risk:** `DB_AUTO_MIGRATE=true` applies Alembic migrations on backend startup.
  - This is convenient in dev.
  - In production, prefer running migrations as an explicit step and keeping auto-migrate off.

## First 30 minutes (incident checklist)

1. **Confirm impact**
   - What’s broken: UI, API, auth, or gateway integration?
   - All users or a subset? A single board/org or all boards?

2. **Check service health**
   - Backend: `/healthz` and `/readyz`
   - Frontend: does it load and reach the API?

3. **Check configuration drift**
   - `NEXT_PUBLIC_API_URL`: browser-reachable backend URL
   - `DATABASE_URL`: backend can reach Postgres
   - `CORS_ORIGINS`: includes the frontend origin

4. **Check auth (Clerk)**
   - Frontend: Clerk keys are present and correct
   - Backend: `CLERK_SECRET_KEY` is present and correct

5. **Check logs**
   - Backend logs for auth failures and 5xx spikes.
   - Frontend logs for API URL/proxy issues.

6. **Stabilize**
   - Roll back the last change if you can.
   - Temporarily disable optional integrations (gateway) to isolate.

## Backups / restore

See [Production](production/README.md). If you run Mission Control in production, treat backup/restore as a regular drill, not a one-time setup.
