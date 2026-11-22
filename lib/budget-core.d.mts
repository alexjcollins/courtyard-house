import type { Pool, PoolClient } from "pg"

type Queryable = Pick<Pool | PoolClient, "query">

export declare const BUDGET_SETTINGS_ID: "default"
export declare const BUDGET_SCHEMA_SQL: string

export declare class BudgetError extends Error {
  constructor(message: string, status?: number, details?: Record<string, unknown>)
  status: number
  details?: Record<string, unknown>
}

export type BudgetSettings = {
  envelopeExVat: number
  startingContingencyExVat: number
  /** null = no cap on contingency drawdown. */
  maxDrawdownExVat: number | null
  contingencyVatRate: number
  contingencyRules: string | null
  updatedAt: string | null
}

export type BudgetCategoryRecord = {
  id: string
  name: string
  notes: string | null
  vatRate: number | null
  vatIncluded: boolean
  reportingBucket: string | null
  forecastOverrideExVat: number | null
  sortOrder: number
  version: number
  updatedAt: string | null
  updatedBy: string | null
}

export type BudgetLineItemRecord = {
  id: string
  categoryId: string
  name: string
  budgetExVat: number
  vatRate: number | null
  vatIncluded: boolean
  status: string
  quoteId: string | null
  meta: Record<string, unknown>
  sortOrder: number
  version: number
  updatedAt: string | null
  updatedBy: string | null
}

export type BudgetLastChange = { actor: string; source: string; at: string }

export type BudgetState = {
  settings: BudgetSettings
  categories: BudgetCategoryRecord[]
  lineItems: BudgetLineItemRecord[]
}

export type BudgetStateWithHistory = BudgetState & {
  /** keyed `${entityType}:${entityId}` */
  lastChanges: Record<string, BudgetLastChange>
}

export type BudgetTotals = {
  categoryBudgets: Record<string, number>
  baselineExVat: number
  envelopeExVat: number
  contingencyExVat: number
  startingContingencyExVat: number
  maxDrawdownExVat: number | null
  drawdownExVat: number
  contingencyFloorExVat: number | null
  capHeadroomExVat: number | null
}

export type BudgetChangeSource = "grid" | "assistant" | "cli" | "migration"

export type BudgetChange =
  | {
      type: "update_line_item"
      id: string
      expectedVersion?: number
      patch: {
        name?: string
        budgetExVat?: number
        vatRate?: number | null
        quoteId?: string | null
      }
    }
  | {
      type: "create_line_item"
      categoryId: string
      name: string
      budgetExVat?: number
      vatRate?: number | null
      quoteId?: string | null
    }
  | { type: "delete_line_item"; id: string; expectedVersion?: number }
  | {
      type: "update_category"
      id: string
      expectedVersion?: number
      patch: {
        name?: string
        notes?: string | null
        forecastOverrideExVat?: number | null
      }
    }

export type BudgetAuditEntry = {
  entityType: "line_item" | "category"
  entityId: string
  field: string
  before: unknown
  after: unknown
}

export type BudgetApplyResult = {
  batchId: string
  dryRun: boolean
  changes: BudgetAuditEntry[]
  createdIds: string[]
  before: BudgetTotals
  after: BudgetTotals
}

export type BudgetChangeLogRow = {
  id: number
  batchId: string
  entityType: string
  entityId: string
  field: string
  before: unknown
  after: unknown
  actor: string
  source: string
  at: string
}

export declare function roundMoney(value: number): number
export declare function ensureBudgetSchema(db: Queryable): Promise<void>
export declare function readBudgetState(db: Queryable): Promise<BudgetStateWithHistory>
export declare function computeBudgetTotals(state: BudgetState): BudgetTotals
export declare function toLegacyBudgetFiles(state: BudgetState): {
  categoriesFile: {
    categories: Array<{
      id: string
      name: string
      budgetExVat: number
      vatRate?: number
      vatIncluded?: boolean
      notes?: string
      forecastOverrideExVat?: number
      reportingBucket?: "construction" | "soft_cost"
    }>
    globalContingency: { budgetExVat: number; vatRate?: number; rules?: string }
    totals: {
      baselineBuildBudgetExVat: number
      contingencyExVat: number
      envelopeExVat: number
    }
  }
  lineItemsFile: {
    lineItems: Array<{
      id: string
      categoryId: string
      name: string
      budgetExVat: number
      vatRate?: number
      vatIncluded?: boolean
      status: string
      quoteId?: string
      meta?: Record<string, unknown>
    }>
  }
}
export declare function applyBudgetChanges(
  pool: Pool,
  changes: BudgetChange[],
  options: {
    actor: string
    source: BudgetChangeSource
    dryRun?: boolean
    quotes?: Array<{ id: string; categoryId?: string; title: string }>
  },
): Promise<BudgetApplyResult>
export declare function readBudgetChanges(
  db: Queryable,
  options?: { limit?: number; entityId?: string },
): Promise<BudgetChangeLogRow[]>
