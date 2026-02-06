import { CalendarClock, UserCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface TaskCardProps {
  title: string;
  priority?: string;
  assignee?: string;
  due?: string;
  approvalsPendingCount?: number;
  onClick?: () => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
}

export function TaskCard({
  title,
  priority,
  assignee,
  due,
  approvalsPendingCount = 0,
  onClick,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const hasPendingApproval = approvalsPendingCount > 0;
  const priorityBadge = (value?: string) => {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (normalized === "high") {
      return "bg-rose-100 text-rose-700";
    }
    if (normalized === "medium") {
      return "bg-amber-100 text-amber-700";
    }
    if (normalized === "low") {
      return "bg-emerald-100 text-emerald-700";
    }
    return "bg-slate-100 text-slate-600";
  };

  const priorityLabel = priority ? priority.toUpperCase() : "MEDIUM";

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        isDragging && "opacity-60 shadow-none",
        hasPendingApproval && "border-amber-200 bg-amber-50/40",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      {hasPendingApproval ? (
        <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-amber-400" />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          {hasPendingApproval ? (
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Approval needed · {approvalsPendingCount}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              priorityBadge(priority) ?? "bg-slate-100 text-slate-600",
            )}
          >
            {priorityLabel}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-slate-400" />
          <span>{assignee ?? "Unassigned"}</span>
        </div>
        {due ? (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            <span>{due}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
