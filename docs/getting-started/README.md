# Getting started

## What is Mission Control?

Mission Control is the web UI and HTTP API for operating OpenClaw.

It provides a control plane for boards, tasks, agents, approvals, and (optionally) gateway connections.

## Quickstart (Docker Compose)

From repo root:

```bash
cp .env.example .env

# REQUIRED when AUTH_MODE=local
# Set LOCAL_AUTH_TOKEN to a non-placeholder value with at least 50 characters.

docker compose -f compose.yml --env-file .env up -d --build
```

Open:
- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/healthz

## Next steps

- [Architecture](../architecture/README.md)
- [Authentication](../reference/authentication.md)
- [Development](../development/README.md)
- [Amazon and skills development guide](../development/amazon-and-skills.md)
- [API notes](../reference/api.md)
- [Deployment](../deployment/README.md)
