// ── Existing Interfaces ──

export interface MCAgent {
  id: string; name: string; emoji: string; role: string; department: string;
  status: string; last_active: string | null; model_used: string | null;
  tokens_today: number; cost_today: number;
}

export interface Brand {
  id: string; name: string; type: string; domain: string | null;
  revenue_target: number; current_revenue: number;
  latest_performance?: PerfSnap;
}

export interface PerfSnap {
  id: string; brand_id: string; date: string; revenue: number; orders: number;
  aov: number; ad_spend: number; roas: number; impressions: number; clicks: number;
}

export interface ActivityEntry {
  id: string; type: string; from_agent: string | null; to_agent: string | null;
  content: string; mission_id: string | null; timestamp: string;
}

export interface SystemInfo {
  cpu_percent: number; memory_percent: number; memory_total_gb: number;
  memory_used_gb: number; disk_percent: number; disk_total_gb: number;
  disk_used_gb: number; uptime: string; platform: string;
}

export type Tab = "dashboard" | "tasks" | "performance" | "agents" | "comms" | "files" | "schedules" | "system";

// ── Enhanced Task Model ──

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  completed_at: string | null;
  completed_by: string | null;
}

export interface ReferenceDoc {
  title: string;
  url?: string;
  path?: string;
  type: string;
}

export interface MCTask {
  id: string;
  task_uid: string;
  title: string;
  description: string | null;
  category: string;
  sub_category: string | null;
  priority: string;
  urgency_flag: boolean;
  status: string;
  blocked_reason: string | null;
  assigned_agent: string | null;
  collaborator_agents: string[] | null;
  created_by: string | null;
  assigned_by: string | null;
  brand_id: string | null;
  brand_name: string | null;
  checklist: ChecklistItem[] | null;
  checklist_progress: number;
  skills_required: string[] | null;
  reference_docs: ReferenceDoc[] | null;
  notes: string | null;
  tags: string[] | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  parent_task_id: string | null;
  depends_on: string[] | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  comment_count?: number;
}

// ── Task Activity Log ──

export interface TaskActivityLog {
  id: string;
  task_id: string;
  task_uid: string;
  action: string;
  actor: string;
  actor_type: string;
  details: Record<string, any> | null;
  timestamp: string;
}

// ── Task Comment ──

export interface TaskComment {
  id: string;
  task_id: string;
  task_uid: string;
  author: string;
  author_type: string;
  content: string;
  parent_comment_id: string | null;
  mentions: string[] | null;
  is_system_message: boolean;
  created_at: string;
}

// ── User Model ──

export interface MCUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "operator" | "agent_manager" | "viewer";
  permissions: string[];
  brand_access: string[] | null;
  department_access: string[] | null;
  avatar_url: string | null;
}

// ── Task Summary (for dashboard) ──

export interface TaskSummary {
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  by_agent: Record<string, number>;
  done_today: number;
  overdue: number;
  critical: number;
  overdue_tasks: MCTask[];
  critical_tasks: MCTask[];
  agent_workloads: AgentWorkload[];
}

export interface AgentWorkload {
  agent_name: string;
  active_count: number;
  next_due: string | null;
  categories: string[];
}

// ── Task Display Constants ──

export const TASK_CATEGORIES = {
  marketing:   { label: "Marketing",   code: "MKT", color: "#F97316", icon: "Megaphone",    bgLight: "#FFF7ED" },
  development: { label: "Development", code: "DEV", color: "#3B82F6", icon: "Code2",        bgLight: "#EFF6FF" },
  operations:  { label: "Operations",  code: "OPS", color: "#22C55E", icon: "Settings2",    bgLight: "#F0FDF4" },
  finance:     { label: "Finance",     code: "FIN", color: "#A855F7", icon: "DollarSign",   bgLight: "#FAF5FF" },
  qa:          { label: "QA",          code: "QA",  color: "#EF4444", icon: "ShieldCheck",  bgLight: "#FEF2F2" },
  growth:      { label: "Growth",      code: "GRW", color: "#14B8A6", icon: "TrendingUp",   bgLight: "#F0FDFA" },
  creative:    { label: "Creative",    code: "CRE", color: "#EC4899", icon: "Palette",      bgLight: "#FDF2F8" },
  support:     { label: "Support",     code: "SUP", color: "#F59E0B", icon: "Headphones",   bgLight: "#FFFBEB" },
  strategy:    { label: "Strategy",    code: "STR", color: "#6366F1", icon: "Target",       bgLight: "#EEF2FF" },
  general:     { label: "General",     code: "GEN", color: "#6B7280", icon: "Inbox",        bgLight: "#F9FAFB" },
} as const;

export const TASK_PRIORITIES = {
  critical: { label: "Critical", color: "#EF4444", bgLight: "#FEF2F2", icon: "AlertTriangle", pulse: true },
  high:     { label: "High",     color: "#F97316", bgLight: "#FFF7ED", icon: "ArrowUp" },
  medium:   { label: "Medium",   color: "#3B82F6", bgLight: "#EFF6FF", icon: "Minus" },
  low:      { label: "Low",      color: "#6B7280", bgLight: "#F9FAFB", icon: "ArrowDown" },
} as const;

export const TASK_STATUSES = {
  inbox:       { label: "Inbox",       color: "#6B7280", bgLight: "#F9FAFB" },
  assigned:    { label: "Assigned",    color: "#3B82F6", bgLight: "#EFF6FF" },
  in_progress: { label: "In Progress", color: "#F59E0B", bgLight: "#FFFBEB" },
  blocked:     { label: "Blocked",     color: "#EF4444", bgLight: "#FEF2F2" },
  review:      { label: "Review",      color: "#7C5CFC", bgLight: "#F5F3FF" },
  done:        { label: "Done",        color: "#22C55E", bgLight: "#F0FDF4" },
  archived:    { label: "Archived",    color: "#9CA3AF", bgLight: "#F3F4F6" },
} as const;

export const AGENT_EMOJIS: Record<string, string> = {
  Jarvis: "🫡", Atlas: "🗺️", Scout: "🔍", Sage: "✍️", Ghost: "👻",
  Forge: "🔥", Blade: "⚔️", Ember: "📧", Keeper: "🔑", Vault: "🏪",
  Shield: "🛡️", Prism: "📊", Sentinel: "✅", Pixel: "💻", Ledger: "💰",
  Abacus: "🧮", Analytics: "📈",
};

export const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner:         { label: "Owner",          color: "#EF4444" },
  admin:         { label: "Admin",          color: "#F97316" },
  operator:      { label: "Operator",       color: "#3B82F6" },
  agent_manager: { label: "Agent Manager",  color: "#22C55E" },
  viewer:        { label: "Viewer",         color: "#6B7280" },
};

export const PERMISSIONS = {
  TASK_VIEW: "task:view",
  TASK_CREATE: "task:create",
  TASK_EDIT: "task:edit",
  TASK_DELETE: "task:delete",
  TASK_ASSIGN: "task:assign",
  TASK_CHANGE_STATUS: "task:change_status",
  TASK_CHANGE_PRIORITY: "task:change_priority",
  TASK_COMMENT: "task:comment",
  TASK_CHECKLIST_EDIT: "task:checklist_edit",
  AGENT_VIEW: "agent:view",
  AGENT_EDIT: "agent:edit",
  AGENT_COMMAND: "agent:command",
  BRAND_VIEW: "brand:view",
  BRAND_EDIT: "brand:edit",
  BRAND_CREDENTIALS: "brand:credentials",
  COMMS_VIEW: "comms:view",
  COMMS_BROADCAST: "comms:broadcast",
  ESCALATION_VIEW: "escalation:view",
  SYSTEM_VIEW: "system:view",
  SYSTEM_CRON_TRIGGER: "system:cron_trigger",
  SYSTEM_CRON_MANAGE: "system:cron_manage",
  CONTENT_VIEW: "content:view",
  CONTENT_MANAGE: "content:manage",
  FILES_VIEW: "files:view",
  FILES_EDIT: "files:edit",
  USER_VIEW: "user:view",
  USER_MANAGE: "user:manage",
  USER_MANAGE_ADMINS: "user:manage_admins",
  DASHBOARD_VIEW: "dashboard:view",
  DASHBOARD_REVENUE: "dashboard:revenue",
  DASHBOARD_COSTS: "dashboard:costs",
} as const;
