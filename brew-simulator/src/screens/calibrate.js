// Calibration: predicted against logged for this setup, what the fit took from it, what got pinned down.
import { html, render } from '../../vendor/lit-html/lit-html.js';
import { unsafeHTML } from '../../vendor/lit-html/directives/unsafe-html.js';
import { on, fmtTime, f0, f2, words, infoBtn, infoNote } from '../ui.js';
import { strengthByBrew, rangeBars } from '../draw.js';

const SIGMA_TDS = 0.04; // registry sigma_tds, the observation noise used for the per-brew band

export function Calibrate(root, ctx) {
  const setupId = ctx.setupId();
  const logs = () => ctx.logs().filter((l) => (l.inputs.setup_id || 'default') === setupId);
  let alive = true, off = [];
  let fit = ctx.fit();
  let explanation = null, priorBands = null, fitBands = null, status = null;

  const stale = () => !fit || fit.n_brews !== logs().length || ctx.mem.fitStale || fit.method !== ctx.method;

  const verdict = (r, ok) => (r ? (ok ? html`<span class="verdict ok">in band</span>` : html`<span class="verdict bad">${r.observable === 'total_time_s' ? (r.observed > r.predicted ? 'slow' : 'fast') : r.observed > r.predicted ? 'high' : 'low'}</span>`) : html`<span class="muted">–</span>`);

  const paint = () => render(tpl(), root);

  const tpl = () => {
    const ls = logs();
    const last = fit && fit.checks.length ? fit.checks[fit.checks.length - 1] : null;
    const res = (name) => last && last.residuals.residuals.find((r) => r.observable === name);
    const rows = fit ? fit.checks.map((c, k) => { const t = c.residuals.residuals.find((r) => r.observable === 'tds_pct'); const pred = t ? t.predicted : NaN; return { label: `${k + 1}`, pred, lo: pred - 2 * SIGMA_TDS, hi: pred + 2 * SIGMA_TDS, logged: t ? t.observed : NaN }; }) : [];
    const counts = fit ? { time: [fit.checks.filter((c) => c.time_in_band === true).length, fit.checks.filter((c) => c.time_in_band != null).length], tds: [fit.checks.filter((c) => c.tds_in_band === true).length, fit.checks.filter((c) => c.tds_in_band != null).length], bed: [fit.checks.filter((c) => c.bed_correct === true).length, fit.checks.filter((c) => c.bed_correct != null).length] } : null;
    const bandHalf = (b) => (b ? (b.tds_pct.p90 - b.tds_pct.p10) / 2 : NaN);
    const bedRes = res('bed_shape');
    return html`<div class="page three">
      <aside class="col">
        <div class="card"><h3>${ls.length ? `Brew ${ls.length} · predicted against logged` : 'No logged brews yet'}</h3>
          ${last ? html`<div class="numgrid"><div></div><div class="h">Pred.</div><div class="h">Logged</div>
            ${[['Time', 'total_time_s', fmtTime], ['TDS', 'tds_pct', f2], ['Cup', 'cup_mass_g', (v) => `${f0(v)} g`]].map(([l, n, f]) => { const r = res(n); return r ? html`<div>${l}</div><div class="v">${f(r.predicted)}</div><div class="v">${f(r.observed)} ${verdict(r, Math.abs(r.z) < 2)}</div>` : ''; })}
            ${bedRes ? html`<div>Bed</div><div class="v">${words(bedOf(bedRes.predicted))}</div><div class="v">${words(bedOf(bedRes.observed))} <span class="verdict ${bedRes.z === 0 ? 'ok' : 'bad'}">${bedRes.z === 0 ? 'match' : 'miss'}</span></div>` : ''}</div>`
            : html`<div class="small muted">Log a brew of this setup (${setupId}) and the model updates itself here.</div><a href="#/log" class="btn">Log a brew</a><button class="btn" data-demo>Add five sample brews</button>`}
        </div>
        ${fit ? html`<div class="card"><h3>What the model took from it</h3>${explanation ? explanation.paragraphs.map((p) => html`<div style="font-size:13px;line-height:1.5">${p}</div>`) : html`<div class="small muted">…</div>`}${explanation ? html`<div class="small muted"><span class="verdict ${explanation.check.ok ? 'ok' : 'bad'}">${explanation.check.ok ? 'no invented numbers' : `check failed: ${explanation.check.invented.join(', ')}`}</span></div>` : ''}</div>
        <div class="card"><h3>Model checks on your data</h3>
          ${[['Logged time inside band', counts.time], ['Logged TDS inside band', counts.tds], ['Bed shape called correctly', counts.bed]].map(([l, [a, n]]) => html`<div class="kv"><span>${l}</span><span class="v">${n ? `${a} of ${n}` : 'no data'}</span></div><div class="bar"><div style="width:${n ? Math.round((100 * a) / n) : 0}%"></div></div>`)}
          <div class="small muted">${counts.tds[1] >= 3 && counts.tds[0] / counts.tds[1] < 0.6 ? 'Bands are not covering your brews: they are being widened and flagged, never refitted quietly to look right.' : 'If bands stop covering your brews, the screen says so and widens them. It never quietly refits to look right.'}</div></div>` : ''}
      </aside>
      <main class="col">
        ${status ? html`<div class="status">${status}</div>` : ''}
        <section class="card"><div class="row between wrap"><h3>Cup strength, brew by brew</h3><div class="row small"><span class="legend"><span class="swatch" style="background:#A8323A;opacity:0.35;height:10px"></span>Predicted band (2σ)</span><span class="legend"><span class="swatch" style="width:10px;height:10px;border-radius:50%;background:#211B17"></span>Logged</span></div></div>
          ${rows.length ? unsafeHTML(strengthByBrew(rows, fitBands ? { lo: fitBands.tds_pct.p10, hi: fitBands.tds_pct.p90 } : null)) : html`<div class="small muted">Nothing to plot yet.</div>`}</section>
        <section class="card"><div class="row between wrap"><div class="row"><h3>What got pinned down</h3>${infoBtn('calibrate.pinned')}</div><div class="row small"><span class="legend"><span class="swatch" style="background:#A99C8A;height:10px;border-radius:5px"></span>Before your logs (prior)</span><span class="legend"><span class="swatch" style="background:#A8323A;height:10px;border-radius:5px"></span>Now</span></div></div>${infoNote('calibrate.pinned')}
          ${fit ? unsafeHTML(rangeBars(fit.parameters.map((p) => ({ label: words(p.name), prior: p.prior, before: p.prior, lo: p.lo, hi: p.hi, text: `${fmtP(p.lo)} to ${fmtP(p.hi)} ${p.units.replace('-', '')}` })))) : html`<div class="small muted">Run a fit first.</div>`}
          ${fit ? html`<div class="small muted">${fit.identifiability.summary}${fit.identifiability.sloppy_directions.length ? ` Loosely constrained combinations: ${fit.identifiability.sloppy_directions.join('; ')}.` : ''} ${fit.identifiability.loose.includes('bypass_coeff') ? 'A split-collection brew, first half and second half weighed and measured separately, would pin bypass.' : ''}</div>` : ''}
          ${fit ? html`<div class="small muted mono">${fit.message} · method ${fit.method === 'bayesian' ? 'Bayesian (Metropolis)' : 'least squares + bootstrap'}${fit.acceptance_rate != null ? ` · acceptance ${f0(fit.acceptance_rate * 100)}%` : ''}</div>` : ''}</section>
      </main>
      <aside class="col">
        <div class="card"><div class="row between"><h3>Prediction band, this setup</h3>${infoBtn('calibrate.band')}</div>${infoNote('calibrate.band')}<div class="row" style="align-items:center;gap:10px"><div class="mono" style="font-size:20px">± ${f2(bandHalf(priorBands))}</div><svg viewBox="0 0 60 12" style="flex:1;height:12px"><path d="M0 6 H50 M44 1 L50 6 L44 11" fill="none" stroke="#5A5048" stroke-width="1.5"/></svg><div class="mono" style="font-size:20px">± ${f2(bandHalf(fitBands))}</div></div><div class="small muted">% TDS, from the prior to ${fit ? `${fit.n_brews} logged brews` : 'the fit'}</div>
          <div class="seg small"><button class=${ctx.method === 'least_squares' ? 'on' : ''} data-method="ls">Least squares</button><button class=${ctx.method === 'bayesian' ? 'on' : ''} data-method="bayes">Bayesian</button></div><div class="small muted">Switchable with ?method=ls or ?method=bayes.</div></div>
        <div class="card" style="gap:4px"><h3 style="padding-bottom:6px">Brew log</h3>${ls.length ? ls.slice().reverse().map((l, k) => html`<div class="nav-link"><span class="stack" style="gap:0"><span style="font-weight:600">${ls.length - k} · ${l.inputs.recipe.pours.length} pours${l.notes === 'synthetic' ? ' · sample' : ''}</span><span class="tag">${[l.outcomes.total_time_s != null && 'time', l.outcomes.tds_pct != null && 'TDS', l.outcomes.bed_shape && 'bed', l.flavour.labels.length && 'taste'].filter(Boolean).join(', ') || 'no outcomes'}</span></span><span class="mono">${l.outcomes.tds_pct != null ? f2(l.outcomes.tds_pct) : 'no TDS'}</span></div>`) : html`<div class="small muted">Empty.</div>`}</div>
        ${fit ? html`<button class="btn" data-refit>Refit</button>` : ''}<a href="#/recipe-search" class="btn dark">Re-run the recipe search</a>
      </aside>
    </div>`;
  };

  const spinner = (text) => html`<span class="spin"></span> ${text}`;

  const runFit = async () => {
    const ls = logs();
    if (!ls.length) { paint(); return; }
    status = spinner('Fitting the model to your brews…'); paint();
    try {
      const opts = { method: ctx.method, fast: true, max_evals: 80, n_samples: ctx.method === 'bayesian' ? 120 : 0, n_bootstrap: 150, seed: 11, parameters: null };
      const f = await ctx.engine.call('fit_setup', ctx.configName, ls, null, opts);
      if (!alive) return;
      fit = f; ctx.mem.fitStale = false; ctx.mem.bands = null; ctx.mem.bandsKey = null;
      await ctx.db.putFit(setupId, f);
      status = null;
      explanation = await ctx.engine.call('explain_calibration', f);
      paint();
      const inputs = ctx.inputs;
      const [pb, fb] = await Promise.all([
        ctx.engine.call('prediction_bands', ctx.configName, inputs, null, { n: 12, seed: 7, fast: true, source: { Prior: { width_frac: 0.5 } }, vary: f.parameters.map((p) => p.name) }),
        ctx.bandsFor(inputs, 16),
      ]);
      if (!alive) return;
      priorBands = pb; fitBands = fb; paint();
    } catch (e) { status = null; if (alive) { ctx.toast(e.message, 'err'); paint(); } }
  };

  paint();
  if (stale()) runFit();
  else {
    ctx.engine.call('explain_calibration', fit).then((e) => { if (alive) { explanation = e; paint(); } });
    ctx.bandsFor(ctx.inputs, 16).then((b) => { if (alive) { fitBands = b; paint(); } });
    ctx.engine.call('prediction_bands', ctx.configName, ctx.inputs, null, { n: 12, seed: 7, fast: true, source: { Prior: { width_frac: 0.5 } }, vary: fit.parameters.map((p) => p.name) }).then((b) => { if (alive) { priorBands = b; paint(); } });
  }
  off = [
    on(root, 'click', '[data-demo]', async () => {
      status = spinner('Brewing five sample brews with hidden constants…'); paint();
      try {
        const seed = Math.floor(Math.random() * 1000);
        const syn = await ctx.engine.call('synthetic_logs', ctx.configName, { perm_scale: 0.11, k_kinetic: 0.0035 }, seed, 5, [[setupId, ctx.inputs.grind.sauter_um, ctx.inputs.grind.fines_frac]]);
        syn.forEach((l) => { l.inputs = { ...l.inputs, setup_id: setupId, brewer: ctx.inputs.brewer, bean: ctx.inputs.bean }; l.created_at = new Date().toISOString(); });
        await ctx.db.putMany('logs', syn);
        runFit();
      } catch (e) { status = null; ctx.toast(e.message, 'err'); paint(); }
    }),
    on(root, 'click', '[data-refit]', () => runFit()),
    on(root, 'click', '[data-method]', (_, el) => { const u = new URL(location.href); u.searchParams.set('method', el.dataset.method); location.href = u.toString(); }),
  ];
  return () => { alive = false; off.forEach((f) => f()); };
}

function bedOf(code) { return ['flat', 'high_walls', 'cratered'][Math.round(code)] || 'unknown'; }
function fmtP(v) { if (!isFinite(v)) return '–'; if (Math.abs(v) < 0.01) return v.toPrecision(2); if (Math.abs(v) < 10) return (+v.toFixed(3)).toString(); return v.toFixed(0); }
