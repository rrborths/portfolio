# Mobile and accessibility QA

## Scope

September 8, 2026 refinement pass for the private synthetic Workforce Demand & Capacity Lab. No visual-identity redesign, deployment, publication, or external write occurred.

## Responsive results

| Viewport | Result |
|---|---|
| 390 × 844 | Pass. The wide monthly table is replaced by six Month cards. Each card keeps its textual Status visible with demand, capacity, gap, and utilization; no horizontal table scroll is needed. Metrics remain a 2 × 2 grid. |
| 768 × 1024 | Pass. Controls and results stack cleanly; the desktop table remains available because there is enough width. |
| 1024 × 900 | Pass. The two-column dashboard composition, chart, metric rail, and context panel remain legible. |
| 1440 × 1000 | Pass. The desktop composition preserves the existing executive-dashboard hierarchy. |

At sub-640 widths, mobile card values use 14px minimum text, explanatory body copy uses 16px, chart text is set to 14px, and controls/buttons/selects have a 44px minimum usable height. Status always includes its textual label, so color is not the only signal.

## Keyboard-only results

- Tab moves from the brand link through scenario tabs, export, controls, exports, and tradeoff radios in a visible focus order.
- Enter on the Aggressive hire tab applied the scenario and updated the polite live region with “Aggressive hire scenario applied.”
- Tab reached the contract-recruiter radio; Space activated its full tradeoff card, updated preview values, and announced the non-destructive preview.
- Export decision memo was activated and announced as “Decision memo exported as Markdown.”
- The yellow focus-visible treatment remains present for interactive controls; tradeoff cards also receive it through `:focus-within`.

## Accessibility checks

- Each slider has an explicit `<label for>`, `aria-labelledby` including its current value, and the original explanatory text via `aria-describedby`.
- Risk tolerance retains its explicit label and description.
- Every tradeoff card is a label associated with its radio control, so clicking or keyboard-operating the card activates the radio.
- Scenario, preview, clear-preview, and export feedback is announced through a polite, atomic live region; toast feedback remains visible.
- Browser zoom is not restricted, and statuses retain text labels.

## Test evidence

- `npm test` passes 115 model and static assertions, including guardrails for the mobile cards, slider wiring, live region, tradeoff association, and sub-640 responsive rule.
- `npm run test:served` passes 12 Playwright checks for synchronized previews, reset behavior, 390px and 1440px rendering, 44px controls, and a clean browser console.
- Rendered captures were reviewed at 390, 768, 1024, and 1440 widths.
- The gstack Browser runner was attempted but remained blocked by its existing startup lock; rendered viewport and keyboard validation used the local browser/Playwright fallback.
