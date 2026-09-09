# Design spec and fidelity ledger

## Accepted concept

- Source: `assets/design-concept.png`
- Canvas: 1536 × 1024 desktop product screen
- Direction: calm enterprise planning surface; dark navy utility header; off-white working canvas; cyan data accents; white table/panel surfaces; amber/red only for risk.
- Container model: one open planning surface with a sticky control rail, primary chart, narrow metric rail, operating table, tradeoff list, and executive memo—not a generic card grid.

## Design system

| Token / family | Implementation |
|---|---|
| Background | `#f7f5f0` |
| Primary ink/header | `#0a1628` |
| Surface | `#ffffff` |
| Border | `#e5e1d7` |
| Accent | `#06b6d4` / `#0891b2` |
| Risk | `#d97706` / `#dc2626` |
| Display typography | Georgia/Fraunces-style serif fallback |
| UI typography | Manrope/Inter/system sans fallback |
| Geometry | Square-edged enterprise controls; restrained radius-free panels |
| Focus | 3px amber outline with offset |

## Allowed first-viewport copy

`Workforce Demand & Capacity Lab`, `Base plan`, `Aggressive hire`, `Conservative plan`, `Export decision memo`, `Scenario controls`, `Demand multiplier`, `Recruiter availability`, `Agency support`, `Risk tolerance`, `Demand vs capacity`, `Weighted demand`, `Capacity units`, `Unit gap`, `Utilization`, `Monthly operating view`, `Tradeoff options`.

## Fidelity ledger

| Comparison point | Concept evidence | Render requirement | Status |
|---|---|---|---|
| Header | Navy bar, serif title, three scenarios, export action | Same order, palette, and control hierarchy | Verified at 1536 × 1024 |
| Controls | Four controls in a narrow left rail | Same fields, explanatory microcopy, reset action | Verified; values update immediately |
| Chart | One dominant demand/capacity chart with shaded gap | Code-native accessible SVG with six months | Verified; plot, labels, legend, and totals align |
| Metrics | Four narrow summary panels | Demand, capacity, gap, utilization totals | Verified against 94 / 78 / 16 / 120.5% base math |
| Table | Six-month operating table with status semantics | Formula-driven rows and total | Verified; status and formula note remain visible |
| Tradeoffs | Three choice rows with impact | Radio selection updates memo only | Verified; contract option changed memo gap from 16 to 6 |
| Memo | Concept prompt required executive memo though generated image cropped it | Added below the main analysis surface as a functional necessity | Intentional extension |
| Mobile | Not shown in concept | Single-column, non-overflowing continuation | Verified at 390 × 844; document width equals viewport width |

## Intentional deviations

- The generated concept omitted the executive memo despite the requested surface. The implementation adds it below the operating table/tradeoffs because it is a required product output.
- The concept displayed a 121% rounded summary. The implementation preserves the auditable value 120.5% and formats it as `120.5%` rather than hiding precision.
- Controls use square-edged native accessible inputs rather than visually simulating every number box in the concept.

## Browser verification record

- Browser route was tested through Playwright Chromium because an in-app browser control was not available in this runtime.
- Desktop screenshot: `assets/implementation-desktop.png` at the concept's native 1536 × 1024 viewport.
- Mobile screenshot: `assets/implementation-mobile.png` at 390 × 844.
- `view_image` was used on the accepted concept, latest desktop render, and latest mobile render.
- Above-the-fold copy matched the allowed inventory; the only functional addition is the required executive memo below the analysis surface.
- Preset switching, a tradeoff selection, CSV export, and Markdown memo export were exercised in the browser.
- No material visual mismatch remains in the implemented viewport. The executive memo extension and 120.5% precision are intentional deviations documented above.
