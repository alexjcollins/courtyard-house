// Client-safe types for the /budget grid. Built server-side by getBudgetGridData().

export type BudgetLastEdit = { actor: string; source: string; at: string } | null

export type BudgetPayee = {
  supplierId: string
  supplierName: string
  paidExVat: number
  paymentCount: number
  lastPaidDate: string | null
}

export type BudgetGridQuote = {
  id: string
  title: string
  supplierName: string
  amountExVat: number
  status: string
  quoteDate: string | null
  categoryId: string | null
  /** Line item this quote is the live quote for, if any. */
  lineItemId: string | null
}

export type BudgetGridItem = {
  id: string
  categoryId: string
  name: string
  budgetExVat: number
  /** Effective rate (item → category → project default). */
  vatRate: number
  vatRateIsInherited: boolean
  quoteId: string | null
  quotedExVat: number | null
  /** Derived via the linked quote → its PO → invoices → payments. Null when no quote/PO. */
  committedExVat: number | null
  actualExVat: number | null
  paidExVat: number | null
  payees: BudgetPayee[]
  version: number
  lastEdit: BudgetLastEdit
}

export type BudgetGridCategory = {
  id: string
  name: string
  notes: string | null
  reportingBucket: "construction" | "soft_cost"
  vatRate: number
  forecastOverrideExVat: number | null
  version: number
  lastEdit: BudgetLastEdit
  budgetExVat: number
  /** Σ quoted on line items that have a live quote. Null when none do. */
  quotedExVat: number | null
  /** Σ (quoted − budget) over line items that have a live quote. */
  quoteDeltaExVat: number | null
  committedExVat: number
  actualExVat: number
  paidExVat: number
  /** Category spend not attributable to a line item (POs not created from a picked quote). */
  unallocatedActualExVat: number
  unallocatedPaidExVat: number
  payees: BudgetPayee[]
  unassignedQuoteCount: number
  decisionDeltaExVat: number | null
  items: BudgetGridItem[]
}

export type BudgetGridTotals = {
  envelopeExVat: number
  baselineExVat: number
  contingencyExVat: number
  startingContingencyExVat: number
  maxDrawdownExVat: number
  drawdownExVat: number
  contingencyFloorExVat: number
  capHeadroomExVat: number
}

export type BudgetGridData = {
  generatedAt: string
  categories: BudgetGridCategory[]
  quotes: BudgetGridQuote[]
  totals: BudgetGridTotals
  warnings: string[]
}
