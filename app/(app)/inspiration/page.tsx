import { InspirationBoard } from "@/components/inspiration-board"
import { MetricCard } from "@/components/metric-card"
import { requirePermission } from "@/lib/auth"
import { getInspirationItems } from "@/lib/data"

export default async function InspirationPage() {
  const viewer = await requirePermission("inspiration:view")
  const items = await getInspirationItems()
  const roomCount = new Set(items.map((item) => item.room).filter(Boolean)).size
  const tagCount = new Set(items.flatMap((item) => item.tags || [])).size

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Inspiration
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Moodboard and reference library
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Upload images or ingest links into a searchable masonry board. Tag each
          reference by room and label so it is easier to pull together directions
          for bathrooms, kitchens, joinery, finishes, and detail studies.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="References" value={String(items.length)} />
        <MetricCard label="Tagged rooms" value={String(roomCount)} />
        <MetricCard label="Tags in use" value={String(tagCount)} />
      </div>

      <InspirationBoard items={items} canEdit={viewer.role === "admin"} />
    </div>
  )
}
