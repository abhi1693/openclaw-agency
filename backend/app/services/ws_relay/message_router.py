"""Message routing between H5 clients and gateway agents (M4).

Responsibilities:
- route_h5_to_agent: validate assignment -> resolve agent -> get/create session -> forward to gateway
- route_gateway_to_h5: resolve session -> forward to H5 client (local or via Redis)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlmodel import select

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.h5_users import H5UserAgentAssignment
from app.models.ws_sessions import H5ChatSession
from app.services.ws_relay.connection_manager import h5_connection_manager
from app.services.ws_relay.gateway_pool import gateway_pool
from app.services.ws_relay.redis_bridge import redis_bridge

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = get_logger(__name__)

# Session key format: h5:{h5_user_id}:{agent_id}
_SESSION_KEY_PREFIX = "h5"


def _build_session_key(h5_user_id: UUID, agent_id: UUID) -> str:
    return f"{_SESSION_KEY_PREFIX}:{h5_user_id}:{agent_id}"


class MessageRouter:
    """Routes messages between H5 clients and gateway-hosted agents."""

    async def route_h5_to_agent(
        self,
        session: AsyncSession,
        *,
        h5_user_id: UUID,
        agent_id: UUID,
        content: str,
        message_id: str | None = None,
    ) -> bool:
        """Route a chat message from an H5 user to the assigned agent's gateway.

        Returns True if the message was forwarded, False if routing failed.
        """
        # 1. Validate that the H5 user is assigned to the agent
        assignment = await self._get_assignment(session, h5_user_id=h5_user_id, agent_id=agent_id)
        if assignment is None:
            logger.warning(
                "message_router.h5_to_agent.no_assignment h5_user_id=%s agent_id=%s",
                h5_user_id,
                agent_id,
            )
            return False

        # 2. Get or create the chat session (resolves gateway_id)
        chat_session = await self._get_or_create_session(
            session,
            h5_user_id=h5_user_id,
            agent_id=agent_id,
        )
        if chat_session is None:
            logger.warning(
                "message_router.h5_to_agent.no_session h5_user_id=%s agent_id=%s",
                h5_user_id,
                agent_id,
            )
            return False

        # 3. Update last_message_at
        chat_session.last_message_at = utcnow()
        chat_session.updated_at = utcnow()
        session.add(chat_session)
        await session.commit()

        # 4. Forward to gateway
        gateway_message: dict[str, Any] = {
            "type": "chat.send",
            "id": message_id,
            "payload": {
                "session_key": chat_session.session_key,
                "h5_user_id": str(h5_user_id),
                "agent_id": str(agent_id),
                "content": content,
                "role": "user",
            },
        }

        sent = await gateway_pool.send_to_gateway(chat_session.gateway_id, gateway_message)
        if not sent:
            # Try to forward via Redis pub/sub for cross-instance delivery
            sent = await redis_bridge.publish(
                "gateway",
                str(chat_session.gateway_id),
                gateway_message,
            )

        if not sent:
            logger.warning(
                "message_router.h5_to_agent.gateway_unreachable gateway_id=%s",
                chat_session.gateway_id,
            )

        return sent

    async def route_gateway_to_h5(
        self,
        *,
        session_key: str,
        content: str,
        message_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> bool:
        """Route a reply from a gateway agent back to the H5 user.

        Returns True if the message was delivered, False if routing failed.
        """
        # Resolve session by session_key
        # Note: We need a DB session here — callers must pass one if available.
        # For simplicity the gateway WS handler resolves this inline.
        # This method handles local + Redis delivery.
        raise NotImplementedError("Use route_gateway_to_h5_with_session for DB-backed routing")

    async def route_gateway_to_h5_with_session(
        self,
        db: AsyncSession,
        *,
        session_key: str,
        content: str,
        message_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> bool:
        """Route a gateway agent reply to the H5 user, using the provided DB session."""
        # Resolve session_key -> h5_user_id
        result = await db.exec(
            select(H5ChatSession).where(
                H5ChatSession.session_key == session_key,
                H5ChatSession.status == "active",
            )
        )
        chat_session = result.first()
        if chat_session is None:
            logger.warning(
                "message_router.gateway_to_h5.session_not_found session_key=%s",
                session_key,
            )
            return False

        h5_user_id = chat_session.h5_user_id
        delivery_message: dict[str, Any] = {
            "type": "chat_reply",
            "id": message_id,
            "payload": {
                "session_key": session_key,
                "agent_id": str(chat_session.agent_id),
                "content": content,
                "role": "assistant",
                **(extra or {}),
            },
        }

        # Try local delivery first
        delivered = await h5_connection_manager.send_to_user(h5_user_id, delivery_message)
        if delivered:
            return True

        # Attempt cross-instance delivery via Redis
        delivered = await redis_bridge.publish(
            "h5_user",
            str(h5_user_id),
            delivery_message,
        )

        if not delivered:
            logger.warning(
                "message_router.gateway_to_h5.delivery_failed h5_user_id=%s",
                h5_user_id,
            )

        return delivered

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_assignment(
        self,
        session: AsyncSession,
        *,
        h5_user_id: UUID,
        agent_id: UUID,
    ) -> H5UserAgentAssignment | None:
        """Look up the H5 user-agent assignment."""
        result = await session.exec(
            select(H5UserAgentAssignment).where(
                H5UserAgentAssignment.h5_user_id == h5_user_id,
                H5UserAgentAssignment.agent_id == agent_id,
            )
        )
        return result.first()

    async def _get_or_create_session(
        self,
        session: AsyncSession,
        *,
        h5_user_id: UUID,
        agent_id: UUID,
    ) -> H5ChatSession | None:
        """Get an existing active session or create a new one."""
        from app.models.agents import Agent

        # Look for an existing active session
        result = await session.exec(
            select(H5ChatSession).where(
                H5ChatSession.h5_user_id == h5_user_id,
                H5ChatSession.agent_id == agent_id,
                H5ChatSession.status == "active",
            )
        )
        existing = result.first()
        if existing is not None:
            return existing

        # Resolve agent -> gateway_id
        agent = await session.get(Agent, agent_id)
        if agent is None or agent.gateway_id is None:
            logger.warning(
                "message_router.session.no_gateway agent_id=%s",
                agent_id,
            )
            return None

        gateway_id: UUID = agent.gateway_id
        session_key = _build_session_key(h5_user_id, agent_id)

        new_session = H5ChatSession(
            h5_user_id=h5_user_id,
            agent_id=agent_id,
            gateway_id=gateway_id,
            session_key=session_key,
            status="active",
        )
        session.add(new_session)
        await session.commit()
        await session.refresh(new_session)

        logger.info(
            "message_router.session.created h5_user_id=%s agent_id=%s gateway_id=%s",
            h5_user_id,
            agent_id,
            gateway_id,
        )
        return new_session


# Module-level singleton
message_router = MessageRouter()
