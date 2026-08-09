import type { LinearPriority, LinearStateType } from "@/lib/linear"
import { cn } from "@/lib/utils"

// Hand-drawn to match Linear's own glyphs. lucide's Signal* icons are the nearest
// equivalents but draw a four-bar arc that reads as a wifi indicator, not a priority.
//
// No "use client" — these are pure and get rendered from both server and client trees.

const PRIORITY_LABELS: Record<LinearPriority, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
}

/** How many of the three bars are filled. Priority 1 (urgent) uses its own glyph. */
const FILLED_BARS: Record<LinearPriority, number> = { 0: 0, 1: 3, 2: 3, 3: 2, 4: 1 }

const BARS = [
  { x: 1, y: 8, height: 6 },
  { x: 6, y: 5, height: 9 },
  { x: 11, y: 2, height: 12 },
]

export function PriorityIcon({
  priority,
  className,
}: {
  priority: LinearPriority
  className?: string
}) {
  const label = PRIORITY_LABELS[priority]

  if (priority === 1) {
    return (
      <svg
        viewBox="0 0 16 16"
        aria-label={label}
        role="img"
        className={cn("size-4 shrink-0 text-[color:var(--accent)]", className)}
      >
        <rect width="16" height="16" rx="3" fill="currentColor" />
        <rect x="7" y="3" width="2" height="6" rx="1" fill="#fff" />
        <rect x="7" y="11" width="2" height="2" rx="1" fill="#fff" />
      </svg>
    )
  }

  if (priority === 0) {
    return (
      <svg
        viewBox="0 0 16 16"
        aria-label={label}
        role="img"
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      >
        {[1.5, 6.5, 11.5].map((x) => (
          <rect
            key={x}
            x={x}
            y="7.25"
            width="3"
            height="1.5"
            rx="0.75"
            fill="currentColor"
            opacity="0.5"
          />
        ))}
      </svg>
    )
  }

  const filled = FILLED_BARS[priority]

  return (
    <svg
      viewBox="0 0 16 16"
      aria-label={label}
      role="img"
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
    >
      {BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width="3"
          height={bar.height}
          rx="1"
          fill="currentColor"
          opacity={index < filled ? 1 : 0.28}
        />
      ))}
    </svg>
  )
}

/**
 * Workflow-state ring. Stroked with the workspace's own hex colour so the page matches
 * whatever the architect sees in Linear. Tailwind can't generate classes for values it
 * doesn't know at build time, so the colour goes in as an SVG attribute.
 */
export function StateIcon({
  type,
  color,
  name,
  className,
}: {
  type: LinearStateType
  color: string
  name?: string
  className?: string
}) {
  const shared = {
    viewBox: "0 0 14 14",
    role: "img" as const,
    "aria-label": name || type,
    className: cn("size-3.5 shrink-0", className),
  }

  if (type === "completed") {
    return (
      <svg {...shared}>
        <circle cx="7" cy="7" r="7" fill={color} />
        <path
          d="M3.8 7.2 6 9.4l4.2-4.5"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (type === "canceled") {
    return (
      <svg {...shared}>
        <circle cx="7" cy="7" r="7" className="fill-muted-foreground" opacity="0.55" />
        <path
          d="M4.6 4.6 9.4 9.4M9.4 4.6 4.6 9.4"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (type === "triage") {
    return (
      <svg {...shared}>
        <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5" />
        <rect x="6.25" y="3.4" width="1.5" height="4.2" rx="0.75" fill={color} />
        <rect x="6.25" y="8.8" width="1.5" height="1.6" rx="0.75" fill={color} />
      </svg>
    )
  }

  if (type === "backlog") {
    return (
      <svg {...shared}>
        <circle
          cx="7"
          cy="7"
          r="6"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="2.5 2.5"
        />
      </svg>
    )
  }

  if (type === "started") {
    // Outer ring plus a half-filled pie, drawn as a fat dash on an r=3 circle.
    // 2πr ≈ 18.85, so a 9.42 dash is exactly half the circumference.
    return (
      <svg {...shared}>
        <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5" />
        <circle
          cx="7"
          cy="7"
          r="3"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray="9.42 18.85"
          transform="rotate(-90 7 7)"
        />
      </svg>
    )
  }

  // unstarted / anything unrecognised
  return (
    <svg {...shared}>
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

export function priorityLabel(priority: LinearPriority): string {
  return PRIORITY_LABELS[priority]
}
