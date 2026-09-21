// Tiny rendering helpers. Screens build HTML strings and wire events with delegation.
import { PANEL } from './info.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = (s) => { if (!isFinite(s)) return '–'; s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const f0 = (v) => (isFinite(v) ? v.toFixed(0) : '–');
export const f1 = (v) => (isFinite(v) ? v.toFixed(1) : '–');
export const f2 = (v) => (isFinite(v) ? v.toFixed(2) : '–');
export const pct = (v) => (isFinite(v) ? `${Math.round(v * 100)}%` : '–');
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const words = (s) => String(s || '').replace(/_/g, ' ');

// Panel help. A card puts infoBtn() in its heading row and infoNote() straight after it; the note is
// hidden until the button is pressed. Which notes are open is kept here rather than in the DOM, so a
// screen that re-renders itself (the player redraws a whole aside every frame) does not close them.
const openInfo = new Set();
export function infoBtn(key) {
  if (!PANEL[key]) return '';
  return `<button class="info" data-info="${key}" aria-expanded="${openInfo.has(key)}" aria-label="What this panel shows" title="What this panel shows">i</button>`;
}
export function infoNote(key) {
  if (!PANEL[key]) return '';
  return `<div class="info-note ${openInfo.has(key) ? 'open' : ''}" data-info-body="${key}">${esc(PANEL[key])}</div>`;
}
export function toggleInfo(key) {
  if (openInfo.has(key)) openInfo.delete(key); else openInfo.add(key);
  return openInfo.has(key);
}

export function on(root, event, selector, handler) {
  const fn = (e) => { const el = e.target.closest(selector); if (el && root.contains(el)) handler(e, el); };
  root.addEventListener(event, fn);
  return () => root.removeEventListener(event, fn);
}

export function bedName(b) { return { flat: 'flat', high_walls: 'high walls', cratered: 'cratered' }[b] || 'unknown'; }
export const BREWERS = [
  { kind: 'cone', label: 'V60 02', icon: 'M2 3 L17 31 L23 31 L38 3' },
  { kind: 'flat_bed', label: 'Flat bed', icon: 'M2 3 L10 31 L30 31 L38 3' },
  { kind: 'fluted_cone', label: 'Fluted cone', icon: 'M4 3 L17 31 L23 31 L36 3 M10 3 L19 25 M30 3 L21 25' },
  { kind: 'valve_hybrid', label: 'Valve hybrid', icon: 'M2 3 L17 27 L23 27 L38 3 M13 31 L27 31' },
  { kind: 'immersion', label: 'Immersion', icon: 'M6 3 L6 31 L34 31 L34 3' },
];
export const brewerIcon = (path, size = 36) => `<svg width="${size}" height="${Math.round(size * 30 / 36)}" viewBox="0 0 40 34" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path></svg>`;
export const brewerLabel = (kind) => (BREWERS.find((b) => b.kind === kind) || {}).label || kind;

export function liquorColor(tdsPct) {
  // 0.5 to 4 % TDS over five browns, as in the mockups
  const stops = ['#D9BC95', '#C79F73', '#A9784F', '#86552F', '#5E361C'];
  const t = Math.max(0, Math.min(1, (tdsPct - 0.5) / 3.5));
  return stops[Math.min(4, Math.floor(t * 5))];
}
export function ramp(t, a = [217, 188, 149], b = [94, 54, 28]) {
  t = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export const tealRamp = (t) => ramp(t, [233, 241, 241], [46, 110, 124]);
export const heatRamp = (t) => ramp(t, [238, 228, 210], [168, 50, 58]);

export function toast(root, msg, kind = '') {
  let el = root.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);padding:10px 16px;border-radius:10px;background:#211B17;color:#FBF8F2;font-size:13px;z-index:50;max-width:90vw'; root.appendChild(el); }
  el.textContent = msg;
  el.style.background = kind === 'err' ? '#7A1F25' : '#211B17';
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// Re-render helper: a `change` fires on blur, which happens on mousedown of the next click. Re-rendering
// right then would replace the button under the pointer and swallow the click. This defers the render
// until the pointer is up (and a little after), so the click lands on the element that was pressed.
export function makeScheduler(root, render) {
  let down = false, timer = null;
  const run = () => { timer = null; if (down) { timer = setTimeout(run, 60); return; } render(); };
  root.addEventListener('pointerdown', () => { down = true; }, true);
  root.addEventListener('pointerup', () => { down = false; }, true);
  root.addEventListener('pointercancel', () => { down = false; }, true);
  return () => { if (!timer) timer = setTimeout(run, 40); };
}
