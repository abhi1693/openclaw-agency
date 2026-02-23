import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildWsUrl } from "../lib/h5-auth";
import { WSMessage } from "../lib/ws-client";
import { useH5Auth } from "../hooks/useH5Auth";
import { useWebSocket } from "../hooks/useWebSocket";
import { ChatBubble, ChatMessage, TypingIndicator } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { H5Header } from "./H5Header";

interface ChatWindowProps { agentId: string; agentName?: string; sessionId?: string; }
let msgCounter = 0;
const nextId = () => `local-${++msgCounter}`;

export function ChatWindow({ agentId, agentName, sessionId }: ChatWindowProps) {
  const { t } = useTranslation();
  const { token } = useH5Auth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { status, sendChat, onMessage } = useWebSocket({ url: buildWsUrl(), token, enabled: !!token });

  useEffect(() => {
    const unsub = onMessage("chat_reply", (msg: WSMessage) => {
      const payload = msg.payload as { content?: string; agent_id?: string; session_id?: string; };
      if (payload.agent_id !== agentId) return;
      setIsTyping(false);
      setMessages(prev => [...prev, { id: msg.id ?? nextId(), content: payload.content ?? "", role: "agent", agentId, agentName, timestamp: new Date() }]);
    });
    return unsub;
  }, [onMessage, agentId, agentName]);

  useEffect(() => {
    const unsub = onMessage("system", (msg: WSMessage) => {
      const payload = msg.payload as { event?: string; };
      if (payload.event === "agent_offline") { setIsTyping(false); setMessages(prev => [...prev, { id: nextId(), content: t("chat.agentOffline"), role: "agent", agentId, agentName, timestamp: new Date() }]); }
    });
    return unsub;
  }, [onMessage, agentId, agentName, t]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const handleSend = useCallback((content: string) => {
    const msgId = nextId();
    setMessages(prev => [...prev, { id: msgId, content, role: "user", timestamp: new Date() }]);
    setIsTyping(true);
    sendChat(agentId, content, sessionId, msgId);
  }, [agentId, sessionId, sendChat]);

  const isInputDisabled = status === "disconnected" || status === "connecting";

  return (
    <div className="flex h-full flex-col">
      <H5Header title={agentName ?? t("chat.defaultTitle")} backTo="/sessions" connectionStatus={status} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center text-sm text-gray-400"><p>{t("chat.emptyState")}</p></div>}
        <div className="space-y-4">
          {messages.map(msg => <ChatBubble key={msg.id} message={msg} />)}
          {isTyping && <TypingIndicator agentName={agentName} />}
          <div ref={bottomRef} />
        </div>
      </div>
      <ChatInput onSend={handleSend} disabled={isInputDisabled} placeholder={isInputDisabled ? t("chat.connectingPlaceholder") : t("chat.inputPlaceholder")} />
    </div>
  );
}
