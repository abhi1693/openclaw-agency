"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type CalendarEvent, type TaskSchedule } from "./types";
import { CalendarDayCell } from "./CalendarDayCell";
import { useTranslation } from "@/lib/i18n";

type CalendarViewProps = {
  year: number;
  month: number; // 0-indexed
  events: CalendarEvent[];
  schedules: TaskSchedule[];
  onMonthChange: (year: number, month: number) => void;
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
};

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseDate(iso: string): Date {
  return new Date(iso);
}

/**
 * Month-view calendar grid with navigation controls.
 */
export function CalendarView({
  year,
  month,
  events,
  schedules,
  onMonthChange,
  onDayClick,
  onEventClick,
}: CalendarViewProps) {
  const { t } = useTranslation();
  const today = useMemo(() => new Date(), []);

  const monthLabel = useMemo(
    () =>
      new Date(year, month, 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
      }),
    [year, month],
  );

  /** Build grid: 6 rows × 7 cols, starting from Sunday before the 1st. */
  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay(); // 0 = Sun
    const grid: Date[] = [];
    for (let i = -startDay; i < 42 - startDay; i++) {
      grid.push(new Date(year, month, 1 + i));
    }
    return grid;
  }, [year, month]);

  const eventsOnDay = (day: Date): CalendarEvent[] =>
    events.filter((e) => isSameDay(parseDate(e.starts_at), day));

  const schedulesOnDay = (day: Date): TaskSchedule[] =>
    schedules.filter((s) => isSameDay(parseDate(s.scheduled_start), day));

  const prevMonth = () => {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  };

  const goToday = () => {
    onMonthChange(today.getFullYear(), today.getMonth());
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-semibold text-slate-900">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            {t("calendar.today")}
          </button>
          <button
            type="button"
            onClick={prevMonth}
            aria-label={t("calendar.prev")}
            className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label={t("calendar.next")}
            className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday header row */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            date={day}
            isCurrentMonth={day.getMonth() === month}
            isToday={isSameDay(day, today)}
            events={eventsOnDay(day)}
            schedules={schedulesOnDay(day)}
            onDayClick={onDayClick}
            onEventClick={onEventClick}
          />
        ))}
      </div>
    </div>
  );
}

/** Badge showing count, e.g. "3 events". */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        "bg-blue-100 text-blue-700",
      )}
    >
      {count} {label}
    </span>
  );
}
