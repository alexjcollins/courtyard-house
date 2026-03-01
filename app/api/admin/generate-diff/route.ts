import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { generateAssistantDiff } from "@/lib/data"

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      prompt?: string
    }

    const diff = await generateAssistantDiff(body.prompt || "")
    return NextResponse.json({ diff })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not generate diff.",
      },
      { status: 400 },
    )
  }
}
