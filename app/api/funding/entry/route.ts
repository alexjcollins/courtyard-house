import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { saveFundingSourceEntry } from "@/lib/data"

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as Parameters<typeof saveFundingSourceEntry>[0]

    if (!body?.sourceId || !body?.accountId || !body?.date || !body?.status) {
      return NextResponse.json(
        { error: "Funding source, savings pot, date, and status are required." },
        { status: 400 },
      )
    }

    const entry = await saveFundingSourceEntry(body)
    return NextResponse.json({ entry })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save savings entry.",
      },
      { status: 400 },
    )
  }
}
