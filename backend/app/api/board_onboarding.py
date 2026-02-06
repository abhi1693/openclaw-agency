from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import ActorContext, get_board_or_404, require_admin_auth, require_admin_or_agent
from app.core.agent_tokens import generate_agent_token, hash_agent_token
from app.core.auth import AuthContext
from app.core.config import settings
from app.db.session import get_session
from app.integrations.openclaw_gateway import GatewayConfig as GatewayClientConfig
from app.integrations.openclaw_gateway import OpenClawGatewayError, ensure_session, send_message
from app.models.agents import Agent
from app.models.board_onboarding import BoardOnboardingSession
from app.models.boards import Board
from app.models.gateways import Gateway
from app.schemas.board_onboarding import (
    BoardOnboardingAnswer,
    BoardOnboardingConfirm,
    BoardOnboardingRead,
    BoardOnboardingStart,
)
from app.schemas.boards import BoardRead
from app.services.agent_provisioning import DEFAULT_HEARTBEAT_CONFIG, provision_agent

router = APIRouter(prefix="/boards/{board_id}/onboarding", tags=["board-onboarding"])
logger = logging.getLogger(__name__)


def _gateway_config(session: Session, board: Board) -> tuple[Gateway, GatewayClientConfig]:
    if not board.gateway_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    gateway = session.get(Gateway, board.gateway_id)
    if gateway is None or not gateway.url or not gateway.main_session_key:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    return gateway, GatewayClientConfig(url=gateway.url, token=gateway.token)


def _build_session_key(agent_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", agent_name.lower()).strip("-")
    return f"agent:{slug or uuid4().hex}:main"


def _lead_agent_name(board: Board) -> str:
    return "Lead Agent"


def _lead_session_key(board: Board) -> str:
    return f"agent:lead-{board.id}:main"


async def _ensure_lead_agent(
    session: Session,
    board: Board,
    gateway: Gateway,
    config: GatewayClientConfig,
    auth: AuthContext,
) -> Agent:
    existing = session.exec(
        select(Agent).where(Agent.board_id == board.id).where(Agent.is_board_lead.is_(True))
    ).first()
    if existing:
        if existing.name != _lead_agent_name(board):
            existing.name = _lead_agent_name(board)
            session.add(existing)
            session.commit()
            session.refresh(existing)
        return existing

    agent = Agent(
        name=_lead_agent_name(board),
        status="provisioning",
        board_id=board.id,
        is_board_lead=True,
        heartbeat_config=DEFAULT_HEARTBEAT_CONFIG.copy(),
        identity_profile={
            "role": "Board Lead",
            "communication_style": "direct, concise, practical",
            "emoji": ":gear:",
        },
    )
    raw_token = generate_agent_token()
    agent.agent_token_hash = hash_agent_token(raw_token)
    agent.provision_requested_at = datetime.utcnow()
    agent.provision_action = "provision"
    agent.openclaw_session_id = _lead_session_key(board)
    session.add(agent)
    session.commit()
    session.refresh(agent)

    try:
        await provision_agent(agent, board, gateway, raw_token, auth.user, action="provision")
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
        # Best-effort provisioning. Board confirmation should still succeed.
        pass
    return agent


@router.get("", response_model=BoardOnboardingRead)
def get_onboarding(
    board: Board = Depends(get_board_or_404),
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> BoardOnboardingSession:
    onboarding = session.exec(
        select(BoardOnboardingSession)
        .where(BoardOnboardingSession.board_id == board.id)
        .order_by(BoardOnboardingSession.created_at.desc())
    ).first()
    if onboarding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return onboarding


@router.post("/start", response_model=BoardOnboardingRead)
async def start_onboarding(
    payload: BoardOnboardingStart,
    board: Board = Depends(get_board_or_404),
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> BoardOnboardingSession:
    onboarding = session.exec(
        select(BoardOnboardingSession)
        .where(BoardOnboardingSession.board_id == board.id)
        .where(BoardOnboardingSession.status == "active")
    ).first()
    if onboarding:
        return onboarding

    gateway, config = _gateway_config(session, board)
    session_key = gateway.main_session_key
    base_url = settings.base_url or "http://localhost:8000"
    prompt = (
        "BOARD ONBOARDING REQUEST\n\n"
        f"Board Name: {board.name}\n"
        "You are the main agent. Ask the user 3-6 focused questions to clarify their goal.\n"
        "Do NOT respond in OpenClaw chat.\n"
        "All onboarding responses MUST be sent to Mission Control via API.\n"
        f"Mission Control base URL: {base_url}\n"
        "Use the AUTH_TOKEN from USER.md or TOOLS.md and pass it as X-Agent-Token.\n"
        "Onboarding response endpoint:\n"
        f"POST {base_url}/api/v1/agent/boards/{board.id}/onboarding\n"
        "QUESTION example (send JSON body exactly as shown):\n"
        f'curl -s -X POST "{base_url}/api/v1/agent/boards/{board.id}/onboarding" '
        '-H "X-Agent-Token: $AUTH_TOKEN" '
        '-H "Content-Type: application/json" '
        '-d \'{"question":"...","options":[{"id":"1","label":"..."},{"id":"2","label":"..."}]}\'\n'
        "COMPLETION example (send JSON body exactly as shown):\n"
        f'curl -s -X POST "{base_url}/api/v1/agent/boards/{board.id}/onboarding" '
        '-H "X-Agent-Token: $AUTH_TOKEN" '
        '-H "Content-Type: application/json" '
        '-d \'{"status":"complete","board_type":"goal","objective":"...","success_metrics":{...},"target_date":"YYYY-MM-DD"}\'\n'
        "QUESTION FORMAT (one question per response, no arrays, no markdown, no extra text):\n"
        '{"question":"...","options":[{"id":"1","label":"..."},{"id":"2","label":"..."}]}\n'
        "Do NOT wrap questions in a list. Do NOT add commentary.\n"
        "When you have enough info, return JSON ONLY (via API):\n"
        '{"status":"complete","board_type":"goal"|"general","objective":"...",'
        '"success_metrics":{...},"target_date":"YYYY-MM-DD"}.'
    )

    try:
        await ensure_session(session_key, config=config, label="Main Agent")
        await send_message(prompt, session_key=session_key, config=config, deliver=False)
    except OpenClawGatewayError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    onboarding = BoardOnboardingSession(
        board_id=board.id,
        session_key=session_key,
        status="active",
        messages=[{"role": "user", "content": prompt, "timestamp": datetime.utcnow().isoformat()}],
    )
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)
    return onboarding


@router.post("/answer", response_model=BoardOnboardingRead)
async def answer_onboarding(
    payload: BoardOnboardingAnswer,
    board: Board = Depends(get_board_or_404),
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> BoardOnboardingSession:
    onboarding = session.exec(
        select(BoardOnboardingSession)
        .where(BoardOnboardingSession.board_id == board.id)
        .order_by(BoardOnboardingSession.created_at.desc())
    ).first()
    if onboarding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    _, config = _gateway_config(session, board)
    answer_text = payload.answer
    if payload.other_text:
        answer_text = f"{payload.answer}: {payload.other_text}"

    messages = list(onboarding.messages or [])
    messages.append(
        {"role": "user", "content": answer_text, "timestamp": datetime.utcnow().isoformat()}
    )

    try:
        await ensure_session(onboarding.session_key, config=config, label="Main Agent")
        await send_message(
            answer_text, session_key=onboarding.session_key, config=config, deliver=False
        )
    except OpenClawGatewayError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    onboarding.messages = messages
    onboarding.updated_at = datetime.utcnow()
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)
    return onboarding


@router.post("/agent", response_model=BoardOnboardingRead)
def agent_onboarding_update(
    payload: dict[str, object],
    board: Board = Depends(get_board_or_404),
    session: Session = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> BoardOnboardingSession:
    if actor.actor_type != "agent" or actor.agent is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    agent = actor.agent
    if agent.board_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    if board.gateway_id:
        gateway = session.get(Gateway, board.gateway_id)
        if gateway and gateway.main_session_key and agent.openclaw_session_id:
            if agent.openclaw_session_id != gateway.main_session_key:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)

    onboarding = session.exec(
        select(BoardOnboardingSession)
        .where(BoardOnboardingSession.board_id == board.id)
        .order_by(BoardOnboardingSession.created_at.desc())
    ).first()
    if onboarding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if onboarding.status == "confirmed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT)

    messages = list(onboarding.messages or [])
    now = datetime.utcnow().isoformat()
    payload_text = json.dumps(payload)
    logger.info(
        "onboarding.agent.update board_id=%s agent_id=%s payload=%s",
        board.id,
        agent.id,
        payload_text,
    )
    payload_status = payload.get("status")
    if payload_status == "complete":
        onboarding.draft_goal = payload
        onboarding.status = "completed"
        messages.append({"role": "assistant", "content": payload_text, "timestamp": now})
    else:
        question = payload.get("question")
        options = payload.get("options")
        if not isinstance(question, str) or not isinstance(options, list):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        messages.append({"role": "assistant", "content": payload_text, "timestamp": now})

    onboarding.messages = messages
    onboarding.updated_at = datetime.utcnow()
    session.add(onboarding)
    session.commit()
    session.refresh(onboarding)
    logger.info(
        "onboarding.agent.update stored board_id=%s messages_count=%s status=%s",
        board.id,
        len(onboarding.messages or []),
        onboarding.status,
    )
    return onboarding


@router.post("/confirm", response_model=BoardRead)
async def confirm_onboarding(
    payload: BoardOnboardingConfirm,
    board: Board = Depends(get_board_or_404),
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> Board:
    onboarding = session.exec(
        select(BoardOnboardingSession)
        .where(BoardOnboardingSession.board_id == board.id)
        .order_by(BoardOnboardingSession.created_at.desc())
    ).first()
    if onboarding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    board.board_type = payload.board_type
    board.objective = payload.objective
    board.success_metrics = payload.success_metrics
    board.target_date = payload.target_date
    board.goal_confirmed = True
    board.goal_source = "lead_agent_onboarding"

    onboarding.status = "confirmed"
    onboarding.updated_at = datetime.utcnow()

    gateway, config = _gateway_config(session, board)
    session.add(board)
    session.add(onboarding)
    session.commit()
    session.refresh(board)
    await _ensure_lead_agent(session, board, gateway, config, auth)
    return board
