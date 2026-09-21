// Read named state fields from a run's snapshots. Views never touch offsets directly.
export class Frame {
  constructor(run, k) {
    this.run = run; this.k = k;
    this.layout = run.result.layout;
    this.nc = this.layout.n_columns; this.nz = this.layout.n_cells;
    this.base = k * run.stride;
    this.index = run._index || (run._index = Object.fromEntries(this.layout.fields.map((f) => [f.name, f])));
  }
  static count(run) { return run.t ? run.t.length : 0; }
  static at(run, t) {
    const ts = run.t; let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] < t) lo = mid + 1; else hi = mid; }
    return lo;
  }
  has(name) { return !!this.index[name]; }
  t() { return this.run.t[this.k]; }
  s(name, dflt = NaN) { const f = this.index[name]; return f ? this.run.data[this.base + f.offset] : dflt; }
  col(name, i, dflt = NaN) { const f = this.index[name]; return f ? this.run.data[this.base + f.offset + i] : dflt; }
  cell(name, i, j, dflt = NaN) { const f = this.index[name]; return f ? this.run.data[this.base + f.offset + i * this.nz + j] : dflt; }
  cols(name) { return Array.from({ length: this.nc }, (_, i) => this.col(name, i)); }
  cells(name, i) { return Array.from({ length: this.nz }, (_, j) => this.cell(name, i, j)); }
  // Scalar series across all snapshots.
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
