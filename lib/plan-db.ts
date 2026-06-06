import "server-only"

import { randomUUID } from "node:crypto"
import type { QueryResultRow } from "pg"
import { getPool } from "@/lib/decisions-db"

const PLAN_SLUG = "courtyard-house"

export type PlanConfig = {
  slug: string
  name: string
  imageKey: string | null
  gridCols: number
  gridRows: number
}

export type PlanLayer = {
  id: string
  name: string
  sortOrder: number
}

export type PlanZone = {
  id: string
  layerId: string | null
  name: string
  color: string
  description: string | null
  squares: number[]
  decisionItemIds: string[]
  sortOrder: number
}

type PlanConfigRow = QueryResultRow & {
  slug: string
  name: string
  image_key: string | null
  grid_cols: number
  grid_rows: number
}

type PlanLayerRow = QueryResultRow & {
  id: string
  name: string
  sort_order: number
}

type PlanZoneRow = QueryResultRow & {
  id: string
  layer_id: string | null
  name: string
  color: string
  description: string | null
  squares: unknown
  decision_item_ids: unknown
  sort_order: number
}

function toIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function mapConfigRow(row: PlanConfigRow): PlanConfig {
  return {
    slug: row.slug,
    name: row.name,
    imageKey: row.image_key ?? null,
    gridCols: Number(row.grid_cols) || 100,
    gridRows: Number(row.grid_rows) || 100,
  }
}

function mapLayerRow(row: PlanLayerRow): PlanLayer {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order) || 0,
  }
}

function mapZoneRow(row: PlanZoneRow): PlanZone {
  return {
    id: row.id,
    layerId: row.layer_id ?? null,
    name: row.name,
    color: row.color,
    description: row.description ?? null,
    squares: toIntArray(row.squares),
    decisionItemIds: toStringArray(row.decision_item_ids),
    sortOrder: Number(row.sort_order) || 0,
  }
}

export async function getPlanConfig(): Promise<PlanConfig> {
  const pool = getPool()
  const result = await pool.query<PlanConfigRow>(
    `INSERT INTO plan_config (slug) VALUES ($1)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING slug, name, image_key, grid_cols, grid_rows`,
    [PLAN_SLUG],
  )
  return mapConfigRow(result.rows[0])
}

export async function getPlanLayers(): Promise<PlanLayer[]> {
  const pool = getPool()
  const result = await pool.query<PlanLayerRow>(
    `SELECT id, name, sort_order
     FROM plan_layers
     WHERE plan_slug = $1 AND is_active = true
     ORDER BY sort_order ASC, created_at ASC`,
    [PLAN_SLUG],
  )
  return result.rows.map(mapLayerRow)
}

export async function getPlanZones(): Promise<PlanZone[]> {
  const pool = getPool()
  const result = await pool.query<PlanZoneRow>(
    `SELECT id, layer_id, name, color, description, squares, decision_item_ids, sort_order
     FROM plan_zones
     WHERE plan_slug = $1 AND is_active = true
     ORDER BY sort_order ASC, created_at ASC`,
    [PLAN_SLUG],
  )
  return result.rows.map(mapZoneRow)
}

export async function getPlanData(): Promise<{
  config: PlanConfig
  layers: PlanLayer[]
  zones: PlanZone[]
}> {
  const [config, layers, zones] = await Promise.all([
    getPlanConfig(),
    getPlanLayers(),
    getPlanZones(),
  ])
  return { config, layers, zones }
}

export async function savePlanLayer(input: {
  layerId?: string | null
  name: string
}): Promise<PlanLayer> {
  const pool = getPool()
  const name = input.name.trim()
  const id = input.layerId?.trim() || `plan-layer-${randomUUID().slice(0, 12)}`

  const result = await pool.query<PlanLayerRow>(
    `INSERT INTO plan_layers (id, plan_slug, name, sort_order)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM plan_layers WHERE plan_slug = $2), 0))
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = now()
     RETURNING id, name, sort_order`,
    [id, PLAN_SLUG, name],
  )
  return mapLayerRow(result.rows[0])
}

export async function deletePlanLayer(layerId: string): Promise<void> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      `UPDATE plan_zones SET is_active = false, updated_at = now() WHERE layer_id = $1`,
      [layerId],
    )
    await client.query(
      `UPDATE plan_layers SET is_active = false, updated_at = now()
       WHERE id = $1 AND plan_slug = $2`,
      [layerId, PLAN_SLUG],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export type SavePlanZoneInput = {
  zoneId?: string | null
  layerId: string
  name: string
  color: string
  description?: string | null
  squares: number[]
  decisionItemIds: string[]
}

export async function savePlanZone(input: SavePlanZoneInput): Promise<PlanZone> {
  const pool = getPool()
  const client = await pool.connect()

  const squares = [...new Set(toIntArray(input.squares))].sort((a, b) => a - b)
  const decisionItemIds = [...new Set(toStringArray(input.decisionItemIds))]
  const name = input.name.trim()
  const color = input.color.trim()
  const description = input.description?.trim() ? input.description.trim() : null

  try {
    await client.query("BEGIN")

    const id =
      input.zoneId?.trim() || `plan-zone-${randomUUID().slice(0, 12)}`
    const layerId = input.layerId.trim()

    await client.query(
      `INSERT INTO plan_zones (id, plan_slug, layer_id, name, color, description, squares, decision_item_ids, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
         layer_id = EXCLUDED.layer_id,
         name = EXCLUDED.name,
         color = EXCLUDED.color,
         description = EXCLUDED.description,
         squares = EXCLUDED.squares,
         decision_item_ids = EXCLUDED.decision_item_ids,
         is_active = true,
         updated_at = now()`,
      [
        id,
        PLAN_SLUG,
        layerId,
        name,
        color,
        description,
        JSON.stringify(squares),
        JSON.stringify(decisionItemIds),
      ],
    )

    // Enforce one-zone-per-square *within the same plan/layer*: strip these squares
    // out of every other zone on this layer (other layers are independent).
    if (squares.length > 0) {
      const others = await client.query<PlanZoneRow & { id: string }>(
        `SELECT id, squares FROM plan_zones
         WHERE plan_slug = $1 AND is_active = true AND layer_id = $2 AND id <> $3`,
        [PLAN_SLUG, layerId, id],
      )

      const taken = new Set(squares)
      for (const other of others.rows) {
        const existing = toIntArray(other.squares)
        const filtered = existing.filter((cell) => !taken.has(cell))
        if (filtered.length !== existing.length) {
          await client.query(
            `UPDATE plan_zones SET squares = $2::jsonb, updated_at = now() WHERE id = $1`,
            [other.id, JSON.stringify(filtered)],
          )
        }
      }
    }

    const saved = await client.query<PlanZoneRow>(
      `SELECT id, layer_id, name, color, description, squares, decision_item_ids, sort_order
       FROM plan_zones WHERE id = $1`,
      [id],
    )

    await client.query("COMMIT")
    return mapZoneRow(saved.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function deletePlanZone(zoneId: string): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE plan_zones SET is_active = false, updated_at = now()
     WHERE id = $1 AND plan_slug = $2`,
    [zoneId, PLAN_SLUG],
  )
}

export async function savePlanConfig(input: {
  imageKey?: string | null
  name?: string | null
}): Promise<PlanConfig> {
  const pool = getPool()
  const result = await pool.query<PlanConfigRow>(
    `INSERT INTO plan_config (slug, name, image_key, updated_at)
     VALUES ($1, COALESCE($2, 'Courtyard House'), $3, now())
     ON CONFLICT (slug) DO UPDATE SET
       name = COALESCE($2, plan_config.name),
       image_key = COALESCE($3, plan_config.image_key),
       updated_at = now()
     RETURNING slug, name, image_key, grid_cols, grid_rows`,
    [
      PLAN_SLUG,
      input.name?.trim() || null,
      input.imageKey?.trim() || null,
    ],
  )
  return mapConfigRow(result.rows[0])
}
