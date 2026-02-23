"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface ChatSession {
  id: string;
  agentId: string;
  agentName: string;
  boardName?: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount?: number;
}

interface SessionListProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  isLoading?: boolean;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function SessionList({
  sessions,
  activeSessionId,
  isLoading = false,
}: SessionListProps) {
  const t = useTranslations("h5");

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl bg-surface-raised"
          />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <MessageCircle className="h-10 w-10 text-muted" />
        <p className="text-sm text-muted">{t("sessions.empty")}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            href={`/h5/chat/${session.id}`}
            className={cn(
              "flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-raised",
              activeSessionId === session.id && "bg-blue-50",
            )}
          >
            {/* Agent avatar */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
              {session.agentName.slice(0, 2).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-strong">
                  {session.agentName}
                </span>
                {session.lastMessageAt && (
                  <span className="shrink-0 text-[10px] text-muted">
                    {formatRelativeTime(session.lastMessageAt)}
                  </span>
                )}
              </div>
              {session.boardName && (
                <p className="truncate text-xs text-muted">{session.boardName}</p>
              )}
              {session.lastMessage && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {session.lastMessage}
                </p>
              )}
            </div>

            {session.unreadCount && session.unreadCount > 0 ? (
              <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                {session.unreadCount > 99 ? "99+" : session.unreadCount}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
