"""OpenClaw lifecycle services package."""

from .admin_service import (
    AbstractGatewayMainAgentManager,
    DefaultGatewayMainAgentManager,
    GatewayAdminLifecycleService,
)
from .agent_service import (
    AbstractProvisionExecution,
    ActorContextLike,
    AgentLifecycleService,
    AgentUpdateOptions,
    AgentUpdateProvisionRequest,
    AgentUpdateProvisionTarget,
    BoardAgentProvisionExecution,
    MainAgentProvisionExecution,
)
from .constants import DEFAULT_CHANNEL_HEARTBEAT_VISIBILITY, DEFAULT_HEARTBEAT_CONFIG
from .coordination_service import AbstractGatewayMessagingService, GatewayCoordinationService
from .exceptions import (
    GatewayErrorPolicy,
    GatewayOperation,
    map_gateway_error_message,
    map_gateway_error_to_http_exception,
)
from .onboarding_service import BoardOnboardingMessagingService
from .provisioning import (
    AgentProvisionRequest,
    LeadAgentOptions,
    LeadAgentRequest,
    MainAgentProvisionRequest,
    ProvisionOptions,
    cleanup_agent,
    ensure_board_lead_agent,
    patch_gateway_agent_heartbeats,
    provision_agent,
    provision_main_agent,
    sync_gateway_agent_heartbeats,
)
from .session_service import GatewaySessionService, GatewayTemplateSyncQuery
from .shared import (
    GatewayAgentIdentity,
    optional_gateway_config_for_board,
    require_gateway_config_for_board,
    resolve_trace_id,
    send_gateway_agent_message,
)

__all__ = [
    "AbstractGatewayMainAgentManager",
    "DefaultGatewayMainAgentManager",
    "GatewayAdminLifecycleService",
    "AbstractProvisionExecution",
    "ActorContextLike",
    "AgentLifecycleService",
    "AgentUpdateOptions",
    "AgentUpdateProvisionRequest",
    "AgentUpdateProvisionTarget",
    "BoardAgentProvisionExecution",
    "MainAgentProvisionExecution",
    "DEFAULT_CHANNEL_HEARTBEAT_VISIBILITY",
    "DEFAULT_HEARTBEAT_CONFIG",
    "AbstractGatewayMessagingService",
    "GatewayCoordinationService",
    "GatewayErrorPolicy",
    "GatewayOperation",
    "map_gateway_error_message",
    "map_gateway_error_to_http_exception",
    "BoardOnboardingMessagingService",
    "AgentProvisionRequest",
    "LeadAgentOptions",
    "LeadAgentRequest",
    "MainAgentProvisionRequest",
    "ProvisionOptions",
    "cleanup_agent",
    "ensure_board_lead_agent",
    "patch_gateway_agent_heartbeats",
    "provision_agent",
    "provision_main_agent",
    "sync_gateway_agent_heartbeats",
    "GatewaySessionService",
    "GatewayTemplateSyncQuery",
    "GatewayAgentIdentity",
    "optional_gateway_config_for_board",
    "require_gateway_config_for_board",
    "resolve_trace_id",
    "send_gateway_agent_message",
]
