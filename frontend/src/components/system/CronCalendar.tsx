"use client";

import { useState } from "react";
import { CronExpressionParser } from "cron-parser";
import { getCronJobStatus, getCronStatusColor } from "@/lib/cron-colors";

interface CronJob {
  id: string;
  name: string;
  agentId?: string;
  schedule: { kind: string; expr?: string; tz?: string } | string;
  payload?: { model?: string; kind?: string };
  enabled: boolean;
  state?: {
    lastRunAtMs?: number;
    lastRunOutcome?: string;
    lastRunStatus?: string;
    lastStatus?: string;
    nextRunAtMs?: number;
    consecutiveErrors?: number;
  };
}

interface CronCalendarProps {
  jobs: CronJob[];
  activeJobId?: string | null;
  onSelectJob: (jobId: string) => void | Promise<void>;
}

type ViewType = "month" | "week" | "day";
type CalendarEntry = {
  job: CronJob;
  time: Date;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
};

const BLOCK_DURATION_MINUTES = 45;
const MONTH_TIMELINE_HEIGHT = 112;
const WEEK_HOUR_HEIGHT = 44;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function getCronExpr(job: CronJob): string | null {
  if (typeof job.schedule === "string") return job.schedule || null;
  return job.schedule?.expr || null;
}

function getNextOccurrences(
  cronExpr: string,
  count: number,
  fromDate: Date,
): Date[] {
  try {
    const interval = CronExpressionParser.parse(cronExpr, {
      currentDate: fromDate,
    });
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(interval.next().toDate());
    }
    return dates;
  } catch {
    return [];
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("hsl(") && color.endsWith(")")) {
    return `${color.slice(0, -1)} / ${alpha})`;
  }
  return color;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function assignLanes(entries: { job: CronJob; time: Date }[]): CalendarEntry[] {
  const sorted = [...entries].sort(
    (a, b) => a.time.getTime() - b.time.getTime(),
  );
  const laneEndMinutes: number[] = [];
  const result: CalendarEntry[] = [];

  for (const entry of sorted) {
    const startMinutes = entry.time.getHours() * 60 + entry.time.getMinutes();
    const endMinutes = Math.min(startMinutes + BLOCK_DURATION_MINUTES, 24 * 60);

    let lane = laneEndMinutes.findIndex(
      (endMinute) => endMinute <= startMinutes,
    );
    if (lane === -1) {
      lane = laneEndMinutes.length;
      laneEndMinutes.push(endMinutes);
    } else {
      laneEndMinutes[lane] = endMinutes;
    }

    result.push({
      ...entry,
      startMinutes,
      endMinutes,
      lane,
      laneCount: 1,
    });
  }

  const laneCount = Math.max(1, laneEndMinutes.length);
  return result.map((entry) => ({ ...entry, laneCount }));
}

function buildEntriesForRange(
  jobs: CronJob[],
  startDate: Date,
  endDate: Date,
  maxOccurrences: number,
): Map<string, CalendarEntry[]> {
  const map = new Map<string, { job: CronJob; time: Date }[]>();

  for (const job of jobs) {
    if (!job.enabled) continue;
    const expr = getCronExpr(job);
    if (!expr) continue;
    const dates = getNextOccurrences(expr, maxOccurrences, startDate);

    for (const date of dates) {
      if (date >= endDate) break;
      const key = dayKey(date);
      const entries = map.get(key) ?? [];
      entries.push({ job, time: date });
      map.set(key, entries);
    }
  }

  return new Map(
    Array.from(map.entries()).map(([key, entries]) => [
      key,
      assignLanes(entries),
    ]),
  );
}

function blockStyle(entry: CalendarEntry, timelineHeight: number) {
  const top = (entry.startMinutes / (24 * 60)) * timelineHeight;
  const height = Math.max(
    ((entry.endMinutes - entry.startMinutes) / (24 * 60)) * timelineHeight,
    18,
  );
  const width = `calc((100% - 10px) / ${entry.laneCount})`;
  const left = `calc(5px + (${entry.lane} * ((100% - 10px) / ${entry.laneCount})))`;
  return { top, height, width, left };
}

function TimelineBlock({
  entry,
  timelineHeight,
  compact = false,
  isActive = false,
  onSelectJob,
}: {
  entry: CalendarEntry;
  timelineHeight: number;
  compact?: boolean;
  isActive?: boolean;
  onSelectJob: (jobId: string) => void | Promise<void>;
}) {
  const color = getCronStatusColor(entry.job);
  const status = getCronJobStatus(entry.job);
  const style = blockStyle(entry, timelineHeight);

  return (
    <button
      type="button"
      title={`${entry.job.name} · ${formatTime(entry.time)}`}
      aria-label={`${entry.job.name} at ${formatTime(entry.time)}`}
      data-status={status}
      onClick={(event) => {
        event.stopPropagation();
        void onSelectJob(entry.job.id);
      }}
      className={`absolute overflow-hidden rounded-md border text-left transition-all hover:brightness-95 ${isActive ? "ring-2 ring-[hsl(var(--primary))] ring-offset-1" : ""}`}
      style={{
        top: style.top,
        left: style.left,
        width: style.width,
        height: style.height,
        borderColor: color,
        backgroundColor: withAlpha(color, 0.16),
        color,
      }}
    >
      <div className={compact ? "px-1 py-0.5" : "px-2 py-1"}>
        <div
          className={
            compact
              ? "text-[8px] font-mono leading-none"
              : "text-[10px] font-mono leading-none"
          }
        >
          {formatTime(entry.time)}
        </div>
        <div
          className={
            compact
              ? "mt-0.5 truncate text-[9px] font-semibold leading-tight"
              : "mt-1 truncate text-[11px] font-semibold leading-tight"
          }
        >
          {entry.job.name}
        </div>
      </div>
    </button>
  );
}

function MonthView({
  jobs,
  activeJobId,
  onSelectJob,
}: {
  jobs: CronJob[];
  activeJobId?: string | null;
  onSelectJob: (jobId: string) => void | Promise<void>;
}) {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calStart = addDays(firstDay, -startOffset);
  const totalDays = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalDays / 7);
  const calEnd = addDays(calStart, rows * 7);
  const calStartMs = calStart.getTime();
  const calEndMs = calEnd.getTime();
  const occurrenceMap = buildEntriesForRange(
    jobs,
    new Date(calStartMs),
    new Date(calEndMs),
    240,
  );

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
            {formatMonthLabel(today)}
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Monthly grid with each day mapped onto a 24-hour timeline.
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          Month Grid
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {dayLabels.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: rows * 7 }).map((_, index) => {
          const date = addDays(calStart, index);
          const key = dayKey(date);
          const entries = occurrenceMap.get(key) ?? [];
          const isCurrentMonth = date.getMonth() === month;
          const isToday = isSameDay(date, today);
          const isSelected = selectedDay ? isSameDay(date, selectedDay) : false;

          return (
            <div
              key={key}
              onClick={() =>
                entries.length > 0 && setSelectedDay(isSelected ? null : date)
              }
              className={`
                relative min-h-[170px] rounded-lg p-2 transition-all
                ${isCurrentMonth ? "bg-[hsl(var(--background))]" : "bg-[hsl(var(--secondary)/0.3)]"}
                ${isToday ? "ring-1 ring-[hsl(var(--primary))]" : "border border-[hsl(var(--border)/0.5)]"}
                ${entries.length > 0 ? "cursor-pointer hover:bg-[hsl(var(--secondary)/0.45)]" : ""}
                ${isSelected ? "bg-[hsl(var(--secondary))]" : ""}
              `}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`
                  text-xs font-medium
                  ${isToday ? "font-bold text-[hsl(var(--primary))]" : isCurrentMonth ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground)/0.5)]"}
                `}
                >
                  {date.getDate()}
                </span>
                {entries.length > 0 && (
                  <span className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))]">
                    {entries.length} jobs
                  </span>
                )}
              </div>

              <div
                className="relative rounded-md border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--secondary)/0.18)]"
                style={{ height: MONTH_TIMELINE_HEIGHT }}
              >
                <div className="pointer-events-none absolute inset-0">
                  {HOURS.filter((hour) => hour % 6 === 0).map((hour) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-dashed border-[hsl(var(--border)/0.45)]"
                      style={{ top: `${(hour / 24) * 100}%` }}
                    />
                  ))}
                </div>
                {entries.map((entry) => (
                  <TimelineBlock
                    key={`${entry.job.id}-${entry.time.toISOString()}`}
                    entry={entry}
                    timelineHeight={MONTH_TIMELINE_HEIGHT}
                    compact
                    isActive={activeJobId === entry.job.id}
                    onSelectJob={onSelectJob}
                  />
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between text-[9px] text-[hsl(var(--muted-foreground))]">
                <span>
                  {entries[0] ? formatTime(entries[0].time) : "No runs"}
                </span>
                <span>
                  {entries.length > 1
                    ? formatTime(entries[entries.length - 1].time)
                    : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay &&
        (() => {
          const entries = occurrenceMap.get(dayKey(selectedDay)) ?? [];
          if (entries.length === 0) return null;
          return (
            <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
              <h4 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                {selectedDay.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })}{" "}
                schedule
              </h4>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <button
                    key={`${entry.job.id}-${entry.time.toISOString()}`}
                    type="button"
                    onClick={() => void onSelectJob(entry.job.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[hsl(var(--secondary)/0.5)]"
                  >
                    <div
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: getCronStatusColor(entry.job) }}
                    />
                    <span className="w-12 flex-shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                      {formatTime(entry.time)}
                    </span>
                    <span className="truncate text-sm text-[hsl(var(--foreground))]">
                      {entry.job.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function WeekView({
  jobs,
  activeJobId,
  onSelectJob,
}: {
  jobs: CronJob[];
  activeJobId?: string | null;
  onSelectJob: (jobId: string) => void | Promise<void>;
}) {
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7;
  const monday = addDays(startOfDay(today), -dayOfWeek);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(monday, index),
  );
  const weekEnd = addDays(weekDays[6], 1);
  const mondayMs = monday.getTime();
  const weekEndMs = weekEnd.getTime();
  const weekData = buildEntriesForRange(
    jobs,
    new Date(mondayMs),
    new Date(weekEndMs),
    160,
  );
  const timelineHeight = HOURS.length * WEEK_HOUR_HEIGHT;

  return (
    <div className="overflow-x-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
            Week of {formatWeekLabel(monday)}
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Weekly grid with time-positioned schedule blocks.
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          Week Grid
        </div>
      </div>

      <div className="min-w-[860px]">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] gap-2">
          <div />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`rounded-lg border px-2 py-2 text-center ${isToday ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]" : "border-[hsl(var(--border)/0.5)] bg-[hsl(var(--secondary)/0.25)]"}`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
                >
                  {formatDayLabel(day)}
                </div>
                <div
                  className={`text-base font-bold ${isToday ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground))]"}`}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}

          <div className="relative" style={{ height: timelineHeight }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 text-right text-[10px] text-[hsl(var(--muted-foreground))]"
                style={{ top: hour * WEEK_HOUR_HEIGHT - 7 }}
              >
                {`${String(hour).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const entries = weekData.get(dayKey(day)) ?? [];
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`relative overflow-hidden rounded-xl border ${isToday ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.03)]" : "border-[hsl(var(--border)/0.5)] bg-[hsl(var(--background))]"}`}
                style={{ height: timelineHeight }}
              >
                <div className="pointer-events-none absolute inset-0">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute inset-x-0 border-t border-dashed border-[hsl(var(--border)/0.45)]"
                      style={{ top: hour * WEEK_HOUR_HEIGHT }}
                    />
                  ))}
                </div>
                {entries.length === 0 && (
                  <div className="absolute inset-x-0 top-4 text-center text-[10px] text-[hsl(var(--muted-foreground)/0.6)]">
                    No jobs
                  </div>
                )}
                {entries.map((entry) => (
                  <TimelineBlock
                    key={`${entry.job.id}-${entry.time.toISOString()}`}
                    entry={entry}
                    timelineHeight={timelineHeight}
                    isActive={activeJobId === entry.job.id}
                    onSelectJob={onSelectJob}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({
  jobs,
  activeJobId,
  onSelectJob,
}: {
  jobs: CronJob[];
  activeJobId?: string | null;
  onSelectJob: (jobId: string) => void | Promise<void>;
}) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const todayMs = today.getTime();
  const tomorrowMs = tomorrow.getTime();
  const entries = (() => {
    const result: { job: CronJob; time: Date }[] = [];
    const rangeStart = new Date(todayMs);
    const rangeEnd = new Date(tomorrowMs);

    for (const job of jobs) {
      if (!job.enabled) continue;
      const expr = getCronExpr(job);
      if (!expr) continue;
      const dates = getNextOccurrences(expr, 50, rangeStart);
      for (const date of dates) {
        if (date >= rangeEnd) break;
        result.push({ job, time: date });
      }
    }

    result.sort((a, b) => a.time.getTime() - b.time.getTime());
    return result;
  })();
  const now = new Date();

  return (
    <div>
      <div className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
        {today.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
      </div>

      {entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
          No tasks scheduled for today
        </div>
      ) : (
        <div className="relative">
          <div className="absolute bottom-0 left-[72px] top-0 w-px bg-[hsl(var(--border))]" />
          <div className="space-y-2">
            {entries.map(({ job, time }, index) => {
              const isPast = time < now;
              const color = getCronStatusColor(job);
              return (
                <button
                  key={`${job.id}-${index}`}
                  type="button"
                  onClick={() => void onSelectJob(job.id)}
                  className="group flex w-full items-center gap-4 text-left"
                >
                  <div
                    className={`w-[64px] flex-shrink-0 text-right font-mono text-xs ${isPast ? "text-[hsl(var(--muted-foreground)/0.5)]" : "text-[hsl(var(--muted-foreground))]"}`}
                  >
                    {formatTime(time)}
                  </div>
                  <div
                    className={`relative z-10 h-2.5 w-2.5 flex-shrink-0 rounded-full ring-2 ring-[hsl(var(--card))] ${activeJobId === job.id ? "ring-[hsl(var(--primary))]" : ""}`}
                    style={{
                      backgroundColor: isPast
                        ? "hsl(var(--muted-foreground))"
                        : color,
                    }}
                  />
                  <div
                    className="flex-1 rounded-lg px-3 py-2 transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: withAlpha(color, 0.12),
                      borderLeft: `2px solid ${color}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${isPast ? "text-[hsl(var(--muted-foreground))]" : "text-[hsl(var(--foreground))]"}`}
                      >
                        {job.name}
                      </span>
                      {job.agentId && (
                        <span className="rounded-md bg-[hsl(var(--secondary))] px-1.5 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">
                          {job.agentId}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CronCalendar({
  jobs,
  activeJobId,
  onSelectJob,
}: CronCalendarProps) {
  const [view, setView] = useState<ViewType>("month");

  const tabs: { key: ViewType; label: string }[] = [
    { key: "month", label: "📅 Month" },
    { key: "week", label: "📆 Week" },
    { key: "day", label: "🕐 Day" },
  ];

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
      <div className="mb-5 flex w-fit items-center gap-1 rounded-full bg-[hsl(var(--secondary)/0.5)] p-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`
              rounded-full px-4 py-1.5 text-sm font-medium transition-all
              ${
                view === key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary)/0.8)]"
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "month" && (
        <MonthView
          jobs={jobs}
          activeJobId={activeJobId}
          onSelectJob={onSelectJob}
        />
      )}
      {view === "week" && (
        <WeekView
          jobs={jobs}
          activeJobId={activeJobId}
          onSelectJob={onSelectJob}
        />
      )}
      {view === "day" && (
        <DayView
          jobs={jobs}
          activeJobId={activeJobId}
          onSelectJob={onSelectJob}
        />
      )}
    </div>
  );
}
