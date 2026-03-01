import { DecisionGroups } from "@/components/decision-groups"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { getProjectData } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

export default async function DecisionsPage() {
  const data = await getProjectData()
  const openDecisions = data.decisionsFile.decisions.filter(
    (decision) => decision.selectedOptionIndex === null,
  )
  const closedDecisions = data.decisionsFile.decisions.filter(
    (decision) => decision.selectedOptionIndex !== null,
  )
  const unresolvedCount = openDecisions.length
  const selectedDelta = data.decisionsFile.decisions.reduce((sum, decision) => {
    const selectedOption =
      decision.selectedOptionIndex === null
        ? null
        : decision.options[decision.selectedOptionIndex] || null
    return sum + (selectedOption?.costDeltaExVat || 0)
  }, 0)
  const categoriesWithDecisions = data.categories.filter(
    (category) => category.decisions.length > 0,
  )
  const openCategories = categoriesWithDecisions
    .map((category) => ({
      ...category,
      decisions: category.decisions.filter(
        (decision) => decision.selectedOptionIndex === null,
      ),
    }))
    .filter((category) => category.decisions.length > 0)
  const closedCategories = categoriesWithDecisions
    .map((category) => ({
      ...category,
      decisions: category.decisions.filter(
        (decision) => decision.selectedOptionIndex !== null,
      ),
    }))
    .filter((category) => category.decisions.length > 0)

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Decisions
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Selections with direct cost impact
        </h1>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Open decisions
            </p>
            <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
              {unresolvedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Closed decisions
            </p>
            <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
              {closedDecisions.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Selected delta
            </p>
            <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
              {formatCurrency(selectedDelta)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 py-0">
          <CardHeader className="px-5 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Forecast impact
            </p>
            <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
              {formatCurrency(data.totals.forecast.exVat)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Open
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-tight">
            Decisions still to resolve
          </h2>
        </div>
        <DecisionGroups categories={openCategories} mode="open" />
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Closed
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-tight">
            Selected decisions
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Closed decisions stay editable. Click the selected option to clear it or choose a different option.
          </p>
        </div>
        <DecisionGroups categories={closedCategories} mode="closed" />
      </section>
    </div>
  )
}
