"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

type CurrencyCode = "GBP" | "CAD"

type FormatOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

type CurrencyContextValue = {
  currency: CurrencyCode
  toggleCurrency: () => void
  convertFromGbp: (amount: number) => number
  formatCurrency: (amount: number, options?: FormatOptions) => string
}

const GBP_TO_CAD = Number(process.env.NEXT_PUBLIC_GBP_TO_CAD || 1.74)

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>("GBP")

  const value = useMemo<CurrencyContextValue>(() => {
    const convertFromGbp = (amount: number) =>
      currency === "CAD" ? amount * GBP_TO_CAD : amount

    const formatCurrency = (amount: number, options?: FormatOptions) => {
      const convertedAmount = convertFromGbp(amount)
      return new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-GB", {
        style: "currency",
        currency,
        minimumFractionDigits: options?.minimumFractionDigits,
        maximumFractionDigits: options?.maximumFractionDigits,
      }).format(convertedAmount)
    }

    return {
      currency,
      toggleCurrency: () =>
        setCurrency((prev) => (prev === "GBP" ? "CAD" : "GBP")),
      convertFromGbp,
      formatCurrency,
    }
  }, [currency])

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error("useCurrency must be used within CurrencyProvider")
  }
  return context
}
