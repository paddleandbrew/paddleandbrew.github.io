// Storage is pluggable: run records, brew logs, fits, verdicts, comments and profiles go through
// one interface. LocalStore keeps everything in localStorage; ApiStore is the shape of the later
// backend.
//
// Records live in named collections rather than one document, so saving a brew log rewrites the
// logs and nothing else. Every record carries an `id`, and every id minted here is a UUID, so two
// installs never produce the same one and an export from one can be merged into another. The two
// exceptions are deliberate: `fits` are keyed by the setup they calibrate, and `catalogue` entries
// keep the slug the published catalogue gave them. Records that belong to a workspace carry
// `workspace_id`; which collections those are is declared in SCOPED, and everything else — profiles,
// the catalogue, the workspaces themselves — is global to the install.

const PREFIX = 'brew-simulator.v2';
const LEGACY_KEY = 'brew-simulator.v1';
export const SCHEMA = 3;

export const KINDS = ['settings', 'workspaces', 'profiles', 'catalogue', 'runs', 'logs', 'fits', 'verdicts', 'comments'];
// Collections whose records belong to one workspace. The rest are shared across all of them.
export const SCOPED = new Set(['runs', 'logs', 'fits', 'verdicts', 'comments']);
// Collections whose ids are minted here and must be UUIDs. `fits` and `catalogue` are keyed by
// meaning instead (see above) and `settings` is a singleton.
const UUID_KINDS = ['workspaces', 'profiles', 'runs', 'logs', 'verdicts', 'comments'];
export const PROFILE_KINDS = ['bean', 'grinder', 'brewer', 'water', 'recipe'];
export const SETTINGS_ID = 'current';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

// A UUID v4. `crypto.randomUUID` needs a secure context, which GitHub Pages and localhost are; the
// fallback covers a plain http:// LAN address with the same entropy.
export function uid() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptySettings() {
  return { id: SETTINGS_ID, schema: SCHEMA, inputs: null, quick: null, configName: 'baseline', consent: false, sampleData: true, workspace_id: null, catalogue_etag: null, catalogue_fetched_at: null };
}

export function newWorkspace(name = 'My brews') {
  return { id: uid(), name, notes: '', created_at: new Date().toISOString(), archived_at: null };
}

// The setup a fit calibrates: the three profiles whose combination it belongs to. Inputs that were
// built without profiles keep the free-text setup id the user typed, so old fits still resolve.
export function setupIdFor(inputs) {
  const p = inputs && inputs.profile_ids;
  if (p && p.grinder && p.bean && p.brewer) return `${p.grinder}|${p.bean}|${p.brewer}`;
  return (inputs && inputs.setup_id) || 'default';
}

const matches = (rec, where) => !where || Object.entries(where).every(([k, v]) => rec[k] === v);

function select(kind, rows, { workspace, where } = {}) {
  return rows.filter((r) => (!SCOPED.has(kind) || !workspace || r.workspace_id === workspace) && matches(r, where));
}

function page(rows, { limit, offset } = {}) {
  const from = offset || 0;
  return limit == null ? rows.slice(from) : rows.slice(from, from + limit);
}

function upsert(rows, rec) {
  const at = rows.findIndex((r) => r.id === rec.id);
  if (at >= 0) rows[at] = rec; else rows.unshift(rec);
}

export class MemoryStore {
  constructor() { this.data = Object.fromEntries(KINDS.map((k) => [k, []])); }
  async list(kind, opts = {}) { return page(select(kind, this.data[kind], opts), opts); }
  async get(kind, id) { return this.data[kind].find((r) => r.id === id) || null; }
  async put(kind, rec) { upsert(this.data[kind], rec); return rec; }
  async putMany(kind, recs) { for (const r of recs) upsert(this.data[kind], r); return recs; }
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
  async list(kind, opts = {}) { return page(select(kind, this.read(kind), opts), opts); }
  async get(kind, id) { return this.read(kind).find((r) => r.id === id) || null; }
  async put(kind, rec) { const rows = this.read(kind); upsert(rows, rec); this.write(kind, rows); return rec; }
  async putMany(kind, recs) { const rows = this.read(kind); for (const r of recs) upsert(rows, r); this.write(kind, rows); return recs; }
  async remove(kind, id) { this.write(kind, this.read(kind).filter((r) => r.id !== id)); }
  async clear(kind) { this.write(kind, []); }
  kind() { return 'local'; }

  // One-time move off the single `brew-simulator.v1` document. The old blob is left in place: it
  // costs a few kilobytes and means a half-finished migration can be run again. Runs only when
  // there is no v2 settings record yet, so it can never overwrite data written since. Ids are left
  // as they were; the schema migration in Db.open() mints UUIDs for them next.
  migrateLegacy() {
    let doc;
    try {
      if (localStorage.getItem(this.key('settings'))) return false;
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return false;
      doc = JSON.parse(raw);
    } catch (e) { console.warn('could not read the v1 document', e); return false; }
    if (!doc || typeof doc !== 'object') return false;
    const cols = fromLegacyDoc(doc);
    for (const k of KINDS) this.write(k, cols[k] || []);
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
    if (opts.workspace && SCOPED.has(kind)) q.set('workspace', opts.workspace);
    for (const [k, v] of Object.entries(opts.where || {})) q.set(k, String(v));
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

// ---- Document shapes ---------------------------------------------------------------------------

// A v1 document was one blob with a `fits` map keyed by setup id. This turns it into collections.
function fromLegacyDoc(doc) {
  const ws = { id: 'w-default', name: 'My brews', notes: '', created_at: new Date().toISOString(), archived_at: null };
  const stamp = (r) => ({ workspace_id: ws.id, ...r });
  return {
    settings: [{ ...emptySettings(), schema: 2, inputs: doc.inputs ?? null, quick: doc.quick ?? null, configName: doc.configName ?? 'baseline', consent: !!doc.consent, sampleData: doc.sampleData !== false, workspace_id: ws.id }],
    workspaces: [ws],
    profiles: [],
    catalogue: [],
    runs: (doc.runs || []).map(stamp),
    logs: (doc.logs || []).map(stamp),
    fits: Object.entries(doc.fits || {}).map(([id, fit]) => stamp({ ...fit, id })),
    verdicts: (doc.verdicts || []).map(stamp),
    comments: [],
  };
}

// Give every record a UUID and rewrite every reference to it. Pure: takes the collections, returns
// new ones. Used once at open for data written before ids were UUIDs, and on import for any
// document whose ids are not, so nothing brought in can collide with what is already here.
export function remintIds(cols) {
  const out = Object.fromEntries(KINDS.map((k) => [k, (cols[k] || []).map((r) => ({ ...r }))]));
  const maps = {};
  for (const kind of UUID_KINDS) {
    maps[kind] = new Map();
    for (const r of out[kind]) {
      if (!isUuid(r.id)) { const fresh = uid(); maps[kind].set(r.id, fresh); r.id = fresh; }
    }
  }
  // A scoped record with no workspace, or one pointing at a workspace that does not exist, goes to
  // the first workspace, and one is made if there are none at all.
  if (!out.workspaces.length) out.workspaces.push(newWorkspace());
  const wsIds = new Set(out.workspaces.map((w) => w.id));
  const fallbackWs = out.workspaces[0].id;
  const ws = (id) => (maps.workspaces.get(id) ?? (wsIds.has(id) ? id : fallbackWs));
  const ref = (kind, id) => (id == null ? id : (maps[kind].get(id) ?? id));
  for (const kind of SCOPED) for (const r of out[kind]) r.workspace_id = ws(r.workspace_id);
  for (const r of out.runs) r.log_id = ref('logs', r.log_id);
  for (const r of out.logs) r.run_id = ref('runs', r.run_id);
  for (const r of out.comments) r.run_id = ref('runs', r.run_id);
  for (const r of out.profiles) if (r.source && r.source.forked_from) r.source.forked_from = ref('profiles', r.source.forked_from);
  const s = out.settings[0];
  if (s) { s.workspace_id = ws(s.workspace_id); s.schema = SCHEMA; }
  return out;
}

const needsRemint = (cols) => UUID_KINDS.some((k) => (cols[k] || []).some((r) => !isUuid(r.id)));

// Whatever an export or an older backup looks like, produce the collections it holds.
function normaliseDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('not a brew-simulator export');
  const isV1 = doc.version === 1 || (!doc.settings && !doc.workspaces && (doc.runs || doc.logs || doc.fits));
  if (isV1) return fromLegacyDoc(doc);
  if (doc.format !== 'brew-simulator' && !doc.workspaces && !doc.settings) throw new Error('not a brew-simulator export');
  const cols = Object.fromEntries(KINDS.map((k) => [k, Array.isArray(doc[k]) ? doc[k] : []]));
  // A v2 export carried a fits map's records already as an array; nothing to do. A partial
  // export (some workspaces) simply has fewer rows.
  return cols;
}

// ---- The database --------------------------------------------------------------------------------

// A write-through cache over a Store. Screens read collections synchronously — they render from
// what is already loaded — and every mutation writes one record to the backing store. Collections
// are loaded once at boot; `reload` re-reads one after an import or a clear.
export class Db {
  constructor(store) {
    this.store = store;
    this.cache = Object.fromEntries(KINDS.map((k) => [k, []]));
    this.settings = emptySettings();
    this.workspaceId = null;
  }

  async open() {
    if (this.store.migrateLegacy) this.store.migrateLegacy();
    await Promise.all(KINDS.map(async (k) => { this.cache[k] = await this.store.list(k); }));
    this.settings = { ...emptySettings(), ...(this.cache.settings[0] || {}), id: SETTINGS_ID };
    if ((this.settings.schema || 0) < SCHEMA || needsRemint(this.cache)) await this.migrateIds();
    if (!this.cache.workspaces.length) await this.put('workspaces', newWorkspace());
    const live = this.workspaces();
    const wanted = this.settings.workspace_id;
    this.workspaceId = live.some((w) => w.id === wanted) ? wanted : (live[0] || this.cache.workspaces[0]).id;
    if (this.settings.workspace_id !== this.workspaceId) await this.patchSettings({ workspace_id: this.workspaceId });
    return this;
  }

  // Ids written before they were UUIDs — `w-default`, `run-…`, `log-…` — become UUIDs, with every
  // reference between records rewritten to match. Runs once, then the schema stamp keeps it off.
  async migrateIds() {
    const cols = remintIds({ ...this.cache, settings: [this.settings] });
    for (const k of KINDS) {
      if (k === 'settings' || k === 'catalogue') continue;
      await this.store.clear(k);
      if (cols[k].length) await this.store.putMany(k, cols[k]);
      this.cache[k] = cols[k];
    }
    this.settings = { ...cols.settings[0], id: SETTINGS_ID };
    await this.store.put('settings', this.settings);
    this.cache.settings = [this.settings];
  }

  // Records of the current workspace, newest first, optionally narrowed by field equality.
  all(kind, where) { return select(kind, this.cache[kind], { workspace: this.workspaceId, where }); }
  find(kind, id) { return this.cache[kind].find((r) => r.id === id) || null; }
  count(kind, where) { return this.all(kind, where).length; }

  workspaces() { return this.cache.workspaces.filter((w) => !w.archived_at); }
  workspace() { return this.find('workspaces', this.workspaceId); }

  async put(kind, rec) {
    const full = { ...rec, id: rec.id || uid() };
    if (SCOPED.has(kind) && !full.workspace_id) full.workspace_id = this.workspaceId;
    upsert(this.cache[kind], full);
    await this.store.put(kind, full);
    return full;
  }

  async putMany(kind, recs) {
    const full = recs.map((rec) => {
      const r = { ...rec, id: rec.id || uid() };
      if (SCOPED.has(kind) && !r.workspace_id) r.workspace_id = this.workspaceId;
      return r;
    });
    for (const r of full) upsert(this.cache[kind], r);
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

  // ---- Workspaces ----

  async createWorkspace(name) {
    const w = await this.put('workspaces', newWorkspace(name));
    await this.switchWorkspace(w.id);
    return w;
  }

  async switchWorkspace(id) {
    if (!this.find('workspaces', id)) throw new Error('no such workspace');
    this.workspaceId = id;
    await this.patchSettings({ workspace_id: id });
    // The local cache already holds every workspace; a paged backend has to fetch this one's rows.
    if (this.store.kind() === 'api') await Promise.all([...SCOPED].map((k) => this.reload(k)));
  }

  // Archiving hides a workspace and its records without deleting anything: they stay exportable.
  async archiveWorkspace(id) {
    const w = this.find('workspaces', id);
    if (!w) return;
    await this.put('workspaces', { ...w, archived_at: new Date().toISOString() });
    if (this.workspaceId === id) {
      const next = this.workspaces()[0] || (await this.put('workspaces', newWorkspace()));
      await this.switchWorkspace(next.id);
    }
  }

  async restoreWorkspace(id) {
    const w = this.find('workspaces', id);
    if (w) await this.put('workspaces', { ...w, archived_at: null });
  }

  // ---- Fits and profiles ----

  fit(setupId) { return this.all('fits').find((f) => f.id === setupId) || null; }
  async putFit(setupId, fit) { return this.put('fits', { ...fit, id: setupId }); }

  profiles(kind) { return this.cache.profiles.filter((p) => !p.retired_at && (!kind || p.kind === kind)); }
  async putProfile(p) {
    const now = new Date().toISOString();
    return this.put('profiles', { schema: 1, source: null, retired_at: null, created_at: now, ...p, updated_at: now });
  }

  // ---- Export and import ----

  // The chosen workspaces (all of them when `ids` is null) with their runs, logs, fits, verdicts and
  // comments, plus the profiles, which are global and small. Settings ride along only on a full
  // export, since they describe this install rather than any workspace. The catalogue is not
  // exported: it is published, and re-fetched.
  async exportWorkspaces(ids = null) {
    const all = ids == null;
    const chosen = new Set(ids || []);
    const pick = (rows) => (all ? rows : rows.filter((r) => chosen.has(r.workspace_id)));
    const out = { format: 'brew-simulator', version: SCHEMA, exported_at: new Date().toISOString() };
    out.workspaces = (await this.store.list('workspaces')).filter((w) => all || chosen.has(w.id));
    out.profiles = await this.store.list('profiles');
    for (const k of SCOPED) out[k] = pick(await this.store.list(k));
    if (all) out.settings = await this.store.list('settings');
    return out;
  }
  async exportAll() { return this.exportWorkspaces(null); }

  // Merges by id: a record already here with the same UUID is replaced by the imported one, new ones
  // are added, and nothing already here is removed — so importing a workspace twice is harmless and
  // two installs' exports combine. Ids that are not UUIDs are reminted first, so an old backup can
  // never collide with anything. `replace` empties every collection first, for restoring a backup.
  async importAll(doc, { replace = false } = {}) {
    let cols = normaliseDoc(doc);
    if (needsRemint(cols)) cols = remintIds(cols);
    if (replace) for (const k of KINDS) if (k !== 'catalogue') await this.store.clear(k);
    for (const k of KINDS) {
      if (k === 'settings' || k === 'catalogue') continue;
      if (cols[k].length) await this.store.putMany(k, cols[k]);
    }
    if (replace && cols.settings.length) await this.store.put('settings', { ...emptySettings(), ...cols.settings[0], id: SETTINGS_ID });
    await this.open();
    return { workspaces: cols.workspaces.length, runs: cols.runs.length, logs: cols.logs.length, profiles: cols.profiles.length, comments: cols.comments.length };
  }
}
