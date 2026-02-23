"use client";

/**
 * TaskBoardRealtime — wraps the existing TaskBoard with WebSocket real-time sync (M9).
 *
 * Responsibilities:
 * - Connects to /ws/board/{boardId}/sync via useBoardSync hook.
 * - Merges incremental server events (task.created, task.updated, task.deleted)
 *   into local state that shadows the React Query cache.
 * - Renders the existing <TaskBoard /> with the merged task list.
 * - Shows a connection status indicator to admin users.
 * - Renders the inline AI suggestion strip when suggestions arrive.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  AgentSuggestion,
  BoardSyncTask,
  ClientMessage,
} from "@/lib/board-sync-protocol";
import { useBoardSync } from "@/hooks/useBoardSync";
import { TaskBoard } from "@/components/organisms/TaskBoard";
import { AITaskSuggestionInline } from "@/components/molecules/AITaskSuggestionInline";
import { cn } from "@/lib/utils";

type TaskStatus = "inbox" | "in_progress" | "review" | "done";

/** Minimal Task shape compatible with the existing TaskBoard component. */
type TaskBoardCompatibleTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  description?: string | null;
  due_at?: string | null;
  assigned_agent_id?: string | null;
  assignee?: string | null;
  approvals_pending_count?: number;
  tags?: Array<{ id: string; name: string; slug: string; color: string }>;
  depends_on_task_ids?: string[];
  blocked_by_task_ids?: string[];
  is_blocked?: boolean;
};

export type TaskBoardRealtimeProps = {
  boardId: string;
  /** Admin bearer token for WS auth. Pass null to disable real-time sync. */
  token: string | null | undefined;
  /** Initial tasks from React Query / SSR (used until board.state arrives). */
  initialTasks?: TaskBoardCompatibleTask[];
  onTaskSelect?: (task: TaskBoardCompatibleTask) => void;
  onTaskMove?: (taskId: string, status: TaskStatus) => void | Promise<void>;
  readOnly?: boolean;
  /** Base API URL for WS connection. Defaults to window.origin. */
  apiBaseUrl?: string;
};

function _syncTaskToBoard(t: BoardSyncTask): TaskBoardCompatibleTask {
  return {
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    priority: t.priority,
    description: t.description,
    due_at: t.due_at,
    assigned_agent_id: t.assigned_agent_id,
  };
}

export function TaskBoardRealtime({
  boardId,
  token,
  initialTasks = [],
  onTaskSelect,
  onTaskMove,
  readOnly = false,
  apiBaseUrl,
}: TaskBoardRealtimeProps) {
  const { t } = useTranslation();

  // Local task state — seeded from initialTasks and updated by WS events.
  const [tasks, setTasks] =
    useState<TaskBoardCompatibleTask[]>(initialTasks);
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [receivedInitialState, setReceivedInitialState] = useState(false);

  // Sync initialTasks changes (e.g. from React Query refetch) into local
  // state only until we have received the authoritative board.state from WS.
  useEffect(() => {
    if (!receivedInitialState) {
      setTasks(initialTasks);
    }
  }, [initialTasks, receivedInitialState]);

  const handleBoardState = useCallback((serverTasks: BoardSyncTask[]) => {
    setTasks(serverTasks.map(_syncTaskToBoard));
    setReceivedInitialState(true);
  }, []);

  const handleTaskUpdated = useCallback(
    (
      taskId: string,
      changes: Partial<BoardSyncTask> & { previous_status?: string },
    ) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const updated = { ...t };
          if (changes.status !== undefined)
            updated.status = changes.status as TaskStatus;
          if (changes.title !== undefined) updated.title = changes.title;
          if (changes.description !== undefined)
            updated.description = changes.description;
          if (changes.priority !== undefined)
            updated.priority = changes.priority;
          if (changes.assigned_agent_id !== undefined)
            updated.assigned_agent_id = changes.assigned_agent_id;
          return updated;
        }),
      );
    },
    [],
  );

  const handleTaskCreated = useCallback((task: BoardSyncTask) => {
    setTasks((prev) => {
      if (prev.some((t) => t.id === task.id)) return prev;
      return [_syncTaskToBoard(task), ...prev];
    });
  }, []);

  const handleTaskDeleted = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const handleSuggestionNew = useCallback((suggestion: AgentSuggestion) => {
    setSuggestions((prev) => {
      if (prev.some((s) => s.id === suggestion.id)) return prev;
      return [suggestion, ...prev.slice(0, 4)]; // keep at most 5 suggestions
    });
  }, []);

  const { connectionState, sendMessage } = useBoardSync({
    boardId,
    token,
    apiBaseUrl,
    enabled: Boolean(token),
    callbacks: {
      onBoardState: handleBoardState,
      onTaskUpdated: handleTaskUpdated,
      onTaskCreated: handleTaskCreated,
      onTaskDeleted: handleTaskDeleted,
      onSuggestionNew: handleSuggestionNew,
    },
  });

  const handleTaskMove = useCallback(
    async (taskId: string, status: TaskStatus) => {
      // Optimistic local update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
      );
      // Send to server via WS
      const wsMsg: ClientMessage = {
        type: "task.move",
        task_id: taskId,
        status,
      };
      sendMessage(wsMsg);
      // Also call the parent handler for REST mutation if provided
      if (onTaskMove) {
        await onTaskMove(taskId, status);
      }
    },
    [sendMessage, onTaskMove],
  );

  const connectionLabel = useMemo(() => {
    switch (connectionState) {
      case "connected":
        return t("boardSync.connected");
      case "connecting":
        return t("boardSync.connecting");
      case "reconnecting":
        return t("boardSync.reconnecting");
      case "disconnected":
        return t("boardSync.disconnected");
    }
  }, [connectionState, t]);

  const connectionColor = useMemo(() => {
    switch (connectionState) {
      case "connected":
        return "bg-green-500";
      case "connecting":
      case "reconnecting":
        return "bg-amber-400";
      case "disconnected":
        return "bg-slate-400";
    }
  }, [connectionState]);

  return (
    <div className="space-y-3">
      {/* Connection status indicator */}
      {token && (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connectionColor,
              connectionState === "connecting" ||
                connectionState === "reconnecting"
                ? "animate-pulse"
                : "",
            )}
          />
          <span className="text-xs text-slate-500">{connectionLabel}</span>
        </div>
      )}

      {/* Inline AI suggestion strip */}
      {suggestions.length > 0 && (
        <AITaskSuggestionInline
          suggestions={suggestions}
          onDismiss={(id) =>
            setSuggestions((prev) => prev.filter((s) => s.id !== id))
          }
        />
      )}

      {/* The existing TaskBoard — receives merged tasks */}
      <TaskBoard
        tasks={tasks}
        onTaskSelect={onTaskSelect}
        onTaskMove={handleTaskMove}
        readOnly={readOnly}
      />
    </div>
  );
}
