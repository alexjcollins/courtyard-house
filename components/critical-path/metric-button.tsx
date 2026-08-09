"use client"

import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Interactive twin of components/metric-card.tsx. Kept separate rather than adding an
 * onClick to the shared MetricCard, which is a server component used on five other
 * pages and would have to become a client component to accept a handler.
 */
export function MetricButton({
  label,
  value,
  detail,
  hint,
  onClick,
}: {
  label: string
  value: string
  detail?: string
  /** Accessible description of where the tile jumps to. */
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}. ${hint}`}
      className="group h-full text-left focus-visible:outline-none"
    >
      <Card className="h-full border-border/70 py-0 transition-colors group-hover:border-foreground/25 group-hover:bg-secondary/40 group-focus-visible:border-foreground/40 group-focus-visible:ring-2 group-focus-visible:ring-ring/40">
        <CardHeader className="px-5 pt-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {label}
            </p>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </div>
          <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
            {value}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {detail ? (
            <p className="text-sm text-muted-foreground">{detail}</p>
          ) : (
            <div className="h-2.5" />
          )}
        </CardContent>
      </Card>
    </button>
  )
}
