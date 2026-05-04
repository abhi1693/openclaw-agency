// Shared cron job color system — used by CronCalendar and SystemPage

export const JOB_COLORS = [
  "hsl(217 91% 60%)", // blue
  "hsl(142 71% 45%)", // green
  "hsl(38 92% 50%)", // amber
  "hsl(280 65% 60%)", // purple
  "hsl(0 84% 60%)", // red
  "hsl(168 76% 42%)", // teal
];

export interface ColorableJob {
  id: string;
  agentId?: string;
}

export interface StatusColorableJob {
  enabled: boolean;
  state?: {
    lastRunOutcome?: string;
    lastRunStatus?: string;
    lastStatus?: string;
  };
}

export type CronJobVisualStatus =
  | "success"
  | "failed"
  | "running"
  | "scheduled";

export const CRON_STATUS_COLORS: Record<CronJobVisualStatus, string> = {
  success: "hsl(142 71% 45%)",
  failed: "hsl(0 84% 60%)",
  running: "hsl(38 92% 50%)",
  scheduled: "hsl(215 14% 60%)",
};

export function getJobColor(
  job: ColorableJob,
  allJobs: ColorableJob[],
): string {
  const key = job.agentId || job.id;
  const allKeys = Array.from(new Set(allJobs.map((j) => j.agentId || j.id)));
  const idx = allKeys.indexOf(key);
  return JOB_COLORS[idx % JOB_COLORS.length];
}

export function getCronJobStatus(job: StatusColorableJob): CronJobVisualStatus {
  if (!job.enabled) return "scheduled";

  const status =
    `${job.state?.lastRunOutcome ?? ""} ${job.state?.lastStatus ?? ""} ${job.state?.lastRunStatus ?? ""}`
      .trim()
      .toLowerCase();

  if (
    status.includes("running") ||
    status.includes("progress") ||
    status.includes("pending")
  ) {
    return "running";
  }
  if (
    status.includes("failure") ||
    status.includes("failed") ||
    status.includes("error") ||
    status.includes("timeout")
  ) {
    return "failed";
  }
  if (
    status.includes("success") ||
    status.includes("ok") ||
    status.includes("complete") ||
    status.includes("done")
  ) {
    return "success";
  }
  return "scheduled";
}

export function getCronStatusColor(job: StatusColorableJob): string {
  return CRON_STATUS_COLORS[getCronJobStatus(job)];
}
