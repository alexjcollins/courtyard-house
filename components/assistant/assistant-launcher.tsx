"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"

import { AssistantPanel } from "@/components/assistant/assistant-panel"

/**
 * Floating entry point for the project assistant.
 *
 * Mounted from the authenticated layout only. It deliberately does not appear on
 * /plan or /critical-path, which render outside that route group and are
 * reachable with only the shared plan password — the assistant's index covers
 * the whole project, including costs.
 */
export function AssistantLauncher({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open project assistant"
          className="fixed bottom-6 right-6 z-50 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-muted-foreground shadow-sm transition hover:text-foreground hover:shadow-md"
        >
          <Sparkles className="size-4 text-accent" />
          Ask
          <kbd className="ml-1 hidden rounded border border-border/70 px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:inline">
            ⌘J
          </kbd>
        </button>
      ) : null}

      <AssistantPanel open={open} onOpenChange={setOpen} canEdit={canEdit} />
    </>
  )
}
