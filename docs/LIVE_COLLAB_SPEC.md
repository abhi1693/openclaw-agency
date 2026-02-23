# Live Collaboration View — Feature Spec

## Origin
Arpit directive (Feb 19, 2026): "I want to see live updates of all agents coming together, sharing information. Everything animated, flowing, happening at the same time. I can see them sending messages, communicating with other agents. And I should be able to send a group chat with everyone from right there."

## Feature: Mission Feed (Real-Time Agent Collaboration)

### What It Shows
When a task is running (like "Build Dashboard V4"), this view shows:
- **Every agent involved** with their avatar, name, status (thinking/writing/done)
- **Live message stream** — as each agent finishes, their output appears animated (typing effect or slide-in)
- **Agent-to-agent handoffs** — visual arrows/connections showing "Atlas's spec → Pixel's build"
- **Parallel execution bars** — horizontal timeline showing which agents are running simultaneously
- **Progress indicators** — each agent's subtask with live status (⏳ running, ✅ done, ❌ failed)

### Layout
```
┌─────────────────────────────────────────────────────────┐
│  🎯 ACTIVE MISSION: Build Dashboard V4                  │
│  Started: 3:42 AM  |  6/7 agents complete  |  ETA: 4m  │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  SQUAD       │  LIVE FEED                               │
│              │                                          │
│  🗺️ Atlas    │  03:42 🗺️ Atlas: Starting dashboard     │
│  ✅ done     │  architecture spec...                    │
│              │                                          │
│  📊 Prism    │  03:42 📊 Prism: Defining Performance    │
│  ✅ done     │  tab KPIs and data model...              │
│              │                                          │
│  ⚔️ Blade    │  03:42 ⚔️ Blade: Working on paid media  │
│  ✅ done     │  panel requirements...                   │
│              │                                          │
│  🏪 Vault    │  03:43 🏪 Vault+Shield: Operations      │
│  ✅ done     │  panel complete ✅ (57s)                  │
│              │                                          │
│  🔍 Scout    │  03:43 ⚔️ Blade: Paid media panel       │
│  ✅ done     │  complete ✅ (1m 13s)                     │
│              │                                          │
│  🔥 Forge    │  03:43 📊 Prism: Performance tab         │
│  ⏳ working  │  complete ✅ (1m 17s)                     │
│              │                                          │
│  📧 Ember    │  03:44 📧 Ember+Keeper: Spawned (slot   │
│  ✅ done     │  freed by Vault)                         │
│              │                                          │
│  💻 Pixel    │  03:46 🗺️ Atlas: Master architecture    │
│  ⏸️ queued   │  complete ✅ (4m 42s) — 44KB spec        │
│              │                                          │
│              │  03:48 🔥 Forge: Still working on        │
│              │  creative/QA panel...                     │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│  PARALLEL EXECUTION TIMELINE                            │
│                                                         │
│  Atlas   ████████████████████░░░░░░  4m42s              │
│  Prism   ████████░░░░░░░░░░░░░░░░░  1m17s              │
│  Blade   █████████░░░░░░░░░░░░░░░░  1m13s              │
│  Vault   ██████░░░░░░░░░░░░░░░░░░░  57s                │
│  Scout   █████████░░░░░░░░░░░░░░░░  1m22s              │
│  Forge   ████████████████████████▓▓  running...         │
│  Ember   ░░░░░░░████████░░░░░░░░░░  1m11s              │
│  Pixel   ░░░░░░░░░░░░░░░░░░░░░░░░░  queued             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  💬 BROADCAST TO SQUAD                                  │
│  ┌─────────────────────────────────────────────┐        │
│  │ Type a message to all agents...         Send │        │
│  └─────────────────────────────────────────────┘        │
│  [Message All] [Message Agent ▾] [Pause Mission] [Kill] │
└─────────────────────────────────────────────────────────┘
```

### Animations
- **New messages**: Slide in from bottom with fade, typing indicator before content appears
- **Agent status changes**: Smooth color transition (yellow→green on complete, yellow→red on fail)
- **Timeline bars**: Grow in real-time as agents work
- **Handoff arrows**: Animated dotted line from completing agent to next agent
- **Completion celebrations**: Subtle pulse/glow on agent avatar when done

### Broadcast / Group Chat
- **Message All**: Send a text message to all active agents in the current mission
- **Message Individual**: Dropdown to pick specific agent, opens 1:1 chat panel
- **Group Chat Mode**: Persistent chat panel where all agents AND Arpit can post
- **Agent responses appear in the live feed** with typing indicators

### Data Source
- Polls `sessions_list` + `subagents list` every 5 seconds during active missions
- Each agent's completion announcement feeds into the live feed
- Agent status mapped from OpenClaw session states (running → working, done → complete, error → failed)

### When No Mission Is Active
- Shows the regular Live Feed (recent activity, cron completions, alerts)
- "No active mission" state with last completed mission summary

### Historical Missions
- Past missions are saved and reviewable
- Can replay the timeline to see how agents collaborated
- Useful for optimizing agent allocation and identifying bottlenecks
