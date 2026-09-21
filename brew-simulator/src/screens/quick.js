// First brew: five quick inputs, then a rough prediction with wide bands.
import { esc, on, fmtTime, f1, f2, BREWERS, brewerIcon } from '../ui.js';
import { bandBar, curveBand } from '../draw.js';

const FEELS = [['fine', 'Fine'], ['med_fine', 'Med-fine'], ['medium', 'Medium'], ['coarse', 'Coarse']];
const FEEL_HINT = { fine: 'like table salt', med_fine: 'like coarse sand', medium: 'like kosher salt', coarse: 'like sea salt flakes' };
const KETTLES = [['off_boil', 'Off the boil'], ['rested', 'Rested 30 s'], ['set', 'I set a temp']];

function defaultQuick() {
  return { brewer: 'cone', dose_g: 15, water_g: 250, feel: 'med_fine', kettle: 'rested', kettle_temp_c: 92, pours_after_bloom: 3 };
}

export function QuickStart(root, ctx) {
  const q = ctx.state.quick || defaultQuick();
  ctx.state.quick = q;
  const render = () => {
    root.innerHTML = `<div class="page flow">
      <header class="stack"><div class="eyebrow">First brew</div><div class="title">Five things, about a minute</div></header>
      <div class="stack"><div style="font-weight:600;font-size:13px">Brewer</div>
        <div class="grid4">${BREWERS.slice(0, 4).map((b) => `<button class="tile ${q.brewer === b.kind ? 'on' : ''}" data-brewer="${b.kind}">${brewerIcon(b.icon)}${b.kind === 'cone' ? 'Cone' : b.label}</button>`).join('')}</div>
        <div class="grid4"><button class="tile ${q.brewer === 'immersion' ? 'on' : ''}" data-brewer="immersion">${brewerIcon(BREWERS[4].icon)}Immersion</button></div></div>
      <div class="row"><div class="field" style="flex:1"><label for="q-dose">Coffee</label><input id="q-dose" type="number" step="0.5" value="${q.dose_g}" data-num="dose_g"></div>
        <div class="field" style="flex:1"><label for="q-water">Water</label><input id="q-water" type="number" step="5" value="${q.water_g}" data-num="water_g"></div></div>
      <div class="stack"><div class="row between"><div style="font-weight:600;font-size:13px">Grind, by feel</div><div class="small muted">${FEEL_HINT[q.feel]}</div></div>
        <div class="seg">${FEELS.map(([k, l]) => `<button class="${q.feel === k ? 'on' : ''}" data-feel="${k}">${l}</button>`).join('')}</div></div>
      <div class="stack"><div style="font-weight:600;font-size:13px">Kettle</div>
        <div class="seg">${KETTLES.map(([k, l]) => `<button class="${q.kettle === k ? 'on' : ''}" data-kettle="${k}">${l}</button>`).join('')}</div>
        ${q.kettle === 'set' ? `<div class="field"><input type="number" step="1" value="${q.kettle_temp_c}" data-num="kettle_temp_c" aria-label="Kettle temperature in Celsius"></div>` : ''}</div>
      <div class="row between"><div class="stack"><div style="font-weight:600;font-size:13px">Pours after the bloom</div><div class="small muted">evenly spaced, spiral</div></div>
        <div class="row"><button class="btn" data-pours="-1" aria-label="Fewer pours" style="width:44px;padding:0">−</button><div class="mono" style="width:24px;text-align:center;font-size:20px">${q.pours_after_bloom}</div><button class="btn" data-pours="1" aria-label="More pours" style="width:44px;padding:0">+</button></div></div>
      <a href="#/setup" class="btn" style="height:52px;border-style:dashed;justify-content:space-between;background:transparent"><span>Scan the bag for a bean profile</span><span class="mono small muted">optional</span></a>
      <div style="flex-grow:1"></div>
      <div class="small muted">Rough inputs give a wide prediction band. You can tighten it after your first brew.</div>
      <button class="btn primary big" data-go>Simulate</button>
      <div class="row between small muted"><a href="#/setup">Full setup instead</a><a href="#/bench">Research bench</a></div>
    </div>`;
  };
  render();
  const offs = [
    on(root, 'click', '[data-brewer]', (_, el) => { q.brewer = el.dataset.brewer; render(); }),
    on(root, 'click', '[data-feel]', (_, el) => { q.feel = el.dataset.feel; render(); }),
    on(root, 'click', '[data-kettle]', (_, el) => { q.kettle = el.dataset.kettle; render(); }),
    on(root, 'click', '[data-pours]', (_, el) => { q.pours_after_bloom = Math.max(1, Math.min(6, q.pours_after_bloom + Number(el.dataset.pours))); render(); }),
    on(root, 'change', '[data-num]', (_, el) => { q[el.dataset.num] = Number(el.value); }),
    on(root, 'click', '[data-go]', async (_, el) => {
      el.disabled = true; el.innerHTML = '<span class="spin"></span> Simulating';
      try {
        const inputs = await ctx.engine.call('quick_to_inputs', { ...q, dose_g: Number(q.dose_g), water_g: Number(q.water_g), pours_after_bloom: Number(q.pours_after_bloom), kettle_temp_c: q.kettle === 'set' ? Number(q.kettle_temp_c) : null });
        ctx.state.inputs = inputs; ctx.state.sampleData = false;
        await ctx.save();
        ctx.navigate('#/quick-result');
      } catch (e) { ctx.toast(e.message, 'err'); el.disabled = false; el.textContent = 'Simulate'; }
    }),
  ];
  return () => offs.forEach((f) => f());
}

export function QuickResult(root, ctx) {
  const inputs = ctx.state.inputs;
  root.innerHTML = `<div class="page flow"><header class="row between" style="align-items:flex-start"><div class="stack"><div class="eyebrow">Tier ${inputs.tier} inputs${ctx.state.sampleData ? ' · sample data' : ''}</div><div class="title">Your brew, roughly</div></div><a href="#/quick" class="btn">Edit</a></header>
    <div class="card"><span class="spin"></span> Running the ensemble…</div></div>`;
  let alive = true;
  (async () => {
    try {
      const [run, bands] = await Promise.all([ctx.runSim(inputs), ctx.bandsFor(inputs, 16)]);
      if (!alive) return;
      const s = run.result.summary;
      const bar = (b, min, max, label) => bandBar(b.p10, b.p90, b.p50, min, max, label);
      root.innerHTML = `<div class="page flow">
        <header class="row between" style="align-items:flex-start"><div class="stack"><div class="eyebrow">Tier ${inputs.tier} inputs${ctx.state.sampleData ? ' · sample data' : ''}</div><div class="title">Your brew, roughly</div></div><a href="#/quick" class="btn">Edit</a></header>
        <section class="card dark" style="gap:14px">
          <div class="stack"><div class="row between"><span class="muted">Strength</span><span class="mono" style="font-size:20px">${f2(bands.tds_pct.p10)} to ${f2(bands.tds_pct.p90)}% TDS</span></div>${bar(bands.tds_pct, 0.9, 2.0, 'Strength band')}<div class="row between mono small muted"><span>0.9</span><span>most likely ${f2(bands.tds_pct.p50)}</span><span>2.0</span></div></div>
          <div class="stack"><div class="row between"><span class="muted">Extraction</span><span class="mono" style="font-size:20px">${f1(bands.ey_pct.p10)} to ${f1(bands.ey_pct.p90)}% EY</span></div>${bar(bands.ey_pct, 15, 25, 'Extraction band')}<div class="row between mono small muted"><span>15</span><span>most likely ${f1(bands.ey_pct.p50)}</span><span>25</span></div></div>
          <div class="row between"><span class="muted">Total time</span><span class="mono" style="font-size:20px">${fmtTime(bands.total_time_s.p10)} to ${fmtTime(bands.total_time_s.p90)}</span></div>
        </section>
        <section class="card" style="padding:12px 14px;gap:6px"><div class="row between"><h4>Outflow strength over the brew</h4><span class="pill accent">${s.slurried_frac > 0.35 ? 'Mostly slurried' : s.slurried_frac > 0.15 ? 'Partly slurried' : 'Mostly settled'}</span></div>${curveBand(bands, s.regimes)}</section>
        <section class="card" style="padding:14px"><h3>Where the width comes from</h3>
          ${bands.attribution.filter((a) => a.share > 0.005).map((a) => `<div class="stack"><div class="row between small"><span>${esc(a.label)}</span><span class="mono">${Math.round(a.share * 100)}%</span></div><div class="bar"><div style="width:${Math.round(a.share * 100)}%"></div></div></div>`).join('')}
          <div class="small muted">${bands.n} ensemble runs, parameters from ${esc(bands.source)}.</div></section>
        <div style="flex-grow:1"></div>
        <div class="bottom-actions"><a href="#/setup" class="btn outline big">Tighten the band</a><a href="#/simulate" class="btn primary big">Watch it brew</a></div>
      </div>`;
    } catch (e) { if (alive) root.innerHTML = `<div class="page flow"><div class="status err">${esc(e.message)}</div><a href="#/quick" class="btn">Back</a></div>`; }
  })();
  return () => { alive = false; };
}
