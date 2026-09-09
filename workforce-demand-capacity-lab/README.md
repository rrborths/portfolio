# Workforce Demand & Recruiter Capacity Scenario Lab

A portable, dependency-free executive planning demo that turns a synthetic six-month hiring plan into transparent demand, capacity, gap, feasibility, and tradeoff decisions.

## Run locally

```bash
npm test
npm run serve
```

Open `http://localhost:4173`.

## Core interactions

- Switch among Base, Aggressive Hire, and Conservative Plan presets.
- Adjust demand, recruiter availability, agency support, and risk tolerance.
- Use the concise model context and demonstration statements to orient executive reviewers without changing the dashboard into a marketing page.
- Inspect the six-month demand-versus-capacity chart and formula-driven table.
- Select a modeled tradeoff to preview the adjusted chart, KPIs, monthly statuses, operating table, and executive memo side by side with the baseline; Clear preview restores the untouched scenario.
- Export the synthetic operating table as CSV.
- Export the decision memo as Markdown.

## What the model proves

- The operating assumptions are visible and editable.
- Demand and capacity are separated from external labor-market evidence.
- Aggregate capacity position and peak-month feasibility are calculated separately; the executive decision status always follows the worst monthly guardrail result.
- Tradeoffs are framed as decisions with consequences, not magic recommendations.
- The executive output names the gap, affected months, decision, assumptions, and claims boundary.

## File map

- `index.html`, `styles.css`, `app.js` — portable interactive demo.
- `src/model.mjs` — all formulas, thresholds, scenarios, memo logic, and CSV conversion.
- `tests/model.test.mjs` — 70 deterministic assertions covering scenarios, tradeoff previews, the portable methodology link, responsive-accessibility guardrails, and chart decision signals.
- `docs/model-methodology.md` — formulas, assumptions, controls, and interpretation.
- `docs/design-spec-and-fidelity-ledger.md` — accepted concept, implementation inventory, and visual QA record.
- `assets/design-concept.png` — generated full-screen design concept used as the implementation spec.

## Honest limits

- All data and outputs are synthetic.
- Weighted units are a transparent planning abstraction, not a validated productivity or staffing benchmark.
- The model does not account for pipeline conversion, time-to-fill probability distributions, recruiter ramp, leave calendars, individual performance, hiring-manager delay, or labor-market availability.
- Tradeoff impacts are modeled arithmetic, not cost, quality, speed, or hiring-outcome claims.
- The app stores no data and connects to no ATS, HRIS, email, candidate, or employer system.

## Publication gate

This package is private and review-ready. Publication, portfolio integration, hosted deployment, employer-specific customization, or external sharing requires separate approval.
