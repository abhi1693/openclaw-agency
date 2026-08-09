# COFIATRADING World Control — Phase 6 Offer Factory + Stripe Read

source_tag: OFFER_FACTORY_PHASE6_STRIPE_READ_20260525
status: LIVING_UI_WITH_STRIPE_READ_AMBER_BY_OFFER
date_utc: 2026-05-25

## Scope

Runtime canon: OpenClaw Mission Control Docker.
Phase 6 wires the 8 canonical offers into OpenClaw Offer Factory records, exposes them through the world-control snapshot route, and renders them in the World Control UI.

No Stripe write. No send. No publish. No deploy. No old hub patch.

## Canon Sources

- /Users/burakokyay/cof-trading/docs/director/current/STRIPE_CANONICAL_OFFER_MAP.md
- /Users/burakokyay/cof-trading/docs/director/current/STRIPE_PUBLIC_LINK_ALLOWLIST.md
- /Users/burakokyay/cof-trading/docs/director/current/DIRECTOR_CONTEXT_CAPSULE.md

## Offer Records Created

| offer_id | task_id | public name | price | billing | status | subs_count |
|---|---|---:|---:|---|---|---:|
| vip_standard | 6739961a-977c-4a96-b5f9-84a6cbe9ed95 | VIP Standard | 97 | monthly | CANON_ACTIVE | 5 |
| academy | aab963a9-2b65-4f5f-aca9-72a5ec2505c9 | Academy | 97 | monthly | NEEDS_CONFIRMATION | UNKNOWN |
| premium_dashboard | 8dee8c60-96ec-42e3-98a1-0042fa352241 | Premium Dashboard VIP | 297 | monthly | CANON_ACTIVE | 1 |
| elite_1on1 | 471088f6-4cc3-46b5-8ab3-3faa4b62617b | Elite IA + 1:1 Erwin | 997 | monthly | CANON_ACTIVE | 0 |
| katikaan_paliers | cd03a704-849f-4690-9adc-6b8c70b0b314 | KatiKaan | tiered | tiered | CANON_ACTIVE | UNKNOWN |
| corsikaan_paliers | c474284c-913c-46a2-99f1-faa7c0fff6dc | CorsiKaan | tiered | tiered | CANON_ACTIVE | UNKNOWN |
| setup_broker_help | de513b9d-75a9-44a9-9a05-af8caca5ba42 | Setup / Broker Help | 0 | free_affiliation | CANON_ACTIVE | N/A |
| past_due_recovery | f22e1db9-681e-41c2-827b-e12d6c903e90 | Past_due Recovery | 194 | recovery | CANON_ACTIVE | 2 |

Public UI names are KatiKaan / CorsiKaan only. Old internal aliases are blocked from the UI.

## Snapshot Proof

Baseline before Phase 6:

```json
{
  "offers": null,
  "has_offers": false,
  "has_openclaw": true,
  "openclaw_boards": 33
}
```

After Phase 6:

```text
vip_standard          VIP Standard            97   monthly          CANON_ACTIVE        5
academy              Academy                 97   monthly          NEEDS_CONFIRMATION  null
premium_dashboard    Premium Dashboard VIP   297  monthly          CANON_ACTIVE        1
elite_1on1           Elite IA + 1:1 Erwin    997  monthly          CANON_ACTIVE        0
katikaan_paliers     KatiKaan                null tiered           CANON_ACTIVE        null
corsikaan_paliers    CorsiKaan               null tiered           CANON_ACTIVE        null
setup_broker_help    Setup / Broker Help     0    free_affiliation CANON_ACTIVE        null
past_due_recovery    Past_due Recovery       194  recovery         CANON_ACTIVE        2
```

Snapshot endpoint:

```text
GET http://127.0.0.1:3000/api/cofiatrading-world-control/snapshot
offers_len = 8
endpoints.openclawOffers = { ok: true, status: 200 }
```

## Stripe / Hub Read Proof

Hub Iron read-only endpoint:

```text
GET http://127.0.0.1:8430/api/iron/revenue/summary
HTTP 200
mrr_eur = 879
arr_eur = 10548
active_vip = 7
past_due_count = 2
past_due_eur = 194
```

Limitation disclosed: this Hub endpoint exposes aggregate revenue, not by-offer or by-price subscription counts. Therefore VIP/Premium/Elite counts are carried from the canonical Stripe map, while Past_due Recovery is refreshed from Hub aggregate proof.

## UI Proof

- Offer Factory panel screenshot: /Users/burakokyay/.openclaw/vendor/openclaw-mission-control/docs/operations/screenshots/world-control-phase6-offers-panel-20260525T1410Z.png
- Elite offer drawer screenshot: /Users/burakokyay/.openclaw/vendor/openclaw-mission-control/docs/operations/screenshots/world-control-phase6-elite-offer-drawer-20260525T1412Z.png

DOM no-leak proof:

```text
aokiji:false, kaido:false, offerPanel:true
```

## Files Changed

- /Users/burakokyay/.openclaw/vendor/openclaw-mission-control/frontend/src/app/api/cofiatrading-world-control/snapshot/route.ts
- /Users/burakokyay/.openclaw/vendor/openclaw-mission-control/frontend/src/components/cofiatrading-world-control/WorldControl.tsx

Build proof:

```text
docker compose build frontend
PASS
docker compose up -d frontend
frontend started
```

## Verdict

Phase 6 is LIVING_UI_WITH_STRIPE_READ_AMBER_BY_OFFER.
The offer factory is no longer just painted: 8 offer records exist in OpenClaw DB, snapshot returns them live, and the UI/drawer renders those records.

The by-offer Stripe counts remain AMBER because the available read-only Hub endpoint does not expose per-price subscription breakdown.
