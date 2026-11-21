// Budget CLI — the agent/bulk-edit path into the same Postgres budget the /budget grid edits.
//
//   npm run budget -- show                 # categories, line items, contingency
//   npm run budget -- show --json          # same, machine-readable (ids, versions)
//   npm run budget -- apply changes.json --dry-run   # validate + print the diff, write nothing
//   npm run budget -- apply changes.json             # apply atomically (all or nothing)
//   cat changes.json | npm run budget -- apply -     # read changes from stdin
//   npm run budget -- log [--limit 20]     # recent audit log
//
// changes.json is either an array of changes or { "changes": [...] }. Change shapes:
//   { "type": "update_line_item", "id": "fees-architect", "patch": { "budgetExVat": 60000 } }
//   { "type": "update_line_item", "id": "...", "patch": { "name": "...", "vatRate": 0.2, "quoteId": "q-003" | null } }
//   { "type": "create_line_item", "categoryId": "roofs", "name": "Flat roof membrane", "budgetExVat": 12000 }
//   { "type": "delete_line_item", "id": "..." }
//   { "type": "update_category", "id": "roofs", "patch": { "name": "...", "notes": "..." } }
// Any change may carry "expectedVersion" (from show --json) to refuse if the row moved on.
//
// Every apply goes through lib/budget-core.mjs: same validation, £ cap on contingency
// drawdown, row versions and audit log as the grid. Writes are attributed to
// --actor (default: git user.email) with source "cli".

import { execSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import pg from "pg"
import {
  applyBudgetChanges,
  BudgetError,
  computeBudgetTotals,
  readBudgetChanges,
  readBudgetState,
} from "../lib/budget-core.mjs"
import { loadProjectEnv, readSpacesJson } from "./lib/spaces.mjs"

const argv = process.argv.slice(2)
const command = argv[0]
const flag = (name) => argv.includes(name)
const option = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

const gbp = (n) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2,
      }).format(n)

function pad(value, width, right = false) {
  const s = String(value)
  if (s.length >= width) return s.slice(0, width)
  return right ? s.padStart(width) : s.padEnd(width)
}

function defaultActor() {
  if (process.env.BUDGET_ACTOR) return process.env.BUDGET_ACTOR
  try {
    return execSync("git config user.email", { encoding: "utf8" }).trim() || "cli"
  } catch {
    return "cli"
  }
}

function printTotals(label, t) {
  console.log(
    `${label}: baseline ${gbp(t.baselineExVat)} · contingency ${gbp(t.contingencyExVat)} · drawn ${gbp(t.drawdownExVat)} of ${gbp(t.maxDrawdownExVat)} cap · envelope ${gbp(t.envelopeExVat)}`,
  )
}

async function readChanges(path) {
  if (!path) throw new BudgetError("Usage: npm run budget -- apply <changes.json|-> [--dry-run]")
  let text
  if (path === "-") {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    text = Buffer.concat(chunks).toString("utf8")
  } else {
    text = await readFile(path, "utf8")
  }
  const parsed = JSON.parse(text)
  const changes = Array.isArray(parsed) ? parsed : parsed.changes
  if (!Array.isArray(changes)) throw new BudgetError('Expected an array of changes or { "changes": [...] }.')
  return changes
}

async function main() {
  await loadProjectEnv()
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error("DATABASE_URL is required.")
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  })

  try {
    if (command === "show") {
      const state = await readBudgetState(pool)
      const totals = computeBudgetTotals(state)
      if (flag("--json")) {
        console.log(JSON.stringify({ totals, categories: state.categories, lineItems: state.lineItems }, null, 2))
        return
      }
      for (const category of state.categories) {
        console.log(`\n${category.name}  [${category.id}]  ${gbp(totals.categoryBudgets[category.id])}`)
        for (const item of state.lineItems.filter((i) => i.categoryId === category.id)) {
          console.log(
            `  ${pad(item.name, 52)} ${pad(gbp(item.budgetExVat), 12, true)}  ${pad(item.id, 48)} v${item.version}${item.quoteId ? `  quote ${item.quoteId}` : ""}`,
          )
        }
      }
      console.log("")
      printTotals("Totals", totals)
      return
    }

    if (command === "apply") {
      const changes = await readChanges(argv[1])
      const dryRun = flag("--dry-run")
      const actor = option("--actor") || defaultActor()
      const { json: procurement } = await readSpacesJson("procurement.json")
      const result = await applyBudgetChanges(pool, changes, {
        actor,
        source: "cli",
        dryRun,
        quotes: procurement.quotes.map((q) => ({ id: q.id, categoryId: q.categoryId, title: q.title })),
      })
      console.log(`${dryRun ? "[dry run] " : ""}${result.changes.length} field change(s) as ${actor}:`)
      for (const c of result.changes) {
        const fmt = (v) => (typeof v === "number" ? gbp(v) : JSON.stringify(v))
        console.log(`  ${c.entityType} ${c.entityId} ${c.field}: ${fmt(c.before)} → ${fmt(c.after)}`)
      }
      printTotals("Before", result.before)
      printTotals("After ", result.after)
      console.log(dryRun ? "Nothing written (dry run)." : `Applied. Batch ${result.batchId}.`)
      return
    }

    if (command === "log") {
      const rows = await readBudgetChanges(pool, { limit: Number(option("--limit") || 20) })
      for (const r of rows) {
        console.log(
          `${r.at}  ${pad(r.source, 9)} ${pad(r.actor, 28)} ${r.entityType} ${r.entityId} ${r.field}: ${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`,
        )
      }
      return
    }

    console.log("Usage: npm run budget -- <show [--json] | apply <file|-> [--dry-run] [--actor name] | log [--limit n]>")
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof BudgetError ? `Refused: ${error.message}` : error instanceof Error ? error.message : error)
  process.exitCode = 1
})
