// Recipe search: the recipe set from the Pareto search, the front ranked by robustness, and the explainer.
import { esc, on, fmtTime, f0, f1, f2, pct, BREWERS, brewerLabel, words, infoBtn, infoNote } from '../ui.js';
import { paretoPlot, pairCurves } from '../draw.js';

function leverChips(l) { return [['Grind setting', l.grind], ['Pour count', l.pour_count], ['Pour timing', l.timing], ['Placement', l.placement], ['Swirl', l.swirl], [l.rate ? 'Pour rate' : 'Pour rate, no flow kettle', l.rate], ['Water recipe, locked', l.water]]; }

function keyOf(ctx, target) { return JSON.stringify([ctx.state.configName, ctx.state.inputs, ctx.overrides(), target]); }

export function RecipeSearch(root, ctx) {
  const i = ctx.state.inputs;
  const target = ctx.mem.target || (ctx.mem.target = { tds_pct: 1.5, ey_pct: 20.5, slurried_frac: 0.4 });
  let alive = true, off = [];
  let search = ctx.mem.searchKey === keyOf(ctx, target) ? ctx.mem.search : null;
  let selected = ctx.mem.selected;
  let pair = null, explanation = null, translated = null;

  const leftAside = () => `<div class="card"><div class="row between"><h3>Target cup</h3>${infoBtn('recipe.target')}</div>${infoNote('recipe.target')}
      <div class="stack"><div class="row between small"><label for="tgt-tds">Strength</label><span class="mono">${f2(target.tds_pct)}% TDS</span></div><input id="tgt-tds" type="range" min="1.1" max="1.8" step="0.01" value="${target.tds_pct}" data-target="tds_pct"></div>
      <div class="stack"><div class="row between small"><label for="tgt-ey">Extraction</label><span class="mono">${f1(target.ey_pct)}% EY</span></div><input id="tgt-ey" type="range" min="17" max="23" step="0.1" value="${target.ey_pct}" data-target="ey_pct"></div>
      <div class="stack"><div class="row between small"><label for="tgt-bed">Contact time slurried</label><span class="mono">${f0(target.slurried_frac * 100)}%</span></div><input id="tgt-bed" type="range" min="0" max="100" step="1" value="${Math.round(target.slurried_frac * 100)}" data-target="slurried_frac"></div>
      <div class="small muted">Strength and extraction alone do not fix the cup. The third dial sets how the bed gets there.</div><button class="btn dark" data-search>Search recipes</button></div>
    <div class="card"><div class="row between"><h3>Levers the search may use</h3>${infoBtn('recipe.levers')}</div>${infoNote('recipe.levers')}<div class="chips">${leverChips(search ? search.levers : { grind: true, pour_count: true, timing: true, placement: true, swirl: true, rate: !!i.equipment.flow_kettle, water: false }).map(([l, onn]) => `<span class="chip ${onn ? 'on' : 'off'}">${esc(l)}</span>`).join('')}</div><div class="small muted">Gated by the equipment on the Setup screen.</div></div>`;


  const table = () => {
    const cs = search.candidates;
    return `<div class="scroll-x"><table class="t"><thead><tr><th>Recipe</th><th>Pours</th><th>Grind</th><th>TDS</th><th>EY</th><th>Slurried</th><th>Pouring tolerance</th><th>Time</th></tr></thead><tbody>
      ${search.front.map((idx) => { const c = cs[idx]; return `<tr class="${idx === selected ? 'sel' : ''}" data-row="${idx}" style="cursor:pointer"><td>${esc(c.label)}${idx === selected ? ' · selected' : ''}</td><td>${c.pours}</td><td>${f1(c.inputs.grind.setting)}${c.grind_offset ? ` (${c.grind_offset > 0 ? '+' : ''}${c.grind_offset})` : ''}</td><td>${f2(c.summary.cup_tds_pct)}</td><td>${f1(c.summary.ey_pct)}%</td><td>${pct(c.summary.slurried_frac)}</td><td>± ${f1(c.robustness)} g/s</td><td>${fmtTime(c.summary.total_time_s)}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  };

  const rightAside = () => {
    if (!search || selected == null) return '';
    const ca = search.candidates[selected];
    const other = search.front.find((x) => x !== selected);
    const cb = other != null ? search.candidates[other] : null;
    // Once both recipes have run at full fidelity, the table quotes those runs, the same numbers the explainer uses.
    const a = pair ? { ...ca, summary: pair.a.result.summary } : ca;
    const b = cb ? (pair ? { ...cb, summary: pair.b.result.summary } : cb) : null;
    const cmp = (label, fa, fb) => `<div>${label}</div><div class="mono">${fa}</div><div class="mono">${b ? fb : '–'}</div>`;
    return `<div class="card"><div class="row between"><h3>${esc(a.label)} against ${b ? esc(b.label) : '–'}</h3><div class="row small"><span class="legend"><span class="swatch" style="width:14px;height:3px;background:#A8323A"></span>${esc(a.label)}</span><span class="legend"><span class="swatch" style="width:14px;height:3px;background:#211B17"></span>${b ? esc(b.label) : ''}</span></div></div>${pair ? pairCurves(pair.a, pair.b) : '<div class="small muted"><span class="spin"></span> Running both at full fidelity…</div>'}</div>
      <div class="card"><div class="row between"><h3>Same strength, different cup</h3>${infoBtn('recipe.compare')}</div>${infoNote('recipe.compare')}<div class="grid3" style="gap:6px 10px;font-size:13px"><div></div><div class="mono">${esc(a.label)}</div><div class="mono">${b ? esc(b.label) : ''}</div>
        ${cmp('TDS', f2(a.summary.cup_tds_pct), b && f2(b.summary.cup_tds_pct))}${cmp('Final column', `${f0(a.summary.final_column_height_mm)} mm`, b && `${f0(b.summary.final_column_height_mm)} mm`)}${cmp('Fines at paper', `+${f0(((a.summary.fines_paper_factor || 1) - 1) * 100)}%`, b && `+${f0(((b.summary.fines_paper_factor || 1) - 1) * 100)}%`)}${cmp('Wall stranding', a.summary.wall_stranding > 0.06 ? 'high' : 'low', b && (b.summary.wall_stranding > 0.06 ? 'high' : 'low'))}${cmp('Bed shape', words(a.summary.bed_shape || ''), b && words(b.summary.bed_shape || ''))}</div></div>
      <div class="card"><div class="row between wrap"><div class="row"><h3>Why they differ</h3>${infoBtn('recipe.explain')}</div><span class="pill">explained from solver output</span></div>${infoNote('recipe.explain')}${explanation ? `${explanation.paragraphs.map((p) => `<div class="small" style="font-size:13px;line-height:1.5">${esc(p)}</div>`).join('')}<div class="small muted">Every figure in this text is copied from the simulation. The explainer cannot introduce its own numbers. <span class="verdict ${explanation.check.ok ? 'ok' : 'bad'}">${explanation.check.ok ? `check passed (${explanation.check.numbers_checked} numbers)` : `check failed: ${explanation.check.invented.join(', ')}`}</span></div>` : '<div class="small muted">…</div>'}</div>`;
  };

  const render = () => {
    root.innerHTML = `<div class="page three">
      <aside class="col">${leftAside()}</aside>
      <main class="col">
        <section class="card"><div class="row between wrap"><div class="row"><h3>Recipe set</h3>${infoBtn('recipe.map')}</div><span class="mono small muted">${search ? `${search.n_simulated} recipes simulated · ${search.front.length} on the front` : 'not searched yet'}</span></div>${infoNote('recipe.map')}
          ${search ? paretoPlot(search, selected) : `<div class="status" data-search-status>${ctx.mem.searching ? '<span class="spin"></span> Searching recipes…' : 'Set a target and search.'}</div>`}</section>
        ${search ? `<section class="card"><div class="row between"><h3>On the front, ranked by robustness</h3>${infoBtn('recipe.front')}</div>${infoNote('recipe.front')}${table()}<div class="hr"></div><div class="row wrap"><button class="btn primary" data-watch>Watch ${selected != null ? esc(search.candidates[selected].label) : ''} brew</button><button class="btn" data-export>Export recipe card</button><div class="row"><select data-translate-brewer style="height:44px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:0 10px">${BREWERS.map((b) => `<option value="${b.kind}" ${b.kind === i.brewer.kind ? 'disabled' : ''}>${b.label}</option>`).join('')}</select><button class="btn" data-translate>Translate to another brewer</button></div></div>
          ${translated ? `<div class="status">On a ${esc(brewerLabel(translated.kind))} the selected recipe lands at ${f2(translated.summary.cup_tds_pct)}% TDS, ${f1(translated.summary.ey_pct)}% EY in ${fmtTime(translated.summary.total_time_s)} (${translated.summary.ended_by === 'drained' ? 'drained' : 'did not finish'}), against ${f2(search.candidates[selected].summary.cup_tds_pct)}% TDS here. Grind and timing are kept; only the brewer changed.</div>` : ''}</section>` : ''}
      </main>
      <aside class="col">${rightAside()}</aside>
    </div>`;
  };

  const runSearch = async () => {
    ctx.mem.searching = true; render();
    try {
      const r = await ctx.engine.call('search_recipes', ctx.state.configName, i, ctx.overrides(), target, null, { fast: true, grind_offsets: [-2, -1, 0, 1, 2], pour_counts: [2, 3, 4], max_candidates: 120 });
      if (!alive) return;
      search = r; ctx.mem.search = r; ctx.mem.searchKey = keyOf(ctx, target);
      selected = r.selected; ctx.mem.selected = selected;
      pair = null; explanation = null; translated = null;
      render();
      loadPair();
    } catch (e) { if (alive) { ctx.toast(e.message, 'err'); } } finally { ctx.mem.searching = false; }
  };

  const loadPair = async () => {
    if (!search || selected == null) return;
    const a = search.candidates[selected];
    const other = search.front.find((x) => x !== selected);
    const b = other != null ? search.candidates[other] : a;
    const key = `${selected}-${other}`;
    try {
      const [ra, rb] = await Promise.all([ctx.engine.call('simulate', ctx.state.configName, a.inputs, ctx.overrides(), true), ctx.engine.call('simulate', ctx.state.configName, b.inputs, ctx.overrides(), true)]);
      if (!alive) return;
      pair = { a: ra, b: rb, key };
      explanation = await ctx.engine.call('explain_pair', a.label, ra.result.summary, b.label, rb.result.summary);
      if (!alive) return;
      const aside = root.querySelector('.page > aside:last-child'); if (aside) aside.innerHTML = rightAside();
    } catch (e) { console.warn(e); }
  };

  render();
  if (!search && !ctx.mem.searching) runSearch();
  else if (search) loadPair();
  off = [
    on(root, 'input', '[data-target]', (_, el) => { const k = el.dataset.target; target[k] = k === 'slurried_frac' ? Number(el.value) / 100 : Number(el.value); const lbl = el.closest('.stack').querySelector('.mono'); lbl.textContent = k === 'tds_pct' ? `${f2(target[k])}% TDS` : k === 'ey_pct' ? `${f1(target[k])}% EY` : `${f0(target[k] * 100)}%`; }),
    on(root, 'click', '[data-search]', () => runSearch()),
    on(root, 'click', '.pareto [data-cand], [data-row]', (_, el) => { const idx = Number(el.dataset.cand ?? el.dataset.row); if (!search.candidates[idx].on_front) return; selected = idx; ctx.mem.selected = idx; pair = null; explanation = null; translated = null; render(); loadPair(); }),
    on(root, 'click', '[data-watch]', async () => { const c = search.candidates[selected]; ctx.state.inputs = c.inputs; ctx.state.sampleData = false; await ctx.save(); ctx.navigate('#/simulate'); }),
    on(root, 'click', '[data-export]', () => {
      const c = search.candidates[selected];
      const card = { recipe: c.label, brewer: c.inputs.brewer.name, dose_g: c.inputs.recipe.dose_g, grind: { setting: c.inputs.grind.setting, sauter_um: Math.round(c.inputs.grind.sauter_um) }, water_c: c.inputs.temperature.t0, pours: c.inputs.recipe.pours, predicted: { tds_pct: +c.summary.cup_tds_pct.toFixed(2), ey_pct: +c.summary.ey_pct.toFixed(1), total_time: fmtTime(c.summary.total_time_s), slurried_frac: +(c.summary.slurried_frac || 0).toFixed(2) }, config: ctx.state.configName, solver: ctx.engine.info.solver };
      const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `recipe-${c.label}.json`; a.click();
    }),
    on(root, 'click', '[data-translate]', async () => {
      const kind = root.querySelector('[data-translate-brewer]').value;
      const c = search.candidates[selected];
      try {
        const brewer = await ctx.engine.call('brewer_preset', kind);
        const inputs = { ...c.inputs, brewer };
        const r = await ctx.engine.call('simulate', ctx.state.configName, inputs, ctx.overrides(), false);
        translated = { kind, summary: r.result.summary }; render();
      } catch (e) { ctx.toast(e.message, 'err'); }
    }),
  ];
  return () => { alive = false; off.forEach((f) => f()); };
}
