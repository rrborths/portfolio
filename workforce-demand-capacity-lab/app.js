// Model (inlined from src/model.mjs for file:// compatibility)
const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
const BASE_DEMAND = [14, 15, 16, 17, 16, 16];
const BASE_CAPACITY = [14, 16, 16, 15, 9, 8];

const SCENARIOS = Object.freeze({
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
const TRADEOFFS = Object.freeze({
  contract: { title: "Add one contract recruiter Jan–Feb", description: "Adds five weighted capacity units in January and five in February; requires budget and onboarding lead time.", impact: "+5 Jan and +5 Feb capacity units", adjustments: { capacityAddsByMonth: { Jan: 5, Feb: 5 } } },
  agency: { title: "Raise total agency support to 15%", description: "Sets total agency support to a 15% floor across the full period; it does not add another 15 percentage points to the current assumption.", impact: "Agency support set to 15% total", adjustments: { agencySupportFloor: 15 } },
  phase: { title: "Phase non-critical roles", description: "Reduces weighted demand by two units in December, four in January, and four in February; P0 commitments remain unchanged.", impact: "−2 Dec, −4 Jan, −4 Feb demand units", adjustments: { demandReductionsByMonth: { Dec: 2, Jan: 4, Feb: 4 } } },
});

function deriveOverallStatus(months) {
  const statuses = months.map((month) => typeof month === "string" ? month : month.status);
  if (statuses.includes("impossible")) return "impossible";
  if (statuses.includes("at-risk")) return "at-risk";
  return "feasible";
}

function classifyUtilization(utilization, tolerance) {
  const threshold = THRESHOLDS[tolerance];
  if (!threshold) throw new Error(`Unknown risk tolerance: ${tolerance}`);
  if (utilization <= threshold.feasible) return "feasible";
  if (utilization <= threshold.atRisk) return "at-risk";
  return "impossible";
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
    const demand = round1(Math.max(0, BASE_DEMAND[index] * demandMultiplier - Number(demandReductionsByMonth[month] ?? 0)));
    const internalCapacity = round1(BASE_CAPACITY[index] * availability);
    const agencyCapacity = round1(demand * agencySupport);
    const addedCapacity = Number(capacityAddsByMonth[month] ?? 0);
    const capacity = round1(internalCapacity + agencyCapacity + addedCapacity);
    const gap = round1(demand - capacity);
    const utilization = capacity === 0 ? Infinity : round1((demand / capacity) * 100);
    return { month, demand, internalCapacity, agencyCapacity, addedCapacity, capacity, gap, utilization, status: classifyUtilization(utilization, riskTolerance) };
  });
  const totalDemand = round1(rows.reduce((sum, row) => sum + row.demand, 0));
  const totalCapacity = round1(rows.reduce((sum, row) => sum + row.capacity, 0));
  const totalGap = round1(totalDemand - totalCapacity);
  const utilization = totalCapacity === 0 ? Infinity : round1((totalDemand / totalCapacity) * 100);
  const aggregateCapacityPosition = totalCapacity >= totalDemand ? "covers-demand" : "shortfall";
  const aggregateStatus = classifyUtilization(utilization, riskTolerance);
  const status = deriveOverallStatus(rows);
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }), { feasible: 0, "at-risk": 0, impossible: 0 });
  return {
    assumptions: { demandMultiplier, availability: Number(inputs.availability), agencySupport: Number(inputs.agencySupport), riskTolerance },
    rows,
    totalDemand,
    totalCapacity,
    totalGap,
    utilization,
    aggregateCapacityPosition,
    aggregateStatus,
    status,
    counts,
  };
}

function calculateBaseScenario(assumptions) {
  return calculateAdjustedScenario(assumptions);
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

function calculatePreview(baseScenario, selectedTradeoff = null) {
  const tradeoff = resolveTradeoff(selectedTradeoff);
  if (!tradeoff) return baseScenario;
  return calculateAdjustedScenario(baseScenario.assumptions, tradeoff.adjustments);
}

function computePreview(baseAssumptions, selectedTradeoff = null) {
  const tradeoff = resolveTradeoff(selectedTradeoff);
  const baseline = calculateBaseScenario(baseAssumptions);
  const preview = calculatePreview(baseline, tradeoff);
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

function buildTradeoffs(inputs) {
  return Object.keys(TRADEOFFS).map((id) => {
    const pipeline = computePreview(inputs, id);
    return { ...pipeline.selectedTradeoff, id, baselineModel: pipeline.baseline, model: pipeline.preview, beforeAfter: pipeline.beforeAfter, pipeline };
  });
}

function buildDecisionMemo(model, inputs, selectedTradeoff, baselineModel = null) {
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
  const decision = selectedTradeoff ? `Preview only: ${selectedTradeoff.title}. Scenario assumptions are unchanged; select Clear preview to return to the baseline view.` : overallStatus === "impossible" ? "Decision required: add capacity, resequence demand, or explicitly revise the service level." : "Decision required: confirm the plan and preserve the modeled capacity assumptions.";
  const beforeAfter = baselineModel ? ` Baseline → preview: ${baselineModel.totalDemand} → ${model.totalDemand} demand, ${baselineModel.totalCapacity} → ${model.totalCapacity} capacity, and ${baselineModel.totalGap} → ${model.totalGap} gap.` : "";
  return {
    headline: overallStatus === "impossible" ? "Capacity tradeoff required" : overallStatus === "at-risk" ? "Plan at risk" : "Plan is feasible",
    summary: `${aggregateCoversDemand && breachedMonths.length ? "" : `${health} `}${monthSignal} Overall utilization is ${model.utilization}%.${beforeAfter}`,
    decision,
    assumptions: `Demand multiplier ${Number(inputs.demandMultiplier).toFixed(2)}; recruiter availability ${inputs.availability}%; agency support ${inputs.agencySupport}%; ${inputs.riskTolerance} risk tolerance.`,
    claimsBoundary: "Synthetic planning model. It does not claim forecast accuracy, savings, productivity gains, or employer outcomes.",
  };
}

function toCsv(model) {
  const scenario = model.preview ?? model;
  const overallStatus = deriveOverallStatus(scenario.rows);
  const previewState = model.selectedTradeoff ? `Non-destructive preview: ${model.selectedTradeoff.title}` : "Baseline scenario";
  const header = ["Month", "Demand units", "Internal capacity", "Agency capacity", "Added capacity", "Total capacity", "Gap", "Utilization %", "Status"];
  const body = scenario.rows.map((row) => [row.month, row.demand, row.internalCapacity, row.agencyCapacity, row.addedCapacity, row.capacity, row.gap, row.utilization, row.status]);
  return [["Preview state", previewState], ["Overall status", overallStatus], [], header, ...body].map((row) => row.join(",")).join("\n");
}

// App
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const inputs = {
  demandMultiplier: $("#demand-multiplier"),
  availability: $("#availability"),
  agencySupport: $("#agency-support"),
  riskTolerance: $("#risk-tolerance"),
};

let selectedScenario = "base";
let selectedTradeoffId = null;
let toastTimer;

function inputValues() {
  return {
    demandMultiplier: Number(inputs.demandMultiplier.value),
    availability: Number(inputs.availability.value),
    agencySupport: Number(inputs.agencySupport.value),
    riskTolerance: inputs.riskTolerance.value,
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  announce(message);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function announce(message) {
  const liveRegion = $("#live-region");
  liveRegion.textContent = "";
  requestAnimationFrame(() => { liveRegion.textContent = message; });
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function applyScenario(key, announceChange = false) {
  const scenario = SCENARIOS[key];
  selectedScenario = key;
  selectedTradeoffId = null;
  inputs.demandMultiplier.value = scenario.demandMultiplier;
  inputs.availability.value = scenario.availability;
  inputs.agencySupport.value = scenario.agencySupport;
  inputs.riskTolerance.value = scenario.riskTolerance;
  $$(".scenario-tab").forEach((tab) => {
    const active = tab.dataset.scenario === key;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  updateApplication();
  if (announceChange) announce(`${scenario.label} scenario applied.`);
}

function buildChartSummary(rows, previewRows = null, previewTitle = "") {
  const firstGap = rows.find((row) => row.gap > 0);
  const largestGap = rows.reduce((largest, row) => row.gap > largest.gap ? row : largest, rows[0]);
  const capacityDrop = rows.slice(3).map((row) => `${row.month} ${formatNumber(row.capacity)}`).join(", ");
  const baseline = `Capacity first falls short in ${firstGap.month} by ${formatNumber(firstGap.gap)} units. The largest baseline gap is ${formatNumber(largestGap.gap)} units in ${largestGap.month}. The synthetic baseline allocates fewer capacity units from December through February (${capacityDrop}).`;
  if (!previewRows) return baseline;
  const newlyFeasible = previewRows.filter((row, index) => rows[index].status !== "feasible" && row.status === "feasible").map((row) => row.month);
  const remainingGap = previewRows.reduce((largest, row) => row.gap > largest.gap ? row : largest, previewRows[0]);
  const previewResult = remainingGap.gap <= 0
    ? `The ${previewTitle} preview resolves every modeled monthly gap.`
    : `The ${previewTitle} preview does not fully resolve the plan; the largest remaining gap is ${formatNumber(remainingGap.gap)} units in ${remainingGap.month}.`;
  return `${baseline} Preview demand and preview capacity are displayed for ${previewTitle}. ${newlyFeasible.length ? `Newly feasible month${newlyFeasible.length === 1 ? "" : "s"}: ${newlyFeasible.join(", ")}.` : "No months become newly feasible in this preview."} ${previewResult}`;
}

function renderChart(rows, previewRows = null, previewTitle = "") {
  const svg = $("#capacity-chart");
  const width = 900;
  const height = 330;
  const pad = { top: 32, right: 30, bottom: 48, left: 46 };
  const chartRows = previewRows ? [...rows, ...previewRows] : rows;
  const maxValue = Math.max(30, ...chartRows.flatMap((row) => [row.demand, row.capacity]));
  const maxY = Math.ceil(maxValue / 10) * 10;
  const x = (index) => pad.left + (index * (width - pad.left - pad.right)) / (rows.length - 1);
  const y = (value) => height - pad.bottom - (value / maxY) * (height - pad.top - pad.bottom);
  const demandPoints = rows.map((row, index) => `${x(index)},${y(row.demand)}`).join(" ");
  const capacityPoints = rows.map((row, index) => `${x(index)},${y(row.capacity)}`).join(" ");
  const areaPoints = `${demandPoints} ${[...rows].reverse().map((row, reverseIndex) => `${x(rows.length - 1 - reverseIndex)},${y(row.capacity)}`).join(" ")}`;
  const previewDemandPoints = previewRows?.map((row, index) => `${x(index)},${y(row.demand)}`).join(" ");
  const previewCapacityPoints = previewRows?.map((row, index) => `${x(index)},${y(row.capacity)}`).join(" ");
  const bandWidth = (width - pad.left - pad.right) / (rows.length - 1) * .72;
  const riskBands = rows.map((row, index) => row.status === "feasible" ? "" : `<rect x="${x(index) - bandWidth / 2}" y="${pad.top}" width="${bandWidth}" height="${height - pad.top - pad.bottom}" fill="${row.status === "impossible" ? "#fff1f2" : "#fff7e6"}" />`).join("");
  const statusMarkers = rows.map((row, index) => row.status === "feasible" ? "" : `<text x="${x(index)}" y="80" text-anchor="middle" fill="${row.status === "impossible" ? "#b91c1c" : "#b45309"}" font-size="10" font-weight="800">${row.status === "impossible" ? "Impossible" : "At risk"}</text>`).join("");
  const gapMarkers = rows.map((row, index) => {
    if (row.gap <= 0) return "";
    const color = row.status === "impossible" ? "#dc2626" : "#d97706";
    const midpoint = (y(row.demand) + y(row.capacity)) / 2;
    return `<line x1="${x(index)}" y1="${y(row.demand) + 7}" x2="${x(index)}" y2="${y(row.capacity) - 7}" stroke="${color}" stroke-width="3" />
      <rect x="${x(index) - 17}" y="${midpoint - 10}" width="34" height="20" rx="10" fill="#ffffff" stroke="${color}" />
      <text x="${x(index)}" y="${midpoint + 4}" text-anchor="middle" fill="${color}" font-size="11" font-weight="800">+${formatNumber(row.gap)}</text>`;
  }).join("");
  const recoveryMarkers = previewRows?.map((row, index) => rows[index].status !== "feasible" && row.status === "feasible" ? `<circle cx="${x(index)}" cy="${y(row.capacity)}" r="8" fill="#ecfdf5" stroke="#0f766e" stroke-width="2" />
    <text x="${x(index)}" y="${Math.min(y(row.demand), y(row.capacity)) - 20}" text-anchor="middle" fill="#0f766e" font-size="11" font-weight="800">Feasible</text>` : "").join("") ?? "";
  const summary = buildChartSummary(rows, previewRows, previewTitle);

  const grid = [0, 10, 20, 30].filter((tick) => tick <= maxY).map((tick) => `
    <g><line x1="${pad.left}" y1="${y(tick)}" x2="${width - pad.right}" y2="${y(tick)}" stroke="#e5e1d7" stroke-dasharray="4 4" />
    <text x="${pad.left - 12}" y="${y(tick) + 4}" text-anchor="end" fill="#5b6473" font-size="12">${tick}</text></g>`).join("");
  const labels = rows.map((row, index) => `
    <text x="${x(index)}" y="${height - 16}" text-anchor="middle" fill="#0a1628" font-size="13">${row.month}</text>
    <circle cx="${x(index)}" cy="${y(row.demand)}" r="5" fill="#06b6d4" />
    <circle cx="${x(index)}" cy="${y(row.capacity)}" r="4" fill="#0891b2" />
    <text x="${x(index)}" y="${y(row.demand) - 12}" text-anchor="middle" fill="#0a1628" font-size="12" font-weight="700">${formatNumber(row.demand)}</text>`).join("");

  svg.innerHTML = `
    <title>Demand versus capacity by month</title>
    <desc>${summary}</desc>
    ${riskBands}
    ${grid}
    ${statusMarkers}
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="#98a1ad" />
    <polygon points="${areaPoints}" fill="rgba(6,182,212,.14)" />
    <polyline points="${demandPoints}" fill="none" stroke="#06b6d4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <polyline points="${capacityPoints}" fill="none" stroke="#0891b2" stroke-width="4" stroke-dasharray="10 7" stroke-linecap="round" stroke-linejoin="round" />
    ${gapMarkers}
    <path d="M ${x(4)} 62 L ${x(4)} ${y(rows[4].capacity) - 12}" fill="none" stroke="#5b6473" stroke-width="1.5" stroke-dasharray="4 4" />
    <text x="${x(3) + 12}" y="42" fill="#0a1628" font-size="12" font-weight="800">January–February capacity decline</text>
    <text x="${x(3) + 12}" y="57" fill="#5b6473" font-size="11">Synthetic baseline: Jan ${formatNumber(rows[4].capacity)} → Feb ${formatNumber(rows[5].capacity)} weighted units</text>
    ${previewRows ? `<polyline points="${previewDemandPoints}" fill="none" stroke="#7c3aed" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <polyline points="${previewCapacityPoints}" fill="none" stroke="#7c3aed" stroke-width="4" stroke-dasharray="3 7" stroke-linecap="round" stroke-linejoin="round" />
    ${recoveryMarkers}` : ""}
    ${labels}`;
  $("#chart-description").textContent = summary;
  $("#chart-text-summary").textContent = summary;
}

function comparison(before, after, suffix = "") {
  return before === after ? `${formatNumber(after)}${suffix}` : `<span class="before-after">${formatNumber(before)}${suffix} <b>→</b> ${formatNumber(after)}${suffix}</span>`;
}

function renderRows(model, baselineModel = null) {
  $("#operating-rows").innerHTML = model.rows.map((row, index) => {
    const baseline = baselineModel?.rows[index];
    return `
    <tr>
      <td>${row.month}</td>
      <td>${baseline ? comparison(baseline.demand, row.demand) : formatNumber(row.demand)}</td>
      <td>${baseline ? comparison(baseline.capacity, row.capacity) : formatNumber(row.capacity)}</td>
      <td class="${row.gap > 0 ? "positive-gap" : row.gap < 0 ? "negative-gap" : ""}">${baseline ? comparison(baseline.gap, row.gap) : formatNumber(row.gap)}</td>
      <td>${baseline ? comparison(baseline.utilization, row.utilization, "%") : `${formatNumber(row.utilization)}%`}</td>
      <td><span class="status-cell ${row.status}">${baseline && baseline.status !== row.status ? `${baseline.status.replace("-", " ")} → ` : ""}${row.status.replace("-", " ")}</span></td>
    </tr>`;
  }).join("");
}

function renderMobileCards(model, baselineModel = null) {
  const monthlyCards = model.rows.map((row, index) => {
    const baseline = baselineModel?.rows[index];
    const statusText = row.status.replace("-", " ");
    const previousStatus = baseline && baseline.status !== row.status ? `${baseline.status.replace("-", " ")} → ` : "";
    return `<article class="month-card">
      <div class="month-card-heading"><h3>${row.month}</h3><span class="status-cell ${row.status}">${previousStatus}${statusText}</span></div>
      <dl class="month-card-values">
        <div><dt>Demand</dt><dd>${baseline ? comparison(baseline.demand, row.demand) : formatNumber(row.demand)}</dd></div>
        <div><dt>Capacity</dt><dd>${baseline ? comparison(baseline.capacity, row.capacity) : formatNumber(row.capacity)}</dd></div>
        <div><dt>Gap</dt><dd class="${row.gap > 0 ? "positive-gap" : row.gap < 0 ? "negative-gap" : ""}">${baseline ? comparison(baseline.gap, row.gap) : formatNumber(row.gap)}</dd></div>
        <div><dt>Utilization</dt><dd>${baseline ? comparison(baseline.utilization, row.utilization, "%") : `${formatNumber(row.utilization)}%`}</dd></div>
      </dl>
    </article>`;
  }).join("");
  const aggregateStatus = deriveOverallStatus(model.rows);
  const aggregateBefore = baselineModel ? baselineModel.status : null;
  const aggregateStatusText = aggregateStatus.replace("-", " ");
  const aggregatePreviousStatus = aggregateBefore && aggregateBefore !== aggregateStatus ? `${aggregateBefore.replace("-", " ")} → ` : "";
  const aggregateCard = `<article class="month-card aggregate-card">
    <div class="month-card-heading"><h3>Aggregate summary</h3><span class="status-cell ${aggregateStatus}">${aggregatePreviousStatus}${aggregateStatusText}</span></div>
    <dl class="month-card-values">
      <div><dt>Demand</dt><dd>${baselineModel ? comparison(baselineModel.totalDemand, model.totalDemand) : formatNumber(model.totalDemand)}</dd></div>
      <div><dt>Capacity</dt><dd>${baselineModel ? comparison(baselineModel.totalCapacity, model.totalCapacity) : formatNumber(model.totalCapacity)}</dd></div>
      <div><dt>Gap</dt><dd class="${model.totalGap > 0 ? "positive-gap" : model.totalGap < 0 ? "negative-gap" : ""}">${baselineModel ? comparison(baselineModel.totalGap, model.totalGap) : formatNumber(model.totalGap)}</dd></div>
      <div><dt>Utilization</dt><dd>${baselineModel ? comparison(baselineModel.utilization, model.utilization, "%") : `${formatNumber(model.utilization)}%`}</dd></div>
    </dl>
  </article>`;
  $("#mobile-operating-cards").innerHTML = `${monthlyCards}${aggregateCard}`;
}

function renderTradeoffs(values) {
  const tradeoffs = buildTradeoffs(values);
  if (selectedTradeoffId && !tradeoffs.some((item) => item.id === selectedTradeoffId)) selectedTradeoffId = null;
  $("#tradeoff-options").innerHTML = tradeoffs.map((item) => `
    <label class="tradeoff-option ${selectedTradeoffId === item.id ? "is-selected" : ""}" for="tradeoff-${item.id}">
      <input id="tradeoff-${item.id}" type="radio" name="tradeoff" value="${item.id}" ${selectedTradeoffId === item.id ? "checked" : ""} />
      <span class="tradeoff-copy"><strong>${item.title}</strong><span>${item.description}</span></span>
      <span class="tradeoff-impact"><small>Impact</small><strong>${item.impact}</strong></span>
    </label>`).join("");
  $$("input[name='tradeoff']").forEach((radio) => radio.addEventListener("change", () => {
    selectedTradeoffId = radio.value;
    updateApplication();
    announce(`Previewing ${TRADEOFFS[radio.value].title}. Scenario assumptions are unchanged.`);
  }));
  $("#clear-preview").hidden = !selectedTradeoffId;
  $("#preview-state").textContent = selectedTradeoffId ? "Preview only — scenario assumptions are unchanged." : "Select one to preview its decision impact.";
  return tradeoffs;
}

function renderMemo(model, values, tradeoffs, baselineModel) {
  const selected = tradeoffs.find((item) => item.id === selectedTradeoffId);
  const memo = buildDecisionMemo(model, values, selected, baselineModel);
  const overallStatus = deriveOverallStatus(model.rows);
  $("#memo-headline").textContent = memo.headline;
  $("#memo-summary").textContent = memo.summary;
  $("#memo-decision").textContent = memo.decision;
  $("#memo-assumptions").textContent = memo.assumptions;
  $("#memo-boundary").textContent = memo.claimsBoundary;
  const status = $("#memo-status");
  status.textContent = overallStatus.replace("-", " ").toUpperCase();
  status.className = `status-label ${overallStatus}`;
  return memo;
}

function renderApplication(baseScenario, previewScenario, selected, values, pipeline) {
  const baselineModel = baseScenario;
  const model = previewScenario;
  $("#demand-value").value = `${values.demandMultiplier.toFixed(2)}×`;
  $("#availability-value").value = `${values.availability}%`;
  $("#agency-value").value = `${values.agencySupport}%`;
  const tradeoffs = buildTradeoffs(values);
  const comparisonModel = selected ? baselineModel : null;
  $("#metric-demand").innerHTML = comparisonModel ? comparison(comparisonModel.totalDemand, model.totalDemand) : formatNumber(model.totalDemand);
  $("#metric-capacity").innerHTML = comparisonModel ? comparison(comparisonModel.totalCapacity, model.totalCapacity) : formatNumber(model.totalCapacity);
  $("#metric-gap").innerHTML = comparisonModel ? comparison(comparisonModel.totalGap, model.totalGap) : formatNumber(model.totalGap);
  $("#metric-gap").classList.toggle("risk", model.totalGap > 0);
  $("#metric-utilization").innerHTML = comparisonModel ? comparison(comparisonModel.utilization, model.utilization, "%") : `${formatNumber(model.utilization)}%`;
  $("#total-demand").innerHTML = comparisonModel ? comparison(comparisonModel.totalDemand, model.totalDemand) : formatNumber(model.totalDemand);
  $("#total-capacity").innerHTML = comparisonModel ? comparison(comparisonModel.totalCapacity, model.totalCapacity) : formatNumber(model.totalCapacity);
  $("#total-gap").innerHTML = comparisonModel ? comparison(comparisonModel.totalGap, model.totalGap) : formatNumber(model.totalGap);
  $("#total-utilization").innerHTML = comparisonModel ? comparison(comparisonModel.utilization, model.utilization, "%") : `${formatNumber(model.utilization)}%`;
  renderChart(baselineModel.rows, selected ? model.rows : null, selected?.title);
  $("#legend-preview-demand").hidden = !selected;
  $("#legend-preview-capacity").hidden = !selected;
  renderRows(model, comparisonModel);
  renderMobileCards(model, comparisonModel);
  renderTradeoffs(values);
  const memo = renderMemo(model, values, tradeoffs, comparisonModel);
  window.__capacityLab = { scenario: selectedScenario, inputs: values, pipeline, baselineModel, model, selectedTradeoff: selected, tradeoffs, memo };
}

function updateApplication() {
  const values = inputValues();
  const pipeline = computePreview(values, selectedTradeoffId);
  renderApplication(pipeline.baseline, pipeline.preview, pipeline.selectedTradeoff, values, pipeline);
}

Object.values(inputs).forEach((input) => input.addEventListener("input", () => {
  selectedScenario = "custom";
  $$(".scenario-tab").forEach((tab) => { tab.classList.remove("is-active"); tab.setAttribute("aria-selected", "false"); });
  updateApplication();
}));

$$(".scenario-tab").forEach((tab) => tab.addEventListener("click", () => applyScenario(tab.dataset.scenario, true)));
$("#clear-preview").addEventListener("click", () => { selectedTradeoffId = null; updateApplication(); showToast("Tradeoff preview cleared; baseline restored."); });
$("#reset-plan").addEventListener("click", () => { applyScenario("base"); showToast("Base plan restored."); });
$("#export-csv").addEventListener("click", () => {
  download("synthetic-workforce-demand-capacity.csv", toCsv(window.__capacityLab.pipeline), "text/csv;charset=utf-8");
  showToast("Synthetic operating data exported as CSV.");
});
$("#export-memo").addEventListener("click", () => {
  const { memo, model, selectedTradeoff } = window.__capacityLab;
  const previewState = selectedTradeoff ? `**State:** Non-destructive preview — ${selectedTradeoff.title}\n\n` : "**State:** Baseline scenario\n\n";
  const content = `# Workforce Demand & Capacity Decision Memo\n\n**Synthetic portfolio model**\n\n${previewState}## ${memo.headline}\n\n${memo.summary}\n\n**Decision:** ${memo.decision}\n\n**Assumptions:** ${memo.assumptions}\n\n## Monthly operating view\n\n| Month | Demand | Capacity | Gap | Utilization | Status |\n|---|---:|---:|---:|---:|---|\n${model.rows.map((row) => `| ${row.month} | ${row.demand} | ${row.capacity} | ${row.gap} | ${row.utilization}% | ${row.status} |`).join("\n")}\n\n${memo.claimsBoundary}\n`;
  download("synthetic-capacity-decision-memo.md", content, "text/markdown;charset=utf-8");
  showToast("Decision memo exported as Markdown.");
});

applyScenario("base");
