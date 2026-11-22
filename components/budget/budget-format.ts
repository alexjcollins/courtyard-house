import type { BudgetGridData } from "@/lib/budget-grid-types"

const wholePounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
})
const withPence = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? wholePounds.format(rounded) : withPence.format(rounded)
}

export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  if (Math.abs(value) < 0.005) return "£0"
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`
}

export function formatVat(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

/** Accepts `12500`, `£12,500`, `12.5k`, `1.2m`. Returns null if unparseable. */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/[£,\s]/g, "")
  if (!cleaned) return null
  const match = cleaned.match(/^(\d*\.?\d+)(k|m)?$/)
  if (!match) return null
  const base = Number(match[1])
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1
  const value = Math.round(base * multiplier * 100) / 100
  return Number.isFinite(value) ? value : null
}

/** Accepts `20`, `20%`, `5.5`. Empty string means "inherit" (null). Returns undefined if invalid. */
export function parseVatPercent(input: string): number | null | undefined {
  const cleaned = input.trim().replace(/%$/, "").trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined
  return Math.round(n * 100) / 10000
}

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function describeActor(actor: string, source: string): string {
  if (source === "assistant") return `Claude (for ${actor})`
  if (source === "cli") return `CLI (${actor})`
  return actor
}

/** Re-derive category subtotals and contingency after a local (optimistic) edit. */
export function recomputeGrid(grid: BudgetGridData): BudgetGridData {
  const categories = grid.categories.map((category) => {
    const budgetExVat = round(category.items.reduce((s, i) => s + i.budgetExVat, 0))
    const quoted = category.items.filter((i) => i.quotedExVat !== null)
    return {
      ...category,
      budgetExVat,
      quotedExVat: quoted.length ? round(quoted.reduce((s, i) => s + (i.quotedExVat ?? 0), 0)) : null,
      quoteDeltaExVat: quoted.length
        ? round(quoted.reduce((s, i) => s + ((i.quotedExVat ?? 0) - i.budgetExVat), 0))
        : null,
    }
  })
  const baselineExVat = round(categories.reduce((s, c) => s + c.budgetExVat, 0))
  const contingencyExVat = round(grid.totals.envelopeExVat - baselineExVat)
  const drawdownExVat = round(grid.totals.startingContingencyExVat - contingencyExVat)
  return {
    ...grid,
    categories,
    totals: {
      ...grid.totals,
      baselineExVat,
      contingencyExVat,
      drawdownExVat,
      capHeadroomExVat:
        grid.totals.maxDrawdownExVat === null ? null : round(grid.totals.maxDrawdownExVat - drawdownExVat),
    },
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
