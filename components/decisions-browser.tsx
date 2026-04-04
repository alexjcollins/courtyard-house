"use client"

import Link from "next/link"
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Filter, FolderTree, Layers3, Pencil, Plus, Search, Sparkles } from "lucide-react"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  DecisionBrowseMode,
  DecisionWorkspaceCategory,
  DecisionWorkspaceItem,
  DecisionWorkspaceRoom,
  DecisionWorkspaceStatus,
} from "@/lib/decision-workspace"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

type BudgetCategoryOption = {
  id: string
  name: string
}

type DecisionsBrowserProps = {
  rooms: DecisionWorkspaceRoom[]
  decisionCategories: DecisionWorkspaceCategory[]
  budgetCategories: BudgetCategoryOption[]
  items: DecisionWorkspaceItem[]
  canEdit: boolean
  showCosts: boolean
  initialBrowseMode?: DecisionBrowseMode
  categoryFilter?: string
  categoryNameById: Record<string, string>
}

type DecisionFormState = {
  status: DecisionWorkspaceStatus
  selectedName: string
  selectedSource: string
  selectedSourceUrl: string
  selectedCostExVat: string
  selectedNotes: string
}

type RoomFormState = {
  roomId?: string
  name: string
  sortOrder: string
}

type CategoryFormState = {
  categoryId?: string
  name: string
  sortOrder: string
}

type ItemFormState = {
  itemId?: string
  title: string
  categoryId: string
  roomId: string
  decisionCategoryId: string
  typeGroup: string
  typeSection: string
  baselineSpec: string
  baselineBudgetExVat: string
  quantity: string
  unit: string
  decisionStage: "now" | "later"
  priority: "high" | "medium" | "low"
  description: string
  architectNote: string
}

function createInitialFormState(item: DecisionWorkspaceItem): DecisionFormState {
  return {
    status: item.status,
    selectedName: item.selectedName || "",
    selectedSource: item.selectedSource || "",
    selectedSourceUrl: item.selectedSourceUrl || "",
    selectedCostExVat:
      item.selectedCostExVat === null || item.selectedCostExVat === undefined
        ? ""
        : String(item.selectedCostExVat),
    selectedNotes: item.selectedNotes || "",
  }
}

function createRoomFormState(room?: DecisionWorkspaceRoom | null): RoomFormState {
  return {
    roomId: room?.id,
    name: room?.name || "",
    sortOrder: room ? String(room.sortOrder) : "",
  }
}

function createCategoryFormState(
  category?: DecisionWorkspaceCategory | null,
): CategoryFormState {
  return {
    categoryId: category?.id,
    name: category?.name || "",
    sortOrder: category ? String(category.sortOrder) : "",
  }
}

function createItemFormState(
  item: DecisionWorkspaceItem | null,
  fallbackRoomId: string,
  fallbackDecisionCategoryId: string,
  fallbackBudgetCategoryId: string,
): ItemFormState {
  if (!item) {
    return {
      title: "",
      categoryId: fallbackBudgetCategoryId,
      roomId: fallbackRoomId,
      decisionCategoryId: fallbackDecisionCategoryId,
      typeGroup: "",
      typeSection: "",
      baselineSpec: "",
      baselineBudgetExVat: "",
      quantity: "",
      unit: "",
      decisionStage: "now",
      priority: "medium",
      description: "",
      architectNote: "",
    }
  }

  return {
    itemId: item.id,
    title: item.title,
    categoryId: item.categoryId,
    roomId: item.roomId,
    decisionCategoryId: item.decisionCategoryId,
    typeGroup: item.typeGroup,
    typeSection: item.typeSection,
    baselineSpec: item.baselineSpec,
    baselineBudgetExVat: String(item.baselineBudgetExVat),
    quantity: item.quantity === null || item.quantity === undefined ? "" : String(item.quantity),
    unit: item.unit || "",
    decisionStage: item.decisionStage,
    priority: item.priority,
    description: item.description || "",
    architectNote: item.architectNote || "",
  }
}

function sanitizeForSearch(value: string): string {
  return value.trim().toLowerCase()
}

function matchesSearch(item: DecisionWorkspaceItem, searchValue: string): boolean {
  if (!searchValue) {
    return true
  }

  const haystack = [
    item.title,
    item.description,
    item.architectNote,
    item.baselineSpec,
    item.selectedName,
    item.selectedSource,
    item.roomName,
    item.roomGroup,
    item.roomSection,
    item.typeGroup,
    item.typeSection,
    item.categoryName,
    item.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return haystack.includes(searchValue)
}

function getBrowseGroupValue(item: DecisionWorkspaceItem, browseMode: DecisionBrowseMode) {
  return browseMode === "room" ? item.roomGroup : item.typeGroup
}

function getBrowseSectionValue(item: DecisionWorkspaceItem, browseMode: DecisionBrowseMode) {
  return browseMode === "room" ? item.decisionCategoryName : item.typeSection
}

export function DecisionsBrowser({
  rooms,
  decisionCategories,
  budgetCategories,
  items,
  canEdit,
  showCosts,
  initialBrowseMode = "room",
  categoryFilter,
  categoryNameById,
}: DecisionsBrowserProps) {
  const router = useRouter()
  const [browseMode, setBrowseMode] = useState<DecisionBrowseMode>(initialBrowseMode)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [localRooms, setLocalRooms] = useState(rooms)
  const [localDecisionCategories, setLocalDecisionCategories] = useState(decisionCategories)
  const [localItems, setLocalItems] = useState(items)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [formState, setFormState] = useState<DecisionFormState | null>(null)
  const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false)
  const [roomForm, setRoomForm] = useState<RoomFormState>(createRoomFormState())
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(createCategoryFormState())
  const [itemForm, setItemForm] = useState<ItemFormState>(
    createItemFormState(
      null,
      rooms[0]?.id || "",
      decisionCategories[0]?.id || "",
      budgetCategories[0]?.id || "",
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setLocalRooms(rooms)
  }, [rooms])

  useEffect(() => {
    setLocalDecisionCategories(decisionCategories)
  }, [decisionCategories])

  useEffect(() => {
    setLocalItems(items)
  }, [items])

  const filteredByCategory = useMemo(
    () =>
      categoryFilter
        ? localItems.filter((item) => item.categoryId === categoryFilter)
        : localItems,
    [categoryFilter, localItems],
  )

  const globallySearchedItems = useMemo(() => {
    const searchValue = sanitizeForSearch(deferredSearch)
    return filteredByCategory.filter((item) => matchesSearch(item, searchValue))
  }, [deferredSearch, filteredByCategory])

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        itemCount: number
        openCount: number
        selectedCount: number
        totalValueExVat: number
      }
    >()

    for (const item of globallySearchedItems) {
      const groupName = getBrowseGroupValue(item, browseMode)
      const existing = map.get(groupName)

      if (existing) {
        existing.itemCount += 1
        existing.openCount += item.status === "open" ? 1 : 0
        existing.selectedCount += item.status === "selected" ? 1 : 0
        existing.totalValueExVat += item.baselineBudgetExVat
      } else {
        map.set(groupName, {
          name: groupName,
          itemCount: 1,
          openCount: item.status === "open" ? 1 : 0,
          selectedCount: item.status === "selected" ? 1 : 0,
          totalValueExVat: item.baselineBudgetExVat,
        })
      }
    }

    return [...map.values()]
  }, [browseMode, globallySearchedItems])

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroup(null)
      return
    }

    setSelectedGroup((current) =>
      current && groups.some((group) => group.name === current) ? current : groups[0].name,
    )
  }, [groups])

  const sections = useMemo(() => {
    if (!selectedGroup) return []

    const map = new Map<
      string,
      {
        name: string
        itemCount: number
        openCount: number
        selectedCount: number
        totalValueExVat: number
      }
    >()

    for (const item of globallySearchedItems) {
      if (getBrowseGroupValue(item, browseMode) !== selectedGroup) continue

      const sectionName = getBrowseSectionValue(item, browseMode)
      const existing = map.get(sectionName)

      if (existing) {
        existing.itemCount += 1
        existing.openCount += item.status === "open" ? 1 : 0
        existing.selectedCount += item.status === "selected" ? 1 : 0
        existing.totalValueExVat += item.baselineBudgetExVat
      } else {
        map.set(sectionName, {
          name: sectionName,
          itemCount: 1,
          openCount: item.status === "open" ? 1 : 0,
          selectedCount: item.status === "selected" ? 1 : 0,
          totalValueExVat: item.baselineBudgetExVat,
        })
      }
    }

    return [...map.values()]
  }, [browseMode, globallySearchedItems, selectedGroup])

  useEffect(() => {
    if (!sections.length) {
      setSelectedSection(null)
      return
    }

    setSelectedSection((current) =>
      current && sections.some((section) => section.name === current)
        ? current
        : sections[0].name,
    )
  }, [sections])

  const visibleItems = useMemo(() => {
    if (!selectedGroup || !selectedSection) {
      return []
    }

    return globallySearchedItems.filter((item) => {
      if (getBrowseGroupValue(item, browseMode) !== selectedGroup) return false
      if (getBrowseSectionValue(item, browseMode) !== selectedSection) return false
      return true
    })
  }, [browseMode, globallySearchedItems, selectedGroup, selectedSection])

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedItemId(null)
      return
    }

    setSelectedItemId((current) =>
      current && visibleItems.some((item) => item.id === current) ? current : visibleItems[0].id,
    )
  }, [visibleItems])

  const selectedItem = useMemo(
    () => globallySearchedItems.find((item) => item.id === selectedItemId) || null,
    [globallySearchedItems, selectedItemId],
  )

  const selectedRoom = useMemo(
    () => localRooms.find((room) => room.name === selectedGroup) || null,
    [localRooms, selectedGroup],
  )

  const selectedDecisionCategory = useMemo(
    () => localDecisionCategories.find((category) => category.name === selectedSection) || null,
    [localDecisionCategories, selectedSection],
  )

  useEffect(() => {
    setFormState(selectedItem ? createInitialFormState(selectedItem) : null)
  }, [selectedItem])

  function withRefresh(callback?: () => void) {
    callback?.()
    router.refresh()
  }

  function openCreateRoomDialog() {
    setRoomForm(createRoomFormState())
    setIsRoomDialogOpen(true)
  }

  function openEditRoomDialog() {
    setRoomForm(createRoomFormState(selectedRoom))
    setIsRoomDialogOpen(true)
  }

  function openCreateCategoryDialog() {
    setCategoryForm(createCategoryFormState())
    setIsCategoryDialogOpen(true)
  }

  function openEditCategoryDialog() {
    setCategoryForm(createCategoryFormState(selectedDecisionCategory))
    setIsCategoryDialogOpen(true)
  }

  function openCreateItemDialog() {
    setItemForm(
      createItemFormState(
        null,
        selectedRoom?.id || localRooms[0]?.id || "",
        selectedDecisionCategory?.id || localDecisionCategories[0]?.id || "",
        categoryFilter || budgetCategories[0]?.id || "",
      ),
    )
    setIsItemDialogOpen(true)
  }

  function openEditItemDialog() {
    if (!selectedItem) return
    setItemForm(
      createItemFormState(
        selectedItem,
        selectedItem.roomId,
        selectedItem.decisionCategoryId,
        selectedItem.categoryId,
      ),
    )
    setIsItemDialogOpen(true)
  }

  async function saveDecisionSelection() {
    if (!selectedItem || !formState) return

    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch("/api/decisions/selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: selectedItem.id,
            status: formState.status,
            selectedName: formState.selectedName,
            selectedSource: formState.selectedSource,
            selectedSourceUrl: formState.selectedSourceUrl,
            selectedCostExVat:
              formState.selectedCostExVat.trim() === ""
                ? null
                : Number(formState.selectedCostExVat),
            selectedNotes: formState.selectedNotes,
          }),
        })

        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Could not update decision item.")
        }

        setLocalItems((current) =>
          current.map((item) => (item.id === payload.item.id ? { ...item, ...payload.item } : item)),
        )
        withRefresh()
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : "Could not update decision item.",
        )
      }
    })
  }

  async function saveRoom() {
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch("/api/decisions/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: roomForm.roomId,
            name: roomForm.name,
            sortOrder: roomForm.sortOrder.trim() === "" ? null : Number(roomForm.sortOrder),
          }),
        })

        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Could not save room.")
        }

        setLocalRooms((current) => {
          const exists = current.some((room) => room.id === payload.room.id)
          const next = exists
            ? current.map((room) => (room.id === payload.room.id ? payload.room : room))
            : [...current, payload.room]
          return next.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        })
        setLocalItems((current) =>
          current.map((item) =>
            item.roomId === payload.room.id
              ? { ...item, roomGroup: payload.room.name, roomName: payload.room.name }
              : item,
          ),
        )
        setIsRoomDialogOpen(false)
        withRefresh()
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save room.")
      }
    })
  }

  async function saveCategory() {
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch("/api/decisions/category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: categoryForm.categoryId,
            name: categoryForm.name,
            sortOrder:
              categoryForm.sortOrder.trim() === "" ? null : Number(categoryForm.sortOrder),
          }),
        })

        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Could not save category.")
        }

        setLocalDecisionCategories((current) => {
          const exists = current.some((category) => category.id === payload.category.id)
          const next = exists
            ? current.map((category) =>
                category.id === payload.category.id ? payload.category : category,
              )
            : [...current, payload.category]
          return next.sort(
            (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
          )
        })
        setLocalItems((current) =>
          current.map((item) =>
            item.decisionCategoryId === payload.category.id
              ? {
                  ...item,
                  decisionCategoryName: payload.category.name,
                  roomSection: payload.category.name,
                }
              : item,
          ),
        )
        setIsCategoryDialogOpen(false)
        withRefresh()
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Could not save category.")
      }
    })
  }

  async function saveItem() {
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch("/api/decisions/item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: itemForm.itemId,
            title: itemForm.title,
            categoryId: itemForm.categoryId,
            roomId: itemForm.roomId,
            decisionCategoryId: itemForm.decisionCategoryId,
            typeGroup: itemForm.typeGroup,
            typeSection: itemForm.typeSection,
            baselineSpec: itemForm.baselineSpec,
            baselineBudgetExVat: Number(itemForm.baselineBudgetExVat || 0),
            quantity: itemForm.quantity.trim() === "" ? null : Number(itemForm.quantity),
            unit: itemForm.unit,
            decisionStage: itemForm.decisionStage,
            priority: itemForm.priority,
            description: itemForm.description,
            architectNote: itemForm.architectNote,
          }),
        })

        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Could not save decision item.")
        }

        setLocalItems((current) => {
          const exists = current.some((item) => item.id === payload.item.id)
          const next = exists
            ? current.map((item) => (item.id === payload.item.id ? payload.item : item))
            : [...current, payload.item]
          return next
        })
        setSelectedItemId(payload.item.id)
        setIsItemDialogOpen(false)
        withRefresh()
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : "Could not save decision item.",
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBrowseMode("room")}
            className={cn(
              "inline-flex h-10 items-center gap-2 border border-border px-4 text-sm transition",
              browseMode === "room"
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <FolderTree className="size-4" />
            Browse by room
          </button>
          <button
            type="button"
            onClick={() => setBrowseMode("type")}
            className={cn(
              "inline-flex h-10 items-center gap-2 border border-border px-4 text-sm transition",
              browseMode === "type"
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers3 className="size-4" />
            Browse by type
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {categoryFilter ? (
            <div className="inline-flex h-10 items-center gap-2 border border-border px-4 text-sm text-muted-foreground">
              <Filter className="size-4" />
              Filtered to {categoryNameById[categoryFilter] || categoryFilter}
              <Link href="/decisions" className="text-foreground transition hover:text-[color:var(--accent)]">
                Clear
              </Link>
            </div>
          ) : null}
          <div className="relative min-w-[280px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all decisions"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={openCreateRoomDialog}>
            <Plus className="size-4" />
            Add room
          </Button>
          <Button type="button" variant="outline" onClick={openCreateCategoryDialog}>
            <Plus className="size-4" />
            Add category
          </Button>
          <Button type="button" variant="outline" onClick={openCreateItemDialog}>
            <Plus className="size-4" />
            Add item
          </Button>
          {selectedRoom ? (
            <Button type="button" variant="outline" onClick={openEditRoomDialog}>
              <Pencil className="size-4" />
              Edit room
            </Button>
          ) : null}
          {browseMode === "room" && selectedDecisionCategory ? (
            <Button type="button" variant="outline" onClick={openEditCategoryDialog}>
              <Pencil className="size-4" />
              Edit category
            </Button>
          ) : null}
          {selectedItem ? (
            <Button type="button" variant="outline" onClick={openEditItemDialog}>
              <Pencil className="size-4" />
              Edit item
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

      <div className="h-[calc(100vh-270px)] min-h-[720px] border border-border/70 bg-card/70">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={14} minSize={11}>
            <BrowserColumn
              eyebrow={browseMode === "room" ? "Rooms" : "Types"}
              title={browseMode === "room" ? "Decision scope" : "Systems"}
              items={groups.map((group) => ({
                id: group.name,
                title: group.name,
                value: formatCurrency(group.totalValueExVat),
                meta: `${group.itemCount} items`,
                badge:
                  group.openCount > 0 ? `${group.openCount} open` : `${group.selectedCount} selected`,
              }))}
              selectedId={selectedGroup}
              onSelect={setSelectedGroup}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={16} minSize={13}>
            <BrowserColumn
              eyebrow="Category"
              title={selectedGroup || "Choose a scope"}
              items={sections.map((section) => ({
                id: section.name,
                title: section.name,
                value: formatCurrency(section.totalValueExVat),
                meta: `${section.itemCount} items`,
                badge:
                  section.openCount > 0
                    ? `${section.openCount} open`
                    : `${section.selectedCount} selected`,
              }))}
              selectedId={selectedSection}
              onSelect={setSelectedSection}
              emptyMessage="No categories in this view."
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={18} minSize={14}>
            <BrowserColumn
              eyebrow="Items"
              title={selectedSection || "Choose a category"}
              items={visibleItems.map((item) => ({
                id: item.id,
                title: item.title,
                value: showCosts ? formatCurrency(item.baselineBudgetExVat) : undefined,
                meta:
                  item.status === "selected" && item.selectedName
                    ? item.selectedName
                    : item.baselineSpec,
                badge:
                  item.status === "selected"
                    ? "Selected"
                    : item.status === "on_hold"
                      ? "On hold"
                      : "Open",
              }))}
              selectedId={selectedItemId}
              onSelect={setSelectedItemId}
              emptyMessage="No items match this filter."
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={52} minSize={36}>
            <ScrollArea className="h-full">
              <div className="space-y-6 p-5">
                {selectedItem && formState ? (
                  <>
                    <div className="space-y-3 border-b border-border/70 pb-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            {selectedItem.code}
                          </p>
                          <h3 className="mt-2 text-3xl font-medium tracking-tight text-foreground">
                            {selectedItem.title}
                          </h3>
                        </div>
                        <StatusBadge
                          status={
                            formState.status === "selected"
                              ? "accepted"
                              : formState.status === "on_hold"
                                ? "planned"
                                : "todo"
                          }
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <DetailValue
                          label="Build budget allowance"
                          value={formatCurrency(selectedItem.baselineBudgetExVat)}
                        />
                        <DetailValue
                          label="Budget category"
                          value={categoryNameById[selectedItem.categoryId] || selectedItem.categoryId}
                        />
                        <DetailValue label="Room" value={selectedItem.roomName || selectedItem.roomGroup} />
                        <DetailValue label="Decision category" value={selectedItem.decisionCategoryName} />
                        <DetailValue
                          label="Decision stage"
                          value={
                            selectedItem.decisionStage === "now"
                              ? "Need to decide now"
                              : "Can follow later"
                          }
                        />
                        {showCosts ? (
                          <DetailValue
                            label="Current selected cost"
                            value={
                              formState.selectedCostExVat.trim() !== ""
                                ? formatCurrency(Number(formState.selectedCostExVat))
                                : "No cost selected"
                            }
                          />
                        ) : null}
                        {showCosts ? (
                          <DetailValue
                            label="Current delta"
                            value={
                              formState.selectedCostExVat.trim() !== ""
                                ? formatCurrency(
                                    Number(formState.selectedCostExVat) -
                                      selectedItem.baselineBudgetExVat,
                                  )
                                : formatCurrency(0)
                            }
                          />
                        ) : null}
                      </div>

                      <div className="border border-border/70 bg-secondary/30 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Baseline assumption
                        </p>
                        <p className="mt-2 text-sm leading-6 text-foreground">
                          {selectedItem.baselineSpec}
                        </p>
                      </div>

                      {selectedItem.description ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Description
                          </p>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            {selectedItem.description}
                          </p>
                        </div>
                      ) : null}

                      {selectedItem.architectNote ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Architect coordination note
                          </p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {selectedItem.architectNote}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            Selection detail
                          </p>
                          <h4 className="mt-2 text-2xl font-medium tracking-tight">
                            Current choice
                          </h4>
                        </div>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFormState({
                                status: "selected",
                                selectedName: "Baseline allowance",
                                selectedSource: "Baseline allowance",
                                selectedSourceUrl: "",
                                selectedCostExVat: String(selectedItem.baselineBudgetExVat),
                                selectedNotes: "Carrying the current baseline budget allowance.",
                              })
                            }
                            className="inline-flex h-10 items-center gap-2 border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
                          >
                            <Sparkles className="size-4" />
                            Use baseline
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Status
                          </label>
                          {canEdit ? (
                            <Select
                              value={formState.status}
                              onValueChange={(value) =>
                                setFormState((current) =>
                                  current
                                    ? { ...current, status: value as DecisionWorkspaceStatus }
                                    : current,
                                )
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="selected">Selected</SelectItem>
                                <SelectItem value="on_hold">On hold</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="border border-border/70 px-3 py-2 text-sm text-foreground">
                              {formState.status}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Selected cost
                          </label>
                          <Input
                            value={formState.selectedCostExVat}
                            onChange={(event) =>
                              setFormState((current) =>
                                current
                                  ? { ...current, selectedCostExVat: event.target.value }
                                  : current,
                              )
                            }
                            inputMode="decimal"
                            placeholder={String(selectedItem.baselineBudgetExVat)}
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Selected item / product
                          </label>
                          <Input
                            value={formState.selectedName}
                            onChange={(event) =>
                              setFormState((current) =>
                                current ? { ...current, selectedName: event.target.value } : current,
                              )
                            }
                            placeholder={selectedItem.baselineSpec}
                            disabled={!canEdit}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Supplier / source
                          </label>
                          <Input
                            value={formState.selectedSource}
                            onChange={(event) =>
                              setFormState((current) =>
                                current
                                  ? { ...current, selectedSource: event.target.value }
                                  : current,
                              )
                            }
                            placeholder="Supplier, retailer, or contact"
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Source URL
                        </label>
                        <Input
                          value={formState.selectedSourceUrl}
                          onChange={(event) =>
                            setFormState((current) =>
                              current
                                ? { ...current, selectedSourceUrl: event.target.value }
                                : current,
                            )
                          }
                          placeholder="https://"
                          disabled={!canEdit}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Selection notes
                        </label>
                        <Textarea
                          value={formState.selectedNotes}
                          onChange={(event) =>
                            setFormState((current) =>
                              current
                                ? { ...current, selectedNotes: event.target.value }
                                : current,
                            )
                          }
                          placeholder="Why this was chosen, open questions, lead time, caveats."
                          disabled={!canEdit}
                          className="min-h-32"
                        />
                      </div>

                      {canEdit ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
                          <button
                            type="button"
                            onClick={() => setFormState(createInitialFormState(selectedItem))}
                            className="inline-flex h-10 items-center border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
                            disabled={isPending}
                          >
                            Reset changes
                          </button>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setFormState({
                                  status: "open",
                                  selectedName: "",
                                  selectedSource: "",
                                  selectedSourceUrl: "",
                                  selectedCostExVat: "",
                                  selectedNotes: "",
                                })
                              }
                              className="inline-flex h-10 items-center border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
                              disabled={isPending}
                            >
                              Clear selection
                            </button>
                            <Button
                              type="button"
                              onClick={() => void saveDecisionSelection()}
                              disabled={isPending}
                            >
                              {isPending ? "Saving..." : "Save decision"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full min-h-[520px] items-center justify-center text-sm text-muted-foreground">
                    Select an item to view its detail.
                  </div>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <Dialog open={isRoomDialogOpen} onOpenChange={setIsRoomDialogOpen}>
        <DialogContent className="max-w-2xl border-border/70">
          <DialogHeader>
            <DialogTitle>{roomForm.roomId ? "Edit room" : "Add room"}</DialogTitle>
            <DialogDescription>
              Rooms drive the first column in the Finder-style decisions browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Room name
              </label>
              <Input
                value={roomForm.name}
                onChange={(event) =>
                  setRoomForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Powder room"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Sort order
              </label>
              <Input
                value={roomForm.sortOrder}
                onChange={(event) =>
                  setRoomForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
                inputMode="numeric"
                placeholder="10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRoomDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveRoom()} disabled={isPending}>
              {isPending ? "Saving..." : roomForm.roomId ? "Save room" : "Create room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-2xl border-border/70">
          <DialogHeader>
            <DialogTitle>{categoryForm.categoryId ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              Categories drive the second column when browsing decisions by room.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Category name
              </label>
              <Input
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Fixtures & fittings"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Sort order
              </label>
              <Input
                value={categoryForm.sortOrder}
                onChange={(event) =>
                  setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
                inputMode="numeric"
                placeholder="10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCategoryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveCategory()} disabled={isPending}>
              {isPending ? "Saving..." : categoryForm.categoryId ? "Save category" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="w-[calc(100vw-80px)] max-w-[1200px] border-border/70 sm:max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>{itemForm.itemId ? "Edit item" : "Add item"}</DialogTitle>
            <DialogDescription>
              Create or update the core decision items that feed the workspace and budget rollup.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Title
              </label>
              <Input
                value={itemForm.title}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Budget category
              </label>
              <Select
                value={itemForm.categoryId}
                onValueChange={(value) =>
                  setItemForm((current) => ({ ...current, categoryId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {budgetCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Room
              </label>
              <Select
                value={itemForm.roomId}
                onValueChange={(value) => setItemForm((current) => ({ ...current, roomId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {localRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Decision category
              </label>
              <Select
                value={itemForm.decisionCategoryId}
                onValueChange={(value) =>
                  setItemForm((current) => ({ ...current, decisionCategoryId: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {localDecisionCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Type group
              </label>
              <Input
                value={itemForm.typeGroup}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, typeGroup: event.target.value }))
                }
                placeholder="Bathrooms & sanitaryware"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Type section
              </label>
              <Input
                value={itemForm.typeSection}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, typeSection: event.target.value }))
                }
                placeholder="Sanitaryware"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Baseline assumption
              </label>
              <Textarea
                value={itemForm.baselineSpec}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, baselineSpec: event.target.value }))
                }
                className="min-h-24"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Baseline budget
              </label>
              <Input
                value={itemForm.baselineBudgetExVat}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    baselineBudgetExVat: event.target.value,
                  }))
                }
                inputMode="decimal"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Quantity
                </label>
                <Input
                  value={itemForm.quantity}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Unit
                </label>
                <Input
                  value={itemForm.unit}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, unit: event.target.value }))
                  }
                  placeholder="item, sqm, doors"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Decision stage
              </label>
              <Select
                value={itemForm.decisionStage}
                onValueChange={(value) =>
                  setItemForm((current) => ({
                    ...current,
                    decisionStage: value as "now" | "later",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Need to decide now</SelectItem>
                  <SelectItem value="later">Can follow later</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Priority
              </label>
              <Select
                value={itemForm.priority}
                onValueChange={(value) =>
                  setItemForm((current) => ({
                    ...current,
                    priority: value as "high" | "medium" | "low",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Description
              </label>
              <Textarea
                value={itemForm.description}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, description: event.target.value }))
                }
                className="min-h-24"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Architect coordination note
              </label>
              <Textarea
                value={itemForm.architectNote}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, architectNote: event.target.value }))
                }
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveItem()} disabled={isPending}>
              {isPending ? "Saving..." : itemForm.itemId ? "Save item" : "Create item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type BrowserColumnItem = {
  id: string
  title: string
  value?: string
  meta?: string
  badge?: string
}

type BrowserColumnProps = {
  eyebrow: string
  title: string
  items: BrowserColumnItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyMessage?: string
}

function BrowserColumn({
  eyebrow,
  title,
  items,
  selectedId,
  onSelect,
  emptyMessage = "Nothing to show.",
}: BrowserColumnProps) {
  return (
    <div className="flex h-full flex-col border-r border-border/70 last:border-r-0">
      <div className="border-b border-border/70 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-lg font-medium tracking-tight text-foreground">{title}</h3>
      </div>

      <ScrollArea className="h-full">
        <div className="space-y-px p-1.5">
          {items.length === 0 ? (
            <p className="px-2.5 py-4 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "block w-full border border-transparent px-2.5 py-2.5 text-left transition",
                  selectedId === item.id
                    ? "bg-foreground text-background"
                    : "bg-transparent hover:bg-secondary/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium leading-5">{item.title}</p>
                  {item.value ? (
                    <span
                      className={cn(
                        "shrink-0 text-xs leading-5",
                        selectedId === item.id ? "text-background/80" : "text-muted-foreground",
                      )}
                    >
                      {item.value}
                    </span>
                  ) : null}
                </div>
                {(item.meta || item.badge) ? (
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                    <span
                      className={cn(
                        selectedId === item.id ? "text-background/70" : "text-muted-foreground",
                      )}
                    >
                      {item.meta}
                    </span>
                    {item.badge ? (
                      <span
                        className={cn(
                          selectedId === item.id ? "text-background/70" : "text-muted-foreground",
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  )
}
