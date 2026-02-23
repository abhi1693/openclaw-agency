"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CalendarEvent,
  type TaskSchedule,
  type EventType,
  EVENT_TYPE_COLORS,
} from "./types";
import { useTranslation } from "@/lib/i18n";

const EVENT_TYPES: EventType[] = [
  "milestone",
  "meeting",
  "deadline",
  "release",
  "holiday",
];

type DialogMode = "event" | "schedule";

type TaskScheduleDialogProps = {
  mode: DialogMode;
  initialDate?: Date;
  event?: CalendarEvent | null;
  schedule?: TaskSchedule | null;
  conflicts?: TaskSchedule[];
  onClose: () => void;
  onSaveEvent: (payload: {
    title: string;
    event_type: EventType;
    starts_at: string;
    ends_at: string | null;
    description: string | null;
    is_all_day: boolean;
  }) => Promise<void>;
  onDeleteEvent?: () => Promise<void>;
};

function toLocalDatetimeValue(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  // Format: YYYY-MM-DDTHH:mm (local time for input[type=datetime-local])
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Modal dialog for creating or editing calendar events,
 * with conflict warnings for task schedules.
 */
export function TaskScheduleDialog({
  mode,
  initialDate,
  event,
  conflicts = [],
  onClose,
  onSaveEvent,
  onDeleteEvent,
}: TaskScheduleDialogProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(event);

  const defaultStart = initialDate ?? new Date();
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultEnd.getHours() + 1);

  const [title, setTitle] = useState(event?.title ?? "");
  const [eventType, setEventType] = useState<EventType>(
    event?.event_type ?? "milestone",
  );
  const [startsAt, setStartsAt] = useState(
    toLocalDatetimeValue(event?.starts_at ?? defaultStart),
  );
  const [endsAt, setEndsAt] = useState(
    toLocalDatetimeValue(event?.ends_at ?? defaultEnd),
  );
  const [description, setDescription] = useState(event?.description ?? "");
  const [isAllDay, setIsAllDay] = useState(event?.is_all_day ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveEvent({
        title: title.trim(),
        event_type: eventType,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: isAllDay ? null : new Date(endsAt).toISOString(),
        description: description.trim() || null,
        is_all_day: isAllDay,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteEvent) return;
    setSaving(true);
    setError(null);
    try {
      await onDeleteEvent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-base font-semibold text-slate-900">
            {mode === "event"
              ? isEditing
                ? t("calendar.editEvent")
                : t("calendar.addEvent")
              : isEditing
                ? t("calendar.editSchedule")
                : t("calendar.addSchedule")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Conflict warning */}
          {conflicts.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                {t("calendar.conflictWarning")} ({conflicts.length} conflict
                {conflicts.length > 1 ? "s" : ""})
              </span>
            </div>
          ) : null}

          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {t("calendar.title_field")}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Event title…"
              autoFocus
            />
          </div>

          {/* Event type (only for event mode) */}
          {mode === "event" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {t("calendar.eventType")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEventType(type)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      eventType === type
                        ? EVENT_TYPE_COLORS[type]
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                    )}
                  >
                    {t(`calendar.${type}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* All day toggle */}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            {t("calendar.allDay")}
          </label>

          {/* Starts at */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {t("calendar.startsAt")}
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Ends at */}
          {!isAllDay ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {t("calendar.endsAt")}
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          ) : null}

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {t("calendar.description_field")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Optional description…"
            />
          </div>

          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <div>
            {isEditing && onDeleteEvent ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                {t("calendar.deleteEvent")}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {t("calendar.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("calendar.saving") : t("calendar.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
