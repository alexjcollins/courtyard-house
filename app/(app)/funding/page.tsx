import { FundingPageClient } from "@/components/funding-page-client"
import { getProjectData } from "@/lib/data"

export default async function FundingPage() {
  const data = await getProjectData()

  return (
    <FundingPageClient
      funding={data.funding}
      fundingStages={data.fundingStages}
      baselineBuildBudgetExVat={data.categoriesFile.totals.baselineBuildBudgetExVat}
    />
  )
}
