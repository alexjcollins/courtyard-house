// Budget data core: schema, reads, and the single write path for budget changes.
//
// Plain ESM (not TS) on purpose: it is imported by the Next app (via lib/budget-db.ts)
// AND by node scripts (scripts/budget.mjs, scripts/setup-budget-db.mjs), so every
// writer — the grid, the ⌘J assistant's Apply, and the CLI — goes through
// applyBudgetChanges() and gets the same validation, contingency cap, row versioning
// and audit log. Types live in budget-core.d.mts.
//
// Model:
//   - A category's budget is NOT stored. It is the sum of its active line items.
//   - Contingency is NOT stored. It is envelope − Σ line-item budgets.
//   - The envelope is fixed (budget_settings). Drawdown = starting contingency −
//     contingency. If max_drawdown_ex_vat is set, drawdown may not exceed it; null
//     means no cap (contingency can be used up entirely, and go negative).
//   - Every mutation runs in one transaction that row-locks budget_settings, so
//     concurrent writers serialise and the cap cannot be raced.

import { randomUUID } from "node:crypto"

export const BUDGET_SETTINGS_ID = "default"

export class BudgetError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message)
    this.name = "BudgetError"
    this.status = status
    this.details = details
  }
}

export function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100
}

function toNumber(value) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export const BUDGET_SCHEMA_SQL = `
create table if not exists budget_settings (
  id text primary key,
  envelope_ex_vat numeric(14,2) not null,
  starting_contingency_ex_vat numeric(14,2) not null,
  max_drawdown_ex_vat numeric(14,2),
  contingency_vat_rate numeric(6,4) not null default 0,
  contingency_rules text,
  updated_at timestamptz not null default now()
);

create table if not exists budget_categories (
  id text primary key,
  name text not null,
  notes text,
  vat_rate numeric(6,4),
  vat_included boolean not null default false,
  reporting_bucket text,
  forecast_override_ex_vat numeric(14,2),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists budget_line_items (
  id text primary key,
  category_id text not null references budget_categories(id),
  name text not null,
  budget_ex_vat numeric(14,2) not null default 0,
  vat_rate numeric(6,4),
  vat_included boolean not null default false,
  status text not null default 'budgeted',
  quote_id text,
  meta jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists budget_line_items_category_idx
  on budget_line_items (category_id) where is_active;

create table if not exists budget_changes (
  id bigserial primary key,
  batch_id text not null,
  entity_type text not null,
  entity_id text not null,
  field text not null,
  before_value jsonb,
  after_value jsonb,
  actor text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists budget_changes_entity_idx
  on budget_changes (entity_type, entity_id, created_at desc);
`

export async function ensureBudgetSchema(db) {
  await db.query(BUDGET_SCHEMA_SQL)
  // Tables created before the cap became optional had a NOT NULL constraint.
  await db.query(`alter table budget_settings alter column max_drawdown_ex_vat drop not null`)
}

function mapSettings(row) {
  if (!row) {
    throw new BudgetError(
      "Budget tables are empty. Run `npm run setup:budget-db` first.",
      500,
    )
  }
  return {
    envelopeExVat: toNumber(row.envelope_ex_vat) ?? 0,
    startingContingencyExVat: toNumber(row.starting_contingency_ex_vat) ?? 0,
    maxDrawdownExVat: toNumber(row.max_drawdown_ex_vat),
    contingencyVatRate: toNumber(row.contingency_vat_rate) ?? 0,
    contingencyRules: row.contingency_rules ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes ?? null,
    vatRate: toNumber(row.vat_rate),
    vatIncluded: Boolean(row.vat_included),
    reportingBucket: row.reporting_bucket ?? null,
    forecastOverrideExVat: toNumber(row.forecast_override_ex_vat),
    sortOrder: Number(row.sort_order) || 0,
    version: Number(row.version) || 1,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedBy: row.updated_by ?? null,
  }
}

function mapLineItem(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    budgetExVat: toNumber(row.budget_ex_vat) ?? 0,
    vatRate: toNumber(row.vat_rate),
    vatIncluded: Boolean(row.vat_included),
    status: row.status,
    quoteId: row.quote_id ?? null,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    sortOrder: Number(row.sort_order) || 0,
    version: Number(row.version) || 1,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    updatedBy: row.updated_by ?? null,
  }
}

async function loadState(db, { lock = false } = {}) {
  const settingsResult = await db.query(
    `select * from budget_settings where id = $1 ${lock ? "for update" : ""}`,
    [BUDGET_SETTINGS_ID],
  )
  const [categoriesResult, lineItemsResult] = await Promise.all([
    db.query(
      `select * from budget_categories where is_active order by sort_order, id`,
    ),
    db.query(
      `select li.* from budget_line_items li
         join budget_categories c on c.id = li.category_id
        where li.is_active and c.is_active
        order by c.sort_order, c.id, li.sort_order, li.id`,
    ),
  ])

  return {
    settings: mapSettings(settingsResult.rows[0]),
    categories: categoriesResult.rows.map(mapCategory),
    lineItems: lineItemsResult.rows.map(mapLineItem),
  }
}

/** Reads the current budget state (no lock). */
export async function readBudgetState(db) {
  const state = await loadState(db)
  const lastChangesResult = await db.query(
    `select distinct on (entity_type, entity_id)
            entity_type, entity_id, actor, source, created_at
       from budget_changes
      where source <> 'migration'
      order by entity_type, entity_id, created_at desc`,
  )
  const lastChanges = {}
  for (const row of lastChangesResult.rows) {
    lastChanges[`${row.entity_type}:${row.entity_id}`] = {
      actor: row.actor,
      source: row.source,
      at: new Date(row.created_at).toISOString(),
    }
  }
  return { ...state, lastChanges }
}

/** Pure: derive category budgets, baseline, contingency and cap headroom. */
export function computeBudgetTotals(state) {
  const categoryBudgets = {}
  for (const category of state.categories) categoryBudgets[category.id] = 0
  for (const item of state.lineItems) {
    if (!(item.categoryId in categoryBudgets)) continue
    categoryBudgets[item.categoryId] = roundMoney(
      categoryBudgets[item.categoryId] + item.budgetExVat,
    )
  }

  const baselineExVat = roundMoney(
    state.categories.reduce((sum, c) => sum + categoryBudgets[c.id], 0),
  )
  const { envelopeExVat, startingContingencyExVat, maxDrawdownExVat } = state.settings
  const contingencyExVat = roundMoney(envelopeExVat - baselineExVat)
  const drawdownExVat = roundMoney(startingContingencyExVat - contingencyExVat)

  return {
    categoryBudgets,
    baselineExVat,
    envelopeExVat,
    contingencyExVat,
    startingContingencyExVat,
    maxDrawdownExVat,
    drawdownExVat,
    contingencyFloorExVat:
      maxDrawdownExVat === null ? null : roundMoney(startingContingencyExVat - maxDrawdownExVat),
    capHeadroomExVat: maxDrawdownExVat === null ? null : roundMoney(maxDrawdownExVat - drawdownExVat),
  }
}

/** Pure: rebuild the legacy categories.json / lineItems.json shapes. */
export function toLegacyBudgetFiles(state) {
  const totals = computeBudgetTotals(state)
  const categories = state.categories.map((c) => {
    const out = { id: c.id, name: c.name, budgetExVat: totals.categoryBudgets[c.id] }
    if (c.vatRate !== null) out.vatRate = c.vatRate
    if (c.vatIncluded) out.vatIncluded = true
    if (c.notes) out.notes = c.notes
    if (c.forecastOverrideExVat !== null) out.forecastOverrideExVat = c.forecastOverrideExVat
    if (c.reportingBucket) out.reportingBucket = c.reportingBucket
    return out
  })
  // Same reduce as validateBudgetIntegrity() so the strict float equality holds.
  const baseline = categories.reduce((sum, c) => sum + Number(c.budgetExVat || 0), 0)
  const contingency = totals.contingencyExVat

  return {
    categoriesFile: {
      categories,
      globalContingency: {
        budgetExVat: contingency,
        vatRate: state.settings.contingencyVatRate,
        ...(state.settings.contingencyRules ? { rules: state.settings.contingencyRules } : {}),
      },
      totals: {
        baselineBuildBudgetExVat: baseline,
        contingencyExVat: contingency,
        envelopeExVat: baseline + contingency,
      },
    },
    lineItemsFile: {
      lineItems: state.lineItems.map((item) => {
        const out = {
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          budgetExVat: item.budgetExVat,
          status: item.status,
        }
        if (item.vatRate !== null) out.vatRate = item.vatRate
        if (item.vatIncluded) out.vatIncluded = true
        if (item.quoteId) out.quoteId = item.quoteId
        if (item.meta && Object.keys(item.meta).length > 0) out.meta = item.meta
        return out
      }),
    },
  }
}

// ---------------------------------------------------------------------------
// Validation helpers

function requireName(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BudgetError(`${label} is required.`)
  }
  const trimmed = value.trim()
  if (trimmed.length > 200) throw new BudgetError(`${label} is too long.`)
  return trimmed
}

function requireAmount(value, label, { allowNull = false } = {}) {
  if (value === null && allowNull) return null
  const n = typeof value === "string" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new BudgetError(`${label} must be a number.`)
  }
  if (n < 0) throw new BudgetError(`${label} cannot be negative.`)
  if (n > 100_000_000) throw new BudgetError(`${label} is unrealistically large.`)
  return roundMoney(n)
}

function requireVatRate(value) {
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new BudgetError("VAT rate must be between 0 and 1 (e.g. 0.2 for 20%).")
  }
  return Math.round(n * 10000) / 10000
}

function checkVersion(change, current, label) {
  if (change.expectedVersion === undefined || change.expectedVersion === null) return
  if (Number(change.expectedVersion) !== current.version) {
    throw new BudgetError(
      `${label} was changed by ${current.updatedBy || "someone else"} since you loaded it.`,
      409,
      { entityId: current.id, currentVersion: current.version, updatedBy: current.updatedBy },
    )
  }
}

function validateQuote(quoteId, categoryId, quotes, itemsById, selfId) {
  if (quoteId === null) return null
  if (typeof quoteId !== "string" || !quoteId) throw new BudgetError("Invalid quote id.")
  const quote = (quotes || []).find((q) => q.id === quoteId)
  if (!quote) throw new BudgetError(`Quote ${quoteId} not found in procurement.`)
  if (quote.categoryId && quote.categoryId !== categoryId) {
    throw new BudgetError(
      `Quote "${quote.title}" belongs to category ${quote.categoryId}, not ${categoryId}.`,
    )
  }
  const holder = [...itemsById.values()].find((i) => i.quoteId === quoteId && i.id !== selfId)
  if (holder) {
    throw new BudgetError(`Quote "${quote.title}" is already linked to "${holder.name}".`)
  }
  return quoteId
}

function formatGbp(n) {
  return `£${Math.round(n).toLocaleString("en-GB")}`
}

// ---------------------------------------------------------------------------
// The write path

/**
 * Apply a batch of budget changes atomically.
 *
 * @param {import("pg").Pool} pool
 * @param {Array} changes  see BudgetChange in budget-core.d.mts
 * @param {{ actor: string, source: "grid"|"assistant"|"cli"|"migration", dryRun?: boolean, quotes?: Array<{id:string, categoryId?:string, title:string}> }} options
 */
export async function applyBudgetChanges(pool, changes, options) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new BudgetError("No changes supplied.")
  }
  if (changes.length > 500) throw new BudgetError("Too many changes in one batch (max 500).")
  const actor = String(options?.actor || "").trim()
  const source = options?.source
  if (!actor) throw new BudgetError("An actor is required.")
  if (!["grid", "assistant", "cli", "migration"].includes(source)) {
    throw new BudgetError("Invalid change source.")
  }

  const client = await pool.connect()
  const batchId = randomUUID()
  const audit = []
  const createdIds = []

  try {
    await client.query("begin")
    const state = await loadState(client, { lock: true })
    const before = computeBudgetTotals(state)

    const categoriesById = new Map(state.categories.map((c) => [c.id, c]))
    const itemsById = new Map(state.lineItems.map((i) => [i.id, i]))

    const record = (entityType, entityId, field, beforeValue, afterValue) => {
      audit.push({ entityType, entityId, field, before: beforeValue, after: afterValue })
    }

    for (const [index, change] of changes.entries()) {
      const where = changes.length > 1 ? ` (change ${index + 1})` : ""
      try {
        switch (change?.type) {
          case "update_line_item": {
            const item = itemsById.get(change.id)
            if (!item) throw new BudgetError(`Line item ${change.id} not found.`, 404)
            checkVersion(change, item, `"${item.name}"`)
            const patch = change.patch || {}
            const next = { ...item }
            if ("name" in patch) next.name = requireName(patch.name, "Name")
            if ("budgetExVat" in patch) next.budgetExVat = requireAmount(patch.budgetExVat, "Budget")
            if ("vatRate" in patch) next.vatRate = requireVatRate(patch.vatRate)
            if ("quoteId" in patch) next.quoteId = validateQuote(patch.quoteId, item.categoryId, options.quotes, itemsById, item.id)
            const fields = ["name", "budgetExVat", "vatRate", "quoteId"].filter(
              (f) => f in patch && next[f] !== item[f],
            )
            if (fields.length === 0) break
            for (const f of fields) record("line_item", item.id, f, item[f], next[f])
            const result = await client.query(
              `update budget_line_items
                  set name = $2, budget_ex_vat = $3, vat_rate = $4, quote_id = $5,
                      version = version + 1, updated_at = now(), updated_by = $6
                where id = $1 returning *`,
              [item.id, next.name, next.budgetExVat, next.vatRate, next.quoteId, actor],
            )
            const saved = mapLineItem(result.rows[0])
            itemsById.set(saved.id, saved)
            break
          }

          case "create_line_item": {
            const category = categoriesById.get(change.categoryId)
            if (!category) throw new BudgetError(`Category ${change.categoryId} not found.`, 404)
            const name = requireName(change.name, "Name")
            const budgetExVat = requireAmount(change.budgetExVat ?? 0, "Budget")
            const vatRate = change.vatRate === undefined ? null : requireVatRate(change.vatRate)
            const quoteId =
              change.quoteId === undefined || change.quoteId === null
                ? null
                : validateQuote(change.quoteId, category.id, options.quotes, itemsById, null)
            const id = `${category.id.replaceAll("_", "-")}-${slugify(name) || "item"}-${randomUUID().slice(0, 6)}`
            const maxSort = [...itemsById.values()]
              .filter((i) => i.categoryId === category.id)
              .reduce((m, i) => Math.max(m, i.sortOrder), 0)
            const result = await client.query(
              `insert into budget_line_items
                 (id, category_id, name, budget_ex_vat, vat_rate, quote_id, sort_order, updated_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
              [id, category.id, name, budgetExVat, vatRate, quoteId, maxSort + 10, actor],
            )
            const saved = mapLineItem(result.rows[0])
            itemsById.set(saved.id, saved)
            createdIds.push(saved.id)
            record("line_item", saved.id, "*", null, {
              categoryId: saved.categoryId,
              name: saved.name,
              budgetExVat: saved.budgetExVat,
              vatRate: saved.vatRate,
              quoteId: saved.quoteId,
            })
            break
          }

          case "delete_line_item": {
            const item = itemsById.get(change.id)
            if (!item) throw new BudgetError(`Line item ${change.id} not found.`, 404)
            checkVersion(change, item, `"${item.name}"`)
            await client.query(
              `update budget_line_items
                  set is_active = false, version = version + 1, updated_at = now(), updated_by = $2
                where id = $1`,
              [item.id, actor],
            )
            itemsById.delete(item.id)
            record("line_item", item.id, "*", {
              categoryId: item.categoryId,
              name: item.name,
              budgetExVat: item.budgetExVat,
              vatRate: item.vatRate,
              quoteId: item.quoteId,
            }, null)
            break
          }

          case "update_category": {
            const category = categoriesById.get(change.id)
            if (!category) throw new BudgetError(`Category ${change.id} not found.`, 404)
            checkVersion(change, category, `"${category.name}"`)
            const patch = change.patch || {}
            const next = { ...category }
            if ("name" in patch) next.name = requireName(patch.name, "Category name")
            if ("notes" in patch) next.notes = patch.notes === null ? null : String(patch.notes).trim() || null
            if ("forecastOverrideExVat" in patch) {
              next.forecastOverrideExVat = requireAmount(patch.forecastOverrideExVat, "Forecast override", { allowNull: true })
            }
            const fields = ["name", "notes", "forecastOverrideExVat"].filter(
              (f) => f in patch && next[f] !== category[f],
            )
            if (fields.length === 0) break
            for (const f of fields) record("category", category.id, f, category[f], next[f])
            const result = await client.query(
              `update budget_categories
                  set name = $2, notes = $3, forecast_override_ex_vat = $4,
                      version = version + 1, updated_at = now(), updated_by = $5
                where id = $1 returning *`,
              [category.id, next.name, next.notes, next.forecastOverrideExVat, actor],
            )
            categoriesById.set(category.id, mapCategory(result.rows[0]))
            break
          }

          default:
            throw new BudgetError(`Unknown change type "${change?.type}".`)
        }
      } catch (error) {
        if (error instanceof BudgetError && where) {
          error.message = `${error.message}${where}`
        }
        throw error
      }
    }

    const afterState = {
      settings: state.settings,
      categories: [...categoriesById.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      lineItems: [...itemsById.values()],
    }
    const after = computeBudgetTotals(afterState)

    // The cap: only blocks batches that increase drawdown past the limit, so a batch
    // that reduces an existing overrun is always allowed.
    if (
      after.maxDrawdownExVat !== null &&
      after.drawdownExVat > after.maxDrawdownExVat + 0.005 &&
      after.drawdownExVat > before.drawdownExVat + 0.005
    ) {
      const overBy = roundMoney(after.drawdownExVat - after.maxDrawdownExVat)
      throw new BudgetError(
        `Over the contingency cap by ${formatGbp(overBy)}. This would draw ${formatGbp(after.drawdownExVat)} of the ${formatGbp(after.maxDrawdownExVat)} allowed, leaving contingency at ${formatGbp(after.contingencyExVat)} (floor ${formatGbp(after.contingencyFloorExVat)}).`,
        422,
        {
          overByExVat: overBy,
          drawdownExVat: after.drawdownExVat,
          maxDrawdownExVat: after.maxDrawdownExVat,
          contingencyExVat: after.contingencyExVat,
          contingencyFloorExVat: after.contingencyFloorExVat,
        },
      )
    }

    for (const entry of audit) {
      await client.query(
        `insert into budget_changes
           (batch_id, entity_type, entity_id, field, before_value, after_value, actor, source)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          batchId,
          entry.entityType,
          entry.entityId,
          entry.field,
          JSON.stringify(entry.before ?? null),
          JSON.stringify(entry.after ?? null),
          actor,
          source,
        ],
      )
    }

    await client.query(options.dryRun ? "rollback" : "commit")

    return {
      batchId,
      dryRun: Boolean(options.dryRun),
      changes: audit,
      createdIds,
      before,
      after,
    }
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Recent audit rows, newest first. */
export async function readBudgetChanges(db, { limit = 50, entityId } = {}) {
  const result = await db.query(
    `select * from budget_changes
      ${entityId ? "where entity_id = $2" : ""}
      order by created_at desc, id desc limit $1`,
    entityId ? [limit, entityId] : [limit],
  )
  return result.rows.map((row) => ({
    id: Number(row.id),
    batchId: row.batch_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    field: row.field,
    before: row.before_value,
    after: row.after_value,
    actor: row.actor,
    source: row.source,
    at: new Date(row.created_at).toISOString(),
  }))
}
