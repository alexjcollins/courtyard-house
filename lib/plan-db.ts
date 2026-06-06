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

export type PlanZone = {
  id: string
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

type PlanZoneRow = QueryResultRow & {
  id: string
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

function mapZoneRow(row: PlanZoneRow): PlanZone {
  return {
    id: row.id,
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

export async function getPlanZones(): Promise<PlanZone[]> {
  const pool = getPool()
  const result = await pool.query<PlanZoneRow>(
    `SELECT id, name, color, description, squares, decision_item_ids, sort_order
     FROM plan_zones
     WHERE plan_slug = $1 AND is_active = true
     ORDER BY sort_order ASC, created_at ASC`,
    [PLAN_SLUG],
  )
  return result.rows.map(mapZoneRow)
}

export async function getPlanData(): Promise<{
  config: PlanConfig
  zones: PlanZone[]
}> {
  const [config, zones] = await Promise.all([getPlanConfig(), getPlanZones()])
  return { config, zones }
}

export type SavePlanZoneInput = {
  zoneId?: string | null
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

    await client.query(
      `INSERT INTO plan_zones (id, plan_slug, name, color, description, squares, decision_item_ids, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET
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
        name,
        color,
        description,
        JSON.stringify(squares),
        JSON.stringify(decisionItemIds),
      ],
    )

    // Enforce one-zone-per-square: strip these squares out of every other zone.
    if (squares.length > 0) {
      const others = await client.query<PlanZoneRow & { id: string }>(
        `SELECT id, squares FROM plan_zones
         WHERE plan_slug = $1 AND is_active = true AND id <> $2`,
        [PLAN_SLUG, id],
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
      `SELECT id, name, color, description, squares, decision_item_ids, sort_order
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
