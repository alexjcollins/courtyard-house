import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { updateDecisionSelection } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      decisionId?: string
      selectedOptionIndex?: number | null
    }

    if (
      typeof body.decisionId !== "string" ||
      !(
        body.selectedOptionIndex === null ||
        typeof body.selectedOptionIndex === "number"
      )
    ) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
    }

    const decision = await updateDecisionSelection(
      body.decisionId,
      body.selectedOptionIndex,
    )

    return NextResponse.json({ ok: true, decision })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update decision selection.",
      },
      { status: 400 },
    )
  }
}
