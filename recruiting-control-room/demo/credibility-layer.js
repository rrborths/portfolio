import { scenario } from './shared-scenario.js';
import { openDataWorkspace } from './data-workspace.js';

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const labelFixedScenario = () => {
  const title = document.querySelector('.screen-header h1')?.textContent;
  const subtitle = document.querySelector('.screen-header h1')?.parentElement?.querySelector('p');
  if (!subtitle) return;
  const labels = {
    'Funnel Health': `${scenario.metadata.label} · ${scenario.metadata.period} · Snapshot ${scenario.metadata.snapshotDate} · Human review required`,
    'Weekly Review': `${scenario.metadata.label} · May 12 – May 18 · All functions · Synthetic data`,
    'Intake & Kickoff': `${scenario.metadata.label} · Structured intake → named approval → review-ready internal artifacts`,
  };
  if (labels[title] && subtitle.textContent !== labels[title]) subtitle.textContent = labels[title];
};

const makeStageCard = (stage, index) => {
  const card = makeElement('article', 'flow-stage-card');
  const label = makeElement('span', 'flow-stage-label', stage.label);
  const count = makeElement('strong', null, stage.count.toLocaleString());
  const countLabel = makeElement('small', null, 'people at stage');
  card.dataset.stageIndex = String(index);
  card.append(label, count, countLabel);
  if (stage.delta !== null) {
    const change = makeElement('span', `flow-stage-change ${stage.delta < 0 ? 'negative' : 'positive'}`);
    change.textContent = `${stage.delta > 0 ? '+' : ''}${stage.delta}% count vs prior period`;
    card.append(change);
  }
  return card;
};

const makeTransition = (transition) => {
  const item = makeElement('div', `flow-transition${transition.bottleneck ? ' bottleneck' : ''}`);
  item.setAttribute('role', 'group');
  item.setAttribute('aria-label', `${transition.from} to ${transition.to}: ${transition.toCount.toLocaleString()} of ${transition.fromCount.toLocaleString()}, ${transition.conversion}% conversion`);
  const arrow = makeElement('span', 'flow-arrow', '→');
  arrow.setAttribute('aria-hidden', 'true');
  const metrics = makeElement('span', 'flow-transition-metrics');
  const count = makeElement('strong', null, `${transition.toCount.toLocaleString()} of ${transition.fromCount.toLocaleString()}`);
  const conversion = makeElement('span', null, `${transition.conversion}% conversion`);
  metrics.append(count, conversion);
  item.append(arrow, metrics);
  if (transition.bottleneck) item.append(makeElement('span', 'bottleneck-tag', 'Priority bottleneck'));
  return item;
};

const renderFunnelFlow = () => {
  const existing = document.querySelector('.funnel-evidence-flow');
  if (existing?.dataset.periodKey === scenario.metadata.key) return;
  const stageStrip = document.querySelector('.stage-strip');
  const decorativeFunnel = document.querySelector('.funnel-viz');
  if (!existing && (!stageStrip || !decorativeFunnel)) return;

  const section = makeElement('section', 'funnel-evidence-flow');
  section.dataset.periodKey = scenario.metadata.key;
  section.setAttribute('aria-labelledby', 'funnel-flow-title');
  const heading = makeElement('div', 'funnel-flow-heading');
  const headingCopy = makeElement('div');
  const title = makeElement('h2', null, 'Connected stage flow');
  title.id = 'funnel-flow-title';
  const explanation = makeElement('p', null, `Counts are fixed at ${scenario.metadata.snapshotDate}. Each connector shows the receiving count and transition conversion.`);
  const headingMeta = makeElement('div', 'funnel-flow-heading-meta');
  const comparison = makeElement('span', 'comparison-label', scenario.metadata.comparisonLabel);
  const scrollHint = makeElement('span', 'funnel-flow-scroll-hint', 'Scroll for all stages →');
  headingCopy.append(title, explanation);
  headingMeta.append(comparison, scrollHint);
  heading.append(headingCopy, headingMeta);

  const flowRegion = makeElement('div', 'funnel-flow-region');
  flowRegion.tabIndex = 0;
  flowRegion.setAttribute('role', 'region');
  flowRegion.setAttribute('aria-label', 'Recruiting stage flow. Scroll horizontally on smaller screens.');
  const flow = makeElement('div', 'funnel-flow');
  scenario.funnelStages.forEach((stage, index) => {
    flow.append(makeStageCard(stage, index));
    if (scenario.funnelTransitions[index]) flow.append(makeTransition(scenario.funnelTransitions[index]));
  });
  flowRegion.append(flow);

  const bottleneck = scenario.funnelTransitions.find((transition) => transition.bottleneck);
  const callout = makeElement('aside', 'bottleneck-explanation');
  const calloutLabel = makeElement('span', 'bottleneck-eyebrow', 'Most consequential bottleneck');
  const calloutTitle = makeElement('h3', null, `${bottleneck.from} → ${bottleneck.to}`);
  const calloutReason = makeElement('p', null, bottleneck.priorityReason);
  const calloutSource = makeElement('small', null, `Observed source metric: ${bottleneck.source} · Generated recommendation requires human review.`);
  callout.append(calloutLabel, calloutTitle, calloutReason, calloutSource);

  section.append(heading, flowRegion, callout);
  if (existing) existing.replaceWith(section);
  else {
    stageStrip.replaceWith(section);
    decorativeFunnel.remove();
  }
};

const makeMetadataItem = (label, value) => {
  const item = makeElement('div', 'controls-metadata-item');
  item.append(makeElement('dt', null, label), makeElement('dd', null, value));
  return item;
};

const buildDataControlsDialog = () => {
  const existing = document.querySelector('#data-controls-dialog');
  if (existing?.dataset.periodKey === scenario.metadata.key) return existing;
  existing?.remove();

  const dialog = makeElement('dialog', 'data-controls-dialog');
  dialog.id = 'data-controls-dialog';
  dialog.dataset.periodKey = scenario.metadata.key;
  dialog.setAttribute('aria-labelledby', 'data-controls-title');

  const header = makeElement('header', 'data-controls-header');
  const headingGroup = makeElement('div');
  const eyebrow = makeElement('p', 'data-controls-eyebrow', scenario.metadata.label);
  const title = makeElement('h2', null, 'Data & controls');
  title.id = 'data-controls-title';
  const close = makeElement('button', 'data-controls-close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close Data & controls');
  headingGroup.append(eyebrow, title);
  header.append(headingGroup, close);

  const intro = makeElement('p', 'data-controls-intro', 'Trace every displayed recommendation from a fixed synthetic source metric through explicit logic to a human-reviewed action.');

  const metadata = makeElement('dl', 'controls-metadata');
  metadata.append(
    makeMetadataItem('Scenario', scenario.metadata.name),
    makeMetadataItem('Reporting period', scenario.metadata.period),
    makeMetadataItem('Comparison', scenario.metadata.comparisonAvailable ? scenario.metadata.priorPeriod : 'Unavailable — no earlier baseline loaded'),
    makeMetadataItem('Snapshot date', scenario.metadata.snapshotDate),
    makeMetadataItem('Source version', scenario.metadata.sourceVersion),
    makeMetadataItem('Refresh status', scenario.metadata.refreshStatus),
  );

  const legend = makeElement('section', 'controls-section controls-legend');
  const legendTitle = makeElement('h3', null, 'Metric status');
  const legendGrid = makeElement('div', 'controls-legend-grid');
  for (const [type, description] of [
    ['Observed metric', scenario.methodology.observed],
    ['Derived indicator', scenario.methodology.derived],
    ['Generated recommendation', scenario.methodology.generated],
  ]) {
    const card = makeElement('article', `metric-type ${type.toLowerCase().replaceAll(' ', '-')}`);
    card.append(makeElement('strong', null, type), makeElement('p', null, description));
    legendGrid.append(card);
  }
  legend.append(legendTitle, legendGrid);

  const methods = makeElement('section', 'controls-section');
  methods.append(makeElement('h3', null, 'Formulas and decision logic'));
  const methodGrid = makeElement('div', 'method-grid');
  scenario.methodology.formulas.forEach((method) => {
    const card = makeElement('article', 'method-card');
    const type = makeElement('span', 'method-type', method.type);
    card.append(type, makeElement('h4', null, method.name), makeElement('p', null, method.logic));
    methodGrid.append(card);
  });
  methods.append(methodGrid);

  const thresholds = makeElement('section', 'controls-section');
  thresholds.append(makeElement('h3', null, 'Risk thresholds'));
  const thresholdList = makeElement('dl', 'threshold-list');
  scenario.methodology.thresholds.forEach((threshold) => {
    const item = makeElement('div');
    item.append(makeElement('dt', null, threshold.label), makeElement('dd', null, threshold.value));
    thresholdList.append(item);
  });
  thresholds.append(thresholdList);

  const lineage = makeElement('section', 'controls-section');
  lineage.append(makeElement('h3', null, 'Recommendation traceability'));
  const tableWrap = makeElement('div', 'lineage-table-wrap');
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute('role', 'region');
  tableWrap.setAttribute('aria-label', 'Recommendation traceability table');
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Decision', 'Observed source metrics', 'Derivation', 'Generated recommendation', 'Source'].forEach((label) => headRow.append(makeElement('th', null, label)));
  head.append(headRow);
  const body = document.createElement('tbody');
  scenario.recommendationLineage.forEach((item) => {
    const row = document.createElement('tr');
    [item.decisionId, item.metrics, item.derivation, item.recommendation, item.source].forEach((value, index) => {
      const cell = makeElement('td', null, value);
      cell.dataset.label = ['Decision', 'Observed source metrics', 'Derivation', 'Generated recommendation', 'Source'][index];
      row.append(cell);
    });
    body.append(row);
  });
  table.append(head, body);
  tableWrap.append(table);
  lineage.append(tableWrap);

  const boundary = makeElement('aside', 'controls-boundary');
  boundary.append(
    makeElement('strong', null, 'Human review and no-send boundary'),
    makeElement('p', null, 'Recommendations remain review inputs. The demo does not rank or select candidates, update an ATS, send outreach, publish artifacts, or write to any external system.'),
  );

  const footer = makeElement('footer', 'data-controls-footer');
  const returnButton = makeElement('button', 'data-controls-return', 'Return to the demo');
  returnButton.type = 'button';
  footer.append(returnButton);

  dialog.append(header, intro, metadata, legend, methods, thresholds, lineage, boundary, footer);
  document.body.append(dialog);

  const closeDialog = () => dialog.close();
  close.addEventListener('click', closeDialog);
  returnButton.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener('close', () => {
    document.querySelector('[data-controls-opener="true"]')?.focus();
  });
  return dialog;
};

const openDataControls = (event) => {
  openDataWorkspace(event.currentTarget);
};

const ensureMobileControlsButton = () => {
  if (document.querySelector('.data-controls-mobile-nav')) return;
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  const button = makeElement('button', 'nav-item data-controls-mobile-nav');
  button.type = 'button';
  button.setAttribute('aria-label', 'Data & controls');
  button.setAttribute('aria-haspopup', 'dialog');
  button.dataset.controlsBound = 'true';
  const icon = makeElement('span', 'data-controls-mobile-icon', '▦');
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon, makeElement('span', null, 'Controls'));
  button.addEventListener('click', openDataControls);
  nav.append(button);
};

const enforceModuleOrder = () => {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  const requested = ['Intake & Kickoff', 'Funnel Health', 'Weekly Review'];
  const items = [...nav.querySelectorAll('.nav-item:not(.data-controls-mobile-nav)')];
  const current = items.map((item) => item.textContent.trim());
  if (requested.every((label, index) => current[index] === label)) return;
  requested.forEach((label) => {
    const item = items.find((candidate) => candidate.textContent.trim() === label);
    if (item) nav.append(item);
  });
  const controls = nav.querySelector('.data-controls-mobile-nav');
  if (controls) nav.append(controls);
};

const bindDataControls = () => {
  document.querySelectorAll('button').forEach((button) => {
    const label = button.textContent.trim();
    if (!['Data & controls', 'View data sources'].includes(label)) return;
    button.setAttribute('aria-haspopup', 'dialog');
    if (button.dataset.controlsBound === 'true') return;
    button.dataset.controlsBound = 'true';
    button.addEventListener('click', openDataControls);
  });
};

const renderSourceBand = () => {
  const band = document.querySelector('.source-band');
  if (!band || band.dataset.periodKey === scenario.metadata.key) return;
  band.dataset.periodKey = scenario.metadata.key;
  band.replaceChildren(
    makeElement('strong', 'source-band-title', `Source traceability · ${scenario.metadata.period}`),
    makeElement('span', 'source-band-version', `Source version ${scenario.metadata.sourceVersion} · Synthetic and aggregated`),
    makeElement('span', 'source-band-records', scenario.metadata.sourceSummary),
  );
};

let scheduled = false;
const applyCredibilityLayer = () => {
  scheduled = false;
  labelFixedScenario();
  if (document.querySelector('.screen-header h1')?.textContent === 'Funnel Health') renderFunnelFlow();
  renderSourceBand();
  enforceModuleOrder();
  ensureMobileControlsButton();
  bindDataControls();
};

const scheduleCredibilityLayer = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyCredibilityLayer);
};

window.addEventListener('rcr:period-change', () => {
  document.querySelector('#data-controls-dialog')?.remove();
  scheduleCredibilityLayer();
});
new MutationObserver(scheduleCredibilityLayer).observe(document.getElementById('root'), { childList: true, subtree: true });
scheduleCredibilityLayer();
