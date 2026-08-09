"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

// Lets the metric tiles at the top of /critical-path drive the task list and the Gantt,
// which are siblings in the server-rendered tree rather than parent and child.
//
// The hook returns null when there is no provider, so TimelineStrip can keep being used
// on /timeline and the dashboard without one.

export type FocusTarget =
  | { kind: "tasks"; filter: "open" | "in-progress" | "overdue" }
  | { kind: "milestone"; id: string }

/** nonce makes a repeated click on the same tile re-trigger the effect. */
export type FocusRequest = FocusTarget & { nonce: number }

type FocusContextValue = {
  request: FocusRequest | null
  requestFocus: (target: FocusTarget) => void
}

const CriticalPathFocusContext = createContext<FocusContextValue | null>(null)

export function CriticalPathFocusProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [request, setRequest] = useState<FocusRequest | null>(null)

  const requestFocus = useCallback((target: FocusTarget) => {
    setRequest({ ...target, nonce: Date.now() })
  }, [])

  const value = useMemo(
    () => ({ request, requestFocus }),
    [request, requestFocus],
  )

  return (
    <CriticalPathFocusContext.Provider value={value}>
      {children}
    </CriticalPathFocusContext.Provider>
  )
}

/** Returns null outside a provider — callers must handle that. */
export function useCriticalPathFocus(): FocusContextValue | null {
  return useContext(CriticalPathFocusContext)
}
