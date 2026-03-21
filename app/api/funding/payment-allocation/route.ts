import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { updatePaymentFundingAllocation } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as Parameters<typeof updatePaymentFundingAllocation>[0]

    if (!body?.paymentId) {
      return NextResponse.json(
        { error: "Payment ID is required." },
        { status: 400 },
      )
    }

    await updatePaymentFundingAllocation(body)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update payment allocation.",
      },
      { status: 400 },
    )
  }
}
