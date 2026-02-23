"use client";

import { useTranslation } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatBubble, ChatMessage, TypingIndicator } from "@/components/h5/ChatBubble";
import { ChatInput } from "@/components/h5/ChatInput";
import { H5Header } from "@/components/h5/H5Header";
import { useH5Auth } from "@/hooks/useH5Auth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { buildWsUrl } from "@/lib/h5-auth";
import { WSMessage } from "@/lib/ws-client";

interface ChatWindowProps {
  agentId: string;
  agentName?: string;
  sessionId?: string;
}

let msgCounter = 0;
const nextId = () => `local-${++msgCounter}`;

export function ChatWindow({ agentId, agentName, sessionId }: ChatWindowProps) {
  const { t } = useTranslation();
  const { token } = useH5Auth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { status, sendChat, onMessage } = useWebSocket({
    url: buildWsUrl(),
    token,
    enabled: !!token,
  });

  // Listen for incoming chat_reply messages
  useEffect(() => {
    const unsub = onMessage("chat_reply", (msg: WSMessage) => {
      const payload = msg.payload as {
        content?: string;
        agent_id?: string;
        session_id?: string;
      };
      if (payload.agent_id !== agentId) return;

      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: msg.id ?? nextId(),
          content: payload.content ?? "",
          role: "agent",
          agentId,
          agentName,
          timestamp: new Date(),
        },
      ]);
    });
    return unsub;
  }, [onMessage, agentId, agentName]);

  // Also listen for system messages (e.g., agent offline)
  useEffect(() => {
    const unsub = onMessage("system", (msg: WSMessage) => {
      const payload = msg.payload as { event?: string; message?: string };
      if (payload.event === "agent_offline") {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            content: t("h5.chat.agentOffline"),
            role: "agent",
            agentId,
            agentName,
            timestamp: new Date(),
          },
        ]);
      }
    });
    return unsub;
  }, [onMessage, agentId, agentName, t]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = useCallback(
    (content: string) => {
      const msgId = nextId();
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          content,
          role: "user",
          timestamp: new Date(),
        },
      ]);
      setIsTyping(true);
      sendChat(agentId, content, sessionId, msgId);
    },
    [agentId, sessionId, sendChat],
  );

  const isInputDisabled =
    status === "disconnected" || status === "connecting";

  return (
    <div className="flex h-full flex-col">
      <H5Header
        title={agentName ?? t("h5.chat.defaultTitle")}
        backHref="/h5/chat"
        connectionStatus={status}
      />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted">
            <p>{t("h5.chat.emptyState")}</p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isTyping && <TypingIndicator agentName={agentName} />}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput
        onSend={handleSend}
        disabled={isInputDisabled}
        placeholder={
          isInputDisabled
            ? t("h5.chat.connectingPlaceholder")
            : t("h5.chat.inputPlaceholder")
        }
      />
    </div>
  );
}
