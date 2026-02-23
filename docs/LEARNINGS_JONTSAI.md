# Learnings from Jon Tsai's OpenClaw Command Center
Source: https://www.jontsai.com/2026/02/12/building-mission-control-for-my-ai-workforce-introducing-openclaw-command-center

## Key Features We Should Adopt

### 1. LLM Fuel Gauges
- Visual gauges showing API quota usage (how much Opus/Sonnet budget remaining)
- Never get surprised by quota limits
- Shows cost per agent session

### 2. System Vitals
- CPU, memory, disk of the Mac Mini
- Is the machine the bottleneck?
- Simple but critical for 24/7 ops

### 3. Cost Intelligence
- Exact cost per agent, per session, per task
- Model routing cost comparison
- Total daily/weekly/monthly AI spend

### 4. Topic Tracking (Cerebro)
- Auto-detect topics from agent conversations
- Organize work by topic/project
- Jump directly into any conversation from dashboard
- Every thread becomes a trackable unit of work

### 5. Server-Sent Events (SSE) for Real-Time
- No polling, no websocket complexity
- State refreshes every 2 seconds
- Cached on backend to stay responsive

### 6. Privacy Controls
- Hide sensitive topics with one click
- Critical for demos and screenshots
- Don't accidentally expose API keys or internal project names

### 7. Advanced Job Scheduling Primitives
- `run-if-idle` — execute only when spare capacity
- `run-if-not-run-since` — guarantee freshness
- `run-at-least-X-times-per-period` — SLA enforcement
- `skip-if-last-run-within` — debouncing
- `conflict-avoidance` — prevent overlapping heavy jobs
- `priority-queue` — critical tasks preempt background

### 8. Quota-Aware Scheduling
- Knows weekly quota reset timing
- Tracks current usage %
- Batches low-priority work for off-peak
- Maximizes value from every token

### 9. LLM Routing
- Right model for the right job automatically
- Complex reasoning → Opus, Boilerplate → local models
- Router examines task complexity and picks model

### 10. Zero Dependencies
- ~200KB total, no build step
- No React/Vue/Angular — vanilla JS
- Single unified API endpoint
- AI agents can understand and modify it easily

## His Setup
- 5 master instances (one per life domain)
- 10 satellite agents
- 1 "Godfather" orchestrator
- 20+ scheduled tasks per instance
- Mac Studio M2 Ultra + Mac Minis + MacBook Pro

## His Open Source Tool
- `clawhub install jontsai/command-center`
- GitHub: github.com/jontsai/openclaw-command-center
- MIT licensed

## What We Should Implement
1. ✅ We already have: multi-agent orchestration, cron jobs, model routing
2. 🔲 ADD: LLM fuel gauges (quota/cost tracking)
3. 🔲 ADD: System vitals (CPU/memory/disk)
4. 🔲 ADD: Cost per agent/session tracking
5. 🔲 ADD: Privacy toggle for sensitive data
6. 🔲 ADD: Advanced scheduling primitives (run-if-idle, debouncing)
7. 🔲 CONSIDER: Install his command-center skill and integrate features
