// Profiles: the user's beans, grinders, brewers, waters and recipes, and the published catalogue
// they can be copied from.
import { html, render } from '../../vendor/lit-html/lit-html.js';
import { on, f0, infoBtn, infoNote } from '../ui.js';
import { PROFILE_KINDS } from '../store.js';
import { PROFILE_LABEL, PROFILE_HINT, applyProfile, sliceFor, defaultName, summarise, grindAt } from '../profiles.js';
import { refreshCatalogue, catalogueEntries, forkFromCatalogue, catalogueUpdateFor } from '../catalogue.js';

const when = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : 'never');

export function Profiles(root, ctx) {
  const db = ctx.db;
  let kind = ctx.mem.profileKind || 'grinder';
  let selected = null;       // id of the profile being edited
  let edit = null;           // working copy { name, data }
  let alive = true, fetching = false, fetchNote = null, status = null;
  const paint = () => render(tpl(), root);

  const select = (id) => { selected = id; const p = id ? db.find('profiles', id) : null; edit = p ? { name: p.name, data: structuredClone(p.data) } : null; status = null; };

  // Generic editor: one input per scalar field of the data. Grinders get a table for their
  // calibration rows on top; recipes are nested, so they show as JSON.
  const scalarFields = (d) => Object.entries(d).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v));
  const editor = () => {
    if (!edit) return html`<div class="card"><div class="small muted">Pick a profile on the left, save the current setup as one, or copy one from the catalogue.</div></div>`;
    const p = db.find('profiles', selected);
    const upd = p && catalogueUpdateFor(db, p);
    const d = edit.data;
    return html`<div class="card"><div class="row between wrap"><div class="row"><h3>${PROFILE_LABEL[kind]}</h3>${infoBtn('pf.editor')}</div>${p?.source?.catalogue_id ? html`<span class="pill">from catalogue v${p.source.version}${upd ? ` · v${upd.version} available` : ''}</span>` : ''}</div>${infoNote('pf.editor')}
      <div class="field"><label for="pf-name">Name</label><input id="pf-name" type="text" .value=${edit.name} data-pf-name></div>
      ${kind === 'grinder' ? html`
        <div class="field"><label>Burrs</label><input type="text" .value=${d.burrs ?? ''} data-pf="burrs"></div>
        <div class="field"><label>Spread (geometric σ of the size distribution)</label><input type="number" step="0.1" .value=${String(d.spread ?? 1.8)} data-pf-num="spread"></div>
        <div class="scroll-x"><table class="t"><thead><tr><th>Setting</th><th>Sauter, µm</th><th>Fines under 100 µm, %</th><th></th></tr></thead><tbody>
          ${(d.settings || []).map((r, k) => html`<tr><td><input type="number" step="0.1" .value=${String(r.setting)} data-row=${k} data-key="setting"></td><td><input type="number" step="5" .value=${String(r.sauter_um)} data-row=${k} data-key="sauter_um"></td><td><input type="number" step="1" .value=${f0(r.fines_frac * 100)} data-row=${k} data-key="fines_pct"></td><td><button class="btn" style="height:32px;padding:0 10px" data-row-del=${k} aria-label="Remove row">×</button></td></tr>`)}
        </tbody></table></div>
        <div class="row"><button class="btn" data-row-add>Add a setting</button><span class="small muted">${(d.settings || []).length >= 2 ? `At setting ${f0(probe)} this reads ${f0(grindAt(d, probe).sauter_um)} µm, ${f0(grindAt(d, probe).fines_frac * 100)}% fines.` : 'Two or more rows let the grind be read between them.'}</span></div>`
      : kind === 'recipe' ? html`<div class="field"><label>Recipe and kettle model, as JSON</label><textarea style="min-height:200px;font-family:var(--mono)" .value=${JSON.stringify(d, null, 2)} data-pf-json></textarea></div>`
      : html`<div class="grid2">${scalarFields(d).map(([k, v]) => typeof v === 'boolean'
          ? html`<label class="check"><input type="checkbox" .checked=${v} data-pf-bool=${k}>${k.replace(/_/g, ' ')}</label>`
          : html`<div class="field"><label>${k.replace(/_/g, ' ')}</label><input type=${typeof v === 'number' || v === null ? 'number' : 'text'} step="any" .value=${v == null ? '' : String(v)} data-pf=${k} data-was=${typeof v}></div>`)}</div>`}
      ${status ? html`<div class="status err">${status}</div>` : ''}
      <div class="row wrap"><button class="btn primary" data-pf-save>Save</button><button class="btn" data-pf-use ?disabled=${!p}>Use in setup</button>${upd ? html`<button class="btn" data-pf-update>Take catalogue v${upd.version}</button>` : ''}<button class="btn" data-pf-retire ?disabled=${!p}>Retire</button></div></div>`;
  };
  let probe = 6;

  const mine = () => db.profiles(kind);
  const cat = () => catalogueEntries(db, kind);
  const inUse = (id) => ctx.inputs?.profile_ids?.[kind] === id;

  const tpl = () => html`<div class="page three">
      <aside class="col">
        <div class="card" style="gap:2px"><div class="tabs" style="margin-bottom:8px">${PROFILE_KINDS.map((k) => html`<button class=${kind === k ? 'on' : ''} data-pkind=${k}>${PROFILE_LABEL[k]}s</button>`)}</div>
          <div class="small muted" style="padding-bottom:8px">${PROFILE_HINT[kind]}</div>
          ${mine().length ? mine().map((p) => html`<div class="nav-link ${p.id === selected ? 'on' : ''}" data-profile=${p.id} style="cursor:pointer"><span class="stack" style="gap:0;min-width:0"><span style="font-weight:600">${p.name}${inUse(p.id) ? html` <span class="pill dark">in setup</span>` : ''}</span><span class="tag">${summarise(p)}</span></span>${catalogueUpdateFor(db, p) ? html`<span class="pill accent">update</span>` : ''}</div>`) : html`<div class="small muted" style="padding:6px 0">No ${PROFILE_LABEL[kind].toLowerCase()} profiles yet.</div>`}
          <button class="btn" style="margin-top:8px" data-profile-new>Save the current ${PROFILE_LABEL[kind].toLowerCase()} as a profile</button></div>
      </aside>
      <main class="col">${editor()}</main>
      <aside class="col">
        <div class="card"><div class="row between"><h3>Catalogue</h3>${infoBtn('pf.catalogue')}</div>${infoNote('pf.catalogue')}
          ${cat().length ? cat().map((e) => html`<div class="nav-link"><span class="stack" style="gap:0;min-width:0"><span style="font-weight:600">${e.name} <span class="small muted">v${e.version}</span></span><span class="tag">${e.description || summarise(e)}</span></span><button class="btn" style="height:32px" data-fork=${e.id}>Copy</button></div>`) : html`<div class="small muted">Nothing published for this kind${db.settings.catalogue_fetched_at ? '' : ' — or not fetched yet'}.</div>`}
          <div class="row between small muted"><span>Fetched ${when(db.settings.catalogue_fetched_at)}${fetchNote ? ` · ${fetchNote}` : ''}</span><button class="btn" style="height:32px" data-catalogue-refresh ?disabled=${fetching}>${fetching ? html`<span class="spin"></span>` : 'Refresh'}</button></div></div>
      </aside>
    </div>`;

  const refresh = async (force) => {
    fetching = true; paint();
    const r = await refreshCatalogue(db, { force });
    if (!alive) return;
    fetching = false;
    fetchNote = r.offline ? 'offline, showing the last copy' : r.error ? r.error : r.updated ? `${r.updated} updated` : 'up to date';
    paint();
  };

  paint();
  // Fetch on entry when the catalogue has never been seen or is more than a day old.
  const age = db.settings.catalogue_fetched_at ? Date.now() - Date.parse(db.settings.catalogue_fetched_at) : Infinity;
  if (age > 86400e3) refresh(false);

  const setData = (fn) => { fn(edit.data); paint(); };
  const offs = [
    on(root, 'click', '[data-pkind]', (_, el) => { kind = el.dataset.pkind; ctx.mem.profileKind = kind; select(null); paint(); }),
    on(root, 'click', '[data-profile]', (_, el) => { select(el.dataset.profile); paint(); }),
    on(root, 'click', '[data-profile-new]', async () => {
      const p = await db.putProfile({ kind, name: defaultName(ctx.inputs, kind), data: sliceFor(ctx.inputs, kind) });
      select(p.id); paint();
    }),
    on(root, 'input', '[data-pf-name]', (_, el) => { edit.name = el.value; }),
    on(root, 'change', '[data-pf]', (_, el) => setData((d) => { const k = el.dataset.pf; d[k] = el.dataset.was === 'number' || (el.type === 'number') ? (el.value === '' ? null : Number(el.value)) : el.value; })),
    on(root, 'change', '[data-pf-num]', (_, el) => setData((d) => { d[el.dataset.pfNum] = Number(el.value); })),
    on(root, 'change', '[data-pf-bool]', (_, el) => setData((d) => { d[el.dataset.pfBool] = el.checked; })),
    on(root, 'change', '[data-pf-json]', (_, el) => { try { edit.data = JSON.parse(el.value); status = null; } catch (e) { status = 'That is not valid JSON.'; } paint(); }),
    on(root, 'change', '[data-row]', (_, el) => setData((d) => { const r = d.settings[Number(el.dataset.row)]; const k = el.dataset.key; if (k === 'fines_pct') r.fines_frac = Number(el.value) / 100; else r[k] = Number(el.value); probe = d.settings[Math.floor(d.settings.length / 2)]?.setting ?? probe; })),
    on(root, 'click', '[data-row-add]', () => setData((d) => { const last = d.settings[d.settings.length - 1] || { setting: 5, sauter_um: 400, fines_frac: 0.12 }; d.settings = [...d.settings, { setting: last.setting + 1, sauter_um: last.sauter_um + 40, fines_frac: Math.max(0.02, last.fines_frac - 0.01) }]; })),
    on(root, 'click', '[data-row-del]', (_, el) => setData((d) => { d.settings.splice(Number(el.dataset.rowDel), 1); })),
    on(root, 'click', '[data-pf-save]', async () => {
      if (!edit.name.trim()) { status = 'Give it a name.'; paint(); return; }
      const prev = db.find('profiles', selected) || {};
      const p = await db.putProfile({ ...prev, id: selected || undefined, kind, name: edit.name.trim(), data: edit.data });
      select(p.id); ctx.toast('Saved'); paint();
    }),
    on(root, 'click', '[data-pf-use]', async () => {
      const p = db.find('profiles', selected); if (!p) return;
      const inputs = structuredClone(ctx.inputs);
      applyProfile(inputs, p);
      await ctx.setInputs(inputs);
      ctx.navigate('#/setup');
    }),
    on(root, 'click', '[data-pf-update]', async () => {
      const p = db.find('profiles', selected); const upd = p && catalogueUpdateFor(db, p); if (!upd) return;
      await db.putProfile({ ...p, data: structuredClone(upd.data), source: { ...p.source, version: upd.version } });
      select(p.id); ctx.toast(`Now on catalogue v${upd.version}`); paint();
    }),
    on(root, 'click', '[data-pf-retire]', async () => {
      const p = db.find('profiles', selected); if (!p) return;
      await db.putProfile({ ...p, retired_at: new Date().toISOString() });
      select(null); paint();
    }),
    on(root, 'click', '[data-fork]', async (_, el) => {
      const e = db.find('catalogue', el.dataset.fork); if (!e) return;
      const p = await forkFromCatalogue(db, e);
      select(p.id); ctx.toast(`Copied ${e.name} to your profiles`); paint();
    }),
    on(root, 'click', '[data-catalogue-refresh]', () => refresh(true)),
  ];
  return () => { alive = false; offs.forEach((f) => f()); };
}
