import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { saveDecisionWorkspaceItem } from "@/lib/decisions-db"

const ALLOWED_DECISION_STAGES = new Set(["now", "later"])
const ALLOWED_PRIORITIES = new Set(["high", "medium", "low"])

export async function POST(request: Request) {
  const auth = await authorizeApi("decisions:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      itemId?: string
      title?: string
      categoryId?: string
      roomId?: string
      decisionCategoryId?: string
      typeGroup?: string
      typeSection?: string
      baselineSpec?: string
      baselineBudgetExVat?: number
      quantity?: number | null
      unit?: string | null
      decisionStage?: "now" | "later"
      priority?: "high" | "medium" | "low"
      description?: string | null
      architectNote?: string | null
    }

    if (
      typeof body.title !== "string" ||
      typeof body.categoryId !== "string" ||
      typeof body.roomId !== "string" ||
      typeof body.decisionCategoryId !== "string" ||
      typeof body.typeGroup !== "string" ||
      typeof body.typeSection !== "string" ||
      typeof body.baselineSpec !== "string" ||
      typeof body.baselineBudgetExVat !== "number" ||
      !ALLOWED_DECISION_STAGES.has(body.decisionStage ?? "now") ||
      !ALLOWED_PRIORITIES.has(body.priority ?? "medium")
    ) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
    }

    if (
      !(
        body.quantity === null ||
        body.quantity === undefined ||
        typeof body.quantity === "number"
      )
    ) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 })
    }

    const item = await saveDecisionWorkspaceItem({
      itemId: body.itemId,
      title: body.title,
      categoryId: body.categoryId,
      roomId: body.roomId,
      decisionCategoryId: body.decisionCategoryId,
      typeGroup: body.typeGroup,
      typeSection: body.typeSection,
      baselineSpec: body.baselineSpec,
      baselineBudgetExVat: body.baselineBudgetExVat,
      quantity: body.quantity,
      unit: body.unit,
      decisionStage: body.decisionStage ?? "now",
      priority: body.priority ?? "medium",
      description: body.description,
      architectNote: body.architectNote,
    })

    return NextResponse.json({ ok: true, item })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save decision item.",
      },
      { status: 400 },
    )
  }
}
