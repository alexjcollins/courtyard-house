import "server-only"

import {
  DEGRADED_TTL_MS,
  INDEX_TTL_MS,
  MAX_SNAPSHOTS,
  type AssistantVariant,
} from "@/lib/assistant/config"
import { buildProjectIndex, type ProjectIndex } from "@/lib/assistant/index-builder"

/**
 * Process-level index cache.
 *
 * Not React `cache()` — that is per-request and so never helps across turns.
 * Not `unstable_cache` — it serializes its payload (which would drop the
 * `entities` Map) and is tied to Data Cache revalidation semantics we don't want.
 *
 * A module-level global with a TTL is the right shape, and it mirrors the pool
 * pattern already used at lib/decisions-db.ts:32 so it survives dev HMR.
 */
type VariantSlot = {
  value: ProjectIndex
  expiresAt: number
  inflight?: Promise<ProjectIndex>
}

type IndexCache = {
  current: Partial<Record<AssistantVariant, VariantSlot>>
  /** Retained older builds, so pinned conversations keep their cached prefix. */
  snapshots: Map<string, ProjectIndex>
}

declare global {
  // eslint-disable-next-line no-var
  var __assistantIndex: IndexCache | undefined
}

function store(): IndexCache {
  if (!globalThis.__assistantIndex) {
    globalThis.__assistantIndex = { current: {}, snapshots: new Map() }
  }
  return globalThis.__assistantIndex
}

function remember(cache: IndexCache, index: ProjectIndex): void {
  // Re-set to move an existing key to the end of the insertion order, so the
  // eviction below always drops the least recently produced snapshot.
  cache.snapshots.delete(index.hash)
  cache.snapshots.set(index.hash, index)

  while (cache.snapshots.size > MAX_SNAPSHOTS) {
    const oldest = cache.snapshots.keys().next().value
    if (oldest === undefined) break
    cache.snapshots.delete(oldest)
  }
}

/**
 * The freshest index for this role, rebuilding at most once per TTL window.
 *
 * Single-flight is not optional here: the pg pool is capped at 5 connections
 * process-wide (lib/decisions-db.ts:32), and a cold start with several
 * simultaneous first messages would otherwise fire several concurrent builds and
 * starve the rest of the app.
 */
export async function getCurrentIndex(
  variant: AssistantVariant,
): Promise<ProjectIndex> {
  const cache = store()
  const slot = cache.current[variant]
  const now = Date.now()

  if (slot && slot.expiresAt > now) return slot.value
  if (slot?.inflight) return slot.inflight

  const inflight = buildProjectIndex(variant)
    .then((index) => {
      // A degraded build is missing at least one section, usually a transient
      // Spaces read failure. Expire it quickly so the next question gets a
      // complete index instead of an incomplete one for the full window.
      const ttl = index.degraded ? DEGRADED_TTL_MS : INDEX_TTL_MS
      cache.current[variant] = { value: index, expiresAt: Date.now() + ttl }
      remember(cache, index)
      return index
    })
    .catch((error) => {
      // Drop the in-flight marker so the next caller retries rather than
      // awaiting a promise that already rejected.
      if (cache.current[variant]?.inflight === inflight) {
        delete cache.current[variant]
      }
      throw error
    })

  cache.current[variant] = slot
    ? { ...slot, inflight }
    : ({ inflight } as unknown as VariantSlot)

  return inflight
}

/**
 * The index a conversation is pinned to.
 *
 * Serving the exact snapshot the conversation started on is what keeps the
 * prompt prefix byte-identical across turns, and therefore what makes the
 * Anthropic prompt cache hit from turn 2 onward. Falls back to the current build
 * when the hash is unknown (server restarted, or the snapshot aged out) — the
 * caller sends the returned hash back to the client so it re-pins.
 */
export async function getPinnedIndex(
  variant: AssistantVariant,
  hash: string | undefined,
): Promise<ProjectIndex> {
  if (hash) {
    const pinned = store().snapshots.get(hash)
    if (pinned && pinned.variant === variant) return pinned
  }
  return getCurrentIndex(variant)
}
