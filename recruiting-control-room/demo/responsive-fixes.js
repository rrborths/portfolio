const enhanceTable = (wrap) => {
  if (wrap.dataset.responsiveEnhanced === 'true') return;

  const table = wrap.querySelector('table');
  if (!table) return;

  wrap.dataset.responsiveEnhanced = 'true';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');

  const headers = [...table.querySelectorAll('thead th')].map((header) => header.textContent.trim());
  const tableName = headers.includes('Next decision') ? 'Requisition control table' : 'Performance by function table';
  wrap.setAttribute('aria-label', `${tableName}. Scroll horizontally for more columns on medium screens.`);

  table.querySelectorAll('tbody tr').forEach((row) => {
    row.querySelectorAll('td').forEach((cell, index) => cell.dataset.label = headers[index] || '');

    if (headers.includes('Next decision')) {
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Select ${row.querySelector('td')?.innerText.trim() || 'requisition'}`);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          row.click();
        }
      });
    }
  });

  const hint = document.createElement('div');
  hint.className = 'table-scroll-hint';
  hint.setAttribute('aria-hidden', 'true');
  wrap.parentElement.insertBefore(hint, wrap);

  const updateHint = () => {
    const isCardLayout = window.matchMedia('(max-width: 640px)').matches;
    const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    const hasOverflow = !isCardLayout && maxScroll > 2;
    hint.dataset.overflow = String(hasOverflow);
    hint.textContent = wrap.scrollLeft >= maxScroll - 2 ? 'End of table' : 'Scroll for more columns →';
  };

  wrap.addEventListener('scroll', updateHint, { passive: true });
  new ResizeObserver(updateHint).observe(wrap);
  updateHint();
};

const enhanceTables = () => document.querySelectorAll('.table-wrap').forEach(enhanceTable);

new MutationObserver(enhanceTables).observe(document.getElementById('root'), { childList: true, subtree: true });
enhanceTables();
