import { StatusBadge } from "@/components/status-badge"
import { TimelineStrip } from "@/components/timeline-strip"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getProjectData } from "@/lib/data"
import { formatCurrency, formatDate } from "@/lib/format"

export default async function TimelinePage() {
  const data = await getProjectData()
  const milestoneMap = new Map(
    data.timelineFile.milestones.map((milestone) => [milestone.id, milestone]),
  )

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Timeline
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Milestones, phases, and dependency chains
        </h1>
      </section>

      <TimelineStrip
        milestones={data.timelineFile.milestones}
        phases={data.timeline.phases}
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Phases
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5">
            {data.timeline.phases.map((phase) => (
              <div
                key={phase.id}
                className="border border-border/70 bg-secondary/30 p-4"
              >
                <p className="text-sm font-medium text-foreground">{phase.name}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDate(phase.startDate)} to {formatDate(phase.endDate)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {phase.milestoneIds
                    .map((milestoneId) => milestoneMap.get(milestoneId)?.name)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Dependency chains
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5">
            {data.timeline.chains.map((chain) => (
              <div
                key={chain.join("-")}
                className="border border-border/70 bg-secondary/30 p-4"
              >
                <p className="text-sm leading-6 text-foreground">
                  {chain
                    .map((milestoneId) => milestoneMap.get(milestoneId)?.name || milestoneId)
                    .join(" → ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Milestones
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Milestone</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.timelineFile.milestones.map((milestone) => (
                <TableRow key={milestone.id}>
                  <TableCell className="font-medium">{milestone.name}</TableCell>
                  <TableCell>{formatDate(milestone.plannedDate)}</TableCell>
                  <TableCell>
                    <StatusBadge status={milestone.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Funding stages
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead>Release date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Drawdown</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.fundingStages.map((stage) => (
                <TableRow key={stage.id}>
                  <TableCell className="font-medium">{stage.name}</TableCell>
                  <TableCell>{stage.milestoneName}</TableCell>
                  <TableCell>{formatDate(stage.milestoneDate)}</TableCell>
                  <TableCell>
                    {stage.drawdownExcluded ? "Self-funded" : stage.fundingSourceName || "TBC"}
                  </TableCell>
                  <TableCell>{Math.round(stage.drawdownPercent * 100)}%</TableCell>
                  <TableCell>{formatCurrency(stage.amountExVat)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
