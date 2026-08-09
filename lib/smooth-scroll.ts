// Scroll helpers that animate on requestAnimationFrame instead of relying on
// `behavior: "smooth"`.
//
// Native smooth scrolling is not dependable: some browsers and automation
// environments ignore the option entirely, and the scroll then never happens at all —
// a silent no-op rather than a graceful instant jump. Driving the animation ourselves
// means the scroll always lands, and reduced-motion users get an instant jump on
// purpose rather than by accident.

const DEFAULT_DURATION_MS = 420

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function animate(
  from: number,
  to: number,
  apply: (value: number) => void,
  duration: number,
): void {
  if (from === to) return

  // requestAnimationFrame is frozen while the tab is hidden, which would otherwise
  // strand the scroll part-way through. Jump straight to the destination instead.
  if (prefersReducedMotion() || duration <= 0 || document.hidden) {
    apply(to)
    return
  }

  const start = performance.now()

  function step(now: number) {
    const progress = Math.min((now - start) / duration, 1)
    apply(from + (to - from) * easeInOutCubic(progress))
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

/** Horizontally scrolls a container to `left`, clamped to its scrollable range. */
export function scrollElementLeftTo(
  element: HTMLElement,
  left: number,
  duration = DEFAULT_DURATION_MS,
): void {
  const max = Math.max(element.scrollWidth - element.clientWidth, 0)
  const target = Math.min(Math.max(left, 0), max)
  animate(
    element.scrollLeft,
    target,
    (value) => {
      element.scrollLeft = value
    },
    duration,
  )
}

/**
 * Scrolls the page so `element` sits `offset` px below the top of the viewport,
 * leaving room for the sticky header.
 */
export function scrollWindowToElement(
  element: HTMLElement,
  offset = 100,
  duration = DEFAULT_DURATION_MS,
): void {
  const target = element.getBoundingClientRect().top + window.scrollY - offset
  const max = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    0,
  )
  animate(
    window.scrollY,
    Math.min(Math.max(target, 0), max),
    (value) => window.scrollTo(0, value),
    duration,
  )
}
