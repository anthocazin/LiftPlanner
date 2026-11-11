// Catalogue registry (built-in + user inventory) and automatic selection rules.
import { BUILTIN_CATALOG, ROUNDSLING_STD_LENGTHS, WIRE_STD_LENGTHS, SLING_MODE_FACTORS, GREEN_PIN_SIDE_LOAD, DEFAULT_SHACKLE_RANGES, SLING_FAMILIES, CHAIN_FAMILIES } from './data.js';

let userItems = [];

/** Replace the user inventory (certified equipment from your own store). */
export function setUserCatalog(items) {
  userItems = Array.isArray(items) ? items.map((it) => ({ ...it, user: true })) : [];
}
export function getUserCatalog() {
  return userItems;
}
export function allItems() {
  return [...userItems, ...BUILTIN_CATALOG];
}
export function getItem(id) {
  if (!id) return null;
  return allItems().find((it) => it.id === id) || null;
}
export function listByType(type) {
  return allItems().filter((it) => it.type === type);
}

const FAMILY_TYPE = { 'RS-PES': 'roundsling', 'RS-UHMWPE': 'roundsling', WIRE: 'wiresling', 'WIRE-ENDLESS': 'wiresling', GROMMET: 'grommet', WEB: 'webbing' };
export const isSlingType = (t) => ['roundsling', 'wiresling', 'grommet', 'webbing'].includes(t);

/** Items of a sling family (user items without a family are matched on their type). */
export function listSlingFamily(family) {
  const type = FAMILY_TYPE[family] || 'roundsling';
  return allItems().filter((it) => (it.family ? it.family === family : it.user && it.type === type));
}
export { SLING_FAMILIES, CHAIN_FAMILIES };

const t1 = (v) => (v == null ? '?' : Number(v) >= 10 ? String(Math.round(Number(v) * 10) / 10) : String(Math.round(Number(v) * 100) / 100));

/**
 * Short, plain name of an item: "Shackle 17t", "Roundsling 8t", "Chain Ø13 G80", "Masterlink 31.5t".
 * User inventory items keep their own name.
 */
export function niceName(item, { length_m = null, links = null } = {}) {
  if (!item) return '—';
  if (item.user && item.name) return item.name;
  const w = `${t1(item.wll_t)}t`;
  const len = links ? ` — ${links} links` : length_m != null ? ` — ${Math.round(length_m * 100) / 100} m` : '';
  switch (item.type) {
    case 'shackle': return `Shackle ${w}${item.wideBody ? ' wide body' : ''}`;
    case 'roundsling': return `Roundsling ${w}${item.family === 'RS-UHMWPE' ? ' UHMWPE' : ''}${len}`;
    case 'wiresling': return `Wire sling Ø${item.dims?.ropeDia || '?'}${item.family === 'WIRE-ENDLESS' ? ' endless' : ''}${len}`;
    case 'grommet': return `Grommet ${w}${len}`;
    case 'webbing': return `Webbing sling ${w}${len}`;
    case 'chain': return `Chain Ø${item.dims?.dia} G${item.grade}${len}`;
    case 'connlink': return `Connecting link Ø${(item.chainDias || []).join('/')} G${item.grade || 80}`;
    case 'glink': return `G-Link ${w}`;
    case 'masterlink': return item.sub ? `Quad masterlink ${w}` : String(item.id).endsWith('#sub') || item.integrated ? `Sub-link ${w}` : `Masterlink ${w}`;
    case 'padeye': return `Pad eye ${w}`;
    default: return item.short || item.name || '—';
  }
}

export function listPadeyes() {
  return allItems().filter((it) => it.type === 'padeye');
}

/** Length elements: slings (any family) and chains. */
export const isLengthType = (t) => isSlingType(t) || t === 'chain';

export function listChainFamily(family = 'CH-G80') {
  return allItems().filter((it) => it.type === 'chain' && (it.family ? it.family === family : it.user));
}

/** Smallest chain of the family with sufficient WLL for the hitch (choke ×0.8). */
export function selectChain(requiredWll_t, mode = 'direct', family = 'CH-G80') {
  const f = slingModeFactor(mode);
  return listChainFamily(family).sort(byWll).find((c) => c.wll_t * f >= requiredWll_t) || null;
}

/** Connecting link: same grade and size as the chain when there is one, otherwise by WLL. */
export function selectConnlink(requiredWll_t, chain = null, grade = 80) {
  const g = chain?.grade || grade;
  const cands = listByType('connlink').filter((c) => (c.grade || 80) === g).sort(byWll);
  if (chain?.dims?.dia) {
    const exact = cands.find((c) => (c.chainDias || []).includes(chain.dims.dia) && c.wll_t >= requiredWll_t);
    if (exact) return exact;
  }
  return cands.find((c) => c.wll_t >= requiredWll_t) || null;
}

/** Chain: number of links for a required effective length (rounded to the nearest link, ≥ 1). */
export function chainLinks(chain, required_m, round = 'nearest') {
  const p = (chain?.dims?.pitch || 0) / 1000;
  if (!(p > 0)) return { n: 0, length_m: 0 };
  const raw = Math.max(required_m, p) / p;
  const n = Math.max(1, round === 'down' ? Math.floor(raw + 1e-9) : round === 'up' ? Math.ceil(raw - 1e-9) : Math.round(raw));
  return { n, length_m: n * p, overall_m: n * p + 2 * (chain.dims.dia || 0) / 1000, pitch_m: p };
}

/**
 * EN 818-4 / EN 13414-1 / EN 1492 "uniform load" method: WLL of a multi-leg sling set =
 * K × WLL of one leg. β = largest angle of a leg to the vertical.
 * 1 leg: 1 · 2 legs: 1.4 (β ≤ 45°), 1.0 (45° < β ≤ 60°) · 3 and 4 legs: 2.1 (β ≤ 45°), 1.5 (45° < β ≤ 60°).
 * β > 60°: not allowed. Returns null when not allowed.
 */
export function enModeFactor(nLegs, betaDeg) {
  if (betaDeg > 60 + 1e-9) return null;
  if (nLegs <= 1) return 1;
  const low = betaDeg <= 45 + 1e-9;
  if (nLegs === 2) return low ? 1.4 : 1.0;
  return low ? 2.1 : 1.5;
}

/**
 * Green Pin side-load reduction (DS Levage / Green Pin curve, angle from the shackle plane).
 * 0° 100 % · 45° 70 % · 90° 50 %, interpolated along the published curve.
 */
export function shackleSideLoadFactor(angleDeg) {
  const a = Math.min(90, Math.max(0, Math.abs(angleDeg || 0)));
  for (let i = 1; i < GREEN_PIN_SIDE_LOAD.length; i++) {
    const [a1, p1] = GREEN_PIN_SIDE_LOAD[i];
    if (a <= a1) {
      const [a0, p0] = GREEN_PIN_SIDE_LOAD[i - 1];
      return (p0 + ((p1 - p0) * (a - a0)) / (a1 - a0)) / 100;
    }
  }
  return 0.5;
}

export function slingModeFactor(mode) {
  return (SLING_MODE_FACTORS[mode] || SLING_MODE_FACTORS.direct).factor;
}

/**
 * Contribution (m) of a component to the effective length of a leg, bearing point to bearing point.
 *  - shackle, pin in a hole (padeye, lug): hole centre to inside of bow → f + ½ pin Ø
 *  - shackle, pin bearing on a link (master link, sub-link, hook): f + pin Ø
 *  - master link / sub-link: inside length
 *  - G-Link: effective length
 */
export function connectorLength(item, role = 'hole') {
  if (!item || !item.dims) return 0;
  const d = item.dims;
  switch (item.type) {
    case 'shackle':
      return ((d.insideLength || 0) + (d.pinDia || 0) * (role === 'link' ? 1 : 0.5)) / 1000;
    case 'masterlink':
      return (d.insideLength || 0) / 1000;
    case 'glink':
    case 'connlink':
      return (d.effLength || 0) / 1000;
    default:
      return (d.effLength || 0) / 1000;
  }
}

export function itemWeight_t(item, length_m = 0) {
  if (!item) return 0;
  if (isSlingType(item.type) || item.type === 'chain') {
    if (item.weight_kg != null && item.length_m) return item.weight_kg / 1000;
    return ((item.weight_kg_per_m || 0) * (length_m || 0)) / 1000;
  }
  return (item.weight_kg || 0) / 1000;
}

const byWll = (a, b) => a.wll_t - b.wll_t || (a.user ? -1 : 1);

/**
 * Shackle ↔ padeye ↔ sling compatibility. Returns a list of issues.
 * rules: { maxHoleClearance_mm, maxHoleClearance_pct, minThicknessRatio }
 */
export function shackleCompatibility(shackle, { holeDia, padeyeThk, padeyeRadius, slingWidth, slingThk } = {}, rules = {}) {
  const issues = [];
  if (!shackle || !shackle.dims) return issues;
  const d = shackle.dims;
  const maxClr = Math.max(rules.maxHoleClearance_mm ?? 3, ((rules.maxHoleClearance_pct ?? 4) / 100) * (d.pinDia || 0));
  if (holeDia) {
    if (d.pinDia > holeDia) issues.push({ level: 'fail', code: 'pin>hole', msg: `Pin Ø${d.pinDia} > hole Ø${holeDia} mm: the shackle does not fit` });
    else if (holeDia - d.pinDia > maxClr)
      issues.push({ level: 'warn', code: 'clearance', msg: `Hole/pin clearance ${(holeDia - d.pinDia).toFixed(1)} mm > ${maxClr.toFixed(1)} mm allowed` });
    else if (rules.maxHoleRatio > 0 && holeDia > rules.maxHoleRatio * d.pinDia + 1e-9)
      issues.push({ level: 'warn', code: 'hole-ratio', msg: `Hole Ø${holeDia} > ${Math.round(rules.maxHoleRatio * 100)} % of pin Ø${d.pinDia} mm (pad eye rule)` });
  }
  if (padeyeThk) {
    if (padeyeThk >= d.jawWidth) issues.push({ level: 'fail', code: 'thk>jaw', msg: `Padeye thickness ${padeyeThk} ≥ shackle jaw width ${d.jawWidth} mm` });
    else if (padeyeThk / d.jawWidth < (rules.minThicknessRatio ?? 0.75))
      issues.push({
        level: 'warn',
        code: 'thk-ratio',
        msg: `Padeye thickness / jaw width = ${(padeyeThk / d.jawWidth).toFixed(2)} < ${rules.minThicknessRatio ?? 0.75} (fit spacers / cheek plates)`,
      });
  }
  if (padeyeRadius && d.insideLength) {
    // material above the hole (pin bearing at the top of the hole) + what sits in the bow
    const above = padeyeRadius - (holeDia || d.pinDia || 0) / 2;
    const need = above + (slingThk || 0);
    if (need > d.insideLength)
      issues.push({ level: 'fail', code: 'radius', msg: `Padeye material above the hole (${above.toFixed(0)} mm${slingThk ? ` + ${slingThk} mm in the bow` : ''}) > shackle inside length ${d.insideLength} mm` });
  }
  if (slingWidth && d.bowWidth && slingWidth > d.bowWidth)
    issues.push({
      level: 'info',
      code: 'sling-width',
      msg: `Sling width (typ.) ${slingWidth} mm > inside bow width ${d.bowWidth} mm: sling bunched in the bow — check the manufacturer's recommendation (wide body shackle)`,
    });
  return issues;
}

/** Smallest shackle with sufficient WLL that is compatible (no blocking issue). */
export function selectShackle(requiredWll_t, ctx = {}, rules = {}, ranges = null) {
  const fams = ranges || rules.shackleRanges || DEFAULT_SHACKLE_RANGES;
  const cands = listByType('shackle')
    .filter((s) => fams.includes(s.family || s.model) || (s.user && !s.family))
    .sort(byWll);
  let firstOk = null;
  for (const s of cands) {
    if (s.wll_t < requiredWll_t) continue;
    const issues = shackleCompatibility(s, ctx, rules);
    if (issues.some((i) => i.level === 'fail')) continue;
    if (!firstOk) firstOk = s;
    // excessive hole/pin clearance: prefer a larger size whose pin matches the hole better
    if (!issues.some((i) => i.code === 'clearance' || i.code === 'hole-ratio')) return s;
  }
  return firstOk || cands.filter((s) => s.wll_t >= requiredWll_t)[0] || null;
}

/** Smallest sling of the given family with sufficient WLL for the hitch. */
export function selectSling(requiredWll_t, mode = 'direct', family = 'RS-PES') {
  const f = slingModeFactor(mode);
  return listSlingFamily(family).sort(byWll).find((s) => s.wll_t * f >= requiredWll_t) || null;
}

/**
 * Smallest master link with sufficient WLL whose inside width takes the slings.
 * We accept going up `maxUpsize` sizes above the minimum to fit the slings; beyond that the
 * minimum size is kept and the check reports the congestion.
 * opts.assembly: true → only links with integrated sub-links; false → only plain links.
 */
export function selectMasterlink(requiredWll_t, minInsideWidth_mm = 0, maxUpsize = 2, opts = {}) {
  let ok = listByType('masterlink').sort(byWll).filter((m) => m.wll_t >= requiredWll_t);
  if (opts.assembly === true) ok = ok.filter((m) => m.sub);
  if (opts.assembly === false) ok = ok.filter((m) => !m.sub);
  if (opts.families?.length) ok = ok.filter((m) => opts.families.includes(m.family) || m.user);
  const widthOk = (m) => (opts.assembly ? (m.sub?.insideWidth || 0) >= (opts.subWidth || 0) : true) && (m.dims?.insideWidth || 0) >= minInsideWidth_mm;
  return ok.slice(0, maxUpsize + 1).find(widthOk) || ok[0] || null;
}

export function selectGlink(requiredWll_t, slingWidth_mm = 0) {
  const cands = listByType('glink').sort(byWll);
  return cands.find((g) => g.wll_t >= requiredWll_t && (g.dims?.maxSlingWidth || 0) >= slingWidth_mm) || null;
}

/** Standard length (EWL): nearest, or nearest above if upOnly. */
export function standardLength(required_m, lengths = ROUNDSLING_STD_LENGTHS, upOnly = false) {
  if (!(required_m > 0)) return lengths[0];
  if (upOnly) return lengths.find((l) => l >= required_m - 1e-6) ?? lengths[lengths.length - 1];
  return lengths.reduce((best, l) => (Math.abs(l - required_m) < Math.abs(best - required_m) ? l : best), lengths[0]);
}

/** Bending ratio D/d of a wire rope sling or grommet over its bearing (shackle bow or pin). */
export function bendingRatio(sling, bearingDia_mm) {
  if (!sling || !['wiresling', 'grommet'].includes(sling.type)) return null;
  const d = sling.dims?.ropeDia || sling.dims?.width;
  if (!(d > 0) || !(bearingDia_mm > 0)) return null;
  return bearingDia_mm / d;
}

export { ROUNDSLING_STD_LENGTHS, WIRE_STD_LENGTHS };
