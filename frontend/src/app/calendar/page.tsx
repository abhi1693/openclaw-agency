"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/clerk";
import { useTranslation } from "@/lib/i18n";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { CalendarView } from "@/components/calendar/CalendarView";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";
import { AgentWorkloadTimeline } from "@/components/calendar/AgentWorkloadTimeline";
import { TaskScheduleDialog } from "@/components/calendar/TaskScheduleDialog";
import { customFetch } from "@/api/mutator";
import type {
  CalendarRangeResponse,
  CalendarEvent,
  EventType,
} from "@/components/calendar/types";

const CALENDAR_API = "/api/v1/calendar";

function buildRangeParams(year: number, month: number): string {
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
  return `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
}

async function fetchRange(year: number, month: number): Promise<CalendarRangeResponse> {
  const params = buildRangeParams(year, month);
  const res = await customFetch<{ data: CalendarRangeResponse }>(
    `${CALENDAR_API}/range${params}`,
    { method: "GET" },
  );
  return res.data;
}

async function createEvent(payload: Record<string, unknown>): Promise<CalendarEvent> {
  const res = await customFetch<{ data: CalendarEvent }>(
    `${CALENDAR_API}/events`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return res.data;
}

async function updateEvent(id: string, payload: Record<string, unknown>): Promise<CalendarEvent> {
  const res = await customFetch<{ data: CalendarEvent }>(
    `${CALENDAR_API}/events/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  return res.data;
}

async function deleteEventApi(id: string): Promise<void> {
  await customFetch(`${CALENDAR_API}/events/${id}`, { method: "DELETE" });
}

type DialogState =
  | { open: false }
  | { open: true; mode: "create"; date: Date }
  | { open: true; mode: "edit"; event: CalendarEvent };

export default function CalendarPage() {
  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    new Set(["milestone", "meeting", "deadline", "release", "holiday"]),
  );
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const rangeQueryKey = ["calendar-range", year, month];

  const rangeQuery = useQuery({
    queryKey: rangeQueryKey,
    queryFn: () => fetchRange(year, month),
    enabled: Boolean(isSignedIn),
    refetchInterval: 60_000,
    refetchOnMount: "always",
  });

  const data = rangeQuery.data;

  const filteredEvents = useMemo(
    () => (data?.events ?? []).filter((e) => selectedTypes.has(e.event_type)),
    [data, selectedTypes],
  );

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rangeQueryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateEvent(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rangeQueryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEventApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rangeQueryKey }),
  });

  const handleMonthChange = useCallback((y: number, m: number) => {
    setYear(y);
    setMonth(m);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    setDialog({ open: true, mode: "create", date });
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setDialog({ open: true, mode: "edit", event });
  }, []);

  const handleTypeToggle = useCallback((type: EventType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleClose = useCallback(() => setDialog({ open: false }), []);

  const handleSaveEvent = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!dialog.open) return;
      if (dialog.mode === "create") {
        await createMutation.mutateAsync(payload);
      } else {
        await updateMutation.mutateAsync({ id: dialog.event.id, payload });
      }
    },
    [dialog, createMutation, updateMutation],
  );

  const handleDeleteEvent = useCallback(async () => {
    if (!dialog.open || dialog.mode !== "edit") return;
    await deleteMutation.mutateAsync(dialog.event.id);
  }, [dialog, deleteMutation]);

  // Build window dates for workload timeline (whole month)
  const windowStart = useMemo(() => new Date(year, month, 1), [year, month]);
  const windowEnd = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59), [year, month]);

  // Collect unique agent IDs from schedules
  const agents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of data?.schedules ?? []) {
      if (s.agent_id && !seen.has(s.agent_id)) {
        seen.set(s.agent_id, s.agent_id.slice(0, 8));
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("calendar.signInPrompt"),
        forceRedirectUrl: "/calendar",
        signUpForceRedirectUrl: "/calendar",
      }}
      title={t("calendar.title")}
      description={t("calendar.description")}
      stickyHeader
      contentClassName="p-0"
    >
      <div className="flex gap-6 p-8">
        {/* Left sidebar */}
        <CalendarSidebar
          selectedTypes={selectedTypes}
          onTypeToggle={handleTypeToggle}
          onAddEvent={() => setDialog({ open: true, mode: "create", date: new Date() })}
        />

        {/* Main area */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {rangeQuery.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              {t("calendar.loading")}
            </div>
          ) : null}

          {!rangeQuery.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <CalendarView
                year={year}
                month={month}
                events={filteredEvents}
                schedules={data?.schedules ?? []}
                onMonthChange={handleMonthChange}
                onDayClick={handleDayClick}
                onEventClick={handleEventClick}
              />
            </div>
          ) : null}

          {/* Workload timeline */}
          {agents.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-heading text-base font-semibold text-slate-900">
                {t("calendar.workload")}
              </h3>
              <AgentWorkloadTimeline
                agents={agents}
                schedules={data?.schedules ?? []}
                windowStart={windowStart}
                windowEnd={windowEnd}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Dialog */}
      {dialog.open ? (
        <TaskScheduleDialog
          mode="event"
          initialDate={dialog.mode === "create" ? dialog.date : undefined}
          event={dialog.mode === "edit" ? dialog.event : null}
          onClose={handleClose}
          onSaveEvent={handleSaveEvent}
          onDeleteEvent={
            dialog.mode === "edit" ? handleDeleteEvent : undefined
          }
        />
      ) : null}
    </DashboardPageLayout>
  );
}
