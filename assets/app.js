'use strict';

/* ŞD Suallar — static quiz app. Data: data/questions.json
   Each question: { n: original number, q: text, o: { a..e: option text }, a: right letter or "",
   num: true for numerical questions } */

const app = document.getElementById('app');
const dlg = document.getElementById('dlg');
const printRoot = document.getElementById('print-root');

const KEYS = {
  settings: 'sd.settings.v1',
  sessions: 'sd.sessions.v1',
  stats: 'sd.stats.v1',
  picks: 'sd.picks.v1',
  best: 'sd.best.v1',
  theme: 'sd.theme.v1',
};

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked or full */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* blocked */ }
  },
};

const PLANS = {
  b10: { count: 10, label: '10 blok', hint: '~50 sual' },
  b5: { count: 5, label: '5 blok', hint: '~100 sual' },
  all: { count: 1, label: 'Hamısı', hint: 'bir test' },
};

const MODES = {
  practice: { label: 'Məşq', hint: 'Hər sualdan sonra düzgün cavab dərhal göstərilir.' },
  exam: { label: 'İmtahan', hint: 'Cavablar və nəticə testin sonunda göstərilir.' },
};

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

const state = {
  questions: [],
  byNum: new Map(),
  blocks: {},
  scorable: 0,
  settings: { plan: 'b10', mode: 'practice', shuffle: false, ...store.get(KEYS.settings, {}) },
  sessions: store.get(KEYS.sessions, {}),
  stats: store.get(KEYS.stats, {}), // { [n]: 'c' | 'w' } last result per question
  picks: store.get(KEYS.picks, {}), // { [n]: letter } last answer per question, for exports
  best: store.get(KEYS.best, {}), // { [blockKey]: { score, total, pct } }
  view: '',
  key: '',
  reviewFilter: 'wrong',
  browse: { query: '', filter: 'all', shown: 40 },
};

if (!PLANS[state.settings.plan]) state.settings.plan = 'b10';
if (!MODES[state.settings.mode]) state.settings.mode = 'practice';

const saveSettings = () => store.set(KEYS.settings, state.settings);
const saveSessions = () => store.set(KEYS.sessions, state.sessions);
const saveStats = () => {
  store.set(KEYS.stats, state.stats);
  store.set(KEYS.picks, state.picks);
};
const saveBest = () => store.set(KEYS.best, state.best);

function recordResult(q, letter) {
  state.stats[q.n] = letter === q.a ? 'c' : 'w';
  state.picks[q.n] = letter;
}

/* ---------- Icons ---------- */

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

const ICON = {
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  book: svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13"/><path d="M8 7h7M8 11h5"/>'),
  redo: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
  auto: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>'),
  flag: svg('<path d="M4 22V4m0 0h12l-2 4 2 4H4"/>'),
  export: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
};

// Ultrasound sector with a small lesion: the app's mark.
const LOGO = `<svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
  <path d="M24 8 3.35 37.49A36 36 0 0 0 44.65 37.49Z" fill="currentColor" opacity=".14"/>
  <path d="M24 8 3.35 37.49A36 36 0 0 0 44.65 37.49Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M15.97 19.47A14 14 0 0 0 32.03 19.47M11.38 26.02A22 22 0 0 0 36.62 26.02M6.79 32.58A30 30 0 0 0 41.21 32.58" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/>
  <circle cx="28.5" cy="29" r="3" fill="currentColor"/>
</svg>`;

/* ---------- Helpers ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Lowercases and strips Azerbaijani diacritics one character at a time,
// so indexes in the folded string match the original (needed for highlighting).
const FOLD = { 'ə': 'e', 'Ə': 'e', 'ı': 'i', 'I': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ö': 'o', 'Ö': 'o', 'ü': 'u', 'Ü': 'u' };
function fold(text) {
  let out = '';
  for (const ch of text) out += FOLD[ch] ?? ch.toLowerCase().charAt(0);
  return out;
}

function highlight(text, needle) {
  if (!needle) return esc(text);
  const hay = fold(text);
  let out = '';
  let from = 0;
  let at = hay.indexOf(needle);
  while (at !== -1) {
    out += esc(text.slice(from, at)) + '<mark>' + esc(text.slice(at, at + needle.length)) + '</mark>';
    from = at + needle.length;
    at = hay.indexOf(needle, from);
  }
  return out + esc(text.slice(from));
}

const rangeLabel = (ids) => `Sual ${ids[0]}–${ids[ids.length - 1]}`;
const answeredCount = (s) => s.ids.filter((n) => s.answers[n]).length;
const currentSession = () => state.sessions[state.key];
const isOpen = () => dlg.open;

/* ---------- Data ---------- */

function buildBlocks() {
  const total = state.questions.length;
  for (const [plan, cfg] of Object.entries(PLANS)) {
    const base = Math.floor(total / cfg.count);
    const extra = total % cfg.count;
    let start = 0;
    for (let i = 0; i < cfg.count; i++) {
      const size = base + (i < extra ? 1 : 0);
      const ids = state.questions.slice(start, start + size).map((q) => q.n);
      start += size;
      const key = plan === 'all' ? 'all' : `${plan}-${i + 1}`;
      state.blocks[key] = {
        key,
        plan,
        title: plan === 'all' ? 'Bütün suallar' : `Blok ${i + 1}`,
        range: rangeLabel(ids),
        ids,
      };
    }
  }

  // Numerical questions: two halves plus one block with all of them.
  const num = state.questions.filter((q) => q.num).map((q) => q.n);
  const half = Math.ceil(num.length / 2);
  const preview = (ids) => `№ ${ids.slice(0, 3).join(', ')}…`;
  for (const [key, title, ids] of [
    ['num-1', 'Rəqəmli 1', num.slice(0, half)],
    ['num-2', 'Rəqəmli 2', num.slice(half)],
    ['num-all', 'Bütün rəqəmli', num],
  ]) {
    if (ids.length) state.blocks[key] = { key, plan: 'num', title, range: preview(ids), ids };
  }
}

const blocksForPlan = (plan) => Object.values(state.blocks).filter((b) => b.plan === plan);

const mistakeIds = () =>
  state.questions.filter((q) => state.stats[q.n] === 'w').map((q) => q.n);

function overall() {
  let c = 0;
  let w = 0;
  for (const q of state.questions) {
    if (!q.a) continue;
    if (state.stats[q.n] === 'c') c++;
    else if (state.stats[q.n] === 'w') w++;
  }
  return { c, w, rest: state.scorable - c - w };
}

function score(s) {
  const r = { correct: 0, wrong: 0, skipped: 0, unscored: 0, total: 0 };
  for (const n of s.ids) {
    const q = state.byNum.get(n);
    const picked = s.answers[n];
    if (!q.a) { r.unscored++; continue; }
    r.total++;
    if (!picked) r.skipped++;
    else if (picked === q.a) r.correct++;
    else r.wrong++;
  }
  r.pct = pct(r.correct, r.total);
  return r;
}

/* ---------- Sessions ---------- */

function createSession(def) {
  const base = [...def.ids];
  const session = {
    key: def.key,
    title: def.title,
    range: def.range,
    base,
    ids: state.settings.shuffle ? shuffle([...base]) : base,
    answers: {},
    index: 0,
    mode: state.settings.mode,
    finished: false,
    updated: Date.now(),
  };
  state.sessions[def.key] = session;
  saveSessions();
  return session;
}

function openBlock(key) {
  if (key === 'random') return startRandom();
  const s = state.sessions[key];
  if (s && s.finished) return go(`#/result/${key}`);
  if (!s) createSession(state.blocks[key]);
  go(`#/quiz/${key}`);
}

function startMistakes() {
  const ids = mistakeIds();
  if (!ids.length) return;
  createSession({ key: 'mistakes', title: 'Səhvlərim', range: `${ids.length} sual`, ids });
  go('#/quiz/mistakes');
}

// Random test: RANDOM_PER_BLOCK questions from each of the 10 blocks, so every set covers the
// whole bank evenly. Questions without an answer key are left out so every question is scored.
const RANDOM_PER_BLOCK = 5;
const RANDOM_CARD = { key: 'random', title: 'Təsadüfi 50', range: `Hər blokdan ${RANDOM_PER_BLOCK} sual` };

function randomDef() {
  const ids = blocksForPlan('b10')
    .flatMap((b) => shuffle(b.ids.filter((n) => state.byNum.get(n).a)).slice(0, RANDOM_PER_BLOCK))
    .sort((a, b) => a - b);
  return { ...RANDOM_CARD, ids };
}

// Resumes an unfinished random test; otherwise draws a new set.
function startRandom() {
  const s = state.sessions.random;
  if (!s || s.finished) createSession(randomDef());
  go('#/quiz/random');
}

function restart(key) {
  if (key === 'random') {
    createSession(randomDef());
    return go('#/quiz/random', true);
  }
  const s = state.sessions[key];
  const def = state.blocks[key] || { key, title: s.title, range: s.range, ids: s.base };
  createSession(def);
  go(`#/quiz/${key}`, true);
}

function retryWrong(key) {
  const s = state.sessions[key];
  const ids = s.base.filter((n) => {
    const q = state.byNum.get(n);
    return q.a && s.answers[n] !== q.a;
  });
  if (!ids.length) return;
  const title = key === 'retry' ? s.title : `Təkrar · ${s.title}`;
  createSession({ key: 'retry', title, range: `${ids.length} sual`, ids });
  go('#/quiz/retry', key === 'retry');
}

function latestUnfinished() {
  return Object.values(state.sessions)
    .filter((s) => !s.finished && answeredCount(s) > 0)
    .sort((a, b) => b.updated - a.updated)[0];
}

function finish(key) {
  const s = state.sessions[key];
  s.finished = true;
  s.updated = Date.now();
  if (s.mode === 'exam') {
    for (const n of s.ids) {
      const q = state.byNum.get(n);
      const picked = s.answers[n];
      if (q.a && picked) recordResult(q, picked);
    }
    saveStats();
  }
  if (state.blocks[key]) {
    const r = score(s);
    const prev = state.best[key];
    if (!prev || r.pct >= prev.pct) {
      state.best[key] = { score: r.correct, total: r.total, pct: r.pct };
      saveBest();
    }
  }
  state.reviewFilter = 'wrong';
  saveSessions();
  go(`#/result/${key}`, true);
}

/* ---------- Routing ---------- */

function go(hash, replace = false) {
  if (location.hash === hash) return route();
  if (replace) location.replace(hash);
  else location.hash = hash;
}

function route() {
  const [view, key] = location.hash.replace(/^#\/?/, '').split('/');
  closeDialog();
  if (view === 'quiz' && state.sessions[key]) {
    if (state.sessions[key].finished) return go(`#/result/${key}`, true);
    state.key = key;
    renderQuiz(true);
  } else if (view === 'result' && state.sessions[key]?.finished) {
    state.key = key;
    renderResult();
  } else if (view === 'browse') {
    renderBrowse();
  } else {
    renderHome();
  }
}

/* ---------- Home ---------- */

function themeState() {
  const t = store.get(KEYS.theme, 'system');
  return ['light', 'dark'].includes(t) ? t : 'system';
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(themeState()) + 1) % order.length];
  if (next === 'system') {
    store.remove(KEYS.theme);
    delete document.documentElement.dataset.theme;
  } else {
    store.set(KEYS.theme, next);
    document.documentElement.dataset.theme = next;
  }
  renderHome();
}

function blockStatus(key) {
  const s = state.sessions[key];
  if (s && !s.finished) {
    const a = answeredCount(s);
    return { cls: 'is-progress', text: `${a}/${s.ids.length} cavablanıb`, fill: pct(a, s.ids.length), tone: 'acc' };
  }
  if (key === 'random') {
    if (!s) return { cls: '', text: 'Hər dəfə yeni sual dəsti', fill: 0, tone: 'acc' };
    const r = score(s);
    return { cls: 'is-done', text: `Son nəticə: ${r.pct}% · yenisi üçün toxunun`, fill: r.pct, tone: 'ok' };
  }
  const b = state.best[key];
  if (b) return { cls: 'is-done', text: `Ən yaxşı: ${b.pct}%`, fill: b.pct, tone: 'ok' };
  return { cls: '', text: `${state.blocks[key].ids.length} sual`, fill: 0, tone: 'acc' };
}

function renderHome() {
  state.view = 'home';
  const { settings } = state;
  const resume = latestUnfinished();
  const o = overall();
  const mistakes = mistakeIds().length;
  const theme = themeState();
  const themeLabel = { system: 'Sistem', light: 'İşıqlı', dark: 'Qaranlıq' }[theme];

  const resumeHtml = resume ? `
    <button class="resume" data-act="open" data-key="${esc(resume.key)}">
      <span class="eyebrow">Davam et</span>
      <strong>${esc(resume.title)}</strong>
      <span class="mono" style="font-size:var(--fs-sm)">${answeredCount(resume)} / ${resume.ids.length} · ${MODES[resume.mode].label}</span>
      <span class="go">${ICON.next}</span>
      <span class="bar" style="grid-column:1/-1"><span style="width:${pct(answeredCount(resume), resume.ids.length)}%"></span></span>
    </button>` : '';

  // Narrow two-column cards put the range under the title; wide ones put it on the right.
  const blockCard = (b, narrow) => {
    const st = blockStatus(b.key);
    const range = `<span class="block-range">${esc(b.range)}</span>`;
    return `
      <button class="block" data-act="open" data-key="${b.key}">
        <span class="block-top">
          <span class="block-title">${esc(b.title)}</span>
          ${narrow ? '' : range}
        </span>
        ${narrow ? range : ''}
        <span class="block-status ${st.cls}">${st.text}</span>
        <span class="bar"><span class="${st.tone}" style="width:${st.fill}%"></span></span>
      </button>`;
  };
  const blocksHtml = blocksForPlan(settings.plan).map((b) => blockCard(b, settings.plan === 'b10')).join('');
  const numBlocks = blocksForPlan('num');
  const numHtml = numBlocks.map((b) => blockCard(b, b.key !== 'num-all')).join('');
  const numCount = state.blocks['num-all']?.ids.length || 0;

  app.innerHTML = `
  <div class="page">
    <header class="brand">
      ${LOGO}
      <div class="brand-text">
        <h1>ŞD Suallar</h1>
        <p>Şüa diaqnostikası · ${state.questions.length} test sualı</p>
      </div>
      <button class="icon-btn" data-act="theme" aria-label="Rəng mövzusu: ${themeLabel}" title="Mövzu: ${themeLabel}">
        ${ICON[theme === 'system' ? 'auto' : theme === 'light' ? 'sun' : 'moon']}
      </button>
    </header>

    ${resumeHtml}

    <section class="panel overview" aria-label="Ümumi irəliləyiş">
      <div class="overview-head">
        <h2>Ümumi irəliləyiş</h2>
        <span class="mono">${pct(o.c, state.scorable)}% mənimsənilib</span>
      </div>
      <div class="bar" role="img" aria-label="${o.c} düzgün, ${o.w} səhv, ${o.rest} yeni">
        <span class="ok" style="width:${(o.c / state.scorable) * 100}%"></span>
        <span class="bad" style="width:${(o.w / state.scorable) * 100}%"></span>
      </div>
      <div class="overview-foot">
        <dl class="legend">
          <div><span class="dot ok"></span><dt>Düzgün</dt><dd>${o.c}</dd></div>
          <div><span class="dot bad"></span><dt>Səhv</dt><dd>${o.w}</dd></div>
          <div><span class="dot"></span><dt>Yeni</dt><dd>${o.rest}</dd></div>
        </dl>
        ${o.c + o.w ? `<button class="btn btn--small" data-act="export-all">${ICON.export}İxrac</button>` : ''}
      </div>
    </section>

    <section class="section" aria-labelledby="pick-title">
      <h2 class="section-title" id="pick-title">Test seçin</h2>
      <div class="seg" role="group" aria-label="Bölgü">
        ${Object.entries(PLANS).map(([k, p]) => `
          <button data-act="plan" data-plan="${k}" aria-pressed="${settings.plan === k}">
            ${p.label}<small>${k === 'all' ? `${state.questions.length} sual` : p.hint}</small>
          </button>`).join('')}
      </div>
      <div class="blocks blocks--${settings.plan}">${blocksHtml}</div>
    </section>

    <section class="section" aria-labelledby="rand-title">
      <div>
        <h2 class="section-title" id="rand-title">Təsadüfi test</h2>
        <p class="section-sub">Hər dəfə bütün bazadan yeni 50 sual: 10 blokun hər birindən ${RANDOM_PER_BLOCK} sual.</p>
      </div>
      <div class="blocks">${blockCard(RANDOM_CARD, false)}</div>
    </section>

    ${numCount ? `
    <section class="section" aria-labelledby="num-title">
      <div>
        <h2 class="section-title" id="num-title">Rəqəmli suallar</h2>
        <p class="section-sub">Ölçülər, vaxtlar, dozalar, enerjilər, seqment sayları · ${numCount} sual</p>
      </div>
      <div class="blocks blocks--num">${numHtml}</div>
    </section>` : ''}

    <section class="panel settings" aria-label="Parametrlər">
      <div class="setting">
        <div>
          <h3>Rejim</h3>
          <p>${MODES[settings.mode].hint}</p>
        </div>
        <div class="seg" role="group" aria-label="Rejim">
          ${Object.entries(MODES).map(([k, m]) => `
            <button data-act="mode" data-mode="${k}" aria-pressed="${settings.mode === k}">${m.label}</button>`).join('')}
        </div>
      </div>
      <label class="setting switch-row" for="shuffle">
        <div>
          <h3>Sualları qarışdır</h3>
          <p>Hər yeni testdə sualların sırası təsadüfi olur.</p>
        </div>
        <input type="checkbox" class="switch" id="shuffle" ${settings.shuffle ? 'checked' : ''}>
      </label>
      <p class="fine">Parametrlər yeni başlanan testlərə tətbiq olunur.</p>
    </section>

    <section class="tools" aria-label="Təkrar">
      <button class="tool" data-act="mistakes" ${mistakes ? '' : 'disabled'}>
        ${ICON.redo}
        <strong>Səhvlərim</strong>
        <span>${mistakes ? `${mistakes} sual təkrar üçün` : 'Hələ səhv yoxdur'}</span>
      </button>
      <a class="tool" href="#/browse">
        ${ICON.book}
        <strong>Sual bazası</strong>
        <span>Bütün suallar cavabları ilə, axtarış</span>
      </a>
    </section>

    <footer class="foot">
      <p>${state.questions.length - state.scorable} sualın düzgün cavabı mənbədə qeyd olunmayıb. Bu suallar testlərdə göstərilir, amma nəticəyə daxil edilmir.</p>
      <p>Nəticələr yalnız bu cihazda, brauzerdə saxlanılır.</p>
      <button class="btn btn--ghost btn--danger" data-act="reset">Nəticələri sıfırla</button>
    </footer>
  </div>`;
}

/* ---------- Quiz ---------- */

function optionState(q, letter, picked, reveal) {
  if (!reveal) return picked === letter ? 'is-picked' : '';
  if (!q.a) return picked === letter ? 'is-picked' : 'is-dim';
  if (letter === q.a) return 'is-right';
  if (letter === picked) return 'is-wrong';
  return 'is-dim';
}

function feedback(q, picked) {
  if (!q.a) return `<div class="note note--warn">${ICON.info}<span>Bu sualın düzgün cavabı mənbədə qeyd olunmayıb. Nəticəyə daxil edilmir.</span></div>`;
  if (picked === q.a) return `<div class="note note--ok">${ICON.check}<span>Düzgündür.</span></div>`;
  return `<div class="note note--bad">${ICON.x}<span>Səhv. Düzgün cavab: <strong>${q.a.toUpperCase()}</strong></span></div>`;
}

function progressBar(s) {
  const total = s.ids.length;
  if (s.mode === 'exam') {
    return `<span class="acc" style="width:${(answeredCount(s) / total) * 100}%"></span>`;
  }
  let c = 0;
  let w = 0;
  let u = 0;
  for (const n of s.ids) {
    const picked = s.answers[n];
    if (!picked) continue;
    const q = state.byNum.get(n);
    if (!q.a) u++;
    else if (picked === q.a) c++;
    else w++;
  }
  return `<span class="ok" style="width:${(c / total) * 100}%"></span>
          <span class="bad" style="width:${(w / total) * 100}%"></span>
          <span class="acc" style="width:${(u / total) * 100}%"></span>`;
}

function renderQuiz(enter = false) {
  state.view = 'quiz';
  const s = currentSession();
  s.index = Math.min(Math.max(s.index, 0), s.ids.length - 1);
  const n = s.ids[s.index];
  const q = state.byNum.get(n);
  const picked = s.answers[n];
  const reveal = s.mode === 'practice' && Boolean(picked);
  const last = s.index === s.ids.length - 1;
  const nextLabel = last ? (s.mode === 'exam' ? 'Bitir' : 'Nəticə') : 'Növbəti';

  const opts = LETTERS.filter((l) => q.o[l]).map((l) => {
    const cls = optionState(q, l, picked, reveal);
    const mark = cls === 'is-right' ? ICON.check : cls === 'is-wrong' ? ICON.x : '';
    return `
      <li>
        <button class="opt ${cls}" data-act="pick" data-letter="${l}" ${reveal ? 'disabled' : ''} aria-pressed="${picked === l}">
          <span class="opt-key">${l}</span>
          <span class="opt-text">${esc(q.o[l])}</span>
          <span class="opt-mark">${mark}</span>
        </button>
      </li>`;
  }).join('');

  app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner">
      <button class="icon-btn" data-act="home" aria-label="Ana səhifə">${ICON.close}</button>
      <div class="topbar-title">
        <strong>${esc(s.title)}</strong>
        <span>${esc(s.range)} · ${MODES[s.mode].label}</span>
      </div>
      <button class="counter-btn" data-act="nav" aria-label="Suallar siyahısı">
        ${ICON.grid}<span>${s.index + 1}/${s.ids.length}</span>
      </button>
    </div>
    <div class="bar">${progressBar(s)}</div>
  </header>

  <div class="page quiz" id="quiz">
    <div class="q-body ${enter ? 'enter' : ''}">
      <div class="q-meta">
        <span class="q-num">SUAL № ${q.n}</span>
        <span class="spacer"></span>
        ${q.a ? '' : '<span class="chip chip--warn">Cavab açarı yoxdur</span>'}
      </div>
      <h2 class="q-text">${esc(q.q)}</h2>
      <ul class="options">${opts}</ul>
      ${reveal ? feedback(q, picked) : ''}
      ${s.mode === 'exam' && picked ? '<p class="hint">Cavabı dəyişmək üçün başqa variantı seçin.</p>' : ''}
      ${s.index === 0 ? `
        <p class="hint hint--keys">Klaviatura: A–E cavab seçir, ← → suallar arasında keçir.</p>
        <p class="hint hint--swipe">Suallar arasında keçmək üçün sola və ya sağa sürüşdürün.</p>` : ''}
    </div>
  </div>

  <nav class="actionbar" aria-label="Sual naviqasiyası">
    <div class="actionbar-inner">
      <button class="btn btn--ghost" data-act="prev" ${s.index === 0 ? 'disabled' : ''} aria-label="Əvvəlki sual">${ICON.back}</button>
      <button class="btn btn--primary" data-act="next">${nextLabel}${last ? '' : ICON.next}</button>
    </div>
  </nav>`;

  if (enter) window.scrollTo({ top: 0 });
}

function pick(letter) {
  const s = currentSession();
  const n = s.ids[s.index];
  const q = state.byNum.get(n);
  if (s.mode === 'practice' && s.answers[n]) return;
  s.answers[n] = letter;
  s.updated = Date.now();
  if (s.mode === 'practice' && q.a) {
    recordResult(q, letter);
    saveStats();
  }
  saveSessions();
  renderQuiz();
  if (s.mode === 'practice') {
    app.querySelector('.opt.is-right')?.classList.add('pop');
    app.querySelector('.note')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function move(step) {
  const s = currentSession();
  const target = s.index + step;
  if (target < 0) return;
  if (target >= s.ids.length) return askFinish();
  s.index = target;
  saveSessions();
  renderQuiz(true);
}

async function askFinish() {
  const s = currentSession();
  const left = s.ids.length - answeredCount(s);
  if (left > 0) {
    const ok = await confirmDialog({
      title: 'Testi bitirmək?',
      body: `${left} sual cavabsız qalıb. Cavabsız suallar səhv kimi yox, “cavabsız” kimi sayılacaq.`,
      ok: 'Bitir',
    });
    if (!ok) return;
  }
  finish(state.key);
}

function openNavigator() {
  const s = currentSession();
  const cells = s.ids.map((n, i) => {
    const q = state.byNum.get(n);
    const picked = s.answers[n];
    let cls = '';
    if (picked) {
      if (s.mode === 'exam') cls = 'is-picked';
      else if (!q.a) cls = 'is-nokey';
      else cls = picked === q.a ? 'is-right' : 'is-wrong';
    }
    if (i === s.index) cls += ' is-current';
    return `<button class="cell ${cls}" data-act="jump" data-i="${i}" aria-label="Sual ${i + 1}">${i + 1}</button>`;
  }).join('');

  const legend = s.mode === 'exam'
    ? `<div><span class="dot acc"></span><dt>Cavablanıb</dt><dd>${answeredCount(s)}</dd></div>`
    : (() => {
      const r = score(s);
      return `<div><span class="dot ok"></span><dt>Düzgün</dt><dd>${r.correct}</dd></div>
              <div><span class="dot bad"></span><dt>Səhv</dt><dd>${r.wrong}</dd></div>`;
    })();

  openDialog(`
    <div class="dlg-head">
      <h2>Suallar</h2>
      <button class="icon-btn" data-dlg="close" aria-label="Bağla">${ICON.close}</button>
    </div>
    <div class="dlg-body">
      <dl class="legend">
        ${legend}
        <div><span class="dot"></span><dt>Cavabsız</dt><dd>${s.ids.length - answeredCount(s)}</dd></div>
      </dl>
      <div class="grid-nav">${cells}</div>
    </div>
    <div class="dlg-actions">
      <button class="btn btn--primary" data-dlg="finish">${ICON.flag}Testi bitir</button>
    </div>`, 'sheet');

  dlg.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
  dlg.onclick = (e) => {
    const jump = e.target.closest('[data-act="jump"]');
    if (jump) {
      s.index = Number(jump.dataset.i);
      saveSessions();
      closeDialog();
      renderQuiz(true);
      return;
    }
    if (e.target.closest('[data-dlg="finish"]')) {
      closeDialog();
      askFinish();
      return;
    }
    if (e.target.closest('[data-dlg="close"]') || e.target === dlg) closeDialog();
  };
}

/* ---------- Results ---------- */

function reviewCard(q, picked, needle = '') {
  const opts = LETTERS.filter((l) => q.o[l]).map((l) => {
    let cls = '';
    let tag = '';
    if (q.a && l === q.a) { cls = 'is-right'; tag = picked === l ? 'Sizin · düzgün' : 'Düzgün'; }
    else if (picked === l) { cls = q.a ? 'is-wrong' : 'is-picked'; tag = 'Sizin'; }
    return `<li class="${cls}"><span class="k">${l}</span><span class="t">${highlight(q.o[l], needle)}</span><span class="tag">${tag}</span></li>`;
  }).join('');
  return `
    <li class="qcard">
      <div class="q-meta">
        <span class="q-num">SUAL № ${q.n}</span>
        <span class="spacer"></span>
        ${q.a ? '' : '<span class="chip chip--warn">Cavab açarı yoxdur</span>'}
      </div>
      <p class="q-text">${highlight(q.q, needle)}</p>
      <ul class="qcard-opts">${opts}</ul>
    </li>`;
}

function renderResult() {
  state.view = 'result';
  const s = currentSession();
  const r = score(s);
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const verdict = r.pct >= 85 ? 'Əla nəticə' : r.pct >= 65 ? 'Yaxşı nəticə' : r.pct >= 40 ? 'Təkrar lazımdır' : 'Bu blok üzərində işləyin';
  const retryCount = r.wrong + r.skipped;

  const groups = {
    wrong: { label: 'Səhv', test: (q, p) => q.a && p && p !== q.a },
    skipped: { label: 'Cavabsız', test: (q, p) => q.a && !p },
    right: { label: 'Düzgün', test: (q, p) => q.a && p === q.a },
    all: { label: 'Hamısı', test: () => true },
  };
  const items = s.ids.map((n) => [state.byNum.get(n), s.answers[n]]);
  const counts = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, items.filter(([q, p]) => g.test(q, p)).length]));
  if (!counts[state.reviewFilter]) state.reviewFilter = Object.keys(groups).find((k) => counts[k]) || 'all';
  const shown = items.filter(([q, p]) => groups[state.reviewFilter].test(q, p));

  app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner">
      <button class="icon-btn" data-act="home" aria-label="Ana səhifə">${ICON.back}</button>
      <div class="topbar-title">
        <strong>Nəticə · ${esc(s.title)}</strong>
        <span>${esc(s.range)} · ${MODES[s.mode].label}</span>
      </div>
    </div>
  </header>

  <div class="page">
    <section class="score">
      <svg class="ring" viewBox="0 0 124 124" role="img" aria-label="${r.pct} faiz">
        <circle class="track" cx="62" cy="62" r="${radius}"/>
        <circle class="val" cx="62" cy="62" r="${radius}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - r.pct / 100)}"/>
        <text x="62" y="62" text-anchor="middle" dominant-baseline="central">${r.pct}%</text>
      </svg>
      <div class="score-text">
        <span class="eyebrow">${verdict}</span>
        <strong>${r.correct} / ${r.total} düzgün</strong>
        ${r.unscored ? `<p>${r.unscored} sualın cavab açarı olmadığı üçün nəticəyə daxil edilməyib.</p>` : ''}
      </div>
    </section>

    <dl class="tiles">
      <div class="tile ok"><dt>Düzgün</dt><dd>${r.correct}</dd></div>
      <div class="tile bad"><dt>Səhv</dt><dd>${r.wrong}</dd></div>
      <div class="tile"><dt>Cavabsız</dt><dd>${r.skipped}</dd></div>
      <div class="tile warn"><dt>Açarsız</dt><dd>${r.unscored}</dd></div>
    </dl>

    <div class="actions">
      ${retryCount ? `<button class="btn btn--primary" data-act="retry">${ICON.redo}${r.skipped ? 'Səhv və cavabsızları' : 'Səhvləri'} təkrarla (${retryCount})</button>` : ''}
      <button class="btn" data-act="export">${ICON.export}Nəticəni ixrac et</button>
      <button class="btn" data-act="restart">${s.key === 'random' ? 'Yeni təsadüfi 50' : 'Yenidən başla'}</button>
      <button class="btn btn--ghost" data-act="home">Ana səhifə</button>
    </div>

    <section class="section" aria-labelledby="review-title">
      <h2 class="section-title" id="review-title">Cavabların təhlili</h2>
      <div class="chips-row" role="group" aria-label="Filtr">
        ${Object.entries(groups).map(([k, g]) => `
          <button class="filter" data-act="review" data-filter="${k}" aria-pressed="${state.reviewFilter === k}" ${counts[k] ? '' : 'disabled'}>
            ${g.label}<span class="mono">${counts[k]}</span>
          </button>`).join('')}
      </div>
      <ul class="qlist">${shown.map(([q, p]) => reviewCard(q, p)).join('') || '<li class="empty">Bu bölmədə sual yoxdur.</li>'}</ul>
    </section>
  </div>`;
  window.scrollTo({ top: 0 });
}

/* ---------- Browse ---------- */

function browseMatches() {
  const needle = fold(state.browse.query.trim());
  return state.questions.filter((q) => {
    if (state.browse.filter === 'mistakes' && state.stats[q.n] !== 'w') return false;
    if (state.browse.filter === 'nokey' && q.a) return false;
    if (state.browse.filter === 'num' && !q.num) return false;
    if (!needle) return true;
    if (String(q.n) === needle) return true;
    return fold(q.q).includes(needle) || LETTERS.some((l) => q.o[l] && fold(q.o[l]).includes(needle));
  });
}

function renderBrowse() {
  const first = state.view !== 'browse';
  state.view = 'browse';
  if (first) state.browse.shown = 40;
  const filters = {
    all: { label: 'Hamısı', count: state.questions.length },
    mistakes: { label: 'Səhvlərim', count: mistakeIds().length },
    num: { label: 'Rəqəmli', count: state.questions.filter((q) => q.num).length },
    nokey: { label: 'Açarsız', count: state.questions.length - state.scorable },
  };

  if (first) {
    app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <button class="icon-btn" data-act="home" aria-label="Ana səhifə">${ICON.back}</button>
        <div class="topbar-title">
          <strong>Sual bazası</strong>
          <span>${state.questions.length} sual · düzgün cavablar yaşıl</span>
        </div>
      </div>
    </header>
    <div class="page" style="padding-top:0;gap:12px">
      <div class="searchbar">
        <label class="search" for="q-search">
          ${ICON.search}
          <input id="q-search" type="search" inputmode="search" autocomplete="off" placeholder="Sual, cavab və ya nömrə axtarın" value="${esc(state.browse.query)}">
        </label>
        <div class="chips-row" role="group" aria-label="Filtr" id="browse-filters"></div>
      </div>
      <p class="result-count" id="browse-count"></p>
      <ul class="qlist" id="browse-list"></ul>
      <button class="btn more" id="browse-more" data-act="more">Daha çox göstər</button>
    </div>`;
    window.scrollTo({ top: 0 });
  }

  document.getElementById('browse-filters').innerHTML = Object.entries(filters).map(([k, f]) => `
    <button class="filter" data-act="bfilter" data-filter="${k}" aria-pressed="${state.browse.filter === k}">
      ${f.label}<span class="mono">${f.count}</span>
    </button>`).join('');

  const matches = browseMatches();
  const needle = fold(state.browse.query.trim());
  const list = matches.slice(0, state.browse.shown);
  document.getElementById('browse-count').textContent = state.browse.query.trim()
    ? `${matches.length} nəticə tapıldı`
    : `${matches.length} sual`;
  document.getElementById('browse-list').innerHTML = list.length
    ? list.map((q) => reviewCard(q, undefined, needle)).join('')
    : '<li class="empty">Heç nə tapılmadı. Başqa söz yoxlayın.</li>';
  document.getElementById('browse-more').hidden = matches.length <= state.browse.shown;
}

let searchTimer = 0;
function onSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.browse.query = value;
    state.browse.shown = 40;
    renderBrowse();
  }, 140);
}

/* ---------- Export ---------- */

const STATUS = { right: 'düzgün', wrong: 'SƏHV', skipped: 'cavabsız', nokey: 'açar yoxdur' };
const upper = (l) => (l ? l.toUpperCase() : '—');
const optionLine = (q, l) => (l && q.o[l] ? `${l.toUpperCase()}) ${q.o[l]}` : '—');
const rowsWith = (rep, status) => rep.rows.filter((r) => r.status === status);

function stamp(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { human: `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`, day };
}

function fileName(rep, ext) {
  const slug = fold(rep.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `SD-${slug}-${stamp().day}.${ext}`;
}

function sessionReport(s) {
  const r = score(s);
  const rows = s.base.map((n) => {
    const q = state.byNum.get(n);
    const picked = s.answers[n];
    const status = !q.a ? 'nokey' : !picked ? 'skipped' : picked === q.a ? 'right' : 'wrong';
    return { q, status };
  });
  return {
    title: s.title,
    meta: `${s.range.startsWith('Sual') ? `${s.range} · ` : ''}${s.ids.length} sual · ${MODES[s.mode].label} rejimi`,
    headline: `${r.correct} / ${r.total} düzgün (${r.pct}%)`,
    summary: [['Düzgün', r.correct], ['Səhv', r.wrong], ['Cavabsız', r.skipped], ['Açarsız', r.unscored]],
    rows,
  };
}

function overallReport() {
  const o = overall();
  const rows = state.questions
    .filter((q) => q.a && state.stats[q.n])
    .map((q) => ({ q, status:state.stats[q.n] === 'c' ? 'right' : 'wrong' }));
  return {
    title: 'Ümumi nəticə',
    meta: 'Bütün testlər üzrə hər sualın son cavabı',
    headline: `${o.c} / ${state.scorable} sual düzgün (${pct(o.c, state.scorable)}%)`,
    summary: [['Düzgün', o.c], ['Səhv', o.w], ['Hələ cavablanmayıb', o.rest]],
    rows,
  };
}

function numberLines(rep) {
  const wrong = rowsWith(rep, 'wrong').map((r) => r.q.n);
  const skipped = rowsWith(rep, 'skipped').map((r) => r.q.n);
  const lines = [wrong.length ? `Səhv (${wrong.length}): ${wrong.join(', ')}` : 'Səhv sual yoxdur.'];
  if (skipped.length) lines.push(`Cavabsız (${skipped.length}): ${skipped.join(', ')}`);
  return lines;
}

function reportText(rep) {
  const out = [
    `ŞD Suallar · ${rep.title}`,
    rep.meta,
    `Tarix: ${stamp().human}`,
    '',
    `Nəticə: ${rep.headline}`,
    rep.summary.map(([k, v]) => `${k}: ${v}`).join(' · '),
    '',
    ...numberLines(rep),
  ];
  const detail = (heading, list) => {
    if (!list.length) return;
    out.push('', '', heading, '='.repeat(heading.length));
    for (const { q } of list) {
      out.push('', `№ ${q.n}. ${q.q}`);
      out.push(`   Düzgün cavab: ${optionLine(q, q.a)}`);
    }
  };
  detail('SƏHV CAVABLAR', rowsWith(rep, 'wrong'));
  detail('CAVABSIZ SUALLAR', rowsWith(rep, 'skipped'));
  out.push('', '', 'BÜTÜN CAVABLAR', '==============', 'Sual   Düzgün  Nəticə');
  for (const { q, status } of rep.rows) {
    out.push(`${String(q.n).padEnd(6)} ${upper(q.a).padEnd(7)} ${STATUS[status]}`);
  }
  return out.join('\n') + '\n';
}

// Simple selectors only, so Word's HTML import understands them too.
function reportCss(scope = '') {
  return [
    ['', 'font-family: Arial, "Segoe UI", sans-serif; color: #111; font-size: 11pt; line-height: 1.4;'],
    ['h1', 'font-size: 18pt; margin: 0 0 4pt;'],
    ['h2', 'font-size: 13pt; margin: 18pt 0 6pt; padding-bottom: 2pt; border-bottom: 1px solid #999;'],
    ['p', 'margin: 3pt 0;'],
    ['.rp-meta', 'color: #555;'],
    ['.rp-score', 'font-size: 15pt; font-weight: bold; margin-top: 10pt;'],
    ['.rp-num', 'font-family: "Courier New", monospace; font-size: 11pt;'],
    ['.rp-q', 'margin: 0 0 10pt; page-break-inside: avoid;'],
    ['.rp-bad', 'color: #b8322a;'],
    ['.rp-ok', 'color: #18794a;'],
    ['table', 'border-collapse: collapse; width: 100%; font-size: 10pt;'],
    ['th, td', 'border: 1px solid #bbb; padding: 3pt 6pt; text-align: left;'],
    ['th', 'background: #eee;'],
  ].map(([sel, body]) => {
    const target = sel ? sel.split(',').map((s) => `${scope} ${s.trim()}`.trim()).join(', ') : scope || 'body';
    return `${target} { ${body} }`;
  }).join('\n');
}

function reportHtml(rep) {
  const detail = (heading, list) => (list.length ? `
    <h2>${heading} (${list.length})</h2>
    ${list.map(({ q }) => `
      <div class="rp-q">
        <p><b>№ ${q.n}.</b> ${esc(q.q)}</p>
        <p class="rp-ok">Düzgün cavab: ${esc(optionLine(q, q.a))}</p>
      </div>`).join('')}` : '');
  return `
    <h1>ŞD Suallar · ${esc(rep.title)}</h1>
    <p class="rp-meta">${esc(rep.meta)} · ${stamp().human}</p>
    <p class="rp-score">${esc(rep.headline)}</p>
    <p>${rep.summary.map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(' · ')}</p>
    ${numberLines(rep).map((l) => `<p class="rp-num">${esc(l)}</p>`).join('')}
    ${detail('Səhv cavablar', rowsWith(rep, 'wrong'))}
    ${detail('Cavabsız suallar', rowsWith(rep, 'skipped'))}
    <h2>Bütün cavablar</h2>
    <table>
      <thead><tr><th>Sual</th><th>Düzgün</th><th>Nəticə</th></tr></thead>
      <tbody>${rep.rows.map(({ q, status }) => `
        <tr><td>${q.n}</td><td>${upper(q.a)}</td><td${status === 'wrong' ? ' class="rp-bad"' : ''}>${STATUS[status]}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

function reportDoc(rep) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>ŞD Suallar · ${esc(rep.title)}</title><style>${reportCss()}</style></head>
<body>${reportHtml(rep)}</body>
</html>`;
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob(['﻿', content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// The browser's print dialog offers "Save as PDF" on Android, iOS and desktop.
function printReport(rep) {
  printRoot.innerHTML = `<style>${reportCss('#print-root')}\n@page { margin: 14mm; }</style>${reportHtml(rep)}`;
  const title = document.title;
  document.title = fileName(rep, 'pdf').replace(/\.pdf$/, ''); // default PDF file name
  window.addEventListener('afterprint', () => { document.title = title; }, { once: true });
  window.print();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    (dlg.open ? dlg : document.body).append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
    ta.remove();
    return ok;
  }
}

function openExport(rep) {
  const nums = numberLines(rep).join('\n');
  const shareText = `ŞD Suallar · ${rep.title} (${rep.meta})\n${nums}`;
  openDialog(`
    <div class="dlg-head">
      <h2>İxrac · ${esc(rep.title)}</h2>
      <button class="icon-btn" data-dlg="close" aria-label="Bağla">${ICON.close}</button>
    </div>
    <div class="dlg-body export">
      <p class="export-label">Səhv sualların nömrələri</p>
      <pre class="export-nums" id="export-nums">${esc(nums)}</pre>
      <div class="export-row">
        <button class="btn" data-x="copy">${ICON.copy}<span>Kopyala</span></button>
        ${typeof navigator.share === 'function' ? `<button class="btn" data-x="share">${ICON.share}<span>Paylaş</span></button>` : ''}
      </div>
      <p class="export-label">Tam hesabat</p>
      <div class="export-files">
        <button class="file-btn" data-x="pdf"><strong>PDF</strong><span>Açılan pəncərədə “PDF kimi saxla” seçin</span></button>
        <button class="file-btn" data-x="doc"><strong>Word</strong><span>.doc faylı yüklə</span></button>
        <button class="file-btn" data-x="txt"><strong>TXT</strong><span>Sadə mətn faylı yüklə</span></button>
      </div>
      <p class="fine">Hesabatda nəticə, səhv və cavabsız suallar düzgün cavabları ilə, və bütün cavabların cədvəli var.</p>
    </div>`, 'sheet');

  dlg.onclick = async (e) => {
    if (e.target.closest('[data-dlg="close"]') || e.target === dlg) return closeDialog();
    const btn = e.target.closest('[data-x]');
    if (!btn) return;
    switch (btn.dataset.x) {
      case 'copy': {
        const ok = await copyText(shareText);
        const label = btn.querySelector('span');
        label.textContent = ok ? 'Kopyalandı' : 'Əl ilə kopyalayın';
        if (!ok) getSelection().selectAllChildren(document.getElementById('export-nums'));
        setTimeout(() => { label.textContent = 'Kopyala'; }, 2000);
        break;
      }
      case 'share':
        try { await navigator.share({ title: `ŞD Suallar · ${rep.title}`, text: shareText }); } catch { /* cancelled */ }
        break;
      case 'pdf':
        closeDialog();
        printReport(rep);
        break;
      case 'doc':
        download(fileName(rep, 'doc'), reportDoc(rep), 'application/msword');
        break;
      case 'txt':
        download(fileName(rep, 'txt'), reportText(rep), 'text/plain;charset=utf-8');
        break;
      default:
    }
  };
}

/* ---------- Dialogs ---------- */

function openDialog(html, variant = '') {
  dlg.className = variant;
  dlg.innerHTML = html;
  dlg.onclick = null;
  dlg.oncancel = null;
  if (!dlg.open) dlg.showModal();
}

function closeDialog() {
  if (dlg.open) dlg.close();
}

function confirmDialog({ title, body, ok, cancel = 'Ləğv et', danger = false }) {
  return new Promise((resolve) => {
    openDialog(`
      <div class="dlg-head"><h2>${esc(title)}</h2></div>
      <div class="dlg-body"><p>${esc(body)}</p></div>
      <div class="dlg-actions">
        <button class="btn" data-dlg="cancel">${esc(cancel)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-dlg="ok">${esc(ok)}</button>
      </div>`);
    const done = (value) => {
      closeDialog();
      resolve(value);
    };
    dlg.onclick = (e) => {
      if (e.target.closest('[data-dlg="ok"]')) done(true);
      else if (e.target.closest('[data-dlg="cancel"]') || e.target === dlg) done(false);
    };
    // Esc key. (The async "close" event can't be used: it also fires for the previous dialog.)
    dlg.oncancel = (e) => {
      e.preventDefault();
      done(false);
    };
  });
}

/* ---------- Events ---------- */

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;

  switch (act) {
    case 'open': return openBlock(el.dataset.key);
    case 'plan':
      state.settings.plan = el.dataset.plan;
      saveSettings();
      return renderHome();
    case 'mode':
      state.settings.mode = el.dataset.mode;
      saveSettings();
      return renderHome();
    case 'theme': return cycleTheme();
    case 'mistakes': return startMistakes();
    case 'reset': {
      const ok = await confirmDialog({
        title: 'Nəticələri sıfırlamaq?',
        body: 'Bütün testlərin irəliləyişi, ən yaxşı nəticələr və səhvlər siyahısı silinəcək.',
        ok: 'Sıfırla',
        danger: true,
      });
      if (!ok) return;
      state.sessions = {};
      state.stats = {};
      state.picks = {};
      state.best = {};
      saveSessions();
      saveStats();
      saveBest();
      return renderHome();
    }
    case 'home': return go('#/', true);
    case 'pick': return pick(el.dataset.letter);
    case 'prev': return move(-1);
    case 'next': return move(1);
    case 'nav': return openNavigator();
    case 'export': return openExport(sessionReport(currentSession()));
    case 'export-all': return openExport(overallReport());
    case 'retry': return retryWrong(state.key);
    case 'restart': return restart(state.key);
    case 'review':
      state.reviewFilter = el.dataset.filter;
      return renderResult();
    case 'bfilter':
      state.browse.filter = el.dataset.filter;
      state.browse.shown = 40;
      return renderBrowse();
    case 'more':
      state.browse.shown += 40;
      return renderBrowse();
    default:
  }
});

app.addEventListener('change', (e) => {
  if (e.target.id === 'shuffle') {
    state.settings.shuffle = e.target.checked;
    saveSettings();
  }
});

app.addEventListener('input', (e) => {
  if (e.target.id === 'q-search') onSearch(e.target.value);
});

document.addEventListener('keydown', (e) => {
  if (state.view !== 'quiz' || isOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches?.('input, textarea')) return;
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
  const key = e.key.toLowerCase();
  const byDigit = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' }[key];
  const letter = LETTERS.includes(key) ? key : byDigit;
  const q = state.byNum.get(currentSession().ids[currentSession().index]);
  if (letter && q.o[letter]) { e.preventDefault(); pick(letter); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
});

// Horizontal swipe between questions.
let touch = null;
app.addEventListener('touchstart', (e) => {
  if (state.view !== 'quiz' || e.touches.length !== 1) return;
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
app.addEventListener('touchend', (e) => {
  if (!touch || state.view !== 'quiz') return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  const fast = Date.now() - touch.t < 600;
  touch = null;
  if (!fast || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
  const s = currentSession();
  const step = dx < 0 ? 1 : -1;
  if (s.index + step < s.ids.length) move(step);
}, { passive: true });

window.addEventListener('hashchange', route);

/* ---------- Boot ---------- */

async function boot() {
  try {
    const res = await fetch('data/questions.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.questions = await res.json();
  } catch (err) {
    const local = location.protocol === 'file:';
    app.innerHTML = `
      <div class="error">
        <div>
          <strong>Suallar yüklənmədi</strong>
          ${local
            ? 'Faylı birbaşa açmaq olmur. Qovluqda <code>python3 -m http.server</code> işə salın və <code>http://localhost:8000</code> ünvanını açın.'
            : 'İnternet bağlantısını yoxlayıb səhifəni yeniləyin.'}
        </div>
      </div>`;
    console.error(err);
    return;
  }

  for (const q of state.questions) state.byNum.set(q.n, q);
  state.scorable = state.questions.filter((q) => q.a).length;
  buildBlocks();

  // Drop saved sessions that point at questions that no longer exist.
  for (const [key, s] of Object.entries(state.sessions)) {
    if (!s?.ids?.length || !s.ids.every((n) => state.byNum.has(n))) delete state.sessions[key];
  }
  saveSessions();

  route();
}

boot();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
