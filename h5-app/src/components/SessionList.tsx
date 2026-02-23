import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

export interface ChatSession { id: string; agentId: string; agentName: string; boardName?: string; lastMessage?: string; lastMessageAt?: Date; unreadCount?: number; }
interface SessionListProps { sessions: ChatSession[]; activeSessionId?: string; isLoading?: boolean; }

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SessionList({ sessions, activeSessionId, isLoading = false }: SessionListProps) {
  const { t } = useTranslation();
  if (isLoading) return <div className="space-y-2 p-4">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>;
  if (sessions.length === 0) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <MessageCircle className="h-10 w-10 text-gray-300" />
      <p className="text-sm text-gray-500">{t("sessions.empty")}</p>
    </div>
  );
  return (
    <ul className="divide-y divide-gray-100">
      {sessions.map(session => (
        <li key={session.id}>
          <Link to={`/chat/${session.id}?agentId=${encodeURIComponent(session.agentId)}&agentName=${encodeURIComponent(session.agentName)}`}
            className={cn("flex items-center gap-3 px-4 py-4 transition-colors hover:bg-gray-50 active:bg-gray-100", activeSessionId === session.id && "bg-blue-50")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">{session.agentName.slice(0,2).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">{session.agentName}</span>
                {session.lastMessageAt && <span className="shrink-0 text-[10px] text-gray-400">{formatRelativeTime(session.lastMessageAt)}</span>}
              </div>
              {session.boardName && <p className="truncate text-xs text-gray-400">{session.boardName}</p>}
              {session.lastMessage && <p className="mt-0.5 truncate text-xs text-gray-400">{session.lastMessage}</p>}
            </div>
            {session.unreadCount && session.unreadCount > 0 ? <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{session.unreadCount > 99 ? "99+" : session.unreadCount}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
