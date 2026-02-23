"use client";

import { cn } from "@/lib/utils";
import { type EventType, EVENT_TYPE_DOT } from "./types";
import { useTranslation } from "@/lib/i18n";

const EVENT_TYPES: EventType[] = [
  "milestone",
  "meeting",
  "deadline",
  "release",
  "holiday",
];

type CalendarSidebarProps = {
  selectedTypes: Set<EventType>;
  onTypeToggle: (type: EventType) => void;
  onAddEvent: () => void;
};

/**
 * Left sidebar for the calendar page: legend, type filters, and quick actions.
 */
export function CalendarSidebar({
  selectedTypes,
  onTypeToggle,
  onAddEvent,
}: CalendarSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4">
      <button
        type="button"
        onClick={onAddEvent}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
      >
        {t("calendar.addEvent")}
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("calendar.filterByType")}
        </p>
        <div className="space-y-2">
          {EVENT_TYPES.map((type) => {
            const active = selectedTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => onTypeToggle(type)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
                  active
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    EVENT_TYPE_DOT[type],
                    !active && "opacity-40",
                  )}
                />
                {t(`calendar.${type}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("calendar.workload")}
        </p>
        <p className="text-xs text-slate-400">
          Workload data visible in the workload panel below the calendar.
        </p>
      </div>
    </aside>
  );
}
