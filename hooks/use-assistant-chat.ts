"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { MAX_HISTORY_TURNS } from "@/lib/assistant/config"
import type {
  ChatWireMessage,
  ChatUsage,
  Proposal,
  StreamEvent,
} from "@/lib/assistant/protocol"

export type ChatTurn = {
  id: string
  role: "user" | "assistant"
  text: string
  proposals: Proposal[]
}

type SendOptions = {
  /**
   * Extra context appended to the user's message, after the prompt-cache
   * breakpoint — today's date, and any changes applied since the last turn.
   */
  contextLines: string[]
}

let turnCounter = 0
const nextTurnId = () => `turn_${(turnCounter += 1)}`

export function useAssistantChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<ChatUsage | null>(null)

  /** The conversation as the server needs it — kept in a ref, not state, so
   *  streaming deltas don't force it through the render cycle. */
  const wireRef = useRef<ChatWireMessage[]>([])
  const indexHashRef = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    wireRef.current = []
    // Drop the pin so the next turn re-reads the project. Anything applied
    // while the panel was open is picked up on reopen.
    indexHashRef.current = undefined
    setTurns([])
    setError(null)
    setUsage(null)
    setIsStreaming(false)
  }, [])

  const send = useCallback(
    async (text: string, options: SendOptions) => {
      const trimmedText = text.trim()
      if (!trimmedText || abortRef.current) return

      const controller = new AbortController()
      abortRef.current = controller
      setError(null)
      setIsStreaming(true)

      const assistantTurnId = nextTurnId()
      setTurns((current) => [
        ...current,
        { id: nextTurnId(), role: "user", text: trimmedText, proposals: [] },
        { id: assistantTurnId, role: "assistant", text: "", proposals: [] },
      ])

      // Context rides in the user turn, never the system prompt: it changes
      // every request, and anything above the cache breakpoint that changes
      // costs a full cache write each turn.
      const wireText =
        options.contextLines.length > 0
          ? `${options.contextLines.join("\n")}\n${trimmedText}`
          : trimmedText
      wireRef.current = [...wireRef.current, { role: "user", text: wireText }]

      // Batch deltas to one flush per frame. react-markdown re-parses the whole
      // string on every state change, so a setState per token makes long
      // answers visibly stutter.
      let pending = ""
      let frame: number | null = null
      const flush = () => {
        frame = null
        if (!pending) return
        const chunk = pending
        pending = ""
        setTurns((current) =>
          current.map((turn) =>
            turn.id === assistantTurnId ? { ...turn, text: turn.text + chunk } : turn,
          ),
        )
      }
      const scheduleFlush = () => {
        if (frame === null) frame = requestAnimationFrame(flush)
      }

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: wireRef.current,
            indexHash: indexHashRef.current,
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "The assistant is unavailable.")
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ""

        // NDJSON: a chunk can split a line anywhere, so hold the remainder.
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += value

          let newline = buffer.indexOf("\n")
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf("\n")
            if (!line) continue

            let event: StreamEvent
            try {
              event = JSON.parse(line) as StreamEvent
            } catch {
              continue
            }

            if (event.t === "d") {
              pending += event.v
              scheduleFlush()
            } else if (event.t === "p") {
              const proposal = event.v
              setTurns((current) =>
                current.map((turn) =>
                  turn.id === assistantTurnId
                    ? { ...turn, proposals: [...turn.proposals, proposal] }
                    : turn,
                ),
              )
            } else if (event.t === "e") {
              setError(event.v)
            } else if (event.t === "end") {
              indexHashRef.current = event.v.indexHash
              setUsage(event.v.usage)

              // Mirror the server's view of the turn back into the history, so
              // the next request's tool_use blocks all have matching results.
              const assistantMessage: ChatWireMessage = {
                role: "assistant",
                text: event.v.assistantText,
                toolUses: event.v.toolUses,
              }
              const next: ChatWireMessage[] = [...wireRef.current, assistantMessage]
              if (event.v.toolResults.length > 0) {
                next.push({ role: "tool", results: event.v.toolResults })
              }
              wireRef.current = next.slice(-MAX_HISTORY_TURNS * 3)
            }
          }
        }
      } catch (caught) {
        if ((caught as Error)?.name !== "AbortError") {
          setError(
            caught instanceof Error ? caught.message : "The assistant is unavailable.",
          )
        }
      } finally {
        if (frame !== null) cancelAnimationFrame(frame)
        flush()
        abortRef.current = null
        setIsStreaming(false)
      }
    },
    [],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  /** Replace a proposal in place once the user applies or dismisses it. */
  const settleProposal = useCallback((proposalId: string, patch: Partial<Proposal>) => {
    setTurns((current) =>
      current.map((turn) => ({
        ...turn,
        proposals: turn.proposals.map((proposal) =>
          proposal.id === proposalId ? { ...proposal, ...patch } : proposal,
        ),
      })),
    )
  }, [])

  return { turns, isStreaming, error, usage, send, stop, reset, settleProposal, setError }
}
