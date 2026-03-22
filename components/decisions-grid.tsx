"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { ColDef, ValueFormatterParams } from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise"
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { CategorySummary } from "@/lib/data"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

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

type GridContext = {
  canEdit: boolean
  pendingDecisionId: string | null
  openNotesModal: (rowId: string) => void
  openOptionsModal: (rowId: string) => void
}

type ActiveDialog =
  | { type: "notes"; rowId: string }
  | { type: "options"; rowId: string; draftSelection: number | null }
  | null

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

function updateRowSelection(
  row: DecisionGridRow,
  nextSelection: number | null,
): DecisionGridRow {
  const selectedOption =
    nextSelection === null ? null : row.options[nextSelection] || null

  return {
    ...row,
    selectedOptionIndex: nextSelection,
    selectedOptionLabel:
      nextSelection === null
        ? NO_SELECTION_LABEL
        : row.optionLabels[nextSelection] || NO_SELECTION_LABEL,
    selectedCostDeltaExVat: selectedOption?.costDeltaExVat ?? null,
    status: nextSelection === null ? "Open" : "Closed",
  }
}

export function DecisionsGrid({
  categories,
  canEdit = true,
  showCosts = true,
}: DecisionsGridProps) {
  const router = useRouter()
  const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)
  const initialRows = useMemo(
    () =>
      categories.flatMap((category) =>
        category.decisions.map((decision) => createRow(category, decision, showCosts)),
      ),
    [categories, showCosts],
  )
  const [rows, setRows] = useState<DecisionGridRow[]>(initialRows)

  const gridContext = useMemo<GridContext>(
    () => ({
      canEdit,
      pendingDecisionId,
      openNotesModal: (rowId) => setActiveDialog({ type: "notes", rowId }),
      openOptionsModal: (rowId) => {
        const row = rows.find((item) => item.id === rowId)
        if (!row) {
          return
        }

        setActiveDialog({
          type: "options",
          rowId,
          draftSelection: row.selectedOptionIndex,
        })
      },
    }),
    [canEdit, pendingDecisionId, rows],
  )

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
          minWidth: 280,
          flex: 1,
          cellRenderer: NotesCell,
          sortable: false,
          filter: false,
          cellStyle: {
            whiteSpace: "nowrap",
            paddingTop: "12px",
            paddingBottom: "12px",
          },
        },
        {
          headerName: "Options",
          field: "selectedOptionLabel",
          minWidth: 280,
          flex: 1,
          cellRenderer: OptionsCell,
          sortable: false,
          filter: false,
          cellStyle: {
            paddingTop: "12px",
            paddingBottom: "12px",
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
        baseColumns.splice(3, 0, {
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
    [showCosts],
  )

  async function persistDecisionSelection(
    decisionId: string,
    previousSelection: number | null,
    nextSelection: number | null,
  ) {
    setPendingDecisionId(decisionId)
    setError(null)

    setRows((current) =>
      current.map((row) =>
        row.id === decisionId ? updateRowSelection(row, nextSelection) : row,
      ),
    )

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

      setActiveDialog(null)
      router.refresh()
    } catch (err) {
      setRows((current) =>
        current.map((row) =>
          row.id === decisionId ? updateRowSelection(row, previousSelection) : row,
        ),
      )
      setError(err instanceof Error ? err.message : "Could not update decision.")
    } finally {
      setPendingDecisionId(null)
    }
  }

  const activeRow = activeDialog
    ? rows.find((row) => row.id === activeDialog.rowId) || null
    : null

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

      <div className="ag-theme-quartz decisions-grid min-h-[720px] border border-border/70 bg-card">
        <AgGridReact<DecisionGridRow>
          rowData={rows}
          columnDefs={columnDefs}
          context={gridContext}
          defaultColDef={defaultColDef}
          groupDefaultExpanded={-1}
          groupDisplayType="singleColumn"
          animateRows={false}
          domLayout="autoHeight"
          headerHeight={44}
          rowHeight={48}
          suppressAggFuncInHeader
          rowClassRules={{
            "decisions-group-row": (params) => params.node.group === true,
          }}
          autoGroupColumnDef={{
            headerName: "Category / Decision",
            field: "title",
            minWidth: 340,
            flex: 1.15,
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

      <Dialog
        open={activeDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl border-border/70">
          {activeDialog?.type === "notes" && activeRow ? (
            <>
              <DialogHeader>
                <DialogTitle>{activeRow.title}</DialogTitle>
                <DialogDescription>{activeRow.categoryName}</DialogDescription>
              </DialogHeader>
              <div className="border border-border/70 bg-card px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                  {activeRow.notes || "No notes recorded."}
                </p>
              </div>
            </>
          ) : null}

          {activeDialog?.type === "options" && activeRow ? (
            <>
              <DialogHeader>
                <DialogTitle>{activeRow.title}</DialogTitle>
                <DialogDescription>
                  {activeRow.categoryName} ·{" "}
                  {canEdit
                    ? "Choose an option below, then apply it to the live register."
                    : "Available options"}
                </DialogDescription>
              </DialogHeader>

              <RadioGroup
                value={
                  activeDialog.draftSelection === null
                    ? "none"
                    : String(activeDialog.draftSelection)
                }
                onValueChange={(value) => {
                  if (!canEdit) {
                    return
                  }

                  setActiveDialog((current) =>
                    current?.type === "options"
                      ? {
                          ...current,
                          draftSelection: value === "none" ? null : Number(value),
                        }
                      : current,
                  )
                }}
                className="gap-3"
              >
                <FieldLabel htmlFor={`${activeRow.id}-option-none`}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>No selection</FieldTitle>
                      <FieldDescription>
                        Clear the current selection from this decision.
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem
                      value="none"
                      id={`${activeRow.id}-option-none`}
                      disabled={!canEdit}
                    />
                  </Field>
                </FieldLabel>

                {activeRow.options.map((option, index) => (
                  <FieldLabel htmlFor={`${activeRow.id}-option-${index}`} key={option.name}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{option.name}</FieldTitle>
                        <FieldDescription>
                          {showCosts
                            ? formatCurrency(option.costDeltaExVat)
                            : index === activeRow.selectedOptionIndex
                              ? "Current selection"
                              : "Option available"}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        value={String(index)}
                        id={`${activeRow.id}-option-${index}`}
                        disabled={!canEdit}
                      />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveDialog(null)}
                >
                  {canEdit ? "Cancel" : "Close"}
                </Button>
                {canEdit ? (
                  <Button
                    type="button"
                    disabled={
                      pendingDecisionId === activeRow.id ||
                      activeDialog.draftSelection === activeRow.selectedOptionIndex
                    }
                    onClick={() => {
                      void persistDecisionSelection(
                        activeRow.id,
                        activeRow.selectedOptionIndex,
                        activeDialog.draftSelection,
                      )
                    }}
                  >
                    {pendingDecisionId === activeRow.id ? "Saving..." : "Apply selection"}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NotesCell({
  data,
  context,
}: CustomCellRendererProps<DecisionGridRow, string, GridContext>) {
  if (!data || !context) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => context.openNotesModal(data.id)}
      className="block w-full truncate text-left text-sm text-muted-foreground transition hover:text-foreground"
      title={data.notes || "No notes recorded"}
    >
      {data.notes || "No notes"}
    </button>
  )
}

function OptionsCell({
  data,
  context,
}: CustomCellRendererProps<DecisionGridRow, string, GridContext>) {
  if (!data || !context) {
    return null
  }

  const isPending = context.pendingDecisionId === data.id

  return (
    <button
      type="button"
      onClick={() => context.openOptionsModal(data.id)}
      disabled={isPending}
      className={cn(
        "block w-full text-left transition hover:text-foreground disabled:cursor-wait disabled:opacity-70",
        data.selectedOptionIndex === null ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <span className="block truncate text-sm">
        {data.selectedOptionLabel}
      </span>
    </button>
  )
}
