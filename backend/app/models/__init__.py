"""Model exports for SQLAlchemy/SQLModel metadata discovery."""

from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.amazon_orders import (
    AdMetric,
    AmazonOrder,
    AmazonOrderItem,
    Campaign,
    DailySales,
    FinancialEvent,
    InventorySnapshot,
    PpcAnalysisSnapshot,
    PricingSnapshot,
    ProductSales,
    RefundClaim,
    ReimbursementEvent,
    ReturnEvent,
    SearchTermReport,
)
from app.models.approval_task_links import ApprovalTaskLink
from app.models.approvals import Approval
from app.models.board_group_memory import BoardGroupMemory
from app.models.board_groups import BoardGroup
from app.models.board_memory import BoardMemory
from app.models.board_onboarding import BoardOnboardingSession
from app.models.board_webhook_payloads import BoardWebhookPayload
from app.models.board_webhooks import BoardWebhook
from app.models.boards import Board
from app.models.gateways import Gateway
from app.models.organization_board_access import OrganizationBoardAccess
from app.models.organization_invite_board_access import OrganizationInviteBoardAccess
from app.models.organization_invites import OrganizationInvite
from app.models.organization_members import OrganizationMember
from app.models.organizations import Organization
from app.models.skills import GatewayInstalledSkill, MarketplaceSkill, SkillPack
from app.models.tag_assignments import TagAssignment
from app.models.tags import Tag
from app.models.task_custom_fields import (
    BoardTaskCustomField,
    TaskCustomFieldDefinition,
    TaskCustomFieldValue,
)
from app.models.task_dependencies import TaskDependency
from app.models.task_fingerprints import TaskFingerprint
from app.models.tasks import Task
from app.models.ppc_automation import (
    BidRecommendation,
    BudgetAllocation,
    HourlyCampaignMetric,
    KeywordRecommendation,
    PpcAutomationSettings,
    PpcChangeLog,
    PpcEntitySnapshot,
    PpcProposal,
    PpcProposalItem,
    PpcRunHistory,
)
from app.models.shipments import Shipment, ShipmentEvent
from app.models.users import User

__all__ = [
    "ActivityEvent",
    "AdMetric",
    "Agent",
    "AmazonOrder",
    "AmazonOrderItem",
    "ApprovalTaskLink",
    "Approval",
    "BoardGroupMemory",
    "BoardWebhook",
    "BoardWebhookPayload",
    "BoardMemory",
    "BoardOnboardingSession",
    "BoardGroup",
    "Board",
    "Campaign",
    "DailySales",
    "FinancialEvent",
    "Gateway",
    "GatewayInstalledSkill",
    "MarketplaceSkill",
    "SkillPack",
    "InventorySnapshot",
    "Organization",
    "BoardTaskCustomField",
    "TaskCustomFieldDefinition",
    "TaskCustomFieldValue",
    "OrganizationMember",
    "OrganizationBoardAccess",
    "OrganizationInvite",
    "OrganizationInviteBoardAccess",
    "PpcAnalysisSnapshot",
    "PpcAutomationSettings",
    "PpcChangeLog",
    "PpcEntitySnapshot",
    "PpcProposal",
    "PpcProposalItem",
    "PpcRunHistory",
    "PricingSnapshot",
    "ProductSales",
    "RefundClaim",
    "ReimbursementEvent",
    "ReturnEvent",
    "SearchTermReport",
    "TaskDependency",
    "BidRecommendation",
    "BudgetAllocation",
    "HourlyCampaignMetric",
    "KeywordRecommendation",
    "Task",
    "TaskFingerprint",
    "Tag",
    "TagAssignment",
    "Shipment",
    "ShipmentEvent",
    "User",
]
