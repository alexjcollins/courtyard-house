"use client"

import { MetricButton } from "@/components/critical-path/metric-button"
import { useCriticalPathFocus } from "@/components/critical-path/focus-context"
import type { IssueSummary } from "@/lib/critical-path-utils"

export function CriticalPathMetrics({
  summary,
  nextMilestone,
}: {
  summary: IssueSummary
  nextMilestone: { id: string; name: string; formattedDate: string } | null
}) {
  const focus = useCriticalPathFocus()

  function goToTasks(filter: "open" | "in-progress" | "overdue") {
    focus?.requestFocus({ kind: "tasks", filter })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricButton
        label="Open tasks"
        value={String(summary.open)}
        detail={`${summary.total} in the project`}
        hint="Show all open tasks"
        onClick={() => goToTasks("open")}
      />
      <MetricButton
        label="In progress"
        value={String(summary.inProgress)}
        detail={summary.inProgress === 0 ? "Nothing started" : undefined}
        hint="Show tasks in progress"
        onClick={() => goToTasks("in-progress")}
      />
      <MetricButton
        label="Overdue"
        value={String(summary.overdue)}
        detail={summary.overdue === 0 ? "On schedule" : "Past due date"}
        hint="Show overdue tasks"
        onClick={() => goToTasks("overdue")}
      />
      <MetricButton
        label="Next milestone"
        value={nextMilestone?.formattedDate ?? "—"}
        detail={nextMilestone?.name}
        hint="Centre this milestone on the timeline"
        onClick={() =>
          nextMilestone &&
          focus?.requestFocus({ kind: "milestone", id: nextMilestone.id })
        }
      />
    </div>
  )
}
