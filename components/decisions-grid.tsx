"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type {
  CellValueChangedEvent,
  ColDef,
  ValueFormatterParams,
} from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise"
import { AgGridReact } from "ag-grid-react"
import type { CategorySummary } from "@/lib/data"
import { formatCurrency } from "@/lib/format"

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule])

if (process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY) {
  LicenseManager.setLicenseKey(process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY)
}

type DecisionsGridProps = {
  categories: CategorySummary[]
  canEdit?: boolean
  showCosts?: boolean
}

type DecisionOption = {
  name: string
  costDeltaExVat: number
}

type DecisionGridRow = {
  id: string
  categoryId: string
  categoryName: string
  title: string
  notes: string
  options: DecisionOption[]
  optionLabels: string[]
  selectedOptionIndex: number | null
  selectedOptionLabel: string
  selectedCostDeltaExVat: number | null
  status: "Open" | "Closed"
}

const NO_SELECTION_LABEL = "No selection"

function formatDecisionOptionLabel(
  name: string,
  costDeltaExVat: number,
  showCosts: boolean,
) {
  if (!showCosts) {
    return name
  }

  const prefix = costDeltaExVat > 0 ? "+" : ""
  return `${name} (${prefix}${formatCurrency(costDeltaExVat)})`
}

function createRow(
  category: CategorySummary,
  decision: CategorySummary["decisions"][number],
  showCosts: boolean,
): DecisionGridRow {
  const optionLabels = decision.options.map((option) =>
    formatDecisionOptionLabel(option.name, option.costDeltaExVat, showCosts),
  )
  const selectedOption =
    decision.selectedOptionIndex === null
      ? null
      : decision.options[decision.selectedOptionIndex] || null

  return {
    id: decision.id,
    categoryId: category.id,
    categoryName: category.name,
    title: decision.title,
    notes: decision.notes || "",
    options: decision.options,
    optionLabels,
    selectedOptionIndex: decision.selectedOptionIndex,
    selectedOptionLabel:
      decision.selectedOptionIndex === null
        ? NO_SELECTION_LABEL
        : optionLabels[decision.selectedOptionIndex] || NO_SELECTION_LABEL,
    selectedCostDeltaExVat: selectedOption?.costDeltaExVat ?? null,
    status: decision.selectedOptionIndex === null ? "Open" : "Closed",
  }
}

function formatImpactValue(
  params: ValueFormatterParams<DecisionGridRow, number | null>,
) {
  const value = params.value
  if (value === null || value === undefined) {
    return ""
  }

  return formatCurrency(value)
}

export function DecisionsGrid({
  categories,
  canEdit = true,
  showCosts = true,
}: DecisionsGridProps) {
  const router = useRouter()
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initialRows = useMemo(
    () =>
      categories.flatMap((category) =>
        category.decisions.map((decision) => createRow(category, decision, showCosts)),
      ),
    [categories, showCosts],
  )
  const [rows, setRows] = useState<DecisionGridRow[]>(initialRows)

  const defaultColDef = useMemo<ColDef<DecisionGridRow>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      editable: false,
      wrapHeaderText: true,
      autoHeaderHeight: true,
    }),
    [],
  )

  const columnDefs = useMemo<ColDef<DecisionGridRow>[]>(
    () => {
      const baseColumns: ColDef<DecisionGridRow>[] = [
        {
          field: "categoryName",
          rowGroup: true,
          hide: true,
        },
        {
          headerName: "Notes",
          field: "notes",
          minWidth: 300,
          flex: 1.1,
          wrapText: true,
          autoHeight: true,
          cellStyle: {
            whiteSpace: "normal",
            lineHeight: "1.5",
            paddingTop: "12px",
            paddingBottom: "12px",
          },
        },
        {
          headerName: "Options",
          field: "selectedOptionLabel",
          minWidth: 320,
          flex: 1.1,
          editable: () => canEdit && pendingDecisionId === null,
          cellEditor: "agSelectCellEditor",
          cellEditorParams: (params: { data?: DecisionGridRow }) => ({
            values: [NO_SELECTION_LABEL, ...(params.data?.optionLabels || [])],
          }),
          cellStyle: {
            paddingTop: "12px",
            paddingBottom: "12px",
          },
          onCellValueChanged: (event) => {
            void handleSelectionChange(event)
          },
        },
        {
          headerName: "Status",
          field: "status",
          width: 120,
          maxWidth: 140,
          cellStyle: {
            paddingTop: "12px",
            paddingBottom: "12px",
          },
        },
      ]

      if (showCosts) {
        baseColumns.splice(4, 0, {
          headerName: "Impact",
          field: "selectedCostDeltaExVat",
          width: 150,
          minWidth: 150,
          maxWidth: 170,
          valueFormatter: formatImpactValue,
          cellStyle: {
            paddingTop: "12px",
            paddingBottom: "12px",
          },
        })
      }

      return baseColumns
    },
    [canEdit, pendingDecisionId, showCosts],
  )

  async function persistDecisionSelection(
    decisionId: string,
    previousSelection: number | null,
    nextSelection: number | null,
  ) {
    setPendingDecisionId(decisionId)
    setError(null)

    try {
      const response = await fetch("/api/decisions/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId,
          selectedOptionIndex: nextSelection,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Could not update decision.")
      }

      router.refresh()
    } catch (err) {
      setRows((current) =>
        current.map((row) => {
          if (row.id !== decisionId) {
            return row
          }

          const selectedOption =
            previousSelection === null ? null : row.options[previousSelection] || null

          return {
            ...row,
            selectedOptionIndex: previousSelection,
            selectedOptionLabel:
              previousSelection === null
                ? NO_SELECTION_LABEL
                : row.optionLabels[previousSelection] || NO_SELECTION_LABEL,
            selectedCostDeltaExVat: selectedOption?.costDeltaExVat ?? null,
            status: previousSelection === null ? "Open" : "Closed",
          }
        }),
      )
      setError(err instanceof Error ? err.message : "Could not update decision.")
    } finally {
      setPendingDecisionId(null)
    }
  }

  async function handleSelectionChange(
    event: CellValueChangedEvent<DecisionGridRow>,
  ) {
    const row = event.data
    if (!row) {
      return
    }

    const nextLabel = String(event.newValue || NO_SELECTION_LABEL)
    const previousSelection = row.selectedOptionIndex
    const nextSelection =
      nextLabel === NO_SELECTION_LABEL ? null : row.optionLabels.indexOf(nextLabel)

    if (nextSelection === -1 || previousSelection === nextSelection) {
      setRows((current) =>
        current.map((currentRow) =>
          currentRow.id === row.id
            ? {
                ...currentRow,
                selectedOptionLabel:
                  previousSelection === null
                    ? NO_SELECTION_LABEL
                    : currentRow.optionLabels[previousSelection] || NO_SELECTION_LABEL,
              }
            : currentRow,
        ),
      )
      return
    }

    setRows((current) =>
      current.map((currentRow) => {
        if (currentRow.id !== row.id) {
          return currentRow
        }

        const selectedOption =
          nextSelection === null ? null : currentRow.options[nextSelection] || null

        return {
          ...currentRow,
          selectedOptionIndex: nextSelection,
          selectedOptionLabel: nextLabel,
          selectedCostDeltaExVat: selectedOption?.costDeltaExVat ?? null,
          status: nextSelection === null ? "Open" : "Closed",
        }
      }),
    )

    await persistDecisionSelection(row.id, previousSelection, nextSelection)
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

      <div className="ag-theme-quartz decisions-grid min-h-[720px] border border-border/70 bg-card">
        <AgGridReact<DecisionGridRow>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          groupDefaultExpanded={-1}
          groupDisplayType="singleColumn"
          animateRows={false}
          domLayout="autoHeight"
          stopEditingWhenCellsLoseFocus
          singleClickEdit={canEdit}
          headerHeight={44}
          rowHeight={42}
          suppressAggFuncInHeader
          autoGroupColumnDef={{
            headerName: "Category / Decision",
            field: "title",
            minWidth: 320,
            flex: 1,
            cellStyle: {
              paddingTop: "12px",
              paddingBottom: "12px",
              fontWeight: "500",
            },
            cellRendererParams: {
              suppressCount: false,
            },
          }}
        />
      </div>
    </div>
  )
}
