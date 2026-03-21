import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { saveIdea } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as Parameters<typeof saveIdea>[0]

    if (!body?.categoryId || !body?.title) {
      return NextResponse.json(
        { error: "Category and title are required." },
        { status: 400 },
      )
    }

    const idea = await saveIdea(body)
    return NextResponse.json({ idea })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save idea.",
      },
      { status: 400 },
    )
  }
}
