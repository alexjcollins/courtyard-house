# Courtyard House — agent notes

## Decisions data lives in Postgres, NOT in `data/decisions.json`

`data/decisions.json` is **legacy and never read at runtime**. The app reconstructs the
legacy decisions shape from the database via `getLegacyDecisionsFileFromDatabase()`
(`lib/data.ts` calls it wherever decisions are needed). Editing `decisions.json` has **no
effect** on the app.

To change decisions, write to the database (connection string in `.env` as `DATABASE_URL`;
`psql "$DATABASE_URL"` works locally). Schema lives in `lib/decisions-db.ts`:

- `decision_items` — one row per decision, tied to a single `room_id` + `decision_category_id`.
  Soft-deleted with `is_active = false` (see `deleteDecisionWorkspaceItem`).
- `decision_rooms`, `decision_categories` — grouping; soft-deleted via `is_active`.
- `decision_selections` — the chosen option per item. Current pick has `is_current = true`;
  `status` is one of `open | selected | on_hold`. Budget delta = `selected_cost_ex_vat`
  minus the item's `baseline_budget_ex_vat`.

`item.id` is the lowercased `code`; `selected_images` is NOT NULL jsonb (use `'[]'`).
Prefer doing multi-row changes in a single transaction, and snapshot affected rows first
(see `exports/db-backups/` and `scripts/consolidate-flooring.sql` for a worked example).

Other `data/*.json` files (project, lineItems, procurement, payments, tasks, timeline,
funding, ideas, inspiration, categories) ARE still read from disk via `readJsonFile`.
