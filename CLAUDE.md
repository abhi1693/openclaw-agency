# CLAUDE.md — Project Context for Claude Code

## What is this?
ZOVIRO Mission Control — internal ops dashboard for an Amazon FBA brand.
FastAPI backend + Next.js frontend + PostgreSQL. Deployed locally on a Mac mini via pm2.

## Architecture

```
frontend/src/app/           → Next.js 15 pages + API routes (TypeScript)
frontend/src/app/api/       → API routes that proxy to FastAPI via fetchBackend()
backend/app/api/            → FastAPI endpoint modules
backend/app/models/         → SQLModel ORM models (PostgreSQL 16)
backend/app/services/       → Business logic services
backend/app/schemas/        → Pydantic request/response schemas
backend/migrations/         → Alembic DB migrations
```

## Data flow pattern (ALWAYS follow this)

```
User → Next.js page → /api/xxx/route.ts (fetchBackend) → FastAPI :8000 → PostgreSQL
```

- Frontend NEVER calls external APIs directly
- All data goes through `fetchBackend()` in route handlers
- Backend `.env` has `DATABASE_URL` and `LOCAL_AUTH_TOKEN`

## Adding a new feature

### New page
1. `frontend/src/app/{name}/page.tsx` — React page
2. `frontend/src/app/api/{name}/route.ts` — API route using `fetchBackend()`
3. Add sidebar link in `frontend/src/components/layouts/sidebar/data.tsx`

### New API endpoint
1. `backend/app/api/{name}.py` — FastAPI router
2. Register in `backend/app/main.py` under `api_v1`
3. Add model in `backend/app/models/` if new DB table needed
4. Run: `cd backend && alembic revision --autogenerate -m "add {name}" && alembic upgrade head`

## External dependencies (via symlinks)

```
_skills/    → ~/.openclaw/skills/        (24 agent skills, Node.js)
_config/    → ~/.openclaw/workspace/config/  (products.yaml, sku-asin-map.json, etc)
_workspace/ → ~/.openclaw/workspace/     (MEMORY.md, AGENTS.md, reports/)
```

When a task requires skill changes, edit files under `_skills/{skill-name}/`.

## Dev commands

```bash
pm2 restart mc-backend    # restart FastAPI
pm2 restart mc-frontend   # restart Next.js
pm2 logs mc-backend       # check backend logs
pm2 logs mc-frontend      # check frontend logs

cd backend && alembic upgrade head                    # run migrations
cd backend && alembic revision --autogenerate -m "msg"  # new migration

# Access
# Local: http://localhost:3001
# LAN:   http://192.168.10.109:3001
# Backend: http://localhost:8000
```

## Git & PR workflow (MANDATORY)

Every code change must go through a PR:

```bash
# 1. Create branch
git checkout master && git pull
git checkout -b feat/short-description

# 2. Make changes, then verify build
cd frontend && npx next build
cd ..

# 3. Commit and push
git add -A
git commit -m "feat: short description of change"
git push -u origin feat/short-description

# 4. Create PR
gh pr create --title "feat: short description" --body "What changed and why"

# 5. Merge (after build passes)
gh pr merge --squash --delete-branch
```

- Branch from `master`, PR back to `master`
- Squash merge preferred
- **ALWAYS run `cd frontend && npx next build` before creating PR**
- If build fails, fix it before PR

## Completion format (MANDATORY)

After every task, output exactly this format:

```
### Changes
- `path/to/file.tsx` — what was changed and why
- `path/to/another.py` — what was changed and why

### Build
✅ `next build` passed (or ❌ with error details)

### PR
PR #XX: title — merged ✅ (or: no PR needed — reason)

### Summary
One sentence describing what was done.
```

This format is required. The orchestrating agent (Jarvis) uses it to route reports.

## Style notes

- Use existing UI patterns — look at `/refunds` or `/shipments` for reference
- Tailwind CSS, no external UI libraries except what's already installed
- Chinese labels in sidebar, English in code
- Dark slate theme with status badges (green/blue/yellow/red)
