const state = { config: null, history: [], mode: localStorage.getItem('lighthouse-mode') || 'normal', activeRow: null, pollTimers: new Map(), busy: false };
const el = id => document.getElementById(id);
const accountSelect = el('account-select');
const accountPicker = el('account-picker');
const accountPickerButton = el('account-picker-button');
const accountPickerValue = el('account-picker-value');
const accountPickerMenu = el('account-picker-list');
let activeAccountOption = 0;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('The local server returned an unreadable response.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.status = response.status;
    error.resetAt = data.resetAt;
    throw error;
  }
  return data;
}

function selectedAccount() { return state.config?.accounts.find(account => account.id === accountSelect.value); }
function renderAccountPicker() {
  const options = [...accountSelect.options];
  accountPickerButton.disabled = options.length === 0;
  accountPickerValue.textContent = options.find(option => option.value === accountSelect.value)?.textContent || 'No team accounts available';
  accountPickerMenu.replaceChildren();
  options.forEach((option, index) => {
    const item = document.createElement('div');
    item.id = `account-picker-option-${index}`;
    item.className = 'account-picker-option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.value === accountSelect.value));
    item.setAttribute('aria-posinset', String(index + 1));
    item.setAttribute('aria-setsize', String(options.length));
    item.dataset.index = String(index);
    const label = document.createElement('span');
    label.textContent = option.textContent;
    const check = document.createElement('span');
    check.className = 'account-picker-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = option.value === accountSelect.value ? '✓' : '';
    item.append(label, check);
    accountPickerMenu.append(item);
  });
  if (accountPickerButton.getAttribute('aria-expanded') === 'true' && options.length) {
    const selectedIndex = options.findIndex(option => option.value === accountSelect.value);
    setActiveAccountOption(selectedIndex >= 0 ? selectedIndex : 0);
  }
}
function setActiveAccountOption(index) {
  const options = [...accountPickerMenu.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  activeAccountOption = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => { option.dataset.active = String(optionIndex === activeAccountOption); });
  accountPickerButton.setAttribute('aria-activedescendant', options[activeAccountOption].id);
  options[activeAccountOption].scrollIntoView({ block: 'nearest' });
}
function positionAccountPickerMenu() {
  if (!accountPickerMenu.classList.contains('is-portaled')) return;
  const anchor = accountPickerButton.getBoundingClientRect();
  const edge = 8;
  const gap = 8;
  const width = Math.min(anchor.width, window.innerWidth - edge * 2);
  const maxHeight = Math.min(240, window.innerHeight * .4);
  const spaceBelow = Math.max(0, window.innerHeight - anchor.bottom - gap - edge);
  const spaceAbove = Math.max(0, anchor.top - gap - edge);
  const opensAbove = spaceBelow < Math.min(maxHeight, 140) && spaceAbove > spaceBelow;
  const availableHeight = opensAbove ? spaceAbove : spaceBelow;
  const left = Math.min(Math.max(edge, anchor.left), window.innerWidth - width - edge);

  accountPickerMenu.style.left = `${left}px`;
  accountPickerMenu.style.width = `${width}px`;
  accountPickerMenu.style.top = opensAbove ? 'auto' : `${anchor.bottom + gap}px`;
  accountPickerMenu.style.bottom = opensAbove ? `${window.innerHeight - anchor.top + gap}px` : 'auto';
  accountPickerMenu.style.maxHeight = `${Math.max(48, Math.min(maxHeight, availableHeight))}px`;
}
function openAccountPicker(index) {
  if (accountPickerButton.disabled) return;
  accountPickerMenu.classList.add('is-portaled');
  document.body.append(accountPickerMenu);
  accountPickerMenu.hidden = false;
  positionAccountPickerMenu();
  window.addEventListener('resize', positionAccountPickerMenu);
  document.addEventListener('scroll', positionAccountPickerMenu, true);
  accountPickerButton.setAttribute('aria-expanded', 'true');
  const selectedIndex = [...accountSelect.options].findIndex(option => option.value === accountSelect.value);
  setActiveAccountOption(index ?? (selectedIndex >= 0 ? selectedIndex : 0));
}
function closeAccountPicker(returnFocus = false) {
  accountPickerMenu.hidden = true;
  window.removeEventListener('resize', positionAccountPickerMenu);
  document.removeEventListener('scroll', positionAccountPickerMenu, true);
  accountPickerMenu.classList.remove('is-portaled');
  accountPickerMenu.removeAttribute('style');
  accountPicker.append(accountPickerMenu);
  accountPickerButton.setAttribute('aria-expanded', 'false');
  accountPickerButton.removeAttribute('aria-activedescendant');
  accountPickerMenu.querySelectorAll('[role="option"]').forEach(option => { delete option.dataset.active; });
  if (returnFocus) accountPickerButton.focus();
}
function chooseAccount(value) {
  if (!value || value === accountSelect.value) {
    closeAccountPicker(true);
    return;
  }
  accountSelect.value = value;
  accountSelect.dispatchEvent(new Event('change', { bubbles: true }));
  closeAccountPicker(true);
}
function initAccountPicker() {
  accountPickerButton.addEventListener('click', () => {
    if (accountPickerButton.getAttribute('aria-expanded') === 'true') closeAccountPicker();
    else openAccountPicker();
  });
  accountPickerButton.addEventListener('keydown', event => {
    const expanded = accountPickerButton.getAttribute('aria-expanded') === 'true';
    const selectedIndex = [...accountSelect.options].findIndex(option => option.value === accountSelect.value);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (expanded) setActiveAccountOption(activeAccountOption + 1);
        else openAccountPicker(selectedIndex >= 0 ? selectedIndex : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (expanded) setActiveAccountOption(activeAccountOption - 1);
        else openAccountPicker(selectedIndex >= 0 ? selectedIndex : accountSelect.options.length - 1);
        break;
      case 'Home':
        event.preventDefault();
        if (!expanded) openAccountPicker(0);
        else setActiveAccountOption(0);
        break;
      case 'End':
        event.preventDefault();
        if (!expanded) openAccountPicker(accountSelect.options.length - 1);
        else setActiveAccountOption(accountSelect.options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (expanded) chooseAccount(accountSelect.options[activeAccountOption]?.value);
        else openAccountPicker();
        break;
      case 'Escape':
        if (expanded) { event.preventDefault(); closeAccountPicker(); }
        break;
      case 'Tab':
        closeAccountPicker();
        break;
    }
  });
  accountPickerMenu.addEventListener('click', event => {
    const option = event.target.closest('[role="option"]');
    if (option) chooseAccount(accountSelect.options[Number(option.dataset.index)]?.value);
  });
  accountPickerMenu.addEventListener('pointerover', event => {
    const option = event.target.closest('[role="option"]');
    if (option) setActiveAccountOption(Number(option.dataset.index));
  });
  document.addEventListener('pointerdown', event => {
    if (!accountPicker.contains(event.target) && !accountPickerMenu.contains(event.target)) closeAccountPicker();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && accountPickerButton.getAttribute('aria-expanded') === 'true') closeAccountPicker();
  });
}
function setMode(mode) {
  state.mode = mode;
  localStorage.setItem('lighthouse-mode', mode);
  el('normal-mode').classList.toggle('is-active', mode === 'normal');
  el('research-mode').classList.toggle('is-active', mode === 'research');
  el('normal-mode').setAttribute('aria-pressed', String(mode === 'normal'));
  el('research-mode').setAttribute('aria-pressed', String(mode === 'research'));
  el('mode-hint').textContent = mode === 'normal' ? 'Direct excerpts from up to three official sources.' : 'A deeper TinyFish report with citations. Usually takes several minutes.';
  el('ask-label').textContent = mode === 'normal' ? 'Find source excerpts' : 'Start Research';
  el('form-note').textContent = mode === 'normal' ? 'No AI-written answer in Normal mode. Read the source passages and decide what they support.' : 'Research returns a TinyFish-generated report. Verify its citations before relying on it.';
  renderLimit();
  updateButton();
}

function renderAccounts() {
  const saved = localStorage.getItem('lighthouse-account');
  accountSelect.replaceChildren();
  for (const account of state.config?.accounts || []) {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.label;
    accountSelect.append(option);
  }
  const choice = state.config?.accounts.find(account => account.id === saved);
  if (choice) accountSelect.value = choice.id;
  else if (state.config?.accounts.length) accountSelect.value = state.config.accounts[0].id;
  localStorage.setItem('lighthouse-account', accountSelect.value || '');
  renderAccountPicker();
  renderLimit();
  updateButton();
}

function renderLimit() {
  const account = selectedAccount();
  const heading = el('limit-heading');
  const details = el('limit-details');
  const scope = el('limit-scope');
  const icon = document.querySelector('.limit-icon');
  if (!account) {
    heading.textContent = 'Add team API keys to begin';
    details.textContent = 'Copy .env.example to .env and add the four TinyFish keys on the local server.';
    scope.textContent = 'Keys stay server-side; they are never sent to the browser.';
    icon.textContent = '⌁';
    return;
  }
  if (state.mode === 'normal') {
    const searchLimit = state.config.limits.searchPerDay;
    const fetchLimit = state.config.limits.fetchUrlsPerDay;
    heading.textContent = 'Daily limits for Normal';
    details.replaceChildren();
    const first = document.createElement('span');
    first.className = 'limit-stat';
    first.textContent = `up to ${formatNumber(searchLimit)} Search calls / key`;
    const firstBold = document.createElement('b'); firstBold.textContent = `up to ${formatNumber(searchLimit)}`;
    first.replaceChildren(firstBold, document.createTextNode(' Search calls / key / day'));
    const second = document.createElement('span');
    second.className = 'limit-stat';
    const secondBold = document.createElement('b'); secondBold.textContent = formatNumber(fetchLimit);
    second.append(secondBold, document.createTextNode(' successfully fetched URLs / key / day'));
    details.append(first, second);
    scope.textContent = `This install has recorded ${formatNumber(account.searchRequests)} Search calls and ${formatNumber(account.fetchedUrls)} fetched URLs for ${account.label} today. Free allowances reset at 00:00 UTC; usage from elsewhere is not included.`;
    icon.textContent = '↗';
  } else {
    const limit = state.config.limits.researchRunsPerDay;
    const remaining = Math.max(0, limit - account.localResearchUsed);
    heading.textContent = 'Daily Research beta allowance';
    details.replaceChildren();
    const stat = document.createElement('span');
    stat.className = 'limit-stat';
    stat.innerHTML = `<b>${remaining} of ${limit}</b> starts left here today`;
    details.append(stat);
    scope.textContent = `Local count for ${account.label}: ${account.localResearchUsed} started here today. TinyFish defaults to 5 starts per Pacific day; other usage is not visible here.`;
    icon.textContent = '✳';
  }
}

function formatNumber(value) { return new Intl.NumberFormat('en-US').format(Number(value) || 0); }
function updateButton() {
  const button = el('ask-button');
  const text = el('question').value.trim();
  const hasAccount = Boolean(selectedAccount());
  const localResearchLimitReached = state.mode === 'research' && hasAccount && selectedAccount().localResearchUsed >= state.config.limits.researchRunsPerDay;
  button.disabled = state.busy || !hasAccount || text.length < 10 || localResearchLimitReached;
  button.classList.toggle('is-busy', state.busy);
  if (state.busy) el('ask-label').textContent = 'Working…';
  else el('ask-label').textContent = localResearchLimitReached ? 'Daily limit reached' : state.mode === 'normal' ? 'Find source excerpts' : 'Start Research';
}

function showError(message) {
  const box = el('error-banner');
  box.textContent = message;
  box.hidden = false;
}
function clearError() { el('error-banner').hidden = true; el('error-banner').textContent = ''; }
function setBusy(value) { state.busy = value; updateButton(); }

function addText(parent, tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text ?? '';
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url : null; }
  catch { return null; }
}

function renderResult(row) {
  state.activeRow = row;
  const section = el('result-section');
  const content = el('result-content');
  content.replaceChildren();
  section.hidden = false;
  el('result-title').textContent = row.mode === 'normal' ? 'Source excerpts' : 'Research report';
  const question = document.createElement('p');
  question.className = 'result-question';
  question.textContent = row.question;
  content.append(question);
  if (row.status === 'UNKNOWN') {
    const warning = addText(content, 'div', 'The start outcome is unclear. Do not submit this question again. Check this account’s TinyFish run history before retrying.', 'state-message state-warning');
    warning.setAttribute('role', 'status');
    return;
  }
  if (row.status === 'REJECTED' || ['FAILED', 'TIMED_OUT'].includes(row.status)) {
    addText(content, 'div', row.error || `This run ended with status ${row.status}.`, 'state-message state-error');
    return;
  }
  if (row.mode === 'research' && ['STARTING', 'QUEUED', 'RUNNING'].includes(row.status)) {
    const progress = document.createElement('div');
    progress.className = 'research-progress';
    progress.innerHTML = '<span class="progress-orbit"><i></i></span><div><strong>Research is underway</strong><p>TinyFish is gathering and reviewing sources. This can take several minutes. You can leave this page; Lighthouse saves the run locally.</p></div>';
    content.append(progress);
    if (Number(row.result?.iterations) > 0) addText(content, 'p', `${row.result.iterations} research iterations complete`, 'iteration-count');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'cancel-button'; cancel.textContent = 'Cancel run';
    cancel.addEventListener('click', () => cancelRun(row.id));
    content.append(cancel);
    return;
  }
  if (row.status === 'CANCELLED') {
    addText(content, 'div', 'This Research run was cancelled.', 'state-message');
    return;
  }
  if (row.mode === 'normal') {
    const result = row.result || {};
    addText(content, 'p', result.message || 'Matching passages from fetched source pages.', 'result-disclaimer');
    if (!result.sources?.length) {
      addText(content, 'div', result.message || 'No matching institutional source was found.', 'state-message');
    }
    for (const source of result.sources || []) {
      const card = document.createElement('article'); card.className = 'source-card';
      const heading = document.createElement('div'); heading.className = 'source-card-heading';
      const safe = safeLink(source.url);
      if (safe) {
        const link = document.createElement('a'); link.href = safe.href; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = source.title || safe.hostname; link.className = 'source-title'; heading.append(link);
      } else addText(heading, 'span', source.title || 'Source page', 'source-title');
      if (source.publishedAt) addText(heading, 'span', `Published ${source.publishedAt}`, 'source-date');
      card.append(heading);
      for (const excerpt of source.excerpts || []) addText(card, 'blockquote', excerpt, 'excerpt');
      if (source.truncated) addText(card, 'p', 'Fetched text was shortened for this local result.', 'source-date');
      content.append(card);
    }
    for (const failure of result.failures || []) {
      const card = document.createElement('div'); card.className = 'source-failure';
      addText(card, 'span', failure.reason, '');
      const safe = safeLink(failure.url);
      if (safe) { const link = document.createElement('a'); link.href = safe.href; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = safe.hostname; card.append(link); }
      content.append(card);
    }
    return;
  }
  const result = row.result || {};
  if (result.status && result.status !== 'COMPLETED') {
    addText(content, 'div', result.message || `Research status: ${result.status}`, 'state-message');
    return;
  }
  addText(content, 'p', result.message || 'TinyFish-generated report. Review its citations.', 'result-disclaimer');
  if (result.report) addText(content, 'div', result.report, 'research-report');
  else addText(content, 'div', 'TinyFish completed the run but returned no report text.', 'state-message');
  if (result.citations?.length) {
    const citations = document.createElement('section'); citations.className = 'citation-list';
    addText(citations, 'h3', 'Citations', 'citation-heading');
    for (const citation of result.citations) {
      const safe = safeLink(citation); if (!safe) continue;
      const link = document.createElement('a'); link.href = safe.href; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = safe.hostname + safe.pathname; citations.append(link);
    }
    content.append(citations);
  }
}

function renderHistory() {
  const list = el('history-list'); list.replaceChildren();
  if (!state.history.length) { addText(list, 'div', 'Your questions will appear here.', 'history-empty'); return; }
  for (const row of state.history.slice(0, 16)) {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'history-item';
    const main = document.createElement('span'); main.className = 'history-main';
    addText(main, 'span', row.question, 'history-question');
    const meta = document.createElement('span'); meta.className = 'history-meta';
    addText(meta, 'span', row.mode === 'normal' ? 'Normal' : 'Research', `history-mode ${row.mode}`);
    addText(meta, 'span', row.status === 'COMPLETED' ? 'Complete' : prettify(row.status), `history-status ${row.status.toLowerCase()}`);
    addText(meta, 'span', new Date(row.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), 'history-date');
    main.append(meta); item.append(main);
    addText(item, 'span', '↗', 'history-arrow');
    item.addEventListener('click', () => { renderResult(row); window.scrollTo({ top: el('result-section').offsetTop - 20, behavior: 'smooth' }); });
    list.append(item);
  }
}

function prettify(status) { return String(status || 'Unknown').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }

async function refreshConfig() {
  state.config = await api('/api/config');
  renderAccounts();
  if (state.activeRow) {
    const updated = state.history.find(row => row.id === state.activeRow.id);
    if (updated) renderResult(updated);
  }
}
async function refreshHistory() {
  state.history = await api('/api/history');
  renderHistory();
}

async function ask() {
  clearError();
  const question = el('question').value.trim();
  const account = selectedAccount();
  if (!account || question.length < 10) return;
  setBusy(true);
  try {
    const row = await api('/api/ask', { method: 'POST', body: JSON.stringify({ account: account.id, mode: state.mode, question }) });
    if (!state.history.some(item => item.id === row.id)) state.history.unshift(row);
    renderHistory(); renderResult(row);
    await refreshConfig();
    await refreshHistory();
    const saved = state.history.find(item => item.id === row.id) || row;
    renderResult(saved);
    if (saved.mode === 'research' && ['STARTING', 'QUEUED', 'RUNNING'].includes(saved.status)) schedulePoll(saved.id, 12000);
  } catch (error) {
    showError(`${error.message}${error.resetAt ? ` Resets at ${new Date(error.resetAt).toLocaleString()}.` : ''}`);
    try { await refreshConfig(); await refreshHistory(); } catch {}
  } finally { setBusy(false); updateButton(); }
}

function schedulePoll(id, delay = 15000) {
  clearTimeout(state.pollTimers.get(id));
  state.pollTimers.set(id, setTimeout(async () => {
    try {
      const row = await api(`/api/runs/${encodeURIComponent(id)}`);
      const index = state.history.findIndex(item => item.id === id);
      if (index >= 0) state.history[index] = row; else state.history.unshift(row);
      renderHistory();
      if (state.activeRow?.id === id) renderResult(row);
      await refreshConfig();
      if (['STARTING', 'QUEUED', 'RUNNING'].includes(row.status)) schedulePoll(id, 15000);
      else state.pollTimers.delete(id);
    } catch (error) {
      if (state.activeRow?.id === id) showError(`Could not refresh Research status. ${error.message}`);
      schedulePoll(id, 30000);
    }
  }, delay));
}

async function cancelRun(id) {
  try {
    const row = await api(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
    const index = state.history.findIndex(item => item.id === id);
    if (index >= 0) state.history[index] = row;
    renderHistory(); renderResult(row); await refreshConfig();
    clearTimeout(state.pollTimers.get(id));
    state.pollTimers.delete(id);
  } catch (error) { showError(`Could not cancel the Research run. ${error.message}`); }
}

function init() {
  initAccountPicker();
  el('normal-mode').addEventListener('click', () => setMode('normal'));
  el('research-mode').addEventListener('click', () => setMode('research'));
  el('ask-button').addEventListener('click', ask);
  el('question').addEventListener('input', () => { el('char-count').textContent = `${el('question').value.length.toLocaleString()} / 1,500`; updateButton(); });
  el('question').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ask(); });
  accountSelect.addEventListener('change', () => { localStorage.setItem('lighthouse-account', accountSelect.value); renderAccountPicker(); renderLimit(); updateButton(); });
  el('close-result').addEventListener('click', () => { el('result-section').hidden = true; state.activeRow = null; });
  el('limit-info').addEventListener('click', () => { el('limit-scope').textContent = state.config?.usageScope || 'Usage from this local install only.'; });
  setMode(state.mode === 'research' ? 'research' : 'normal');
  api('/api/config').then(config => { state.config = config; if (config.hosted) { document.querySelector('.local-pill').lastChild.textContent = ' Shared demo history'; document.querySelector('.history-local').textContent = 'Saved on the demo server'; document.querySelector('.welcome-copy').textContent = 'Choose a quick source check or let Research take the longer route. Questions go to TinyFish; results and history are shared with the demo team.'; } renderAccounts(); return refreshHistory(); }).then(() => {
    for (const row of state.history) if (row.mode === 'research' && ['STARTING', 'QUEUED', 'RUNNING'].includes(row.status)) schedulePoll(row.id, 1500);
  }).catch(error => { showError(`Lighthouse could not load. ${error.message}`); });
}

init();
