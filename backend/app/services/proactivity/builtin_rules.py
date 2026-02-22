"""Builtin proactive rule definitions.

Call seed_builtin_rules(session, organization_id) to install the default
rule set for a new organization.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlmodel import col, select

from app.models.proactive_rules import ProactiveRule

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

# ---------------------------------------------------------------------------
# Builtin rule definitions
# ---------------------------------------------------------------------------

BUILTIN_RULES: list[dict] = [
    {
        "name": "Overdue Task Alert",
        "description": (
            "Checks daily for tasks that are past their due date and still not done."
        ),
        "trigger_event": "cron.daily",
        "conditions": {
            "rules": [
                {"field": "has_overdue_tasks", "op": "eq", "value": True},
            ]
        },
        "action_type": "create_suggestion",
        "action_config": {
            "suggestion_type": "deadline_alert",
            "title": "Overdue tasks detected",
            "description": "One or more tasks are past their due date.",
            "confidence": 0.95,
            "priority": "high",
        },
        "cooldown_seconds": 86400,  # once per day
    },
    {
        "name": "Stale Review Detection",
        "description": (
            "Alerts when a task has been in review status for more than 24 hours."
        ),
        "trigger_event": "cron.hourly",
        "conditions": {
            "rules": [
                {"field": "stale_review_count", "op": "gt", "value": 0},
            ]
        },
        "action_type": "create_suggestion",
        "action_config": {
            "suggestion_type": "quality_concern",
            "title": "Stale review tasks",
            "description": "Tasks have been in review for more than 24 hours.",
            "confidence": 0.80,
            "priority": "medium",
        },
        "cooldown_seconds": 3600,  # once per hour max
    },
    {
        "name": "WIP Limit Warning",
        "description": (
            "Warns when in-progress tasks exceed the recommended WIP limit "
            "(board.max_agents * 3)."
        ),
        "trigger_event": "task.status_changed",
        "conditions": {
            "rules": [
                {"field": "wip_exceeded", "op": "eq", "value": True},
            ]
        },
        "action_type": "create_suggestion",
        "action_config": {
            "suggestion_type": "workload_rebalance",
            "title": "WIP limit exceeded",
            "description": "Too many tasks are in progress simultaneously.",
            "confidence": 0.75,
            "priority": "medium",
        },
        "cooldown_seconds": 3600,
    },
    {
        "name": "Unblocking Opportunity",
        "description": (
            "Suggests reassigning downstream tasks when a blocking task is completed."
        ),
        "trigger_event": "task.status_changed",
        "conditions": {
            "rules": [
                {"field": "new_status", "op": "eq", "value": "done"},
                {"field": "has_dependents", "op": "eq", "value": True},
            ]
        },
        "action_type": "create_suggestion",
        "action_config": {
            "suggestion_type": "task_reassign",
            "title": "Downstream tasks now unblocked",
            "description": "A completed task has freed up dependent tasks for assignment.",
            "confidence": 0.85,
            "priority": "medium",
        },
        "cooldown_seconds": 1800,
    },
    {
        "name": "Idle Agent Detection",
        "description": (
            "Alerts when an agent has had no in-progress tasks for more than 1 hour."
        ),
        "trigger_event": "agent.heartbeat",
        "conditions": {
            "rules": [
                {"field": "idle_minutes", "op": "gte", "value": 60},
            ]
        },
        "action_type": "create_suggestion",
        "action_config": {
            "suggestion_type": "task_reassign",
            "title": "Idle agent detected",
            "description": "An agent has been idle for more than 1 hour.",
            "confidence": 0.70,
            "priority": "low",
        },
        "cooldown_seconds": 3600,
    },
    {
        "name": "Auto Follow-up",
        "description": (
            "Suggests creating a follow-up task when a task completes "
            "and its title matches common follow-up patterns."
        ),
        "trigger_event": "task.status_changed",
        "conditions": {
            "rules": [
                {"field": "new_status", "op": "eq", "value": "done"},
                {"field": "needs_followup", "op": "eq", "value": True},
            ]
        },
        "action_type": "create_suggestion",
        "action_config": {
            "suggestion_type": "task_create",
            "title": "Consider a follow-up task",
            "description": "The completed task may benefit from a follow-up.",
            "confidence": 0.60,
            "priority": "low",
        },
        "cooldown_seconds": 7200,
    },
]


async def seed_builtin_rules(
    session: AsyncSession,
    organization_id: UUID,
) -> list[ProactiveRule]:
    """Install the default builtin rule set for an organization.

    Rules are idempotent — if a rule with the same name already exists for the
    organization, it is skipped.
    """
    existing_names = set(
        await session.exec(
            select(col(ProactiveRule.name)).where(
                col(ProactiveRule.organization_id) == organization_id,
                col(ProactiveRule.is_builtin).is_(True),
            )
        )
    )

    created: list[ProactiveRule] = []
    for rule_def in BUILTIN_RULES:
        if rule_def["name"] in existing_names:
            continue
        rule = ProactiveRule(
            organization_id=organization_id,
            name=rule_def["name"],
            description=rule_def.get("description"),
            trigger_event=rule_def["trigger_event"],
            conditions=rule_def.get("conditions", {}),
            action_type=rule_def["action_type"],
            action_config=rule_def.get("action_config", {}),
            cooldown_seconds=rule_def.get("cooldown_seconds", 3600),
            is_enabled=True,
            is_builtin=True,
        )
        session.add(rule)
        created.append(rule)

    if created:
        await session.flush()
    return created
