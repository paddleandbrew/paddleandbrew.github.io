// Worker bridge: every solver call runs off the main thread and returns a promise.
export class Engine {
  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { this.info = m.info; this.resolveReady(m.info); return; }
      if (m.type === 'boot-error') { this.rejectReady(new Error(m.error)); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error));
    };
    this.worker.onerror = (e) => { this.rejectReady(new Error(e.message || 'worker failed')); };
  }
  call(fn, ...args) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, fn, args });
    });
  }
  busy() { return this.pending.size > 0; }
}
