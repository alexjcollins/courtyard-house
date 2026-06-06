begin;

-- 1. Deactivate the per-room floor items and the combined bathroom tiling-and-walls items
update decision_selections set is_current = false, updated_at = now()
where item_id in (
  select id from decision_items where code in (
    'ENTRANCE-FLOOR-FINISH','LIVING-KITCHEN-FLOOR-FINISH','OFFICE-FLOOR-FINISH',
    'UTILITY-FLOOR-FINISH','CIRCULATION-FLOOR-FINISH',
    'PRINCIPAL-BEDROOM-FLOOR-FINISH','GUEST-BEDROOM-1-FLOOR-FINISH','GUEST-BEDROOM-2-FLOOR-FINISH',
    'PRINCIPAL-SUITE-TILING-AND-WALLS','FAMILY-BATHROOM-TILING-AND-WALLS',
    'GUEST-SHOWER-ROOM-TILING-AND-WALLS','GUEST-BEDROOM-2-ENSUITE-TILING-AND-WALLS','POWDER-ROOM-TILING-AND-WALLS'
  )
) and is_current = true;

update decision_items set is_active = false, updated_at = now()
where code in (
  'ENTRANCE-FLOOR-FINISH','LIVING-KITCHEN-FLOOR-FINISH','OFFICE-FLOOR-FINISH',
  'UTILITY-FLOOR-FINISH','CIRCULATION-FLOOR-FINISH',
  'PRINCIPAL-BEDROOM-FLOOR-FINISH','GUEST-BEDROOM-1-FLOOR-FINISH','GUEST-BEDROOM-2-FLOOR-FINISH',
  'PRINCIPAL-SUITE-TILING-AND-WALLS','FAMILY-BATHROOM-TILING-AND-WALLS',
  'GUEST-SHOWER-ROOM-TILING-AND-WALLS','GUEST-BEDROOM-2-ENSUITE-TILING-AND-WALLS','POWDER-ROOM-TILING-AND-WALLS'
) and is_active = true;

-- 2. Grouping rooms for the consolidated decisions
insert into decision_rooms (id, name, sort_order, is_active) values
  ('room-living-zones', 'Living zones', 22, true),
  ('room-bedrooms',     'Bedrooms',     24, true),
  ('room-bathrooms',    'Bathrooms',    26, true)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, is_active = true, updated_at = now();

-- 3. Consolidated decision items
insert into decision_items
  (id, code, title, budget_category_id, room_id, decision_category_id, type_group, type_section,
   item_order, baseline_spec, baseline_budget_ex_vat, quantity, unit, decision_stage, priority,
   description, architect_note, is_active)
values
  ('living-zones-floor-finish', 'LIVING-ZONES-FLOOR-FINISH', 'Living zones floor finish',
   'finishes', 'room-living-zones', 'dec-cat-finishes', 'Floors, walls & decorating', 'Living zone floors',
   150, 'Poured terrazzo across the whole living-zone floorplate: entrance, kitchen/dining/living, office, utility and hallways/circulation - approx. 122 sqm.',
   22400, 122, 'sqm', 'now', 'medium',
   'Single consolidated floor finish for the living zones: poured terrazzo, approx. 122 sqm.',
   'Consolidated from the former per-room floor items (entrance, kitchen/dining/living, office, utility, circulation). Office, utility and circulation were previously engineered oak / hard floor (GBP 4,400 combined) - now poured terrazzo; baseline carried forward at GBP 22,400, re-price the consolidated area.',
   true),

  ('bedrooms-floor-finish', 'BEDROOMS-FLOOR-FINISH', 'Bedrooms floor finish',
   'finishes', 'room-bedrooms', 'dec-cat-finishes', 'Floors, walls & decorating', 'Bedroom floors',
   151, 'Solid oak flooring to all bedrooms (master, guest 1, guest 2).',
   5000, null, null, 'now', 'medium',
   'Single consolidated floor finish for all bedrooms: solid oak.',
   'Consolidated from the former per-room engineered-oak allowances; upgraded to solid oak. Baseline carried forward at GBP 5,000 - re-price the engineered-to-solid uplift.',
   true),

  ('bathrooms-floor-finish', 'BATHROOMS-FLOOR-FINISH', 'Bathrooms floor finish',
   'bathrooms', 'room-bathrooms', 'dec-cat-finishes', 'Floors, walls & decorating', 'Bathroom floors',
   152, 'Poured resin terrazzo floor to all bathrooms (his ensuite, her ensuite, guest 1 ensuite, guest 2 ensuite, powder room), replacing porcelain tiled floors.',
   0, null, null, 'now', 'medium',
   'Single consolidated floor finish for all bathrooms: poured resin terrazzo, in place of tiled floors.',
   'Floor split out from the former combined tiling-and-walls items. Baseline GBP 0 - poured resin terrazzo not yet priced; the former combined bathroom budget (GBP 18,700) is held against the bathroom wall item. Re-price the resin terrazzo floor.',
   true),

  ('bathrooms-wall-finish', 'BATHROOMS-WALL-FINISH', 'Bathrooms wall finish',
   'bathrooms', 'room-bathrooms', 'dec-cat-finishes', 'Floors, walls & decorating', 'Bathroom walls',
   153, 'Tiled or waterproofed wall finish allowance to all bathroom wet areas.',
   18700, null, null, 'now', 'medium',
   'Consolidated bathroom wall covering allowance - tiled or waterproofed walls, to be confirmed.',
   'Wall budget retained from the former combined bathroom tiling-and-walls items (GBP 18,700 total: his 5,000 / her 4,500 / guest 1 4,000 / guest 2 4,000 / powder 1,200). Left open pending the tiled-vs-waterproofed decision.',
   true);

-- 4. Decided selections for the three settled floor decisions (walls stays open, no selection)
insert into decision_selections
  (id, item_id, status, selected_name, selected_cost_ex_vat, selected_notes, is_current, selected_images)
values
  ('sel-living-zones-floor', 'living-zones-floor-finish', 'selected', 'Poured terrazzo', 22400,
   'Decided: poured terrazzo throughout the living zones (approx. 122 sqm). Cost carried at baseline pending re-price.', true, '[]'::jsonb),
  ('sel-bedrooms-floor', 'bedrooms-floor-finish', 'selected', 'Solid oak', 5000,
   'Decided: solid oak to all bedrooms. Cost carried at baseline pending re-price of the engineered-to-solid uplift.', true, '[]'::jsonb),
  ('sel-bathrooms-floor', 'bathrooms-floor-finish', 'selected', 'Poured resin terrazzo', 0,
   'Decided: poured resin terrazzo to all bathroom floors, replacing tiled floors. Not yet priced.', true, '[]'::jsonb);

commit;
