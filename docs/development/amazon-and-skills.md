# Amazon and skills development guide

This guide is the fastest way to orient an ACP run before changing Amazon-facing or skills-related functionality in Mission Control.

## Start by choosing the correct lane

### 1) Amazon dashboard and reporting lane
Use this when the feature belongs to the main Amazon data surface already exposed from the backend.

Primary backend module:
- `backend/app/api/amazon.py`

Common responsibilities:
- orders
- inventory
- sales
- finance
- campaigns
- pricing
- returns
- profit
- restock
- PPC dashboard reads
- keyword rankings/trends

Typical frontend pages:
- `frontend/src/app/inventory/page.tsx`
- `frontend/src/app/profit/page.tsx`
- `frontend/src/app/restock/page.tsx`
- `frontend/src/app/ppc/page.tsx`
- `frontend/src/app/keywords/page.tsx`
- `frontend/src/app/reports/page.tsx`

### 2) Refund recovery lane
Use this when the feature is about reimbursement audit, claim generation, case workflow, or exports.

Primary backend module:
- `backend/app/api/refunds.py`

Primary services:
- `backend/app/services/refund_audit.py`
- selected sync helpers in `backend/app/services/amazon_sync.py`

### 3) PPC automation lane
Use this for recommendation engines, budget pacing, keyword harvesting, campaign-plan generation, and automation settings.

Primary backend module:
- `backend/app/api/ppc_automation_api.py`

Primary services:
- `backend/app/services/budget_allocator.py`
- `backend/app/services/campaign_builder.py`
- `backend/app/services/campaign_creator.py`
- `backend/app/services/placement_optimizer.py`
- `backend/app/services/negative_pattern_detector.py`
- `backend/app/services/ppc_scheduler.py`
- `backend/app/services/ppc_automation/*`

### 4) AMS live-stream lane
Use this for Amazon Marketing Stream subscription state, hourly metrics, or worker health.

Primary backend module:
- `backend/app/api/ams_api.py`

Runtime pieces:
- `backend/app/services/ams_subscriptions.py`
- `backend/app/services/ams_consumer.py`
- `backend/app/workers/ams_worker.py`
- `ecosystem.ams.config.js`

### 5) Shipments lane
Use this for inbound shipment planning, movement history, or shipment refresh flows.

Primary backend module:
- `backend/app/api/shipments.py`

Primary service:
- `backend/app/services/shipment_tracking.py`

### 6) Skills marketplace lane
Use this when the feature is about installing skills to gateways from Mission Control.

Primary backend module:
- `backend/app/api/skills_marketplace.py`

Primary models:
- `backend/app/models/skills.py`
  - `MarketplaceSkill`
  - `SkillPack`
  - `GatewayInstalledSkill`

Primary frontend routes:
- `frontend/src/app/skills/marketplace/page.tsx`
- `frontend/src/app/skills/packs/page.tsx`
- `frontend/src/app/skills/marketplace/new/page.tsx`
- `frontend/src/app/skills/packs/new/page.tsx`

Primary frontend components:
- `frontend/src/components/skills/MarketplaceSkillsTable.tsx`
- `frontend/src/components/skills/SkillInstallDialog.tsx`
- `frontend/src/components/skills/SkillPacksTable.tsx`
- `frontend/src/components/skills/MarketplaceSkillForm.tsx`

## The critical distinction: two kinds of “skills” exist here

### A) Mission Control skills marketplace
This is the product feature inside Mission Control.

It manages:
- catalog entries for skills
- skill packs
- install/uninstall state per gateway
- gateway dispatch instructions for install/uninstall

It is backed by Mission Control models and APIs.

### B) External OpenClaw skill repositories
These are local skill folders outside the Mission Control product model, usually under `~/.openclaw/skills/`.

Several Amazon features still depend on them.

This matters because changing the marketplace UI does **not** change the underlying Amazon SP-API scripts, and changing the Amazon skill scripts does **not** automatically change the Mission Control marketplace.

## Current Amazon dependency map

Mission Control is partly backend-native and partly hybrid.

| Area | Current source of truth | Key files | Notes |
| --- | --- | --- | --- |
| Orders / inventory / sales / finance / pricing / returns sync | Backend service layer + DB, but sync helpers still call external scripts/APIs | `backend/app/api/amazon.py`, `backend/app/services/amazon_sync.py` | Main Amazon dashboard surface |
| Refund workflow | Backend-native API and DB | `backend/app/api/refunds.py`, `backend/app/services/refund_audit.py` | Best place for new claim workflow work |
| PPC automation | Backend-native service layer with DB-backed recommendations/settings | `backend/app/api/ppc_automation_api.py`, `backend/app/services/*optimizer*` | Separate from basic PPC dashboard reads |
| AMS | Backend-native API plus worker process | `backend/app/api/ams_api.py`, `backend/app/workers/ams_worker.py` | Long-running worker path |
| Competitor snapshots | External Amazon skill files and reports | `backend/app/api/competitors_api.py` | Still file/script-coupled |
| Traffic sync | External SP-API guard script + DB | `backend/app/services/traffic_sync.py` | Hybrid path |
| Skills marketplace | Mission Control models + gateway dispatch | `backend/app/api/skills_marketplace.py` | Productized install flow |

## External script dependencies you must account for

| Mission Control file | External dependency | How it is used | Risk when changing features |
| --- | --- | --- | --- |
| `backend/app/services/amazon_sync.py` | `~/.openclaw/skills/amazon-sp-api/index.js` | SP-API reads | Local environment and script output shape matter |
| `backend/app/services/amazon_sync.py` | `~/.openclaw/skills/amazon-advertising/index.js` | Ads reads | Same hybrid dependency risk |
| `backend/app/services/traffic_sync.py` | `~/.openclaw/skills/amazon-sp-api/guard.js` | sales-traffic sync | Guard output changes can break DB imports |
| `backend/app/api/competitors_api.py` | `~/.openclaw/skills/amazon-sp-api` reports and config files | competitor snapshots/history | File-layout assumptions are baked in |

## Default development rule for new Amazon work

Prefer moving new work toward backend-native storage and APIs.

Use a new direct external skill read only when all of these are true:
- the data is not already modeled in Mission Control
- the data must come from a local script today
- the feature is clearly labeled as hybrid or transitional

If a feature will be used repeatedly by the UI, cron, or ACP workflows, it should usually end up as:
- backend model or query layer
- backend route under `/api/v1/*`
- generated frontend client call
- documented source of truth

## Recommended ACP workflow

### 1) Declare the source of truth up front
Before implementation, decide whether the feature is:
- DB-backed
- sync-backed
- file-proxy-backed
- marketplace-backed
- hybrid with external skill dependency

This prevents ACP from patching the wrong layer.

### 2) Put the backend change in the right module
General rule:
- `/api/v1/amazon/*` for dashboard data and syncs
- `/api/v1/amazon/refunds/*` for reimbursement work
- `/api/v1/ppc/automation/*` for optimization and automation
- `/api/v1/ams/*` for stream subscriptions and live metrics
- `/api/v1/shipments/*` for shipment workflows
- `/api/v1/skills/*` for marketplace and packs

### 3) Regenerate the frontend client when backend contracts change
If you add or change request/response contracts, run:

```bash
cd frontend
npm run api:gen
```

Generated clients live in:
- `frontend/src/api/generated/*`

### 4) Wire the page or component after the contract is stable
Prefer existing page patterns over ad hoc fetch logic.

Common places:
- route page in `frontend/src/app/*/page.tsx`
- shared UI in `frontend/src/components/*`
- URL sorting/filtering helpers in `frontend/src/lib/*`

### 5) Validate narrowly, then broadly if needed
Useful repo commands:

```bash
make check
```

Typical targeted checks:

```bash
cd backend && uv run pytest <target>
cd frontend && npm run lint -- <target>
cd frontend && npm run build
```

Hard acceptance requirement for ACP-1:
- after implementation, run tests that prove the affected Mission Control functionality still works normally
- at minimum, validate the impacted backend endpoints, the PPC automation page/load path, and any new sync, snapshot, or freshness endpoints added by the task
- report test coverage and outcomes clearly in the Build section
- explicitly call out regressions and any areas that remain unverified

### 6) Update docs with the boundary you just changed
At minimum, document:
- the canonical route or module
- the source of truth
- whether the feature is still hybrid
- any required client regeneration step

## Prompting ACP effectively

Include these fields in the task spec whenever possible:

```text
Repo: /Users/zovirollc/workspace/openclaw-mission-control
Goal: <one sentence>
Lane: amazon | refunds | ppc-automation | ams | shipments | skills-marketplace
Canonical backend module: <file>
Canonical frontend page/component: <file>
Source of truth: db | sync | file-proxy | hybrid
Needs api:gen: yes | no
Must not touch: <files or subsystems>
Verification: <exact command or behavior>
```

This is the single highest-leverage way to prevent ACP from wandering across frontend, backend, and external skill repos.

## Common mistakes to avoid

- Treating the skills marketplace as if it were the same thing as local Amazon skill scripts.
- Adding new frontend-only fetch code when the repo already expects backend-generated clients.
- Building a new Amazon feature directly on file reads when the same data should live in PostgreSQL.
- Editing PPC dashboard logic in `ppc_automation_api.py` when the requirement belongs to `amazon.py`, or vice versa.
- Forgetting `npm run api:gen` after backend schema changes.
- Shipping hybrid behavior without documenting which local skill or script it depends on.

## If you only remember one thing

For Amazon work, always answer this first:

**Is this feature native to Mission Control, or is it still a wrapper around an external skill/script?**

That answer determines the correct files, the correct test path, and the correct ACP prompt.
