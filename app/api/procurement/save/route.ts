import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import {
  getProcurementSnapshot,
  saveInvoice,
  savePayment,
  savePurchaseOrder,
  saveQuote,
  saveSupplier,
  type ProcurementEntityType,
} from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      entityType?: ProcurementEntityType
      payload?: Record<string, unknown>
    }

    if (!body?.entityType || !body.payload) {
      return NextResponse.json(
        { error: "Entity type and payload are required." },
        { status: 400 },
      )
    }

    let entity: unknown

    switch (body.entityType) {
      case "supplier":
        entity = await saveSupplier(body.payload as Parameters<typeof saveSupplier>[0])
        break
      case "quote":
        entity = await saveQuote(body.payload as Parameters<typeof saveQuote>[0])
        break
      case "purchaseOrder":
        entity = await savePurchaseOrder(
          body.payload as Parameters<typeof savePurchaseOrder>[0],
        )
        break
      case "invoice":
        entity = await saveInvoice(body.payload as Parameters<typeof saveInvoice>[0])
        break
      case "payment":
        entity = await savePayment(body.payload as Parameters<typeof savePayment>[0])
        break
      default:
        return NextResponse.json({ error: "Unknown procurement entity type." }, { status: 400 })
    }

    const snapshot = await getProcurementSnapshot()
    return NextResponse.json({
      entityType: body.entityType,
      entity,
      ...snapshot,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save procurement record.",
      },
      { status: 400 },
    )
  }
}
