# Model methodology

## User story

As a CHRO, CPO, CFO, or Head of Talent Acquisition, I need to see whether an approved workforce plan fits the recruiting system's available capacity so I can explicitly choose sequencing, supplemental capacity, or a service-level change before commitments slip.

## Synthetic baseline

| Month | Demand units | Recruiter capacity units |
|---|---:|---:|
| Sep | 14 | 14 |
| Oct | 15 | 16 |
| Nov | 16 | 16 |
| Dec | 17 | 15 |
| Jan | 16 | 9 |
| Feb | 16 | 8 |
| **Total** | **94** | **78** |

The 16-unit base gap and 120.5% overall utilization are intentional so the demo contains feasible, at-risk, and impossible months.

## Formulas

For each month `m`:

```text
demand[m] = baselineDemand[m] × demandMultiplier
internalCapacity[m] = baselineCapacity[m] × recruiterAvailability
agencyCapacity[m] = demand[m] × agencySupport
totalCapacity[m] = internalCapacity[m] + agencyCapacity[m]
gap[m] = demand[m] - totalCapacity[m]
utilization[m] = demand[m] ÷ totalCapacity[m]
```

Values are rounded to one decimal place after each visible step.

## Status thresholds

| Risk tolerance | Feasible | At risk | Impossible |
|---|---:|---:|---:|
| Low | ≤80% | >80% to 95% | >95% |
| Medium | ≤100% | >100% to 115% | >115% |
| High | ≤105% | >105% to 125% | >125% |

Higher tolerance accepts more modeled utilization before labeling a commitment impossible. This is a policy choice, not evidence that the commitment is safe.

## Scenario presets

| Scenario | Demand multiplier | Recruiter availability | Agency support | Risk tolerance |
|---|---:|---:|---:|---|
| Base plan | 1.00 | 100% | 0% | Medium |
| Aggressive hire | 1.25 | 95% | 10% | Low |
| Conservative plan | 0.85 | 105% | 0% | High |

## Tradeoff arithmetic

- Contract recruiter: adds five modeled capacity units in January and five in February only.
- Agency increase: raises total agency support to a 15% floor across the six-month period; it never adds another 15 percentage points to an already-selected agency assumption.
- Phase non-critical roles: reduces demand by two units in December, four in January, and four in February. This deliberately preserves September–November and modeled P0 commitments.

Selecting a tradeoff creates a non-destructive preview: baseline and adjusted values are shown together, but the scenario inputs are not overwritten. Clear preview returns the entire surface to the baseline scenario.

The options do not estimate cost, quality, recruiter ramp, or role-specific time-to-fill. Their purpose is to make the decision category and its direction visible.

## Acceptance criteria

1. Every control changes the model immediately.
2. Base totals equal 94 demand, 78 capacity, 16 gap, and 120.5% utilization.
3. Base view contains three feasible, one at-risk, and two impossible months.
4. All table values match the chart's underlying rows.
5. A selected tradeoff updates the chart, KPIs, monthly operating table, statuses, and memo without silently rewriting the scenario.
6. Aggregate capacity position (total capacity versus total demand) is reported separately from peak-month feasibility.
7. The executive headline follows the worst monthly result: impossible = Capacity tradeoff required; at risk = Plan at risk; feasible = Plan is feasible.
8. When aggregate capacity covers demand but any month breaches a guardrail, the memo says the plan is not operationally feasible and names the breached months.
9. Each tradeoff has tested monthly and aggregate calculations, and the memo, chart, table, and KPIs use the same preview model.
10. CSV and Markdown exports contain only the synthetic current view.
11. Keyboard focus is visible; chart has accessible title/description; table remains usable on narrow screens.
12. No network request, persistent storage, real data, or external write is used.

## Claims boundary

This is an inspectable portfolio planning pattern. It does not claim forecast accuracy, business savings, recruiter productivity, hiring outcomes, or results from an employer deployment.
