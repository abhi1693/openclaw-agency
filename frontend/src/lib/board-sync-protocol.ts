/**
 * 看板实时同步 WebSocket 协议类型定义 (M9)。
 *
 * 端点：/ws/board/{boardId}/sync
 *
 * 所有消息均为带有 `type` 判别字段的 JSON 对象。
 */

export type TaskStatus = "inbox" | "in_progress" | "review" | "done";

export type ActorRef = {
  type: "user" | "agent";
  id: string;
  name?: string;
};

export type BoardSyncTask = {
  id: string;
  board_id: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: string;
  due_at?: string | null;
  in_progress_at?: string | null;
  assigned_agent_id?: string | null;
  created_by_user_id?: string | null;
  auto_created?: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentSuggestion = {
  id: string;
  title: string;
  description?: string | null;
  suggestion_type: string;
  priority: string;
  confidence: number;
  status: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

// ── 服务端 → 客户端消息 ──────────────────────────────────────────────────────

export type BoardStateMessage = {
  type: "board.state";
  tasks: BoardSyncTask[];
  timestamp: string;
};

export type TaskUpdatedMessage = {
  type: "task.updated";
  task_id: string;
  changes: Partial<BoardSyncTask> & { previous_status?: string };
  updated_by: ActorRef;
  timestamp: string;
};

export type TaskCreatedMessage = {
  type: "task.created";
  task: BoardSyncTask;
  timestamp: string;
};

export type TaskDeletedMessage = {
  type: "task.deleted";
  task_id: string;
  timestamp: string;
};

export type SuggestionNewMessage = {
  type: "suggestion.new";
  suggestion: AgentSuggestion;
};

export type HeartbeatAckMessage = {
  type: "heartbeat_ack";
  id?: string;
};

export type ServerMessage =
  | BoardStateMessage
  | TaskUpdatedMessage
  | TaskCreatedMessage
  | TaskDeletedMessage
  | SuggestionNewMessage
  | HeartbeatAckMessage;

// ── 客户端 → 服务端消息 ──────────────────────────────────────────────────────

export type TaskMoveMessage = {
  type: "task.move";
  task_id: string;
  status: TaskStatus;
};

export type TaskCreateMessage = {
  type: "task.create";
  title: string;
  status: TaskStatus;
  assignee_id?: string;
};

export type HeartbeatMessage = {
  type: "heartbeat";
  id?: string;
};

export type ClientMessage = TaskMoveMessage | TaskCreateMessage | HeartbeatMessage;

// ── 连接状态 ─────────────────────────────────────────────────────────────────

export type BoardSyncConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";
