-- Migration: introduce multiple plans ("layers") that share one plan image.
-- Each plan (Flooring, Plumbing, Electrics, Furniture, Joinery, ...) owns its own
-- zones. A square can belong to one zone *per plan* (so a kitchen square can be in
-- a Flooring zone and a Plumbing zone simultaneously).
-- Apply manually:  psql "$DATABASE_URL" -f scripts/add-plan-layers.sql
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS plan_layers (
  id          text PRIMARY KEY,
  plan_slug   text NOT NULL DEFAULT 'courtyard-house',
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_zones ADD COLUMN IF NOT EXISTS layer_id text;

-- Seed the default plans only when no plans exist yet.
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

-- Attach any pre-existing zones (from the single-plan version) to the first plan.
UPDATE plan_zones
SET layer_id = (SELECT id FROM plan_layers WHERE is_active ORDER BY sort_order, created_at LIMIT 1)
WHERE layer_id IS NULL;

CREATE INDEX IF NOT EXISTS plan_zones_layer_idx ON plan_zones (layer_id, is_active);
CREATE INDEX IF NOT EXISTS plan_layers_active_idx ON plan_layers (plan_slug, is_active, sort_order);
