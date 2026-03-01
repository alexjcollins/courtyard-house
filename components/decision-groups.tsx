"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { CategorySummary } from "@/lib/data"
import { formatCurrency } from "@/lib/format"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type DecisionGroupsProps = {
  categories: CategorySummary[]
  mode?: "open" | "closed"
}

export function DecisionGroups({
  categories,
  mode = "open",
}: DecisionGroupsProps) {
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [optimisticSelections, setOptimisticSelections] = useState<
    Record<string, number | null>
  >(
    Object.fromEntries(
      categories.flatMap((category) =>
        category.decisions.map((decision) => [
          decision.id,
          decision.selectedOptionIndex,
        ]),
      ),
    ),
  )

  async function setDecisionSelection(
    decisionId: string,
    selectedOptionIndex: number | null,
  ) {
    const previousSelection = optimisticSelections[decisionId] ?? null
    setPendingKey(
      `${decisionId}:${selectedOptionIndex === null ? "clear" : selectedOptionIndex}`,
    )
    setError(null)
    setOptimisticSelections((current) => ({
      ...current,
      [decisionId]: selectedOptionIndex,
    }))

    try {
      const response = await fetch("/api/decisions/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId,
          selectedOptionIndex,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not update decision.")
      }

      router.refresh()
    } catch (err) {
      setOptimisticSelections((current) => ({
        ...current,
        [decisionId]: previousSelection,
      }))
      setError(err instanceof Error ? err.message : "Could not update decision.")
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {mode === "open"
            ? "No open decisions."
            : "No closed decisions yet."}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {categories.map((category) => (
          <Card key={category.id} className="border-border/70 py-0">
            <CardHeader className="px-5 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Category
                  </p>
                  <CardTitle className="mt-2 text-2xl font-medium tracking-tight">
                    {category.name}
                  </CardTitle>
                </div>
                <StatusBadge
                  status={
                    category.decisions.some((decision) => decision.selectedOptionIndex !== null)
                      ? "accepted"
                      : "planned"
                  }
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {category.decisions.length}{" "}
                {mode === "open" ? "open" : "closed"} decision
                {category.decisions.length === 1 ? "" : "s"}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              {category.decisions.map((decision) => {
                const selectedIndex = optimisticSelections[decision.id] ?? null
                const selectedOption =
                  selectedIndex === null
                    ? null
                    : decision.options[selectedIndex] || null

                return (
                  <div key={decision.id} className="border border-border/70 bg-secondary/20">
                    <div className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{decision.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{decision.notes}</p>
                      </div>
                      <StatusBadge status={selectedOption ? "accepted" : "planned"} />
                    </div>
                    <div className="space-y-px">
                      {decision.options.map((option, index) => {
                        const isSelected = selectedIndex === index
                        const requestKey = `${decision.id}:${index}`
                        const isPending = pendingKey === requestKey
                        const clearKey = `${decision.id}:clear`
                        const isClearing = pendingKey === clearKey

                        return (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() =>
                              void setDecisionSelection(
                                decision.id,
                                isSelected ? null : index,
                              )
                            }
                            disabled={pendingKey !== null}
                            aria-pressed={isSelected}
                            className={cn(
                              "flex w-full cursor-pointer items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-left transition-colors first:border-t-0 disabled:cursor-wait disabled:opacity-70",
                              isSelected
                                ? "bg-foreground text-background"
                                : "hover:bg-secondary/50",
                            )}
                          >
                            <div>
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  isSelected ? "text-background" : "text-foreground",
                                )}
                              >
                                {isSelected ? "Selected: " : ""}
                                {option.name}
                              </p>
                              <p
                                className={cn(
                                  "mt-1 text-sm",
                                  isSelected
                                    ? "text-background/70"
                                    : "text-muted-foreground",
                                )}
                              >
                                Cost delta {formatCurrency(option.costDeltaExVat)}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {isSelected ? (
                                <span
                                  className={cn(
                                    "text-[11px] uppercase tracking-[0.2em]",
                                    isSelected
                                      ? "text-background/70"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  Click to clear
                                </span>
                              ) : null}
                              <StatusBadge status={isSelected ? "accepted" : "planned"} />
                              {isPending ? (
                                <span className="text-[11px] uppercase tracking-[0.2em]">
                                  {isClearing ? "Clearing" : "Saving"}
                                </span>
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
