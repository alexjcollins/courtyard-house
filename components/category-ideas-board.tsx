"use client"

import { startTransition, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { CategorySummary, IdeaImage } from "@/lib/data"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"

type IdeaWithUrls = CategorySummary["ideas"][number]

type IngestedImage = IdeaImage & {
  signedUrl: string
}

type DraftImage = IngestedImage & {
  origin: "ingested" | "uploaded" | "saved"
}

type IngestedIdea = {
  title: string
  supplierName?: string
  brand?: string
  sourceUrl: string
  description?: string
  siteName?: string
  estimatedTotalExVat?: number
  currency?: string
  priceText?: string
  images: IngestedImage[]
}

type CategoryIdeasBoardProps = {
  categoryId: string
  ideas: IdeaWithUrls[]
}

export function CategoryIdeasBoard({
  categoryId,
  ideas,
}: CategoryIdeasBoardProps) {
  const router = useRouter()
  const [sourceUrl, setSourceUrl] = useState("")
  const [title, setTitle] = useState("")
  const [room, setRoom] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [brand, setBrand] = useState("")
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState("1")
  const [estimatedTotalExVat, setEstimatedTotalExVat] = useState("")
  const [budgetAllowanceExVat, setBudgetAllowanceExVat] = useState("")
  const [notes, setNotes] = useState("")
  const [tags, setTags] = useState("")
  const [ingestedIdea, setIngestedIdea] = useState<IngestedIdea | null>(null)
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [message, setMessage] = useState("")
  const [pendingIdeaId, setPendingIdeaId] = useState<string | null>(null)
  const [isIngesting, setIsIngesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImages, setIsUploadingImages] = useState(false)

  const collectedIdeas = useMemo(
    () => ideas.filter((idea) => idea.status === "collected"),
    [ideas],
  )
  const pickedIdeas = useMemo(
    () => ideas.filter((idea) => idea.status === "picked"),
    [ideas],
  )
  const editingIdea = useMemo(
    () => ideas.find((idea) => idea.id === editingIdeaId) || null,
    [editingIdeaId, ideas],
  )

  function resetForm() {
    setEditingIdeaId(null)
    setSourceUrl("")
    setTitle("")
    setRoom("")
    setSupplierName("")
    setBrand("")
    setQuantity("1")
    setEstimatedTotalExVat("")
    setBudgetAllowanceExVat("")
    setNotes("")
    setTags("")
    setIngestedIdea(null)
    setDraftImages([])
  }

  function startEditingIdea(idea: IdeaWithUrls) {
    setEditingIdeaId(idea.id)
    setSourceUrl(idea.sourceUrl || "")
    setTitle(idea.title)
    setRoom(idea.room || "")
    setSupplierName(idea.supplierName || "")
    setBrand(idea.brand || "")
    setQuantity(String(idea.quantity || 1))
    setEstimatedTotalExVat(
      idea.estimatedTotalExVat !== undefined ? String(idea.estimatedTotalExVat) : "",
    )
    setBudgetAllowanceExVat(
      idea.budgetAllowanceExVat !== undefined ? String(idea.budgetAllowanceExVat) : "",
    )
    setNotes(idea.notes || "")
    setTags((idea.tags || []).join(", "))
    setIngestedIdea(null)
    setDraftImages(
      (idea.images || []).map((image, index) => ({
        key: image.key,
        alt: image.alt,
        sourceUrl: image.sourceUrl,
        signedUrl: idea.imageUrls[index] || "",
        origin: "saved" as const,
      })),
    )
    setMessage(`Editing ${idea.title}.`)
  }

  async function ingest() {
    if (!sourceUrl.trim()) {
      setMessage("Paste a product URL first.")
      return
    }

    setIsIngesting(true)
    setMessage("")

    try {
      const response = await fetch("/api/ideas/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          draftId: `draft-${Date.now()}`,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not ingest URL.")
      }

      const idea = payload.idea as IngestedIdea
      setIngestedIdea(idea)
      setDraftImages((current) => [
        ...current,
        ...idea.images
          .filter((image) => !current.some((existing) => existing.key === image.key))
          .map((image) => ({ ...image, origin: "ingested" as const })),
      ])
      setSourceUrl(idea.sourceUrl || sourceUrl.trim())
      setTitle(idea.title || "")
      setSupplierName(idea.supplierName || "")
      setBrand(idea.brand || "")
      setEstimatedTotalExVat(
        idea.estimatedTotalExVat ? String(idea.estimatedTotalExVat) : "",
      )
      setNotes((current) => current || idea.description || "")
      setMessage("Metadata and images pulled from the source link.")
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not ingest URL.",
      )
    } finally {
      setIsIngesting(false)
    }
  }

  async function uploadOwnImages(files: FileList | null) {
    const selection = Array.from(files || [])
    if (selection.length === 0) return

    setIsUploadingImages(true)
    setMessage("")

    try {
      const uploadedImages: DraftImage[] = []

      for (const file of selection) {
        const formData = new FormData()
        formData.set("file", file)
        formData.set("folder", "files/ideas/uploads")

        const uploadResponse = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        })
        const uploadPayload = await uploadResponse.json()
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload.error || `Could not upload ${file.name}.`)
        }

        uploadedImages.push({
          key: uploadPayload.image.key as string,
          alt: (uploadPayload.image.alt as string) || file.name,
          sourceUrl: undefined,
          signedUrl: uploadPayload.image.signedUrl as string,
          origin: "uploaded",
        })
      }

      setDraftImages((current) => [...current, ...uploadedImages])
      setMessage(
        `${uploadedImages.length} image${uploadedImages.length === 1 ? "" : "s"} uploaded.`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not upload images.",
      )
    } finally {
      setIsUploadingImages(false)
    }
  }

  function removeDraftImage(imageKey: string) {
    setDraftImages((current) => current.filter((image) => image.key !== imageKey))
  }

  async function saveIdea() {
    if (!title.trim()) {
      setMessage("Title is required.")
      return
    }

    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/ideas/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          ideaId: editingIdeaId || undefined,
          room,
          title,
          supplierName,
          brand,
          sourceUrl,
          quantity: Number(quantity || 1),
          estimatedTotalExVat:
            estimatedTotalExVat.trim() === ""
              ? undefined
              : Number(estimatedTotalExVat),
          budgetAllowanceExVat:
            budgetAllowanceExVat.trim() === ""
              ? undefined
              : Number(budgetAllowanceExVat),
          notes,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          currency: ingestedIdea?.currency || "GBP",
          images: draftImages.map(({ key, alt, sourceUrl: originalUrl }) => ({
            key,
            alt,
            sourceUrl: originalUrl,
          })),
          metadata: ingestedIdea
            ? {
                description: ingestedIdea.description,
                siteName: ingestedIdea.siteName,
                priceText: ingestedIdea.priceText,
                imageSourceCount: draftImages.length,
                ingestedAt: new Date().toISOString().slice(0, 10),
                updatedFromUrlAt: new Date().toISOString().slice(0, 10),
              }
            : editingIdea?.metadata,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not save idea.")
      }

      resetForm()
      setMessage(editingIdeaId ? "Idea updated." : "Idea saved.")
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save idea.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function setPickedState(
    ideaId: string,
    status: "collected" | "picked",
  ) {
    setPendingIdeaId(ideaId)
    setMessage("")

    try {
      const response = await fetch("/api/ideas/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, status }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not update idea.")
      }

      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update idea.",
      )
    } finally {
      setPendingIdeaId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 py-0">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-2xl font-medium tracking-tight">
            {editingIdeaId ? "Edit idea" : "Capture a new idea"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="Paste a product URL to pull title, price, and images"
            />
            <Button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void ingest()
                })
              }
              disabled={isIngesting}
            >
              {isIngesting ? "Ingesting…" : "Ingest link"}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Idea title"
            />
            <Input
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              placeholder="Room tag e.g. Alex Master Bathroom"
            />
            <Input
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
              placeholder="Supplier or retailer"
            />
            <Input
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="Brand or maker"
            />
            <Input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Quantity"
              inputMode="numeric"
            />
            <Input
              value={estimatedTotalExVat}
              onChange={(event) => setEstimatedTotalExVat(event.target.value)}
              placeholder="Estimated total ex VAT"
              inputMode="decimal"
            />
            <Input
              value={budgetAllowanceExVat}
              onChange={(event) => setBudgetAllowanceExVat(event.target.value)}
              placeholder="Budget allowance ex VAT (optional)"
              inputMode="decimal"
            />
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Tags, comma separated"
            />
          </div>

          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes, finish thoughts, sizing, delivery constraints, or install comments"
            className="min-h-[120px]"
          />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  void uploadOwnImages(event.target.files)
                  event.currentTarget.value = ""
                }}
                className="max-w-sm"
              />
              {isUploadingImages ? (
                <p className="text-sm text-muted-foreground">Uploading images…</p>
              ) : null}
            </div>

          {draftImages.length ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {draftImages.map((image) => (
                <div key={image.key} className="border border-border/70 p-2">
                  <img
                    src={image.signedUrl}
                    alt={image.alt || title || "Idea image"}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {image.origin === "uploaded"
                        ? "Uploaded"
                        : image.origin === "saved"
                          ? "Saved"
                          : "Ingested"}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeDraftImage(image.key)}
                      className="text-xs text-muted-foreground underline underline-offset-4"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void saveIdea()
                })
              }
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : editingIdeaId ? "Save changes" : "Save idea"}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              {editingIdeaId ? "Cancel edit" : "Clear"}
            </Button>
          </div>

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Picked
          </p>
          <h3 className="mt-2 text-2xl font-medium tracking-tight">Selected ideas</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Picked items feed the category forecast using their estimated price minus any allowance.
          </p>
        </div>
        {pickedIdeas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No picked ideas yet.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pickedIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                pending={pendingIdeaId === idea.id}
                onEdit={() => startEditingIdea(idea)}
                onToggle={(status) => {
                  void setPickedState(idea.id, status)
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Bank
          </p>
          <h3 className="mt-2 text-2xl font-medium tracking-tight">Idea bank</h3>
        </div>
        {collectedIdeas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ideas captured yet.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {collectedIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                pending={pendingIdeaId === idea.id}
                onEdit={() => startEditingIdea(idea)}
                onToggle={(status) => {
                  void setPickedState(idea.id, status)
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function IdeaCard({
  idea,
  pending,
  onEdit,
  onToggle,
}: {
  idea: IdeaWithUrls
  pending: boolean
  onEdit: () => void
  onToggle: (status: "collected" | "picked") => void
}) {
  return (
    <Card className="border-border/70 py-0">
      <CardHeader className="px-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-medium tracking-tight">
              {idea.title}
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {[idea.room, idea.supplierName, idea.brand].filter(Boolean).join(" · ") || "Unassigned room"}
            </p>
          </div>
          <StatusBadge status={idea.status === "picked" ? "accepted" : "planned"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        {idea.imageUrls.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {idea.imageUrls.map((imageUrl, index) => (
              <div key={`${idea.id}-${index}`} className="border border-border/70 p-2">
                <img
                  src={imageUrl}
                  alt={idea.images?.[index]?.alt || idea.title}
                  className="aspect-square w-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-border/70 bg-secondary/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Estimated cost
            </p>
            <p className="mt-2 text-lg font-medium text-foreground">
              {formatCurrency(idea.estimatedTotalExVat || 0)}
            </p>
          </div>
          <div className="border border-border/70 bg-secondary/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Forecast delta
            </p>
            <p
              className={cn(
                "mt-2 text-lg font-medium",
                idea.selectedCostDeltaExVat >= 0 ? "text-foreground" : "text-emerald-700",
              )}
            >
              {formatCurrency(idea.selectedCostDeltaExVat)}
            </p>
          </div>
        </div>

        {idea.notes ? <p className="text-sm text-muted-foreground">{idea.notes}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          {idea.sourceUrl ? (
            <a
              href={idea.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              Open source link
            </a>
          ) : null}
          {(idea.tags || []).map((tag) => (
            <span
              key={tag}
              className="border border-border/70 px-2 py-1 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button
            type="button"
            onClick={() => onToggle(idea.status === "picked" ? "collected" : "picked")}
            disabled={pending}
          >
            {pending
              ? "Saving…"
              : idea.status === "picked"
                ? "Unpick idea"
                : "Pick idea"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
