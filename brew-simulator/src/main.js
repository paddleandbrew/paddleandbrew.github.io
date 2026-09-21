// App shell: boots the solver worker, loads the store, routes the nine screens.
import { Engine } from './engine.js';
import { makeStore, emptyDoc, uid } from './store.js';
import { esc, toast } from './ui.js';
import * as quick from './screens/quick.js';
import * as setup from './screens/setup.js';
import * as simulate from './screens/simulate.js';
import * as results from './screens/results.js';
import * as log from './screens/log.js';
import * as calibrate from './screens/calibrate.js';
import * as bench from './screens/bench.js';

const SCREENS = {
  '/quick': quick.QuickStart,
  '/quick-result': quick.QuickResult,
  '/setup': setup.Setup,
  '/simulate': simulate.Simulate,
  '/cutaway': simulate.Cutaway,
  '/results': results.Results,
  '/log': log.LogBrew,
  '/calibrate': calibrate.Calibrate,
  '/bench': bench.Bench,
};

const app = document.getElementById('app');
const engine = new Engine();
const store = makeStore();
const query = new URLSearchParams(location.search);

const ctx = {
  engine,
  store,
  state: emptyDoc(),
  mem: { run: null, runKey: null, bands: null, bandsKey: null, search: null, searchKey: null, pairRuns: {}, selected: null, play: { k: 0, playing: false, speed: 1 } },
  // Inference method is switchable with ?method=ls|bayes (default least squares), per the plan.
  method: /^bayes/i.test(query.get('method') || '') ? 'bayesian' : 'least_squares',
  navigate(hash) { location.hash = hash; },
  async save() { await store.save(ctx.state); },
  setupId() { return (ctx.state.inputs && ctx.state.inputs.setup_id) || 'default'; },
  fit() { return ctx.state.fits[ctx.setupId()] || null; },
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
  async runSim(inputs = ctx.state.inputs, force = false) {
    const key = JSON.stringify([ctx.state.configName, inputs, ctx.overrides()]);
    if (!force && ctx.mem.runKey === key && ctx.mem.run) return ctx.mem.run;
    const run = await engine.call('simulate', ctx.state.configName, inputs, ctx.overrides(), true);
    ctx.mem.run = run; ctx.mem.runKey = key; ctx.mem.play.k = 0;
    // Stamp a run record (summary only) so every prediction is on the record.
    const rec = { id: uid('run'), created_at: new Date().toISOString(), inputs, config_hash: run.result.config_hash, config_name: run.result.config_name, solver_version: run.result.solver_version, summary: run.result.summary, params: run.result.params, log_id: null };
    ctx.state.runs = [rec, ...ctx.state.runs].slice(0, 50);
    ctx.mem.lastRunId = rec.id;
    await ctx.save();
    return run;
  },
  async bandsFor(inputs = ctx.state.inputs, n = 16) {
    const src = ctx.bandSource();
    const key = JSON.stringify([ctx.state.configName, inputs, src.vary, ctx.overrides(), n]);
    if (ctx.mem.bandsKey === key && ctx.mem.bands) return ctx.mem.bands;
    const b = await engine.call('prediction_bands', ctx.state.configName, inputs, ctx.overrides(), { n, seed: 7, fast: true, source: src.source, vary: src.vary });
    ctx.mem.bands = b; ctx.mem.bandsKey = key;
    return b;
  },
  toast: (m, k) => toast(app, m, k),
};

function route() {
  const hash = location.hash.replace(/^#/, '') || '/quick';
  const path = hash.split('?')[0];
  const Screen = SCREENS[path] || SCREENS['/quick'];
  if (ctx.cleanup) { try { ctx.cleanup(); } catch (e) { /* ignore */ } ctx.cleanup = null; }
  app.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'app';
  const isPhone = ['/quick', '/quick-result', '/log'].includes(path);
  if (!isPhone) shell.appendChild(header(path));
  const main = document.createElement('div');
  main.className = 'main';
  shell.appendChild(main);
  if (!isPhone) shell.appendChild(footer());
  app.appendChild(shell);
  try {
    const cleanup = Screen(main, ctx);
    ctx.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="page"><div class="status err">This screen failed to render: ${esc(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

function header(path) {
  const h = document.createElement('header');
  h.className = 'hdr';
  const inp = ctx.state.inputs;
  const desc = inp ? `${esc(inp.brewer.name)} · ${inp.recipe.dose_g.toFixed(1)} g : ${inp.recipe.pours[inp.recipe.pours.length - 1].water_to_g.toFixed(0)} g · ${Math.round(inp.temperature.t0 ?? (inp.temperature.points ? inp.temperature.points[0][1] : 93))} °C` : '';
  const sim = path === '/cutaway' ? '/simulate' : path;
  h.innerHTML = `<div class="row" style="gap:28px"><a href="#/quick" class="brand">Brew Simulator</a>
    <nav>${[['/setup', 'Setup'], ['/simulate', 'Simulate'], ['/results', 'Results'], ['/calibrate', 'Calibrate'], ['/bench', 'Bench']].map(([p, l]) => `<a href="#${p}" class="${sim === p ? 'on' : ''}">${l}</a>`).join('')}</nav>
    ${path === '/simulate' ? '<a href="#/cutaway" class="btn hide-phone" style="height:36px">Open cutaway</a>' : ''}</div>
    <div class="right"><span class="desc">${desc}</span>${ctx.state.sampleData ? '<span class="pill">Sample data</span>' : ''}<span class="pill">Tier ${inp ? inp.tier : '–'} inputs</span></div>`;
  return h;
}

function footer() {
  const f = document.createElement('footer');
  f.className = 'foot';
  const i = engine.info || {};
  f.innerHTML = `<span>Solver ${esc(i.solver || '')} · ${i.params || 0} parameters · ${i.modules || 0} modules · config <b>${esc(typeof ctx.state.configName === 'string' ? ctx.state.configName : ctx.state.configName.name)}</b> · storage ${store.kind()} · inference ${ctx.method === 'bayesian' ? 'Bayesian (?method=bayes)' : 'least squares (?method=ls)'}</span><span>Solid fill or line: solver state. Dashed or hatched: illustrative.</span>`;
  return f;
}

async function boot() {
  try {
    ctx.state = await store.load();
    await engine.ready;
    if (!ctx.state.inputs) {
      ctx.state.inputs = await engine.call('sample_inputs');
      ctx.state.sampleData = true;
      await ctx.save();
    }
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="boot"><div class="boot-title">Brew Simulator</div><div class="status err" style="max-width:520px;margin:16px auto">The solver could not start: ${esc(e.message)}. Build it with <code>wasm-pack build crates/brew-wasm --target web --out-dir ../../web/pkg</code> and serve the <code>web</code> folder over HTTP.</div></div>`;
  }
}

window.brew = ctx; // for debugging in the console
boot();
