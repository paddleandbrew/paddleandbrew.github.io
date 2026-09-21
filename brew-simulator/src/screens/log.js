// After the brew: log what happened. Taste notes are stored with the run and never used in the physics fit.
import { html, render } from '../../vendor/lit-html/lit-html.js';
import { unsafeSVG } from '../../vendor/lit-html/directives/unsafe-svg.js';
import { live } from '../../vendor/lit-html/directives/live.js';
import { on, fmtTime, f0, f2, words } from '../ui.js';
import { uid } from '../store.js';

const DESCRIPTORS = [['sour', 'Sour'], ['sweet', 'Sweet'], ['fruit_forward', 'Fruit forward'], ['bitter', 'Bitter'], ['drying_finish', 'Drying finish'], ['thin', 'Thin'], ['floral', 'Floral'], ['chocolate', 'Chocolate'], ['nutty', 'Nutty'], ['juicy', 'Juicy'], ['heavy_body', 'Heavy body'], ['astringent', 'Astringent'], ['hollow', 'Hollow'], ['balanced', 'Balanced'], ['clean', 'Clean'], ['muddy', 'Muddy']];
const BEDS = [['flat', 'Flat', '<polygon points="12,15 44,15 34,28 22,28" fill="#86552F"/>'], ['high_walls', 'High walls', '<path d="M9 11 Q28 24 47 11 L34 28 L22 28 Z" fill="#86552F"/>'], ['cratered', 'Cratered', '<path d="M12 15 L24 15 Q28 24 32 15 L44 15 L34 28 L22 28 Z" fill="#86552F"/>']];

function parseTime(s) { s = String(s).trim(); if (!s) return null; const m = s.match(/^(\d+):(\d{1,2})$/); if (m) return Number(m[1]) * 60 + Number(m[2]); const n = Number(s); return isFinite(n) ? n : null; }

export function LogBrew(root, ctx) {
  const i = ctx.inputs;
  const lastRun = ctx.runs()[0];
  const pred = lastRun ? lastRun.summary : null;
  const bands = ctx.mem.bands;
  const log = { time: pred ? fmtTime(pred.total_time_s) : '', mass: pred ? Math.round(pred.cup_mass_g) : '', tds: '', bed: pred ? pred.bed_shape : null, flavour: {}, notes: '', liking: null, consent: ctx.settings.consent, split: null };
  let err = null, saving = false;
  const paint = () => render(tpl(), root);
  const tpl = () => html`<div class="page flow">
      <header class="stack"><div class="eyebrow">After the brew${lastRun ? ` · run ${lastRun.id.slice(-5)}` : ''}</div><div class="title">What actually happened?</div><div class="small muted">Fill in what you have. Each line tightens the next prediction.</div></header>
      <div class="row"><div class="field" style="flex:1"><label for="l-time">Total time</label><input id="l-time" type="text" .value=${String(log.time)} placeholder="3:22" data-f="time"><div class="hint">${pred ? `predicted ${fmtTime(pred.total_time_s)}` : 'no prediction on record'}</div></div>
        <div class="field" style="flex:1"><label for="l-mass">Cup weight</label><input id="l-mass" type="number" step="1" .value=${String(log.mass)} data-f="mass"><div class="hint">${pred ? `predicted ${f0(pred.cup_mass_g)} g` : ''}</div></div></div>
      <div class="field"><div class="row between"><label for="l-tds">Measured TDS</label><span class="small muted">refractometer, optional</span></div><input id="l-tds" type="number" step="0.01" class="hot" .value=${String(log.tds)} placeholder="1.46" data-f="tds"><div class="hint">${pred ? `predicted ${f2(pred.cup_tds_pct)}${bands ? ` ± ${f2((bands.tds_pct.p90 - bands.tds_pct.p10) / 2)}` : ''}${log.tds !== '' && bands ? (Number(log.tds) >= bands.tds_pct.p10 && Number(log.tds) <= bands.tds_pct.p90 ? ' · inside the band' : ' · outside the band') : ''}` : ''}</div></div>
      <div class="stack"><div style="font-weight:600;font-size:13px">Bed after drawdown</div><div class="grid3">${BEDS.map(([k, l, svg]) => html`<button class="tile ${log.bed === k ? 'on' : ''}" data-bed=${k}><svg width="56" height="30" viewBox="0 0 56 30" aria-hidden="true"><polyline points="2,2 22,28 34,28 54,2" fill="none" stroke="#211B17" stroke-width="2" stroke-linejoin="round"/>${unsafeSVG(svg)}</svg>${l}</button>`)}</div><div class="small muted">${pred && pred.bed_shape ? `predicted ${words(pred.bed_shape)}` : ''}</div></div>
      <div class="stack"><div class="row between"><div style="font-weight:600;font-size:13px">In the cup</div><div class="small muted">tap again for intensity</div></div><div class="chips">${DESCRIPTORS.map(([k, l]) => { const v = log.flavour[k] || 0; return html`<button class="chip ${v ? 'on' : ''} ${v >= 2 ? 'i2' : ''} ${v >= 3 ? 'i3' : ''}" data-fl=${k}>${l}${v ? html` <span class="mono">${v}</span>` : ''}</button>`; })}</div>
        <div class="field"><textarea data-f="notes" placeholder="Free notes" .value=${log.notes}></textarea></div>
        <div class="row between"><span class="small">Overall</span><div class="row">${[1, 2, 3, 4, 5].map((n) => html`<button class="chip ${log.liking === n ? 'on' : ''}" data-like=${n} style="height:36px;padding:0 12px">${n}</button>`)}</div></div>
        <div class="small muted">Taste notes are stored with the run. They do not change the physics fit.</div></div>
      <details><summary class="small">Split collection (optional experiment)</summary><div class="grid2" style="margin-top:8px"><div class="field"><label>First half, g</label><input type="number" data-split="first_mass_g"></div><div class="field"><label>First half TDS</label><input type="number" step="0.01" data-split="first_tds_pct"></div><div class="field"><label>Second half, g</label><input type="number" data-split="second_mass_g"></div><div class="field"><label>Second half TDS</label><input type="number" step="0.01" data-split="second_tds_pct"></div></div></details>
      <label class="check"><input type="checkbox" .checked=${live(!!log.consent)} data-consent>Pool this brew for research (anonymised, no personal data)</label>
      <div class="card dashed small muted" style="padding:12px 14px">Time alone narrows the grind estimate. Time plus TDS also narrows the bean estimate.</div>
      <div class="status err" data-err style=${err ? '' : 'display:none'}>${err ?? ''}</div>
      <button class="btn primary big" data-save ?disabled=${saving}>${saving ? html`<span class="spin"></span> Saving` : 'Save and update the model'}</button>
      <div class="row between small muted"><a href="#/simulate">Back to the brew</a><a href="#/calibrate">Calibration</a></div>
    </div>`;
  paint();
  const offs = [
    on(root, 'input', '[data-f]', (_, el) => { log[el.dataset.f] = el.value; }),
    on(root, 'change', '[data-f="tds"]', () => paint()),
    on(root, 'click', '[data-bed]', (_, el) => { log.bed = log.bed === el.dataset.bed ? null : el.dataset.bed; paint(); }),
    on(root, 'click', '[data-fl]', (_, el) => { const k = el.dataset.fl; log.flavour[k] = ((log.flavour[k] || 0) + 1) % 4; paint(); }),
    on(root, 'click', '[data-like]', (_, el) => { log.liking = Number(el.dataset.like); paint(); }),
    on(root, 'change', '[data-consent]', (_, el) => { log.consent = el.checked; }),
    on(root, 'change', '[data-split]', (_, el) => { log.split = log.split || {}; log.split[el.dataset.split] = Number(el.value); }),
    on(root, 'click', '[data-save]', async () => {
      const time = parseTime(log.time);
      const outcomes = { total_time_s: time, cup_mass_g: log.mass === '' ? null : Number(log.mass), tds_pct: log.tds === '' ? null : Number(log.tds), bed_shape: log.bed, split: log.split && ['first_mass_g', 'first_tds_pct', 'second_mass_g', 'second_tds_pct'].every((k) => isFinite(log.split[k])) ? log.split : null };
      if (outcomes.total_time_s == null && outcomes.cup_mass_g == null && outcomes.tds_pct == null && !outcomes.bed_shape) { err = 'Log at least one outcome: time, cup weight, TDS or bed shape.'; paint(); return; }
      err = null; saving = true; paint();
      const brewLog = { id: uid('log'), created_at: new Date().toISOString(), run_id: lastRun ? lastRun.id : null, inputs: i, outcomes, flavour: { labels: Object.entries(log.flavour).filter(([, v]) => v > 0).map(([descriptor, intensity]) => ({ descriptor, intensity })), notes: log.notes, liking: log.liking }, traces: { slurry_temp_c: [], flow_rate_gps: [], inline_tds_pct: [] }, consent_pooled: !!log.consent, notes: '' };
      await ctx.db.put('logs', brewLog);
      await ctx.patch({ consent: !!log.consent });
      // The run record now points at the brew it predicted, so the pair stays linked in the store.
      if (lastRun) await ctx.db.put('runs', { ...lastRun, log_id: brewLog.id });
      ctx.mem.fitStale = true;
      ctx.navigate('#/calibrate');
    }),
  ];
  return () => offs.forEach((f) => f());
}
