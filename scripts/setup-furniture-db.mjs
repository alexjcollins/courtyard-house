import { readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

const { Pool } = pg

async function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName)

  try {
    const content = await readFile(filePath, "utf8")
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue

      const separatorIndex = line.indexOf("=")
      if (separatorIndex === -1) continue

      const key = line.slice(0, separatorIndex).trim()
      if (!key || process.env[key]) continue

      let value = line.slice(separatorIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      process.env[key] = value
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return
    }

    throw error
  }
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const ROOM_ORDER = {
  Entranceway: 10,
  "Kitchen / dining / living": 20,
  Office: 30,
  "Master bedroom": 40,
  "Guest bedroom 1": 50,
  "Guest bedroom 2": 60,
  "Hallways / stair / circulation": 70,
  "Utility room": 80,
  Garage: 90,
  "Courtyard / external interface": 100,
}

const CATEGORY_ORDER = {
  "Entry furniture": 10,
  "Living seating": 20,
  "Living storage": 30,
  Dining: 40,
  "Office furniture": 50,
  "Bedroom furniture": 60,
  "Hall furniture": 70,
  "Utility & garage": 80,
  "Outdoor furniture": 90,
}

let itemOrder = 0
const items = []

function addItem({
  room,
  decisionCategory,
  title,
  budgetCategoryId,
  typeGroup,
  typeSection,
  baselineBudgetExVat,
  baselineSpec,
  description = "",
  decisionStage = "later",
  priority = "medium",
  quantity = null,
  unit = null,
}) {
  itemOrder += 1
  const id = `furniture-${slugify(room)}-${slugify(title)}`
  const code = `${slugify(title).replace(/-/g, "_").toUpperCase()}_${String(itemOrder).padStart(3, "0")}`

  items.push({
    id,
    code,
    title,
    budgetCategoryId,
    room,
    decisionCategory,
    typeGroup,
    typeSection,
    baselineBudgetExVat,
    baselineSpec,
    description,
    decisionStage,
    priority,
    quantity,
    unit,
    itemOrder,
  })
}

function addBedroomFurniture(room, base) {
  addItem({
    room,
    decisionCategory: "Bedroom furniture",
    title: "Bed frame",
    budgetCategoryId: "furniture_bedrooms",
    typeGroup: "Beds & mattresses",
    typeSection: "Bed frames",
    baselineBudgetExVat: base.bedFrame,
    baselineSpec: "Controlled upholstered or timber bed frame allowance.",
  })
  addItem({
    room,
    decisionCategory: "Bedroom furniture",
    title: "Mattress",
    budgetCategoryId: "furniture_bedrooms",
    typeGroup: "Beds & mattresses",
    typeSection: "Mattresses",
    baselineBudgetExVat: base.mattress,
    baselineSpec: "Good quality mattress allowance separate from the bed frame.",
  })
  addItem({
    room,
    decisionCategory: "Bedroom furniture",
    title: "Bedside tables",
    budgetCategoryId: "furniture_bedrooms",
    typeGroup: "Storage",
    typeSection: "Bedroom occasional tables",
    baselineBudgetExVat: base.bedsideTables,
    baselineSpec: "Pair of bedside tables within the furniture allowance.",
    quantity: 2,
    unit: "items",
  })
  addItem({
    room,
    decisionCategory: "Bedroom furniture",
    title: "Bedside lamps",
    budgetCategoryId: "furniture_lighting",
    typeGroup: "Loose lighting",
    typeSection: "Bedroom lamps",
    baselineBudgetExVat: base.bedsideLamps,
    baselineSpec: "Pair of loose bedside lamps rather than integrated joinery lighting.",
    quantity: 2,
    unit: "items",
  })
  addItem({
    room,
    decisionCategory: "Bedroom furniture",
    title: "Dresser / occasional storage",
    budgetCategoryId: "furniture_storage",
    typeGroup: "Storage",
    typeSection: "Bedroom storage",
    baselineBudgetExVat: base.storage,
    baselineSpec: "Loose storage allowance for dresser, chest, or compact desk.",
  })
  addItem({
    room,
    decisionCategory: "Bedroom furniture",
    title: "Bedroom rug",
    budgetCategoryId: "furniture_soft",
    typeGroup: "Soft furnishings",
    typeSection: "Bedroom rugs",
    baselineBudgetExVat: base.rug,
    baselineSpec: "Loose area rug allowance.",
  })
}

addItem({
  room: "Entranceway",
  decisionCategory: "Entry furniture",
  title: "Entrance bench",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Seating",
  typeSection: "Entry seating",
  baselineBudgetExVat: 1200,
  baselineSpec: "Bench or daybed-style entrance perch with durable finish.",
})
addItem({
  room: "Entranceway",
  decisionCategory: "Entry furniture",
  title: "Console table",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Tables",
  typeSection: "Console tables",
  baselineBudgetExVat: 1800,
  baselineSpec: "Slim entrance console or hall table.",
})
addItem({
  room: "Entranceway",
  decisionCategory: "Entry furniture",
  title: "Entrance mirror",
  budgetCategoryId: "furniture_decor",
  typeGroup: "Decor",
  typeSection: "Mirrors",
  baselineBudgetExVat: 600,
  baselineSpec: "Statement entrance mirror allowance.",
})
addItem({
  room: "Entranceway",
  decisionCategory: "Entry furniture",
  title: "Entrance runner",
  budgetCategoryId: "furniture_soft",
  typeGroup: "Soft furnishings",
  typeSection: "Entry rugs",
  baselineBudgetExVat: 400,
  baselineSpec: "Durable runner or entry rug allowance.",
})
addItem({
  room: "Entranceway",
  decisionCategory: "Entry furniture",
  title: "Coat and shoe storage",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Entry storage",
  baselineBudgetExVat: 900,
  baselineSpec: "Loose coat stand, pegs, or shoe cabinet allowance.",
})

addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Main sofa",
  budgetCategoryId: "furniture_living",
  typeGroup: "Seating",
  typeSection: "Primary sofas",
  baselineBudgetExVat: 7000,
  baselineSpec: "Primary family sofa allowance sized for the main living area.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Secondary sofa or daybed",
  budgetCategoryId: "furniture_living",
  typeGroup: "Seating",
  typeSection: "Secondary sofas",
  baselineBudgetExVat: 3500,
  baselineSpec: "Secondary sofa, daybed, or deep built-out lounge seat equivalent.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Lounge chairs",
  budgetCategoryId: "furniture_living",
  typeGroup: "Seating",
  typeSection: "Occasional chairs",
  baselineBudgetExVat: 3500,
  baselineSpec: "Pair of lounge chairs for the main living volume.",
  quantity: 2,
  unit: "items",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Coffee table",
  budgetCategoryId: "furniture_living",
  typeGroup: "Tables",
  typeSection: "Coffee tables",
  baselineBudgetExVat: 1800,
  baselineSpec: "Large-format coffee table allowance.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Side tables",
  budgetCategoryId: "furniture_living",
  typeGroup: "Tables",
  typeSection: "Side tables",
  baselineBudgetExVat: 1200,
  baselineSpec: "Set of side tables for loose living arrangement.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living storage",
  title: "Media console",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Living storage",
  baselineBudgetExVat: 2400,
  baselineSpec: "Loose media unit or AV console allowance.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living storage",
  title: "Sideboard or bar cabinet",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Living storage",
  baselineBudgetExVat: 2400,
  baselineSpec: "Ancillary storage or bar cabinet allowance.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Living room rug",
  budgetCategoryId: "furniture_soft",
  typeGroup: "Soft furnishings",
  typeSection: "Living rugs",
  baselineBudgetExVat: 2200,
  baselineSpec: "Main rug allowance sized for the living seating zone.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Living seating",
  title: "Loose living lighting",
  budgetCategoryId: "furniture_lighting",
  typeGroup: "Loose lighting",
  typeSection: "Living lamps",
  baselineBudgetExVat: 1800,
  baselineSpec: "Floor and table lamp allowance, separate from built lighting.",
})

addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Dining",
  title: "Dining table",
  budgetCategoryId: "furniture_dining",
  typeGroup: "Tables",
  typeSection: "Dining tables",
  baselineBudgetExVat: 5000,
  baselineSpec: "Large dining table allowance sized for entertaining.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Dining",
  title: "Dining chairs",
  budgetCategoryId: "furniture_dining",
  typeGroup: "Seating",
  typeSection: "Dining chairs",
  baselineBudgetExVat: 4800,
  baselineSpec: "Allowance for eight dining chairs.",
  quantity: 8,
  unit: "chairs",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Dining",
  title: "Kitchen island stools",
  budgetCategoryId: "furniture_dining",
  typeGroup: "Seating",
  typeSection: "Bar stools",
  baselineBudgetExVat: 1600,
  baselineSpec: "Allowance for four counter stools.",
  quantity: 4,
  unit: "stools",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Dining",
  title: "Dining bench or banquette loose furniture",
  budgetCategoryId: "furniture_dining",
  typeGroup: "Seating",
  typeSection: "Dining benches",
  baselineBudgetExVat: 1800,
  baselineSpec: "Optional dining bench or loose banquette-style furniture piece.",
})
addItem({
  room: "Kitchen / dining / living",
  decisionCategory: "Dining",
  title: "Loose decorative dining lighting",
  budgetCategoryId: "furniture_lighting",
  typeGroup: "Loose lighting",
  typeSection: "Dining decorative lighting",
  baselineBudgetExVat: 1500,
  baselineSpec: "Allowance for decorative pendant or feature fitting over the dining setting.",
})

addItem({
  room: "Office",
  decisionCategory: "Office furniture",
  title: "Main desk",
  budgetCategoryId: "furniture_office",
  typeGroup: "Office furniture",
  typeSection: "Desks",
  baselineBudgetExVat: 2200,
  baselineSpec: "Main desk sized for full-time work.",
})
addItem({
  room: "Office",
  decisionCategory: "Office furniture",
  title: "Task chair",
  budgetCategoryId: "furniture_office",
  typeGroup: "Office furniture",
  typeSection: "Desk seating",
  baselineBudgetExVat: 900,
  baselineSpec: "Ergonomic task chair allowance.",
})
addItem({
  room: "Office",
  decisionCategory: "Office furniture",
  title: "Guest chairs",
  budgetCategoryId: "furniture_office",
  typeGroup: "Office furniture",
  typeSection: "Guest seating",
  baselineBudgetExVat: 1200,
  baselineSpec: "Pair of guest or reading chairs.",
  quantity: 2,
  unit: "chairs",
})
addItem({
  room: "Office",
  decisionCategory: "Office furniture",
  title: "Office storage credenza",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Office storage",
  baselineBudgetExVat: 1600,
  baselineSpec: "Credenza or low storage cabinet for office equipment and files.",
})
addItem({
  room: "Office",
  decisionCategory: "Office furniture",
  title: "Bookcase or shelving",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Office shelving",
  baselineBudgetExVat: 1500,
  baselineSpec: "Loose shelving or bookcase allowance.",
})
addItem({
  room: "Office",
  decisionCategory: "Office furniture",
  title: "Task or reading lamp",
  budgetCategoryId: "furniture_lighting",
  typeGroup: "Loose lighting",
  typeSection: "Office lighting",
  baselineBudgetExVat: 350,
  baselineSpec: "Desk or reading lamp allowance.",
})

addBedroomFurniture("Master bedroom", {
  bedFrame: 3000,
  mattress: 2500,
  bedsideTables: 1200,
  bedsideLamps: 500,
  storage: 1600,
  rug: 1200,
})
addItem({
  room: "Master bedroom",
  decisionCategory: "Bedroom furniture",
  title: "Bedroom bench or chaise",
  budgetCategoryId: "furniture_bedrooms",
  typeGroup: "Seating",
  typeSection: "Bedroom seating",
  baselineBudgetExVat: 900,
  baselineSpec: "Loose bench, ottoman, or chaise at the foot of the bed.",
})
addItem({
  room: "Master bedroom",
  decisionCategory: "Bedroom furniture",
  title: "Occasional lounge chair",
  budgetCategoryId: "furniture_bedrooms",
  typeGroup: "Seating",
  typeSection: "Bedroom seating",
  baselineBudgetExVat: 1400,
  baselineSpec: "Reading chair or occasional bedroom seat.",
})

addBedroomFurniture("Guest bedroom 1", {
  bedFrame: 1600,
  mattress: 1200,
  bedsideTables: 700,
  bedsideLamps: 300,
  storage: 900,
  rug: 600,
})

addBedroomFurniture("Guest bedroom 2", {
  bedFrame: 1600,
  mattress: 1200,
  bedsideTables: 700,
  bedsideLamps: 300,
  storage: 900,
  rug: 600,
})

addItem({
  room: "Hallways / stair / circulation",
  decisionCategory: "Hall furniture",
  title: "Hall and landing runner rugs",
  budgetCategoryId: "furniture_soft",
  typeGroup: "Soft furnishings",
  typeSection: "Circulation rugs",
  baselineBudgetExVat: 1200,
  baselineSpec: "Loose runners across main hall and landing circulation.",
})
addItem({
  room: "Hallways / stair / circulation",
  decisionCategory: "Hall furniture",
  title: "Landing console or book ledge",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Hall storage",
  baselineBudgetExVat: 900,
  baselineSpec: "Occasional hall furniture piece for the landing or circulation space.",
})
addItem({
  room: "Hallways / stair / circulation",
  decisionCategory: "Hall furniture",
  title: "Occasional bench or chair",
  budgetCategoryId: "furniture_living",
  typeGroup: "Seating",
  typeSection: "Hall seating",
  baselineBudgetExVat: 700,
  baselineSpec: "Small occasional seat in a circulation or reading corner.",
})

addItem({
  room: "Utility room",
  decisionCategory: "Utility & garage",
  title: "Laundry storage shelving",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Utility storage",
  baselineBudgetExVat: 1200,
  baselineSpec: "Loose shelves or storage towers beyond built joinery.",
})
addItem({
  room: "Utility room",
  decisionCategory: "Utility & garage",
  title: "Drying rail and folding station",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Utility furniture",
  typeSection: "Laundry accessories",
  baselineBudgetExVat: 600,
  baselineSpec: "Loose drying and folding furniture allowance.",
})

addItem({
  room: "Garage",
  decisionCategory: "Utility & garage",
  title: "Garage workbench",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Utility furniture",
  typeSection: "Garage workbench",
  baselineBudgetExVat: 1200,
  baselineSpec: "Basic workbench allowance.",
})
addItem({
  room: "Garage",
  decisionCategory: "Utility & garage",
  title: "Garage storage cabinets",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Garage storage",
  baselineBudgetExVat: 1800,
  baselineSpec: "Tall or wall-mounted garage storage cabinets.",
})
addItem({
  room: "Garage",
  decisionCategory: "Utility & garage",
  title: "Garage shelving and racks",
  budgetCategoryId: "furniture_storage",
  typeGroup: "Storage",
  typeSection: "Garage storage",
  baselineBudgetExVat: 500,
  baselineSpec: "Utility racks and open shelving allowance.",
})

addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Outdoor dining table",
  budgetCategoryId: "furniture_outdoor",
  typeGroup: "Outdoor furniture",
  typeSection: "Outdoor dining",
  baselineBudgetExVat: 2800,
  baselineSpec: "External dining table sized to the courtyard.",
})
addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Outdoor dining chairs",
  budgetCategoryId: "furniture_outdoor",
  typeGroup: "Outdoor furniture",
  typeSection: "Outdoor dining",
  baselineBudgetExVat: 2400,
  baselineSpec: "Allowance for eight courtyard dining chairs.",
  quantity: 8,
  unit: "chairs",
})
addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Outdoor lounge seating set",
  budgetCategoryId: "furniture_outdoor",
  typeGroup: "Outdoor furniture",
  typeSection: "Outdoor lounge",
  baselineBudgetExVat: 4200,
  baselineSpec: "Courtyard lounge set or modular outdoor seating.",
})
addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Outdoor coffee table",
  budgetCategoryId: "furniture_outdoor",
  typeGroup: "Outdoor furniture",
  typeSection: "Outdoor lounge",
  baselineBudgetExVat: 800,
  baselineSpec: "Outdoor coffee table or low central table allowance.",
})
addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Sun loungers",
  budgetCategoryId: "furniture_outdoor",
  typeGroup: "Outdoor furniture",
  typeSection: "Outdoor occasional seating",
  baselineBudgetExVat: 1600,
  baselineSpec: "Pair of external loungers or recliners.",
  quantity: 2,
  unit: "items",
})
addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Parasol or external shade furniture",
  budgetCategoryId: "furniture_outdoor",
  typeGroup: "Outdoor furniture",
  typeSection: "Shade",
  baselineBudgetExVat: 1500,
  baselineSpec: "Loose shade solution separate from the permanent building fabric.",
})
addItem({
  room: "Courtyard / external interface",
  decisionCategory: "Outdoor furniture",
  title: "Loose planters",
  budgetCategoryId: "furniture_decor",
  typeGroup: "Decor",
  typeSection: "Outdoor decor",
  baselineBudgetExVat: 1200,
  baselineSpec: "Moveable planters and pots, separate from landscaping works.",
})

function deriveRooms(itemsToUse) {
  return [...new Set(itemsToUse.map((item) => item.room))]
    .map((name) => ({
      id: `furniture-room-${slugify(name)}`,
      name,
      sortOrder: ROOM_ORDER[name] || 999,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

function deriveCategories(itemsToUse) {
  return [...new Set(itemsToUse.map((item) => item.decisionCategory))]
    .map((name) => ({
      id: `furniture-category-${slugify(name)}`,
      name,
      sortOrder: CATEGORY_ORDER[name] || 999,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

async function dropFurnitureTables(client) {
  await client.query(`drop table if exists furniture_selections`)
  await client.query(`drop table if exists furniture_items`)
  await client.query(`drop table if exists furniture_categories`)
  await client.query(`drop table if exists furniture_rooms`)
}

async function ensureFurnitureSchema(client) {
  await client.query(`
    create table if not exists furniture_rooms (
      id text primary key,
      name text not null unique,
      sort_order integer not null default 999,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create table if not exists furniture_categories (
      id text primary key,
      name text not null unique,
      sort_order integer not null default 999,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create table if not exists furniture_items (
      id text primary key,
      code text not null unique,
      title text not null,
      budget_category_id text not null,
      room_id text not null references furniture_rooms(id),
      decision_category_id text not null references furniture_categories(id),
      type_group text not null,
      type_section text not null,
      item_order integer not null default 0,
      baseline_spec text not null,
      baseline_budget_ex_vat numeric(12,2) not null default 0,
      quantity numeric(12,2),
      unit text,
      decision_stage text not null default 'later',
      priority text not null default 'medium',
      description text,
      architect_note text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create table if not exists furniture_selections (
      id text primary key,
      item_id text not null references furniture_items(id) on delete cascade,
      status text not null,
      selected_name text,
      selected_source text,
      selected_source_url text,
      selected_cost_ex_vat numeric(12,2),
      selected_notes text,
      is_current boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await client.query(`
    create index if not exists furniture_items_room_idx
    on furniture_items (room_id, decision_category_id, item_order)
  `)
  await client.query(`
    create index if not exists furniture_items_type_idx
    on furniture_items (type_group, type_section, item_order)
  `)
  await client.query(`
    create unique index if not exists furniture_selections_current_idx
    on furniture_selections (item_id)
    where is_current = true
  `)
}

async function insertFurnitureData(client) {
  const rooms = deriveRooms(items)
  const categories = deriveCategories(items)
  const roomIdByName = new Map(rooms.map((room) => [room.name, room.id]))
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]))

  for (const room of rooms) {
    await client.query(
      `insert into furniture_rooms (id, name, sort_order, is_active) values ($1, $2, $3, true)`,
      [room.id, room.name, room.sortOrder],
    )
  }

  for (const category of categories) {
    await client.query(
      `insert into furniture_categories (id, name, sort_order, is_active) values ($1, $2, $3, true)`,
      [category.id, category.name, category.sortOrder],
    )
  }

  for (const item of items) {
    await client.query(
      `
        insert into furniture_items (
          id, code, title, budget_category_id, room_id, decision_category_id, type_group,
          type_section, item_order, baseline_spec, baseline_budget_ex_vat, quantity, unit,
          decision_stage, priority, description, architect_note, is_active
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)
      `,
      [
        item.id,
        item.code,
        item.title,
        item.budgetCategoryId,
        roomIdByName.get(item.room),
        categoryIdByName.get(item.decisionCategory),
        item.typeGroup,
        item.typeSection,
        item.itemOrder,
        item.baselineSpec,
        item.baselineBudgetExVat,
        item.quantity,
        item.unit,
        item.decisionStage,
        item.priority,
        item.description,
        null,
      ],
    )
  }

  return {
    roomCount: rooms.length,
    categoryCount: categories.length,
    itemCount: items.length,
    baselineBudgetExVat: items.reduce((sum, item) => sum + item.baselineBudgetExVat, 0),
  }
}

async function main() {
  await loadEnvFile(".env")
  await loadEnvFile(".env.local")

  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.")
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  })

  const client = await pool.connect()

  try {
    await client.query("begin")

    const forceReset = process.argv.includes("--force-reset")
    if (forceReset) {
      await dropFurnitureTables(client)
    }

    await ensureFurnitureSchema(client)

    const existing = await client.query(`select count(*)::int as count from furniture_items`)
    const existingCount = Number(existing.rows[0]?.count || 0)

    if (existingCount > 0 && !forceReset) {
      console.log(
        `furniture_items already contains ${existingCount} records. Skipping seed. Use --force-reset to replace the seeded furniture inventory.`,
      )
      await client.query("commit")
      return
    }

    if (existingCount > 0 && forceReset) {
      await client.query(`delete from furniture_selections`)
      await client.query(`delete from furniture_items`)
      await client.query(`delete from furniture_categories`)
      await client.query(`delete from furniture_rooms`)
    }

    const summary = await insertFurnitureData(client)
    await client.query("commit")

    console.log(`Loaded ${summary.roomCount} furniture rooms.`)
    console.log(`Loaded ${summary.categoryCount} furniture categories.`)
    console.log(`Loaded ${summary.itemCount} furniture items.`)
    console.log(
      `Loaded baseline furniture budget: £${summary.baselineBudgetExVat.toLocaleString("en-GB")}`,
    )
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
