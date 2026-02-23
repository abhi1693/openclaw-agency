# Mission Control Dashboard V4 — Complete Specification

> **Atlas 🗺️ | Strategy Agent | v4.0 | 2026-02-19**
> The nerve center for a $400K/month multi-brand e-commerce empire.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Information Architecture](#2-information-architecture)
3. [Layout Specification](#3-layout-specification)
4. [Design System & Component Library](#4-design-system--component-library)
5. [Data Model](#5-data-model)
6. [Agent-Specific Views](#6-agent-specific-views)
7. [Real-Time Features](#7-real-time-features)
8. [Performance Tab](#8-performance-tab)
9. [Brand Selector](#9-brand-selector)
10. [Standup & Morning Brief](#10-standup--morning-brief)
11. [Cron & Schedule View](#11-cron--schedule-view)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Design Philosophy

**One sentence:** A light, modern command center where 14 AI agents and 1 human operator manage 5 brands toward $100K/month each — everything visible, nothing hidden.

### Core Principles

- **Glanceability** — Any metric within 2 clicks max
- **Agent-first** — Every view can be filtered by agent; every agent has a home
- **Brand-aware** — Global view default, instant brand isolation
- **Real-time** — Live feed always visible, status changes instant
- **BankDash DNA** — Clean light theme, Inter font, rounded cards, professional palette

### Visual Identity

| Property | Value |
|----------|-------|
| **Logo** | "MISSION CONTROL" — Inter 700, 18px, #343C6A, letter-spacing 2px |
| **Accent** | Teal `#0891B2` (primary action), Navy `#343C6A` (headings) |
| **Theme** | Light — background #F5F7FA, cards white |
| **Mood** | Bloomberg Terminal meets Notion — dense but beautiful |

---

## 2. Information Architecture

### Global Navigation (Left Sidebar — always visible)

```
┌─────────────────────┐
│ ◆ MISSION CONTROL    │
│                      │
│ ── MAIN ──           │
│ 📊 Command Center    │  ← Default landing (Jarvis view)
│ 📋 Task Board        │  ← Kanban (SiteGPT-style)
│ 📈 Performance       │  ← Revenue/KPI dashboards
│ 🔔 Live Feed         │  ← Activity stream (also pinned right)
│                      │
│ ── DEPARTMENTS ──    │
│ 🌱 Growth            │  ← Scout, Sage, Ghost, Atlas
│ 💰 Revenue           │  ← Blade, Forge, Ember
│ ⚙️ Operations        │  ← Vault, Shield, Prism, Keeper
│ ✅ Quality           │  ← Sentinel
│ 💻 Engineering       │  ← Pixel
│ 🫡 Command           │  ← Jarvis
│                      │
│ ── SYSTEM ──         │
│ 🤖 Agents            │  ← Roster, health, model fleet
│ ⏰ Schedules         │  ← Cron jobs, automation
│ 📝 Standups          │  ← Morning briefs, overnight logs
│ 📚 Docs              │  ← Agent docs, SOPs
│ ⚙️ Settings          │
│                      │
│ ── BRANDS ──         │
│ 🟣 All Brands        │  ← Active filter indicator
│   Plentum            │
│   Mavena             │
│   PawFully           │
│   RetroMedy          │
│   [+ New Brand]      │
└─────────────────────┘
```

### Tab/View Map

| View | Purpose | Primary Users |
|------|---------|---------------|
| **Command Center** | Executive overview — KPI tiles, agent status grid, alerts, today's priorities | Jarvis, Atlas, Arpit |
| **Task Board** | Kanban with 5 columns, filterable by agent/brand/tag | All agents |
| **Performance** | Revenue charts, traffic, conversion, brand comparison | Prism, Atlas, Blade, Jarvis |
| **Live Feed** | Chronological activity stream with filters | All |
| **Growth Hub** | SEO metrics, content pipeline, off-page tracker, strategy board | Scout, Sage, Ghost, Atlas |
| **Revenue Hub** | Ad spend, ROAS, creative pipeline, email metrics | Blade, Forge, Ember |
| **Operations Hub** | Orders, support tickets, inventory, retention | Vault, Shield, Prism, Keeper |
| **Quality Hub** | QA queue, pass/fail, staging items | Sentinel |
| **Engineering Hub** | Deployments, API health, error logs, uptime | Pixel |
| **Agents** | Roster, org chart, model fleet, session viewer | Jarvis, Arpit |
| **Schedules** | All cron jobs, last run, next run, status | All |
| **Standups** | Daily briefs, overnight logs, structured summaries | Jarvis, Arpit |
| **Docs** | Agent SOPs, playbooks, reference material | All |

---

## 3. Layout Specification

### Desktop (≥1440px) — Primary Target

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR (70px)                                                    │
│ ◆ MISSION CONTROL  │ 14 AGENTS ACTIVE │ 31 TASKS │ 🟢 ONLINE │ 🕐│
├────────┬─────────────────────────────────────┬───────────────────┤
│ LEFT   │ MAIN CONTENT                        │ RIGHT PANEL       │
│ SIDEBAR│ (scrollable)                        │ LIVE FEED         │
│ (250px)│                                     │ (350px, collapsible)│
│        │                                     │                   │
│ Nav    │ [Depends on active view]            │ Activity stream   │
│ Brand  │                                     │ Agent status      │
│ Filter │                                     │ Alerts            │
│        │                                     │                   │
│ Agent  │                                     │                   │
│ Quick  │                                     │                   │
│ List   │                                     │                   │
│(bottom)│                                     │                   │
├────────┴─────────────────────────────────────┴───────────────────┤
│ STATUS BAR (32px) — Last sync: 2s ago │ API: ✅ │ Brands: 4/5    │
└──────────────────────────────────────────────────────────────────┘
```

### Dimensions

| Element | Size | Behavior |
|---------|------|----------|
| **Top Bar** | 70px fixed | Always visible. Contains: logo, stats chips, system toggle, clock |
| **Left Sidebar** | 250px fixed | Collapsible to 70px (icons only). Nav + brand filter + agent quick-list |
| **Right Panel** | 350px fixed | Collapsible. Live Feed always running. Toggle with `Cmd+/` |
| **Main Content** | Fluid (calc(100vw - 250px - 350px)) | Scrollable. Min 600px |
| **Status Bar** | 32px fixed bottom | Sync status, API health, brand count |

### Tablet (1024–1439px)

- Left sidebar collapses to 70px icons
- Right panel hidden by default (overlay on toggle)
- Main content fills remaining space

### Mobile (< 1024px)

- Bottom tab bar replaces sidebar (5 tabs: Command, Tasks, Performance, Feed, Menu)
- Full-width content
- Agent/brand filter as top sheet

---

## 4. Design System & Component Library

### 4.1 Foundation

```css
/* Typography */
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Font Sizes */
--text-xs: 11px;
--text-sm: 13px;
--text-base: 15px;
--text-lg: 18px;
--text-xl: 22px;
--text-2xl: 28px;
--text-3xl: 36px;

/* Colors — BankDash Adapted */
--color-navy: #343C6A;          /* Headings, primary text */
--color-teal: #0891B2;          /* Primary accent (our brand) */
--color-teal-light: #06B6D4;    /* Hover state */
--color-teal-bg: #ECFEFF;       /* Teal background tint */
--color-blue: #1814F3;          /* Active/selected (from BankDash) */
--color-secondary: #718EBF;     /* Secondary text, labels */
--color-green: #41D4A8;         /* Positive, success, online */
--color-green-bg: #ECFDF5;
--color-red: #FF4B4A;           /* Negative, errors, alerts */
--color-red-bg: #FEF2F2;
--color-orange: #FFBB38;        /* Warning, pending */
--color-orange-bg: #FFFBEB;
--color-purple: #7B61FF;        /* Special, creative */
--color-bg: #F5F7FA;            /* Page background */
--color-card: #FFFFFF;          /* Card background */
--color-border: #E6EFF5;        /* Subtle borders */
--color-text: #232323;          /* Body text */
--color-muted: #B1B1B1;        /* Disabled/muted */

/* Spacing */
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;

/* Radii */
--radius-card: 25px;
--radius-pill: 50px;
--radius-button: 50px;
--radius-input: 15px;
--radius-sm: 10px;

/* Shadows */
--shadow-card: 0px 4px 20px rgba(0, 0, 0, 0.04);
--shadow-hover: 0px 8px 30px rgba(0, 0, 0, 0.08);
--shadow-dropdown: 0px 10px 40px rgba(0, 0, 0, 0.12);

/* Transitions */
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
```

### 4.2 Brand Colors

Each brand has a signature color used in charts, filters, and brand pills:

| Brand | Color | Light BG |
|-------|-------|----------|
| **Plentum** | `#6366F1` (Indigo) | `#EEF2FF` |
| **Mavena** | `#EC4899` (Pink) | `#FDF2F8` |
| **PawFully** | `#F59E0B` (Amber) | `#FFFBEB` |
| **RetroMedy** | `#10B981` (Emerald) | `#ECFDF5` |
| **Future Brand** | `#8B5CF6` (Violet) | `#F5F3FF` |

### 4.3 Agent Colors

Each agent has a unique color for their avatar circle:

| Agent | Emoji | Color | Hex |
|-------|-------|-------|-----|
| Scout | 🔍 | Cyan | `#06B6D4` |
| Sage | ✍️ | Lime | `#84CC16` |
| Ghost | 👻 | Slate | `#64748B` |
| Atlas | 🗺️ | Sky | `#0EA5E9` |
| Blade | ⚔️ | Rose | `#F43F5E` |
| Forge | 🔥 | Orange | `#F97316` |
| Ember | 📧 | Fuchsia | `#D946EF` |
| Vault | 🏪 | Amber | `#F59E0B` |
| Shield | 🛡️ | Teal | `#14B8A6` |
| Prism | 📊 | Violet | `#8B5CF6` |
| Keeper | 🔑 | Emerald | `#10B981` |
| Sentinel | ✅ | Blue | `#3B82F6` |
| Pixel | 💻 | Zinc | `#71717A` |
| Jarvis | 🫡 | Navy | `#1E3A5F` |

### 4.4 Component Specs

#### KPI Tile

```
┌─────────────────────────────┐
│  [🟢 icon circle]           │
│  Total Revenue              │  ← --text-sm, --color-secondary
│  $378,200                   │  ← --text-2xl, --font-weight-bold, --color-navy
│  ▲ 12.4% vs last month     │  ← --text-xs, --color-green
└─────────────────────────────┘

CSS:
  background: var(--color-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 24px;
  min-width: 200px;
  
Icon circle:
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--color-teal-bg); /* varies by metric */
  display: flex; align-items: center; justify-content: center;
```

#### Agent Row (Sidebar)

```
┌──────────────────────────────────┐
│ [🔍] Scout    SEO    ● WORKING  │
│      colored   badge   green    │
│      circle    pill    pill     │
└──────────────────────────────────┘

CSS:
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  &:hover { background: var(--color-bg); }
  &.selected { background: var(--color-teal-bg); border-left: 3px solid var(--color-teal); }

Avatar circle: 32px, background: agent color, emoji centered
Role badge: font-size 9px, font-weight 700, letter-spacing 1px, uppercase
  LEAD = navy bg, white text
  SPC = teal bg, white text  
  ENT = purple bg, white text
Status pill: 8px dot + label, font-size 11px
  WORKING = green dot + "WORKING"
  IDLE = gray dot + "IDLE"
  ERROR = red dot + "ERROR"
  PAUSED = orange dot + "PAUSED"
```

#### Task Card (Kanban)

```
┌─────────────────────────────────┐
│ Optimize PDP meta descriptions  │  ← --text-sm, --font-weight-semibold
│ Update all product page meta... │  ← --text-xs, --color-secondary, 2-line clamp
│                                 │
│ [seo] [plentum] [on-page]      │  ← Tag pills (colored)
│                                 │
│ [🔍] Scout          3 days ago  │  ← Assignee + timestamp
└─────────────────────────────────┘

CSS:
  background: var(--color-card);
  border-radius: 15px;
  box-shadow: var(--shadow-card);
  padding: 16px;
  margin-bottom: 12px;
  cursor: grab;
  border-left: 4px solid [agent-color];
  &:hover { box-shadow: var(--shadow-hover); transform: translateY(-1px); }

Tag pills:
  font-size: 10px; font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: varies (category color at 10% opacity);
  color: category color;
```

#### Stat Chip (Top Bar)

```
[14 AGENTS ACTIVE]  [31 TASKS IN QUEUE]  [🟢 ONLINE]

CSS:
  background: var(--color-card);
  border-radius: var(--radius-pill);
  padding: 8px 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--color-navy);
  box-shadow: var(--shadow-card);
```

#### Chart Card

```
┌──────────────────────────────────────────┐
│ Revenue by Brand                    [⋮]  │  ← Header row
│ Last 30 days                             │  ← Subtitle
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │         [line/bar chart area]       │ │  ← 280px height
│  │                                     │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ● Plentum  ● Mavena  ● PawFully       │  ← Legend
└──────────────────────────────────────────┘

CSS:
  background: var(--color-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  padding: 24px;

Chart library: Chart.js or Recharts
  Line weight: 2.5px
  Fill: gradient from line color at 20% → transparent
  Grid: #E6EFF5 dashed
  Font: Inter 11px for labels
```

#### Feed Item

```
┌──────────────────────────────────────────┐
│ [🔍] Scout completed "Keyword Audit"     │
│      Plentum · 2 min ago                 │
│      ┌──────────────────────────────┐    │
│      │ 📄 keyword-audit-feb.csv     │    │  ← Optional attachment preview
│      └──────────────────────────────┘    │
└──────────────────────────────────────────┘

CSS:
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  &:hover { background: #FAFBFC; }
  
Agent name: --font-weight-semibold, agent color
Action text: --color-text
Timestamp: --text-xs, --color-muted
```

#### Brand Filter Pill

```
[🟣 Plentum ✕]  [All Brands ▾]

Active:
  background: brand-color at 15%;
  border: 2px solid brand-color;
  color: brand-color;
  font-weight: 600;

Inactive:
  background: var(--color-card);
  border: 1px solid var(--color-border);
  color: var(--color-secondary);
```

#### Alert Banner

```
┌─────────────────────────────────────────────────────┐
│ 🔴 ALERT: Mavena ad spend exceeded daily budget by  │
│    23% — Blade paused campaign "Summer-TOF-01"      │
│                               [View] [Dismiss]      │
└─────────────────────────────────────────────────────┘

CSS (critical):
  background: linear-gradient(135deg, #FEF2F2, #FEE2E2);
  border: 1px solid #FECACA;
  border-radius: 15px;
  padding: 16px 20px;

CSS (warning):
  background: linear-gradient(135deg, #FFFBEB, #FEF3C7);
  border: 1px solid #FDE68A;

CSS (success):
  background: linear-gradient(135deg, #ECFDF5, #D1FAE5);
  border: 1px solid #A7F3D0;
```

#### Org Chart Node

```
┌───────────────────┐
│  [🫡]  Jarvis     │
│  COO · Command    │
│  Claude Opus 4    │
│  ● ONLINE         │
└───────────────────┘

CSS:
  background: var(--color-card);
  border-radius: 15px;
  box-shadow: var(--shadow-card);
  padding: 16px;
  text-align: center;
  border-top: 4px solid [agent-color];
  width: 160px;
```

---

## 5. Data Model

All data lives in `mission-control/data/` as JSON files, read by the dashboard on load and refreshed via polling or file-watch.

### 5.1 File Structure

```
mission-control/
├── data/
│   ├── agents.json            # Agent roster & status
│   ├── tasks.json             # All tasks (kanban source)
│   ├── feed.json              # Live feed entries (append-only, last 500)
│   ├── metrics/
│   │   ├── revenue.json       # Revenue by brand by day
│   │   ├── traffic.json       # Sessions, pageviews by brand
│   │   ├── ads.json           # Ad spend, ROAS, CPA by campaign
│   │   ├── email.json         # Klaviyo metrics
│   │   ├── seo.json           # Rankings, indexation, GSC
│   │   ├── support.json       # Gorgias tickets, CSAT
│   │   ├── retention.json     # Churn, LTV, subscriptions
│   │   └── system.json        # API health, uptime, errors
│   ├── brands.json            # Brand config & metadata
│   ├── schedules.json         # Cron jobs registry
│   ├── standups/
│   │   └── 2026-02-19.json    # Daily standup data
│   └── alerts.json            # Active alerts
├── DASHBOARD_V4_SPEC.md       # This file
└── dashboard/                 # Frontend code (future)
    ├── index.html
    ├── styles.css
    └── app.js
```

### 5.2 Schemas

#### agents.json

```json
{
  "agents": [
    {
      "id": "scout",
      "name": "Scout",
      "emoji": "🔍",
      "role": "SEO Lead",
      "department": "growth",
      "roleBadge": "LEAD",
      "color": "#06B6D4",
      "model": "claude-sonnet-4",
      "status": "working",
      "currentTask": "task_042",
      "tasksCompleted": 127,
      "tasksInProgress": 3,
      "lastActive": "2026-02-19T08:42:00Z",
      "sessionId": "agent:main:subagent:abc123",
      "brands": ["plentum", "mavena", "pawfully"],
      "soul": "Relentless SEO optimizer. Data-driven. Never sleeps on rankings.",
      "workspace": "/agents/scout/",
      "gateway": "openclaw"
    }
  ],
  "systemStatus": "online",
  "lastUpdated": "2026-02-19T08:44:12Z"
}
```

#### tasks.json

```json
{
  "tasks": [
    {
      "id": "task_042",
      "title": "Optimize PDP meta descriptions",
      "description": "Update all product page meta descriptions for Plentum store using keyword research from Jan audit.",
      "status": "in_progress",
      "column": "in_progress",
      "assignee": "scout",
      "brand": "plentum",
      "tags": ["seo", "on-page", "pdp"],
      "priority": "high",
      "createdAt": "2026-02-16T10:00:00Z",
      "updatedAt": "2026-02-19T08:30:00Z",
      "dueDate": "2026-02-21T00:00:00Z",
      "dependencies": [],
      "deliverables": [],
      "comments": 3
    }
  ],
  "columns": ["inbox", "assigned", "in_progress", "review", "done"]
}
```

#### feed.json

```json
{
  "entries": [
    {
      "id": "feed_00891",
      "timestamp": "2026-02-19T08:42:00Z",
      "agent": "scout",
      "type": "task_complete",
      "brand": "plentum",
      "title": "Scout completed \"Keyword Audit Q1\"",
      "body": "Identified 47 new keyword opportunities across 3 clusters.",
      "attachment": {
        "type": "file",
        "name": "keyword-audit-q1.csv",
        "path": "/agents/scout/deliverables/keyword-audit-q1.csv"
      },
      "severity": "info"
    },
    {
      "id": "feed_00892",
      "timestamp": "2026-02-19T08:44:00Z",
      "agent": "system",
      "type": "alert",
      "brand": null,
      "title": "🔴 Mavena ad spend exceeded daily budget",
      "body": "Campaign 'Summer-TOF-01' overspent by 23%. Blade auto-paused.",
      "attachment": null,
      "severity": "critical"
    }
  ],
  "maxEntries": 500
}
```

#### metrics/revenue.json

```json
{
  "brands": {
    "plentum": {
      "current_month": { "revenue": 5487.32, "orders": 89, "aov": 61.65 },
      "last_month": { "revenue": 43900, "orders": 712, "aov": 61.65 },
      "daily": [
        { "date": "2026-02-01", "revenue": 287.50, "orders": 5 }
      ],
      "goal": 100000,
      "pace": 0.055
    },
    "mavena": {
      "current_month": { "revenue": 38125.00, "orders": 445, "aov": 85.67 },
      "last_month": { "revenue": 305000, "orders": 3560, "aov": 85.67 },
      "daily": [],
      "goal": 100000,
      "pace": 0.381
    },
    "pawfully": {
      "current_month": { "revenue": 3725.00, "orders": 62, "aov": 60.08 },
      "last_month": { "revenue": 29800, "orders": 496, "aov": 60.08 },
      "daily": [],
      "goal": 100000,
      "pace": 0.037
    },
    "retromedy": {
      "current_month": { "revenue": 0, "orders": 0, "aov": 0 },
      "daily": [],
      "goal": 100000,
      "pace": 0
    }
  },
  "total": {
    "current_month": 47337.32,
    "goal": 400000,
    "pace": 0.118
  },
  "historical": {
    "plentum_8mo_total": 43900,
    "mavena_8mo_total": 305000,
    "pawfully_8mo_total": 29800
  }
}
```

#### brands.json

```json
{
  "brands": [
    {
      "id": "plentum",
      "name": "Plentum",
      "color": "#6366F1",
      "lightBg": "#EEF2FF",
      "shopifyStore": "plentumstore",
      "domain": "plentum.com",
      "niche": "Health & Wellness Supplements",
      "status": "active",
      "launchDate": "2025-06-01",
      "agents": ["scout", "sage", "ghost", "atlas", "blade", "forge", "ember", "vault", "shield", "prism", "keeper", "sentinel", "pixel", "jarvis"]
    }
  ]
}
```

#### schedules.json

```json
{
  "jobs": [
    {
      "id": "cron_001",
      "name": "Morning Revenue Pull",
      "agent": "prism",
      "schedule": "0 7 * * *",
      "humanSchedule": "Daily at 7:00 AM ET",
      "lastRun": "2026-02-19T07:00:00Z",
      "lastStatus": "success",
      "nextRun": "2026-02-20T07:00:00Z",
      "duration": "45s",
      "brand": "all",
      "description": "Pull Shopify revenue, orders, and traffic for all brands"
    }
  ]
}
```

#### standups/2026-02-19.json

```json
{
  "date": "2026-02-19",
  "morningBrief": {
    "generatedAt": "2026-02-19T07:30:00Z",
    "generatedBy": "jarvis",
    "summary": "Good morning. Mavena had a strong overnight with $2,847 in revenue. One alert: Plentum's 'Joint-Health-TOF' campaign entered learning phase after creative swap. Scout completed the Q1 keyword audit — 47 new opportunities identified.",
    "highlights": [
      { "type": "positive", "text": "Mavena overnight revenue: $2,847 (+18% vs avg)" },
      { "type": "warning", "text": "Plentum campaign 'Joint-Health-TOF' in learning phase" },
      { "type": "info", "text": "Scout completed Q1 keyword audit — 47 opportunities" }
    ],
    "overnightLog": [
      { "time": "01:23", "agent": "ember", "action": "Sent win-back flow to 342 churned Mavena subscribers" },
      { "time": "03:15", "agent": "blade", "action": "Auto-paused underperforming Plentum ad set (CPA > $45)" },
      { "time": "05:00", "agent": "prism", "action": "Daily data sync completed for all brands" }
    ],
    "todayPriorities": [
      { "agent": "scout", "task": "Begin internal linking sprint for Plentum blog" },
      { "agent": "forge", "task": "Generate 5 new Mavena UGC-style creatives" },
      { "agent": "keeper", "task": "Launch PawFully loyalty program v2" }
    ]
  },
  "agentStandups": [
    {
      "agent": "scout",
      "submittedAt": "2026-02-19T07:15:00Z",
      "yesterday": "Completed Q1 keyword audit. Found 47 opportunities across 3 clusters.",
      "today": "Internal linking sprint for Plentum. Target: 50 cross-links.",
      "blockers": "Need Sage to finalize 3 blog posts before I can link to them."
    }
  ]
}
```

#### alerts.json

```json
{
  "active": [
    {
      "id": "alert_019",
      "severity": "critical",
      "title": "Mavena ad spend exceeded daily budget",
      "body": "Campaign 'Summer-TOF-01' overspent by 23%.",
      "agent": "blade",
      "brand": "mavena",
      "createdAt": "2026-02-19T08:44:00Z",
      "acknowledged": false,
      "actions": [
        { "label": "View Campaign", "href": "#/revenue/blade/campaign/summer-tof-01" },
        { "label": "Dismiss", "action": "dismiss" }
      ]
    }
  ],
  "history": []
}
```

---

## 6. Agent-Specific Views

When an agent is selected (clicked in sidebar or filtered), the dashboard transforms to show their personalized view. The URL updates to `#/agent/{id}`.

### 6.1 Scout 🔍 — SEO Lead

**Layout:** 2-column grid

| Left Column | Right Column |
|-------------|-------------|
| **KPI Row:** Indexed Pages, Avg Position, Organic Traffic, Keyword Count | Tasks (filtered) |
| **Rankings Table:** Keyword, Position, Change, Brand, URL | |
| **GSC Chart:** Clicks & Impressions (30d line chart) | |
| **Indexation Status:** Brand-by-brand indexed vs submitted | |
| **Internal Link Matrix:** Pages by link count, orphans highlighted red | |

**Data sources:** `metrics/seo.json`, `tasks.json` (filtered assignee=scout)

### 6.2 Sage ✍️ — Content

**Layout:** Content pipeline focus

| Widget | Description |
|--------|-------------|
| **Content Calendar** | Month view, colored by status (draft=orange, review=blue, published=green) |
| **Pipeline Kanban** | Mini kanban: Idea → Outline → Draft → Review → Published |
| **KPI Row** | Articles Published (MTD), Total Words, Avg Time-to-Publish, Top Performer |
| **Article List** | Table: Title, Brand, Status, Word Count, Publish Date, Organic Traffic |

### 6.3 Ghost 👻 — Off-Page

| Widget | Description |
|--------|-------------|
| **Posting Queue** | Table: Platform (Reddit/Medium/Quora), Title, Status, Scheduled Date, Brand |
| **Backlink Counter** | KPI tiles per brand + total |
| **Off-Page Calendar** | Week view showing scheduled posts across platforms |
| **Outreach Tracker** | Pipeline: Identified → Contacted → Responded → Published |

### 6.4 Atlas 🗺️ — Strategy

| Widget | Description |
|--------|-------------|
| **Cross-Brand Scoreboard** | 4-brand comparison: Revenue, Traffic, Conversion, Growth Rate |
| **Strategic Initiatives** | Gantt-style timeline of major initiatives |
| **Market Position Map** | Quadrant chart: Market size vs our share |
| **Goal Progress** | Circular progress: each brand toward $100K target |

### 6.5 Blade ⚔️ — Paid Media

| Widget | Description |
|--------|-------------|
| **Budget Pacing** | Horizontal progress bars: spent vs budget per brand (color-coded) |
| **ROAS Dashboard** | KPI tiles: ROAS, CPA, CTR, CPM per brand |
| **Campaign Table** | Name, Brand, Status, Spend, Revenue, ROAS, Learning Phase indicator |
| **Top/Bottom Performers** | Split view: best 5 and worst 5 ad sets |
| **Spend Chart** | Stacked area: daily spend by brand |

### 6.6 Forge 🔥 — Creative

| Widget | Description |
|--------|-------------|
| **Creative Pipeline** | Kanban: Briefed → Generated → QA → Approved → Live |
| **Generation Queue** | List of pending creative requests with brand/type |
| **Win/Fail Grid** | Thumbnail grid of creatives with green (winner) / red (loser) overlay |
| **Asset Library Stats** | Count by type (image, video, copy) per brand |
| **Pattern Board** | Winning creative attributes (hook type, color, format) |

### 6.7 Ember 📧 — Email/CRM

| Widget | Description |
|--------|-------------|
| **Flow Status Board** | All Klaviyo flows: name, status (live/draft/paused), 30d revenue |
| **KPI Row** | Open Rate, Click Rate, Revenue/Email, List Size, Growth Rate |
| **Campaign Calendar** | Upcoming sends with subject line preview |
| **Revenue Attribution** | Pie chart: flow revenue breakdown |
| **List Growth Chart** | Line chart: subscriber count over time per brand |

### 6.8 Vault 🏪 — Store Ops

| Widget | Description |
|--------|-------------|
| **Order Volume** | KPI tiles: Today's orders, pending fulfillment, shipped, delivered |
| **Inventory Alerts** | Table: Product, Brand, Stock Level, Reorder Point, Status (🔴🟡🟢) |
| **Fulfillment Pipeline** | Kanban: Pending → Processing → Shipped → Delivered |
| **Product Catalog Health** | Missing images, no description, SEO issues count |
| **Shipping Issues** | List of delays, returns, lost packages |

### 6.9 Shield 🛡️ — Support

| Widget | Description |
|--------|-------------|
| **Gorgias Queue** | Live ticket list: ID, Subject, Brand, Priority, Age, Assignee |
| **KPI Row** | Open Tickets, Avg Response Time, CSAT Score, Resolution Rate |
| **Top Issues** | Bar chart: most common ticket categories |
| **SLA Tracker** | % tickets responded within SLA target |
| **Sentiment Trend** | Line chart: CSAT over time |

### 6.10 Prism 📊 — Analytics

Prism gets the **full Performance tab** as their home view (see Section 8). Every metric, every chart, every brand comparison. This is the "god view."

### 6.11 Keeper 🔑 — Retention

| Widget | Description |
|--------|-------------|
| **Churn Dashboard** | KPI: Churn Rate, Active Subs, Churned (30d), Win-Back Rate |
| **LTV Chart** | Bar chart: LTV by brand, cohort analysis |
| **Subscription Metrics** | Active, Paused, Cancelled, New — per brand |
| **Repeat Purchase Rate** | Trend line per brand |
| **Win-Back Campaigns** | Table: Campaign, Sent, Converted, Revenue, Status |

### 6.12 Sentinel ✅ — QA

| Widget | Description |
|--------|-------------|
| **QA Queue** | List: Item, Type (creative/content/code), Brand, Submitted By, Priority |
| **Pass/Fail Board** | Kanban: Pending → In Review → Approved / Rejected |
| **Quality Scores** | KPI: Pass Rate (%), Avg Review Time, Items Reviewed (MTD) |
| **Recent Decisions** | Feed of last 20 QA decisions with rationale |

### 6.13 Pixel 💻 — Engineering

| Widget | Description |
|--------|-------------|
| **System Status** | Grid of services: Shopify API, Meta API, Google Ads, Klaviyo, GSC — each with uptime % and status dot |
| **Deployment Log** | Table: What, When, Status, Rollback available |
| **Error Log** | Scrollable list: timestamp, service, error, severity |
| **Script Health** | List of running scripts/automations with last heartbeat |
| **Uptime Chart** | 30-day uptime percentage per service |

### 6.14 Jarvis 🫡 — COO (Command Center)

Jarvis's view IS the **Command Center** — the default landing page. See next section for full spec.

---

## 7. Real-Time Features

### 7.1 Live Feed (Right Panel)

Always visible in the right panel (350px). Scrollable, newest-first.

**Filter Tabs:**
| Tab | Shows |
|-----|-------|
| All | Everything |
| Tasks | Task creates, updates, completions |
| Alerts | Critical/warning alerts only |
| Status | Agent online/offline/status changes |
| Docs | Document deliverables and updates |

**Agent Filter:** Horizontal scrollable row of agent avatar pills. Click to toggle. Multi-select supported.

**Brand Filter:** Inherits from global brand selector.

**Auto-scroll:** New items slide in from top with subtle animation. If user has scrolled down, show "↑ 3 new updates" pill at top.

**Entry Types & Icons:**
- `task_created` → 📋
- `task_complete` → ✅
- `task_assigned` → 👤
- `status_change` → 🔄
- `alert_critical` → 🔴
- `alert_warning` → 🟡
- `deliverable` → 📄
- `system` → ⚙️
- `standup` → 🌅

### 7.2 Status System

Agent statuses propagate from `agents.json` and display everywhere:

| Status | Dot | Meaning |
|--------|-----|---------|
| `working` | 🟢 | Actively executing a task |
| `idle` | ⚪ | Online but no active task |
| `paused` | 🟡 | Manually paused by operator |
| `error` | 🔴 | Task failed, needs attention |
| `offline` | ⚫ | No active session |

### 7.3 Alert System

Alerts cascade through three levels:

1. **Banner** — Critical alerts show as dismissable banner at top of main content
2. **Feed** — All alerts appear in live feed
3. **Badge** — Unacknowledged alert count shown as red badge on nav items

**Alert triggers (automated):**
- Ad spend exceeds daily budget by >15%
- Revenue drops >20% vs same day last week
- Support ticket SLA breach
- Inventory below reorder point
- API service down >5 min
- Agent error state >10 min

### 7.4 Refresh Strategy

| Data | Refresh Method | Interval |
|------|---------------|----------|
| Agent status | File watch / poll | 10s |
| Feed entries | File watch / poll | 5s |
| Alerts | File watch / poll | 5s |
| Revenue metrics | Cron pull + poll | 15 min |
| Task board | File watch / poll | 10s |
| Cron schedules | Poll | 60s |

---

## 8. Performance Tab

The analytics powerhouse. Prism's home, but accessible to all.

### 8.1 Top-Level KPIs (4-tile row)

| Tile | Metric | Comparison |
|------|--------|------------|
| Total Revenue | Sum across all brands (MTD) | vs last month pace |
| Total Orders | Sum across all brands (MTD) | vs last month |
| Blended ROAS | Total revenue / total ad spend | vs target (4.0x) |
| Avg AOV | Weighted average across brands | vs last month |

### 8.2 Revenue Section

- **Revenue Trend** — Multi-line chart (one line per brand + total), 30/60/90d toggle
- **Revenue by Brand** — Horizontal bar chart with goal markers at $100K
- **Daily Revenue Table** — Date, Brand, Revenue, Orders, AOV, Traffic, Conv Rate
- **Goal Progress** — 4 circular gauges, one per brand, showing % to $100K

### 8.3 Traffic & Conversion

- **Traffic Sources** — Stacked area: Organic, Paid, Email, Direct, Social — per brand
- **Conversion Funnel** — Sessions → Add to Cart → Checkout → Purchase (with drop-off %)
- **Conv Rate Trend** — Line chart per brand

### 8.4 Paid Media Performance

- **Spend vs Revenue** — Dual-axis chart: spend bars + revenue line
- **ROAS by Brand** — Bar chart
- **Platform Split** — Pie: Meta vs Google vs other
- **Campaign Leaderboard** — Top 10 by ROAS, sortable

### 8.5 Brand Comparison Matrix

A dense table showing all brands side by side:

| Metric | Plentum | Mavena | PawFully | RetroMedy | Total |
|--------|---------|--------|----------|-----------|-------|
| Revenue (MTD) | | | | | |
| Orders | | | | | |
| AOV | | | | | |
| Traffic | | | | | |
| Conv Rate | | | | | |
| Ad Spend | | | | | |
| ROAS | | | | | |
| Email Revenue | | | | | |
| Organic Traffic | | | | | |
| Support Tickets | | | | | |
| Churn Rate | | | | | |

### 8.6 Historical Context

Using our known data:
- **Plentum**: $43.9K over 8 months → ~$5.5K/mo avg → need 18x growth to $100K
- **Mavena**: $305K over 8 months → ~$38.1K/mo avg → need 2.6x growth to $100K
- **PawFully**: $29.8K over 8 months → ~$3.7K/mo avg → need 27x growth to $100K
- **RetroMedy**: Pre-launch → $0 baseline

Show trajectory lines extrapolating current growth rates and required growth rates.

---

## 9. Brand Selector

### Global Brand Context

The brand selector lives in the left sidebar under "BRANDS" and affects ALL views globally.

**Behavior:**
- Default: "All Brands" — aggregate data shown, charts show multi-line
- Click a brand: All views filter to that brand only. Brand pill appears in top bar: `[🟣 Plentum ✕]`
- URL updates: `#/tasks?brand=plentum`
- Every data query respects the active brand filter
- Brand color tints the top bar subtly (2px accent line under top bar in brand color)

**Multi-brand select:** Hold Cmd/Ctrl to select multiple brands for comparison views.

**Brand Switcher Shortcut:** `Cmd+1` through `Cmd+5` for quick brand switching. `Cmd+0` for all.

---

## 10. Standup & Morning Brief

### Morning Brief View

Accessible via Standups nav item. Defaults to today.

```
┌──────────────────────────────────────────────────────────────────┐
│ ☀️ Morning Brief — Wednesday, February 19, 2026                  │
│ Generated by Jarvis at 7:30 AM ET                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 📝 EXECUTIVE SUMMARY                                             │
│ ┌───────────────────────────────────────────────────────────────┐│
│ │ Good morning. Mavena had a strong overnight with $2,847 in   ││
│ │ revenue. One alert: Plentum's 'Joint-Health-TOF' campaign    ││
│ │ entered learning phase after creative swap...                 ││
│ └───────────────────────────────────────────────────────────────┘│
│                                                                   │
│ 📊 HIGHLIGHTS                                                    │
│ ✅ Mavena overnight revenue: $2,847 (+18% vs avg)               │
│ ⚠️ Plentum campaign 'Joint-Health-TOF' in learning phase        │
│ ℹ️ Scout completed Q1 keyword audit — 47 opportunities           │
│                                                                   │
│ 🌙 OVERNIGHT LOG                                                 │
│ 01:23  [📧 Ember]  Sent win-back flow to 342 Mavena subs       │
│ 03:15  [⚔️ Blade]  Auto-paused underperforming Plentum ad set  │
│ 05:00  [📊 Prism]  Daily data sync completed                    │
│                                                                   │
│ 🎯 TODAY'S PRIORITIES                                            │
│ 🔍 Scout → Internal linking sprint for Plentum (50 cross-links) │
│ 🔥 Forge → Generate 5 new Mavena UGC creatives                  │
│ 🔑 Keeper → Launch PawFully loyalty program v2                   │
│                                                                   │
│ 📋 AGENT STANDUPS                                                │
│ ┌─────────────────────────────────┐  ┌────────────────────────┐ │
│ │ 🔍 Scout                       │  │ ⚔️ Blade               │ │
│ │ Yesterday: Keyword audit done   │  │ Yesterday: Optimized   │ │
│ │ Today: Internal linking sprint  │  │ Today: New creatives   │ │
│ │ Blocked: Waiting on Sage       │  │ Blocked: None          │ │
│ └─────────────────────────────────┘  └────────────────────────┘ │
│  ... (grid of all 14 agents)                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Calendar navigation:** `< Feb 18 | Feb 19 | Feb 20 >` — browse historical briefs.

**Voice playback:** Optional TTS button to have Jarvis read the brief aloud.

---

## 11. Cron & Schedule View

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ⏰ Schedules & Automation                                        │
│                                                                   │
│ Filter: [All Agents ▾] [All Brands ▾] [Status: All ▾]          │
│                                                                   │
│ ┌─────────┬──────────────┬──────────┬──────────┬───────┬───────┐│
│ │ Agent   │ Job Name     │ Schedule │ Last Run │ Status│ Next  ││
│ ├─────────┼──────────────┼──────────┼──────────┼───────┼───────┤│
│ │ 📊 Prism│ Revenue Pull │ Daily 7AM│ 7:00 AM  │ ✅    │ Tmrw  ││
│ │ ⚔️ Blade│ Budget Check │ Every 4h │ 4:00 AM  │ ✅    │ 8:00AM││
│ │ 📧 Ember│ Flow Health  │ Daily 6AM│ 6:00 AM  │ ⚠️    │ Tmrw  ││
│ │ 🔍 Scout│ Rank Track   │ Weekly Mo│ Feb 17   │ ✅    │ Feb 24││
│ │ 🛡️Shield│ Ticket Sync  │ Every 1h │ 7:45 AM  │ ✅    │ 8:45AM││
│ │ 🫡Jarvis│ Morning Brief│ Daily 7:30│ 7:30 AM │ ✅    │ Tmrw  ││
│ └─────────┴──────────────┴──────────┴──────────┴───────┴───────┘│
│                                                                   │
│ 📊 Timeline View                                                 │
│ ┌───────────────────────────────────────────────────────────────┐│
│ │ 00  02  04  06  08  10  12  14  16  18  20  22  24          ││
│ │ ═══════════════════════════════════════════════════          ││
│ │ Prism    ·······▓·······························            ││
│ │ Blade    ···▓·······▓·······▓·······▓·······▓···            ││
│ │ Ember    ······▓····································        ││
│ │ Shield   ·▓···▓···▓···▓···▓···▓···▓···▓···▓···▓            ││
│ │ Jarvis   ·······▓·······························            ││
│ └───────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Table view (default) + timeline view (24h horizontal Gantt)
- Click any job to see run history, logs, duration trend
- Manual "Run Now" button per job
- Status indicators: ✅ Success, ⚠️ Warning (slow), 🔴 Failed, ⏳ Running

---

## 12. Implementation Roadmap

### Phase 1 — Foundation (Week 1)
- [ ] Set up `mission-control/dashboard/` with HTML/CSS/JS scaffold
- [ ] Implement design system CSS (all variables, components)
- [ ] Build layout shell: sidebar, top bar, main content, right panel
- [ ] Create all JSON data files with seed data
- [ ] Build agent roster and status display

### Phase 2 — Core Views (Week 2)
- [ ] Command Center (Jarvis landing page) with KPI tiles
- [ ] Task Board kanban with drag-and-drop
- [ ] Live Feed with filtering
- [ ] Agent filtering (click agent → filter all views)
- [ ] Brand selector with global filter

### Phase 3 — Performance & Analytics (Week 3)
- [ ] Performance tab with all chart types
- [ ] Revenue tracking with Shopify data integration
- [ ] Brand comparison matrix
- [ ] Goal progress gauges
- [ ] Historical trend lines

### Phase 4 — Agent Views & Automation (Week 4)
- [ ] All 14 agent-specific views
- [ ] Standup / Morning Brief view
- [ ] Cron schedule view with timeline
- [ ] Alert system with banners and badges
- [ ] Org chart visualization

### Phase 5 — Polish & Integration (Week 5)
- [ ] Real-time file watching for live updates
- [ ] Keyboard shortcuts (Cmd+1-5 brand switch, Cmd+/ toggle feed, Cmd+K command palette)
- [ ] Responsive tablet/mobile layouts
- [ ] Data refresh pipelines (agents write to JSON, dashboard reads)
- [ ] Command palette (Cmd+K): search agents, tasks, metrics, navigate anywhere

### Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | Vanilla HTML/CSS/JS or React | Served locally, no build complexity needed |
| **Charts** | Chart.js or Recharts | Lightweight, beautiful defaults |
| **Data** | JSON files on disk | Agents write, dashboard reads. No database needed |
| **Hosting** | Local `file://` or simple HTTP server | `python -m http.server 8080` |
| **Refresh** | Polling (5-15s) | Simple, reliable, no WebSocket complexity |

---

## Appendix A: Command Center Layout (Jarvis Default)

```
┌──────────────────────────────────────────────────────────────────┐
│  ROW 1: Alert Banners (if any)                                   │
├──────────────────────────────────────────────────────────────────┤
│  ROW 2: KPI Tiles (4 across)                                    │
│  [💰 Revenue MTD] [📦 Orders MTD] [📈 Blended ROAS] [🎯 Goal %]│
├──────────────────────────────────────────────────────────────────┤
│  ROW 3: Two columns                                              │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐│
│  │ 🤖 Agent Status Grid    │  │ 📊 Revenue Chart (7d)         ││
│  │ 14 agents in 2-col grid │  │ Multi-line by brand            ││
│  │ Avatar + name + status  │  │                                ││
│  └─────────────────────────┘  └────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│  ROW 4: Two columns                                              │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐│
│  │ 🎯 Today's Priorities   │  │ ⚡ Recent Completions          ││
│  │ Top tasks from brief    │  │ Last 5 completed tasks         ││
│  └─────────────────────────┘  └────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│  ROW 5: Brand Scorecards (4 across)                              │
│  [Plentum]  [Mavena]  [PawFully]  [RetroMedy]                  │
│  Rev/Orders/Conv Rate mini-stats per brand                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Appendix B: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette (search everything) |
| `Cmd+/` | Toggle right panel (Live Feed) |
| `Cmd+0` | All Brands |
| `Cmd+1` | Filter: Plentum |
| `Cmd+2` | Filter: Mavena |
| `Cmd+3` | Filter: PawFully |
| `Cmd+4` | Filter: RetroMedy |
| `Cmd+5` | Filter: Brand 5 |
| `Cmd+B` | Toggle left sidebar |
| `Cmd+T` | Jump to Task Board |
| `Cmd+P` | Jump to Performance |
| `Cmd+S` | Jump to Standups |

---

## Appendix C: Org Chart Structure

```
                          ┌──────────────┐
                          │  🫡 Jarvis   │
                          │     COO      │
                          └──────┬───────┘
               ┌─────────────┬───┴────┬──────────────┬──────────┐
        ┌──────┴──────┐ ┌───┴───┐ ┌──┴────┐  ┌──────┴───┐ ┌───┴────┐
        │ 🗺️ Atlas    │ │⚔️Blade│ │🏪Vault│  │ ✅Sentinel│ │💻Pixel │
        │ Growth Lead │ │Rev Ld │ │Ops Ld │  │ QA Lead   │ │Eng Lead│
        └──┬──────┬───┘ └─┬──┬──┘ └┬──┬─┬─┘  └──────────┘ └────────┘
     ┌─────┤      │    ┌──┘  │   ┌─┘  │ └──┐
  ┌──┴──┐┌─┴──┐┌──┴──┐│  ┌──┴┐┌─┴──┐┌┴───┐┌┴────┐
  │🔍   ││✍️   ││👻   ││  │🔥 ││🛡️  ││📊  ││🔑   │
  │Scout││Sage ││Ghost││  │Frg││Shld││Prsm││Kpr  │
  └─────┘└────┘└─────┘│  └───┘└────┘└────┘└─────┘
                       │
                    ┌──┴──┐
                    │📧   │
                    │Ember│
                    └─────┘
```

---

> **End of Specification**
> Atlas 🗺️ — "The map is not the territory, but a damn good map makes the territory conquerable."
