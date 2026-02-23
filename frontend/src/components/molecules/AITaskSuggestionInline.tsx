"use client";

/**
 * AITaskSuggestionInline — inline suggestion strip below board header (M9).
 *
 * Displays the latest AI suggestions received via the board sync WebSocket.
 * Each suggestion can be dismissed. Suggestions auto-scroll horizontally on
 * narrow screens.
 */

import { useTranslation } from "react-i18next";

import type { AgentSuggestion } from "@/lib/board-sync-protocol";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800",
  high: "border-orange-300 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-blue-400",
};

export type AITaskSuggestionInlineProps = {
  suggestions: AgentSuggestion[];
  onDismiss?: (id: string) => void;
};

export function AITaskSuggestionInline({
  suggestions,
  onDismiss,
}: AITaskSuggestionInlineProps) {
  const { t } = useTranslation();

  if (suggestions.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={t("boardSync.suggestionsLabel")}
      className="flex items-start gap-2 overflow-x-auto pb-1"
    >
      <span className="mt-0.5 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("boardSync.aiLabel")}
      </span>
      <div className="flex flex-1 flex-wrap gap-2">
        {suggestions.map((suggestion) => {
          const priority = suggestion.priority || "medium";
          const styleClass =
            PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium;
          const dotClass = PRIORITY_DOT[priority] ?? PRIORITY_DOT.medium;

          return (
            <div
              key={suggestion.id}
              className={cn(
                "flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                styleClass,
              )}
            >
              <span
                className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotClass)}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">{suggestion.title}</p>
                {suggestion.description ? (
                  <p className="mt-0.5 text-xs opacity-80 line-clamp-2">
                    {suggestion.description}
                  </p>
                ) : null}
              </div>
              {onDismiss ? (
                <button
                  type="button"
                  onClick={() => onDismiss(suggestion.id)}
                  aria-label={t("boardSync.dismissSuggestion")}
                  className="ml-1 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
