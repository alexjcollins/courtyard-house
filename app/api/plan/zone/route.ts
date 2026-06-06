import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { deletePlanZone, savePlanZone } from "@/lib/plan-db"

export async function POST(request: Request) {
  const auth = await authorizeApi("plan:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      deleteZoneId?: string
      zoneId?: string
      name?: unknown
      color?: unknown
      description?: unknown
      squares?: unknown
      decisionItemIds?: unknown
    }

    if (typeof body.deleteZoneId === "string" && body.deleteZoneId.trim()) {
      await deletePlanZone(body.deleteZoneId.trim())
      return NextResponse.json({ ok: true, deletedZoneId: body.deleteZoneId.trim() })
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "A zone name is required." }, { status: 400 })
    }

    if (typeof body.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.color.trim())) {
      return NextResponse.json({ error: "A valid hex colour is required." }, { status: 400 })
    }

    if (!Array.isArray(body.squares) || body.squares.length === 0) {
      return NextResponse.json(
        { error: "Select at least one square for the zone." },
        { status: 400 },
      )
    }

    const zone = await savePlanZone({
      zoneId: typeof body.zoneId === "string" ? body.zoneId : null,
      name: body.name,
      color: body.color,
      description: typeof body.description === "string" ? body.description : null,
      squares: body.squares as number[],
      decisionItemIds: Array.isArray(body.decisionItemIds)
        ? (body.decisionItemIds as string[])
        : [],
    })

    return NextResponse.json({ ok: true, zone })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the zone." },
      { status: 400 },
    )
  }
}
