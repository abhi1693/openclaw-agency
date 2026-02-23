"use client";

import { Pin, PinOff, Tag, Paperclip, ExternalLink } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  category?: string | null;
  tags?: unknown[];
  source_type?: string | null;
  is_pinned: boolean;
  created_at: string;
  documents?: Array<{ id: string; file_name: string; storage_url: string }>;
};

type KnowledgeEntryCardProps = {
  entry: KnowledgeEntry;
  score?: number;
  onPin?: (id: string) => void;
  onClick?: (id: string) => void;
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function KnowledgeEntryCard({ entry, score, onPin, onClick }: KnowledgeEntryCardProps) {
  const { t } = useTranslation();
  const tags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
  const documents = entry.documents ?? [];

  return (
    <div
      className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      onClick={() => onClick?.(entry.id)}
    >
      {/* Pin toggle */}
      {onPin && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPin(entry.id);
          }}
          title={entry.is_pinned ? t("knowledge.entry.unpin") : t("knowledge.entry.pin")}
          className="absolute right-4 top-4 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {entry.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
      )}

      {/* Score badge (for search results) */}
      {score !== undefined && (
        <span className="absolute right-4 top-4 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
          {(score * 100).toFixed(0)}%
        </span>
      )}

      <div className="flex items-start gap-3">
        {entry.is_pinned && (
          <Pin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-slate-900 leading-snug">{entry.title}</h3>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed">
            {truncate(entry.content, 160)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {entry.category && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {entry.category}
          </span>
        )}
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-0.5">
            <Tag className="h-3 w-3" />
            {tag}
          </span>
        ))}
        {documents.length > 0 && (
          <span className="flex items-center gap-0.5">
            <Paperclip className="h-3 w-3" />
            {documents.length}
          </span>
        )}
        <span className="ml-auto">{formatRelativeTime(entry.created_at)}</span>
      </div>
    </div>
  );
}
