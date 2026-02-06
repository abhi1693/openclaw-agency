"use client";

import { useMemo, useState } from "react";

import { TaskCard } from "@/components/molecules/TaskCard";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string | null;
  due_at?: string | null;
  assigned_agent_id?: string | null;
  assignee?: string;
  approvalsPendingCount?: number;
};

type TaskBoardProps = {
  tasks: Task[];
  onTaskSelect?: (task: Task) => void;
  onTaskMove?: (taskId: string, status: string) => void;
};

const columns = [
  {
    title: "Inbox",
    status: "inbox",
    dot: "bg-slate-400",
    accent: "hover:border-slate-400 hover:bg-slate-50",
    text: "group-hover:text-slate-700 text-slate-500",
    badge: "bg-slate-100 text-slate-600",
  },
  {
    title: "In Progress",
    status: "in_progress",
    dot: "bg-purple-500",
    accent: "hover:border-purple-400 hover:bg-purple-50",
    text: "group-hover:text-purple-600 text-slate-500",
    badge: "bg-purple-100 text-purple-700",
  },
  {
    title: "Review",
    status: "review",
    dot: "bg-indigo-500",
    accent: "hover:border-indigo-400 hover:bg-indigo-50",
    text: "group-hover:text-indigo-600 text-slate-500",
    badge: "bg-indigo-100 text-indigo-700",
  },
  {
    title: "Done",
    status: "done",
    dot: "bg-green-500",
    accent: "hover:border-green-400 hover:bg-green-50",
    text: "group-hover:text-green-600 text-slate-500",
    badge: "bg-emerald-100 text-emerald-700",
  },
];

const formatDueDate = (value?: string | null) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export function TaskBoard({
  tasks,
  onTaskSelect,
  onTaskMove,
}: TaskBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const buckets: Record<string, Task[]> = {};
    for (const column of columns) {
      buckets[column.status] = [];
    }
    tasks.forEach((task) => {
      const bucket = buckets[task.status] ?? buckets.inbox;
      bucket.push(task);
    });
    return buckets;
  }, [tasks]);

  const handleDragStart =
    (task: Task) => (event: React.DragEvent<HTMLDivElement>) => {
      setDraggingId(task.id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ taskId: task.id, status: task.status }),
      );
    };

  const handleDragEnd = () => {
    setDraggingId(null);
    setActiveColumn(null);
  };

  const handleDrop =
    (status: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setActiveColumn(null);
      const raw = event.dataTransfer.getData("text/plain");
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as { taskId?: string; status?: string };
        if (!payload.taskId || !payload.status) return;
        if (payload.status === status) return;
        onTaskMove?.(payload.taskId, status);
      } catch {
        // Ignore malformed payloads.
      }
    };

  const handleDragOver =
    (status: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (activeColumn !== status) {
        setActiveColumn(status);
      }
    };

  const handleDragLeave = (status: string) => () => {
      if (activeColumn === status) {
        setActiveColumn(null);
      }
    };

  return (
    <div className="grid grid-flow-col auto-cols-[minmax(260px,320px)] gap-4 overflow-x-auto pb-6">
      {columns.map((column) => {
        const columnTasks = grouped[column.status] ?? [];
        return (
          <div
            key={column.title}
            className={cn(
              "kanban-column min-h-[calc(100vh-260px)]",
              activeColumn === column.status && "ring-2 ring-slate-200",
            )}
            onDrop={handleDrop(column.status)}
            onDragOver={handleDragOver(column.status)}
            onDragLeave={handleDragLeave(column.status)}
          >
            <div className="column-header sticky top-0 z-10 rounded-t-xl border border-b-0 border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", column.dot)} />
                  <h3 className="text-sm font-semibold text-slate-900">
                    {column.title}
                  </h3>
                </div>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    column.badge,
                  )}
                >
                  {columnTasks.length}
                </span>
              </div>
            </div>
            <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white p-3">
              <div className="space-y-3">
                {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      title={task.title}
                      priority={task.priority}
                      assignee={task.assignee}
                      due={formatDueDate(task.due_at)}
                      approvalsPendingCount={task.approvalsPendingCount}
                      onClick={() => onTaskSelect?.(task)}
                      draggable
                      isDragging={draggingId === task.id}
                      onDragStart={handleDragStart(task)}
                      onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
