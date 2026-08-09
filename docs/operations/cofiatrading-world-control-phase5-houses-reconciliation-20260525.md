# COFIATRADING World Control — Phase 5 Houses Reconciliation

source_tag: HOUSE_15_RECONCILIATION_PHASE5_20260525
runtime: OpenClaw Mission Control Docker
scope: OpenClaw DB boards + agents + garage truck tasks
date: 2026-05-25

## Verdict

Phase 5 mapped the 15-house SSOT into OpenClaw Mission Control, linked all 38 agents to a canonical home house, and rewired all 59 truck records so `destination_board` uses a canonical house id.

Corrections applied during execution:
- OpenClaw boards do not expose native board custom fields. Phase 5 stores `home_house_canon` inside the board JSON field `success_metrics`.
- Garage truck task custom fields reject unknown keys. Phase 5 updates the existing `destination_board` field only.
- Kevin is gateway-main, so his `board_id` remains `null`; his identity profile still carries `home_house=mission_control_tower`.

## Canon Sources

| Source | Status | Proof |
|---|---:|---|
| `/Users/burakokyay/.openclaw/config/houses_manifest.json` | CANON | 15 houses read |
| `http://127.0.0.1:8767/api/central-brain/houses` | LIVE | `houses_count=15` |
| `docs/director/current/DIRECTOR_CONTEXT_CAPSULE.md` | REFERENCED | runtime canon context |
| OpenClaw `/api/v1/boards` | LIVE | 15 represented `home_house_canon` values |

## Diff Before / After

| Layer | Before | After |
|---|---:|---:|
| Houses SSOT | 15 | 15 |
| OpenClaw boards total | 25 | 33 |
| Boards annotated with `home_house_canon` | 0 | 33 |
| Canon houses represented | 0 | 15 |
| New exact house boards created | planned 8 | 8 |
| Agents checked | 38 | 38 |
| Agent home_house drift | 38 | 0 |
| Garage trucks checked | 59 | 59 |
| Truck destination drift | 59 | 0 |

## 15 Houses → Primary OpenClaw Board

| Maison SSOT | Board primaire | Mapping | Board id |
|---|---|---|---|
| assets_warehouse | asset-factory | MAPPED_FUZZY | 192cd351-a035-45e4-a36e-9446abb32a25 |
| calendar_tower | calendar_tower | MISSING_HOUSE_CREATED | 0f513d2f-13fe-4c09-a79f-45e981236f20 |
| central_brain | central_brain | MISSING_HOUSE_CREATED | 9e275efc-53f6-4fda-89fd-bddc65610653 |
| compliance_port | compliance-gate | MAPPED_FUZZY | 65ab20c0-e437-498d-ae02-c5672d87022b |
| iron_office | revenue-command | MAPPED_FUZZY | 4f7685ea-06cf-4145-a892-d712695f4964 |
| lightrag_observatory | lightrag_observatory | MISSING_HOUSE_CREATED | 078487f0-10f8-4ceb-b470-a800ed68dd82 |
| mission_control_tower | mission_control_tower | MISSING_HOUSE_CREATED | 77002600-6284-4b27-80b9-07f180d3d995 |
| mt4_signal_tower | mt4_signal_tower | MISSING_HOUSE_CREATED | 5fdd6e44-b1e8-4786-8a05-3f980e2894d3 |
| obsidian_library | obsidian_library | MISSING_HOUSE_CREATED | 945ddcea-7f1e-43fc-9e37-c3b67ce06cc2 |
| openclaw_agent_barracks | agentops-skills | MAPPED_FUZZY | d49d50a2-a936-488d-aaa3-357b43e7cc67 |
| paperclip_factory | dispatch-queue | MAPPED_FUZZY | 2dfdb673-ca40-4704-9d99-2954c18c42aa |
| site_seo_lab | product-new-york | MAPPED_FUZZY | 94b92497-b7e4-40a8-9c91-8168732b5123 |
| trading_academy | trading_academy | MISSING_HOUSE_CREATED | d61b95a5-4761-426f-be8b-c92fb3a7eb39 |
| vip_gate | vip_gate | MISSING_HOUSE_CREATED | cedd5840-0a5e-4485-9edc-dea5589eda06 |
| youtube_studio | cofiapublisher-studio | MAPPED_FUZZY | 02f3905f-2cb5-4391-a4fe-d74bbf9b3c90 |

## Agents → Home House

| Agent | Home house | Board |
|---|---|---|
| Analyste | mission_control_tower | mission_control_tower |
| Antho | iron_office | revenue-command |
| Atlas | site_seo_lab | product-new-york |
| Brand Manager | site_seo_lab | product-new-york |
| Codex | mission_control_tower | mission_control_tower |
| Copywriter | youtube_studio | cofiapublisher-studio |
| David | iron_office | revenue-command |
| Doctor | openclaw_agent_barracks | agentops-skills |
| Fiscal | compliance_port | compliance-gate |
| Guardian | obsidian_library | obsidian_library |
| Iron | iron_office | revenue-command |
| Iron Controller | iron_office | revenue-command |
| Jack | iron_office | revenue-command |
| Jarod | openclaw_agent_barracks | agentops-skills |
| Juriste | compliance_port | compliance-gate |
| Kevin | mission_control_tower | gateway-main |
| Lab | mt4_signal_tower | mt4_signal_tower |
| Luffy | openclaw_agent_barracks | agentops-skills |
| Luna | youtube_studio | cofiapublisher-studio |
| MCP Gateway Operator | openclaw_agent_barracks | agentops-skills |
| Marco | mt4_signal_tower | mt4_signal_tower |
| MiroFish | mt4_signal_tower | mt4_signal_tower |
| Nova | youtube_studio | cofiapublisher-studio |
| Old City Guard | central_brain | central_brain |
| Oracle | mission_control_tower | mission_control_tower |
| Paul MKT | assets_warehouse | asset-factory |
| Paul Réseau | assets_warehouse | asset-factory |
| Proof Officer | central_brain | central_brain |
| Publisher Guard | youtube_studio | cofiapublisher-studio |
| Quant | mt4_signal_tower | mt4_signal_tower |
| Revenue Controller | iron_office | revenue-command |
| Reviewer | compliance_port | compliance-gate |
| Risk | mt4_signal_tower | mt4_signal_tower |
| Sentinel | openclaw_agent_barracks | agentops-skills |
| Sonic | youtube_studio | cofiapublisher-studio |
| Steward | paperclip_factory | dispatch-queue |
| Stratège | mission_control_tower | mission_control_tower |
| Support Controller | iron_office | revenue-command |

## Truck Sample → Canon Destination

| Truck | Driver | Destination | Status |
|---|---|---|---|
| CellXpertTruck | Broker Reclaim Controller | iron_office | AMBER |
| TMGMTruck | Broker Reclaim Controller | iron_office | UNKNOWN |
| RaiseFXTruck | Broker Reclaim Controller | iron_office | QUARANTINE |
| LibertexTruck | Broker Reclaim Controller | iron_office | LIVE |
| IronFXTruck | Broker Reclaim Controller | iron_office | LIVE |
| FXcessTruck | Broker Reclaim Controller | iron_office | LIVE |
| LocalDevServerTruck | Product / New York Lead | central_brain | UNKNOWN |
| ResendTruck | Support Controller | iron_office | LOCKED |
| TelegramVipTruck | Iron Controller | vip_gate | LOCKED |
| TelegramFreeTruck | Social Distribution Lead | vip_gate | LOCKED |

## Proof Commands

| Check | Result |
|---|---|
| `GET /api/v1/boards` filtered on `success_metrics.home_house_canon` | 15 unique canon houses |
| `GET /api/v1/agents` | 38 agents, 0 invalid home_house |
| `GET /api/v1/boards/090f150c-4532-4e8e-8e85-9fa221180ce4/tasks` | 59 trucks, 0 invalid destination_board |
| Local reconcile dry-run | houses=15, agent_drifts=0, truck_drifts=0 |

## Safety

| Guardrail | Result |
|---|---:|
| Rename existing board slugs | none |
| Create non-canon 16th house | none |
| Create 39th agent | none |
| Modify `hub/*` | none |
| Modify `apps/mission-control/*` | none |
| Modify frontend `WorldControl.tsx` | none |
| send/publish/deploy | none |

