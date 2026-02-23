# Mission Control — Authentication & Security Spec

## Origin
Arpit directive (Feb 19, 2026): "Proper authorization, proper security to log into this mission control. Only I can access it right now. Later we'll add team members with different user roles and permissions."

## Phase 1: Immediate Security (Build Now)

### Login Page
- Clean login screen matching BankDash design (centered card, logo, branded)
- Username + Password authentication
- "Remember me" checkbox (JWT stored in localStorage with 7-day expiry)
- Failed login: rate limit (5 attempts, then 5-min lockout)
- Session timeout: 24 hours of inactivity

### Auth Implementation (Single HTML — No Backend Needed)
Since the dashboard is a single HTML file served by a static file server:

**Option A: Cloudflare Access (RECOMMENDED for production)**
- Cloudflare Zero Trust Access policy on the tunnel URL
- Email-based OTP: only arpit@plentum.com allowed
- No code changes needed — Cloudflare handles auth before traffic reaches the server
- Free for up to 50 users
- Setup: `cloudflared access` + Cloudflare Zero Trust dashboard

**Option B: Built-in Auth (for the HTML file itself)**
- Login page as the first screen
- Password hashed with SHA-256, stored as a constant in the HTML
- On successful login, set a session token in localStorage
- Every page load checks for valid token before rendering dashboard
- Logout button in header clears token
- This is a UI gate, not bulletproof crypto — but combined with Cloudflare tunnel, it's solid

**RECOMMENDED: Use BOTH**
- Cloudflare Access = network-level security (nobody even sees the login page without Cloudflare auth)
- Built-in login = application-level security (defense in depth)

### Initial Users
```json
{
  "users": [
    {
      "id": "arpit",
      "name": "Arpit Sharma",
      "email": "arpit@plentum.com",
      "role": "owner",
      "permissions": ["*"]
    }
  ]
}
```

## Phase 2: Multi-User Access (Later)

### Role-Based Access Control (RBAC)
```
ROLES:
├── owner (Arpit)
│   ├── Full read/write access
│   ├── Agent management (start/stop/configure)
│   ├── Broadcast to all agents
│   ├── View all brands
│   ├── Edit settings
│   └── Manage users
│
├── manager (future team leads)
│   ├── Full read access
│   ├── Limited write (can assign tasks, add comments)
│   ├── Can message specific agents
│   ├── View assigned brands only
│   └── Cannot manage users or settings
│
└── viewer (team members)
    ├── Read-only access
    ├── View assigned brands only
    ├── Can add comments/notes
    └── Cannot message agents or modify anything
```

### Permission Matrix
| Feature | Owner | Manager | Viewer |
|---------|-------|---------|--------|
| View all brands | ✅ | Assigned only | Assigned only |
| View performance data | ✅ | ✅ | ✅ |
| View agent status | ✅ | ✅ | ✅ |
| Send agent messages | ✅ | ✅ | ❌ |
| Broadcast to all | ✅ | ❌ | ❌ |
| Start/stop agents | ✅ | ❌ | ❌ |
| Edit tasks | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ❌ |
| View API keys/tokens | ✅ | ❌ | ❌ |
| Manage cron jobs | ✅ | ❌ | ❌ |
| User management | ✅ | ❌ | ❌ |
| Export data | ✅ | ✅ | ❌ |
| View live feed | ✅ | ✅ | ✅ |
| View mission collab | ✅ | ✅ | ✅ |

### Team Members (Planned)
- 2 human team members with manager/viewer roles
- Brand-level isolation: can only see brands they're assigned to
- Audit log: every action logged with user, timestamp, what changed

## Phase 3: Advanced Security (Future)

### Audit Trail
- Every login, action, and state change logged
- Viewable in Settings → Security → Audit Log
- Exportable for compliance

### API Security
- All API tokens displayed as masked (`shpat_****1451`) unless owner clicks "reveal"
- Tokens never sent to client-side unless explicitly requested
- Rate limiting on all dashboard API endpoints

### Session Security
- JWT with short-lived access tokens (1hr) + refresh tokens (7d)
- Force logout on password change
- Active sessions view (see all logged-in devices)
- "Log out everywhere" button

## Cloudflare Zero Trust Setup Steps

1. Go to https://one.dash.cloudflare.com
2. Create a Zero Trust organization (free tier)
3. Access → Applications → Add Application
4. Self-hosted: set domain to mission control URL
5. Add policy: Allow → Emails → arpit@plentum.com
6. Authentication: One-time PIN (email OTP)
7. Done — now only Arpit can reach the dashboard

## Skills to Install (when rate limit clears)
- `security-auditor` — general security audit capability
- `security-audit-toolkit` — comprehensive security tools
- `cyber-security-engineer` — deep security implementation
- `agent-security-monitor` — monitor agent security
- `browser-auth` — browser authentication patterns
