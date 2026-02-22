"""Rule engine consumer process.

Subscribes to the Redis event bus, evaluates enabled ProactiveRules,
and creates AgentSuggestions when conditions are met.

Run as a standalone service:
    python -m app.services.proactivity.rule_engine
"""

from __future__ import annotations

import asyncio
import logging
import operator
from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlmodel import col, select

from app.core.time import utcnow
from app.db.session import async_session_maker
from app.models.proactive_rules import ProactiveRule
from app.services.proactivity.event_bus import SystemEvent, EventBus
from app.services.proactivity.suggestion_service import SuggestionService

logger = logging.getLogger(__name__)

# Condition operators supported in rule conditions
_OPERATORS: dict[str, Any] = {
    "eq": operator.eq,
    "ne": operator.ne,
    "gt": operator.gt,
    "lt": operator.lt,
    "gte": operator.ge,
    "lte": operator.le,
    "in": lambda a, b: a in b,
    "contains": lambda a, b: b in a,
}


def _evaluate_condition(condition: dict, payload: dict) -> bool:
    """Evaluate a single condition dict against the event payload.

    Condition format: {"field": "status", "op": "eq", "value": "done"}
    All conditions in a rule must pass (AND logic).
    """
    field = condition.get("field", "")
    op_name = condition.get("op", "eq")
    expected = condition.get("value")
    actual = payload.get(field)
    op_fn = _OPERATORS.get(op_name)
    if op_fn is None:
        logger.warning("rule_engine.unknown_operator op=%s", op_name)
        return False
    try:
        return bool(op_fn(actual, expected))
    except Exception:
        return False


def _evaluate_conditions(conditions: dict, payload: dict) -> bool:
    """Return True if all conditions in the rule pass against the payload."""
    rules_list = conditions.get("rules", [])
    if not rules_list:
        return True
    return all(_evaluate_condition(c, payload) for c in rules_list)


async def _load_matching_rules(
    org_id: UUID,
    event_type: str,
) -> list[ProactiveRule]:
    """Load enabled rules for an organization that match the trigger event."""
    async with async_session_maker() as session:
        statement = (
            select(ProactiveRule)
            .where(col(ProactiveRule.organization_id) == org_id)
            .where(col(ProactiveRule.is_enabled).is_(True))
            .where(col(ProactiveRule.trigger_event) == event_type)
        )
        return list(await session.exec(statement))


async def _is_in_cooldown(rule: ProactiveRule) -> bool:
    """Return True if the rule was fired within its cooldown window."""
    if rule.last_fired_at is None:
        return False
    from app.core.config import settings

    cooldown = timedelta(seconds=rule.cooldown_seconds or settings.proactivity_rule_cooldown_seconds)
    return (utcnow() - rule.last_fired_at) < cooldown


async def _update_rule_fired_at(rule_id: UUID) -> None:
    """Update last_fired_at for the given rule."""
    async with async_session_maker() as session:
        rule = await session.get(ProactiveRule, rule_id)
        if rule is None:
            return
        now = utcnow()
        rule.last_fired_at = now
        rule.updated_at = now
        session.add(rule)
        await session.commit()


async def _create_suggestion_for_rule(
    rule: ProactiveRule,
    event: SystemEvent,
) -> None:
    """Create an AgentSuggestion row based on action_config."""
    action_config = rule.action_config or {}
    suggestion_type = action_config.get("suggestion_type", rule.action_type)
    title = action_config.get("title", f"[{rule.name}] triggered by {event.event_type}")
    description = action_config.get("description")
    confidence = float(action_config.get("confidence", 0.7))
    priority = action_config.get("priority", "medium")

    async with async_session_maker() as session:
        svc = SuggestionService(session)
        await svc.create(
            organization_id=event.organization_id,
            suggestion_type=suggestion_type,
            title=title,
            description=description,
            confidence=confidence,
            priority=priority,
            payload={"rule_id": str(rule.id), "event_payload": event.payload},
            board_id=event.board_id,
            agent_id=event.agent_id,
        )
        await session.commit()

    await _update_rule_fired_at(rule.id)
    logger.info(
        "rule_engine.suggestion_created rule=%s event_type=%s",
        rule.name,
        event.event_type,
    )


async def handle_event(event: SystemEvent) -> None:
    """Evaluate all matching rules for an incoming event."""
    logger.debug(
        "rule_engine.event event_type=%s org=%s",
        event.event_type,
        event.organization_id,
    )
    try:
        rules = await _load_matching_rules(event.organization_id, event.event_type)
    except Exception:
        logger.exception("rule_engine.load_rules.error")
        return

    for rule in rules:
        try:
            if await _is_in_cooldown(rule):
                logger.debug("rule_engine.cooldown rule=%s", rule.name)
                continue
            if not _evaluate_conditions(rule.conditions, event.payload):
                continue
            await _create_suggestion_for_rule(rule, event)
        except Exception:
            logger.exception("rule_engine.rule.error rule=%s", rule.name)


async def run() -> None:
    """Entry point for the event bus consumer process."""
    logger.info("rule_engine.starting")
    bus = EventBus()
    try:
        await bus.subscribe_all(handle_event)
    except Exception:
        logger.exception("rule_engine.fatal")
    finally:
        await bus.close()
    logger.info("rule_engine.stopped")


if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )
    asyncio.run(run())
