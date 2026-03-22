import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { saveTask } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("tasks:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as Parameters<typeof saveTask>[0]

    if (!body?.title || !body?.status || !body?.priority) {
      return NextResponse.json(
        { error: "Title, status, and priority are required." },
        { status: 400 },
      )
    }

    const task = await saveTask(body)
    return NextResponse.json({ task })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save task.",
      },
      { status: 400 },
    )
  }
}
