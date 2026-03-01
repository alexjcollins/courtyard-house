import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { deleteInspirationItem } from "@/lib/data"

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      itemId?: string
    }

    if (!body?.itemId) {
      return NextResponse.json(
        { error: "Inspiration item ID is required." },
        { status: 400 },
      )
    }

    await deleteInspirationItem(body.itemId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete inspiration item.",
      },
      { status: 400 },
    )
  }
}
