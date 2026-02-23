"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { type TaskSchedule, SCHEDULE_STATUS_COLORS } from "./types";
import { useTranslation } from "@/lib/i18n";

type AgentWorkloadTimelineProps = {
  /** Map of agentId → display name (or truncated ID) */
  agents: Array<{ id: string; name: string }>;
  schedules: TaskSchedule[];
  windowStart: Date;
  windowEnd: Date;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Gantt-style horizontal timeline showing scheduled task blocks per agent.
 * Each row = one agent, blocks are positioned proportionally within the window.
 */
export function AgentWorkloadTimeline({
  agents,
  schedules,
  windowStart,
  windowEnd,
}: AgentWorkloadTimelineProps) {
  const { t } = useTranslation();
  const totalMs = windowEnd.getTime() - windowStart.getTime();

  const agentSchedules = useMemo(() => {
    const map = new Map<string, TaskSchedule[]>();
    for (const agent of agents) {
      map.set(agent.id, []);
    }
    for (const sched of schedules) {
      if (sched.agent_id && map.has(sched.agent_id)) {
        map.get(sched.agent_id)!.push(sched);
      }
    }
    return map;
  }, [agents, schedules]);

  if (agents.length === 0) {
    return (
      <p className="text-sm text-slate-400">{t("calendar.noEvents")}</p>
    );
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => {
        const agentBlocks = agentSchedules.get(agent.id) ?? [];
        return (
          <div key={agent.id} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-right text-xs font-medium text-slate-600">
              {agent.name}
            </span>
            <div className="relative h-7 flex-1 overflow-hidden rounded bg-slate-100">
              {agentBlocks.map((sched) => {
                const start = new Date(sched.scheduled_start).getTime();
                const end = new Date(sched.scheduled_end).getTime();
                const left = clamp(
                  ((start - windowStart.getTime()) / totalMs) * 100,
                  0,
                  100,
                );
                const width = clamp(
                  ((end - start) / totalMs) * 100,
                  0,
                  100 - left,
                );
                if (width < 0.5) return null;
                return (
                  <div
                    key={sched.id}
                    className={cn(
                      "absolute top-1 h-5 rounded px-1 text-[10px] font-medium leading-5 truncate",
                      SCHEDULE_STATUS_COLORS[sched.status],
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${sched.status} · ${sched.scheduled_start} – ${sched.scheduled_end}`}
                  >
                    {sched.estimated_hours != null
                      ? `${sched.estimated_hours}h`
                      : ""}
                  </div>
                );
              })}
            </div>
            <span className="w-16 shrink-0 text-xs text-slate-400">
              {agentBlocks
                .reduce((sum, s) => sum + (s.estimated_hours ?? 0), 0)
                .toFixed(1)}{" "}
              {t("calendar.hoursScheduled")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
