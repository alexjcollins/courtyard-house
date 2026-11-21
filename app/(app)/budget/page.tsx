import { BudgetGrid } from "@/components/budget/budget-grid"
import { hasPermission, requirePermission } from "@/lib/auth"
import { getBudgetGridData } from "@/lib/budget-db"

export const dynamic = "force-dynamic"

export default async function BudgetPage() {
  const viewer = await requirePermission("budget:view")
  const data = await getBudgetGridData()

  return <BudgetGrid initialData={data} canEdit={hasPermission(viewer, "budget:edit")} />
}
