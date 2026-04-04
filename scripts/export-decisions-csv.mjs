import { mkdir, readFile, writeFile } from "node:fs/promises"
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

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? "" : String(value)
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
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
    ssl:
      databaseUrl.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
  })

  try {
    const result = await pool.query(`
      select
        i.id,
        i.code,
        i.title,
        i.budget_category_id,
        room.name as room_group,
        category.name as room_section,
        room.name as room_name,
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
        selection.status,
        selection.selected_name,
        selection.selected_source,
        selection.selected_source_url,
        selection.selected_cost_ex_vat,
        selection.selected_notes,
        i.created_at::text,
        i.updated_at::text
      from decision_items i
      join decision_rooms room on room.id = i.room_id
      join decision_categories category on category.id = i.decision_category_id
      left join lateral (
        select
          current_selection.status,
          current_selection.selected_name,
          current_selection.selected_source,
          current_selection.selected_source_url,
          current_selection.selected_cost_ex_vat,
          current_selection.selected_notes
        from decision_selections current_selection
        where current_selection.item_id = i.id
          and current_selection.is_current = true
        limit 1
      ) selection on true
      where i.is_active = true
      order by room.sort_order, category.sort_order, i.item_order, i.title
    `)

    const headers = [
      "id",
      "code",
      "title",
      "categoryId",
      "roomGroup",
      "roomSection",
      "roomName",
      "typeGroup",
      "typeSection",
      "baselineSpec",
      "baselineBudgetExVat",
      "quantity",
      "unit",
      "decisionStage",
      "priority",
      "description",
      "architectNote",
      "status",
      "selectedName",
      "selectedSource",
      "selectedSourceUrl",
      "selectedCostExVat",
      "selectedNotes",
      "createdAt",
      "updatedAt",
    ]

    const rows = result.rows.map((row) => [
      row.id,
      row.code,
      row.title,
      row.budget_category_id,
      row.room_group,
      row.room_section,
      row.room_name,
      row.type_group,
      row.type_section,
      row.baseline_spec,
      row.baseline_budget_ex_vat,
      row.quantity,
      row.unit,
      row.decision_stage,
      row.priority,
      row.description,
      row.architect_note,
      row.status || "open",
      row.selected_name,
      row.selected_source,
      row.selected_source_url,
      row.selected_cost_ex_vat,
      row.selected_notes,
      row.created_at,
      row.updated_at,
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n")

    const exportDirectory = path.join(process.cwd(), "exports")
    await mkdir(exportDirectory, { recursive: true })

    const timestamp = new Date().toISOString().slice(0, 10)
    const outputPath = path.join(exportDirectory, `decisions-export-${timestamp}.csv`)
    await writeFile(outputPath, `${csv}\n`, "utf8")

    console.log(`Exported ${rows.length} decision items to ${outputPath}`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
