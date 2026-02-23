"use client";

/**
 * QuickTaskCreator — 看板内联任务快速创建表单 (M9)。
 *
 * 渲染一行紧凑输入组件，提交时通过看板同步 WebSocket 发送 task.create 消息。
 * 若需要，也可通过 REST 回调 prop 进行持久化操作。
 */

import { useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";

import type { TaskStatus } from "@/lib/board-sync-protocol";
import { cn } from "@/lib/utils";

export type QuickTaskCreatorProps = {
  /** Default column status for the new task. */
  defaultStatus?: TaskStatus;
  /** Called when the user submits the form. */
  onCreateTask: (title: string, status: TaskStatus) => void | Promise<void>;
  className?: string;
};

export function QuickTaskCreator({
  defaultStatus = "inbox",
  onCreateTask,
  className,
}: QuickTaskCreatorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    try {
      await onCreateTask(trimmed, status);
      setTitle("");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setTitle("");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex items-center gap-2", className)}
      aria-label={t("boardSync.quickCreate")}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("boardSync.quickCreatePlaceholder")}
        disabled={submitting}
        className={cn(
          "flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5",
          "text-sm text-slate-900 placeholder:text-slate-400",
          "focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300",
          "disabled:opacity-50",
        )}
      />
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as TaskStatus)}
        disabled={submitting}
        className={cn(
          "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700",
          "focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300",
          "disabled:opacity-50",
        )}
        aria-label={t("boardSync.quickCreateStatus")}
      >
        <option value="inbox">{t("boardSync.statusInbox")}</option>
        <option value="in_progress">{t("boardSync.statusInProgress")}</option>
        <option value="review">{t("boardSync.statusReview")}</option>
        <option value="done">{t("boardSync.statusDone")}</option>
      </select>
      <button
        type="submit"
        disabled={!title.trim() || submitting}
        className={cn(
          "rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white",
          "hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40",
          "transition-colors",
        )}
      >
        {submitting ? t("boardSync.creating") : t("boardSync.addTask")}
      </button>
    </form>
  );
}
