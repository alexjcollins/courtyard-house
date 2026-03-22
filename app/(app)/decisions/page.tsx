import { DecisionsGrid } from "@/components/decisions-grid"
import { MetricCard } from "@/components/metric-card"
import { canViewCosts, requirePermission } from "@/lib/auth"
import { getProjectData } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

export default async function DecisionsPage() {
  const viewer = await requirePermission("decisions:view")
  const data = await getProjectData()
  const showCosts = canViewCosts(viewer)
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

      <div className={`grid gap-4 md:grid-cols-2 ${showCosts ? "xl:grid-cols-4" : ""}`}>
        <MetricCard label="Open decisions" value={String(unresolvedCount)} />
        <MetricCard label="Closed decisions" value={String(closedDecisions.length)} />
        {showCosts ? (
          <>
            <MetricCard label="Selected delta" value={formatCurrency(selectedDelta)} />
            <MetricCard label="Forecast impact" value={formatCurrency(data.totals.forecast.exVat)} />
          </>
        ) : null}
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Register
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-tight">
            Decision register
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {viewer.role === "admin"
              ? "All decisions are shown in one grouped grid with spreadsheet-style columns. Use the Selection cell to choose an option or clear it back to No selection."
              : "All decisions are shown in one grouped grid with spreadsheet-style columns, in read-only mode."}
          </p>
        </div>
        <DecisionsGrid
          categories={categoriesWithDecisions}
          canEdit={viewer.role === "admin"}
          showCosts={showCosts}
        />
      </section>
    </div>
  )
}
