"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HOUSE_ART as ART } from "./house-art"
import "./iso.css"

// Panels are placed in installation order: bottom row first, west to east.
const SLOTS = ART.slotPolys.length
const COLS = ART.numbers.cols
const STAGGER = 0.045 // seconds between panels
const SETTLE = 0.42 // seconds for a panel to seat

const fmt2 = (n: number) => n.toFixed(2)
function arrayOf(count: number) {
  if (!count) return null
  const rows = Math.ceil(count / COLS)
  const cols = Math.min(count, COLS)
  const { panelW, panelH, gap } = ART.numbers
  return { w: cols * panelW + (cols - 1) * gap, h: rows * panelH + (rows - 1) * gap }
}
function readoutOf(requested: number, watts: number) {
  const shown = Math.min(requested, SLOTS)
  const size = arrayOf(shown)
  const head = `${shown} panel${shown === 1 ? "" : "s"} · ${((shown * watts) / 1000).toFixed(1)} kWp`
  const tail = size ? ` · ${fmt2(size.w)} × ${fmt2(size.h)} m` : " · bare roof"
  return requested > SLOTS ? `${head}${tail} · ${requested - SLOTS} won’t fit` : head + tail
}
function inside(point: [number, number], poly: number[][]) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const PLAN = arrayOf(20)!
const FULL = arrayOf(SLOTS)!

type PanelState = { t: number; target: 0 | 1; wait: number }

export function HouseFigure({ panels, watts, onPanels }: { panels: number; watts: number; onPanels: (count: number) => void }) {
  const shown = Math.min(Math.max(0, Math.round(panels)), SLOTS)
  const svgRef = useRef<SVGSVGElement>(null)
  const panelRefs = useRef<(SVGGElement | null)[]>([])
  const railRefs = useRef<(SVGGElement | null)[]>([])
  const state = useRef<PanelState[]>(Array.from({ length: SLOTS }, (_, i) => ({ t: i < shown ? 1 : 0, target: i < shown ? 1 : 0, wait: 0 })))
  const frame = useRef(0)
  const [hover, setHover] = useState<number | null>(null)

  const paint = useCallback(() => {
    const [lx, ly] = ART.lift
    state.current.forEach((p, i) => {
      const g = panelRefs.current[i]
      if (!g) return
      const e = ease(p.t)
      g.setAttribute("transform", `translate(${(lx * (1 - e)).toFixed(2)} ${(ly * (1 - e)).toFixed(2)})`)
      g.style.opacity = String(Math.min(1, p.t * 2.2))
      g.style.visibility = p.t <= 0.001 ? "hidden" : "visible"
    })
    railRefs.current.forEach((g, row) => {
      if (!g) return
      const lead = state.current[row * COLS]
      g.style.opacity = String(Math.min(1, Math.max(lead.t * 3, lead.target)))
    })
  }, [])

  // Retarget whenever the planner's panel count changes; stagger in install order.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const list = state.current
    let order = 0
    if (reduced) {
      list.forEach((p, i) => { p.target = i < shown ? 1 : 0; p.t = p.target; p.wait = 0 })
      paint()
      return
    }
    // Add from the lowest empty slot upward; remove from the top slot downward.
    list.forEach((p, i) => { if (i < shown && p.target === 0) { p.target = 1; p.wait = order++ * STAGGER } })
    order = 0
    for (let i = SLOTS - 1; i >= 0; i--) { const p = list[i]; if (i >= shown && p.target === 1) { p.target = 0; p.wait = order++ * STAGGER * 0.6 } }
    cancelAnimationFrame(frame.current)
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let moving = false
      for (const p of list) {
        if (p.wait > 0) { p.wait -= dt; moving = true; continue }
        const step = dt / SETTLE
        if (p.t < p.target) { p.t = Math.min(1, p.t + step); moving = true }
        else if (p.t > p.target) { p.t = Math.max(0, p.t - step * 1.4); moving = true }
      }
      paint()
      if (moving) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [shown, paint])

  useEffect(() => { paint() }, [paint])

  const slotAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return null
    const box = svg.getBoundingClientRect()
    const point: [number, number] = [((event.clientX - box.left) / box.width) * ART.width, ((event.clientY - box.top) / box.height) * ART.height]
    const index = ART.slotPolys.findIndex((poly) => inside(point, poly))
    return index < 0 ? null : index
  }
  const onKey = (event: React.KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: COLS, ArrowDown: -COLS }
    if (event.key in steps) {
      event.preventDefault()
      onPanels(Math.max(0, Math.min(SLOTS, shown + steps[event.key])))
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      onPanels(event.key === "Home" ? 0 : SLOTS)
    }
  }

  // Preview what a click would do: fill up to the slot, or clear back down to it.
  const preview = useMemo(() => {
    if (hover === null) return ""
    const from = Math.min(hover + 1, shown), to = Math.max(hover + 1, shown)
    const list = hover + 1 === shown ? [hover] : Array.from({ length: to - from }, (_, i) => from + i)
    return list.map((i) => `M${ART.slotPolys[i].map(([x, y]) => `${x} ${y}`).join("L")}Z`).join("")
  }, [hover, shown])

  return (
    <section className="sp-section shp-section iso" data-theme="light" aria-labelledby="shp-heading">
    <div className="sp-section-heading"><div><p className="sp-eyebrow">ON THE ROOF / THE PLAN</p><h2 id="shp-heading">Two rows now. A third if it’s needed.</h2></div><p className="sp-heading-note">Twenty panels along the bottom of the long pitch, {ART.numbers.roofLength.toFixed(1)} m verge to verge.<br/>The dashed slots hold room for ten more. Click one, or use the arrow keys, to try it.</p></div>
    <figure className="iso-figure shp-figure">
      <div className="iso-plate shp-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">Fig. 1</span>
          <span className="iso-plate-corner" data-corner="title">Panel pitch · {ART.numbers.pitch}° · {ART.numbers.roofLength.toFixed(1)} m</span>
          <span className="iso-plate-corner" data-corner="hint">Click a slot · ← → one panel · ↑ ↓ one row</span>
          <span className="iso-plate-corner" data-corner="readout">{readoutOf(panels, watts)}</span>
        </div>
        <div className="shp-stage">
          <svg
            ref={svgRef}
            className="iso-svg shp-svg"
            viewBox={`0 0 ${ART.width} ${ART.height}`}
            role="slider"
            tabIndex={0}
            aria-label={`${ART.label} Use the arrow keys to add or remove panels.`}
            aria-valuemin={0}
            aria-valuemax={SLOTS}
            aria-valuenow={shown}
            aria-valuetext={readoutOf(panels, watts)}
            onKeyDown={onKey}
            onPointerMove={(event) => setHover(slotAt(event))}
            onPointerLeave={() => setHover(null)}
            onClick={(event) => {
              const index = slotAt(event as unknown as React.PointerEvent<SVGSVGElement>)
              if (index !== null) onPanels(index + 1 === shown ? index : index + 1)
            }}
            data-hover={hover !== null ? "" : undefined}
          >
            <g dangerouslySetInnerHTML={{ __html: ART.back }} />
            <g dangerouslySetInnerHTML={{ __html: ART.slots }} />
            {ART.rails.map((rail, row) => (
              <g key={`rail-${row}`} ref={(el) => { railRefs.current[row] = el }} style={{ opacity: row * COLS < shown ? 1 : 0 }} dangerouslySetInnerHTML={{ __html: rail }} />
            ))}
            {ART.panels.map((panel, i) => (
              <g key={`panel-${i}`} ref={(el) => { panelRefs.current[i] = el }} style={{ visibility: i < shown ? "visible" : "hidden" }} dangerouslySetInnerHTML={{ __html: panel }} />
            ))}
            <g dangerouslySetInnerHTML={{ __html: ART.front }} />
            {preview ? <path className="shp-preview" d={preview} data-remove={hover !== null && hover + 1 <= shown ? "" : undefined} /> : null}
          </svg>
        </div>
      </div>
      <figcaption className="iso-legend">
        <span className="iso-keys">
          <span className="iso-key"><span className="shp-swatch shp-swatch-pv" />Panel, 1.762 × 1.134 m landscape</span>
          <span className="iso-key"><span className="shp-swatch shp-swatch-slot" />Free slot · row three is held for later</span>
          <span className="iso-key"><span className="shp-swatch shp-swatch-preview" />Click to fill or clear</span>
        </span>
        <span className="iso-caption">
          The plan is two rows of ten along the bottom of the pitch: a {fmt2(PLAN.w)} × {fmt2(PLAN.h)} m array, {((20 * watts) / 1000).toFixed(1)} kWp. A third row of ten would add {fmt2(FULL.h - PLAN.h)} m up the slope for {fmt2(FULL.w)} × {fmt2(FULL.h)} m and {((SLOTS * watts) / 1000).toFixed(1)} kWp, the most this pitch takes in landscape: an eleventh column needs 19.58 m and a fourth row 4.60 m of a {ART.numbers.slopeLength.toFixed(2)} m slope. On the roof plan the pitch is {ART.numbers.roofLength.toFixed(2)} m verge to verge ({ART.numbers.timberLength.toFixed(3)} m between the A and F timber faces), leaving {ART.numbers.vergeClear.toFixed(2)} m at each end. Plan from the roof drawing; the {ART.numbers.pitch}° pitch (the planner’s) and 2.8 m eaves are assumptions.
        </span>
      </figcaption>
    </figure>
    </section>
  )
}
