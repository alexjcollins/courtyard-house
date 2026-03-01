import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getProjectData } from "@/lib/data"
import { formatCurrency, formatDate } from "@/lib/format"

export default async function FundingPage() {
  const data = await getProjectData()

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Funding
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Sources, allocations, and drawdown
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Track where the project money is coming from, what has already been funded,
          and how the staged mortgage drawdown lands against the current build plan.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Planned funding" value={formatCurrency(data.funding.totalPlannedExVat)} />
        <MetricCard label="Allocated to date" value={formatCurrency(data.funding.totalAllocatedExVat)} />
        <MetricCard label="Remaining headroom" value={formatCurrency(data.funding.totalRemainingExVat)} />
        <MetricCard label="Project gap" value={formatCurrency(data.funding.projectGapExVat)} />
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Funding sources
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Planned</TableHead>
                <TableHead>Allocated</TableHead>
                <TableHead>Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.funding.sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="max-w-[26rem] whitespace-normal">
                    <p className="font-medium text-foreground">{source.name}</p>
                    {source.notes ? (
                      <p className="mt-1 text-sm text-muted-foreground">{source.notes}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{source.type}</TableCell>
                  <TableCell>{source.status}</TableCell>
                  <TableCell>{formatCurrency(source.amountExVat)}</TableCell>
                  <TableCell>{formatCurrency(source.allocatedExVat)}</TableCell>
                  <TableCell>{formatCurrency(source.remainingExVat)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Drawdown plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {data.fundingStages.map((stage) => (
              <div
                key={stage.id}
                className="border border-border/70 bg-secondary/20 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{stage.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stage.milestoneName} · {formatDate(stage.milestoneDate)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stage.drawdownExcluded
                        ? "Self-funded pre-start"
                        : `${stage.fundingSourceName || "Funding source"} drawdown`}
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
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Funded payments
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.funding.allocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No funding allocations recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.funding.allocations.map((allocation) => (
                    <TableRow key={allocation.paymentId}>
                      <TableCell>{formatDate(allocation.paidDate)}</TableCell>
                      <TableCell>{allocation.fundingSourceName}</TableCell>
                      <TableCell>{allocation.supplierName}</TableCell>
                      <TableCell>{allocation.categoryName}</TableCell>
                      <TableCell>{allocation.invoiceNumber}</TableCell>
                      <TableCell>{formatCurrency(allocation.amountExVat)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">
                    Total funded payments
                  </TableCell>
                  <TableCell>{formatCurrency(data.funding.totalAllocatedExVat)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70 py-0">
      <CardHeader className="px-5 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}
