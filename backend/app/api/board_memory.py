from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session, col, select
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool

from app.api.deps import ActorContext, get_board_or_404, require_admin_or_agent
from app.core.config import settings
from app.db.session import engine, get_session
from app.integrations.openclaw_gateway import GatewayConfig as GatewayClientConfig
from app.integrations.openclaw_gateway import OpenClawGatewayError, ensure_session, send_message
from app.models.agents import Agent
from app.models.board_memory import BoardMemory
from app.models.gateways import Gateway
from app.schemas.board_memory import BoardMemoryCreate, BoardMemoryRead

router = APIRouter(prefix="/boards/{board_id}/memory", tags=["board-memory"])

MENTION_PATTERN = re.compile(r"@([A-Za-z][\w-]{0,31})")


def _parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _serialize_memory(memory: BoardMemory) -> dict[str, object]:
    return BoardMemoryRead.model_validate(memory, from_attributes=True).model_dump(mode="json")


def _extract_mentions(message: str) -> set[str]:
    return {match.group(1).lower() for match in MENTION_PATTERN.finditer(message)}


def _matches_mention(agent: Agent, mentions: set[str]) -> bool:
    if not mentions:
        return False
    name = (agent.name or "").strip()
    if not name:
        return False
    normalized = name.lower()
    if normalized in mentions:
        return True
    first = normalized.split()[0]
    return first in mentions


def _gateway_config(session: Session, board) -> GatewayClientConfig | None:
    if not board.gateway_id:
        return None
    gateway = session.get(Gateway, board.gateway_id)
    if gateway is None or not gateway.url:
        return None
    return GatewayClientConfig(url=gateway.url, token=gateway.token)


async def _send_agent_message(
    *,
    session_key: str,
    config: GatewayClientConfig,
    agent_name: str,
    message: str,
) -> None:
    await ensure_session(session_key, config=config, label=agent_name)
    await send_message(message, session_key=session_key, config=config, deliver=False)


def _fetch_memory_events(
    board_id,
    since: datetime,
) -> list[BoardMemory]:
    with Session(engine) as session:
        statement = (
            select(BoardMemory)
            .where(col(BoardMemory.board_id) == board_id)
            .where(col(BoardMemory.created_at) >= since)
            .order_by(col(BoardMemory.created_at))
        )
        return list(session.exec(statement))


def _notify_chat_targets(
    *,
    session: Session,
    board,
    memory: BoardMemory,
    actor: ActorContext,
) -> None:
    if not memory.content:
        return
    config = _gateway_config(session, board)
    if config is None:
        return
    mentions = _extract_mentions(memory.content)
    statement = select(Agent).where(col(Agent.board_id) == board.id)
    targets: dict[str, Agent] = {}
    for agent in session.exec(statement):
        if agent.is_board_lead:
            targets[str(agent.id)] = agent
            continue
        if mentions and _matches_mention(agent, mentions):
            targets[str(agent.id)] = agent
    if actor.actor_type == "agent" and actor.agent:
        targets.pop(str(actor.agent.id), None)
    if not targets:
        return
    actor_name = "User"
    if actor.actor_type == "agent" and actor.agent:
        actor_name = actor.agent.name
    elif actor.user:
        actor_name = actor.user.preferred_name or actor.user.name or actor_name
    snippet = memory.content.strip()
    if len(snippet) > 800:
        snippet = f"{snippet[:797]}..."
    base_url = settings.base_url or "http://localhost:8000"
    for agent in targets.values():
        if not agent.openclaw_session_id:
            continue
        mentioned = _matches_mention(agent, mentions)
        header = "BOARD CHAT MENTION" if mentioned else "BOARD CHAT"
        message = (
            f"{header}\n"
            f"Board: {board.name}\n"
            f"From: {actor_name}\n\n"
            f"{snippet}\n\n"
            "Reply via board chat:\n"
            f"POST {base_url}/api/v1/agent/boards/{board.id}/memory\n"
            'Body: {"content":"...","tags":["chat"]}'
        )
        try:
            asyncio.run(
                _send_agent_message(
                    session_key=agent.openclaw_session_id,
                    config=config,
                    agent_name=agent.name,
                    message=message,
                )
            )
        except OpenClawGatewayError:
            continue


@router.get("", response_model=list[BoardMemoryRead])
def list_board_memory(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    board=Depends(get_board_or_404),
    session: Session = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> list[BoardMemory]:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    statement = (
        select(BoardMemory)
        .where(col(BoardMemory.board_id) == board.id)
        .order_by(col(BoardMemory.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    return list(session.exec(statement))


@router.get("/stream")
async def stream_board_memory(
    request: Request,
    board=Depends(get_board_or_404),
    actor: ActorContext = Depends(require_admin_or_agent),
    since: str | None = Query(default=None),
) -> EventSourceResponse:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    since_dt = _parse_since(since) or datetime.utcnow()
    last_seen = since_dt

    async def event_generator():
        nonlocal last_seen
        while True:
            if await request.is_disconnected():
                break
            memories = await run_in_threadpool(_fetch_memory_events, board.id, last_seen)
            for memory in memories:
                if memory.created_at > last_seen:
                    last_seen = memory.created_at
                payload = {"memory": _serialize_memory(memory)}
                yield {"event": "memory", "data": json.dumps(payload)}
            await asyncio.sleep(2)

    return EventSourceResponse(event_generator(), ping=15)


@router.post("", response_model=BoardMemoryRead)
def create_board_memory(
    payload: BoardMemoryCreate,
    board=Depends(get_board_or_404),
    session: Session = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> BoardMemory:
    if actor.actor_type == "agent" and actor.agent:
        if actor.agent.board_id and actor.agent.board_id != board.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    is_chat = payload.tags is not None and "chat" in payload.tags
    source = payload.source
    if is_chat and not source:
        if actor.actor_type == "agent" and actor.agent:
            source = actor.agent.name
        elif actor.user:
            source = actor.user.preferred_name or actor.user.name or "User"
    memory = BoardMemory(
        board_id=board.id,
        content=payload.content,
        tags=payload.tags,
        source=source,
    )
    session.add(memory)
    session.commit()
    session.refresh(memory)
    if is_chat:
        _notify_chat_targets(session=session, board=board, memory=memory, actor=actor)
    return memory
