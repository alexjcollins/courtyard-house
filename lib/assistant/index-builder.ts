import "server-only"

import { createHash } from "node:crypto"

import {
  getProcurementSnapshot,
  getTasksRegisterData,
  getTimelineOverview,
  type CategoriesFile,
  type FundingModelFile,
  type LineItem,
} from "@/lib/data"
import { getDecisionWorkspaceData } from "@/lib/decisions-db"
import { getFurnitureWorkspaceData } from "@/lib/furniture-db"
import { readDataFileText } from "@/lib/storage"
import {
  summarizeDecisionWorkspace,
  type DecisionWorkspaceItem,
} from "@/lib/decision-workspace"
import type { AssistantVariant } from "@/lib/assistant/config"

/**
 * The whole project, serialized into a pipe-delimited block that lives in the
 * model's prompt-cached system prompt.
 *
 * The dataset is only ~400 entities, so shipping all of it up front removes the
 * retrieval round-trip that a search-tool design would need on every question,
 * and removes the failure mode where the model has to guess search terms for
 * rows it has never seen.
 *
 * Pipe-delimited rather than JSON: measured on the real decision register,
 * compact JSON is ~2.2x larger, entirely because of repeated key names. One
 * header line per section amortises those to zero.
 *
 * BYTE STABILITY IS LOAD-BEARING. Anthropic prompt caching is a prefix match, so
 * a single changed byte anywhere above the cache breakpoint invalidates the whole
 * prefix. Every rule below exists to keep repeated builds byte-identical:
 *   - sections sorted by primary id with a fixed comparator (never sort_order,
 *     never updated_at)
 *   - no dates, no "generated at", no `new Date()` anywhere in the output
 *   - numbers via `num()`: integers, no separators, no currency symbols
 *   - every field through `f()`: pipes and newlines stripped
 *   - empty is the empty string between delimiters, never "null" or "—"
 */
export type IndexEntityKind =
  | "decision"
  | "furniture"
  | "room"
  | "dcat"
  | "budget"
  | "lineItem"
  | "supplier"
  | "quote"
  | "purchaseOrder"
  | "invoice"
  | "payment"
  | "task"
  | "milestone"
  | "funding"

export type IndexEntity = {
  /** The short handle used in the index text, e.g. "d47". */
  handle: string
  /** The real database / file id. Never appears in the index text. */
  id: string
  kind: IndexEntityKind
  label: string
  /**
   * The long-text and low-frequency fields deliberately kept out of the index
   * text. Carrying them here makes `get_detail` a zero-I/O lookup and gives the
   * proposal layer a source for `before` values without a second query.
   */
  detail: Record<string, string>
}

export type ProjectIndex = {
  hash: string
  text: string
  variant: AssistantVariant
  /** Keyed by handle. Real ids are resolved out of the entity. */
  entities: Map<string, IndexEntity>
  /**
   * True when at least one source failed and its section is missing. Reads of
   * Spaces occasionally flake at the transport layer; the cache uses this to
   * retry sooner rather than serving an incomplete index for a full TTL window.
   */
  degraded: boolean
}

// --- field helpers -----------------------------------------------------------

/** Sanitize one field: strip the delimiter and any newline, collapse whitespace. */
function f(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/[|\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim()
}

/** Money and counts. Integers only — no locale formatting, no symbols. */
function num(value: unknown): string {
  if (value === null || value === undefined || value === "") return ""
  const n = Number(value)
  if (!Number.isFinite(n)) return ""
  return String(Math.round(n))
}

/** Status shorthand. Three chars saved per decision row, 212 rows. */
function st(status: string): string {
  if (status === "selected") return "s"
  if (status === "on_hold") return "h"
  return "o"
}

function byId<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function row(...fields: unknown[]): string {
  return fields.map(f).join("|")
}

/**
 * Foreign-key ids carry a long constant prefix (`room-`, `dec-cat-`,
 * `furniture-room-`, `furniture-category-`) that repeats on every one of the 212
 * item rows. Stripping it keeps the column self-describing — so the model does
 * not have to join against the lookup sections to answer "what's open in the
 * kitchen" — while removing ~3KB of pure repetition.
 */
const FK_PREFIXES = [
  "furniture-category-",
  "furniture-room-",
  "dec-cat-",
  "room-",
  "cat-",
]

function shortFk(value: string | undefined | null): string {
  const s = f(value)
  for (const prefix of FK_PREFIXES) {
    if (s.startsWith(prefix)) return s.slice(prefix.length)
  }
  return s
}

/**
 * Short opaque handles (`d47`, `f12`) stand in for real ids in the index text.
 *
 * Real ids here are long slugs — `airtightness-membranes-and-testing`,
 * `furniture-courtyard-external-interface-loose-planters` — and they tokenize
 * badly. Across 212 item rows plus a redundant `code` column they accounted for
 * roughly 40% of the index. The server owns the handle → id mapping, so the
 * model never sees or needs a real id.
 *
 * Handles are stable within a snapshot (which is what the prompt cache is pinned
 * to) because rows are assigned in id-sorted order.
 */
function handleAllocator(): (prefix: string) => string {
  const counters = new Map<string, number>()
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, next)
    return `${prefix}${next}`
  }
}

// --- section builders --------------------------------------------------------

type Section = { header: string; lines: string[] }

function renderSections(sections: Section[]): string {
  return sections
    .filter((s) => s.lines.length > 0)
    .map((s) => `${s.header}\n${s.lines.join("\n")}`)
    .join("\n\n")
}


// --- the builder -------------------------------------------------------------

export async function buildProjectIndex(
  variant: AssistantVariant,
): Promise<ProjectIndex> {
  const showCosts = variant === "admin"
  const entities = new Map<string, IndexEntity>()
  const sections: Section[] = []
  const totals: string[] = []
  const unavailable: string[] = []
  const nextHandle = handleAllocator()

  /** Register one entity and hand back its short index handle. */
  function add(
    kind: IndexEntityKind,
    prefix: string,
    id: string,
    label: string,
    detail: Record<string, string>,
  ): string {
    const handle = nextHandle(prefix)
    entities.set(handle, { handle, id, kind, label, detail })
    return handle
  }

  /**
   * Register an entity whose real id is already short and appears inline as a
   * foreign key elsewhere in the index. The real id doubles as the handle, so
   * there is no second vocabulary and no extra column.
   */
  function addUnderRealId(
    kind: IndexEntityKind,
    id: string,
    label: string,
    detail: Record<string, string>,
  ): void {
    entities.set(id, { handle: id, id, kind, label, detail })
  }

  // Each source is isolated. getProjectData() would be the obvious one-stop
  // read, but it throws on budget drift via validateBudgetIntegrity() — a chat
  // panel that 500s because category totals drifted is not acceptable. Losing
  // one section to a bad file is.
  const note = (name: string, error: unknown) => {
    unavailable.push(`${name} (${f((error as Error)?.message) || "unavailable"})`)
  }

  function emitWorkspace(
    label: "DECISIONS" | "FURNITURE",
    kind: "decision" | "furniture",
    prefix: string,
    catColumn: string,
    items: DecisionWorkspaceItem[],
  ): void {
    const lines = byId(items).map((item) => {
      const handle = add(kind, prefix, item.id, `${item.code} — ${item.title}`, {
        code: f(item.code),
        title: f(item.title),
        room: f(item.roomName ?? item.roomId),
        category: f(item.decisionCategoryName ?? item.decisionCategoryId),
        roomId: f(item.roomId),
        decisionCategoryId: f(item.decisionCategoryId),
        budgetCategoryId: f(item.categoryId),
        typeGroup: f(item.typeGroup),
        typeSection: f(item.typeSection),
        // Keyed to match the propose_item_update field name, so the diff card
        // can pair a proposed change with its current value.
        decisionStage: f(item.decisionStage),
        priority: f(item.priority),
        status: f(item.status),
        baselineSpec: f(item.baselineSpec),
        quantity: num(item.quantity),
        unit: f(item.unit),
        description: f(item.description),
        architectNote: f(item.architectNote),
        selectedName: f(item.selectedName),
        selectedSource: f(item.selectedSource),
        selectedSourceUrl: f(item.selectedSourceUrl),
        selectedNotes: f(item.selectedNotes),
        ...(showCosts
          ? {
              baselineBudgetExVat: num(item.baselineBudgetExVat),
              selectedCostExVat: num(item.selectedCostExVat),
            }
          : {}),
      })

      return showCosts
        ? row(
            handle,
            item.title,
            shortFk(item.roomId),
            shortFk(item.decisionCategoryId),
            st(item.status),
            num(item.baselineBudgetExVat),
            num(item.selectedCostExVat),
          )
        : row(
            handle,
            item.title,
            shortFk(item.roomId),
            shortFk(item.decisionCategoryId),
            st(item.status),
          )
    })

    sections.push({
      header: showCosts
        ? `## ${label} ref|title|room|${catColumn}|st|baselineExVat|selectedExVat`
        : `## ${label} ref|title|room|${catColumn}|st`,
      lines,
    })

    const s = summarizeDecisionWorkspace(items)
    totals.push(
      showCosts
        ? row(
            label.toLowerCase(),
            s.totalItems,
            `open ${s.openItems}`,
            `selected ${s.selectedItems}`,
            `hold ${s.onHoldItems}`,
            `baseline ${num(s.baselineBudgetExVat)}`,
            `selectedCost ${num(s.selectedCostExVat)}`,
            `delta ${num(s.selectedDeltaExVat)}`,
          )
        : row(
            label.toLowerCase(),
            s.totalItems,
            `open ${s.openItems}`,
            `selected ${s.selectedItems}`,
            `hold ${s.onHoldItems}`,
          ),
    )
  }

  // -- decisions --------------------------------------------------------------
  try {
    const { rooms, categories, items } = await getDecisionWorkspaceData()

    // Rooms and categories are referenced by their stripped slug in item rows,
    // so these sections exist to give the model the human-readable name for
    // each slug — no handle indirection.
    sections.push({
      header: "## ROOMS slug|name",
      lines: byId(rooms).map((r) => row(shortFk(r.id), r.name)),
    })
    sections.push({
      header: "## DCATS slug|name",
      lines: byId(categories).map((c) => row(shortFk(c.id), c.name)),
    })

    emitWorkspace("DECISIONS", "decision", "d", "dcat", items)
  } catch (error) {
    note("DECISIONS", error)
  }

  // -- furniture --------------------------------------------------------------
  try {
    const { rooms, categories, items } = await getFurnitureWorkspaceData()

    sections.push({
      header: "## FROOMS slug|name",
      lines: byId(rooms).map((r) => row(shortFk(r.id), r.name)),
    })
    sections.push({
      header: "## FCATS slug|name",
      lines: byId(categories).map((c) => row(shortFk(c.id), c.name)),
    })

    emitWorkspace("FURNITURE", "furniture", "f", "fcat", items)
  } catch (error) {
    note("FURNITURE", error)
  }

  // -- budget (admin only) -----------------------------------------------------
  if (showCosts) {
    try {
      const categoriesFile = JSON.parse(
        await readDataFileText("categories.json"),
      ) as CategoriesFile

      // Budget category ids are short and already appear inline as the
      // `budgetCat` foreign key on line items, quotes and POs. Registering the
      // entity under its real id avoids a second vocabulary the model would
      // have to keep straight.
      sections.push({
        header: "## BUDGET id|name|budgetExVat|bucket",
        lines: byId(categoriesFile.categories).map((c) => {
          addUnderRealId("budget", c.id, c.name, {
            name: f(c.name),
            budgetExVat: num(c.budgetExVat),
            vatRate: f(c.vatRate),
            reportingBucket: f(c.reportingBucket),
            notes: f(c.notes),
          })
          return row(c.id, c.name, num(c.budgetExVat), f(c.reportingBucket))
        }),
      })

      totals.push(
        row(
          "budget",
          `baseline ${num(categoriesFile.totals?.baselineBuildBudgetExVat)}`,
          `contingency ${num(categoriesFile.totals?.contingencyExVat)}`,
          `envelope ${num(categoriesFile.totals?.envelopeExVat)}`,
        ),
      )
    } catch (error) {
      note("BUDGET", error)
    }

    try {
      const lineItemsFile = JSON.parse(await readDataFileText("lineItems.json")) as {
        lineItems: LineItem[]
      }

      sections.push({
        header: "## LINEITEMS ref|budgetCat|name|budgetExVat|status",
        lines: byId(lineItemsFile.lineItems).map((l) => {
          const handle = add("lineItem", "l", l.id, l.name, {
            name: f(l.name),
            categoryId: f(l.categoryId),
            budgetExVat: num(l.budgetExVat),
            status: f(l.status),
          })
          return row(handle, l.categoryId, l.name, num(l.budgetExVat), l.status)
        }),
      })
    } catch (error) {
      note("LINEITEMS", error)
    }
  }

  // -- procurement + payments (admin only) -------------------------------------
  if (showCosts) {
    try {
      const { procurementFile, paymentsFile } = await getProcurementSnapshot()

      // Suppliers keep their real id as the handle: it is short, and quotes,
      // POs and invoices all reference it inline, so one shared vocabulary
      // beats a second mapping the model would have to hold.
      sections.push({
        header: "## SUPPLIERS id|name|trade",
        lines: byId(procurementFile.suppliers).map((s) => {
          addUnderRealId("supplier", s.id, s.name, {
            name: f(s.name),
            trade: f(s.trade),
            email: f(s.email),
            phone: f(s.phone),
            notes: f(s.notes),
          })
          return row(s.id, s.name, s.trade)
        }),
      })

      sections.push({
        header: "## QUOTES ref|supplier|budgetCat|title|amountExVat|status",
        lines: byId(procurementFile.quotes).map((q) => {
          const handle = add("quote", "q", q.id, q.title, {
            supplierId: f(q.supplierId),
            categoryId: f(q.categoryId),
            title: f(q.title),
            amountExVat: num(q.amountExVat),
            vatRate: f(q.vatRate),
            status: f(q.status),
            quoteDate: f(q.quoteDate),
            expiryDate: f(q.expiryDate),
            convertedToPurchaseOrderId: f(q.convertedToPurchaseOrderId),
            notes: f(q.notes),
          })
          return row(
            handle,
            q.supplierId,
            q.categoryId,
            q.title,
            num(q.amountExVat),
            q.status,
          )
        }),
      })

      sections.push({
        header: "## POS ref|supplier|budgetCat|title|amountExVat|status|stages",
        lines: byId(procurementFile.purchaseOrders).map((p) => {
          const handle = add("purchaseOrder", "p", p.id, p.title, {
            supplierId: f(p.supplierId),
            categoryId: f(p.categoryId),
            quoteId: f(p.quoteId),
            title: f(p.title),
            amountExVat: num(p.amountExVat),
            vatRate: f(p.vatRate),
            status: f(p.status),
            issuedDate: f(p.issuedDate),
            notes: f(p.notes),
            stagePayments: (p.stagePayments ?? [])
              .map((sp) => `${f(sp.title)}=${sp.type}:${num(sp.value)}`)
              .join("; "),
          })
          return row(
            handle,
            p.supplierId,
            p.categoryId,
            p.title,
            num(p.amountExVat),
            p.status,
            p.stagePayments?.length ?? 0,
          )
        }),
      })

      sections.push({
        header: "## INVOICES ref|po|supplier|number|amountExVat|status|dueDate",
        lines: byId(procurementFile.invoices).map((i) => {
          const poHandle = [...entities.values()].find(
            (e) => e.kind === "purchaseOrder" && e.id === i.purchaseOrderId,
          )?.handle
          const handle = add("invoice", "i", i.id, f(i.number) || i.id, {
            purchaseOrderId: f(i.purchaseOrderId),
            supplierId: f(i.supplierId),
            stagePaymentId: f(i.stagePaymentId),
            number: f(i.number),
            amountExVat: num(i.amountExVat),
            vatRate: f(i.vatRate),
            status: f(i.status),
            issueDate: f(i.issueDate),
            dueDate: f(i.dueDate),
            notes: f(i.notes),
          })
          return row(
            handle,
            poHandle,
            i.supplierId,
            i.number,
            num(i.amountExVat),
            i.status,
            i.dueDate,
          )
        }),
      })

      sections.push({
        header: "## PAYMENTS ref|invoice|amountExVat|paidDate|reference",
        lines: byId(paymentsFile.payments).map((p) => {
          const invHandle = [...entities.values()].find(
            (e) => e.kind === "invoice" && e.id === p.invoiceId,
          )?.handle
          const handle = add("payment", "y", p.id, f(p.reference) || p.id, {
            invoiceId: f(p.invoiceId),
            amountExVat: num(p.amountExVat),
            paidDate: f(p.paidDate),
            fundingSourceId: f(p.fundingSourceId),
            fundingAccountId: f(p.fundingAccountId),
            reference: f(p.reference),
            notes: f(p.notes),
          })
          return row(handle, invHandle, num(p.amountExVat), p.paidDate, p.reference)
        }),
      })

      const committed = procurementFile.purchaseOrders.reduce(
        (t, p) => t + p.amountExVat,
        0,
      )
      const invoiced = procurementFile.invoices.reduce((t, i) => t + i.amountExVat, 0)
      const paid = paymentsFile.payments.reduce((t, p) => t + p.amountExVat, 0)
      totals.push(
        row(
          "procurement",
          `suppliers ${procurementFile.suppliers.length}`,
          `committed ${num(committed)}`,
          `invoiced ${num(invoiced)}`,
          `paid ${num(paid)}`,
        ),
      )
    } catch (error) {
      note("PROCUREMENT", error)
    }
  }

  // -- tasks (read-only for the assistant, but useful context) ------------------
  try {
    const { tasks } = await getTasksRegisterData()

    sections.push({
      header: "## TASKS ref|code|title|status|priority|dueDate",
      lines: byId(tasks).map((t) => {
        const handle = add("task", "t", t.id, `${t.code} — ${t.title}`, {
          code: f(t.code),
          title: f(t.title),
          status: f(t.status),
          priority: f(t.priority),
          dueDate: f(t.dueDate),
          assignee: f(t.assignee?.name),
          notes: f(t.notes),
        })
        return row(handle, t.code, t.title, t.status, t.priority, t.dueDate)
      }),
    })
  } catch (error) {
    note("TASKS", error)
  }

  // -- timeline ----------------------------------------------------------------
  try {
    const { milestones } = await getTimelineOverview()

    sections.push({
      header: "## MILESTONES ref|name|plannedDate|actualDate|status",
      lines: byId(milestones).map((m) => {
        const handle = add("milestone", "m", m.id, m.name, {
          name: f(m.name),
          plannedDate: f(m.plannedDate),
          actualDate: f(m.actualDate),
          status: f(m.status),
          notes: f(m.notes),
        })
        return row(handle, m.name, m.plannedDate, m.actualDate, m.status)
      }),
    })
  } catch (error) {
    note("MILESTONES", error)
  }

  // -- funding (admin only) ----------------------------------------------------
  if (showCosts) {
    try {
      const fundingModel = JSON.parse(
        await readDataFileText("fundingModel.json"),
      ) as FundingModelFile

      sections.push({
        header: "## FUNDING ref|name|type|amountExVat|status",
        lines: byId(fundingModel.sources).map((s) => {
          const handle = add("funding", "g", s.id, s.name, {
            name: f(s.name),
            type: f(s.type),
            amountExVat: num(s.amountExVat),
            actualAmountExVat: num(s.actualAmountExVat),
            status: f(s.status),
            notes: f(s.notes),
            accounts: (s.accounts ?? []).map((a) => f(a.name)).join("; "),
          })
          return row(handle, s.name, s.type, num(s.amountExVat), s.status)
        }),
      })
    } catch (error) {
      note("FUNDING", error)
    }
  }

  // -- assemble ----------------------------------------------------------------
  const parts: string[] = [
    "# COURTYARD HOUSE PROJECT INDEX",
    "# Pipe-delimited, one header line per section. An empty field means no value.",
    "# All money is GBP ex-VAT, rounded to whole pounds.",
    "# st: o=open s=selected h=on_hold",
    "# 'ref' is an internal handle for tool calls only. Never show a ref to the user.",
  ]

  if (unavailable.length > 0) {
    parts.push(`# Sections not loaded: ${unavailable.join("; ")}`)
  }

  if (totals.length > 0) {
    parts.push(`\n## TOTALS\n${totals.join("\n")}`)
  }

  parts.push(`\n${renderSections(sections)}`)

  const text = parts.join("\n")
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16)

  return { hash, text, variant, entities, degraded: unavailable.length > 0 }
}
