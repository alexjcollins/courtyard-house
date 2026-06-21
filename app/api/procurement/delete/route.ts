import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import {
  deleteInvoice,
  deletePayment,
  deletePurchaseOrder,
  deleteQuote,
  deleteSupplier,
  getProcurementSnapshot,
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
      entityId?: string
    }

    if (!body?.entityType || !body.entityId) {
      return NextResponse.json(
        { error: "Entity type and entity id are required." },
        { status: 400 },
      )
    }

    switch (body.entityType) {
      case "supplier":
        await deleteSupplier(body.entityId)
        break
      case "quote":
        await deleteQuote(body.entityId)
        break
      case "purchaseOrder":
        await deletePurchaseOrder(body.entityId)
        break
      case "invoice":
        await deleteInvoice(body.entityId)
        break
      case "payment":
        await deletePayment(body.entityId)
        break
      default:
        return NextResponse.json({ error: "Unknown procurement entity type." }, { status: 400 })
    }

    const snapshot = await getProcurementSnapshot()
    return NextResponse.json({
      ok: true,
      entityType: body.entityType,
      ...snapshot,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete procurement record.",
      },
      { status: 400 },
    )
  }
}
