"use client"

import { AlertTriangle, ArrowRight, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Proposal } from "@/lib/assistant/protocol"

export type ProposalState = "pending" | "applying" | "applied" | "dismissed"

/**
 * The confirmation gate for every write.
 *
 * `before` values come from the server, read out of project data — not from the
 * model — so what the card shows is what is actually there. Nothing is written
 * until Apply is clicked.
 */
export function ProposalCard({
  proposal,
  state,
  error,
  onApply,
  onDismiss,
}: {
  proposal: Proposal
  state: ProposalState
  error?: string | null
  onApply: () => void
  onDismiss: () => void
}) {
  const isInvalid = Boolean(proposal.invalid)
  const isSettled = state === "applied" || state === "dismissed"

  return (
    <div
      className={cn(
        "mt-3 border border-border/80 bg-muted/30 text-sm",
        isInvalid && "border-destructive/40",
        state === "dismissed" && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2 border-b border-border/60 px-3 py-2">
        {isInvalid ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : state === "applied" ? (
          <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
        ) : null}
        <div className="min-w-0">
          <p className="font-medium leading-5 text-foreground">{proposal.summary}</p>
          {proposal.target.label ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {proposal.target.label}
            </p>
          ) : null}
        </div>
      </div>

      {isInvalid ? (
        <p className="px-3 py-2 text-xs text-destructive">{proposal.invalid}</p>
      ) : (
        <dl className="divide-y divide-border/40">
          {proposal.after.map((field, i) => (
            <div
              key={field.field}
              className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 px-3 py-1.5"
            >
              <dt className="truncate text-xs text-muted-foreground">{field.field}</dt>
              <dd className="flex min-w-0 items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground line-through decoration-border">
                  {proposal.before[i]?.value ?? "—"}
                </span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium text-foreground">
                  {field.value}
                </span>
              </dd>
            </div>
          ))}
          {proposal.after.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No fields would change.
            </p>
          ) : null}
        </dl>
      )}

      {error ? (
        <p className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {!isInvalid && !isSettled ? (
        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
          <Button
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            disabled={state === "applying" || proposal.after.length === 0}
            onClick={onApply}
          >
            {state === "applying" ? "Applying…" : "Apply"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-full px-3 text-xs text-muted-foreground"
            disabled={state === "applying"}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {state === "applied" ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
          Applied.
        </p>
      ) : null}
      {state === "dismissed" ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
          Dismissed.
        </p>
      ) : null}
    </div>
  )
}
