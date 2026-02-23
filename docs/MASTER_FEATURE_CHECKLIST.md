# Master Feature Checklist — Mission Control V5
# Every single feature discussed, nothing missed.

## CORE LAYOUT (from Bhanu's SiteGPT)
- [ ] 3-panel layout: Agent sidebar (left) + Content (center) + Live Feed (right)
- [ ] Top bar: "◇ MISSION CONTROL" logo, agent count, task count, status (ONLINE/PAUSED)
- [ ] Live clock showing Eastern Time
- [ ] Brand filter pills (All / Plentum / Mavena / PawFully / RetroMedy / Placementos)
- [ ] Date range selector (Today / Yesterday / 7D / 30D / Custom)
- [ ] Manual refresh button + auto-refresh countdown timer
- [ ] Privacy toggle (🔒 blurs all sensitive data)

## AGENT SIDEBAR (from SiteGPT screenshots)
- [ ] "All Agents" header with count + "14 ACTIVE" badge
- [ ] Each agent: emoji avatar, name, role badge (LEAD/SPC), status dot (●WORKING)
- [ ] Clicking agent filters ALL views to their data
- [ ] Agent emotion states: 🔥 crushing it, 😤 error, 😴 idle, 💤 overnight
- [ ] Hover: glow + expand to show quick stats (tasks, tokens, cost)

## PAGES/VIEWS

### 1. Command Center (Dashboard)
- [ ] 6 KPI cards: Revenue, Orders, Ad Spend, ROAS, AOV, Active Agents
- [ ] KPI numbers count up from 0 on load (animated)
- [ ] Sparkline mini-charts in each KPI card (7-day trend)
- [ ] $100K/month goal gauges per brand (SVG ring animation)
- [ ] Revenue trend chart (8 months historical from Shopify)
- [ ] Agent status grid
- [ ] Morning brief / overnight summary
- [ ] "Today so far" vs "Yesterday" context on all numbers

### 2. Task Board (Kanban)
- [ ] 5 columns: Inbox → Assigned → In Progress → Review → Done
- [ ] Filter pills with count badges
- [ ] Task cards: title, description, tags, assignee, timestamp
- [ ] Drag-and-drop with spring physics (@dnd-kit)
- [ ] Right-click context menu (move, assign, delete)
- [ ] Create new task inline

### 3. Performance
- [ ] Date picker with quick ranges
- [ ] KPI row with deltas and sparklines
- [ ] Revenue by brand area chart (gradient fills)
- [ ] Orders bar chart
- [ ] Brand comparison table (sortable, 11 columns)
- [ ] Campaign performance table (for Blade's view)
- [ ] Channel breakdown (organic vs paid vs email vs direct)
- [ ] Goal tracking progress bars toward $100K/month
- [ ] Charts draw themselves in on load

### 4. Paid Media
- [ ] Campaign health cards (color-coded green/yellow/red)
- [ ] Budget pacing gauges with time-of-day markers
- [ ] Top/bottom performer leaderboard
- [ ] Creative performance table (CTR, ROAS, spend per creative)
- [ ] Cross-platform view (Meta + Google side by side)
- [ ] Alert rules (learning stuck, CPA high, budget exhausted)
- [ ] Recommended actions (auto-generated)

### 5. Agents
- [ ] 14 agents organized by department (5 departments)
- [ ] Per-agent: status, model used, tokens today, cost today, sessions run
- [ ] Total AI spend summary card
- [ ] Click agent → see their recent tasks, messages, history

### 6. Comms Center (📡)
- [ ] Strategy Sessions — full meeting transcripts + auto-generated notes
- [ ] Manager Chat — threaded 1:1 conversations between department heads
- [ ] Agent Logs — individual run transcripts filterable by agent/date/status
- [ ] Full-text search across ALL communications
- [ ] Session notes: Key Decisions, Action Items, Next Review
- [ ] Pinnable sessions, tags
- [ ] Export as PDF

### 7. Org Flow (🔀)
- [ ] Jarvis hero card at top with orchestration stats
- [ ] Interactive org chart with all 14 agents by department
- [ ] Animated SVG data flow lines between agents
- [ ] Line labels: "keyword intel", "creative briefs", "analytics"
- [ ] Green = active, gray = dormant, red = blocked
- [ ] Click agent node → expand details
- [ ] Nodes float in staggered, lines draw themselves

### 8. Mission View (🎯)
- [ ] Active mission banner with task name, start time, agent count, ETA
- [ ] Squad panel: agents with live status (working/done/failed)
- [ ] Parallel execution timeline (horizontal bars growing real-time)
- [ ] Agent updates stream (summaries slide in as they complete)
- [ ] Controls: Pause, Kill, Broadcast to Squad
- [ ] Historical missions viewable/replayable

### 9. Files (📁)
- [ ] Tree view grouped by category (Reports, Strategy, Staging, Brand Docs, Specs)
- [ ] Each file: agent emoji, name, date, size
- [ ] Click to preview (render markdown as HTML)
- [ ] Download button per file
- [ ] Export as PDF button
- [ ] Search/filter by agent, date, file type

### 10. Schedules (Cron)
- [ ] Table of all cron jobs with timing, status, last run
- [ ] 24h timeline Gantt visualization
- [ ] Manual trigger button per job
- [ ] Run history per job

### 11. Settings
- [ ] User management (Phase 2 — placeholder for now)
- [ ] Theme toggle (light/dark)
- [ ] Timezone setting (default: Eastern)
- [ ] Notification preferences
- [ ] Keyboard shortcut reference

## LIVE FEED (Right Panel — always visible)
- [ ] Tabs: All / Tasks / Alerts / Status
- [ ] Agent filter chips (toggleable)
- [ ] Animated message bubbles sliding in
- [ ] Agent-to-agent comms with arrow notation (Atlas → Pixel)
- [ ] Color-coded: handoffs (blue), system (yellow), broadcasts (purple), owner (green)
- [ ] Typing indicator (three-dot bounce)
- [ ] Auto-scroll to newest
- [ ] Unread count badge

## GROUP CHAT / BROADCAST
- [ ] Chat input at bottom of live feed
- [ ] Dropdown: broadcast ALL or select specific agent
- [ ] Owner messages with 👤 badge
- [ ] Agent responses flow back into feed
- [ ] Enter key + Send button

## FROM JON TSAI'S COMMAND CENTER
- [ ] LLM Fuel Gauges (token usage, quota remaining)
- [ ] System Vitals (CPU, Memory, Disk)
- [ ] Cost Intelligence (per-agent spend tracking)
- [ ] Skeleton shimmer loading (never blank white)

## FROM MARCELO'S MUDDY OS
- [ ] Standup meetings / morning brief view
- [ ] Overnight log (what happened while sleeping)
- [ ] Model fleet display (which LLM each agent uses)

## POWER USER FEATURES
- [ ] Cmd+K command palette (search everything)
- [ ] Keyboard shortcuts (1-9 tabs, Cmd+B broadcast, N new task, R refresh, P privacy, ? help)
- [ ] Right-click context menus
- [ ] Dark mode toggle
- [ ] Glassmorphism on hero cards
- [ ] Animated gradient headers
- [ ] Toast notifications from top-right
- [ ] Confetti on milestones
- [ ] Sound effects toggle (subtle clicks, chimes)

## DESIGN SYSTEM (BankDash)
- [ ] Font: Inter
- [ ] Background: #F5F7FA
- [ ] Cards: white, 25px border-radius, soft shadow
- [ ] Sidebar: #1B1F3B (dark navy)
- [ ] Accent: #0891B2 (teal)
- [ ] Headings: #343C6A
- [ ] Secondary text: #718EBF
- [ ] Positive: #41D4A8, Negative: #FF4B4A
- [ ] Pills/buttons: 50px radius

## DATA & REAL-TIME
- [ ] WebSocket for live feed updates
- [ ] Auto-refresh every 5 minutes (Shopify + Meta API pulls)
- [ ] All times in Eastern Time
- [ ] 100% real data — never fake numbers
- [ ] "No data" / "Connecting..." when unavailable
- [ ] 8 months historical Shopify data loaded into PostgreSQL

## SECURITY
- [ ] Login screen (arpit@plentum.com / MissionControl2026!)
- [ ] Session management (JWT, 7-day remember me)
- [ ] 5-attempt lockout
- [ ] Phase 2: RBAC (Owner/Manager/Viewer) — Sunday Feb 23
- [ ] Audit trail for all actions
- [ ] API tokens never displayed in UI (masked)

## DEPLOYMENT
- [ ] Docker Compose: PostgreSQL + Redis + Backend + Frontend
- [ ] One command: docker compose up -d
- [ ] Cloudflare tunnel for internet access
- [ ] Health check endpoints
