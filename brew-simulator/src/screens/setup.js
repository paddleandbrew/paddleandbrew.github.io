// Setup: every input the model reads, grouped as in the mockup, with the input-confidence tier derived from what is known.
import { html, render } from '../../vendor/lit-html/lit-html.js';
import { unsafeHTML } from '../../vendor/lit-html/directives/unsafe-html.js';
import { live } from '../../vendor/lit-html/directives/live.js';
import { on, f0, f1, f2, BREWERS, brewerIcon, words, infoBtn, infoNote } from '../ui.js';
import { psdChart } from '../draw.js';
import { PROFILE_KINDS, setupIdFor } from '../store.js';
import { PROFILE_LABEL, applyProfile } from '../profiles.js';

const PLACEMENTS = ['centre', 'spiral', 'full_spiral', 'edge'];
const STREAMS = ['smooth', 'broken'];
const AFTERS = ['none', 'swirl', 'stir'];

export function tierOf(i) {
  if (i.grind.source === 'feel') return 1;
  if ((i.grind.source === 'sieve' || i.grind.source === 'psd') && i.bean.profile_loaded) return 3;
  return 2;
}

function sauterFromSieve(f) {
  // Bins: <100, 100-300, 300-600, >600 um with mid diameters; Sauter d32 = sum(m) / sum(m/d).
  const mids = [50, 200, 450, 800];
  const tot = f.reduce((a, b) => a + b, 0) || 1;
  const inv = f.reduce((a, m, k) => a + m / tot / mids[k], 0);
  return { sauter: 1 / inv, fines: f[0] / tot };
}

function sauterFromPsd(text) {
  const rows = text.split(/\n|;/).map((l) => l.trim().split(/[,\s\t]+/).map(Number)).filter((r) => r.length >= 2 && r.every(isFinite));
  if (rows.length < 3) return null;
  const tot = rows.reduce((a, r) => a + r[1], 0) || 1;
  const inv = rows.reduce((a, r) => a + r[1] / tot / Math.max(1, r[0]), 0);
  const fines = rows.filter((r) => r[0] < 100).reduce((a, r) => a + r[1], 0) / tot;
  return { sauter: 1 / inv, fines };
}

export function Setup(root, ctx) {
  const i = ctx.inputs;
  if (!i.brewer.half_angle_deg) i.brewer.half_angle_deg = 30;
  let grindTab = i.grind.source === 'sieve' ? 'sieve' : i.grind.source === 'psd' ? 'psd' : 'profile';
  let sieve = [Math.round(i.grind.fines_frac * 100), 30, 40, 100 - Math.round(i.grind.fines_frac * 100) - 70];
  let psdText = '';
  let status = null;
  let running = false;
  const t0 = () => (i.temperature.model === 'custom' ? (i.temperature.points[0] || [0, 93])[1] : i.temperature.t0);

  // lit updates the bindings that changed and leaves the rest of the DOM in place, so re-rendering
  // while someone is typing keeps the caret, the focus and the button under the pointer. The old
  // deferred-render scheduler existed only to work around losing all three.
  const paint = () => render(tpl(), root);

  const tpl = () => {
    i.tier = tierOf(i);
    const rec = i.recipe;
    const water = rec.pours[rec.pours.length - 1]?.water_to_g || 0;
    const fit = ctx.fit();
    const derived = !!(i.profile_ids && i.profile_ids.grinder && i.profile_ids.bean && i.profile_ids.brewer);
    return html`<div class="page three">
      <aside class="col">
        <div class="card"><div class="row between"><h3>From a profile</h3><a href="#/profiles" class="small">manage</a></div>
          ${PROFILE_KINDS.map((k) => { const list = ctx.db.profiles(k); const cur = i.profile_ids?.[k]; return html`<div class="field"><label>${PROFILE_LABEL[k]}</label><select data-pick=${k}><option value="">${list.length ? '— choose —' : `— no ${PROFILE_LABEL[k].toLowerCase()} profiles —`}</option>${list.map((p) => html`<option value=${p.id} ?selected=${p.id === cur}>${p.name}</option>`)}</select></div>`; })}
          <div class="small muted">Picking one fills that section. The setup id is derived from the grinder, bean and brewer profiles when all three are chosen.</div></div>
        <div class="card" style="gap:2px"><h3 style="padding-bottom:6px">Sections</h3>
          ${[['#grind', 'Grind', `tier ${i.grind.source === 'feel' ? 1 : i.grind.source === 'grinder_profile' ? 2 : 3}`], ['#brewer', 'Brewer', 'tier 1'], ['#water', 'Water', i.water.kind === 'assumed average' ? 'assumed' : 'tier 2'], ['#temp', 'Temperature', i.temperature.model === 'custom' ? 'trace' : 'tier 1'], ['#recipe', 'Recipe', `${rec.pours.length} pours`], ['#measure', 'Measurements', fit ? `${fit.n_brews} brews` : 'none']].map(([h, l, t]) => html`<a href=${h} class="nav-link" data-jump=${h}><span>${l}</span><span class="tag">${t}</span></a>`)}
        </div>
        <div class="card" id="bean"><h3>Bean profile</h3>
          <div class="field"><label>Name</label><input type="text" .value=${i.bean.name ?? ''} data-bean="name"></div>
          <div class="grid2"><div class="field"><label>Max extractable</label><input type="number" step="0.01" .value=${String(i.bean.max_extractable ?? '')} placeholder="0.30" data-bean-num="max_extractable"><div class="hint">fraction, exhaustive immersion</div></div>
          <div class="field"><label>Days off roast</label><input type="number" step="1" .value=${String(i.bean.roast_days ?? '')} data-bean-num="roast_days"></div></div>
          <div class="grid2"><div class="field"><label>Agtron whole</label><input type="number" step="1" .value=${String(i.bean.agtron_whole ?? '')} data-bean-num="agtron_whole"></div><div class="field"><label>Agtron ground</label><input type="number" step="1" .value=${String(i.bean.agtron_ground ?? '')} data-bean-num="agtron_ground"></div></div>
          <label class="check"><input type="checkbox" .checked=${live(!!i.bean.profile_loaded)} data-bean-flag="profile_loaded">Roaster profile loaded (scanned from the bag)</label>
          <details><summary class="small">Paste a roaster profile (JSON)</summary><textarea class="field" data-profile-json placeholder='{"name":"…","max_extractable":0.31,"pool_split":[0.55,0.35,0.10],"density_kgm3":380,"agtron_whole":72,"agtron_ground":88,"process":"washed","origin":"…"}' style="width:100%;min-height:70px;margin-top:6px"></textarea><button class="btn" data-profile-apply style="margin-top:6px">Apply profile</button></details>
        </div>
      </aside>
      <main class="col">
        <div class="grid2" style="align-items:start">
        <section class="card" id="grind"><div class="row between wrap"><h3>Grind distribution</h3><div class="tabs">${[['profile', 'Grinder profile'], ['sieve', 'Sieve data'], ['psd', 'Upload PSD'], ['feel', 'By feel']].map(([k, l]) => html`<button class=${grindTab === k ? 'on' : ''} data-gtab=${k}>${l}</button>`)}</div></div>
          ${unsafeHTML(psdChart(i.grind.sauter_um, i.grind.spread, i.grind.fines_frac))}
          ${grindTab === 'profile' ? html`<div class="grid2"><div class="field"><label>Grinder</label><input type="text" .value=${i.grind.grinder ?? ''} data-grind="grinder"></div><div class="field"><label>Setting</label><input type="number" step="0.1" .value=${String(i.grind.setting ?? '')} data-grind-num="setting"></div></div>
            <div class="grid2"><div class="field"><label>Sauter diameter, µm</label><input type="number" step="5" .value=${f0(i.grind.sauter_um)} data-grind-num="sauter_um"></div><div class="field"><label>Fines under 100 µm, %</label><input type="number" step="1" .value=${f0(i.grind.fines_frac * 100)} data-grind-pct="fines_frac"></div></div>
            <div class="small muted">A grinder profile maps the setting to a Sauter diameter and a fines share. Edit the numbers if you know them.</div>` : ''}
          ${grindTab === 'sieve' ? html`<div class="grid4">${['< 100 µm', '100–300', '300–600', '> 600'].map((l, k) => html`<div class="field"><label>${l}</label><input type="number" step="1" .value=${String(sieve[k])} data-sieve=${k}></div>`)}</div><div class="small muted">Mass % in each sieve fraction. Sauter ${f0(sauterFromSieve(sieve).sauter)} µm, fines ${f0(sauterFromSieve(sieve).fines * 100)}%.</div><button class="btn" data-sieve-apply>Use sieve data</button>` : ''}
          ${grindTab === 'psd' ? html`<div class="field"><label>Particle size data: diameter µm, mass % per line</label><textarea data-psd placeholder="50, 8&#10;120, 12&#10;250, 30&#10;400, 32&#10;650, 18" .value=${psdText}></textarea></div><button class="btn" data-psd-apply>Use measured PSD</button>` : ''}
          ${grindTab === 'feel' ? html`<div class="seg">${[['fine', 'Fine', 300, 0.2], ['med_fine', 'Med-fine', 420, 0.14], ['medium', 'Medium', 550, 0.1], ['coarse', 'Coarse', 750, 0.07]].map(([k, l, s, f]) => html`<button class=${Math.abs(i.grind.sauter_um - s) < 40 ? 'on' : ''} data-feel="${s},${f}">${l}</button>`)}</div><div class="small muted">By feel only: tier 1, the widest bands.</div>` : ''}
        </section>
        <section class="card" id="brewer"><h3>Brewer</h3>
          <div class="grid5">${BREWERS.map((b) => html`<button class="tile ${i.brewer.kind === b.kind ? 'on' : ''}" data-brewer=${b.kind}>${brewerIcon(b.icon, 30)}${b.label}</button>`)}</div>
          <div class="grid2"><div class="field"><label>Filter paper</label><select data-paper>${[['Tabbed, bleached', 1.0], ['Untabbed, unbleached', 1.15], ['Wave / flat', 1.3], ['Disc', 1.5], ['Thick (slow) paper', 1.8]].map(([n, s]) => html`<option value=${s} ?selected=${Math.abs(i.brewer.paper_resistance_scale - s) < 0.01}>${n}</option>`)}</select></div>
            <div class="field"><label>Rim diameter, mm</label><input type="number" step="1" .value=${String(i.brewer.top_diameter_mm)} data-brewer-num="top_diameter_mm"></div></div>
          <div class="grid2">${['cone', 'fluted_cone', 'valve_hybrid'].includes(i.brewer.kind) ? html`<div class="field"><label>Half angle, °</label><input type="number" step="1" .value=${String(i.brewer.half_angle_deg)} data-brewer-num="half_angle_deg"></div>` : html`<div class="field"><label>Bed diameter, mm</label><input type="number" step="1" .value=${String(i.brewer.bed_diameter_mm)} data-brewer-num="bed_diameter_mm"></div>`}
            ${['valve_hybrid', 'immersion'].includes(i.brewer.kind) ? html`<div class="field"><label>Valve opens at, s</label><input type="number" step="5" .value=${String(i.brewer.valve_open_at_s ?? 120)} data-brewer-num="valve_open_at_s"></div>` : html`<label class="check"><input type="checkbox" .checked=${live(!!i.brewer.preheated)} data-brewer-flag="preheated">Brewer preheated</label>`}</div>
          <div class="row between small muted"><span>Derived from geometry</span><span class="mono">λ_w ${f2(i.brewer.lambda_w)} · β_b ${f2(i.brewer.beta_b)}</span></div>
        </section>
        </div>
        <div class="grid2" style="align-items:start">
        <section class="card" id="water"><div class="row between wrap"><h3>Water</h3><div class="tabs">${[['tap', 'Tap + filter'], ['recipe', 'Recipe water'], ['custom', 'Custom']].map(([k, l]) => html`<button class=${(i.water.kind === k) || (k === 'custom' && !['tap', 'recipe'].includes(i.water.kind)) ? 'on' : ''} data-water=${k}>${l}</button>`)}</div></div>
          <div class="grid3"><div class="field"><label>General hardness</label><input type="number" step="5" .value=${String(i.water.gh_ppm)} data-water-num="gh_ppm"><div class="hint">ppm as CaCO₃</div></div><div class="field"><label>Alkalinity</label><input type="number" step="5" .value=${String(i.water.kh_ppm)} data-water-num="kh_ppm"><div class="hint">ppm as CaCO₃</div></div><div class="field"><label>Mg : Ca</label><input type="number" step="0.5" .value=${String(i.water.mg_ca)} data-water-num="mg_ca"></div></div>
          <div class="small muted">Feeds the kinetic-pool rate through two guessed sensitivities (registry: water_gh_sensitivity, water_kh_sensitivity).</div>
        </section>
        <section class="card" id="temp"><div class="row between wrap"><h3>Temperature</h3><div class="tabs">${[['constant', 'Constant'], ['newton', 'Newton cooling'], ['custom', 'Custom trace']].map(([k, l]) => html`<button class=${i.temperature.model === k ? 'on' : ''} data-temp=${k}>${l}</button>`)}</div></div>
          ${i.temperature.model === 'newton' ? html`<div class="mono small" style="padding:8px 10px;background:var(--chip2);border-radius:8px">T(t) = T_env + (T₀ − T_env) · e^(−t/τ)</div><div class="grid3"><div class="field"><label>Kettle T₀</label><input type="number" step="1" .value=${String(i.temperature.t0)} data-temp-num="t0"></div><div class="field"><label>Room T_env</label><input type="number" step="1" .value=${String(i.temperature.t_env)} data-temp-num="t_env"></div><div class="field"><label>Kettle τ, s</label><input type="number" step="10" .value=${String(i.temperature.tau)} data-temp-num="tau"></div></div>` : ''}
          ${i.temperature.model === 'constant' ? html`<div class="grid3"><div class="field"><label>Kettle T₀</label><input type="number" step="1" .value=${String(i.temperature.t0)} data-temp-num="t0"></div></div>` : ''}
          ${i.temperature.model === 'custom' ? html`<div class="field"><label>Kettle temperature points: seconds, °C per line</label><textarea data-temp-points .value=${(i.temperature.points || []).map((p) => p.join(', ')).join('\n')}></textarea></div><div class="grid3"><div class="field"><label>Room T_env</label><input type="number" step="1" .value=${String(i.temperature.t_env)} data-temp-num="t_env"></div></div>` : ''}
        </section>
        </div>
        <section class="card" id="recipe"><div class="row between wrap"><div class="row"><h3>Recipe</h3>${infoBtn('setup.recipe')}</div><div class="row"><div class="field" style="width:120px"><label>Dose, g</label><input type="number" step="0.5" .value=${String(rec.dose_g)} data-dose></div><span class="mono small muted">ratio 1 : ${f1(water / rec.dose_g)} · ${rec.pours.length} pours · ${water} g</span></div></div>${infoNote('setup.recipe')}
          <div class="scroll-x"><table class="t"><thead><tr><th>Pour</th><th>Start</th><th>Water to, g</th><th>Rate, g/s</th><th>Stream</th><th>Placement</th><th>After</th><th></th></tr></thead><tbody>
          ${rec.pours.map((p, k) => html`<tr><td>${k === 0 ? 'Bloom' : k + 1}</td><td><input type="number" step="1" .value=${String(p.start_s)} data-pour=${k} data-key="start_s"></td><td><input type="number" step="5" .value=${String(p.water_to_g)} data-pour=${k} data-key="water_to_g"></td><td><input type="number" step="0.5" .value=${String(p.rate_gps)} data-pour=${k} data-key="rate_gps"></td>
            <td><select data-pour=${k} data-key="stream">${STREAMS.map((s) => html`<option ?selected=${p.stream === s}>${s}</option>`)}</select></td><td><select data-pour=${k} data-key="placement">${PLACEMENTS.map((s) => html`<option value=${s} ?selected=${p.placement === s}>${words(s)}</option>`)}</select></td><td><select data-pour=${k} data-key="after">${AFTERS.map((s) => html`<option ?selected=${p.after === s}>${s}</option>`)}</select></td><td><button class="btn" style="height:32px;padding:0 10px" data-pour-del=${k} aria-label="Remove pour">×</button></td></tr>`)}
          </tbody></table></div>
          <div class="row"><button class="btn" data-pour-add>Add pour</button><span class="small muted">Start times are pushed later if a pour would overlap the previous one.</span></div>
        </section>
      </main>
      <aside class="col">
        <div class="card"><div class="row between"><h3>Input confidence</h3>${infoBtn('setup.confidence')}</div>${infoNote('setup.confidence')}<div class="row">${[1, 2, 3].map((t) => html`<div style="flex:1;height:8px;border-radius:4px;background:${t <= i.tier ? 'var(--ink)' : 'var(--chip)'}"></div>`)}</div><div class="small muted">Tier ${i.tier} of 3</div>
          <div class="grid2">${ctx.mem.bands ? html`<div><div class="mono" style="font-size:20px">± ${f2((ctx.mem.bands.tds_pct.p90 - ctx.mem.bands.tds_pct.p10) / 2)}</div><div class="small muted">% TDS band</div></div><div><div class="mono" style="font-size:20px">± ${f1((ctx.mem.bands.ey_pct.p90 - ctx.mem.bands.ey_pct.p10) / 2)}</div><div class="small muted">% EY band</div></div>` : html`<div class="small muted">Run a simulation to size the band.</div>`}</div></div>
        <div class="card" id="measure"><h3>What would narrow it</h3>
          <div class="kv"><span>Measured TDS from a past brew</span><span class="v">${fit && fit.checks.some((c) => c.tds_in_band != null) ? 'in use' : 'to about half'}</span></div><div class="hr"></div>
          <div class="kv"><span>Logged drawdown time</span><span class="v">${fit ? 'in use' : 'narrows grind'}</span></div><div class="hr"></div>
          <div class="kv"><span>Slurry temperature trace</span><span class="v">pins the thermal module</span></div>
          <a href="#/log" class="btn">Add a measurement</a></div>
        <div class="card"><h3>Your equipment</h3><div class="chips">${[['scale', 'Scale, 0.1 g'], ['thermometer', 'Thermometer'], ['refractometer', 'Refractometer'], ['sieves', 'Sieves'], ['flow_kettle', 'Flow-rate kettle']].map(([k, l]) => html`<button class="chip ${i.equipment[k] ? 'on' : ''}" data-equip=${k}>${l}</button>`)}</div><div class="small muted">Sets which inputs we ask for and which recipe levers the search may use.</div></div>
        <div class="card"><div class="field"><label>Setup id (grinder · bean · brewer)</label><input type="text" .value=${derived ? setupIdFor(i) : (i.setup_id ?? '')} data-setup-id ?readonly=${derived}><div class="hint">${derived ? 'from the three profiles; fitted constants are stored per setup' : 'fitted constants are stored per setup'}</div></div></div>
        <div style="flex-grow:1"></div>
        <div class="status err" data-status style=${status ? '' : 'display:none'}>${status ?? ''}</div>
        <button class="btn primary big" data-run ?disabled=${running}>${running ? html`<span class="spin"></span> Running` : 'Run simulation'}</button>
      </aside>
    </div>`;
  };
  paint();
  // The first edit means these are no longer the bundled sample inputs; it is worth one write.
  const touch = () => { if (ctx.settings.sampleData) ctx.patch({ sampleData: false }); };
  const setBrewer = async (kind) => { const b = await ctx.engine.call('brewer_preset', kind); i.brewer = b; if (['valve_hybrid', 'immersion'].includes(kind) && !i.brewer.valve_open_at_s) i.brewer.valve_open_at_s = 120; touch(); paint(); };
  const offs = [
    on(root, 'click', '[data-jump]', (e, el) => { e.preventDefault(); const t = root.querySelector(el.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }),
    on(root, 'input', '[data-bean]', (_, el) => { i.bean[el.dataset.bean] = el.value; touch(); }),
    on(root, 'change', '[data-bean-num]', (_, el) => { i.bean[el.dataset.beanNum] = el.value === '' ? null : Number(el.value); touch(); }),
    on(root, 'change', '[data-bean-flag]', (_, el) => { i.bean[el.dataset.beanFlag] = el.checked; touch(); paint(); }),
    on(root, 'click', '[data-profile-apply]', () => { try { const p = JSON.parse(root.querySelector('[data-profile-json]').value); Object.assign(i.bean, p, { profile_loaded: true }); touch(); paint(); ctx.toast('Bean profile applied'); } catch (e) { ctx.toast('Profile is not valid JSON', 'err'); } }),
    on(root, 'click', '[data-gtab]', (_, el) => { grindTab = el.dataset.gtab; if (grindTab === 'profile') i.grind.source = 'grinder_profile'; paint(); }),
    on(root, 'input', '[data-grind]', (_, el) => { i.grind[el.dataset.grind] = el.value; touch(); }),
    on(root, 'change', '[data-grind-num]', (_, el) => { i.grind[el.dataset.grindNum] = Number(el.value); i.grind.source = 'grinder_profile'; touch(); paint(); }),
    on(root, 'change', '[data-grind-pct]', (_, el) => { i.grind[el.dataset.grindPct] = Number(el.value) / 100; i.grind.source = 'grinder_profile'; touch(); paint(); }),
    on(root, 'change', '[data-sieve]', (_, el) => { sieve[Number(el.dataset.sieve)] = Number(el.value); paint(); }),
    on(root, 'click', '[data-sieve-apply]', () => { const r = sauterFromSieve(sieve); i.grind.sauter_um = r.sauter; i.grind.fines_frac = r.fines; i.grind.source = 'sieve'; touch(); paint(); }),
    on(root, 'input', '[data-psd]', (_, el) => { psdText = el.value; }),
    on(root, 'click', '[data-psd-apply]', () => { const r = sauterFromPsd(psdText); if (!r) { ctx.toast('Need at least three size rows', 'err'); return; } i.grind.sauter_um = r.sauter; i.grind.fines_frac = r.fines; i.grind.source = 'psd'; touch(); paint(); }),
    on(root, 'click', '[data-feel]', (_, el) => { const [s, f] = el.dataset.feel.split(',').map(Number); i.grind.sauter_um = s; i.grind.fines_frac = f; i.grind.source = 'feel'; touch(); paint(); }),
    on(root, 'click', '[data-brewer]', (_, el) => setBrewer(el.dataset.brewer)),
    on(root, 'change', '[data-brewer-num]', (_, el) => { i.brewer[el.dataset.brewerNum] = Number(el.value); touch(); }),
    on(root, 'change', '[data-brewer-flag]', (_, el) => { i.brewer[el.dataset.brewerFlag] = el.checked; touch(); }),
    on(root, 'change', '[data-paper]', (_, el) => { i.brewer.paper_resistance_scale = Number(el.value); i.brewer.paper = el.selectedOptions[0].textContent; touch(); }),
    on(root, 'click', '[data-water]', (_, el) => { const k = el.dataset.water; if (k === 'tap') Object.assign(i.water, { kind: 'tap', gh_ppm: 100, kh_ppm: 60, mg_ca: 0.5 }); else if (k === 'recipe') Object.assign(i.water, { kind: 'recipe', gh_ppm: 60, kh_ppm: 40, mg_ca: 2 }); else i.water.kind = 'custom'; touch(); paint(); }),
    on(root, 'change', '[data-water-num]', (_, el) => { i.water[el.dataset.waterNum] = Number(el.value); if (i.water.kind === 'assumed average') i.water.kind = 'custom'; touch(); }),
    on(root, 'click', '[data-temp]', (_, el) => { const k = el.dataset.temp; const cur = t0(); if (k === 'constant') i.temperature = { model: 'constant', t0: cur }; else if (k === 'newton') i.temperature = { model: 'newton', t0: cur, t_env: 22, tau: 410 }; else i.temperature = { model: 'custom', points: [[0, cur], [60, cur - 2], [180, cur - 5]], t_env: 22 }; touch(); paint(); }),
    on(root, 'change', '[data-temp-num]', (_, el) => { i.temperature[el.dataset.tempNum] = Number(el.value); touch(); }),
    on(root, 'change', '[data-temp-points]', (_, el) => { const pts = el.value.split('\n').map((l) => l.split(/[,\s]+/).map(Number)).filter((p) => p.length >= 2 && p.every(isFinite)); if (pts.length) i.temperature.points = pts.map((p) => [p[0], p[1]]); touch(); }),
    on(root, 'change', '[data-dose]', (_, el) => { i.recipe.dose_g = Number(el.value); touch(); paint(); }),
    on(root, 'change', '[data-pour]', (_, el) => { const p = i.recipe.pours[Number(el.dataset.pour)]; const k = el.dataset.key; p[k] = ['stream', 'placement', 'after'].includes(k) ? el.value : Number(el.value); touch(); paint(); }),
    on(root, 'click', '[data-pour-del]', (_, el) => { if (i.recipe.pours.length > 1) { i.recipe.pours.splice(Number(el.dataset.pourDel), 1); touch(); paint(); } }),
    on(root, 'click', '[data-pour-add]', () => { const last = i.recipe.pours[i.recipe.pours.length - 1]; i.recipe.pours.push({ start_s: last.start_s + 40, water_to_g: last.water_to_g + 50, rate_gps: last.rate_gps, stream: 'smooth', placement: 'spiral', after: 'none' }); touch(); paint(); }),
    on(root, 'click', '[data-equip]', (_, el) => { i.equipment[el.dataset.equip] = !i.equipment[el.dataset.equip]; touch(); paint(); }),
    on(root, 'change', '[data-setup-id]', (_, el) => { i.setup_id = el.value.trim() || 'default'; touch(); }),
    on(root, 'change', '[data-pick]', (_, el) => {
      const p = el.value ? ctx.db.find('profiles', el.value) : null;
      if (p) applyProfile(i, p); else if (i.profile_ids) delete i.profile_ids[el.dataset.pick];
      i.setup_id = setupIdFor(i); touch(); paint();
    }),
    on(root, 'click', '[data-run]', async () => {
      const err = await ctx.engine.call('validate_inputs', i);
      if (err) { status = err; paint(); return; }
      status = null;
      i.tier = tierOf(i);
      i.setup_id = setupIdFor(i);
      await ctx.patch({ inputs: i });
      running = true; paint();
      try { await ctx.runSim(i, true); ctx.navigate('#/simulate'); } catch (e) { status = e.message; running = false; paint(); }
    }),
  ];
  return () => { offs.forEach((f) => f()); ctx.patch({ inputs: i }); };
}
