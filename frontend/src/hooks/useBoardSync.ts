"use client";

/**
 * useBoardSync — WebSocket hook for M9 real-time board sync.
 *
 * Connects to /ws/board/{boardId}/sync, handles auth, heartbeat,
 * auto-reconnect with exponential backoff, and merges server events into
 * the provided task state via callbacks.
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
  /** Called with the full task list when initial board.state arrives. */
  onBoardState?: (tasks: BoardSyncTask[]) => void;
  /** Called when a task is updated; `changes` has the updated fields. */
  onTaskUpdated?: (
    taskId: string,
    changes: Partial<BoardSyncTask> & { previous_status?: string },
  ) => void;
  /** Called when a new task is created. */
  onTaskCreated?: (task: BoardSyncTask) => void;
  /** Called when a task is deleted. */
  onTaskDeleted?: (taskId: string) => void;
  /** Called when a new AI suggestion arrives. */
  onSuggestionNew?: (suggestion: AgentSuggestion) => void;
};

export type UseBoardSyncOptions = {
  boardId: string;
  /** Admin bearer token (local token or Clerk JWT). */
  token: string | null | undefined;
  /** Base URL of the API server (defaults to window origin). */
  apiBaseUrl?: string;
  /** Callbacks for board sync events. */
  callbacks?: BoardSyncCallbacks;
  /** Disable the connection (e.g. when token is not yet available). */
  enabled?: boolean;
};

export type UseBoardSyncResult = {
  connectionState: BoardSyncConnectionState;
  /** Send a message to the server (task.move / task.create). */
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

      // Start heartbeat
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
      // onclose will fire next and handle reconnect.
    };

    ws.onclose = (event: CloseEvent) => {
      clearHeartbeat();
      wsRef.current = null;

      if (!mountedRef.current) return;

      // 4001 = unauthorized, 4004 = board not found — don't reconnect.
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
