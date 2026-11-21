import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import {
  BudgetError,
  applyBudgetChangesFromApp,
  getBudgetGridData,
  type BudgetChange,
} from "@/lib/budget-db"

export const dynamic = "force-dynamic"

/**
 * Apply a batch of budget changes from the grid. All-or-nothing; enforces the
 * contingency cap and per-row versions (409 on conflict). Returns the fresh grid.
 */
export async function POST(request: Request) {
  const auth = await authorizeApi("budget:edit")
  if (auth.response) return auth.response

  let body: { changes?: BudgetChange[]; dryRun?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  try {
    const result = await applyBudgetChangesFromApp(body.changes || [], {
      actor: auth.viewer.user.email || auth.viewer.user.id,
      source: "grid",
      dryRun: Boolean(body.dryRun),
    })
    const grid = await getBudgetGridData()
    return NextResponse.json({ result, grid })
  } catch (error) {
    if (error instanceof BudgetError) {
      // Send the fresh grid with conflicts so the client can reconcile in one round-trip.
      const grid = error.status === 409 ? await getBudgetGridData().catch(() => null) : null
      return NextResponse.json(
        { error: error.message, details: error.details ?? null, grid },
        { status: error.status },
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save." },
      { status: 500 },
    )
  }
}
