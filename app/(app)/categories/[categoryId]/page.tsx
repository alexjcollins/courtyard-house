import { notFound } from "next/navigation"
import { CategoryIdeasBoard } from "@/components/category-ideas-board"
import { CategoryDecisionList } from "@/components/category-decision-list"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { canViewCosts, requirePermission } from "@/lib/auth"
import { getProjectData } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

type CategoryPageProps = {
  params: Promise<{
    categoryId: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryId } = await params
  const viewer = await requirePermission("categories:view")
  const data = await getProjectData()
  const category = data.categories.find((entry) => entry.id === categoryId)
  const showCosts = canViewCosts(viewer)

  if (!category) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 py-0">
          <CardHeader className="px-6 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Category landing
                </p>
                <CardTitle className="mt-3 text-4xl font-medium tracking-tight">
                  {category.name}
                </CardTitle>
              </div>
              <StatusBadge status={category.purchaseOrders.length > 0 ? "issued" : "planned"} />
            </div>
            {category.notes ? (
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                {category.notes}
              </p>
            ) : null}
          </CardHeader>
          {showCosts ? (
            <CardContent className="grid gap-4 px-6 pb-6 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Budget", category.metrics.budget.exVat],
                ["Committed", category.metrics.committed.exVat],
                ["Invoiced", category.metrics.invoiced.exVat],
                ["Paid", category.metrics.paid.exVat],
                ["Forecast", category.metrics.forecast.exVat],
                ["Variance", category.metrics.variance.exVat],
              ].map(([label, value]) => (
                <div key={label} className="border border-border/70 bg-secondary/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-3 text-2xl font-medium tracking-tight text-foreground">
                    {formatCurrency(Number(value))}
                  </p>
                </div>
              ))}
            </CardContent>
          ) : null}
        </Card>

        <Card className="border-border/80 py-0">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Linked records
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-6 pb-6 text-sm text-muted-foreground">
            <p>{category.lineItems.length} line items</p>
            <p>{category.quotes.length} quotes</p>
            <p>{category.purchaseOrders.length} purchase orders</p>
            <p>{category.invoices.length} invoices</p>
            <p>{category.decisions.length} decisions</p>
            <p>{category.ideas.length} ideas</p>
            {showCosts ? (
              <p>Remaining to forecast: {formatCurrency(category.metrics.remainingExVat)}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Line items
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  {showCosts ? <TableHead>Budget</TableHead> : null}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {category.lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showCosts ? 3 : 2} className="text-muted-foreground">
                      No line items yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  category.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[32rem] whitespace-normal font-medium">
                        {item.name}
                      </TableCell>
                      {showCosts ? <TableCell>{formatCurrency(item.budgetExVat)}</TableCell> : null}
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="text-2xl font-medium tracking-tight">
              Decisions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5">
            {category.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked decisions.</p>
            ) : (
              <CategoryDecisionList
                decisions={category.decisions}
                canEdit={viewer.role === "admin"}
                showCosts={showCosts}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Ideas
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <CategoryIdeasBoard
            categoryId={category.id}
            ideas={category.ideas}
            canEdit={viewer.role === "admin"}
            showCosts={showCosts}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Linked procurement
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 px-5 pb-5 xl:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Quotes
            </p>
            <div className="mt-3 space-y-3">
              {category.quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No quotes linked.</p>
              ) : (
                category.quotes.map((quote) => (
                  <div key={quote.id} className="border border-border/70 p-4">
                    <p className="text-sm font-medium text-foreground">{quote.title}</p>
                    {showCosts ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatCurrency(quote.amountExVat)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Purchase orders
            </p>
            <div className="mt-3 space-y-3">
              {category.purchaseOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No POs linked.</p>
              ) : (
                category.purchaseOrders.map((purchaseOrder) => (
                  <div
                    key={purchaseOrder.id}
                    className="border border-border/70 p-4"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {purchaseOrder.title}
                    </p>
                    {showCosts ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatCurrency(purchaseOrder.amountExVat)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Invoices
            </p>
            <div className="mt-3 space-y-3">
              {category.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices linked.</p>
              ) : (
                category.invoices.map((invoice) => (
                  <div key={invoice.id} className="border border-border/70 p-4">
                    <p className="text-sm font-medium text-foreground">
                      {invoice.number || invoice.id}
                    </p>
                    {showCosts ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatCurrency(invoice.amountExVat)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
