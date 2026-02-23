import { useCallback, useEffect, useRef, useState } from "react";
import { WSClient, WSConnectionStatus, WSMessage } from "../lib/ws-client";

export interface UseWebSocketOptions { url: string; token: string | null; enabled?: boolean; }
export interface UseWebSocketReturn { status: WSConnectionStatus; send: (type: string, payload: Record<string, unknown>, id?: string) => void; sendChat: (agentId: string, content: string, sessionId?: string, msgId?: string) => void; onMessage: (type: string, handler: (msg: WSMessage) => void) => () => void; disconnect: () => void; }

export function useWebSocket({ url, token, enabled = true }: UseWebSocketOptions): UseWebSocketReturn {
  const [client] = useState<WSClient>(() => new WSClient());
  const clientRef = useRef<WSClient>(client);
  const [status, setStatus] = useState<WSConnectionStatus>("disconnected");

  useEffect(() => { const c = clientRef.current; const unsub = c.onStatusChange(setStatus); return unsub; }, []);
  useEffect(() => { const c = clientRef.current; if (!enabled || !token || !url) { c.disconnect(); return; } c.connect(url, token); return () => { c.disconnect(); }; }, [url, token, enabled]);
  useEffect(() => { const c = clientRef.current; return () => { c.disconnect(); }; }, []);

  const send = useCallback((type: string, payload: Record<string, unknown>, id?: string) => { clientRef.current.send(type, payload, id); }, []);
  const sendChat = useCallback((agentId: string, content: string, sessionId?: string, msgId?: string) => { clientRef.current.sendChat(agentId, content, sessionId, msgId); }, []);
  const onMessage = useCallback((type: string, handler: (msg: WSMessage) => void) => { return clientRef.current.onMessage(type, handler); }, []);
  const disconnect = useCallback(() => { clientRef.current.disconnect(); }, []);

  return { status, send, sendChat, onMessage, disconnect };
}
