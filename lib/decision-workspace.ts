export type DecisionBrowseMode = "room" | "type"

export type DecisionWorkspaceStatus = "open" | "selected" | "on_hold"

export type DecisionWorkspaceRoom = {
  id: string
  name: string
  sortOrder: number
}

export type DecisionWorkspaceCategory = {
  id: string
  name: string
  sortOrder: number
}

export type DecisionWorkspaceSelection = {
  id: string
  status: DecisionWorkspaceStatus
  selectedName?: string | null
  selectedSource?: string | null
  selectedSourceUrl?: string | null
  selectedCostExVat?: number | null
  selectedNotes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type DecisionWorkspaceItem = {
  id: string
  code: string
  title: string
  categoryId: string
  categoryName?: string
  roomId: string
  decisionCategoryId: string
  decisionCategoryName: string
  roomGroup: string
  roomSection: string
  roomName?: string
  typeGroup: string
  typeSection: string
  baselineSpec: string
  baselineBudgetExVat: number
  quantity?: number | null
  unit?: string | null
  decisionStage: "now" | "later"
  priority: "high" | "medium" | "low"
  description?: string | null
  architectNote?: string | null
  status: DecisionWorkspaceStatus
  currentSelectionId?: string | null
  selectedName?: string | null
  selectedSource?: string | null
  selectedSourceUrl?: string | null
  selectedCostExVat?: number | null
  selectedNotes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type DecisionWorkspaceSummary = {
  totalItems: number
  openItems: number
  selectedItems: number
  onHoldItems: number
  baselineBudgetExVat: number
  selectedCostExVat: number
  selectedDeltaExVat: number
}

export function getDecisionSelectedDeltaExVat(
  item: Pick<DecisionWorkspaceItem, "baselineBudgetExVat" | "selectedCostExVat">,
): number {
  if (item.selectedCostExVat === null || item.selectedCostExVat === undefined) {
    return 0
  }

  return item.selectedCostExVat - item.baselineBudgetExVat
}

export function summarizeDecisionWorkspace(
  items: DecisionWorkspaceItem[],
): DecisionWorkspaceSummary {
  return items.reduce<DecisionWorkspaceSummary>(
    (summary, item) => {
      const selectedCostExVat = item.selectedCostExVat ?? 0
      const selectedDeltaExVat = getDecisionSelectedDeltaExVat(item)

      return {
        totalItems: summary.totalItems + 1,
        openItems: summary.openItems + (item.status === "open" ? 1 : 0),
        selectedItems: summary.selectedItems + (item.status === "selected" ? 1 : 0),
        onHoldItems: summary.onHoldItems + (item.status === "on_hold" ? 1 : 0),
        baselineBudgetExVat: summary.baselineBudgetExVat + item.baselineBudgetExVat,
        selectedCostExVat: summary.selectedCostExVat + selectedCostExVat,
        selectedDeltaExVat: summary.selectedDeltaExVat + selectedDeltaExVat,
      }
    },
    {
      totalItems: 0,
      openItems: 0,
      selectedItems: 0,
      onHoldItems: 0,
      baselineBudgetExVat: 0,
      selectedCostExVat: 0,
      selectedDeltaExVat: 0,
    },
  )
}
