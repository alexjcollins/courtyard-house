import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { BudgetScopeToggle } from "@/components/budget-scope-toggle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { canViewCosts, requirePermission } from "@/lib/auth"
import { getProjectData } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

type CategoriesPageProps = {
  searchParams?: Promise<{
    scope?: string
  }>
}

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const viewer = await requirePermission("categories:view")
  const data = await getProjectData()
  const showCosts = canViewCosts(viewer)
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const constructionOnly = resolvedSearchParams?.scope === "construction"
  const visibleCategories = constructionOnly
    ? data.categories.filter((category) => category.reportingBucket !== "soft_cost")
    : data.categories
  const activeTotals = constructionOnly ? data.totals.construction : data.totals

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Categories
            </p>
            <h1 className="mt-3 text-4xl font-medium tracking-tight">
              Budget-led category tracking
            </h1>
          </div>
          {showCosts ? <BudgetScopeToggle constructionOnly={constructionOnly} /> : null}
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Each category rolls up budget, committed, invoiced, paid, forecast, and
          decision impact. Line items are lightweight placeholders until full CRUD is
          needed.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleCategories.slice(0, 4).map((category) => (
          <Card key={category.id} className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {category.id.replaceAll("_", " ")}
              </p>
              <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                {category.name}
              </CardTitle>
              {category.notes ? (
                <p className="text-sm leading-6 text-muted-foreground">{category.notes}</p>
              ) : null}
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <p className="text-sm text-muted-foreground">
                {showCosts
                  ? `Budget ${formatCurrency(category.metrics.budget.exVat)} · Forecast ${formatCurrency(category.metrics.forecast.exVat)}`
                  : `${category.lineItems.length} line items · ${category.decisions.length} decisions · ${category.ideas.length} ideas`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Category roll-up
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                {showCosts ? (
                  <>
                    <TableHead>Budget</TableHead>
                    <TableHead>Committed</TableHead>
                    <TableHead>Invoiced</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Forecast</TableHead>
                    <TableHead>Variance</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Line items</TableHead>
                    <TableHead>Decisions</TableHead>
                    <TableHead>Ideas</TableHead>
                  </>
                )}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCategories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="max-w-[28rem] whitespace-normal">
                    <p className="font-medium text-foreground">{category.name}</p>
                    {category.notes ? (
                      <p className="mt-1 text-sm text-muted-foreground">{category.notes}</p>
                    ) : null}
                  </TableCell>
                  {showCosts ? (
                    <>
                      <TableCell>{formatCurrency(category.metrics.budget.exVat)}</TableCell>
                      <TableCell>{formatCurrency(category.metrics.committed.exVat)}</TableCell>
                      <TableCell>{formatCurrency(category.metrics.invoiced.exVat)}</TableCell>
                      <TableCell>{formatCurrency(category.metrics.paid.exVat)}</TableCell>
                      <TableCell>{formatCurrency(category.metrics.forecast.exVat)}</TableCell>
                      <TableCell>{formatCurrency(category.metrics.variance.exVat)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{category.lineItems.length}</TableCell>
                      <TableCell>{category.decisions.length}</TableCell>
                      <TableCell>{category.ideas.length}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right">
                    <Link
                      href={`/categories/${category.id}`}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                    >
                      Open
                      <ArrowRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {showCosts ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">
                    {constructionOnly ? "Construction total" : "Total"}
                  </TableCell>
                  <TableCell>{formatCurrency(activeTotals.budget.exVat)}</TableCell>
                  <TableCell>{formatCurrency(activeTotals.committed.exVat)}</TableCell>
                  <TableCell>{formatCurrency(activeTotals.invoiced.exVat)}</TableCell>
                  <TableCell>{formatCurrency(activeTotals.paid.exVat)}</TableCell>
                  <TableCell>{formatCurrency(activeTotals.forecast.exVat)}</TableCell>
                  <TableCell>{formatCurrency(activeTotals.variance.exVat)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
