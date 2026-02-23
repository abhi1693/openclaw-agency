import { createExponentialBackoff } from "./backoff";

export type WSMessageType = "auth" | "auth_ok" | "auth_error" | "chat" | "chat_reply" | "heartbeat" | "heartbeat_ack" | "system" | "error";
export interface WSMessage { type: WSMessageType; id?: string; payload: Record<string, unknown>; timestamp?: string; }
export type WSConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
type MessageHandler = (msg: WSMessage) => void;
const HEARTBEAT_INTERVAL_MS = 30_000;

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private statusHandlers = new Set<(status: WSConnectionStatus) => void>();
  private url = "";
  private token = "";
  private shouldReconnect = false;
  private backoff = createExponentialBackoff({ baseMs: 1_000, factor: 2, maxMs: 30_000, jitter: 0.1 });
  private _status: WSConnectionStatus = "disconnected";

  get status(): WSConnectionStatus { return this._status; }

  private setStatus(s: WSConnectionStatus): void {
    if (this._status === s) return;
    this._status = s;
    this.statusHandlers.forEach((h) => h(s));
  }

  connect(url: string, token: string): void { this.url = url; this.token = token; this.shouldReconnect = true; this.backoff.reset(); this.openSocket(); }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.ws) { this.ws.close(1000, "client disconnect"); this.ws = null; }
    this.setStatus("disconnected");
  }

  send(type: string, payload: Record<string, unknown>, id?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: Record<string, unknown> = { type, payload };
    if (id) msg.id = id;
    this.ws.send(JSON.stringify(msg));
  }

  sendChat(agentId: string, content: string, sessionId?: string, msgId?: string): void {
    this.send("chat", { agent_id: agentId, content, session_id: sessionId }, msgId ?? crypto.randomUUID());
  }

  onMessage(type: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, new Set());
    this.messageHandlers.get(type)!.add(handler);
    return () => this.messageHandlers.get(type)?.delete(handler);
  }

  onStatusChange(handler: (status: WSConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private openSocket(): void {
    this.setStatus(this.backoff.attempt() === 0 ? "connecting" : "reconnecting");
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => { ws.send(JSON.stringify({ type: "auth", payload: { token: this.token } })); };
      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: WSMessage;
        try { msg = JSON.parse(event.data) as WSMessage; } catch { return; }
        if (msg.type === "auth_ok") { this.backoff.reset(); this.setStatus("connected"); this.startHeartbeat(); }
        else if (msg.type === "auth_error") { this.shouldReconnect = false; this.setStatus("disconnected"); }
        const handlers = this.messageHandlers.get(msg.type);
        handlers?.forEach((h) => h(msg));
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        this.ws = null; this.stopHeartbeat();
        if (this.shouldReconnect) { this.setStatus("reconnecting"); this.scheduleReconnect(); }
        else { this.setStatus("disconnected"); }
      };
    } catch {
      if (this.shouldReconnect) { this.setStatus("reconnecting"); this.scheduleReconnect(); }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const delay = this.backoff.nextDelayMs();
    this.reconnectTimer = setTimeout(() => { if (this.shouldReconnect) this.openSocket(); }, delay);
  }
  private clearReconnectTimer(): void { if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } }
  private startHeartbeat(): void { this.stopHeartbeat(); this.heartbeatTimer = setInterval(() => { this.send("heartbeat", {}, crypto.randomUUID()); }, HEARTBEAT_INTERVAL_MS); }
  private stopHeartbeat(): void { if (this.heartbeatTimer !== null) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } }
}
