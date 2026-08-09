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

## The project assistant (`lib/assistant/`) — the system prompt must stay byte-stable

The ⌘J chat panel puts the **entire project** (~400 entities) into a prompt-cached system
prompt as pipe-delimited text, so most questions need no retrieval round-trip. Anthropic
prompt caching is a **prefix match**, so anything that changes a byte above the cache
breakpoint costs a full cache write on every turn instead of a 0.1× read.

When editing `index-builder.ts`, `system-prompt.ts`, or `tools.ts`:

- **No dates, no `new Date()`, no counters, no viewer names** in the system prompt. Anything
  per-request goes in the user turn (see `contextLines` in `assistant-panel.tsx`).
- Sort every section by primary id. Never by `sort_order` or `updated_at`.
- Numbers via `num()` (plain integers), fields via `f()` (strips `|` and newlines).
- The tools array is a frozen constant per role. Never build it with conditional pushes.

The check: in dev, every chat response logs `cache_write` / `cache_read`. On turn 2 of a
conversation `cache_read` must be non-zero. If it's 0, one of the rules above was broken.

Other things worth knowing:

- The index text uses **short handles** (`d47`, `f12`), not real ids — real ids are ~27 chars
  and tokenize badly. `ProjectIndex.entities` maps handle → real id; the model never sees a
  real id. Suppliers and budget categories are the exception: their real ids are short and
  appear inline as foreign keys, so they are their own handle.
- The index is built from **narrow sources**, deliberately not `getProjectData()`, which
  throws on budget drift. Each section has its own `try/catch` so one bad file degrades one
  section rather than the whole panel.
- **Nothing the model does writes.** It emits proposals; `/api/assistant/apply` writes only
  what the user clicked Apply on. `before` values are read from live data server-side, never
  taken from the model. Applies are sequential — procurement/payment writes are whole-file
  read-modify-write with no locking.
- Partial updates re-read the live record at apply time and merge onto that, not onto the
  index snapshot, which may be up to 30s stale.
- Needs `ANTHROPIC_API_KEY`; without it the panel renders and every message 503s.
