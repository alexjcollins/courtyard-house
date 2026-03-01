import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { CategoryBarChart } from "@/components/category-bar-chart"
import { StatCard } from "@/components/stat-card"
import { TimelineStrip } from "@/components/timeline-strip"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getProjectData } from "@/lib/data"
import {
  formatCompactCurrency,
  formatCurrency,
  formatShortDate,
} from "@/lib/format"

export default async function DashboardPage() {
  const data = await getProjectData()

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          eyebrow="Construction budget"
          value={formatCurrency(data.totals.construction.budget.exVat)}
          detail={`${formatCurrency(data.totals.construction.budget.incVat)} inc VAT`}
        />
        <StatCard
          eyebrow="Next milestone"
          value={data.dashboard.nextMilestone ? formatShortDate(data.dashboard.nextMilestone.plannedDate) : "TBC"}
          detail={
            data.dashboard.nextMilestone
              ? data.dashboard.nextMilestone.name
              : "No milestone scheduled."
          }
          delta={{
            label:
              data.dashboard.slippageDays > 0
                ? `${data.dashboard.slippageDays} day slip`
                : "On programme",
            direction: data.dashboard.slippageDays > 0 ? "up" : "flat",
            placement: "top-right",
            tone: data.dashboard.slippageDays > 0 ? "default" : "success",
          }}
        />
        <StatCard
          eyebrow="Key risks"
          value={String(data.dashboard.riskCount)}
          detail="Open decisions, expiring quotes, overdue invoices, and slipped milestones."
        />
      </section>

      <section>
        <Card className="border-border/80 bg-card/90 py-0">
          <CardHeader className="px-6 pt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Timeline
                </p>
                <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
                  Project phase plan
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <TimelineStrip
              milestones={data.timelineFile.milestones}
              phases={data.timeline.phases}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          eyebrow="Contingency remaining"
          value={formatCurrency(data.totals.contingencyRemainingExVat)}
          detail="Positive selected decision deltas are treated as contingency drawdown."
        />
        <StatCard
          eyebrow="Committed"
          value={formatCurrency(data.totals.construction.committed.exVat)}
          detail={`${formatCurrency(data.totals.construction.committed.vat)} VAT`}
        />
        <StatCard
          eyebrow="Invoiced"
          value={formatCurrency(data.totals.construction.invoiced.exVat)}
          detail={`${formatCurrency(data.totals.construction.invoiced.incVat)} inc VAT`}
        />
        <StatCard
          eyebrow="Paid"
          value={formatCurrency(data.totals.construction.paid.exVat)}
          detail={`${formatCurrency(data.totals.construction.paid.incVat)} inc VAT`}
        />
        <StatCard
          eyebrow="Remaining"
          value={formatCurrency(data.totals.construction.remainingExVat)}
          detail={`${formatCurrency(data.totals.construction.forecast.exVat)} forecast`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <div>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Category chart
                </p>
                <h2 className="mt-2 text-3xl font-medium tracking-tight">
                  Budget vs committed vs paid
                </h2>
              </div>
              <Link
                href="/categories"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                View categories
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <CategoryBarChart data={data.dashboard.categoryChart} />
          </div>

          <Card className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Latest changes
                  </p>
                  <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                    Decision and procurement activity
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              {data.dashboard.latestChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tracked changes yet.</p>
              ) : (
                data.dashboard.latestChanges.map((change) => (
                  <div
                    key={`${change.kind}-${change.id}`}
                    className="flex items-start justify-between gap-4 border-t border-border/60 pt-4 first:border-t-0 first:pt-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{change.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{change.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {change.kind}
                      </p>
                      <p className="mt-1 text-sm text-foreground">{formatShortDate(change.date)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Upcoming payments
              </p>
              <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                Next 30 / 60 days
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              {[
                { label: "Next 30", payments: data.dashboard.upcomingPayments30 },
                { label: "Next 60", payments: data.dashboard.upcomingPayments60 },
              ].map(({ label, payments }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {label}
                    </p>
                    <div className="mt-3 space-y-3">
                      {payments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No scheduled payments.</p>
                      ) : (
                        payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="border border-border/70 bg-secondary/40 p-4"
                          >
                            <p className="text-sm font-medium text-foreground">{payment.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {payment.supplierName} · due {formatDate(payment.dueDate)}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                              <span className="text-muted-foreground">{payment.source}</span>
                              <span className="font-medium text-foreground">
                                {formatCurrency(payment.amountExVat)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Funding model
              </p>
              <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                Planned drawdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-5 pb-5">
              {data.fundingStages.filter((stage) => !stage.drawdownExcluded).map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center justify-between gap-3 border border-border/70 bg-secondary/30 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{stage.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stage.milestoneName} · {formatShortDate(stage.milestoneDate)} · {stage.fundingSourceName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {formatCurrency(stage.amountExVat)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {Math.round(stage.drawdownPercent * 100)}%
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {data.categories.slice(0, 3).map((category) => (
          <Card key={category.id} className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Category
                  </p>
                  <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                    {category.name}
                  </CardTitle>
                </div>
                <StatusBadge status={category.decisions.some((decision) => decision.selectedOptionIndex === null) ? "planned" : "accepted"} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="border border-border/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Budget
                  </p>
                  <p className="mt-2 font-medium text-foreground">
                    {formatCompactCurrency(category.metrics.budget.exVat)}
                  </p>
                </div>
                <div className="border border-border/70 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Paid
                  </p>
                  <p className="mt-2 font-medium text-foreground">
                    {formatCompactCurrency(category.metrics.paid.exVat)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {category.lineItems.length} line items · {category.purchaseOrders.length} POs ·{" "}
                {category.decisions.length} decisions
              </p>
              <Link
                href={`/categories/${category.id}`}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Open category
                <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
