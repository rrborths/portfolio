import { latestScenario, periodScenarios, scenario } from './shared-scenario.js';
import { formatDueDateState, getDueDateState, isActionOverdue } from './scenario-clock.js';

const STORAGE_KEY = 'rcr-local-action-queue-v1';
const COUNTER_KEY = 'rcr-local-action-counter-v1';
const STATUS = Object.freeze({
  draft: 'Draft — not sent',
  ready: 'Ready for approval — not sent',
  completed: 'Locally completed',
});
const DESTINATIONS = Object.freeze([
  'Existing task-management system',
  'Notification platform',
  'Calendar meeting/time block',
  'No external destination',
]);

const create = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const safelyRead = (key, fallback) => {
  try {
    const value = JSON.parse(sessionStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const safelyWrite = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const resolveScenarioAsOfDate = (action) => (
  action.scenarioAsOfDate
  || periodScenarios[action.sourceScenarioKey]?.metadata.asOfDate
  || (scenario.metadata.key === action.sourceScenarioKey ? scenario.metadata.asOfDate : '')
);

const normalizeActionClock = (action) => ({
  ...action,
  scenarioAsOfDate: resolveScenarioAsOfDate(action),
  scenarioClockSource: action.scenarioClockSource || 'Scenario snapshot date',
});

let actions = Array.isArray(safelyRead(STORAGE_KEY, []))
  ? safelyRead(STORAGE_KEY, []).map(normalizeActionClock)
  : [];
let activeFilter = 'All';
let lastQueueTrigger = null;
let lastComposerTrigger = null;

const persistActions = () => safelyWrite(STORAGE_KEY, actions);

const nextActionId = () => {
  const next = Number(safelyRead(COUNTER_KEY, 0)) + 1;
  safelyWrite(COUNTER_KEY, next);
  return `LOCAL-ACT-${String(next).padStart(3, '0')}`;
};

const getActiveDecisionSet = () => {
  const screen = document.querySelector('.screen-header h1')?.textContent.trim();
  if (screen === 'Weekly Review') {
    const active = scenario.metadata.imported ? scenario : latestScenario;
    return { module: 'Weekly Review', scenario: active, decisions: active.weeklyDecisions };
  }
  return { module: 'Funnel Health', scenario, decisions: scenario.funnelDecisions };
};

const deriveRequisitionId = (decision, activeScenario) => {
  const matches = [
    ...String(decision.evidence || '').matchAll(/\b(?:SYN-\d{4}|[A-Z]{2,5}-\d{3,4})\b/g),
    ...String(decision.title || '').matchAll(/\b(?:SYN-\d{4}|[A-Z]{2,5}-\d{3,4})\b/g),
  ].map((match) => match[0]);
  const unique = [...new Set(matches)];
  if (unique.length) return unique.join(', ');

  const direct = activeScenario.requisitions.find((item) => (
    item.nextDecision === decision.title
    || item.recommendedAction === decision.recommendedAction
  ));
  if (direct) return direct.id;

  const title = `${decision.title} ${decision.evidence}`.toLowerCase();
  const keywordMatch = activeScenario.requisitions.find((item) => {
    const role = item.role.toLowerCase();
    return (title.includes('backend') && role.includes('backend'))
      || (title.includes('sales') && role.includes('sales'))
      || (title.includes('product') && role.includes('product'))
      || (title.includes('distribution') && role.includes('distribution'))
      || (title.includes('people operations') && role.includes('people operations'));
  });
  if (keywordMatch) return keywordMatch.id;
  return 'PORTFOLIO-LEVEL';
};

const sourceIdentifiers = (source) => String(source || '')
  .split(/\s+\+\s+/)
  .map((item) => item.trim())
  .filter(Boolean);

const dueDateState = (action) => getDueDateState({
  dueDate: action.dueDate,
  scenarioAsOfDate: action.scenarioAsOfDate,
  completed: action.status === STATUS.completed,
});

const isOverdue = (action) => isActionOverdue(action, STATUS.completed);

const formatTimestamp = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const buildPayload = (action) => ({
  contract_version: 'proposed-action-handoff-v1',
  preview_only: true,
  authorization_status: 'human approval required',
  delivery_attempted: false,
  idempotency_key: `preview:${action.actionId}:r${action.revision}`,
  action_id: action.actionId,
  decision_id: action.originatingDecisionId,
  requisition_id: action.requisitionId,
  source_snapshot_id: action.sourceScenarioKey,
  scenario_as_of_date: action.scenarioAsOfDate,
  scenario_clock_source: action.scenarioClockSource,
  workflow_due_state: dueDateState(action),
  owner: action.owner,
  due_date: action.dueDate,
  title: action.draftTaskTitle,
  description: action.draftTaskDescription,
  source_identifiers: action.sourceIdentifiers,
  proposed_destination: action.proposedDestination,
  status: action.status,
  created_at: action.createdTimestamp,
  locally_updated_at: action.lastLocallyUpdatedTimestamp,
  locally_updated_at_basis: 'real browser session time',
});

const boundaryList = () => {
  const list = create('ul', 'action-boundary-list');
  for (const statement of [
    'No notification was sent.',
    'No external task was created.',
    'No calendar event was created.',
    'A production integration would require authentication, permissions, mapping, idempotency, retries, and human approval.',
  ]) list.append(create('li', null, statement));
  return list;
};

const queueDialog = document.createElement('dialog');
queueDialog.className = 'action-queue-dialog';
queueDialog.setAttribute('aria-labelledby', 'action-queue-title');
queueDialog.innerHTML = `
  <header class="action-dialog-header">
    <div><p class="action-dialog-eyebrow">Browser-local workflow continuity</p><h2 id="action-queue-title">Action queue</h2></div>
    <button type="button" class="action-dialog-close" aria-label="Close Action queue">Close</button>
  </header>
  <div class="action-queue-body">
    <p class="action-queue-intro">Draft and review what could happen after a prioritized decision receives a human owner and deadline. Due status uses each action’s scenario as-of date, not the visitor’s browser clock. Records stay in this browser session.</p>
    <div class="action-queue-boundary" data-action-boundary></div>
    <div class="action-queue-toolbar">
      <div class="action-queue-filters" role="group" aria-label="Filter local actions"></div>
      <button type="button" class="action-restore-button" data-restore-actions>Restore empty demo queue</button>
    </div>
    <p class="action-queue-status" role="status" aria-live="polite" data-action-queue-status></p>
    <dl class="action-queue-counts" aria-label="Action queue counts"></dl>
    <div class="action-queue-list" data-action-queue-list></div>
  </div>
`;
document.body.append(queueDialog);
queueDialog.querySelector('[data-action-boundary]').append(boundaryList());

const composerDialog = document.createElement('dialog');
composerDialog.className = 'action-composer-dialog';
composerDialog.setAttribute('aria-labelledby', 'action-composer-title');
composerDialog.innerHTML = `
  <form class="action-composer-form" novalidate>
    <header class="action-dialog-header">
      <div><p class="action-dialog-eyebrow">Selected decision · local draft only</p><h2 id="action-composer-title">Create local draft action</h2></div>
      <button type="button" class="action-dialog-close" aria-label="Close action draft">Close</button>
    </header>
    <div class="action-composer-body">
      <section class="action-decision-review" aria-labelledby="action-decision-review-title">
        <h3 id="action-decision-review-title">Decision review</h3>
        <dl data-action-decision-review></dl>
      </section>
      <div class="action-composer-fields">
        <label><span>Owner</span><input name="owner" required autocomplete="off" /></label>
        <label><span>Due date</span><input name="dueDate" type="date" required /></label>
        <label class="action-field-wide"><span>Optional action note</span><textarea name="note" rows="3"></textarea></label>
        <label class="action-field-wide"><span>Proposed production destination</span><select name="destination" required></select></label>
        <label class="action-field-wide"><span>Draft task title</span><input name="draftTitle" required /></label>
        <label class="action-field-wide"><span>Draft task description</span><textarea name="draftDescription" rows="6" required></textarea></label>
      </div>
      <div class="action-composer-boundary" data-composer-boundary></div>
      <p class="action-form-error" role="alert" data-action-form-error></p>
      <div class="action-composer-actions">
        <button type="button" class="action-secondary" data-cancel-action>Cancel</button>
        <button type="submit" class="action-primary">Create local draft action</button>
      </div>
    </div>
  </form>
`;
document.body.append(composerDialog);
composerDialog.querySelector('[data-composer-boundary]').append(boundaryList());
const destination = composerDialog.querySelector('[name="destination"]');
DESTINATIONS.forEach((item) => destination.append(new Option(item, item)));

const setQueueStatus = (message) => {
  queueDialog.querySelector('[data-action-queue-status]').textContent = message;
};

const getFilterMatch = (action) => {
  if (activeFilter === 'All') return true;
  if (activeFilter === 'Draft') return action.status === STATUS.draft;
  if (activeFilter === 'Ready for approval') return action.status === STATUS.ready;
  if (activeFilter === 'Locally completed') return action.status === STATUS.completed;
  if (activeFilter === 'Overdue') return isOverdue(action);
  return true;
};

const updateAction = (id, changes, message) => {
  const timestamp = new Date().toISOString();
  actions = actions.map((action) => action.actionId === id
    ? { ...action, ...changes, revision: action.revision + 1, lastLocallyUpdatedTimestamp: timestamp }
    : action);
  persistActions();
  renderQueue(message);
};

const appendTerm = (list, label, value) => {
  const item = create('div');
  item.append(create('dt', null, label), create('dd', null, value));
  list.append(item);
};

const makeActionCard = (action) => {
  const card = create('article', 'action-queue-card');
  card.dataset.actionId = action.actionId;

  const header = create('header', 'action-card-header');
  const headingWrap = create('div');
  headingWrap.append(create('span', 'action-id', action.actionId), create('h3', null, action.draftTaskTitle));
  const badges = create('div', 'action-badges');
  badges.append(create('span', 'action-status-badge', action.status));
  if (isOverdue(action)) badges.append(create('span', 'action-overdue-badge', 'Overdue'));
  header.append(headingWrap, badges);

  const fields = create('dl', 'action-card-fields');
  appendTerm(fields, 'Source decision', action.originatingDecisionId);
  appendTerm(fields, 'Requisition ID', action.requisitionId);
  appendTerm(fields, 'Owner', action.owner);
  appendTerm(fields, 'Due date', action.dueDate);
  appendTerm(fields, 'Scenario as-of date', action.scenarioAsOfDate);
  appendTerm(fields, 'Workflow due state', formatDueDateState(dueDateState(action)));
  appendTerm(fields, 'Proposed destination', action.proposedDestination);
  appendTerm(fields, 'Last locally updated (real session time)', formatTimestamp(action.lastLocallyUpdatedTimestamp));

  const description = create('p', 'action-card-description', action.draftTaskDescription);
  const record = document.createElement('details');
  record.className = 'action-record-details';
  record.append(create('summary', null, 'Review complete local action record'));
  const recordFields = create('dl');
  appendTerm(recordFields, 'Action ID', action.actionId);
  appendTerm(recordFields, 'Originating decision ID', action.originatingDecisionId);
  appendTerm(recordFields, 'Requisition ID', action.requisitionId);
  appendTerm(recordFields, 'Owner', action.owner);
  appendTerm(recordFields, 'Due date', action.dueDate);
  appendTerm(recordFields, 'Scenario as-of date', action.scenarioAsOfDate);
  appendTerm(recordFields, 'Scenario clock source', action.scenarioClockSource);
  appendTerm(recordFields, 'Workflow due state', formatDueDateState(dueDateState(action)));
  appendTerm(recordFields, 'Draft task title', action.draftTaskTitle);
  appendTerm(recordFields, 'Draft task description', action.draftTaskDescription);
  appendTerm(recordFields, 'Source identifiers', action.sourceIdentifiers.join(' · ') || 'None');
  appendTerm(recordFields, 'Proposed destination', action.proposedDestination);
  appendTerm(recordFields, 'Status', action.status);
  appendTerm(recordFields, 'Created (real session time)', formatTimestamp(action.createdTimestamp));
  appendTerm(recordFields, 'Last locally updated (real session time)', formatTimestamp(action.lastLocallyUpdatedTimestamp));
  if (action.note) appendTerm(recordFields, 'Optional action note', action.note);
  record.append(recordFields);

  const preview = document.createElement('details');
  preview.className = 'action-handoff-preview';
  preview.append(create('summary', null, 'Production handoff preview'));
  const previewIntro = create('p', null, 'Preview only. This payload would require separate human authorization before any production integration could use it.');
  const payload = create('pre');
  payload.textContent = JSON.stringify(buildPayload(action), null, 2);
  preview.append(previewIntro, payload, boundaryList());

  const controls = create('div', 'action-card-controls');
  if (action.status === STATUS.draft) {
    const ready = create('button', 'action-primary', 'Mark ready for approval');
    ready.type = 'button';
    ready.onclick = () => updateAction(action.actionId, { status: STATUS.ready }, `${action.actionId} is ready for human approval. Nothing was sent.`);
    controls.append(ready);
  }
  if (action.status === STATUS.ready) {
    const draft = create('button', 'action-secondary', 'Return to draft');
    draft.type = 'button';
    draft.onclick = () => updateAction(action.actionId, { status: STATUS.draft }, `${action.actionId} returned to draft. Nothing was sent.`);
    controls.append(draft);
  }
  if (action.status !== STATUS.completed) {
    const complete = create('button', 'action-secondary', 'Complete locally');
    complete.type = 'button';
    complete.onclick = () => updateAction(action.actionId, { status: STATUS.completed }, `${action.actionId} marked locally completed. No external system changed.`);
    controls.append(complete);
  } else {
    const reopen = create('button', 'action-secondary', 'Restore to draft');
    reopen.type = 'button';
    reopen.onclick = () => updateAction(action.actionId, { status: STATUS.draft }, `${action.actionId} restored to draft. Nothing was sent.`);
    controls.append(reopen);
  }
  const remove = create('button', 'action-delete', 'Delete local draft');
  remove.type = 'button';
  remove.onclick = () => {
    if (remove.dataset.confirm !== 'true') {
      remove.dataset.confirm = 'true';
      remove.textContent = 'Confirm local deletion';
      setQueueStatus(`Confirm deletion of ${action.actionId}. This affects this browser session only.`);
      return;
    }
    actions = actions.filter((item) => item.actionId !== action.actionId);
    persistActions();
    renderQueue(`${action.actionId} deleted from this browser session. No external system changed.`);
  };
  controls.append(remove);

  card.append(header, fields, description, record, preview, controls);
  return card;
};

function renderQueue(message = '') {
  const filters = queueDialog.querySelector('.action-queue-filters');
  filters.replaceChildren();
  for (const filter of ['All', 'Draft', 'Ready for approval', 'Locally completed', 'Overdue']) {
    const button = create('button', activeFilter === filter ? 'active' : '', filter);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(activeFilter === filter));
    button.onclick = () => {
      activeFilter = filter;
      renderQueue(`Showing ${filter.toLowerCase()} actions.`);
    };
    filters.append(button);
  }

  const counts = queueDialog.querySelector('.action-queue-counts');
  counts.replaceChildren();
  for (const [label, value] of [
    ['Draft', actions.filter((item) => item.status === STATUS.draft).length],
    ['Ready for approval', actions.filter((item) => item.status === STATUS.ready).length],
    ['Locally completed', actions.filter((item) => item.status === STATUS.completed).length],
    ['Overdue', actions.filter(isOverdue).length],
  ]) appendTerm(counts, label, String(value));

  const list = queueDialog.querySelector('[data-action-queue-list]');
  list.replaceChildren();
  const visible = actions.filter(getFilterMatch);
  if (!visible.length) {
    const empty = create('div', 'action-empty-state');
    empty.append(create('h3', null, 'No local actions in this view'), create('p', null, 'Select a prioritized decision in Funnel Health or Weekly Review, then choose Create local draft action.'));
    list.append(empty);
  } else visible.forEach((action) => list.append(makeActionCard(action)));
  setQueueStatus(message || `${visible.length} of ${actions.length} local actions shown. Nothing was sent.`);
}

const closeDialog = (dialog, trigger) => {
  if (dialog.open) dialog.close();
  trigger?.focus();
};

queueDialog.querySelector('.action-dialog-close').onclick = () => closeDialog(queueDialog, lastQueueTrigger);
composerDialog.querySelector('.action-dialog-close').onclick = () => closeDialog(composerDialog, lastComposerTrigger);
composerDialog.querySelector('[data-cancel-action]').onclick = () => closeDialog(composerDialog, lastComposerTrigger);
for (const dialog of [queueDialog, composerDialog]) {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) closeDialog(dialog, dialog === queueDialog ? lastQueueTrigger : lastComposerTrigger);
  });
}

const openQueue = (trigger, message = '') => {
  lastQueueTrigger = trigger || lastQueueTrigger;
  renderQueue(message);
  if (!queueDialog.open) queueDialog.showModal();
  queueDialog.querySelector('.action-dialog-close').focus();
};

const openComposer = (section, decision, activeScenario, moduleName, trigger) => {
  lastComposerTrigger = trigger;
  const owner = section.querySelector('select')?.value || decision.owner;
  const dueDate = section.querySelector('input[type="date"]')?.value || decision.due;
  const requisitionId = deriveRequisitionId(decision, activeScenario);
  const review = composerDialog.querySelector('[data-action-decision-review]');
  review.replaceChildren();
  for (const [label, value] of [
    ['Decision ID', decision.id],
    ['Requisition ID', requisitionId],
    ['Evidence', decision.evidence],
    ['Rationale', decision.rationale],
    ['Recommendation', decision.recommendedAction],
    ['Source identifiers', sourceIdentifiers(decision.source).join(' · ')],
  ]) appendTerm(review, label, value);

  const form = composerDialog.querySelector('form');
  form.dataset.decisionId = decision.id;
  form.dataset.requisitionId = requisitionId;
  form.dataset.module = moduleName;
  form.dataset.source = decision.source;
  form.dataset.scenarioKey = activeScenario.metadata.key;
  form.dataset.scenarioAsOfDate = activeScenario.metadata.asOfDate;
  form.dataset.scenarioClockSource = activeScenario.metadata.imported
    ? 'Imported scenario reporting date'
    : 'Built-in scenario snapshot date';
  form.elements.owner.value = owner;
  form.elements.dueDate.value = dueDate;
  form.elements.note.value = '';
  form.elements.destination.value = 'Existing task-management system';
  form.elements.draftTitle.value = decision.title;
  form.elements.draftDescription.value = `Evidence: ${decision.evidence}\n\nRationale: ${decision.rationale}\n\nRecommended action: ${decision.recommendedAction}`;
  composerDialog.querySelector('[data-action-form-error]').textContent = '';
  if (!composerDialog.open) composerDialog.showModal();
  form.elements.owner.focus();
};

composerDialog.querySelector('form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = form.elements;
  if (!fields.owner.value.trim() || !fields.dueDate.value || !fields.draftTitle.value.trim() || !fields.draftDescription.value.trim()) {
    composerDialog.querySelector('[data-action-form-error]').textContent = 'Owner, due date, draft title, and draft description are required.';
    return;
  }
  const duplicate = actions.find((action) => (
    action.originatingDecisionId === form.dataset.decisionId
    && action.sourceScenarioKey === form.dataset.scenarioKey
    && action.status !== STATUS.completed
  ));
  if (duplicate) {
    closeDialog(composerDialog, null);
    openQueue(lastComposerTrigger, `${duplicate.actionId} is already the open local action for decision ${form.dataset.decisionId}. No duplicate was created.`);
    return;
  }
  const timestamp = new Date().toISOString();
  const action = {
    actionId: nextActionId(),
    originatingDecisionId: form.dataset.decisionId,
    requisitionId: form.dataset.requisitionId,
    module: form.dataset.module,
    owner: fields.owner.value.trim(),
    dueDate: fields.dueDate.value,
    note: fields.note.value.trim(),
    draftTaskTitle: fields.draftTitle.value.trim(),
    draftTaskDescription: fields.draftDescription.value.trim(),
    sourceIdentifiers: sourceIdentifiers(form.dataset.source),
    sourceScenarioKey: form.dataset.scenarioKey,
    scenarioAsOfDate: form.dataset.scenarioAsOfDate,
    scenarioClockSource: form.dataset.scenarioClockSource,
    proposedDestination: fields.destination.value,
    status: STATUS.draft,
    createdTimestamp: timestamp,
    lastLocallyUpdatedTimestamp: timestamp,
    revision: 1,
  };
  actions = [action, ...actions];
  persistActions();
  closeDialog(composerDialog, null);
  openQueue(lastComposerTrigger, `${action.actionId} created locally as Draft — not sent.`);
});

const restoreButton = queueDialog.querySelector('[data-restore-actions]');
restoreButton.onclick = () => {
  if (restoreButton.dataset.confirm !== 'true') {
    restoreButton.dataset.confirm = 'true';
    restoreButton.textContent = 'Confirm restore empty queue';
    setQueueStatus('Confirm restore to remove every browser-session action. No external system will change.');
    return;
  }
  actions = [];
  activeFilter = 'All';
  persistActions();
  safelyWrite(COUNTER_KEY, 0);
  restoreButton.dataset.confirm = 'false';
  restoreButton.textContent = 'Restore empty demo queue';
  renderQueue('Empty demo queue restored. No external system changed.');
};

const addQueueNavigation = () => {
  const nav = document.querySelector('.sidebar nav');
  if (!nav || nav.querySelector('.action-queue-nav')) return;
  const button = create('button', 'nav-item action-queue-nav');
  button.type = 'button';
  button.setAttribute('aria-label', 'Action queue');
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h12M6 12h12M6 18h8"></path><path d="m16 17 2 2 3-4"></path></svg><span>Action queue</span>';
  button.onclick = () => openQueue(button);
  const weekly = [...nav.querySelectorAll('.nav-item')].find((item) => item.textContent.trim() === 'Weekly Review');
  weekly?.insertAdjacentElement('afterend', button);
};

const bindDecisionCards = () => {
  const { module, scenario: activeScenario, decisions } = getActiveDecisionSet();
  if (!['Funnel Health', 'Weekly Review'].includes(document.querySelector('.screen-header h1')?.textContent.trim())) return;
  document.querySelectorAll('.decision-rail .decision:not([hidden])').forEach((section, index) => {
    const decision = decisions[index];
    if (!decision) return;
    let button = section.querySelector('.action-draft-trigger');
    if (!button) {
      button = create('button', 'action-draft-trigger', 'Draft action');
      button.type = 'button';
      section.append(button);
    }
    button.setAttribute('aria-label', `Create local draft action for ${decision.title}`);
    button.onclick = () => openComposer(section, decision, activeScenario, module, button);
  });
};

let scheduled = false;
const scheduleEnhancements = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    addQueueNavigation();
    bindDecisionCards();
  });
};

window.addEventListener('rcr:period-change', (event) => {
  if (event.detail?.restored) {
    actions = [];
    activeFilter = 'All';
    persistActions();
    if (queueDialog.open) renderQueue('Built-in demo scenario restored; the local Action queue was cleared safely.');
  }
  scheduleEnhancements();
});
new MutationObserver(scheduleEnhancements).observe(document.getElementById('root'), { childList: true, subtree: true });
scheduleEnhancements();
