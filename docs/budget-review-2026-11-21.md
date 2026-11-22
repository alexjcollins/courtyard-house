# Budget review — 21 Nov 2026

A line-by-line pass over all 58 budget line items in 18 categories, compared against the decision
register, procurement (quotes, POs, invoices), `HOUSE_BRIEF.md` and `DECISION_AND_BUDGET_BRIEF.md`.
All figures are ex VAT. A snapshot of the budget before this review is in
`exports/db-backups/budget-before-review-20261121.json`.

The figures in sections 2–4 are rough planning ranges for discussion, not quotes.

## 1. Applied: duplicate released to contingency (+£4,000)

| Change | Why |
| --- | --- |
| Deleted **Utilities › Final compliance, sign-off, and close-out documentation** (£4,000). Renamed the remaining £4,000 line to *Testing, certification and close-out (SAP/EPC, ventilation and drainage tests, completion docs)*. | Two £4,000 lines covered the same scope: testing and certification on one, compliance sign-off and close-out on the other. Their likely contents are already budgeted elsewhere: the air test is in **Envelope › Airtightness… testing allowance**, ASHP commissioning is in **M&E › ASHP plant… and commissioning**, and the electrical certificate normally comes with the electrician's price. One £4,000 line comfortably covers what's left. |

Contingency went from £100,000 to **£104,000**, with the envelope unchanged at £917,589.47. The
change is in the audit log as `claude-budget-review` (`npm run budget -- log`).

Building control fees are **not** in the budget anywhere. I haven't moved the released money to
them; they're in section 4.

## 2. Possible overlaps: not changed, need a decision

I didn't cut these because the size of each overlap depends on a design or procurement choice
that isn't recorded in the data.

| # | Where | The overlap | What settles it | Likely release |
| --- | --- | --- | --- | --- |
| 2.1 | **Timber frame › Sheathing, breather membranes, and timber frame sundries** (£10,000) vs **Envelope › External wall build-up, sheathing, and insulation** (£19,000) | Wall sheathing (and arguably the breather membrane) is described in both packages. | Decide which trade supplies and fixes the sheathing, then remove it from the other line. | £3,000–£6,000 |
| 2.2 | **Timber frame › Structural carpentry and roof carcassing** (£20,000) vs **Roofs** (£35,000, unallocated) | The decision register splits Roofs as *Pitched roof build-up £20k*, *Flat roof links £8k* and *Rainwater goods/trims £6k*. If "build-up" includes rafters and joists, the roof structure is counted twice. | Ask the structural engineer or roofer what the pitched-roof build-up includes over the steel portal frame. | £0–£10,000 |
| 2.3 | **Prelims › General preliminaries allowance and contractor site overhead** (£6,037.35) | It's a balancing figure (£20,000 minus the other prelims lines) sitting on top of the named welfare (£7,500) and temporary works/access (£6,000) lines. With trades engaged directly, there's no main-contractor overhead to pay. | I'd **re-purpose** it rather than release it: scaffold and waste (section 4) have nowhere else to go. | £0 if re-purposed |
| 2.4 | **Finishes › Polished concrete ~140–150 m²** (£20,000) + **Engineered oak ~110 m²** (£7,000) | That's 250–260 m² of flooring against 250 m² total including the garage. The five bathrooms and WC (~28 m²) are already budgeted under Bathrooms "…and finishes". The decision register puts the living zones (entrance, KDL, office, utility, hallways) at ~122 m², not 140–150 m², and the bedrooms are 90.4 m² gross including ensuites, not 110 m². It's only consistent if the garage gets polished concrete, which conflicts with the separate £1,500 *Garage floor finish* decision. | Fix the floor-finish plan room by room (garage, office and hall are the swing rooms). | £0–£6,000 |
| 2.5 | **Internal build-up** includes "screeds"; **Polished concrete** is described as a wearing course | If the polished concrete is laid as the UFH screed, a separate screed under it is a double. | Confirm the floor build-up with the UFH installer and flooring contractor. | £3,000–£5,000 |

## 3. Fixed: double counting in the forecast (decision register)

These don't touch budget or contingency, but they feed the project forecast and the Sale scenarios
panel on the Budget page. All three are fixed in one transaction. The rows from before the fix are
in `exports/db-backups/decisions-forecast-fix-20261121.json`.

| Decision | Before | After | Forecast effect |
| --- | --- | --- | --- |
| **Living zones floor finish** (~122 m²) | Selected *Space8 poured terrazzo £40,000*, baseline £22,400 → **+£17,600** | New current selection *Polished concrete £20,000*, baseline £20,000. Terrazzo was dropped in the 4 Oct budget update, four months after the 28 May selection. The terrazzo selection is kept as history, and the new selection's notes name it. | 0 |
| **Bedrooms floor finish** | Selected *Engineered £7,000*, baseline £5,000 → **+£2,000**, even though the Engineered oak line item is already £7,000 | Baseline £7,000, and the spec reads *engineered oak* (it said solid oak) | 0 |
| **Whole-house decorating** | Selected *£5,000*, baseline £18,000 → **−£13,000**, for a cost with no budget line | Baseline £0, so the £5,000 selection now adds its full cost to the forecast | +£5,000 |

Finishes now adds **+£5,000** to the forecast (it was +£6,600), and that £5,000 is the decorating
money that really is missing from the budget (4.5). If you add decorating as a budget line,
set this decision's baseline to match the line, or the £5,000 will be counted twice again.

## 4. Suggested additions: for review, not added

Most likely to be needed are listed first.

| # | Item | Why it looks missing | Rough range |
| --- | --- | --- | --- |
| 4.1 | **Front door and side-glazing assembly** (~3 m) | The Glideline quote (£72,486) explicitly excludes entrance doors. The decision register carries £8,000. | £6,000–£10,000 |
| 4.2 | **Garage door + motor** | Not in the Windows lines. The decision register carries £6,000, and the brief lists a motor feed. | £4,000–£7,000 |
| 4.3 | **Foul drainage outfall** | Groundworks covers "drainage runs… within site". If there is no mains sewer at the site, a package treatment plant is a major separate cost. | £0 (sewer) or £6,000–£12,000 |
| 4.4 | **Building control fees** (LABC or approved inspector) | No line anywhere. Fees only has the pre-planning application. | £2,000–£3,500 |
| 4.5 | **Decorating** | The Finishes category description includes decorating, but there's no line for it. The decision register has £5,000 selected (£18,000 baseline). | £5,000–£12,000 |
| 4.6 | **Kitchen installation labour** | The Vermland lines cover cabinetry, the utility, shipping and *virtual* install support only. | £3,000–£6,000 |
| 4.7 | **Structural warranty** (10-year self-build) | Usually needed for a mortgage on completion and for resale. | £4,000–£8,000 |
| 4.8 | **Self-build site insurance** | Works, public liability and employer's liability for the build period. | £1,000–£2,500 |
| 4.9 | **Mechanical extract / ventilation** | MVHR was removed in favour of local extract, but M&E has no extract fans or ducting (kitchen, utility, 4 bathrooms, WC). Bathrooms only has "extract accessories". | £1,500–£3,000 |
| 4.10 | **Electricity supply connection + fibre** | Utilities has one £3,650 "connections, metering and sundries" line for both, after the water connection. A new connection from the electricity network operator alone can use most of that. | £2,000–£6,000 |
| 4.11 | **Scaffolding** | Prelims "access measures" is £6,000 for 3 gabled volumes across the envelope and roofing period. | £6,000–£12,000 |
| 4.12 | **Driveway / hardstanding to the garage** | The groundworks note says the September quotes exclude the driveway, and landscaping is excluded. Access to the garage is needed to occupy the house. | £8,000–£20,000 |
| 4.13 | **Steel quote exclusions** | MJ Allen excludes connection design, stainless angles, thermal breaks and bracket fabrication. These currently rely on Other structural works (£7,000). | £1,000–£4,000 extra |
| 4.14 | **Fire protection to steel** | The quoted option for 60-minute intumescent is £9,636.31, not included. Check with building control whether any is required. | £0–£9,636 |
| 4.15 | **Waste / skips through the build** | Only one skip has been booked (£302.65). | £2,000–£4,000 |
| 4.16 | **Planning application / discharge of conditions fees** | Only the pre-application fee is budgeted. | £600–£1,500 |
| 4.17 | **Solar PV (± battery)** | The repo has a solar planner, but PV isn't in the budget. | £6,000–£12,000 (+ battery) |

**Process risks rather than budget lines:**

- **CIL self-build exemption:** make sure it's claimed (and the commencement notice filed) before
  work starts. Otherwise the levy can become payable in full.
- **Ecology:** the ecology study is paid, but any mitigation for the Nissen hut demolition (e.g. a
  bat licence) isn't budgeted.
- **Stair:** the decision register has a £6,000 stair structure under Internal build-up. Confirm
  the £33,000 unallocated allowance is meant to cover it.

**A known cost pressure that isn't a gap:** groundworks is budgeted at £140,000, but the September
foundations-and-drainage quotes are about £154,000, and that's before the driveway, gym and design fees.
