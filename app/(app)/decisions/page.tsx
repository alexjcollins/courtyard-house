import { DecisionsBrowser } from "@/components/decisions-browser"
import { MetricCard } from "@/components/metric-card"
import { canViewCosts, requirePermission } from "@/lib/auth"
import { summarizeDecisionWorkspace } from "@/lib/decision-workspace"
import { getDecisionWorkspaceData } from "@/lib/decisions-db"
import { getProjectData } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

type DecisionsPageProps = {
  searchParams: Promise<{
    category?: string
    mode?: string
  }>
}

export default async function DecisionsPage({ searchParams }: DecisionsPageProps) {
  const viewer = await requirePermission("decisions:view")
  const [{ category, mode }, data, decisionWorkspace] = await Promise.all([
    searchParams,
    getProjectData(),
    getDecisionWorkspaceData(),
  ])

  const showCosts = canViewCosts(viewer)
  const categoryNameById = Object.fromEntries(
    data.categories.map((entry) => [entry.id, entry.name]),
  )
  const budgetCategories = data.categories.map((entry) => ({
    id: entry.id,
    name: entry.name,
  }))
  const filteredItems = category
    ? decisionWorkspace.items.filter((item) => item.categoryId === category)
    : decisionWorkspace.items
  const summary = summarizeDecisionWorkspace(filteredItems)

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Decisions
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Build decision workspace
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
          Browse the project like a Finder-style register. Start at room or system level, move into
          a narrower category, then select the exact build item on the right to capture the current
          allowance, chosen product, supplier, and cost.
        </p>
      </section>

      <div className={`grid gap-4 md:grid-cols-2 ${showCosts ? "xl:grid-cols-4" : ""}`}>
        <MetricCard label="Open items" value={String(summary.openItems)} />
        <MetricCard label="Selected items" value={String(summary.selectedItems)} />
        {showCosts ? (
          <>
            <MetricCard label="Baseline budget" value={formatCurrency(summary.baselineBudgetExVat)} />
            <MetricCard label="Selected delta" value={formatCurrency(summary.selectedDeltaExVat)} />
          </>
        ) : null}
      </div>

      <DecisionsBrowser
        rooms={decisionWorkspace.rooms}
        decisionCategories={decisionWorkspace.categories}
        budgetCategories={budgetCategories}
        items={decisionWorkspace.items.map((item) => ({
          ...item,
          categoryName: categoryNameById[item.categoryId] || item.categoryId,
        }))}
        canEdit={viewer.role === "admin"}
        showCosts={showCosts}
        initialBrowseMode={mode === "type" ? "type" : "room"}
        categoryFilter={category}
        categoryNameById={categoryNameById}
      />
    </div>
  )
}
