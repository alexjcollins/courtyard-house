import { differenceInCalendarDays } from "date-fns"
import { formatDate, formatShortDate } from "@/lib/format"
import type { Milestone, ProjectData } from "@/lib/data"
import { cn } from "@/lib/utils"

type TimelineStripProps = {
  milestones: Milestone[]
  phases: ProjectData["timeline"]["phases"]
}

function offsetPercent(date: string, startDate: Date, totalSpan: number): number {
  return (
    (differenceInCalendarDays(new Date(date), startDate) / totalSpan) * 100
  )
}

export function TimelineStrip({ milestones, phases }: TimelineStripProps) {
  if (milestones.length === 0) {
    return null
  }

  const assignedMilestoneIds = new Set(
    phases.flatMap((phase) => phase.milestoneIds),
  )
  const standaloneMilestones = milestones
    .filter((milestone) => !assignedMilestoneIds.has(milestone.id))
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate))

  const allDates = [
    ...phases.flatMap((phase) => [phase.startDate, phase.endDate]),
    ...milestones.map((milestone) => milestone.plannedDate),
  ].sort()

  const firstDate = new Date(allDates[0] || milestones[0].plannedDate)
  const lastDate = new Date(allDates[allDates.length - 1] || milestones[milestones.length - 1].plannedDate)
  const totalSpan = Math.max(differenceInCalendarDays(lastDate, firstDate), 1)
  const today = new Date()
  const todayPercent = Math.min(
    Math.max((differenceInCalendarDays(today, firstDate) / totalSpan) * 100, 0),
    100,
  )

  const tickCount = Math.min(6, Math.max(4, Math.ceil(totalSpan / 90)))
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1)
    const offsetDays = Math.round(totalSpan * ratio)
    const tickDate = new Date(firstDate)
    tickDate.setDate(firstDate.getDate() + offsetDays)
    return {
      key: tickDate.toISOString(),
      label: formatShortDate(tickDate.toISOString()),
      left: ratio * 100,
    }
  })

  return (
    <div className="border border-border/70 bg-card">
      <div className="grid grid-cols-[180px_1fr] border-b border-border/70">
        <div className="border-r border-border/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Phases
        </div>
        <div className="relative px-4 py-3">
          {ticks.map((tick) => (
            <div
              key={tick.key}
              className="absolute top-0 bottom-0"
              style={{ left: `${tick.left}%` }}
            >
              <div className="h-full border-l border-dashed border-border/60" />
              <span className="absolute top-0 left-2 text-[11px] text-muted-foreground">
                {tick.label}
              </span>
            </div>
          ))}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-dashed border-[color:var(--accent)]"
            style={{ left: `${todayPercent}%` }}
          >
            <span className="absolute -top-3 left-2 text-[10px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
              Today
            </span>
          </div>
          <div className="h-5" />
        </div>
      </div>

      <div className="grid">
        {phases.map((phase) => {
          const left = offsetPercent(phase.startDate, firstDate, totalSpan)
          const right = offsetPercent(phase.endDate, firstDate, totalSpan)
          const width = Math.max(right - left, 1.5)
          const phaseMilestones = milestones
            .filter((milestone) => phase.milestoneIds.includes(milestone.id))
            .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))

          return (
            <div
              key={phase.id}
              className="grid grid-cols-[180px_1fr] border-b border-border/70 last:border-b-0"
            >
              <div className="border-r border-border/70 px-4 py-4">
                <p className="text-sm font-medium text-foreground">{phase.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDate(phase.startDate)} to {formatDate(phase.endDate)}
                </p>
              </div>
              <div className="relative px-4 py-4">
                {ticks.map((tick) => (
                  <div
                    key={`${phase.id}-${tick.key}`}
                    className="absolute top-0 bottom-0"
                    style={{ left: `${tick.left}%` }}
                  >
                    <div className="h-full border-l border-dashed border-border/40" />
                  </div>
                ))}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-dashed border-[color:var(--accent)]"
                  style={{ left: `${todayPercent}%` }}
                />
                <div
                  className={cn(
                    "absolute top-1/2 h-8 -translate-y-1/2 border border-foreground bg-foreground text-background",
                    width < 9 ? "px-2" : "px-3",
                  )}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  title={`${phase.name}: ${formatDate(phase.startDate)} to ${formatDate(phase.endDate)}`}
                >
                  <span className="block truncate text-xs font-medium leading-8">
                    {phase.name}
                  </span>
                </div>
                <div className="absolute inset-x-4 top-2 z-20 h-3">
                  {phaseMilestones.map((milestone) => {
                    const milestoneLeft = offsetPercent(
                      milestone.plannedDate,
                      firstDate,
                      totalSpan,
                    )

                    return (
                      <div
                        key={milestone.id}
                        className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${milestoneLeft}%` }}
                      >
                        <div className="size-2 rounded-full bg-foreground" />
                        <div className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground group-hover:block">
                          {milestone.name} · {formatDate(milestone.plannedDate)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

        {standaloneMilestones.length > 0 ? (
          <div className="grid grid-cols-[180px_1fr]">
            <div className="border-r border-border/70 px-4 py-4" />
            <div className="relative px-4 py-4">
              {ticks.map((tick) => (
                <div
                  key={`milestone-${tick.key}`}
                  className="absolute top-0 bottom-0"
                  style={{ left: `${tick.left}%` }}
                >
                  <div className="h-full border-l border-dashed border-border/40" />
                </div>
              ))}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-dashed border-[color:var(--accent)]"
                style={{ left: `${todayPercent}%` }}
              />
              <div className="relative h-8">
                {standaloneMilestones.map((milestone) => {
                  const left = offsetPercent(milestone.plannedDate, firstDate, totalSpan)

                  return (
                    <div
                      key={milestone.id}
                      className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${left}%` }}
                    >
                      <div className="size-2 rounded-full bg-foreground" />
                      <div className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground group-hover:block">
                        {milestone.name} · {formatDate(milestone.plannedDate)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
