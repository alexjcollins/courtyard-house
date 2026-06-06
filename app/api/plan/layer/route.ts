import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { deletePlanLayer, savePlanLayer } from "@/lib/plan-db"

export async function POST(request: Request) {
  const auth = await authorizeApi("plan:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      deleteLayerId?: string
      layerId?: string
      name?: unknown
    }

    if (typeof body.deleteLayerId === "string" && body.deleteLayerId.trim()) {
      await deletePlanLayer(body.deleteLayerId.trim())
      return NextResponse.json({ ok: true, deletedLayerId: body.deleteLayerId.trim() })
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "A plan name is required." }, { status: 400 })
    }

    const layer = await savePlanLayer({
      layerId: typeof body.layerId === "string" ? body.layerId : null,
      name: body.name,
    })

    return NextResponse.json({ ok: true, layer })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the plan." },
      { status: 400 },
    )
  }
}
