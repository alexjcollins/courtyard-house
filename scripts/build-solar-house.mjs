// Builds the isometric model of Courtyard House for /solar-planner.
//   node scripts/build-solar-house.mjs            writes components/solar-planner/house-art.ts
//   node scripts/build-solar-house.mjs --preview  also writes a standalone preview page (light theme)
//   node scripts/build-solar-house.mjs --audit    proves the painter's order
// World units are decimetres (1 unit = 0.1 m), measured off the roof plan: x = 0 on grid A and
// runs toward F; y = 0 on grid 1 and runs toward the top of the plan (the panel pitch), so grid
// row n sits at y = -(its distance below row 1); z is up. Every static path is computed here, once.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./iso-kit/iso-kit.mjs";
import * as G from "./iso-kit/lathe.mjs";
import * as A from "./iso-kit/audit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);

// ---- The true numbers ------------------------------------------------------------------
export const PITCH = 35; // degrees, the planner's DEFAULT_GEOMETRY pitch
const RAD = (PITCH * Math.PI) / 180;
const SIN = Math.sin(RAD);
const COS = Math.cos(RAD);
const TAN = Math.tan(RAD);
// Grid (mm, external face of timber structure): A 0, B 4130, C 6670, D 8720, E 12387, F 18705;
// rows 1 0, 2 5810, 3 11780, 4 13193, 5 16477, 6 20709. Roof outlines sit 212 mm outside A and F.
const GRID = { A: 0, B: 41.3, C: 66.7, D: 87.2, E: 123.87, F: 187.05 };
const ROW = { 1: 0, 2: -58.1, 3: -117.8, 4: -131.93, 5: -164.77, 6: -207.09 };
const MAIN = { s0: -2.12, s1: 189.17, c0: -62.75, c1: 4.51 }; // panel wing, ridge along x (19.13 × 6.73 m)
// Everything but the panel wing is mirrored about the panel wing's centre line (x' = MX - x), so
// the E–F wing sits at the near end of the panel wing and the A–D wing swaps across.
const MX = MAIN.s0 + MAIN.s1; // 187.05: the panel wing is symmetric about x = 93.5
const mx = (plan) => ({ ...plan, x: MX - plan.x - plan.w });
const EF = { s0: -209.34, s1: -62.75, c0: MX - 189.17, c1: MX - 121.73 }; // E–F wing, ridge along y on E + 3.159
const AD = { s0: MX - 89.21, s1: MX - 0.53, c0: -189.97, c1: -129.96 }; // A–D wing, ridge along x
const ROOF_LENGTH = MAIN.s1 - MAIN.s0; // 19.13 m verge to verge on the plan
const PANEL_W = 17.62; // 1.762 m, landscape
const PANEL_H = 11.34; // 1.134 m up the slope
const GAP = 0.2; // 20 mm clamp gap
const COLS = 10;
const ROWS = 3;
const ARRAY_W = COLS * PANEL_W + (COLS - 1) * GAP; // 178.0 = 17.80 m
const ARRAY_H = ROWS * PANEL_H + (ROWS - 1) * GAP; // 34.42 = 3.44 m
const VERGE_CLEAR = (ROOF_LENGTH - ARRAY_W) / 2; // 0.66 m each end
const EAVE_CLEAR = 3.4; // 0.34 m up from the eave edge to the bottom row

// ---- Camera ----------------------------------------------------------------------------
const WIDTH = 880;
const HEIGHT = 560;
const AZIMUTH = 58;
const ELEVATION = 36;

// ---- Plan ------------------------------------------------------------------------------
const BOARD = { x: -30, y: -240, w: 262, d: 278, r: 6 };
const BOARD_H = 6;
const FOOT_H = 5;
const T = 1.6; // standing-seam roof build-up
const H = 28; // 2.8 m eaves (assumed; not on the plan)
const BLADE_H = H; // blade walls stop at the eaves, where the pitched roofs start
const FLAT_H = H - 0.8; // flat roofs sit just inside the blade walls
const COURT = mx({ x: 68.76, y: -115.76, w: 52.97, d: 52.97, r: 0 });
const HEDGE = { x: -18, y: 16, w: 168, d: 7, r: 2 };

const extremes = [...k.boxCorners(BOARD, -BOARD_H - FOOT_H, 0), [MAIN.s0, -29, 56], [MAIN.s1, -29, 56], [(EF.c0 + EF.c1) / 2, EF.s0, 54]];
const P = k.fitProjection(extremes, WIDTH, HEIGHT, { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION });
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => (d ? k.lineSvg(d, style) : "");
const D = (points, style) => k.dotsSvg(points, style);
const path = (points, closed = false) => k.pathOf(points.map(at), closed);
const add = G.add3;
const mul = G.mul3;
const fill = (points, cls) => `<path class="${cls}" d="${path(points, true)}"/>`;

const R = A.recorder(P);
const put = (piece, centre, svg, shapes, extra = {}) => R.put({ piece, at: centre, svg, shapes: shapes.map((shape) => R.solid(shape)), name: R.nameFor(piece), ...extra });

// ---- Frames ----------------------------------------------------------------------------
const AXIS = { x: [1, 0, 0], y: [0, 1, 0] };
const CROSS = { x: [0, 1, 0], y: [1, 0, 0] };
const UP = [0, 0, 1];
const world = (axis, s, c, z) => (axis === "x" ? [s, c, z] : [c, s, z]);
const bodyFrame = (axis) => ({ o: [0, 0, 0], a: AXIS[axis], u: CROSS[axis], v: UP });
// A roof plane: u runs down the slope from the ridge toward side (+1 or -1), v is its normal.
function slopeFrame(axis, ridgeC, ridgeZ, side) {
  const c = mul(CROSS[axis], side);
  return { o: world(axis, 0, ridgeC, ridgeZ), a: AXIS[axis], u: add(mul(c, COS), mul(UP, -SIN)), v: add(mul(c, SIN), mul(UP, COS)) };
}
const onPlane = (F, s, u, v) => add(add(add(F.o, mul(F.a, s)), mul(F.u, u)), mul(F.v, v));

// ---- Parts -----------------------------------------------------------------------------
function prism(piece, F, poly, s0, s1, style = {}, extra = "", meta = {}) {
  const mid = poly.reduce((sum, [x, y]) => [sum[0] + x / poly.length, sum[1] + y / poly.length], [0, 0]);
  const centre = onPlane(F, (s0 + s1) / 2, mid[0], mid[1]);
  return put(piece, centre, S(G.prismOf(F, poly, s0, s1, P), style) + extra, [A.prism(F, poly, s0, s1, { name: piece })], meta);
}
function box(piece, plan, z, h, style = {}, extra = "", steps = 2, bevel = 0) {
  const centre = [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];
  return put(piece, centre, S(k.slabOf(plan, z, h, P, steps, bevel), style) + extra, [A.slab(plan, z, h, { name: piece }, steps)]);
}
function post(piece, x, y, r, z, h, style = {}, extra = "") {
  return put(piece, [x, y, z + h / 2], S(k.cylinder(x, y, r, z, h, P, 20), style) + extra, [A.cylinder(x, y, r, z, h, { name: piece })]);
}

// A gabled wing with flush eaves and verges (gutters are recessed behind the cladding): walls,
// both standing-seam roof planes and a slim ridge flashing.
function gable(name, axis, { s0, s1, c0, c1, H, tone = "mid", seam = 5, faces = "", skipBody = false, ends = [true, true] }) {
  const ridgeC = (c0 + c1) / 2;
  const half = (c1 - c0) / 2;
  const ridgeZ = H + half * TAN;
  const length = half / COS; // slope length from ridge to eave edge
  const out = { ridgeC, ridgeZ, length, planes: {} };
  if (!skipBody) prism(`${name}.walls`, bodyFrame(axis), [[c0, 0], [c1, 0], [c1, H], [ridgeC, ridgeZ], [c0, H]], s0, s1, { tone }, faces);
  for (const side of [-1, 1]) {
    const F = slopeFrame(axis, ridgeC, ridgeZ, side);
    out.planes[side] = F;
    const seams = [];
    const span = s1 - s0;
    const count = Math.round(span / seam);
    for (let i = 1; i < count; i++) {
      const s = s0 + (span * i) / count;
      seams.push(path([onPlane(F, s, length, T), onPlane(F, s, 1.2, T)]));
    }
    const eave = path([onPlane(F, s0, length - 1.1, T), onPlane(F, s1, length - 1.1, T)]);
    prism(`${name}.roof${side > 0 ? "+" : "-"}`, F, [[0, 0], [length, 0], [length, T], [0, T]], s0, s1, { tone }, L(seams.join(""), { tone: "faint" }) + L(eave, { tone: "lo" }));
  }
  const cap = [[ridgeC - 2.2, ridgeZ + T / COS - 2.2 * TAN - 0.3], [ridgeC + 2.2, ridgeZ + T / COS - 2.2 * TAN - 0.3], [ridgeC + 2.2, ridgeZ + T / COS - 2.2 * TAN + 0.5], [ridgeC, ridgeZ + T / COS + 0.9], [ridgeC - 2.2, ridgeZ + T / COS - 2.2 * TAN + 0.5]];
  prism(`${name}.ridge`, bodyFrame(axis), cap, s0, s1, { tone: "mid" });
  return out;
}

// Things drawn on a wall face: (axis of the wall's normal, the face coordinate, along-range, z-range)
function faceQuad(normal, at0, a0, a1, z0, z1) {
  const p = (a, z) => (normal === "y" ? [a, at0, z] : [at0, a, z]);
  return [p(a0, z0), p(a1, z0), p(a1, z1), p(a0, z1)];
}
// A glazed opening: a reveal (recess sides), glass, a frame line and a mullion.
function opening(normal, faceAt, sign, a0, a1, z0, z1, { depth = 1.6, mullions = 1, transom = null } = {}) {
  const back = faceAt - sign * depth;
  const q = (f, a, z) => (normal === "y" ? [a, f, z] : [f, a, z]);
  const parts = [];
  parts.push(fill(faceQuad(normal, back, a0, a1, z0, z1), "shp-glass"));
  // reveals: the visible inner side and head are shaded by facing
  const sideA = [q(faceAt, a0, z0), q(back, a0, z0), q(back, a0, z1), q(faceAt, a0, z1)];
  const sideB = [q(faceAt, a1, z0), q(back, a1, z0), q(back, a1, z1), q(faceAt, a1, z1)];
  const head = [q(faceAt, a0, z1), q(back, a0, z1), q(back, a1, z1), q(faceAt, a1, z1)];
  const sill = [q(faceAt, a0, z0), q(back, a0, z0), q(back, a1, z0), q(faceAt, a1, z0)];
  const V = G.viewOf(P);
  const along = normal === "y" ? [1, 0, 0] : [0, 1, 0];
  const visibleA = G.dot3(along, V) > 0; // the reveal at a0 faces +along
  parts.push(`<path class="iso-top" d="${path(sill, true)}"/>`);
  parts.push(`<path class="iso-shade" data-shade="1" d="${path(visibleA ? sideA : sideB, true)}"/>`);
  const lines = [path([q(back, a0, z0), q(back, a1, z0), q(back, a1, z1), q(back, a0, z1)], true)];
  for (let i = 1; i <= mullions; i++) {
    const a = a0 + ((a1 - a0) * i) / (mullions + 1);
    lines.push(path([q(back, a, z0), q(back, a, z1)]));
  }
  if (transom) lines.push(path([q(back, a0, transom), q(back, a1, transom)]));
  return parts.join("") + L(lines.join(""), { tone: "mid" }) + L(path(faceQuad(normal, faceAt, a0, a1, z0, z1), true), { tone: "lo" });
}

// ============================================================================================
// Base board
const base = [];
base.push(`<path class="iso-halo" d="${k.haloOf(BOARD, -BOARD_H - FOOT_H, BOARD_H, P)}"/>`);
const feet = k.corners(BOARD, 20).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
for (const [x, y] of feet) {
  base.push(S(k.cylinder(x, y, 8, -BOARD_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  base.push(S(k.cylinder(x, y, 6, -BOARD_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
}
base.push(S(k.slabOf(BOARD, -BOARD_H, BOARD_H, P, 8, 1.4), { tone: "mid", inner: L(k.sideSeam(BOARD, -2.4, P, 8), { tone: "faint" }) }));
base.push(L(k.planOutline(k.insetPlan(BOARD, 5), 0, P), { tone: "lo" }));
const screws = k.corners(BOARD, 10);
base.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
base.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
// Lawn: a faint site boundary and a path to the terrace steps
base.push(L(k.planOutline(k.insetPlan(BOARD, 9), 0, P, 4), { tone: "faint" }));
// Scale rule along the south edge: 0–20 m, a tick every metre
const RULE = { x: -2, y: BOARD.y + BOARD.d - 11, w: 206, d: 6, r: 0.8 };
base.push(S(k.slabOf(RULE, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(RULE.x + 3, RULE.x + 203, 10, 5, RULE.y + 0.4, 0.6, [2.2, 4], P);
base.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
base.push(L(k.lineOnTop([RULE.x + 3, RULE.y], [RULE.x + 3, RULE.y + RULE.d], 0.6, P), { tone: "hi" }));
base.push(D([at([RULE.x + 1.4, RULE.y + 3, 0.6]), at([RULE.x + RULE.w - 1.4, RULE.y + 3, 0.6])], { size: 0.45 }));
// Label plate, back right, with three engraved rule lines
const LABEL = { x: 196, y: -232, w: 30, d: 20, r: 1.2 };
base.push(S(k.slabOf(LABEL, 0, 0.8, P, 3, 0.5), { tone: "mid" }));
base.push(L([4.5, 8.5, 12.5].map((dy, i) => k.lineOnTop([LABEL.x + 4, LABEL.y + dy], [LABEL.x + (i === 0 ? 24 : 18), LABEL.y + dy], 0.8, P)).join(""), { tone: "lo", free: true }));
base.push(D(k.corners(LABEL, 1.8).map(([x, y]) => at([x, y, 0.8])), { size: 0.4 }));
// Compass disc: the arrow points north (-y); the panels face due south (+y)
const NORTH = [-16, -228];
base.push(S(k.cylinder(NORTH[0], NORTH[1], 9, 0, 1.2, P, 40, 0.5), { tone: "mid" }));
base.push(L(k.ring(NORTH[0], NORTH[1], 7.2, 1.2, P, 40), { tone: "lo" }));
base.push(L(k.radialTicks(NORTH[0], NORTH[1], 7.2, 16, 4, 1.2, [1, 2], P).minor, { tone: "lo" }));
base.push(L(k.onTop([[NORTH[0] - 2, NORTH[1] + 3], [NORTH[0], NORTH[1] - 6.6], [NORTH[0] + 2, NORTH[1] + 3], [NORTH[0], NORTH[1] + 1.4]], 1.2, P, true), { tone: "hi" }));
const baseSvg = base.join("");

// Ground-level inlays (drawn with the board, under everything)
const ground = [];
// Courtyard gravel
ground.push(fill(k.ringOf(COURT, 2).map(([x, y]) => [x, y, 0.05]), "shp-gravel"));
const gravel = [];
for (let x = COURT.x + 3; x < COURT.x + COURT.w - 1; x += 3.4) for (let y = COURT.y + 2; y < COURT.y + COURT.d - 1; y += 3.4) gravel.push(at([x + ((y * 7) % 1.7), y, 0.05]));
ground.push(D(gravel, { size: 0.32, tone: "faint" }));
// Garden path from the canopy to the board edge
ground.push(L(k.planOutline(mx({ x: 92, y: -192, w: 14, d: 34, r: 0 }), 0, P, 2), { tone: "lo" }));
const groundSvg = ground.join("");

// ============================================================================================
// ---- A–D wing (rows 4–6), ridge along x -----------------------------------------------------
gable("ad", "x", { ...AD, H });

// ---- E–F wing (rows 2–6), ridge along y on E + 3.159 ----------------------------------------
const efFaces = [-200, -180, -100, -82].map((y) => opening("x", EF.c1, 1, y, y + 9, 0, 22, { mullions: 0, transom: 18 })).join("");
gable("ef", "y", { ...EF, H, faces: efFaces });

// ---- Flat roofs between the wings, with their blade walls and the canopy --------------------
function flat(name, plan) {
  const top = [L(k.planOutline(k.insetPlan(plan, 1.2), FLAT_H, P, 2), { tone: "lo" })];
  const membrane = fill(k.ringOf(k.insetPlan(plan, 1.2), 2).map(([x, y]) => [x, y, FLAT_H - 0.01]), "shp-membrane");
  return box(name, plan, 0, FLAT_H, { tone: "mid", inner: L(k.sideSeam(plan, FLAT_H - 1.2, P, 2), { tone: "faint" }) }, membrane + top.join(""));
}
// On the plan the blade walls run past the roof edges; in the model each one stops at the wing
// face it meets, so nothing is buried inside another volume.
const clip = (plan, { x0 = -Infinity, x1 = Infinity, y0 = -Infinity, y1 = Infinity }) => {
  const a = Math.max(plan.x, x0), b = Math.min(plan.x + plan.w, x1), c = Math.max(plan.y, y0), d = Math.min(plan.y + plan.d, y1);
  return { ...plan, x: a, w: b - a, y: c, d: d - c };
};
const SOUTH_FACE = MAIN.c0; // the panel wing's courtyard-side wall
flat("flat.strip", clip(mx({ x: 42.75, y: -129.96, w: 22.43, d: 71.61, r: 0 }), { y1: SOUTH_FACE }));
flat("flat.link", mx({ x: 65.18, y: -129.96, w: 56.55, d: 10.45, r: 0 }));
flat("flat.entry", mx({ x: 89.21, y: -149.34, w: 32.52, d: 19.38, r: 0 }));
const blade = (name, plan, h = BLADE_H) => box(name, plan, 0, h, { tone: "hi" }, L(k.lineOnTop([plan.x, plan.y + plan.d / 2], [plan.x + plan.w, plan.y + plan.d / 2], h, P) + k.lineOnTop([plan.x + plan.w / 2, plan.y], [plan.x + plan.w / 2, plan.y + plan.d], h, P), { tone: "faint" }), 2, 0.3);
blade("blade.west", clip(mx({ x: 39.25, y: -138.09, w: 3.5, d: 83.27, r: 0 }), { y0: AD.c1, y1: SOUTH_FACE }));
blade("blade.court", clip(mx({ x: 65.18, y: -119.48, w: 3.58, d: 64.66, r: 0 }), { y0: -115.76, y1: SOUTH_FACE }));
const row3 = blade("blade.row3", clip(mx({ x: 65.18, y: -119.48, w: 64.78, d: 3.72, r: 0 }), { x0: EF.c1 }));
blade("blade.row5", clip(mx({ x: 89.21, y: -153.06, w: 40.75, d: 3.72, r: 0 }), { x0: EF.c1, x1: AD.s0 }));
box("canopy", mx({ x: 89.21, y: -158.63, w: 32.52, d: 5.57, r: 0 }), 25.4, 1.4, { tone: "mid" });
// Courtyard glazing in the blade wall on row 3
row3.svg += opening("y", -115.76, 1, MX - 110, MX - 82, 0, 24, { mullions: 3, transom: 20 });

// ---- Panel wing (rows 1–2): the 19.13 m pitch facing the top of the plan ---------------------
const mainFaces = [];
for (const x of [14, 52, 96, 140]) mainFaces.push(opening("y", MAIN.c1, 1, x, x + 9, 0, 22, { mullions: 0, transom: 18 }));
const gx = MAIN.s1;
mainFaces.push(opening("x", gx, 1, -52, -40, 0, 22, { depth: 6, mullions: 0 }));
mainFaces.push(opening("x", gx, 1, -20, -11, 7, 21, { mullions: 0 }));
mainFaces.push(opening("x", gx, 1, -30.6, -27.6, 31, 43, { mullions: 0, depth: 1.2 }));
const MAINROOF = gable("main", "x", { ...MAIN, H, faces: mainFaces.join("") });
const SOUTH = MAINROOF.planes[1];
const LS = MAINROOF.length;

// Energy kit on the F gable: Powerwall 3, the DC conduit from the array and the EV charger
box("powerwall", { x: gx, y: -6, w: 1.9, d: 6, r: 0.5 }, 3, 11, { tone: "hi" }, L(k.rise([gx + 1.9, -3, 0], 10.6, 12.4, P), { tone: "mid" }), 3, 0.3);
post("conduit", gx + 0.7, 2.4, 0.45, 14, H - 14.2, { tone: "mid" });
box("conduit.box", { x: gx, y: 0.4, w: 1.4, d: 4, r: 0.3 }, 11, 3, { tone: "mid" });
box("wallbox", { x: gx, y: -34, w: 1.5, d: 3, r: 0.6 }, 9, 3.6, { tone: "mid" }, "", 3, 0.2);
// Heat pump on its pad, fan grille facing F
box("ashp.pad", { x: gx + 4, y: -62, w: 6, d: 14, r: 0.4 }, 0, 0.8, { tone: "lo" });
{
  const plan = { x: gx + 5, y: -61, w: 4, d: 12, r: 0.6 };
  const fan = [gx + 9, -55, 5.2];
  const grille = [G.circleOf(G.frameAlong(fan, [1, 0, 0]), 0, 3.6, P, 40), G.circleOf(G.frameAlong(fan, [1, 0, 0]), 0, 1, P, 20)].join("");
  const spokes = G.spokesOf(G.frameAlong(fan, [1, 0, 0]), 0, 1, 3.6, 7, P);
  box("ashp", plan, 0.8, 9, { tone: "mid" }, L(grille, { tone: "lo" }) + L(spokes, { tone: "faint" }) + D([at([gx + 9, -59.8, 9.8]), at([gx + 9, -50.2, 9.8])], { size: 0.35 }), 3, 0.4);
}

// ---- Hardstanding beside the F gable ------------------------------------------------------
{
  const drive = { x: 196, y: -60, w: 32, d: 84, r: 0.6 };
  put("drive", [drive.x + drive.w / 2, drive.y + drive.d / 2, 0.3], S(k.slabOf(drive, 0, 0.6, P, 2), { tone: "lo", crease: "none" }) + L([30, 50].map((y) => k.lineOnTop([drive.x, drive.y + y], [drive.x + drive.w, drive.y + y], 0.6, P)).join(""), { tone: "faint" }), [A.slab(drive, 0, 0.6, { name: "drive" }, 2)]);
}
// ---- Hedge along the south boundary ---------------------------------------------------------
{
  const top = [];
  for (let x = HEDGE.x + 2.5; x < HEDGE.x + HEDGE.w - 1; x += 3.1) for (let y = HEDGE.y + 1.6; y < HEDGE.y + HEDGE.d - 1; y += 2.6) top.push(at([x + ((y * 5) % 1.3), y, 9]));
  const side = [];
  for (let x = HEDGE.x + 3.5; x < HEDGE.x + HEDGE.w - 2; x += 3.1) for (let z = 1.6; z < 8; z += 2.3) side.push(at([x + ((z * 3) % 1.4), HEDGE.y + HEDGE.d, z]));
  const item = box("hedge", HEDGE, 0, 9, { tone: "mid" }, D(top, { size: 0.42, tone: "lo" }) + D(side, { size: 0.42, tone: "faint" }), 5, 0.8);
  item.svg = `<g class="shp-planting">${item.svg}</g>`;
}

// ============================================================================================
// The array: rails, hooks, slots and 30 panels on the south pitch
// q runs up the slope from the eave edge, h is the height above the tiles.
const pitchPoint = (x, q, h) => onPlane(SOUTH, x, LS - q, T + h);
const X0 = MAIN.s0 + VERGE_CLEAR;
const panelOf = (index) => {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const x0 = X0 + col * (PANEL_W + GAP);
  const q0 = EAVE_CLEAR + row * (PANEL_H + GAP);
  return { row, col, x0, x1: x0 + PANEL_W, q0, q1: q0 + PANEL_H };
};
const PANEL_FRAME = { o: onPlane(SOUTH, 0, LS, T), a: [1, 0, 0], u: mul(SOUTH.u, -1), v: SOUTH.v };
const quad = (x0, x1, q0, q1, h) => [pitchPoint(x0, q0, h), pitchPoint(x1, q0, h), pitchPoint(x1, q1, h), pitchPoint(x0, q1, h)];

// Layout marks on the tiles: where every panel will go
const slots = [];
for (let i = 0; i < COLS * ROWS; i++) {
  const p = panelOf(i);
  slots.push(path(quad(p.x0, p.x1, p.q0, p.q1, 0.02), true));
}

// Rails: two per row, landscape modules clamp on their long edges
const RAIL_H = [0.5, 1.0];
const railsByRow = [];
for (let row = 0; row < ROWS; row++) {
  const q0 = EAVE_CLEAR + row * (PANEL_H + GAP);
  const parts = [];
  for (const q of [q0 + 2.6, q0 + PANEL_H - 2.6]) {
    const hooks = [];
    for (let x = X0 + 6; x < X0 + ARRAY_W - 4; x += 12) hooks.push(x);
    // hook plates showing below the rail
    parts.push(D(hooks.map((x) => at(pitchPoint(x, q - 0.9, 0.02))), { size: 0.38, tone: "mid" }));
    parts.push(S(G.prismOf(PANEL_FRAME, [[q - 0.25, RAIL_H[0]], [q + 0.25, RAIL_H[0]], [q + 0.25, RAIL_H[1]], [q - 0.25, RAIL_H[1]]], X0 - 0.4, X0 + ARRAY_W + 0.4, P), { tone: "mid", crease: "none" }));
  }
  railsByRow.push(parts.join(""));
}

const PANEL_Z = [1.0, 1.36];
const panels = [];
for (let i = 0; i < COLS * ROWS; i++) {
  const p = panelOf(i);
  const frame = S(G.prismOf(PANEL_FRAME, [[p.q0, PANEL_Z[0]], [p.q1, PANEL_Z[0]], [p.q1, PANEL_Z[1]], [p.q0, PANEL_Z[1]]], p.x0, p.x1, P), { tone: "hi", crease: "lo" });
  const inset = 0.32;
  const gx0 = p.x0 + inset;
  const gx1 = p.x1 - inset;
  const gq0 = p.q0 + inset;
  const gq1 = p.q1 - inset;
  const h = PANEL_Z[1];
  const glass = fill(quad(gx0, gx1, gq0, gq1, h), "shp-glass shp-pv");
  // 108 half-cut cells: 18 along the long side split in two strings, 6 up the slope
  const cells = [];
  const split = (gx0 + gx1) / 2;
  const half = (gx1 - gx0 - 0.3) / 2;
  for (let c = 1; c < 9; c++) {
    const a = gx0 + (half * c) / 9;
    const b = split + 0.15 + (half * c) / 9;
    cells.push(path([pitchPoint(a, gq0, h), pitchPoint(a, gq1, h)]), path([pitchPoint(b, gq0, h), pitchPoint(b, gq1, h)]));
  }
  cells.push(path([pitchPoint(split - 0.15, gq0, h), pitchPoint(split - 0.15, gq1, h)]), path([pitchPoint(split + 0.15, gq0, h), pitchPoint(split + 0.15, gq1, h)]));
  for (let r = 1; r < 6; r++) {
    const q = gq0 + ((gq1 - gq0) * r) / 6;
    cells.push(path([pitchPoint(gx0, q, h), pitchPoint(gx1, q, h)]));
  }
  const clamps = D([p.x0, p.x1].flatMap((x) => [p.q0 + 2.6, p.q1 - 2.6].map((q) => at(pitchPoint(x, q, h)))), { size: 0.34, tone: "mid" });
  const svg = frame + glass + `<path class="shp-cells" d="${cells.join("")}"/>` + clamps;
  const centre = pitchPoint((p.x0 + p.x1) / 2, (p.q0 + p.q1) / 2, 1.2);
  put("panel", centre, svg, [A.prism(PANEL_FRAME, [[p.q0, PANEL_Z[0]], [p.q1, PANEL_Z[0]], [p.q1, PANEL_Z[1]], [p.q0, PANEL_Z[1]]], p.x0, p.x1, { name: `panel.${i}` })], { panel: i, row: p.row, col: p.col });
}

// ---- Order ---------------------------------------------------------------------------------
A.settle(R, P, { step: 0.75 });
R.items.sort((a, b) => a.key - b.key);
const panelItems = R.items.filter((item) => item.panel !== undefined);
const firstPanel = R.items.indexOf(panelItems[0]);
const lastPanel = R.items.indexOf(panelItems[panelItems.length - 1]);
const between = R.items.slice(firstPanel, lastPanel + 1).filter((item) => item.panel === undefined);
if (between.length) console.warn("items between panels:", between.map((item) => item.name).join(", "));
const backItems = R.items.slice(0, firstPanel).concat(between);
const frontItems = R.items.slice(lastPanel + 1);
A.auditOrExit(R, P, { crowd: [] });

const lift = (() => {
  const a = at(pitchPoint(90, 20, 0));
  const b = at(add(pitchPoint(90, 20, 0), mul(SOUTH.v, 34)));
  return [Math.round((b[0] - a[0]) * 100) / 100, Math.round((b[1] - a[1]) * 100) / 100];
})();
const ART = {
  width: WIDTH,
  height: HEIGHT,
  back: baseSvg + groundSvg + backItems.map((item) => item.svg).join(""),
  slots: `<path class="shp-slot" d="${slots.join("")}"/>`,
  rails: railsByRow,
  panels: panelItems.sort((a, b) => a.panel - b.panel).map((item) => item.svg),
  front: frontItems.map((item) => item.svg).join(""),
  lift,
  slotPolys: Array.from({ length: COLS * ROWS }, (_, i) => {
    const p = panelOf(i);
    return quad(p.x0, p.x1, p.q0, p.q1, PANEL_Z[1]).map(at).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }),
  label: "An isometric model of Courtyard House on a baseboard, built from the roof plan and mirrored: the 19.1 m panel wing in front, the E–F wing running back from its near end, the A–D wing across the far side, and the flat roofs, blade walls and canopy between them around an open courtyard. Solar panels sit in a grid of ten across and three up the panel pitch.",
  numbers: { pitch: PITCH, roofLength: Math.round(ROOF_LENGTH * 10) / 100, timberLength: 18.705, eaveClear: Math.round(EAVE_CLEAR * 10) / 100, slopeLength: Math.round(LS * 10) / 100, panelW: PANEL_W / 10, panelH: PANEL_H / 10, gap: GAP / 10, cols: COLS, rows: ROWS, arrayW: Math.round(ARRAY_W) / 10, arrayH: Math.round(ARRAY_H * 10) / 100, vergeClear: Math.round(VERGE_CLEAR * 10) / 100 },
};
const bytes = JSON.stringify(ART).length;
const ts = `// Generated by scripts/build-solar-house.mjs — do not edit by hand.\n/* eslint-disable */\nexport type HouseArt = { width: number; height: number; back: string; slots: string; rails: string[]; panels: string[]; front: string; lift: [number, number]; slotPolys: [number, number][][]; label: string; numbers: Record<string, number> }\nexport const HOUSE_ART: HouseArt = ${JSON.stringify(ART)}\n`;
writeFileSync(join(ROOT, "components/solar-planner/house-art.ts"), ts);
console.log(`items ${R.items.length} · panels ${panelItems.length} · back ${backItems.length} · front ${frontItems.length} · ${(bytes / 1024).toFixed(0)} KB`);

if (args.includes("--preview")) {
  const dir = args[args.indexOf("--preview") + 1] && !args[args.indexOf("--preview") + 1].startsWith("--") ? args[args.indexOf("--preview") + 1] : join(ROOT, ".preview");
  mkdirSync(dir, { recursive: true });
  const count = Number(process.env.PANELS ?? 30);
  const body = `<svg class="iso-svg shp-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}">${ART.back}${ART.slots}${ART.rails.slice(0, Math.ceil(count / COLS)).join("")}${ART.panels.slice(0, count).join("")}${ART.front}</svg>`;
  const css = `.shp-glass{fill:#33424a}.shp-pv{fill:#2b3a44}.shp-cells{fill:none;stroke:#52656f;stroke-width:.3}.shp-gravel{fill:#efefe9}.shp-membrane{fill:#d9dbd6}.shp-slot{fill:none;stroke:var(--anatomy-lo);stroke-width:.6;stroke-dasharray:2 2.4}.shp-planting{--anatomy-paper:#e7ece1;--anatomy-face:#eff3ea;--anatomy-top:#f1f4ec;--anatomy-shade-0:#d3dacb;--anatomy-shade-1:#dbe1d4;--anatomy-shade-2:#e2e7dc;--anatomy-shade-3:#e9ede4;--anatomy-mid:#9aa792;--anatomy-lo:#b6c0ad;--anatomy-faint:#cdd5c5;--anatomy-dot:#6f7e66}`;
  const html = k.pageHtml({ title: "Courtyard House", theme: process.env.THEME ?? "light", width: 1000, body: `<style>${css}</style>` + k.plateHtml({ fig: "Fig. 1", title: "South pitch · 35°", hint: "Preview", readout: `${count} panels`, body }) });
  writeFileSync(join(dir, "house.html"), html);
  console.log("preview", join(dir, "house.html"));
}
