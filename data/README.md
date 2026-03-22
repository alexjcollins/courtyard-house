# Data files

- `project.json`: project identity, location, VAT defaults, physical assumptions, and procurement strategy.
- `categories.json`: top-down budget categories, global contingency, and validated headline totals.
- `lineItems.json`: early budget line items for category drill-downs.
- `procurement.json`: suppliers, quotes, purchase orders, and invoices.
- `payments.json`: payment records linked to invoices.
- `decisions.json`: design and procurement decisions with option cost deltas.
- `ideas.json`: early product and finish ideas by category, including room tags, URLs, estimated costs, and picked status.
- `inspiration.json`: moodboard-style references with uploaded images, links, room tags, and searchable labels.
- `tasks.json`: actionable tasks with status, priority, assignee, and optional links to decisions or milestones.
- `timeline.json`: milestones and dependency links.
- `fundingModel.json`: stage-based drawdown model linked to milestones.

# Validation

Run `npm run validate:data` to verify that:

- category budgets sum to `totals.baselineBuildBudgetExVat`
- contingency matches `globalContingency.budgetExVat`
- total envelope equals baseline plus contingency

The app also validates these rules on load and throws if they drift.

# Remote storage

If `SPACES_BUCKET`, `SPACES_URL`, `SPACES_ACCESS_KEY_ID`, and
`SPACES_SECRET_ACCESS_KEY` are present, deployed reads and writes for these JSON
files move to private DigitalOcean Spaces objects under `data/`.

- The running app reads and writes these files directly from Spaces; local `/data` is only used as a seed source.
- Admin saves write back to Spaces, so deployed edits persist.
- Private object access should go through signed URLs from `POST /api/files/sign`.
