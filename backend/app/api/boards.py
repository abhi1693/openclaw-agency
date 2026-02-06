from __future__ import annotations

import asyncio
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlmodel import Session, col, select

from app.api.deps import ActorContext, get_board_or_404, require_admin_auth, require_admin_or_agent
from app.core.auth import AuthContext
from app.db.session import get_session
from app.integrations.openclaw_gateway import GatewayConfig as GatewayClientConfig
from app.integrations.openclaw_gateway import (
    OpenClawGatewayError,
    delete_session,
    ensure_session,
    send_message,
)
from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.approvals import Approval
from app.models.board_memory import BoardMemory
from app.models.board_onboarding import BoardOnboardingSession
from app.models.boards import Board
from app.models.gateways import Gateway
from app.models.task_fingerprints import TaskFingerprint
from app.models.tasks import Task
from app.schemas.boards import BoardCreate, BoardRead, BoardUpdate

router = APIRouter(prefix="/boards", tags=["boards"])

AGENT_SESSION_PREFIX = "agent"


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or uuid4().hex


def _build_session_key(agent_name: str) -> str:
    return f"{AGENT_SESSION_PREFIX}:{_slugify(agent_name)}:main"


def _board_gateway(
    session: Session, board: Board
) -> tuple[Gateway | None, GatewayClientConfig | None]:
    if not board.gateway_id:
        return None, None
    config = session.get(Gateway, board.gateway_id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Board gateway_id is invalid",
        )
    if not config.main_session_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Gateway main_session_key is required",
        )
    if not config.url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Gateway url is required",
        )
    if not config.workspace_root:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Gateway workspace_root is required",
        )
    return config, GatewayClientConfig(url=config.url, token=config.token)


async def _cleanup_agent_on_gateway(
    agent: Agent,
    config: Gateway,
    client_config: GatewayClientConfig,
) -> None:
    if agent.openclaw_session_id:
        await delete_session(agent.openclaw_session_id, config=client_config)
    main_session = config.main_session_key
    workspace_root = config.workspace_root
    workspace_path = f"{workspace_root.rstrip('/')}/workspace-{_slugify(agent.name)}"
    cleanup_message = (
        "Cleanup request for deleted agent.\n\n"
        f"Agent name: {agent.name}\n"
        f"Agent id: {agent.id}\n"
        f"Session key: {agent.openclaw_session_id or _build_session_key(agent.name)}\n"
        f"Workspace path: {workspace_path}\n\n"
        "Actions:\n"
        "1) Remove the workspace directory.\n"
        "2) Delete any lingering session artifacts.\n"
        "Reply NO_REPLY."
    )
    await ensure_session(main_session, config=client_config, label="Main Agent")
    await send_message(
        cleanup_message,
        session_key=main_session,
        config=client_config,
        deliver=False,
    )


@router.get("", response_model=list[BoardRead])
def list_boards(
    session: Session = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> list[Board]:
    return list(session.exec(select(Board)))


@router.post("", response_model=BoardRead)
def create_board(
    payload: BoardCreate,
    session: Session = Depends(get_session),
    auth: AuthContext = Depends(require_admin_auth),
) -> Board:
    data = payload.model_dump()
    if not data.get("gateway_id"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="gateway_id is required",
        )
    config = session.get(Gateway, data["gateway_id"])
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="gateway_id is invalid",
        )
    board = Board.model_validate(data)
    session.add(board)
    session.commit()
    session.refresh(board)
    return board


@router.get("/{board_id}", response_model=BoardRead)
def get_board(
    board: Board = Depends(get_board_or_404),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> Board:
    return board


@router.patch("/{board_id}", response_model=BoardRead)
def update_board(
    payload: BoardUpdate,
    session: Session = Depends(get_session),
    board: Board = Depends(get_board_or_404),
    auth: AuthContext = Depends(require_admin_auth),
) -> Board:
    updates = payload.model_dump(exclude_unset=True)
    if "gateway_id" in updates:
        if not updates.get("gateway_id"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="gateway_id is required",
            )
        config = session.get(Gateway, updates["gateway_id"])
        if config is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="gateway_id is invalid",
            )
    for key, value in updates.items():
        setattr(board, key, value)
    if updates.get("board_type") == "goal":
        objective = updates.get("objective") or board.objective
        metrics = updates.get("success_metrics") or board.success_metrics
        if not objective or not metrics:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Goal boards require objective and success_metrics",
            )
    if not board.gateway_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="gateway_id is required",
        )
    session.add(board)
    session.commit()
    session.refresh(board)
    return board


@router.delete("/{board_id}")
def delete_board(
    session: Session = Depends(get_session),
    board: Board = Depends(get_board_or_404),
    auth: AuthContext = Depends(require_admin_auth),
) -> dict[str, bool]:
    agents = list(session.exec(select(Agent).where(Agent.board_id == board.id)))
    task_ids = list(session.exec(select(Task.id).where(Task.board_id == board.id)))

    config, client_config = _board_gateway(session, board)
    if config and client_config:
        try:
            for agent in agents:
                asyncio.run(_cleanup_agent_on_gateway(agent, config, client_config))
        except OpenClawGatewayError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gateway cleanup failed: {exc}",
            ) from exc

    if task_ids:
        session.execute(delete(ActivityEvent).where(col(ActivityEvent.task_id).in_(task_ids)))
        session.execute(delete(TaskFingerprint).where(col(TaskFingerprint.board_id) == board.id))
    if agents:
        agent_ids = [agent.id for agent in agents]
        session.execute(delete(ActivityEvent).where(col(ActivityEvent.agent_id).in_(agent_ids)))
        session.execute(delete(Agent).where(col(Agent.id).in_(agent_ids)))
    session.execute(delete(Approval).where(col(Approval.board_id) == board.id))
    session.execute(delete(BoardMemory).where(col(BoardMemory.board_id) == board.id))
    session.execute(
        delete(BoardOnboardingSession).where(col(BoardOnboardingSession.board_id) == board.id)
    )
    session.execute(delete(Task).where(col(Task.board_id) == board.id))
    session.delete(board)
    session.commit()
    return {"ok": True}
