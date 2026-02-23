"use client";

import { cn } from "@/lib/utils";
import { type CalendarEvent, type TaskSchedule } from "./types";
import { MilestoneMarker } from "./MilestoneMarker";

type CalendarDayCellProps = {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  schedules: TaskSchedule[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
};

const MAX_VISIBLE = 3;

/**
 * A single day cell in the month calendar grid.
 * Shows up to MAX_VISIBLE event/schedule chips, then "+N more".
 */
export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  events,
  schedules,
  onDayClick,
  onEventClick,
}: CalendarDayCellProps) {
  const allItems: Array<{ key: string; label: string; event: CalendarEvent | null }> = [
    ...events.map((e) => ({ key: e.id, label: e.title, event: e })),
    ...schedules.map((s) => ({
      key: s.id,
      label: `Task schedule`,
      event: null,
    })),
  ];

  const visible = allItems.slice(0, MAX_VISIBLE);
  const overflow = allItems.length - MAX_VISIBLE;

  return (
    <div
      className={cn(
        "group relative flex min-h-[96px] cursor-pointer flex-col rounded-lg border p-1.5 transition",
        isCurrentMonth
          ? "bg-white hover:bg-slate-50 border-slate-200"
          : "bg-slate-50/50 border-slate-100",
        isToday && "border-blue-400 ring-1 ring-blue-400",
      )}
      onClick={() => onDayClick(date)}
    >
      <span
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
          isToday
            ? "bg-blue-600 text-white"
            : isCurrentMonth
              ? "text-slate-900"
              : "text-slate-400",
        )}
      >
        {date.getDate()}
      </span>

      <div className="mt-1 flex flex-col gap-0.5">
        {visible.map((item) =>
          item.event ? (
            <button
              key={item.key}
              type="button"
              className="text-left"
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(item.event!);
              }}
            >
              <MilestoneMarker
                type={item.event.event_type}
                label={item.label}
                compact
              />
            </button>
          ) : (
            <span
              key={item.key}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 text-[11px] font-medium leading-5 text-slate-600 truncate"
              title={item.label}
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span className="truncate">{item.label}</span>
            </span>
          ),
        )}
        {overflow > 0 ? (
          <span className="text-[11px] text-slate-400">+{overflow} more</span>
        ) : null}
      </div>
    </div>
  );
}
