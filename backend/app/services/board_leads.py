from __future__ import annotations

from typing import Any

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.agent_tokens import generate_agent_token, hash_agent_token
from app.core.time import utcnow
from app.integrations.openclaw_gateway import GatewayConfig as GatewayClientConfig
from app.integrations.openclaw_gateway import OpenClawGatewayError, ensure_session, send_message
from app.models.agents import Agent
from app.models.boards import Board
from app.models.gateways import Gateway
from app.models.users import User
from app.services.agent_provisioning import DEFAULT_HEARTBEAT_CONFIG, provision_agent


def lead_session_key(board: Board) -> str:
    return f"agent:lead-{board.id}:main"


def lead_agent_name(_: Board) -> str:
    return "Lead Agent"


async def ensure_board_lead_agent(
    session: AsyncSession,
    *,
    board: Board,
    gateway: Gateway,
    config: GatewayClientConfig,
    user: User | None,
    agent_name: str | None = None,
    identity_profile: dict[str, str] | None = None,
    action: str = "provision",
) -> tuple[Agent, bool]:
    existing = (
        await session.exec(
            select(Agent)
            .where(Agent.board_id == board.id)
            .where(col(Agent.is_board_lead).is_(True))
        )
    ).first()
    if existing:
        desired_name = agent_name or lead_agent_name(board)
        changed = False
        if existing.name != desired_name:
            existing.name = desired_name
            changed = True
        desired_session_key = lead_session_key(board)
        if not existing.openclaw_session_id:
            existing.openclaw_session_id = desired_session_key
            changed = True
        if changed:
            existing.updated_at = utcnow()
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
        return existing, False

    merged_identity_profile: dict[str, Any] = {
        "role": "Board Lead",
        "communication_style": "direct, concise, practical",
        "emoji": ":gear:",
    }
    if identity_profile:
        merged_identity_profile.update(
            {key: value.strip() for key, value in identity_profile.items() if value.strip()}
        )

    agent = Agent(
        name=agent_name or lead_agent_name(board),
        status="provisioning",
        board_id=board.id,
        is_board_lead=True,
        heartbeat_config=DEFAULT_HEARTBEAT_CONFIG.copy(),
        identity_profile=merged_identity_profile,
        openclaw_session_id=lead_session_key(board),
        provision_requested_at=utcnow(),
        provision_action=action,
    )
    raw_token = generate_agent_token()
    agent.agent_token_hash = hash_agent_token(raw_token)
    session.add(agent)
    await session.commit()
    await session.refresh(agent)

    try:
        await provision_agent(agent, board, gateway, raw_token, user, action=action)
        if agent.openclaw_session_id:
            await ensure_session(agent.openclaw_session_id, config=config, label=agent.name)
            await send_message(
                (
                    f"Hello {agent.name}. Your workspace has been provisioned.\n\n"
                    "Start the agent, run BOOT.md, and if BOOTSTRAP.md exists run it once "
                    "then delete it. Begin heartbeats after startup."
                ),
                session_key=agent.openclaw_session_id,
                config=config,
                deliver=True,
            )
    except OpenClawGatewayError:
        # Best-effort provisioning. The board/agent rows should still exist.
        pass

    return agent, True
