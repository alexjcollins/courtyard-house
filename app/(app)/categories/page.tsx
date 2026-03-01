import Link from "next/link"
import { ArrowRight } from "lucide-react"
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
import { getProjectData } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

export default async function CategoriesPage() {
  const data = await getProjectData()

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Categories
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">Budget-led category tracking</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Each category rolls up budget, committed, invoiced, paid, forecast, and
          decision impact. Line items are lightweight placeholders until full CRUD is
          needed.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.categories.slice(0, 4).map((category) => (
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
                Budget {formatCurrency(category.metrics.budget.exVat)} · Forecast{" "}
                {formatCurrency(category.metrics.forecast.exVat)}
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
                <TableHead>Budget</TableHead>
                <TableHead>Committed</TableHead>
                <TableHead>Invoiced</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Forecast</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="max-w-[28rem] whitespace-normal">
                    <p className="font-medium text-foreground">{category.name}</p>
                    {category.notes ? (
                      <p className="mt-1 text-sm text-muted-foreground">{category.notes}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatCurrency(category.metrics.budget.exVat)}</TableCell>
                  <TableCell>{formatCurrency(category.metrics.committed.exVat)}</TableCell>
                  <TableCell>{formatCurrency(category.metrics.invoiced.exVat)}</TableCell>
                  <TableCell>{formatCurrency(category.metrics.paid.exVat)}</TableCell>
                  <TableCell>{formatCurrency(category.metrics.forecast.exVat)}</TableCell>
                  <TableCell>{formatCurrency(category.metrics.variance.exVat)}</TableCell>
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
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell>{formatCurrency(data.totals.budget.exVat)}</TableCell>
                <TableCell>{formatCurrency(data.totals.committed.exVat)}</TableCell>
                <TableCell>{formatCurrency(data.totals.invoiced.exVat)}</TableCell>
                <TableCell>{formatCurrency(data.totals.paid.exVat)}</TableCell>
                <TableCell>{formatCurrency(data.totals.forecast.exVat)}</TableCell>
                <TableCell>{formatCurrency(data.totals.variance.exVat)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
