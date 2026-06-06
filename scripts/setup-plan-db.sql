-- Plan overlay schema: a plan image + grid, and named zones drawn over the grid.
-- Apply manually:  psql "$DATABASE_URL" -f scripts/setup-plan-db.sql
-- Safe to re-run (CREATE ... IF NOT EXISTS).

-- Single-row-per-slug config: the plan image key + grid dimensions.
CREATE TABLE IF NOT EXISTS plan_config (
  slug        text PRIMARY KEY DEFAULT 'courtyard-house',
  name        text NOT NULL DEFAULT 'Courtyard House',
  image_key   text,
  grid_cols   integer NOT NULL DEFAULT 100,
  grid_rows   integer NOT NULL DEFAULT 100,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plan_config (slug) VALUES ('courtyard-house')
ON CONFLICT (slug) DO NOTHING;

-- A plan ("layer") is a named overlay (Flooring, Plumbing, Electrics, ...) that
-- shares the single plan image but owns its own zones.
CREATE TABLE IF NOT EXISTS plan_layers (
  id          text PRIMARY KEY,
  plan_slug   text NOT NULL DEFAULT 'courtyard-house',
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plan_layers (id, name, sort_order)
SELECT seed.id, seed.name, seed.sort_order
FROM (VALUES
  ('plan-layer-flooring',  'Flooring',  0),
  ('plan-layer-plumbing',  'Plumbing',  1),
  ('plan-layer-electrics', 'Electrics', 2),
  ('plan-layer-furniture', 'Furniture', 3),
  ('plan-layer-joinery',   'Joinery',   4)
) AS seed(id, name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM plan_layers);

-- A zone is a named, coloured group of grid squares within one plan, optionally
-- linked to decisions. `squares` holds integer cell indices (index = row * grid_cols
-- + col); `decision_item_ids` holds decision_items.id strings. One zone per square
-- is enforced *within a layer* (see lib/plan-db.ts savePlanZone).
CREATE TABLE IF NOT EXISTS plan_zones (
  id                 text PRIMARY KEY,
  plan_slug          text NOT NULL DEFAULT 'courtyard-house',
  layer_id           text,
  name               text NOT NULL,
  color              text NOT NULL,
  description        text,
  squares            jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_item_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order         integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_zones_active_idx
  ON plan_zones (plan_slug, is_active, sort_order);
CREATE INDEX IF NOT EXISTS plan_zones_layer_idx
  ON plan_zones (layer_id, is_active);
CREATE INDEX IF NOT EXISTS plan_layers_active_idx
  ON plan_layers (plan_slug, is_active, sort_order);
