import { ProcurementPageClient } from "@/components/procurement-page-client"
import { hasPermission, requirePermission } from "@/lib/auth"
import { getProjectData } from "@/lib/data"

export default async function ProcurementPage() {
  const viewer = await requirePermission("procurement:view")
  const data = await getProjectData()

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Procurement
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Quotes, POs, invoices, and staged payments
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Manage suppliers and cost records directly in the app. All changes read and
          write against the live Spaces-backed procurement and payment files.
        </p>
      </section>

      <ProcurementPageClient
        initialProcurementFile={data.procurementFile}
        initialPaymentsFile={data.paymentsFile}
        categories={data.categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        milestones={data.timelineFile.milestones.map((milestone) => ({
          id: milestone.id,
          name: milestone.name,
          plannedDate: milestone.plannedDate,
        }))}
        fundingSources={data.funding.sources.map((source) => ({
          id: source.id,
          name: source.name,
          accounts: source.accounts.map((account) => ({
            id: account.id,
            name: account.name,
          })),
        }))}
        canEdit={hasPermission(viewer, "admin:edit")}
      />
    </div>
  )
}
