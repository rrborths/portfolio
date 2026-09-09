export const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
export const BASE_DEMAND = [14, 15, 16, 17, 16, 16];
export const BASE_CAPACITY = [14, 16, 16, 15, 9, 8];

export const SCENARIOS = Object.freeze({
  base: { label: "Base plan", demandMultiplier: 1, availability: 100, agencySupport: 0, riskTolerance: "medium" },
  aggressive: { label: "Aggressive hire", demandMultiplier: 1.25, availability: 95, agencySupport: 10, riskTolerance: "low" },
  conservative: { label: "Conservative plan", demandMultiplier: 0.85, availability: 105, agencySupport: 0, riskTolerance: "high" },
});

const THRESHOLDS = Object.freeze({
  low: { feasible: 80, atRisk: 95 },
  medium: { feasible: 100, atRisk: 115 },
  high: { feasible: 105, atRisk: 125 },
});

const round1 = (value) => Math.round(value * 10) / 10;

export const TRADEOFFS = Object.freeze({
  contract: {
    title: "Add one contract recruiter Jan–Feb",
    description: "Adds five weighted capacity units in January and five in February; requires budget and onboarding lead time.",
    impact: "+5 Jan and +5 Feb capacity units",
    adjustments: { capacityAddsByMonth: { Jan: 5, Feb: 5 } },
  },
  agency: {
    title: "Raise total agency support to 15%",
    description: "Sets total agency support to a 15% floor across the full period; it does not add another 15 percentage points to the current assumption.",
    impact: "Agency support set to 15% total",
    adjustments: { agencySupportFloor: 15 },
  },
  phase: {
    title: "Phase non-critical roles",
    description: "Reduces weighted demand by two units in December, four in January, and four in February; P0 commitments remain unchanged.",
    impact: "−2 Dec, −4 Jan, −4 Feb demand units",
    adjustments: { demandReductionsByMonth: { Dec: 2, Jan: 4, Feb: 4 } },
  },
});

export function classifyUtilization(utilization, tolerance) {
  const threshold = THRESHOLDS[tolerance];
  if (!threshold) throw new Error(`Unknown risk tolerance: ${tolerance}`);
  if (utilization <= threshold.feasible) return "feasible";
  if (utilization <= threshold.atRisk) return "at-risk";
  return "impossible";
}

export function deriveOverallStatus(months) {
  const statuses = months.map((month) => typeof month === "string" ? month : month.status);
  if (statuses.includes("impossible")) return "impossible";
  if (statuses.includes("at-risk")) return "at-risk";
  return "feasible";
}

function calculateAdjustedScenario(inputs, adjustments = {}) {
  const demandMultiplier = Number(inputs.demandMultiplier);
  const availability = Number(inputs.availability) / 100;
  const agencySupport = Math.max(Number(inputs.agencySupport), Number(adjustments.agencySupportFloor ?? 0)) / 100;
  const riskTolerance = inputs.riskTolerance;
  const demandReductionsByMonth = adjustments.demandReductionsByMonth ?? {};
  const capacityAddsByMonth = adjustments.capacityAddsByMonth ?? {};

  if (!(demandMultiplier > 0) || !(availability > 0) || agencySupport < 0) {
    throw new Error("Scenario inputs must be positive, and agency support cannot be negative.");
  }

  const rows = MONTHS.map((month, index) => {
    const baselineDemand = round1(BASE_DEMAND[index] * demandMultiplier);
    const demandReduction = Number(demandReductionsByMonth[month] ?? 0);
    const demand = round1(Math.max(0, baselineDemand - demandReduction));
    const internalCapacity = round1(BASE_CAPACITY[index] * availability);
    const agencyCapacity = round1(demand * agencySupport);
    const addedCapacity = Number(capacityAddsByMonth[month] ?? 0);
    const capacity = round1(internalCapacity + agencyCapacity + addedCapacity);
    const gap = round1(demand - capacity);
    const utilization = capacity === 0 ? Infinity : round1((demand / capacity) * 100);
    return {
      month,
      demand,
      internalCapacity,
      agencyCapacity,
      addedCapacity,
      capacity,
      gap,
      utilization,
      status: classifyUtilization(utilization, riskTolerance),
    };
  });

  const totalDemand = round1(rows.reduce((sum, row) => sum + row.demand, 0));
  const totalCapacity = round1(rows.reduce((sum, row) => sum + row.capacity, 0));
  const totalGap = round1(totalDemand - totalCapacity);
  const utilization = totalCapacity === 0 ? Infinity : round1((totalDemand / totalCapacity) * 100);
  const aggregateCapacityPosition = totalCapacity >= totalDemand ? "covers-demand" : "shortfall";
  const aggregateStatus = classifyUtilization(utilization, riskTolerance);
  const status = deriveOverallStatus(rows);
  const counts = rows.reduce(
    (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
    { feasible: 0, "at-risk": 0, impossible: 0 },
  );

  return { rows, totalDemand, totalCapacity, totalGap, utilization, aggregateCapacityPosition, aggregateStatus, status, counts };
}

function resolveTradeoff(selectedTradeoff) {
  if (!selectedTradeoff) return null;
  if (typeof selectedTradeoff === "string") {
    const tradeoff = TRADEOFFS[selectedTradeoff];
    if (!tradeoff) throw new Error(`Unknown tradeoff: ${selectedTradeoff}`);
    return { ...tradeoff, id: selectedTradeoff };
  }
  return selectedTradeoff;
}

export function computePreview(baseAssumptions, selectedTradeoff = null) {
  const tradeoff = resolveTradeoff(selectedTradeoff);
  const baseline = calculateAdjustedScenario(baseAssumptions);
  const preview = tradeoff ? calculateAdjustedScenario(baseAssumptions, tradeoff.adjustments) : baseline;
  const beforeAfter = {
    rows: preview.rows.map((row, index) => ({
      month: row.month,
      demand: { before: baseline.rows[index].demand, after: row.demand },
      capacity: { before: baseline.rows[index].capacity, after: row.capacity },
      gap: { before: baseline.rows[index].gap, after: row.gap },
      utilization: { before: baseline.rows[index].utilization, after: row.utilization },
      status: { before: baseline.rows[index].status, after: row.status },
    })),
    totals: {
      demand: { before: baseline.totalDemand, after: preview.totalDemand },
      capacity: { before: baseline.totalCapacity, after: preview.totalCapacity },
      gap: { before: baseline.totalGap, after: preview.totalGap },
      utilization: { before: baseline.utilization, after: preview.utilization },
      status: { before: baseline.status, after: preview.status },
    },
  };

  return { ...preview, baseline, preview, selectedTradeoff: tradeoff, beforeAfter };
}

export function computeScenario(baseAssumptions, selectedTradeoff = null) {
  return computePreview(baseAssumptions, selectedTradeoff);
}

// Retained for existing model consumers; the interactive app uses computePreview exclusively.
export function calculateScenario(inputs, adjustments = {}) {
  return calculateAdjustedScenario(inputs, adjustments);
}

export function createTradeoffPreview(_baselineModel, inputs, id) {
  const pipeline = computePreview(inputs, id);
  return { ...pipeline.selectedTradeoff, id, baselineModel: pipeline.baseline, model: pipeline.preview, beforeAfter: pipeline.beforeAfter, pipeline };
}

export function buildTradeoffs(modelOrInputs, maybeInputs) {
  const inputs = maybeInputs ?? modelOrInputs;
  return Object.keys(TRADEOFFS).map((id) => createTradeoffPreview(null, inputs, id));
}

export function buildDecisionMemo(model, inputs, selectedTradeoff, baselineModel = null) {
  const overallStatus = deriveOverallStatus(model.rows);
  const impossibleMonths = model.rows.filter((row) => row.status === "impossible").map((row) => row.month);
  const riskMonths = model.rows.filter((row) => row.status === "at-risk").map((row) => row.month);
  const formatMonths = (months) => new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(months.map((month) => ({ Sep: "September", Oct: "October", Nov: "November", Dec: "December", Jan: "January", Feb: "February" })[month] ?? month));
  const aggregateCoversDemand = model.aggregateCapacityPosition === "covers-demand";
  const breachedMonths = impossibleMonths.length ? impossibleMonths : riskMonths;
  const health = aggregateCoversDemand ? "Aggregate capacity covers total demand." : `Aggregate capacity has a ${model.totalGap}-unit shortfall.`;
  const monthSignal = breachedMonths.length
    ? aggregateCoversDemand
      ? `Aggregate capacity covers total demand, but ${formatMonths(breachedMonths)} ${breachedMonths.length === 1 ? "exceeds" : "exceed"} selected guardrails.`
      : impossibleMonths.length
        ? `${formatMonths(impossibleMonths)} ${impossibleMonths.length === 1 ? "is" : "are"} impossible under the selected guardrails.`
        : `${formatMonths(riskMonths)} require active risk ownership.`
    : "Every month is feasible under the selected guardrails.";
  const decision = selectedTradeoff
    ? `Preview only: ${selectedTradeoff.title}. Scenario assumptions are unchanged; select Clear preview to return to the baseline view.`
    : overallStatus === "impossible"
      ? "Decision required: add capacity, resequence demand, or explicitly revise the service level."
      : "Decision required: confirm the plan and preserve the modeled capacity assumptions.";
  const beforeAfter = baselineModel
    ? ` Baseline → preview: ${baselineModel.totalDemand} → ${model.totalDemand} demand, ${baselineModel.totalCapacity} → ${model.totalCapacity} capacity, and ${baselineModel.totalGap} → ${model.totalGap} gap.`
    : "";

  return {
    headline: overallStatus === "impossible" ? "Capacity tradeoff required" : overallStatus === "at-risk" ? "Plan at risk" : "Plan is feasible",
    summary: `${aggregateCoversDemand && breachedMonths.length ? "" : `${health} `}${monthSignal} Overall utilization is ${model.utilization}%.${beforeAfter}`,
    decision,
    assumptions: `Demand multiplier ${Number(inputs.demandMultiplier).toFixed(2)}; recruiter availability ${inputs.availability}%; agency support ${inputs.agencySupport}%; ${inputs.riskTolerance} risk tolerance.`,
    claimsBoundary: "Synthetic planning model. It does not claim forecast accuracy, savings, productivity gains, or employer outcomes.",
  };
}

export function toCsv(model) {
  const scenario = model.preview ?? model;
  const overallStatus = deriveOverallStatus(scenario.rows);
  const previewState = model.selectedTradeoff ? `Non-destructive preview: ${model.selectedTradeoff.title}` : "Baseline scenario";
  const header = ["Month", "Demand units", "Internal capacity", "Agency capacity", "Added capacity", "Total capacity", "Gap", "Utilization %", "Status"];
  const body = scenario.rows.map((row) => [row.month, row.demand, row.internalCapacity, row.agencyCapacity, row.addedCapacity, row.capacity, row.gap, row.utilization, row.status]);
  return [["Preview state", previewState], ["Overall status", overallStatus], [], header, ...body].map((row) => row.join(",")).join("\n");
}
