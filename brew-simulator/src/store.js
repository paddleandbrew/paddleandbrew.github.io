// Storage is pluggable: run records, brew logs, fits and verdicts go through one interface.
// LocalStore keeps everything in localStorage; ApiStore is the shape of the later backend.

const KEY = 'brew-simulator.v1';

export class MemoryStore {
  constructor() { this.doc = emptyDoc(); }
  async load() { return this.doc; }
  async save(doc) { this.doc = doc; }
  kind() { return 'memory'; }
}

export class LocalStore {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyDoc();
      const doc = JSON.parse(raw);
      return { ...emptyDoc(), ...doc };
    } catch (e) {
      console.warn('local storage unavailable, using memory', e);
      return emptyDoc();
    }
  }
  async save(doc) {
    try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) { console.warn('could not persist', e); }
  }
  kind() { return 'local'; }
}

// The API backend is a further implementation of the same two calls. Endpoints are placeholders.
export class ApiStore {
  constructor(base) { this.base = base; }
  async load() {
    const r = await fetch(`${this.base}/store`, { credentials: 'include' });
    if (!r.ok) throw new Error(`store load failed: ${r.status}`);
    return { ...emptyDoc(), ...(await r.json()) };
  }
  async save(doc) {
    const r = await fetch(`${this.base}/store`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
    if (!r.ok) throw new Error(`store save failed: ${r.status}`);
  }
  kind() { return 'api'; }
}

export function emptyDoc() {
  return { version: 1, inputs: null, quick: null, configName: 'baseline', runs: [], logs: [], fits: {}, verdicts: [], consent: false, sampleData: true };
}

export function makeStore() {
  const params = new URLSearchParams(location.search);
  const api = params.get('api');
  if (api) return new ApiStore(api);
  try { localStorage.getItem(KEY); return new LocalStore(); } catch (e) { return new MemoryStore(); }
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
