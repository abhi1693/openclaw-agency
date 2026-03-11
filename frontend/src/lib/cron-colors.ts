// Shared cron job color system — used by CronCalendar and SystemPage

export const JOB_COLORS = [
  'hsl(217 91% 60%)',   // blue
  'hsl(142 71% 45%)',   // green
  'hsl(38 92% 50%)',    // amber
  'hsl(280 65% 60%)',   // purple
  'hsl(0 84% 60%)',     // red
  'hsl(168 76% 42%)',   // teal
]

export interface ColorableJob {
  id: string
  agentId?: string
}

export function getJobColor(job: ColorableJob, allJobs: ColorableJob[]): string {
  const key = job.agentId || job.id
  const allKeys = Array.from(new Set(allJobs.map(j => j.agentId || j.id)))
  const idx = allKeys.indexOf(key)
  return JOB_COLORS[idx % JOB_COLORS.length]
}
