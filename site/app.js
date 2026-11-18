const STORAGE_KEY = 'avd-learn-progress-v1';

const REPO_URLS = {
  'avd-assess': 'https://github.com/avd-ops/avd-assess',
  'avd-second-brain': 'https://github.com/avd-ops/avd-second-brain',
  'avd-current-state': 'https://github.com/avd-ops/avd-current-state',
  'avd-landing-zone': 'https://github.com/avd-ops/avd-landing-zone',
  'avd-migrate': 'https://github.com/avd-ops/avd-migrate',
  'avd-linecheck': 'https://github.com/avd-ops/avd-linecheck',
  'avd-ops': 'https://github.com/avd-ops/avd-ops'
};

const state = {
  tracks: [],
  concepts: [],
  scenarios: [],
  labs: [],
  pins: null,
  examFilter: 'all',
  trackFilter: 'all',
  studyIndex: 0,
  flashcardIndex: 0,
  flashcardFlipped: false,
  examIndex: 0,
  examScore: { correct: 0, answered: 0 },
  labIndex: 0,
  scenarioIndex: 0,
  progress: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"flashcards":{}}')
};

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function extLink(href, label, className = '') {
  return el('a', {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    ...(className ? { className } : {}),
    textContent: label
  });
}

function resolvePinUrl(pin) {
  const [repo, fileAndHash] = pin.split(':');
  const [filePath, hash] = (fileAndHash || '').split('#');
  const commit = state.pins?.sources?.[repo]?.commit || 'main';
  const base = REPO_URLS[repo] || `https://github.com/avd-ops/${repo}`;
  return `${base}/blob/${commit}/${filePath}${hash ? `#${hash}` : ''}`;
}

function renderRichText(text) {
  const frag = document.createDocumentFragment();
  const pattern = /(https:\/\/[^\s),]+|(?:avd-assess|avd-second-brain)\/[a-zA-Z0-9_.\-/]+|\b(?:avd-linecheck|avd-assess|avd-current-state|avd-migrate|avd-landing-zone|avd-second-brain|avd-ops)\b)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) {
      frag.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const token = match[0];
    if (token.startsWith('https://')) {
      frag.append(extLink(token, token));
    } else if (token.includes('/')) {
      const [repo, ...rest] = token.split('/');
      const commit = state.pins?.sources?.[repo]?.commit || 'main';
      frag.append(extLink(`${REPO_URLS[repo]}/blob/${commit}/${rest.join('/')}`, token));
    } else if (REPO_URLS[token]) {
      frag.append(extLink(REPO_URLS[token], token));
    } else {
      frag.append(document.createTextNode(token));
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    frag.append(document.createTextNode(text.slice(lastIndex)));
  }
  return frag;
}

function renderPins(pins) {
  return el(
    'div',
    { className: 'refs-list' },
    pins.map((pin) => extLink(resolvePinUrl(pin), pin, 'ref-pill'))
  );
}

function renderProgressBar(index, total) {
  const pct = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;
  return el('div', { className: 'progress-bar', 'aria-hidden': 'true' }, [
    el('div', { className: 'progress-fill', style: `width: ${pct}%` })
  ]);
}

function filteredConcepts() {
  return state.concepts.filter((c) => {
    const examOk = state.examFilter === 'all' || c.exams.includes(state.examFilter);
    const trackOk = state.trackFilter === 'all' || c.track === state.trackFilter;
    return examOk && trackOk;
  });
}

function renderStudy() {
  const root = document.getElementById('study-content');
  const list = filteredConcepts();
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No concepts match this filter.' }));
    return;
  }
  if (state.studyIndex >= list.length) state.studyIndex = 0;
  const c = list[state.studyIndex];
  const badges = c.exams.map((ex) => el('span', { className: 'badge', textContent: ex }));
  const gotchas = el('ul', {}, c.gotchas.map((g) => el('li', { textContent: g })));

  const prevBtn = el('button', { type: 'button', textContent: '<- Previous' });
  prevBtn.addEventListener('click', () => {
    state.studyIndex = (state.studyIndex - 1 + list.length) % list.length;
    renderStudy();
  });

  const nextBtn = el('button', { type: 'button', className: 'primary', textContent: 'Next Concept ->' });
  nextBtn.addEventListener('click', () => {
    state.studyIndex = (state.studyIndex + 1) % list.length;
    renderStudy();
  });

  root.append(
    renderProgressBar(state.studyIndex, list.length),
    el('article', { className: 'card' }, [
      el('div', { className: 'meta' }, [
        ...badges,
        document.createTextNode(`${state.studyIndex + 1}/${list.length} · ${c.domain}`)
      ]),
      el('h2', { textContent: c.title }),
      el('p', { textContent: c.plainEnglish }),
      el('p', {}, [el('strong', { textContent: 'Why it matters: ' }), c.whyItMatters]),
      el('p', {}, [el('strong', { textContent: 'Gotchas:' })]),
      gotchas,
      renderPins(c.pins),
      el('div', { className: 'actions' }, [prevBtn, nextBtn])
    ])
  );
}

function renderFlashcards() {
  const root = document.getElementById('flashcards-content');
  const list = filteredConcepts();
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No flashcards match this filter.' }));
    return;
  }
  if (state.flashcardIndex >= list.length) state.flashcardIndex = 0;
  const c = list[state.flashcardIndex];
  const cardState = state.progress.flashcards[c.id]?.status || 'new';

  const card = el('article', { className: 'card' }, [
    el('div', {
      className: 'meta',
      textContent: `Card ${state.flashcardIndex + 1}/${list.length} · ${c.exams.join(', ')} · ${cardState}`
    }),
    el('h2', { textContent: c.title }),
    el('p', { className: 'meta', textContent: c.domain })
  ]);

  if (state.flashcardFlipped) {
    card.append(
      el('p', { textContent: c.plainEnglish }),
      el('p', {}, [el('strong', { textContent: 'Why it matters: ' }), c.whyItMatters]),
      el('p', {}, [el('strong', { textContent: 'Exam trap: ' }), c.gotchas[0]]),
      renderPins(c.pins)
    );
  }

  const actions = el('div', { className: 'actions' });
  const flipBtn = el('button', { type: 'button', className: 'primary', textContent: state.flashcardFlipped ? 'Hide Answer' : 'Flip Card' });
  flipBtn.addEventListener('click', () => {
    state.flashcardFlipped = !state.flashcardFlipped;
    renderFlashcards();
  });

  const group = el('div', { className: 'actions-group' });
  if (state.flashcardFlipped) {
    const knowBtn = el('button', { type: 'button', textContent: 'Got It' });
    knowBtn.addEventListener('click', () => {
      state.progress.flashcards[c.id] = { status: 'known' };
      saveProgress();
      state.flashcardIndex = (state.flashcardIndex + 1) % list.length;
      state.flashcardFlipped = false;
      renderFlashcards();
    });
    const revBtn = el('button', { type: 'button', textContent: 'Review Again' });
    revBtn.addEventListener('click', () => {
      state.progress.flashcards[c.id] = { status: 'review' };
      saveProgress();
      state.flashcardIndex = (state.flashcardIndex + 1) % list.length;
      state.flashcardFlipped = false;
      renderFlashcards();
    });
    group.append(knowBtn, revBtn);
  } else {
    const skipBtn = el('button', { type: 'button', textContent: 'Skip ->' });
    skipBtn.addEventListener('click', () => {
      state.flashcardIndex = (state.flashcardIndex + 1) % list.length;
      renderFlashcards();
    });
    group.append(skipBtn);
  }

  actions.append(flipBtn, group);
  card.append(actions);
  root.append(renderProgressBar(state.flashcardIndex, list.length), card);
}

function renderExam() {
  const root = document.getElementById('exam-content');
  const list = filteredConcepts();
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No exam questions match this filter.' }));
    return;
  }
  if (state.examIndex >= list.length) state.examIndex = 0;
  const c = list[state.examIndex];
  const q = c.checkQuestion;

  const feedback = el('div', { className: 'meta' });
  const card = el('article', { className: 'card' }, [
    el('div', {
      className: 'meta',
      textContent: `Question ${state.examIndex + 1}/${list.length} · Score ${state.examScore.correct}/${state.examScore.answered} · ${c.exams.join(', ')}`
    }),
    el('h2', { textContent: q.prompt })
  ]);

  let answeredThis = false;
  q.choices.forEach((choice, idx) => {
    const btn = el('button', { type: 'button', className: 'choice-btn', textContent: `${idx + 1}. ${choice}` });
    btn.addEventListener('click', () => {
      if (answeredThis) return;
      answeredThis = true;
      state.examScore.answered += 1;
      const ok = idx === q.answerIndex;
      if (ok) state.examScore.correct += 1;
      feedback.replaceChildren(
        el('p', {
          className: ok ? 'feedback-ok' : 'feedback-warn',
          textContent: ok ? 'Correct!' : `Incorrect — Answer: ${q.answerIndex + 1}. ${q.choices[q.answerIndex]}`
        }),
        el('p', { textContent: q.explanation }),
        renderPins(c.pins)
      );
    });
    card.append(btn);
  });

  const nextBtn = el('button', { type: 'button', className: 'primary', textContent: 'Next Question ->' });
  nextBtn.addEventListener('click', () => {
    state.examIndex = (state.examIndex + 1) % list.length;
    renderExam();
  });

  card.append(feedback, el('div', { className: 'actions' }, [el('span'), nextBtn]));
  root.append(renderProgressBar(state.examIndex, list.length), card);
}

function renderLabs() {
  const root = document.getElementById('labs-content');
  const list = state.labs.filter((l) => state.examFilter === 'all' || l.exams.includes(state.examFilter));
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No labs match this filter.' }));
    return;
  }
  if (state.labIndex >= list.length) state.labIndex = 0;
  const l = list[state.labIndex];

  const steps = el('ol', {}, l.steps.map((s) => el('li', {}, [renderRichText(s)])));
  const verify = el('ul', {}, l.verify.map((v) => el('li', {}, [renderRichText(v)])));
  const repoLinks = el('div', { className: 'refs-list' }, l.reposUsed.map((r) => extLink(REPO_URLS[r] || '#', r, 'ref-pill')));

  const prevBtn = el('button', { type: 'button', textContent: '<- Previous Lab' });
  prevBtn.addEventListener('click', () => {
    state.labIndex = (state.labIndex - 1 + list.length) % list.length;
    renderLabs();
  });
  const nextBtn = el('button', { type: 'button', className: 'primary', textContent: 'Next Lab ->' });
  nextBtn.addEventListener('click', () => {
    state.labIndex = (state.labIndex + 1) % list.length;
    renderLabs();
  });

  root.append(
    renderProgressBar(state.labIndex, list.length),
    el('article', { className: 'card' }, [
      el('div', { className: 'meta', textContent: `Lab ${state.labIndex + 1}/${list.length} · ${l.exams.join(', ')} · ${l.costEstimate}` }),
      el('h2', { textContent: l.title }),
      el('p', { textContent: l.objective }),
      repoLinks,
      el('p', {}, [el('strong', { textContent: 'Steps:' })]),
      steps,
      el('p', {}, [el('strong', { textContent: 'Verify:' })]),
      verify,
      el('p', {}, [el('strong', { textContent: 'Gap Check: ' }), renderRichText(l.gapCheck)]),
      el('div', { className: 'actions' }, [prevBtn, nextBtn])
    ])
  );
}

function renderDiagnose() {
  const root = document.getElementById('diagnose-content');
  const list = state.scenarios.filter((s) => state.examFilter === 'all' || s.exams.includes(state.examFilter));
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No scenarios match this filter.' }));
    return;
  }
  if (state.scenarioIndex >= list.length) state.scenarioIndex = 0;
  const s = list[state.scenarioIndex];

  const facts = el('ul', { className: 'facts-box' }, Object.entries(s.facts).map(([k, v]) => el('li', { textContent: `${k}: ${v}` })));
  const feedback = el('div', { className: 'meta' });
  const card = el('article', { className: 'card' }, [
    el('div', { className: 'meta', textContent: `Scenario ${state.scenarioIndex + 1}/${list.length} · ${s.exams.join(', ')} · ${s.difficulty}` }),
    el('h2', { textContent: s.title }),
    facts,
    el('p', { textContent: s.prompt })
  ]);

  s.choices.forEach((choice, idx) => {
    const btn = el('button', { type: 'button', className: 'choice-btn', textContent: `${idx + 1}. ${choice}` });
    btn.addEventListener('click', () => {
      const ok = idx === s.answerIndex;
      feedback.replaceChildren(
        el('p', {
          className: ok ? 'feedback-ok' : 'feedback-warn',
          textContent: ok ? 'Correct diagnosis!' : `Incorrect — Answer: ${s.answerIndex + 1}. ${s.choices[s.answerIndex]}`
        }),
        el('p', { textContent: s.explanation })
      );
    });
    card.append(btn);
  });

  const nextBtn = el('button', { type: 'button', className: 'primary', textContent: 'Next Scenario ->' });
  nextBtn.addEventListener('click', () => {
    state.scenarioIndex = (state.scenarioIndex + 1) % list.length;
    renderDiagnose();
  });

  card.append(feedback, el('div', { className: 'actions' }, [el('span'), nextBtn]));
  root.append(renderProgressBar(state.scenarioIndex, list.length), card);
}

function renderAll() {
  renderStudy();
  renderFlashcards();
  renderExam();
  renderLabs();
  renderDiagnose();
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];

  function selectTab(target) {
    tabs.forEach((tab) => {
      const selected = tab === target;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.getAttribute('aria-labelledby') !== target.id;
    });
  }

  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        next.focus();
        selectTab(next);
      }
    });
  });
}

function setupPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW registration failed:', err));
  }

  const installButton = document.querySelector('#install-app');
  const installStatus = document.querySelector('#install-status');
  const supportsWebInstall = typeof Navigator.prototype.install === 'function';
  let deferredInstallPrompt;

  if (supportsWebInstall) {
    installButton.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!supportsWebInstall) {
      installButton.hidden = false;
    }
  });

  installButton.addEventListener('click', async () => {
    if (installButton.getAttribute('aria-disabled') === 'true') return;
    installButton.setAttribute('aria-disabled', 'true');

    try {
      if (supportsWebInstall) {
        await navigator.install();
        installStatus.textContent = 'The app was installed or opened.';
        installButton.hidden = true;
      } else if (deferredInstallPrompt) {
        const promptEvent = deferredInstallPrompt;
        deferredInstallPrompt = undefined;
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        installStatus.textContent = outcome === 'accepted' ? 'The app was installed.' : 'Installation canceled.';
        if (!deferredInstallPrompt) {
          installButton.hidden = true;
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        installStatus.textContent = 'Installation was canceled or could not complete.';
      } else {
        installStatus.textContent = 'Installation could not start.';
        console.error(error);
      }
    } finally {
      installButton.removeAttribute('aria-disabled');
    }
  });
}

async function init() {
  setupTabs();
  setupPwa();
  const [tracksData, conceptsData, scenariosData, labsData, pinsData] = await Promise.all([
    fetch('../dataset/tracks.json').then((r) => r.json()),
    fetch('../dataset/concepts.json').then((r) => r.json()),
    fetch('../dataset/scenarios.json').then((r) => r.json()),
    fetch('../dataset/labs.json').then((r) => r.json()),
    fetch('../pins.json').then((r) => r.json())
  ]);

  state.tracks = tracksData.tracks;
  state.concepts = conceptsData.concepts;
  state.scenarios = scenariosData.scenarios;
  state.labs = labsData.labs;
  state.pins = pinsData;

  const trackSelect = document.getElementById('track-filter');
  for (const t of state.tracks) {
    trackSelect.append(el('option', { value: t.id, textContent: t.title }));
  }

  document.getElementById('exam-filter').addEventListener('change', (e) => {
    state.examFilter = e.target.value;
    state.studyIndex = 0;
    state.flashcardIndex = 0;
    state.examIndex = 0;
    state.labIndex = 0;
    state.scenarioIndex = 0;
    renderAll();
  });

  trackSelect.addEventListener('change', (e) => {
    state.trackFilter = e.target.value;
    state.studyIndex = 0;
    state.flashcardIndex = 0;
    state.examIndex = 0;
    renderAll();
  });

  renderAll();
}

init().catch((err) => {
  console.error(err);
  document.getElementById('study-content').textContent =
    'Failed to load dataset. Start a local web server (node serve.mjs) or open via GitHub Pages.';
});
