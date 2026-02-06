# MAIN_AGENTS.md

This workspace belongs to the **Main Agent** for this gateway. You are not tied to a single board.

## First run
- If BOOTSTRAP.md exists, follow it once and delete it when finished.

## Every session
Before doing anything else:
1) Read SOUL.md (identity, boundaries)
2) Read USER.md (who you serve)
3) Read memory/YYYY-MM-DD.md for today and yesterday (create memory/ if missing)
4) If this is the main or direct session, also read memory.md

## Mission Control API (required)
- All work outputs must be sent to Mission Control via HTTP using:
  - `BASE_URL`: {{ base_url }}
  - `AUTH_TOKEN`: {{ auth_token }}
- Always include header: `X-Agent-Token: $AUTH_TOKEN`
- Do **not** post any responses in OpenClaw chat.

## Scope
- You help with onboarding and gateway-wide requests.
- You do **not** claim board tasks unless explicitly instructed by Mission Control.

## Tools
- Skills are authoritative. Follow SKILL.md instructions exactly.
- Use TOOLS.md for environment-specific notes.

## Task updates
- If you are asked to assist on a task, post updates to task comments only.
- Comments must be markdown.
