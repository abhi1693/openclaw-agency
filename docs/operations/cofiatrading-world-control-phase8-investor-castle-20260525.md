# COFIATRADING World Control — Phase 8 Investor Room + 100M Castle Gravity

source_tag: INVESTOR_CASTLE_GRAVITY_PHASE8_20260525
status: LIVING_UI_ROUTE_AGGREGATION
date_utc: 2026-05-25

## Scope

Phase 8 makes the 100M ARR Castle and Investor Truth panel interactive:

- `snapshot.routes` aggregates six read-only routes.
- `snapshot.investor_room` aggregates ARR/MRR/gap, blockers, next 7 days, and proof per route.
- Clicking the 100M Castle opens the route aggregation drawer.
- Clicking Investor Truth opens the Investor Room drawer.

No hub patch, no `apps/mission-control` patch, no send, no publish, no deploy, no Stripe write.

## Canon Sources

- `/Users/burakokyay/cof-trading/docs/director/current/DIRECTOR_CONTEXT_CAPSULE.md`
- `/Users/burakokyay/cof-trading/docs/director/current/STRIPE_CANONICAL_OFFER_MAP.md`
- `GET http://127.0.0.1:8430/api/iron/revenue/summary`
- Existing OpenClaw snapshot: boards, agents, garage trucks, offers, knowledge.

## Snapshot Before / After

Before Phase 8:

```json
{
  "hasRoutes": false,
  "hasInvestorRoom": false,
  "currentArr": 10548,
  "offersCount": 8,
  "trucksCount": 59
}
```

After Phase 8:

```json
{
  "hasRoutes": true,
  "hasInvestorRoom": true,
  "routeKeys": [
    "acquisition_route",
    "broker_route",
    "compliance_route",
    "knowledge_route",
    "revenue_route",
    "support_route"
  ],
  "currentArr": 10548,
  "gap": 99989452,
  "next_7_days_tasks": []
}
```

`next_7_days_tasks` is intentionally empty: current OpenClaw tasks do not expose a proven `due_within_7d` field.

## Aggregated Routes

| Route | Status | Source | Key metrics | Last proof |
|---|---|---|---|---|
| Revenue Route | AMBER | Stripe + Iron CRM + Brokers | ARR 10548, MRR 879, VIP 7, past_due 194 | HTTP 200 revenue aggregate |
| Acquisition Route | AMBER | Asset Factory + Acquisition Engine + CofiaPublisher | assets 47, content 35, brochures 6, scripts 6, renders OLD_CITY 86 | HTTP status live; renders known |
| Knowledge Route | AMBER | Obsidian + Notion + Drive | Obsidian files 11254, Notion AMBER, Drive AMBER | local FS Obsidian proof |
| Broker Route | AMBER | FXcess + IronFX + Libertex + RaiseFX + TMGM | lifetime 2379642 USD, FTD 3493 | Broker aggregate from Hub Iron summary |
| Support Route | AMBER | Gmail + Telegram | unread UNKNOWN, important UNKNOWN, Telegram LOCKED | Counts expected; no bodies rendered |
| Compliance Route | GREEN | Proof Ledger + approval gates + write locks | publish/send/Stripe write locked | Proof Ledger approvals active |

## Investor Room

Top blockers:

```text
Academy offer NEEDS_CONFIRMATION
Notion read endpoint missing
Drive file-level read unproved
Stripe by_offer counts remain AMBER
Social publish remains locked until compliance gate + Director GO
```

Read-only footer:

```text
Read-only investor truth. Pas de send. Pas de Stripe write. Pas de promesse gains.
```

## Refresh Test

```text
first=2026-05-25T16:14:25.668Z|10548|acquisition_route,broker_route,compliance_route,knowledge_route,revenue_route,support_route
second=2026-05-25T16:15:27.735Z|10548|acquisition_route,broker_route,compliance_route,knowledge_route,revenue_route,support_route
```

`fetchedAt` changed after 60 seconds; route keys and ARR stayed coherent without rebuild.

## PII / Forbidden Public Alias Check

```text
grep snapshot.routes for email/body/client/customer/@gmail/@outlook/@hotmail/AOKIJI/KAIDO -> 0 matches
```

## UI Proof

- Castle route aggregation drawer:
  `/Users/burakokyay/.openclaw/vendor/openclaw-mission-control/docs/operations/screenshots/world-control-phase8-castle-drawer-20260525T1548Z.png`
- Investor Room drawer:
  `/Users/burakokyay/.openclaw/vendor/openclaw-mission-control/docs/operations/screenshots/world-control-phase8-investor-room-drawer-20260525T1550Z.png`

## Files Changed

- `/Users/burakokyay/.openclaw/vendor/openclaw-mission-control/frontend/src/app/api/cofiatrading-world-control/snapshot/route.ts`
- `/Users/burakokyay/.openclaw/vendor/openclaw-mission-control/frontend/src/components/cofiatrading-world-control/WorldControl.tsx`

R5 backups:

- `/Users/burakokyay/.openclaw/vendor/openclaw-mission-control/frontend/src/app/api/cofiatrading-world-control/snapshot/route.ts.bak-20260525T154521Z-phase8-castle-investor`
- `/Users/burakokyay/.openclaw/vendor/openclaw-mission-control/frontend/src/components/cofiatrading-world-control/WorldControl.tsx.bak-20260525T154521Z-phase8-castle-investor`

Build proof:

```text
docker compose build frontend
PASS
docker compose up -d frontend
frontend started
```

## Verdict

Phase 8 is LIVING_UI_ROUTE_AGGREGATION.

The Castle is no longer visual-only: it opens six route cards with metrics, proof, gates, and blockers. Investor Room is interactive and read-only, with truthful blockers and an empty next-7-days list until due fields exist.
