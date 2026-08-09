"use client"

import { useCallback, useEffect, useRef } from "react"
import { useCriticalPathFocus } from "@/components/critical-path/focus-context"
import { scrollElementLeftTo, scrollWindowToElement } from "@/lib/smooth-scroll"

/**
 * Horizontal scroll container for the Gantt.
 *
 * Centres the "today" marker on mount, and re-centres on a milestone when one of the
 * metric tiles asks for it. Positions are measured from the DOM rather than recomputed
 * from the percentage maths in TimelineStrip, so this stays correct regardless of how
 * the grid resolves its `minmax()` track.
 */
export function TimelineScroller({
  children,
  labelColumnWidth,
  centerOnToday = false,
}: {
  children: React.ReactNode
  /** Width of the sticky label column, which always covers the left edge. */
  labelColumnWidth: number
  centerOnToday?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const focus = useCriticalPathFocus()
  const request = focus?.request ?? null

  const centerOn = useCallback(
    (selector: string, smooth: boolean) => {
      const container = containerRef.current
      if (!container) return false

      const target = container.querySelector(selector)
      if (!(target instanceof HTMLElement)) return false

      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()

      // Offset of the target's centre from the start of the scrollable content.
      const targetCentre =
        targetRect.left -
        containerRect.left +
        container.scrollLeft +
        targetRect.width / 2

      // Centre within the strip that is actually visible, i.e. excluding the sticky
      // label column that sits on top of the left edge.
      const visibleWidth = Math.max(container.clientWidth - labelColumnWidth, 1)
      const desired = targetCentre - (labelColumnWidth + visibleWidth / 2)
      const maxScroll = Math.max(
        container.scrollWidth - container.clientWidth,
        0,
      )

      scrollElementLeftTo(
        container,
        Math.min(Math.max(desired, 0), maxScroll),
        smooth ? undefined : 0,
      )

      return true
    },
    [labelColumnWidth],
  )

  useEffect(() => {
    if (!centerOnToday) return
    centerOn("[data-timeline-today]", false)
  }, [centerOnToday, centerOn])

  useEffect(() => {
    if (request?.kind !== "milestone") return

    const container = containerRef.current
    if (!container) return

    // CSS.escape guards against ids that contain selector metacharacters.
    const selector = `[data-milestone-id="${CSS.escape(request.id)}"]`
    if (!centerOn(selector, true)) return

    scrollWindowToElement(container)
  }, [request, centerOn])

  return (
    <div ref={containerRef} className="overflow-x-auto">
      {children}
    </div>
  )
}
