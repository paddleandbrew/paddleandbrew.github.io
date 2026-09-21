// SVG views. Every element drawn from a named solver field is solid; anything for orientation only
// (ripples, drips, stream swirl, camera perspective) is dashed or hatched, as the mockups mark them.
import { Frame } from './frame.js';
import { esc, fmtTime, f0, f1, f2, liquorColor, ramp, tealRamp, heatRamp } from './ui.js';

const INK = '#211B17', MUTED = '#5A5048', LINE = '#DCD3C4', TEAL = '#2E6E7C', ACCENT = '#A8323A', WATER = '#DCECEC', WATER2 = '#CFE3E4', PANEL = '#FBF8F2';

export const LAYERS = [
  { id: 'liquor', label: 'Liquor', long: 'Liquor concentration', legend: ['0.5', '4.0'], unit: '% TDS in the liquor' },
  { id: 'pools', label: 'Pools', long: 'Pool depletion', legend: ['0%', '100%'], unit: 'kinetic pool depleted' },
  { id: 'temp', label: 'Temp', long: 'Temperature', legend: ['60', '95 °C'], unit: '°C' },
  { id: 'perm', label: 'Perm.', long: 'Permeability', legend: ['low', 'high'], unit: 'relative to the fresh bed' },
];

function cellColour(fr, layer, i, j) {
  const sat = fr.col('col_sat', i, 1);
  if (sat < 0.03) return '#EDE3D2';
  switch (layer) {
    case 'pools': { const d = 1 - fr.cell('pool_kinetic', i, j, fr.cell('pool_single', i, j, 1)); return ramp(d); }
    case 'temp': { const t = fr.cell('temp_c', i, j, NaN); return isFinite(t) ? heatRamp((t - 60) / 35) : '#EDE3D2'; }
    case 'perm': { const k = fr.cell('perm_m2', i, j, NaN); const k0 = fr.run._k0 || (fr.run._k0 = new Frame(fr.run, 0).cell('perm_m2', 0, 0, k)); return tealRamp(0.5 + 0.5 * Math.log10((k / k0) || 1)); }
    default: { const c = fr.cell('liquor_conc', i, j, 0); return liquorColor(fr.tds(c)); }
  }
}

export function legendColours(layer) {
  const n = 5;
  return Array.from({ length: n }, (_, k) => {
    const t = k / (n - 1);
    if (layer === 'temp') return heatRamp(t);
    if (layer === 'perm') return tealRamp(t);
    if (layer === 'pools') return ramp(t);
    return liquorColor(0.5 + 3.5 * t);
  });
}

// Geometry of the brewer in the profile: returns helpers mapping (r, z) in metres to px.
function profileGeometry(fr, inputs, W, H) {
  const isCone = ['cone', 'fluted_cone', 'valve_hybrid'].includes(inputs.brewer.kind);
  const rim = inputs.brewer.top_diameter_mm / 2000;
  const tan = isCone ? Math.tan((inputs.brewer.half_angle_deg * Math.PI) / 180) : 0;
  const zTop = fr.s('bed_top_m');
  const zRim = isCone ? rim / tan : Math.max(zTop * 2.6, zTop + 0.06);
  const headMax = 0.06;
  const zSpan = Math.max(zRim, zTop + headMax) * 1.05;
  const scale = Math.min((W * 0.42) / rim, (H * 0.62) / zSpan);
  const cx = W * 0.5, y0 = H * 0.66; // apex or base line
  const X = (r) => cx + r * scale;
  const Y = (z) => y0 - z * scale;
  const zWall = (r) => (isCone ? r / tan : 0);
  return { isCone, rim, tan, zTop, zRim, scale, cx, y0, X, Y, zWall };
}

export function profileView(run, k, inputs, opts = {}) {
  const fr = new Frame(run, k);
  const layer = opts.layer || 'liquor';
  const W = 520, H = 470;
  const g = profileGeometry(fr, inputs, W, H);
  const nc = fr.nc, nz = fr.nz;
  const parts = [];
  parts.push(`<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${INK}" stroke-width="1.2" opacity="0.35"/></pattern></defs>`);
  // Head water (between walls, above the bed top)
  const head = fr.s('head_m', 0);
  const headConc = fr.s('head_conc', 0);
  if (head > 1e-4) {
    const zt = g.zTop, zh = g.zTop + head;
    const rT = g.isCone ? zt * g.tan : g.rim, rH = g.isCone ? zh * g.tan : g.rim;
    parts.push(`<polygon points="${g.X(-rT)},${g.Y(zt)} ${g.X(rT)},${g.Y(zt)} ${g.X(rH)},${g.Y(zh)} ${g.X(-rH)},${g.Y(zh)}" fill="${headConc > 0.01 ? liquorColor(fr.tds(headConc)) : WATER}" opacity="${headConc > 0.01 ? 0.55 : 1}"/>`);
    parts.push(`<line x1="${g.X(-rH)}" y1="${g.Y(zh)}" x2="${g.X(rH)}" y2="${g.Y(zh)}" stroke="${TEAL}" stroke-width="1.5"/>`);
  }
  // Bed cells per column, mirrored left and right of the axis
  const rOuter = fr.cols('col_radius').map((rm, i) => (i + 1) * (fr.col('col_radius', nc - 1) * 2) / (2 * nc - 1) * 1);
  // Reconstruct column edges from mid radii: mid_i = (i+0.5)*dr -> dr = mid_0*2
  const dr = fr.col('col_radius', 0) * 2;
  for (let i = 0; i < nc; i++) {
    const r0 = i * dr, r1 = (i + 1) * dr, rm = fr.col('col_radius', i);
    // Cells follow the wall: the bottom of a column sits on the cone at each radius.
    const hCol = fr.col('col_height_m', i, fr.col('col_depth', i));
    const cellH = hCol / nz;
    const z0a = g.zWall(r0), z0b = g.zWall(r1);
    const cellPoly = (sgn, zlo, zhi) => `${g.X(sgn * r0)},${g.Y(z0a + zlo)} ${g.X(sgn * r1)},${g.Y(z0b + zlo)} ${g.X(sgn * r1)},${g.Y(z0b + zhi)} ${g.X(sgn * r0)},${g.Y(z0a + zhi)}`;
    for (let j = 0; j < nz; j++) {
      const zlo = (nz - 1 - j) * cellH, zhi = zlo + cellH;
      const fill = cellColour(fr, layer, i, j);
      for (const sgn of [-1, 1]) parts.push(`<polygon points="${cellPoly(sgn, zlo, zhi)}" fill="${fill}" stroke="${PANEL}" stroke-width="0.6"/>`);
    }
    // Slurry zone: hatched over the mobilised cells (solver state: col_slurry_cells), hatch is the illustrative mark
    const sc = fr.col('col_slurry_cells', i, 0);
    if (sc > 0.05) {
      const zhi = hCol, zlo = zhi - Math.min(sc, nz) * cellH;
      for (const sgn of [-1, 1]) parts.push(`<polygon points="${cellPoly(sgn, zlo, zhi)}" fill="url(#hatch)"/>`);
    }
  }
  // Fines at the paper: darker line along the bed bottom, thickness by the paper resistance factor
  const pf = fr.cols('paper_resistance_factor');
  if (isFinite(pf[0])) {
    for (let i = 0; i < nc; i++) {
      const r0 = i * dr, r1 = (i + 1) * dr;
      const w = 1.5 + 6 * Math.max(0, pf[i] - 1);
      for (const sgn of [-1, 1]) parts.push(`<line x1="${g.X(sgn * r0)}" y1="${g.Y(g.zWall(r0))}" x2="${g.X(sgn * r1)}" y2="${g.Y(g.zWall(r1))}" stroke="#2B1608" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`);
    }
  }
  // Brewer walls
  const rimZ = g.zRim;
  if (g.isCone) parts.push(`<polyline points="${g.X(-g.rim)},${g.Y(rimZ)} ${g.X(0)},${g.Y(0)} ${g.X(g.rim)},${g.Y(rimZ)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`);
  else parts.push(`<polyline points="${g.X(-g.rim)},${g.Y(rimZ)} ${g.X(-g.rim)},${g.Y(0)} ${g.X(g.rim)},${g.Y(0)} ${g.X(g.rim)},${g.Y(rimZ)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`);
  // Bypass path along the wall (solver state bypass_rate; the dashed line is the illustrative path)
  const bypassRate = fr.s('bypass_rate_kgps', 0);
  if (bypassRate > 1e-6) {
    const zh = g.zTop + head;
    parts.push(`<line x1="${g.X(g.rim) - 6}" y1="${g.Y(rimZ)}" x2="${g.X(0) + 6}" y2="${g.Y(0) + 2}" stroke="${TEAL}" stroke-width="2.4" stroke-dasharray="2 7" stroke-linecap="round"/>`);
    void zh;
  }
  // Pour stream
  const pour = fr.s('pour_rate_kgps', 0) * 1000;
  if (pour > 0) {
    const sr = fr.s('stream_radius_m', 0);
    const zh = g.zTop + head;
    parts.push(`<line x1="${g.X(sr)}" y1="8" x2="${g.X(sr)}" y2="${g.Y(zh)}" stroke="${TEAL}" stroke-width="5" stroke-linecap="round"/>`);
    // ripples: illustrative
    for (const rr of [0.006, 0.012]) parts.push(`<ellipse cx="${g.X(sr)}" cy="${g.Y(zh)}" rx="${rr * g.scale}" ry="${rr * g.scale * 0.35}" fill="none" stroke="${TEAL}" stroke-width="1.2" stroke-dasharray="4 4"/>`);
    const idx = fr.s('pour_index', -1) + 1;
    const broken = fr.s('pour_stream', 0) > 0.5;
    parts.push(`<text x="${Math.min(W - 150, g.X(sr) + 10)}" y="22" font-family="IBM Plex Mono, monospace" font-size="12" fill="${TEAL}">Pour ${idx} · ${f1(pour)} g/s · ${broken ? 'broken' : 'smooth'}</text>`);
  }
  // Outflow drips below the apex: illustrative, labelled with solver numbers
  const drain = fr.s('drain_rate_kgps', 0) * 1000;
  const outTds = fr.tds(fr.s('outflow_conc', 0));
  if (drain > 0.02) {
    for (let d = 0; d < 3; d++) parts.push(`<line x1="${g.X(0)}" y1="${g.y0 + 8 + d * 16}" x2="${g.X(0)}" y2="${g.y0 + 16 + d * 16}" stroke="${liquorColor(outTds)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 5"/>`);
    parts.push(`<text x="${g.X(0) + 12}" y="${g.y0 + 24}" font-family="IBM Plex Mono, monospace" font-size="12" fill="${INK}">${f1(drain)} g/s · ${f1(outTds)}% TDS</text>`);
  }
  // Cup
  const cupG = (fr.s('cup_water_kg', 0) + fr.s('cup_solubles_kg', 0)) * 1000;
  const cupW = 150, cupH = 60, cupX = g.cx - cupW / 2, cupY = H - cupH - 8;
  const fillFrac = Math.min(1, cupG / 400);
  const cupTds = fr.s('cup_tds_pct', 0);
  parts.push(`<rect x="${cupX + 4}" y="${cupY + cupH - fillFrac * (cupH - 6)}" width="${cupW - 8}" height="${fillFrac * (cupH - 6)}" fill="${liquorColor(cupTds || 1)}"/>`);
  parts.push(`<polyline points="${cupX + 10},${cupY} ${cupX},${cupY + cupH} ${cupX + cupW},${cupY + cupH} ${cupX + cupW - 10},${cupY}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`);
  parts.push(`<text x="${cupX - 8}" y="${cupY + cupH - 10}" text-anchor="end" font-family="IBM Plex Sans, sans-serif" font-size="13" font-weight="600" fill="${INK}">In cup</text><text x="${cupX - 8}" y="${cupY + cupH + 6}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">${f0(cupG)} g</text>`);
  // Labels: left column
  const label = (x, y, title, sub, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="IBM Plex Sans, sans-serif" font-size="13" font-weight="600" fill="${INK}">${esc(title)}</text><text x="${x}" y="${y + 16}" text-anchor="${anchor}" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">${esc(sub)}</text>`;
  parts.push(label(4, 60, 'Head', `${f0(head * 1000)} mm`));
  const kPerm = fr.cell('perm_m2', 0, nz - 1, NaN);
  parts.push(label(4, 110, `${['Settled bed', 'Slurried bed', 'Settled bed', 'Immersed bed'][fr.s('bed_state', 2)] || 'Bed'}`, isFinite(kPerm) ? `k ${kPerm.toExponential(1)} m²` : ''));
  const slurry = fr.s('slurry_depth_m', 0) * 1000;
  const shields = fr.s('shields_ratio', NaN);
  parts.push(label(W - 4, 60, `Slurry zone ${f0(slurry)} mm`, isFinite(shields) ? `Shields ${f1(shields)}× crit` : 'coupling off', 'end'));
  const byp = fr.s('bypass_frac', NaN);
  parts.push(label(W - 4, 110, 'Wall bypass', isFinite(byp) ? `${f0(byp * 100)}% of flow` : 'off', 'end'));
  const meanPf = isFinite(pf[0]) ? pf.reduce((a, b) => a + b, 0) / nc : NaN;
  parts.push(label(W - 4, 160, 'Fines at paper', isFinite(meanPf) ? `+${f0((meanPf - 1) * 100)}% resistance` : 'off', 'end'));
  parts.push(label(4, 160, 'Retained', `${f0(fr.s('retained_water_kg', 0) * 1000)} g`));
  // Legend for the layer
  const L = LAYERS.find((l) => l.id === layer) || LAYERS[0];
  const cols = legendColours(layer);
  const lx = W - 120, ly = H - 44;
  parts.push(`<text x="${lx}" y="${ly - 6}" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">${esc(L.long)}</text>`);
  cols.forEach((c, i) => parts.push(`<rect x="${lx + i * 22}" y="${ly}" width="22" height="12" fill="${c}"/>`));
  parts.push(`<text x="${lx}" y="${ly + 26}" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">${esc(L.legend[0])}</text><text x="${lx + 110}" y="${ly + 26}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">${esc(L.legend[1])}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Profile section of the brewer at ${fmtTime(fr.t())}">${parts.join('')}</svg>`;
}

export function topView(run, k, inputs, opts = {}) {
  const fr = new Frame(run, k);
  const layer = opts.layer || 'liquor';
  const W = 360, H = 340;
  const cx = W / 2, cy = 170;
  const rim = inputs.brewer.top_diameter_mm / 2000;
  const scale = 150 / rim;
  const nc = fr.nc;
  const dr = fr.col('col_radius', 0) * 2;
  const parts = [];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${rim * scale}" fill="#EFE6D6" stroke="${INK}" stroke-width="3"/>`);
  const head = fr.s('head_m', 0);
  const isCone = ['cone', 'fluted_cone', 'valve_hybrid'].includes(inputs.brewer.kind);
  const tan = isCone ? Math.tan((inputs.brewer.half_angle_deg * Math.PI) / 180) : 0;
  const zTop = fr.s('bed_top_m');
  const rWater = isCone ? Math.min(rim, (zTop + head) * tan) : rim;
  if (head > 1e-4) parts.push(`<circle cx="${cx}" cy="${cy}" r="${rWater * scale}" fill="${WATER}" opacity="0.9"/>`);
  for (let i = nc - 1; i >= 0; i--) {
    const r1 = (i + 1) * dr;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r1 * scale}" fill="${cellColour(fr, layer, i, 0)}" stroke="${PANEL}" stroke-width="0.8" opacity="${head > 1e-4 ? 0.75 : 1}"/>`);
  }
  // Mobilised columns ring hatch
  parts.push(`<defs><pattern id="hatchTop" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${INK}" stroke-width="1.2" opacity="0.35"/></pattern></defs>`);
  for (let i = 0; i < nc; i++) {
    const m = fr.col('col_mobilised', i, 0);
    if (m > 0.05) {
      const r0 = i * dr, r1 = (i + 1) * dr;
      parts.push(`<path d="M ${cx + r1 * scale} ${cy} A ${r1 * scale} ${r1 * scale} 0 1 0 ${cx - r1 * scale} ${cy} A ${r1 * scale} ${r1 * scale} 0 1 0 ${cx + r1 * scale} ${cy} Z M ${cx + r0 * scale} ${cy} A ${r0 * scale} ${r0 * scale} 0 1 1 ${cx - r0 * scale} ${cy} A ${r0 * scale} ${r0 * scale} 0 1 1 ${cx + r0 * scale} ${cy} Z" fill="url(#hatchTop)" fill-rule="evenodd"/>`);
    }
  }
  // Bypass ring: outer stroke width by bypass fraction
  const byp = fr.s('bypass_frac', 0);
  if (byp > 0.005) parts.push(`<circle cx="${cx}" cy="${cy}" r="${rim * scale - 4}" fill="none" stroke="${TEAL}" stroke-width="${2 + 30 * byp}" stroke-dasharray="2 6" opacity="0.8"/>`);
  // Stream position: radius is solver state; the angle sweeps with time (illustrative)
  const pour = fr.s('pour_rate_kgps', 0) * 1000;
  if (pour > 0) {
    const sr = fr.s('stream_radius_m', 0);
    const ang = fr.t() * 1.3;
    const sx = cx + sr * scale * Math.cos(ang), sy = cy + sr * scale * Math.sin(ang);
    const fp = fr.s('footprint_m', 0.014) * scale;
    parts.push(`<circle cx="${sx}" cy="${sy}" r="${fp / 2}" fill="none" stroke="${TEAL}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    parts.push(`<circle cx="${sx}" cy="${sy}" r="5" fill="${TEAL}"/>`);
    if (sr > 0.003) parts.push(`<circle cx="${cx}" cy="${cy}" r="${sr * scale}" fill="none" stroke="${TEAL}" stroke-width="1" stroke-dasharray="3 5" opacity="0.7"/>`);
  }
  // Section line A-A'
  parts.push(`<line x1="${cx - rim * scale - 8}" y1="${cy}" x2="${cx + rim * scale + 8}" y2="${cy}" stroke="${INK}" stroke-width="1" stroke-dasharray="6 4"/>`);
  parts.push(`<text x="${cx - rim * scale - 14}" y="${cy + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="13" fill="${INK}">A</text><text x="${cx + rim * scale + 14}" y="${cy + 4}" font-family="IBM Plex Mono, monospace" font-size="13" fill="${INK}">A′</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Top view at ${fmtTime(fr.t())}">${parts.join('')}</svg>`;
}

export function topMetrics(run, k) {
  const fr = new Frame(run, k);
  return [
    ['Stream position', fr.s('pour_rate_kgps', 0) > 0 ? `r = ${f0(fr.s('stream_radius_m', 0) * 1000)} mm` : 'no pour'],
    ['Impact footprint', `ø ${f0(fr.s('footprint_m', NaN) * 1000)} mm`],
    ['Surface mobilised', `${f0(fr.s('surface_mobilised_frac', 0) * 100)}%`],
    ['Wall bypass ring', isFinite(fr.s('bypass_frac', NaN)) ? `${f0(fr.s('bypass_frac', 0) * 100)}%` : 'off'],
  ];
}

// Cutaway: the column model swept around the axis, drawn in a fixed perspective. Not a 3D solve.
export function cutawayView(run, k, inputs, opts = {}) {
  const fr = new Frame(run, k);
  const layer = opts.layer || 'liquor';
  const tilt = opts.tilt ?? 15, cut = opts.cutAngle ?? 180;
  const showFines = opts.fines !== false, showBypass = opts.bypass !== false, motion = opts.motion !== false;
  const probe = opts.probe || { col: Math.min(fr.nc - 1, 3), cell: Math.min(fr.nz - 1, 2) };
  const W = 840, H = 740;
  const rim = inputs.brewer.top_diameter_mm / 2000;
  const isCone = ['cone', 'fluted_cone', 'valve_hybrid'].includes(inputs.brewer.kind);
  const tan = isCone ? Math.tan((inputs.brewer.half_angle_deg * Math.PI) / 180) : 0;
  const zTop = fr.s('bed_top_m');
  const zRim = isCone ? rim / tan : Math.max(zTop * 2.6, zTop + 0.06);
  const ratio = 0.12 + (tilt / 90) * 0.55; // ellipse squash from the camera tilt (illustrative)
  const scaleX = 270 / rim;
  const scaleZ = 480 / zRim;
  const cx = 420, yRim = 80, yApex = yRim + zRim * scaleZ;
  const X = (r) => cx + r * scaleX, Y = (z) => yApex - z * scaleZ;
  const ry = (r) => r * scaleX * ratio;
  const zWall = (r) => (isCone ? r / tan : 0);
  const wallR = (z) => (isCone ? z * tan : rim);
  const parts = [];
  parts.push(`<defs><pattern id="hatchC" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${INK}" stroke-width="1.3" opacity="0.4"/></pattern></defs>`);
  // Back wall: the far half of the cone, cut angle sets how much of it shows
  const sweep = Math.max(0.15, Math.min(1, cut / 270));
  parts.push(`<path d="M ${X(-rim)} ${yRim} A ${rim * scaleX} ${ry(rim)} 0 0 1 ${X(rim)} ${yRim} L ${X(0)} ${yApex} Z" fill="#EFE6D6" opacity="${0.5 + 0.5 * sweep}"/>`);
  for (let i = 1; i < 5; i++) {
    const a = Math.PI * (i / 5);
    parts.push(`<line x1="${cx + rim * scaleX * Math.cos(a)}" y1="${yRim - ry(rim) * Math.sin(a)}" x2="${X(0)}" y2="${yApex}" stroke="#A99C8A" stroke-width="1.2" stroke-dasharray="4 4"/>`);
  }
  parts.push(`<path d="M ${X(-rim)} ${yRim} A ${rim * scaleX} ${ry(rim)} 0 0 1 ${X(rim)} ${yRim}" fill="none" stroke="${INK}" stroke-width="3"/>`);
  // Water surface
  const head = fr.s('head_m', 0);
  const zh = zTop + head;
  if (head > 1e-4) {
    const rw = wallR(zh);
    parts.push(`<ellipse cx="${cx}" cy="${Y(zh)}" rx="${rw * scaleX}" ry="${ry(rw)}" fill="${WATER}" stroke="${TEAL}" stroke-width="1.5"/>`);
    if (motion) parts.push(`<ellipse cx="${cx}" cy="${Y(zh)}" rx="${rw * scaleX * 0.9}" ry="${ry(rw) * 0.9}" fill="none" stroke="${TEAL}" stroke-width="4" stroke-dasharray="2 7" opacity="0.7"/>`);
    // Water body in front of the cut: the section between bed top and surface
    parts.push(`<polygon points="${X(-wallR(zTop))},${Y(zTop)} ${X(wallR(zTop))},${Y(zTop)} ${X(rw)},${Y(zh)} ${X(-rw)},${Y(zh)}" fill="${WATER2}"/>`);
  }
  // Pour
  const pour = fr.s('pour_rate_kgps', 0) * 1000;
  if (pour > 0) {
    const sr = fr.s('stream_radius_m', 0);
    const sx = X(-sr * 0.6), sy = Y(zh) - ry(sr) * 0.3;
    parts.push(`<line x1="${sx}" y1="0" x2="${sx}" y2="${sy}" stroke="${TEAL}" stroke-width="6" stroke-linecap="round"/>`);
    if (motion) for (const rr of [22, 42, 64]) parts.push(`<ellipse cx="${sx}" cy="${sy}" rx="${rr}" ry="${rr * ratio}" fill="none" stroke="${TEAL}" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.7"/>`);
    parts.push(`<text x="${sx + 12}" y="30" font-family="IBM Plex Mono, monospace" font-size="14" fill="${TEAL}">Pour ${fr.s('pour_index', -1) + 1} · ${f1(pour)} g/s · ${fr.s('pour_stream', 0) > 0.5 ? 'broken' : 'smooth'}</text>`);
  }
  // Bed section: columns as stacked trapezoids following the cone wall
  const nc = fr.nc, nz = fr.nz;
  const dr = fr.col('col_radius', 0) * 2;
  for (let i = 0; i < nc; i++) {
    const r0 = i * dr, r1 = (i + 1) * dr, rm = fr.col('col_radius', i);
    const hCol = fr.col('col_height_m', i, fr.col('col_depth', i));
    const cellH = hCol / nz;
    const z0a = zWall(r0), z0b = zWall(r1);
    const cellPoly = (sgn, zlo, zhi) => `${X(sgn * r0)},${Y(z0a + zlo)} ${X(sgn * r1)},${Y(z0b + zlo)} ${X(sgn * r1)},${Y(z0b + zhi)} ${X(sgn * r0)},${Y(z0a + zhi)}`;
    for (let j = 0; j < nz; j++) {
      const zlo = (nz - 1 - j) * cellH, zhi = zlo + cellH;
      const fill = cellColour(fr, layer, i, j);
      for (const sgn of [-1, 1]) {
        const isProbe = i === probe.col && j === probe.cell && sgn === 1;
        parts.push(`<polygon data-col="${i}" data-cell="${j}" class="probe-hit" points="${cellPoly(sgn, zlo, zhi)}" fill="${fill}" stroke="${isProbe ? PANEL : '#FBF8F2'}" stroke-width="${isProbe ? 2.5 : 0.8}" opacity="0.98"/>`);
      }
    }
    const sc = fr.col('col_slurry_cells', i, 0);
    if (sc > 0.05) {
      const zhi = hCol, zlo = zhi - Math.min(sc, nz) * cellH;
      for (const sgn of [-1, 1]) parts.push(`<polygon points="${cellPoly(sgn, zlo, zhi)}" fill="url(#hatchC)"/>`);
    }
    void rm;
  }
  // Fines at paper
  const pf = fr.cols('paper_resistance_factor');
  if (showFines && isFinite(pf[0])) {
    for (let i = 0; i < nc; i++) {
      const r0 = i * dr, r1 = (i + 1) * dr;
      const w = 2 + 7 * Math.max(0, pf[i] - 1);
      for (const sgn of [-1, 1]) parts.push(`<line x1="${X(sgn * r0)}" y1="${Y(zWall(r0))}" x2="${X(sgn * r1)}" y2="${Y(zWall(r1))}" stroke="#2B1608" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`);
    }
  }
  if (showBypass && fr.s('bypass_rate_kgps', 0) > 1e-6) parts.push(`<line x1="${X(rim) - 8}" y1="${yRim + 10}" x2="${X(0) + 6}" y2="${yApex - 6}" stroke="${TEAL}" stroke-width="2.6" stroke-dasharray="2 7" stroke-linecap="round"/>`);
  // Front walls
  parts.push(`<polyline points="${X(-rim)},${yRim} ${X(0)},${yApex} ${X(rim)},${yRim}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`);
  // Probe marker
  {
    const i = probe.col, j = probe.cell;
    const rm = fr.col('col_radius', i);
    const hCol = fr.col('col_height_m', i, fr.col('col_depth', i));
    const cellH = hCol / nz;
    const zc = zWall(rm) + (nz - 1 - j) * cellH + cellH / 2;
    const px = X(rm), py = Y(zc);
    void 0;
    parts.push(`<circle cx="${px}" cy="${py}" r="13" fill="none" stroke="${PANEL}" stroke-width="2.5"/><circle cx="${px}" cy="${py}" r="4" fill="${PANEL}"/>`);
    parts.push(`<line x1="${px + 13}" y1="${py}" x2="${px + 170}" y2="${py}" stroke="${INK}" stroke-width="1"/>`);
    parts.push(`<text x="${px + 176}" y="${py - 4}" font-family="IBM Plex Sans, sans-serif" font-size="16" font-weight="600" fill="${INK}">Probe</text><text x="${px + 176}" y="${py + 16}" font-family="IBM Plex Mono, monospace" font-size="14" fill="${MUTED}">column ${i + 1} · ${f0((zTop - zc) * 1000)} mm deep</text>`);
  }
  // Labels
  const label = (x, y, t, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="IBM Plex Sans, sans-serif" font-size="16" font-weight="600" fill="${INK}">${esc(t)}</text>`;
  parts.push(label(8, 240, `Head ${f0(head * 1000)} mm`));
  parts.push(label(8, 312, `Slurry zone ${f0(fr.s('slurry_depth_m', 0) * 1000)} mm`));
  const meanPf = isFinite(pf[0]) ? pf.reduce((a, b) => a + b, 0) / nc : NaN;
  parts.push(label(8, 470, isFinite(meanPf) ? `Fines at paper +${f0((meanPf - 1) * 100)}%` : 'Fines module off'));
  const byp = fr.s('bypass_frac', NaN);
  parts.push(label(W - 8, 300, isFinite(byp) ? `Wall bypass ${f0(byp * 100)}%` : 'Bypass off', 'end'));
  // Carafe
  const cupG = (fr.s('cup_water_kg', 0) + fr.s('cup_solubles_kg', 0)) * 1000;
  const fillH = Math.min(1, cupG / 400) * 100;
  const drain = fr.s('drain_rate_kgps', 0) * 1000;
  if (drain > 0.02) parts.push(`<line x1="${X(0)}" y1="${yApex + 2}" x2="${X(0)}" y2="${yApex + 80}" stroke="${liquorColor(fr.tds(fr.s('outflow_conc', 0)))}" stroke-width="4" stroke-dasharray="4 6"/>`);
  parts.push(`<polygon points="${cx - 100},${720 - fillH} ${cx + 100},${720 - fillH} ${cx + 108},720 ${cx - 108},720" fill="${liquorColor(fr.s('cup_tds_pct', 1) || 1)}"/>`);
  parts.push(`<polyline points="${cx - 90},610 ${cx - 108},720 ${cx + 108},720 ${cx + 90},610" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="${cx}" cy="610" rx="90" ry="${11}" fill="none" stroke="${INK}" stroke-width="2"/>`);
  parts.push(`<text x="${cx + 120}" y="676" font-family="IBM Plex Mono, monospace" font-size="14" fill="${INK}">${f0(cupG)} g · ${f2(fr.s('cup_tds_pct', 0))}% TDS</text>`);
  if (drain > 0.02) parts.push(`<text x="${cx + 14}" y="600" font-family="IBM Plex Mono, monospace" font-size="14" fill="${INK}">${f1(drain)} g/s · ${f1(fr.tds(fr.s('outflow_conc', 0)))}%</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox cutaway" role="img" aria-label="Half cutaway of the brewer at ${fmtTime(fr.t())}">${parts.join('')}</svg>`;
}

export function probeReadings(run, k, probe) {
  const fr = new Frame(run, k);
  const i = probe.col, j = probe.cell;
  const nz = fr.nz;
  const q = fr.col('col_q_mps', i, 0);
  const phi = fr.cell('porosity', i, j, 0.5);
  return {
    tds: fr.tds(fr.cell('liquor_conc', i, j, 0)),
    velocity: (q / Math.max(phi, 0.05)) * 1000,
    temp: fr.cell('temp_c', i, j, NaN),
    fast: 1 - fr.cell('pool_fast', i, j, NaN),
    kinetic: 1 - fr.cell('pool_kinetic', i, j, NaN),
    fines: fr.cell('fines_loading', i, j, NaN),
    depthMm: (() => { const zTop = fr.s('bed_top_m'); const rm = fr.col('col_radius', i); const inputsCone = fr.col('col_depth', i) > 0; void inputsCone; const hCol = fr.col('col_height_m', i, fr.col('col_depth', i)); const zb0 = zTop - fr.col('col_depth', i); const zc = zb0 + (nz - 1 - j) * (hCol / nz) + hCol / nz / 2; void rm; return (zTop - zc) * 1000; })(),
    radiusMm: fr.col('col_radius', i) * 1000,
  };
}

export function probeSeriesChart(run, k, probe, W = 268, H = 110) {
  const s = Frame.cellSeries(run, 'liquor_conc', probe.col, probe.cell);
  if (!s) return '';
  const n = run.t.length, tEnd = run.t[n - 1];
  const tds = Array.from(s, (c) => (100 * c) / (1 + c));
  const max = Math.max(0.5, ...tds);
  const px = (i) => 24 + (run.t[i] / tEnd) * (W - 24), py = (v) => 92 - (v / max) * 80;
  const past = [], future = [];
  for (let i = 0; i < n; i++) (i <= k ? past : future).push(`${px(i).toFixed(1)},${py(tds[i]).toFixed(1)}`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Liquor concentration at the probe over the brew"><line x1="0" y1="92" x2="${W}" y2="92" stroke="${LINE}"/>
    <polyline points="${past.join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="2.4" stroke-linejoin="round"/>
    <polyline points="${[past[past.length - 1], ...future].filter(Boolean).join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="5 4"/>
    <line x1="${px(k)}" y1="4" x2="${px(k)}" y2="94" stroke="${INK}" stroke-width="1.5"/><circle cx="${px(k)}" cy="${py(tds[k])}" r="4.5" fill="${ACCENT}" stroke="${PANEL}" stroke-width="1.5"/>
    <text x="0" y="106" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">0:00</text><text x="${W}" y="106" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">${fmtTime(tEnd)}</text>
    <text x="0" y="12" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">${f1(max)}% TDS</text></svg>`;
}

const STATE_COLOURS = { 0: '#E6DCC9', 1: '#D9A0A3', 2: '#4E2C18', 3: TEAL };
const STATE_NAMES = { 0: 'Wetting', 1: 'Slurried', 2: 'Settled · drawdown', 3: 'Immersed' };

// Timeline: pour strip, bed regime strip, head curve, outflow TDS with the prediction band, playhead.
export function timeline(run, k, opts = {}) {
  const W = opts.width || 720, H = 180;
  const n = run.t.length, tEnd = run.t[n - 1];
  const x0 = 36, x1 = W - 8;
  const px = (t) => x0 + (t / tEnd) * (x1 - x0);
  const parts = [];
  const pour = Frame.series(run, 'pour_rate_kgps');
  const state = Frame.series(run, 'bed_state');
  const head = Frame.series(run, 'head_m');
  const conc = Frame.series(run, 'outflow_conc');
  // Pour strip
  parts.push(`<text x="0" y="22" class="mark" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">Pour</text>`);
  if (pour) for (let i = 0; i < n - 1; i++) if (pour[i] > 0) parts.push(`<rect x="${px(run.t[i])}" y="12" width="${Math.max(1, px(run.t[i + 1]) - px(run.t[i]))}" height="12" fill="${TEAL}"/>`);
  // Bed strip with labels for long segments
  parts.push(`<text x="0" y="48" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">Bed</text>`);
  if (state) {
    let segStart = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || state[i] !== state[segStart]) {
        const a = px(run.t[segStart]), b = px(run.t[Math.min(i, n - 1)]);
        const st = state[segStart];
        parts.push(`<rect x="${a}" y="38" width="${Math.max(1, b - a)}" height="14" fill="${STATE_COLOURS[st] || LINE}"/>`);
        if (b - a > 70) parts.push(`<text x="${a + 6}" y="49" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="${st === 2 || st === 3 ? PANEL : INK}">${STATE_NAMES[st] || ''}</text>`);
        segStart = i;
      }
    }
  } else {
    parts.push(`<rect x="${x0}" y="38" width="${x1 - x0}" height="14" fill="${LINE}"/><text x="${x0 + 6}" y="49" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="${INK}">coupling module off</text>`);
  }
  // Curves area 64..156
  const yTop = 64, yBot = 156;
  const bands = opts.bands;
  const tdsMax = Math.max(3, bands ? Math.max(...bands.curve_p90.filter(isFinite)) : 0, conc ? Math.max(...Array.from(conc, (c) => (100 * c) / (1 + c))) : 0);
  const yTds = (v) => yBot - (Math.min(v, tdsMax) / tdsMax) * (yBot - yTop);
  if (bands && bands.curve_t) {
    const up = [], dn = [];
    bands.curve_t.forEach((t, i) => { if (isFinite(bands.curve_p90[i]) && isFinite(bands.curve_p10[i])) { up.push(`${px(t).toFixed(1)},${yTds(bands.curve_p90[i]).toFixed(1)}`); dn.unshift(`${px(t).toFixed(1)},${yTds(bands.curve_p10[i]).toFixed(1)}`); } });
    if (up.length) parts.push(`<polygon points="${up.join(' ')} ${dn.join(' ')}" fill="${ACCENT}" opacity="0.18"/>`);
  }
  const headMax = head ? Math.max(0.01, ...head) : 0.01;
  if (head) parts.push(`<polyline points="${Array.from(head, (h, i) => `${px(run.t[i]).toFixed(1)},${(yBot - (h / headMax) * (yBot - yTop) * 0.9).toFixed(1)}`).join(' ')}" fill="none" stroke="${TEAL}" stroke-width="1.8"/>`);
  if (conc) {
    const pts = [], fut = [];
    for (let i = 0; i < n; i++) (i <= k ? pts : fut).push(`${px(run.t[i]).toFixed(1)},${yTds((100 * conc[i]) / (1 + conc[i])).toFixed(1)}`);
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="2.2"/>`);
    parts.push(`<polyline points="${[pts[pts.length - 1], ...fut].filter(Boolean).join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="1.6" stroke-dasharray="5 4"/>`);
  }
  parts.push(`<text x="0" y="${yTop + 8}" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">${f1(tdsMax)}%</text><text x="0" y="${yBot}" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">0</text>`);
  // Axis
  parts.push(`<line x1="${x0}" y1="${yBot}" x2="${x1}" y2="${yBot}" stroke="${LINE}"/>`);
  const step = tEnd > 360 ? 60 : 30;
  for (let t = 0; t <= tEnd; t += step) parts.push(`<text x="${px(t)}" y="176" text-anchor="${t === 0 ? 'start' : 'middle'}" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">${fmtTime(t)}</text>`);
  // Playhead
  parts.push(`<line x1="${px(run.t[k])}" y1="8" x2="${px(run.t[k])}" y2="${yBot + 4}" stroke="${INK}" stroke-width="1.5"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox timeline" data-x0="${x0}" data-x1="${x1}" data-w="${W}" role="img" aria-label="Brew timeline">${parts.join('')}</svg>`;
}

export function bandBar(lo, hi, mid, min, max, label) {
  const W = 326;
  const x = (v) => Math.max(0, Math.min(W, ((v - min) / (max - min)) * W));
  return `<svg viewBox="0 0 ${W} 22" class="svgbox" role="img" aria-label="${esc(label)}"><rect x="0" y="8" width="${W}" height="6" rx="3" fill="#4A4039"/><rect x="${x(lo)}" y="5" width="${Math.max(4, x(hi) - x(lo))}" height="12" rx="6" fill="${ACCENT}"/><circle cx="${x(mid)}" cy="11" r="7" fill="${PANEL}"/></svg>`;
}

export function curveBand(bands, regimes, W = 330, H = 110) {
  const t = bands.curve_t, tEnd = t[t.length - 1] || 1;
  const px = (v) => (v / tEnd) * W;
  const max = Math.max(1, ...bands.curve_p90.filter(isFinite));
  const py = (v) => 100 - (v / max) * 80;
  const up = [], dn = [], mid = [];
  t.forEach((tt, i) => { if (isFinite(bands.curve_p90[i])) { up.push(`${px(tt).toFixed(1)},${py(bands.curve_p90[i]).toFixed(1)}`); dn.unshift(`${px(tt).toFixed(1)},${py(bands.curve_p10[i]).toFixed(1)}`); mid.push(`${px(tt).toFixed(1)},${py(bands.curve_p50[i]).toFixed(1)}`); } });
  const strip = (regimes || []).map((r) => `<rect x="${px(r.start_s)}" y="4" width="${Math.max(1, px(r.end_s) - px(r.start_s))}" height="8" fill="${{ wetting: '#E6DCC9', slurried: ACCENT, settled: '#4E2C18', immersed: TEAL }[r.state] || LINE}" opacity="${r.state === 'slurried' ? 0.55 : 1}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Outflow TDS band over the brew">${strip}<polygon points="${up.join(' ')} ${dn.join(' ')}" fill="${ACCENT}" opacity="0.2"/><polyline points="${mid.join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-dasharray="5 4"/><line x1="0" y1="102" x2="${W}" y2="102" stroke="${LINE}"/><text x="0" y="24" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">${f1(max)}%</text></svg>`;
}

export function paretoPlot(search, selected, W = 760, H = 300) {
  const cs = search.candidates;
  const dmax = Math.max(0.5, ...cs.map((c) => c.distance));
  const rmax = Math.max(0.5, ...cs.map((c) => c.robustness));
  const px = (d) => 50 + (d / dmax) * (W - 70), py = (r) => 270 - (r / rmax) * 240;
  const parts = [`<line x1="50" y1="270" x2="${W - 10}" y2="270" stroke="${LINE}"/><line x1="50" y1="20" x2="50" y2="270" stroke="${LINE}"/>`];
  cs.forEach((c, i) => { if (!c.on_front) parts.push(`<circle cx="${px(c.distance)}" cy="${py(c.robustness)}" r="4" fill="${LINE}" data-cand="${i}"/>`); });
  const front = search.front.map((i) => cs[i]);
  const fp = front.map((c) => `${px(c.distance)},${py(c.robustness)}`);
  if (fp.length > 1) parts.push(`<polyline points="${fp.join(' ')}" fill="none" stroke="${INK}" stroke-width="1.5"/>`);
  search.front.forEach((i) => { const c = cs[i]; const sel = i === selected; parts.push(`<circle cx="${px(c.distance)}" cy="${py(c.robustness)}" r="${sel ? 11 : 8}" fill="${sel ? ACCENT : INK}" data-cand="${i}" style="cursor:pointer"/><text x="${px(c.distance)}" y="${py(c.robustness) - 14}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="15" font-weight="600" fill="${INK}">${esc(c.label)}</text>`); });
  parts.push(`<text x="${W - 12}" y="290" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">Distance from target cup →</text><text x="52" y="290" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">on target</text><text x="40" y="24" text-anchor="end" transform="rotate(-90 40 24)" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">Robustness →</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox pareto" role="img" aria-label="Recipe set: distance from target against robustness">${parts.join('')}</svg>`;
}

export function pairCurves(runA, runB, W = 305, H = 175) {
  const series = (run) => { const c = Frame.series(run, 'outflow_conc'); return c ? Array.from(c, (v, i) => [run.t[i], (100 * v) / (1 + v)]) : []; };
  const a = series(runA), b = series(runB);
  const tEnd = Math.max(runA.t[runA.t.length - 1], runB.t[runB.t.length - 1]);
  const max = Math.max(2, ...a.map((p) => p[1]), ...b.map((p) => p[1]));
  const px = (t) => 14 + (t / tEnd) * (W - 20), py = (v) => 120 - (v / max) * 100;
  const line = (pts, col, dash) => `<polyline points="${pts.map(([t, v]) => `${px(t).toFixed(1)},${py(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2" ${dash ? 'stroke-dasharray="5 4"' : ''}/>`;
  const strip = (run, y) => { const st = Frame.series(run, 'bed_state'); if (!st) return ''; let out = ''; for (let i = 0; i < run.t.length - 1; i++) if (st[i] === 1) out += `<rect x="${px(run.t[i])}" y="${y}" width="${Math.max(1, px(run.t[i + 1]) - px(run.t[i]))}" height="8" fill="${ACCENT}" opacity="0.6"/>`; return out; };
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Outflow TDS of two recipes"><text x="0" y="12" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">Outflow % TDS</text>${line(a, ACCENT)}${line(b, INK, true)}<line x1="14" y1="120" x2="${W - 6}" y2="120" stroke="${LINE}"/>${strip(runA, 128)}${strip(runB, 146)}<text x="0" y="135" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">B</text><text x="0" y="153" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">A</text><text x="14" y="172" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">0:00</text><text x="${W - 6}" y="172" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="10" fill="${MUTED}">${fmtTime(tEnd)}</text></svg>`;
}

// Cup strength brew by brew: predicted band (two sigma) and logged value.
export function strengthByBrew(rows, nextBand, W = 760, H = 260) {
  const vals = rows.flatMap((r) => [r.lo, r.hi, r.logged].filter(isFinite));
  if (nextBand) vals.push(nextBand.lo, nextBand.hi);
  const min = Math.min(1.2, ...vals) - 0.05, max = Math.max(1.7, ...vals) + 0.05;
  const py = (v) => 220 - ((v - min) / (max - min)) * 190;
  const n = rows.length + (nextBand ? 1 : 0);
  const px = (i) => 60 + (i + 0.5) * ((W - 80) / Math.max(1, n));
  const parts = [];
  for (const v of [1.3, 1.4, 1.5, 1.6, 1.7]) if (v > min && v < max) parts.push(`<line x1="50" y1="${py(v)}" x2="${W - 10}" y2="${py(v)}" stroke="${LINE}"/><text x="42" y="${py(v) + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">${v.toFixed(1)}</text>`);
  rows.forEach((r, i) => {
    const x = px(i);
    if (isFinite(r.lo)) parts.push(`<rect x="${x - 14}" y="${py(r.hi)}" width="28" height="${Math.max(2, py(r.lo) - py(r.hi))}" rx="6" fill="${ACCENT}" opacity="0.25"/>`);
    if (isFinite(r.pred)) parts.push(`<line x1="${x - 14}" y1="${py(r.pred)}" x2="${x + 14}" y2="${py(r.pred)}" stroke="${ACCENT}" stroke-width="2"/>`);
    if (isFinite(r.logged)) parts.push(`<circle cx="${x}" cy="${py(r.logged)}" r="6" fill="${INK}"/>`);
    else parts.push(`<text x="${x}" y="${py((min + max) / 2)}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">no TDS</text>`);
    parts.push(`<text x="${x}" y="246" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" fill="${MUTED}">${esc(r.label)}</text>`);
  });
  if (nextBand) {
    const x = px(rows.length);
    parts.push(`<rect x="${x - 14}" y="${py(nextBand.hi)}" width="28" height="${Math.max(2, py(nextBand.lo) - py(nextBand.hi))}" rx="6" fill="${ACCENT}" opacity="0.45"/><text x="${x}" y="246" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="13" font-weight="600" fill="${INK}">Next · ± ${f2((nextBand.hi - nextBand.lo) / 2)}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Cup strength brew by brew">${parts.join('')}</svg>`;
}

export function rangeBars(params, W = 760) {
  const rowH = 40;
  const H = params.length * rowH + 10;
  const parts = [];
  params.forEach((p, i) => {
    const y = 20 + i * rowH;
    const lo = p.prior[0], hi = p.prior[1];
    const log = lo > 0 && hi / lo > 10;
    const x = (v) => 230 + ((log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo)) * 380);
    parts.push(`<text x="0" y="${y + 6}" font-family="IBM Plex Sans, sans-serif" font-size="14" fill="${INK}">${esc(p.label)}</text>`);
    parts.push(`<rect x="230" y="${y - 6}" width="380" height="12" rx="6" fill="${LINE}"/>`);
    if (p.before && isFinite(p.before[0])) parts.push(`<rect x="${x(p.before[0])}" y="${y - 6}" width="${Math.max(3, x(p.before[1]) - x(p.before[0]))}" height="12" rx="6" fill="#A99C8A"/>`);
    if (isFinite(p.lo)) parts.push(`<rect x="${x(p.lo)}" y="${y - 6}" width="${Math.max(3, x(p.hi) - x(p.lo))}" height="12" rx="6" fill="${ACCENT}"/>`);
    parts.push(`<text x="640" y="${y + 5}" font-family="IBM Plex Mono, monospace" font-size="13" fill="${INK}">${esc(p.text)}</text>`);
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="What got pinned down">${parts.join('')}</svg>`;
}

export function psdChart(sauter, spread, fines, W = 300, H = 170) {
  // Log-normal mass distribution, drawn from the grind inputs. Illustrative shape; the numbers are the inputs.
  const parts = [];
  const xs = [];
  for (let i = 0; i <= 60; i++) { const d = 10 * Math.pow(100, i / 60); const z = Math.log(d / sauter) / Math.log(spread); xs.push([d, Math.exp(-0.5 * z * z)]); }
  const px = (d) => (Math.log10(d) - 1) / 2 * (W - 10) + 4;
  const py = (v) => 120 - v * 100;
  parts.push(`<path d="M ${px(10)} 120 ${xs.map(([d, v]) => `L ${px(d).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')} L ${px(1000)} 120 Z" fill="${ACCENT}" opacity="0.15"/>`);
  parts.push(`<polyline points="${xs.map(([d, v]) => `${px(d).toFixed(1)},${py(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="2"/>`);
  parts.push(`<line x1="${px(100)}" y1="20" x2="${px(100)}" y2="120" stroke="${INK}" stroke-dasharray="4 4"/>`);
  parts.push(`<line x1="4" y1="120" x2="${W - 4}" y2="120" stroke="${LINE}"/>`);
  parts.push(`<text x="${W - 6}" y="14" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="12" fill="${INK}">Sauter ${f0(sauter)} µm</text>`);
  for (const [d, l] of [[10, '10'], [100, '100'], [1000, '1000 µm']]) parts.push(`<text x="${px(d)}" y="140" text-anchor="${d === 1000 ? 'end' : d === 10 ? 'start' : 'middle'}" font-family="IBM Plex Mono, monospace" font-size="11" fill="${MUTED}">${l}</text>`);
  parts.push(`<text x="4" y="160" font-family="IBM Plex Sans, sans-serif" font-size="12" fill="${ACCENT}">Fines, under 100 µm: ${f0(fines * 100)}% by mass</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" class="svgbox" role="img" aria-label="Grind distribution">${parts.join('')}</svg>`;
}
