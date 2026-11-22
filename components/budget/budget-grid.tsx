"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import {
  columnFilteringFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ExpandedState,
  type Row,
  type SortingState,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Banknote,
  Calculator,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Hash,
  Hourglass,
  Loader2,
  MoreHorizontal,
  Percent,
  Plus,
  PoundSterling,
  Receipt,
  Scale,
  Search,
  Trash2,
  Type,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toaster } from "@/components/ui/sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type {
  BudgetGridCategory,
  BudgetGridData,
  BudgetGridItem,
  BudgetPayee,
} from "@/lib/budget-grid-types"
import { cn } from "@/lib/utils"
import {
  describeActor,
  formatDelta,
  formatMoney,
  formatVat,
  parseMoney,
  parseVatPercent,
  recomputeGrid,
  relativeTime,
} from "@/components/budget/budget-format"

// ---------------------------------------------------------------------------
// Row model

type BudgetRow = {
  id: string
  kind: "category" | "item"
  categoryId: string
  name: string
  budgetExVat: number
  quotedExVat: number | null
  quoteDeltaExVat: number | null
  actualExVat: number | null
  paidExVat: number | null
  /** Invoiced but not yet paid (Actual − Paid). Null when nothing is invoiced against the row. */
  outstandingExVat: number | null
  remainingExVat: number
  vatRate: number
  category: BudgetGridCategory
  item: BudgetGridItem | null
  subRows?: BudgetRow[]
}

type EditorKind = "text" | "money" | "percent" | "quote"

type BudgetColumnMeta = {
  align: "left" | "right"
  width: number
  icon: ReactNode
  editor?: (row: BudgetRow) => EditorKind | null
}

const features = tableFeatures({
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnMeta: metaHelper<BudgetColumnMeta>(),
})

type BudgetTableRow = Row<typeof features, BudgetRow>

const helper = createColumnHelper<typeof features, BudgetRow>()

function outstanding(actual: number | null, paid: number | null): number | null {
  if (actual === null) return null
  return Math.round((actual - (paid ?? 0)) * 100) / 100
}

function itemRemaining(item: BudgetGridItem): number {
  return Math.round((item.budgetExVat - (item.actualExVat ?? 0)) * 100) / 100
}

function toRows(categories: BudgetGridCategory[]): BudgetRow[] {
  return categories.map((category) => ({
    id: category.id,
    kind: "category",
    categoryId: category.id,
    name: category.name,
    budgetExVat: category.budgetExVat,
    quotedExVat: category.quotedExVat,
    quoteDeltaExVat: category.quoteDeltaExVat,
    actualExVat: category.actualExVat,
    paidExVat: category.paidExVat,
    outstandingExVat: outstanding(category.actualExVat, category.paidExVat),
    remainingExVat: Math.round((category.budgetExVat - category.actualExVat) * 100) / 100,
    vatRate: category.vatRate,
    category,
    item: null,
    subRows: category.items.map((item) => ({
      id: item.id,
      kind: "item",
      categoryId: category.id,
      name: item.name,
      budgetExVat: item.budgetExVat,
      quotedExVat: item.quotedExVat,
      quoteDeltaExVat:
        item.quotedExVat === null ? null : Math.round((item.quotedExVat - item.budgetExVat) * 100) / 100,
      actualExVat: item.actualExVat,
      paidExVat: item.paidExVat,
      outstandingExVat: outstanding(item.actualExVat, item.paidExVat),
      remainingExVat: itemRemaining(item),
      vatRate: item.vatRate,
      category,
      item,
    })),
  }))
}

// ---------------------------------------------------------------------------
// Columns (module scope: TanStack needs a stable reference)

const columns = helper.columns([
  helper.accessor("name", {
    id: "name",
    header: "Item",
    sortFn: "alphanumeric",
    meta: {
      align: "left",
      width: 360,
      icon: <Type className="size-3.5" />,
      editor: () => "text",
    },
  }),
  helper.accessor("budgetExVat", {
    id: "budget",
    header: "Budget",
    sortFn: "basic",
    meta: {
      align: "right",
      width: 132,
      icon: <PoundSterling className="size-3.5" />,
      editor: (row) => (row.kind === "item" ? "money" : null),
    },
  }),
  helper.accessor((row) => row.quotedExVat ?? undefined, {
    id: "quoted",
    header: "Quoted",
    sortFn: "basic",
    sortUndefined: "last",
    meta: {
      align: "right",
      width: 150,
      icon: <FileText className="size-3.5" />,
      editor: (row) => (row.kind === "item" ? "quote" : null),
    },
  }),
  helper.accessor((row) => row.quoteDeltaExVat ?? undefined, {
    id: "quoteDelta",
    header: "Quote vs budget",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { align: "right", width: 150, icon: <Scale className="size-3.5" /> },
  }),
  helper.accessor((row) => row.actualExVat ?? undefined, {
    id: "actual",
    header: "Actual",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { align: "right", width: 124, icon: <Receipt className="size-3.5" /> },
  }),
  helper.accessor((row) => row.paidExVat ?? undefined, {
    id: "paid",
    header: "Paid",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { align: "right", width: 124, icon: <Banknote className="size-3.5" /> },
  }),
  helper.accessor((row) => row.outstandingExVat ?? undefined, {
    id: "outstanding",
    header: "Outstanding",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { align: "right", width: 136, icon: <Hourglass className="size-3.5" /> },
  }),
  helper.accessor("remainingExVat", {
    id: "remaining",
    header: "Remaining Budget",
    sortFn: "basic",
    meta: { align: "right", width: 164, icon: <Wallet className="size-3.5" /> },
  }),
  helper.accessor("vatRate", {
    id: "vat",
    header: "VAT",
    sortFn: "basic",
    meta: {
      align: "right",
      width: 84,
      icon: <Percent className="size-3.5" />,
      editor: (row) => (row.kind === "item" ? "percent" : null),
    },
  }),
])

const COLUMN_IDS = [
  "name",
  "budget",
  "quoted",
  "quoteDelta",
  "actual",
  "paid",
  "outstanding",
  "remaining",
  "vat",
] as const
type ColumnId = (typeof COLUMN_IDS)[number]

function columnMeta(columnId: string): BudgetColumnMeta {
  const def = columns.find((c) => c.id === columnId)
  return (def?.meta ?? { align: "left", width: 120, icon: null }) as BudgetColumnMeta
}

// ---------------------------------------------------------------------------
// Saving

type BudgetChange =
  | { type: "update_line_item"; id: string; expectedVersion?: number; patch: Record<string, unknown> }
  | { type: "create_line_item"; categoryId: string; name: string; budgetExVat?: number }
  | { type: "delete_line_item"; id: string; expectedVersion?: number }
  | { type: "update_category"; id: string; expectedVersion?: number; patch: Record<string, unknown> }

type SaveResponse = {
  result?: { createdIds: string[] }
  grid?: BudgetGridData | null
  error?: string
}

const POLL_MS = 15_000

// The theme's --muted/--card are translucent ("glass"), so anything sticky needs an
// opaque base or scrolled rows show through it.
const SOLID = "bg-popover"
const SOLID_TINT = "bg-popover shadow-[inset_0_0_0_9999px_var(--muted)]"
const TINT = "shadow-[inset_0_0_0_9999px_var(--muted)]"
// The theme's accent is a strong orange; keep the picker's highlight neutral.
const PICKER_ITEM = "data-[selected=true]:bg-muted data-[selected=true]:text-foreground"

// ---------------------------------------------------------------------------

type ActiveCell = { rowId: string; columnId: ColumnId }

export function BudgetGrid({
  initialData,
  canEdit,
  saleScenarios,
}: {
  initialData: BudgetGridData
  canEdit: boolean
  saleScenarios?: ReactNode
}) {
  const [grid, setGrid] = useState(initialData)
  const [constructionOnly, setConstructionOnly] = useState(true)
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [active, setActive] = useState<ActiveCell | null>(null)
  const [editing, setEditing] = useState<{ initial: string } | null>(null)
  const [paidOpenFor, setPaidOpenFor] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BudgetGridItem | null>(null)
  // Category an "Add item" is in flight for: blocks double-clicks while the server round-trips.
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [saving, setSaving] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  const gridRef = useRef(grid)
  gridRef.current = grid
  const containerRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingRef = useRef(0)
  const editingRef = useRef(false)
  editingRef.current = editing !== null

  // ---- data -----------------------------------------------------------------

  const refetch = useCallback(async () => {
    try {
      const response = await fetch("/api/budget", { cache: "no-store" })
      if (!response.ok) return
      const next = (await response.json()) as BudgetGridData
      if (pendingRef.current === 0) {
        setGrid(next)
        setLastSyncedAt(Date.now())
      }
    } catch {
      // Offline or transient: the next poll will retry.
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
      if (document.hidden || editingRef.current || pendingRef.current > 0) return
      void refetch()
    }, POLL_MS)
    const onVisible = () => {
      if (!document.hidden && !editingRef.current && pendingRef.current === 0) void refetch()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [refetch])

  const submit = useCallback(
    (
      changes: BudgetChange[],
      options: {
        optimistic?: (current: BudgetGridData) => BudgetGridData
        onSuccess?: (response: SaveResponse) => void
        /** Runs after success or failure. */
        onSettled?: () => void
      } = {},
    ) => {
      if (options.optimistic) {
        const before = gridRef.current
        const next = recomputeGrid(options.optimistic(before))
        const t = next.totals
        if (
          t.maxDrawdownExVat !== null &&
          t.drawdownExVat > t.maxDrawdownExVat + 0.005 &&
          t.drawdownExVat > before.totals.drawdownExVat + 0.005
        ) {
          toast.error(
            `Over the contingency cap by ${formatMoney(t.drawdownExVat - t.maxDrawdownExVat)}. Contingency can't go below ${formatMoney(t.contingencyFloorExVat)}.`,
          )
          return
        }
        setGrid(next)
      }

      pendingRef.current += 1
      setSaving((n) => n + 1)
      queueRef.current = queueRef.current.then(async () => {
        try {
          const response = await fetch("/api/budget/changes", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ changes }),
          })
          const body = (await response.json().catch(() => ({}))) as SaveResponse
          pendingRef.current -= 1
          if (!response.ok) {
            toast.error(body.error || "Could not save.", {
              description: response.status === 409 ? "Reloaded with the latest values." : undefined,
            })
            if (body.grid) setGrid(body.grid)
            else await refetch()
            return
          }
          if (pendingRef.current === 0 && body.grid) {
            setGrid(body.grid)
            setLastSyncedAt(Date.now())
          }
          options.onSuccess?.(body)
        } catch {
          pendingRef.current -= 1
          toast.error("Could not reach the server. Your change was not saved.")
          await refetch()
        } finally {
          setSaving((n) => n - 1)
          options.onSettled?.()
        }
      })
    },
    [refetch],
  )

  // ---- table ----------------------------------------------------------------

  const data = useMemo(
    () =>
      toRows(
        constructionOnly
          ? grid.categories.filter((c) => c.reportingBucket !== "soft_cost")
          : grid.categories,
      ),
    [grid.categories, constructionOnly],
  )

  const searching = globalFilter.trim().length > 0

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => (row.kind === "category" ? `c:${row.id}` : `i:${row.id}`),
    getSubRows: (row) => row.subRows,
    state: { expanded: searching ? true : expanded, sorting, globalFilter },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => column.id === "name",
    filterFromLeafRows: true,
    autoResetExpanded: false,
  })

  const rows = table.getRowModel().rows
  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])

  // ---- editing --------------------------------------------------------------

  const commitEdit = useCallback(
    (row: BudgetRow, columnId: ColumnId, raw: string) => {
      setEditing(null)
      // Synchronous, so keys typed straight after Enter/Tab reach the grid.
      containerRef.current?.focus({ preventScroll: true })

      if (row.kind === "category") {
        if (columnId !== "name") return
        const name = raw.trim()
        if (!name || name === row.category.name) return
        submit(
          [{ type: "update_category", id: row.category.id, expectedVersion: row.category.version, patch: { name } }],
          {
            optimistic: (g) => ({
              ...g,
              categories: g.categories.map((c) =>
                c.id === row.category.id ? { ...c, name, version: c.version + 1 } : c,
              ),
            }),
          },
        )
        return
      }

      const item = row.item as BudgetGridItem
      let patch: { name?: string; budgetExVat?: number; vatRate?: number | null } = {}
      if (columnId === "name") {
        const name = raw.trim()
        if (!name) return toastInvalid("Name can't be empty.")
        if (name === item.name) return
        patch = { name }
      } else if (columnId === "budget") {
        const value = parseMoney(raw)
        if (value === null) return toastInvalid(`"${raw}" isn't an amount. Try 12500, £12,500 or 12.5k.`)
        if (value === item.budgetExVat) return
        patch = { budgetExVat: value }
      } else if (columnId === "vat") {
        const value = parseVatPercent(raw)
        if (value === undefined) return toastInvalid(`"${raw}" isn't a VAT rate. Try 20 or 5.`)
        const current = item.vatRateIsInherited ? null : item.vatRate
        if (value === current) return
        patch = { vatRate: value }
      } else {
        return
      }

      submit([{ type: "update_line_item", id: item.id, expectedVersion: item.version, patch }], {
        optimistic: (g) => ({
          ...g,
          categories: g.categories.map((c) =>
            c.id !== item.categoryId
              ? c
              : {
                  ...c,
                  items: c.items.map((i) =>
                    i.id !== item.id
                      ? i
                      : {
                          ...i,
                          ...("name" in patch ? { name: patch.name as string } : {}),
                          ...("budgetExVat" in patch ? { budgetExVat: patch.budgetExVat as number } : {}),
                          ...("vatRate" in patch
                            ? {
                                vatRate: patch.vatRate ?? c.vatRate,
                                vatRateIsInherited: patch.vatRate === null,
                              }
                            : {}),
                          version: i.version + 1,
                        },
                  ),
                },
          ),
        }),
      })
    },
    [submit],
  )

  const setQuote = useCallback(
    (item: BudgetGridItem, quoteId: string | null) => {
      setEditing(null)
      // Synchronous, so keys typed straight after Enter/Tab reach the grid.
      containerRef.current?.focus({ preventScroll: true })
      if (quoteId === item.quoteId) return
      const quote = quoteId ? gridRef.current.quotes.find((q) => q.id === quoteId) : null
      submit(
        [{ type: "update_line_item", id: item.id, expectedVersion: item.version, patch: { quoteId } }],
        {
          optimistic: (g) => ({
            ...g,
            quotes: g.quotes.map((q) =>
              q.id === quoteId ? { ...q, lineItemId: item.id } : q.lineItemId === item.id ? { ...q, lineItemId: null } : q,
            ),
            categories: g.categories.map((c) =>
              c.id !== item.categoryId
                ? c
                : {
                    ...c,
                    items: c.items.map((i) =>
                      i.id !== item.id
                        ? i
                        : { ...i, quoteId, quotedExVat: quote ? quote.amountExVat : null, version: i.version + 1 },
                    ),
                  },
            ),
          }),
        },
      )
    },
    [submit],
  )

  const addItem = useCallback(
    (category: BudgetGridCategory) => {
      if (addingTo) return
      setAddingTo(category.id)
      submit([{ type: "create_line_item", categoryId: category.id, name: "New item", budgetExVat: 0 }], {
        onSuccess: (response) => {
          const id = response.result?.createdIds[0]
          if (!id) return
          setExpanded((prev) => (prev === true ? prev : { ...prev, [`c:${category.id}`]: true }))
          // Only jump into the new row if the user isn't already editing something else:
          // the row lands a second or two after the click, and stealing focus then loses keystrokes.
          if (editingRef.current) return
          setActive({ rowId: `i:${id}`, columnId: "name" })
          setEditing({ initial: "New item" })
        },
        onSettled: () => setAddingTo(null),
      })
    },
    [submit, addingTo],
  )

  const confirmDelete = useCallback(() => {
    const item = pendingDelete
    setPendingDelete(null)
    if (!item) return
    submit([{ type: "delete_line_item", id: item.id, expectedVersion: item.version }], {
      optimistic: (g) => ({
        ...g,
        quotes: g.quotes.map((q) => (q.lineItemId === item.id ? { ...q, lineItemId: null } : q)),
        categories: g.categories.map((c) =>
          c.id === item.categoryId ? { ...c, items: c.items.filter((i) => i.id !== item.id) } : c,
        ),
      }),
      onSuccess: () => toast.success(`Deleted "${item.name}".`),
    })
  }, [pendingDelete, submit])

  // ---- keyboard -------------------------------------------------------------

  useEffect(() => {
    if (!active) return
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-cell="${CSS.escape(`${active.rowId}|${active.columnId}`)}"]`,
    )
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  // Drop a selection whose row disappeared (deleted, filtered, collapsed).
  useEffect(() => {
    if (active && !rowIndexById.has(active.rowId)) {
      setActive(null)
      setEditing(null)
    }
  }, [active, rowIndexById])

  const move = useCallback(
    (dRow: number, dCol: number) => {
      setActive((current) => {
        if (rows.length === 0) return null
        if (!current) return { rowId: rows[0].id, columnId: "name" }
        const rowIndex = rowIndexById.get(current.rowId) ?? 0
        const colIndex = COLUMN_IDS.indexOf(current.columnId)
        const nextRow = Math.min(rows.length - 1, Math.max(0, rowIndex + dRow))
        const nextCol = Math.min(COLUMN_IDS.length - 1, Math.max(0, colIndex + dCol))
        return { rowId: rows[nextRow].id, columnId: COLUMN_IDS[nextCol] }
      })
    },
    [rows, rowIndexById],
  )

  const activeRow = active ? rows[rowIndexById.get(active.rowId) ?? -1] : undefined
  const activeEditor =
    active && activeRow && canEdit ? columnMeta(active.columnId).editor?.(activeRow.original) ?? null : null

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing || pendingDelete) return
    if ((event.target as HTMLElement).closest("input, [role=dialog], [role=menu]")) return

    const key = event.key
    if (key === "ArrowDown") return event.preventDefault(), move(1, 0)
    if (key === "ArrowUp") return event.preventDefault(), move(-1, 0)
    if (key === "ArrowRight") {
      event.preventDefault()
      if (activeRow?.getCanExpand() && active?.columnId === "name" && !activeRow.getIsExpanded()) {
        return activeRow.toggleExpanded(true)
      }
      return move(0, 1)
    }
    if (key === "ArrowLeft") {
      event.preventDefault()
      if (active?.columnId === "name" && activeRow) {
        if (activeRow.getCanExpand() && activeRow.getIsExpanded()) return activeRow.toggleExpanded(false)
        if (activeRow.depth > 0) {
          const parent = activeRow.getParentRow()
          if (parent) return setActive({ rowId: parent.id, columnId: "name" })
        }
      }
      return move(0, -1)
    }
    if (key === "Tab") return event.preventDefault(), move(0, event.shiftKey ? -1 : 1)
    if (!active || !activeRow) {
      if (key.length === 1 || key === "Enter") move(0, 0)
      return
    }
    if (key === "Enter" || key === "F2") {
      event.preventDefault()
      if (activeEditor) return setEditing({ initial: editorInitialValue(activeRow.original, active.columnId) })
      if (active.columnId === "paid" && (activeRow.original.paidExVat ?? 0) > 0) return setPaidOpenFor(activeRow.id)
      if (activeRow.getCanExpand()) return activeRow.toggleExpanded()
      return
    }
    if (key === " " && activeRow.getCanExpand() && active.columnId === "name" && !activeEditor) {
      event.preventDefault()
      return activeRow.toggleExpanded()
    }
    if (activeEditor && activeEditor !== "quote" && key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      return setEditing({ initial: key })
    }
  }

  // ---- render ---------------------------------------------------------------

  const visibleTotals = useMemo(() => {
    const cats = data.map((r) => r.category)
    const sum = (f: (c: BudgetGridCategory) => number) => Math.round(cats.reduce((s, c) => s + f(c), 0) * 100) / 100
    const quoted = cats.filter((c) => c.quotedExVat !== null)
    return {
      budget: sum((c) => c.budgetExVat),
      quoted: quoted.length ? sum((c) => c.quotedExVat ?? 0) : null,
      quoteDelta: quoted.length ? sum((c) => c.quoteDeltaExVat ?? 0) : null,
      actual: sum((c) => c.actualExVat),
      paid: sum((c) => c.paidExVat),
      outstanding: sum((c) => c.actualExVat - c.paidExVat),
      remaining: sum((c) => c.budgetExVat - c.actualExVat),
    }
  }, [data])

  const totals = grid.totals
  // Measure drawdown against the cap when there is one, otherwise against the whole starting pot.
  const drawdownLimit = totals.maxDrawdownExVat ?? totals.startingContingencyExVat
  const usedPct = drawdownLimit > 0 ? Math.max(0, totals.drawdownExVat) / drawdownLimit : 0
  const tableWidth = COLUMN_IDS.reduce((s, id) => s + columnMeta(id).width, 0)
  const allExpanded = table.getIsAllRowsExpanded()

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Toaster position="bottom-right" />

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Budget</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Cost drivers</h1>
        </div>
        <div className="flex items-end gap-3">
          {saleScenarios ? (
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] text-muted-foreground transition hover:text-foreground"
                >
                  <Calculator className="size-3.5" />
                  Sale scenarios
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Sale scenarios</DialogTitle>
                  <DialogDescription>
                    Whole project, including professional fees. Project costs shown before VAT. Refresh the page to
                    pick up budget changes.
                  </DialogDescription>
                </DialogHeader>
                {/* Sole child of its wrapper: a server-rendered element passed as a prop trips
                    React's dev-only list-key check when rendered beside siblings. */}
                <div>{saleScenarios}</div>
              </DialogContent>
            </Dialog>
          ) : null}
          <ContingencyMeter totals={totals} usedPct={usedPct} />
        </div>
      </div>

      {grid.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {grid.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {[
            { label: "All costs", value: false },
            { label: "Construction only", value: true },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setConstructionOnly(option.value)}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                constructionOnly === option.value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setGlobalFilter("")
              if (e.key === "ArrowDown") {
                e.preventDefault()
                containerRef.current?.focus()
                move(0, 0)
              }
            }}
            placeholder="Search items"
            className="h-8 w-56 rounded-md border border-border bg-card pl-7 pr-2 outline-none placeholder:text-muted-foreground focus:border-foreground/30"
          />
        </label>

        <button
          type="button"
          onClick={() => table.toggleAllRowsExpanded(!allExpanded)}
          disabled={searching}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          {allExpanded ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", saving > 0 ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />
          {saving > 0 ? "Saving…" : `Live · synced ${relativeTime(new Date(lastSyncedAt).toISOString(), now)}`}
        </div>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        className="relative max-h-[calc(100vh-260px)] overflow-auto rounded-lg border border-border bg-card text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-foreground/10"
        role="grid"
        aria-label="Budget"
        aria-rowcount={rows.length}
      >
        <table className="border-separate border-spacing-0" style={{ width: tableWidth, minWidth: "100%" }}>
          <colgroup>
            {COLUMN_IDS.map((id) => (
              <col key={id} style={{ width: columnMeta(id).width }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, index) => {
                  const meta = columnMeta(header.column.id)
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-20 h-9 border-b border-border px-3 font-normal text-muted-foreground",
                        SOLID_TINT,
                        index > 0 && "border-l border-border/60",
                        index === 0 && "left-0 z-30",
                      )}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "flex w-full items-center gap-1.5 whitespace-nowrap hover:text-foreground",
                          meta.align === "right" && "justify-end",
                        )}
                      >
                        {meta.align === "left" ? meta.icon : null}
                        <table.FlexRender header={header} />
                        {meta.align === "right" ? meta.icon : null}
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : null}
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              const next = rows[rowIndex + 1]
              const isCategory = row.original.kind === "category"
              const showAddRow =
                canEdit &&
                !searching &&
                ((row.depth === 1 && next?.depth !== 1) ||
                  (isCategory && row.getIsExpanded() && next?.depth !== 1))
              return (
                <GridRowFragment key={row.id}>
                  <tr className="group/row" aria-rowindex={rowIndex + 1}>
                    {row.getAllCells().map((cell, colIndex) => {
                      const columnId = cell.column.id as ColumnId
                      const meta = columnMeta(columnId)
                      const isActive = active?.rowId === row.id && active.columnId === columnId
                      const isEditing = isActive && editing !== null
                      const editor = canEdit ? meta.editor?.(row.original) ?? null : null
                      return (
                        <td
                          key={cell.id}
                          data-cell={`${row.id}|${columnId}`}
                          onMouseDown={() => {
                            if (isEditing) return
                            // Another cell is mid-edit: commit it first. Moving the active cell would
                            // otherwise unmount its input without a blur, dropping the typed value and
                            // re-opening the editor here with the old text.
                            if (editing !== null) {
                              const focused = document.activeElement
                              if (focused instanceof HTMLElement && focused.tagName === "INPUT") focused.blur()
                              setEditing(null)
                            }
                            setActive({ rowId: row.id, columnId })
                          }}
                          onDoubleClick={() => {
                            if (editor) setEditing({ initial: editorInitialValue(row.original, columnId) })
                          }}
                          className={cn(
                            "relative h-9 border-b border-border/60 px-3 tabular-nums",
                            colIndex > 0 && "border-l border-border/40",
                            colIndex === 0 && "sticky left-0 z-10",
                            isCategory && (colIndex === 0 ? SOLID_TINT : TINT),
                            !isCategory && colIndex === 0 && SOLID,
                            meta.align === "right" ? "text-right" : "text-left",
                            isCategory && "font-medium",
                            editor && "cursor-cell",
                            isActive && "outline outline-2 -outline-offset-2 outline-blue-500",
                          )}
                        >
                          {isEditing && editor && editor !== "quote" ? (
                            <CellInput
                              initial={editing.initial}
                              align={meta.align}
                              onCommit={(value, moveBy) => {
                                commitEdit(row.original, columnId, value)
                                if (moveBy) move(moveBy[0], moveBy[1])
                              }}
                              onCancel={() => {
                                setEditing(null)
                                containerRef.current?.focus({ preventScroll: true })
                              }}
                            />
                          ) : (
                            <CellDisplay
                              row={row}
                              columnId={columnId}
                              canEdit={canEdit}
                              grid={grid}
                              quotePickerOpen={isEditing && editor === "quote"}
                              onQuotePickerChange={(open) => {
                                if (open) {
                                  setActive({ rowId: row.id, columnId })
                                  setEditing({ initial: "" })
                                } else {
                                  setEditing(null)
                                  containerRef.current?.focus({ preventScroll: true })
                                }
                              }}
                              onPickQuote={(quoteId) => row.original.item && setQuote(row.original.item, quoteId)}
                              paidOpen={paidOpenFor === row.id}
                              onPaidOpenChange={(open) => setPaidOpenFor(open ? row.id : null)}
                              onDelete={() => row.original.item && setPendingDelete(row.original.item)}
                            />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  {showAddRow ? (
                    <tr>
                      <td className={cn("sticky left-0 z-10 h-8 border-b border-border/60 px-3", SOLID)}>
                        <button
                          type="button"
                          tabIndex={-1}
                          disabled={addingTo !== null}
                          onClick={() => addItem(row.original.category)}
                          className="inline-flex items-center gap-1.5 pl-6 text-muted-foreground hover:text-foreground disabled:cursor-wait disabled:hover:text-muted-foreground"
                        >
                          {addingTo === row.original.categoryId ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              Adding…
                            </>
                          ) : (
                            <>
                              <Plus className="size-3.5" />
                              Add item
                            </>
                          )}
                        </button>
                      </td>
                      <td colSpan={COLUMN_IDS.length - 1} className="border-b border-border/60" />
                    </tr>
                  ) : null}
                </GridRowFragment>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_IDS.length} className="px-3 py-10 text-center text-muted-foreground">
                  No items match “{globalFilter}”.
                </td>
              </tr>
            ) : null}
          </tbody>

          <tfoot className="sticky bottom-0 z-20">
            <FooterRow
              label={constructionOnly ? "Construction subtotal" : "Baseline (all categories)"}
              hint={`${data.length} categories`}
              values={{
                budget: formatMoney(visibleTotals.budget),
                quoted: formatMoney(visibleTotals.quoted),
                quoteDelta: <DeltaText value={visibleTotals.quoteDelta} />,
                actual: formatMoney(visibleTotals.actual),
                paid: formatMoney(visibleTotals.paid),
                outstanding: formatMoney(visibleTotals.outstanding),
                remaining: formatMoney(visibleTotals.remaining),
              }}
            />
            <FooterRow
              label="Contingency"
              hint={
                totals.maxDrawdownExVat === null
                  ? `${formatMoney(totals.drawdownExVat)} drawn of ${formatMoney(totals.startingContingencyExVat)}`
                  : `${formatMoney(totals.drawdownExVat)} drawn of ${formatMoney(totals.maxDrawdownExVat)} cap`
              }
              tone={
                totals.contingencyExVat < 0 || (totals.capHeadroomExVat ?? 0) < 0
                  ? "danger"
                  : usedPct >= 0.75
                    ? "warn"
                    : undefined
              }
              values={{ budget: formatMoney(totals.contingencyExVat) }}
            />
            <FooterRow
              label="Envelope"
              hint="Fixed — budget edits move contingency"
              strong
              values={{ budget: formatMoney(totals.envelopeExVat) }}
            />
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Amounts ex VAT. Arrow keys move, Enter or typing edits, Tab/Enter saves, Esc cancels. Actual = invoiced; Paid = money
        out to contractors; Outstanding = invoiced but not yet paid; Remaining Budget = budget − invoiced. Line-item Actual/Paid come from purchase orders filed against the line (Procurement → Budget line) or its picked quote.
      </p>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {formatMoney(pendingDelete?.budgetExVat ?? 0)} budget goes back into contingency. The change is logged and
              can be re-added, but the row itself is removed from the budget.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete item</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function toastInvalid(message: string) {
  toast.error(message)
}

function editorInitialValue(row: BudgetRow, columnId: string): string {
  if (columnId === "name") return row.name
  if (columnId === "budget") return String(row.budgetExVat)
  if (columnId === "vat") {
    return row.item && !row.item.vatRateIsInherited ? String(Math.round(row.vatRate * 1000) / 10) : ""
  }
  return ""
}

function GridRowFragment({ children }: { children: ReactNode }) {
  return <>{children}</>
}

// ---------------------------------------------------------------------------
// Cells

function CellInput({
  initial,
  align,
  onCommit,
  onCancel,
}: {
  initial: string
  align: "left" | "right"
  onCommit: (value: string, moveBy?: [number, number]) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const doneRef = useRef(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    // Typed-to-edit starts with the caret after the character; Enter-to-edit selects all.
    if (initial.length === 1) input.setSelectionRange(1, 1)
    else input.select()
  }, [initial])

  const finish = (moveBy?: [number, number]) => {
    if (doneRef.current) return
    doneRef.current = true
    onCommit(value, moveBy)
  }

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") {
          e.preventDefault()
          finish([e.shiftKey ? -1 : 1, 0])
        } else if (e.key === "Tab") {
          e.preventDefault()
          finish([0, e.shiftKey ? -1 : 1])
        } else if (e.key === "Escape") {
          e.preventDefault()
          doneRef.current = true
          onCancel()
        }
      }}
      className={cn(
        "absolute inset-0 h-full w-full bg-background px-3 outline outline-2 -outline-offset-2 outline-blue-500",
        align === "right" && "text-right",
      )}
    />
  )
}

function DeltaText({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground/60">—</span>
  return (
    <span
      className={cn(
        value > 0.005 && "text-red-600 dark:text-red-400",
        value < -0.005 && "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {formatDelta(value)}
    </span>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground/60">{children}</span>
}

function CellDisplay({
  row,
  columnId,
  canEdit,
  grid,
  quotePickerOpen,
  onQuotePickerChange,
  onPickQuote,
  paidOpen,
  onPaidOpenChange,
  onDelete,
}: {
  row: BudgetTableRow
  columnId: ColumnId
  canEdit: boolean
  grid: BudgetGridData
  quotePickerOpen: boolean
  onQuotePickerChange: (open: boolean) => void
  onPickQuote: (quoteId: string | null) => void
  paidOpen: boolean
  onPaidOpenChange: (open: boolean) => void
  onDelete: () => void
}) {
  const r = row.original
  const isCategory = r.kind === "category"

  switch (columnId) {
    case "name": {
      const lastEdit = isCategory ? r.category.lastEdit : r.item?.lastEdit
      return (
        <div className={cn("flex items-center gap-1.5", !isCategory && "pl-6")}>
          {isCategory ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={row.getToggleExpandedHandler()}
              className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={row.getIsExpanded() ? "Collapse" : "Expand"}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", row.getIsExpanded() && "rotate-90")} />
            </button>
          ) : null}
          <span className="truncate">{r.name}</span>
          {isCategory ? (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-muted px-1 text-[11px] font-normal text-muted-foreground">
              {r.category.items.length}
            </span>
          ) : null}
          {isCategory && r.category.reportingBucket === "soft_cost" ? (
            <span className="rounded border border-border px-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              Soft
            </span>
          ) : null}
          {isCategory && r.category.unassignedQuoteCount > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 text-[11px] font-normal text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  <Hash className="size-3" />
                  {r.category.unassignedQuoteCount} unassigned quote{r.category.unassignedQuoteCount === 1 ? "" : "s"}
                </span>
              </TooltipTrigger>
              <TooltipContent>Pick them as a line item’s live quote in the Quoted column.</TooltipContent>
            </Tooltip>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
            {lastEdit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[11px] font-normal text-muted-foreground">edited</span>
                </TooltipTrigger>
                <TooltipContent>
                  Last edited by {describeActor(lastEdit.actor, lastEdit.source)}, {relativeTime(lastEdit.at)}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {isCategory ? (
              <Link
                href={`/categories/${r.category.id}`}
                tabIndex={-1}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Open ${r.name}`}
              >
                <ArrowUpRight className="size-3.5" />
              </Link>
            ) : canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Row actions"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 className="size-3.5" />
                    Delete item
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </span>
        </div>
      )
    }

    case "budget": {
      if (isCategory && r.category.decisionDeltaExVat) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">
                {formatMoney(r.budgetExVat)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Selected decisions add {formatDelta(r.category.decisionDeltaExVat)} to the forecast (not counted against
              contingency).
            </TooltipContent>
          </Tooltip>
        )
      }
      return <>{formatMoney(r.budgetExVat)}</>
    }

    case "quoted": {
      if (isCategory) return r.quotedExVat === null ? <Muted>—</Muted> : <>{formatMoney(r.quotedExVat)}</>
      const item = r.item as BudgetGridItem
      const quote = item.quoteId ? grid.quotes.find((q) => q.id === item.quoteId) : null
      const options = grid.quotes.filter((q) => q.categoryId === item.categoryId || q.id === item.quoteId)
      const display = quote ? (
        <span className="flex items-center justify-end gap-1.5">
          <span className="truncate text-[11px] text-muted-foreground">{quote.supplierName}</span>
          <span>{formatMoney(quote.amountExVat)}</span>
        </span>
      ) : (
        <Muted>{canEdit && options.length > 0 ? "Pick quote" : "—"}</Muted>
      )
      if (!canEdit) return display
      return (
        <Popover open={quotePickerOpen} onOpenChange={onQuotePickerChange}>
          <PopoverAnchor asChild>
            <button type="button" tabIndex={-1} className="w-full" onClick={() => onQuotePickerChange(true)}>
              {display}
            </button>
          </PopoverAnchor>
          <PopoverContent align="end" className="w-[360px] p-0">
            <Command>
              <CommandInput placeholder="Search quotes…" />
              <CommandList>
                <CommandEmpty>No quotes for this category in procurement.</CommandEmpty>
                <CommandGroup heading={`Live quote for “${item.name}”`}>
                  <CommandItem value="__none" onSelect={() => onPickQuote(null)} className={PICKER_ITEM}>
                    <span className="text-muted-foreground">No quote</span>
                  </CommandItem>
                  {options.map((q) => {
                    const takenBy =
                      q.lineItemId && q.lineItemId !== item.id
                        ? grid.categories.flatMap((c) => c.items).find((i) => i.id === q.lineItemId)?.name
                        : null
                    return (
                      <CommandItem
                        key={q.id}
                        value={`${q.title} ${q.supplierName} ${q.id}`}
                        disabled={Boolean(takenBy)}
                        onSelect={() => onPickQuote(q.id)}
                        className={cn("flex items-start justify-between gap-3", PICKER_ITEM)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{q.title}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {q.supplierName} · {q.status}
                            {q.quoteDate ? ` · ${q.quoteDate}` : ""}
                            {takenBy ? ` · linked to ${takenBy}` : ""}
                          </span>
                        </span>
                        <span className={cn("tabular-nums", q.id === item.quoteId && "font-medium")}>
                          {formatMoney(q.amountExVat)}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )
    }

    case "quoteDelta":
      return <DeltaText value={r.quoteDeltaExVat} />

    case "actual": {
      if (r.actualExVat === null) return <Muted>—</Muted>
      const committed = isCategory ? r.category.committedExVat : r.item?.committedExVat ?? null
      const owed = Math.round(((r.actualExVat ?? 0) - (r.paidExVat ?? 0)) * 100) / 100
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(r.actualExVat === 0 && "text-muted-foreground/60")}>{formatMoney(r.actualExVat)}</span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            <div>Invoiced {formatMoney(r.actualExVat)}</div>
            <div>Committed (POs) {formatMoney(committed)}</div>
            <div>Owed (invoiced − paid) {formatMoney(owed)}</div>
            {isCategory && r.category.unallocatedActualExVat > 0.005 ? (
              <div className="mt-1 opacity-80">
                {formatMoney(r.category.unallocatedActualExVat)} isn’t linked to a line item’s quote yet.
              </div>
            ) : null}
          </TooltipContent>
        </Tooltip>
      )
    }

    case "paid": {
      if (r.paidExVat === null) return <Muted>—</Muted>
      const payees: BudgetPayee[] = isCategory ? r.category.payees : r.item?.payees ?? []
      if (r.paidExVat === 0 || payees.length === 0) {
        return <span className="text-muted-foreground/60">{formatMoney(r.paidExVat)}</span>
      }
      return (
        <Popover open={paidOpen} onOpenChange={onPaidOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
            >
              {formatMoney(r.paidExVat)}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 text-[13px]">
            <div className="border-b border-border px-3 py-2 font-medium">Paid to contractors · {r.name}</div>
            <ul>
              {payees.map((p) => (
                <li key={p.supplierId} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">{p.supplierName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {p.paymentCount} payment{p.paymentCount === 1 ? "" : "s"}
                      {p.lastPaidDate ? ` · last ${p.lastPaidDate}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatMoney(p.paidExVat)}</span>
                </li>
              ))}
            </ul>
            {isCategory && r.category.unallocatedPaidExVat > 0.005 ? (
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                {formatMoney(r.category.unallocatedPaidExVat)} of this isn’t linked to a line item’s quote.
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
      )
    }

    case "outstanding":
      if (r.outstandingExVat === null) return <Muted>—</Muted>
      if (Math.abs(r.outstandingExVat) < 0.005) return <span className="text-muted-foreground/60">£0</span>
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-amber-700 dark:text-amber-400">{formatMoney(r.outstandingExVat)}</span>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            Invoiced {formatMoney(r.actualExVat)} − paid {formatMoney(r.paidExVat ?? 0)}: still owed to contractors
          </TooltipContent>
        </Tooltip>
      )

    case "remaining":
      return (
        <span className={cn(r.remainingExVat < -0.005 && "text-red-600 dark:text-red-400")}>
          {formatMoney(r.remainingExVat)}
        </span>
      )

    case "vat":
      return r.item?.vatRateIsInherited ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground">{formatVat(r.vatRate)}</span>
          </TooltipTrigger>
          <TooltipContent>Inherited from the category</TooltipContent>
        </Tooltip>
      ) : (
        <>{formatVat(r.vatRate)}</>
      )
  }
}

// ---------------------------------------------------------------------------
// Footer + meter

function FooterRow({
  label,
  hint,
  values,
  strong,
  tone,
}: {
  label: string
  hint?: string
  values: Partial<Record<ColumnId, ReactNode>>
  strong?: boolean
  tone?: "warn" | "danger"
}) {
  return (
    <tr className={cn(strong && "font-semibold")}>
      {COLUMN_IDS.map((id, index) => (
        <td
          key={id}
          className={cn(
            "h-9 border-t border-border px-3 tabular-nums",
            SOLID_TINT,
            index > 0 && "border-l border-border/40 text-right",
            index === 0 && "sticky left-0 z-10",
            id === "budget" && tone === "warn" && "text-amber-700 dark:text-amber-400",
            id === "budget" && tone === "danger" && "text-red-600 dark:text-red-400",
          )}
        >
          {index === 0 ? (
            <span className="flex items-baseline gap-2">
              <span className="font-medium">{label}</span>
              {hint ? <span className="truncate text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
            </span>
          ) : (
            values[id] ?? null
          )}
        </td>
      ))}
    </tr>
  )
}

function ContingencyMeter({
  totals,
  usedPct,
}: {
  totals: BudgetGridData["totals"]
  usedPct: number
}) {
  const pct = Math.min(1, usedPct)
  const tone = usedPct >= 1 ? "bg-red-500" : usedPct >= 0.75 ? "bg-amber-500" : "bg-foreground/70"
  return (
    <div className="w-80 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">Contingency used</span>
        <span className="tabular-nums">
          <span className="font-medium">{formatMoney(Math.max(0, totals.drawdownExVat))}</span>
          <span className="text-muted-foreground">
            {" "}
            of {formatMoney(totals.maxDrawdownExVat ?? totals.startingContingencyExVat)}
          </span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>Remaining {formatMoney(totals.contingencyExVat)}</span>
        {totals.contingencyFloorExVat !== null ? <span>Floor {formatMoney(totals.contingencyFloorExVat)}</span> : null}
      </div>
    </div>
  )
}
