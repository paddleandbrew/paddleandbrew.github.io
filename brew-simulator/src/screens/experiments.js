// Experiments: every run this workspace has made, named or not, with comments and a way back in.
import { html, render } from '../../vendor/lit-html/lit-html.js';
import { on, fmtTime, f1, f2, infoBtn, infoNote } from '../ui.js';

const when = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');

export function Experiments(root, ctx) {
  const db = ctx.db;
  let selected = ctx.mem.experiment || ctx.mem.lastRunId || null;
  let namedOnly = db.all('runs').some((r) => r.name);
  let draft = '', status = null, busy = false;
  const paint = () => render(tpl(), root);

  const rows = () => db.all('runs').filter((r) => !namedOnly || r.name);
  const current = () => db.find('runs', selected);

  const detail = () => {
    const r = current();
    if (!r) return html`<div class="card"><div class="small muted">Pick a run to see what it was made from.</div></div>`;
    const s = r.summary || {};
    const i = r.inputs || {};
    const comments = db.all('comments', { run_id: r.id });
    const replay = ctx.mem.replayOf && ctx.mem.replayOf.id === r.id ? ctx.mem.replayOf : null;
    return html`<div class="card"><div class="row between"><h3>${r.name || 'Unnamed run'}</h3>${infoBtn('exp.detail')}</div>${infoNote('exp.detail')}
        <div class="field"><label for="run-name">Name</label><input id="run-name" type="text" placeholder="Name this run to keep it" .value=${r.name || ''} data-run-name></div>
        <div class="kv"><span>Made</span><span class="v">${when(r.created_at)}</span></div>
        <div class="kv"><span>Config</span><span class="v">${r.config_name} · ${(r.config_hash || '').slice(0, 8)}</span></div>
        <div class="kv"><span>Solver</span><span class="v">${r.solver_version}</span></div>
        <div class="kv"><span>Predicted</span><span class="v">${f2(s.cup_tds_pct)}% TDS · ${f1(s.ey_pct)}% EY · ${fmtTime(s.total_time_s)}</span></div>
        <div class="kv"><span>Inputs</span><span class="v">${i.brewer?.name} · ${i.recipe?.dose_g} g · ${i.grind?.sauter_um != null ? `${Math.round(i.grind.sauter_um)} µm` : ''}</span></div>
        ${r.log_id ? html`<div class="kv"><span>Logged brew</span><span class="v">${db.find('logs', r.log_id) ? 'on record' : 'log missing'}</span></div>` : ''}
        ${replay ? html`<div class="status ${replay.exact ? '' : 'err'}">${replay.exact ? 'Reproduced exactly: same config hash and solver.' : 'Re-run, but the config or solver has changed since this record was made, so the numbers may differ.'}</div>` : ''}
        <div class="row wrap"><button class="btn primary" data-run-view ?disabled=${busy}>${busy ? html`<span class="spin"></span> Running` : 'View results'}</button><a href="#/setup" class="btn" data-run-setup>Open in setup</a></div></div>
      <div class="card"><div class="row between"><h3>Comments</h3>${infoBtn('exp.comments')}</div>${infoNote('exp.comments')}
        ${comments.length ? comments.map((c) => html`<div class="stack" style="gap:2px"><div class="row between small muted"><span>${when(c.created_at)}${c.author ? ` · ${c.author}` : ''}</span><button class="btn" style="height:26px;padding:0 8px" data-comment-del=${c.id} aria-label="Delete comment">×</button></div><div style="font-size:13px;line-height:1.5;white-space:pre-wrap">${c.body}</div><div class="hr"></div></div>`) : html`<div class="small muted">No comments yet.</div>`}
        <div class="field"><textarea placeholder="What did this run tell you?" .value=${draft} data-comment-body></textarea></div>
        <button class="btn" data-comment-add ?disabled=${!draft.trim()}>Add comment</button></div>`;
  };

  const tpl = () => {
    const list = rows();
    const total = db.all('runs').length;
    return html`<div class="page three">
      <aside class="col">
        <div class="card"><h3>${db.workspace()?.name}</h3>
          <div class="grid2"><div class="stat"><div class="n">${total}</div><div class="l">runs</div></div><div class="stat"><div class="n">${db.all('runs').filter((r) => r.name).length}</div><div class="l">named</div></div></div>
          <label class="check"><input type="checkbox" .checked=${namedOnly} data-named-only>Named runs only</label>
          <div class="small muted">Every simulation is on the record. Naming one marks it as worth coming back to.</div>
          <a href="#/simulate" class="btn dark">Run a new simulation</a><a href="#/workspaces" class="btn">Workspaces</a></div>
      </aside>
      <main class="col">
        ${status ? html`<div class="status err">${status}</div>` : ''}
        <section class="card"><div class="row between"><h3>Runs</h3><span class="small muted">${list.length} of ${total}</span></div>
          ${list.length ? html`<div class="scroll-x"><table class="t"><thead><tr><th>Run</th><th>Made</th><th>Config</th><th>TDS</th><th>EY</th><th>Time</th><th>Notes</th></tr></thead><tbody>
            ${list.map((r) => html`<tr class=${r.id === selected ? 'sel' : ''} data-run=${r.id} style="cursor:pointer"><td>${r.name || html`<span class="muted">unnamed</span>`}${r.id === ctx.mem.lastRunId ? html` <span class="pill dark">latest</span>` : ''}</td><td class="small">${when(r.created_at)}</td><td>${r.config_name}</td><td>${f2(r.summary?.cup_tds_pct)}</td><td>${f1(r.summary?.ey_pct)}</td><td>${fmtTime(r.summary?.total_time_s)}</td><td>${db.count('comments', { run_id: r.id }) || ''}</td></tr>`)}
          </tbody></table></div>` : html`<div class="small muted">${total ? 'No named runs yet. Untick "named only" to see all of them.' : 'Nothing has been simulated in this workspace yet.'}</div>`}
        </section>
      </main>
      <aside class="col">${detail()}</aside>
    </div>`;
  };

  paint();
  const offs = [
    on(root, 'change', '[data-named-only]', (_, el) => { namedOnly = el.checked; paint(); }),
    on(root, 'click', '[data-run]', (_, el) => { selected = el.dataset.run; ctx.mem.experiment = selected; draft = ''; paint(); }),
    on(root, 'change', '[data-run-name]', async (_, el) => { const r = current(); if (!r) return; await db.put('runs', { ...r, name: el.value.trim() || null }); paint(); }),
    on(root, 'input', '[data-comment-body]', (_, el) => { draft = el.value; paint(); }),
    on(root, 'click', '[data-comment-add]', async () => {
      const r = current(); if (!r || !draft.trim()) return;
      await db.put('comments', { run_id: r.id, body: draft.trim(), author: null, created_at: new Date().toISOString() });
      draft = ''; paint();
    }),
    on(root, 'click', '[data-comment-del]', async (_, el) => { await db.remove('comments', el.dataset.commentDel); paint(); }),
    on(root, 'click', '[data-run-view]', async () => {
      const r = current(); if (!r) return;
      busy = true; status = null; paint();
      try { await ctx.replay(r); ctx.navigate('#/simulate'); }
      catch (e) { status = `Could not re-run this record: ${e.message}`; busy = false; paint(); }
    }),
    on(root, 'click', '[data-run-setup]', async (e) => { e.preventDefault(); const r = current(); if (!r) return; await ctx.setInputs(structuredClone(r.inputs)); ctx.navigate('#/setup'); }),
  ];
  return () => offs.forEach((f) => f());
}
