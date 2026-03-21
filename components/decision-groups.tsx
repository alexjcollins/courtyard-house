"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { CategorySummary } from "@/lib/data"
import { formatCurrency } from "@/lib/format"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type DecisionGroupsProps = {
  categories: CategorySummary[]
  mode?: "open" | "closed"
  canEdit?: boolean
  showCosts?: boolean
}

export function DecisionGroups({
  categories,
  mode = "open",
  canEdit = true,
  showCosts = true,
}: DecisionGroupsProps) {
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(categories.map((category) => [category.id, true])),
  )
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

  const decisionCounts = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [
          category.id,
          category.decisions.filter((decision) => {
            const selectedIndex = optimisticSelections[decision.id] ?? null
            return selectedIndex !== null
          }).length,
        ]),
      ),
    [categories, optimisticSelections],
  )

  useEffect(() => {
    setExpandedCategories((current) => ({
      ...Object.fromEntries(categories.map((category) => [category.id, true])),
      ...current,
    }))
    setOptimisticSelections(
      Object.fromEntries(
        categories.flatMap((category) =>
          category.decisions.map((decision) => [
            decision.id,
            decision.selectedOptionIndex,
          ]),
        ),
      ),
    )
  }, [categories])

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

  function toggleCategory(categoryId: string) {
    setExpandedCategories((current) => ({
      ...current,
      [categoryId]: !(current[categoryId] ?? true),
    }))
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {mode === "open" ? "No open decisions." : "No closed decisions yet."}
        </p>
      ) : null}

      <div className="space-y-3">
        {categories.map((category) => {
          const isExpanded = expandedCategories[category.id] ?? true
          const selectedCount = decisionCounts[category.id] || 0

          return (
            <section key={category.id} className="border border-border/70">
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                className="flex w-full items-center justify-between gap-4 border-b border-border/60 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <p className="text-lg font-medium tracking-tight text-foreground">
                    {category.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {category.decisions.length} decision
                    {category.decisions.length === 1 ? "" : "s"}
                    {mode === "closed"
                      ? ` selected`
                      : selectedCount > 0
                        ? ` · ${selectedCount} selected`
                        : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={
                      selectedCount > 0 || mode === "closed" ? "accepted" : "planned"
                    }
                  />
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {isExpanded ? "Hide" : "Show"}
                  </span>
                </div>
              </button>

              {isExpanded ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[24%]">Decision</TableHead>
                      <TableHead className="w-[18%]">Current</TableHead>
                      <TableHead className="w-[46%]">Options</TableHead>
                      <TableHead className="w-[12%]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {category.decisions.map((decision) => {
                      const selectedIndex = optimisticSelections[decision.id] ?? null
                      const selectedOption =
                        selectedIndex === null
                          ? null
                          : decision.options[selectedIndex] || null

                      return (
                        <TableRow key={decision.id} className="align-top">
                          <TableCell className="py-4">
                            <p className="font-medium text-foreground">{decision.title}</p>
                            {decision.notes ? (
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {decision.notes}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-4">
                            {selectedOption ? (
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                  {selectedOption.name}
                                </p>
                                {showCosts ? (
                                  <p className="text-sm text-muted-foreground">
                                    {formatCurrency(selectedOption.costDeltaExVat)}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                No selection
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="space-y-2">
                              {decision.options.map((option, index) => {
                                const isSelected = selectedIndex === index
                                const requestKey = `${decision.id}:${index}`
                                const clearKey = `${decision.id}:clear`
                                const isSaving = pendingKey === requestKey
                                const isClearing = isSelected && pendingKey === clearKey

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
                                      canEdit ? "disabled:cursor-wait" : "cursor-default",
                                      isSelected
                                        ? "bg-foreground text-background"
                                        : "hover:bg-secondary/30",
                                      !canEdit && "hover:bg-transparent",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "text-sm",
                                        isSelected ? "text-background" : "text-foreground",
                                      )}
                                    >
                                      {option.name}
                                    </span>
                                    <span
                                      className={cn(
                                        "text-sm",
                                        isSelected
                                          ? "text-background/70"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {isSaving
                                        ? "Saving..."
                                        : isClearing
                                          ? "Clearing..."
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
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="space-y-2">
                              <StatusBadge
                                status={selectedOption ? "accepted" : "planned"}
                              />
                              {selectedOption && canEdit ? (
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Click the selected option to clear it.
                                </p>
                              ) : !canEdit ? (
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Read-only
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
