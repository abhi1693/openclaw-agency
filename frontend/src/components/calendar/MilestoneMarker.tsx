"use client";

import { cn } from "@/lib/utils";
import { type EventType, EVENT_TYPE_COLORS, EVENT_TYPE_DOT } from "./types";

type MilestoneMarkerProps = {
  type: EventType;
  label: string;
  compact?: boolean;
  className?: string;
};

/**
 * Visual indicator chip for a calendar event type.
 * Used in day cells and legends.
 */
export function MilestoneMarker({
  type,
  label,
  compact = false,
  className,
}: MilestoneMarkerProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 text-[11px] font-medium leading-5 truncate",
        EVENT_TYPE_COLORS[type],
        compact && "max-w-[90px]",
        className,
      )}
      title={label}
    >
      <span
        className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", EVENT_TYPE_DOT[type])}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
