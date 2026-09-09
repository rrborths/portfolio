import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { BASE_CAPACITY, BASE_DEMAND, SCENARIOS, buildDecisionMemo, buildTradeoffs, calculateScenario, classifyUtilization, computePreview, computeScenario, createTradeoffPreview, deriveOverallStatus, toCsv } from "../src/model.mjs";

assert.equal(BASE_DEMAND.reduce((a, b) => a + b, 0), 94);
assert.equal(BASE_CAPACITY.reduce((a, b) => a + b, 0), 78);
assert.equal(classifyUtilization(80, "low"), "feasible");
assert.equal(classifyUtilization(100, "medium"), "feasible");
assert.equal(classifyUtilization(116, "medium"), "impossible");

const base = calculateScenario(SCENARIOS.base);
assert.deepEqual([base.totalDemand, base.totalCapacity, base.totalGap, base.utilization], [94, 78, 16, 120.5]);
assert.deepEqual(base.counts, { feasible: 3, "at-risk": 1, impossible: 2 });
assert.equal(base.aggregateCapacityPosition, "shortfall");
assert.equal(base.status, "impossible");

const aggressive = calculateScenario(SCENARIOS.aggressive);
assert.equal(aggressive.aggregateCapacityPosition, "shortfall");
assert.equal(aggressive.status, "impossible");

const conservative = calculateScenario(SCENARIOS.conservative);
assert.equal(conservative.aggregateCapacityPosition, "covers-demand");
assert.equal(conservative.status, "impossible");
assert.equal(deriveOverallStatus(conservative.rows), "impossible");
assert.deepEqual(conservative.rows.filter((row) => row.status === "impossible").map((row) => row.month), ["Jan", "Feb"]);
const conservativeMemo = buildDecisionMemo(conservative, SCENARIOS.conservative);
assert.equal(conservativeMemo.headline, "Capacity tradeoff required");
assert.match(conservativeMemo.summary, /Aggregate capacity covers total demand, but January and February exceed selected guardrails\./);

// Overall executive status is always derived from monthly statuses, never aggregate utilization.
assert.equal(deriveOverallStatus([{ status: "feasible" }, { status: "feasible" }]), "feasible");
const aggregateSurplusWithImpossibleMonth = { totalDemand: 100, totalCapacity: 105, rows: [{ status: "feasible" }, { status: "impossible" }] };
assert.ok(aggregateSurplusWithImpossibleMonth.totalCapacity > aggregateSurplusWithImpossibleMonth.totalDemand);
assert.equal(deriveOverallStatus(aggregateSurplusWithImpossibleMonth.rows), "impossible");
const aggregateSurplusWithAtRiskMonth = { totalDemand: 100, totalCapacity: 105, rows: [{ status: "feasible" }, { status: "at-risk" }] };
assert.ok(aggregateSurplusWithAtRiskMonth.totalCapacity > aggregateSurplusWithAtRiskMonth.totalDemand);
assert.equal(deriveOverallStatus(aggregateSurplusWithAtRiskMonth.rows), "at-risk");
assert.equal(deriveOverallStatus([{ status: "impossible" }, { status: "at-risk" }, { status: "impossible" }]), "impossible");
for (const preset of Object.values(SCENARIOS)) {
  assert.equal(calculateScenario(preset).status, deriveOverallStatus(calculateScenario(preset).rows));
}
const renderedTable = conservative.rows.map((row) => `${row.month}: ${row.status === "impossible" ? "Impossible" : row.status}`).join("\n");
const renderedMemo = [conservativeMemo.headline, conservativeMemo.summary, conservativeMemo.decision].join("\n");
assert.match(renderedTable, /Impossible/);
assert.doesNotMatch(renderedMemo, /Plan is feasible/);

// The single preview pipeline produces all adjusted values plus presentation deltas.
const conservativeContractPipeline = computeScenario(SCENARIOS.conservative, "contract");
assert.deepEqual(computePreview(SCENARIOS.conservative, "contract").preview, conservativeContractPipeline.preview);
assert.equal(conservativeContractPipeline.preview.rows[4].capacity, conservativeContractPipeline.baseline.rows[4].capacity + 5);
assert.equal(conservativeContractPipeline.preview.rows[5].capacity, conservativeContractPipeline.baseline.rows[5].capacity + 5);
assert.deepEqual(conservativeContractPipeline.preview.rows.slice(0, 4).map((row) => row.capacity), conservativeContractPipeline.baseline.rows.slice(0, 4).map((row) => row.capacity));
assert.deepEqual(conservativeContractPipeline.beforeAfter.rows.map((row) => row.status.after), conservativeContractPipeline.preview.rows.map((row) => row.status));
assert.equal(conservativeContractPipeline.status, deriveOverallStatus(conservativeContractPipeline.preview.rows));
const conservativeAgencyPipeline = computeScenario(SCENARIOS.conservative, "agency");
assert.deepEqual(conservativeAgencyPipeline.preview.rows.map((row) => row.demand), conservativeAgencyPipeline.baseline.rows.map((row) => row.demand));
assert.ok(conservativeAgencyPipeline.preview.rows.every((row, index) => row.capacity >= conservativeAgencyPipeline.baseline.rows[index].capacity));
assert.equal(conservativeAgencyPipeline.status, deriveOverallStatus(conservativeAgencyPipeline.preview.rows));
const conservativePhasePipeline = computeScenario(SCENARIOS.conservative, "phase");
assert.deepEqual(conservativePhasePipeline.preview.rows.map((row, index) => row.demand - conservativePhasePipeline.baseline.rows[index].demand), [0, 0, 0, -2, -4, -4]);
assert.deepEqual(conservativePhasePipeline.preview.rows.map((row) => row.capacity), conservativePhasePipeline.baseline.rows.map((row) => row.capacity));
assert.equal(conservativePhasePipeline.status, deriveOverallStatus(conservativePhasePipeline.preview.rows));

const contract = createTradeoffPreview(base, SCENARIOS.base, "contract");
assert.deepEqual([contract.model.totalDemand, contract.model.totalCapacity, contract.model.totalGap, contract.model.utilization], [94, 88, 6, 106.8]);
assert.deepEqual(contract.model.rows.map((row) => [row.month, row.addedCapacity]), [["Sep", 0], ["Oct", 0], ["Nov", 0], ["Dec", 0], ["Jan", 5], ["Feb", 5]]);
assert.deepEqual(contract.model.rows.map((row) => row.demand), base.rows.map((row) => row.demand));

const agency = createTradeoffPreview(base, SCENARIOS.base, "agency");
assert.deepEqual([agency.model.totalDemand, agency.model.totalCapacity, agency.model.totalGap, agency.model.utilization], [94, 92.2, 1.8, 102]);
assert.equal(agency.model.rows[0].agencyCapacity, 2.1);
const aboveFloor = calculateScenario({ ...SCENARIOS.base, agencySupport: 20 });
const aboveFloorPreview = createTradeoffPreview(aboveFloor, { ...SCENARIOS.base, agencySupport: 20 }, "agency");
assert.deepEqual(aboveFloorPreview.model.rows.map((row) => row.agencyCapacity), aboveFloor.rows.map((row) => row.agencyCapacity));

const phase = createTradeoffPreview(base, SCENARIOS.base, "phase");
assert.deepEqual([phase.model.totalDemand, phase.model.totalCapacity, phase.model.totalGap, phase.model.utilization], [84, 78, 6, 107.7]);
assert.deepEqual(phase.model.rows.map((row) => [row.month, row.demand]), [["Sep", 14], ["Oct", 15], ["Nov", 16], ["Dec", 15], ["Jan", 12], ["Feb", 12]]);

for (const preview of [contract, agency, phase]) {
  const memo = buildDecisionMemo(preview.model, SCENARIOS.base, preview, base);
  assert.match(memo.summary, /Baseline → preview:/);
  assert.match(memo.decision, /Preview only/);
  assert.equal(memo.headline, preview.model.status === "impossible" ? "Capacity tradeoff required" : preview.model.status === "at-risk" ? "Plan at risk" : "Plan is feasible");
}

const tradeoffs = buildTradeoffs(base, SCENARIOS.base);
assert.equal(tradeoffs.length, 3);
assert.match(toCsv(contract.model), /Added capacity/);
assert.match(toCsv(conservative), /^Overall status,impossible/m);
assert.match(toCsv(conservativeContractPipeline), /Preview state,Non-destructive preview: Add one contract recruiter Jan–Feb/);

const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const methodologyUrl = new URL("../docs/model-methodology.html", import.meta.url);
await access(methodologyUrl);
const methodologyHtml = await readFile(methodologyUrl, "utf8");
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");
assert.match(indexHtml, /href="\/workforce-demand-capacity-lab\/docs\/model-methodology\.html"/);
assert.match(indexHtml, /href="\/workforce-demand-capacity-lab\/styles\.css\?v=1\.13\.1"/);
assert.match(indexHtml, /src="\/workforce-demand-capacity-lab\/app\.js\?v=1\.13\.1"/);
assert.match(indexHtml, /<div class="brand-block">/);
assert.match(indexHtml, /<a class="brand" href="#main">Workforce Demand &amp; Capacity Lab<\/a>/);
assert.match(indexHtml, /<p class="brand-subtitle">/);
assert.match(indexHtml, /class="context-decision"/);
assert.match(indexHtml, /class="demonstrates-panel"/);
assert.match(indexHtml, /class="synthetic-disclosure">Synthetic portfolio model/);
assert.match(methodologyHtml, /<title>Model Methodology \| Workforce Demand &amp; Capacity Lab<\/title>/);
assert.match(methodologyHtml, /<h1>Model methodology<\/h1>/);
assert.match(methodologyHtml, /href="\/workforce-demand-capacity-lab\/">← Back to model<\/a>/);
assert.match(methodologyHtml, /Worked example: December, base plan/);
assert.match(methodologyHtml, /<th>Medium<\/th><td>≤100%<\/td><td>&gt;100% to 115%<\/td><td>&gt;115%<\/td>/);
assert.match(methodologyHtml, /Tradeoff selection is a non-destructive preview/);
assert.match(methodologyHtml, /This model does not claim:/);
assert.match(indexHtml, /id="mobile-operating-cards"/);
assert.match(indexHtml, /aria-labelledby="demand-label demand-value" aria-describedby="demand-description"/);
assert.match(indexHtml, /id="live-region" class="sr-only" aria-live="polite" aria-atomic="true"/);
assert.match(appSource, /function renderMobileCards\(model, baselineModel = null\)/);
assert.match(appSource, /Aggregate summary/);
assert.match(appSource, /const aggregateStatus = deriveOverallStatus\(model\.rows\)/);
assert.match(appSource, /for="tradeoff-\$\{item\.id\}"/);
assert.match(appSource, /Previewing \$\{TRADEOFFS\[radio\.value\]\.title\}/);
assert.match(stylesSource, /@media \(max-width: 639px\)/);
assert.match(stylesSource, /\.table-scroll \{ display: none !important; \}/);
assert.match(stylesSource, /\.mobile-operating-cards \{ display: grid; gap: 10px; width: 100%; \}/);
assert.match(stylesSource, /\.control-block input\[type="range"\] \{ width: 100%; min-height: 44px;/);
assert.match(stylesSource, /\.month-card-values dt \{ color: var\(--muted\); font-size: \.875rem;/);
assert.match(indexHtml, /id="chart-text-summary" class="chart-text-summary"/);
assert.match(indexHtml, /id="legend-preview-demand" hidden/);
assert.match(indexHtml, /id="legend-preview-capacity" hidden/);
assert.match(appSource, /function buildChartSummary\(rows, previewRows = null, previewTitle = ""\)/);
assert.match(appSource, /January–February capacity decline/);
assert.match(appSource, /Preview demand and preview capacity are displayed/);
assert.match(appSource, /const statusMarkers = rows\.map/);
assert.match(appSource, /Newly feasible month/);
assert.match(appSource, /const riskBands = rows\.map/);
assert.match(stylesSource, /\.chart-text-summary \{/);
assert.match(stylesSource, /\.brand-subtitle \{ max-width: 640px; margin: 5px 0 0; color: rgba\(255,255,255,\.72\); font-family: var\(--sans\); font-size: \.96rem;/);
assert.match(stylesSource, /\.context-details \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(stylesSource, /\.context-details \.context-decision \{ grid-column: 1 \/ -1; \}/);
assert.match(stylesSource, /\.demonstrates ul \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(appSource, /function deriveOverallStatus\(months\)/);
assert.match(appSource, /function computePreview\(baseAssumptions, selectedTradeoff = null\)/);
assert.match(appSource, /\$\("#legend-preview-demand"\)\.hidden = !selected/);
assert.match(appSource, /window\.__capacityLab = \{ scenario: selectedScenario, inputs: values, pipeline/);
assert.doesNotMatch(appSource, /worstMonthlyStatus|peakMonthStatus|STATUS_PRIORITY/);

console.log(JSON.stringify({ status: "passed", assertions: 118, base, aggressive, conservative, previews: { contract: contract.model, agency: agency.model, phase: phase.model } }, null, 2));
