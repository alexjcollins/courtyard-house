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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfWeekMonday(date: Date) {
  const normalized = startOfDay(date)
  const day = normalized.getDay()
  const offset = day === 0 ? -6 : 1 - day
  return addDays(normalized, offset)
}

const labelColumnWidth = 180
const viewportDays = 61
const viewportWidthPx = 1800

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
  const firstVisibleDate = startOfDay(firstDate)
  const lastVisibleDate = startOfDay(lastDate)
  const totalSpan = Math.max(differenceInCalendarDays(lastDate, firstDate), 1)
  const timelineWidth = Math.max(
    viewportWidthPx,
    Math.ceil(((totalSpan + 1) / viewportDays) * viewportWidthPx),
  )
  const today = new Date()
  const todayPercent = Math.min(
    Math.max((differenceInCalendarDays(today, firstDate) / totalSpan) * 100, 0),
    100,
  )

  const weekStarts: Array<{ key: string; label: string; left: number }> = []
  let weekStart = startOfWeekMonday(firstVisibleDate)
  if (weekStart < firstVisibleDate) {
    weekStart = addDays(weekStart, 7)
  }

  while (weekStart <= lastVisibleDate) {
    weekStarts.push({
      key: weekStart.toISOString(),
      label: `W/C ${formatShortDate(weekStart.toISOString())}`,
      left: offsetPercent(weekStart.toISOString(), firstDate, totalSpan),
    })
    weekStart = addDays(weekStart, 7)
  }

  const weekendBands: Array<{ key: string; left: number; width: number }> = []
  let cursor = new Date(firstVisibleDate)
  while (cursor <= lastVisibleDate) {
    if (cursor.getDay() === 6) {
      const weekendEnd = addDays(cursor, 2)
      const clippedWeekendEnd =
        weekendEnd > addDays(lastVisibleDate, 1) ? addDays(lastVisibleDate, 1) : weekendEnd
      weekendBands.push({
        key: cursor.toISOString(),
        left: offsetPercent(cursor.toISOString(), firstDate, totalSpan),
        width:
          (differenceInCalendarDays(clippedWeekendEnd, cursor) / (totalSpan + 1)) *
          100,
      })
    }
    cursor = addDays(cursor, 1)
  }

  function renderTimeGrid(rowKey: string, labelMode: "weeks" | "none") {
    return (
      <>
        {weekendBands.map((band) => (
          <div
            key={`${rowKey}-weekend-${band.key}`}
            className="absolute top-0 bottom-0 border-x border-border/20"
            style={{
              left: `${band.left}%`,
              width: `${band.width}%`,
              backgroundColor: "rgba(15, 23, 42, 0.02)",
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(15, 23, 42, 0.08) 0px, rgba(15, 23, 42, 0.08) 1px, transparent 1px, transparent 7px)",
            }}
          />
        ))}
        {weekStarts.map((week) => (
          <div
            key={`${rowKey}-week-${week.key}`}
            className="absolute top-0 bottom-0 z-[1]"
            style={{ left: `${week.left}%` }}
          >
            <div className="h-full border-l border-border/45" />
            {labelMode === "weeks" ? (
              <span className="absolute top-0 left-2 whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {week.label}
              </span>
            ) : null}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="border border-border/70 bg-card"
        style={{ minWidth: `${labelColumnWidth + timelineWidth}px` }}
      >
        <div
          className="grid border-b border-border/70"
          style={{ gridTemplateColumns: `${labelColumnWidth}px minmax(${timelineWidth}px, 1fr)` }}
        >
          <div className="sticky left-0 z-30 border-r border-border/70 bg-card/85 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur-sm">
            Phases
          </div>
          <div className="relative px-4 py-3">
            {renderTimeGrid("header", "weeks")}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l border-dashed border-[color:var(--accent)]"
              style={{ left: `${todayPercent}%` }}
            >
              <span className="absolute -top-3 left-2 text-[10px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
                Today
              </span>
            </div>
            <div className="h-7" />
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
                className="grid border-b border-border/70 last:border-b-0"
                style={{ gridTemplateColumns: `${labelColumnWidth}px minmax(${timelineWidth}px, 1fr)` }}
              >
                <div className="sticky left-0 z-20 border-r border-border/70 bg-card/85 px-4 py-4 backdrop-blur-sm">
                  <p className="text-sm font-medium text-foreground">{phase.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(phase.startDate)} to {formatDate(phase.endDate)}
                  </p>
                </div>
                <div className="relative px-4 py-4">
                  {renderTimeGrid(phase.id, "none")}
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
            <div
              className="grid"
              style={{ gridTemplateColumns: `${labelColumnWidth}px minmax(${timelineWidth}px, 1fr)` }}
            >
              <div className="sticky left-0 z-20 border-r border-border/70 bg-card/85 px-4 py-4 backdrop-blur-sm" />
              <div className="relative px-4 py-4">
                {renderTimeGrid("standalone", "none")}
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
    </div>
  )
}
