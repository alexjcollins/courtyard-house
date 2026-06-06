import Link from "next/link"
import { getCurrentViewer, hasPermission } from "@/lib/auth"
import { getDecisionWorkspaceItems } from "@/lib/decisions-db"
import { getPlanData } from "@/lib/plan-db"
import {
  hasPlanCookieAccess,
  isPlanPasswordConfigured,
} from "@/lib/plan-access"
import { createPrivateObjectSignedUrl } from "@/lib/storage"
import { PlanPasswordGate } from "@/components/plan/plan-password-gate"
import {
  PlanWorkspace,
  type PlanDecisionLite,
} from "@/components/plan/plan-workspace"

export const metadata = {
  title: "House plan — Courtyard House",
}

// Public route (outside the (app) auth group). Viewable by logged-in users with
// plan:view OR by anyone who has unlocked it with the shared password. Editing
// requires a WorkOS session with plan:edit.
export default async function PlanPage() {
  const viewer = await getCurrentViewer()
  const canEdit = Boolean(viewer && hasPermission(viewer, "plan:edit"))
  const canView =
    Boolean(viewer && hasPermission(viewer, "plan:view")) ||
    (await hasPlanCookieAccess())

  if (!canView && !canEdit) {
    return <PlanPasswordGate passwordConfigured={isPlanPasswordConfigured()} />
  }

  const [{ config, layers, zones }, items] = await Promise.all([
    getPlanData(),
    getDecisionWorkspaceItems(),
  ])

  const decisions: PlanDecisionLite[] = items.map((item) => ({
    id: item.id,
    code: item.code,
    title: item.title,
    roomName: item.roomName ?? null,
    decisionCategoryName: item.decisionCategoryName ?? null,
    status: item.status,
    selectedName: item.selectedName ?? null,
    imageUrl: item.selectedImageUrls?.[0] ?? null,
  }))

  // Admins can upload a custom plan image (stored in Spaces); otherwise fall back
  // to the static floor plan shipped in /public.
  const planImageUrl = config.imageKey
    ? createPrivateObjectSignedUrl(config.imageKey, { expiresInSeconds: 3600 })
    : "/ga-background.png"

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border/80 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {config.name}
          </p>
          <h1 className="mt-1 text-2xl font-medium">House plan</h1>
        </div>
        {viewer ? (
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Back to app
          </Link>
        ) : (
          <span className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground">
            View only
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <PlanWorkspace
          canEdit={canEdit}
          gridCols={config.gridCols}
          gridRows={config.gridRows}
          layers={layers}
          zones={zones}
          decisions={decisions}
          planImageUrl={planImageUrl}
        />
      </div>
    </div>
  )
}
