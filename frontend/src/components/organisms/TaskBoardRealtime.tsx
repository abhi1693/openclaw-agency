"use client";

/**
 * TaskBoardRealtime — 为现有 TaskBoard 添加 WebSocket 实时同步能力 (M9)。
 *
 * 职责：
 * - 通过 useBoardSync Hook 连接 /ws/board/{boardId}/sync。
 * - 将增量服务端事件（task.created / task.updated / task.deleted）
 *   合并到本地状态中，覆盖 React Query 缓存。
 * - 将合并后的任务列表传递给现有 <TaskBoard /> 组件渲染。
 * - 向管理员用户展示连接状态指示器。
 * - 收到建议时渲染内联 AI 建议条。
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

  // 本地任务状态 — 初始化自 initialTasks，随 WS 事件更新。
  const [tasks, setTasks] =
    useState<TaskBoardCompatibleTask[]>(initialTasks);
  const [suggestions, setSuggestions] = useState<AgentSuggestion[]>([]);
  const [receivedInitialState, setReceivedInitialState] = useState(false);

  // 在收到 WS 下发的权威 board.state 之前，同步 React Query 的更新。
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
      return [suggestion, ...prev.slice(0, 4)]; // 最多保留 5 条建议
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
      // 乐观更新本地状态
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
      );
      // 通过 WS 发送任务移动消息到服务端
      const wsMsg: ClientMessage = {
        type: "task.move",
        task_id: taskId,
        status,
      };
      sendMessage(wsMsg);
      // 若父组件提供了 REST 回调也一并触发
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
