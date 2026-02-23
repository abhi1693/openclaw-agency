"use client";

/**
 * useBoardSync — M9 看板实时同步 WebSocket Hook。
 *
 * 连接 /ws/board/{boardId}/sync，处理鉴权、心跳、
 * 指数退避自动重连，并通过回调将服务端事件合并到任务状态中。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BoardSyncConnectionState,
  BoardSyncTask,
  AgentSuggestion,
  ClientMessage,
  ServerMessage,
} from "@/lib/board-sync-protocol";

const HEARTBEAT_INTERVAL_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

export type BoardSyncCallbacks = {
  /** 收到初始 board.state 时调用，包含完整任务列表。 */
  onBoardState?: (tasks: BoardSyncTask[]) => void;
  /** 任务更新时调用；changes 包含变更字段。 */
  onTaskUpdated?: (
    taskId: string,
    changes: Partial<BoardSyncTask> & { previous_status?: string },
  ) => void;
  /** 新任务创建时调用。 */
  onTaskCreated?: (task: BoardSyncTask) => void;
  /** 任务删除时调用。 */
  onTaskDeleted?: (taskId: string) => void;
  /** 收到 AI 新建议时调用。 */
  onSuggestionNew?: (suggestion: AgentSuggestion) => void;
};

export type UseBoardSyncOptions = {
  boardId: string;
  /** 管理员 Bearer Token（本地令牌或 Clerk JWT）。 */
  token: string | null | undefined;
  /** API 服务器基础 URL（默认使用 window.origin）。 */
  apiBaseUrl?: string;
  /** 看板同步事件回调。 */
  callbacks?: BoardSyncCallbacks;
  /** 禁用连接（如 token 尚未就绪时）。 */
  enabled?: boolean;
};

export type UseBoardSyncResult = {
  connectionState: BoardSyncConnectionState;
  /** 向服务端发送消息（task.move / task.create）。 */
  sendMessage: (msg: ClientMessage) => void;
};

export function useBoardSync({
  boardId,
  token,
  apiBaseUrl,
  callbacks,
  enabled = true,
}: UseBoardSyncOptions): UseBoardSyncResult {
  const [connectionState, setConnectionState] =
    useState<BoardSyncConnectionState>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || !token || !enabled) return;

    const base =
      apiBaseUrl ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:8000");

    const wsBase = base.replace(/^http/, "ws").replace(/^https/, "wss");
    const url = `${wsBase}/ws/board/${boardId}/sync?token=${encodeURIComponent(token)}`;

    setConnectionState(
      reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting",
    );

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      reconnectAttemptsRef.current = 0;
      setConnectionState("connected");

      // 启动心跳定时器
      clearHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "heartbeat", id: String(Date.now()) }),
          );
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }

      const cbs = callbacksRef.current;
      switch (msg.type) {
        case "board.state":
          cbs?.onBoardState?.(msg.tasks);
          break;
        case "task.updated":
          cbs?.onTaskUpdated?.(msg.task_id, msg.changes);
          break;
        case "task.created":
          cbs?.onTaskCreated?.(msg.task);
          break;
        case "task.deleted":
          cbs?.onTaskDeleted?.(msg.task_id);
          break;
        case "suggestion.new":
          cbs?.onSuggestionNew?.(msg.suggestion);
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      // onclose 事件将在之后触发并处理重连逻辑。
    };

    ws.onclose = (event: CloseEvent) => {
      clearHeartbeat();
      wsRef.current = null;

      if (!mountedRef.current) return;

      // 4001 = 未授权，4004 = 看板不存在 — 不重连。
      if (event.code === 4001 || event.code === 4004) {
        setConnectionState("disconnected");
        return;
      }

      reconnectAttemptsRef.current += 1;
      const delay = Math.min(
        BACKOFF_BASE_MS *
          Math.pow(BACKOFF_MULTIPLIER, reconnectAttemptsRef.current - 1),
        BACKOFF_MAX_MS,
      );
      setConnectionState("reconnecting");

      clearReconnect();
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [boardId, token, apiBaseUrl, enabled, clearHeartbeat, clearReconnect]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;

    if (enabled && token) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      clearHeartbeat();
      clearReconnect();
      wsRef.current?.close();
      wsRef.current = null;
      setConnectionState("disconnected");
    };
  }, [boardId, token, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connectionState, sendMessage };
}
