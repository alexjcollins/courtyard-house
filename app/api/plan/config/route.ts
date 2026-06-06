import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { savePlanConfig } from "@/lib/plan-db"

export async function POST(request: Request) {
  const auth = await authorizeApi("plan:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as { imageKey?: unknown; name?: unknown }

    const imageKey =
      typeof body.imageKey === "string" && body.imageKey.trim()
        ? body.imageKey.trim()
        : null
    const name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : null

    if (!imageKey && !name) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
    }

    const config = await savePlanConfig({ imageKey, name })
    return NextResponse.json({ ok: true, config })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the plan." },
      { status: 400 },
    )
  }
}
