import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { deleteTask } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("tasks:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as { taskId?: string }

    if (!body?.taskId) {
      return NextResponse.json({ error: "Task id is required." }, { status: 400 })
    }

    await deleteTask(body.taskId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not delete task.",
      },
      { status: 400 },
    )
  }
}
