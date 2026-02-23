"""RBAC permissions system for Mission Control.

Defines granular permissions, role-based permission mapping with hierarchical
inheritance, and helper functions for permission checks.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.mc_models import MCUser


class Permission(str, Enum):
    """All permissions in the system."""

    # === TASKS ===
    TASK_VIEW = "task:view"
    TASK_CREATE = "task:create"
    TASK_EDIT = "task:edit"
    TASK_DELETE = "task:delete"
    TASK_ASSIGN = "task:assign"
    TASK_CHANGE_STATUS = "task:change_status"
    TASK_CHANGE_PRIORITY = "task:change_priority"
    TASK_COMMENT = "task:comment"
    TASK_CHECKLIST_EDIT = "task:checklist_edit"

    # === AGENTS ===
    AGENT_VIEW = "agent:view"
    AGENT_EDIT = "agent:edit"
    AGENT_COMMAND = "agent:command"
    AGENT_PERFORMANCE_RATE = "agent:rate"

    # === BRANDS ===
    BRAND_VIEW = "brand:view"
    BRAND_EDIT = "brand:edit"
    BRAND_CREDENTIALS = "brand:credentials"

    # === COMMS ===
    COMMS_VIEW = "comms:view"
    COMMS_BROADCAST = "comms:broadcast"

    # === ESCALATIONS ===
    ESCALATION_VIEW = "escalation:view"
    ESCALATION_CREATE = "escalation:create"
    ESCALATION_RESOLVE = "escalation:resolve"

    # === SYSTEM ===
    SYSTEM_VIEW = "system:view"
    SYSTEM_CRON_TRIGGER = "system:cron_trigger"
    SYSTEM_CRON_MANAGE = "system:cron_manage"

    # === CONTENT ===
    CONTENT_VIEW = "content:view"
    CONTENT_MANAGE = "content:manage"

    # === FILES ===
    FILES_VIEW = "files:view"
    FILES_EDIT = "files:edit"

    # === USERS ===
    USER_VIEW = "user:view"
    USER_MANAGE = "user:manage"
    USER_MANAGE_ADMINS = "user:manage_admins"

    # === DASHBOARD ===
    DASHBOARD_VIEW = "dashboard:view"
    DASHBOARD_REVENUE = "dashboard:revenue"
    DASHBOARD_COSTS = "dashboard:costs"


# Role hierarchy (index = rank, higher inherits lower)
ROLE_HIERARCHY = ["viewer", "agent_manager", "operator", "admin", "owner"]

# Role -> additional permissions at that level
ROLE_PERMISSIONS: dict[str, set[Permission]] = {
    "viewer": {
        Permission.DASHBOARD_VIEW,
        Permission.TASK_VIEW,
        Permission.AGENT_VIEW,
        Permission.BRAND_VIEW,
        Permission.COMMS_VIEW,
        Permission.ESCALATION_VIEW,
        Permission.CONTENT_VIEW,
        Permission.FILES_VIEW,
    },
    "agent_manager": {
        Permission.TASK_CREATE,
        Permission.TASK_EDIT,
        Permission.TASK_ASSIGN,
        Permission.TASK_CHANGE_STATUS,
        Permission.TASK_COMMENT,
        Permission.TASK_CHECKLIST_EDIT,
        Permission.AGENT_COMMAND,
        Permission.AGENT_PERFORMANCE_RATE,
        Permission.ESCALATION_CREATE,
        Permission.DASHBOARD_REVENUE,
    },
    "operator": {
        Permission.TASK_CHANGE_PRIORITY,
        Permission.TASK_DELETE,
        Permission.COMMS_BROADCAST,
        Permission.ESCALATION_RESOLVE,
        Permission.SYSTEM_VIEW,
        Permission.SYSTEM_CRON_TRIGGER,
        Permission.CONTENT_MANAGE,
        Permission.FILES_EDIT,
        Permission.DASHBOARD_COSTS,
    },
    "admin": {
        Permission.AGENT_EDIT,
        Permission.BRAND_EDIT,
        Permission.SYSTEM_CRON_MANAGE,
        Permission.USER_VIEW,
        Permission.USER_MANAGE,
        Permission.BRAND_CREDENTIALS,
    },
    "owner": {
        Permission.USER_MANAGE_ADMINS,
    },
}


def get_user_permissions(role: str, custom_permissions: dict | None = None) -> set[Permission]:
    """Compute effective permissions for a user based on role + custom overrides."""
    role_index = ROLE_HIERARCHY.index(role) if role in ROLE_HIERARCHY else 0

    # Collect all permissions from this role and all lower roles
    perms: set[Permission] = set()
    for i in range(role_index + 1):
        perms |= ROLE_PERMISSIONS.get(ROLE_HIERARCHY[i], set())

    # Apply custom overrides
    if custom_permissions:
        for perm_str in custom_permissions.get("grant", []):
            try:
                perms.add(Permission(perm_str))
            except ValueError:
                pass
        for perm_str in custom_permissions.get("revoke", []):
            try:
                perms.discard(Permission(perm_str))
            except ValueError:
                pass

    return perms


def check_permission(user: MCUser, permission: Permission) -> bool:
    """Check if user has a specific permission."""
    perms = get_user_permissions(user.role, user.custom_permissions)
    return permission in perms
