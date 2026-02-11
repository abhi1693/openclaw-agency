# OpenClaw gateway integration (backend)

This page documents how Mission Control’s backend integrates with an OpenClaw **Gateway** over WebSocket RPC.

## Source of truth

- Backend implementation: `backend/app/services/openclaw/*`
- Primary protocol reference: [Gateway WebSocket protocol](../openclaw_gateway_ws.md)
- If the implementation moves: search the backend for `services.openclaw` imports and `openclaw_call(` usages to find the new entrypoints.

**Audience**
- Maintainers: where to add/modify gateway calls and lifecycle behavior.
- Operators/SRE: common failure modes and what to check when the gateway disconnects or calls time out.

## Where this fits

- Protocol reference: [Gateway WebSocket protocol](../openclaw_gateway_ws.md)
- Gateway base config: [Gateway base config](../openclaw_gateway_base_config.md)

The design goal is to keep **gateway protocol details** in one place, and keep API routes thin.

## Boundaries / non-goals

This module **does**:
- Maintain the WS/RPC client and call primitive (`openclaw_call`).
- Define and execute the gateway-side provisioning flows (file sync, lifecycle orchestration).
- Provide DB-backed orchestration services that combine Mission Control state with gateway RPC operations.

This module **does not** own:
- Frontend auth/UI behavior (see frontend auth docs).
- Provider-specific messaging implementations (Slack/Telegram/etc.)
- The core “what a session means” semantics outside gateway coordination (those live in the backend domain/services; gateway is a transport/control plane).

## Layering overview

### 1) Low-level RPC client (DB-free)

**File:** `backend/app/services/openclaw/gateway_rpc.py`

Responsibilities:
- Implements the gateway frame protocol (`req`/`res`/`event`) at a minimal level.
- Handles the required connection handshake (`connect.challenge` → `connect`).
- Provides the generic call primitive:
  - `openclaw_call(method, params, config=GatewayConfig(url, token))`

Notes:
- `PROTOCOL_VERSION = 3`.
- Gateway URL may include `?token=...` (token is appended as a query param).
- The module maintains lists of known base methods/events (`GATEWAY_METHODS`, `GATEWAY_EVENTS`).

### 2) Control plane + provisioning (gateway-only lifecycle)

**File:** `backend/app/services/openclaw/provisioning.py`

Responsibilities:
- Defines an abstract `GatewayControlPlane` interface.
- Implements it as `OpenClawGatewayControlPlane` using `openclaw_call(...)`.
- Renders and syncs template files into gateway-managed agent workspaces (e.g. `SOUL.md`, `TOOLS.md`).
- Implements the gateway-only lifecycle orchestrator:
  - `OpenClawGatewayProvisioner.apply_agent_lifecycle(...)`

Lifecycle steps (per code comment):
1) create agent (idempotent)
2) set/update template files (best-effort)
3) wake agent session via `chat.send`

**Where RPC methods are used here**
- `agents.create` / `agents.update` / `agents.delete`
- `agents.files.list` / `agents.files.get` / `agents.files.set`
- `sessions.patch` / `sessions.reset` / `sessions.delete`
- `config.get` / `config.patch` (for heartbeat patching)
- `chat.send` (wakeup + messaging)

### 3) DB-backed orchestration services

These services combine Mission Control’s DB state (boards/agents/gateways) with gateway RPC operations.

Common patterns:
- Resolve a `Gateway` DB row for a `Board`.
- Build a `GatewayConfig` for RPC (`url`, optional `token`).
- Use deterministic session keys (see below).
- Wrap gateway calls with retry/backoff where appropriate.

Key modules:
- `gateway_resolver.py`: board→gateway lookup and defensive org checks; constructs `GatewayConfig`.
- `gateway_dispatch.py`: “send a message to an agent session” helper.
- `provisioning_db.py`: template sync, lead agent provisioning, token rotation.
- `session_service.py`: API-facing “list sessions / fetch history / send message”.
- `coordination_service.py`: gateway-main ↔ lead coordination flows.

## Session keys & agent identities (important contract)

Session keys are part of the contract between Mission Control and the gateway.

- Board lead session key is deterministic by board id.
- Board agent session keys are deterministic by agent id.

See:
- `backend/app/services/openclaw/internal/session_keys.py`
- `backend/app/services/openclaw/shared.py` (GatewayAgentIdentity helpers)

Implication:
- Never derive session keys from human-readable names (collisions).
- The gateway “main” agent has a deterministic session key derived from gateway id.

## Retry / resilience behavior

## Debug checklist (first 10 minutes)

When gateway integration breaks (disconnects, timeouts, missing events), check:

1) **Config / env**
- Gateway URL and token: confirm `GatewayConfig(url, token)` resolves correctly for the board/gateway.
- Confirm the WS URL matches the documented protocol endpoint (see [Gateway WebSocket protocol](../openclaw_gateway_ws.md)).

2) **Connectivity**
- Can the backend reach the gateway host/port from where it’s running?
- Any reverse proxy/LB timeouts affecting WebSockets?

3) **Logs**
- Backend logs around handshake and call failures in `backend/app/services/openclaw/gateway_rpc.py`.
- Look for the connect handshake (`connect.challenge` → `connect`) and any `req` timeouts.

4) **Fast smoke test**
- Trigger a known-safe RPC call via an existing API path (e.g., list sessions or send a noop-ish chat message) and observe:
  - request frame sent
  - response frame received
  - timeout / retry behavior

## Retry / resilience behavior

### Gateway retry helper

**File:** `backend/app/services/openclaw/internal/retry.py`

- Implements exponential backoff + jitter for **transient** `OpenClawGatewayError` cases.
- Transient classification is message-based (markers + websocket 503 patterns).

Used by:
- `coordination_service.py` via `with_coordination_gateway_retry(...)`
- template sync flows in `provisioning_db.py` via `GatewayBackoff(...).run(...)`

### Transport/protocol errors

`gateway_rpc.openclaw_call` wraps transport failures as `OpenClawGatewayError`, including:
- `TimeoutError`, `ConnectionError`, `OSError`
- `WebSocketException`
- `ValueError` (bad JSON / protocol mismatch)

## Operational failure modes (what breaks)

### 1) Gateway unreachable / disconnects
Symptoms:
- Backend returns 502-style errors for gateway-backed endpoints.
- Logs contain `gateway.rpc.call.transport_error` or repeated retry timeouts.

Likely causes:
- Gateway process down.
- Wrong WS URL.
- Network path blocked.

What to check:
- Gateway is running and reachable from backend host.
- The configured gateway URL/token in the `Gateway` DB row.
- Protocol compatibility (server expects protocol v3).

### 2) Auth/token failures
Symptoms:
- Calls fail early with a gateway error message.

What to check:
- Gateway token (if configured) matches what the gateway expects.
- Ensure token is not accidentally logged/copied; treat as secret.

### 3) Missing sessions
Symptoms:
- `ensure_session` or session operations fail with “unknown session / not found”.

How code handles it:
- Provisioning will `ensure_session` before sending messages.
- Some flows treat “missing session” as non-fatal when deleting/resetting.

### 4) Provisioning/template sync issues
Symptoms:
- Agents exist in DB but do not appear in gateway.
- Files not updated or bootstraps not applied.

What to check:
- `gateway.workspace_root` is set (required for provisioning).
- Template rendering errors (jinja StrictUndefined will fail on missing keys).
- Whether files are “preserved” on update (`PRESERVE_AGENT_EDITABLE_FILES`).

### 5) Partial failures & idempotency
- Provisioning uses an idempotent “create then update” flow.
- Many gateway calls are safe to retry, but beware operations that can be destructive (`sessions.delete`, agent delete).

## Change risk (what tends to break during refactors)

High-risk changes in this area usually break one of:
- **RPC method names/payload shapes** (gateway and backend must match exactly).
- **Auth/token propagation** (query token vs header semantics; accidental token logging).
- **Session key derivation** (breaking determinism breaks coordination/provisioning assumptions).
- **Reconnect/backoff behavior** (WebSocket timeouts, retry classification).

What to lean on:
- Backend tests around gateway coordination/provisioning (and any integration tests that exercise WS/RPC flows).
- CI: ensure the doc PR keeps checks green, and watch for failures in tests touching `services/openclaw/*`.

## Where to add new gateway capabilities

### Adding a new RPC call (backend)

Rule of thumb:
- Use a one-off `openclaw_call(...)` when the call is narrowly scoped (single endpoint/flow) and you don’t need shared lifecycle semantics.
- Extend `GatewayControlPlane` when you want a typed, reusable operation used across multiple flows, or when you want to centralize retries/backoff and lifecycle invariants.

Concrete example (shape):
- **One-off call** (single endpoint):
  - Add the method name/payload shape per the gateway protocol.
  - Call: `openclaw_call("nodes.describe", {"node": node_id}, config=...)`.
- **Control-plane operation** (reused / lifecycle-affecting):
  - Add `describe_node(...)` (or similar) to `GatewayControlPlane`.
  - Implement it in `OpenClawGatewayControlPlane` via `openclaw_call(...)`.
  - Use that method from provisioning/coordination services.
3. If it’s API-facing and needs DB context: add to a DB-backed service in `backend/app/services/openclaw/*`.

### Adding/changing protocol methods/events
- The authoritative protocol is documented in `docs/openclaw_gateway_ws.md`.
- Update both:
  - gateway implementation (other repo)
  - this repo’s protocol doc (if method/event list changes)

## Pointers

- Low-level RPC: `backend/app/services/openclaw/gateway_rpc.py`
- Lifecycle/provisioning: `backend/app/services/openclaw/provisioning.py`
- DB-backed provisioning: `backend/app/services/openclaw/provisioning_db.py`
- Session APIs: `backend/app/services/openclaw/session_service.py`
- Coordination: `backend/app/services/openclaw/coordination_service.py`
