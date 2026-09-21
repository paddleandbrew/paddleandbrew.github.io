// A profile is a reusable slice of the inputs: a bean, a grinder, a brewer, a water or a recipe.
// These helpers move data between a profile record and the inputs the solver reads, and record on
// the inputs which profiles built them, which is what the setup id is derived from.

export const PROFILE_LABEL = { bean: 'Bean', grinder: 'Grinder', brewer: 'Brewer', water: 'Water', recipe: 'Recipe' };
export const PROFILE_HINT = {
  bean: 'roast, extractable yield, agtron, origin',
  grinder: 'a table from setting to Sauter diameter and fines',
  brewer: 'geometry, wall factors, paper',
  water: 'GH, KH and the Mg : Ca ratio',
  recipe: 'dose, pours and the kettle model',
};

// Write a profile's data into the inputs. Grinder profiles are a table, so they set the grind at
// the current setting rather than replacing the grind wholesale.
export function applyProfile(inputs, profile) {
  const d = structuredClone(profile.data);
  switch (profile.kind) {
    case 'bean': inputs.bean = { ...inputs.bean, ...d }; break;
    case 'brewer': inputs.brewer = { ...inputs.brewer, ...d }; break;
    case 'water': inputs.water = { ...inputs.water, ...d }; break;
    case 'recipe': inputs.recipe = d.recipe; if (d.temperature) inputs.temperature = d.temperature; break;
    case 'grinder': {
      const setting = isFinite(inputs.grind.setting) ? inputs.grind.setting : (d.settings[0] || {}).setting || 0;
      inputs.grind = { ...inputs.grind, ...grindAt(d, setting), grinder: profile.name, setting, source: 'grinder_profile' };
      break;
    }
    default: throw new Error(`unknown profile kind ${profile.kind}`);
  }
  inputs.profile_ids = { ...(inputs.profile_ids || {}), [profile.kind]: profile.id };
  return inputs;
}

// The slice of the inputs a profile of this kind would hold, for saving the current setup as one.
export function sliceFor(inputs, kind) {
  switch (kind) {
    case 'bean': return structuredClone(inputs.bean);
    case 'brewer': return structuredClone(inputs.brewer);
    case 'water': return structuredClone(inputs.water);
    case 'recipe': return { recipe: structuredClone(inputs.recipe), temperature: structuredClone(inputs.temperature) };
    case 'grinder': return { burrs: '', spread: inputs.grind.spread, settings: [{ setting: inputs.grind.setting, sauter_um: inputs.grind.sauter_um, fines_frac: inputs.grind.fines_frac }] };
    default: throw new Error(`unknown profile kind ${kind}`);
  }
}

export function defaultName(inputs, kind) {
  switch (kind) {
    case 'bean': return inputs.bean.name || 'Bean';
    case 'brewer': return inputs.brewer.name || 'Brewer';
    case 'water': return inputs.water.kind === 'tap' ? 'Tap + filter' : inputs.water.kind === 'recipe' ? 'Recipe water' : 'Water';
    case 'recipe': return `${inputs.recipe.pours.length} pours, ${inputs.recipe.dose_g} : ${inputs.recipe.pours[inputs.recipe.pours.length - 1]?.water_to_g}`;
    case 'grinder': return inputs.grind.grinder || 'Grinder';
    default: return kind;
  }
}

// Sauter diameter and fines share at a setting, read off the grinder's calibration table. Between
// two rows it interpolates; past either end it holds the end row rather than extrapolating a
// straight line into sizes the grinder cannot make.
export function grindAt(grinder, setting) {
  const rows = (grinder.settings || []).filter((r) => isFinite(r.setting) && isFinite(r.sauter_um)).sort((a, b) => a.setting - b.setting);
  if (!rows.length) return { sauter_um: NaN, fines_frac: NaN, spread: grinder.spread ?? 1.8 };
  const spread = grinder.spread ?? 1.8;
  if (setting <= rows[0].setting) return { sauter_um: rows[0].sauter_um, fines_frac: rows[0].fines_frac, spread };
  const last = rows[rows.length - 1];
  if (setting >= last.setting) return { sauter_um: last.sauter_um, fines_frac: last.fines_frac, spread };
  let hi = rows.findIndex((r) => r.setting >= setting);
  const a = rows[hi - 1], b = rows[hi];
  const f = (setting - a.setting) / (b.setting - a.setting);
  return { sauter_um: a.sauter_um + (b.sauter_um - a.sauter_um) * f, fines_frac: a.fines_frac + (b.fines_frac - a.fines_frac) * f, spread };
}

// One line describing a profile, for lists.
export function summarise(p) {
  const d = p.data || {};
  switch (p.kind) {
    case 'bean': return [d.origin, d.process, d.max_extractable != null ? `max ${Math.round(d.max_extractable * 100)}%` : null, d.roast_days != null ? `${d.roast_days} d off roast` : null].filter(Boolean).join(' · ');
    case 'grinder': return `${(d.settings || []).length} calibrated settings${d.burrs ? ` · ${d.burrs}` : ''}`;
    case 'brewer': return [d.kind && String(d.kind).replace(/_/g, ' '), d.top_diameter_mm ? `ø ${d.top_diameter_mm} mm` : null, d.paper].filter(Boolean).join(' · ');
    case 'water': return `GH ${d.gh_ppm} · KH ${d.kh_ppm} · Mg:Ca ${d.mg_ca}`;
    case 'recipe': return d.recipe ? `${d.recipe.dose_g} g · ${d.recipe.pours.length} pours · ${d.recipe.pours[d.recipe.pours.length - 1]?.water_to_g} g` : '';
    default: return '';
  }
}
