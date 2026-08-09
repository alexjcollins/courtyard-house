import { NextResponse } from "next/server"

import { authorizeApi } from "@/lib/auth"
import { applyProposal, ProposalError } from "@/lib/assistant/proposals"
import type { ApplyRequestBody, ApplyResult, Proposal } from "@/lib/assistant/protocol"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Apply proposals the user has confirmed. No model involvement.
 *
 * The route gate is the same floor as the chat route; the real check is
 * per-proposal inside applyProposal, so an account that can edit decisions but
 * not procurement gets a per-item error rather than a blanket rejection.
 */
export async function POST(request: Request) {
  const auth = await authorizeApi("dashboard:view")
  if (auth.response) return auth.response
  const viewer = auth.viewer

  let body: ApplyRequestBody
  try {
    body = (await request.json()) as ApplyRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const proposals = Array.isArray(body.proposals) ? body.proposals : []
  if (proposals.length === 0) {
    return NextResponse.json({ error: "No proposals supplied." }, { status: 400 })
  }

  const result: ApplyResult = { applied: [], errors: [] }

  // Sequential, deliberately. Procurement and payment writes are whole-file
  // read-modify-write against object storage with no locking, so applying two
  // concurrently would silently drop one.
  for (const proposal of proposals as Proposal[]) {
    try {
      await applyProposal(viewer, proposal)
      result.applied.push(proposal.id)
    } catch (error) {
      const message =
        error instanceof ProposalError || error instanceof Error
          ? error.message
          : "Could not apply that change."
      console.error("[assistant] apply failed", proposal.kind, error)
      result.errors.push({ id: proposal.id, message })
    }
  }

  return NextResponse.json(result)
}
