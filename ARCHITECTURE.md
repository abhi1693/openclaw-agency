# OpenClaw Mission Control - Architecture Redesign

> **Version**: 2.0 | **Date**: 2026-02-22
> **Purpose**: Multi-session parallel development plan for server architecture redesign

---

## 1. System Architecture

```
                        ALIBABA CLOUD (VPC)
 +============================================================================+
 |                                                                            |
 |   SLB (Internet-facing, HTTPS/WSS termination)                            |
 |     |                                                                      |
 |     +-- api.xxx.com ------> ECS: API Server (FastAPI) x2                  |
 |     |                         Port 8000: REST /api/v1/*                   |
 |     |                         Port 8000: WS  /ws/h5/chat                  |
 |     |                         Port 8000: WS  /ws/gateway/{id}/relay       |
 |     |                              |                                       |
 |     +-- admin.xxx.com ----> ECS: Next.js Admin Frontend x1               |
 |     |                         Port 3000                                    |
 |     +-- h5.xxx.com -------> ECS: H5 Mobile Web App x1 (Phase 5)          |
 |                                                                            |
 |   ApsaraDB RDS PostgreSQL 16 (HA, private endpoint)                      |
 |   ApsaraDB Redis 7 (Cluster, private endpoint)                           |
 |   ECS: RQ Workers x2 (webhook + background jobs)                         |
 |   ACR: Container Registry (Docker images)                                 |
 |                                                                            |
 +============================================================================+
        ^                ^  (WSS persistent)           ^  (WSS persistent)
        |                |                             |
   Admin Users      Gateway-SZ-01               Gateway-BJ-01
   H5 Clients       (Shenzhen Office)           (Beijing Office)
   (Mobile Web)     Agents 1..N                 Agents 1..N
```

### Message Flow (H5 Chat)

```
H5 Client (browser)
    |
    | WSS connect: wss://api.xxx.com/ws/h5/chat
    | Auth: { "type": "auth", "payload": { "token": "<h5-jwt>" } }
    |
    v
API Server (WS Relay)
    |
    | Lookup: h5_user -> agent assignment -> gateway_id
    | Forward via persistent WSS to target gateway
    |
    v
Gateway (OpenClaw runtime)
    |
    | RPC: chat.send({ sessionKey, message, metadata })
    |
    v
Agent (processes and responds)
    |
    | Response flows back: Agent -> Gateway -> API Server -> H5 Client
```

---

## 2. Module Breakdown

| Module | Name | Complexity | Dependencies | Session |
|--------|------|-----------|--------------|---------|
| **M1** | Cloud Infrastructure & Deployment | Medium | None | Session A |
| **M2** | Gateway Auto-Registration Protocol | High | M1 | Session C |
| **M3** | H5 User Authentication System | Medium | None | Session B |
| **M4** | WebSocket Relay Service | Very High | M2 + M3 | Session E |
| **M5** | H5 Chat UI (Integrated) | Medium-High | M3 + M4 | Session D/F |
| **M6** | Admin Gateway & H5 Management | Medium | M2 + M3 | Session G |
| **M7** | Independent H5 Mobile App | Medium | M5 | Session H |

### Dependency Graph

```
M1 (Infrastructure) ----+
                         |
M3 (H5 Auth) -----------+---> M4 (WS Relay) ---> M5 (H5 Chat) ---> M7 (H5 App)
                         |         ^
M2 (Gateway AutoReg) ---+         |
                                   |
                         M6 (Admin Extensions)
```

---

## 3. Development Phases

| Phase | Week | Parallel Sessions | Modules | Milestone |
|-------|------|-------------------|---------|-----------|
| 1 | Week 1 | Session A + B | M1 + M3 | API on Alibaba Cloud; H5 auth endpoints working |
| 2 | Week 2 | Session C + D | M2 + M5(scaffold) | Gateway auto-register; H5 chat UI with mock data |
| 3 | Week 3 | Session E | M4 | End-to-end: H5 -> API -> Gateway -> Agent -> response |
| 4 | Week 4 | Session F + G | M5(complete) + M6 | Full admin + H5 chat flow working |
| 5 | Week 5 | Session H + I | M7 + Testing | Production-ready with independent H5 app |

---

## 4. Module Details

---

### M1: Cloud Infrastructure & Deployment

**Directory**: `/deploy/aliyun/`

**Scope**: Alibaba Cloud deployment configuration, Docker production images, CI/CD.

**Files to create**:
```
deploy/
  aliyun/
    docker-compose.prod.yml      # Production compose (API x2, Frontend, Workers)
    nginx/
      api.conf                   # Reverse proxy for API + WebSocket
      admin.conf                 # Frontend proxy
      h5.conf                    # H5 app proxy (Phase 5)
    scripts/
      deploy.sh                  # Deployment automation script
      init-rds.sh                # Initial RDS setup
      backup.sh                  # Database backup script
    env/
      .env.production.example    # Production env template
    README.md                    # Deployment guide
  Dockerfile.backend.prod        # Optimized backend image
  Dockerfile.frontend.prod       # Optimized frontend image
.github/
  workflows/
    deploy-aliyun.yml            # CI/CD deploy pipeline
```

**Alibaba Cloud Resources**:

| Service | Spec | Purpose |
|---------|------|---------|
| ECS x2 | 4C8G Ubuntu 22.04 | API Server (load balanced) |
| ECS x1 | 2C4G | Next.js Admin Frontend |
| ECS x2 | 2C4G | RQ Workers |
| RDS PostgreSQL 16 | 2C4G 100GB HA | Primary database |
| Redis 7 | 4GB Cluster | Cache + Pub/Sub + Queue |
| SLB | Internet-facing | HTTPS/WSS load balancing |
| ACR | Standard | Docker image registry |
| SSL Certificate | Free DV via ACM | HTTPS/WSS termination |

**Production Docker Compose** (`docker-compose.prod.yml`):
```yaml
services:
  api-server:
    image: ${ACR_REGISTRY}/mc-backend:${TAG}
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    environment:
      DATABASE_URL: postgresql+psycopg://${RDS_USER}:${RDS_PASS}@${RDS_HOST}/${RDS_DB}
      RQ_REDIS_URL: redis://${REDIS_HOST}:6379/0
      WS_REDIS_PUBSUB_URL: redis://${REDIS_HOST}:6379/1
      CORS_ORIGINS: https://admin.xxx.com,https://h5.xxx.com
      AUTH_MODE: local
    deploy:
      replicas: 2

  rq-worker:
    image: ${ACR_REGISTRY}/mc-backend:${TAG}
    command: python -m app.services.queue_worker
    deploy:
      replicas: 2

  frontend:
    image: ${ACR_REGISTRY}/mc-frontend:${TAG}
    environment:
      NEXT_PUBLIC_API_URL: https://api.xxx.com
```

**SLB Configuration** (WebSocket support):
- Connection timeout: 300 seconds
- WebSocket upgrade: enabled
- Health check: `GET /healthz` every 10s
- Session persistence: source IP (for WS stickiness)

**Claude Session A Instructions**:
> Create all files under `/deploy/aliyun/`, production Dockerfiles, and CI/CD workflow.
> Test by deploying to a single ECS instance first, then scale to multi-instance.
> Ensure SLB correctly handles both HTTPS REST and WSS WebSocket connections.

---

### M2: Gateway Auto-Registration Protocol

**Directory**: Backend extensions

**Scope**: Allow gateways to self-register on startup, maintain persistent WebSocket connections, health monitoring.

**Files to create/modify**:
```
backend/app/
  api/
    gateway_registration.py      # NEW: Registration REST endpoints
  models/
    gateway_connections.py       # NEW: WS connection tracking model
  schemas/
    gateway_registration.py      # NEW: Registration schemas
  services/
    gateway_registry.py          # NEW: Registration + health logic
    gateway_ws_manager.py        # NEW: Persistent WS connection pool
  core/
    config.py                    # MODIFY: Add gateway registration config
backend/migrations/
  versions/
    xxxx_add_gateway_registration_fields.py  # NEW: Alembic migration
```

**Gateway Model Extensions** (`gateways` table):
```sql
ALTER TABLE gateways ADD COLUMN registration_token_hash VARCHAR(255);
ALTER TABLE gateways ADD COLUMN status VARCHAR(32) DEFAULT 'pending';
  -- Values: pending, online, offline, error
ALTER TABLE gateways ADD COLUMN last_heartbeat_at TIMESTAMP;
ALTER TABLE gateways ADD COLUMN connection_info JSONB;
  -- { "ip": "...", "version": "...", "capabilities": [...], "metrics": {...} }
ALTER TABLE gateways ADD COLUMN auto_registered BOOLEAN DEFAULT FALSE;
CREATE INDEX ix_gateways_status ON gateways(status);
```

**REST API Endpoints**:
```
POST   /api/v1/gateway-registry/register
  Body: { organization_id, registration_token, name, url, workspace_root, version, capabilities }
  Response: { gateway_id, relay_ws_url, relay_token, heartbeat_interval_seconds }

POST   /api/v1/gateway-registry/heartbeat
  Body: { gateway_id, relay_token, status, metrics: { active_sessions, memory_mb, cpu_pct, agent_count } }
  Response: { ok, config_update? }

DELETE /api/v1/gateway-registry/deregister
  Body: { gateway_id, relay_token }
```

**WebSocket Endpoint**:
```
WS /ws/gateway/{gateway_id}/relay
  Auth handshake: { "type": "auth", "payload": { "relay_token": "..." } }
  Response: { "type": "auth_ok", "payload": { "gateway_id": "...", "config": {...} } }
  Bidirectional message forwarding after auth
```

**Gateway Config File** (`gateway-config.yaml`):
```yaml
mission_control:
  api_server: "https://api.xxx.com"
  organization_id: "550e8400-e29b-41d4-a716-446655440000"
  registration_token: "gw_reg_abc123..."

gateway:
  name: "office-gateway-shenzhen-01"
  workspace_root: "/opt/openclaw/workspace"
  reconnect_max_retries: -1
  reconnect_base_interval_seconds: 1
  reconnect_max_interval_seconds: 10
  heartbeat_interval_seconds: 30
```

**Health Monitoring Logic**:
- Gateway sends heartbeat every 30s (HTTP POST + WS implicit ping)
- If no heartbeat for 90s (3 missed), mark `status='offline'`
- On WS reconnect, mark `status='online'` and refresh `connection_info`
- Admin UI shows real-time gateway status via existing polling

**Claude Session C Instructions**:
> Extend the Gateway model with new fields and create the migration.
> Implement the registration endpoints following the pattern in `backend/app/api/gateways.py`.
> Build the WS manager using `websockets` library, similar to `gateway_rpc.py`.
> Test with a mock gateway client that registers and maintains a heartbeat.

---

### M3: H5 User Authentication System

**Directory**: Backend + new tables

**Scope**: Independent auth for H5 end users. Registration, login, JWT management.

**Files to create/modify**:
```
backend/app/
  models/
    h5_users.py                  # NEW: H5User, H5RefreshToken models
  schemas/
    h5_auth.py                   # NEW: Register, Login, Token schemas
    h5_users.py                  # NEW: H5 user CRUD schemas
  core/
    h5_auth.py                   # NEW: JWT creation/validation, password hashing
  api/
    h5_auth.py                   # NEW: Auth router (register, login, refresh, me)
    h5_users.py                  # NEW: Admin router (list, assign, unassign)
  services/
    h5_user_service.py           # NEW: H5 user business logic
  api/
    deps.py                      # MODIFY: Add H5 auth dependencies
  main.py                        # MODIFY: Register new routers
backend/migrations/
  versions/
    xxxx_add_h5_users.py         # NEW: Alembic migration
```

**Database Tables**:

```sql
-- H5 Users
CREATE TABLE h5_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    username        VARCHAR(64) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(32),
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(128),
    avatar_url      VARCHAR(512),
    status          VARCHAR(32) NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (organization_id, username)
);

-- Refresh Tokens
CREATE TABLE h5_refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    h5_user_id  UUID NOT NULL REFERENCES h5_users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- User-Agent Assignments
CREATE TABLE h5_user_agent_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    h5_user_id  UUID NOT NULL REFERENCES h5_users(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    role        VARCHAR(32) NOT NULL DEFAULT 'user',
    assigned_at TIMESTAMP NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES users(id),
    UNIQUE (h5_user_id, agent_id)
);
```

**REST API Endpoints**:
```
POST   /api/v1/h5/auth/register    # H5 user registration
  Body: { organization_id, username, password, display_name?, email?, phone? }
  Response: { user: {...}, access_token, refresh_token }

POST   /api/v1/h5/auth/login       # H5 user login
  Body: { organization_id, username, password }
  Response: { user: {...}, access_token, refresh_token }

POST   /api/v1/h5/auth/refresh     # Refresh access token
  Body: { refresh_token }
  Response: { access_token, refresh_token }

GET    /api/v1/h5/auth/me          # Current H5 user profile
PATCH  /api/v1/h5/auth/me          # Update profile

-- Admin endpoints (require admin auth):
GET    /api/v1/h5/users            # List H5 users
POST   /api/v1/h5/users/{id}/assign    # Assign user to agent
DELETE /api/v1/h5/users/{id}/assign    # Unassign user from agent
```

**JWT Configuration**:
- Access token: 15 min TTL, HS256 signed
- Refresh token: 30 day TTL, stored hashed in DB
- Payload: `{ sub: h5_user_id, org: organization_id, type: "h5", iat, exp }`
- Separate secret from admin JWT: `H5_JWT_SECRET` env var

**Dependency Injection** (add to `deps.py`):
```python
class H5AuthContext:
    h5_user: H5User
    organization_id: UUID

async def get_h5_auth_context(request: Request, db: AsyncSession) -> H5AuthContext:
    """Validate H5 JWT and return auth context."""

async def require_h5_auth(ctx: H5AuthContext = Depends(get_h5_auth_context)):
    """Require authenticated H5 user."""
```

**Claude Session B Instructions**:
> Follow the pattern in `backend/app/core/auth.py` for the H5 auth module.
> Use `bcrypt` for password hashing (already in dependencies via passlib).
> Use `PyJWT` for token creation/validation (add to `pyproject.toml` if needed).
> Create Alembic migration. Test all auth endpoints with httpx/pytest.

---

### M4: WebSocket Relay Service

**Directory**: `/backend/app/services/ws_relay/`

**Scope**: Core relay connecting H5 clients to agents through gateways via WebSocket.

**Files to create/modify**:
```
backend/app/
  services/
    ws_relay/
      __init__.py
      connection_manager.py      # H5 client WS connection registry
      gateway_pool.py            # Persistent gateway WS connection pool
      message_router.py          # Route messages between clients and gateways
      protocol.py                # Message format, heartbeat, auth handshake
      redis_bridge.py            # Redis pub/sub for multi-instance routing
  api/
    ws_h5.py                     # NEW: FastAPI WS endpoint for H5 clients
    ws_gateway.py                # NEW: FastAPI WS endpoint for gateway relay
  models/
    ws_sessions.py               # NEW: Chat session tracking model
  schemas/
    ws_messages.py               # NEW: WS message envelope schemas
  main.py                        # MODIFY: Register WS endpoints
backend/migrations/
  versions/
    xxxx_add_ws_sessions.py      # NEW: Alembic migration
```

**WS Message Protocol** (JSON over WebSocket):
```json
// Auth (first message after connect)
{ "type": "auth", "payload": { "token": "<jwt>" } }
{ "type": "auth_ok", "payload": { "user_id": "...", "assignments": [...] } }
{ "type": "auth_error", "payload": { "reason": "invalid_token" } }

// Chat message (H5 client -> server)
{
  "type": "chat",
  "id": "<uuid>",
  "payload": {
    "agent_id": "<uuid>",
    "content": "Hello!",
    "session_id": "<uuid>"  // optional, auto-created if missing
  }
}

// Chat response (server -> H5 client)
{
  "type": "chat",
  "id": "<uuid>",
  "payload": {
    "agent_id": "<uuid>",
    "content": "Hi! How can I help?",
    "session_id": "<uuid>",
    "role": "agent"
  }
}

// System messages
{ "type": "heartbeat", "id": "<uuid>" }
{ "type": "system", "payload": { "event": "agent_offline", "agent_id": "..." } }
{ "type": "error", "payload": { "code": "AGENT_UNAVAILABLE", "message": "..." } }
```

**Connection Manager** (`connection_manager.py`):
```python
class H5ConnectionManager:
    """Manages active H5 client WebSocket connections."""

    # In-memory: { h5_user_id -> WebSocket }
    # Redis: { h5_user_id -> server_instance_id } (for multi-instance routing)

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None
    async def disconnect(self, user_id: UUID) -> None
    async def send_to_user(self, user_id: UUID, message: dict) -> bool
    async def broadcast_to_users(self, user_ids: list[UUID], message: dict) -> None
```

**Gateway Pool** (`gateway_pool.py`):
```python
class GatewayPool:
    """Manages persistent WebSocket connections to gateways."""

    # { gateway_id -> WebSocket }

    async def register_gateway(self, gateway_id: UUID, websocket: WebSocket) -> None
    async def unregister_gateway(self, gateway_id: UUID) -> None
    async def send_to_gateway(self, gateway_id: UUID, message: dict) -> dict
    async def is_gateway_connected(self, gateway_id: UUID) -> bool
```

**Message Router** (`message_router.py`):
```python
class MessageRouter:
    """Routes messages between H5 clients and gateways."""

    async def route_h5_to_agent(self, h5_user_id: UUID, agent_id: UUID, content: str, session_id: UUID?) -> None:
        # 1. Validate assignment (h5_user_agent_assignments)
        # 2. Resolve agent -> gateway_id (agents table, cached)
        # 3. Get/create chat session (h5_chat_sessions)
        # 4. Translate to gateway RPC: chat.send(sessionKey, message, metadata)
        # 5. Forward to gateway via GatewayPool

    async def route_gateway_to_h5(self, gateway_id: UUID, session_key: str, content: str) -> None:
        # 1. Resolve session_key -> h5_chat_session -> h5_user_id
        # 2. Forward to H5 client via ConnectionManager (or Redis pub/sub)
```

**Redis Pub/Sub Bridge** (`redis_bridge.py`):
```python
class RedisBridge:
    """Cross-instance message routing via Redis pub/sub."""

    # Channel pattern: ws:route:{target_type}:{target_id}
    # e.g., ws:route:h5:user-uuid, ws:route:gateway:gw-uuid

    async def publish(self, channel: str, message: dict) -> None
    async def subscribe(self, channel: str, callback: Callable) -> None
```

**Database Table** (`h5_chat_sessions`):
```sql
CREATE TABLE h5_chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    h5_user_id      UUID NOT NULL REFERENCES h5_users(id) ON DELETE CASCADE,
    agent_id        UUID NOT NULL REFERENCES agents(id),
    gateway_id      UUID NOT NULL REFERENCES gateways(id),
    session_key     VARCHAR(255) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'active',
    last_message_at TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);
```

**Scaling Strategy**:
- API Server runs on 2+ ECS instances behind SLB
- SLB uses source-IP session persistence for WebSocket stickiness
- Redis pub/sub handles cross-instance message routing
- Connection state tracked in both memory (fast lookup) and Redis (cross-instance)

**Claude Session E Instructions**:
> This is the most complex module. Build incrementally:
> 1. First: H5 WS endpoint with auth handshake + echo test
> 2. Then: Gateway WS endpoint with auth + connection pool
> 3. Then: Message router (H5 -> gateway forwarding using existing `gateway_rpc.py` patterns)
> 4. Then: Response routing (gateway -> H5 client)
> 5. Finally: Redis pub/sub bridge for multi-instance
> Reference `backend/app/services/openclaw/gateway_rpc.py` for the gateway RPC protocol.

---

### M5: H5 Chat UI (Integrated in Next.js)

**Directory**: `/frontend/src/app/h5/`, `/frontend/src/components/h5/`

**Scope**: H5 chat interface integrated into existing Next.js admin frontend.

**Files to create**:
```
frontend/src/
  app/
    h5/
      layout.tsx                 # H5 layout (mobile-first, no admin sidebar)
      login/
        page.tsx                 # H5 login page
      chat/
        page.tsx                 # Chat session list
        [sessionId]/
          page.tsx               # Specific conversation view
  components/
    h5/
      ChatWindow.tsx             # Main chat container with message list
      ChatBubble.tsx             # Individual message bubble (user/agent)
      ChatInput.tsx              # Text input + send button
      SessionList.tsx            # Session list sidebar
      H5Header.tsx               # Mobile header with back button
  lib/
    ws-client.ts                 # WebSocket client with auto-reconnect
    h5-auth.ts                   # H5 auth token management (localStorage)
  hooks/
    useWebSocket.ts              # React hook for WS connection lifecycle
    useH5Auth.ts                 # React hook for H5 auth state
  locales/
    en.json                      # MODIFY: Add h5.* keys
    zh-CN.json                   # MODIFY: Add h5.* Chinese translations
```

**WebSocket Client** (`ws-client.ts`):
```typescript
class WSClient {
  private ws: WebSocket | null
  private reconnectTimer: number
  private messageHandlers: Map<string, Function>

  connect(url: string, token: string): void
  disconnect(): void
  send(type: string, payload: object): void
  onMessage(type: string, handler: Function): void

  // Auto-reconnect: exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
  // Heartbeat: ping every 30s
}
```

**Chat UI Design**:
- Mobile-first responsive layout (no admin sidebar)
- Full-screen chat view on mobile
- Split view on desktop (session list + chat)
- Message bubbles with user/agent avatars
- Typing indicator
- Connection status indicator (connected/reconnecting/offline)

**Claude Session D/F Instructions**:
> Phase 1 (Session D, Week 2): Scaffold H5 pages, login flow, chat UI with mock WebSocket data.
> Phase 2 (Session F, Week 4): Connect real WebSocket to M4 relay service.
> Follow existing i18n pattern: use `useTranslation()` with keys under `h5.*` namespace.
> Follow existing component patterns in `frontend/src/components/organisms/`.

---

### M6: Admin Gateway & H5 User Management

**Directory**: Frontend extensions

**Scope**: Admin UI for managing gateways, H5 users, and agent assignments.

**Files to create/modify**:
```
frontend/src/
  app/
    gateways/
      [gatewayId]/
        connections/
          page.tsx               # NEW: Live connections view
    h5-users/
      page.tsx                   # NEW: H5 user management list
      [userId]/
        page.tsx                 # NEW: H5 user detail + assignments
  components/
    gateways/
      GatewayHealthBadge.tsx     # NEW: Online/offline/error badge
      GatewayConnectionsPanel.tsx # NEW: Live WS connections
      GatewayMetricsCard.tsx     # NEW: CPU/memory/sessions metrics
    h5-users/
      H5UserTable.tsx            # NEW: User listing with DataTable
      AgentAssignmentDialog.tsx  # NEW: Assign user to agent
  locales/
    en.json                      # MODIFY: Add h5Users.*, gatewayHealth.* keys
    zh-CN.json                   # MODIFY: Add Chinese translations
```

**Admin API Endpoints to consume**:
```
GET    /api/v1/h5/users                    # List H5 users
GET    /api/v1/h5/users/{id}               # H5 user detail
POST   /api/v1/h5/users/{id}/assign        # Assign to agent
DELETE /api/v1/h5/users/{id}/assign/{aid}  # Unassign from agent
GET    /api/v1/gateways/{id}/connections   # Gateway live connections
GET    /api/v1/gateways/{id}/metrics       # Gateway health metrics
```

**Claude Session G Instructions**:
> Follow existing page patterns (e.g., `agents/page.tsx`, `tags/page.tsx`).
> Use `DashboardPageLayout`, `DataTable`, existing UI components.
> All strings must use `useTranslation()` with both en.json and zh-CN.json.

---

### M7: Independent H5 Mobile Web App

**Directory**: `/h5-app/` (new top-level)

**Scope**: Extract H5 chat into standalone lightweight mobile web app.

**Files to create**:
```
h5-app/
  package.json                   # Minimal deps: React, TailwindCSS
  vite.config.ts                 # Vite for fast builds
  tsconfig.json
  Dockerfile
  src/
    main.tsx
    App.tsx
    pages/
      Login.tsx
      Chat.tsx
      Sessions.tsx
    components/                  # Extracted from M5
      ChatWindow.tsx
      ChatBubble.tsx
      ChatInput.tsx
    lib/
      ws-client.ts               # Copied from M5
      h5-auth.ts                 # Copied from M5
      i18n.ts                    # Simplified i18n
    locales/
      en.json
      zh-CN.json
    hooks/
      useWebSocket.ts
      useH5Auth.ts
compose.yml                      # MODIFY: Add h5-app service
```

**Tech Stack**:
- React 19 + Vite (instead of Next.js for minimal bundle)
- TailwindCSS for styling (reuse existing design tokens)
- Target bundle size: < 200KB gzipped
- PWA support for mobile home screen installation

**Claude Session H Instructions**:
> Extract working code from M5 (Next.js integrated version).
> Replace Next.js-specific code (router, Link) with React Router or simple routing.
> Optimize for mobile: viewport meta, touch events, safe area insets.
> Add PWA manifest for mobile home screen installation.

---

## 5. Shared Interfaces & Contracts

### WebSocket Message Types (shared between M4, M5, M7)

```typescript
// frontend/src/lib/ws-types.ts (shared type definitions)

type WSMessageType = 'auth' | 'auth_ok' | 'auth_error' | 'chat' | 'system' | 'heartbeat' | 'error'

interface WSMessage {
  type: WSMessageType
  id?: string
  payload: Record<string, unknown>
  timestamp?: string
}

interface ChatMessage {
  type: 'chat'
  id: string
  payload: {
    agent_id: string
    content: string
    session_id: string
    role?: 'user' | 'agent'
  }
}

interface AuthMessage {
  type: 'auth'
  payload: { token: string }
}

interface AuthOkMessage {
  type: 'auth_ok'
  payload: {
    user_id: string
    assignments: Array<{ agent_id: string; agent_name: string; board_name: string }>
  }
}
```

### H5 Auth API Types (shared between M3, M5, M6, M7)

```typescript
// frontend/src/api/h5-types.ts

interface H5User {
  id: string
  organization_id: string
  username: string
  display_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  status: 'active' | 'suspended' | 'deleted'
}

interface H5LoginRequest {
  organization_id: string
  username: string
  password: string
}

interface H5TokenResponse {
  user: H5User
  access_token: string
  refresh_token: string
}
```

---

## 6. Environment Variables (New)

Add to production `.env`:

```bash
# H5 Auth
H5_JWT_SECRET=<random-64-char-secret>
H5_JWT_ACCESS_TTL_MINUTES=15
H5_JWT_REFRESH_TTL_DAYS=30

# WebSocket Relay
WS_REDIS_PUBSUB_URL=redis://<redis-host>:6379/1
WS_HEARTBEAT_INTERVAL_SECONDS=30
WS_HEARTBEAT_TIMEOUT_SECONDS=90
WS_MAX_CONNECTIONS_PER_INSTANCE=10000

# Gateway Registration
GATEWAY_REGISTRATION_ENABLED=true
GATEWAY_HEARTBEAT_INTERVAL_SECONDS=30
GATEWAY_OFFLINE_THRESHOLD_SECONDS=90

# Alibaba Cloud
ACR_REGISTRY=registry.cn-shenzhen.aliyuncs.com/<namespace>
RDS_HOST=<rds-endpoint>
RDS_DB=mission_control
RDS_USER=mc_admin
RDS_PASS=<password>
REDIS_HOST=<redis-endpoint>
```

---

## 7. How to Start a New Claude Session

Each module is designed to be developed independently. To start a new Claude session for a specific module:

1. **Open a new Claude Code session** in the project directory
2. **Tell Claude which module** to work on, e.g.:
   > "Work on Module M3 (H5 User Authentication System). Follow the instructions in ARCHITECTURE.md section M3."
3. **Claude will**:
   - Read this `ARCHITECTURE.md` for context
   - Implement the module following the specified patterns
   - Create necessary files, migrations, and tests
4. **Sync**: All sessions work on the same git repository. Use feature branches:
   - `feat/m1-cloud-infra`
   - `feat/m2-gateway-registration`
   - `feat/m3-h5-auth`
   - `feat/m4-ws-relay`
   - `feat/m5-h5-chat-ui`
   - `feat/m6-admin-extensions`
   - `feat/m7-h5-app`
5. **Merge**: Merge completed modules to `main` in dependency order

### Branch Strategy

```
main
  +-- feat/m1-cloud-infra        (Session A, Week 1)
  +-- feat/m3-h5-auth            (Session B, Week 1)
  +-- feat/m2-gateway-registration (Session C, Week 2)
  +-- feat/m5-h5-chat-scaffold   (Session D, Week 2)
  +-- feat/m4-ws-relay           (Session E, Week 3)
  +-- feat/m5-h5-chat-complete   (Session F, Week 4)
  +-- feat/m6-admin-extensions   (Session G, Week 4)
  +-- feat/m7-h5-app             (Session H, Week 5)
```

---

## 8. Testing Strategy

| Module | Test Type | Target |
|--------|-----------|--------|
| M1 | Smoke test | Health endpoints respond on cloud deploy |
| M2 | Integration | Gateway register/heartbeat/deregister cycle |
| M3 | Unit + Integration | Auth endpoints, JWT creation/validation, password hashing |
| M4 | Integration + E2E | WS connect, auth handshake, message routing, cross-instance relay |
| M5 | Component + E2E | Chat UI renders, WS hook manages connection, messages display |
| M6 | Component | Admin pages render, tables populate, assignments work |
| M7 | E2E | Standalone app loads, login works, chat functions on mobile |

---

## 9. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| WebSocket scaling on multi-instance | Redis pub/sub bridge; SLB source-IP persistence |
| Gateway behind NAT/firewall | Gateway initiates outbound WS connection (no inbound required) |
| H5 user auth security | bcrypt password hashing, short-lived JWTs, refresh token rotation |
| Module interface mismatch | Shared type definitions; API contract tests before integration |
| Database migration conflicts | One migration per module branch; merge in dependency order |
| Alibaba Cloud vendor lock-in | Standard Docker images + PostgreSQL + Redis; portable to any cloud |
