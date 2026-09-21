// Runs the WASM core. Messages: { id, fn, args } -> { id, ok, value | error }.
let wasm = null;
try {
  wasm = await import('../pkg/brew_wasm.js');
  await wasm.default();
  postMessage({ type: 'ready', info: { solver: wasm.solver_version(), params: wasm.registry().length, modules: wasm.catalogue().length } });
} catch (e) {
  postMessage({ type: 'boot-error', error: String(e && e.message || e) });
}
onmessage = (e) => {
  const { id, fn, args } = e.data;
  try {
    if (!wasm || typeof wasm[fn] !== 'function') throw new Error(`no such solver function: ${fn}`);
    const value = wasm[fn](...args);
    const transfer = [];
    if (value && value.data instanceof Float64Array) transfer.push(value.data.buffer, value.t.buffer);
    postMessage({ id, ok: true, value }, transfer);
  } catch (err) {
    postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
