'use client'
import { useState, useMemo } from 'react'
import { CronExpressionParser } from 'cron-parser'
import { getJobColor } from '@/lib/cron-colors'

// ─── Types ─────────────────────────────────────────────────────────────────

interface CronJob {
  id: string
  name: string
  agentId?: string
  schedule: { kind: string; expr?: string; tz?: string } | string
  payload?: { model?: string; kind?: string }
  enabled: boolean
  state?: {
    lastRunAtMs?: number
    lastRunStatus?: string
    lastStatus?: string
    nextRunAtMs?: number
    consecutiveErrors?: number
  }
}

interface CronCalendarProps {
  jobs: CronJob[]
  onEditJob: (job: CronJob) => void
}

// ─── Cron parsing ───────────────────────────────────────────────────────────

function getCronExpr(job: CronJob): string | null {
  if (typeof job.schedule === 'string') return job.schedule || null
  return job.schedule?.expr || null
}

function getNextOccurrences(cronExpr: string, count: number, fromDate: Date): Date[] {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { currentDate: fromDate })
    const dates: Date[] = []
    for (let i = 0; i < count; i++) {
      dates.push(interval.next().toDate())
    }
    return dates
  } catch {
    return []
  }
}

// ─── View types ─────────────────────────────────────────────────────────────

type ViewType = 'month' | 'week' | 'day'

// ─── Helper: date utils ─────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ─── Month View ─────────────────────────────────────────────────────────────

function MonthView({ jobs, onEditJob }: { jobs: CronJob[]; onEditJob: (j: CronJob) => void }) {
  const today = new Date()
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  // Build calendar grid
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Start from Monday of the week containing day 1
  const startOffset = (firstDay.getDay() + 6) % 7 // 0=Mon
  const calStart = addDays(firstDay, -startOffset)

  // How many rows needed
  const totalDays = startOffset + lastDay.getDate()
  const rows = Math.ceil(totalDays / 7)

  // Compute occurrences map: dateKey -> {count, jobs: {job, times}[]}
  const occurrenceMap = useMemo(() => {
    const map: Record<string, { count: number; entries: { job: CronJob; times: Date[] }[] }> = {}
    const now = startOfDay(today)
    const endDate = addDays(now, 30)

    for (const job of jobs) {
      if (!job.enabled) continue
      const expr = getCronExpr(job)
      if (!expr) continue
      const dates = getNextOccurrences(expr, 200, now)
      for (const d of dates) {
        if (d > endDate) break
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        if (!map[key]) map[key] = { count: 0, entries: [] }
        map[key].count++
        const existing = map[key].entries.find(e => e.job.id === job.id)
        if (existing) {
          existing.times.push(d)
        } else {
          map[key].entries.push({ job, times: [d] })
        }
      }
    }
    return map
  }, [jobs])

  const dayKeys = ['一', '二', '三', '四', '五', '六', '日']

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayKeys.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: rows * 7 }).map((_, i) => {
          const date = addDays(calStart, i)
          const isCurrentMonth = date.getMonth() === month
          const isToday = isSameDay(date, today)
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
          const data = occurrenceMap[key]
          const isSelected = selectedDay && isSameDay(date, selectedDay)

          return (
            <div
              key={i}
              onClick={() => data && setSelectedDay(isSelected ? null : date)}
              className={`
                relative min-h-[60px] rounded-lg p-1.5 transition-all
                ${isCurrentMonth ? 'bg-[hsl(var(--background))]' : 'bg-[hsl(var(--secondary)/0.3)]'}
                ${isToday ? 'ring-1 ring-[hsl(var(--primary))]' : 'border border-[hsl(var(--border)/0.5)]'}
                ${data ? 'cursor-pointer hover:bg-[hsl(var(--secondary)/0.5)]' : ''}
                ${isSelected ? 'bg-[hsl(var(--secondary))]' : ''}
              `}
            >
              <span className={`
                text-xs font-medium
                ${isToday ? 'text-[hsl(var(--primary))] font-bold' : isCurrentMonth ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground)/0.5)]'}
              `}>
                {date.getDate()}
              </span>

              {data && (
                <div className="mt-1 space-y-0.5">
                  {/* Color dots */}
                  <div className="flex flex-wrap gap-0.5">
                    {data.entries.slice(0, 4).map(({ job }) => (
                      <div
                        key={job.id}
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getJobColor(job, jobs) }}
                      />
                    ))}
                  </div>
                  {/* Count badge */}
                  <span className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))]">
                    {data.count} 次
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected day panel */}
      {selectedDay && (() => {
        const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`
        const data = occurrenceMap[key]
        if (!data) return null
        return (
          <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3">
              {selectedDay.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 执行计划
            </h4>
            <div className="space-y-2">
              {data.entries
                .flatMap(({ job, times }) => times.map(t => ({ job, time: t })))
                .sort((a, b) => a.time.getTime() - b.time.getTime())
                .map(({ job, time }, idx) => (
                  <div
                    key={idx}
                    onClick={() => onEditJob(job)}
                    className="flex items-center gap-3 cursor-pointer hover:bg-[hsl(var(--secondary)/0.5)] rounded-lg px-2 py-1.5 transition-colors"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getJobColor(job, jobs) }}
                    />
                    <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono w-12 flex-shrink-0">
                      {formatTime(time)}
                    </span>
                    <span className="text-sm text-[hsl(var(--foreground))] truncate">{job.name}</span>
                  </div>
                ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Week View ──────────────────────────────────────────────────────────────

function WeekView({ jobs, onEditJob }: { jobs: CronJob[]; onEditJob: (j: CronJob) => void }) {
  const today = new Date()

  // Get current week Mon–Sun
  const dayOfWeek = (today.getDay() + 6) % 7 // 0=Mon
  const monday = addDays(startOfDay(today), -dayOfWeek)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  // Build occurrences for this week
  const weekData = useMemo(() => {
    const result: { day: Date; entries: { job: CronJob; time: Date }[] }[] = weekDays.map(d => ({ day: d, entries: [] }))

    for (const job of jobs) {
      if (!job.enabled) continue
      const expr = getCronExpr(job)
      if (!expr) continue
      const dates = getNextOccurrences(expr, 100, monday)
      for (const d of dates) {
        if (d >= addDays(weekDays[6], 1)) break
        const dayIdx = weekDays.findIndex(wd => isSameDay(wd, d))
        if (dayIdx >= 0) {
          result[dayIdx].entries.push({ job, time: d })
        }
      }
    }

    // Sort entries by time
    for (const r of result) {
      r.entries.sort((a, b) => a.time.getTime() - b.time.getTime())
    }
    return result
  }, [jobs])

  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekData.map(({ day, entries }, i) => {
        const isToday = isSameDay(day, today)
        return (
          <div key={i} className={`rounded-lg border p-2 min-h-[120px] ${isToday ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.03)]' : 'border-[hsl(var(--border)/0.5)] bg-[hsl(var(--background))]'}`}>
            {/* Day header */}
            <div className="mb-2 text-center">
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                {dayLabels[i]}
              </div>
              <div className={`text-base font-bold ${isToday ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>
                {day.getDate()}
              </div>
            </div>

            {/* Job entries */}
            <div className="space-y-1">
              {entries.length === 0 ? (
                <div className="text-[9px] text-[hsl(var(--muted-foreground)/0.5)] text-center mt-3">—</div>
              ) : (
                entries.slice(0, 8).map(({ job, time }, idx) => (
                  <div
                    key={idx}
                    onClick={() => onEditJob(job)}
                    title={job.name}
                    className="rounded px-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: `${getJobColor(job, jobs)}22` }}
                  >
                    <div className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono">{formatTime(time)}</div>
                    <div
                      className="text-[10px] font-medium truncate"
                      style={{ color: getJobColor(job, jobs) }}
                    >
                      {job.name}
                    </div>
                  </div>
                ))
              )}
              {entries.length > 8 && (
                <div className="text-[9px] text-[hsl(var(--muted-foreground))] text-center">
                  +{entries.length - 8} 更多
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Day View ───────────────────────────────────────────────────────────────

function DayView({ jobs, onEditJob }: { jobs: CronJob[]; onEditJob: (j: CronJob) => void }) {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  const entries = useMemo(() => {
    const result: { job: CronJob; time: Date }[] = []

    for (const job of jobs) {
      if (!job.enabled) continue
      const expr = getCronExpr(job)
      if (!expr) continue
      const dates = getNextOccurrences(expr, 50, today)
      for (const d of dates) {
        if (d >= tomorrow) break
        result.push({ job, time: d })
      }
    }

    result.sort((a, b) => a.time.getTime() - b.time.getTime())
    return result
  }, [jobs])

  const now = new Date()

  return (
    <div>
      <div className="text-sm font-semibold text-[hsl(var(--foreground))] mb-4">
        {today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
      </div>

      {entries.length === 0 ? (
        <div className="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">今天没有计划执行的任务</div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[72px] top-0 bottom-0 w-px bg-[hsl(var(--border))]" />

          <div className="space-y-2">
            {entries.map(({ job, time }, idx) => {
              const isPast = time < now
              const color = getJobColor(job, jobs)
              return (
                <div
                  key={idx}
                  onClick={() => onEditJob(job)}
                  className="flex items-center gap-4 cursor-pointer group"
                >
                  {/* Time label */}
                  <div className={`w-[64px] text-right text-xs font-mono flex-shrink-0 ${isPast ? 'text-[hsl(var(--muted-foreground)/0.5)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                    {formatTime(time)}
                  </div>

                  {/* Dot on timeline */}
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 relative z-10 ring-2 ring-[hsl(var(--card))]"
                    style={{ backgroundColor: isPast ? 'hsl(var(--muted-foreground))' : color }}
                  />

                  {/* Job chip */}
                  <div
                    className="flex-1 rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: `${color}18`, borderLeft: `2px solid ${color}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${isPast ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]'}`}
                      >
                        {job.name}
                      </span>
                      {job.agentId && (
                        <span className="text-[9px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-1.5 py-0.5 rounded-md">
                          {job.agentId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CronCalendar({ jobs, onEditJob }: CronCalendarProps) {
  const [view, setView] = useState<ViewType>('month')

  const tabs: { key: ViewType; label: string }[] = [
    { key: 'month', label: '📅 月视图' },
    { key: 'week',  label: '📆 周视图' },
    { key: 'day',   label: '🕐 日视图' },
  ]

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm p-5">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 bg-[hsl(var(--secondary)/0.5)] rounded-full p-1 w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`
              px-4 py-1.5 rounded-full text-sm font-medium transition-all
              ${view === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary)/0.8)]'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* View content */}
      {view === 'month' && <MonthView jobs={jobs} onEditJob={onEditJob} />}
      {view === 'week'  && <WeekView  jobs={jobs} onEditJob={onEditJob} />}
      {view === 'day'   && <DayView   jobs={jobs} onEditJob={onEditJob} />}
    </div>
  )
}
