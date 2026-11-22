"use client"

import { useEffect, useState } from "react"
import { formatDelta, formatMoney, parseMoney } from "@/components/budget/budget-format"

const LAND_COST = 260_000
const STORAGE_KEY = "courtyard-house:sale-scenarios:v1"
const CASES = ["Low", "Base", "High"] as const
type SaleCase = (typeof CASES)[number]
type SalePrices = Record<SaleCase, string>
const EMPTY: SalePrices = { Low: "", Base: "", High: "" }

type SaleScenariosProps = {
  projectPaidExVat: number
  projectForecastExVat: number
  projectBudgetExVat: number
  budgetEnvelopeExVat: number
  remainingContingencyExVat: number
}

export function SaleScenarios({
  projectPaidExVat,
  projectForecastExVat,
  projectBudgetExVat,
  budgetEnvelopeExVat,
  remainingContingencyExVat,
}: SaleScenariosProps) {
  const [prices, setPrices] = useState<SalePrices>(EMPTY)
  const [storageAvailable, setStorageAvailable] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved: unknown = JSON.parse(raw)
      if (!saved || typeof saved !== "object") return
      setPrices({
        Low: "Low" in saved && typeof saved.Low === "string" ? saved.Low.slice(0, 24) : "",
        Base: "Base" in saved && typeof saved.Base === "string" ? saved.Base.slice(0, 24) : "",
        High: "High" in saved && typeof saved.High === "string" ? saved.High.slice(0, 24) : "",
      })
    } catch {
      setStorageAvailable(false)
    }
  }, [])

  function updatePrice(key: SaleCase, value: string) {
    const next = { ...prices, [key]: value }
    setPrices(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageAvailable(true)
    } catch {
      setStorageAvailable(false)
    }
  }

  const forecastWithLand = LAND_COST + projectForecastExVat
  const additionalReserve = Math.max(0, Math.min(remainingContingencyExVat, budgetEnvelopeExVat - projectForecastExVat))
  const costWithReserve = forecastWithLand + additionalReserve

  return (
    <section aria-label="Sale scenarios">
      <p className="text-xs text-muted-foreground">
        {storageAvailable ? "Prices are saved only in this browser." : "Browser storage unavailable. Prices won’t be saved."}
      </p>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Land purchase</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(LAND_COST)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Recorded cost to date</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(LAND_COST + projectPaidExVat)}</dd>
          <dd className="text-xs text-muted-foreground">Land + {formatMoney(projectPaidExVat)} recorded payments (not invoices)</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Forecast break-even</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(forecastWithLand)}</dd>
          <dd className="text-xs text-muted-foreground">
            Land + {formatMoney(projectForecastExVat)} forecast ({formatMoney(projectBudgetExVat)} budget)
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Break-even with reserve</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(costWithReserve)}</dd>
          <dd className="text-xs text-muted-foreground">{formatMoney(additionalReserve)} reserve beyond forecast</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {CASES.map((scenario) => {
          const raw = prices[scenario]
          const price = parseMoney(raw)
          const invalid = Boolean(raw.trim()) && (price === null || price <= 0)
          const forecastDelta = price !== null && !invalid ? price - forecastWithLand : null
          const reserveDelta = price !== null && !invalid ? price - costWithReserve : null
          const outputId = `sale-scenario-${scenario.toLowerCase()}-result`

          return (
            <div key={scenario} className="grid gap-1 rounded-md border border-border/70 p-3 text-sm">
              <label className="font-medium" htmlFor={`sale-scenario-${scenario.toLowerCase()}`}>{scenario} sale price</label>
              <input
                id={`sale-scenario-${scenario.toLowerCase()}`}
                inputMode="decimal"
                value={raw}
                maxLength={24}
                onChange={(event) => updatePrice(scenario, event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={outputId}
                placeholder="Enter amount in £"
                className="h-8 min-w-0 rounded-md border border-border bg-background px-2 outline-none focus:border-foreground/40"
              />
              <div id={outputId} className="text-xs tabular-nums text-muted-foreground">
                {invalid ? "Enter a positive amount." : (
                  <>
                    <p>Surplus / shortfall: {formatDelta(forecastDelta)}</p>
                    <p>With reserve: {formatDelta(reserveDelta)}</p>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Reserve is limited to what remains outside the forecast, so it isn’t counted twice. The stress case is not
        approval to spend the reserve. Unbudgeted work (check the permanent driveway), selling fees, taxes and
        financing costs outside the project forecast are excluded. These prices are assumptions, not valuations.
      </p>
    </section>
  )
}
