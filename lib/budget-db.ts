import "server-only"

import { cache } from "react"
import {
  applyBudgetChanges,
  computeBudgetTotals,
  readBudgetChanges,
  readBudgetState,
  toLegacyBudgetFiles,
  type BudgetApplyResult,
  type BudgetChange,
  type BudgetChangeSource,
  type BudgetStateWithHistory,
} from "@/lib/budget-core.mjs"
import type {
  BudgetGridCategory,
  BudgetGridData,
  BudgetGridItem,
  BudgetGridQuote,
  BudgetPayee,
} from "@/lib/budget-grid-types"
import type {
  PaymentsFile,
  ProcurementFile,
  ProjectFile,
  PurchaseOrder,
} from "@/lib/data"
import { getLegacyDecisionsFileFromDatabase, getPool } from "@/lib/decisions-db"
import { readDataFileText } from "@/lib/storage"

export { BudgetError } from "@/lib/budget-core.mjs"
export type { BudgetChange, BudgetApplyResult } from "@/lib/budget-core.mjs"

async function readJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readDataFileText(fileName)) as T
}

/**
 * Budget data lives in Postgres. This rebuilds the legacy categories.json /
 * lineItems.json shapes so existing readers (getProjectData, etc.) keep working.
 */
export const getLegacyBudgetFilesFromDatabase = cache(async () => {
  const state = await readBudgetState(getPool())
  return toLegacyBudgetFiles(state)
})

/** The single write path for the app. Quotes are validated against live procurement. */
export async function applyBudgetChangesFromApp(
  changes: BudgetChange[],
  options: { actor: string; source: BudgetChangeSource; dryRun?: boolean },
): Promise<BudgetApplyResult> {
  const procurement = await readJson<ProcurementFile>("procurement.json")
  return applyBudgetChanges(getPool(), changes, {
    ...options,
    quotes: procurement.quotes.map((q) => ({ id: q.id, categoryId: q.categoryId, title: q.title })),
  })
}

export async function getRecentBudgetChanges(limit = 50) {
  return readBudgetChanges(getPool(), { limit })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function addPayee(map: Map<string, BudgetPayee>, supplierId: string, supplierName: string, amount: number, date: string) {
  const existing = map.get(supplierId)
  if (existing) {
    existing.paidExVat = round(existing.paidExVat + amount)
    existing.paymentCount += 1
    if (!existing.lastPaidDate || date > existing.lastPaidDate) existing.lastPaidDate = date
  } else {
    map.set(supplierId, { supplierId, supplierName, paidExVat: round(amount), paymentCount: 1, lastPaidDate: date || null })
  }
}

function sortPayees(map: Map<string, BudgetPayee>): BudgetPayee[] {
  return [...map.values()].sort((a, b) => b.paidExVat - a.paidExVat || a.supplierName.localeCompare(b.supplierName))
}

/** Everything the /budget grid needs, from narrow sources (not getProjectData). */
export async function getBudgetGridData(): Promise<BudgetGridData> {
  const warnings: string[] = []
  const [state, procurement, paymentsFile, project] = await Promise.all([
    readBudgetState(getPool()) as Promise<BudgetStateWithHistory>,
    readJson<ProcurementFile>("procurement.json"),
    readJson<PaymentsFile>("payments.json"),
    readJson<ProjectFile>("project.json"),
  ])

  const decisionDeltaByCategory = new Map<string, number>()
  try {
    const decisionsFile = await getLegacyDecisionsFileFromDatabase()
    for (const decision of decisionsFile.decisions) {
      const option =
        decision.selectedOptionIndex === null ? null : decision.options[decision.selectedOptionIndex] || null
      if (!option) continue
      decisionDeltaByCategory.set(
        decision.categoryId,
        (decisionDeltaByCategory.get(decision.categoryId) || 0) + option.costDeltaExVat,
      )
    }
  } catch (error) {
    warnings.push(`Decision deltas unavailable: ${error instanceof Error ? error.message : "unknown error"}`)
  }

  const defaultVatRate = project.budgeting?.vatRates?.default ?? 0.2
  const totals = computeBudgetTotals(state)
  const supplierName = new Map(procurement.suppliers.map((s) => [s.id, s.name]))
  const poById = new Map(procurement.purchaseOrders.map((po) => [po.id, po]))
  const invoicesByPo = new Map<string, ProcurementFile["invoices"]>()
  for (const invoice of procurement.invoices) {
    const list = invoicesByPo.get(invoice.purchaseOrderId) || []
    list.push(invoice)
    invoicesByPo.set(invoice.purchaseOrderId, list)
  }
  const paymentsByInvoice = new Map<string, PaymentsFile["payments"]>()
  for (const payment of paymentsFile.payments) {
    const list = paymentsByInvoice.get(payment.invoiceId) || []
    list.push(payment)
    paymentsByInvoice.set(payment.invoiceId, list)
  }

  // A quote's PO: either the PO points at the quote, or the quote records its conversion.
  const poByQuoteId = new Map<string, PurchaseOrder[]>()
  for (const po of procurement.purchaseOrders) {
    if (!po.quoteId) continue
    poByQuoteId.set(po.quoteId, [...(poByQuoteId.get(po.quoteId) || []), po])
  }
  for (const quote of procurement.quotes) {
    if (!quote.convertedToPurchaseOrderId) continue
    const po = poById.get(quote.convertedToPurchaseOrderId)
    if (!po) continue
    const list = poByQuoteId.get(quote.id) || []
    if (!list.some((p) => p.id === po.id)) poByQuoteId.set(quote.id, [...list, po])
  }

  type Spend = { committed: number; actual: number; paid: number; payees: Map<string, BudgetPayee> }
  const spendForPos = (pos: PurchaseOrder[]): Spend => {
    const spend: Spend = { committed: 0, actual: 0, paid: 0, payees: new Map() }
    for (const po of pos) {
      spend.committed += po.amountExVat
      for (const invoice of invoicesByPo.get(po.id) || []) {
        spend.actual += invoice.amountExVat
        for (const payment of paymentsByInvoice.get(invoice.id) || []) {
          spend.paid += payment.amountExVat
          const supplierId = invoice.supplierId || po.supplierId
          addPayee(spend.payees, supplierId, supplierName.get(supplierId) || supplierId, payment.amountExVat, payment.paidDate)
        }
      }
    }
    spend.committed = round(spend.committed)
    spend.actual = round(spend.actual)
    spend.paid = round(spend.paid)
    return spend
  }

  const quoteById = new Map(procurement.quotes.map((q) => [q.id, q]))
  const lineItemByQuote = new Map(state.lineItems.filter((i) => i.quoteId).map((i) => [i.quoteId as string, i.id]))

  const lineItemIds = new Set(state.lineItems.map((i) => i.id))
  const posByLineItem = new Map<string, PurchaseOrder[]>()
  for (const po of procurement.purchaseOrders) {
    if (!po.lineItemId) continue
    if (!lineItemIds.has(po.lineItemId)) {
      warnings.push(`Purchase order "${po.title}" points at budget line ${po.lineItemId}, which no longer exists.`)
      continue
    }
    posByLineItem.set(po.lineItemId, [...(posByLineItem.get(po.lineItemId) || []), po])
  }

  for (const item of state.lineItems) {
    if (item.quoteId && !quoteById.has(item.quoteId)) {
      warnings.push(`"${item.name}" links to quote ${item.quoteId}, which no longer exists in procurement.`)
    }
  }

  const categories: BudgetGridCategory[] = state.categories.map((category) => {
    const categoryVat = category.vatRate ?? defaultVatRate
    const categoryPos = procurement.purchaseOrders.filter((po) => po.categoryId === category.id)
    const categorySpend = spendForPos(categoryPos)
    const attributedPoIds = new Set<string>()

    const items: BudgetGridItem[] = state.lineItems
      .filter((item) => item.categoryId === category.id)
      .map((item) => {
        const quote = item.quoteId ? quoteById.get(item.quoteId) : undefined
        // Spend reaches a line item two ways: its picked quote's PO, and any PO filed
        // directly against it (e.g. every skip-hire PO → one "Skip hire" line).
        const pos = [...(quote ? poByQuoteId.get(quote.id) || [] : []), ...(posByLineItem.get(item.id) || [])]
          .filter((po, index, all) => all.findIndex((p) => p.id === po.id) === index)
        for (const po of pos) attributedPoIds.add(po.id)
        const spend = pos.length > 0 ? spendForPos(pos) : null
        return {
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          budgetExVat: item.budgetExVat,
          vatRate: item.vatRate ?? categoryVat,
          vatRateIsInherited: item.vatRate === null,
          quoteId: item.quoteId,
          quotedExVat: quote ? quote.amountExVat : null,
          committedExVat: spend ? spend.committed : null,
          actualExVat: spend ? spend.actual : null,
          paidExVat: spend ? spend.paid : null,
          payees: spend ? sortPayees(spend.payees) : [],
          version: item.version,
          lastEdit: state.lastChanges[`line_item:${item.id}`] ?? null,
        }
      })

    const quotedItems = items.filter((i) => i.quotedExVat !== null)
    const attributedActual = round(items.reduce((s, i) => s + (i.actualExVat ?? 0), 0))
    const attributedPaid = round(items.reduce((s, i) => s + (i.paidExVat ?? 0), 0))
    // POs from a picked quote but filed under another category still count on the item;
    // only subtract what this category's own POs contributed.
    const ownAttributed = spendForPos(categoryPos.filter((po) => attributedPoIds.has(po.id)))

    return {
      id: category.id,
      name: category.name,
      notes: category.notes,
      reportingBucket: category.reportingBucket === "soft_cost" ? "soft_cost" : "construction",
      vatRate: categoryVat,
      forecastOverrideExVat: category.forecastOverrideExVat,
      version: category.version,
      lastEdit: state.lastChanges[`category:${category.id}`] ?? null,
      budgetExVat: totals.categoryBudgets[category.id] ?? 0,
      quotedExVat: quotedItems.length > 0 ? round(quotedItems.reduce((s, i) => s + (i.quotedExVat ?? 0), 0)) : null,
      quoteDeltaExVat:
        quotedItems.length > 0
          ? round(quotedItems.reduce((s, i) => s + ((i.quotedExVat ?? 0) - i.budgetExVat), 0))
          : null,
      committedExVat: categorySpend.committed,
      actualExVat: round(Math.max(categorySpend.actual, attributedActual)),
      paidExVat: round(Math.max(categorySpend.paid, attributedPaid)),
      unallocatedActualExVat: round(categorySpend.actual - ownAttributed.actual),
      unallocatedPaidExVat: round(categorySpend.paid - ownAttributed.paid),
      payees: sortPayees(categorySpend.payees),
      unassignedQuoteCount: procurement.quotes.filter(
        (q) => q.categoryId === category.id && !lineItemByQuote.has(q.id),
      ).length,
      decisionDeltaExVat: decisionDeltaByCategory.has(category.id)
        ? round(decisionDeltaByCategory.get(category.id) || 0)
        : null,
      items,
    }
  })

  const quotes: BudgetGridQuote[] = procurement.quotes
    .map((q) => ({
      id: q.id,
      title: q.title,
      supplierName: supplierName.get(q.supplierId) || q.supplierId,
      amountExVat: q.amountExVat,
      status: q.status,
      quoteDate: q.quoteDate ?? null,
      categoryId: q.categoryId ?? null,
      lineItemId: lineItemByQuote.get(q.id) ?? null,
    }))
    .sort((a, b) => (b.quoteDate || "").localeCompare(a.quoteDate || "") || a.id.localeCompare(b.id))

  const { categoryBudgets: _ignored, ...gridTotals } = totals
  void _ignored

  return {
    generatedAt: new Date().toISOString(),
    categories,
    quotes,
    totals: gridTotals,
    warnings,
  }
}
