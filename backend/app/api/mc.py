"""Mission Control API — brands, agents roster, tasks, performance, comms, system, auth, RBAC."""

from __future__ import annotations

import json
import os
import platform
import re
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import psutil  # type: ignore[import-untyped]
from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func, or_, select, desc
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.mc_auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.mc_permissions import Permission, check_permission, get_user_permissions
from app.core.time import utcnow
from app.db.session import get_session
from app.models.mc_models import (
    ActivityFeedEntry,
    Brand,
    CommsMessage,
    CommsSession,
    MCAgent,
    MCTask,
    MCUser,
    PerformanceSnapshot,
    SessionNotes,
    TaskActivityLog,
    TaskComment,
)

router = APIRouter(prefix="/mc", tags=["mission-control"])

SESSION_DEP = Depends(get_session)

# Ingest token — agents use this, NOT JWT
INGEST_TOKEN = os.environ.get("MC_INGEST_TOKEN", "mc-ingest-2026-arpit")

# Local auth token for backward-compat (old single-user auth)
LOCAL_AUTH_TOKEN = os.environ.get("LOCAL_AUTH_TOKEN", "mc-local-token-2026")

# ── Task UID generation ──

CATEGORY_CODES = {
    "marketing": "MKT",
    "development": "DEV",
    "operations": "OPS",
    "finance": "FIN",
    "qa": "QA",
    "growth": "GRW",
    "creative": "CRE",
    "support": "SUP",
    "strategy": "STR",
    "general": "GEN",
}

# Valid status transitions
STATUS_TRANSITIONS: dict[str, list[str]] = {
    "inbox": ["assigned", "in_progress"],
    "assigned": ["in_progress", "inbox"],
    "in_progress": ["blocked", "review", "done"],
    "blocked": ["in_progress"],
    "review": ["in_progress", "done"],
    "done": ["archived", "in_progress"],
    "archived": ["inbox"],
}

PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


async def generate_task_uid(session: AsyncSession, category: str) -> str:
    """Generate next task UID for a given category. Format: MC-{CODE}-{0001}."""
    code = CATEGORY_CODES.get(category, "GEN")
    prefix = f"MC-{code}-"

    result = await session.exec(  # type: ignore[arg-type]
        select(MCTask.task_uid)
        .where(MCTask.task_uid.startswith(prefix))  # type: ignore[union-attr]
        .order_by(MCTask.task_uid.desc())  # type: ignore[union-attr]
        .limit(1)
    )
    last_uid = result.first()

    if last_uid:
        last_num = int(last_uid.split("-")[-1])
        next_num = last_num + 1
    else:
        next_num = 1

    return f"{prefix}{next_num:04d}"


# ── WebSocket connections for live feed ──
_ws_clients: list[WebSocket] = []


async def _broadcast_ws(data: dict[str, Any]) -> None:
    msg = json.dumps(data, default=str)
    dead: list[WebSocket] = []
    for ws in _ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients.remove(ws)


# ── Auth dependency ──


async def get_mc_user(
    authorization: str | None = Header(None),
    session: AsyncSession = SESSION_DEP,
) -> MCUser:
    """Extract MC user from JWT or LOCAL_AUTH_TOKEN (backward compat).

    - If token == LOCAL_AUTH_TOKEN env var -> returns synthetic owner MCUser
    - Else decodes JWT -> DB lookup -> returns MCUser
    - Raises 401 if invalid
    """
    if not authorization:
        raise HTTPException(401, "Authorization header required")

    token = authorization.removeprefix("Bearer ").strip()

    # Backward compat: local auth token returns synthetic owner
    if token == LOCAL_AUTH_TOKEN:
        # Look up the owner user, or create a synthetic one
        result = await session.exec(  # type: ignore[arg-type]
            select(MCUser).where(MCUser.role == "owner").limit(1)
        )
        owner = result.first()
        if owner:
            return owner
        # Synthetic fallback if no owner exists yet
        return MCUser(
            id=UUID("00000000-0000-0000-0000-000000000099"),
            email="arpit@plentum.com",
            password_hash="",
            name="Arpit",
            role="owner",
            is_active=True,
        )

    # JWT decode
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")

    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    user = await session.get(MCUser, UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")

    return user


MC_USER_DEP = Depends(get_mc_user)


# ═══════════════════════════════════════════════════════════════
# PHASE 2: Auth Endpoints
# ═══════════════════════════════════════════════════════════════


@router.post("/auth/login")
async def login(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        raise HTTPException(400, "Email and password required")

    result = await session.exec(  # type: ignore[arg-type]
        select(MCUser).where(MCUser.email == email)
    )
    user = result.first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    if not user.is_active:
        raise HTTPException(403, "Account deactivated")

    # Update last_login
    user.last_login = utcnow()
    session.add(user)
    await session.commit()
    await session.refresh(user)

    permissions = get_user_permissions(user.role, user.custom_permissions)

    access_token = create_access_token(str(user.id), user.email, user.role)
    refresh_token = create_refresh_token(str(user.id))

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 86400,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "permissions": [p.value for p in permissions],
            "brand_access": user.brand_access,
            "department_access": user.department_access,
            "avatar_url": user.avatar_url,
        },
    }


@router.post("/auth/refresh")
async def refresh_token(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    token = body.get("refresh_token", "")
    if not token:
        raise HTTPException(400, "refresh_token required")

    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token")

    user = await session.get(MCUser, UUID(user_id))
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")

    access_token = create_access_token(str(user.id), user.email, user.role)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 86400,
    }


@router.get("/auth/me")
async def get_me(user: MCUser = MC_USER_DEP) -> dict[str, Any]:
    permissions = get_user_permissions(user.role, user.custom_permissions)
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "permissions": [p.value for p in permissions],
        "brand_access": user.brand_access,
        "department_access": user.department_access,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


# ═══════════════════════════════════════════════════════════════
# PHASE 2: User Management Endpoints (admin/owner only)
# ═══════════════════════════════════════════════════════════════


@router.get("/users")
async def list_users(
    user: MCUser = MC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[dict[str, Any]]:
    if not check_permission(user, Permission.USER_VIEW):
        raise HTTPException(403, "Insufficient permissions")

    result = await session.exec(  # type: ignore[arg-type]
        select(MCUser).order_by(MCUser.name)
    )
    users = result.all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "is_active": u.is_active,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "brand_access": u.brand_access,
            "department_access": u.department_access,
            "avatar_url": u.avatar_url,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users")
async def create_user(
    body: dict[str, Any],
    user: MCUser = MC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    if not check_permission(user, Permission.USER_MANAGE):
        raise HTTPException(403, "Insufficient permissions")

    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    name = body.get("name", "")
    role = body.get("role", "viewer")

    if not email or not password or not name:
        raise HTTPException(400, "email, password, and name required")

    # Only owner can create admins/owners
    if role in ("admin", "owner") and not check_permission(user, Permission.USER_MANAGE_ADMINS):
        raise HTTPException(403, "Only owner can create admin/owner users")

    # Check duplicate
    existing = await session.exec(  # type: ignore[arg-type]
        select(MCUser).where(MCUser.email == email)
    )
    if existing.first():
        raise HTTPException(409, "User with this email already exists")

    new_user = MCUser(
        email=email,
        password_hash=hash_password(password),
        name=name,
        role=role,
        brand_access=body.get("brand_access"),
        department_access=body.get("department_access"),
        avatar_url=body.get("avatar_url"),
        custom_permissions=body.get("custom_permissions"),
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return {
        "id": str(new_user.id),
        "email": new_user.email,
        "name": new_user.name,
        "role": new_user.role,
        "is_active": new_user.is_active,
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: UUID,
    body: dict[str, Any],
    user: MCUser = MC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    if not check_permission(user, Permission.USER_MANAGE):
        raise HTTPException(403, "Insufficient permissions")

    target = await session.get(MCUser, user_id)
    if not target:
        raise HTTPException(404, "User not found")

    # Cannot edit owner unless you are owner
    if target.role == "owner" and user.role != "owner":
        raise HTTPException(403, "Cannot modify owner user")

    allowed_fields = {"name", "avatar_url", "brand_access", "department_access", "custom_permissions"}
    for k, v in body.items():
        if k in allowed_fields:
            setattr(target, k, v)

    if "password" in body and body["password"]:
        target.password_hash = hash_password(body["password"])

    target.updated_at = utcnow()
    session.add(target)
    await session.commit()
    await session.refresh(target)

    return {
        "id": str(target.id),
        "email": target.email,
        "name": target.name,
        "role": target.role,
        "is_active": target.is_active,
        "brand_access": target.brand_access,
        "department_access": target.department_access,
    }


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: UUID,
    body: dict[str, Any],
    user: MCUser = MC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    new_role = body.get("role", "")
    if new_role not in ("viewer", "agent_manager", "operator", "admin", "owner"):
        raise HTTPException(400, "Invalid role")

    if not check_permission(user, Permission.USER_MANAGE):
        raise HTTPException(403, "Insufficient permissions")

    if new_role in ("admin", "owner") and not check_permission(user, Permission.USER_MANAGE_ADMINS):
        raise HTTPException(403, "Only owner can assign admin/owner roles")

    target = await session.get(MCUser, user_id)
    if not target:
        raise HTTPException(404, "User not found")

    if target.role == "owner" and user.role != "owner":
        raise HTTPException(403, "Cannot modify owner user")

    target.role = new_role
    target.updated_at = utcnow()
    session.add(target)
    await session.commit()
    await session.refresh(target)

    return {"id": str(target.id), "email": target.email, "role": target.role}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    user: MCUser = MC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    if not check_permission(user, Permission.USER_MANAGE):
        raise HTTPException(403, "Insufficient permissions")

    target = await session.get(MCUser, user_id)
    if not target:
        raise HTTPException(404, "User not found")

    if target.role == "owner":
        raise HTTPException(403, "Cannot deactivate owner")

    if target.id == user.id:
        raise HTTPException(400, "Cannot deactivate yourself")

    target.is_active = False
    target.updated_at = utcnow()
    session.add(target)
    await session.commit()

    return {"ok": True, "id": str(target.id), "is_active": False}


# ═══════════════════════════════════════════════════════════════
# Agents
# ═══════════════════════════════════════════════════════════════


@router.get("/agents")
async def list_agents(session: AsyncSession = SESSION_DEP) -> list[dict[str, Any]]:
    result = await session.execute(select(MCAgent).order_by(MCAgent.department, MCAgent.name))  # type: ignore[arg-type]
    return [a.model_dump() for a in result.scalars().all()]


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: UUID, body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    agent = await session.get(MCAgent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    for k, v in body.items():
        if hasattr(agent, k) and k != "id":
            setattr(agent, k, v)
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    await _broadcast_ws({"type": "agent_update", "agent": agent.model_dump(mode="json")})
    return agent.model_dump()


# ═══════════════════════════════════════════════════════════════
# Brands
# ═══════════════════════════════════════════════════════════════


@router.get("/brands")
async def list_brands(session: AsyncSession = SESSION_DEP) -> list[dict[str, Any]]:
    result = await session.execute(select(Brand).order_by(Brand.name))  # type: ignore[arg-type]
    brands = result.scalars().all()
    out = []
    for b in brands:
        d = b.model_dump()
        # mask tokens
        if d.get("shopify_token"):
            d["shopify_token"] = d["shopify_token"][:10] + "..."
        if d.get("meta_token"):
            d["meta_token"] = d["meta_token"][:10] + "..."
        # latest perf
        perf_q = select(PerformanceSnapshot).where(
            PerformanceSnapshot.brand_id == b.id
        ).order_by(desc(PerformanceSnapshot.snap_date)).limit(1)
        perf_result = await session.exec(perf_q)  # type: ignore[arg-type]
        perf = perf_result.scalars().first()
        if perf:
            _pd = perf.model_dump(mode="json")
            _pd["date"] = _pd.pop("snap_date", _pd.get("date"))
            d["latest_performance"] = _pd
        out.append(d)
    return out


# ═══════════════════════════════════════════════════════════════
# PHASE 3: Enhanced Task API
# ═══════════════════════════════════════════════════════════════


@router.get("/tasks/summary")
async def task_summary(session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    """Task counts by status, category, agent, and done today."""
    # By status
    status_q = await session.exec(  # type: ignore[arg-type]
        select(MCTask.status, func.count()).group_by(MCTask.status)
    )
    by_status = {row[0]: row[1] for row in status_q.all()}

    # By category
    cat_q = await session.exec(  # type: ignore[arg-type]
        select(MCTask.category, func.count())
        .where(MCTask.status != "archived")
        .group_by(MCTask.category)
    )
    by_category = {(row[0] or "general"): row[1] for row in cat_q.all()}

    # By agent
    agent_q = await session.exec(  # type: ignore[arg-type]
        select(MCTask.assigned_agent, func.count())
        .where(MCTask.assigned_agent.isnot(None), MCTask.status.notin_(["done", "archived"]))  # type: ignore[union-attr]
        .group_by(MCTask.assigned_agent)
    )
    by_agent = {row[0]: row[1] for row in agent_q.all()}

    # Done today
    today_start = datetime.combine(date.today(), datetime.min.time())
    done_q = await session.exec(  # type: ignore[arg-type]
        select(func.count())
        .where(MCTask.status == "done", MCTask.completed_at >= today_start)
    )
    done_today = done_q.one_or_none() or 0

    return {
        "by_status": by_status,
        "by_category": by_category,
        "by_agent": by_agent,
        "done_today": done_today,
    }


@router.get("/tasks")
async def list_tasks(
    status: str | None = Query(None),
    category: str | None = Query(None),
    priority: str | None = Query(None),
    assigned_agent: str | None = Query(None),
    brand: str | None = Query(None),
    search: str | None = Query(None),
    tags: str | None = Query(None),
    due_before: str | None = Query(None),
    due_after: str | None = Query(None),
    sort: str | None = Query(None),
    order: str = Query("desc"),
    page: int | None = Query(None),
    per_page: int = Query(50),
    include_archived: bool = Query(False),
    # Legacy params for backward compat
    agent: str | None = Query(None),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    q = select(MCTask)

    # Backward compat: 'agent' param maps to assigned_agent
    effective_agent = assigned_agent or agent

    # Status filter (comma-separated)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        q = q.where(MCTask.status.in_(statuses))  # type: ignore[union-attr]
    elif not include_archived:
        q = q.where(MCTask.status != "archived")

    # Category filter
    if category:
        categories = [c.strip() for c in category.split(",")]
        q = q.where(MCTask.category.in_(categories))  # type: ignore[union-attr]

    # Priority filter
    if priority:
        priorities = [p.strip() for p in priority.split(",")]
        q = q.where(MCTask.priority.in_(priorities))  # type: ignore[union-attr]

    # Agent filter
    if effective_agent:
        q = q.where(MCTask.assigned_agent == effective_agent)

    # Brand filter
    if brand:
        q = q.where(MCTask.brand_name == brand)

    # Full-text search (ILIKE on title + description)
    if search:
        pattern = f"%{search}%"
        q = q.where(
            or_(
                MCTask.title.ilike(pattern),  # type: ignore[union-attr]
                MCTask.description.ilike(pattern),  # type: ignore[union-attr]
            )
        )

    # Tags filter (check JSON array contains)
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        for tag in tag_list:
            q = q.where(MCTask.tags.contains(tag))  # type: ignore[union-attr]

    # Due date range
    if due_before:
        q = q.where(MCTask.due_date <= datetime.fromisoformat(due_before))
    if due_after:
        q = q.where(MCTask.due_date >= datetime.fromisoformat(due_after))

    # Count total before pagination
    count_q = select(func.count()).select_from(q.subquery())
    total_result = await session.exec(count_q)  # type: ignore[arg-type]
    total = total_result.one()

    # Sorting
    if sort == "priority":
        # Custom priority ordering
        from sqlalchemy import case
        priority_case = case(
            PRIORITY_ORDER,
            value=MCTask.priority,
            else_=99,
        )
        q = q.order_by(priority_case if order == "asc" else priority_case.desc())
    elif sort == "due_date":
        q = q.order_by(MCTask.due_date.asc() if order == "asc" else MCTask.due_date.desc())  # type: ignore[union-attr]
    elif sort == "created_at":
        q = q.order_by(MCTask.created_at.asc() if order == "asc" else MCTask.created_at.desc())
    elif sort == "updated_at":
        q = q.order_by(MCTask.updated_at.asc() if order == "asc" else MCTask.updated_at.desc())
    else:
        q = q.order_by(desc(MCTask.updated_at))

    # Pagination
    effective_page = page or 1
    offset = (effective_page - 1) * per_page
    q = q.offset(offset).limit(per_page)

    result = await session.exec(q)  # type: ignore[arg-type]
    tasks = [t.model_dump(mode="json") for t in result.scalars().all()]

    return {
        "tasks": tasks,
        "total": total,
        "page": effective_page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),  # ceiling division
    }


@router.post("/tasks")
async def create_task(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    category = body.get("category", "general")

    # Auto-generate task_uid
    task_uid = await generate_task_uid(session, category)

    # Process checklist items — add IDs if missing
    checklist = body.get("checklist")
    if checklist:
        for i, item in enumerate(checklist):
            if "id" not in item:
                item["id"] = f"chk_{i+1:03d}"
            item.setdefault("done", False)
            item.setdefault("completed_at", None)
            item.setdefault("completed_by", None)

    # Build task with all new fields
    task_fields = {k: v for k, v in body.items() if hasattr(MCTask, k)}
    task_fields["task_uid"] = task_uid
    task_fields["category"] = category
    if checklist:
        task_fields["checklist"] = checklist
        done_count = sum(1 for item in checklist if item.get("done"))
        task_fields["checklist_progress"] = round((done_count / len(checklist)) * 100, 1) if checklist else 0.0

    task = MCTask(**task_fields)
    session.add(task)
    await session.flush()

    # Create activity log
    actor = body.get("created_by", "arpit")
    log_entry = TaskActivityLog(
        task_id=task.id,
        task_uid=task_uid,
        action="created",
        actor=actor,
        actor_type="human" if actor.lower() in ("arpit",) else "agent",
        details={"title": task.title, "category": category, "priority": task.priority},
    )
    session.add(log_entry)

    await session.commit()
    await session.refresh(task)

    task_data = task.model_dump(mode="json")
    await _broadcast_ws({"type": "task_created", "task": task_data})
    return task_data


@router.get("/tasks/{task_uid}")
async def get_task_by_uid(task_uid: str, session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    result = await session.exec(  # type: ignore[arg-type]
        select(MCTask).where(MCTask.task_uid == task_uid)
    )
    task = result.first()
    if not task:
        raise HTTPException(404, "Task not found")
    return task.model_dump(mode="json")


@router.put("/tasks/{task_id}")
async def update_task(task_id: UUID, body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    task = await session.get(MCTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    for k, v in body.items():
        if hasattr(task, k) and k != "id":
            setattr(task, k, v)
    task.updated_at = utcnow()
    session.add(task)
    await session.commit()
    await session.refresh(task)
    await _broadcast_ws({"type": "task_updated", "task": task.model_dump(mode="json")})
    return task.model_dump(mode="json")


@router.patch("/tasks/{task_uid}/status")
async def change_task_status(
    task_uid: str,
    body: dict[str, Any],
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    new_status = body.get("status", "")
    if not new_status:
        raise HTTPException(400, "status required")

    result = await session.exec(  # type: ignore[arg-type]
        select(MCTask).where(MCTask.task_uid == task_uid)
    )
    task = result.first()
    if not task:
        raise HTTPException(404, "Task not found")

    old_status = task.status

    # Validate transition
    allowed = STATUS_TRANSITIONS.get(old_status, [])
    if new_status not in allowed:
        raise HTTPException(
            400,
            f"Invalid status transition: {old_status} -> {new_status}. Allowed: {allowed}",
        )

    # Blocked requires reason
    if new_status == "blocked":
        blocked_reason = body.get("blocked_reason")
        if not blocked_reason:
            raise HTTPException(400, "blocked_reason required when transitioning to blocked")
        task.blocked_reason = blocked_reason
    else:
        task.blocked_reason = None

    # Set timestamps
    if new_status == "in_progress" and not task.started_at:
        task.started_at = utcnow()
    if new_status == "done":
        task.completed_at = utcnow()

    task.status = new_status
    task.updated_at = utcnow()
    session.add(task)

    # Activity log
    actor = body.get("actor", "system")
    log_entry = TaskActivityLog(
        task_id=task.id,
        task_uid=task_uid,
        action="status_changed",
        actor=actor,
        actor_type=body.get("actor_type", "system"),
        details={"from": old_status, "to": new_status},
    )
    session.add(log_entry)

    await session.commit()
    await session.refresh(task)

    task_data = task.model_dump(mode="json")
    await _broadcast_ws({"type": "task_updated", "task": task_data})
    return task_data


@router.patch("/tasks/{task_uid}/assign")
async def assign_task(
    task_uid: str,
    body: dict[str, Any],
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    agent_name = body.get("agent_name", "")
    if not agent_name:
        raise HTTPException(400, "agent_name required")

    result = await session.exec(  # type: ignore[arg-type]
        select(MCTask).where(MCTask.task_uid == task_uid)
    )
    task = result.first()
    if not task:
        raise HTTPException(404, "Task not found")

    old_agent = task.assigned_agent
    task.assigned_agent = agent_name
    task.assigned_by = body.get("assigned_by", "arpit")
    task.updated_at = utcnow()

    # Auto-transition from inbox to assigned
    if task.status == "inbox":
        task.status = "assigned"

    session.add(task)

    # Activity log
    log_entry = TaskActivityLog(
        task_id=task.id,
        task_uid=task_uid,
        action="assigned" if not old_agent else "reassigned",
        actor=body.get("actor", "arpit"),
        actor_type=body.get("actor_type", "human"),
        details={"agent": agent_name, "from_agent": old_agent, "by": body.get("assigned_by", "arpit")},
    )
    session.add(log_entry)

    await session.commit()
    await session.refresh(task)

    task_data = task.model_dump(mode="json")
    await _broadcast_ws({"type": "task_updated", "task": task_data})
    return task_data


@router.patch("/tasks/{task_uid}/checklist")
async def update_checklist(
    task_uid: str,
    body: dict[str, Any],
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    action = body.get("action", "")
    if action not in ("add", "toggle", "remove"):
        raise HTTPException(400, "action must be add, toggle, or remove")

    result = await session.exec(  # type: ignore[arg-type]
        select(MCTask).where(MCTask.task_uid == task_uid)
    )
    task = result.first()
    if not task:
        raise HTTPException(404, "Task not found")

    checklist = list(task.checklist or [])
    log_details: dict[str, Any] = {"action": action}

    if action == "add":
        text = body.get("text", "")
        if not text:
            raise HTTPException(400, "text required for add action")
        new_id = f"chk_{len(checklist)+1:03d}"
        new_item = {"id": new_id, "text": text, "done": False, "completed_at": None, "completed_by": None}
        checklist.append(new_item)
        log_details["item_id"] = new_id
        log_details["text"] = text

    elif action == "toggle":
        item_id = body.get("item_id", "")
        if not item_id:
            raise HTTPException(400, "item_id required for toggle action")
        found = False
        for item in checklist:
            if item["id"] == item_id:
                item["done"] = not item["done"]
                if item["done"]:
                    item["completed_at"] = utcnow().isoformat()
                    item["completed_by"] = body.get("completed_by", "arpit")
                else:
                    item["completed_at"] = None
                    item["completed_by"] = None
                log_details["item_id"] = item_id
                log_details["text"] = item.get("text", "")
                log_details["done"] = item["done"]
                found = True
                break
        if not found:
            raise HTTPException(404, f"Checklist item {item_id} not found")

    elif action == "remove":
        item_id = body.get("item_id", "")
        if not item_id:
            raise HTTPException(400, "item_id required for remove action")
        original_len = len(checklist)
        checklist = [item for item in checklist if item["id"] != item_id]
        if len(checklist) == original_len:
            raise HTTPException(404, f"Checklist item {item_id} not found")
        log_details["item_id"] = item_id

    # Recompute progress
    total = len(checklist)
    done_count = sum(1 for item in checklist if item.get("done"))
    progress = round((done_count / total) * 100, 1) if total else 0.0

    task.checklist = checklist
    task.checklist_progress = progress
    task.updated_at = utcnow()
    session.add(task)

    log_entry = TaskActivityLog(
        task_id=task.id,
        task_uid=task_uid,
        action="checklist_updated",
        actor=body.get("actor", "arpit"),
        actor_type=body.get("actor_type", "human"),
        details=log_details,
    )
    session.add(log_entry)

    await session.commit()
    await session.refresh(task)

    return task.model_dump(mode="json")


# ── Task Comments ──


@router.get("/tasks/{task_uid}/comments")
async def list_task_comments(task_uid: str, session: AsyncSession = SESSION_DEP) -> list[dict[str, Any]]:
    result = await session.exec(  # type: ignore[arg-type]
        select(TaskComment)
        .where(TaskComment.task_uid == task_uid)
        .order_by(desc(TaskComment.created_at))
    )
    return [c.model_dump(mode="json") for c in result.all()]


@router.post("/tasks/{task_uid}/comments")
async def create_task_comment(
    task_uid: str,
    body: dict[str, Any],
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    # Verify task exists
    task_result = await session.exec(  # type: ignore[arg-type]
        select(MCTask).where(MCTask.task_uid == task_uid)
    )
    task = task_result.first()
    if not task:
        raise HTTPException(404, "Task not found")

    content = body.get("content", "")
    if not content:
        raise HTTPException(400, "content required")

    # Extract @mentions from content
    mentions = re.findall(r"@(\w+)", content)

    comment = TaskComment(
        task_id=task.id,
        task_uid=task_uid,
        author=body.get("author", "arpit"),
        author_type=body.get("author_type", "human"),
        content=content,
        parent_comment_id=UUID(body["parent_comment_id"]) if body.get("parent_comment_id") else None,
        mentions=mentions or None,
        is_system_message=body.get("is_system_message", False),
    )
    session.add(comment)

    # Activity log
    log_entry = TaskActivityLog(
        task_id=task.id,
        task_uid=task_uid,
        action="comment_added",
        actor=body.get("author", "arpit"),
        actor_type=body.get("author_type", "human"),
        details={"comment": content[:200]},
    )
    session.add(log_entry)

    await session.commit()
    await session.refresh(comment)

    return comment.model_dump(mode="json")


@router.delete("/tasks/{task_uid}/comments/{comment_id}")
async def delete_task_comment(
    task_uid: str,
    comment_id: UUID,
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    comment = await session.get(TaskComment, comment_id)
    if not comment or comment.task_uid != task_uid:
        raise HTTPException(404, "Comment not found")

    await session.delete(comment)
    await session.commit()

    return {"ok": True, "id": str(comment_id)}


# ── Task Activity Log ──


@router.get("/tasks/{task_uid}/activity")
async def list_task_activity(task_uid: str, session: AsyncSession = SESSION_DEP) -> list[dict[str, Any]]:
    result = await session.exec(  # type: ignore[arg-type]
        select(TaskActivityLog)
        .where(TaskActivityLog.task_uid == task_uid)
        .order_by(desc(TaskActivityLog.timestamp))
    )
    return [a.model_dump(mode="json") for a in result.all()]


# ── Legacy task PATCH alias (by UUID) ──


@router.post("/tasks/{task_id}")
async def patch_task(task_id: UUID, body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    """Alias for PATCH support via POST (backward compat)."""
    return await update_task(task_id, body, session)


# ═══════════════════════════════════════════════════════════════
# Performance
# ═══════════════════════════════════════════════════════════════


@router.get("/performance")
async def get_performance(
    brand: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    session: AsyncSession = SESSION_DEP,
) -> list[dict[str, Any]]:
    q = select(PerformanceSnapshot)
    if brand:
        brand_q = select(Brand).where(Brand.name == brand)
        brand_result = await session.exec(brand_q)  # type: ignore[arg-type]
        b = brand_result.scalars().first()
        if b:
            q = q.where(PerformanceSnapshot.brand_id == b.id)
    if date_from:
        q = q.where(PerformanceSnapshot.snap_date >= date.fromisoformat(date_from))
    if date_to:
        q = q.where(PerformanceSnapshot.snap_date <= date.fromisoformat(date_to))
    q = q.order_by(PerformanceSnapshot.snap_date)
    result = await session.exec(q)  # type: ignore[arg-type]
    return [(_d := p.model_dump(mode="json"), _d.update({"date": _d.pop("snap_date", _d.get("date"))}), _d)[-1] for p in result.scalars().all()]


@router.get("/performance/history")
async def get_performance_history(
    brand: str | None = None,
    period: str = "30d",
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    days = {"7d": 7, "30d": 30, "90d": 90, "6m": 180, "1y": 365}.get(period, 30)
    start = date.today() - timedelta(days=days)
    q = select(PerformanceSnapshot).where(PerformanceSnapshot.snap_date >= start)
    if brand:
        brand_q = select(Brand).where(Brand.name == brand)
        brand_result = await session.exec(brand_q)  # type: ignore[arg-type]
        b = brand_result.scalars().first()
        if b:
            q = q.where(PerformanceSnapshot.brand_id == b.id)
    q = q.order_by(PerformanceSnapshot.snap_date)
    result = await session.exec(q)  # type: ignore[arg-type]
    rows = result.scalars().all()
    return {
        "period": period,
        "count": len(rows),
        "data": [(_d := p.model_dump(mode="json"), _d.update({"date": _d.pop("snap_date", _d.get("date"))}), _d)[-1] for p in rows],
    }


# ═══════════════════════════════════════════════════════════════
# Activity Feed
# ═══════════════════════════════════════════════════════════════


@router.get("/activity")
async def list_activity(
    limit: int = 50,
    type: str | None = None,
    session: AsyncSession = SESSION_DEP,
) -> list[dict[str, Any]]:
    q = select(ActivityFeedEntry)
    if type:
        q = q.where(ActivityFeedEntry.type == type)
    q = q.order_by(desc(ActivityFeedEntry.timestamp)).limit(limit)
    result = await session.exec(q)  # type: ignore[arg-type]
    return [a.model_dump(mode="json") for a in result.scalars().all()]


@router.post("/activity")
async def create_activity(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    entry = ActivityFeedEntry(**{k: v for k, v in body.items() if hasattr(ActivityFeedEntry, k)})
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    data = entry.model_dump(mode="json")
    await _broadcast_ws({"type": "activity", "entry": data})
    return data


# ═══════════════════════════════════════════════════════════════
# Comms
# ═══════════════════════════════════════════════════════════════


@router.get("/comms/sessions")
async def list_comms_sessions(session: AsyncSession = SESSION_DEP) -> list[dict[str, Any]]:
    result = await session.execute(select(CommsSession).order_by(desc(CommsSession.start_time)))  # type: ignore[arg-type]
    return [s.model_dump(mode="json") for s in result.scalars().all()]


@router.get("/comms/sessions/{session_id}")
async def get_comms_session(session_id: UUID, session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    s = await session.get(CommsSession, session_id)
    if not s:
        raise HTTPException(404)
    msgs_result = await session.exec(
        select(CommsMessage).where(CommsMessage.session_id == session_id).order_by(CommsMessage.timestamp)  # type: ignore[arg-type]
    )
    notes_result = await session.exec(
        select(SessionNotes).where(SessionNotes.session_id == session_id)  # type: ignore[arg-type]
    )
    return {
        **s.model_dump(mode="json"),
        "messages": [m.model_dump(mode="json") for m in msgs_result.scalars().all()],
        "notes": [n.model_dump(mode="json") for n in notes_result.scalars().all()],
    }


@router.post("/comms/sessions")
async def create_comms_session(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    s = CommsSession(**{k: v for k, v in body.items() if hasattr(CommsSession, k)})
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return s.model_dump(mode="json")


@router.post("/comms/messages")
async def create_comms_message(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    m = CommsMessage(**{k: v for k, v in body.items() if hasattr(CommsMessage, k)})
    session.add(m)
    await session.commit()
    await session.refresh(m)
    await _broadcast_ws({"type": "comms_message", "message": m.model_dump(mode="json")})
    return m.model_dump(mode="json")


# ═══════════════════════════════════════════════════════════════
# Files
# ═══════════════════════════════════════════════════════════════


@router.get("/files")
async def list_files() -> list[dict[str, Any]]:
    import os as _os
    files = []
    for candidate in ["/app/docs", "./docs", "/tmp/arpit-mission-control/docs"]:
        if _os.path.exists(candidate):
            docs_dir = candidate
            break
    else:
        docs_dir = "/app/docs"
    if _os.path.exists(docs_dir):
        for f in sorted(_os.listdir(docs_dir)):
            fpath = _os.path.join(docs_dir, f)
            if _os.path.isfile(fpath):
                files.append({
                    "name": f,
                    "size": _os.path.getsize(fpath),
                    "modified": datetime.fromtimestamp(_os.path.getmtime(fpath)).isoformat(),
                })
    return files


@router.get("/files/{filename}/content")
async def get_file_content(filename: str) -> dict[str, Any]:
    import os as _os
    for candidate in ["/app/docs", "./docs", "/tmp/arpit-mission-control/docs"]:
        if _os.path.exists(candidate):
            fpath = _os.path.join(candidate, filename)
            if _os.path.isfile(fpath):
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    return {"content": f.read(), "name": filename}
    raise HTTPException(404, "File not found")


@router.get("/files/{filename}/download")
async def download_file(filename: str):
    import os as _os
    from fastapi.responses import FileResponse
    for candidate in ["/app/docs", "./docs", "/tmp/arpit-mission-control/docs"]:
        if _os.path.exists(candidate):
            fpath = _os.path.join(candidate, filename)
            if _os.path.isfile(fpath):
                return FileResponse(fpath, filename=filename)
    raise HTTPException(404, "File not found")


# ═══════════════════════════════════════════════════════════════
# System
# ═══════════════════════════════════════════════════════════════


@router.get("/system")
async def system_info() -> dict[str, Any]:
    try:
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        boot = datetime.fromtimestamp(psutil.boot_time())
        uptime = str(datetime.now() - boot)
    except Exception:
        cpu, uptime = 0.0, "unknown"
        mem = type("M", (), {"percent": 0, "total": 0, "used": 0})()
        disk = type("D", (), {"percent": 0, "total": 0, "used": 0})()
    return {
        "cpu_percent": cpu,
        "memory_percent": mem.percent,
        "memory_total_gb": round(mem.total / (1024**3), 1),
        "memory_used_gb": round(mem.used / (1024**3), 1),
        "disk_percent": disk.percent,
        "disk_total_gb": round(disk.total / (1024**3), 1),
        "disk_used_gb": round(disk.used / (1024**3), 1),
        "uptime": uptime,
        "platform": platform.platform(),
    }


# ═══════════════════════════════════════════════════════════════
# Cron
# ═══════════════════════════════════════════════════════════════


@router.get("/cron")
async def cron_jobs() -> list[dict[str, Any]]:
    return [
        {"name": "shopify_sync", "schedule": "*/5 * * * *", "last_run": None, "status": "active", "description": "Sync Shopify order data"},
        {"name": "meta_ads_sync", "schedule": "*/15 * * * *", "last_run": None, "status": "active", "description": "Sync Meta Ads spend/ROAS"},
        {"name": "agent_health_check", "schedule": "*/2 * * * *", "last_run": None, "status": "active", "description": "Check agent heartbeats"},
        {"name": "daily_report", "schedule": "0 9 * * *", "last_run": None, "status": "active", "description": "Generate daily performance report"},
        {"name": "weekly_digest", "schedule": "0 10 * * 1", "last_run": None, "status": "active", "description": "Weekly summary digest"},
    ]


@router.post("/cron/{job_name}/trigger")
async def trigger_cron(job_name: str, session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    """Manually trigger a cron job."""
    entry = ActivityFeedEntry(
        type="status",
        from_agent="SCHEDULER",
        content=f"Manual trigger: {job_name}",
    )
    session.add(entry)
    await session.commit()
    await _broadcast_ws({"type": "activity", "entry": entry.model_dump(mode="json")})
    return {"ok": True, "job": job_name, "triggered_at": utcnow().isoformat()}


# ═══════════════════════════════════════════════════════════════
# Broadcast
# ═══════════════════════════════════════════════════════════════


@router.post("/broadcast")
async def broadcast(body: dict[str, Any], session: AsyncSession = SESSION_DEP) -> dict[str, Any]:
    content = body.get("message", "")
    entry = ActivityFeedEntry(
        type="broadcast",
        from_agent="SYSTEM",
        content=content,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    await _broadcast_ws({"type": "broadcast", "entry": entry.model_dump(mode="json")})
    return {"ok": True, "entry_id": str(entry.id)}


# ═══════════════════════════════════════════════════════════════
# Ingest (agent token auth — separate from JWT)
# ═══════════════════════════════════════════════════════════════

_TASK_UID_PATTERN = re.compile(r"MC-[A-Z]{2,3}-\d{4}")


@router.post("/ingest")
async def ingest(
    body: dict[str, Any],
    authorization: str | None = Header(None),
    session: AsyncSession = SESSION_DEP,
) -> dict[str, Any]:
    """Agent ingest endpoint. Uses token auth (NOT JWT)."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != INGEST_TOKEN:
        raise HTTPException(401, "Invalid ingest token")

    agent_name = body.get("agent", body.get("from_agent", "unknown"))
    content = body.get("content", "")
    msg_type = body.get("type", "message")

    # Create activity feed entry
    entry = ActivityFeedEntry(
        type=msg_type,
        from_agent=agent_name,
        content=content,
    )
    session.add(entry)

    # Parse content for task UIDs (MC-XXX-NNNN)
    task_uids = _TASK_UID_PATTERN.findall(content)
    matched_tasks = []

    for uid in set(task_uids):
        task_result = await session.exec(  # type: ignore[arg-type]
            select(MCTask).where(MCTask.task_uid == uid)
        )
        task = task_result.first()
        if not task:
            continue

        matched_tasks.append(uid)

        # Create activity log for matched task
        log_entry = TaskActivityLog(
            task_id=task.id,
            task_uid=uid,
            action="agent_update",
            actor=agent_name,
            actor_type="agent",
            details={"content": content[:500]},
        )
        session.add(log_entry)

        # Auto-add system comment
        comment = TaskComment(
            task_id=task.id,
            task_uid=uid,
            author=agent_name,
            author_type="agent",
            content=content,
            is_system_message=True,
        )
        session.add(comment)

        # Auto-transition to review if content signals completion
        if any(marker in content.upper() for marker in ["DONE", "COMPLETED", "FINISHED"]):
            if task.status == "in_progress":
                task.status = "review"
                task.updated_at = utcnow()
                session.add(task)

                status_log = TaskActivityLog(
                    task_id=task.id,
                    task_uid=uid,
                    action="status_changed",
                    actor=agent_name,
                    actor_type="agent",
                    details={"from": "in_progress", "to": "review", "auto": True},
                )
                session.add(status_log)

    await session.commit()
    await session.refresh(entry)

    data = entry.model_dump(mode="json")
    await _broadcast_ws({"type": "activity", "entry": data})

    return {
        "ok": True,
        "entry_id": str(entry.id),
        "matched_tasks": matched_tasks,
    }


# ═══════════════════════════════════════════════════════════════
# WebSocket
# ═══════════════════════════════════════════════════════════════


@router.websocket("/ws")
async def websocket_feed(websocket: WebSocket) -> None:
    await websocket.accept()
    _ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)
