// Workspaces: create, switch, archive, and move them between installs as files.
import { html, render } from '../../vendor/lit-html/lit-html.js';
import { on, infoBtn, infoNote } from '../ui.js';

const when = (iso) => (iso ? iso.slice(0, 10) : '');

export function Workspaces(root, ctx) {
  const db = ctx.db;
  let name = '';
  let picked = new Set([db.workspaceId]);
  let showArchived = false;
  let status = null, busy = false;
  const paint = () => render(tpl(), root);

  const counts = (w) => {
    const of = (kind) => db.cache[kind].filter((r) => r.workspace_id === w.id).length;
    return { runs: of('runs'), logs: of('logs'), comments: of('comments') };
  };

  const row = (w) => {
    const c = counts(w);
    const current = w.id === db.workspaceId;
    return html`<div class="nav-link" style="gap:10px;align-items:center">
      <input type="checkbox" .checked=${picked.has(w.id)} data-ws-pick=${w.id} aria-label="Include ${w.name} in the export">
      <span class="stack" style="gap:0;flex:1;min-width:0"><span style="font-weight:600">${w.name}${current ? html` <span class="pill dark">current</span>` : ''}${w.archived_at ? html` <span class="pill">archived ${when(w.archived_at)}</span>` : ''}</span><span class="tag">${c.runs} runs · ${c.logs} logs · ${c.comments} comments · since ${when(w.created_at)}</span></span>
      ${w.archived_at
        ? html`<button class="btn" style="height:32px" data-ws-restore=${w.id}>Restore</button>`
        : html`${current ? '' : html`<button class="btn" style="height:32px" data-ws-switch=${w.id}>Open</button>`}<button class="btn" style="height:32px" data-ws-archive=${w.id} aria-label="Archive ${w.name}">Archive</button>`}
    </div>`;
  };

  const tpl = () => {
    const live = db.workspaces();
    const archived = db.cache.workspaces.filter((w) => w.archived_at);
    return html`<div class="page three">
      <aside class="col">
        <div class="card"><h3>New workspace</h3>
          <div class="field"><label for="ws-name">Name</label><input id="ws-name" type="text" placeholder="Guji, September" .value=${name} data-ws-name></div>
          <button class="btn primary" data-ws-create ?disabled=${!name.trim() || busy}>Create and open</button>
          <div class="small muted">Runs, logs, fits, verdicts and comments belong to the workspace they were made in. Profiles are shared by all of them.</div></div>
        <div class="card"><h3>This workspace</h3>
          <div class="kv"><span>Name</span><span class="v">${db.workspace()?.name}</span></div>
          <div class="kv"><span>Id</span><span class="v mono small" style="font-size:11px">${db.workspaceId}</span></div>
          <a href="#/experiments" class="btn">Its experiments</a></div>
      </aside>
      <main class="col">
        ${status ? html`<div class="status">${status}</div>` : ''}
        <section class="card" style="gap:4px"><div class="row between"><h3>Workspaces</h3><span class="small muted">${live.length} open${archived.length ? html` · <a href="#" data-toggle-archived>${showArchived ? 'hide' : 'show'} ${archived.length} archived</a>` : ''}</span></div>
          ${live.map(row)}
          ${showArchived ? archived.map(row) : ''}
        </section>
      </main>
      <aside class="col">
        <section class="card"><div class="row between"><h3>Export and import</h3>${infoBtn('ws.export')}</div>${infoNote('ws.export')}
          <div class="row wrap"><button class="btn dark" data-export-selected ?disabled=${!picked.size || busy}>Export ${picked.size} ticked</button><button class="btn" data-export-all ?disabled=${busy}>Export everything</button></div>
          <div class="hr"></div>
          <label class="btn" style="cursor:pointer">Import a file (merge)<input type="file" accept="application/json" data-import style="display:none"></label>
          <label class="btn" style="cursor:pointer;border-color:var(--accent,#A8323A)">Restore from a backup (replace all)<input type="file" accept="application/json" data-import-replace style="display:none"></label>
          <div class="small muted">Files carry UUIDs, so an export from another install merges beside what is here rather than over it.</div></section>
      </aside>
    </div>`;
  };

  const download = (nameOut, obj) => { const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nameOut; a.click(); };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const importFile = async (el, replace) => {
    const f = el.files[0]; if (!f) return;
    if (replace && !confirm('Replace everything in this install with the file? Export first if you are not sure.')) { el.value = ''; return; }
    busy = true; status = html`<span class="spin"></span> Importing…`; paint();
    try {
      const r = await db.importAll(JSON.parse(await f.text()), { replace });
      picked = new Set([db.workspaceId]);
      status = `Imported ${r.workspaces} workspace${r.workspaces === 1 ? '' : 's'}, ${r.runs} runs, ${r.logs} logs, ${r.comments} comments, ${r.profiles} profiles${replace ? ', replacing what was here' : ''}.`;
      ctx.mem.run = null; ctx.mem.bands = null; ctx.mem.search = null;
      ctx.refresh();
    } catch (e) { status = null; ctx.toast(`Import failed: ${e.message}`, 'err'); }
    busy = false; el.value = ''; paint();
  };

  paint();
  const offs = [
    on(root, 'input', '[data-ws-name]', (_, el) => { name = el.value; paint(); }),
    on(root, 'click', '[data-ws-create]', async () => {
      if (!name.trim()) return;
      busy = true; paint();
      try { const w = await db.createWorkspace(name.trim()); name = ''; picked = new Set([w.id]); ctx.mem.run = null; ctx.mem.bands = null; ctx.mem.search = null; ctx.refresh(); ctx.toast(`Opened ${w.name}`); }
      catch (e) { ctx.toast(e.message, 'err'); }
      busy = false; paint();
    }),
    on(root, 'click', '[data-ws-switch]', async (_, el) => { await db.switchWorkspace(el.dataset.wsSwitch); ctx.mem.run = null; ctx.mem.bands = null; ctx.mem.search = null; ctx.refresh(); paint(); }),
    on(root, 'click', '[data-ws-archive]', async (_, el) => { await db.archiveWorkspace(el.dataset.wsArchive); picked.delete(el.dataset.wsArchive); ctx.mem.run = null; ctx.mem.bands = null; ctx.refresh(); paint(); }),
    on(root, 'click', '[data-ws-restore]', async (_, el) => { await db.restoreWorkspace(el.dataset.wsRestore); paint(); }),
    on(root, 'click', '[data-toggle-archived]', (e) => { e.preventDefault(); showArchived = !showArchived; paint(); }),
    on(root, 'change', '[data-ws-pick]', (_, el) => { if (el.checked) picked.add(el.dataset.wsPick); else picked.delete(el.dataset.wsPick); paint(); }),
    on(root, 'click', '[data-export-selected]', async () => { try { download(`brew-simulator-workspaces-${stamp()}.json`, await db.exportWorkspaces([...picked])); } catch (e) { ctx.toast(e.message, 'err'); } }),
    on(root, 'click', '[data-export-all]', async () => { try { download(`brew-simulator-all-${stamp()}.json`, await db.exportAll()); } catch (e) { ctx.toast(e.message, 'err'); } }),
    on(root, 'change', '[data-import]', (_, el) => importFile(el, false)),
    on(root, 'change', '[data-import-replace]', (_, el) => importFile(el, true)),
  ];
  return () => offs.forEach((f) => f());
}
