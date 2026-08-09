"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, RotateCcw, Square, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { AssistantMarkdown } from "@/components/assistant/assistant-markdown"
import {
  ProposalCard,
  type ProposalState,
} from "@/components/assistant/proposal-card"
import { useAssistantChat } from "@/hooks/use-assistant-chat"
import type { ApplyResult, Proposal } from "@/lib/assistant/protocol"

const SUGGESTIONS = [
  "What decisions are still open?",
  "Where are we against budget?",
  "What's due in the next 30 days?",
]

export function AssistantPanel({
  open,
  onOpenChange,
  canEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
}) {
  const router = useRouter()
  const { turns, isStreaming, error, send, stop, reset, settleProposal, setError } =
    useAssistantChat()

  const [draft, setDraft] = useState("")
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>({})
  const [proposalErrors, setProposalErrors] = useState<Record<string, string>>({})

  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /**
   * Notes about changes applied since the last message. They ride the next user
   * turn rather than triggering an index rebuild, which would invalidate the
   * cached prompt prefix for the rest of the conversation.
   */
  const appliedNotesRef = useRef<string[]>([])

  useEffect(() => {
    if (open) {
      // Re-pin to a fresh index on reopen, so anything changed elsewhere in the
      // app since last time is picked up.
      reset()
      appliedNotesRef.current = []
      setProposalStates({})
      setProposalErrors({})
      const id = window.setTimeout(() => inputRef.current?.focus(), 80)
      return () => window.clearTimeout(id)
    }
  }, [open, reset])

  // Follow the tail while streaming, but never yank the view if the user has
  // scrolled up to read something.
  useEffect(() => {
    const node = bodyRef.current
    if (!node) return
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    if (distanceFromBottom < 120) node.scrollTop = node.scrollHeight
  }, [turns])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text || isStreaming) return
    setDraft("")

    const contextLines = [
      `[today: ${new Date().toISOString().slice(0, 10)}]`,
      ...appliedNotesRef.current,
    ]
    appliedNotesRef.current = []
    void send(text, { contextLines })
  }, [draft, isStreaming, send])

  const applyProposal = useCallback(
    async (proposal: Proposal) => {
      setProposalStates((s) => ({ ...s, [proposal.id]: "applying" }))
      setProposalErrors((s) => {
        const { [proposal.id]: _dropped, ...rest } = s
        return rest
      })

      try {
        const response = await fetch("/api/assistant/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposals: [proposal] }),
        })
        const payload = (await response.json()) as ApplyResult & { error?: string }

        if (!response.ok) throw new Error(payload.error ?? "Could not apply that change.")
        const failure = payload.errors?.[0]
        if (failure) throw new Error(failure.message)

        setProposalStates((s) => ({ ...s, [proposal.id]: "applied" }))
        appliedNotesRef.current.push(`[applied: ${proposal.summary}]`)
        // The pages underneath re-render from the server, and each page-client
        // syncs its local state from the refreshed props.
        router.refresh()
      } catch (caught) {
        setProposalStates((s) => ({ ...s, [proposal.id]: "pending" }))
        setProposalErrors((s) => ({
          ...s,
          [proposal.id]:
            caught instanceof Error ? caught.message : "Could not apply that change.",
        }))
      }
    },
    [router],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showClose={false}
        overlayClassName="bg-foreground/10 backdrop-blur-[2px]"
        className="flex w-full flex-col gap-0 border-l border-border/80 p-0 sm:max-w-[560px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-5 py-4">
          <div>
            <SheetTitle className="text-sm font-medium tracking-tight">
              Project assistant
            </SheetTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canEdit
                ? "Ask about the project, or describe a change."
                : "Ask about the project. This account is read-only."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {turns.length > 0 ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label="Start over"
                onClick={() => {
                  reset()
                  appliedNotesRef.current = []
                  setProposalStates({})
                  setProposalErrors({})
                }}
              >
                <RotateCcw className="size-4" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4">
          {turns.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Try
              </p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="block w-full border border-border/70 px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-border hover:text-foreground"
                  onClick={() => {
                    setDraft(suggestion)
                    inputRef.current?.focus()
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-5">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <p
                  key={turn.id}
                  className="ml-auto max-w-[85%] border border-border/70 bg-muted/40 px-3 py-2 text-sm text-foreground"
                >
                  {turn.text}
                </p>
              ) : (
                <div key={turn.id}>
                  {turn.text ? (
                    <AssistantMarkdown source={turn.text} />
                  ) : isStreaming ? (
                    <p className="text-sm text-muted-foreground">Thinking…</p>
                  ) : null}

                  {turn.proposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      state={proposalStates[proposal.id] ?? "pending"}
                      error={proposalErrors[proposal.id]}
                      onApply={() => void applyProposal(proposal)}
                      onDismiss={() => {
                        setProposalStates((s) => ({ ...s, [proposal.id]: "dismissed" }))
                        settleProposal(proposal.id, {})
                      }}
                    />
                  ))}
                </div>
              ),
            )}
          </div>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t border-border/80 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder="Ask or describe a change…"
              className="max-h-40 min-h-10 resize-none border-border/70 text-sm"
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            {isStreaming ? (
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0"
                aria-label="Stop"
                onClick={stop}
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-10 shrink-0"
                aria-label="Send"
                disabled={!draft.trim()}
                onClick={submit}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
