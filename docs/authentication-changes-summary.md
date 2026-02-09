# Authentication Changes Summary

## Overview

This change adds pluggable authentication to Mission Control, enabling self-hosted deployments without requiring Clerk.

## Files Changed

### Backend

| File | Changes |
|------|---------|
| `backend/app/core/config.py` | Added `auth_mode` (Literal["clerk", "local_bearer", "disabled"]) and `local_auth_token` settings |
| `backend/app/core/auth.py` | Added `local_bearer` token validation and `disabled` mode bypass in `get_auth_context()` and `get_auth_context_optional()` |
| `backend/app/api/deps.py` | Updated `require_admin_auth()` and `require_admin_or_agent()` to handle local/disabled modes |
| `backend/.env.example` | Added documentation for `AUTH_MODE` and `LOCAL_AUTH_TOKEN` |

### Frontend

| File | Changes |
|------|---------|
| `frontend/src/auth/clerk.tsx` | Added `isLocalAuthEnabled()`, updated `isClerkEnabled()`, `SignedIn`, `SignedOut`, and `useAuth()` to handle local auth |
| `frontend/src/api/mutator.ts` | Added local auth token to request headers |
| `frontend/src/components/organisms/UserMenu.tsx` | Added local auth display ("Local User" with generic avatar) |
| `frontend/.env.example` | Added `NEXT_PUBLIC_LOCAL_AUTH_TOKEN` documentation |

### Infrastructure

| File | Changes |
|------|---------|
| `compose.yml` | Added `AUTH_MODE` and `LOCAL_AUTH_TOKEN` environment variables |
| `.env.example` | Added auth configuration section |
| `README.md` | Added authentication section documenting the three modes |

### Documentation (New)

| File | Purpose |
|------|---------|
| `docs/authentication-rfc.md` | Design rationale and architecture decisions |
| `docs/authentication-configuration.md` | User guide for configuring each auth mode |
| `docs/authentication-implementation-plan.md` | Developer implementation guide |
| `docs/authentication-changes-summary.md` | This file - summary of all changes |

## Test Results

### AUTH_MODE=disabled
- ✅ Boards endpoint works without auth
- ✅ Agents endpoint works without auth
- ✅ Task creation works without auth

### AUTH_MODE=local_bearer
- ✅ Valid token returns data
- ✅ Invalid token returns 401 Unauthorized
- ✅ Missing token returns 401 Unauthorized

### AUTH_MODE=clerk (Default)
- ✅ Unchanged behavior - requires Clerk JWT
- ✅ No regression for existing deployments

## Migration Guide

### For Existing Clerk Users
No action required. Default `AUTH_MODE=clerk` maintains current behavior.

### For Current "Secretless" Deployments
Replace:
```bash
NEXT_PUBLIC_E2E_AUTH_BYPASS=1
```

With:
```bash
AUTH_MODE=disabled  # or local_bearer for basic security
```

### For New Self-Hosted Deployments
Use `local_bearer` mode:
```bash
AUTH_MODE=local_bearer
LOCAL_AUTH_TOKEN=$(openssl rand -hex 32)
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=$LOCAL_AUTH_TOKEN
```

## Backwards Compatibility

- **100% backwards compatible** - default `AUTH_MODE=clerk` maintains existing behavior
- No database migrations required
- No API contract changes
- Existing environment variables still work

## Security Considerations

| Mode | Token Exposure | Brute Force | Use Case |
|------|---------------|-------------|----------|
| `clerk` | Short-lived JWT | Rate limited by Clerk | Production |
| `local_bearer` | Static in headers | None (use HTTPS) | Trusted networks |
| `disabled` | N/A | N/A | Localhost only |

## PR Checklist

- [x] All tests pass
- [x] Documentation updated
- [x] Example env files updated
- [x] README updated
- [x] No breaking changes
- [x] Backwards compatible default
- [x] Code follows existing patterns

## Related Issues

Addresses the need for:
- Running Mission Control without Clerk
- Self-hosted deployments on private networks
- Local development without external auth dependencies

## Future Work (Not in Scope)

- Per-board access tokens
- Token rotation API
- Multiple local users
- OIDC provider support
