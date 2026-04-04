import "server-only"

import { randomUUID } from "node:crypto"
import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { createPrivateObjectSignedUrl } from "@/lib/storage"
import type {
  DecisionWorkspaceCategory,
  DecisionWorkspaceImage,
  DecisionWorkspaceItem,
  DecisionWorkspaceRoom,
  DecisionWorkspaceSelection,
  DecisionWorkspaceStatus,
} from "@/lib/decision-workspace"

declare global {
  // eslint-disable-next-line no-var
  var __courtyardHousePgPool: Pool | undefined
}

const TABLES = {
  rooms: "furniture_rooms",
  categories: "furniture_categories",
  items: "furniture_items",
  selections: "furniture_selections",
} as const

export const FURNITURE_BUDGET_CATEGORIES = [
  { id: "furniture_living", name: "Living furniture" },
  { id: "furniture_dining", name: "Dining furniture" },
  { id: "furniture_bedrooms", name: "Bedroom furniture" },
  { id: "furniture_office", name: "Office furniture" },
  { id: "furniture_storage", name: "Storage & utility furniture" },
  { id: "furniture_lighting", name: "Loose lighting" },
  { id: "furniture_soft", name: "Soft furnishings & rugs" },
  { id: "furniture_outdoor", name: "Outdoor furniture" },
  { id: "furniture_decor", name: "Art & decor" },
] as const

type FurnitureWorkspaceRow = QueryResultRow & {
  id: string
  code: string
  title: string
  budget_category_id: string
  room_id: string
  room_name: string
  decision_category_id: string
  decision_category_name: string
  type_group: string
  type_section: string
  baseline_spec: string
  baseline_budget_ex_vat: string | number
  quantity: string | number | null
  unit: string | null
  decision_stage: "now" | "later"
  priority: "high" | "medium" | "low"
  description: string | null
  architect_note: string | null
  current_selection_id: string | null
  status: DecisionWorkspaceStatus | null
  selected_name: string | null
  selected_source: string | null
  selected_source_url: string | null
  selected_cost_ex_vat: string | number | null
  selected_notes: string | null
  selected_images: unknown
  item_created_at: string | null
  item_updated_at: string | null
  selection_created_at: string | null
  selection_updated_at: string | null
}

type FurnitureRoomRow = QueryResultRow & {
  id: string
  name: string
  sort_order: number
}

type FurnitureCategoryRow = QueryResultRow & {
  id: string
  name: string
  sort_order: number
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the furniture database.")
  }

  return databaseUrl
}

function getPool(): Pool {
  if (!global.__courtyardHousePgPool) {
    global.__courtyardHousePgPool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: 5,
      ssl:
        process.env.DATABASE_URL?.includes("sslmode=require") ||
        process.env.POSTGRES_URL?.includes("sslmode=require")
          ? { rejectUnauthorized: false }
          : undefined,
    })
  }

  return global.__courtyardHousePgPool
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function createRecordId(prefix: string, seed: string): string {
  const slug = slugify(seed) || prefix
  return `${prefix}-${slug}-${randomUUID().slice(0, 8)}`
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function mapSelectionImages(value: unknown): DecisionWorkspaceImage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return []
    }

    const key = typeof entry.key === "string" ? entry.key.trim() : ""
    if (!key) {
      return []
    }

    return [
      {
        key,
        alt: typeof entry.alt === "string" ? entry.alt : undefined,
        sourceUrl: typeof entry.sourceUrl === "string" ? entry.sourceUrl : undefined,
      },
    ]
  })
}

function mapSelection(row: FurnitureWorkspaceRow): DecisionWorkspaceSelection | null {
  if (!row.current_selection_id || !row.status) {
    return null
  }

  const selectedImages = mapSelectionImages(row.selected_images)

  return {
    id: row.current_selection_id,
    status: row.status,
    selectedName: row.selected_name ?? undefined,
    selectedSource: row.selected_source ?? undefined,
    selectedSourceUrl: row.selected_source_url ?? undefined,
    selectedCostExVat: toNumber(row.selected_cost_ex_vat),
    selectedNotes: row.selected_notes ?? undefined,
    selectedImages,
    selectedImageUrls: selectedImages.map((image) =>
      createPrivateObjectSignedUrl(image.key, { expiresInSeconds: 60 * 60 }),
    ),
    createdAt: row.selection_created_at ?? undefined,
    updatedAt: row.selection_updated_at ?? undefined,
  }
}

function mapItem(row: FurnitureWorkspaceRow): DecisionWorkspaceItem {
  const selection = mapSelection(row)

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    categoryId: row.budget_category_id,
    roomId: row.room_id,
    decisionCategoryId: row.decision_category_id,
    decisionCategoryName: row.decision_category_name,
    roomGroup: row.room_name,
    roomSection: row.decision_category_name,
    roomName: row.room_name,
    typeGroup: row.type_group,
    typeSection: row.type_section,
    baselineSpec: row.baseline_spec,
    baselineBudgetExVat: Number(row.baseline_budget_ex_vat || 0),
    quantity: toNumber(row.quantity),
    unit: row.unit ?? undefined,
    decisionStage: row.decision_stage,
    priority: row.priority,
    description: row.description ?? undefined,
    architectNote: row.architect_note ?? undefined,
    status: selection?.status || "open",
    currentSelectionId: selection?.id,
    selectedName: selection?.selectedName,
    selectedSource: selection?.selectedSource,
    selectedSourceUrl: selection?.selectedSourceUrl,
    selectedCostExVat: selection?.selectedCostExVat,
    selectedNotes: selection?.selectedNotes,
    selectedImages: selection?.selectedImages,
    selectedImageUrls: selection?.selectedImageUrls,
    createdAt: row.item_created_at ?? undefined,
    updatedAt: row.item_updated_at ?? undefined,
  }
}

function mapRoom(row: FurnitureRoomRow): DecisionWorkspaceRoom {
  return { id: row.id, name: row.name, sortOrder: Number(row.sort_order || 0) }
}

function mapCategory(row: FurnitureCategoryRow): DecisionWorkspaceCategory {
  return { id: row.id, name: row.name, sortOrder: Number(row.sort_order || 0) }
}

async function getJoinedItems(client: Pool | PoolClient): Promise<DecisionWorkspaceItem[]> {
  const result = await client.query<FurnitureWorkspaceRow>(
    `
      select
        i.id,
        i.code,
        i.title,
        i.budget_category_id,
        r.id as room_id,
        r.name as room_name,
        c.id as decision_category_id,
        c.name as decision_category_name,
        i.type_group,
        i.type_section,
        i.baseline_spec,
        i.baseline_budget_ex_vat,
        i.quantity,
        i.unit,
        i.decision_stage,
        i.priority,
        i.description,
        i.architect_note,
        current_selection.id as current_selection_id,
        current_selection.status,
        current_selection.selected_name,
        current_selection.selected_source,
        current_selection.selected_source_url,
        current_selection.selected_cost_ex_vat,
        current_selection.selected_notes,
        current_selection.selected_images,
        i.created_at::text as item_created_at,
        i.updated_at::text as item_updated_at,
        current_selection.created_at::text as selection_created_at,
        current_selection.updated_at::text as selection_updated_at
      from ${TABLES.items} i
      join ${TABLES.rooms} r on r.id = i.room_id and r.is_active = true
      join ${TABLES.categories} c on c.id = i.decision_category_id and c.is_active = true
      left join lateral (
        select
          selection.id,
          selection.status,
          selection.selected_name,
          selection.selected_source,
          selection.selected_source_url,
          selection.selected_cost_ex_vat,
          selection.selected_notes,
          selection.selected_images,
          selection.created_at,
          selection.updated_at
        from ${TABLES.selections} selection
        where selection.item_id = i.id
          and selection.is_current = true
        order by selection.updated_at desc, selection.created_at desc
        limit 1
      ) current_selection on true
      where i.is_active = true
      order by r.sort_order, r.name, c.sort_order, c.name, i.item_order, i.title
    `,
  )

  return result.rows.map(mapItem)
}

async function getItemById(
  client: Pool | PoolClient,
  itemId: string,
): Promise<DecisionWorkspaceItem> {
  const result = await client.query<FurnitureWorkspaceRow>(
    `
      select
        i.id,
        i.code,
        i.title,
        i.budget_category_id,
        r.id as room_id,
        r.name as room_name,
        c.id as decision_category_id,
        c.name as decision_category_name,
        i.type_group,
        i.type_section,
        i.baseline_spec,
        i.baseline_budget_ex_vat,
        i.quantity,
        i.unit,
        i.decision_stage,
        i.priority,
        i.description,
        i.architect_note,
        current_selection.id as current_selection_id,
        current_selection.status,
        current_selection.selected_name,
        current_selection.selected_source,
        current_selection.selected_source_url,
        current_selection.selected_cost_ex_vat,
        current_selection.selected_notes,
        current_selection.selected_images,
        i.created_at::text as item_created_at,
        i.updated_at::text as item_updated_at,
        current_selection.created_at::text as selection_created_at,
        current_selection.updated_at::text as selection_updated_at
      from ${TABLES.items} i
      join ${TABLES.rooms} r on r.id = i.room_id and r.is_active = true
      join ${TABLES.categories} c on c.id = i.decision_category_id and c.is_active = true
      left join lateral (
        select
          selection.id,
          selection.status,
          selection.selected_name,
          selection.selected_source,
          selection.selected_source_url,
          selection.selected_cost_ex_vat,
          selection.selected_notes,
          selection.selected_images,
          selection.created_at,
          selection.updated_at
        from ${TABLES.selections} selection
        where selection.item_id = i.id
          and selection.is_current = true
        order by selection.updated_at desc, selection.created_at desc
        limit 1
      ) current_selection on true
      where i.id = $1
        and i.is_active = true
      limit 1
    `,
    [itemId],
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error("Furniture item not found.")
  }

  return mapItem(row)
}

async function getNextSortOrder(
  client: Pool | PoolClient,
  tableName: typeof TABLES.rooms | typeof TABLES.categories,
): Promise<number> {
  const result = await client.query<{ next_sort_order: string | number }>(
    `select coalesce(max(sort_order), 0) + 10 as next_sort_order from ${tableName}`,
  )
  return Number(result.rows[0]?.next_sort_order || 10)
}

async function getNextItemOrder(client: Pool | PoolClient): Promise<number> {
  const result = await client.query<{ next_item_order: string | number }>(
    `select coalesce(max(item_order), 0) + 1 as next_item_order from ${TABLES.items}`,
  )
  return Number(result.rows[0]?.next_item_order || 1)
}

export async function getFurnitureWorkspaceData(): Promise<{
  rooms: DecisionWorkspaceRoom[]
  categories: DecisionWorkspaceCategory[]
  items: DecisionWorkspaceItem[]
}> {
  const pool = getPool()
  const [roomsResult, categoriesResult, items] = await Promise.all([
    pool.query<FurnitureRoomRow>(
      `select id, name, sort_order from ${TABLES.rooms} where is_active = true order by sort_order, name`,
    ),
    pool.query<FurnitureCategoryRow>(
      `select id, name, sort_order from ${TABLES.categories} where is_active = true order by sort_order, name`,
    ),
    getJoinedItems(pool),
  ])

  return {
    rooms: roomsResult.rows.map(mapRoom),
    categories: categoriesResult.rows.map(mapCategory),
    items,
  }
}

export type UpdateFurnitureWorkspaceItemInput = {
  itemId: string
  status: DecisionWorkspaceStatus
  selectedName?: string | null
  selectedSource?: string | null
  selectedSourceUrl?: string | null
  selectedCostExVat?: number | null
  selectedNotes?: string | null
  selectedImages?: DecisionWorkspaceImage[]
}

export async function updateFurnitureWorkspaceItem(
  input: UpdateFurnitureWorkspaceItemInput,
): Promise<DecisionWorkspaceItem> {
  const pool = getPool()
  const selectedCost =
    input.selectedCostExVat === null || input.selectedCostExVat === undefined
      ? null
      : Number(input.selectedCostExVat)

  if (selectedCost !== null && (!Number.isFinite(selectedCost) || selectedCost < 0)) {
    throw new Error("Selected cost must be zero or greater.")
  }

  const client = await pool.connect()

  try {
    await client.query("begin")
    const normalizedSelectedImages = mapSelectionImages(input.selectedImages)

    const existingResult = await client.query<{ baseline_budget_ex_vat: string | number }>(
      `select baseline_budget_ex_vat from ${TABLES.items} where id = $1 and is_active = true limit 1`,
      [input.itemId],
    )
    const existing = existingResult.rows[0]
    if (!existing) {
      throw new Error("Furniture item not found.")
    }

    await client.query(
      `update ${TABLES.selections} set is_current = false, updated_at = now() where item_id = $1 and is_current = true`,
      [input.itemId],
    )

    if (input.status !== "open") {
      const baselineBudgetExVat = Number(existing.baseline_budget_ex_vat || 0)
      const selectedName =
        input.status === "selected"
          ? input.selectedName?.trim() || "Baseline allowance"
          : input.selectedName?.trim() || null
      const normalizedSelectedSource = input.selectedSource?.trim() || null
      const normalizedSelectedSourceUrl = input.selectedSourceUrl?.trim() || null
      const normalizedSelectedNotes = input.selectedNotes?.trim() || null
      const resolvedCost =
        input.status === "selected" ? selectedCost ?? baselineBudgetExVat : selectedCost

      await client.query(
        `
          insert into ${TABLES.selections} (
            id, item_id, status, selected_name, selected_source, selected_source_url,
            selected_cost_ex_vat, selected_notes, selected_images, is_current
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
        `,
        [
          `sel-${randomUUID()}`,
          input.itemId,
          input.status,
          selectedName,
          normalizedSelectedSource,
          normalizedSelectedSourceUrl,
          resolvedCost,
          normalizedSelectedNotes,
          JSON.stringify(normalizedSelectedImages),
        ],
      )
    }

    await client.query(`update ${TABLES.items} set updated_at = now() where id = $1`, [input.itemId])
    const item = await getItemById(client, input.itemId)
    await client.query("commit")
    return item
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}

export async function saveFurnitureWorkspaceRoom(input: {
  roomId?: string
  name: string
  sortOrder?: number | null
}): Promise<DecisionWorkspaceRoom> {
  const pool = getPool()
  const normalizedName = input.name.trim()
  if (!normalizedName) throw new Error("Room name is required.")

  const client = await pool.connect()
  try {
    const sortOrder =
      input.sortOrder === null || input.sortOrder === undefined
        ? input.roomId
          ? null
          : await getNextSortOrder(client, TABLES.rooms)
        : Number(input.sortOrder)

    if (sortOrder !== null && !Number.isFinite(sortOrder)) {
      throw new Error("Room sort order must be a number.")
    }

    const roomId = input.roomId || createRecordId("furniture-room", normalizedName)
    const result = await client.query<FurnitureRoomRow>(
      `
        insert into ${TABLES.rooms} (id, name, sort_order, is_active)
        values ($1, $2, coalesce($3, 10), true)
        on conflict (id) do update
        set name = excluded.name,
            sort_order = coalesce($3, ${TABLES.rooms}.sort_order),
            is_active = true,
            updated_at = now()
        returning id, name, sort_order
      `,
      [roomId, normalizedName, sortOrder],
    )
    return mapRoom(result.rows[0])
  } finally {
    client.release()
  }
}

export async function saveFurnitureWorkspaceCategory(input: {
  categoryId?: string
  name: string
  sortOrder?: number | null
}): Promise<DecisionWorkspaceCategory> {
  const pool = getPool()
  const normalizedName = input.name.trim()
  if (!normalizedName) throw new Error("Category name is required.")

  const client = await pool.connect()
  try {
    const sortOrder =
      input.sortOrder === null || input.sortOrder === undefined
        ? input.categoryId
          ? null
          : await getNextSortOrder(client, TABLES.categories)
        : Number(input.sortOrder)

    if (sortOrder !== null && !Number.isFinite(sortOrder)) {
      throw new Error("Category sort order must be a number.")
    }

    const categoryId = input.categoryId || createRecordId("furniture-cat", normalizedName)
    const result = await client.query<FurnitureCategoryRow>(
      `
        insert into ${TABLES.categories} (id, name, sort_order, is_active)
        values ($1, $2, coalesce($3, 10), true)
        on conflict (id) do update
        set name = excluded.name,
            sort_order = coalesce($3, ${TABLES.categories}.sort_order),
            is_active = true,
            updated_at = now()
        returning id, name, sort_order
      `,
      [categoryId, normalizedName, sortOrder],
    )
    return mapCategory(result.rows[0])
  } finally {
    client.release()
  }
}

export async function duplicateFurnitureWorkspaceItem(
  itemId: string,
): Promise<DecisionWorkspaceItem> {
  const pool = getPool()
  const normalizedItemId = itemId.trim()
  if (!normalizedItemId) {
    throw new Error("Furniture item is required.")
  }

  const client = await pool.connect()
  try {
    await client.query("begin")
    const sourceItem = await getItemById(client, normalizedItemId)
    const duplicatedTitle = `${sourceItem.title} copy`
    const duplicatedItemId = createRecordId("furniture-item", duplicatedTitle)
    const codeBase = slugify(duplicatedTitle).replace(/-/g, "_").toUpperCase() || "FURNITURE"
    const duplicatedCode = `${codeBase}_${duplicatedItemId.slice(-6).replace(/-/g, "").toUpperCase()}`
    const duplicatedItemOrder = await getNextItemOrder(client)

    await client.query(
      `
        insert into ${TABLES.items} (
          id, code, title, budget_category_id, room_id, decision_category_id, type_group,
          type_section, item_order, baseline_spec, baseline_budget_ex_vat, quantity, unit,
          decision_stage, priority, description, architect_note, is_active
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)
      `,
      [
        duplicatedItemId,
        duplicatedCode,
        duplicatedTitle,
        sourceItem.categoryId,
        sourceItem.roomId,
        sourceItem.decisionCategoryId,
        sourceItem.typeGroup,
        sourceItem.typeSection,
        duplicatedItemOrder,
        sourceItem.baselineSpec,
        sourceItem.baselineBudgetExVat,
        sourceItem.quantity ?? null,
        sourceItem.unit ?? null,
        sourceItem.decisionStage,
        sourceItem.priority,
        sourceItem.description ?? null,
        sourceItem.architectNote ?? null,
      ],
    )

    if (sourceItem.currentSelectionId && sourceItem.status !== "open") {
      await client.query(
        `
          insert into ${TABLES.selections} (
            id, item_id, status, selected_name, selected_source, selected_source_url,
            selected_cost_ex_vat, selected_notes, selected_images, is_current
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
        `,
        [
          `sel-${randomUUID()}`,
          duplicatedItemId,
          sourceItem.status,
          sourceItem.selectedName ?? null,
          sourceItem.selectedSource ?? null,
          sourceItem.selectedSourceUrl ?? null,
          sourceItem.selectedCostExVat ?? null,
          sourceItem.selectedNotes ?? null,
          JSON.stringify(sourceItem.selectedImages || []),
        ],
      )
    }

    const duplicatedItem = await getItemById(client, duplicatedItemId)
    await client.query("commit")
    return duplicatedItem
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}

export async function saveFurnitureWorkspaceItem(input: {
  itemId?: string
  title: string
  categoryId: string
  roomId: string
  decisionCategoryId: string
  typeGroup: string
  typeSection: string
  baselineSpec: string
  baselineBudgetExVat: number
  quantity?: number | null
  unit?: string | null
  decisionStage: "now" | "later"
  priority: "high" | "medium" | "low"
  description?: string | null
  architectNote?: string | null
}): Promise<DecisionWorkspaceItem> {
  const normalizedTitle = input.title.trim()
  const normalizedTypeGroup = input.typeGroup.trim()
  const normalizedTypeSection = input.typeSection.trim()
  const normalizedBaselineSpec = input.baselineSpec.trim()
  const normalizedDescription = input.description?.trim() || null
  const normalizedArchitectNote = input.architectNote?.trim() || null
  const normalizedUnit = input.unit?.trim() || null
  const baselineBudgetExVat = Number(input.baselineBudgetExVat)
  const quantity =
    input.quantity === null || input.quantity === undefined || input.quantity === 0
      ? null
      : Number(input.quantity)

  if (!normalizedTitle) throw new Error("Item title is required.")
  if (!input.categoryId.trim()) throw new Error("Budget category is required.")
  if (!input.roomId.trim()) throw new Error("Room is required.")
  if (!input.decisionCategoryId.trim()) throw new Error("Decision category is required.")
  if (!normalizedTypeGroup || !normalizedTypeSection) {
    throw new Error("Type group and type section are required.")
  }
  if (!normalizedBaselineSpec) throw new Error("Baseline allowance description is required.")
  if (!Number.isFinite(baselineBudgetExVat) || baselineBudgetExVat < 0) {
    throw new Error("Baseline budget must be zero or greater.")
  }
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    throw new Error("Quantity must be zero or greater.")
  }

  const client = await getPool().connect()
  try {
    const itemId = input.itemId || createRecordId("furniture-item", normalizedTitle)
    const codeBase = slugify(normalizedTitle).replace(/-/g, "_").toUpperCase() || "FURNITURE"
    const code = input.itemId
      ? codeBase
      : `${codeBase}_${itemId.slice(-6).replace(/-/g, "").toUpperCase()}`
    const itemOrder = input.itemId ? null : await getNextItemOrder(client)

    await client.query(
      `
        insert into ${TABLES.items} (
          id, code, title, budget_category_id, room_id, decision_category_id, type_group,
          type_section, item_order, baseline_spec, baseline_budget_ex_vat, quantity, unit,
          decision_stage, priority, description, architect_note, is_active
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9, 1),$10,$11,$12,$13,$14,$15,$16,$17,true)
        on conflict (id) do update
        set title = excluded.title,
            budget_category_id = excluded.budget_category_id,
            room_id = excluded.room_id,
            decision_category_id = excluded.decision_category_id,
            type_group = excluded.type_group,
            type_section = excluded.type_section,
            baseline_spec = excluded.baseline_spec,
            baseline_budget_ex_vat = excluded.baseline_budget_ex_vat,
            quantity = excluded.quantity,
            unit = excluded.unit,
            decision_stage = excluded.decision_stage,
            priority = excluded.priority,
            description = excluded.description,
            architect_note = excluded.architect_note,
            is_active = true,
            updated_at = now()
      `,
      [
        itemId,
        code,
        normalizedTitle,
        input.categoryId.trim(),
        input.roomId.trim(),
        input.decisionCategoryId.trim(),
        normalizedTypeGroup,
        normalizedTypeSection,
        itemOrder,
        normalizedBaselineSpec,
        baselineBudgetExVat,
        quantity,
        normalizedUnit,
        input.decisionStage,
        input.priority,
        normalizedDescription,
        normalizedArchitectNote,
      ],
    )

    return getItemById(client, itemId)
  } finally {
    client.release()
  }
}
