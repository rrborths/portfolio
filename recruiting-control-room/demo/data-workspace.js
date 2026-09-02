import {
  applyImportedScenario,
  latestScenario,
  restoreBuiltInScenario,
  scenario,
} from './shared-scenario.js';

const STORAGE_KEY = 'rcr:local-synthetic-scenario-v1';
const HISTORY_KEY = 'rcr:local-import-history-v1';

const SOURCE_TYPES = {
  ats: {
    label: 'ATS stage snapshot',
    description: 'One aggregate row per requisition and reporting period.',
    required: ['period_start', 'period_end', 'requisition_id', 'role', 'function', 'owner', 'applied_count', 'recruiter_screen_count', 'hiring_manager_count', 'interview_count', 'offer_count', 'hired_count'],
    numeric: ['applied_count', 'recruiter_screen_count', 'hiring_manager_count', 'interview_count', 'offer_count', 'hired_count'],
    dates: ['period_start', 'period_end'],
    template: './data/templates/ats-stage-snapshot-template.csv',
    sample: './data/samples/fictional-ats-stage-snapshot.csv',
  },
  plan: {
    label: 'Requisition plan',
    description: 'Approved aggregate demand, ownership, priority, and target dates.',
    required: ['requisition_id', 'role', 'function', 'owner', 'open_date', 'target_hires', 'target_date', 'priority', 'approved_status'],
    numeric: ['target_hires'],
    dates: ['open_date', 'target_date'],
    template: './data/templates/requisition-plan-template.csv',
    sample: './data/samples/fictional-requisition-plan.csv',
  },
  calendar: {
    label: 'Interview calendar summary',
    description: 'Aggregate interview-volume and on-time completion counts only.',
    required: ['period_start', 'period_end', 'requisition_id', 'interviews_due', 'interviews_completed_on_time', 'panel_status'],
    numeric: ['interviews_due', 'interviews_completed_on_time'],
    dates: ['period_start', 'period_end'],
    template: './data/templates/interview-calendar-summary-template.csv',
    sample: './data/samples/fictional-interview-calendar-summary.csv',
  },
  benchmark: {
    label: 'Prior-period benchmark',
    description: 'Aggregate stage counts and conversion benchmarks for comparison.',
    required: ['period_start', 'period_end', 'stage', 'stage_count', 'conversion_benchmark'],
    numeric: ['stage_count', 'conversion_benchmark'],
    dates: ['period_start', 'period_end'],
    template: './data/templates/prior-period-benchmark-template.csv',
    sample: './data/samples/fictional-prior-period-benchmark.csv',
  },
};

const ALIASES = {
  req_id: 'requisition_id',
  requisition: 'requisition_id',
  job_id: 'requisition_id',
  job_title: 'role',
  title: 'role',
  department: 'function',
  business_function: 'function',
  recruiter: 'owner',
  recruiting_owner: 'owner',
  applications: 'applied_count',
  applied: 'applied_count',
  recruiter_screens: 'recruiter_screen_count',
  screens: 'recruiter_screen_count',
  hiring_manager_reviews: 'hiring_manager_count',
  manager_reviews: 'hiring_manager_count',
  interviews: 'interview_count',
  offers: 'offer_count',
  hires: 'hired_count',
  openings: 'target_hires',
  target: 'target_hires',
  due_date: 'target_date',
  status: 'approved_status',
  due_interviews: 'interviews_due',
  on_time_interviews: 'interviews_completed_on_time',
  panels: 'panel_status',
  count: 'stage_count',
  benchmark: 'conversion_benchmark',
};

const PERSONAL_COLUMNS = new Set([
  'candidate_id', 'candidate_name', 'name', 'first_name', 'last_name', 'full_name',
  'email', 'email_address', 'phone', 'phone_number', 'mobile', 'address', 'resume', 'cv',
  'date_of_birth', 'dob', 'ssn', 'race', 'ethnicity', 'gender', 'sex', 'disability',
  'veteran_status', 'demographic_data', 'interview_notes', 'interview_feedback', 'candidate_notes',
]);

const STAGES = [
  ['Applied', 'applied_count'],
  ['Recruiter Screen', 'recruiter_screen_count'],
  ['Hiring Manager', 'hiring_manager_count'],
  ['Interview', 'interview_count'],
  ['Offer', 'offer_count'],
  ['Hired', 'hired_count'],
];

const workspaceState = {
  staged: [],
  errors: [],
  warnings: [],
  proposedScenario: null,
  history: [],
  version: 1,
};

const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const canonicalHeader = (header) => ALIASES[normalize(header)] || normalize(header);
const toNumber = (value) => Number(String(value).trim());
const calculateConversion = (from, to) => from > 0 ? Number(((to / from) * 100).toFixed(1)) : 0;
const calculateDelta = (current, prior) => prior > 0 ? Number((((current - prior) / prior) * 100).toFixed(1)) : null;
const formatRange = (start, end) => {
  const format = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  return `${format(start)} – ${format(end)}, ${end.slice(0, 4)}`;
};
const formatDate = (value) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));
const daysBetween = (start, end) => Math.max(0, Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
  return {
    headers,
    rows: rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()]))),
  };
};

const identifySourceType = (filename, headers) => {
  const normalizedName = normalize(filename);
  const mapped = headers.map(canonicalHeader);
  const scored = Object.entries(SOURCE_TYPES).map(([key, definition]) => ({
    key,
    score: definition.required.filter((field) => mapped.includes(field)).length / definition.required.length,
  })).sort((a, b) => b.score - a.score);
  if (scored[0]?.score >= 0.5) return scored[0].key;
  if (normalizedName.includes('calendar')) return 'calendar';
  if (normalizedName.includes('benchmark') || normalizedName.includes('prior')) return 'benchmark';
  if (normalizedName.includes('requisition') || normalizedName.includes('plan')) return 'plan';
  if (normalizedName.includes('ats') || normalizedName.includes('stage')) return 'ats';
  return '';
};

const makeFileRecord = (filename, text) => {
  const parsed = parseCsv(text);
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    filename,
    text,
    headers: parsed.headers,
    rawRows: parsed.rows,
    sourceType: identifySourceType(filename, parsed.headers),
    mappings: Object.fromEntries(parsed.headers.map((header) => [header, canonicalHeader(header)])),
  };
};

const canonicalRows = (record) => record.rawRows.map((rawRow) => {
  const row = {};
  Object.entries(record.mappings).forEach(([source, target]) => {
    if (target) row[target] = rawRow[source] ?? '';
  });
  return row;
});

const issue = (file, message) => ({ file: file || 'All files', message });

const validateStaged = () => {
  const errors = [];
  const warnings = [];
  const byType = Object.fromEntries(Object.keys(SOURCE_TYPES).map((key) => [key, []]));

  workspaceState.staged.forEach((record) => {
    if (!record.headers.length) {
      errors.push(issue(record.filename, 'The CSV has no header row.'));
      return;
    }
    const personalHeaders = record.headers.filter((header) => PERSONAL_COLUMNS.has(normalize(header)) || normalize(header).startsWith('candidate_'));
    if (personalHeaders.length) errors.push(issue(record.filename, `Rejected personal-data column${personalHeaders.length === 1 ? '' : 's'}: ${personalHeaders.join(', ')}.`));
    const rawValues = record.rawRows.flatMap((row) => Object.values(row));
    if (rawValues.some((value) => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value))) errors.push(issue(record.filename, 'Rejected email-address content. Use aggregate fictional data only.'));
    if (rawValues.some((value) => /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/.test(value))) errors.push(issue(record.filename, 'Rejected phone-number content. Use aggregate fictional data only.'));
    if (!record.sourceType || !SOURCE_TYPES[record.sourceType]) {
      errors.push(issue(record.filename, 'Choose a source type before validation can continue.'));
      return;
    }
    byType[record.sourceType].push(record);
    const definition = SOURCE_TYPES[record.sourceType];
    const mappedFields = Object.values(record.mappings).filter(Boolean);
    const missingColumns = definition.required.filter((field) => !mappedFields.includes(field));
    if (missingColumns.length) errors.push(issue(record.filename, `Missing required mapped columns: ${missingColumns.join(', ')}.`));
    const unmapped = record.headers.filter((header) => !record.mappings[header]);
    if (unmapped.length) warnings.push(issue(record.filename, `Ignored unmapped columns: ${unmapped.join(', ')}.`));

    const rows = canonicalRows(record);
    if (!rows.length) errors.push(issue(record.filename, 'The CSV has no data rows.'));
    rows.forEach((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      definition.required.forEach((field) => {
        if (!String(row[field] ?? '').trim()) errors.push(issue(record.filename, `Row ${rowNumber}: ${field} is required.`));
      });
      definition.dates.forEach((field) => {
        const value = row[field];
        if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()))) errors.push(issue(record.filename, `Row ${rowNumber}: ${field} must be a valid YYYY-MM-DD date.`));
      });
      definition.numeric.forEach((field) => {
        const value = toNumber(row[field]);
        if (!Number.isFinite(value) || value < 0) errors.push(issue(record.filename, `Row ${rowNumber}: ${field} must be a non-negative number.`));
        if (field !== 'conversion_benchmark' && Number.isFinite(value) && !Number.isInteger(value)) warnings.push(issue(record.filename, `Row ${rowNumber}: ${field} is not a whole-number aggregate.`));
      });
      if (row.period_start && row.period_end && row.period_start > row.period_end) errors.push(issue(record.filename, `Row ${rowNumber}: period_start is after period_end.`));
      if (record.sourceType === 'plan' && row.open_date && row.target_date && row.open_date > row.target_date) errors.push(issue(record.filename, `Row ${rowNumber}: open_date is after target_date.`));
      if (record.sourceType === 'ats') {
        const counts = STAGES.map(([, field]) => toNumber(row[field]));
        if (counts.some((count, index) => index > 0 && count > counts[index - 1])) errors.push(issue(record.filename, `Row ${rowNumber}: stage counts must not increase downstream.`));
      }
      if (record.sourceType === 'calendar' && toNumber(row.interviews_completed_on_time) > toNumber(row.interviews_due)) errors.push(issue(record.filename, `Row ${rowNumber}: interviews_completed_on_time exceeds interviews_due.`));
      if (record.sourceType === 'benchmark') {
        const benchmark = toNumber(row.conversion_benchmark);
        if (benchmark < 0 || benchmark > 100) errors.push(issue(record.filename, `Row ${rowNumber}: conversion_benchmark must be between 0 and 100.`));
      }
    });

    const duplicateKeys = new Set();
    rows.forEach((row) => {
      const key = record.sourceType === 'benchmark'
        ? `${row.period_start}|${row.period_end}|${normalize(row.stage)}`
        : record.sourceType === 'plan'
          ? row.requisition_id
          : `${row.period_start}|${row.period_end}|${row.requisition_id}`;
      if (duplicateKeys.has(key)) errors.push(issue(record.filename, `Duplicate identifier: ${key}.`));
      duplicateKeys.add(key);
    });
  });

  Object.entries(SOURCE_TYPES).forEach(([key, definition]) => {
    if (!byType[key].length) errors.push(issue('All files', `Missing ${definition.label} file.`));
    if (byType[key].length > 1) errors.push(issue('All files', `Provide one ${definition.label} file per scenario.`));
  });

  if (!errors.some((item) => item.message.startsWith('Missing') || item.message.startsWith('Choose'))) {
    const rowsByType = Object.fromEntries(Object.entries(byType).map(([key, records]) => [key, records.flatMap(canonicalRows)]));
    const planIds = new Set(rowsByType.plan.map((row) => row.requisition_id));
    for (const type of ['ats', 'calendar']) {
      rowsByType[type].forEach((row) => {
        if (!planIds.has(row.requisition_id)) errors.push(issue(SOURCE_TYPES[type].label, `Unknown requisition reference ${row.requisition_id}; add it to the requisition plan.`));
      });
    }
    rowsByType.plan.forEach((row) => {
      const ats = rowsByType.ats.find((item) => item.requisition_id === row.requisition_id);
      const calendar = rowsByType.calendar.find((item) => item.requisition_id === row.requisition_id);
      if (!ats) warnings.push(issue('Cross-file references', `${row.requisition_id} has a plan row but no ATS stage row.`));
      if (!calendar) warnings.push(issue('Cross-file references', `${row.requisition_id} has a plan row but no interview calendar row.`));
      if (ats && (ats.role !== row.role || ats.function !== row.function || ats.owner !== row.owner)) warnings.push(issue('Cross-file references', `${row.requisition_id} role, function, or owner differs between ATS and plan files.`));
    });
    const currentPeriods = new Set([...rowsByType.ats, ...rowsByType.calendar].map((row) => `${row.period_start}|${row.period_end}`));
    if (currentPeriods.size > 1) errors.push(issue('Cross-file periods', 'ATS and interview calendar rows must use one matching reporting period.'));
    const benchmarkStages = new Set(rowsByType.benchmark.map((row) => normalize(row.stage)));
    STAGES.forEach(([label]) => {
      if (!benchmarkStages.has(normalize(label))) errors.push(issue('Prior-period benchmark', `Missing benchmark stage ${label}.`));
    });
    if (rowsByType.plan.length < 3) warnings.push(issue('Requisition plan', 'Fewer than three requisitions limits the prioritized-decision demonstration.'));
  }

  workspaceState.errors = errors;
  workspaceState.warnings = warnings;
  workspaceState.proposedScenario = errors.length ? null : buildImportedScenario(byType);
};

const sourceRecord = (type) => workspaceState.staged.find((record) => record.sourceType === type);

const buildImportedScenario = (byType) => {
  const rows = Object.fromEntries(Object.entries(byType).map(([key, records]) => [key, records.flatMap(canonicalRows)]));
  const periodStart = rows.ats[0].period_start;
  const periodEnd = rows.ats[0].period_end;
  const priorStart = rows.benchmark[0].period_start;
  const priorEnd = rows.benchmark[0].period_end;
  const stageCounts = STAGES.map(([label, field]) => ({ label, count: rows.ats.reduce((total, row) => total + toNumber(row[field]), 0) }));
  const priorByStage = new Map(rows.benchmark.map((row) => [normalize(row.stage), row]));
  const funnelStages = stageCounts.map((stage, index) => ({
    ...stage,
    conversion: index === 0 ? null : calculateConversion(stageCounts[index - 1].count, stage.count),
    delta: calculateDelta(stage.count, toNumber(priorByStage.get(normalize(stage.label))?.stage_count)),
  }));
  const atsSource = `${sourceRecord('ats').filename} (${rows.ats.length} aggregate rows)`;
  const planSource = `${sourceRecord('plan').filename} (${rows.plan.length} aggregate rows)`;
  const calendarSource = `${sourceRecord('calendar').filename} (${rows.calendar.length} aggregate rows)`;
  const benchmarkSource = `${sourceRecord('benchmark').filename} (${rows.benchmark.length} aggregate rows)`;
  const funnelTransitions = funnelStages.slice(0, -1).map((stage, index) => {
    const next = funnelStages[index + 1];
    const benchmark = toNumber(priorByStage.get(normalize(next.label))?.conversion_benchmark);
    return {
      from: stage.label,
      to: next.label,
      fromCount: stage.count,
      toCount: next.count,
      conversion: calculateConversion(stage.count, next.count),
      benchmark,
      bottleneck: false,
      source: `${atsSource} + ${benchmarkSource}`,
    };
  });
  const bottleneckIndex = funnelTransitions
    .map((transition, index) => ({ index, score: Math.max(0, transition.benchmark - transition.conversion) * transition.fromCount }))
    .sort((a, b) => b.score - a.score)[0]?.index || 0;
  funnelTransitions[bottleneckIndex].bottleneck = true;
  const bottleneck = funnelTransitions[bottleneckIndex];
  bottleneck.priorityReason = `Prioritized from the local synthetic import because ${bottleneck.from} has ${bottleneck.fromCount.toLocaleString()} people, ${bottleneck.to} has ${bottleneck.toCount.toLocaleString()}, conversion is ${bottleneck.conversion}%, and the imported benchmark is ${bottleneck.benchmark}%. Human review remains required.`;

  const atsById = new Map(rows.ats.map((row) => [row.requisition_id, row]));
  const calendarById = new Map(rows.calendar.map((row) => [row.requisition_id, row]));
  const riskRank = { High: 3, Medium: 2, Low: 1 };
  const requisitions = rows.plan.map((plan) => {
    const ats = atsById.get(plan.requisition_id);
    const calendar = calendarById.get(plan.requisition_id);
    const due = toNumber(calendar?.interviews_due);
    const onTime = toNumber(calendar?.interviews_completed_on_time);
    const sla = due > 0 ? Math.round((onTime / due) * 100) : 100;
    const age = daysBetween(plan.open_date, periodEnd);
    const risk = normalize(plan.approved_status) !== 'approved' || sla < 65 ? 'High' : sla < 80 || age > 45 ? 'Medium' : 'Low';
    const reason = normalize(plan.approved_status) !== 'approved'
      ? `Approval status is ${plan.approved_status}`
      : sla < 65 ? `Interview SLA is ${sla}%` : age > 45 ? `${age} days open` : 'Plan and interview capacity are within local thresholds';
    const target = toNumber(plan.target_hires);
    const hired = toNumber(ats?.hired_count);
    const projected = Math.min(target, Math.round(hired + toNumber(ats?.offer_count) * 0.5 + toNumber(ats?.interview_count) * 0.15));
    const nextDecision = normalize(plan.approved_status) !== 'approved'
      ? 'Confirm requisition approval before recruiting activity'
      : normalize(calendar?.panel_status) !== 'complete'
        ? 'Complete the interview panel and reserve capacity'
        : sla < 65
          ? 'Restore interview feedback and scheduling SLA'
          : projected < target
            ? 'Recalibrate conversion plan against target hires'
            : 'Maintain plan and monitor stage conversion';
    const evidence = `${ats?.applied_count || 0} applied; ${ats?.interview_count || 0} interviews; ${ats?.hired_count || 0} hired; interview SLA ${sla}%; target ${target}.`;
    const rationale = `${reason}. Imported target date is ${plan.target_date} and panel status is ${calendar?.panel_status || 'not provided'}.`;
    return {
      id: plan.requisition_id,
      role: plan.role,
      function: plan.function,
      owner: plan.owner,
      age,
      risk,
      reason,
      sla,
      slaLabel: sla < 65 ? 'At risk' : sla < 80 ? 'Watch' : 'Healthy',
      forecast: `${hired}-${Math.max(hired, projected)} of ${target} hires by ${plan.target_date}`,
      nextDecision,
      evidence,
      rationale,
      recommendedAction: `${nextDecision}. Human owner ${plan.owner} reviews before action.`,
      due: plan.target_date,
      source: `${atsSource} + ${planSource} + ${calendarSource}`,
      priority: plan.priority,
    };
  }).sort((a, b) => riskRank[b.risk] - riskRank[a.risk] || a.sla - b.sla || b.age - a.age);

  const funnelDecisions = requisitions.slice(0, 3).map((item, index) => ({
    id: `LOCAL-F-${index + 1}`,
    title: item.nextDecision,
    owner: item.owner,
    due: item.due,
    source: item.source,
    evidence: item.evidence,
    rationale: item.rationale,
    recommendedAction: item.recommendedAction,
  }));
  const recommendationLineage = funnelDecisions.map((decision) => ({
    decisionId: decision.id,
    metrics: decision.evidence,
    derivation: decision.rationale,
    recommendation: decision.recommendedAction,
    source: decision.source,
  }));
  const version = `LOCAL-SYN-${workspaceState.version}.0`;
  const metadata = {
    key: `local-synthetic-${periodStart}_${periodEnd}`,
    imported: true,
    label: 'Local synthetic scenario',
    name: 'Fictional multi-file recruiting scenario',
    period: formatRange(periodStart, periodEnd),
    periodStart,
    periodEnd,
    asOfDate: periodEnd,
    priorPeriod: formatRange(priorStart, priorEnd),
    comparisonAvailable: true,
    comparisonLabel: `Compared with imported prior period ${formatRange(priorStart, priorEnd)}`,
    snapshotDate: formatDate(periodEnd),
    sourceVersion: version,
    refreshStatus: 'Browser-local session · no external connection',
    exportSlug: `${periodStart}_to_${periodEnd}-local-synthetic`,
    sourceRecords: [atsSource, planSource, calendarSource, benchmarkSource],
    sourceSummary: `Local files · ${rows.ats.length + rows.plan.length + rows.calendar.length + rows.benchmark.length} aggregate rows · no candidate data`,
  };
  const methodology = JSON.parse(JSON.stringify(latestScenario.methodology));
  const weeklyDecisions = funnelDecisions.map((decision, index) => ({ ...decision, id: `LOCAL-W-${index + 1}` }));
  return {
    metadata,
    methodology,
    funnelStages,
    funnelTransitions,
    requisitions,
    funnelDecisions,
    recommendationLineage,
    weeklyNarrative: {
      changed: `Local synthetic import loaded ${requisitions.length} requisitions and ${funnelStages[0].count} aggregate applications for ${metadata.period}.`,
      decisions: funnelDecisions.map((decision) => decision.title).join('; '),
      risks: requisitions.filter((item) => item.risk !== 'Low').map((item) => `${item.id}: ${item.reason}`).join('; ') || 'No imported requisition is above the low-risk threshold.',
      commitments: 'Named human owners review every generated recommendation before any external action.',
    },
    weeklyDecisions,
  };
};

const summarizeScenario = (candidate) => ({
  period: candidate.metadata.period,
  applications: candidate.funnelStages[0]?.count || 0,
  hires: candidate.funnelStages.at(-1)?.count || 0,
  conversion: calculateConversion(candidate.funnelStages[0]?.count || 0, candidate.funnelStages.at(-1)?.count || 0),
  requisitions: candidate.requisitions.length,
  highRisk: candidate.requisitions.filter((item) => item.risk === 'High').length,
  decisions: candidate.funnelDecisions.length,
});

const create = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const downloadAllSamples = (dialog) => {
  const links = [...dialog.querySelectorAll('[data-sample-download]')];
  links.forEach((link, index) => setTimeout(() => link.click(), index * 160));
};

const renderScenario = (dialog) => {
  const target = dialog.querySelector('[data-current-scenario]');
  const summary = summarizeScenario(scenario);
  target.replaceChildren();
  for (const [label, value] of [
    ['Scenario', scenario.metadata.name],
    ['Status', scenario.metadata.imported ? 'Local synthetic import active' : 'Built-in synthetic demo active'],
    ['Reporting period', summary.period],
    ['Snapshot date', scenario.metadata.snapshotDate],
    ['Scenario as-of date', scenario.metadata.asOfDate],
    ['Comparison', scenario.metadata.comparisonAvailable ? `Compared with ${scenario.metadata.priorPeriod}` : 'Unavailable — no earlier baseline loaded'],
    ['Source version', scenario.metadata.sourceVersion],
    ['Refresh status', scenario.metadata.refreshStatus],
    ['Aggregate applications', summary.applications.toLocaleString()],
    ['Aggregate hires', summary.hires.toLocaleString()],
  ]) {
    const item = create('div');
    item.append(create('dt', null, label), create('dd', null, value));
    target.append(item);
  }
  const sources = dialog.querySelector('[data-current-sources]');
  sources.replaceChildren();
  scenario.metadata.sourceRecords.forEach((source) => sources.append(create('li', null, source)));
  dialog.querySelector('[data-restore]').disabled = !scenario.metadata.imported;
  const persisted = (() => {
    try { return Boolean(localStorage.getItem(STORAGE_KEY)); } catch { return false; }
  })();
  dialog.querySelector('[data-load-persisted]').hidden = !persisted;
  dialog.querySelector('[data-clear-persisted]').hidden = !persisted;
};

const renderSourceDownloads = (dialog) => {
  const grid = dialog.querySelector('[data-source-downloads]');
  grid.replaceChildren();
  Object.entries(SOURCE_TYPES).forEach(([key, definition]) => {
    const card = create('article', 'data-source-card');
    card.append(create('h4', null, definition.label), create('p', null, definition.description));
    const fields = create('p', 'data-source-fields', `Required: ${definition.required.join(', ')}`);
    const actions = create('div', 'data-source-actions');
    const template = create('a', 'button', 'Template CSV');
    template.href = definition.template;
    template.download = definition.template.split('/').at(-1);
    const sample = create('a', 'button', 'Fictional sample');
    sample.href = definition.sample;
    sample.download = definition.sample.split('/').at(-1);
    sample.dataset.sampleDownload = key;
    actions.append(template, sample);
    card.append(fields, actions);
    grid.append(card);
  });
};

const renderStagedFiles = (dialog) => {
  const container = dialog.querySelector('[data-staged-files]');
  container.replaceChildren();
  if (!workspaceState.staged.length) {
    container.append(create('p', 'data-empty-state', 'No files staged. Choose CSV files, drag them here, or load the included fictional scenario.'));
    return;
  }
  workspaceState.staged.forEach((record) => {
    const details = create('details', 'data-file-card');
    details.open = true;
    const summary = create('summary');
    summary.append(create('strong', null, record.filename), create('span', null, `${record.rawRows.length} rows`));
    const controls = create('div', 'data-file-controls');
    const sourceLabel = create('label', 'data-field');
    sourceLabel.append(create('span', null, 'Source type'));
    const sourceSelect = document.createElement('select');
    sourceSelect.setAttribute('aria-label', `${record.filename} source type`);
    sourceSelect.append(new Option('Choose source type', ''));
    Object.entries(SOURCE_TYPES).forEach(([key, definition]) => sourceSelect.append(new Option(definition.label, key)));
    sourceSelect.value = record.sourceType;
    sourceSelect.addEventListener('change', () => {
      record.sourceType = sourceSelect.value;
      refreshImportState(dialog);
    });
    sourceLabel.append(sourceSelect);
    const remove = create('button', 'button', 'Remove file');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      workspaceState.staged = workspaceState.staged.filter((item) => item.id !== record.id);
      refreshImportState(dialog);
    });
    controls.append(sourceLabel, remove);

    const mappingHeading = create('h5', null, 'Column mapping');
    const mappingGrid = create('div', 'data-mapping-grid');
    const allowed = record.sourceType ? SOURCE_TYPES[record.sourceType].required : [...new Set(Object.values(SOURCE_TYPES).flatMap((definition) => definition.required))];
    record.headers.forEach((header) => {
      const label = create('label', 'data-mapping-row');
      label.append(create('span', null, header));
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Map ${header} in ${record.filename}`);
      select.append(new Option('Ignore column', ''));
      allowed.forEach((field) => select.append(new Option(field, field)));
      if (allowed.includes(record.mappings[header])) select.value = record.mappings[header];
      select.addEventListener('change', () => {
        record.mappings[header] = select.value;
        refreshImportState(dialog);
      });
      label.append(select);
      mappingGrid.append(label);
    });

    const previewHeading = create('h5', null, 'Parsed-row preview');
    const previewWrap = create('div', 'data-preview-table-wrap');
    previewWrap.tabIndex = 0;
    previewWrap.setAttribute('role', 'region');
    previewWrap.setAttribute('aria-label', `${record.filename} parsed row preview`);
    const table = document.createElement('table');
    const fields = [...new Set(Object.values(record.mappings).filter(Boolean))];
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    fields.forEach((field) => {
      const header = create('th', null, field);
      header.scope = 'col';
      headRow.append(header);
    });
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    canonicalRows(record).slice(0, 5).forEach((row) => {
      const tr = document.createElement('tr');
      fields.forEach((field) => tr.append(create('td', null, row[field] || '')));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    previewWrap.append(table);
    details.append(summary, controls, mappingHeading, mappingGrid, previewHeading, previewWrap);
    container.append(details);
  });
};

const renderValidation = (dialog) => {
  const status = dialog.querySelector('[data-validation-status]');
  status.className = `data-validation-status ${workspaceState.errors.length ? 'has-errors' : workspaceState.staged.length ? 'is-valid' : ''}`;
  status.textContent = !workspaceState.staged.length
    ? 'No files staged.'
    : workspaceState.errors.length
      ? `${workspaceState.errors.length} blocking error${workspaceState.errors.length === 1 ? '' : 's'} · ${workspaceState.warnings.length} warning${workspaceState.warnings.length === 1 ? '' : 's'}`
      : `Validation passed · ${workspaceState.warnings.length} non-blocking warning${workspaceState.warnings.length === 1 ? '' : 's'}`;
  for (const [selector, items, emptyText] of [
    ['[data-blocking-errors]', workspaceState.errors, 'No blocking errors.'],
    ['[data-warnings]', workspaceState.warnings, 'No non-blocking warnings.'],
  ]) {
    const list = dialog.querySelector(selector);
    list.replaceChildren();
    if (!items.length) list.append(create('li', 'data-no-issues', emptyText));
    else items.forEach((item) => {
      const li = create('li');
      li.append(create('strong', null, `${item.file}: `), document.createTextNode(item.message));
      list.append(li);
    });
  }
};

const renderBeforeAfter = (dialog) => {
  const container = dialog.querySelector('[data-before-after]');
  container.replaceChildren();
  if (!workspaceState.proposedScenario) {
    container.append(create('p', 'data-empty-state', 'A before-and-after summary appears after all four source files pass blocking validation.'));
    return;
  }
  const before = summarizeScenario(scenario);
  const after = summarizeScenario(workspaceState.proposedScenario);
  for (const [label, values] of [['Before', before], ['After local apply', after]]) {
    const card = create('article', 'data-summary-card');
    card.append(create('h4', null, label));
    const dl = create('dl');
    for (const [term, value] of [
      ['Period', values.period],
      ['Applications', values.applications.toLocaleString()],
      ['Hires', values.hires.toLocaleString()],
      ['Applied → hired', `${values.conversion}%`],
      ['Requisitions', values.requisitions],
      ['High-risk requisitions', values.highRisk],
      ['Prioritized decisions', values.decisions],
    ]) {
      const item = create('div');
      item.append(create('dt', null, term), create('dd', null, value));
      dl.append(item);
    }
    card.append(dl);
    container.append(card);
  }
};

const renderCalculationLogic = (dialog) => {
  const container = dialog.querySelector('[data-calculation-logic]');
  container.replaceChildren();
  const calculations = [
    ['Stage totals', 'Sum each aggregate ATS stage-count column across imported requisitions.'],
    ['Conversion', 'Receiving-stage count ÷ prior-stage count × 100.'],
    ['Period delta', '(Current stage count − imported prior-period stage count) ÷ prior count × 100.'],
    ['Interview SLA', 'Interviews completed on time ÷ interviews due × 100.'],
    ['Risk', 'High for unapproved demand or SLA below 65%; Medium for SLA 65–79% or age over 45 days; otherwise Low.'],
    ['Forecast', 'Current hires plus weighted offers/interviews, capped at target hires; shown as a planning range.'],
    ['Decision priority', 'Risk severity, SLA, and age order the first three human-review recommendations.'],
  ];
  calculations.forEach(([name, logic]) => {
    const card = create('article', 'method-card');
    card.append(create('span', 'method-type', name === 'Stage totals' ? 'Observed metric' : 'Derived indicator'), create('h4', null, name), create('p', null, logic));
    container.append(card);
  });
};

const renderTraceability = (dialog) => {
  const body = dialog.querySelector('[data-traceability-body]');
  body.replaceChildren();
  scenario.recommendationLineage.forEach((item) => {
    const row = document.createElement('tr');
    const labels = ['Decision', 'Observed source metrics', 'Derivation', 'Generated recommendation', 'Source'];
    [item.decisionId, item.metrics, item.derivation, item.recommendation, item.source].forEach((value, index) => {
      const cell = create('td', null, value);
      cell.dataset.label = labels[index];
      row.append(cell);
    });
    body.append(row);
  });
};

const renderHistory = (dialog) => {
  const body = dialog.querySelector('[data-history-body]');
  body.replaceChildren();
  const empty = dialog.querySelector('[data-history-empty]');
  empty.hidden = Boolean(workspaceState.history.length);
  workspaceState.history.forEach((item) => {
    const row = document.createElement('tr');
    const labels = ['Local timestamp', 'Filename', 'Rows', 'Validation result', 'Scenario version'];
    [item.timestamp, item.filename, item.rows, item.result, item.version].forEach((value, index) => {
      const cell = create('td', null, value);
      cell.dataset.label = labels[index];
      row.append(cell);
    });
    body.append(row);
  });
};

const updateApplyState = (dialog) => {
  const confirmation = dialog.querySelector('[data-apply-confirmation]');
  const button = dialog.querySelector('[data-apply]');
  button.disabled = !workspaceState.proposedScenario || workspaceState.errors.length > 0 || !confirmation.checked;
};

const refreshImportState = (dialog) => {
  validateStaged();
  renderStagedFiles(dialog);
  renderValidation(dialog);
  renderBeforeAfter(dialog);
  updateApplyState(dialog);
};

const addFiles = (dialog, files) => {
  workspaceState.staged = files;
  dialog.querySelector('[data-apply-confirmation]').checked = false;
  refreshImportState(dialog);
};

const loadFictionalScenario = async (dialog) => {
  const records = await Promise.all(Object.values(SOURCE_TYPES).map(async (definition) => {
    const response = await fetch(definition.sample);
    return makeFileRecord(definition.sample.split('/').at(-1), await response.text());
  }));
  addFiles(dialog, records);
  dialog.querySelector('#import-data').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const persistScenario = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaceState.proposedScenario));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(workspaceState.history));
    return true;
  } catch {
    return false;
  }
};

const applyScenario = (dialog) => {
  if (!workspaceState.proposedScenario || workspaceState.errors.length) return;
  const appliedAt = new Date();
  const version = workspaceState.proposedScenario.metadata.sourceVersion;
  workspaceState.staged.forEach((record) => workspaceState.history.unshift({
    timestamp: appliedAt.toLocaleString(),
    filename: record.filename,
    rows: record.rawRows.length,
    result: workspaceState.warnings.length ? `Passed with ${workspaceState.warnings.length} warning(s)` : 'Passed',
    version,
  }));
  if (dialog.querySelector('[data-persist]').checked) {
    workspaceState.proposedScenario.metadata.refreshStatus = 'Browser-local persistent copy · no external connection';
    persistScenario();
  }
  applyImportedScenario(workspaceState.proposedScenario);
  workspaceState.version += 1;
  workspaceState.staged = [];
  workspaceState.errors = [];
  workspaceState.warnings = [];
  workspaceState.proposedScenario = null;
  dialog.querySelector('[data-apply-confirmation]').checked = false;
  dialog.querySelector('[data-workspace-status]').textContent = `Applied ${version} locally at ${appliedAt.toLocaleString()}. Funnel, risks, forecasts, decisions, dates, and traceability recalculated. No external action occurred.`;
  renderScenario(dialog);
  renderStagedFiles(dialog);
  renderValidation(dialog);
  renderBeforeAfter(dialog);
  renderTraceability(dialog);
  renderHistory(dialog);
  updateApplyState(dialog);
  dialog.querySelector('#scenario-sources').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const restoreScenario = (dialog) => {
  workspaceState.staged = [];
  workspaceState.errors = [];
  workspaceState.warnings = [];
  workspaceState.proposedScenario = null;
  dialog.querySelector('[data-file-input]').value = '';
  dialog.querySelector('[data-apply-confirmation]').checked = false;
  dialog.querySelector('[data-persist]').checked = false;
  restoreBuiltInScenario();
  workspaceState.history.unshift({
    timestamp: new Date().toLocaleString(),
    filename: 'Built-in demo scenario',
    rows: latestScenario.metadata.sourceRecords.length,
    result: 'Restored',
    version: latestScenario.metadata.sourceVersion,
  });
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
  dialog.querySelector('[data-workspace-status]').textContent = 'Built-in synthetic demo scenario restored. Local persisted scenario data was cleared.';
  renderScenario(dialog);
  renderStagedFiles(dialog);
  renderValidation(dialog);
  renderBeforeAfter(dialog);
  renderTraceability(dialog);
  renderHistory(dialog);
  updateApplyState(dialog);
};

const loadPersisted = (dialog) => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!saved?.metadata?.imported) return;
    workspaceState.history = history;
    applyImportedScenario(saved);
    dialog.querySelector('[data-workspace-status]').textContent = `Loaded ${saved.metadata.sourceVersion} from this browser's local storage. No network request occurred.`;
    renderScenario(dialog);
    renderTraceability(dialog);
    renderHistory(dialog);
  } catch {
    dialog.querySelector('[data-workspace-status]').textContent = 'The locally stored scenario could not be read. Clear local browser data and import again.';
  }
};

const clearPersisted = (dialog) => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
  dialog.querySelector('[data-workspace-status]').textContent = 'Local browser persistence cleared. The current in-memory scenario remains until restore or reload.';
  renderScenario(dialog);
};

const buildWorkspace = () => {
  const dialog = create('dialog', 'data-workspace-dialog');
  dialog.id = 'data-workspace-dialog';
  dialog.setAttribute('aria-labelledby', 'data-workspace-title');
  dialog.innerHTML = `
    <header class="data-workspace-header">
      <div><p class="data-controls-eyebrow">Local synthetic data workspace</p><h2 id="data-workspace-title">Data & controls</h2><p>Import aggregate fictional recruiting data, validate it locally, and trace every recalculated recommendation.</p></div>
      <button type="button" class="data-controls-close" aria-label="Close Data & controls">Close</button>
    </header>
    <aside class="data-privacy-banner" role="note">
      <strong>Fictional or aggregate data only.</strong>
      <span>Processing stays in this browser. Do not include candidate names, email addresses, phone numbers, résumés, demographics, interview notes, or other personal information. Personal-data columns are rejected. No ATS write or external action is possible.</span>
    </aside>
    <nav class="data-workspace-nav" aria-label="Data workspace sections">
      <a href="#scenario-sources">Scenario & sources</a><a href="#import-data">Import data</a><a href="#validation-results">Validation results</a><a href="#calculation-logic">Calculation logic</a><a href="#recommendation-traceability">Recommendation traceability</a><a href="#import-history">Import history</a>
    </nav>
    <p class="data-workspace-status" role="status" aria-live="polite" data-workspace-status>Ready. No imported content leaves this browser.</p>
    <div class="data-workspace-scroll">
      <section id="scenario-sources" class="data-workspace-section" aria-labelledby="scenario-sources-title">
        <div class="data-section-heading"><div><p class="data-section-number">01</p><h3 id="scenario-sources-title">Scenario & sources</h3></div><p>Review the active synthetic scenario and its aggregate source lineage.</p></div>
        <dl class="controls-metadata" data-current-scenario></dl>
        <h4>Current source records</h4><ul class="data-source-list" data-current-sources></ul>
        <div class="data-section-actions"><button type="button" class="button" data-restore>Restore built-in demo scenario</button><button type="button" class="button" data-load-persisted hidden>Load locally persisted scenario</button><button type="button" class="button" data-clear-persisted hidden>Clear local browser data</button></div>
      </section>
      <section id="import-data" class="data-workspace-section" aria-labelledby="import-data-title">
        <div class="data-section-heading"><div><p class="data-section-number">02</p><h3 id="import-data-title">Import data</h3></div><p>Download the contracts, then choose or drag four local CSV files.</p></div>
        <div class="data-source-download-grid" data-source-downloads></div>
        <div class="data-sample-actions"><button type="button" class="button" data-download-all>Download all four fictional sample files</button><button type="button" class="button primary" data-load-sample>Load included fictional scenario</button></div>
        <label class="data-drop-zone" data-drop-zone>
          <input type="file" accept=".csv,text/csv" multiple data-file-input />
          <strong>Choose CSV files</strong><span>or drag four local synthetic/aggregate files here</span><small>Files are read with the browser File API and are not uploaded.</small>
        </label>
        <div class="data-staged-files" data-staged-files></div>
      </section>
      <section id="validation-results" class="data-workspace-section" aria-labelledby="validation-results-title">
        <div class="data-section-heading"><div><p class="data-section-number">03</p><h3 id="validation-results-title">Validation results</h3></div><p>Blocking errors prevent apply. Warnings remain visible for human review.</p></div>
        <p class="data-validation-status" role="status" data-validation-status>No files staged.</p>
        <div class="data-validation-columns"><article class="data-issue-card blocking"><h4>Blocking errors</h4><ul data-blocking-errors><li class="data-no-issues">No blocking errors.</li></ul></article><article class="data-issue-card warning"><h4>Non-blocking warnings</h4><ul data-warnings><li class="data-no-issues">No non-blocking warnings.</li></ul></article></div>
        <h4>Before-and-after summary</h4><div class="data-before-after" data-before-after></div>
        <div class="data-apply-card">
          <label><input type="checkbox" data-apply-confirmation /> <span><strong>Apply synthetic scenario</strong><small>I confirm these files contain fictional or aggregate data only and approve recalculation in this local browser session.</small></span></label>
          <label class="data-persist-choice"><input type="checkbox" data-persist /> <span><strong>Persist the derived scenario in this browser</strong><small>Optional. Stores the derived synthetic scenario and import history in localStorage; raw CSV files are not retained.</small></span></label>
          <button type="button" class="button primary" data-apply disabled>Apply synthetic scenario locally</button>
        </div>
      </section>
      <section id="calculation-logic" class="data-workspace-section" aria-labelledby="calculation-logic-title">
        <div class="data-section-heading"><div><p class="data-section-number">04</p><h3 id="calculation-logic-title">Calculation logic</h3></div><p>Observed aggregates become derived indicators and human-review recommendations.</p></div>
        <div class="method-grid" data-calculation-logic></div>
      </section>
      <section id="recommendation-traceability" class="data-workspace-section" aria-labelledby="recommendation-traceability-title">
        <div class="data-section-heading"><div><p class="data-section-number">05</p><h3 id="recommendation-traceability-title">Recommendation traceability</h3></div><p>Follow every recommendation from aggregate source metrics through explicit derivation.</p></div>
        <div class="lineage-table-wrap" role="region" tabindex="0" aria-label="Recommendation traceability table"><table><thead><tr><th scope="col">Decision</th><th scope="col">Observed source metrics</th><th scope="col">Derivation</th><th scope="col">Generated recommendation</th><th scope="col">Source</th></tr></thead><tbody data-traceability-body></tbody></table></div>
      </section>
      <section id="import-history" class="data-workspace-section" aria-labelledby="import-history-title">
        <div class="data-section-heading"><div><p class="data-section-number">06</p><h3 id="import-history-title">Import history</h3></div><p>Session-local audit trail of applied files and restored scenarios.</p></div>
        <p class="data-empty-state" data-history-empty>No local imports this session.</p>
        <div class="lineage-table-wrap" role="region" tabindex="0" aria-label="Local import history table"><table><thead><tr><th scope="col">Local timestamp</th><th scope="col">Filename</th><th scope="col">Rows</th><th scope="col">Validation result</th><th scope="col">Scenario version</th></tr></thead><tbody data-history-body></tbody></table></div>
      </section>
      <aside class="controls-boundary"><strong>Human review and no-external-action boundary</strong><p>Imports and calculations remain local review inputs. The demo cannot rank candidates, update an ATS, send messages, publish artifacts, or write to an external system.</p></aside>
    </div>
  `;
  document.body.append(dialog);
  renderSourceDownloads(dialog);
  renderCalculationLogic(dialog);
  renderScenario(dialog);
  renderTraceability(dialog);
  renderHistory(dialog);
  renderStagedFiles(dialog);
  renderValidation(dialog);
  renderBeforeAfter(dialog);

  const close = () => dialog.close();
  dialog.querySelector('.data-controls-close').addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => document.querySelector('[data-controls-opener="true"]')?.focus());
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary')].filter((element) => !element.hidden && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });

  const input = dialog.querySelector('[data-file-input]');
  input.addEventListener('change', async () => addFiles(dialog, await Promise.all([...input.files].map(async (file) => makeFileRecord(file.name, await file.text())))));
  const dropZone = dialog.querySelector('[data-drop-zone]');
  for (const eventName of ['dragenter', 'dragover']) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.add('is-dragging'); });
  for (const eventName of ['dragleave', 'drop']) dropZone.addEventListener(eventName, (event) => { event.preventDefault(); dropZone.classList.remove('is-dragging'); });
  dropZone.addEventListener('drop', async (event) => {
    const files = [...event.dataTransfer.files].filter((file) => file.name.toLowerCase().endsWith('.csv'));
    addFiles(dialog, await Promise.all(files.map(async (file) => makeFileRecord(file.name, await file.text()))));
  });
  dialog.querySelector('[data-download-all]').addEventListener('click', () => downloadAllSamples(dialog));
  dialog.querySelector('[data-load-sample]').addEventListener('click', () => loadFictionalScenario(dialog));
  dialog.querySelector('[data-apply-confirmation]').addEventListener('change', () => updateApplyState(dialog));
  dialog.querySelector('[data-apply]').addEventListener('click', () => applyScenario(dialog));
  dialog.querySelector('[data-restore]').addEventListener('click', () => restoreScenario(dialog));
  dialog.querySelector('[data-load-persisted]').addEventListener('click', () => loadPersisted(dialog));
  dialog.querySelector('[data-clear-persisted]').addEventListener('click', () => clearPersisted(dialog));
  return dialog;
};

export const openDataWorkspace = (opener) => {
  document.querySelectorAll('[data-controls-opener]').forEach((button) => button.removeAttribute('data-controls-opener'));
  opener?.setAttribute('data-controls-opener', 'true');
  const dialog = document.querySelector('#data-workspace-dialog') || buildWorkspace();
  renderScenario(dialog);
  renderTraceability(dialog);
  renderHistory(dialog);
  if (!dialog.open) dialog.showModal();
};

window.addEventListener('rcr:period-change', () => {
  const dialog = document.querySelector('#data-workspace-dialog');
  if (!dialog) return;
  renderScenario(dialog);
  renderTraceability(dialog);
});
