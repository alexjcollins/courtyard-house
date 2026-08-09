"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutes) || minutes < 1) return "just now"
  if (minutes === 1) return "1 min ago"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return "1 hr ago"
  if (hours < 24) return `${hours} hr ago`
  return "over a day ago"
}

export function RefreshButton({ fetchedAt }: { fetchedAt: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [label, setLabel] = useState<string | null>(null)

  // Rendered on the client only — a server-rendered relative time would hydrate stale.
  useEffect(() => {
    if (!fetchedAt) {
      setLabel(null)
      return
    }
    setLabel(relativeTime(fetchedAt))
    const timer = setInterval(() => setLabel(relativeTime(fetchedAt)), 60_000)
    return () => clearInterval(timer)
  }, [fetchedAt])

  async function handleRefresh() {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await fetch("/api/critical-path/refresh", { method: "POST" })
      startTransition(() => router.refresh())
    } catch {
      // Non-fatal: the page keeps showing the cached list.
    } finally {
      setIsSubmitting(false)
    }
  }

  const busy = isSubmitting || isPending

  return (
    <div className="flex items-center gap-2">
      {label ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Synced {label}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleRefresh}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-60"
      >
        <RotateCw className={cn("size-3.5", busy && "animate-spin")} />
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  )
}
