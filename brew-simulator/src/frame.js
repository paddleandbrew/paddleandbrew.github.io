// Read named state fields from a run's snapshots. Views never touch offsets directly.
//
// A frame's index may be fractional. The solver records a snapshot every `snapshot_dt` seconds,
// which is far coarser than the display refresh, so playback asks for a frame part-way between two
// snapshots and every field is read as a blend of the two. Views are unchanged by this: they ask
// for a field by name and get a number.

// Fields that carry a category or a count rather than a quantity. Blending 'Settled' with
// 'Immersed' would give a state that does not exist — and `bed_state` indexes a label array — so
// these snap to the nearer snapshot instead. Anything not named here is a physical quantity and is
// interpolated; `col_slurry_cells` is deliberately absent, being a depth the views scale by.
const DISCRETE = new Set(['bed_state', 'pour_stream', 'pour_placement', 'agitation_kind', 'outlet_open']);

export class Frame {
  constructor(run, k) {
    this.run = run;
    this.layout = run.result.layout;
    this.nc = this.layout.n_columns; this.nz = this.layout.n_cells;
    this.index = run._index || (run._index = Object.fromEntries(this.layout.fields.map((f) => [f.name, f])));
    const last = run.t.length - 1;
    const kf = Math.max(0, Math.min(last, isFinite(k) ? k : 0));
    const k0 = Math.floor(kf);
    const k1 = Math.min(last, k0 + 1);
    this.kf = kf;                       // the continuous index this frame was asked for
    this.a = kf - k0;                   // 0 exactly on a snapshot, else the weight onto the next
    this.k = this.a > 0.5 ? k1 : k0;    // nearest whole snapshot, for anything that must be discrete
    this.base = k0 * run.stride;
    this.nextBase = k1 * run.stride;
    this._t = this.a ? run.t[k0] + (run.t[k1] - run.t[k0]) * this.a : run.t[k0];
  }

  // The continuous index for a brew time, so playback can drive a frame from its own clock.
  static frac(run, t) {
    const ts = run.t, last = ts.length - 1;
    if (!(t > ts[0])) return 0;
    if (t >= ts[last]) return last;
    const hi = Frame.at(run, t);
    const lo = Math.max(0, hi - 1);
    const span = ts[hi] - ts[lo];
    return span > 0 ? lo + (t - ts[lo]) / span : lo;
  }

  static count(run) { return run.t ? run.t.length : 0; }
  static at(run, t) {
    const ts = run.t; let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  blend(name, v0, v1) {
    if (DISCRETE.has(name)) return this.a > 0.5 ? v1 : v0;
    return this.a === 0 ? v0 : v0 + (v1 - v0) * this.a;
  }

  has(name) { return !!this.index[name]; }
  t() { return this._t; }
  s(name, dflt = NaN) {
    const f = this.index[name]; if (!f) return dflt;
    return this.blend(name, this.run.data[this.base + f.offset], this.run.data[this.nextBase + f.offset]);
  }
  col(name, i, dflt = NaN) {
    const f = this.index[name]; if (!f) return dflt;
    return this.blend(name, this.run.data[this.base + f.offset + i], this.run.data[this.nextBase + f.offset + i]);
  }
  cell(name, i, j, dflt = NaN) {
    const f = this.index[name]; if (!f) return dflt;
    const at = f.offset + i * this.nz + j;
    return this.blend(name, this.run.data[this.base + at], this.run.data[this.nextBase + at]);
  }
  cols(name) { return Array.from({ length: this.nc }, (_, i) => this.col(name, i)); }
  cells(name, i) { return Array.from({ length: this.nz }, (_, j) => this.cell(name, i, j)); }

  // Scalar series across all snapshots. Charts plot every recorded point, so these never blend.
  static series(run, name) {
    const f = (run._index || (run._index = Object.fromEntries(run.result.layout.fields.map((x) => [x.name, x]))))[name];
    if (!f) return null;
    const out = new Float64Array(run.t.length);
    for (let k = 0; k < run.t.length; k++) out[k] = run.data[k * run.stride + f.offset];
    return out;
  }
  static cellSeries(run, name, i, j) {
    const f = (run._index || (run._index = Object.fromEntries(run.result.layout.fields.map((x) => [x.name, x]))))[name];
    if (!f) return null;
    const nz = run.result.layout.n_cells;
    const out = new Float64Array(run.t.length);
    for (let k = 0; k < run.t.length; k++) out[k] = run.data[k * run.stride + f.offset + i * nz + j];
    return out;
  }
  tds(conc) { return (100 * conc) / (1 + conc); }
}
