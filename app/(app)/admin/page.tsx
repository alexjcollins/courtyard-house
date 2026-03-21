import { AdminJsonWorkbench } from "@/components/admin-json-workbench"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermission } from "@/lib/auth"
import { getEditableFiles, getStorageStatus } from "@/lib/data"

export default async function AdminPage() {
  await requirePermission("admin:view")
  const [files, storage] = await Promise.all([
    getEditableFiles(),
    Promise.resolve(getStorageStatus()),
  ])

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Admin
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          JSON-first editing
        </h1>
      </section>

      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            Source-of-truth files
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            MVP data entry stays deliberately lightweight. Edit the JSON directly, or use
            the guided update box to generate a diff you can apply after review.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Active storage: private DigitalOcean Spaces objects. Data files resolve
            from {storage.dataLocation} and private object access can be issued
            through signed URLs.
          </p>
        </CardContent>
      </Card>

      <AdminJsonWorkbench files={files} />
    </div>
  )
}
