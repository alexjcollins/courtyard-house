import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { saveFurnitureWorkspaceCategory } from "@/lib/furniture-db"

export async function POST(request: Request) {
  const auth = await authorizeApi("decisions:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      categoryId?: string
      name?: string
      sortOrder?: number | null
    }

    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
    }

    if (
      !(
        body.sortOrder === null ||
        body.sortOrder === undefined ||
        typeof body.sortOrder === "number"
      )
    ) {
      return NextResponse.json({ error: "Invalid sort order." }, { status: 400 })
    }

    const category = await saveFurnitureWorkspaceCategory({
      categoryId: body.categoryId,
      name: body.name,
      sortOrder: body.sortOrder,
    })

    return NextResponse.json({ ok: true, category })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save category.",
      },
      { status: 400 },
    )
  }
}
