"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

/**
 * A page section whose body can be folded away. The open/closed choice is remembered
 * per browser under `storageKey`, so a visitor who hides the timeline stays hidden on
 * their next visit. Server-renders open and only reads storage after mount, which
 * keeps the markup identical between server and client.
 */
export function CollapsibleSection({
  storageKey,
  eyebrow,
  title,
  children,
  className,
}: {
  storageKey: string
  eyebrow: string
  title: string
  children: React.ReactNode
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "collapsed") {
        setIsOpen(false)
      }
    } catch {
      // Storage can be unavailable (private mode, blocked site data). Stay open.
    }
  }, [storageKey])

  function handleOpenChange(next: boolean) {
    setIsOpen(next)
    try {
      window.localStorage.setItem(storageKey, next ? "expanded" : "collapsed")
    } catch {
      // Not persisting is fine; the toggle still works for this visit.
    }
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn("space-y-6", className)}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-medium tracking-tight">{title}</h2>
        </div>
        <CollapsibleTrigger
          className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
        >
          {isOpen ? "Collapse" : "Expand"}
          <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
