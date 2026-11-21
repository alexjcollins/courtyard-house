// One-off migration: move budget categories + line items from Spaces JSON into Postgres.
//
//   npm run setup:budget-db                    # migrate (refuses if already migrated)
//   npm run setup:budget-db -- --dry-run       # show what would be written, write nothing
//   npm run setup:budget-db -- --max-drawdown 40000
//
// Snapshots the source files to exports/db-backups/ first. Categories whose stored
// budget exceeds the sum of their line items get an "Unallocated allowance" line item
// for the gap, so every total is unchanged after the move.

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import { BUDGET_SETTINGS_ID, ensureBudgetSchema, readBudgetState, computeBudgetTotals, roundMoney } from "../lib/budget-core.mjs"
import { loadProjectEnv, readSpacesJson } from "./lib/spaces.mjs"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const maxDrawdownArg = args.indexOf("--max-drawdown")
const maxDrawdownExVat = maxDrawdownArg >= 0 ? Number(args[maxDrawdownArg + 1]) : 40000

if (!Number.isFinite(maxDrawdownExVat) || maxDrawdownExVat < 0) {
  throw new Error("--max-drawdown must be a non-negative number")
}

await loadProjectEnv()

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error("DATABASE_URL is required.")

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
})

try {
  await ensureBudgetSchema(pool)

  const existing = await pool.query("select 1 from budget_settings where id = $1", [BUDGET_SETTINGS_ID])
  if (existing.rowCount > 0) {
    console.log("Budget tables are already populated — nothing to do.")
    process.exit(0)
  }

  const [{ text: categoriesText, json: categoriesFile }, { text: lineItemsText, json: lineItemsFile }] =
    await Promise.all([readSpacesJson("categories.json"), readSpacesJson("lineItems.json")])

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-")
  const backupDir = path.join(process.cwd(), "exports/db-backups", `budget-setup-${stamp}`)
  await mkdir(backupDir, { recursive: true })
  await writeFile(path.join(backupDir, "categories.json"), categoriesText)
  await writeFile(path.join(backupDir, "lineItems.json"), lineItemsText)
  console.log(`Snapshot written to ${path.relative(process.cwd(), backupDir)}`)

  const categories = categoriesFile.categories
  const lineItems = lineItemsFile.lineItems
  const categoryIds = new Set(categories.map((c) => c.id))
  const orphans = lineItems.filter((item) => !categoryIds.has(item.categoryId))
  if (orphans.length > 0) {
    throw new Error(`Line items reference unknown categories: ${orphans.map((o) => o.id).join(", ")}`)
  }

  const allowances = []
  for (const category of categories) {
    const itemsTotal = roundMoney(
      lineItems.filter((i) => i.categoryId === category.id).reduce((s, i) => s + Number(i.budgetExVat || 0), 0),
    )
    const gap = roundMoney(Number(category.budgetExVat || 0) - itemsTotal)
    if (gap < 0) {
      throw new Error(
        `Category ${category.id}: line items (${itemsTotal}) exceed the category budget (${category.budgetExVat}). Fix before migrating.`,
      )
    }
    if (gap > 0) {
      allowances.push({ categoryId: category.id, id: `${category.id.replaceAll("_", "-")}-unallocated-allowance`, gap })
    }
  }

  console.log(`Categories: ${categories.length}, line items: ${lineItems.length}`)
  for (const a of allowances) console.log(`  + Unallocated allowance in ${a.categoryId}: £${a.gap.toLocaleString("en-GB")}`)
  console.log(
    `Envelope £${categoriesFile.totals.envelopeExVat.toLocaleString("en-GB")}, starting contingency £${categoriesFile.globalContingency.budgetExVat.toLocaleString("en-GB")}, max drawdown £${maxDrawdownExVat.toLocaleString("en-GB")}`,
  )

  const client = await pool.connect()
  try {
    await client.query("begin")
    await client.query(
      `insert into budget_settings
         (id, envelope_ex_vat, starting_contingency_ex_vat, max_drawdown_ex_vat, contingency_vat_rate, contingency_rules)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        BUDGET_SETTINGS_ID,
        categoriesFile.totals.envelopeExVat,
        categoriesFile.globalContingency.budgetExVat,
        maxDrawdownExVat,
        categoriesFile.globalContingency.vatRate ?? 0,
        categoriesFile.globalContingency.rules ?? null,
      ],
    )

    for (const [index, category] of categories.entries()) {
      await client.query(
        `insert into budget_categories
           (id, name, notes, vat_rate, vat_included, reporting_bucket, forecast_override_ex_vat, sort_order, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'migration')`,
        [
          category.id,
          category.name,
          category.notes ?? null,
          category.vatRate ?? null,
          Boolean(category.vatIncluded),
          category.reportingBucket ?? null,
          category.forecastOverrideExVat ?? null,
          (index + 1) * 10,
        ],
      )
    }

    const sortByCategory = new Map()
    for (const item of lineItems) {
      const sort = (sortByCategory.get(item.categoryId) ?? 0) + 10
      sortByCategory.set(item.categoryId, sort)
      await client.query(
        `insert into budget_line_items
           (id, category_id, name, budget_ex_vat, vat_rate, vat_included, status, quote_id, meta, sort_order, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'migration')`,
        [
          item.id,
          item.categoryId,
          item.name,
          Number(item.budgetExVat || 0),
          item.vatRate ?? null,
          Boolean(item.vatIncluded),
          item.status || "budgeted",
          item.quoteId ?? null,
          JSON.stringify(item.meta ?? {}),
          sort,
        ],
      )
    }

    for (const allowance of allowances) {
      const sort = (sortByCategory.get(allowance.categoryId) ?? 0) + 10
      sortByCategory.set(allowance.categoryId, sort)
      await client.query(
        `insert into budget_line_items (id, category_id, name, budget_ex_vat, sort_order, updated_by)
         values ($1, $2, 'Unallocated allowance', $3, $4, 'migration')`,
        [allowance.id, allowance.categoryId, allowance.gap, sort],
      )
      await client.query(
        `insert into budget_changes (batch_id, entity_type, entity_id, field, before_value, after_value, actor, source)
         values ('migration', 'line_item', $1, '*', 'null'::jsonb, $2::jsonb, 'migration', 'migration')`,
        [allowance.id, JSON.stringify({ categoryId: allowance.categoryId, name: "Unallocated allowance", budgetExVat: allowance.gap })],
      )
    }

    const totals = computeBudgetTotals(await readBudgetState(client))
    if (Math.abs(totals.baselineExVat - categoriesFile.totals.baselineBuildBudgetExVat) > 0.005) {
      throw new Error(
        `Verification failed: baseline ${totals.baselineExVat} ≠ source ${categoriesFile.totals.baselineBuildBudgetExVat}`,
      )
    }
    if (Math.abs(totals.contingencyExVat - categoriesFile.globalContingency.budgetExVat) > 0.005) {
      throw new Error(`Verification failed: contingency ${totals.contingencyExVat} ≠ source`)
    }

    await client.query(dryRun ? "rollback" : "commit")
    console.log(
      `${dryRun ? "[dry run] Would migrate" : "Migrated"}: baseline £${totals.baselineExVat.toLocaleString("en-GB")}, contingency £${totals.contingencyExVat.toLocaleString("en-GB")}.`,
    )
  } catch (error) {
    await client.query("rollback").catch(() => {})
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}
