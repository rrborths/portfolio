const setUniqueLabel = (element, label) => {
  if (element && !element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
};

const enhanceNavigationState = () => {
  document.querySelectorAll('.nav-item').forEach((button) => {
    if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
};

const enhanceSourceToggleState = () => {
  document.querySelectorAll('button.text-action').forEach((button) => {
    const label = button.textContent.trim();
    if (!['View sources', 'Hide sources'].includes(label)) return;
    button.setAttribute('aria-expanded', String(label === 'Hide sources'));
  });
};

const enhanceTableSemantics = () => {
  document.querySelectorAll('table').forEach((table) => {
    table.querySelectorAll('thead th').forEach((header) => header.setAttribute('scope', 'col'));
  });

  document.querySelectorAll('.table-wrap table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')];
    if (!headers.some((header) => header.textContent.trim() === 'Next decision')) return;
    const inspectHeader = headers.at(-1);
    if (inspectHeader && inspectHeader.textContent.trim() !== 'Inspect') inspectHeader.textContent = 'Inspect';

    table.querySelectorAll('tbody tr').forEach((row) => {
      row.removeAttribute('role');
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-label');
      const role = row.querySelector('td strong')?.textContent.trim() || 'requisition';
      const id = row.querySelector('td small')?.textContent.trim();
      const cell = row.lastElementChild;
      if (!cell) return;
      cell.dataset.label = 'Inspect';
      let button = cell.querySelector('.row-select-control');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'row-select-control';
        while (cell.firstChild) button.append(cell.firstChild);
        cell.append(button);
      }
      button.setAttribute('aria-label', `Inspect decision detail for ${role}${id ? `, ${id}` : ''}`);
    });
  });
};

const labelEditableFields = () => {
  document.querySelectorAll('.intake-form .form-section').forEach((section) => {
    const heading = section.querySelector('h2')?.textContent.trim();
    if (heading) setUniqueLabel(section.querySelector('textarea'), heading);
  });

  document.querySelectorAll('.narrative-grid > div').forEach((section) => {
    const heading = section.querySelector('h3')?.textContent.trim();
    const field = section.querySelector('textarea');
    if (heading) {
      const label = `${heading} narrative`;
      setUniqueLabel(field, label);
    }
  });

  document.querySelectorAll('.weekly-table tbody tr').forEach((row) => {
    const functionName = row.querySelector('td strong')?.textContent.trim() || 'Total';
    const field = row.querySelector('textarea');
    const label = `${functionName} commentary`;
    setUniqueLabel(field, label);
  });

  document.querySelectorAll('.decision').forEach((decision) => {
    const title = decision.querySelector('h3')?.textContent.trim() || 'Decision';
    setUniqueLabel(decision.querySelector('select'), `${title} owner`);
    setUniqueLabel(decision.querySelector('input[type="date"]'), `${title} due date`);
  });
};

const ensureDisabledExplanation = (screenName, id, text, buttonNames) => {
  if (document.querySelector('.screen-header h1')?.textContent !== screenName) return;
  let explanation = document.getElementById(id);
  if (!explanation) {
    explanation = document.createElement('p');
    explanation.id = id;
    explanation.className = 'disabled-control-explanation';
    explanation.textContent = text;
    document.querySelector('.screen-header')?.insertAdjacentElement('afterend', explanation);
  }
  document.querySelectorAll('button').forEach((button) => {
    if (buttonNames.includes(button.textContent.trim())) button.setAttribute('aria-describedby', id);
  });
};

const explainDisabledControls = () => {
  ensureDisabledExplanation(
    'Intake & Kickoff',
    'intake-export-requirement',
    'Generate kickoff pack and Export draft pack unlock after “Approval to generate” is checked. Generation remains local; nothing is sent.',
    ['Generate kickoff pack', 'Export draft pack'],
  );
  ensureDisabledExplanation(
    'Weekly Review',
    'weekly-export-requirement',
    'Export review and Export CSV unlock after “Approve review for export” is checked. Approval enables local downloads only; nothing is sent or published.',
    ['Export review', 'Export CSV'],
  );
};

const addStatusText = () => {
  document.querySelectorAll('.weekly-table tbody tr').forEach((row) => {
    const cell = row.querySelector('td[data-label="SLA health"]');
    if (!cell || cell.querySelector('.qa-status-text')) return;
    const value = Number.parseFloat(cell.textContent);
    if (!Number.isFinite(value)) return;
    const status = value < 65 ? 'At risk' : value < 80 ? 'Watch' : 'Healthy';
    const label = document.createElement('small');
    label.className = 'qa-status-text';
    label.textContent = status;
    cell.append(label);
  });
};

let scheduled = false;
const applyFinalQaEnhancements = () => {
  scheduled = false;
  enhanceNavigationState();
  enhanceSourceToggleState();
  enhanceTableSemantics();
  labelEditableFields();
  explainDisabledControls();
  addStatusText();
};

const scheduleFinalQaEnhancements = () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(applyFinalQaEnhancements);
};

new MutationObserver(scheduleFinalQaEnhancements).observe(document.body, { childList: true, subtree: true });
scheduleFinalQaEnhancements();
