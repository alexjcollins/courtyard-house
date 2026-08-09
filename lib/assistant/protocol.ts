// Wire types shared by the assistant API routes and the client panel.
//
// Isomorphic on purpose: no `server-only`, no imports from `lib/data` or the db
// modules. The client imports this to type its stream reader and proposal state.

export type ProposalKind =
  | "decision.selection"
  | "furniture.selection"
  | "decision.item"
  | "furniture.item"
  | "procurement.save"
  | "procurement.delete"

export type ProposalField = {
  field: string
  value: string
}

export type Proposal = {
  /** Server-minted. Only used as a React key and for stream correlation. */
  id: string
  kind: ProposalKind
  /** Model-authored one-liner, shown as the card title. */
  summary: string
  target: {
    id: string
    label: string
  }
  /** Computed server-side from live data — never taken from the model. */
  before: ProposalField[]
  after: ProposalField[]
  /** The validated tool input. This, not `after`, is what gets applied. */
  payload: unknown
  /** Set when the proposal can't be applied; the card renders read-only. */
  invalid?: string
}

/**
 * A single turn in the conversation as the client stores and resends it.
 * The server holds no session state — the client is the source of truth.
 */
export type ChatWireMessage =
  | { role: "user"; text: string }
  | {
      role: "assistant"
      text: string
      toolUses: Array<{ id: string; name: string; input: unknown }>
    }
  | { role: "tool"; results: Array<{ toolUseId: string; content: string }> }

export type ChatRequestBody = {
  messages: ChatWireMessage[]
  /**
   * Pins the conversation to one index snapshot so the cached prompt prefix
   * stays byte-identical across turns. Omit on the first turn.
   */
  indexHash?: string
}

export type ChatUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

/** Newline-delimited JSON frames streamed from /api/assistant/chat. */
export type StreamEvent =
  /** Text delta. */
  | { t: "d"; v: string }
  /** A completed, validated proposal. */
  | { t: "p"; v: Proposal }
  /** Terminal error; nothing further will be sent. */
  | { t: "e"; v: string }
  /** Always last on a successful turn. */
  | {
      t: "end"
      v: {
        indexHash: string
        assistantText: string
        toolUses: Array<{ id: string; name: string; input: unknown }>
        toolResults: Array<{ toolUseId: string; content: string }>
        usage: ChatUsage
      }
    }

export type ApplyRequestBody = {
  proposals: Proposal[]
}

export type ApplyResult = {
  applied: string[]
  errors: Array<{ id: string; message: string }>
}
