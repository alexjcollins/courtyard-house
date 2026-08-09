// Tuning constants for the Haiku project assistant.
//
// These are deliberately in their own module with no imports: several are read
// from both server and client code, and keeping them import-free means neither
// side accidentally pulls in `server-only` transitively.

/**
 * Haiku 4.5. Note this model does NOT support `output_config.effort` (it errors)
 * and its only thinking mode is a fixed `budget_tokens`, which would roughly
 * triple latency for what is fundamentally a lookup task. We send neither.
 */
export const ASSISTANT_MODEL = "claude-haiku-4-5"

/** Bounded so a runaway generation can't approach the route's maxDuration. */
export const MAX_TOKENS = 1500

/** How long a built index is reused before a rebuild is considered. */
export const INDEX_TTL_MS = 30_000

/**
 * TTL for a build that lost a section to a source failure. Short, so a
 * transient Spaces read error doesn't serve an incomplete index for 30s.
 */
export const DEGRADED_TTL_MS = 3_000

/**
 * How many historical index snapshots to retain so in-flight conversations keep
 * hitting the same cached prompt prefix after the data changes underneath them.
 */
export const MAX_SNAPSHOTS = 3

/**
 * Hard ceiling on model round-trips per user turn. One hop covers `get_detail`
 * and the single validation-retry for a malformed proposal; beyond that we stop
 * and return whatever we have rather than looping.
 */
export const MAX_TOOL_LOOPS = 1

/** Conversation turns retained client-side before the oldest are dropped. */
export const MAX_HISTORY_TURNS = 12

/** Cap on ids per `get_detail` call, so one tool result can't blow the context. */
export const MAX_DETAIL_IDS = 10

export type AssistantVariant = "admin" | "architect"
