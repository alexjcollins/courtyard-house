# Groundworks quotes — FGS Pilcher (17–18 Sep 2026)

Source email: Phill Pople (FGS Pilcher) → Alex & Emma Collins, forwarded into `courtyardhousekent@gmail.com` on 23 Sep 2026.  
Subject: *Groundworks and drainage - Gribble Bridge Lane*.

PDFs saved under `docs/quotes/fgs-pilcher-2026-09-18/`.

All figures below are **ex VAT** unless noted.

## Headline totals

| Package | Total ex VAT | Notes |
| --- | ---: | --- |
| Option 1 — foundations + beam & block floor + drainage | **£153,875.13** | Includes haul road, TP, harvesting tank provisional, clay cart-away |
| Option 2 — foundations + concrete slab + drainage | **£178,333.17** | Same wider package; slab instead of B&B |
| No-dig driveway | **£27,402.73** | Separate; BodPave build-up |
| Gym 8×4m ground-bearing slab | **£5,770.00** | Drainage/services TBD |
| Fee proposal (Monson via FGS) | **£4,812.50** | £2,750 foundations design + £2,062.50 drainage design |

**Delta Option 2 vs Option 1:** ~**£24,458** more for the concrete slab route.

## Against Courtyard House app budget

Live `data/` groundworks category budget: **£94,000** ex VAT

| Line | Budget |
| --- | ---: |
| Raft slab | £58,000 |
| Drainage (incl courtyard) | £20,000 |
| Nissen hut demo / old foundations | £9,000 |
| Plinth / terrace concrete | £7,000 |

Older brief (`DECISION_AND_BUDGET_BRIEF.md`) used **£110,000** for a similar “demo + groundworks + drainage + raft” bucket (slightly wider allowances).

### Why the quote is so far above £94k

This is mostly **scope and solution change**, not only unit-rate inflation:

1. **Foundation type changed.** App budget assumes a **raft**. FGS is pricing CONSTANT Option 2 **strip + pad foundations** (pads taken at **2.1 m deep**), heave protection, and either B&B or a **250 mm RC slab** — not a raft package.
2. **Floor construction is in the quote.** B&B or full RC slab sits inside the £154k / £178k numbers. The £94k raft line was a single substructure allowance, not a like-for-like match.
3. **Drainage package grew.** Foul now **70 m** of 100 mm pipe + **7** PPICs (was a thin provisional run). Includes a **finalised 6-person treatment plant** (commissioning + power provisional) and a **£6,000** storm harvesting tank provisional.
4. **Access / spoil / temporary works.** Temporary **haul road** is now in the foundations figure (can no longer double as the permanent permeable road). **100 m³** clay cart-away included.
5. **Demo / plinth not obviously called out** in these five PDFs the same way as the app lines. Nissen hut demo and the terrace plinth may still sit elsewhere or be assumed out of this tender slice.
6. **Driveway and gym are additive.** £27.4k + £5.8k sit outside the house foundations totals.

Rough “compare apples” thought experiment: if you strip the foundations quote to closer to the old raft-only world, you still need to re-price under the SE’s actual strip/pad + floor design — the £94k raft allowance is **obsolete as a control total** until the app budget is rewritten around Option 1 or 2 + drainage reality.

## Value read (practical)

**What looks reasonable / useful**

- Clear split of **two foundation options** with assumptions listed.
- Treatment plant moved from vague provisional toward a **specified 6-person** item (still needs position).
- Clay cart-away and haul road are **priced in** rather than hidden exclusions — good for fixed-price talks.
- Fee proposal is modest relative to the works (£4.8k) and unlocks firmer pricing.

**Where value is thin or needs challenge**

- **£24.5k slab premium vs B&B** — only worth it if the SE/programme/mortgage case truly needs the slab; otherwise B&B is the cost lever.
- **Pads at 2.1 m** — depth-driven cost; confirm geology vs SE final depths before accepting.
- **Slab mesh divergence** — FGS notes **2 layers A252** as a *cost-efficient divergence* from SE spec. Do not accept without SE sign-off; “cheaper mesh” can be false economy or non-compliant.
- **Harvesting tank £6k provisional** — tied to their note that no-dig road levels break gravity discharge into the permeable road. Challenge whether tank + no-dig road is the right pair, or whether road redesign removes the tank.
- **Driveway £27.4k** — material stack is light (Terram / limestone / BodPave); cost is mostly method + tree constraints. Their own notes say construction can be **simplified** and haul road might merge into final road — push a VE workshop here before accepting.
- **Incoming services still not priced** into these totals (details required) — expect more once kiosk/TP positions lock.
- **Gym helical piles** not in this gym PDF (ground-bearing slab only). Earlier email thread discussed piles for the gym; this quote may under-represent the gym once engineered.

## Suggested package combinations (ex VAT)

| Scenario | Foundations option | Driveway | Gym | Fees | Indicative total |
| --- | --- | ---: | ---: | ---: | ---: |
| Lean house substructure | B&B £153,875 | hold / VE | hold | £4,813 | ~£158.7k (+ driveway later) |
| Preferred SE slab | Slab £178,333 | hold / VE | hold | £4,813 | ~£183.1k (+ driveway later) |
| Full current ask | Slab £178,333 | £27,403 | £5,770 | £4,813 | **~£216.3k** |

Add VAT where applicable; confirm which packages are zero-rated for self-build.

## Decision checklist before meeting FGS

1. Lock **B&B vs concrete slab** with SE (and mortgage lender comfort).
2. Get SE to confirm or reject FGS’s **A252 mesh** divergence.
3. Confirm **pad depths** against Integrum / SE — 2.1 m is a major cost driver.
4. Decide **no-dig driveway VE** vs simpler construction; ask for a revised driveway figure if haul road merges with permanent works.
5. Confirm **TP position**, power route, and whether harvesting tank stays.
6. Ask what is **still excluded** vs app budget: Nissen demo, plinth/terrace, courtyard finish, incoming services, tree protection fencing.
7. Update `data/lineItems.json` / categories once a preferred option is chosen so the app budget matches reality.

## Source files

- `docs/quotes/fgs-pilcher-2026-09-18/fgs_GBL_Beam&Block_RevA_8-09-26.pdf` (filename on disk may use `BeamBlock`)
- `docs/quotes/fgs-pilcher-2026-09-18/fgs_ConcSlab_18-09-26.pdf`
- `docs/quotes/fgs-pilcher-2026-09-18/fgs_GBL_Driveway_18-09-26.pdf`
- `docs/quotes/fgs-pilcher-2026-09-18/fgs_GBL_Gym_18-09-26.pdf`
- `docs/quotes/fgs-pilcher-2026-09-18/fgs_GBL_FeeProp_18-09-26.pdf`
