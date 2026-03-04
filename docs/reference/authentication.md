# Authentication

Mission Control supports two auth modes via `AUTH_MODE`:

- `local`: shared bearer token auth for self-hosted deployments
- `clerk`: Clerk JWT auth

## Local mode

Backend:

- `AUTH_MODE=local`
- `LOCAL_AUTH_TOKEN=<token>`

Frontend:

- `NEXT_PUBLIC_AUTH_MODE=local`
- Provide the token via the login UI.

## Clerk mode

Backend:

- `AUTH_MODE=clerk`
- `CLERK_SECRET_KEY=<secret>`

Frontend:

- `NEXT_PUBLIC_AUTH_MODE=clerk`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<key>`

## Agent authentication

Autonomous agents authenticate via an `X-Agent-Token` header (not the bearer token used by human users). See [API reference](api.md) for details.

Security notes:

- Agent auth is rate-limited to **20 requests per 60 seconds per IP**. Exceeding this returns `429 Too Many Requests`.
- On authentication failure, only a short prefix of the presented token is logged to aid debugging. Full tokens are never written to logs.
