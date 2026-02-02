from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

from sqlmodel import Session, select

from app.db.session import engine
from app.integrations.openclaw import OpenClawClient
from app.models.org import Employee
from app.models.projects import ProjectMember
from app.models.work import Task, TaskComment

logger = logging.getLogger("app.notify")


@dataclass(frozen=True)
class NotifyContext:
    """Notification context.

    IMPORTANT: this is passed into FastAPI BackgroundTasks.
    Do not store live SQLAlchemy/SQLModel objects here; only ids/primitive data.
    """

    event: str  # task.created | task.updated | task.assigned | comment.created | status.changed
    actor_employee_id: int
    task_id: int
    comment_id: int | None = None
    changed_fields: dict | None = None


def _employees_with_session_keys(session: Session, employee_ids: Iterable[int]) -> list[Employee]:
    ids = sorted({i for i in employee_ids if i is not None})
    if not ids:
        return []

    emps = session.exec(select(Employee).where(Employee.id.in_(ids))).all()
    out: list[Employee] = []
    for e in emps:
        if not getattr(e, "notify_enabled", True):
            continue
        if getattr(e, "openclaw_session_key", None):
            out.append(e)
    return out


def _project_pm_employee_ids(session: Session, project_id: int) -> set[int]:
    pms = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    pm_ids: set[int] = set()
    for m in pms:
        role = (m.role or "").lower()
        if role in {"pm", "product", "product_manager", "manager"}:
            pm_ids.add(m.employee_id)
    return pm_ids


def resolve_recipients(
    session: Session, ctx: NotifyContext, task: Task, comment: TaskComment | None
) -> set[int]:
    recipients: set[int] = set()

    if ctx.event == "task.created":
        if task.assignee_employee_id:
            recipients.add(task.assignee_employee_id)
        recipients |= _project_pm_employee_ids(session, task.project_id)

    elif ctx.event == "task.assigned":
        if task.assignee_employee_id:
            recipients.add(task.assignee_employee_id)
        recipients |= _project_pm_employee_ids(session, task.project_id)

    elif ctx.event == "comment.created":
        if task.assignee_employee_id:
            recipients.add(task.assignee_employee_id)
        if task.reviewer_employee_id:
            recipients.add(task.reviewer_employee_id)
        recipients |= _project_pm_employee_ids(session, task.project_id)
        if comment and comment.author_employee_id:
            recipients.discard(comment.author_employee_id)

    elif ctx.event == "status.changed":
        new_status = (getattr(task, "status", None) or "").lower()
        if new_status in {"review", "ready_for_review"} and task.reviewer_employee_id:
            recipients.add(task.reviewer_employee_id)
        recipients |= _project_pm_employee_ids(session, task.project_id)

    elif ctx.event == "task.updated":
        recipients |= _project_pm_employee_ids(session, task.project_id)

    recipients.discard(ctx.actor_employee_id)
    return recipients


def ensure_employee_provisioned(session: Session, employee_id: int) -> None:
    """Best-effort provisioning of a reviewer/manager so notifications can be delivered."""

    emp = session.get(Employee, employee_id)
    if emp is None:
        return
    if not getattr(emp, "notify_enabled", True):
        return
    if getattr(emp, "openclaw_session_key", None):
        return

    client = OpenClawClient.from_env()
    if client is None:
        logger.warning(
            "ensure_employee_provisioned: missing OpenClaw env", extra={"employee_id": employee_id}
        )
        return

    prompt = (
        f"You are {emp.name} (employee_id={emp.id}).\n"
        "You are a reviewer/manager in Mission Control.\n"
        "When you get a review request, open Mission Control and approve or request changes.\n"
    )

    try:
        res = client.tools_invoke(
            "sessions_spawn",
            {"task": prompt, "label": f"employee:{emp.id}:{emp.name}"},
            timeout_s=20.0,
        )
        details = (res.get("result") or {}).get("details") or {}
        sk = details.get("childSessionKey") or details.get("sessionKey")
        if sk:
            emp.openclaw_session_key = sk
            session.add(emp)
            session.commit()
            logger.info(
                "ensure_employee_provisioned: provisioned",
                extra={"employee_id": emp.id, "session_key": sk},
            )
    except Exception:
        session.rollback()
        logger.exception("ensure_employee_provisioned: failed", extra={"employee_id": employee_id})


def build_message(
    *,
    ctx: NotifyContext,
    task: Task,
    comment: TaskComment | None,
    recipient: Employee,
    base_url: str,
) -> str:
    base = f"Task #{task.id}: {task.title}" if task.id is not None else f"Task: {task.title}"

    if ctx.event in {"task.created", "task.assigned"} and recipient.employee_type == "agent":
        desc = (task.description or "").strip()
        if len(desc) > 500:
            desc = desc[:497] + "..."
        desc_block = f"\n\nDescription:\n{desc}" if desc else ""

        return (
            f"{base}\n\n"
            f"Set BASE={base_url}\n\n"
            "You are the assignee. Start NOW (use the exec tool to run these curl commands):\n"
            f"1) curl -sS -X PATCH $BASE/tasks/{task.id} -H 'X-Actor-Employee-Id: {recipient.id}' -H 'Content-Type: application/json' -d '{{\"status\":\"in_progress\"}}'\n"
            f"2) curl -sS -X POST $BASE/task-comments -H 'X-Actor-Employee-Id: {recipient.id}' -H 'Content-Type: application/json' -d '{{\"task_id\":{task.id},\"body\":\"Plan: ... Next: ...\"}}'\n"
            "3) Do the work\n"
            "4) Post progress updates via POST $BASE/task-comments (same headers)\n"
            f"5) When complete: set status=review (assignee cannot set done) and wait for manager approval\n"
            f"{desc_block}"
        )

    if ctx.event == "comment.created":
        snippet = ""
        if comment and comment.body:
            snippet = comment.body.strip().replace("\n", " ")
            if len(snippet) > 180:
                snippet = snippet[:177] + "..."
            snippet = f"\nComment: {snippet}"
        return f"New comment on {base}.{snippet}\nPlease review and respond in Mission Control."

    if ctx.event == "status.changed":
        new_status = (getattr(task, "status", None) or "").lower()
        if new_status in {"review", "ready_for_review"}:
            return (
                f"Review requested for {base}.\n"
                "As the reviewer/manager, you must:\n"
                "1) Read the task + latest assignee comments\n"
                "2) Decide: approve or request changes\n"
                "3) Leave an audit comment explaining your decision (required)\n"
                f"4) Submit decision via POST /tasks/{task.id}/review (decision=approve|changes)\n"
                "Approve → task becomes done. Changes → task returns to in_progress and assignee is notified."
            )
        return (
            f"Status changed on {base} → {task.status}.\n"
            "Please review and respond in Mission Control."
        )

    if ctx.event == "task.created":
        return f"New task created: {base}.\nPlease review and respond in Mission Control."

    if ctx.event == "task.assigned":
        return f"Assigned: {base}.\nPlease review and respond in Mission Control."

    return f"Update on {base}.\nPlease review and respond in Mission Control."


def notify_openclaw(ctx: NotifyContext) -> None:
    """Send OpenClaw notifications.

    Runs in BackgroundTasks; opens its own DB session for safety.
    """

    client = OpenClawClient.from_env()
    logger.info(
        "notify_openclaw: start",
        extra={"event": ctx.event, "task_id": ctx.task_id, "actor": ctx.actor_employee_id},
    )
    if client is None:
        logger.warning("notify_openclaw: skipped (missing OpenClaw env)")
        return

    with Session(engine) as session:
        task = session.get(Task, ctx.task_id)
        if task is None:
            logger.warning("notify_openclaw: task not found", extra={"task_id": ctx.task_id})
            return

        comment = session.get(TaskComment, ctx.comment_id) if ctx.comment_id else None

        if ctx.event == "status.changed":
            new_status = (getattr(task, "status", None) or "").lower()
            if new_status in {"review", "ready_for_review"} and task.reviewer_employee_id:
                ensure_employee_provisioned(session, int(task.reviewer_employee_id))

        recipient_ids = resolve_recipients(session, ctx, task, comment)
        logger.info(
            "notify_openclaw: recipients resolved", extra={"recipient_ids": sorted(recipient_ids)}
        )
        recipients = _employees_with_session_keys(session, recipient_ids)
        if not recipients:
            logger.info("notify_openclaw: no recipients with session keys")
            return

        # base URL used in agent messages
        base_url = __import__(
            "app.core.urls", fromlist=["public_api_base_url"]
        ).public_api_base_url()

        for e in recipients:
            sk = getattr(e, "openclaw_session_key", None)
            if not sk:
                continue

            message = build_message(
                ctx=ctx,
                task=task,
                comment=comment,
                recipient=e,
                base_url=base_url,
            )

            try:
                client.tools_invoke(
                    "sessions_send",
                    {"sessionKey": sk, "message": message},
                    timeout_s=30.0,
                )
            except Exception:
                # keep the log, but avoid giant stack spam unless debugging
                logger.warning(
                    "notify_openclaw: sessions_send failed",
                    extra={
                        "event": ctx.event,
                        "task_id": ctx.task_id,
                        "to_employee_id": getattr(e, "id", None),
                        "session_key": sk,
                    },
                )
                continue
