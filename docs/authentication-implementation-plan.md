# Authentication Implementation Plan

This document provides step-by-step implementation instructions for adding pluggable authentication to Mission Control.

## Overview

- **Estimated effort**: 2-3 hours
- **Files modified**: 5 files
- **Lines changed**: ~150 lines
- **Breaking changes**: None (backwards compatible)

## Phase 1: Backend Changes

### Step 1.1: Add Configuration

**File**: `backend/app/core/config.py`

Add to the `Settings` class:

```python
from typing import Literal

class Settings(BaseSettings):
    # ... existing fields ...

    # Auth configuration
    auth_mode: Literal["clerk", "local_bearer", "disabled"] = "clerk"
    local_auth_token: str = ""
```

**Verification**:
```bash
cd backend
python -c "from app.core.config import settings; print(f'auth_mode: {settings.auth_mode}')"
```

### Step 1.2: Update Auth Context Function

**File**: `backend/app/core/auth.py`

Add local bearer validation to `get_auth_context()`:

```python
async def get_auth_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> AuthContext:
    # NEW: Local bearer token auth
    if settings.auth_mode == "local_bearer" and settings.local_auth_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if token == settings.local_auth_token:
                return AuthContext(actor_type="user", user=None)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    # NEW: Disabled auth (dev mode)
    if settings.auth_mode == "disabled":
        return AuthContext(actor_type="user", user=None)

    # EXISTING: Clerk auth (unchanged below this point)
    if settings.environment == "dev" and not settings.clerk_jwks_url:
        return AuthContext(actor_type="user", user=None)

    # ... rest of existing Clerk auth logic ...
```

Also update `get_auth_context_optional()` with the same pattern.

### Step 1.3: Update Admin Auth Dependency

**File**: `backend/app/api/deps.py`

Modify `require_admin_auth` to handle local/disabled modes:

```python
def require_admin_auth(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    # In local_bearer or disabled mode, auth context is valid without a user object
    if settings.auth_mode in ("local_bearer", "disabled"):
        return auth

    # Clerk mode requires actual user
    if auth.actor_type != "user" or auth.user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return auth
```

Add import at top:
```python
from app.core.config import settings
```

### Step 1.4: Test Backend Changes

Create a test script:

```bash
cd backend

# Test 1: Disabled mode
curl http://localhost:8000/api/v1/boards \
  -H "Authorization: Bearer test" | jq

# Should return 200 with boards (or empty array)

# Test 2: Local bearer mode
# Set AUTH_MODE=local_bearer LOCAL_AUTH_TOKEN=test123
curl http://localhost:8000/api/v1/boards \
  -H "Authorization: Bearer test123" | jq

# Should return 200

# Test 3: Wrong token should 401
curl -w "%{http_code}" http://localhost:8000/api/v1/boards \
  -H "Authorization: Bearer wrong" -o /dev/null -s

# Should return 401
```

## Phase 2: Frontend Changes

### Step 2.1: Update Auth Detection

**File**: `frontend/src/auth/clerk.tsx`

Add local auth detection:

```typescript
function isLocalAuthEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_LOCAL_AUTH_TOKEN;
}

// Update isClerkEnabled
export function isClerkEnabled(): boolean {
  if (isE2EAuthBypassEnabled()) return false;
  if (isLocalAuthEnabled()) return false;  // NEW
  return isLikelyValidClerkPublishableKey(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}
```

### Step 2.2: Update useAuth Hook

**File**: `frontend/src/auth/clerk.tsx`

Add local auth handling to `useAuth()`:

```typescript
export function useAuth() {
  // NEW: Local auth - always signed in
  if (isLocalAuthEnabled()) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: "local-user",
      sessionId: "local-session",
      getToken: async () => process.env.NEXT_PUBLIC_LOCAL_AUTH_TOKEN || "local",
    } as const;
  }

  // EXISTING: E2E bypass (unchanged)
  if (isE2EAuthBypassEnabled()) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: "e2e-user",
      sessionId: "e2e-session",
      getToken: async () => "e2e-token",
    } as const;
  }

  // EXISTING: No auth (unchanged)
  if (!isClerkEnabled()) {
    return {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
      getToken: async () => null,
    } as const;
  }

  return clerkUseAuth();
}
```

### Step 2.3: Update API Mutator

**File**: `frontend/src/api/mutator.ts`

Add local token to requests:

```typescript
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  // ... existing setup ...

  const headers = new Headers(options.headers);

  // NEW: Add local auth token if configured
  const localToken = process.env.NEXT_PUBLIC_LOCAL_AUTH_TOKEN;
  if (localToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${localToken}`);
  }

  // EXISTING: Clerk token (unchanged)
  if (!headers.has("Authorization")) {
    const token = await resolveClerkToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  // ... rest of function ...
};
```

### Step 2.4: Update UserMenu

**File**: `frontend/src/components/organisms/UserMenu.tsx`

Handle missing Clerk user:

```typescript
export function UserMenu({ className }: { className?: string }) {
  const { user } = useUser();
  const isLocalAuth = !!process.env.NEXT_PUBLIC_LOCAL_AUTH_TOKEN;

  // NEW: Show menu for local auth even without Clerk user
  if (!user && !isLocalAuth) return null;

  // NEW: Use generic display for local auth
  const displayName = isLocalAuth
    ? "Local User"
    : (user?.fullName ?? user?.firstName ?? user?.username ?? "Account");
  const avatarLabel = isLocalAuth
    ? "L"
    : (user?.firstName?.[0] ?? user?.username?.[0] ?? "U");
  const displayEmail = isLocalAuth
    ? "local@mission-control"
    : (user?.primaryEmailAddress?.emailAddress ?? "");
  const avatarUrl = isLocalAuth ? null : (user?.imageUrl ?? null);

  // ... rest of component ...

  // NEW: Hide SignOutButton for local auth (or make it a no-op)
  {!isLocalAuth && (
    <SignOutButton>
      <button>...</button>
    </SignOutButton>
  )}
};
```

### Step 2.5: Test Frontend

```bash
cd frontend

# Build with local auth
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=test123 npm run build

# Or dev mode
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=test123 npm run dev
```

Verify:
1. No redirect to Clerk sign-in
2. UserMenu shows "Local User"
3. API calls include `Authorization: Bearer test123` header
4. Boards load successfully

## Phase 3: Documentation & Examples

### Step 3.1: Update Example Envs

**File**: `backend/.env.example`

Add:
```bash
# Auth mode: clerk (default), local_bearer, or disabled
AUTH_MODE=clerk
LOCAL_AUTH_TOKEN=""
```

**File**: `frontend/.env.example`

Add:
```bash
# For local/self-hosted auth (alternative to Clerk)
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=""
```

**File**: `.env.example` (root)

Add:
```bash
# --- auth configuration ---
# Options: clerk (default), local_bearer, disabled
AUTH_MODE=clerk
LOCAL_AUTH_TOKEN=""
NEXT_PUBLIC_LOCAL_AUTH_TOKEN=""
```

### Step 3.2: Update README

Add section after the Clerk note:

```markdown
### Authentication

Mission Control supports multiple authentication modes:

- **Clerk** (default): Full-featured auth for production. Requires Clerk account.
- **Local Bearer**: Simple token auth for self-hosting. See [docs/authentication-configuration.md](./docs/authentication-configuration.md).
- **Disabled**: No auth for local development.

For Clerk, set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
For self-hosting, set `AUTH_MODE=local_bearer` and `LOCAL_AUTH_TOKEN`.
```

## Phase 4: Testing Matrix

Test all combinations:

| Auth Mode | Backend Config | Frontend Config | Expected Result |
|-----------|---------------|-----------------|-----------------|
| clerk | `CLERK_JWKS_URL` set | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set | Clerk sign-in, full features |
| clerk | `CLERK_JWKS_URL` set | No Clerk key | Frontend shows sign-in, backend validates |
| local_bearer | `LOCAL_AUTH_TOKEN` set | `NEXT_PUBLIC_LOCAL_AUTH_TOKEN` matched | Auto-signed-in, "Local User" shown |
| local_bearer | `LOCAL_AUTH_TOKEN` set | Wrong/no token | 401 errors |
| disabled | `AUTH_MODE=disabled` | No Clerk key | Auto-signed-in, no user display |
| disabled | `AUTH_MODE=disabled` | Clerk key set | Clerk disabled, auto-signed-in |

## Phase 5: Cleanup (Optional)

After merge, consider:

1. Remove the E2E bypass in favor of `AUTH_MODE=disabled`
2. Deprecate the dev bypass in `require_admin_or_agent`
3. Add rate limiting for `local_bearer` mode

## Rollback Plan

If issues arise:

1. Revert commits
2. Or set `AUTH_MODE=clerk` to restore original behavior
3. No data migration needed (auth doesn't affect data model)

## Success Criteria

- [ ] All existing Clerk deployments work unchanged
- [ ] `AUTH_MODE=local_bearer` works with single token
- [ ] `AUTH_MODE=disabled` works for development
- [ ] Frontend shows appropriate UI for each mode
- [ ] No patches needed for self-hosting
- [ ] Documentation is complete and tested
