from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, Header, HTTPException, Request, status
from sqlmodel import Session, col, select

from app.core.agent_tokens import verify_agent_token
from app.db.session import get_session
from app.models.agents import Agent

logger = logging.getLogger(__name__)


@dataclass
class AgentAuthContext:
    actor_type: Literal["agent"]
    agent: Agent


def _find_agent_for_token(session: Session, token: str) -> Agent | None:
    agents = list(session.exec(select(Agent).where(col(Agent.agent_token_hash).is_not(None))))
    for agent in agents:
        if agent.agent_token_hash and verify_agent_token(token, agent.agent_token_hash):
            return agent
    return None


def _resolve_agent_token(
    agent_token: str | None,
    authorization: str | None,
    *,
    accept_authorization: bool = True,
) -> str | None:
    if agent_token:
        return agent_token
    if not accept_authorization:
        return None
    if not authorization:
        return None
    value = authorization.strip()
    if not value:
        return None
    if value.lower().startswith("bearer "):
        return value.split(" ", 1)[1].strip() or None
    return None


def get_agent_auth_context(
    request: Request,
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    session: Session = Depends(get_session),
) -> AgentAuthContext:
    resolved = _resolve_agent_token(agent_token, authorization, accept_authorization=True)
    if not resolved:
        logger.warning(
            "agent auth missing token path=%s x_agent=%s authorization=%s",
            request.url.path,
            bool(agent_token),
            bool(authorization),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    agent = _find_agent_for_token(session, resolved)
    if agent is None:
        logger.warning(
            "agent auth invalid token path=%s token_prefix=%s",
            request.url.path,
            resolved[:6],
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return AgentAuthContext(actor_type="agent", agent=agent)


def get_agent_auth_context_optional(
    request: Request,
    agent_token: str | None = Header(default=None, alias="X-Agent-Token"),
    authorization: str | None = Header(default=None, alias="Authorization"),
    session: Session = Depends(get_session),
) -> AgentAuthContext | None:
    resolved = _resolve_agent_token(
        agent_token,
        authorization,
        accept_authorization=False,
    )
    if not resolved:
        if agent_token:
            logger.warning(
                "agent auth optional missing token path=%s x_agent=%s authorization=%s",
                request.url.path,
                bool(agent_token),
                bool(authorization),
            )
        return None
    agent = _find_agent_for_token(session, resolved)
    if agent is None:
        logger.warning(
            "agent auth optional invalid token path=%s token_prefix=%s",
            request.url.path,
            resolved[:6],
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return AgentAuthContext(actor_type="agent", agent=agent)
