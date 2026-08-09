import "server-only"

import { randomUUID } from "node:crypto"
import { z } from "zod"

import {
  deleteInvoice,
  deletePayment,
  deletePurchaseOrder,
  deleteQuote,
  deleteSupplier,
  getProcurementSnapshot,
  saveInvoice,
  savePayment,
  savePurchaseOrder,
  saveQuote,
  saveSupplier,
} from "@/lib/data"
import {
  getDecisionWorkspaceData,
  saveDecisionWorkspaceItem,
  updateDecisionWorkspaceItem,
} from "@/lib/decisions-db"
import {
  getFurnitureWorkspaceData,
  saveFurnitureWorkspaceItem,
  updateFurnitureWorkspaceItem,
} from "@/lib/furniture-db"
import { hasPermission, type AppPermission, type AuthViewer } from "@/lib/auth"
import type { ProjectIndex, IndexEntity } from "@/lib/assistant/index-builder"
import type { Proposal, ProposalField, ProposalKind } from "@/lib/assistant/protocol"

/**
 * Turning a tool call into a reviewable, applicable change.
 *
 * Two invariants:
 *
 *  - `before` is always read from project data, never from the model. The
 *    diff card is the user's only safeguard before a write, so it has to show
 *    what is actually there.
 *
 *  - Partial updates re-read the live record at apply time and merge onto that,
 *    not onto the index snapshot. The underlying save functions take whole
 *    records, so merging onto a snapshot up to 30s old would silently revert
 *    any concurrent edit made in another tab.
 */

export const PROPOSAL_PERMISSION: Record<ProposalKind, AppPermission> = {
  "decision.selection": "decisions:edit",
  "furniture.selection": "decisions:edit",
  "decision.item": "decisions:edit",
  "furniture.item": "decisions:edit",
  "procurement.save": "admin:edit",
  "procurement.delete": "admin:edit",
}

// --- schemas -----------------------------------------------------------------

const selectionSchema = z.object({
  ref: z.string().min(1),
  status: z.enum(["open", "selected", "on_hold"]),
  selectedName: z.string().optional(),
  selectedSource: z.string().optional(),
  selectedSourceUrl: z.string().optional(),
  selectedCostExVat: z.number().finite().nonnegative().optional(),
  selectedNotes: z.string().optional(),
  summary: z.string().min(1),
})

const itemUpdateSchema = z.object({
  ref: z.string().min(1),
  title: z.string().min(1).optional(),
  baselineSpec: z.string().optional(),
  baselineBudgetExVat: z.number().finite().nonnegative().optional(),
  quantity: z.number().finite().optional(),
  unit: z.string().optional(),
  decisionStage: z.enum(["now", "later"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  description: z.string().optional(),
  architectNote: z.string().optional(),
  summary: z.string().min(1),
})

const money = z.number().finite().nonnegative()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date")

/**
 * One schema per procurement entity type. These mirror the Save*Input types in
 * lib/data.ts, but with everything optional: a proposal may be a partial update,
 * and required-on-create is enforced after merging with the live record.
 */
const procurementFieldSchemas = {
  supplier: z.object({
    name: z.string().min(1).optional(),
    trade: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),
  }),
  quote: z.object({
    supplierId: z.string().optional(),
    categoryId: z.string().optional(),
    title: z.string().optional(),
    amountExVat: money.optional(),
    status: z.string().optional(),
    quoteDate: date.optional(),
    expiryDate: date.optional(),
    notes: z.string().optional(),
  }),
  purchaseOrder: z.object({
    supplierId: z.string().optional(),
    categoryId: z.string().optional(),
    quoteId: z.string().optional(),
    title: z.string().optional(),
    amountExVat: money.optional(),
    status: z.string().optional(),
    issuedDate: date.optional(),
    notes: z.string().optional(),
  }),
  invoice: z.object({
    purchaseOrderId: z.string().optional(),
    supplierId: z.string().optional(),
    number: z.string().optional(),
    amountExVat: money.optional(),
    status: z.string().optional(),
    issueDate: date.optional(),
    dueDate: date.optional(),
    notes: z.string().optional(),
  }),
  payment: z.object({
    invoiceId: z.string().optional(),
    amountExVat: money.optional(),
    paidDate: date.optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
    fundingSourceId: z.string().optional(),
    fundingAccountId: z.string().optional(),
  }),
} as const

type ProcurementEntity = keyof typeof procurementFieldSchemas

const procurementSchema = z.object({
  entityType: z.enum([
    "supplier",
    "quote",
    "purchaseOrder",
    "invoice",
    "payment",
  ]),
  entityRef: z.string().optional(),
  fields: z.record(z.unknown()),
  summary: z.string().min(1),
})

const deleteSchema = z.object({
  ref: z.string().min(1),
  summary: z.string().min(1),
})

/** Fields that must be present after merging, when creating a new record. */
const REQUIRED_ON_CREATE: Record<ProcurementEntity, string[]> = {
  supplier: ["name"],
  quote: ["supplierId", "title", "amountExVat", "status"],
  purchaseOrder: ["supplierId", "title", "amountExVat", "status"],
  invoice: ["purchaseOrderId", "amountExVat", "status"],
  payment: ["invoiceId", "amountExVat", "paidDate"],
}

const ENTITY_KIND_TO_PROCUREMENT: Partial<Record<IndexEntity["kind"], ProcurementEntity>> =
  {
    supplier: "supplier",
    quote: "quote",
    purchaseOrder: "purchaseOrder",
    invoice: "invoice",
    payment: "payment",
  }

// --- describe ----------------------------------------------------------------

export class ProposalError extends Error {}

function fail(message: string): never {
  throw new ProposalError(message)
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "number") return String(value)
  return String(value)
}

/** Build the before/after pairs, dropping fields that are not actually changing. */
function diff(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): { before: ProposalField[]; after: ProposalField[] } {
  const before: ProposalField[] = []
  const after: ProposalField[] = []

  for (const [field, nextValue] of Object.entries(next)) {
    if (nextValue === undefined) continue
    const currentValue = current[field]
    if (fmt(currentValue) === fmt(nextValue)) continue
    before.push({ field, value: fmt(currentValue) })
    after.push({ field, value: fmt(nextValue) })
  }

  return { before, after }
}

function proposal(
  kind: ProposalKind,
  summary: string,
  target: { id: string; label: string },
  parts: { before: ProposalField[]; after: ProposalField[] },
  payload: unknown,
): Proposal {
  return {
    id: `prop_${randomUUID()}`,
    kind,
    summary,
    target,
    before: parts.before,
    after: parts.after,
    payload,
  }
}

function resolve(index: ProjectIndex, ref: string): IndexEntity {
  const entity = index.entities.get(ref) ?? index.entities.get(ref.trim())
  if (!entity) {
    fail(
      `No project record has the ref "${ref}". Refs must come from the index; nothing was changed.`,
    )
  }
  return entity
}

/**
 * Validate one propose_* tool call and turn it into a reviewable Proposal.
 *
 * Throws ProposalError with a message written for the model: on a validation
 * failure the caller feeds it back as a tool result so the model gets one shot
 * at correcting itself.
 */
export function describeProposal(
  index: ProjectIndex,
  viewer: AuthViewer,
  toolName: string,
  rawInput: unknown,
): Proposal {
  switch (toolName) {
    case "propose_selection":
      return describeSelection(index, viewer, rawInput)
    case "propose_item_update":
      return describeItemUpdate(index, viewer, rawInput)
    case "propose_procurement":
      return describeProcurement(index, viewer, rawInput)
    case "propose_delete":
      return describeDelete(index, viewer, rawInput)
    default:
      fail(`Unknown tool "${toolName}".`)
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ")
    fail(`Invalid arguments — ${detail}`)
  }
  return result.data
}

function requirePermission(viewer: AuthViewer, kind: ProposalKind): void {
  if (!hasPermission(viewer, PROPOSAL_PERMISSION[kind])) {
    fail(`This account cannot make that change (needs ${PROPOSAL_PERMISSION[kind]}).`)
  }
}

function describeSelection(
  index: ProjectIndex,
  viewer: AuthViewer,
  raw: unknown,
): Proposal {
  const input = parse(selectionSchema, raw)
  const entity = resolve(index, input.ref)

  if (entity.kind !== "decision" && entity.kind !== "furniture") {
    fail(`Ref "${input.ref}" is a ${entity.kind}, not a decision or furniture item.`)
  }

  const kind: ProposalKind =
    entity.kind === "decision" ? "decision.selection" : "furniture.selection"
  requirePermission(viewer, kind)

  const clearing = input.status === "open"
  const next: Record<string, unknown> = {
    status: input.status,
    selectedName: clearing ? "" : input.selectedName,
    selectedSource: clearing ? "" : input.selectedSource,
    selectedSourceUrl: clearing ? "" : input.selectedSourceUrl,
    selectedCostExVat: clearing ? "" : input.selectedCostExVat,
    selectedNotes: clearing ? "" : input.selectedNotes,
  }

  const { ref: _ref, summary, ...selection } = input

  return proposal(
    kind,
    summary,
    { id: entity.id, label: entity.label },
    diff(entity.detail, next),
    { itemId: entity.id, summary, ...selection },
  )
}

function describeItemUpdate(
  index: ProjectIndex,
  viewer: AuthViewer,
  raw: unknown,
): Proposal {
  const input = parse(itemUpdateSchema, raw)
  const entity = resolve(index, input.ref)

  if (entity.kind !== "decision" && entity.kind !== "furniture") {
    fail(`Ref "${input.ref}" is a ${entity.kind}, not a decision or furniture item.`)
  }

  const kind: ProposalKind =
    entity.kind === "decision" ? "decision.item" : "furniture.item"
  requirePermission(viewer, kind)

  const { ref: _ref, summary, ...changes } = input
  if (Object.keys(changes).length === 0) {
    fail("No fields to change were supplied.")
  }

  return proposal(
    kind,
    summary,
    { id: entity.id, label: entity.label },
    diff(entity.detail, changes),
    { itemId: entity.id, ...changes },
  )
}

function describeProcurement(
  index: ProjectIndex,
  viewer: AuthViewer,
  raw: unknown,
): Proposal {
  const input = parse(procurementSchema, raw)
  requirePermission(viewer, "procurement.save")

  const entityType = input.entityType as ProcurementEntity
  const fields = parse(procurementFieldSchemas[entityType], input.fields) as Record<
    string,
    unknown
  >

  if (Object.keys(fields).length === 0) {
    fail(`No recognised ${entityType} fields were supplied.`)
  }

  let existing: IndexEntity | undefined
  if (input.entityRef) {
    existing = resolve(index, input.entityRef)
    if (ENTITY_KIND_TO_PROCUREMENT[existing.kind] !== entityType) {
      fail(
        `Ref "${input.entityRef}" is a ${existing.kind}, not a ${entityType}.`,
      )
    }
  } else {
    const missing = REQUIRED_ON_CREATE[entityType].filter(
      (key) => fields[key] === undefined,
    )
    if (missing.length > 0) {
      fail(
        `Creating a ${entityType} needs ${missing.join(", ")}. Supply them, or pass entityRef to update an existing record.`,
      )
    }
  }

  return proposal(
    "procurement.save",
    input.summary,
    {
      id: existing?.id ?? "",
      label: existing ? existing.label : `New ${entityType}`,
    },
    diff(existing?.detail ?? {}, fields),
    { entityType, entityId: existing?.id, fields },
  )
}

function describeDelete(
  index: ProjectIndex,
  viewer: AuthViewer,
  raw: unknown,
): Proposal {
  const input = parse(deleteSchema, raw)
  requirePermission(viewer, "procurement.delete")

  const entity = resolve(index, input.ref)
  const entityType = ENTITY_KIND_TO_PROCUREMENT[entity.kind]
  if (!entityType) {
    fail(
      `Ref "${input.ref}" is a ${entity.kind}. Only procurement records can be deleted here.`,
    )
  }

  return proposal(
    "procurement.delete",
    input.summary,
    { id: entity.id, label: entity.label },
    {
      before: [{ field: entityType, value: entity.label }],
      after: [{ field: entityType, value: "deleted" }],
    },
    { entityType, entityId: entity.id },
  )
}

// --- apply -------------------------------------------------------------------

/** Drop undefined so a partial update never blanks an unmentioned field. */
function defined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

// `ref` is resolved to a real id at propose time and dropped from the payload,
// so the apply-side schemas take `itemId` in its place.
const applySelectionSchema = selectionSchema
  .omit({ ref: true })
  .extend({ itemId: z.string().min(1) })
const applyItemSchema = itemUpdateSchema
  .omit({ ref: true, summary: true })
  .extend({ itemId: z.string().min(1) })
const applyProcurementSchema = z.object({
  entityType: z.enum(["supplier", "quote", "purchaseOrder", "invoice", "payment"]),
  entityId: z.string().optional(),
  fields: z.record(z.unknown()),
})
const applyDeleteSchema = z.object({
  entityType: z.enum(["supplier", "quote", "purchaseOrder", "invoice", "payment"]),
  entityId: z.string().min(1),
})

/**
 * Apply one proposal.
 *
 * The payload is re-validated from scratch here — the client round-trips
 * proposals through React state, so nothing arriving at this function is
 * trusted. Callers must apply proposals sequentially: the procurement and
 * payment writes are whole-file read-modify-write against object storage with no
 * locking, so two concurrent applies would lose one.
 */
export async function applyProposal(
  viewer: AuthViewer,
  proposalToApply: Proposal,
): Promise<void> {
  const kind = proposalToApply.kind
  requirePermission(viewer, kind)

  switch (kind) {
    case "decision.selection":
    case "furniture.selection": {
      const input = parse(applySelectionSchema, proposalToApply.payload)
      const update =
        kind === "decision.selection"
          ? updateDecisionWorkspaceItem
          : updateFurnitureWorkspaceItem

      await update({
        itemId: input.itemId,
        status: input.status,
        // `open` clears the selection; null is the explicit "unset" signal the
        // db layer expects, whereas undefined would leave the old value.
        selectedName: input.status === "open" ? null : (input.selectedName ?? null),
        selectedSource: input.status === "open" ? null : (input.selectedSource ?? null),
        selectedSourceUrl:
          input.status === "open" ? null : (input.selectedSourceUrl ?? null),
        selectedCostExVat:
          input.status === "open" ? null : (input.selectedCostExVat ?? null),
        selectedNotes: input.status === "open" ? null : (input.selectedNotes ?? null),
      })
      return
    }

    case "decision.item":
    case "furniture.item": {
      const input = parse(applyItemSchema, proposalToApply.payload)
      const isDecision = kind === "decision.item"

      // saveXWorkspaceItem takes a whole record, so read the live row and merge
      // onto that — never onto the index snapshot, which may be seconds stale
      // and would revert a concurrent edit.
      const { items } = isDecision
        ? await getDecisionWorkspaceData()
        : await getFurnitureWorkspaceData()
      const current = items.find((item) => item.id === input.itemId)
      if (!current) {
        fail("That item no longer exists — it may have been deleted since.")
      }

      const save = isDecision ? saveDecisionWorkspaceItem : saveFurnitureWorkspaceItem
      await save({
        itemId: current.id,
        title: input.title ?? current.title,
        categoryId: current.categoryId,
        roomId: current.roomId,
        decisionCategoryId: current.decisionCategoryId,
        typeGroup: current.typeGroup,
        typeSection: current.typeSection,
        baselineSpec: input.baselineSpec ?? current.baselineSpec,
        baselineBudgetExVat:
          input.baselineBudgetExVat ?? current.baselineBudgetExVat,
        quantity: input.quantity ?? current.quantity,
        unit: input.unit ?? current.unit,
        decisionStage: input.decisionStage ?? current.decisionStage,
        priority: input.priority ?? current.priority,
        description: input.description ?? current.description,
        architectNote: input.architectNote ?? current.architectNote,
      })
      return
    }

    case "procurement.save": {
      const input = parse(applyProcurementSchema, proposalToApply.payload)
      const entityType = input.entityType as ProcurementEntity
      const fields = parse(
        procurementFieldSchemas[entityType],
        input.fields,
      ) as Record<string, unknown>

      // Same whole-record merge problem as above: these save functions replace
      // the record, so merge onto the live row read here, not onto the snapshot.
      const { procurementFile, paymentsFile } = await getProcurementSnapshot()

      switch (entityType) {
        case "supplier": {
          const current = input.entityId
            ? procurementFile.suppliers.find((s) => s.id === input.entityId)
            : undefined
          if (input.entityId && !current) fail("That supplier no longer exists.")
          await saveSupplier({
            ...current,
            ...defined(fields),
            supplierId: current?.id,
            name: (fields.name as string) ?? current?.name ?? "",
          })
          return
        }
        case "quote": {
          const current = input.entityId
            ? procurementFile.quotes.find((q) => q.id === input.entityId)
            : undefined
          if (input.entityId && !current) fail("That quote no longer exists.")
          await saveQuote({
            ...current,
            ...defined(fields),
            quoteId: current?.id,
            supplierId: (fields.supplierId as string) ?? current?.supplierId ?? "",
            title: (fields.title as string) ?? current?.title ?? "",
            amountExVat:
              (fields.amountExVat as number) ?? current?.amountExVat ?? 0,
            status: (fields.status as string) ?? current?.status ?? "draft",
          })
          return
        }
        case "purchaseOrder": {
          const current = input.entityId
            ? procurementFile.purchaseOrders.find((p) => p.id === input.entityId)
            : undefined
          if (input.entityId && !current) fail("That purchase order no longer exists.")
          await savePurchaseOrder({
            ...current,
            ...defined(fields),
            purchaseOrderId: current?.id,
            supplierId: (fields.supplierId as string) ?? current?.supplierId ?? "",
            title: (fields.title as string) ?? current?.title ?? "",
            amountExVat:
              (fields.amountExVat as number) ?? current?.amountExVat ?? 0,
            status: (fields.status as string) ?? current?.status ?? "draft",
          })
          return
        }
        case "invoice": {
          const current = input.entityId
            ? procurementFile.invoices.find((i) => i.id === input.entityId)
            : undefined
          if (input.entityId && !current) fail("That invoice no longer exists.")
          await saveInvoice({
            ...current,
            ...defined(fields),
            invoiceId: current?.id,
            purchaseOrderId:
              (fields.purchaseOrderId as string) ?? current?.purchaseOrderId ?? "",
            amountExVat:
              (fields.amountExVat as number) ?? current?.amountExVat ?? 0,
            status: (fields.status as string) ?? current?.status ?? "draft",
          })
          return
        }
        case "payment": {
          const current = input.entityId
            ? paymentsFile.payments.find((p) => p.id === input.entityId)
            : undefined
          if (input.entityId && !current) fail("That payment no longer exists.")
          await savePayment({
            ...current,
            ...defined(fields),
            paymentId: current?.id,
            invoiceId: (fields.invoiceId as string) ?? current?.invoiceId ?? "",
            amountExVat:
              (fields.amountExVat as number) ?? current?.amountExVat ?? 0,
            paidDate: (fields.paidDate as string) ?? current?.paidDate ?? "",
          })
          return
        }
      }
      return
    }

    case "procurement.delete": {
      const input = parse(applyDeleteSchema, proposalToApply.payload)
      switch (input.entityType) {
        case "supplier":
          await deleteSupplier(input.entityId)
          return
        case "quote":
          await deleteQuote(input.entityId)
          return
        case "purchaseOrder":
          await deletePurchaseOrder(input.entityId)
          return
        case "invoice":
          await deleteInvoice(input.entityId)
          return
        case "payment":
          await deletePayment(input.entityId)
          return
      }
      return
    }
  }
}
