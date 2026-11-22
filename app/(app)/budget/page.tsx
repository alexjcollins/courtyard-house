import { BudgetGrid } from "@/components/budget/budget-grid"
import { SaleScenarios } from "@/components/budget/sale-scenarios"
import { hasPermission, requirePermission } from "@/lib/auth"
import { getBudgetGridData } from "@/lib/budget-db"
import { getProjectData } from "@/lib/data"

export const dynamic = "force-dynamic"

export default async function BudgetPage() {
  const viewer = await requirePermission("budget:view")
  const [data, project] = await Promise.all([getBudgetGridData(), getProjectData()])

  return (
    <BudgetGrid
      initialData={data}
      canEdit={hasPermission(viewer, "budget:edit")}
      saleScenarios={
        <SaleScenarios
          projectPaidExVat={project.totals.paid.exVat}
          projectForecastExVat={project.totals.forecast.exVat}
          projectBudgetExVat={data.totals.baselineExVat}
          budgetEnvelopeExVat={data.totals.envelopeExVat}
          remainingContingencyExVat={data.totals.contingencyExVat}
        />
      }
    />
  )
}
