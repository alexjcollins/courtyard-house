"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Decision } from "@/lib/data"
import { formatCurrency } from "@/lib/format"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"

type CategoryDecisionListProps = {
  decisions: Decision[]
  canEdit?: boolean
  showCosts?: boolean
}

export function CategoryDecisionList({
  decisions,
  canEdit = true,
  showCosts = true,
}: CategoryDecisionListProps) {
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [optimisticSelections, setOptimisticSelections] = useState<
    Record<string, number | null>
  >(
    Object.fromEntries(
      decisions.map((decision) => [decision.id, decision.selectedOptionIndex]),
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

      {decisions.map((decision) => {
        const selectedIndex = optimisticSelections[decision.id] ?? null

        return (
          <div key={decision.id} className="border border-border/70 bg-secondary/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{decision.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{decision.notes}</p>
              </div>
              <StatusBadge status={selectedIndex === null ? "planned" : "accepted"} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {decision.options.map((option, index) => {
                const isSelected = selectedIndex === index
                const requestKey = `${decision.id}:${index}`
                const clearKey = `${decision.id}:clear`
                const isPending =
                  pendingKey === requestKey || (isSelected && pendingKey === clearKey)

                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={
                      canEdit
                        ? () =>
                            void setDecisionSelection(
                              decision.id,
                              isSelected ? null : index,
                            )
                        : undefined
                    }
                    disabled={!canEdit || pendingKey !== null}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border border-border/60 px-3 py-2 text-left transition-colors disabled:opacity-70",
                      canEdit ? "cursor-pointer disabled:cursor-wait" : "cursor-default",
                      isSelected
                        ? "bg-foreground text-background"
                        : "bg-white/70 hover:bg-secondary/50",
                      !canEdit && "hover:bg-white/70",
                    )}
                  >
                    <span className={isSelected ? "text-background" : "text-foreground"}>
                      {isSelected ? "Selected: " : ""}
                      {option.name}
                    </span>
                    <span className={isSelected ? "text-background/70" : "text-muted-foreground"}>
                      {isPending
                        ? "Saving..."
                        : showCosts
                          ? formatCurrency(option.costDeltaExVat)
                          : isSelected
                            ? "Selected"
                            : "Available"}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
