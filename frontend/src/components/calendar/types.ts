/**
 * Shared types for the M11 Shared Calendar System frontend.
 */

export type EventType =
  | "milestone"
  | "meeting"
  | "deadline"
  | "release"
  | "holiday";

export type ScheduleStatus = "planned" | "in_progress" | "completed" | "missed";

export type CalendarEvent = {
  id: string;
  organization_id: string;
  board_id: string | null;
  title: string;
  description: string | null;
  event_type: EventType;
  starts_at: string;
  ends_at: string | null;
  is_all_day: boolean;
  recurrence_rule: string | null;
  event_metadata: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskSchedule = {
  id: string;
  task_id: string;
  agent_id: string | null;
  board_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: ScheduleStatus;
  estimated_hours: number | null;
  created_at: string;
  updated_at: string;
};

export type CalendarRangeResponse = {
  events: CalendarEvent[];
  schedules: TaskSchedule[];
};

export type AgentWorkloadItem = {
  hours_scheduled: number;
  schedule_ids: string[];
};

export type WorkloadResponse = {
  workload: Record<string, AgentWorkloadItem>;
};

export type SuggestSlotResponse = {
  suggested_start: string;
  suggested_end: string;
  conflicts: TaskSchedule[];
};

/** Color palette for event types */
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  milestone: "bg-purple-100 text-purple-800 border-purple-200",
  meeting: "bg-blue-100 text-blue-800 border-blue-200",
  deadline: "bg-red-100 text-red-800 border-red-200",
  release: "bg-green-100 text-green-800 border-green-200",
  holiday: "bg-amber-100 text-amber-800 border-amber-200",
};

export const EVENT_TYPE_DOT: Record<EventType, string> = {
  milestone: "bg-purple-500",
  meeting: "bg-blue-500",
  deadline: "bg-red-500",
  release: "bg-green-500",
  holiday: "bg-amber-500",
};

export const SCHEDULE_STATUS_COLORS: Record<ScheduleStatus, string> = {
  planned: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
};
