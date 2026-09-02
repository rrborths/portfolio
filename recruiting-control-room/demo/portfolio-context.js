const context = {
  problem: 'Recruiting data is fragmented. Operating reviews too often describe activity without producing decisions.',
  audience: 'TA leaders, recruiting operations teams, recruiters, and hiring leaders.',
  contribution: 'Ryan Borths designed the TA workflow, operating model, decision logic, governance, and human-review boundaries.',
  outcome: 'Faster, better-evidenced recruiting decisions—not autonomous hiring decisions.',
  demonstrates: [
    'Structured intake with explicit assumptions and commitments',
    'Approval-gated artifact generation with named human review',
    'Funnel diagnosis that connects signals to next decisions',
    'Weekly executive review focused on decisions and owners',
    'Browser-local action drafting with a no-send production handoff preview',
    'Source traceability from evidence to recommendation',
  ],
};

const INTRODUCTION_SEEN_KEY = 'rcr:portfolio-introduction-seen:v1';

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

const makeContextItem = (label, value) => {
  const item = makeElement('div', 'portfolio-context-item');
  const term = makeElement('dt', null, label);
  const description = makeElement('dd', null, value);
  item.append(term, description);
  return item;
};

const buildContextLayer = () => {
  if (document.querySelector('[data-portfolio-context]')) return;

  const trigger = makeElement('button', 'portfolio-context-trigger', 'About this build');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.dataset.portfolioContext = 'trigger';

  const dialog = makeElement('dialog', 'portfolio-context-dialog');
  dialog.id = 'portfolio-context-dialog';
  dialog.setAttribute('aria-labelledby', 'portfolio-context-title');
  dialog.setAttribute('aria-describedby', 'portfolio-context-summary');
  dialog.dataset.portfolioContext = 'dialog';

  const header = makeElement('header', 'portfolio-context-header');
  const headingGroup = makeElement('div');
  const eyebrow = makeElement('p', 'portfolio-context-eyebrow', 'Portfolio context · Synthetic prototype');
  const title = makeElement('h2', null, 'About this build');
  title.id = 'portfolio-context-title';
  const close = makeElement('button', 'portfolio-context-close', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close About this build');
  headingGroup.append(eyebrow, title);
  header.append(headingGroup, close);

  const summary = makeElement('p', 'portfolio-context-summary', context.problem);
  summary.id = 'portfolio-context-summary';

  const details = makeElement('dl', 'portfolio-context-details');
  details.append(
    makeContextItem('Built for', context.audience),
    makeContextItem('Ryan’s contribution', context.contribution),
    makeContextItem('Intended outcome', context.outcome),
  );

  const demonstrates = makeElement('section', 'portfolio-context-demonstrates');
  const demonstratesTitle = makeElement('h3', null, 'What this demonstrates');
  const list = makeElement('ul');
  context.demonstrates.forEach((item) => list.append(makeElement('li', null, item)));
  demonstrates.append(demonstratesTitle, list);

  const proof = makeElement('p', 'portfolio-context-proof', 'Proof of Head/Director-level TA leadership, TA Operations systems thinking, practical AI fluency, and governance.');
  const dataNote = makeElement('p', 'portfolio-context-data-note');
  const dataLabel = makeElement('strong', null, 'Synthetic data:');
  dataNote.append(dataLabel, document.createTextNode(' Every person, role, metric, and date is synthetic. Human review remains required; the demo does not rank, reject, or select candidates.'));

  const footer = makeElement('footer', 'portfolio-context-footer');
  const caseStudyLink = makeElement('a', 'portfolio-context-link', 'View the full portfolio case study →');
  caseStudyLink.href = '../index.html#case-study';
  caseStudyLink.dataset.linkPlaceholder = 'portfolio-case-study';
  const continueButton = makeElement('button', 'portfolio-context-continue', 'Continue to the demo');
  continueButton.type = 'button';
  footer.append(caseStudyLink, continueButton);

  dialog.append(header, summary, details, demonstrates, proof, dataNote, footer);
  document.body.append(trigger, dialog);

  const openDialog = () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };
  const closeDialog = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  trigger.addEventListener('click', openDialog);
  close.addEventListener('click', closeDialog);
  continueButton.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled])')];
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
  dialog.addEventListener('close', () => trigger.focus());

  let introductionSeen = false;
  try {
    introductionSeen = sessionStorage.getItem(INTRODUCTION_SEEN_KEY) === 'true';
    if (!introductionSeen) sessionStorage.setItem(INTRODUCTION_SEEN_KEY, 'true');
  } catch {
    introductionSeen = false;
  }
  if (!introductionSeen) openDialog();
};

buildContextLayer();
