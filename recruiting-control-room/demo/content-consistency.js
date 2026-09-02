import { latestScenario, scenario, setActiveScenario } from './shared-scenario.js';

const setText = (element, value) => {
  if (element && element.textContent !== String(value)) element.textContent = String(value);
};

const makeDecisionContext = (decision) => {
  const context = document.createElement('div');
  context.className = 'decision-context';
  for (const [label, value] of [
    ['Evidence', decision.evidence],
    ['Rationale', decision.rationale],
    ['Recommended action', decision.recommendedAction],
  ]) {
    const row = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = `${label}:`;
    row.append(strong, document.createTextNode(` ${value}`));
    context.append(row);
  }
  return context;
};

const builtInOwnerOptions = new WeakMap();

const snapshotOwnerOptions = (select) => [...select.options].map((option) => ({
  label: option.textContent,
  value: option.value,
  disabled: option.disabled,
}));

const syncOwnerOptions = (select, selectedOwner) => {
  if (!select) return;
  if (!builtInOwnerOptions.has(select)) builtInOwnerOptions.set(select, snapshotOwnerOptions(select));
  const baseline = builtInOwnerOptions.get(select);
  const options = baseline.map(({ label, value, disabled }) => {
    const option = new Option(label, value);
    option.disabled = disabled;
    return option;
  });
  if (!options.some((option) => option.value === selectedOwner)) options.push(new Option(selectedOwner, selectedOwner));
  select.replaceChildren(...options);
  select.value = selectedOwner;
};

const bindDecisionRail = (decisions, periodKey) => {
  document.querySelectorAll('.decision-rail .decision').forEach((section, index) => {
    const decision = decisions[index];
    section.hidden = !decision;
    if (!decision) return;

    setText(section.querySelector('h3'), decision.title);
    const currentContext = section.querySelector('.decision-context');
    const scenarioDecisionId = `${periodKey}:${decision.id}`;
    if (!currentContext || currentContext.dataset.scenarioId !== scenarioDecisionId) {
      const context = makeDecisionContext(decision);
      context.dataset.scenarioId = scenarioDecisionId;
      (currentContext || section.querySelector('p'))?.replaceWith(context);
    }

    if (section.dataset.scenarioDecisionSeeded !== scenarioDecisionId) {
      const owner = section.querySelector('select');
      syncOwnerOptions(owner, decision.owner);
      const due = section.querySelector('input[type="date"]');
      if (due) due.value = decision.due;
      section.dataset.scenarioDecisionSeeded = scenarioDecisionId;
    }

    const owner = section.querySelector('select');
    const due = section.querySelector('input[type="date"]');
    owner?.setAttribute('aria-label', `${decision.title} owner`);
    due?.setAttribute('aria-label', `${decision.title} due date`);
    setText(section.querySelector('small'), `Source: ${decision.source}`);
  });
};

const renderRequisitionDetail = (requisition, panel) => {
  panel.replaceChildren();
  panel.dataset.requisitionId = requisition.id;
  const eyebrow = document.createElement('span');
  eyebrow.className = 'decision-detail-eyebrow';
  eyebrow.textContent = `${requisition.role} · ${requisition.id}`;
  const title = document.createElement('h2');
  title.textContent = 'Decision detail';
  const action = document.createElement('h3');
  action.textContent = requisition.nextDecision;
  const context = makeDecisionContext(requisition);
  const meta = document.createElement('dl');
  for (const [label, value] of [
    ['Owner', requisition.owner],
    ['Due', requisition.due],
    ['Source', requisition.source],
  ]) {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    wrapper.append(term, description);
    meta.append(wrapper);
  }
  panel.append(eyebrow, title, action, context, meta);
};

const setRiskStatus = (cell, requisition) => {
  const status = cell?.querySelector('.status');
  if (!status) return;
  const className = `status ${requisition.risk.toLowerCase()}`;
  if (status.className !== className) status.className = className;
  setText(status, requisition.risk);
};

const bindRequisitionRow = (row, requisition, panel) => {
  const cells = row.querySelectorAll('td');
  setText(cells[0]?.querySelector('strong'), requisition.role);
  setText(cells[0]?.querySelector('small'), requisition.id);
  setText(cells[1], requisition.owner);
  setText(cells[2], `${requisition.age} days`);
  setRiskStatus(cells[3], requisition);
  setText(cells[3]?.querySelector('small'), requisition.reason);
  const sla = cells[4]?.querySelector('.sla');
  if (sla) {
    const statusClass = requisition.sla < 65 ? 'risk' : requisition.sla < 80 ? 'watch' : 'healthy';
    const className = `sla ${statusClass}`;
    if (sla.className !== className) sla.className = className;
    setText(sla, `${requisition.sla}%`);
  }
  setText(cells[4]?.querySelector('small'), requisition.slaLabel);
  setText(cells[5], requisition.forecast);
  setText(cells[6], requisition.nextDecision);

  const inspect = row.querySelector('.row-select-control');
  if (inspect) inspect.setAttribute('aria-label', `Inspect decision detail for ${requisition.role}, ${requisition.id}`);
  row.dataset.scenarioRequisition = `${scenario.metadata.key}:${requisition.id}`;
  row.onclick = () => renderRequisitionDetail(requisition, panel);
};

const buildFunnelBrief = (activeScenario) => {
  const { metadata, funnelStages, funnelTransitions, requisitions, funnelDecisions, recommendationLineage } = activeScenario;
  const comparison = metadata.comparisonAvailable
    ? `Compared with: ${metadata.priorPeriod}`
    : metadata.comparisonLabel;
  const lines = [
    'RECRUITING CONTROL ROOM — FUNNEL HEALTH BRIEF',
    `Reporting period: ${metadata.period}`,
    `Snapshot date: ${metadata.snapshotDate}`,
    `Scenario: ${metadata.name}`,
    `Source version: ${metadata.sourceVersion}`,
    `Refresh status: ${metadata.refreshStatus}`,
    `Comparison: ${comparison}`,
    '',
    'STAGE FLOW',
  ];

  funnelStages.forEach((stage, index) => {
    const delta = stage.delta === null ? 'comparison unavailable' : `${stage.delta > 0 ? '+' : ''}${stage.delta}% vs prior period`;
    const conversion = index === 0 ? '' : ` · ${stage.conversion}% transition conversion`;
    lines.push(`- ${stage.label}: ${stage.count.toLocaleString()} people · ${delta}${conversion}`);
  });

  lines.push('', 'TRANSITIONS');
  funnelTransitions.forEach((transition) => {
    lines.push(`- ${transition.from} → ${transition.to}: ${transition.toCount.toLocaleString()} of ${transition.fromCount.toLocaleString()} · ${transition.conversion}% · benchmark ${transition.benchmark}%${transition.bottleneck ? ' · PRIORITY BOTTLENECK' : ''}`);
  });
  const bottleneck = funnelTransitions.find((transition) => transition.bottleneck);
  lines.push('', 'BOTTLENECK RATIONALE', bottleneck.priorityReason, `Source: ${bottleneck.source}`);

  lines.push('', 'REQUISITION CONTROL');
  requisitions.forEach((item) => {
    lines.push(`- ${item.role} (${item.id}) · owner ${item.owner} · age ${item.age} days · risk ${item.risk} · SLA ${item.sla}% ${item.slaLabel} · forecast ${item.forecast} · next decision ${item.nextDecision} · due ${item.due} · source ${item.source}`);
  });

  lines.push('', 'PRIORITIZED DECISIONS');
  funnelDecisions.forEach((decision, index) => {
    lines.push(`${index + 1}. ${decision.title} · owner ${decision.owner} · due ${decision.due}`);
    lines.push(`   Evidence: ${decision.evidence}`);
    lines.push(`   Rationale: ${decision.rationale}`);
    lines.push(`   Recommended action: ${decision.recommendedAction}`);
    lines.push(`   Source: ${decision.source}`);
  });

  lines.push('', 'TRACEABILITY');
  recommendationLineage.forEach((item) => {
    lines.push(`- ${item.decisionId} · metrics ${item.metrics} · derivation ${item.derivation} · recommendation ${item.recommendation} · source ${item.source}`);
  });
  lines.push('', 'SOURCE RECORDS', ...metadata.sourceRecords.map((source) => `- ${source}`));
  lines.push('', 'Human review required. Synthetic local data only; no external writes or candidate decisions.');
  return `${lines.join('\n')}\n`;
};

const downloadFunnelBrief = (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const blob = new Blob([buildFunnelBrief(scenario)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recruiting-control-room-funnel-brief-${scenario.metadata.exportSlug}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const bindReportingPeriodControls = () => {
  const select = document.querySelector('select[aria-label="Date range"]');
  if (select) {
    if (!scenario.metadata.imported) {
      [...select.options].find((option) => option.value === 'local-import')?.remove();
    }
    if (scenario.metadata.imported && ![...select.options].some((option) => option.value === 'local-import')) {
      select.add(new Option(`${scenario.metadata.period} · local import`, 'local-import'));
    }
    const matchingOption = [...select.options].find((option) => option.textContent.trim() === scenario.metadata.period);
    const importedOption = [...select.options].find((option) => option.value === 'local-import');
    const activeOption = scenario.metadata.imported ? importedOption : matchingOption;
    if (activeOption && select.value !== activeOption.value) select.value = activeOption.value;
    if (select.dataset.periodControlBound !== 'true') {
      select.dataset.periodControlBound = 'true';
      select.addEventListener('change', (event) => {
        if (event.currentTarget.value === 'local-import') return;
        const period = event.currentTarget.selectedOptions[0]?.textContent.trim();
        setActiveScenario(period);
      }, true);
    }
  }

  const exportButton = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Export brief');
  if (exportButton && exportButton.dataset.periodExportBound !== 'true') {
    exportButton.dataset.periodExportBound = 'true';
    exportButton.addEventListener('click', downloadFunnelBrief, true);
  }
};

const bindFunnel = () => {
  bindReportingPeriodControls();
  const subtitle = document.querySelector('.screen-header h1')?.parentElement?.querySelector('p');
  if (subtitle) {
    subtitle.setAttribute('aria-live', 'polite');
    setText(subtitle, `${scenario.metadata.label} · ${scenario.metadata.period} · Snapshot ${scenario.metadata.snapshotDate} · Human review required`);
  }
  const tableDescription = [...document.querySelectorAll('.section-head')]
    .find((section) => section.querySelector('h2')?.textContent.trim() === 'Requisition control table')
    ?.querySelector('p');
  setText(tableDescription, `${scenario.requisitions.length} synthetic roles · ${scenario.metadata.period} · select Inspect to review the next decision`);

  const wrap = document.querySelector('.table-wrap');
  if (!wrap) return;
  let panel = document.querySelector('.decision-detail-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'decision-detail-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-label', 'Selected requisition decision detail');
    wrap.insertAdjacentElement('afterend', panel);
  }

  document.querySelectorAll('.table-wrap tbody tr').forEach((row, index) => {
    const requisition = scenario.requisitions[index];
    row.hidden = !requisition;
    if (requisition) bindRequisitionRow(row, requisition, panel);
  });

  const activeId = panel.dataset.periodKey === scenario.metadata.key ? panel.dataset.requisitionId : null;
  const activeRequisition = scenario.requisitions.find((item) => item.id === activeId) || scenario.requisitions[0];
  if (panel.dataset.periodKey !== scenario.metadata.key) {
    renderRequisitionDetail(activeRequisition, panel);
    panel.dataset.periodKey = scenario.metadata.key;
  }
  bindDecisionRail(scenario.funnelDecisions, scenario.metadata.key);
};

const setControlledTextarea = (textarea, value) => {
  if (textarea.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
};

const bindWeekly = () => {
  const weeklyScenario = scenario.metadata.imported ? scenario : latestScenario;
  const narrativeItems = Object.values(weeklyScenario.weeklyNarrative);
  document.querySelectorAll('.narrative-grid > div').forEach((section, index) => {
    const value = narrativeItems[index];
    if (!value) return;
    const paragraph = section.querySelector('p');
    const textarea = section.querySelector('textarea');
    if (textarea && section.dataset.scenarioSeeded !== weeklyScenario.metadata.key) {
      setControlledTextarea(textarea, value);
      section.dataset.scenarioSeeded = weeklyScenario.metadata.key;
    } else if (paragraph && section.dataset.scenarioSeeded !== weeklyScenario.metadata.key) {
      setText(paragraph, value);
      section.dataset.scenarioSeeded = weeklyScenario.metadata.key;
    }
  });
  bindDecisionRail(weeklyScenario.weeklyDecisions, weeklyScenario.metadata.imported ? weeklyScenario.metadata.key : 'weekly-latest');
};

let scheduled = false;
const applyScenario = () => {
  scheduled = false;
  const title = document.querySelector('h1')?.textContent;
  if (title === 'Funnel Health') bindFunnel();
  if (title === 'Weekly Review') bindWeekly();
};

const scheduleScenario = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyScenario);
};

window.addEventListener('rcr:period-change', scheduleScenario);
new MutationObserver(scheduleScenario).observe(document.getElementById('root'), { childList: true, subtree: true });
scheduleScenario();
