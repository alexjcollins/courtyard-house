import type Anthropic from "@anthropic-ai/sdk"

import { MAX_DETAIL_IDS, type AssistantVariant } from "@/lib/assistant/config"

/**
 * The assistant's tool surface: one read tool and four propose tools.
 *
 * Kept deliberately small. Tool schemas are re-sent on every request (they sit
 * at the very front of the prompt, ahead of the cache breakpoint), and a wide
 * surface also gives the model more ways to pick the wrong call. Reads mostly
 * need no tool at all — the index in the system prompt already answers "what is
 * X", "how many Y", "which Z are open" with no round-trip.
 *
 * No `strict: true`. Strict requires every property to be listed in `required`,
 * which forces the model to emit an explicit null for each unset field on a
 * partial update — more output tokens on every write, for a guarantee the
 * server-side zod parse in `proposals.ts` already provides. Malformed input gets
 * one correction hop instead.
 *
 * There is no `scope` parameter anywhere: the ref prefix already encodes the
 * entity kind (`d` decision, `f` furniture, `q` quote ...), so the server
 * resolves it. One less field to send, and one less way for the model to
 * contradict itself.
 */

const REF_HINT =
  "A ref from the index, e.g. d47 or f12. Never invent one — it must appear in the index."

const SUMMARY_HINT =
  "One short sentence describing the change, shown on the confirmation card the user sees."

const getDetail: Anthropic.Tool = {
  name: "get_detail",
  description:
    "Fetch the full record for up to " +
    MAX_DETAIL_IDS +
    " entities, including the long text fields the index omits: description, architect note, selection notes, source URL, supplier contact details, and dates. Call this only when answering needs text that is not already in the index.",
  input_schema: {
    type: "object",
    properties: {
      refs: {
        type: "array",
        items: { type: "string" },
        description: `Refs from the index, e.g. ["d47", "s3"]. Max ${MAX_DETAIL_IDS}.`,
      },
    },
    required: ["refs"],
  },
}

const proposeSelection: Anthropic.Tool = {
  name: "propose_selection",
  description:
    "Propose recording or changing the chosen product for a decision or furniture item. Use for 'we went with X at £Y', 'mark it selected', 'put it on hold', 'reopen it'. Set status to 'open' to clear an existing selection.",
  input_schema: {
    type: "object",
    properties: {
      ref: { type: "string", description: REF_HINT },
      status: {
        type: "string",
        enum: ["open", "selected", "on_hold"],
      },
      selectedName: {
        type: "string",
        description: "The chosen product or specification.",
      },
      selectedSource: { type: "string", description: "Supplier or retailer." },
      selectedSourceUrl: { type: "string" },
      selectedCostExVat: {
        type: "number",
        description:
          "Cost in GBP excluding VAT. Omit to fall back to the item's baseline budget.",
      },
      selectedNotes: { type: "string" },
      summary: { type: "string", description: SUMMARY_HINT },
    },
    required: ["ref", "status", "summary"],
  },
}

const proposeItemUpdate: Anthropic.Tool = {
  name: "propose_item_update",
  description:
    "Propose editing the baseline fields of an existing decision or furniture item — its title, baseline spec, baseline budget, quantity, unit, stage, priority, description or architect note. Pass only the fields that change. This does not create items and does not touch the chosen product (use propose_selection for that).",
  input_schema: {
    type: "object",
    properties: {
      ref: { type: "string", description: REF_HINT },
      title: { type: "string" },
      baselineSpec: { type: "string" },
      baselineBudgetExVat: { type: "number", description: "GBP excluding VAT." },
      quantity: { type: "number" },
      unit: { type: "string" },
      decisionStage: { type: "string", enum: ["now", "later"] },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      description: { type: "string" },
      architectNote: { type: "string" },
      summary: { type: "string", description: SUMMARY_HINT },
    },
    required: ["ref", "summary"],
  },
}

const proposeProcurement: Anthropic.Tool = {
  name: "propose_procurement",
  description:
    "Propose creating or updating a procurement record: a supplier, quote, purchase order, invoice or payment. Pass entityRef to update an existing record, or omit it to create a new one. Put the changing fields in `fields` — the field vocabulary for each entity type is in the system prompt.",
  input_schema: {
    type: "object",
    properties: {
      entityType: {
        type: "string",
        enum: ["supplier", "quote", "purchaseOrder", "invoice", "payment"],
      },
      entityRef: {
        type: "string",
        description:
          "Ref of the record being updated (a supplier id, or q/p/i/y ref). Omit when creating.",
      },
      fields: {
        type: "object",
        description:
          "The fields to set, using the names listed in the system prompt for this entityType.",
      },
      summary: { type: "string", description: SUMMARY_HINT },
    },
    required: ["entityType", "fields", "summary"],
  },
}

const proposeDelete: Anthropic.Tool = {
  name: "propose_delete",
  description:
    "Propose deleting a procurement record — a supplier, quote, purchase order, invoice or payment. Deletion is refused server-side if other records still reference the target.",
  input_schema: {
    type: "object",
    properties: {
      ref: {
        type: "string",
        description: "Ref of the record to delete (a supplier id, or q/p/i/y ref).",
      },
      summary: { type: "string", description: SUMMARY_HINT },
    },
    required: ["ref", "summary"],
  },
}

/**
 * Frozen arrays in a fixed order, one per variant.
 *
 * Never build these with conditional pushes: tools render at the very front of
 * the prompt, so any reordering or per-request assembly changes the cached
 * prefix and costs a full cache write on every turn.
 */
const ADMIN_TOOLS: Anthropic.Tool[] = [
  getDetail,
  proposeSelection,
  proposeItemUpdate,
  proposeProcurement,
  proposeDelete,
]

const ARCHITECT_TOOLS: Anthropic.Tool[] = [getDetail]

const TOOLS: Record<AssistantVariant, Anthropic.Tool[]> = {
  admin: ADMIN_TOOLS,
  architect: ARCHITECT_TOOLS,
}

export function toolsFor(variant: AssistantVariant): Anthropic.Tool[] {
  return TOOLS[variant]
}

export const PROPOSE_TOOL_NAMES = new Set([
  "propose_selection",
  "propose_item_update",
  "propose_procurement",
  "propose_delete",
])
