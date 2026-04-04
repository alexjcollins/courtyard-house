import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { updateDecisionWorkspaceItem } from "@/lib/decisions-db"
import type { DecisionWorkspaceImage, DecisionWorkspaceStatus } from "@/lib/decision-workspace"

const ALLOWED_STATUSES = new Set<DecisionWorkspaceStatus>(["open", "selected", "on_hold"])

export async function POST(request: Request) {
  const auth = await authorizeApi("decisions:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      itemId?: string
      status?: DecisionWorkspaceStatus
      selectedName?: string | null
      selectedSource?: string | null
      selectedSourceUrl?: string | null
      selectedCostExVat?: number | null
      selectedNotes?: string | null
      selectedImages?: DecisionWorkspaceImage[]
    }

    if (typeof body.itemId !== "string" || !ALLOWED_STATUSES.has(body.status ?? "open")) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
    }

    if (
      !(
        body.selectedCostExVat === null ||
        body.selectedCostExVat === undefined ||
        typeof body.selectedCostExVat === "number"
      )
    ) {
      return NextResponse.json({ error: "Invalid selected cost." }, { status: 400 })
    }

    if (
      !(
        body.selectedImages === undefined ||
        (Array.isArray(body.selectedImages) &&
          body.selectedImages.every(
            (image) =>
              image &&
              typeof image === "object" &&
              typeof image.key === "string" &&
              (image.alt === undefined || image.alt === null || typeof image.alt === "string") &&
              (image.sourceUrl === undefined ||
                image.sourceUrl === null ||
                typeof image.sourceUrl === "string"),
          ))
      )
    ) {
      return NextResponse.json({ error: "Invalid selected images." }, { status: 400 })
    }

    const item = await updateDecisionWorkspaceItem({
      itemId: body.itemId,
      status: body.status ?? "open",
      selectedName: body.selectedName,
      selectedSource: body.selectedSource,
      selectedSourceUrl: body.selectedSourceUrl,
      selectedCostExVat: body.selectedCostExVat,
      selectedNotes: body.selectedNotes,
      selectedImages: body.selectedImages,
    })

    return NextResponse.json({ ok: true, item })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update decision selection.",
      },
      { status: 400 },
    )
  }
}
