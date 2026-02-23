"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { WSClient, WSConnectionStatus, WSMessage } from "@/lib/ws-client";

export interface UseWebSocketOptions {
  url: string;
  token: string | null;
  enabled?: boolean;
}

export interface UseWebSocketReturn {
  status: WSConnectionStatus;
  send: (
    type: string,
    payload: Record<string, unknown>,
    id?: string,
  ) => void;
  sendChat: (
    agentId: string,
    content: string,
    sessionId?: string,
    msgId?: string,
  ) => void;
  onMessage: (type: string, handler: (msg: WSMessage) => void) => () => void;
  disconnect: () => void;
}

/**
 * React hook that manages a single WSClient instance for the H5 chat UI.
 *
 * - Connects when `enabled` is true and `token` is non-null.
 * - Disconnects and cleans up on unmount or when `enabled` becomes false.
 */
export function useWebSocket({
  url,
  token,
  enabled = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  // Initialize eagerly via useState initializer — creates exactly one WSClient per mount
  const [client] = useState<WSClient>(() => new WSClient());
  const clientRef = useRef<WSClient>(client);
  const [status, setStatus] = useState<WSConnectionStatus>("disconnected");

  useEffect(() => {
    const client = clientRef.current!;
    const unsub = client.onStatusChange(setStatus);
    return unsub;
  }, []);

  useEffect(() => {
    const client = clientRef.current!;
    if (!enabled || !token || !url) {
      client.disconnect();
      return;
    }
    client.connect(url, token);
    return () => {
      client.disconnect();
    };
  }, [url, token, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    const c = clientRef.current;
    return () => {
      c.disconnect();
    };
  }, []);

  const send = useCallback(
    (type: string, payload: Record<string, unknown>, id?: string) => {
      clientRef.current?.send(type, payload, id);
    },
    [],
  );

  const sendChat = useCallback(
    (agentId: string, content: string, sessionId?: string, msgId?: string) => {
      clientRef.current?.sendChat(agentId, content, sessionId, msgId);
    },
    [],
  );

  const onMessage = useCallback(
    (type: string, handler: (msg: WSMessage) => void) => {
      return clientRef.current?.onMessage(type, handler) ?? (() => undefined);
    },
    [],
  );

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  return { status, send, sendChat, onMessage, disconnect };
}
