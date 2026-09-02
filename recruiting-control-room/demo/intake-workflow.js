const STAGES = [
  { id: 'intake', label: 'Intake' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'approval', label: 'Approval' },
  { id: 'pack', label: 'Pack' },
];

const requestedStage = STAGES.some(({ id }) => id === window.__intakeWorkflowRequestedStage)
  ? window.__intakeWorkflowRequestedStage
  : 'intake';

const workflowState = {
  active: 'intake',
  completed: new Set(),
  intake: null,
  calibration: null,
  approval: null,
  generatedAt: null,
  requestedStage,
  initializedOnce: false,
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const findControl = (root, label) => {
  const normalized = label.toLowerCase();
  return [...root.querySelectorAll('label, .field')]
    .find((candidate) => candidate.textContent.trim().toLowerCase() === normalized)
    ?.querySelector('input, select, textarea');
};

const valueOf = (control) => control?.value.trim() || '';

const getIntakeControls = (root) => ({
  role: findControl(root, 'Role'),
  requisition: findControl(root, 'Requisition ID'),
  functionName: findControl(root, 'Function'),
  outcome: root.querySelector('textarea[aria-label="Business outcome"]'),
  success: root.querySelector('textarea[aria-label="Success profile"]'),
  capabilities: root.querySelector('textarea[aria-label="Required capabilities"]'),
  interviewPlan: root.querySelector('textarea[aria-label="Interview plan"]'),
  targetStart: findControl(root, 'Target start date'),
  timeToFill: findControl(root, 'Target time to fill'),
});

const readIntake = (root) => {
  const controls = getIntakeControls(root);
  return Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, valueOf(control)]));
};

const stageIndex = (stage) => STAGES.findIndex(({ id }) => id === stage);
const isUnlocked = (stage) => stage === 'intake' || workflowState.completed.has(STAGES[stageIndex(stage) - 1].id);

const clearValidation = (root) => {
  root.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute('aria-invalid'));
  root.querySelectorAll('.workflow-invalid').forEach((control) => control.classList.remove('workflow-invalid'));
  root.querySelector('.workflow-error-summary')?.remove();
};

const showErrors = (root, errors) => {
  clearValidation(root);
  if (!errors.length) return;
  const summary = document.createElement('div');
  summary.className = 'workflow-error-summary';
  summary.setAttribute('role', 'alert');
  summary.tabIndex = -1;
  const heading = document.createElement('strong');
  heading.textContent = `Complete ${errors.length} required item${errors.length === 1 ? '' : 's'} before continuing:`;
  const list = document.createElement('ul');
  errors.forEach(({ label, control }) => {
    control?.setAttribute('aria-invalid', 'true');
    control?.classList.add('workflow-invalid');
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => control?.focus());
    item.append(button);
    list.append(item);
  });
  summary.append(heading, list);
  root.querySelector('.workflow-stage-status').insertAdjacentElement('afterend', summary);
  summary.focus();
};

const setStatus = (root, message, tone = 'neutral') => {
  const status = root.querySelector('.workflow-stage-status');
  if (!status) return;
  status.dataset.tone = tone;
  status.textContent = message;
};

const invalidateFrom = (stage) => {
  const start = stageIndex(stage);
  STAGES.slice(start).forEach(({ id }) => workflowState.completed.delete(id));
  workflowState.generatedAt = null;
};

const serializePanel = (panel) => Object.fromEntries(
  [...panel.querySelectorAll('input, textarea, select')].map((control) => [
    control.name,
    control.type === 'checkbox' ? control.checked : control.value,
  ]),
);

const hydratePanel = (panel, data) => {
  if (!data) return;
  Object.entries(data).forEach(([name, value]) => {
    const control = panel.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!control) return;
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = value;
  });
};

const defaultCalibration = (intake) => {
  const capabilities = intake.capabilities.split(/\n|·/).map((item) => item.trim()).filter(Boolean);
  const stages = intake.interviewPlan.split(/→|\n/).map((item) => item.trim()).filter(Boolean);
  const data = {
    mustHave: capabilities.slice(0, 3).join('\n'),
    learnable: capabilities.slice(3).join('\n') || 'Adjacent domain context can be learned with evidence of comparable systems ownership.',
    openQuestions: 'None identified. Reconfirm interview capacity and target-date feasibility at kickoff.',
    calibrationNotes: 'Use evidence tied to the role scorecard; do not infer candidate quality from proxy signals.',
    calibrationAcknowledged: false,
  };
  stages.forEach((stage, index) => {
    data[`interviewStage${index}`] = stage;
    data[`interviewPurpose${index}`] = index === 0 ? 'Confirm role motivation, core evidence, and mutual fit.' : `Evaluate evidence relevant to ${stage.toLowerCase()}.`;
    data[`interviewOwner${index}`] = index === 0 ? 'Recruiting owner' : index === stages.length - 1 ? 'Hiring leader' : 'Interview panel owner';
  });
  return { data, stages };
};

const createCalibrationPanel = (root) => {
  const panel = document.createElement('section');
  panel.id = 'workflow-panel-calibration';
  panel.className = 'workflow-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'workflow-tab-calibration');
  panel.innerHTML = `
    <div class="workflow-panel-heading">
      <div><p class="workflow-eyebrow">Stage 2 of 4</p><h2>Calibrate the role definition</h2></div>
      <p>Turn intake assumptions into explicit evaluation rules and named interview ownership.</p>
    </div>
    <section class="workflow-card" aria-labelledby="calibration-assumptions-heading">
      <h3 id="calibration-assumptions-heading">Summarized intake assumptions</h3>
      <dl class="workflow-summary" data-calibration-summary></dl>
    </section>
    <div class="workflow-two-column">
      <label class="workflow-field"><span>Must-have capabilities <strong aria-hidden="true">*</strong></span><textarea name="mustHave" rows="6" required></textarea><small>Evidence is required at entry.</small></label>
      <label class="workflow-field"><span>Learnable capabilities <strong aria-hidden="true">*</strong></span><textarea name="learnable" rows="6" required></textarea><small>May be developed after hire with support.</small></label>
    </div>
    <section class="workflow-card" aria-labelledby="interview-ownership-heading">
      <h3 id="interview-ownership-heading">Interview-stage purpose and ownership</h3>
      <p>Each stage must have one decision purpose and one accountable owner.</p>
      <div class="workflow-interview-list" data-interview-list></div>
    </section>
    <div class="workflow-two-column">
      <label class="workflow-field"><span>Open questions and identified conflicts <strong aria-hidden="true">*</strong></span><textarea name="openQuestions" rows="5" required></textarea></label>
      <label class="workflow-field"><span>Editable calibration notes</span><textarea name="calibrationNotes" rows="5"></textarea></label>
    </div>
    <label class="workflow-acknowledgement"><input type="checkbox" name="calibrationAcknowledged" /> <span><strong>Calibration complete</strong><small>I have reviewed the assumptions, capability distinctions, interview purposes, owners, and open questions.</small></span></label>
  `;
  root.querySelector('.intake-grid').insertAdjacentElement('beforebegin', panel);
  return panel;
};

const populateCalibration = (root, panel) => {
  const intake = workflowState.intake || readIntake(root);
  const summary = panel.querySelector('[data-calibration-summary]');
  summary.replaceChildren();
  [
    ['Business outcome', intake.outcome],
    ['Success profile', intake.success],
    ['Capacity and timing', `${intake.targetStart} target start · ${intake.timeToFill} days to fill`],
  ].forEach(([termText, descriptionText]) => {
    const group = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = termText;
    description.textContent = descriptionText;
    group.append(term, description);
    summary.append(group);
  });

  const { data: defaults, stages } = defaultCalibration(intake);
  const list = panel.querySelector('[data-interview-list]');
  list.replaceChildren();
  stages.forEach((stage, index) => {
    const row = document.createElement('div');
    row.className = 'workflow-interview-row';
    row.innerHTML = `
      <label class="workflow-field"><span>Stage</span><input name="interviewStage${index}" required /></label>
      <label class="workflow-field"><span>Decision purpose</span><input name="interviewPurpose${index}" required /></label>
      <label class="workflow-field"><span>Owner</span><input name="interviewOwner${index}" required /></label>
    `;
    row.querySelector(`[name="interviewStage${index}"]`).value = stage;
    list.append(row);
  });
  hydratePanel(panel, { ...defaults, ...(workflowState.calibration || {}) });
};

const createApprovalPanel = (root) => {
  const panel = document.createElement('section');
  panel.id = 'workflow-panel-approval';
  panel.className = 'workflow-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'workflow-tab-approval');
  panel.innerHTML = `
    <div class="workflow-panel-heading">
      <div><p class="workflow-eyebrow">Stage 3 of 4</p><h2>Review and approve the calibrated role</h2></div>
      <p>Approval authorizes local pack generation only. It does not approve an external action.</p>
    </div>
    <section class="workflow-card" aria-labelledby="approval-review-heading">
      <h3 id="approval-review-heading">Read-only calibrated role definition</h3>
      <dl class="workflow-summary" data-approval-summary></dl>
    </section>
    <div class="workflow-three-column">
      <label class="workflow-field"><span>Recruiting owner <strong aria-hidden="true">*</strong></span><input name="recruitingOwner" required /></label>
      <label class="workflow-field"><span>Hiring leader <strong aria-hidden="true">*</strong></span><input name="hiringLeader" required /></label>
      <label class="workflow-field"><span>Final approver <strong aria-hidden="true">*</strong></span><input name="finalApprover" required /></label>
    </div>
    <div class="workflow-four-column">
      <label class="workflow-field"><span>Target start <strong aria-hidden="true">*</strong></span><input type="date" name="approvalTargetStart" required /></label>
      <label class="workflow-field"><span>Time to fill (days) <strong aria-hidden="true">*</strong></span><input type="number" min="1" name="approvalTimeToFill" required /></label>
      <label class="workflow-field"><span>Feedback SLA (days) <strong aria-hidden="true">*</strong></span><input type="number" min="1" name="feedbackSla" required /></label>
      <label class="workflow-field"><span>Decision SLA (days) <strong aria-hidden="true">*</strong></span><input type="number" min="1" name="decisionSla" required /></label>
    </div>
    <section class="workflow-warning-card" aria-labelledby="warning-summary-heading">
      <h3 id="warning-summary-heading">Unresolved-warning summary</h3>
      <p data-warning-summary></p>
    </section>
    <label class="workflow-acknowledgement"><input type="checkbox" name="approvalAcknowledged" /> <span><strong>Approve this definition for local pack generation</strong><small>I am the named human approver and have reviewed the calibrated definition, owners, dates, SLAs, and warning summary. This does not write to an ATS, send a message, or take candidate action.</small></span></label>
  `;
  root.querySelector('.intake-grid').insertAdjacentElement('beforebegin', panel);
  return panel;
};

const populateApproval = (panel) => {
  const intake = workflowState.intake;
  const calibration = workflowState.calibration;
  const summary = panel.querySelector('[data-approval-summary]');
  summary.replaceChildren();
  [
    ['Role', `${intake.role} · ${intake.functionName}${intake.requisition ? ` · ${intake.requisition}` : ''}`],
    ['Outcome', intake.outcome],
    ['Must-have capabilities', calibration.mustHave],
    ['Learnable capabilities', calibration.learnable],
    ['Interview plan', intake.interviewPlan],
  ].forEach(([termText, descriptionText]) => {
    const group = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = termText;
    description.textContent = descriptionText;
    group.append(term, description);
    summary.append(group);
  });
  const questions = calibration.openQuestions.trim();
  panel.querySelector('[data-warning-summary]').textContent = /^none\b/i.test(questions)
    ? 'No unresolved warnings are recorded. Reconfirm assumptions if the role changes.'
    : `1 unresolved calibration item remains visible for human monitoring: ${questions}`;
  hydratePanel(panel, {
    recruitingOwner: 'Jordan Lee',
    hiringLeader: 'Alex Rivera',
    finalApprover: 'Alex Rivera',
    approvalTargetStart: intake.targetStart,
    approvalTimeToFill: intake.timeToFill,
    feedbackSla: '2',
    decisionSla: '2',
    approvalAcknowledged: false,
    ...(workflowState.approval || {}),
  });
};

const createPackPanel = (root) => {
  const panel = document.createElement('section');
  panel.id = 'workflow-panel-pack';
  panel.className = 'workflow-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'workflow-tab-pack');
  panel.innerHTML = `
    <div class="workflow-panel-heading">
      <div><p class="workflow-eyebrow">Stage 4 of 4</p><h2>Review-ready kickoff pack</h2></div>
      <p>Generated locally from the approved definition. Nothing has been sent, published, or written to another system.</p>
    </div>
    <div class="workflow-pack-status" role="status" data-pack-status></div>
    <div class="workflow-pack-grid" data-pack-content></div>
    <div class="workflow-export-actions" role="group" aria-label="Local export actions">
      <button type="button" class="button" data-export="markdown">Export local pack (.md)</button>
      <button type="button" class="button" data-export="csv">Export scorecard (.csv)</button>
    </div>
  `;
  root.querySelector('.intake-grid').insertAdjacentElement('beforebegin', panel);
  return panel;
};

const packModel = () => {
  const interviewRows = Object.keys(workflowState.calibration)
    .filter((key) => /^interviewStage\d+$/.test(key))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((key) => {
      const index = key.match(/\d+/)[0];
      return {
        stage: workflowState.calibration[key],
        purpose: workflowState.calibration[`interviewPurpose${index}`],
        owner: workflowState.calibration[`interviewOwner${index}`],
      };
    });
  return { ...workflowState.intake, ...workflowState.approval, ...workflowState.calibration, interviewRows };
};

const renderPack = (panel) => {
  const model = packModel();
  const content = panel.querySelector('[data-pack-content]');
  content.replaceChildren();
  const sections = [
    ['Role scorecard', [
      ['Business outcome', model.outcome],
      ['Success profile', model.success],
      ['Must-have', model.mustHave],
      ['Learnable', model.learnable],
    ]],
    ['Kickoff agenda', [
      ['1', 'Confirm business outcome and success profile'],
      ['2', 'Review must-have versus learnable capabilities'],
      ['3', 'Confirm interview purposes, owners, dates, and SLAs'],
      ['4', 'Resolve or monitor open questions and conflicts'],
    ]],
    ['Interview plan', model.interviewRows.map((row) => [row.stage, `${row.purpose} Owner: ${row.owner}`])],
    ['Decision owners', [
      ['Recruiting owner', model.recruitingOwner],
      ['Hiring leader', model.hiringLeader],
      ['Final approver', model.finalApprover],
    ]],
    ['SLA commitments', [
      ['Target start', model.approvalTargetStart],
      ['Time to fill', `${model.approvalTimeToFill} days`],
      ['Interview feedback', `${model.feedbackSla} business days`],
      ['Final decision', `${model.decisionSla} business days`],
    ]],
  ];
  sections.forEach(([headingText, rows]) => {
    const section = document.createElement('section');
    section.className = 'workflow-card workflow-pack-card';
    const heading = document.createElement('h3');
    heading.textContent = headingText;
    const list = document.createElement('dl');
    list.className = 'workflow-summary';
    rows.forEach(([termText, descriptionText]) => {
      const group = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = termText;
      description.textContent = descriptionText;
      group.append(term, description);
      list.append(group);
    });
    section.append(heading, list);
    content.append(section);
  });
  const generatedAt = workflowState.generatedAt || new Date();
  workflowState.generatedAt = generatedAt;
  panel.querySelector('[data-pack-status]').textContent = `Local pack generated ${generatedAt.toLocaleString()} · Human-approved synthetic demonstration`;
};

const downloadText = (filename, type, text) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const exportPack = (format) => {
  const model = packModel();
  if (format === 'csv') {
    const csv = [
      ['Dimension', 'Approved definition'],
      ['Business outcome', model.outcome],
      ['Success profile', model.success],
      ['Must-have capabilities', model.mustHave],
      ['Learnable capabilities', model.learnable],
    ].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    downloadText('synthetic-role-scorecard.csv', 'text/csv;charset=utf-8', csv);
    return;
  }
  const markdown = `# ${model.role} — approved kickoff pack\n\n> Synthetic, local-only portfolio artifact. No ATS write, message, approval, or candidate action occurred.\n\n## Role scorecard\n\n**Business outcome:** ${model.outcome}\n\n**Success profile:** ${model.success}\n\n**Must-have capabilities**\n${model.mustHave.split('\n').map((item) => `- ${item}`).join('\n')}\n\n**Learnable capabilities**\n${model.learnable.split('\n').map((item) => `- ${item}`).join('\n')}\n\n## Kickoff agenda\n\n1. Confirm business outcome and success profile\n2. Review capability distinctions\n3. Confirm interview purposes, owners, dates, and SLAs\n4. Resolve or monitor open questions and conflicts\n\n## Interview plan\n\n${model.interviewRows.map((row) => `- **${row.stage}:** ${row.purpose} Owner: ${row.owner}.`).join('\n')}\n\n## Decision owners\n\n- Recruiting owner: ${model.recruitingOwner}\n- Hiring leader: ${model.hiringLeader}\n- Final approver: ${model.finalApprover}\n\n## SLA commitments\n\n- Target start: ${model.approvalTargetStart}\n- Time to fill: ${model.approvalTimeToFill} days\n- Interview feedback: ${model.feedbackSla} business days\n- Final decision: ${model.decisionSla} business days\n`;
  downloadText('synthetic-approved-kickoff-pack.md', 'text/markdown;charset=utf-8', markdown);
};

const validateRequired = (controls, acknowledgement) => {
  const errors = controls.filter(({ control }) => !valueOf(control));
  controls.forEach(({ control }) => {
    if (control?.type === 'number' && Number(control.value) < 1) errors.push({ label: `${control.closest('label')?.querySelector('span')?.textContent.trim() || 'Numeric value'} must be at least 1`, control });
  });
  if (acknowledgement && !acknowledgement.control.checked) errors.push(acknowledgement);
  return [...new Map(errors.map((error) => [error.control, error])).values()];
};

const validateIntake = (root) => {
  const controls = getIntakeControls(root);
  Object.values(controls).forEach((control) => control?.setAttribute('required', ''));
  return validateRequired([
    ['Role', controls.role], ['Function', controls.functionName], ['Business outcome', controls.outcome],
    ['Success profile', controls.success], ['Required capabilities', controls.capabilities],
    ['Interview plan', controls.interviewPlan], ['Target start date', controls.targetStart],
    ['Target time to fill', controls.timeToFill],
  ].map(([label, control]) => ({ label, control })));
};

const validatePanel = (panel, acknowledgementName, acknowledgementLabel) => {
  const required = [...panel.querySelectorAll('[required]')].map((control) => ({
    label: control.closest('label')?.querySelector('span')?.textContent.replace('*', '').trim() || control.name,
    control,
  }));
  return validateRequired(required, {
    label: acknowledgementLabel,
    control: panel.querySelector(`[name="${acknowledgementName}"]`),
  });
};

const renderStepper = (root) => {
  root.querySelectorAll('[data-workflow-stage]').forEach((tab) => {
    const stage = tab.dataset.workflowStage;
    const current = stage === workflowState.active;
    const completed = workflowState.completed.has(stage);
    const locked = !isUnlocked(stage);
    tab.classList.toggle('current', current);
    tab.classList.toggle('completed', completed);
    tab.classList.toggle('locked', locked);
    tab.dataset.state = current ? 'current' : completed ? 'completed' : locked ? 'locked' : 'available';
    tab.setAttribute('aria-selected', String(current));
    tab.setAttribute('tabindex', current ? '0' : '-1');
    tab.setAttribute('aria-disabled', String(locked));
    if (current) tab.setAttribute('aria-current', 'step');
    else tab.removeAttribute('aria-current');
    const status = tab.querySelector('.workflow-step-state');
    status.textContent = current ? 'Current' : completed ? 'Completed' : locked ? 'Locked' : 'Available';
  });
};

const renderActions = (root) => {
  const actions = root.querySelector('.workflow-actions');
  actions.replaceChildren();
  const index = stageIndex(workflowState.active);
  if (index > 0) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'button';
    back.textContent = `Back to ${STAGES[index - 1].label}`;
    back.addEventListener('click', () => switchStage(root, STAGES[index - 1].id));
    actions.append(back);
  }
  if (workflowState.active === 'pack') {
    const regenerate = document.createElement('button');
    regenerate.type = 'button';
    regenerate.className = 'button primary';
    regenerate.textContent = 'Regenerate local pack';
    regenerate.addEventListener('click', () => {
      workflowState.generatedAt = new Date();
      renderPack(root.querySelector('#workflow-panel-pack'));
      setStatus(root, 'Pack regenerated locally from the approved workflow state.', 'success');
    });
    actions.append(regenerate);
    return;
  }
  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'button primary';
  primary.textContent = workflowState.active === 'intake'
    ? 'Save draft & validate'
    : workflowState.active === 'calibration'
      ? 'Mark calibration complete'
      : 'Approve local pack';
  primary.addEventListener('click', () => completeStage(root));
  actions.append(primary);
};

const renderStage = (root) => {
  clearValidation(root);
  renderStepper(root);
  renderActions(root);
  root.querySelector('.intake-grid').hidden = workflowState.active !== 'intake';
  root.querySelectorAll('.workflow-panel').forEach((panel) => {
    const active = panel.id === `workflow-panel-${workflowState.active}`;
    panel.hidden = !active;
    panel.setAttribute('tabindex', active ? '-1' : '-1');
  });
  if (workflowState.active === 'calibration') populateCalibration(root, root.querySelector('#workflow-panel-calibration'));
  if (workflowState.active === 'approval') populateApproval(root.querySelector('#workflow-panel-approval'));
  if (workflowState.active === 'pack') renderPack(root.querySelector('#workflow-panel-pack'));
  history.replaceState(null, '', `${location.pathname}${location.search}#intake/${workflowState.active}`);
};

const switchStage = (root, stage, options = {}) => {
  if (!isUnlocked(stage)) {
    const prerequisite = STAGES[stageIndex(stage) - 1].label;
    setStatus(root, `${stage[0].toUpperCase()}${stage.slice(1)} is locked. Complete ${prerequisite} first.`, 'warning');
    root.querySelector(`[data-workflow-stage="${stage}"]`)?.focus();
    return false;
  }
  workflowState.active = stage;
  renderStage(root);
  setStatus(root, options.message || `${STAGES[stageIndex(stage)].label} stage is active.`, options.tone || 'neutral');
  if (options.focus !== false) {
    (stage === 'intake' ? root.querySelector('.intake-form') : root.querySelector(`#workflow-panel-${stage}`))?.focus({ preventScroll: true });
  }
  return true;
};

const completeStage = (root) => {
  const stage = workflowState.active;
  let errors = [];
  if (stage === 'intake') {
    errors = validateIntake(root);
    if (!errors.length) workflowState.intake = readIntake(root);
  } else if (stage === 'calibration') {
    const panel = root.querySelector('#workflow-panel-calibration');
    errors = validatePanel(panel, 'calibrationAcknowledged', 'Confirm “Calibration complete”');
    if (!errors.length) workflowState.calibration = serializePanel(panel);
  } else if (stage === 'approval') {
    const panel = root.querySelector('#workflow-panel-approval');
    errors = validatePanel(panel, 'approvalAcknowledged', 'Provide explicit human approval');
    if (!errors.length) workflowState.approval = serializePanel(panel);
  }
  if (errors.length) {
    showErrors(root, errors);
    setStatus(root, `${STAGES[stageIndex(stage)].label} is incomplete. Review the required items below.`, 'error');
    return;
  }
  workflowState.completed.add(stage);
  const next = STAGES[stageIndex(stage) + 1]?.id;
  if (next) switchStage(root, next, { message: `${STAGES[stageIndex(stage)].label} completed. ${STAGES[stageIndex(next)].label} is now available.`, tone: 'success' });
};

const buildStepper = (steps) => {
  steps.setAttribute('role', 'tablist');
  steps.setAttribute('aria-label', 'Role kickoff workflow');
  steps.classList.add('workflow-stepper');
  steps.replaceChildren();
  STAGES.forEach(({ id, label }, index) => {
    const item = document.createElement('li');
    item.setAttribute('role', 'presentation');
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `workflow-tab-${id}`;
    button.className = 'workflow-step';
    button.dataset.workflowStage = id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', id === 'intake' ? 'workflow-intake-panel' : `workflow-panel-${id}`);
    button.innerHTML = `<span class="workflow-step-number" aria-hidden="true">${index + 1}</span><span class="workflow-step-copy"><strong>${label}</strong><small class="workflow-step-state"></small></span>`;
    item.append(button);
    steps.append(item);
  });
};

const enhanceIntakeWorkflow = async () => {
  const root = document.querySelector('.intake-screen');
  if (!root || root.dataset.workflowEnhanced === 'true') return;
  const steps = root.querySelector('.steps');
  const grid = root.querySelector('.intake-grid');
  const form = root.querySelector('.intake-form');
  const headerActions = root.querySelector('.header-actions');
  if (!steps || !grid || !form || !headerActions) return;

  root.dataset.workflowEnhanced = 'true';
  grid.id = 'workflow-intake-panel';
  grid.setAttribute('role', 'tabpanel');
  grid.setAttribute('aria-labelledby', 'workflow-tab-intake');
  root.querySelector('.kickoff-preview')?.classList.add('workflow-original-hidden');
  form.querySelector('.approval')?.classList.add('workflow-original-hidden');
  headerActions.querySelectorAll(':scope > button').forEach((button) => button.classList.add('workflow-original-hidden'));
  const intakeLabels = {
    role: 'Role',
    requisition: 'Requisition ID',
    functionName: 'Function',
    outcome: 'Business outcome',
    success: 'Success profile',
    capabilities: 'Required capabilities',
    interviewPlan: 'Interview plan',
    targetStart: 'Target start date',
    timeToFill: 'Target time to fill',
  };
  Object.entries(getIntakeControls(root)).forEach(([key, control]) => control?.setAttribute('aria-label', intakeLabels[key]));
  const legacyExplanation = root.querySelector('#intake-export-requirement');
  if (legacyExplanation) {
    legacyExplanation.textContent = 'Complete each human-reviewed stage in order to unlock the local kickoff pack. Completed stages remain available for review and editing.';
  }

  buildStepper(steps);
  const status = document.createElement('p');
  status.className = 'workflow-stage-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  steps.insertAdjacentElement('afterend', status);
  const actions = document.createElement('div');
  actions.className = 'workflow-actions';
  headerActions.append(actions);

  createCalibrationPanel(root);
  createApprovalPanel(root);
  createPackPanel(root);

  root.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-workflow-stage]');
    if (tab) switchStage(root, tab.dataset.workflowStage);
    const exportButton = event.target.closest('[data-export]');
    if (exportButton) exportPack(exportButton.dataset.export);
  });

  steps.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    const tabs = [...steps.querySelectorAll('[role="tab"]')];
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      switchStage(root, tabs[currentIndex].dataset.workflowStage);
      return;
    }
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
  });

  root.addEventListener('input', (event) => {
    const panel = event.target.closest('.workflow-panel');
    const stage = panel?.id.replace('workflow-panel-', '') || (event.target.closest('.intake-form') ? 'intake' : null);
    if (!stage || stage === 'pack') return;
    if (stage === 'calibration') workflowState.calibration = serializePanel(panel);
    if (stage === 'approval') workflowState.approval = serializePanel(panel);
    if (workflowState.completed.has(stage)) {
      invalidateFrom(stage);
      renderStepper(root);
      setStatus(root, `${STAGES[stageIndex(stage)].label} changed. Validate it again before progressing.`, 'warning');
    }
  });
  root.addEventListener('change', (event) => event.target.dispatchEvent(new Event('input', { bubbles: true })));

  await nextFrame();
  const initialStage = workflowState.initializedOnce ? workflowState.active : workflowState.requestedStage;
  workflowState.initializedOnce = true;
  workflowState.requestedStage = 'intake';
  if (!switchStage(root, initialStage, { focus: false })) switchStage(root, 'intake', { focus: false, message: `The requested ${initialStage} stage is locked until required prior stages are complete.`, tone: 'warning' });
};

let scheduled = false;
const scheduleEnhancement = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceIntakeWorkflow();
  });
};

new MutationObserver(scheduleEnhancement).observe(document.body, { childList: true, subtree: true });
scheduleEnhancement();
