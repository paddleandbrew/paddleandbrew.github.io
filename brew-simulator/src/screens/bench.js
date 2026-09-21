// Research bench: model configs as data, variant comparison on held-out brews, the four falsification
// tests, the parameter registry, flavour-data readiness, and the store itself.
import { esc, on, fmtTime, f0, f1, f2, words } from '../ui.js';

export function Bench(root, ctx) {
  let alive = true, off = [];
  let tab = ctx.mem.benchTab || 'configs';
  let configs = null, catalogue = null, registry = null, specs = null;
  let runs = null, comparison = null, tests = null, flavour = null, custom = null, status = '';
  let cmpA = 'no-fines-migration', cmpB = 'baseline';

  const logsAll = () => ctx.state.logs;

  const render = () => {
    root.innerHTML = `<div class="page" style="grid-template-columns:minmax(0,1fr)">
      <div class="row between wrap"><div><div class="eyebrow">Research bench</div><div class="title" style="font-size:24px">Hypotheses, constants, evidence</div></div>
        <div class="tabs">${[['configs', 'Model configs'], ['compare', 'Compare variants'], ['tests', 'Falsification tests'], ['registry', 'Parameter registry'], ['flavour', 'Flavour data'], ['data', 'Data']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div></div>
      ${status ? `<div class="status">${status}</div>` : ''}
      ${tab === 'configs' ? configsTab() : tab === 'compare' ? compareTab() : tab === 'tests' ? testsTab() : tab === 'registry' ? registryTab() : tab === 'flavour' ? flavourTab() : dataTab()}
    </div>`;
  };

  const configsTab = () => {
    if (!configs) return '<div class="card"><span class="spin"></span> Loading…</div>';
    const slots = {};
    catalogue.forEach((m) => { (slots[m.phenomenon] = slots[m.phenomenon] || []).push(m); });
    const active = custom || configs.find((c) => c.name === ctx.state.configName) || configs[1];
    return `<div class="grid2" style="align-items:start">
      <div class="card"><h3>A model is a configuration</h3><div class="small muted">Each built-in config is a versioned file listing modules and parameter overrides. Pick one to run everything on, or build a variant by choosing one module per phenomenon.</div>
        <table class="t"><thead><tr><th>Config</th><th>Modules</th><th>Fit params</th><th></th></tr></thead><tbody>${configs.map((c) => `<tr class="${ctx.state.configName === c.name && !custom ? 'sel' : ''}"><td>${esc(c.name)}<div class="small muted" style="font-family:var(--sans);font-weight:400">${esc(c.description)}</div></td><td>${c.modules.length}</td><td>${c.fit_parameters.length}</td><td><button class="btn" style="height:32px" data-use="${esc(c.name)}">Use</button></td></tr>`).join('')}</tbody></table>
        ${runs ? `<h4>Sample brew through every config</h4><table class="t"><thead><tr><th>Config</th><th>Time</th><th>TDS</th><th>EY</th><th>Slurried</th><th>Checks</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.error ? `<span class="verdict bad">${esc(r.error)}</span>` : fmtTime(r.summary.total_time_s)}</td><td>${r.error ? '' : f2(r.summary.cup_tds_pct)}</td><td>${r.error ? '' : f1(r.summary.ey_pct)}</td><td>${r.error || r.summary.slurried_frac == null ? '–' : f0(r.summary.slurried_frac * 100) + '%'}</td><td>${r.error ? '' : r.checks.map((c) => `<span class="verdict ${c.passed ? 'ok' : 'bad'}">${c.name.split(' ')[0]}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table>` : '<button class="btn" data-run-all>Run the current inputs through every config</button>'}</div>
      <div class="card"><h3>Build a variant</h3><div class="small muted">One module per phenomenon; leave a slot empty to test the model without it. The solver refuses a set that leaves a field without an owner.</div>
        ${Object.entries(slots).map(([slot, mods]) => `<div class="field"><label>${esc(slot)}</label><select data-slot="${esc(slot)}"><option value="">— off —</option>${mods.map((m) => `<option value="${esc(m.name)}" ${active.modules.includes(m.name) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><div class="hint">${esc(mods.find((m) => active.modules.includes(m.name))?.description || '')}</div></div>`).join('')}
        <div class="field"><label>Name</label><input type="text" value="${esc(custom ? custom.name : 'custom')}" data-custom-name></div>
        <div class="row"><button class="btn dark" data-try-custom>Assemble and run</button>${custom ? `<span class="small muted">Using custom config <b>${esc(custom.name)}</b> (${custom.modules.length} modules)</span>` : ''}</div>
        <details><summary class="small">Module catalogue</summary><pre class="code">${esc(catalogue.map((m) => `${m.name} [${m.phenomenon}]\n  owns: ${m.owns.join(', ')}\n  reads: ${m.reads.join(', ')}${m.reads_optional.length ? `\n  optional: ${m.reads_optional.join(', ')}` : ''}\n  params: ${m.params.join(', ')}`).join('\n\n'))}</pre></details></div>
    </div>`;
  };

  const compareTab = () => `<div class="grid2" style="align-items:start"><div class="card"><h3>Does this phenomenon exist at a scale that matters?</h3><div class="small muted">Both configs are fitted on the training brews and scored on brews they have not seen, held out by setup, with a penalty for added parameters. ${logsAll().length} logged brews across ${new Set(logsAll().map((l) => l.inputs.setup_id)).size} setups.</div>
      <div class="grid2"><div class="field"><label>Incumbent A</label><select data-cmp="a">${(configs || []).map((c) => `<option ${c.name === cmpA ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Variant B</label><select data-cmp="b">${(configs || []).map((c) => `<option ${c.name === cmpB ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
      <button class="btn dark" data-compare ${logsAll().length < 2 ? 'disabled' : ''}>Compare on held-out brews</button>${logsAll().length < 2 ? '<div class="small muted">Needs at least two logged brews. Add sample brews on the Data tab.</div>' : ''}</div>
    <div class="card"><h3>Verdict</h3>${comparison ? `<div class="row"><span class="pill ${comparison.verdict.keep_b ? 'accent' : 'dark'}">${comparison.verdict.keep_b ? `keep ${esc(comparison.config_b)}` : `keep ${esc(comparison.config_a)}`}</span><span class="mono small">margin ${f1(comparison.verdict.margin)} nats</span></div><div style="font-size:13px;line-height:1.5">${esc(comparison.verdict.evidence)}</div>
      <table class="t"><thead><tr><th>Held-out group</th><th>Train</th><th>Test</th><th>Score A</th><th>Score B</th><th>Coverage A / B</th></tr></thead><tbody>${comparison.groups.map((g) => `<tr><td>${esc(g.group)}</td><td>${g.n_train}</td><td>${g.n_test}</td><td>${f1(g.a.log_score)}</td><td>${f1(g.b.log_score)}</td><td>${f0(g.a.coverage * 100)}% / ${f0(g.b.coverage * 100)}%</td></tr>`).join('')}</tbody></table><div class="small muted">Stored with its data in the verdict register (${ctx.state.verdicts.length} verdicts), so a later brew set can overturn it.</div>` : '<div class="small muted">No comparison yet.</div>'}
      ${ctx.state.verdicts.length ? `<h4>Verdict register</h4>${ctx.state.verdicts.slice().reverse().slice(0, 8).map((v) => `<div class="kv"><span>${esc(v.config_a)} → ${esc(v.config_b)} · ${v.n_brews} brews · ${esc(v.created_at.slice(0, 10))}</span><span class="v">${v.verdict.keep_b ? 'keep' : 'drop'} (${f1(v.verdict.margin)})</span></div>`).join('')}` : ''}</div></div>`;

  const testsTab = () => `<div class="card"><h3>Four pre-registered falsification tests</h3><div class="small muted">Each states its prediction and pass threshold before brewing. They run automatically when the data they need exist; until then they say so. These four are the plan's placeholders, to be refined in the open question.</div>
      <button class="btn dark" data-run-tests>Run the tests on ${logsAll().length} logged brews</button>
      <table class="t"><thead><tr><th>Test</th><th>Module</th><th>Prediction</th><th>Threshold</th><th>Needs</th><th>Outcome</th></tr></thead><tbody>${(specs || []).map((s) => { const o = tests && tests.find((t) => t.id === s.id); return `<tr><td>${esc(s.name)}</td><td class="mono">${esc(s.module)}<div class="small muted" style="font-family:var(--sans)">${esc(s.with_config)} vs ${esc(s.without_config)}</div></td><td style="font-family:var(--sans)">${esc(s.prediction)}</td><td>${esc(s.threshold)}</td><td style="font-family:var(--sans)">${esc(s.required_data)}</td><td>${o ? `<span class="pill ${o.status === 'pass' ? 'teal' : o.status === 'fail' ? 'accent' : ''}">${words(o.status)}</span><div class="small muted" style="font-family:var(--sans)">${esc(o.evidence)}</div>` : '<span class="muted">not run</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;

  const registryTab = () => `<div class="card"><h3>Every constant is a named parameter</h3><div class="small muted">Units, prior range, source and the version that introduced it. Nothing is hard-coded in an equation. Fitted values per setup override these.</div>
      <div class="scroll-x"><table class="t"><thead><tr><th>Name</th><th>Units</th><th>Default</th><th>Prior</th><th>Source</th><th>Version</th><th>Fitted here</th></tr></thead><tbody>${(registry || []).map((p) => { const f = ctx.fit(); const fp = f && f.parameters.find((x) => x.name === p.name); return `<tr><td class="mono" style="font-weight:500">${esc(p.name)}<div class="small muted" style="font-family:var(--sans)">${esc(p.description)}</div></td><td>${esc(p.units)}</td><td>${fmtN(p.default)}</td><td>${fmtN(p.prior[0])} – ${fmtN(p.prior[1])}${p.log_scale ? ' (log)' : ''}</td><td style="font-family:var(--sans)">${esc(p.source)}</td><td>${esc(p.version)}</td><td>${fp ? `${fmtN(fp.value)} <span class="small muted">[${fmtN(fp.lo)}, ${fmtN(fp.hi)}]</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>`;

  const flavourTab = () => `<div class="card"><h3>Flavour capture, kept apart from the physics fit</h3><div class="small muted">Every logged brew stores structured flavour labels beside the simulated state and the measured results. The dataset below is what a later neural network or Gaussian mixture model would train on: simulated state fields as features, labels as targets. A k-nearest-neighbour baseline runs now on held-out setups.</div>
      <button class="btn" data-flavour>Build the dataset from ${logsAll().length} logs</button>
      ${flavour ? `<div class="status">${esc(flavour.readiness.message)}</div><table class="t"><thead><tr><th>Descriptor</th><th>Labelled</th><th>Mean baseline MAE</th><th>k-NN MAE</th><th>Beats baseline</th></tr></thead><tbody>${flavour.evaluation.map((e) => `<tr><td>${esc(words(e.descriptor))}</td><td>${e.n_labelled}</td><td>${f2(e.baseline_mae)}</td><td>${f2(e.knn_mae)}</td><td>${e.beats_baseline ? '<span class="verdict ok">yes</span>' : 'no'}</td></tr>`).join('')}</tbody></table><details><summary class="small">Feature names</summary><div class="mono small">${flavour.feature_names.join(', ')}</div></details><button class="btn" data-flavour-export>Export dataset (JSON)</button>` : ''}</div>`;

  const dataTab = () => `<div class="grid2" style="align-items:start"><div class="card"><h3>Storage</h3><div class="small muted">Run records and brew logs go through one storage interface: ${ctx.store.kind()} now, an API backend later (append <span class="mono">?api=https://…</span>). Pooled research use needs consent per brew.</div>
      <div class="grid3"><div class="stat"><div class="n">${ctx.state.runs.length}</div><div class="l">run records</div></div><div class="stat"><div class="n">${ctx.state.logs.length}</div><div class="l">brew logs</div></div><div class="stat"><div class="n">${Object.keys(ctx.state.fits).length}</div><div class="l">fitted setups</div></div></div>
      <div class="row wrap"><button class="btn" data-export-store>Export everything (JSON)</button><label class="btn" style="cursor:pointer">Import JSON<input type="file" accept="application/json" data-import-store style="display:none"></label><button class="btn" data-clear>Clear all data</button></div></div>
    <div class="card"><h3>Sample brews for the bench</h3><div class="small muted">Synthetic brews generated by the baseline model with hidden constants and observation noise, across two grinders. Enough to exercise the fit, the comparison and the tests before real data exists.</div>
      <button class="btn dark" data-add-syn>Add 6 synthetic brews across two setups</button>
      <h4>Recent run records</h4>${ctx.state.runs.slice(0, 6).map((r) => `<div class="kv"><span>${esc(r.created_at.slice(0, 16).replace('T', ' '))} · ${esc(r.config_name)} · ${esc(r.config_hash.slice(0, 8))}</span><span class="v">${fmtTime(r.summary.total_time_s)} · ${f2(r.summary.cup_tds_pct)}%</span></div>`).join('') || '<div class="small muted">None yet.</div>'}</div></div>`;

  const load = async () => {
    [configs, catalogue, registry, specs] = await Promise.all([ctx.engine.call('builtin_configs'), ctx.engine.call('catalogue'), ctx.engine.call('registry'), ctx.engine.call('falsification_specs')]);
    if (typeof ctx.state.configName === 'object') custom = ctx.state.configName;
    if (alive) render();
  };
  render();
  load();
  off = [
    on(root, 'click', '[data-tab]', (_, el) => { tab = el.dataset.tab; ctx.mem.benchTab = tab; render(); }),
    on(root, 'click', '[data-use]', async (_, el) => { ctx.state.configName = el.dataset.use; custom = null; ctx.mem.run = null; ctx.mem.bands = null; ctx.mem.search = null; await ctx.save(); ctx.toast(`Using config ${el.dataset.use}`); render(); }),
    on(root, 'click', '[data-run-all]', async () => {
      status = '<span class="spin"></span> Running every config…'; render();
      const out = [];
      for (const c of configs) {
        try { const r = await ctx.engine.call('simulate', c.name, ctx.state.inputs, null, false); out.push({ name: c.name, summary: r.result.summary, checks: r.result.checks }); } catch (e) { out.push({ name: c.name, error: e.message }); }
      }
      runs = out; status = ''; render();
    }),
    on(root, 'click', '[data-try-custom]', async () => {
      const modules = Array.from(root.querySelectorAll('[data-slot]')).map((s) => s.value).filter(Boolean);
      const base = configs.find((c) => c.name === 'baseline');
      const cfg = { name: root.querySelector('[data-custom-name]').value || 'custom', version: base.version, description: 'Custom variant assembled on the bench', modules, parameters: {}, fit_parameters: base.fit_parameters.filter((p) => !(p === 'bypass_coeff' && !modules.includes('bypass.wall')) && !(p === 'fines_mobilisation_rate' && !modules.includes('fines.migration'))) };
      status = '<span class="spin"></span> Assembling…'; render();
      try {
        const r = await ctx.engine.call('simulate', cfg, ctx.state.inputs, null, false);
        custom = cfg; ctx.state.configName = cfg; ctx.mem.run = null; ctx.mem.bands = null; ctx.mem.search = null; await ctx.save();
        status = `Assembled: ${fmtTime(r.result.summary.total_time_s)}, ${f2(r.result.summary.cup_tds_pct)}% TDS, checks ${r.result.checks.map((c) => `${c.name} ${c.passed ? 'pass' : 'FAIL'}`).join(', ')}.`;
      } catch (e) { status = `<span class="verdict bad">Refused: ${esc(e.message)}</span>`; }
      render();
    }),
    on(root, 'change', '[data-cmp]', (_, el) => { if (el.dataset.cmp === 'a') cmpA = el.value; else cmpB = el.value; }),
    on(root, 'click', '[data-compare]', async () => {
      status = '<span class="spin"></span> Fitting both variants on each held-out split… this takes a while.'; render();
      try {
        const c = await ctx.engine.call('compare_configs', cmpA, cmpB, logsAll(), null, { fit: { method: 'least_squares', fast: true, max_evals: 40, n_samples: 10, n_bootstrap: 10, seed: 1, parameters: null }, penalty_per_param: 2, holdout_by_setup: true });
        comparison = c; ctx.state.verdicts.push({ ...c, created_at: new Date().toISOString() }); await ctx.save();
      } catch (e) { ctx.toast(e.message, 'err'); }
      status = ''; render();
    }),
    on(root, 'click', '[data-run-tests]', async () => {
      status = '<span class="spin"></span> Running the falsification tests…'; render();
      try { tests = await ctx.engine.call('run_falsification', logsAll(), null, { fit: { method: 'least_squares', fast: true, max_evals: 30, n_samples: 10, n_bootstrap: 5, seed: 1, parameters: null }, penalty_per_param: 2, holdout_by_setup: true }); } catch (e) { ctx.toast(e.message, 'err'); }
      status = ''; render();
    }),
    on(root, 'click', '[data-flavour]', async () => { status = '<span class="spin"></span> Replaying logs for features…'; render(); try { flavour = await ctx.engine.call('flavour_dataset', ctx.state.configName, null, logsAll()); } catch (e) { ctx.toast(e.message, 'err'); } status = ''; render(); }),
    on(root, 'click', '[data-flavour-export]', () => download('flavour-dataset.json', flavour)),
    on(root, 'click', '[data-export-store]', () => download('brew-simulator-data.json', ctx.state)),
    on(root, 'change', '[data-import-store]', async (_, el) => { const f = el.files[0]; if (!f) return; try { const doc = JSON.parse(await f.text()); Object.assign(ctx.state, doc); await ctx.save(); ctx.toast('Imported'); render(); } catch (e) { ctx.toast('Import failed: ' + e.message, 'err'); } }),
    on(root, 'click', '[data-clear]', async () => { if (!confirm('Clear all runs, logs, fits and verdicts?')) return; ctx.state.runs = []; ctx.state.logs = []; ctx.state.fits = {}; ctx.state.verdicts = []; ctx.mem.bands = null; await ctx.save(); render(); }),
    on(root, 'click', '[data-add-syn]', async () => {
      status = '<span class="spin"></span> Brewing…'; render();
      try {
        const seed = Math.floor(Math.random() * 1000);
        const syn = await ctx.engine.call('synthetic_logs', 'baseline', { perm_scale: 0.11, k_kinetic: 0.0035 }, seed, 3, [['grinder-a|sample-bean|v60', 400, 0.16], ['grinder-b|sample-bean|v60', 520, 0.09]]);
        syn.forEach((l) => { l.created_at = new Date().toISOString(); });
        ctx.state.logs.push(...syn); await ctx.save();
      } catch (e) { ctx.toast(e.message, 'err'); }
      status = ''; render();
    }),
  ];
  return () => { alive = false; off.forEach((f) => f()); };
}

function fmtN(v) { if (!isFinite(v)) return '–'; const a = Math.abs(v); if (a === 0) return '0'; if (a < 0.001 || a >= 1e5) return v.toExponential(1); if (a < 1) return (+v.toPrecision(3)).toString(); return (+v.toPrecision(4)).toString(); }
function download(name, obj) { const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
