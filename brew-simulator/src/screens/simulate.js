// Simulate: profile and top views on the desktop, tabs on the phone, and the cutaway. All views read named fields.
import { esc, on, fmtTime, f0, f1, f2, pct, bedName, words } from '../ui.js';
import { Frame } from '../frame.js';
import { profileView, topView, topMetrics, cutawayView, probeReadings, probeSeriesChart, timeline, LAYERS, legendColours } from '../draw.js';

const STATE_LABEL = { 0: 'Wetting', 1: 'Slurried', 2: 'Settled', 3: 'Immersed' };

function legendCard() {
  return `<div class="card dashed" style="gap:8px"><h4>Reading the views</h4><div class="legend"><svg class="swatch" viewBox="0 0 28 14"><rect width="28" height="14" fill="#A9784F"/></svg>Solid fill or line: solver state</div><div class="legend"><svg class="swatch" viewBox="0 0 28 14"><rect x="0.5" y="0.5" width="27" height="13" fill="none" stroke="#211B17" stroke-dasharray="4 3"/><line x1="4" y1="13" x2="14" y2="1" stroke="#211B17" opacity="0.5"/><line x1="12" y1="13" x2="22" y2="1" stroke="#211B17" opacity="0.5"/></svg>Dashed or hatched: illustrative</div></div>`;
}

function player(run, play, bands, extra = '') {
  const t = run.t[play.k], tEnd = run.t[run.t.length - 1];
  return `<div class="row wrap between"><div class="player"><button class="play" data-play aria-label="${play.playing ? 'Pause' : 'Play'}">${play.playing ? '<svg width="14" height="14" viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" fill="#fff"/><rect x="9.5" y="2" width="3.5" height="12" fill="#fff"/></svg>' : '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M4 2 L14 8 L4 14 Z" fill="#fff"/></svg>'}</button><div class="time">${fmtTime(t)} <span class="muted">/ ${fmtTime(tEnd)}</span></div><button class="btn" data-speed style="height:36px">${play.speed}× speed</button><button class="btn" data-finish style="height:36px">Finish</button>${extra}</div>
    <div class="row wrap" style="gap:14px"><span class="legend"><span class="swatch" style="width:14px;height:3px;background:#2E6E7C"></span>Head</span><span class="legend"><span class="swatch" style="width:14px;height:3px;background:#A8323A"></span>Outflow TDS</span><span class="legend"><span class="swatch" style="width:14px;height:10px;background:#A8323A;opacity:0.2"></span>Prediction band</span></div></div>
    <div data-timeline>${timeline(run, play.k, { bands })}</div>`;
}

function wirePlayer(root, ctx, run, onFrame) {
  const play = ctx.mem.play;
  let raf = null, last = null;
  const tick = (now) => {
    if (!play.playing) return;
    if (last != null) {
      const t = run.t[play.k] + ((now - last) / 1000) * play.speed;
      play.k = Frame.at(run, t);
      if (play.k >= run.t.length - 1) { play.k = run.t.length - 1; play.playing = false; }
      onFrame();
    }
    last = now;
    if (play.playing) raf = requestAnimationFrame(tick);
  };
  const start = () => { last = null; raf = requestAnimationFrame(tick); };
  const offs = [
    on(root, 'click', '[data-play]', () => { play.playing = !play.playing; if (play.playing && play.k >= run.t.length - 1) play.k = 0; onFrame(); if (play.playing) start(); }),
    on(root, 'click', '[data-speed]', () => { play.speed = play.speed === 1 ? 4 : play.speed === 4 ? 10 : 1; onFrame(); }),
    on(root, 'click', '[data-finish]', () => { play.playing = false; play.k = run.t.length - 1; onFrame(); }),
    on(root, 'click', '.timeline', (e, el) => {
      const r = el.getBoundingClientRect();
      const x0 = Number(el.dataset.x0), x1 = Number(el.dataset.x1), w = Number(el.dataset.w);
      const xv = ((e.clientX - r.left) / r.width) * w;
      const f = Math.max(0, Math.min(1, (xv - x0) / (x1 - x0)));
      play.k = Frame.at(run, f * run.t[run.t.length - 1]); play.playing = false; onFrame();
    }),
  ];
  return () => { play.playing = false; if (raf) cancelAnimationFrame(raf); offs.forEach((f) => f()); };
}

function inputsAside(ctx, i, bands) {
  const water = i.recipe.pours[i.recipe.pours.length - 1].water_to_g;
  const t0 = i.temperature.model === 'custom' ? i.temperature.points[0][1] : i.temperature.t0;
  const card = (title, a, b) => `<a href="#/setup" class="card" style="gap:2px;padding:12px 14px"><div class="small muted">${title}</div><div style="font-weight:600">${a}</div><div class="small muted">${b}</div></a>`;
  return `<div class="eyebrow">Inputs</div>
    ${card('Coffee &amp; grind', `${f1(i.recipe.dose_g)} g · Sauter ${f0(i.grind.sauter_um)} µm`, `Fines under 100 µm: ${f0(i.grind.fines_frac * 100)}% · ${words(i.grind.source)}`)}
    ${card('Water', `${esc(i.water.kind === 'recipe' ? 'Recipe water' : i.water.kind === 'tap' ? 'Tap + filter' : i.water.kind)} · GH ${f0(i.water.gh_ppm)} · KH ${f0(i.water.kh_ppm)}`, 'ppm as CaCO₃')}
    ${card('Brewer', `${esc(i.brewer.name)} · ${esc(i.brewer.paper)}`, ['cone', 'fluted_cone', 'valve_hybrid'].includes(i.brewer.kind) ? `Cone, ${f0(i.brewer.half_angle_deg * 2)}°, ${i.brewer.kind === 'fluted_cone' ? 'fluted' : 'ribbed'} wall` : `Flat bed, ${f0(i.brewer.bed_diameter_mm)} mm`)}
    ${card('Temperature', `Kettle ${f0(t0)} °C · ${i.temperature.model === 'newton' ? 'Newton cooling' : i.temperature.model === 'custom' ? 'custom trace' : 'constant'}`, i.temperature.model === 'newton' ? `τ = ${f0(i.temperature.tau)} s · brewer ${i.brewer.preheated ? 'preheated' : 'cold'}` : '')}
    ${card('Recipe', `${i.recipe.pours.length} pours · ${f0(water)} g`, `${words(i.recipe.pours[1]?.stream || 'smooth')} stream · ${words(i.recipe.pours[1]?.placement || 'spiral')} placement`)}
    <div class="card dashed" style="gap:8px"><h4>Narrow the prediction</h4><div class="small muted">${ctx.fit() ? `Fitted to ${ctx.fit().n_brews} logged brews of this setup. Log another to tighten it further.` : `Log a brew of this coffee with a measured TDS and the cup band tightens${bands ? ` from ±${f2((bands.tds_pct.p90 - bands.tds_pct.p10) / 2)}` : ''}.`}</div><a href="#/log" class="btn">${ctx.fit() ? 'Log another brew' : 'Add a measurement'}</a></div>`;
}

function rightAside(ctx, run, k, bands) {
  const fr = new Frame(run, k);
  const s = run.result.summary;
  const cupG = (fr.s('cup_water_kg', 0) + fr.s('cup_solubles_kg', 0)) * 1000;
  const state = fr.s('bed_state', NaN);
  const pd = [1 - avg(fr, 'pool_fast'), 1 - avg(fr, 'pool_kinetic'), 1 - avg(fr, 'pool_wall')];
  const pi = fr.s('pi_ratio', NaN);
  return `<div class="card dark"><div class="eyebrow">Cup so far</div><div class="row" style="align-items:baseline;gap:8px"><div class="big">${f2(fr.s('cup_tds_pct', 0))}</div><div class="muted">% TDS · ${f0(cupG)} g · EY ${f1(fr.s('ey_pct', 0))}%</div></div><div class="hr"></div><div class="eyebrow">Projected finish</div>
      <div class="grid2"><div><div class="mono" style="font-size:20px">${f2(bands ? bands.tds_pct.p50 : s.cup_tds_pct)} ± ${bands ? f2((bands.tds_pct.p90 - bands.tds_pct.p10) / 2) : '–'}</div><div class="small muted">% TDS</div></div><div><div class="mono" style="font-size:20px">${f1(bands ? bands.ey_pct.p50 : s.ey_pct)} ± ${bands ? f1((bands.ey_pct.p90 - bands.ey_pct.p10) / 2) : '–'}</div><div class="small muted">% EY</div></div></div>
      <div class="small muted">This run: ${f2(s.cup_tds_pct)}% TDS, ${f1(s.ey_pct)}% EY, ${fmtTime(s.total_time_s)}, ${f0(s.cup_mass_g)} g in the cup.</div>
      <div class="small muted">${fmtTime(s.last_pour_end_s)} of that is the pour schedule; the bed sets the ${f0(s.drawdown_time_s)} s drawdown after it.</div></div>
    <div class="card"><div class="row between"><h3>Bed state</h3>${isFinite(state) ? `<span class="pill ${state === 1 ? 'accent' : state === 3 ? 'teal' : 'dark'}">${STATE_LABEL[state]}</span>` : '<span class="pill">coupling off</span>'}</div>
      <div class="kv"><span>Π, pour rate / drain rate</span><span class="v">${isFinite(pi) && pi > 0 ? f1(pi) : '–'}</span></div><div class="kv"><span>Jet penetration</span><span class="v">${f0(fr.s('jet_penetration_m', 0) * 1000)} mm</span></div><div class="kv"><span>Behaviour</span><span class="v">${state === 1 ? (pi > 3 ? 'mixed-tank-like' : 'stirred surface') : state === 3 ? 'immersion' : state === 0 ? 'wetting' : 'plug-flow-like'}</span></div><div class="kv"><span>Slurry temperature</span><span class="v">${f1(fr.s('slurry_temp_c', NaN))} °C</span></div><div class="kv"><span>Drain rate</span><span class="v">${f1(fr.s('drain_rate_kgps', 0) * 1000)} g/s</span></div></div>
    <div class="card"><h3>Pool depletion</h3>${[['Fast pool, surface', pd[0]], ['Kinetic pool, diffusion', pd[1]], ['Wall matrix, hydrolysis', pd[2]]].map(([l, v]) => `<div class="stack"><div class="row between small"><span>${l}</span><span class="mono">${isFinite(v) ? pct(v) : 'single pool'}</span></div><div class="bar"><div style="width:${isFinite(v) ? Math.round(v * 100) : 0}%"></div></div></div>`).join('')}</div>
    ${legendCard()}`;
}

function avg(fr, name) { if (!fr.has(name)) return NaN; let s = 0, n = 0; for (let i = 0; i < fr.nc; i++) for (let j = 0; j < fr.nz; j++) { s += fr.cell(name, i, j); n++; } return s / n; }

export function Simulate(root, ctx) {
  const i = ctx.state.inputs;
  let layer = ctx.mem.layer || 'liquor';
  let view = ctx.mem.view || 'profile';
  root.innerHTML = `<div class="page"><div class="card"><span class="spin"></span> Simulating…</div></div>`;
  let alive = true, off = null, offPlayer = null;
  (async () => {
    let run, bands = null;
    try { run = await ctx.runSim(i); } catch (e) { root.innerHTML = `<div class="page"><div class="status err">${esc(e.message)}</div></div>`; return; }
    if (!alive) return;
    const play = ctx.mem.play;
    if (play.k >= run.t.length) play.k = 0;
    const draw = () => {
      const k = play.k;
      root.innerHTML = `<div class="page three">
        <aside class="col">${inputsAside(ctx, i, bands)}</aside>
        <main class="col">
          <div class="seg only-phone">${[['profile', 'Profile'], ['top', 'Top'], ['cutaway', 'Cutaway']].map(([v, l]) => `<button class="${view === v ? 'on' : ''}" data-view="${v}">${l}</button>`).join('')}</div>
          <div class="grid2 sim-views" style="grid-template-columns:minmax(0,3fr) minmax(0,2fr)">
            <section class="card ${view !== 'profile' ? 'hide-phone' : ''}"><div class="row between wrap"><h3>Profile · section A–A′</h3><div class="seg small" style="width:auto">${LAYERS.map((l) => `<button class="${layer === l.id ? 'on' : ''}" data-layer="${l.id}" style="padding:0 10px">${l.label}</button>`).join('')}</div></div>${profileView(run, k, i, { layer })}</section>
            <section class="card ${view !== 'top' ? 'hide-phone' : ''}"><div class="row between"><h3>Top</h3><span class="mono small muted">t = ${fmtTime(run.t[k])}</span></div>${topView(run, k, i, { layer })}<div class="stack">${topMetrics(run, k).map(([l, v]) => `<div class="kv"><span>${l}</span><span class="v">${v}</span></div>`).join('')}</div></section>
            <section class="card only-phone ${view !== 'cutaway' ? 'hide-phone' : ''}" style="grid-column:1/-1"><h3>Cutaway</h3>${cutawayView(run, k, i, { layer, probe: ctx.mem.probe })}<a href="#/cutaway" class="btn">Open the full cutaway</a></section>
          </div>
          <div class="grid3 only-phone">${(() => { const fr = new Frame(run, k); const cupG = (fr.s('cup_water_kg', 0) + fr.s('cup_solubles_kg', 0)) * 1000; const st = fr.s('bed_state', NaN); return `<div class="stat"><div class="l">Cup TDS</div><div class="n">${f2(fr.s('cup_tds_pct', 0))}%</div></div><div class="stat"><div class="l">In cup</div><div class="n">${f0(cupG)} g</div></div><div class="stat"><div class="l">Bed state</div><div class="n" style="font-size:18px">${isFinite(st) ? STATE_LABEL[st] : '–'}</div></div>`; })()}</div>
          <section class="card">${player(run, play, bands)}</section>
        </main>
        <aside class="col">${rightAside(ctx, run, k, bands)}</aside>
      </div>`;
    };
    const onFrame = () => {
      // Fast path: only swap the pieces that change with time.
      const k = play.k;
      const prof = root.querySelector('.sim-views > section:nth-child(1)'); if (prof) prof.querySelector('svg').outerHTML = profileView(run, k, i, { layer });
      const top = root.querySelector('.sim-views > section:nth-child(2)'); if (top) { top.querySelector('svg').outerHTML = topView(run, k, i, { layer }); top.querySelector('.mono.small').textContent = `t = ${fmtTime(run.t[k])}`; top.querySelector('.stack').innerHTML = topMetrics(run, k).map(([l, v]) => `<div class="kv"><span>${l}</span><span class="v">${v}</span></div>`).join(''); }
      const cut = root.querySelector('.sim-views > section:nth-child(3) svg'); if (cut && view === 'cutaway') cut.outerHTML = cutawayView(run, k, i, { layer, probe: ctx.mem.probe });
      const pl = root.querySelector('main > section.card:last-child'); if (pl) pl.innerHTML = player(run, play, bands);
      const right = root.querySelector('.page > aside:last-child'); if (right) right.innerHTML = rightAside(ctx, run, k, bands);
      const phone = root.querySelector('.grid3.only-phone'); if (phone) { const fr = new Frame(run, k); const cupG = (fr.s('cup_water_kg', 0) + fr.s('cup_solubles_kg', 0)) * 1000; const st = fr.s('bed_state', NaN); phone.innerHTML = `<div class="stat"><div class="l">Cup TDS</div><div class="n">${f2(fr.s('cup_tds_pct', 0))}%</div></div><div class="stat"><div class="l">In cup</div><div class="n">${f0(cupG)} g</div></div><div class="stat"><div class="l">Bed state</div><div class="n" style="font-size:18px">${isFinite(st) ? STATE_LABEL[st] : '–'}</div></div>`; }
    };
    draw();
    off = [
      on(root, 'click', '[data-layer]', (_, el) => { layer = el.dataset.layer; ctx.mem.layer = layer; draw(); }),
      on(root, 'click', '[data-view]', (_, el) => { view = el.dataset.view; ctx.mem.view = view; draw(); }),
    ];
    offPlayer = wirePlayer(root, ctx, run, onFrame);
    // Bands arrive later and slot into the projected finish and the timeline.
    ctx.bandsFor(i, 16).then((b) => { if (!alive) return; bands = b; onFrame(); const aside = root.querySelector('.page > aside:first-child'); if (aside) aside.innerHTML = inputsAside(ctx, i, bands); }).catch((e) => console.warn(e));
  })();
  return () => { alive = false; if (off) off.forEach((f) => f()); if (offPlayer) offPlayer(); };
}

export function Cutaway(root, ctx) {
  const i = ctx.state.inputs;
  let layer = ctx.mem.layer || 'liquor';
  const opts = ctx.mem.cut || (ctx.mem.cut = { cutAngle: 180, tilt: 15, fines: true, bypass: true, motion: true });
  root.innerHTML = `<div class="page"><div class="card"><span class="spin"></span> Simulating…</div></div>`;
  let alive = true, off = null, offPlayer = null;
  (async () => {
    let run, bands = null;
    try { run = await ctx.runSim(i); } catch (e) { root.innerHTML = `<div class="page"><div class="status err">${esc(e.message)}</div></div>`; return; }
    if (!alive) return;
    const play = ctx.mem.play;
    if (play.k >= run.t.length) play.k = 0;
    const nc = run.result.layout.n_columns, nz = run.result.layout.n_cells;
    if (!ctx.mem.probe) ctx.mem.probe = { col: Math.min(nc - 1, Math.floor(nc * 0.6)), cell: Math.min(nz - 1, Math.floor(nz * 0.4)) };
    const probe = ctx.mem.probe;
    const probePanel = (k) => {
      const r = probeReadings(run, k, probe);
      const L = LAYERS.find((l) => l.id === layer);
      const cols = legendColours(layer);
      return `<div class="card dark"><div class="eyebrow">Probe · r ${f0(r.radiusMm)} mm · depth ${f0(r.depthMm)} mm</div><div class="row" style="align-items:baseline;gap:8px"><div class="big">${f1(r.tds)}</div><div class="muted">% TDS in the liquor here</div></div><div class="hr"></div>
          <div class="kv"><span class="muted">Local velocity</span><span class="v">${f2(r.velocity)} mm/s</span></div><div class="kv"><span class="muted">Temperature</span><span class="v">${f1(r.temp)} °C</span></div><div class="kv"><span class="muted">Fast pool depleted</span><span class="v">${isFinite(r.fast) ? pct(r.fast) : 'single pool'}</span></div><div class="kv"><span class="muted">Kinetic pool depleted</span><span class="v">${isFinite(r.kinetic) ? pct(r.kinetic) : '–'}</span></div><div class="kv"><span class="muted">Fines loading</span><span class="v">${isFinite(r.fines) ? `${f1(r.fines)}× initial` : 'fines off'}</span></div></div>
        <div class="card"><h3>This point over time</h3>${probeSeriesChart(run, k, probe)}</div>
        <div class="card"><h3>${esc(L.long)}</h3><div class="row" style="height:14px;border-radius:4px;overflow:hidden;gap:0">${cols.map((c) => `<div style="flex:1;background:${c}"></div>`).join('')}</div><div class="row between mono small muted"><span>${esc(L.legend[0])}</span><span>${esc(L.legend[1])}</span></div></div>
        ${legendCard()}`;
    };
    const draw = () => {
      const k = play.k;
      const fr = new Frame(run, k);
      const st = fr.s('bed_state', NaN);
      root.innerHTML = `<div class="page three">
        <aside class="col">
          <div class="card"><h3>View</h3><div class="seg"><a href="#/simulate" class="btn" style="flex:1;border:0;background:transparent;height:40px">Profile + top</a><button class="on">Cutaway</button></div>
            <div class="stack"><div class="row between small"><label for="cut">Cut angle</label><span class="mono">${opts.cutAngle}°</span></div><input id="cut" type="range" min="0" max="270" step="5" value="${opts.cutAngle}" data-opt="cutAngle"></div>
            <div class="stack"><div class="row between small"><label for="tilt">Camera tilt</label><span class="mono">${opts.tilt}°</span></div><input id="tilt" type="range" min="0" max="90" step="1" value="${opts.tilt}" data-opt="tilt"></div></div>
          <div class="card" style="gap:2px"><h3 style="padding-bottom:6px">Layers</h3>${LAYERS.map((l) => `<label class="check"><input type="radio" name="field" ${layer === l.id ? 'checked' : ''} data-layer="${l.id}">${l.long}</label>`).join('')}<div class="hr" style="margin:6px 0"></div>
            ${[['fines', 'Fines at paper'], ['bypass', 'Bypass path'], ['motion', 'Illustrative motion']].map(([k2, l]) => `<label class="check"><input type="checkbox" ${opts[k2] ? 'checked' : ''} data-flag="${k2}">${l}</label>`).join('')}</div>
          <div class="card dashed"><h4>What this view is</h4><div class="small muted">The column model swept around the brewer axis. It is not a 3D flow solve. Ripples, ribs and swirl are drawn for orientation only. Click a cell to move the probe.</div></div>
        </aside>
        <main class="col">
          <section class="card"><div class="row between wrap"><h3>Cutaway · t = ${fmtTime(run.t[k])}</h3><div class="row">${isFinite(st) ? `<span class="pill ${st === 1 ? 'accent' : 'dark'}">${STATE_LABEL[st]}</span>` : ''}<span class="pill">${nc} radial columns · ${nz} cells</span></div></div><div data-cut>${cutawayView(run, k, i, { ...opts, layer, probe })}</div></section>
          <section class="card">${player(run, play, bands)}</section>
        </main>
        <aside class="col" data-probe>${probePanel(k)}</aside>
      </div>`;
    };
    const onFrame = () => {
      const k = play.k;
      const c = root.querySelector('[data-cut]'); if (c) c.innerHTML = cutawayView(run, k, i, { ...opts, layer, probe });
      const h = root.querySelector('main h3'); if (h) h.textContent = `Cutaway · t = ${fmtTime(run.t[k])}`;
      const pl = root.querySelector('main > section.card:last-child'); if (pl) pl.innerHTML = player(run, play, bands);
      const p = root.querySelector('[data-probe]'); if (p) p.innerHTML = probePanel(k);
    };
    draw();
    off = [
      on(root, 'input', '[data-opt]', (_, el) => { opts[el.dataset.opt] = Number(el.value); el.closest('.stack').querySelector('.mono').textContent = `${el.value}°`; onFrame(); }),
      on(root, 'change', '[data-layer]', (_, el) => { layer = el.dataset.layer; ctx.mem.layer = layer; onFrame(); }),
      on(root, 'change', '[data-flag]', (_, el) => { opts[el.dataset.flag] = el.checked; onFrame(); }),
      on(root, 'click', '.probe-hit', (_, el) => { probe.col = Number(el.dataset.col); probe.cell = Number(el.dataset.cell); onFrame(); }),
    ];
    offPlayer = wirePlayer(root, ctx, run, onFrame);
    ctx.bandsFor(i, 16).then((b) => { if (!alive) return; bands = b; onFrame(); }).catch(() => {});
  })();
  return () => { alive = false; if (off) off.forEach((f) => f()); if (offPlayer) offPlayer(); };
}
