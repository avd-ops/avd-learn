const STORAGE_KEY = 'avd-learn-progress-v1';

const state = {
  tracks: [],
  concepts: [],
  scenarios: [],
  labs: [],
  examFilter: 'all',
  trackFilter: 'all',
  flashcardIndex: 0,
  flashcardFlipped: false,
  examIndex: 0,
  examScore: { correct: 0, answered: 0 },
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
    root.append(el('p', { textContent: 'No concepts match the current filter.' }));
    return;
  }
  for (const c of list) {
    const badges = c.exams.map((ex) => el('span', { className: 'badge', textContent: ex }));
    const gotchas = el('ul', {}, c.gotchas.map((g) => el('li', { textContent: g })));
    root.append(
      el('article', { className: 'card' }, [
        el('div', { className: 'meta' }, [...badges, document.createTextNode(c.domain)]),
        el('h2', { textContent: c.title }),
        el('p', { textContent: c.plainEnglish }),
        el('p', {}, [el('strong', { textContent: 'Why it matters: ' }), c.whyItMatters]),
        el('p', {}, [el('strong', { textContent: 'Gotchas:' })]),
        gotchas,
        el('div', { className: 'meta', textContent: `Pinned refs: ${c.pins.join(' | ')}` })
      ])
    );
  }
}

function renderFlashcards() {
  const root = document.getElementById('flashcards-content');
  const list = filteredConcepts();
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No flashcards match the current filter.' }));
    return;
  }
  if (state.flashcardIndex >= list.length) state.flashcardIndex = 0;
  const c = list[state.flashcardIndex];
  const cardState = state.progress.flashcards[c.id]?.status || 'new';

  const card = el('article', { className: 'card' }, [
    el('div', {
      className: 'meta',
      textContent: `Card ${state.flashcardIndex + 1} of ${list.length} | ${c.exams.join(', ')} | Status: ${cardState}`
    }),
    el('h2', { textContent: c.title }),
    el('p', { className: 'meta', textContent: c.domain })
  ]);

  if (state.flashcardFlipped) {
    card.append(
      el('p', { textContent: c.plainEnglish }),
      el('p', {}, [el('strong', { textContent: 'Why it matters: ' }), c.whyItMatters]),
      el('p', {}, [el('strong', { textContent: 'Exam trap: ' }), c.gotchas[0]]),
      el('div', { className: 'meta', textContent: `Refs: ${c.pins.join(' | ')}` })
    );
  }

  const actions = el('div', { className: 'actions' });
  const flipBtn = el('button', { type: 'button', className: 'primary', textContent: state.flashcardFlipped ? 'Hide Answer' : 'Flip Card' });
  flipBtn.addEventListener('click', () => {
    state.flashcardFlipped = !state.flashcardFlipped;
    renderFlashcards();
  });
  actions.append(flipBtn);

  if (state.flashcardFlipped) {
    const knowBtn = el('button', { type: 'button', textContent: 'Got It (Known)' });
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
    actions.append(knowBtn, revBtn);
  } else {
    const nextBtn = el('button', { type: 'button', textContent: 'Skip ->' });
    nextBtn.addEventListener('click', () => {
      state.flashcardIndex = (state.flashcardIndex + 1) % list.length;
      renderFlashcards();
    });
    actions.append(nextBtn);
  }

  card.append(actions);
  root.append(card);
}

function renderExam() {
  const root = document.getElementById('exam-content');
  const list = filteredConcepts();
  root.replaceChildren();
  if (list.length === 0) {
    root.append(el('p', { textContent: 'No exam questions match the current filter.' }));
    return;
  }
  if (state.examIndex >= list.length) state.examIndex = 0;
  const c = list[state.examIndex];
  const q = c.checkQuestion;

  const feedback = el('div', { className: 'meta' });
  const card = el('article', { className: 'card' }, [
    el('div', {
      className: 'meta',
      textContent: `Question ${state.examIndex + 1} of ${list.length} | Score: ${state.examScore.correct}/${state.examScore.answered} | ${c.exams.join(', ')}`
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
        el('p', { className: 'meta', textContent: `Refs: ${c.pins.join(' | ')}` })
      );
    });
    card.append(btn);
  });

  const nextBtn = el('button', { type: 'button', className: 'primary', textContent: 'Next Question ->' });
  nextBtn.addEventListener('click', () => {
    state.examIndex = (state.examIndex + 1) % list.length;
    renderExam();
  });

  card.append(feedback, el('div', { className: 'actions' }, [nextBtn]));
  root.append(card);
}

function renderLabs() {
  const root = document.getElementById('labs-content');
  root.replaceChildren();
  const list = state.labs.filter((l) => state.examFilter === 'all' || l.exams.includes(state.examFilter));
  for (const l of list) {
    const steps = el('ol', {}, l.steps.map((s) => el('li', { textContent: s })));
    const verify = el('ul', {}, l.verify.map((v) => el('li', { textContent: v })));
    root.append(
      el('article', { className: 'card' }, [
        el('div', { className: 'meta', textContent: `${l.exams.join(', ')} | Cost: ${l.costEstimate} | Repos: ${l.reposUsed.join(', ')}` }),
        el('h2', { textContent: l.title }),
        el('p', { textContent: l.objective }),
        el('strong', { textContent: 'Steps:' }),
        steps,
        el('strong', { textContent: 'Verify:' }),
        verify,
        el('p', {}, [el('strong', { textContent: 'Gap Check: ' }), l.gapCheck])
      ])
    );
  }
}

function renderDiagnose() {
  const root = document.getElementById('diagnose-content');
  root.replaceChildren();
  const list = state.scenarios.filter((s) => state.examFilter === 'all' || s.exams.includes(state.examFilter));
  for (const s of list) {
    const facts = el('ul', { className: 'facts-box' }, Object.entries(s.facts).map(([k, v]) => el('li', { textContent: `${k}: ${v}` })));
    const feedback = el('div', { className: 'meta' });
    const card = el('article', { className: 'card' }, [
      el('div', { className: 'meta', textContent: `${s.exams.join(', ')} | Difficulty: ${s.difficulty}` }),
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
    card.append(feedback);
    root.append(card);
  }
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
  const [tracksData, conceptsData, scenariosData, labsData] = await Promise.all([
    fetch('../dataset/tracks.json').then((r) => r.json()),
    fetch('../dataset/concepts.json').then((r) => r.json()),
    fetch('../dataset/scenarios.json').then((r) => r.json()),
    fetch('../dataset/labs.json').then((r) => r.json())
  ]);

  state.tracks = tracksData.tracks;
  state.concepts = conceptsData.concepts;
  state.scenarios = scenariosData.scenarios;
  state.labs = labsData.labs;

  const trackSelect = document.getElementById('track-filter');
  for (const t of state.tracks) {
    trackSelect.append(el('option', { value: t.id, textContent: t.title }));
  }

  document.getElementById('exam-filter').addEventListener('change', (e) => {
    state.examFilter = e.target.value;
    state.flashcardIndex = 0;
    state.examIndex = 0;
    renderAll();
  });

  trackSelect.addEventListener('change', (e) => {
    state.trackFilter = e.target.value;
    state.flashcardIndex = 0;
    state.examIndex = 0;
    renderAll();
  });

  renderAll();
}

init().catch((err) => {
  console.error(err);
  document.getElementById('study-content').textContent =
    'Failed to load dataset. Start a local web server (e.g., node serve.mjs) instead of opening index.html via file://.';
});
