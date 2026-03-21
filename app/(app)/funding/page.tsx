import { FundingPageClient } from "@/components/funding-page-client"
import { requirePermission } from "@/lib/auth"
import { getProjectData } from "@/lib/data"

export default async function FundingPage() {
  await requirePermission("funding:view")
  const data = await getProjectData()

  return (
    <FundingPageClient
      funding={data.funding}
      fundingStages={data.fundingStages}
      baselineBuildBudgetExVat={data.categoriesFile.totals.baselineBuildBudgetExVat}
    />
  )
}
