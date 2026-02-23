import { cn } from "../lib/utils";

export interface ChatMessage { id: string; content: string; role: "user" | "agent"; agentId?: string; agentName?: string; timestamp: Date; }
interface ChatBubbleProps { message: ChatMessage; }

function formatTime(date: Date): string { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

function AgentAvatar({ name }: { name?: string }) {
  const initials = name ? name.slice(0, 2).toUpperCase() : "AI";
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">{initials}</span>;
}

function UserAvatar() {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">Me</span>;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {isUser ? <UserAvatar /> : <AgentAvatar name={message.agentName} />}
      <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed", isUser ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-gray-100 text-gray-900")}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={cn("mt-1 text-right text-[10px]", isUser ? "text-blue-200" : "text-gray-400")}>{formatTime(message.timestamp)}</p>
      </div>
    </div>
  );
}

export function TypingIndicator({ agentName }: { agentName?: string }) {
  return (
    <div className="flex items-end gap-2">
      <AgentAvatar name={agentName} />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
