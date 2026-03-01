import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { updateIdeaPickedState } from "@/lib/data"

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      ideaId?: string
      status?: "collected" | "picked"
    }

    if (!body.ideaId || !body.status) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
    }

    const idea = await updateIdeaPickedState(body.ideaId, body.status)
    return NextResponse.json({ idea })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update idea.",
      },
      { status: 400 },
    )
  }
}
