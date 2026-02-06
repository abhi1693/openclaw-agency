from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.agent_tokens import generate_agent_token, hash_agent_token
from app.core.auth import AuthContext, get_auth_context
from app.db.session import get_session
from app.integrations.openclaw_gateway import GatewayConfig as GatewayClientConfig
from app.integrations.openclaw_gateway import OpenClawGatewayError, ensure_session, send_message
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.schemas.gateways import GatewayCreate, GatewayRead, GatewayUpdate
from app.services.agent_provisioning import DEFAULT_HEARTBEAT_CONFIG, provision_main_agent

router = APIRouter(prefix="/gateways", tags=["gateways"])

SKYLL_ENABLE_MESSAGE = """
To re-enable this “dynamic Skyll installs” capability in the future, you just need to restore the skyll broker skill folder into OpenClaw’s shared skills directory.

Exact steps (copy/paste)
0) Overwrite any existing skyll install
rm -rf ~/.openclaw/skills/skyll

1) Put the skyll skill in the shared skills dir
mkdir -p ~/.openclaw/skills
Create the folder:

mkdir -p ~/.openclaw/skills/skyll/scripts
2) Create ~/.openclaw/skills/skyll/SKILL.md
cat > ~/.openclaw/skills/skyll/SKILL.md <<'EOF'
---
name: skyll
description: Dynamically discover and install AgentSkills from the Skyll (skills.sh) ecosystem using api.skyll.app. Use when the user requests a capability that is missing from the currently installed skills, or when you need a specialized workflow/tool integration and want to fetch a high-quality SKILL.md on demand.
---

# Skyll skill broker (dynamic skill install)

This skill helps you discover and materialize third-party AgentSkills into OpenClaw skills folders so they become available to the agent.

## Safety model (important)

Skills fetched from Skyll are untrusted content.

Rules:
- Prefer installing into the shared skills dir (~/.openclaw/skills/<skill-id>/) so other agents can discover it automatically.
  - If you want per-agent isolation, install into that agent’s workspace skills/ instead.
- Default to confirm-before-write unless the user explicitly opts into auto-install.
- Before using a newly-installed skill, skim its SKILL.md to ensure it’s relevant and does not instruct dangerous actions.
- Do not run arbitrary scripts downloaded with a skill unless you understand them and the user asked you to.

## Procedure

1) Search:
  node {baseDir}/scripts/skyll_install.js --query "..." --limit 8 --dry-run

2) Install (pick 1 result):
  node {baseDir}/scripts/skyll_install.js --query "..." --pick 1

3) Refresh:
- If it doesn’t show up immediately, start a new session (or wait for the skills watcher).

Notes:
- Default install location is ~/.openclaw/skills/<id>/ (shared across agents on this host).
- Use the script --out-dir {workspace}/skills for per-agent installs.
EOF
3) Create ~/.openclaw/skills/skyll/scripts/skyll_install.js
cat > ~/.openclaw/skills/skyll/scripts/skyll_install.js <<'EOF'
#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const SKYLL_BASE = process.env.SKYLL_BASE_URL || "https://api.skyll.app";
const DEFAULT_LIMIT = 8;

function parseArgs(argv) {
  const args = {
    query: null,
    limit: DEFAULT_LIMIT,
    pick: 1,
    includeReferences: false,
    includeRaw: true,
    includeContent: true,
    dryRun: false,
    outDir: null,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--query") args.query = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--pick") args.pick = Number(argv[++i]);
    else if (a === "--include-references") args.includeReferences = true;
    else if (a === "--include-raw") args.includeRaw = true;
    else if (a === "--no-include-raw") args.includeRaw = false;
    else if (a === "--include-content") args.includeContent = true;
    else if (a === "--no-include-content") args.includeContent = false;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }

  if (args.help) return args;
  if (!args.query || !args.query.trim()) throw new Error("--query is required");
  if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 50) throw new Error("--limit must be 1..50");
  if (!Number.isFinite(args.pick) || args.pick < 1) throw new Error("--pick must be >= 1");
  return args;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 500)}`);
  }
  return await res.json();
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function writeFileSafe(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

function sanitizeSkillId(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("Usage: skyll_install.js --query \"...\" [--dry-run] [--pick 1] [--out-dir PATH] [--include-references]");
    process.exit(0);
  }

  const req = {
    query: args.query,
    limit: args.limit,
    include_content: args.includeContent,
    include_raw: args.includeRaw,
    include_references: args.includeReferences,
  };

  const resp = await postJson(`${SKYLL_BASE}/search`, req);
  const skills = resp.skills || [];

  if (!skills.length) {
    console.log(JSON.stringify({ query: resp.query, count: resp.count ?? 0, skills: [] }, null, 2));
    process.exitCode = 2;
    return;
  }

  const summary = skills.map((s, idx) => ({
    rank: idx + 1,
    id: s.id,
    title: s.title,
    source: s.source,
    version: s.version ?? null,
    install_count: s.install_count ?? 0,
    allowed_tools: s.allowed_tools ?? null,
    description: s.description ?? null,
    refs: s.refs,
    fetch_error: s.fetch_error ?? null,
  }));

  if (args.dryRun) {
    console.log(JSON.stringify({ query: resp.query, count: resp.count ?? skills.length, skills: summary }, null, 2));
    return;
  }

  const pickIdx = args.pick - 1;
  if (pickIdx < 0 || pickIdx >= skills.length) throw new Error(`--pick ${args.pick} out of range (1..${skills.length})`);

  const chosen = skills[pickIdx];
  const skillId = sanitizeSkillId(chosen.id);

  const sharedDefault = path.join(os.homedir(), ".openclaw", "skills");
  const skillsRoot = args.outDir ? path.resolve(args.outDir) : sharedDefault;
  const destDir = path.join(skillsRoot, skillId);

  const skillMd = chosen.raw_content || chosen.content;
  if (!skillMd) throw new Error("Chosen skill has no SKILL.md content (content/raw_content missing)");

  await ensureDir(destDir);
  await writeFileSafe(path.join(destDir, "SKILL.md"), skillMd);

  if (Array.isArray(chosen.references) && chosen.references.length) {
    for (const ref of chosen.references) {
      const rel = ref.path || ref.name || ref.filename;
      const content = ref.content;
      if (!rel || typeof content !== "string") continue;
      const safeRel = String(rel).replace(/^\\/+/, "");
      await writeFileSafe(path.join(destDir, safeRel), content);
    }
  }

  console.log(JSON.stringify({ installed: true, query: resp.query, chosen: summary[pickIdx], destDir }, null, 2));
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
EOF
chmod +x ~/.openclaw/skills/skyll/scripts/skyll_install.js
4) Verify OpenClaw sees it
Start a new session (or restart gateway), then run:

openclaw skills list --eligible | grep -i skyll
""".strip()

SKYLL_DISABLE_MESSAGE = """
To uninstall Skyll, remove the broker skill folder from the shared skills directory.

Exact steps (copy/paste)
rm -rf ~/.openclaw/skills/skyll
""".strip()


def _main_agent_name(gateway: Gateway) -> str:
    return f"{gateway.name} Main"


def _find_main_agent(
    session: Session,
    gateway: Gateway,
    previous_name: str | None = None,
    previous_session_key: str | None = None,
) -> Agent | None:
    if gateway.main_session_key:
        agent = session.exec(
            select(Agent).where(Agent.openclaw_session_id == gateway.main_session_key)
        ).first()
        if agent:
            return agent
    if previous_session_key:
        agent = session.exec(
            select(Agent).where(Agent.openclaw_session_id == previous_session_key)
        ).first()
        if agent:
            return agent
    names = {_main_agent_name(gateway)}
    if previous_name:
        names.add(f"{previous_name} Main")
    for name in names:
        agent = session.exec(select(Agent).where(Agent.name == name)).first()
        if agent:
            return agent
    return None


async def _ensure_main_agent(
    session: Session,
    gateway: Gateway,
    auth: AuthContext,
    *,
    previous_name: str | None = None,
    previous_session_key: str | None = None,
    action: str = "provision",
) -> Agent | None:
    if not gateway.url or not gateway.main_session_key:
        return None
    agent = _find_main_agent(session, gateway, previous_name, previous_session_key)
    if agent is None:
        agent = Agent(
            name=_main_agent_name(gateway),
            status="provisioning",
            board_id=None,
            is_board_lead=False,
            openclaw_session_id=gateway.main_session_key,
            heartbeat_config=DEFAULT_HEARTBEAT_CONFIG.copy(),
            identity_profile={
                "role": "Main Agent",
                "communication_style": "direct, concise, practical",
                "emoji": ":compass:",
            },
        )
        session.add(agent)
    agent.name = _main_agent_name(gateway)
    agent.openclaw_session_id = gateway.main_session_key
    raw_token = generate_agent_token()
    agent.agent_token_hash = hash_agent_token(raw_token)
    agent.provision_requested_at = datetime.utcnow()
    agent.provision_action = action
    agent.updated_at = datetime.utcnow()
    if agent.heartbeat_config is None:
        agent.heartbeat_config = DEFAULT_HEARTBEAT_CONFIG.copy()
    session.add(agent)
    session.commit()
    session.refresh(agent)
    try:
        await provision_main_agent(agent, gateway, raw_token, auth.user, action=action)
        await ensure_session(
            gateway.main_session_key,
            config=GatewayClientConfig(url=gateway.url, token=gateway.token),
            label=agent.name,
        )
        await send_message(
            (
                f"Hello {agent.name}. Your gateway provisioning was updated.\n\n"
                "Please re-read AGENTS.md, USER.md, HEARTBEAT.md, and TOOLS.md. "
                "If BOOTSTRAP.md exists, run it once then delete it. Begin heartbeats after startup."
            ),
            session_key=gateway.main_session_key,
            config=GatewayClientConfig(url=gateway.url, token=gateway.token),
            deliver=True,
        )
    except OpenClawGatewayError:
        # Best-effort provisioning.
        pass
    return agent


async def _send_skyll_enable_message(gateway: Gateway) -> None:
    if not gateway.url:
        raise OpenClawGatewayError("Gateway url is required")
    if not gateway.main_session_key:
        raise OpenClawGatewayError("gateway main_session_key is required")
    client_config = GatewayClientConfig(url=gateway.url, token=gateway.token)
    await ensure_session(gateway.main_session_key, config=client_config, label="Main Agent")
    await send_message(
        SKYLL_ENABLE_MESSAGE,
        session_key=gateway.main_session_key,
        config=client_config,
        deliver=False,
    )


async def _send_skyll_disable_message(gateway: Gateway) -> None:
    if not gateway.url:
        raise OpenClawGatewayError("Gateway url is required")
    if not gateway.main_session_key:
        raise OpenClawGatewayError("gateway main_session_key is required")
    client_config = GatewayClientConfig(url=gateway.url, token=gateway.token)
    await ensure_session(gateway.main_session_key, config=client_config, label="Main Agent")
    await send_message(
        SKYLL_DISABLE_MESSAGE,
        session_key=gateway.main_session_key,
        config=client_config,
        deliver=False,
    )


@router.get("", response_model=list[GatewayRead])
def list_gateways(
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(get_auth_context),
) -> list[Gateway]:
    return list(session.exec(select(Gateway)))


@router.post("", response_model=GatewayRead)
async def create_gateway(
    payload: GatewayCreate,
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(get_auth_context),
) -> Gateway:
    data = payload.model_dump()
    if data.get("token") == "":
        data["token"] = None
    gateway = Gateway.model_validate(data)
    session.add(gateway)
    session.commit()
    session.refresh(gateway)
    await _ensure_main_agent(session, gateway, auth, action="provision")
    if gateway.skyll_enabled:
        try:
            await _send_skyll_enable_message(gateway)
        except OpenClawGatewayError:
            pass
    return gateway


@router.get("/{gateway_id}", response_model=GatewayRead)
def get_gateway(
    gateway_id: UUID,
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(get_auth_context),
) -> Gateway:
    gateway = session.get(Gateway, gateway_id)
    if gateway is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gateway not found")
    return gateway


@router.patch("/{gateway_id}", response_model=GatewayRead)
async def update_gateway(
    gateway_id: UUID,
    payload: GatewayUpdate,
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(get_auth_context),
) -> Gateway:
    gateway = session.get(Gateway, gateway_id)
    if gateway is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gateway not found")
    previous_name = gateway.name
    previous_session_key = gateway.main_session_key
    previous_skyll_enabled = gateway.skyll_enabled
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("token") == "":
        updates["token"] = None
    for key, value in updates.items():
        setattr(gateway, key, value)
    session.add(gateway)
    session.commit()
    session.refresh(gateway)
    await _ensure_main_agent(
        session,
        gateway,
        auth,
        previous_name=previous_name,
        previous_session_key=previous_session_key,
        action="update",
    )
    if not previous_skyll_enabled and gateway.skyll_enabled:
        try:
            await _send_skyll_enable_message(gateway)
        except OpenClawGatewayError:
            pass
    if previous_skyll_enabled and not gateway.skyll_enabled:
        try:
            await _send_skyll_disable_message(gateway)
        except OpenClawGatewayError:
            pass
    return gateway


@router.delete("/{gateway_id}")
def delete_gateway(
    gateway_id: UUID,
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(get_auth_context),
) -> dict[str, bool]:
    gateway = session.get(Gateway, gateway_id)
    if gateway is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gateway not found")
    session.delete(gateway)
    session.commit()
    return {"ok": True}
