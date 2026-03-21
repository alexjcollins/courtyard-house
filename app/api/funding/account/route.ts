import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { saveFundingSourceAccount } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as Parameters<typeof saveFundingSourceAccount>[0]

    if (!body?.sourceId || !body?.name) {
      return NextResponse.json(
        { error: "Funding source and savings pot name are required." },
        { status: 400 },
      )
    }

    const account = await saveFundingSourceAccount(body)
    return NextResponse.json({ account })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save savings pot.",
      },
      { status: 400 },
    )
  }
}
