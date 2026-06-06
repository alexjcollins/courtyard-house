"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MousePointer2, Hand, Plus, Pencil, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type PlanDecisionLite = {
  id: string
  code: string
  title: string
  roomName: string | null
  decisionCategoryName: string | null
  status: "open" | "selected" | "on_hold"
  selectedName: string | null
  imageUrl: string | null
}

export type PlanLayerClient = {
  id: string
  name: string
  sortOrder: number
}

export type PlanZoneClient = {
  id: string
  layerId: string | null
  name: string
  color: string
  description: string | null
  squares: number[]
  decisionItemIds: string[]
  sortOrder: number
}

type PlanWorkspaceProps = {
  canEdit: boolean
  gridCols: number
  gridRows: number
  layers: PlanLayerClient[]
  zones: PlanZoneClient[]
  decisions: PlanDecisionLite[]
  planImageUrl: string | null
}

const CELL = 30 // px per grid square in stage (natural) coordinates
const MIN_SCALE = 0.05
const MAX_SCALE = 5
const DRAG_THRESHOLD = 4

const ZONE_PALETTE = [
  "#ff4800",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#db2777",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
]

type View = { scale: number; tx: number; ty: number }
type Tool = "select" | "pan"

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const STATUS_LABEL: Record<PlanDecisionLite["status"], string> = {
  open: "Open",
  selected: "Selected",
  on_hold: "On hold",
}

export function PlanWorkspace({
  canEdit,
  gridCols,
  gridRows,
  layers,
  zones,
  decisions,
  planImageUrl,
}: PlanWorkspaceProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const stageW = gridCols * CELL
  const stageH = gridRows * CELL

  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const [view, setViewState] = useState<View>({ scale: 1, tx: 0, ty: 0 })

  const setView = useCallback((next: View | ((prev: View) => View)) => {
    setViewState((prev) => {
      const value = typeof next === "function" ? next(prev) : next
      viewRef.current = value
      return value
    })
  }, [])

  const [tool, setTool] = useState<Tool>(canEdit ? "select" : "pan")
  const [draft, setDraft] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<number[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  // When set, the Select tool edits this existing zone's footprint live on the canvas.
  const [squareEditZoneId, setSquareEditZoneId] = useState<string | null>(null)
  // True while the remove modifier (Alt/Option) is held — Select then subtracts squares.
  const [removeMode, setRemoveMode] = useState(false)
  const [activeLayerId, setActiveLayerId] = useState<string | null>(
    layers[0]?.id ?? null,
  )

  // Keep the active layer valid as layers change (e.g. after deletes/creates).
  useEffect(() => {
    if (activeLayerId && layers.some((layer) => layer.id === activeLayerId)) return
    setActiveLayerId(layers[0]?.id ?? null)
  }, [layers, activeLayerId])

  // Switching plans clears the current selection/draft and any square-edit session.
  useEffect(() => {
    setSelectedZoneId(null)
    setSquareEditZoneId(null)
    setDraft(new Set())
    setPreview([])
  }, [activeLayerId])

  // Track the remove modifier (Alt/Option) for cursor + preview hints.
  useEffect(() => {
    if (!canEdit) return
    const sync = (event: KeyboardEvent) => setRemoveMode(event.altKey)
    const clear = () => setRemoveMode(false)
    window.addEventListener("keydown", sync)
    window.addEventListener("keyup", sync)
    window.addEventListener("blur", clear)
    return () => {
      window.removeEventListener("keydown", sync)
      window.removeEventListener("keyup", sync)
      window.removeEventListener("blur", clear)
    }
  }, [canEdit])

  const dragRef = useRef<
    | null
    | {
        startX: number
        startY: number
        lastX: number
        lastY: number
        moved: boolean
        kind: "pan" | "select"
        anchorCell: number | null
        remove: boolean
      }
  >(null)

  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) ?? null,
    [layers, activeLayerId],
  )

  const layerZones = useMemo(
    () => zones.filter((zone) => zone.layerId === activeLayerId),
    [zones, activeLayerId],
  )

  const decisionsById = useMemo(() => {
    const map = new Map<string, PlanDecisionLite>()
    for (const decision of decisions) map.set(decision.id, decision)
    return map
  }, [decisions])

  const zoneById = useMemo(() => {
    const map = new Map<string, PlanZoneClient>()
    for (const zone of zones) map.set(zone.id, zone)
    return map
  }, [zones])

  const cellToZone = useMemo(() => {
    const map = new Map<number, PlanZoneClient>()
    for (const zone of layerZones) {
      for (const cell of zone.squares) map.set(cell, zone)
    }
    return map
  }, [layerZones])

  const selectedZone = useMemo(
    () => layerZones.find((zone) => zone.id === selectedZoneId) ?? null,
    [layerZones, selectedZoneId],
  )

  const squareEditZone = useMemo(
    () => (squareEditZoneId ? zoneById.get(squareEditZoneId) ?? null : null),
    [squareEditZoneId, zoneById],
  )

  // Fit the plan to the viewport on first mount.
  const fitView = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    const scale = Math.min(vp.clientWidth / stageW, vp.clientHeight / stageH) * 0.95
    setView({
      scale,
      tx: (vp.clientWidth - stageW * scale) / 2,
      ty: (vp.clientHeight - stageH * scale) / 2,
    })
  }, [setView, stageW, stageH])

  useEffect(() => {
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wheel zoom (non-passive so we can preventDefault page scroll).
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = vp.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const factor = Math.exp(-event.deltaY * 0.0015)
      setView((prev) => {
        const scale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE)
        const k = scale / prev.scale
        return {
          scale,
          tx: px - k * (px - prev.tx),
          ty: py - k * (py - prev.ty),
        }
      })
    }

    vp.addEventListener("wheel", onWheel, { passive: false })
    return () => vp.removeEventListener("wheel", onWheel)
  }, [setView])

  const cellFromEvent = useCallback(
    (clientX: number, clientY: number): number | null => {
      const stage = stageRef.current
      if (!stage) return null
      const rect = stage.getBoundingClientRect()
      const scale = viewRef.current.scale
      const x = (clientX - rect.left) / scale
      const y = (clientY - rect.top) / scale
      const col = Math.floor(x / CELL)
      const row = Math.floor(y / CELL)
      if (col < 0 || row < 0 || col >= gridCols || row >= gridRows) return null
      return row * gridCols + col
    },
    [gridCols, gridRows],
  )

  const rectCells = useCallback(
    (a: number, b: number): number[] => {
      const ac = a % gridCols
      const ar = Math.floor(a / gridCols)
      const bc = b % gridCols
      const br = Math.floor(b / gridCols)
      const cells: number[] = []
      for (let r = Math.min(ar, br); r <= Math.max(ar, br); r++) {
        for (let c = Math.min(ac, bc); c <= Math.max(ac, bc); c++) {
          cells.push(r * gridCols + c)
        }
      }
      return cells
    },
    [gridCols],
  )

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const selecting = canEdit && tool === "select" && Boolean(activeLayerId)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      kind: selecting ? "select" : "pan",
      anchorCell: selecting ? cellFromEvent(event.clientX, event.clientY) : null,
      remove: event.altKey,
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return

    if (!drag.moved) {
      const dist = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
      if (dist > DRAG_THRESHOLD) drag.moved = true
    }

    if (drag.kind === "pan") {
      const dx = event.clientX - drag.lastX
      const dy = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      setView((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
      return
    }

    // select drag → rubber-band rectangle preview
    if (drag.anchorCell != null && drag.moved) {
      const current = cellFromEvent(event.clientX, event.clientY)
      if (current != null) setPreview(rectCells(drag.anchorCell, current))
    }
  }

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return

    if (drag.kind === "select") {
      if (!drag.moved && drag.anchorCell != null) {
        // Click: remove if the modifier is held, otherwise toggle.
        setDraft((prev) => {
          const next = new Set(prev)
          if (drag.remove) next.delete(drag.anchorCell!)
          else if (next.has(drag.anchorCell!)) next.delete(drag.anchorCell!)
          else next.add(drag.anchorCell!)
          return next
        })
      } else if (preview.length > 0) {
        // Drag rectangle: subtract when removing, add otherwise.
        setDraft((prev) => {
          const next = new Set(prev)
          for (const cell of preview) {
            if (drag.remove) next.delete(cell)
            else next.add(cell)
          }
          return next
        })
      }
      setPreview([])
      return
    }

    // pan click (no movement) → select the zone under the cursor
    if (!drag.moved) {
      const cell = cellFromEvent(event.clientX, event.clientY)
      const zone = cell != null ? cellToZone.get(cell) : undefined
      setSelectedZoneId(zone ? zone.id : null)
    }
  }

  const focusZone = useCallback(
    (zone: PlanZoneClient) => {
      const vp = viewportRef.current
      if (!vp || zone.squares.length === 0) return
      let minC = gridCols
      let minR = gridRows
      let maxC = 0
      let maxR = 0
      for (const cell of zone.squares) {
        const c = cell % gridCols
        const r = Math.floor(cell / gridCols)
        minC = Math.min(minC, c)
        minR = Math.min(minR, r)
        maxC = Math.max(maxC, c)
        maxR = Math.max(maxR, r)
      }
      const boxW = (maxC - minC + 1) * CELL
      const boxH = (maxR - minR + 1) * CELL
      const pad = 1.4
      const scale = clamp(
        Math.min(vp.clientWidth / (boxW * pad), vp.clientHeight / (boxH * pad)),
        MIN_SCALE,
        MAX_SCALE,
      )
      const centerX = (minC * CELL + boxW / 2) * scale
      const centerY = (minR * CELL + boxH / 2) * scale
      setView({
        scale,
        tx: vp.clientWidth / 2 - centerX,
        ty: vp.clientHeight / 2 - centerY,
      })
    },
    [gridCols, gridRows, setView],
  )

  const refresh = () => startTransition(() => router.refresh())

  // ---- Zone editor dialog state ----
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorZoneId, setEditorZoneId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    color: ZONE_PALETTE[0],
    description: "",
    decisionItemIds: [] as string[],
  })
  const [decisionSearch, setDecisionSearch] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openNewZone = () => {
    if (!activeLayerId) {
      setError("Create a plan first.")
      return
    }
    if (draft.size === 0) {
      setError("Select one or more squares first.")
      return
    }
    setError(null)
    setEditorZoneId(null)
    setForm({
      name: "",
      color: ZONE_PALETTE[layerZones.length % ZONE_PALETTE.length],
      description: "",
      decisionItemIds: [],
    })
    setDecisionSearch("")
    setEditorOpen(true)
  }

  // Opens the metadata dialog only — does NOT touch the zone's footprint.
  const openZoneDetails = (zone: PlanZoneClient) => {
    setError(null)
    setSelectedZoneId(zone.id)
    setEditorZoneId(zone.id)
    setForm({
      name: zone.name,
      color: zone.color,
      description: zone.description ?? "",
      decisionItemIds: [...zone.decisionItemIds],
    })
    setDecisionSearch("")
    setEditorOpen(true)
  }

  // Loads a zone's squares onto the canvas for live add/remove editing.
  const enterSquareEdit = (zone: PlanZoneClient) => {
    setError(null)
    setSelectedZoneId(zone.id)
    setSquareEditZoneId(zone.id)
    setDraft(new Set(zone.squares))
    setPreview([])
    setTool("select")
  }

  const cancelSquareEdit = () => {
    setSquareEditZoneId(null)
    setDraft(new Set())
    setPreview([])
  }

  const saveSquareEdit = async () => {
    if (!squareEditZoneId || !activeLayerId) return
    const zone = zoneById.get(squareEditZoneId)
    if (!zone) return
    if (draft.size === 0) {
      setError("A zone needs at least one square. Use Delete to remove it entirely.")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zoneId: zone.id,
          layerId: activeLayerId,
          name: zone.name,
          color: zone.color,
          description: zone.description,
          squares: [...draft],
          decisionItemIds: zone.decisionItemIds,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || "Could not update the zone.")
        return
      }
      setSquareEditZoneId(null)
      setDraft(new Set())
      refresh()
    } catch {
      setError("Something went wrong while saving.")
    } finally {
      setIsSaving(false)
    }
  }

  // Squares persisted by the details dialog: a new zone uses the canvas draft, an
  // existing zone keeps its current footprint (edited separately via square-edit mode).
  const editorSquares = useMemo(
    () =>
      editorZoneId ? (zoneById.get(editorZoneId)?.squares ?? []) : [...draft],
    [editorZoneId, zoneById, draft],
  )

  const saveZone = async () => {
    if (!activeLayerId) {
      setError("Create a plan first.")
      return
    }
    if (!form.name.trim()) {
      setError("A zone name is required.")
      return
    }
    if (editorSquares.length === 0) {
      setError("Select one or more squares for this zone.")
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zoneId: editorZoneId,
          layerId: activeLayerId,
          name: form.name,
          color: form.color,
          description: form.description,
          squares: editorSquares,
          decisionItemIds: form.decisionItemIds,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || "Could not save the zone.")
        return
      }
      setEditorOpen(false)
      if (!editorZoneId) setDraft(new Set())
      refresh()
    } catch {
      setError("Something went wrong while saving.")
    } finally {
      setIsSaving(false)
    }
  }

  const deleteZone = async () => {
    if (!editorZoneId) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/plan/zone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteZoneId: editorZoneId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || "Could not delete the zone.")
        return
      }
      setEditorOpen(false)
      setDraft(new Set())
      setSelectedZoneId(null)
      refresh()
    } catch {
      setError("Something went wrong while deleting.")
    } finally {
      setIsSaving(false)
    }
  }

  // ---- Plan (layer) editor dialog ----
  const [layerDialogOpen, setLayerDialogOpen] = useState(false)
  const [layerEditorId, setLayerEditorId] = useState<string | null>(null)
  const [layerName, setLayerName] = useState("")
  const [layerError, setLayerError] = useState<string | null>(null)
  const [isSavingLayer, setIsSavingLayer] = useState(false)

  const openNewLayer = () => {
    setLayerEditorId(null)
    setLayerName("")
    setLayerError(null)
    setLayerDialogOpen(true)
  }

  const openRenameLayer = () => {
    if (!activeLayer) return
    setLayerEditorId(activeLayer.id)
    setLayerName(activeLayer.name)
    setLayerError(null)
    setLayerDialogOpen(true)
  }

  const saveLayer = async () => {
    if (!layerName.trim()) {
      setLayerError("A plan name is required.")
      return
    }
    setIsSavingLayer(true)
    setLayerError(null)
    try {
      const response = await fetch("/api/plan/layer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layerId: layerEditorId, name: layerName }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setLayerError(payload.error || "Could not save the plan.")
        return
      }
      if (!layerEditorId && payload.layer?.id) {
        setActiveLayerId(payload.layer.id)
      }
      setLayerDialogOpen(false)
      refresh()
    } catch {
      setLayerError("Something went wrong while saving.")
    } finally {
      setIsSavingLayer(false)
    }
  }

  const deleteLayer = async () => {
    if (!layerEditorId) return
    setIsSavingLayer(true)
    setLayerError(null)
    try {
      const response = await fetch("/api/plan/layer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteLayerId: layerEditorId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setLayerError(payload.error || "Could not delete the plan.")
        return
      }
      setLayerDialogOpen(false)
      setActiveLayerId(null)
      refresh()
    } catch {
      setLayerError("Something went wrong while deleting.")
    } finally {
      setIsSavingLayer(false)
    }
  }

  // ---- Plan image upload (admins) ----
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadPlanImage = async (file: File) => {
    setIsUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("folder", "files/plan")
      const uploadResponse = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      })
      const uploadPayload = await uploadResponse.json().catch(() => ({}))
      if (!uploadResponse.ok) {
        setError(uploadPayload.error || "Could not upload the image.")
        return
      }
      const configResponse = await fetch("/api/plan/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageKey: uploadPayload.image.key }),
      })
      if (!configResponse.ok) {
        const payload = await configResponse.json().catch(() => ({}))
        setError(payload.error || "Could not update the plan image.")
        return
      }
      refresh()
    } catch {
      setError("Something went wrong while uploading.")
    } finally {
      setIsUploading(false)
    }
  }

  const filteredDecisions = useMemo(() => {
    const query = decisionSearch.trim().toLowerCase()
    if (!query) return decisions
    return decisions.filter((decision) =>
      `${decision.title} ${decision.roomName ?? ""} ${decision.code} ${decision.decisionCategoryName ?? ""}`
        .toLowerCase()
        .includes(query),
    )
  }, [decisions, decisionSearch])

  const toggleDecision = (id: string) => {
    setForm((prev) => ({
      ...prev,
      decisionItemIds: prev.decisionItemIds.includes(id)
        ? prev.decisionItemIds.filter((entry) => entry !== id)
        : [...prev.decisionItemIds, id],
    }))
  }

  const draftCells = useMemo(() => [...draft], [draft])
  const draftFill = squareEditZone?.color ?? "#111827"
  const transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`
  const isSelecting = canEdit && tool === "select"

  return (
    <div className="flex h-full flex-col">
      {/* Plan (layer) tab bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border/80 bg-card px-4 py-2.5">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Plans
        </span>
        {layers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => setActiveLayerId(layer.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              activeLayerId === layer.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {layer.name}
          </button>
        ))}
        {canEdit ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={openNewLayer}
            >
              <Plus className="size-4" /> Add plan
            </Button>
            {activeLayer ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={openRenameLayer}
                aria-label="Edit plan"
              >
                <Pencil className="size-4" />
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-border/80 bg-card">
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            {canEdit ? (
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Edit
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={tool === "select" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTool("select")}
                  >
                    <MousePointer2 className="size-4" /> Select
                  </Button>
                  <Button
                    type="button"
                    variant={tool === "pan" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setTool("pan")}
                  >
                    <Hand className="size-4" /> Pan
                  </Button>
                </div>

                {squareEditZone ? (
                  <div className="rounded-xl border border-foreground/30 bg-background p-3 text-sm">
                    <p className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-sm"
                        style={{ backgroundColor: squareEditZone.color }}
                      />
                      <span className="text-foreground">
                        Editing squares · {squareEditZone.name}
                      </span>
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {draft.size} square{draft.size === 1 ? "" : "s"}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        onClick={saveSquareEdit}
                        disabled={isSaving || draft.size === 0}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={cancelSquareEdit}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Click or drag to add. Hold{" "}
                      <kbd className="rounded border border-border px-1">Alt</kbd> to
                      remove.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/70 bg-background p-3 text-sm">
                    <p className="text-muted-foreground">
                      {draft.size} square{draft.size === 1 ? "" : "s"} selected
                      {activeLayer ? (
                        <>
                          {" "}
                          on <span className="text-foreground">{activeLayer.name}</span>
                        </>
                      ) : null}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        onClick={openNewZone}
                        disabled={draft.size === 0 || !activeLayerId}
                      >
                        <Plus className="size-4" /> New zone
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraft(new Set())
                          setPreview([])
                        }}
                        disabled={draft.size === 0}
                      >
                        Clear
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Click or drag to select. Hold{" "}
                      <kbd className="rounded border border-border px-1">Alt</kbd> to
                      remove squares. Each plan’s zones are independent.
                    </p>
                  </div>
                )}

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadPlanImage(file)
                      event.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    {isUploading ? "Uploading…" : "Replace plan image"}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* Zones list */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {activeLayer ? `${activeLayer.name} zones` : "Zones"}
              </p>
              {layers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {canEdit
                    ? "No plans yet. Add one above to get started."
                    : "No plans have been added yet."}
                </p>
              ) : layerZones.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {canEdit
                    ? "No zones on this plan yet. Select squares and create one."
                    : "No zones on this plan yet."}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {layerZones.map((zone) => (
                    <li key={zone.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedZoneId(zone.id)
                          focusZone(zone)
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          selectedZoneId === zone.id
                            ? "border-foreground/40 bg-secondary/60"
                            : "border-border/70 hover:bg-secondary/30",
                        )}
                      >
                        <span
                          className="size-3.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: zone.color }}
                        />
                        <span className="flex-1 truncate">{zone.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {zone.squares.length}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Selected zone detail */}
            {selectedZone ? (
              <section className="space-y-3 border-t border-border/70 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3.5 rounded-sm"
                      style={{ backgroundColor: selectedZone.color }}
                    />
                    <h2 className="text-base font-medium">{selectedZone.name}</h2>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        type="button"
                        variant={
                          squareEditZoneId === selectedZone.id ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => enterSquareEdit(selectedZone)}
                      >
                        Squares
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openZoneDetails(selectedZone)}
                      >
                        Details
                      </Button>
                    </div>
                  ) : null}
                </div>
                {selectedZone.description ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    {selectedZone.description}
                  </p>
                ) : null}

                {selectedZone.decisionItemIds.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Linked decisions
                    </p>
                    {selectedZone.decisionItemIds.map((id) => {
                      const decision = decisionsById.get(id)
                      if (!decision) return null
                      return (
                        <div
                          key={id}
                          className="flex gap-3 rounded-lg border border-border/70 p-2.5"
                        >
                          {decision.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={decision.imageUrl}
                              alt={decision.title}
                              className="size-12 shrink-0 rounded-md object-cover"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{decision.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {decision.roomName ? `${decision.roomName} · ` : ""}
                              {STATUS_LABEL[decision.status]}
                            </p>
                            {decision.selectedName ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {decision.selectedName}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No decisions linked.</p>
                )}
              </section>
            ) : null}
          </div>
        </aside>

        {/* Canvas */}
        <div
          ref={viewportRef}
          className="relative min-w-0 flex-1 overflow-hidden bg-secondary/30"
        >
          <div
            ref={stageRef}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: stageW, height: stageH, transform }}
          >
            {planImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={planImageUrl}
                alt="House plan"
                draggable={false}
                className="absolute inset-0 h-full w-full select-none object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
                No plan image uploaded yet.
              </div>
            )}

            {/* Grid lines */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, rgba(0,0,0,0.10) 0, rgba(0,0,0,0.10) 1px, transparent 1px, transparent ${CELL}px), repeating-linear-gradient(to bottom, rgba(0,0,0,0.10) 0, rgba(0,0,0,0.10) 1px, transparent 1px, transparent ${CELL}px)`,
              }}
            />

            {/* Zone fills + selection (active plan only) */}
            <svg
              className="pointer-events-none absolute inset-0"
              width={stageW}
              height={stageH}
              viewBox={`0 0 ${gridCols} ${gridRows}`}
              shapeRendering="crispEdges"
            >
              {layerZones
                .filter((zone) => zone.id !== squareEditZoneId)
                .map((zone) =>
                  zone.squares.map((cell) => (
                    <rect
                      key={`${zone.id}-${cell}`}
                      x={cell % gridCols}
                      y={Math.floor(cell / gridCols)}
                      width={1}
                      height={1}
                      fill={zone.color}
                      fillOpacity={selectedZoneId === zone.id ? 0.6 : 0.4}
                    />
                  )),
                )}
              {draftCells.map((cell) => (
                <rect
                  key={`draft-${cell}`}
                  x={cell % gridCols}
                  y={Math.floor(cell / gridCols)}
                  width={1}
                  height={1}
                  fill={draftFill}
                  fillOpacity={0.45}
                  stroke={draftFill}
                  strokeWidth={0.05}
                />
              ))}
              {preview.map((cell) => (
                <rect
                  key={`preview-${cell}`}
                  x={cell % gridCols}
                  y={Math.floor(cell / gridCols)}
                  width={1}
                  height={1}
                  fill={removeMode ? "#dc2626" : "#2563eb"}
                  fillOpacity={0.3}
                />
              ))}
            </svg>

            {/* Interaction layer */}
            <div
              className="absolute inset-0"
              style={{
                cursor: isSelecting ? "crosshair" : "grab",
                touchAction: "none",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>

          {/* Remove-mode indicator */}
          {canEdit && isSelecting && removeMode ? (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-destructive px-3 py-1 text-xs font-medium text-white shadow">
              Remove mode
            </div>
          ) : null}

          {/* Floating controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <Button type="button" variant="outline" size="sm" onClick={fitView}>
              Fit
            </Button>
          </div>
        </div>
      </div>

      {/* Zone editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-border/70">
          <DialogHeader>
            <DialogTitle>{editorZoneId ? "Edit zone" : "New zone"}</DialogTitle>
            <DialogDescription>
              {editorSquares.length} square{editorSquares.length === 1 ? "" : "s"}
              {activeLayer ? ` on ${activeLayer.name}` : ""}. Assign a name, colour,
              description and link decisions.
              {editorZoneId
                ? " Use Squares mode on the canvas to change the footprint."
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Kitchen flooring"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm({ ...form, color: event.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                />
                <div className="flex flex-wrap gap-1.5">
                  {ZONE_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={cn(
                        "size-6 rounded-md border",
                        form.color.toLowerCase() === color.toLowerCase()
                          ? "border-foreground"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: color }}
                      aria-label={`Use ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Description
              </label>
              <Textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Notes about this part of the house"
                className="min-h-20"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Linked decisions ({form.decisionItemIds.length})
              </label>
              <Input
                value={decisionSearch}
                onChange={(event) => setDecisionSearch(event.target.value)}
                placeholder="Search decisions…"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1.5">
                {filteredDecisions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    No decisions match.
                  </p>
                ) : (
                  filteredDecisions.map((decision) => (
                    <label
                      key={decision.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary/40"
                    >
                      <Checkbox
                        checked={form.decisionItemIds.includes(decision.id)}
                        onCheckedChange={() => toggleDecision(decision.id)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{decision.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {decision.roomName ? `${decision.roomName} · ` : ""}
                          {decision.selectedName || STATUS_LABEL[decision.status]}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {editorZoneId ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={deleteZone}
                disabled={isSaving}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
                disabled={isSaving}
              >
                <X className="size-4" /> Cancel
              </Button>
              <Button type="button" onClick={saveZone} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save zone"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan (layer) editor dialog */}
      <Dialog open={layerDialogOpen} onOpenChange={setLayerDialogOpen}>
        <DialogContent className="max-w-md border-border/70">
          <DialogHeader>
            <DialogTitle>{layerEditorId ? "Edit plan" : "New plan"}</DialogTitle>
            <DialogDescription>
              {layerEditorId
                ? "Rename this plan, or delete it and all of its zones."
                : "Create a new plan (e.g. Flooring, Plumbing, Electrics)."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Plan name
            </label>
            <Input
              value={layerName}
              onChange={(event) => setLayerName(event.target.value)}
              placeholder="e.g. Flooring"
              autoFocus
            />
            {layerError ? (
              <p className="text-sm text-destructive">{layerError}</p>
            ) : null}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {layerEditorId ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={deleteLayer}
                disabled={isSavingLayer}
              >
                <Trash2 className="size-4" /> Delete plan
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLayerDialogOpen(false)}
                disabled={isSavingLayer}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveLayer} disabled={isSavingLayer}>
                {isSavingLayer ? "Saving…" : "Save plan"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
