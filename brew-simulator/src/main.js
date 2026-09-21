// App shell: boots the solver worker, opens the store, routes the nine screens.
//
// The shell is four stable containers — header, intro, screen, footer — each rendered by its own
// lit-html call. A screen owns only `.main`, so the header can refresh when the inputs change
// without disturbing whatever the screen has on screen, and a screen re-render never rebuilds the
// chrome around it.
import { html, render } from '../vendor/lit-html/lit-html.js';
import { Engine } from './engine.js';
import { makeStore, Db, uid } from './store.js';
import { toast, on, toggleInfo } from './ui.js';
import * as quick from './screens/quick.js';
import * as setup from './screens/setup.js';
import * as simulate from './screens/simulate.js';
import * as recipeSearch from './screens/recipe-search.js';
import * as log from './screens/log.js';
import * as calibrate from './screens/calibrate.js';
import * as bench from './screens/bench.js';
import { SCREEN } from './info.js';

const SCREENS = {
  '/quick': quick.QuickStart,
  '/quick-result': quick.QuickResult,
  '/setup': setup.Setup,
  '/simulate': simulate.Simulate,
  '/cutaway': simulate.Cutaway,
  '/recipe-search': recipeSearch.RecipeSearch,
  '/log': log.LogBrew,
  '/calibrate': calibrate.Calibrate,
  '/bench': bench.Bench,
};

const NAV = [['/setup', 'Setup'], ['/simulate', 'Simulate'], ['/recipe-search', 'Recipe search'], ['/calibrate', 'Calibrate'], ['/bench', 'Bench']];

const app = document.getElementById('app');
const engine = new Engine();
const db = new Db(makeStore());
const query = new URLSearchParams(location.search);

// Built once, then reused for the life of the page.
app.replaceChildren();
const shell = document.createElement('div');
shell.className = 'app';
const hdrEl = document.createElement('header');
hdrEl.className = 'hdr';
const introEl = document.createElement('div');
const mainEl = document.createElement('div');
mainEl.className = 'main';
const footEl = document.createElement('footer');
footEl.className = 'foot';
shell.append(hdrEl, introEl, mainEl, footEl);
app.append(shell);

const ctx = {
  engine,
  db,
  get settings() { return db.settings; },
  get inputs() { return db.settings.inputs; },
  runs() { return db.all('runs'); },
  logs() { return db.all('logs'); },
  verdicts() { return db.all('verdicts'); },
  get configName() { return db.settings.configName; },
  mem: { run: null, runKey: null, bands: null, bandsKey: null, search: null, searchKey: null, pairRuns: {}, selected: null, play: { k: 0, t: 0, playing: false, speed: 1 } },
  // Inference method is switchable with ?method=ls|bayes (default least squares), per the plan.
  method: /^bayes/i.test(query.get('method') || '') ? 'bayesian' : 'least_squares',
  navigate(hash) { location.hash = hash; },
  async patch(fields) { await db.patchSettings(fields); paintChrome(); },
  async setInputs(inputs, { sample = false } = {}) { await ctx.patch({ inputs, sampleData: sample }); },
  setupId() { return (db.settings.inputs && db.settings.inputs.setup_id) || 'default'; },
  fit() { return db.fit(ctx.setupId()); },
  overrides() {
    const f = ctx.fit();
    if (!f) return null;
    return Object.fromEntries(f.parameters.map((p) => [p.name, p.value]));
  },
  bandSource() {
    const f = ctx.fit();
    if (f && f.samples && f.samples.length) return { source: { Samples: f.samples }, vary: f.parameters.map((p) => p.name) };
    return { source: { Prior: { width_frac: 0.5 } }, vary: ['perm_scale', 'k_kinetic', 'bypass_coeff', 'fines_mobilisation_rate', 'max_extractable'] };
  },
  async runSim(inputs = db.settings.inputs, force = false) {
    const key = JSON.stringify([db.settings.configName, inputs, ctx.overrides()]);
    if (!force && ctx.mem.runKey === key && ctx.mem.run) return ctx.mem.run;
    const run = await engine.call('simulate', db.settings.configName, inputs, ctx.overrides(), true);
    ctx.mem.run = run; ctx.mem.runKey = key; ctx.mem.play.k = 0; ctx.mem.play.t = 0;
    // Stamp a run record (summary only) so every prediction is on the record. Records are one row
    // each in the store now, so the list is no longer capped to keep a single document small.
    const rec = { id: uid('run'), created_at: new Date().toISOString(), inputs, config_hash: run.result.config_hash, config_name: run.result.config_name, solver_version: run.result.solver_version, summary: run.result.summary, params: run.result.params, log_id: null };
    await db.put('runs', rec);
    ctx.mem.lastRunId = rec.id;
    return run;
  },
  async bandsFor(inputs = db.settings.inputs, n = 16) {
    const src = ctx.bandSource();
    const key = JSON.stringify([db.settings.configName, inputs, src.vary, ctx.overrides(), n]);
    if (ctx.mem.bandsKey === key && ctx.mem.bands) return ctx.mem.bands;
    const b = await engine.call('prediction_bands', db.settings.configName, inputs, ctx.overrides(), { n, seed: 7, fast: true, source: src.source, vary: src.vary });
    ctx.mem.bands = b; ctx.mem.bandsKey = key;
    return b;
  },
  toast: (m, k) => toast(app, m, k),
};

function headerTpl(path) {
  const inp = db.settings.inputs;
  const desc = inp ? `${inp.brewer.name} · ${inp.recipe.dose_g.toFixed(1)} g : ${inp.recipe.pours[inp.recipe.pours.length - 1].water_to_g.toFixed(0)} g · ${Math.round(inp.temperature.t0 ?? (inp.temperature.points ? inp.temperature.points[0][1] : 93))} °C` : '';
  const sim = path === '/cutaway' ? '/simulate' : path;
  return html`<div class="row hdr-left"><a href="#/quick" class="brand">Brew Simulator</a>
    <nav>${NAV.map(([p, l]) => html`<a href="#${p}" class=${sim === p ? 'on' : ''}>${l}</a>`)}</nav>
    ${path === '/simulate' ? html`<a href="#/cutaway" class="btn hide-phone" style="height:36px">Open cutaway</a>` : ''}</div>
    <div class="right"><span class="desc">${desc}</span>${db.settings.sampleData ? html`<span class="pill">Sample data</span>` : ''}<span class="pill">Tier ${inp ? inp.tier : '–'} inputs</span></div>`;
}

// One line under the header saying what the screen is for. The panels explain themselves through
// their own (i) buttons; this answers the question before any of them, on the way in.
function introTpl(path, isFlow) {
  if (isFlow || !SCREEN[path]) return '';
  return html`<p>${SCREEN[path]}</p>`;
}

function footerTpl() {
  const i = engine.info || {};
  const cfg = db.settings.configName;
  return html`<span>Solver ${i.solver || ''} · ${i.params || 0} parameters · ${i.modules || 0} modules · config <b>${typeof cfg === 'string' ? cfg : cfg.name}</b> · storage ${db.store.kind()} · inference ${ctx.method === 'bayesian' ? 'Bayesian (?method=bayes)' : 'least squares (?method=ls)'}</span><span>Solid fill or line: solver state. Dashed or hatched: illustrative.</span>`;
}

let currentPath = '/quick';
function paintChrome() {
  const isFlow = ['/quick', '/quick-result', '/log'].includes(currentPath);
  render(headerTpl(currentPath), hdrEl);
  introEl.className = isFlow || !SCREEN[currentPath] ? '' : 'intro';
  render(introTpl(currentPath, isFlow), introEl);
  render(footerTpl(), footEl);
}

function route() {
  const hash = location.hash.replace(/^#/, '') || '/quick';
  const path = hash.split('?')[0];
  const Screen = SCREENS[path] || SCREENS['/quick'];
  if (ctx.cleanup) { try { ctx.cleanup(); } catch (e) { /* ignore */ } ctx.cleanup = null; }
  currentPath = path;
  // The three phone-first screens (quick start, its result, the log) are one narrow column of flow.
  // They keep the app chrome on a wide screen, so moving between them and the dashboards is not a
  // jump between two different apps; the stylesheet drops the chrome again on a phone.
  const isFlow = ['/quick', '/quick-result', '/log'].includes(path);
  shell.className = isFlow ? 'app flow' : 'app';
  paintChrome();
  // Not cleared by hand: lit keeps its part state on the container, and detaching those markers
  // behind its back leaves the next render inserting against a null parent. Rendering a different
  // template into the same container is what drops the previous screen's DOM.
  try {
    const cleanup = Screen(mainEl, ctx);
    ctx.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (e) {
    console.error(e);
    render(html`<div class="page"><div class="status err">This screen failed to render: ${e.message}</div></div>`, mainEl);
  }
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    await db.open();
    await engine.ready;
    if (!db.settings.inputs) {
      await ctx.patch({ inputs: await engine.call('sample_inputs'), sampleData: true });
    }
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    console.error(e);
    // The shell was appended with DOM APIs and lit has never rendered into `app` itself, so this
    // clear is safe: there is no part state here to invalidate.
    app.replaceChildren();
    render(html`<div class="boot"><div class="boot-title">Brew Simulator</div><div class="status err" style="max-width:520px;margin:16px auto">The solver could not start: ${e.message}. Build it with <code>wasm-pack build crates/brew-wasm --target web --out-dir ../../web/pkg</code> and serve the <code>web</code> folder over HTTP.</div></div>`, app);
  }
}

// One delegated handler for every (i) button on every screen: the note it names is already in the
// DOM, hidden, so opening it is a class away and screens need to know nothing about it. The open
// set in ui.js is the source of truth, so the next render of that screen agrees with this toggle.
on(app, 'click', '[data-info]', (_, el) => {
  const key = el.dataset.info;
  const open = toggleInfo(key);
  const note = app.querySelector(`[data-info-body="${CSS.escape(key)}"]`);
  if (note) note.classList.toggle('open', open);
  el.setAttribute('aria-expanded', String(open));
});

window.brew = ctx; // for debugging in the console
boot();
