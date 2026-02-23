# Communications & Strategy Sessions History — Feature Spec

## Origin
Arpit directive (Feb 19, 2026): "I need to see how managers are talking to each other, strategy session notes, overall communication history, Jarvis talking to department heads. All of it on the dashboard."

## Feature: Comms Center (New Tab)

### Layout — 3 Sections
```
┌──────────────────────────────────────────────────────────────┐
│  📡 COMMS CENTER                                             │
│  [Strategy Sessions] [Manager Chat] [Agent Logs] [Search 🔍] │
├────────────────────┬─────────────────────────────────────────┤
│                    │                                         │
│  SESSION LIST      │  SESSION DETAIL / CHAT VIEW             │
│                    │                                         │
│  📌 Today          │  🏛️ Manager Summit — $100K Strategy     │
│  ┌──────────────┐  │  Feb 19, 2026 • 4:15 AM • 45 min       │
│  │🏛️ Manager    │  │  Participants: Jarvis, Atlas, Blade,   │
│  │Summit —      │  │  Vault, Sentinel                        │
│  │$100K Strategy│  │                                         │
│  │4:15 AM  45m  │  │  ┌─────────────────────────────────┐   │
│  └──────────────┘  │  │ 🫡 Jarvis: Team, our target is  │   │
│  ┌──────────────┐  │  │ $100K/month per brand. Atlas,    │   │
│  │⚔️ Blade →    │  │  │ what's the Growth plan?          │   │
│  │🔥 Forge      │  │  └─────────────────────────────────┘   │
│  │Creative Brief│  │  ┌─────────────────────────────────┐   │
│  │3:48 AM  12m  │  │  │ 🗺️ Atlas: For Plentum, we need │   │
│  └──────────────┘  │  │ 18x growth. Here's the breakdown│   │
│  ┌──────────────┐  │  │ — organic needs to go from 2K to│   │
│  │📊 Prism →    │  │  │ 15K monthly sessions...         │   │
│  │⚔️ Blade      │  │  └─────────────────────────────────┘   │
│  │Data Handoff  │  │  ┌─────────────────────────────────┐   │
│  │2:30 AM  5m   │  │  │ ⚔️ Blade: Revenue dept needs    │   │
│  └──────────────┘  │  │ $4,500/day Meta budget minimum.  │   │
│                    │  │ Current is $100. That's the      │   │
│  📌 Yesterday      │  │ bottleneck.                      │   │
│  ┌──────────────┐  │  └─────────────────────────────────┘   │
│  │🔍 Scout →    │  │                                        │
│  │✍️ Sage       │  │  📋 SESSION NOTES (auto-generated)     │
│  │Keyword Brief │  │  ┌─────────────────────────────────┐   │
│  │7:30 AM  8m   │  │  │ Key Decisions:                   │   │
│  └──────────────┘  │  │ • Plentum: 18x growth needed     │   │
│                    │  │ • Mavena: scale ads to $200/day   │   │
│  📌 This Week      │  │ • PawFully: rebuild from scratch  │   │
│  ...               │  │                                   │   │
│                    │  │ Action Items:                     │   │
│                    │  │ • Blade: raise Plentum budget     │   │
│                    │  │ • Scout: target 50 new keywords   │   │
│                    │  │ • Vault: fix fulfillment pipeline │   │
│                    │  │                                   │   │
│                    │  │ Next Review: Feb 20, 9 AM         │   │
│                    │  └─────────────────────────────────┘   │
├────────────────────┴─────────────────────────────────────────┤
│  [Export Notes] [Share with Team] [Schedule Follow-up]       │
└──────────────────────────────────────────────────────────────┘
```

### Sub-Tabs

#### 1. Strategy Sessions
Full meetings between multiple agents (summits, planning sessions, reviews):
- Session card: title, participants (emoji avatars), duration, date
- Click to expand: full conversation thread + auto-generated notes
- Auto-summary at bottom: Key Decisions, Action Items, Next Steps
- Tags: #strategy #weekly-review #emergency #planning
- Pinnable: important sessions stay at top

#### 2. Manager Chat  
1:1 and small group conversations between department heads:
- Jarvis ↔ Atlas (Growth strategy)
- Jarvis ↔ Blade (Revenue updates)
- Jarvis ↔ Vault (Operations status)
- Atlas ↔ Blade (Growth → Revenue handoffs)
- Blade ↔ Forge (Creative briefs)
- Vault ↔ Shield (Support escalations)
- Threaded view: each conversation as a thread with latest message preview

#### 3. Agent Logs
Individual agent run transcripts:
- Every cron run, every subagent spawn
- Filterable by agent, date, status (success/error)
- Click to see full transcript
- Useful for debugging and reviewing agent quality

#### 4. Search
Full-text search across ALL communications:
- Search by keyword, agent name, date range
- Results show snippet with highlighted match
- Jump directly to the message in context

### Data Model
```json
// comms-history.json
{
  "sessions": [
    {
      "id": "session-uuid",
      "type": "strategy|handoff|review|escalation|broadcast",
      "title": "Manager Summit — $100K Strategy",
      "participants": ["jarvis", "atlas", "blade", "vault", "sentinel"],
      "startTime": "2026-02-19T04:15:00Z",
      "endTime": "2026-02-19T05:00:00Z",
      "messages": [
        {
          "from": "jarvis",
          "content": "Team, our target is $100K/month per brand...",
          "timestamp": "2026-02-19T04:15:30Z"
        }
      ],
      "notes": {
        "decisions": ["Plentum needs 18x growth", "Raise Meta budget"],
        "actionItems": [
          {"agent": "blade", "task": "Raise Plentum budget to $500/day", "due": "2026-02-20"},
          {"agent": "scout", "task": "Target 50 new keywords", "due": "2026-02-21"}
        ],
        "nextReview": "2026-02-20T09:00:00Z"
      },
      "tags": ["strategy", "quarterly-planning"]
    }
  ]
}
```

### How Data Gets Populated
1. **Every subagent spawn** — Jarvis logs the task, agent, and result to comms-history.json
2. **Manager reviews** — When Atlas reviews Scout's work, the conversation is logged
3. **Strategy sessions** — Multi-agent spawns create a session with all participants
4. **Cross-agent handoffs** — When one agent passes data to another, logged as a handoff
5. **Auto-summarization** — Each session gets auto-generated notes (decisions + action items)

### Session Types & Icons
| Type | Icon | Description |
|------|------|-------------|
| Strategy | 🏛️ | Multi-manager planning sessions |
| Handoff | 🔄 | Agent-to-agent data/task transfer |
| Review | 📋 | Manager reviewing agent output |
| Escalation | 🚨 | Issue raised up the chain |
| Broadcast | 📢 | Owner message to all agents |
| Daily Standup | ☀️ | Morning agent status reports |
| Retrospective | 🔍 | What worked/didn't analysis |
