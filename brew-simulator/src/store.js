// Storage is pluggable: run records, brew logs, fits and verdicts go through one interface.
// LocalStore keeps everything in localStorage; ApiStore is the shape of the later backend.
//
// Records live in named collections rather than one document, so saving a brew log rewrites the
// logs and nothing else. Every collection is a flat list of records carrying an `id`; `fits` uses
// the setup id as its record id, and `settings` holds exactly one record. Records that belong to a
// workspace carry `workspace_id`, which is what `list(kind, { workspace })` filters on.

const PREFIX = 'brew-simulator.v2';
const LEGACY_KEY = 'brew-simulator.v1';

export const KINDS = ['settings', 'workspaces', 'runs', 'logs', 'fits', 'verdicts'];
export const SETTINGS_ID = 'current';
export const DEFAULT_WORKSPACE_ID = 'w-default';

export function emptySettings() {
  return { id: SETTINGS_ID, version: 2, inputs: null, quick: null, configName: 'baseline', consent: false, sampleData: true, workspace_id: DEFAULT_WORKSPACE_ID };
}

export function defaultWorkspace() {
  return { id: DEFAULT_WORKSPACE_ID, name: 'My brews', created_at: new Date().toISOString() };
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Records are matched to a workspace leniently: anything written before workspaces existed has no
// workspace_id, and belongs to the default workspace rather than to nothing.
function inWorkspace(rec, workspace) {
  if (!workspace) return true;
  const own = rec.workspace_id || DEFAULT_WORKSPACE_ID;
  return own === workspace;
}

function page(rows, { limit, offset } = {}) {
  const from = offset || 0;
  return limit == null ? rows.slice(from) : rows.slice(from, from + limit);
}

export class MemoryStore {
  constructor() { this.data = Object.fromEntries(KINDS.map((k) => [k, []])); }
  async list(kind, opts = {}) { return page(this.data[kind].filter((r) => inWorkspace(r, opts.workspace)), opts); }
  async get(kind, id) { return this.data[kind].find((r) => r.id === id) || null; }
  async put(kind, rec) {
    const rows = this.data[kind];
    const at = rows.findIndex((r) => r.id === rec.id);
    if (at >= 0) rows[at] = rec; else rows.unshift(rec);
    return rec;
  }
  async putMany(kind, recs) { for (const r of recs) await this.put(kind, r); return recs; }
  async remove(kind, id) { this.data[kind] = this.data[kind].filter((r) => r.id !== id); }
  async clear(kind) { this.data[kind] = []; }
  kind() { return 'memory'; }
}

// localStorage holds one key per collection. That is coarser than one key per record, but it keeps
// listing cheap and means a write touches only the collection it changed. Records are small
// (summaries, never snapshot data), so the 5 MB budget holds thousands of them; a write that
// overruns it throws QuotaExceededError, which callers surface rather than silently dropping data.
export class LocalStore {
  key(kind) { return `${PREFIX}.${kind}`; }
  read(kind) {
    try {
      const raw = localStorage.getItem(this.key(kind));
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn(`could not read ${kind}`, e);
      return [];
    }
  }
  write(kind, rows) {
    try {
      localStorage.setItem(this.key(kind), JSON.stringify(rows));
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        throw new Error(`Local storage is full, so ${kind} could not be saved. Export and clear old records from the bench.`);
      }
      throw e;
    }
  }
  async list(kind, opts = {}) { return page(this.read(kind).filter((r) => inWorkspace(r, opts.workspace)), opts); }
  async get(kind, id) { return this.read(kind).find((r) => r.id === id) || null; }
  async put(kind, rec) {
    const rows = this.read(kind);
    const at = rows.findIndex((r) => r.id === rec.id);
    if (at >= 0) rows[at] = rec; else rows.unshift(rec);
    this.write(kind, rows);
    return rec;
  }
  async putMany(kind, recs) {
    const rows = this.read(kind);
    for (const rec of recs) {
      const at = rows.findIndex((r) => r.id === rec.id);
      if (at >= 0) rows[at] = rec; else rows.unshift(rec);
    }
    this.write(kind, rows);
    return recs;
  }
  async remove(kind, id) { this.write(kind, this.read(kind).filter((r) => r.id !== id)); }
  async clear(kind) { this.write(kind, []); }
  kind() { return 'local'; }

  // One-time move off the single `brew-simulator.v1` document. The old blob is left in place: it
  // costs a few kilobytes and means a half-finished migration can be run again. Runs only when
  // there is no v2 settings record yet, so it can never overwrite data written since.
  migrateLegacy() {
    let doc;
    try {
      if (localStorage.getItem(this.key('settings'))) return false;
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return false;
      doc = JSON.parse(raw);
    } catch (e) { console.warn('could not read the v1 document', e); return false; }
    if (!doc || typeof doc !== 'object') return false;
    const stamp = (rec, prefix) => ({ workspace_id: DEFAULT_WORKSPACE_ID, ...rec, id: rec.id || uid(prefix) });
    this.write('workspaces', [defaultWorkspace()]);
    this.write('runs', (doc.runs || []).map((r) => stamp(r, 'run')));
    this.write('logs', (doc.logs || []).map((r) => stamp(r, 'log')));
    this.write('verdicts', (doc.verdicts || []).map((r) => stamp(r, 'verdict')));
    this.write('fits', Object.entries(doc.fits || {}).map(([setupId, fit]) => ({ ...fit, id: setupId, workspace_id: DEFAULT_WORKSPACE_ID })));
    this.write('settings', [{ ...emptySettings(), inputs: doc.inputs ?? null, quick: doc.quick ?? null, configName: doc.configName ?? 'baseline', consent: !!doc.consent, sampleData: doc.sampleData !== false }]);
    return true;
  }
}

// The API backend is a further implementation of the same calls, one REST resource per collection.
export class ApiStore {
  constructor(base) { this.base = base.replace(/\/$/, ''); }
  async req(method, path, body) {
    const r = await fetch(`${this.base}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 404 && method === 'GET') return null;
    if (!r.ok) throw new Error(`${method} ${path} failed: ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  async list(kind, opts = {}) {
    const q = new URLSearchParams();
    if (opts.workspace) q.set('workspace', opts.workspace);
    if (opts.limit != null) q.set('limit', String(opts.limit));
    if (opts.offset) q.set('offset', String(opts.offset));
    const qs = q.toString();
    return (await this.req('GET', `/${kind}${qs ? `?${qs}` : ''}`)) || [];
  }
  async get(kind, id) { return this.req('GET', `/${kind}/${encodeURIComponent(id)}`); }
  async put(kind, rec) { return (await this.req('PUT', `/${kind}/${encodeURIComponent(rec.id)}`, rec)) || rec; }
  async putMany(kind, recs) { return (await this.req('PUT', `/${kind}`, recs)) || recs; }
  async remove(kind, id) { await this.req('DELETE', `/${kind}/${encodeURIComponent(id)}`); }
  async clear(kind) { await this.req('DELETE', `/${kind}`); }
  kind() { return 'api'; }
}

export function makeStore() {
  const params = new URLSearchParams(location.search);
  const api = params.get('api');
  if (api) return new ApiStore(api);
  try { localStorage.getItem(`${PREFIX}.settings`); return new LocalStore(); } catch (e) { return new MemoryStore(); }
}

// A write-through cache over a Store. Screens read collections synchronously — they render from
// what is already loaded — and every mutation writes one record to the backing store. Collections
// are loaded once at boot; `reload` re-reads one after an import or a clear.
export class Db {
  constructor(store) {
    this.store = store;
    this.cache = Object.fromEntries(KINDS.map((k) => [k, []]));
    this.settings = emptySettings();
    this.workspaceId = DEFAULT_WORKSPACE_ID;
  }

  async open() {
    if (this.store.migrateLegacy) this.store.migrateLegacy();
    await Promise.all(KINDS.map(async (k) => { this.cache[k] = await this.store.list(k); }));
    this.settings = { ...emptySettings(), ...(this.cache.settings[0] || {}), id: SETTINGS_ID };
    if (!this.cache.workspaces.length) await this.put('workspaces', defaultWorkspace());
    this.workspaceId = this.settings.workspace_id || DEFAULT_WORKSPACE_ID;
    if (!this.cache.workspaces.some((w) => w.id === this.workspaceId)) this.workspaceId = this.cache.workspaces[0].id;
    return this;
  }

  // Records of the current workspace, newest first. `fits` and `settings` are keyed, not listed.
  all(kind) { return this.cache[kind].filter((r) => inWorkspace(r, this.workspaceId)); }
  find(kind, id) { return this.cache[kind].find((r) => r.id === id) || null; }
  count(kind) { return this.all(kind).length; }

  async put(kind, rec) {
    const full = { ...rec, id: rec.id || uid(kind.slice(0, 3)) };
    if (kind !== 'settings' && kind !== 'workspaces' && !full.workspace_id) full.workspace_id = this.workspaceId;
    const rows = this.cache[kind];
    const at = rows.findIndex((r) => r.id === full.id);
    if (at >= 0) rows[at] = full; else rows.unshift(full);
    await this.store.put(kind, full);
    return full;
  }

  async putMany(kind, recs) {
    const full = recs.map((rec) => {
      const r = { ...rec, id: rec.id || uid(kind.slice(0, 3)) };
      if (!r.workspace_id) r.workspace_id = this.workspaceId;
      return r;
    });
    const rows = this.cache[kind];
    for (const r of full) {
      const at = rows.findIndex((x) => x.id === r.id);
      if (at >= 0) rows[at] = r; else rows.unshift(r);
    }
    await this.store.putMany(kind, full);
    return full;
  }

  async remove(kind, id) {
    this.cache[kind] = this.cache[kind].filter((r) => r.id !== id);
    await this.store.remove(kind, id);
  }

  async clear(kinds) {
    for (const k of kinds) { this.cache[k] = []; await this.store.clear(k); }
  }

  async reload(kind) { this.cache[kind] = await this.store.list(kind); return this.cache[kind]; }

  async patchSettings(patch) {
    this.settings = { ...this.settings, ...patch, id: SETTINGS_ID };
    await this.store.put('settings', this.settings);
    this.cache.settings = [this.settings];
    return this.settings;
  }

  // Fits are keyed by setup id so a setup's fitted constants are one record.
  fit(setupId) { return this.find('fits', setupId); }
  async putFit(setupId, fit) { return this.put('fits', { ...fit, id: setupId }); }

  // Whole-database export and import, which is what the bench's download and upload buttons move.
  async exportAll() {
    const out = { format: 'brew-simulator', version: 2, exported_at: new Date().toISOString() };
    for (const k of KINDS) out[k] = await this.store.list(k);
    return out;
  }

  async importAll(doc) {
    if (!doc || typeof doc !== 'object') throw new Error('not a brew-simulator export');
    // A v1 document is a single blob; a v2 export already has one array per collection.
    const isV1 = doc.version === 1 || (!doc.settings && (doc.runs || doc.logs || doc.fits));
    const collections = isV1 ? {
      workspaces: [defaultWorkspace()],
      runs: doc.runs || [],
      logs: doc.logs || [],
      verdicts: doc.verdicts || [],
      fits: Object.entries(doc.fits || {}).map(([id, fit]) => ({ ...fit, id })),
      settings: [{ ...emptySettings(), inputs: doc.inputs ?? null, quick: doc.quick ?? null, configName: doc.configName ?? 'baseline', consent: !!doc.consent, sampleData: doc.sampleData !== false }],
    } : Object.fromEntries(KINDS.map((k) => [k, doc[k] || []]));
    for (const k of KINDS) {
      await this.store.clear(k);
      const rows = collections[k].map((r) => ({ workspace_id: DEFAULT_WORKSPACE_ID, ...r, id: r.id || uid(k.slice(0, 3)) }));
      if (rows.length) await this.store.putMany(k, rows);
    }
    await this.open();
  }
}
