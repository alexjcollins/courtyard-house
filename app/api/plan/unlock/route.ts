import { NextResponse } from "next/server"
import {
  PLAN_COOKIE,
  createPlanAccessToken,
  isPlanPasswordConfigured,
  planAccessCookieOptions,
  verifyPlanPassword,
} from "@/lib/plan-access"

// Public route: no WorkOS auth. Grants read-only view access via a shared password.
export async function POST(request: Request) {
  try {
    if (!isPlanPasswordConfigured()) {
      return NextResponse.json(
        { error: "Public access is not configured." },
        { status: 503 },
      )
    }

    const body = (await request.json()) as { password?: unknown }

    if (!verifyPlanPassword(body?.password)) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(PLAN_COOKIE, createPlanAccessToken(), planAccessCookieOptions)
    return response
  } catch {
    return NextResponse.json({ error: "Could not unlock the plan." }, { status: 400 })
  }
}
