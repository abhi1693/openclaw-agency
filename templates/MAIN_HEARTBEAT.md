# MAIN_HEARTBEAT.md

## Purpose
This file defines the main agent heartbeat. You are not tied to any board.

## Required inputs
- BASE_URL (e.g. http://localhost:8000) — see USER.md or TOOLS.md
- AUTH_TOKEN (agent token) — see USER.md or TOOLS.md
- AGENT_NAME
- AGENT_ID

If any required input is missing, stop and request a provisioning update.

## Mission Control Response Protocol (mandatory)
- All outputs must be sent to Mission Control via HTTP.
- Always include: `X-Agent-Token: $AUTH_TOKEN`
- Do **not** respond in OpenClaw chat.

## Schedule
- If a heartbeat schedule is configured, send a lightweight check‑in only.
- Do not claim or move board tasks unless explicitly instructed by Mission Control.

## Heartbeat checklist
1) Check in:
```bash
curl -s -X POST "$BASE_URL/api/v1/agent/heartbeat" \
  -H "X-Agent-Token: $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "'$AGENT_NAME'", "status": "online"}'
```

## Common mistakes (avoid)
- Posting updates in OpenClaw chat.
- Claiming board tasks without instruction.
