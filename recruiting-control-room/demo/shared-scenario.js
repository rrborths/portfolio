const roundOne = (value) => Math.round(value * 10) / 10;

export const calculateConversion = (fromCount, toCount) => roundOne((toCount / fromCount) * 100);
export const calculateDelta = (count, comparisonCount) => (
  comparisonCount === null || comparisonCount === undefined
    ? null
    : roundOne(((count - comparisonCount) / comparisonCount) * 100)
);

const methodology = {
  observed: 'Stage counts, conversion, requisition age, and SLA completion are observed metrics in the selected synthetic reporting-period snapshot.',
  derived: 'Period deltas, funnel risk, SLA status, forecast ranges, and decision-priority scores are derived indicators calculated from the selected synthetic inputs.',
  generated: 'Recommended actions are generated recommendations for human review. They do not rank candidates, change records, send messages, or trigger external actions.',
  formulas: [
    {
      id: 'M-01', name: 'Funnel risk', type: 'Derived indicator',
      logic: 'High when SLA health is below 65%, conversion is at least 10 points below its stage benchmark, or age is over 45 days with a confirmed volume constraint. Medium when SLA is 65–79% or conversion is 5–9.9 points below benchmark. Low when SLA is at least 80% and no explicit conversion or aging flag is present.',
    },
    {
      id: 'M-02', name: 'SLA health', type: 'Observed metric',
      logic: 'Milestones completed inside the agreed window ÷ milestones due in the window × 100. At risk: below 65%. Watch: 65–79%. Healthy: 80% or higher.',
    },
    {
      id: 'M-03', name: 'Forecast', type: 'Derived indicator',
      logic: 'Open demand × stage-weighted probability × available delivery capacity, expressed as a range through the stated horizon. It is a planning estimate, not a hiring commitment.',
    },
    {
      id: 'M-04', name: 'Decision priority', type: 'Derived indicator',
      logic: 'Severity weight (High 3, Medium 2, Low 1) + roles affected + volume tier (2 for 250+, 1 for 100–249) + one point for a stage-count decline of at least 5% when a prior comparison is available. Ties resolve by due date and actionability; a human confirms final order.',
    },
  ],
  thresholds: [
    { label: 'High risk', value: 'SLA <65%, conversion ≥10 points below benchmark, or age >45 days with a volume constraint' },
    { label: 'Medium risk', value: 'SLA 65–79% or conversion 5–9.9 points below benchmark' },
    { label: 'Low risk', value: 'SLA ≥80% with no explicit conversion or aging flag' },
  ],
};

const weeklyNarrative = {
  changed: 'Engineering intake increased by eight requisitions. Sales conversion improved to 23.4%, while seven Product roles are aging and Product conversion slipped to 16.2%.',
  decisions: 'Approve two Senior Backend Engineer requisitions with a capacity offset; align on the Sales expansion plan and hiring pace; prioritize the Product Manager openings.',
  risks: 'Engineering capacity is tight, Sales demand could outpace the approved plan, and Product is forecast at 6 of 12 hires with seven aging roles.',
  commitments: 'Recruiting will rebalance sourcing capacity for Engineering, publish a Sales hiring sequence, and move the Product Manager roles to the top of the weekly slate.',
};

const weeklyDecisions = [
  {
    id: 'W-01', title: 'Approve two additional Senior Backend Engineer requisitions', owner: 'Kelly Lee', due: '2025-06-03',
    source: 'Engineering requisition plan + weekly capacity review',
    evidence: 'Engineering added eight requisitions and has 21 aging roles; leadership confirmed demand for two additional Senior Backend Engineers.',
    rationale: 'The roles support committed platform work, but approval must include an explicit recruiter-capacity offset.',
    recommendedAction: 'Approve both requisitions and temporarily rebalance sourcing capacity from lower-priority work.',
  },
  {
    id: 'W-02', title: 'Align on Sales expansion plan and hiring pace', owner: 'Diego Brooks', due: '2025-06-04',
    source: 'Sales expansion plan + weekly performance snapshot',
    evidence: 'Sales conversion improved to 23.4%, but 9 roles are aging and the forecast is 21 of 30 hires.',
    rationale: 'The team needs one approved sequence for geography, role priority, and recruiter capacity before opening more demand.',
    recommendedAction: 'Confirm the phased Sales plan and release requisitions in the agreed priority order.',
  },
  {
    id: 'W-03', title: 'Prioritize Product Manager openings', owner: 'Jordan Taylor', due: '2025-06-05',
    source: 'Product requisition plan + weekly performance snapshot',
    evidence: 'Product has 7 aging roles, 16.2% stage conversion, and a forecast of 6 of 12 hires.',
    rationale: 'Roadmap-critical Product Manager roles are competing with lower-priority openings for the same recruiting capacity.',
    recommendedAction: 'Rank the Product Manager openings by roadmap impact and pause lower-priority Product demand.',
  },
];

const buildPeriodScenario = ({
  metadata,
  stageCounts,
  comparisonStageCounts = null,
  transitionSettings,
  requisitions,
  funnelDecisions,
  recommendationLineage,
}) => {
  const funnelStages = stageCounts.map((stage, index) => ({
    label: stage.label,
    count: stage.count,
    delta: comparisonStageCounts ? calculateDelta(stage.count, comparisonStageCounts[index].count) : null,
    conversion: index === 0 ? null : calculateConversion(stageCounts[index - 1].count, stage.count),
  }));

  const funnelTransitions = transitionSettings.map((settings, index) => ({
    id: `T-0${index + 1}`,
    from: stageCounts[index].label,
    to: stageCounts[index + 1].label,
    fromCount: stageCounts[index].count,
    toCount: stageCounts[index + 1].count,
    conversion: calculateConversion(stageCounts[index].count, stageCounts[index + 1].count),
    benchmark: settings.benchmark,
    source: settings.source,
    bottleneck: Boolean(settings.bottleneck),
    priorityReason: settings.priorityReason,
  }));

  return Object.freeze({
    metadata: Object.freeze(metadata),
    funnelStages: Object.freeze(funnelStages.map(Object.freeze)),
    funnelTransitions: Object.freeze(funnelTransitions.map(Object.freeze)),
    methodology,
    recommendationLineage: Object.freeze(recommendationLineage.map(Object.freeze)),
    requisitions: Object.freeze(requisitions.map(Object.freeze)),
    funnelDecisions: Object.freeze(funnelDecisions.map(Object.freeze)),
    weeklyNarrative,
    weeklyDecisions,
  });
};

const aprilStageCounts = [
  { label: 'Applied', count: 1114 },
  { label: 'Recruiter Screen', count: 509 },
  { label: 'Hiring Manager', count: 270 },
  { label: 'Interview', count: 118 },
  { label: 'Offer', count: 26 },
  { label: 'Hired', count: 14 },
];

const mayStageCounts = [
  { label: 'Applied', count: 1248 },
  { label: 'Recruiter Screen', count: 534 },
  { label: 'Hiring Manager', count: 248 },
  { label: 'Interview', count: 112 },
  { label: 'Offer', count: 28 },
  { label: 'Hired', count: 16 },
];

const aprilSources = {
  ats: 'ATS snapshot 2025-05-03 (ATS-SYN-0503-v1)',
  calendar: 'Interview calendar 2025-05-03 (CAL-SYN-0503-v1)',
  plan: 'Requisition plan 2025-05-02 (REQ-SYN-0502-v1)',
};

const maySources = {
  ats: 'ATS snapshot 2025-05-31 (ATS-SYN-0531-v2)',
  calendar: 'Interview calendar 2025-05-31 (CAL-SYN-0531-v2)',
  plan: 'Requisition plan 2025-05-30 (REQ-SYN-0530-v2)',
  baseline: 'Comparison baseline 2025-05-03 (ATS-SYN-0503-v1)',
};

const aprilScenario = buildPeriodScenario({
  metadata: {
    key: '2025-04-06_2025-05-03',
    name: '2025 Recruiting Operating Review Demo',
    label: 'Fixed 2025 demonstration scenario',
    period: 'Apr 6 – May 3, 2025',
    periodStart: '2025-04-06',
    periodEnd: '2025-05-03',
    asOfDate: '2025-05-03',
    priorPeriod: null,
    comparisonAvailable: false,
    comparisonLabel: 'Comparison unavailable — no earlier baseline dataset is loaded.',
    snapshotDate: 'May 3, 2025',
    sourceVersion: 'RCR-SYN-2025.05.03-v1',
    refreshStatus: 'Fixed snapshot · no live connection',
    sourceRecords: Object.values(aprilSources),
    sourceSummary: `${aprilSources.ats} · ${aprilSources.calendar} · ${aprilSources.plan}`,
    exportSlug: '2025-04-06_to_2025-05-03',
  },
  stageCounts: aprilStageCounts,
  transitionSettings: [
    { benchmark: 40, source: aprilSources.ats },
    { benchmark: 55, source: aprilSources.ats },
    {
      benchmark: 50, source: aprilSources.ats, bottleneck: true,
      priorityReason: 'Prioritized because 270 candidates reached Hiring Manager but only 118 progressed to Interview, a 43.7% conversion that is 6.3 points below the 50% scenario benchmark. Three active requisitions show interview-capacity or scheduling friction. Comparison is unavailable because no earlier baseline dataset is loaded.',
    },
    { benchmark: 22, source: aprilSources.ats },
    { benchmark: 50, source: aprilSources.ats },
  ],
  requisitions: [
    {
      id: 'ENG-1278', role: 'Senior Backend Engineer', owner: 'Kelly Lee', age: 10,
      risk: 'Medium', reason: 'Interview capacity watch', sla: 74, slaLabel: 'Watch',
      forecast: '3–5 hires by Jun 30', nextDecision: 'Reserve manager interview capacity',
      evidence: 'The role is 10 days old, but manager interview capacity is not yet reserved and SLA health is 74%.',
      rationale: 'A modest scheduling constraint is emerging before the role becomes an aging risk.',
      recommendedAction: 'Reserve recurring manager interview blocks before increasing the qualified slate.',
      due: '2025-05-06', source: `${aprilSources.ats} + ${aprilSources.calendar}`,
    },
    {
      id: 'SAL-0432', role: 'Regional Sales Director', owner: 'Diego Brooks', age: 17,
      risk: 'Medium', reason: 'Panel schedule watch', sla: 77, slaLabel: 'Watch',
      forecast: '1–2 hires by Jun 15', nextDecision: 'Confirm panel sequence and dates',
      evidence: 'SLA health is 77% and the final panel sequence has not been confirmed.',
      rationale: 'Scheduling is still recoverable if the panel sequence is locked this week.',
      recommendedAction: 'Confirm panel membership and reserve the first interview block.',
      due: '2025-05-07', source: `${aprilSources.calendar} + ${aprilSources.plan}`,
    },
    {
      id: 'FIN-0881', role: 'Finance Manager', owner: 'Aisha Rahman', age: 3,
      risk: 'Low', reason: 'On track', sla: 92, slaLabel: 'Healthy',
      forecast: '1 hire by May 30', nextDecision: 'Complete first-slate review',
      evidence: 'SLA health is 92% and the first qualified slate is ready for review.',
      rationale: 'No material delivery constraint is present in the selected period.',
      recommendedAction: 'Complete the first-slate review and preserve the current interview cadence.',
      due: '2025-05-08', source: `${aprilSources.ats} + ${aprilSources.calendar}`,
    },
    {
      id: 'OPS-0567', role: 'Distribution Supervisor', owner: 'Jordan Taylor', age: 24,
      risk: 'Medium', reason: 'Sourcing yield watch', sla: 68, slaLabel: 'Watch',
      forecast: '1–2 hires by Jun 30', nextDecision: 'Clarify shift requirements',
      evidence: 'The role is 24 days old with 68% SLA health and uneven response by shift.',
      rationale: 'The sourcing plan cannot stabilize until shift requirements are explicit.',
      recommendedAction: 'Confirm shift must-haves and update the approved sourcing brief.',
      due: '2025-05-07', source: `${aprilSources.plan} + ${aprilSources.ats}`,
    },
    {
      id: 'MKT-0314', role: 'Growth Marketing Manager', owner: 'Sofia Martinez', age: 21,
      risk: 'Low', reason: 'On track', sla: 84, slaLabel: 'Healthy',
      forecast: '1 hire by Jun 10', nextDecision: 'Advance finalist slate',
      evidence: 'SLA health is 84% and the finalist slate meets the approved scorecard.',
      rationale: 'The selected period shows adequate volume and decision pace.',
      recommendedAction: 'Advance the finalist slate to the hiring leader review.',
      due: '2025-05-08', source: `${aprilSources.ats} + ${aprilSources.plan}`,
    },
    {
      id: 'HR-0641', role: 'People Operations Partner', owner: 'Leah Nguyen', age: 33,
      risk: 'High', reason: 'Interview SLA risk', sla: 61, slaLabel: 'At risk',
      forecast: '0–1 hires by Jun 20', nextDecision: 'Reset interviewer ownership',
      evidence: 'SLA health is 61% and two interviewer handoffs were missed in the selected period.',
      rationale: 'Unclear interviewer ownership is creating avoidable queue time.',
      recommendedAction: 'Name one interview owner and publish response-time expectations.',
      due: '2025-05-06', source: `${aprilSources.calendar} + ${aprilSources.plan}`,
    },
  ],
  funnelDecisions: [
    {
      id: 'F-01', title: 'Restore Hiring Manager-to-Interview pace', owner: 'Kelly Lee', due: '2025-05-06',
      source: aprilSources.ats,
      evidence: 'Only 118 of 270 candidates progressed from Hiring Manager to Interview, a 43.7% conversion versus the 50% benchmark.',
      rationale: 'The selected-period bottleneck is interview capacity after hiring-manager review.',
      recommendedAction: 'Reserve recurring interview blocks and confirm disposition ownership.',
    },
    {
      id: 'F-02', title: 'Reset People Operations interviewer ownership', owner: 'Leah Nguyen', due: '2025-05-06',
      source: aprilSources.calendar,
      evidence: 'HR-0641 has 61% SLA health and two missed interviewer handoffs.',
      rationale: 'A named owner is the shortest path to recover the interview SLA.',
      recommendedAction: 'Assign one interview owner and publish response-time expectations.',
    },
    {
      id: 'F-03', title: 'Clarify Distribution Supervisor shift requirements', owner: 'Jordan Taylor', due: '2025-05-07',
      source: aprilSources.plan,
      evidence: 'OPS-0567 has 68% SLA health and uneven response across undefined shift requirements.',
      rationale: 'The sourcing plan cannot be calibrated against an ambiguous operating need.',
      recommendedAction: 'Confirm shift must-haves and update the approved sourcing brief.',
    },
  ],
  recommendationLineage: [
    {
      decisionId: 'F-01', recommendation: 'Reserve recurring interview blocks and confirm disposition ownership.',
      metrics: '270 Hiring Manager → 118 Interview; 43.7% conversion; comparison unavailable',
      derivation: '6.3 points below the 50% benchmark + three affected requisitions',
      source: aprilSources.ats,
    },
    {
      decisionId: 'F-02', recommendation: 'Assign one interview owner and publish response-time expectations.',
      metrics: 'HR-0641 SLA health 61%; two missed interviewer handoffs',
      derivation: 'SLA below the 65% high-risk threshold + ownership constraint',
      source: aprilSources.calendar,
    },
    {
      decisionId: 'F-03', recommendation: 'Confirm shift must-haves and update the approved sourcing brief.',
      metrics: 'OPS-0567 age 24 days; SLA health 68%; uneven shift response',
      derivation: 'SLA in the 65–79% watch band + confirmed scope ambiguity',
      source: aprilSources.plan,
    },
  ],
});

const mayScenario = buildPeriodScenario({
  metadata: {
    key: '2025-05-04_2025-05-31',
    name: '2025 Recruiting Operating Review Demo',
    label: 'Fixed 2025 demonstration scenario',
    period: 'May 4 – May 31, 2025',
    periodStart: '2025-05-04',
    periodEnd: '2025-05-31',
    asOfDate: '2025-05-31',
    priorPeriod: 'Apr 6 – May 3, 2025',
    comparisonAvailable: true,
    comparisonLabel: 'All change badges compare stage counts with Apr 6 – May 3, 2025.',
    snapshotDate: 'May 31, 2025',
    sourceVersion: 'RCR-SYN-2025.05.31-v2',
    refreshStatus: 'Fixed snapshot · no live connection',
    sourceRecords: Object.values(maySources),
    sourceSummary: `${maySources.ats} · ${maySources.calendar} · ${maySources.plan} · ${maySources.baseline}`,
    exportSlug: '2025-05-04_to_2025-05-31',
  },
  stageCounts: mayStageCounts,
  comparisonStageCounts: aprilStageCounts,
  transitionSettings: [
    { benchmark: 40, source: maySources.ats },
    {
      benchmark: 55, source: maySources.ats, bottleneck: true,
      priorityReason: 'Prioritized because 534 candidates enter this upstream transition, only 248 reach Hiring Manager, conversion is 46.4% (8.6 points below the 55% scenario benchmark), and the Hiring Manager stage count is down 8.1% versus Apr 6 – May 3. ENG-1278 and DES-0199 show manager-stage friction. Interview-to-Offer is lower at 25%, but it is above its 22% benchmark and up from 22% in the comparison period.',
    },
    { benchmark: 50, source: maySources.ats },
    { benchmark: 22, source: maySources.ats },
    { benchmark: 50, source: maySources.ats },
  ],
  requisitions: [
    {
      id: 'ENG-1278', role: 'Senior Backend Engineer', owner: 'Kelly Lee', age: 38,
      risk: 'High', reason: 'Conversion drop at Hiring Manager', sla: 62, slaLabel: 'At risk',
      forecast: '4–6 hires by Jul 31', nextDecision: 'Align on manager availability and move forward candidates',
      evidence: 'Hiring-manager conversion is below plan and the requisition has been open 38 days.',
      rationale: 'The current manager schedule is the binding constraint, not top-of-funnel volume.',
      recommendedAction: 'Reserve two manager interview blocks this week and advance the qualified slate.',
      due: '2025-06-03', source: `${maySources.ats} + ${maySources.calendar}`,
    },
    {
      id: 'SAL-0432', role: 'Regional Sales Director', owner: 'Diego Brooks', age: 45,
      risk: 'High', reason: 'Interview SLA risk', sla: 48, slaLabel: 'At risk',
      forecast: '1–2 hires by Jun 30', nextDecision: 'Confirm interview panel and dates',
      evidence: 'Interview SLA health is 48% and the role has been open 45 days.',
      rationale: 'An incomplete panel schedule is delaying qualified candidates.',
      recommendedAction: 'Name the final panel and lock interview dates before adding more candidates.',
      due: '2025-06-04', source: `${maySources.calendar} + ${maySources.plan}`,
    },
    {
      id: 'DES-0199', role: 'Product Designer', owner: 'Sofia Martinez', age: 27,
      risk: 'Medium', reason: 'Conversion below benchmark', sla: 71, slaLabel: 'Watch',
      forecast: '1 hire by Jul 15', nextDecision: 'Share role preview and refresh job post',
      evidence: 'Conversion is below benchmark while SLA health remains recoverable at 71%.',
      rationale: 'The current role story is not converting enough qualified interest.',
      recommendedAction: 'Publish the approved role preview and refresh the job post before expanding spend.',
      due: '2025-06-05', source: `${maySources.ats} + ${maySources.baseline}`,
    },
    {
      id: 'FIN-0881', role: 'Finance Manager', owner: 'Aisha Rahman', age: 31,
      risk: 'Low', reason: 'On track', sla: 86, slaLabel: 'Healthy',
      forecast: '1 hire by Jun 20', nextDecision: 'Review final candidates and schedule manager calls',
      evidence: 'SLA health is 86% with a viable final slate.',
      rationale: 'The role is on track if final interviews happen this week.',
      recommendedAction: 'Complete final-candidate review and schedule manager calls.',
      due: '2025-06-06', source: `${maySources.ats} + ${maySources.calendar}`,
    },
    {
      id: 'OPS-0567', role: 'Distribution Supervisor', owner: 'Jordan Taylor', age: 52,
      risk: 'High', reason: 'Aging and low interview rate', sla: 35, slaLabel: 'At risk',
      forecast: '0–1 hires by Jul 31', nextDecision: 'Reassess scope and restart sourcing',
      evidence: 'The role is 52 days old with 35% SLA health and low interview volume.',
      rationale: 'The current scope and sourcing plan are not producing a viable slate.',
      recommendedAction: 'Reconfirm must-haves with the business and relaunch the sourcing plan.',
      due: '2025-06-05', source: `${maySources.plan} + ${maySources.ats}`,
    },
    {
      id: 'CS-0723', role: 'Customer Success Lead', owner: 'Leah Nguyen', age: 24,
      risk: 'Low', reason: 'On track', sla: 90, slaLabel: 'Healthy',
      forecast: '2 hires by Jun 30', nextDecision: 'Prepare offer plan for top choice',
      evidence: 'SLA health is 90% and a top choice is ready for offer planning.',
      rationale: 'The remaining risk is close alignment, not pipeline generation.',
      recommendedAction: 'Confirm compensation guardrails and prepare the offer plan.',
      due: '2025-06-04', source: `${maySources.ats} + compensation plan 2025-05-30 (COMP-SYN-0530-v1)`,
    },
  ],
  funnelDecisions: [
    {
      id: 'F-01', title: 'Address conversion drop at Hiring Manager', owner: 'Kelly Lee', due: '2025-06-03',
      source: maySources.ats,
      evidence: 'ENG-1278 and DES-0199 are below the Hiring Manager conversion benchmark.',
      rationale: 'The bottleneck sits after recruiter qualification, so more sourcing alone will not correct it.',
      recommendedAction: 'Calibrate manager criteria and reserve interview capacity before increasing volume.',
    },
    {
      id: 'F-02', title: 'Resolve interview SLA risks', owner: 'Diego Brooks', due: '2025-06-04',
      source: maySources.calendar,
      evidence: 'SAL-0432 is at 48% SLA health with an incomplete panel schedule.',
      rationale: 'Candidate progress is constrained by panel availability.',
      recommendedAction: 'Name the panel and publish interview blocks for the next two weeks.',
    },
    {
      id: 'F-03', title: 'Reduce aging requisitions', owner: 'Jordan Taylor', due: '2025-06-05',
      source: maySources.plan,
      evidence: 'OPS-0567 is 52 days old with 35% SLA health and low interview volume.',
      rationale: 'The role scope and sourcing plan need a business reset.',
      recommendedAction: 'Reconfirm must-haves and restart sourcing against the approved scope.',
    },
  ],
  recommendationLineage: [
    {
      decisionId: 'F-01', recommendation: 'Calibrate manager criteria and reserve interview capacity before increasing volume.',
      metrics: '534 Recruiter Screen → 248 Hiring Manager; 46.4% conversion; Hiring Manager count −8.1% vs Apr 6 – May 3; ENG-1278 and DES-0199 affected',
      derivation: '8.6 points below the 55% benchmark + declining upstream stage + two affected requisitions',
      source: maySources.ats,
    },
    {
      decisionId: 'F-02', recommendation: 'Name the panel and publish interview blocks for the next two weeks.',
      metrics: 'SAL-0432 SLA health 48%; age 45 days; incomplete panel schedule',
      derivation: 'SLA below the 65% high-risk threshold + calendar constraint',
      source: maySources.calendar,
    },
    {
      decisionId: 'F-03', recommendation: 'Reconfirm must-haves and restart sourcing against the approved scope.',
      metrics: 'OPS-0567 age 52 days; SLA health 35%; low interview volume',
      derivation: 'SLA below 65% + age over 45 days with a volume constraint',
      source: maySources.plan,
    },
  ],
});

export const periodOrder = Object.freeze([aprilScenario.metadata.key, mayScenario.metadata.key]);
export const periodScenarios = Object.freeze({
  [aprilScenario.metadata.key]: aprilScenario,
  [mayScenario.metadata.key]: mayScenario,
});
export const latestScenario = mayScenario;
export let scenario = mayScenario;
let importedScenario = null;

export const getScenarioByPeriod = (period) => (
  Object.values(periodScenarios).find((item) => item.metadata.period === period) || null
);

export const setActiveScenario = (keyOrPeriod) => {
  const next = periodScenarios[keyOrPeriod] || getScenarioByPeriod(keyOrPeriod);
  if (!next || next === scenario) return scenario;
  scenario = next;
  window.dispatchEvent(new CustomEvent('rcr:period-change', { detail: { scenario } }));
  return scenario;
};

export const applyImportedScenario = (nextScenario) => {
  if (!nextScenario?.metadata?.imported || !Array.isArray(nextScenario.funnelStages)) return scenario;
  importedScenario = nextScenario;
  scenario = importedScenario;
  window.dispatchEvent(new CustomEvent('rcr:period-change', { detail: { scenario, imported: true } }));
  return scenario;
};

export const getImportedScenario = () => importedScenario;

export const restoreBuiltInScenario = () => {
  importedScenario = null;
  scenario = latestScenario;
  window.dispatchEvent(new CustomEvent('rcr:period-change', { detail: { scenario, restored: true } }));
  return scenario;
};
