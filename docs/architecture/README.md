# Architecture

Mission Control is a three-layer system:
- a Next.js frontend for operator workflows
- a FastAPI backend for API, orchestration, and policy boundaries
- a PostgreSQL data layer accessed through SQLModel

On top of that core, some product areas are fully backend-native, while others still bridge to external OpenClaw skills or provider scripts.

## System shape

### Frontend
- Framework: Next.js App Router
- Root: `frontend/src/app`
- Shared UI: `frontend/src/components`
- Generated API clients: `frontend/src/api/generated`
- Auth glue: `frontend/src/auth`

The frontend should normally talk to the backend through generated clients or shared fetch helpers, not direct filesystem or shell access.

### Backend
- Framework: FastAPI
- Entry point: `backend/app/main.py`
- Route modules: `backend/app/api/*`
- Domain services: `backend/app/services/*`
- Models: `backend/app/models/*`
- Schemas: `backend/app/schemas/*`

The backend is the contract boundary for the UI and for most automation.

### Data layer
- Database: PostgreSQL
- ORM/query layer: SQLModel + SQLAlchemy async
- Session/bootstrap: `backend/app/db/*`

Most durable Mission Control state should land here rather than in frontend-only state or ad hoc local files.

## Runtime surfaces

Default repo-level surfaces:
- frontend UI: `http://localhost:3000`
- backend API: `http://localhost:8000`
- backend health: `/healthz`, `/readyz`
- OpenAPI schema: `/openapi.json`
- Swagger UI: `/docs`

Optional runtime pieces:
- Postgres via `compose.yml`
- AMS worker via `ecosystem.ams.config.js`
- Gateway-linked execution for installs, orchestration, and remote operations

## Repository map

| Area | Purpose | Key paths |
| --- | --- | --- |
| Frontend routes | App pages and route-level UI | `frontend/src/app/*` |
| Frontend components | Shared UI building blocks | `frontend/src/components/*` |
| Generated clients | Typed backend client wrappers | `frontend/src/api/generated/*` |
| Backend routes | Public API surface | `backend/app/api/*` |
| Backend services | Business logic and external integrations | `backend/app/services/*` |
| Backend models | Persistent entities | `backend/app/models/*` |
| Backend schemas | Request and response contracts | `backend/app/schemas/*` |
| Docs | Operator and developer docs | `docs/*` |

## Major backend domains

Representative route areas currently wired from `backend/app/main.py`:
- agents and local agent directory
- boards, tasks, tags, approvals, onboarding, board memory
- gateways and gateway lifecycle
- activity and metrics
- system and organization management
- reports and intel file access
- Amazon dashboard and sync APIs
- refunds
- PPC automation
- AMS
- shipments
- skills marketplace
- souls directory

## Request and data flows

### 1) Standard frontend → backend flow
1. A page in `frontend/src/app/*` renders an operator workflow.
2. The page calls a generated client or shared backend helper.
3. FastAPI route logic in `backend/app/api/*` validates input and applies auth/policy.
4. A service or query path in `backend/app/services/*` or `backend/app/db/*` does the work.
5. Data is read from or written to PostgreSQL, or fetched from an approved external integration.
6. The response is returned to the frontend.

### 2) Generated-client flow
1. Backend contracts change.
2. OpenAPI schema changes at `/openapi.json`.
3. Frontend client code is regenerated with Orval.
4. UI code consumes the typed client from `frontend/src/api/generated/*`.

This keeps the frontend and backend aligned without duplicating request shapes by hand.

### 3) Amazon sync flow
1. A sync endpoint under `/api/v1/amazon/*` or `/api/v1/amazon/refunds/*` is triggered.
2. Backend service code performs sync, audit, or aggregation work.
3. Some services write fully native DB records.
4. Some services still call external OpenClaw skill scripts first, then normalize results into DB tables.
5. UI pages read from the backend-native API surface, not from local files.

### 4) Skills marketplace flow
1. Operators manage skills and packs from `/skills/*` pages.
2. Backend APIs under `/api/v1/skills/*` read and write marketplace models.
3. Install or uninstall actions are dispatched to a gateway workspace.
4. Gateway execution performs the actual skill asset change outside the frontend.

## Native vs hybrid areas

### Mostly native Mission Control domains
These are primarily modeled, stored, and served inside Mission Control:
- boards and tasks
- approvals
- organizations and users
- gateways and agent lifecycle
- activity and metrics
- shipments
- skills marketplace
- most PPC automation state
- refund claim workflow

### Hybrid domains
These still depend on local OpenClaw skills, provider scripts, or file-based inputs:
- Amazon sync helpers in `backend/app/services/amazon_sync.py`
- traffic sync in `backend/app/services/traffic_sync.py`
- competitor data in `backend/app/api/competitors_api.py`
- some reports and intel/discovery file-proxy routes

These areas are the most important to document clearly before handing work to ACP.

## The two meanings of “skills”

This repo uses the word “skills” in two different ways.

### 1) Skills marketplace, a Mission Control product feature
This includes:
- marketplace catalog entries
- skill packs
- installed-skill state per gateway
- install/uninstall flows dispatched through Mission Control

Core code:
- `backend/app/api/skills_marketplace.py`
- `backend/app/models/skills.py`
- `frontend/src/app/skills/*`
- `frontend/src/components/skills/*`

### 2) External OpenClaw skill folders used by backend integrations
Examples:
- `~/.openclaw/skills/amazon-sp-api`
- `~/.openclaw/skills/amazon-advertising`

These are not the same as marketplace records.

A page or route can use the marketplace without touching local Amazon skills, and a backend Amazon sync can depend on local skill scripts without any change to the marketplace UI.

## Where Amazon work actually lives

Amazon-related work is split across several layers:

| Concern | Main backend module | Main supporting services |
| --- | --- | --- |
| Amazon dashboard reads and syncs | `backend/app/api/amazon.py` | `amazon_sync.py`, `profit_calculator.py`, `campaign_optimizer.py` |
| Refund recovery | `backend/app/api/refunds.py` | `refund_audit.py`, sync helpers |
| PPC automation engine | `backend/app/api/ppc_automation_api.py` | budget, keyword, placement, plan, TACoS, scheduler services |
| AMS | `backend/app/api/ams_api.py` | `ams_subscriptions.py`, `ams_consumer.py`, worker |
| Shipments | `backend/app/api/shipments.py` | `shipment_tracking.py` |
| Competitor snapshots | `backend/app/api/competitors_api.py` | local Amazon skill files/scripts |

For a deeper ACP-focused guide, see [Amazon and skills development guide](../development/amazon-and-skills.md).

## Placement rules for new work

### Put it in the frontend only if
- it is presentation-only
- the backend contract already exists
- the source of truth is already stable

### Put it in the backend if
- data needs normalization, persistence, filtering, or policy enforcement
- multiple pages or automations will reuse it
- it should become part of the Mission Control contract

### Treat it as hybrid only if
- the data truly comes from an external script or local skill today
- you document that dependency explicitly
- you accept that local environment shape can affect the feature

## Practical architecture rules

- The backend is the integration boundary.
- The frontend should not read local files directly.
- New repeated-use Amazon features should prefer DB-backed backend contracts.
- Generated clients should be refreshed when backend contracts change.
- Docs should call out hybrid dependencies explicitly, especially for Amazon and skills work.

## Current documentation priorities

The highest-value documentation for ongoing development is:
1. architecture and repo map
2. Amazon lane boundaries
3. skills marketplace vs external skill dependency boundaries
4. ACP handoff conventions

That is why this section and the dedicated Amazon/skills guide exist.