// The published catalogue: profiles kept in the backend, committed as JSON under web/catalogue and
// served from the site. The app never edits these. It fetches the index, keeps a copy of every
// entry in the `catalogue` collection so the last-seen catalogue works offline, and lets a user
// fork an entry into a local profile they own.
//
// Layout, relative to the page:
//   catalogue/index.json          { format, version, generated_at, profiles: [{ id, kind, name, version, path, sha256 }] }
//   catalogue/<kind>/<slug>.json  { id, kind, name, version, schema, published_at, description, data }
// An entry's id is `<kind>/<slug>`, stable across versions; `version` climbs when its data changes.

const BASE = () => new URL('./catalogue/', document.baseURI);

// Fetch the index and any entries whose version moved. Returns what is now cached; on a network
// failure returns the cache untouched, since a site served from Pages is often opened offline.
export async function refreshCatalogue(db, { force = false } = {}) {
  const cached = db.cache.catalogue;
  let res;
  try {
    const headers = {};
    if (db.settings.catalogue_etag && !force) headers['if-none-match'] = db.settings.catalogue_etag;
    res = await fetch(new URL('index.json', BASE()), { headers, cache: 'no-cache' });
  } catch (e) {
    return { entries: cached, updated: 0, offline: true };
  }
  if (res.status === 304) return { entries: cached, updated: 0, offline: false };
  if (!res.ok) return { entries: cached, updated: 0, offline: false, error: `catalogue index: ${res.status}` };
  let index;
  try { index = await res.json(); } catch (e) { return { entries: cached, updated: 0, error: 'catalogue index is not JSON' }; }
  if (!index || !Array.isArray(index.profiles)) return { entries: cached, updated: 0, error: 'catalogue index has no profiles' };

  const have = new Map(cached.map((e) => [e.id, e]));
  const stale = index.profiles.filter((p) => !have.has(p.id) || have.get(p.id).version !== p.version || have.get(p.id).sha256 !== p.sha256);
  const fetched = [];
  for (const p of stale) {
    try {
      const r = await fetch(new URL(p.path, BASE()), { cache: 'no-cache' });
      if (!r.ok) continue;
      const entry = await r.json();
      fetched.push({ ...entry, id: p.id, kind: p.kind, version: p.version, sha256: p.sha256, fetched_at: new Date().toISOString() });
    } catch (e) { /* keep whatever we had for this one */ }
  }
  if (fetched.length) await db.putMany('catalogue', fetched);
  // Entries the index no longer lists are withdrawn: drop them, but a profile forked from one keeps
  // its copy of the data, so nothing a user relies on disappears.
  const listed = new Set(index.profiles.map((p) => p.id));
  for (const e of cached) if (!listed.has(e.id)) await db.remove('catalogue', e.id);
  await db.patchSettings({ catalogue_etag: res.headers.get('etag') || null, catalogue_fetched_at: new Date().toISOString() });
  return { entries: db.cache.catalogue, updated: fetched.length, offline: false };
}

export function catalogueEntries(db, kind) {
  return db.cache.catalogue.filter((e) => !kind || e.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
}

// Copy a catalogue entry into a profile the user owns. The source is recorded so the profile can
// say where it came from and whether the catalogue has moved on since.
export async function forkFromCatalogue(db, entry, name = entry.name) {
  return db.putProfile({
    kind: entry.kind,
    name,
    data: structuredClone(entry.data),
    source: { catalogue_id: entry.id, version: entry.version, forked_from: null },
  });
}

// A newer catalogue version than the one this profile was forked from, if there is one.
export function catalogueUpdateFor(db, profile) {
  if (!profile.source || !profile.source.catalogue_id) return null;
  const e = db.find('catalogue', profile.source.catalogue_id);
  return e && e.version > profile.source.version ? e : null;
}
