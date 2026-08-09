import Link from "next/link"
import { differenceInCalendarDays } from "date-fns"
import { getCurrentViewer, hasPermission } from "@/lib/auth"
import { getTimelineOverview } from "@/lib/data"
import { getLinearCriticalPath, getLinearProjectName } from "@/lib/linear"
import { deriveMilestoneStatus, summariseIssues } from "@/lib/critical-path-utils"
import {
  hasPlanCookieAccess,
  isPlanPasswordConfigured,
} from "@/lib/plan-access"
import { formatDate } from "@/lib/format"
import { PlanPasswordGate } from "@/components/plan/plan-password-gate"
import { CriticalPathClient } from "@/components/critical-path/critical-path-client"
import { RefreshButton } from "@/components/critical-path/refresh-button"
import { MetricCard } from "@/components/metric-card"
import { StatusBadge } from "@/components/status-badge"
import { TimelineStrip } from "@/components/timeline-strip"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// PUBLIC ROUTE — lives outside the (app) auth group. Viewable by a WorkOS session with
// critical-path:view OR by anyone holding the shared password (same cookie as /plan).
//
// Never call getProjectData() here: it hits Postgres and throws on budget drift, and it
// carries cost data this page must not expose. Use getTimelineOverview().

export const metadata = {
  title: "The Critical Path — Courtyard House",
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
      {children}
    </p>
  )
}

export default async function CriticalPathPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[] }>
}) {
  const viewer = await getCurrentViewer()
  const hasSessionAccess = Boolean(
    viewer && hasPermission(viewer, "critical-path:view"),
  )
  const canView = hasSessionAccess || (await hasPlanCookieAccess())

  if (!canView) {
    return (
      <PlanPasswordGate
        passwordConfigured={isPlanPasswordConfigured()}
        title="The Critical Path"
        description="Enter the access password to view outstanding architecture tasks and the build programme."
        unconfiguredDescription="Public access has not been configured for this page."
        submitLabel="View tasks"
      />
    )
  }

  const params = await searchParams
  const [linear, timeline] = await Promise.all([
    getLinearCriticalPath(),
    getTimelineOverview(),
  ])

  // The linear.app deep link leaks the workspace slug, so it is session-only.
  const issues = linear.ok
    ? linear.issues.map((issue) => ({
        ...issue,
        linearUrl: hasSessionAccess ? issue.linearUrl : null,
      }))
    : []

  const summary = summariseIssues(issues)
  const initialTaskId = typeof params.task === "string" ? params.task : null

  const today = new Date()
  const nextMilestone = [...timeline.milestones]
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
    .find(
      (milestone) =>
        milestone.status !== "done" &&
        differenceInCalendarDays(new Date(milestone.plannedDate), today) >= 0,
    )

  const milestoneRows = timeline.milestones.map((milestone) => ({
    ...milestone,
    derivedStatus: deriveMilestoneStatus(milestone, today),
  }))

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border/80 bg-background/85 px-6 py-4 backdrop-blur-sm">
        <div>
          <Eyebrow>Courtyard House</Eyebrow>
          <h1 className="mt-1 text-2xl font-medium">The Critical Path</h1>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton fetchedAt={linear.ok ? linear.fetchedAt : null} />
          {viewer ? (
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Back to app
            </Link>
          ) : (
            <span className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground">
              View only
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-10 px-6 py-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Open tasks"
            value={String(summary.open)}
            detail={`${summary.total} in the project`}
          />
          <MetricCard
            label="In progress"
            value={String(summary.inProgress)}
            detail={summary.inProgress === 0 ? "Nothing started" : undefined}
          />
          <MetricCard
            label="Overdue"
            value={String(summary.overdue)}
            detail={summary.overdue === 0 ? "On schedule" : "Past due date"}
          />
          <MetricCard
            label="Next milestone"
            value={nextMilestone ? formatDate(nextMilestone.plannedDate) : "—"}
            detail={nextMilestone?.name}
          />
        </div>

        <section className="space-y-6">
          <div>
            <Eyebrow>Build programme</Eyebrow>
            <h2 className="mt-3 text-2xl font-medium tracking-tight">
              Timeline and milestones
            </h2>
          </div>

          <TimelineStrip
            milestones={timeline.milestones}
            phases={timeline.phases}
          />
        </section>

        {/* Milestones and tasks sit side by side at equal width. */}
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="flex max-h-[640px] flex-col overflow-hidden border-border/70 py-0">
            <CardHeader className="shrink-0 px-5 pt-5">
              <CardTitle className="text-2xl font-medium tracking-tight">
                Milestones
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                  <TableRow>
                    <TableHead>Milestone</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestoneRows.map((milestone) => (
                    <TableRow key={milestone.id}>
                      <TableCell className="font-medium">
                        {milestone.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(milestone.plannedDate)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={milestone.derivedStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div>
            {linear.ok ? (
              <CriticalPathClient issues={issues} initialTaskId={initialTaskId} />
            ) : (
              <div className="border border-dashed border-border/70 bg-secondary/30 px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {/* Config detail is only useful to — and only shown to — the team. */}
                  {hasSessionAccess
                    ? linear.reason === "not-configured"
                      ? `Linear is not connected. Set LINEAR_API_KEY to sync the “${getLinearProjectName()}” project.`
                      : linear.message
                    : "Tasks are temporarily unavailable. The build programme above is still current."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
