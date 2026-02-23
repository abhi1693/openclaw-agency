# 🎯 MISSION CONTROL — Task Management & Role-Based Access Control (RBAC) System

## Complete Implementation Prompt for OpenClaw Agents

**Date:** February 24, 2026  
**Priority:** P0 — Critical System Upgrade  
**Scope:** Backend (FastAPI + PostgreSQL) + Frontend (Next.js 14 + TypeScript)  
**Authored By:** Arpit (Human Operator) via Claude  
**Target Agents:** Pixel (Lead Developer), Jarvis (COO), Sentinel (QA)

---

## ⚠️ CRITICAL CONTEXT — READ THIS FIRST

You are modifying **Mission Control**, a live production system at `https://mc.wespod.com/mc`. This is NOT a greenfield build. The system already exists with the architecture described below. **You must extend the existing codebase — do NOT rewrite or break anything that already works.**

### Existing Architecture You MUST Preserve
- **Backend:** FastAPI (Python 3.11+) with SQLModel ORM, asyncpg, PostgreSQL on Railway
- **Frontend:** Next.js 14 (App Router), TypeScript strict, inline styles (NO Tailwind, NO CSS modules), Framer Motion, lucide-react icons
- **State Management:** React Context (`MCProvider` in `context.tsx`) — NO Redux, NO Zustand
- **Styling:** Pure inline `style` objects — this is a HARD rule. Every component uses `style={{}}`. No className-based styling except for global font import.
- **Database:** PostgreSQL on Railway, models in `backend/app/models/mc_models.py`
- **API Base Path:** `/api/v1/mc`
- **Two API Routers:** `backend/app/api/mc_data.py` (registered first, takes priority) + `backend/app/api/mc.py` (fallback)
- **Auth Currently:** Hardcoded single-user (`arpit@plentum.com` / `MissionControl2026!`), bearer token in sessionStorage
- **WebSocket:** Native browser WebSocket at `/api/v1/mc/ws` — broadcasts `activity`, `broadcast`, `agent_update`, `task_created`, `task_updated` events
- **Agent Ingest:** POST `/api/v1/mc/ingest` with token `mc-ingest-2026-arpit`
- **Design System:** Primary purple `#7C5CFC`, backgrounds `#F8F7FF` / `#FFFFFF`, text `#1E1B4B` / `#6B6B8A`, status colors green `#22C55E` / amber `#F59E0B` / red `#EF4444` / blue `#3B82F6`
- **Font:** Inter (Google Fonts)
- **Animations:** Framer Motion — 200ms page transitions, 800ms number count-up, pulse animations on status dots

### Existing Key Files
```
backend/app/main.py                    # FastAPI app + router registration
backend/app/api/mc.py                  # Primary MC API router
backend/app/api/mc_data.py             # Data-first MC router (takes priority)
backend/app/models/mc_models.py        # Database models (Brand, MCAgent, MCTask, ActivityFeedEntry, etc.)
backend/app/services/data_sync.py      # Background data sync loop
backend/app/db/session.py              # Database session management
backend/app/core/config.py             # App configuration

frontend/src/app/mc/context.tsx        # MCProvider — global state, auth, WebSocket, data loading
frontend/src/app/mc/layout.tsx         # Shell — sidebar, top bar, live feed panel
frontend/src/app/mc/api.ts             # HTTP client helper: api<T>(path, opts)
frontend/src/app/mc/types.ts           # TypeScript interfaces
frontend/src/app/mc/theme.ts           # Light/dark theme objects
frontend/src/app/mc/helpers.ts         # Date formatting utilities
frontend/src/app/mc/dashboard/page.tsx # Command Center page
frontend/src/app/mc/tasks/page.tsx     # Current task board (BEING REPLACED/UPGRADED)
frontend/src/app/mc/agents/page.tsx    # Agent roster page
frontend/src/app/mc/comms/page.tsx     # Communications page
```

### The 17 Agents Already in the System
| Name | Emoji | Role | Department | Reports To |
|---|---|---|---|---|
| Jarvis | 🫡 | Chief Operating Officer | Leadership | — |
| Atlas | 🗺️ | Growth Department Manager | Growth | Jarvis |
| Scout | 🔍 | SEO Specialist | Growth | Atlas |
| Sage | ✍️ | Content Strategist | Growth | Atlas |
| Ghost | 👻 | Off-Page & Distribution | Growth | Atlas |
| Forge | 🔥 | Revenue Department Manager | Revenue | Jarvis |
| Blade | ⚔️ | Paid Media Specialist | Revenue | Forge |
| Ember | 📧 | Email Marketing | Revenue | Forge |
| Keeper | 🔑 | Retention & LTV | Revenue | Forge |
| Vault | 🏪 | Operations Department Manager | Operations | Jarvis |
| Shield | 🛡️ | Customer Support | Operations | Vault |
| Prism | 📊 | Analytics & Data | Operations | Vault |
| Sentinel | ✅ | QA — Cross-cutting | QA | Jarvis |
| Pixel | 💻 | Lead Developer | Engineering | Jarvis |
| Ledger | 💰 | Chief Financial Officer | Finance | Jarvis |
| Abacus | 🧮 | Bookkeeper | Finance | Ledger |
| Analytics | 📈 | Data Analyst | Operations | Vault |

---

## 📋 PART 1: TASK MANAGEMENT SYSTEM — COMPLETE OVERHAUL

### 1.1 New Task Data Model

The current `MCTask` model is minimal. Replace it with a comprehensive model. **Do NOT drop the existing table — use Alembic migration to ALTER it.**

```python
# backend/app/models/mc_models.py — EXTEND existing file

class MCTask(table=True):
    """
    Enhanced task model with full lifecycle tracking.
    Every task submitted to Jarvis gets a unique structured ID.
    """
    __tablename__ = "mc_tasks"

    # === IDENTITY ===
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_uid: str = Field(index=True, unique=True)
    # Format: "MC-{CATEGORY_CODE}-{AUTO_INCREMENT_PADDED}"
    # Examples: MC-MKT-0001, MC-DEV-0042, MC-OPS-0007
    # Category codes: MKT (Marketing), DEV (Development), OPS (Operations),
    #                 FIN (Finance), QA (QA), GRW (Growth), CRE (Creative),
    #                 SUP (Support), STR (Strategy), GEN (General)
    
    title: str = Field(max_length=300)
    description: str | None = Field(default=None)  # Rich text / markdown supported

    # === CATEGORIZATION ===
    category: str = Field(index=True)
    # ENUM values: "marketing" | "development" | "operations" | "finance"
    #              | "qa" | "growth" | "creative" | "support" | "strategy" | "general"
    
    sub_category: str | None = Field(default=None)
    # Free-form sub-category within the main category
    # e.g., category="marketing", sub_category="paid_ads" or "email_campaigns" or "seo"
    # e.g., category="development", sub_category="bug_fix" or "feature" or "infrastructure"

    # === PRIORITY & URGENCY ===
    priority: str = Field(default="medium", index=True)
    # ENUM: "critical" | "high" | "medium" | "low"
    # critical = Needs immediate attention (red)
    # high = Should be done today (orange)
    # medium = This week (blue)
    # low = When available (gray)

    urgency_flag: bool = Field(default=False)
    # Manual override — marks task as urgent regardless of priority
    # Shows a pulsing indicator on the task card

    # === STATUS & WORKFLOW ===
    status: str = Field(default="inbox", index=True)
    # ENUM: "inbox" | "assigned" | "in_progress" | "blocked" | "review" | "done" | "archived"
    # NEW statuses: "blocked" (was not in old system) and "archived" (post-done cold storage)

    blocked_reason: str | None = Field(default=None)
    # If status == "blocked", explain why (e.g., "Waiting for Meta API access")

    # === ASSIGNMENT ===
    assigned_agent: str | None = Field(default=None, index=True)
    # Primary agent responsible — one of the 17 agent names

    collaborator_agents: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # Additional agents involved (not primary owner)
    # e.g., ["Blade", "Prism"] — Blade is primary, Prism provides analytics support

    created_by: str | None = Field(default=None)
    # The user or agent who created this task
    # Could be "arpit" (human), "Jarvis" (agent), etc.

    assigned_by: str | None = Field(default=None)
    # Who assigned it to the current agent

    # === BRAND ASSOCIATION ===
    brand_id: UUID | None = Field(default=None, foreign_key="brands.id")
    brand_name: str | None = Field(default=None)
    # Denormalized for fast display — "Plentum" | "Mavena Co" | "PawFully" | "All" | None

    # === CHECKLIST ===
    checklist: list[dict] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # Array of checklist items:
    # [
    #   {"id": "chk_001", "text": "Review Meta ad copy", "done": false, "completed_at": null, "completed_by": null},
    #   {"id": "chk_002", "text": "Update budget caps", "done": true, "completed_at": "2026-02-24T10:30:00Z", "completed_by": "Blade"},
    #   {"id": "chk_003", "text": "Get Arpit approval", "done": false, "completed_at": null, "completed_by": null}
    # ]

    checklist_progress: float | None = Field(default=0.0)
    # Auto-computed: (done_count / total_count) * 100 — for progress bar display

    # === SKILLS REQUIRED ===
    skills_required: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # Tags for skills needed to complete this task
    # e.g., ["meta_ads", "copywriting", "analytics", "shopify_admin"]
    # Used to recommend which agents should handle it

    # === REFERENCE DOCUMENTS ===
    reference_docs: list[dict] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # Documents, URLs, or file paths relevant to this task
    # [
    #   {"title": "Meta Ads Best Practices", "url": "https://...", "type": "url"},
    #   {"title": "Brand Guidelines", "path": "shared/knowledge/brand-guide.md", "type": "file"},
    #   {"title": "Q1 Performance Report", "path": "shared/reports/q1-report.md", "type": "file"}
    # ]

    # === NOTES ===
    notes: str | None = Field(default=None)
    # Free-form notes/instructions added by humans or agents (markdown supported)

    # === TAGS ===
    tags: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # General-purpose tags: ["critical", "recurring", "client-facing", "automated", "manual"]

    # === TIME TRACKING ===
    due_date: datetime | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    completed_at: datetime | None = Field(default=None)
    estimated_hours: float | None = Field(default=None)

    # === RELATIONSHIPS ===
    parent_task_id: UUID | None = Field(default=None, foreign_key="mc_tasks.id")
    # For sub-tasks — links to a parent task

    depends_on: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # List of task_uids this task depends on
    # e.g., ["MC-DEV-0012", "MC-OPS-0003"]

    # === METADATA ===
    source: str | None = Field(default="manual")
    # "manual" (created via UI), "agent" (created by an agent), "cron" (auto-generated), "command" (via command interface)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

### 1.2 Task Activity Log Model (NEW TABLE)

Every action on a task is tracked as an immutable log entry.

```python
class TaskActivityLog(table=True):
    """
    Immutable audit trail for every task.
    Every status change, comment, checklist toggle, assignment change gets logged.
    """
    __tablename__ = "task_activity_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="mc_tasks.id", index=True)
    task_uid: str = Field(index=True)  # Denormalized for fast lookups

    action: str
    # ENUM: "created" | "status_changed" | "assigned" | "reassigned"
    #       | "priority_changed" | "comment_added" | "checklist_updated"
    #       | "note_added" | "reference_added" | "blocked" | "unblocked"
    #       | "due_date_set" | "due_date_changed" | "completed" | "reopened"
    #       | "archived" | "collaborator_added" | "collaborator_removed"
    #       | "tag_added" | "tag_removed"

    actor: str
    # Who performed this action — "arpit", "Jarvis", "Blade", "system", etc.

    actor_type: str = Field(default="human")
    # "human" | "agent" | "system"

    details: dict | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # Structured details of the change:
    # For status_changed: {"from": "inbox", "to": "in_progress"}
    # For assigned: {"agent": "Blade", "by": "Jarvis"}
    # For comment_added: {"comment": "Started working on this. ETA 2 hours."}
    # For checklist_updated: {"item_id": "chk_002", "text": "Update budget caps", "done": true}
    # For priority_changed: {"from": "medium", "to": "critical", "reason": "Client escalation"}

    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

### 1.3 Task Communication Model (NEW TABLE)

Threaded comments/communications within a task — like mini chat threads per task.

```python
class TaskComment(table=True):
    """
    Comments and communications on a specific task.
    Functions like a threaded discussion per task.
    """
    __tablename__ = "task_comments"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    task_id: UUID = Field(foreign_key="mc_tasks.id", index=True)
    task_uid: str = Field(index=True)

    author: str                    # "arpit", "Blade", "Jarvis", etc.
    author_type: str               # "human" | "agent"
    content: str                   # The comment text (markdown supported)
    
    # For threaded replies
    parent_comment_id: UUID | None = Field(default=None, foreign_key="task_comments.id")
    
    # Mentions — extracted from content (e.g., @Blade, @Jarvis)
    mentions: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})

    is_system_message: bool = Field(default=False)
    # True for auto-generated messages like "Status changed to in_progress by Blade"

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

### 1.4 Task UID Generation Logic

```python
# In backend — utility function

# Category code mapping
CATEGORY_CODES = {
    "marketing": "MKT",
    "development": "DEV",
    "operations": "OPS",
    "finance": "FIN",
    "qa": "QA",
    "growth": "GRW",
    "creative": "CRE",
    "support": "SUP",
    "strategy": "STR",
    "general": "GEN",
}

async def generate_task_uid(session: AsyncSession, category: str) -> str:
    """
    Generate next task UID for a given category.
    Format: MC-{CODE}-{0001}
    Thread-safe via DB sequence/max query.
    """
    code = CATEGORY_CODES.get(category, "GEN")
    prefix = f"MC-{code}-"
    
    # Query max existing UID for this category
    result = await session.exec(
        select(MCTask.task_uid)
        .where(MCTask.task_uid.startswith(prefix))
        .order_by(MCTask.task_uid.desc())
        .limit(1)
    )
    last_uid = result.first()
    
    if last_uid:
        last_num = int(last_uid.split("-")[-1])
        next_num = last_num + 1
    else:
        next_num = 1
    
    return f"{prefix}{next_num:04d}"
```

### 1.5 Task API Endpoints — Complete Reference

**All endpoints under `/api/v1/mc/tasks`**

```
# CRUD
GET    /api/v1/mc/tasks                         → List tasks with filters
POST   /api/v1/mc/tasks                         → Create new task
GET    /api/v1/mc/tasks/{task_uid}               → Get single task with full details
PUT    /api/v1/mc/tasks/{task_uid}               → Update task fields
DELETE /api/v1/mc/tasks/{task_uid}               → Soft delete (archive)

# Status transitions
PATCH  /api/v1/mc/tasks/{task_uid}/status        → Change status (validates transitions)
PATCH  /api/v1/mc/tasks/{task_uid}/assign        → Assign/reassign agent
PATCH  /api/v1/mc/tasks/{task_uid}/priority      → Change priority

# Checklist
PATCH  /api/v1/mc/tasks/{task_uid}/checklist     → Update checklist (add/remove/toggle items)

# Comments / Communications
GET    /api/v1/mc/tasks/{task_uid}/comments      → List comments for a task
POST   /api/v1/mc/tasks/{task_uid}/comments      → Add comment
DELETE /api/v1/mc/tasks/{task_uid}/comments/{id}  → Delete comment

# Activity Log
GET    /api/v1/mc/tasks/{task_uid}/activity      → Get full activity log for a task

# Aggregations for Dashboard
GET    /api/v1/mc/tasks/summary                  → Task counts by status, category, agent
GET    /api/v1/mc/tasks/my-tasks/{agent_name}    → All active tasks for a specific agent
GET    /api/v1/mc/tasks/overdue                  → Tasks past due date
GET    /api/v1/mc/tasks/by-category              → Tasks grouped by category with counts
```

#### GET /api/v1/mc/tasks — Query Parameters

```
?status=inbox,in_progress        # comma-separated status filter
?category=marketing,development  # comma-separated category filter
?priority=critical,high          # comma-separated priority filter
?assigned_agent=Blade            # filter by assigned agent
?brand=Plentum                   # filter by brand name
?search=meta+ads                 # full-text search in title + description
?tags=recurring,client-facing    # filter by tags
?due_before=2026-03-01           # due date before
?due_after=2026-02-20            # due date after
?sort=priority                   # sort field: priority | created_at | due_date | updated_at
?order=desc                      # sort order: asc | desc
?page=1&per_page=25              # pagination
?include_archived=false          # include archived tasks (default false)
```

#### POST /api/v1/mc/tasks — Create Task

```json
{
    "title": "Restructure Plentum Meta ABO campaigns",
    "description": "Move from ABO to CBO structure. Consolidate 12 ad sets into 4 CBO campaigns.",
    "category": "marketing",
    "sub_category": "paid_ads",
    "priority": "high",
    "assigned_agent": "Blade",
    "collaborator_agents": ["Prism", "Forge"],
    "brand_name": "Plentum",
    "checklist": [
        {"text": "Audit current ABO structure", "done": false},
        {"text": "Design new CBO campaign map", "done": false},
        {"text": "Pause underperforming ad sets", "done": false},
        {"text": "Launch new CBO campaigns", "done": false},
        {"text": "Monitor 24h performance", "done": false}
    ],
    "skills_required": ["meta_ads", "campaign_structure", "analytics"],
    "reference_docs": [
        {"title": "Meta CBO Best Practices", "url": "https://www.facebook.com/business/help/...", "type": "url"},
        {"title": "Plentum Ad Account Audit", "path": "shared/reports/paid-media-audit-plentum.md", "type": "file"}
    ],
    "notes": "IMPORTANT: Do NOT pause the retargeting campaigns. Only touch prospecting.",
    "tags": ["high-impact", "revenue-critical"],
    "due_date": "2026-02-26T18:00:00Z",
    "estimated_hours": 4.0,
    "source": "manual",
    "created_by": "arpit"
}
```

**Response:** Returns full task object with auto-generated `task_uid` (e.g., `MC-MKT-0023`)

#### Status Transition Rules

```
inbox       → assigned, in_progress
assigned    → in_progress, inbox (unassign)
in_progress → blocked, review, done
blocked     → in_progress (when unblocked)
review      → in_progress (needs rework), done
done        → archived, in_progress (reopen)
archived    → inbox (reopen from archive)
```

**Every status transition MUST:**
1. Create a `TaskActivityLog` entry
2. Update `MCTask.updated_at`
3. If moving to `in_progress` → set `started_at` (if not already set)
4. If moving to `done` → set `completed_at`
5. If moving to `blocked` → require `blocked_reason`
6. Broadcast `task_updated` via WebSocket

### 1.6 Task Categories — Display Configuration

```typescript
// frontend/src/app/mc/types.ts — ADD these

export const TASK_CATEGORIES = {
    marketing:   { label: "Marketing",   code: "MKT", color: "#F97316", icon: "Megaphone",    bgLight: "#FFF7ED" },
    development: { label: "Development", code: "DEV", color: "#3B82F6", icon: "Code2",        bgLight: "#EFF6FF" },
    operations:  { label: "Operations",  code: "OPS", color: "#22C55E", icon: "Settings2",    bgLight: "#F0FDF4" },
    finance:     { label: "Finance",     code: "FIN", color: "#A855F7", icon: "DollarSign",   bgLight: "#FAF5FF" },
    qa:          { label: "QA",          code: "QA",  color: "#EF4444", icon: "ShieldCheck",  bgLight: "#FEF2F2" },
    growth:      { label: "Growth",      code: "GRW", color: "#14B8A6", icon: "TrendingUp",   bgLight: "#F0FDFA" },
    creative:    { label: "Creative",    code: "CRE", color: "#EC4899", icon: "Palette",      bgLight: "#FDF2F8" },
    support:     { label: "Support",     code: "SUP", color: "#F59E0B", icon: "HeadphonesIcon",bgLight: "#FFFBEB" },
    strategy:    { label: "Strategy",    code: "STR", color: "#6366F1", icon: "Target",       bgLight: "#EEF2FF" },
    general:     { label: "General",     code: "GEN", color: "#6B7280", icon: "Inbox",        bgLight: "#F9FAFB" },
} as const;

export const TASK_PRIORITIES = {
    critical: { label: "Critical", color: "#EF4444", bgLight: "#FEF2F2", icon: "AlertTriangle", pulse: true },
    high:     { label: "High",     color: "#F97316", bgLight: "#FFF7ED", icon: "ArrowUp" },
    medium:   { label: "Medium",   color: "#3B82F6", bgLight: "#EFF6FF", icon: "Minus" },
    low:      { label: "Low",      color: "#6B7280", bgLight: "#F9FAFB", icon: "ArrowDown" },
} as const;

export const TASK_STATUSES = {
    inbox:       { label: "Inbox",       color: "#6B7280", bgLight: "#F9FAFB" },
    assigned:    { label: "Assigned",    color: "#3B82F6", bgLight: "#EFF6FF" },
    in_progress: { label: "In Progress", color: "#F59E0B", bgLight: "#FFFBEB" },
    blocked:     { label: "Blocked",     color: "#EF4444", bgLight: "#FEF2F2" },
    review:      { label: "Review",      color: "#7C5CFC", bgLight: "#F5F3FF" },
    done:        { label: "Done",        color: "#22C55E", bgLight: "#F0FDF4" },
    archived:    { label: "Archived",    color: "#9CA3AF", bgLight: "#F3F4F6" },
} as const;
```

### 1.7 Frontend — Task Board Page (COMPLETE REWRITE)

**File:** `frontend/src/app/mc/tasks/page.tsx`

The new task board must have these views and capabilities:

#### View Modes (Toggle in top bar)
1. **Kanban Board** (default) — Columns by status: Inbox → Assigned → In Progress → Blocked → Review → Done
2. **List View** — Sortable table with all task fields visible
3. **Category View** — Tasks grouped by category (Marketing, Development, Operations, etc.)
4. **Agent View** — Tasks grouped by assigned agent (shows each agent's workload)

#### Filter Bar (Persistent at top)
- **Category pills:** All | Marketing | Development | Operations | Finance | QA | Growth | Creative | Support | Strategy | General
- **Priority pills:** All | Critical | High | Medium | Low
- **Status pills:** All active (excludes archived) | Inbox | Assigned | In Progress | Blocked | Review | Done
- **Agent dropdown:** All agents | Jarvis | Blade | Scout | ... (with search)
- **Brand pills:** All | Plentum | Mavena Co | PawFully
- **Search input:** Full-text search across title and description
- **Sort dropdown:** Priority (default) | Newest | Due Date | Recently Updated

#### Task Card (Kanban & Category View)

Each card displays:
```
┌──────────────────────────────────────────────┐
│ [PRIORITY DOT]  MC-MKT-0023                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Restructure Plentum Meta ABO campaigns       │
│                                              │
│ [Marketing pill]  [Plentum pill]             │
│                                              │
│ 👤 Blade  +2 collaborators                   │
│ 📋 2/5 checklist  ████░░░░ 40%               │
│ 📅 Due: Feb 26                               │
│                                              │
│ [high-impact] [revenue-critical]             │
│                                              │
│ 💬 3 comments  📎 2 references               │
│ Updated 2h ago                               │
└──────────────────────────────────────────────┘
```

Visual rules:
- Critical priority tasks have a **left red border** (4px solid #EF4444) and subtle red tint background
- High priority tasks have a **left orange border**
- Blocked tasks have a **red dashed border** and blocked icon overlay
- Overdue tasks have a **pulsing red due date**
- Cards are draggable between kanban columns
- Clicking a card opens the **Task Detail Drawer** (right-side slide-in panel, NOT a modal/popup)

#### Task Detail Drawer (Slide-in Panel)

When a task card is clicked, a drawer slides in from the right (width: 600px on desktop, full-width on mobile). It shows:

**Header Section:**
- Task UID badge (e.g., "MC-MKT-0023")
- Title (editable inline)
- Priority selector (dropdown)
- Status selector (dropdown — respects transition rules)
- Category badge with color
- Close button (X)

**Body Tabs:**
1. **Details Tab** (default)
   - Description (markdown rendered, click to edit)
   - Assigned Agent (with avatar + name, click to reassign)
   - Collaborator Agents (avatar chips, add/remove)
   - Brand association
   - Skills Required (tag chips)
   - Due Date (date picker)
   - Estimated Hours
   - Notes (editable markdown area)
   - Tags (add/remove chips)
   - Reference Documents (clickable links/file paths)
   - Dependencies (linked task UIDs — clickable)
   - Sub-tasks (if this is a parent task — list of child tasks)
   - Source badge ("Manual" / "Agent Created" / "Cron" / "Command")

2. **Checklist Tab**
   - Each checklist item with checkbox
   - Click checkbox → toggles done, records who completed it and when
   - Add new checklist item (input + "Add" button)
   - Remove checklist item (X button, with confirm)
   - Progress bar showing completion percentage
   - "Mark All Done" button (for bulk completion)

3. **Activity Tab**
   - Full chronological activity log from `TaskActivityLog`
   - Each entry shows: timestamp, actor (with avatar if agent), action description
   - Format examples:
     - "🫡 Jarvis assigned this to ⚔️ Blade — 2h ago"
     - "⚔️ Blade changed status from assigned → in_progress — 1h ago"
     - "👤 Arpit changed priority from medium → critical — 30m ago"
     - "⚔️ Blade completed checklist item: 'Audit current ABO structure' — 20m ago"
     - "📊 Prism added a comment — 15m ago"

4. **Comments Tab**
   - Threaded comment list (newest first)
   - Each comment shows: author avatar + name, timestamp, content (markdown rendered)
   - Reply button on each comment (indented thread)
   - New comment input at top (markdown editor, mention support with @)
   - System messages shown differently (gray, italic, no avatar)

**Footer:**
- "Created by {actor} on {date}" 
- "Last updated {relative_time}"
- "Archive Task" button (only visible for done tasks)
- "Delete Task" button (only visible for admins — see RBAC section)

#### Create Task Modal

Triggered by "+ New Task" button (always visible in top bar of tasks page).

The modal should be a centered overlay with these fields in a clean form layout:

```
Title*                    [text input — required]
Category*                 [dropdown — required, shows colored category pills]
Priority                  [dropdown — default "medium"]
Description               [textarea with markdown support]
Assigned Agent            [searchable dropdown with agent avatars]
Collaborator Agents       [multi-select with agent avatars]
Brand                     [dropdown — Plentum / Mavena Co / PawFully / All / None]
Due Date                  [date picker]
Estimated Hours           [number input]
Skills Required           [tag input — type and press Enter]
Tags                      [tag input — type and press Enter]
Notes                     [textarea]
Reference Documents       [repeatable: title + URL/path + type dropdown]
Checklist                 [repeatable: text input + add button]
```

**On submit:** POST to `/api/v1/mc/tasks` → task gets auto-generated `task_uid` → toast "Task MC-MKT-0023 created" → task appears in appropriate column → WebSocket broadcasts to all clients

### 1.8 Dashboard Integration — Active Tasks Widget

On the main dashboard (`/mc/dashboard`), add a new **"Active Tasks"** section that shows only meaningful, actionable data:

**Agent Workload Strip** (horizontal cards, one per active agent):
```
┌─────────────────────────┐
│ ⚔️ Blade                │
│ 3 active tasks          │
│ [●●●○○] MKT MKT DEV    │
│ Next due: Feb 26        │
└─────────────────────────┘
```

**Critical & Overdue Tasks** (red section, only shows if there are any):
- Tasks with `priority: "critical"` or past `due_date`
- Compact list: task_uid, title, assigned agent, how overdue

**Task Pipeline Summary** (single row of numbers):
```
Inbox: 5  |  In Progress: 8  |  Blocked: 2  |  Review: 3  |  Done Today: 12
```

**Category Distribution** (small horizontal bar chart):
- Shows task count by category for active tasks only

### 1.9 Agent-to-Task Integration

When an agent POSTs to `/api/v1/mc/ingest`, the system should check if the `content` references any task UIDs (e.g., "MC-MKT-0023") and automatically:
1. Create a `TaskActivityLog` entry: `action: "agent_update"`, `details: {"content": "..."}`
2. Add a system comment on the task with the agent's report
3. If the content includes "✅ DONE" or "COMPLETED", auto-transition the task to `review` status

Similarly, when reading `LIVE_FEED.md` or `TASK_BOARD.md`, parse for task UID references and cross-link them.

---

## 👥 PART 2: ROLE-BASED ACCESS CONTROL (RBAC) SYSTEM

### 2.1 User Model (NEW TABLE)

Replace the hardcoded auth with a proper multi-user system.

```python
class MCUser(table=True):
    """
    User accounts for Mission Control.
    Replaces the hardcoded single-user auth.
    """
    __tablename__ = "mc_users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    password_hash: str                # bcrypt hashed password
    name: str = Field(max_length=100) # Display name
    avatar_url: str | None = Field(default=None)
    
    role: str = Field(default="viewer", index=True)
    # ENUM: "owner" | "admin" | "operator" | "agent_manager" | "viewer"
    
    is_active: bool = Field(default=True)
    last_login: datetime | None = Field(default=None)
    
    # Permission overrides (JSON) — for fine-grained control beyond role
    custom_permissions: dict | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    
    # Which brands this user can access (null = all brands)
    brand_access: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # e.g., ["Plentum", "Mavena Co"] — user can only see these brands
    # null/empty = access to all brands
    
    # Which departments this user can manage (null = all)
    department_access: list[str] | None = Field(default=None, sa_column_kwargs={"type_": JSON})
    # e.g., ["Revenue", "Growth"] — user can only manage agents/tasks in these departments

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

### 2.2 Role Definitions & Permission Matrix

```
ROLES (hierarchical — higher roles inherit all lower permissions):

┌─────────────────┬──────────────────────────────────────────────────────────────────┐
│ Role            │ Permissions                                                      │
├─────────────────┼──────────────────────────────────────────────────────────────────┤
│ owner           │ EVERYTHING. Can manage users, roles, system settings.             │
│                 │ Can delete tasks permanently. Can view/edit all brands.           │
│                 │ Can fire commands to any agent. Can access credentials.           │
│                 │ Can manage cron jobs. Can modify agent configurations.            │
│                 │ Only role that can create/delete other admin users.               │
│                 │                                                                  │
│ admin           │ All of operator + manage users (except owner), manage roles,      │
│                 │ view system health, manage cron jobs, access all brands,          │
│                 │ delete tasks, manage agent configurations, view activity logs.    │
│                 │                                                                  │
│ operator        │ All of agent_manager + create/edit/assign tasks across all        │
│                 │ categories, change task priority, broadcast messages, view        │
│                 │ escalations, resolve escalations, view all comms, trigger         │
│                 │ cron jobs manually, manage content pipeline, access file browser. │
│                 │                                                                  │
│ agent_manager   │ All of viewer + create tasks (limited categories based on         │
│                 │ department_access), assign tasks to agents in their department,   │
│                 │ change task status, add comments, update checklists, view agent   │
│                 │ performance for their department, send commands to their agents.  │
│                 │                                                                  │
│ viewer          │ View-only access. Can see dashboard, tasks (filtered by brand     │
│                 │ access), agent statuses, performance charts, standups.            │
│                 │ CANNOT create, edit, or delete anything. CANNOT see credentials   │
│                 │ or system settings. CANNOT send broadcasts or commands.           │
└─────────────────┴──────────────────────────────────────────────────────────────────┘
```

### 2.3 Granular Permissions System

```python
# backend/app/core/permissions.py — NEW FILE

from enum import Enum

class Permission(str, Enum):
    """All permissions in the system."""
    
    # === TASKS ===
    TASK_VIEW = "task:view"
    TASK_CREATE = "task:create"
    TASK_EDIT = "task:edit"
    TASK_DELETE = "task:delete"
    TASK_ASSIGN = "task:assign"
    TASK_CHANGE_STATUS = "task:change_status"
    TASK_CHANGE_PRIORITY = "task:change_priority"
    TASK_COMMENT = "task:comment"
    TASK_CHECKLIST_EDIT = "task:checklist_edit"
    
    # === AGENTS ===
    AGENT_VIEW = "agent:view"
    AGENT_EDIT = "agent:edit"
    AGENT_COMMAND = "agent:command"           # Send commands to agents
    AGENT_PERFORMANCE_RATE = "agent:rate"     # Rate agent performance
    
    # === BRANDS ===
    BRAND_VIEW = "brand:view"
    BRAND_EDIT = "brand:edit"
    BRAND_CREDENTIALS = "brand:credentials"  # View Shopify/Meta tokens
    
    # === COMMS ===
    COMMS_VIEW = "comms:view"
    COMMS_BROADCAST = "comms:broadcast"
    
    # === ESCALATIONS ===
    ESCALATION_VIEW = "escalation:view"
    ESCALATION_CREATE = "escalation:create"
    ESCALATION_RESOLVE = "escalation:resolve"
    
    # === SYSTEM ===
    SYSTEM_VIEW = "system:view"
    SYSTEM_CRON_TRIGGER = "system:cron_trigger"
    SYSTEM_CRON_MANAGE = "system:cron_manage"
    
    # === CONTENT ===
    CONTENT_VIEW = "content:view"
    CONTENT_MANAGE = "content:manage"
    
    # === FILES ===
    FILES_VIEW = "files:view"
    FILES_EDIT = "files:edit"
    
    # === USERS ===
    USER_VIEW = "user:view"
    USER_MANAGE = "user:manage"
    USER_MANAGE_ADMINS = "user:manage_admins"  # Only owner
    
    # === DASHBOARD ===
    DASHBOARD_VIEW = "dashboard:view"
    DASHBOARD_REVENUE = "dashboard:revenue"    # See actual revenue numbers
    DASHBOARD_COSTS = "dashboard:costs"        # See ad spend / cost data


# Role → Permissions mapping
ROLE_PERMISSIONS: dict[str, set[Permission]] = {
    "viewer": {
        Permission.DASHBOARD_VIEW,
        Permission.TASK_VIEW,
        Permission.AGENT_VIEW,
        Permission.BRAND_VIEW,
        Permission.COMMS_VIEW,
        Permission.ESCALATION_VIEW,
        Permission.CONTENT_VIEW,
        Permission.FILES_VIEW,
    },
    "agent_manager": {
        # Inherits all viewer permissions +
        Permission.TASK_CREATE,
        Permission.TASK_EDIT,
        Permission.TASK_ASSIGN,
        Permission.TASK_CHANGE_STATUS,
        Permission.TASK_COMMENT,
        Permission.TASK_CHECKLIST_EDIT,
        Permission.AGENT_COMMAND,
        Permission.AGENT_PERFORMANCE_RATE,
        Permission.ESCALATION_CREATE,
        Permission.DASHBOARD_REVENUE,
    },
    "operator": {
        # Inherits all agent_manager permissions +
        Permission.TASK_CHANGE_PRIORITY,
        Permission.TASK_DELETE,
        Permission.COMMS_BROADCAST,
        Permission.ESCALATION_RESOLVE,
        Permission.SYSTEM_VIEW,
        Permission.SYSTEM_CRON_TRIGGER,
        Permission.CONTENT_MANAGE,
        Permission.FILES_EDIT,
        Permission.DASHBOARD_COSTS,
    },
    "admin": {
        # Inherits all operator permissions +
        Permission.AGENT_EDIT,
        Permission.BRAND_EDIT,
        Permission.SYSTEM_CRON_MANAGE,
        Permission.USER_VIEW,
        Permission.USER_MANAGE,
        Permission.BRAND_CREDENTIALS,
    },
    "owner": {
        # ALL permissions
        Permission.USER_MANAGE_ADMINS,
        # + everything from admin (computed via inheritance)
    },
}

def get_user_permissions(role: str, custom_permissions: dict | None = None) -> set[Permission]:
    """Compute effective permissions for a user based on role + overrides."""
    # Role hierarchy
    hierarchy = ["viewer", "agent_manager", "operator", "admin", "owner"]
    role_index = hierarchy.index(role) if role in hierarchy else 0
    
    # Collect all permissions from role and below
    perms = set()
    for i in range(role_index + 1):
        perms |= ROLE_PERMISSIONS.get(hierarchy[i], set())
    
    # Apply custom overrides
    if custom_permissions:
        for perm_str in custom_permissions.get("grant", []):
            try:
                perms.add(Permission(perm_str))
            except ValueError:
                pass
        for perm_str in custom_permissions.get("revoke", []):
            try:
                perms.discard(Permission(perm_str))
            except ValueError:
                pass
    
    return perms


def check_permission(user: "MCUser", permission: Permission) -> bool:
    """Check if user has a specific permission."""
    perms = get_user_permissions(user.role, user.custom_permissions)
    return permission in perms
```

### 2.4 Authentication Upgrade

**Replace the hardcoded auth with proper JWT-based authentication.**

```python
# backend/app/core/auth.py — NEW FILE

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

SECRET_KEY = os.environ.get("JWT_SECRET", "mission-control-jwt-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
REFRESH_TOKEN_EXPIRE_DAYS = 7

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
```

### 2.5 Auth API Endpoints

```
POST  /api/v1/mc/auth/login           → Login (email + password → JWT tokens)
POST  /api/v1/mc/auth/refresh          → Refresh access token using refresh token
POST  /api/v1/mc/auth/logout           → Invalidate tokens (add to blacklist)
GET   /api/v1/mc/auth/me               → Get current user profile + permissions

# User management (admin/owner only)
GET    /api/v1/mc/users                → List all users
POST   /api/v1/mc/users                → Create new user
GET    /api/v1/mc/users/{user_id}      → Get user details
PUT    /api/v1/mc/users/{user_id}      → Update user (name, role, permissions, brand access)
DELETE /api/v1/mc/users/{user_id}      → Deactivate user (soft delete)
PATCH  /api/v1/mc/users/{user_id}/role → Change user role
POST   /api/v1/mc/users/{user_id}/reset-password → Admin reset password
```

#### Login Response (new format)
```json
{
    "access_token": "eyJhbG...",
    "refresh_token": "eyJhbG...",
    "token_type": "bearer",
    "expires_in": 86400,
    "user": {
        "id": "uuid-here",
        "email": "arpit@plentum.com",
        "name": "Arpit",
        "role": "owner",
        "permissions": ["task:view", "task:create", ...],
        "brand_access": null,
        "department_access": null
    }
}
```

### 2.6 Backward Compatibility — CRITICAL

**The existing seed user MUST still work after migration:**

```python
# During DB migration, create the owner user:
SEED_OWNER = {
    "email": "arpit@plentum.com",
    "password": "MissionControl2026!",  # Will be bcrypt hashed
    "name": "Arpit",
    "role": "owner",
    "brand_access": None,         # Access to everything
    "department_access": None,    # Manage all departments
}
```

**The agent ingest token (`mc-ingest-2026-arpit`) MUST continue to work.** Agent authentication is separate from user auth. Do NOT break the ingest endpoint.

### 2.7 Frontend — Auth Context Updates

Update `MCProvider` in `context.tsx`:

```typescript
// State additions
interface AuthState {
    user: MCUser | null;
    permissions: Set<string>;
    isLoggedIn: boolean;
}

interface MCUser {
    id: string;
    email: string;
    name: string;
    role: "owner" | "admin" | "operator" | "agent_manager" | "viewer";
    permissions: string[];
    brand_access: string[] | null;
    department_access: string[] | null;
    avatar_url: string | null;
}
```

**Permission check hook:**
```typescript
function usePermission(permission: string): boolean {
    const { auth } = useMC();
    return auth.permissions.has(permission);
}

// Usage in components:
function TaskCard({ task }) {
    const canEdit = usePermission("task:edit");
    const canDelete = usePermission("task:delete");
    const canChangeStatus = usePermission("task:change_status");
    
    return (
        <div style={{...}}>
            {/* ... task content ... */}
            {canEdit && <EditButton />}
            {canChangeStatus && <StatusDropdown />}
            {canDelete && <DeleteButton />}
        </div>
    );
}
```

### 2.8 Frontend — User Management Page (NEW)

**Route:** `/mc/settings/users`  
**Nav label:** "Settings" → "User Management"  
**Visible to:** admin and owner roles only

**Features:**
- User list with: name, email, role badge, brand access, last login, status (active/inactive)
- Create new user form (name, email, password, role, brand access, department access)
- Edit user (change role, permissions, brand access)
- Deactivate / reactivate user
- Role assignment with visual permission preview (show what permissions each role grants)

### 2.9 UI Enforcement Rules

The frontend must enforce permissions visually:

| Element | Viewer | Agent Manager | Operator | Admin | Owner |
|---|---|---|---|---|---|
| Dashboard KPIs | ✅ (may blur revenue) | ✅ | ✅ | ✅ | ✅ |
| Task Board — view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task Board — create | ❌ | ✅ (own dept) | ✅ | ✅ | ✅ |
| Task Board — edit | ❌ | ✅ (own dept) | ✅ | ✅ | ✅ |
| Task Board — delete | ❌ | ❌ | ✅ | ✅ | ✅ |
| Task Board — drag status | ❌ | ✅ | ✅ | ✅ | ✅ |
| Task comments | ❌ | ✅ | ✅ | ✅ | ✅ |
| Agent Roster — view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Agent Roster — edit | ❌ | ❌ | ❌ | ✅ | ✅ |
| Agent Command | ❌ | ✅ (own dept) | ✅ | ✅ | ✅ |
| Comms — view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Broadcast message | ❌ | ❌ | ✅ | ✅ | ✅ |
| Escalations — view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Escalations — resolve | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cron — view | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cron — trigger | ❌ | ❌ | ✅ | ✅ | ✅ |
| System Health | ❌ | ❌ | ✅ | ✅ | ✅ |
| File Browser | ✅ | ✅ | ✅ | ✅ | ✅ |
| Content Pipeline — view | ✅ | ✅ | ✅ | ✅ | ✅ |
| Content Pipeline — edit | ❌ | ❌ | ✅ | ✅ | ✅ |
| User Management | ❌ | ❌ | ❌ | ✅ | ✅ |
| Credentials / Tokens | ❌ | ❌ | ❌ | ✅ | ✅ |
| Privacy mode toggle | ✅ | ✅ | ✅ | ✅ | ✅ |

**Enforcement approach:**
- Buttons/actions the user doesn't have permission for should be **hidden**, not disabled
- Navigation items for pages the user can't access should be **hidden from sidebar**
- API endpoints must verify permissions server-side (never trust frontend-only enforcement)
- If a user somehow navigates to a restricted page, show a clean "Access Denied" message with their current role

---

## 🏗️ PART 3: IMPLEMENTATION PLAN — STEP BY STEP

### Phase 1: Database Migration (Do FIRST)

1. Create Alembic migration to ALTER `mc_tasks` table — add all new columns
2. Create `task_activity_logs` table
3. Create `task_comments` table
4. Create `mc_users` table
5. Seed the owner user (`arpit@plentum.com`)
6. Backfill `task_uid` for any existing tasks in `mc_tasks`
7. Backfill `category` as "general" for any existing tasks that lack it
8. **TEST:** Verify existing data is not lost. Verify all existing API endpoints still return data.

### Phase 2: Backend — Auth Upgrade

1. Add `bcrypt` and `PyJWT` to dependencies
2. Create `backend/app/core/auth.py` (JWT functions)
3. Create `backend/app/core/permissions.py` (RBAC logic)
4. Update `POST /api/v1/mc/auth/login` to use DB user lookup + JWT
5. Create auth middleware/dependency that extracts user from JWT
6. Add `GET /api/v1/mc/auth/me` endpoint
7. Add `POST /api/v1/mc/auth/refresh` endpoint
8. **DO NOT** break the ingest token auth — keep it as a separate auth path
9. **TEST:** Verify login works with old credentials. Verify all existing authenticated endpoints still work.

### Phase 3: Backend — Task API Upgrade

1. Update task CRUD endpoints with new fields
2. Add task UID generation logic
3. Add status transition validation
4. Add checklist management endpoints
5. Add comment endpoints
6. Add activity log creation on every task mutation
7. Add task summary/aggregation endpoints
8. Add agent-to-task auto-linking (parse ingest content for task UIDs)
9. Add permission checks on all task endpoints
10. **TEST:** Create, edit, assign, transition, comment, archive a task through the full lifecycle.

### Phase 4: Backend — User Management API

1. Add user CRUD endpoints (admin-only)
2. Add role assignment endpoint
3. Add permission enforcement middleware on all existing endpoints
4. **TEST:** Verify viewer can't create tasks. Verify agent_manager can only manage their department.

### Phase 5: Frontend — Task Board Rewrite

1. Update `types.ts` with new task interfaces, category/priority/status configs
2. Rewrite `tasks/page.tsx` with Kanban + List + Category + Agent views
3. Build task detail drawer component
4. Build create task modal
5. Build filter bar with all filter options
6. Implement drag-and-drop between kanban columns
7. Connect to all new API endpoints
8. Add WebSocket handler for `task_created`, `task_updated` events
9. **TEST:** Full E2E — create task, drag to in_progress, add comment, check checklist item, mark done.

### Phase 6: Frontend — Auth & RBAC UI

1. Update `context.tsx` with new auth state (user object, permissions set)
2. Create `usePermission` hook
3. Update login screen for JWT flow (store access_token + refresh_token)
4. Add token refresh logic (refresh before expiry)
5. Update sidebar to hide nav items based on permissions
6. Update all pages/components to conditionally render based on permissions
7. Build user management page at `/mc/settings/users`
8. **TEST:** Login as different roles. Verify correct visibility.

### Phase 7: Dashboard Integration

1. Add active tasks widget to dashboard
2. Add agent workload strip
3. Add critical/overdue tasks section
4. Add task pipeline summary row
5. Add category distribution chart
6. **TEST:** Dashboard loads with new task widgets without breaking existing KPIs/charts.

---

## 🔒 PART 4: SECURITY REQUIREMENTS

1. **All passwords must be bcrypt hashed** — never store plaintext
2. **JWT tokens must have expiry** — access: 24h, refresh: 7 days
3. **Server-side permission checks on EVERY endpoint** — never trust the frontend
4. **Brand-level access filtering** — users with `brand_access: ["Plentum"]` must NEVER see Mavena data in ANY endpoint response
5. **Department-level filtering** — agent_managers can only manage their assigned departments
6. **Audit trail** — every task mutation logged in `task_activity_logs` with actor + timestamp
7. **Rate limiting on login** — max 10 attempts per IP per 15 minutes (implement in backend)
8. **Ingest endpoint auth is SEPARATE** — agents use token auth, not JWT. Do not break this.
9. **Sensitive fields masked** — Shopify tokens, Meta tokens never exposed to viewer/agent_manager roles

---

## 🎨 PART 5: DESIGN RULES — MUST FOLLOW

1. **ALL styling via inline `style={{}}` objects** — NO Tailwind, NO CSS modules, NO className styling (except global font)
2. **Color palette:** Use the existing design system colors (primary `#7C5CFC`, status colors, etc.)
3. **Category colors** as defined in Section 1.6 above
4. **Framer Motion** for all animations — page transitions, card hover, drawer slide-in, toast notifications
5. **lucide-react** for all icons — do NOT add another icon library
6. **`sonner`** for toast notifications — do NOT add another toast library
7. **Responsive** — mobile breakpoint at 768px, task cards stack vertically on mobile
8. **Touch targets** — minimum 44×44px for all interactive elements
9. **Dark mode** — all new components must support both light and dark themes via the existing theme system
10. **AnimatedNumber** component for any metric displays (use existing component)
11. **Skeleton** component for loading states (use existing component)

---

## 📌 PART 6: WHAT NOT TO CHANGE

**DO NOT modify or break:**
- Revenue/performance data pipeline (Shopify, Meta, Triple Whale integrations)
- Agent ingest endpoint (`POST /api/v1/mc/ingest`) and its token auth
- WebSocket connection and broadcasting logic (only ADD new event types)
- Cron job system
- Memory viewer
- File browser
- Org chart
- Standup system
- Existing brand data and performance snapshots
- The shell layout structure (sidebar + main + live feed panel)
- The top bar layout (logo, stats, brand pills, clock, controls)
- Keyboard shortcuts (only ADD new ones, don't remap existing)
- The data sync background service
- Environment variables and Railway deployment config

---

## 🧪 PART 7: TESTING CHECKLIST

After implementation, verify ALL of the following:

### Auth & RBAC
- [ ] Owner can login with existing credentials (`arpit@plentum.com`)
- [ ] Owner can create new users with any role
- [ ] Admin can create users (not owner role)
- [ ] Viewer can only see, not edit anything
- [ ] Agent manager can only manage their department's tasks
- [ ] JWT tokens expire correctly
- [ ] Refresh token works to get new access token
- [ ] Agent ingest still works with old token
- [ ] Brand-level filtering works (user only sees their brands)

### Task Management
- [ ] Creating a task generates correct task_uid (MC-MKT-0001 format)
- [ ] All task categories produce correct codes
- [ ] Status transitions follow defined rules (can't go from inbox → done directly)
- [ ] Blocked status requires a reason
- [ ] Checklist items can be toggled, added, removed
- [ ] Progress bar updates on checklist change
- [ ] Comments can be added with @mentions
- [ ] Activity log captures every mutation with correct actor
- [ ] Task detail drawer shows all tabs with correct data
- [ ] Kanban drag-and-drop works
- [ ] All filter combinations work
- [ ] Search works across title and description
- [ ] WebSocket broadcasts task changes to all connected clients
- [ ] Dashboard shows active task widgets
- [ ] Overdue tasks are visually highlighted
- [ ] Critical tasks are visually distinct

### Backward Compatibility
- [ ] All existing dashboard data still loads (KPIs, revenue, ROAS)
- [ ] All existing agents still display with correct status
- [ ] All existing pages still accessible and functional
- [ ] LiveFeed panel still works
- [ ] Standups page still works
- [ ] Performance charts still render
- [ ] System health page still shows metrics
- [ ] Comms page still shows agent sessions

---

## 📎 APPENDIX: Environment Variables to Add

```bash
# NEW — JWT Authentication
JWT_SECRET=<generate-a-strong-random-secret-min-32-chars>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_HOURS=24
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# NEW — Password Hashing
BCRYPT_ROUNDS=12

# EXISTING — Keep these unchanged
DATABASE_URL=postgresql+asyncpg://...
CORS_ORIGINS=https://mc.wespod.com,http://localhost:3000
ENVIRONMENT=production
DB_AUTO_MIGRATE=true
WORKSPACE_DIR=/app/workspace
GIT_SHA=<injected-by-railway>
```

## 📎 APPENDIX: Python Dependencies to Add

```
# Add to backend requirements / pyproject.toml
bcrypt>=4.0.0
PyJWT>=2.8.0
```

## 📎 APPENDIX: Frontend Dependencies to Add

```
# None — use existing libraries only
# All UI is built with: React, Framer Motion, lucide-react, sonner, cmdk
# No new frontend dependencies should be needed
```

---

**END OF PROMPT**

*This prompt covers the complete specification for upgrading Mission Control's task management and RBAC system. Every section has been designed to integrate seamlessly with the existing architecture. Follow the phased implementation plan strictly — database first, backend second, frontend last. Test at every phase boundary before proceeding.*
