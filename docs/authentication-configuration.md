# Authentication Configuration Guide

This guide explains how to configure authentication for Mission Control.

## Overview

Mission Control supports three authentication modes via the `AUTH_MODE` environment variable:

| Mode | Best For | External Dependencies |
|------|----------|----------------------|
| `clerk` (default) | Production, multi-user, SaaS | Requires Clerk account |
| `local_bearer` | Self-hosted, single-user, homelab | None |
| `disabled` | Local development only | None |

## Quick Reference

### Mode Selection Flowchart

```
Are you running production with multiple users?
├── YES → Use AUTH_MODE=clerk
└── NO
    Are you on a secure private network (Tailscale/WireGuard)?
    ├── YES → Use AUTH_MODE=local_bearer
    └── NO
        Is this localhost development only?
        ├── YES → Use AUTH_MODE=disabled
        └── NO → Use AUTH_MODE=local_bearer with strong token
```

## Mode: `clerk` (Default)

Full-featured authentication using [Clerk](https://clerk.com/).

### When to Use

- Production deployments
- Multiple users need access
- You want social login (Google, GitHub, etc.)
- Audit trails and user management required

### Configuration

**Backend** (`backend/.env`):
```bash
AUTH_MODE=clerk  # Optional, this is the default
CLERK_JWKS_URL=https://<your-domain>.clerk.accounts.dev/.well-known/jwks.json
```

**Frontend** (`frontend/.env.local`):
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Getting Clerk Credentials

1. Create account at [clerk.com](https://clerk.com)
2. Create a new application
3. Copy the Publishable Key (for frontend) and JWKS URL (for backend)

## Mode: `local_bearer`

Simple token-based authentication for self-hosted deployments.

### When to Use

- Single-user homelab deployments
- Network already secured (Tailscale, WireGuard, LAN)
- No internet connectivity required
- You control access at the network level

### Configuration

**Backend** (`backend/.env`):
```bash
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=your-random-secure-token-at-least-32-chars
```

**Frontend** (`frontend/.env.local`):
```bash
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=your-random-secure-token-at-least-32-chars
```

**Docker Compose** (`.env`):
```bash
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=your-random-secure-token-at-least-32-chars
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=your-random-secure-token-at-least-32-chars
```

### Generating a Secure Token

```bash
# Linux/macOS
openssl rand -hex 32

# Or use uuid
guuid  # (with util-linux) or uuidgen on macOS
```

### Security Considerations

1. **Token exposure**: The token is embedded in the frontend bundle. Only use this mode on trusted networks.
2. **No rotation mechanism**: Change the token by updating env vars and restarting services.
3. **Single user**: No concept of multiple users or permissions.
4. **Use HTTPS**: Even with a bearer token, always use HTTPS in production.

### Network-Level Security

Recommended additional protections:

- **Tailscale**: Only expose Mission Control on your tailnet
- **WireGuard**: VPN-only access
- **Reverse proxy**: Add basic auth at nginx/traefik layer as defense in depth

## Mode: `disabled`

No authentication. For development only.

### When to Use

- Local development on `localhost`
- CI/CD testing environments
- Never for production or any network-exposed deployment

### Configuration

**Backend** (`backend/.env`):
```bash
AUTH_MODE=disabled
```

**Frontend** (`frontend/.env.local`):
```bash
# No auth-related env vars needed
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY should be unset/blank
```

### Security Warning

When `AUTH_MODE=disabled`:
- Anyone with network access has full admin access
- No audit trail of actions
- Suitable only for `localhost` development

## Environment Variable Reference

### Backend Variables

| Variable | Modes | Description |
|----------|-------|-------------|
| `AUTH_MODE` | All | Authentication mode: `clerk`, `local_bearer`, or `disabled` |
| `CLERK_JWKS_URL` | `clerk` | Clerk JWKS endpoint URL |
| `LOCAL_AUTH_TOKEN` | `local_bearer` | Shared secret token |

### Frontend Variables

| Variable | Modes | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `clerk` | Clerk publishable key |
| `NEXT_PUBLIC_LOCAL_AUTH_TOKEN` | `local_bearer` | Shared secret token (must match backend) |

## Troubleshooting

### "Forbidden" errors with Clerk

1. Verify `CLERK_JWKS_URL` is set in backend
2. Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in frontend
3. Check that `AUTH_MODE` is not accidentally set to `local_bearer` or `disabled`

### "Forbidden" errors with local_bearer

1. Verify `AUTH_MODE=local_bearer` in backend
2. Verify `LOCAL_AUTH_TOKEN` matches between backend and frontend
3. Check browser dev tools - token should be in `Authorization` header
4. Ensure token is at least 32 characters

### UI stuck at "Sign In" with local_bearer

1. Verify `NEXT_PUBLIC_LOCAL_AUTH_TOKEN` is set in frontend env
2. Rebuild/restart frontend (Next.js reads env at build time)
3. Check that `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is NOT set (it takes precedence)

### Can't access any endpoints

Check backend logs for auth mode:
```
INFO: Auth mode: local_bearer
```

If you see:
```
INFO: Auth mode: clerk
```
But you configured `local_bearer`, the env var isn't being read.

## Migration Examples

### From "Secretless" Mode to `disabled`

Old configuration:
```bash
# frontend/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder
```

New configuration:
```bash
# backend/.env
AUTH_MODE=disabled

# frontend/.env.local
# (remove the placeholder key entirely)
```

### From Clerk to Local Self-Hosting

Old configuration:
```bash
# backend/.env
CLERK_JWKS_URL=https://example.clerk.accounts.dev/.well-known/jwks.json

# frontend/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
```

New configuration:
```bash
# backend/.env
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=$(openssl rand -hex 32)

# frontend/.env.local
# Remove Clerk key, add local token
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=<same-as-backend>
```

## FAQ

**Q: Can I use `local_bearer` with multiple users?**
A: Technically yes, but they all share the same token and have identical full-admin access. For true multi-user, use `clerk` mode.

**Q: Is `local_bearer` secure enough for internet exposure?**
A: Not recommended. Use only on trusted networks (Tailscale, VPN, LAN). For internet exposure, use `clerk` mode or add reverse proxy auth.

**Q: Can I mix auth modes?**
A: No. All services must use the same `AUTH_MODE`.

**Q: What's the performance impact?**
A: Negligible. `local_bearer` is actually faster than `clerk` (no JWT validation, no network calls).

**Q: Can I migrate from `disabled` to `local_bearer` later?**
A: Yes. Just update env vars and restart. Data is preserved.
