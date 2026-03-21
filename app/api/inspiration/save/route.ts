import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { saveInspirationItem } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as Parameters<typeof saveInspirationItem>[0]

    if (!body?.title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 })
    }

    const item = await saveInspirationItem(body)
    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save inspiration item.",
      },
      { status: 400 },
    )
  }
}
