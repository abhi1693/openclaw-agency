# Feature map

Use this page when you need to answer one question quickly:

**Which frontend page, backend module, and source of truth own this feature?**

For API contract details, use `GET /openapi.json` as the final source of truth.

## Amazon core surfaces

### Inventory
- Frontend: `frontend/src/app/inventory/page.tsx`
- Backend: `backend/app/api/amazon.py`
- Key endpoints:
  - `GET /api/v1/amazon/inventory`
  - `GET /api/v1/amazon/inventory/status`
  - `GET /api/v1/amazon/inventory/fc-distribution`
  - `POST /api/v1/amazon/sync`
- Source of truth: Mission Control DB populated by Amazon sync helpers
- Notes: hybrid ingest path because sync still flows through `amazon_sync.py`

### Profit
- Frontend: `frontend/src/app/profit/page.tsx`
- Backend: `backend/app/api/amazon.py`
- Key endpoints:
  - `GET /api/v1/amazon/profit`
  - `POST /api/v1/amazon/profit/refresh`
  - `GET /api/v1/amazon/profit/cogs`
  - `PUT /api/v1/amazon/profit/cogs`
- Source of truth: Mission Control DB + backend profit calculation
- Notes: prefer extending backend models/services, not frontend-only math

### Restock
- Frontend: `frontend/src/app/restock/page.tsx`
- Backend: `backend/app/api/amazon.py`
- Key endpoints:
  - `GET /api/v1/amazon/restock`
  - `POST /api/v1/amazon/restock/sync`
  - `GET /api/v1/amazon/restock/config`
  - `PUT /api/v1/amazon/restock/config`
- Source of truth: Mission Control DB with backend restock logic
- Notes: restock config is a persistent backend concern, not just a report transform

### Orders, sales, finance, pricing, returns
- Frontend: Amazon dashboard pages and reports pages under `frontend/src/app/*`
- Backend: `backend/app/api/amazon.py`
- Key endpoints include:
  - `/api/v1/amazon/orders`
  - `/api/v1/amazon/sales`
  - `/api/v1/amazon/finance`
  - `/api/v1/amazon/pricing`
  - `/api/v1/amazon/returns`
  - matching `*/sync` routes where available
- Source of truth: Mission Control DB after sync/import
- Notes: sync remains hybrid in places because service code still wraps external local skills

## Refund recovery

- Frontend: refund workflow pages under the Amazon/refunds UI surface
- Backend: `backend/app/api/refunds.py`
- Key endpoints:
  - `GET /api/v1/amazon/refunds/summary`
  - `GET /api/v1/amazon/refunds/claims`
  - `POST /api/v1/amazon/refunds/audit`
  - `GET /api/v1/amazon/refunds/export`
  - `POST /api/v1/amazon/refunds/case/generate`
  - `PATCH /api/v1/amazon/refunds/claims/batch-status`
- Source of truth: Mission Control DB, especially `RefundClaim` and related reimbursement data
- Notes: this is one of the cleanest backend-native Amazon areas for future ACP work

## PPC surfaces

### PPC dashboard and analysis
- Frontend: `frontend/src/app/ppc/page.tsx`
- Backend: `backend/app/api/amazon.py`
- Key endpoints:
  - `GET /api/v1/amazon/ppc/overview`
  - `GET /api/v1/amazon/ppc/keywords`
  - `GET /api/v1/amazon/ppc/search-terms`
  - `GET /api/v1/amazon/ppc/reports`
  - `GET /api/v1/amazon/ppc/weekly`
  - `GET /api/v1/amazon/ppc/campaign-analysis`
  - `GET /api/v1/amazon/ppc/bid-analysis`
  - `GET /api/v1/amazon/ppc/ai-insights`
  - `GET /api/v1/amazon/ppc/keyword-analysis`
  - `GET /api/v1/amazon/ppc/optimization-recommendations`
- Source of truth: Mission Control DB plus derived backend analysis
- Notes: this is the analytics/dashboard lane, not the automation lane

### PPC automation
- Frontend: automation-related views and controls in the PPC surface
- Backend: `backend/app/api/ppc_automation_api.py`
- Key endpoints:
  - `/api/v1/ppc/automation/settings/*`
  - `/api/v1/ppc/automation/bid-recommendations`
  - `/api/v1/ppc/automation/keyword-recommendations`
  - `/api/v1/ppc/automation/budget-allocations`
  - `/api/v1/ppc/automation/placement-recommendations`
  - `/api/v1/ppc/automation/campaign-plans`
  - `/api/v1/ppc/automation/run-optimizer`
  - `/api/v1/ppc/automation/sync-traffic`
  - `/api/v1/ppc/automation/traffic`
- Source of truth: backend-native recommendation/settings tables and service outputs
- Notes: separate from plain Amazon dashboard reads, even though both show up in PPC workflows

## AMS

- Frontend: AMS monitoring and status surfaces
- Backend: `backend/app/api/ams_api.py`
- Worker/runtime:
  - `backend/app/services/ams_subscriptions.py`
  - `backend/app/services/ams_consumer.py`
  - `backend/app/workers/ams_worker.py`
  - `ecosystem.ams.config.js`
- Key endpoints:
  - `GET /api/v1/ams/config`
  - `GET /api/v1/ams/status`
  - `GET /api/v1/ams/subscriptions`
  - `POST /api/v1/ams/subscriptions`
  - `POST /api/v1/ams/subscriptions/ensure`
  - `DELETE /api/v1/ams/subscriptions/{subscription_id}`
  - `GET /api/v1/ams/metrics/hourly`
- Source of truth: Mission Control DB plus live worker/subscription state
- Notes: when debugging AMS, include both API and worker process health

## Shipments

- Frontend: shipment planning and tracking pages
- Backend: `backend/app/api/shipments.py`
- Key endpoints:
  - `GET /api/v1/shipments/dashboard`
  - `GET /api/v1/shipments/history`
  - `POST /api/v1/shipments/cron/refresh-active`
  - CRUD under `/api/v1/shipments/*`
  - move history endpoints under `/api/v1/shipments/{shipment_id}/moves/*`
- Source of truth: Mission Control DB
- Notes: this lane is backend-native and should stay that way

## Competitors

- Frontend: competitor dashboards and reports
- Backend: `backend/app/api/competitors_api.py`
- Source of truth: external skill files and generated report JSON under `~/.openclaw/skills/amazon-sp-api`
- Notes:
  - this is still a hybrid/file-coupled feature
  - treat file layout and script output as part of the contract
  - document external dependencies whenever ACP touches this area

## Skills marketplace

- Frontend:
  - `frontend/src/app/skills/page.tsx`
  - `frontend/src/app/skills/marketplace/page.tsx`
  - `frontend/src/app/skills/packs/page.tsx`
- Backend: `backend/app/api/skills_marketplace.py`
- Key data models:
  - `MarketplaceSkill`
  - `SkillPack`
  - `GatewayInstalledSkill`
- Source of truth: Mission Control DB plus gateway install state
- Notes:
  - this is a Mission Control product feature
  - it is not the same thing as the local Amazon skill repos in `~/.openclaw/skills/`
  - write access is admin-gated in the backend

## Fast decision rules

If a task mentions any of the following, start here:

- `inventory`, `profit`, `restock` → `backend/app/api/amazon.py`
- `refund`, `reimbursement`, `claim` → `backend/app/api/refunds.py`
- `bid`, `budget`, `keyword recommendation`, `optimizer`, `campaign plan` → `backend/app/api/ppc_automation_api.py`
- `AMS`, `marketing stream`, `subscriptions`, `hourly metrics` → `backend/app/api/ams_api.py`
- `shipment`, `inbound`, `move history` → `backend/app/api/shipments.py`
- `competitor`, `alerts`, `history.json` → `backend/app/api/competitors_api.py`
- `skills marketplace`, `packs`, `install skill`, `gateway skill state` → `backend/app/api/skills_marketplace.py`

## Recommended companion docs

- [Architecture overview](../architecture/README.md)
- [Amazon and skills development guide](../development/amazon-and-skills.md)
- [API notes](./api.md)