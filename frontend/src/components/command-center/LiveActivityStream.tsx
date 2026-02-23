"use client";

import { useTranslation } from "@/lib/i18n";

export type LiveActivityEvent = {
  id: string;
  event_type: string;
  agent_id: string | null;
  agent_name: string | null;
  task_id: string | null;
  board_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  "task.created": "bg-blue-100 text-blue-700",
  "task.status_changed": "bg-purple-100 text-purple-700",
  "task.completed": "bg-green-100 text-green-700",
  "agent.heartbeat": "bg-slate-100 text-slate-600",
  "agent.task_started": "bg-amber-100 text-amber-700",
  "approval.resolved": "bg-emerald-100 text-emerald-700",
};

export function LiveActivityStream({
  events,
}: {
  events: LiveActivityEvent[];
}) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        {t("commandCenter.noActivity")}
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {events.map((event) => {
        const colorClass =
          EVENT_TYPE_COLORS[event.event_type] ?? "bg-slate-100 text-slate-600";
        return (
          <div key={event.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-0.5 inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}
            >
              {event.event_type.replace(/\./g, " ")}
            </span>
            <div className="min-w-0 flex-1">
              {event.agent_name ? (
                <span className="text-xs font-medium text-slate-700">
                  {event.agent_name}
                </span>
              ) : null}
              {event.payload && Object.keys(event.payload).length > 0 ? (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {JSON.stringify(event.payload).slice(0, 120)}
                </p>
              ) : null}
            </div>
            <time className="flex-shrink-0 text-xs text-slate-400">
              {new Date(event.created_at).toLocaleTimeString()}
            </time>
          </div>
        );
      })}
    </div>
  );
}
