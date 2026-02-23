/**
 * Board sync WebSocket protocol types (M9).
 *
 * Endpoint: /ws/board/{boardId}/sync
 *
 * All messages are JSON objects with a `type` discriminant.
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

// ── Server → Client messages ────────────────────────────────────────────────

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

// ── Client → Server messages ────────────────────────────────────────────────

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

// ── Connection state ─────────────────────────────────────────────────────────

export type BoardSyncConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";
