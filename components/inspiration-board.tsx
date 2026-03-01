"use client"

import { startTransition, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { IdeaImage, InspirationSummary } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type IngestedImage = IdeaImage & {
  signedUrl: string
}

type DraftImage = IngestedImage & {
  origin: "ingested" | "uploaded" | "saved"
}

type IngestedItem = {
  title: string
  sourceUrl: string
  description?: string
  siteName?: string
  priceText?: string
  images: IngestedImage[]
}

type InspirationBoardProps = {
  items: InspirationSummary[]
}

export function InspirationBoard({ items }: InspirationBoardProps) {
  const router = useRouter()
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState("")
  const [title, setTitle] = useState("")
  const [room, setRoom] = useState("")
  const [tags, setTags] = useState("")
  const [notes, setNotes] = useState("")
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [ingestedItem, setIngestedItem] = useState<IngestedItem | null>(null)
  const [search, setSearch] = useState("")
  const [roomFilter, setRoomFilter] = useState("")
  const [message, setMessage] = useState("")
  const [isIngesting, setIsIngesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null)

  const rooms = useMemo(
    () =>
      [...new Set(items.map((item) => item.room).filter(Boolean) as string[])].sort(),
    [items],
  )

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesRoom = roomFilter ? item.room === roomFilter : true
      if (!matchesRoom) return false
      if (!query) return true

      const haystack = [
        item.title,
        item.room,
        item.notes,
        item.sourceUrl,
        item.metadata?.siteName,
        ...(item.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [items, roomFilter, search])

  function resetForm() {
    setEditingItemId(null)
    setSourceUrl("")
    setTitle("")
    setRoom("")
    setTags("")
    setNotes("")
    setDraftImages([])
    setIngestedItem(null)
  }

  function closeEditor() {
    setIsEditorOpen(false)
    resetForm()
  }

  function openCreateModal() {
    resetForm()
    setMessage("")
    setIsEditorOpen(true)
  }

  function startEditing(item: InspirationSummary) {
    setIsEditorOpen(true)
    setEditingItemId(item.id)
    setSourceUrl(item.sourceUrl || "")
    setTitle(item.title)
    setRoom(item.room || "")
    setTags((item.tags || []).join(", "))
    setNotes(item.notes || "")
    setIngestedItem(null)
    setDraftImages(
      (item.images || []).map((image, index) => ({
        key: image.key,
        alt: image.alt,
        sourceUrl: image.sourceUrl,
        signedUrl: item.imageUrls[index] || "",
        origin: "saved" as const,
      })),
    )
    setMessage("")
  }

  async function ingestLink() {
    if (!sourceUrl.trim()) {
      setMessage("Paste a link first.")
      return
    }

    setIsIngesting(true)
    setMessage("")

    try {
      const response = await fetch("/api/inspiration/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          draftId: `inspiration-${Date.now()}`,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not ingest link.")
      }

      const item = payload.item as IngestedItem
      setIngestedItem(item)
      setSourceUrl(item.sourceUrl || sourceUrl.trim())
      setTitle(item.title || "")
      setNotes((current) => current || item.description || "")
      setDraftImages((current) => [
        ...current,
        ...item.images
          .filter((image) => !current.some((existing) => existing.key === image.key))
          .map((image) => ({ ...image, origin: "ingested" as const })),
      ])
      setMessage("Link metadata and images added to the draft.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not ingest link.")
    } finally {
      setIsIngesting(false)
    }
  }

  async function uploadImages(files: FileList | null) {
    const selection = Array.from(files || [])
    if (selection.length === 0) return

    setIsUploading(true)
    setMessage("")

    try {
      const uploaded: DraftImage[] = []

      for (const file of selection) {
        const formData = new FormData()
        formData.set("file", file)
        formData.set("folder", "files/inspiration")

        const uploadResponse = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        })
        const uploadPayload = await uploadResponse.json()
        if (!uploadResponse.ok) {
          throw new Error(uploadPayload.error || `Could not upload ${file.name}.`)
        }

        uploaded.push({
          key: uploadPayload.image.key as string,
          alt: (uploadPayload.image.alt as string) || file.name,
          signedUrl: uploadPayload.image.signedUrl as string,
          origin: "uploaded",
        })
      }

      setDraftImages((current) => [...current, ...uploaded])
      setMessage(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload images.")
    } finally {
      setIsUploading(false)
    }
  }

  function removeDraftImage(key: string) {
    setDraftImages((current) => current.filter((image) => image.key !== key))
  }

  async function saveItem() {
    if (!title.trim()) {
      setMessage("Title is required.")
      return
    }

    setIsSaving(true)
    setMessage("")

    try {
      const response = await fetch("/api/inspiration/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editingItemId || undefined,
          title,
          room,
          sourceUrl,
          notes,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          images: draftImages.map(({ key, alt, sourceUrl: originalUrl }) => ({
            key,
            alt,
            sourceUrl: originalUrl,
          })),
          metadata: ingestedItem
            ? {
                description: ingestedItem.description,
                siteName: ingestedItem.siteName,
                priceText: ingestedItem.priceText,
                ingestedAt: new Date().toISOString().slice(0, 10),
                updatedFromUrlAt: new Date().toISOString().slice(0, 10),
              }
            : undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not save inspiration item.")
      }

      const successMessage = editingItemId ? "Inspiration updated." : "Inspiration saved."
      closeEditor()
      setMessage(successMessage)
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save inspiration item.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteItem(item: InspirationSummary) {
    const confirmed = window.confirm(`Delete "${item.title}" from inspiration?`)
    if (!confirmed) return

    setPendingDeleteItemId(item.id)
    setMessage("")

    try {
      const response = await fetch("/api/inspiration/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Could not delete inspiration item.")
      }

      if (editingItemId === item.id) {
        closeEditor()
      }

      setMessage("Inspiration deleted.")
      router.refresh()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not delete inspiration item.",
      )
    } finally {
      setPendingDeleteItemId(null)
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_260px_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, tags, room, notes, or source"
          />
          <select
            value={roomFilter}
            onChange={(event) => setRoomFilter(event.target.value)}
            className="h-10 border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="">All rooms</option>
            {rooms.map((roomOption) => (
              <option key={roomOption} value={roomOption}>
                {roomOption}
              </option>
            ))}
          </select>
          <Button type="button" onClick={openCreateModal}>
            Add inspiration
          </Button>
        </div>

        {!isEditorOpen && message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}

        {filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inspiration items match the current filter.</p>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
            {filteredItems.map((item) => (
              <InspirationCard
                key={item.id}
                item={item}
                onEdit={() => startEditing(item)}
                onDelete={() =>
                  startTransition(() => {
                    void deleteItem(item)
                  })
                }
                isDeleting={pendingDeleteItemId === item.id}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeEditor()
            return
          }

          setIsEditorOpen(true)
        }}
      >
        <DialogContent className="max-w-5xl border-border p-0 sm:max-w-5xl">
          <Card className="border-0 py-0">
            <CardHeader className="px-5 pt-5">
              <DialogHeader>
                <DialogTitle className="text-2xl font-medium tracking-tight">
                  {editingItemId ? "Edit inspiration" : "Add inspiration"}
                </DialogTitle>
                <DialogDescription>
                  Upload images or ingest a reference link, then tag it by room and label.
                </DialogDescription>
              </DialogHeader>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <Input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="Paste a link to pull title, source, and images"
                />
                <Button
                  type="button"
                  onClick={() =>
                    startTransition(() => {
                      void ingestLink()
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
                  placeholder="Title"
                />
                <Input
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                  placeholder="Room e.g. Kitchen or Alex Master Bathroom"
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
                placeholder="Notes about the look, materials, or why this works"
                className="min-h-[120px]"
              />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      void uploadImages(event.target.files)
                      event.currentTarget.value = ""
                    }}
                    className="max-w-sm"
                  />
                  {isUploading ? (
                    <p className="text-sm text-muted-foreground">Uploading images…</p>
                  ) : null}
                </div>

                {draftImages.length ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {draftImages.map((image) => (
                      <div key={image.key} className="border border-border/70 p-2">
                        <img
                          src={image.signedUrl}
                          alt={image.alt || title || "Inspiration image"}
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
                      void saveItem()
                    })
                  }
                  disabled={isSaving}
                >
                  {isSaving ? "Saving…" : editingItemId ? "Save changes" : "Save inspiration"}
                </Button>
                <Button type="button" variant="outline" onClick={closeEditor}>
                  Cancel
                </Button>
              </div>

              {isEditorOpen && message ? (
                <p className="text-sm text-muted-foreground">{message}</p>
              ) : null}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InspirationCard({
  item,
  onEdit,
  onDelete,
  isDeleting,
}: {
  item: InspirationSummary
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const secondaryImages = item.imageUrls.slice(1, 5)

  return (
    <div className="mb-4 break-inside-avoid border border-border/70 bg-card">
      {item.imageUrls[0] ? (
        <img
          src={item.imageUrls[0]}
          alt={item.images?.[0]?.alt || item.title}
          className="w-full object-cover"
        />
      ) : null}

      {secondaryImages.length ? (
        <div className="grid grid-cols-2 gap-px border-t border-border/70">
          {secondaryImages.map((imageUrl, index) => (
            <img
              key={`${item.id}-${index + 1}`}
              src={imageUrl}
              alt={item.images?.[index + 1]?.alt || item.title}
              className="aspect-square w-full object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-medium tracking-tight text-foreground">{item.title}</h3>
            {(item.room || item.metadata?.siteName) ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {[item.room, item.metadata?.siteName].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button type="button" variant="outline" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>

        {(item.tags || []).length ? (
          <div className="flex flex-wrap gap-2">
            {item.tags?.map((tag) => (
              <span
                key={tag}
                className="border border-border/70 px-2 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm text-muted-foreground underline underline-offset-4"
          >
            Open source link
          </a>
        ) : null}
      </div>
    </div>
  )
}
