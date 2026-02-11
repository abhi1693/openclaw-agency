# Mission Control docs

This folder is the canonical documentation set for Mission Control.

## Start here (by role)

- **Contributor**: start with [Quickstart](../README.md#quick-start-self-host-with-docker-compose) → [Development](development.md) → [Contributing](contributing.md)
- **Maintainer**: start with [Architecture](05-architecture.md) → [Repo tour](04-repo-tour.md) → [API reference](07-api-reference.md)
- **Operator/SRE**: start with [Ops / runbooks](09-ops-runbooks.md) → [Troubleshooting](10-troubleshooting.md)

## Table of contents (IA)

- [Style guide](00-style-guide.md)


1. [Overview](01-overview.md)
2. [Quickstart](02-quickstart.md)
3. [Development](03-development.md)
4. [Repo tour](04-repo-tour.md)
5. [Architecture](05-architecture.md)
6. [Configuration](06-configuration.md)
7. [API reference](07-api-reference.md)
   - [Frontend API + auth modules](frontend-api-auth.md)
8. [Agents & skills](08-agents-and-skills.md)
9. [Ops / runbooks](09-ops-runbooks.md)
10. [Troubleshooting](10-troubleshooting.md)
11. [Contributing](11-contributing.md)

## IA guardrails (to prevent churn)

- **Single canonical nav**: this `docs/README.md`.
- **Stable spine**: keep `01-...` through `11-...` stable; avoid renumbering.
- **One primary owner page per subsystem**: link each subsystem from exactly one place in the TOC.

## Linking rules (mini-spec)

- Link to `docs/README.md` when you want someone to **browse the map**.
- Link to a leaf page when you want someone to **do a specific thing**.
- Prefer linking deep-dive folder `README.md` pages as stable entrypoints.
- Use relative links (and anchors when needed).

Examples:
- `[Docs](docs/README.md)`
- `[Development](03-development.md)`
- `[Production notes](production/README.md)`
- `[Auth model](07-api-reference.md#auth)`

Patterns:
- Use existing pages as patterns rather than copying templates:
  - Maintainer style: `05-architecture.md`, `07-api-reference.md`
  - Operator style: `09-ops-runbooks.md`, `10-troubleshooting.md`

## Existing deep-dive docs

These deeper references already exist under `docs/` directories:
- [Architecture deep dive](architecture/README.md)
- [Deployment guide](deployment/README.md)
- [Production notes](production/README.md)
- [Testing guide](testing/README.md)
- [Troubleshooting](troubleshooting/README.md)
- [Gateway WebSocket protocol](openclaw_gateway_ws.md)
- [Gateway base config](openclaw_gateway_base_config.md)
