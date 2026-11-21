import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { getBudgetGridData } from "@/lib/budget-db"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await authorizeApi("budget:view")
  if (auth.response) return auth.response

  try {
    return NextResponse.json(await getBudgetGridData(), {
      headers: { "cache-control": "no-store" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load the budget." },
      { status: 500 },
    )
  }
}
