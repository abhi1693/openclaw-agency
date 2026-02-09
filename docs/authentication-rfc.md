# RFC: Pluggable Authentication for Self-Hosted Mission Control

## Status
Proposed

## Context & Motivation

Mission Control currently requires [Clerk](https://clerk.com/) for authentication. While Clerk is excellent for SaaS deployments, it creates friction for self-hosted, single-user, or offline scenarios:

1. **External Dependency**: Requires internet connectivity to Clerk's servers
2. **Account Setup**: Users must create a Clerk account and configure publishable keys
3. **Privacy**: User metadata lives on Clerk's infrastructure
4. **Complexity Overkill**: A single-user homelab instance doesn't need full user management

Currently, workarounds exist (E2E bypass, patching `require_admin_auth` to `require_admin_or_agent`), but these are:
- Undocumented and fragile
- Require code changes on every update
- Mixed inconsistently throughout the codebase (some endpoints use `require_admin_auth`, others `require_admin_or_agent`)

## Goals

1. **Zero-regression for existing Clerk users**: Default behavior unchanged
2. **First-class self-hosting support**: Explicit, documented auth modes for non-Clerk deployments
3. **Consistent auth patterns**: Single source of truth for auth decisions
4. **Clean upstream contribution**: Not a "bypass" but a legitimate deployment option

## Non-Goals

- Replacing Clerk as the recommended production auth solution
- Implementing full user management (registration, password reset, etc.)
- Supporting multiple concurrent users in local auth mode

## Proposed Solution

Introduce an `AUTH_MODE` configuration with three options:

| Mode | Use Case | Security Level |
|------|----------|----------------|
| `clerk` (default) | Production, multi-user | High |
| `local_bearer` | Self-hosted, single-user | Medium (token-based) |
| `disabled` | Local development only | None |

### Auth Mode: `clerk` (Default)

Current behavior. Requires:
- `CLERK_JWKS_URL` or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Clerk account and configuration

### Auth Mode: `local_bearer`

Single-token authentication for self-hosted deployments.

Configuration:
```bash
# Backend
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=your-random-secure-token

# Frontend
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=your-random-secure-token
```

How it works:
1. Frontend sends `Authorization: Bearer <token>` with every request
2. Backend validates against `LOCAL_AUTH_TOKEN`
3. No user records, sessions, or JWT validation
4. Single global "admin" access level

Security considerations:
- Token is static (rotate by changing env var and restarting)
- Token appears in frontend bundle (acceptable for same-network deployments)
- No per-user permissions or audit trails
- Suitable for Tailscale/WireGuard-protected networks

### Auth Mode: `disabled`

No authentication. For local development only.

Configuration:
```bash
AUTH_MODE=disabled
```

Security considerations:
- Anyone with network access can control Mission Control
- Suitable for `localhost` development only
- Should display prominent warning in UI

## Architecture Changes

### Backend

Modify `app/api/deps.py` - centralize auth mode logic:

```python
# Current (problematic):
def require_admin_auth(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if auth.actor_type != "user" or auth.user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return auth

# Proposed:
def require_admin_auth(...) -> AuthContext:
    # AUTH_MODE=disabled: allow all
    # AUTH_MODE=local_bearer: validate bearer token
    # AUTH_MODE=clerk: existing Clerk validation
    ...
```

Key insight: All 69 call sites using `require_admin_auth` stay unchanged. The function itself becomes auth-mode aware.

### Frontend

Modify `src/auth/clerk.tsx` and `src/api/mutator.ts`:

1. Add `isLocalAuthEnabled()` detection
2. When local auth enabled:
   - Skip Clerk initialization
   - Always report "signed in" to components
   - Include token in API requests
3. User menu shows generic "Local User" instead of Clerk profile

## Migration Path

### For Existing Clerk Users
No action required. Default `AUTH_MODE=clerk` maintains current behavior.

### For Current "Secretless" Deployments
Replace:
```bash
# Old (undocumented, fragile)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder
```

With:
```bash
# New (explicit, documented)
AUTH_MODE=disabled  # or local_bearer for basic security
```

### For Docker Compose Self-Hosting
Update `.env.example` to show auth options:
```bash
# Auth mode: clerk (default), local_bearer, or disabled
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=changeme-in-production
```

## Alternatives Considered

### 1. Document the Current Patches
**Rejected**: Patching `require_admin_auth` to `require_admin_or_agent` is a hack that breaks user semantics (no user object exists). Not suitable for upstream.

### 2. Implement Full Local User Management
**Rejected**: Significant scope increase (registration, password hashing, sessions, password reset). Overkill for the self-hosting use case.

### 3. Support Multiple Auth Providers (OAuth2, SAML, etc.)
**Rejected**: Too complex. Clerk already handles enterprise auth well. Local auth targets the simple, single-user case.

### 4. HTTP Basic Auth at Reverse Proxy
**Considered**: Viable alternative, but loses API-level integration (UserMenu, audit trails if added later). Documented as alternative, not replacement.

## Security Analysis

| Threat | Clerk | Local Bearer | Disabled |
|--------|-------|--------------|----------|
| Token interception | HTTPS + short-lived JWT | HTTPS + static token | N/A |
| Brute force | Rate limited by Clerk | Implement rate limiting | N/A |
| Token leak damage | Limited by JWT expiry | Full access until rotated | Full access |
| Replay attacks | JWT `iat`/`exp` claims | None (use HTTPS) | N/A |
| User enumeration | Not applicable | Single user mode | Not applicable |

## Implementation Plan

See [authentication-implementation-plan.md](./authentication-implementation-plan.md) for detailed implementation steps.

## Future Extensions

Potential future work (not in scope):
- `AUTH_MODE=oidc` for generic OpenID Connect providers
- Per-board access tokens (agent-only access to specific boards)
- Token rotation API for `local_bearer` mode

## References

- [Configuration Guide](./authentication-configuration.md) - How to configure each auth mode
- [Implementation Plan](./authentication-implementation-plan.md) - Step-by-step implementation
