import { DecisionsBrowser } from "@/components/decisions-browser"
import { MetricCard } from "@/components/metric-card"
import { canViewCosts, requirePermission } from "@/lib/auth"
import { summarizeDecisionWorkspace } from "@/lib/decision-workspace"
import { formatCurrency } from "@/lib/format"
import {
  FURNITURE_BUDGET_CATEGORIES,
  getFurnitureWorkspaceData,
} from "@/lib/furniture-db"

type FurniturePageProps = {
  searchParams: Promise<{
    category?: string
    mode?: string
  }>
}

export default async function FurniturePage({ searchParams }: FurniturePageProps) {
  const viewer = await requirePermission("decisions:view")
  const [{ category, mode }, furnitureWorkspace] = await Promise.all([
    searchParams,
    getFurnitureWorkspaceData(),
  ])

  const showCosts = canViewCosts(viewer)
  const categoryNameById = Object.fromEntries(
    FURNITURE_BUDGET_CATEGORIES.map((entry) => [entry.id, entry.name]),
  )
  const filteredItems = category
    ? furnitureWorkspace.items.filter((item) => item.categoryId === category)
    : furnitureWorkspace.items
  const summary = summarizeDecisionWorkspace(filteredItems)

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Furniture
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Furniture selection workspace
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
          Track loose furniture, rugs, lamps, and outdoor pieces separately from the core build.
          This workspace keeps furniture budgets and chosen costs out of the main construction
          budget while giving you the same Finder-style selection flow.
        </p>
      </section>

      <div className={`grid gap-4 md:grid-cols-2 ${showCosts ? "xl:grid-cols-4" : ""}`}>
        <MetricCard label="Open items" value={String(summary.openItems)} />
        <MetricCard label="Selected items" value={String(summary.selectedItems)} />
        {showCosts ? (
          <>
            <MetricCard
              label="Baseline furniture budget"
              value={formatCurrency(summary.baselineBudgetExVat)}
            />
            <MetricCard
              label="Selected delta"
              value={formatCurrency(summary.selectedDeltaExVat)}
            />
          </>
        ) : null}
      </div>

      <DecisionsBrowser
        rooms={furnitureWorkspace.rooms}
        decisionCategories={furnitureWorkspace.categories}
        budgetCategories={[...FURNITURE_BUDGET_CATEGORIES]}
        items={furnitureWorkspace.items.map((item) => ({
          ...item,
          categoryName: categoryNameById[item.categoryId] || item.categoryId,
        }))}
        canEdit={viewer.role === "admin"}
        showCosts={showCosts}
        initialBrowseMode={mode === "type" ? "type" : "room"}
        categoryFilter={category}
        categoryNameById={categoryNameById}
        apiBasePath="/api/furniture"
        clearHref="/furniture"
        searchPlaceholder="Search all furniture"
        saveSelectionLabel="Save furniture selection"
        selectionImageFolder="files/furniture/selections"
        roomDialogDescription="Rooms drive the first column in the Finder-style furniture browser."
        categoryDialogDescription="Categories drive the second column when browsing furniture by room."
        itemDialogDescription="Create or update loose furniture items that sit outside the core build budget."
      />
    </div>
  )
}
