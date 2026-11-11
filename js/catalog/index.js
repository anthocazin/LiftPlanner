// Registre du catalogue (intégré + inventaire utilisateur) et règles de sélection automatique.
import { BUILTIN_CATALOG, ROUNDSLING_STD_LENGTHS, SLING_MODE_FACTORS } from './data.js';

let userItems = [];

/** Remplace l'inventaire utilisateur (matériel certifié de votre parc). */
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

/** Facteur de réduction de WLL d'une manille chargée hors plan (Green Pin / Crosby : 0° 100 %, 45° 70 %, 90° 50 %). */
export function shackleSideLoadFactor(angleDeg) {
  const a = Math.min(90, Math.max(0, Math.abs(angleDeg || 0)));
  if (a <= 45) return 1 - (0.3 * a) / 45;
  return 0.7 - (0.2 * (a - 45)) / 45;
}

export function slingModeFactor(mode) {
  return (SLING_MODE_FACTORS[mode] || SLING_MODE_FACTORS.direct).factor;
}

/**
 * Contribution (m) d'un composant à la longueur effective d'une jambe, de point d'appui à point d'appui.
 *  - manille, axe dans un trou (padeye / lug) : du centre du trou au fond de l'arc → f + ½ Ø axe
 *  - manille, axe en appui sur un anneau (masterlink, sous-anneau, crochet) : f + Ø axe
 *  - masterlink / sous-anneau : longueur intérieure
 *  - G-Link : longueur utile
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
      return (d.effLength || 0) / 1000;
    default:
      return (d.effLength || 0) / 1000;
  }
}

export function itemWeight_t(item, length_m = 0) {
  if (!item) return 0;
  if (item.type === 'roundsling' || item.type === 'wiresling') {
    if (item.weight_kg != null && item.length_m) return item.weight_kg / 1000;
    return ((item.weight_kg_per_m || 0) * (length_m || 0)) / 1000;
  }
  return (item.weight_kg || 0) / 1000;
}

const byWll = (a, b) => a.wll_t - b.wll_t || (a.user ? -1 : 1);

/**
 * Vérifie la compatibilité manille ↔ padeye ↔ élingue. Retourne une liste de problèmes.
 * rules : { maxHoleClearance_mm, maxHoleClearance_pct, minThicknessRatio }
 */
export function shackleCompatibility(shackle, { holeDia, padeyeThk, padeyeRadius, slingWidth, slingThk } = {}, rules = {}) {
  const issues = [];
  if (!shackle || !shackle.dims) return issues;
  const d = shackle.dims;
  const maxClr = Math.max(rules.maxHoleClearance_mm ?? 3, ((rules.maxHoleClearance_pct ?? 4) / 100) * (d.pinDia || 0));
  if (holeDia) {
    if (d.pinDia > holeDia) issues.push({ level: 'fail', code: 'pin>hole', msg: `Axe Ø${d.pinDia} > trou Ø${holeDia} mm : la manille n'entre pas` });
    else if (holeDia - d.pinDia > maxClr)
      issues.push({ level: 'warn', code: 'clearance', msg: `Jeu trou/axe ${(holeDia - d.pinDia).toFixed(1)} mm > ${maxClr.toFixed(1)} mm admis` });
  }
  if (padeyeThk) {
    if (padeyeThk >= d.jawWidth) issues.push({ level: 'fail', code: 'thk>jaw', msg: `Épaisseur padeye ${padeyeThk} ≥ ouverture manille ${d.jawWidth} mm` });
    else if (padeyeThk / d.jawWidth < (rules.minThicknessRatio ?? 0.75))
      issues.push({
        level: 'warn',
        code: 'thk-ratio',
        msg: `Épaisseur padeye / ouverture = ${(padeyeThk / d.jawWidth).toFixed(2)} < ${rules.minThicknessRatio ?? 0.75} (prévoir entretoises / cheek plates)`,
      });
  }
  if (padeyeRadius && d.insideLength) {
    const need = padeyeRadius + (slingThk || 0);
    if (need > d.insideLength + (d.pinDia || 0) / 2)
      issues.push({ level: 'fail', code: 'radius', msg: `Rayon padeye + épaisseur élingue (${need} mm) > longueur intérieure manille` });
  }
  if (slingWidth && d.bowWidth && slingWidth > d.bowWidth)
    issues.push({
      level: 'info',
      code: 'sling-width',
      msg: `Largeur élingue (typ.) ${slingWidth} mm > largeur intérieure de l'arc ${d.bowWidth} mm : élingue resserrée dans l'arc — vérifier la recommandation fabricant (manille à large arc / sling shackle)`,
    });
  return issues;
}

/** Plus petite manille de WLL suffisante et compatible (pas d'échec bloquant). */
export function selectShackle(requiredWll_t, ctx = {}, rules = {}, families = ['G-4163', 'P-6036']) {
  const cands = listByType('shackle')
    .filter((s) => families.includes(s.model) || s.user)
    .sort(byWll);
  let firstOk = null;
  for (const s of cands) {
    if (s.wll_t < requiredWll_t) continue;
    const issues = shackleCompatibility(s, ctx, rules);
    if (issues.some((i) => i.level === 'fail')) continue;
    if (!firstOk) firstOk = s;
    // Jeu trou/axe excessif : on préfère une taille supérieure dont l'axe correspond mieux au trou
    if (!issues.some((i) => i.code === 'clearance')) return s;
  }
  return firstOk || cands.filter((s) => s.wll_t >= requiredWll_t)[0] || null;
}

/** Plus petite élingue ronde de WLL suffisante pour le mode d'élingage. */
export function selectRoundsling(requiredWll_t, mode = 'direct', opts = {}) {
  const f = slingModeFactor(mode);
  const cands = listByType('roundsling').sort(byWll);
  return (
    cands.find((s) => s.wll_t * f >= requiredWll_t && (!opts.length_m || !s.length_m || Math.abs(s.length_m - opts.length_m) < 0.01)) ||
    null
  );
}

/** Plus petit masterlink de WLL suffisante dont la largeur intérieure accepte les élingues. */
export function selectMasterlink(requiredWll_t, minInsideWidth_mm = 0, maxUpsize = 2) {
  // on accepte de monter de `maxUpsize` tailles au-delà du mini en WLL pour loger les élingues ;
  // au-delà, on garde la taille mini et la vérification signale l'encombrement.
  const ok = listByType('masterlink').sort(byWll).filter((m) => m.wll_t >= requiredWll_t);
  return ok.slice(0, maxUpsize + 1).find((m) => (m.dims?.insideWidth || 0) >= minInsideWidth_mm) || ok[0] || null;
}

export function selectGlink(requiredWll_t, slingWidth_mm = 0) {
  const cands = listByType('glink').sort(byWll);
  return cands.find((g) => g.wll_t >= requiredWll_t && (g.dims?.maxSlingWidth || 0) >= slingWidth_mm) || null;
}

/** Longueur standard (EWL) : la plus proche, ou la plus proche par excès si upOnly. */
export function standardLength(required_m, lengths = ROUNDSLING_STD_LENGTHS, upOnly = false) {
  if (!(required_m > 0)) return lengths[0];
  if (upOnly) return lengths.find((l) => l >= required_m - 1e-6) ?? lengths[lengths.length - 1];
  return lengths.reduce((best, l) => (Math.abs(l - required_m) < Math.abs(best - required_m) ? l : best), lengths[0]);
}

export { ROUNDSLING_STD_LENGTHS };
