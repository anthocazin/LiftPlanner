// Orchestration du calcul complet d'un lift plan.
import { solveRigging } from './rigging.js';
import { riggingChecks, craneCheck, hookHeightCheck, DEFAULT_RULES, STATUS_ORDER } from './checks.js';
import { setUserCatalog, itemWeight_t } from '../catalog/index.js';

export function buildBOM(rig, project) {
  const lines = new Map();
  const add = (item, qty = 1, opts = {}) => {
    if (!item) return;
    const len = opts.length_m != null ? Math.round(opts.length_m * 100) / 100 : null;
    const key = `${item.id}${len != null ? `@${len}` : ''}`;
    const prev = lines.get(key);
    const unitW = itemWeight_t(item, len || 0);
    if (prev) {
      prev.qty += qty;
      prev.where.push(opts.where);
    } else
      lines.set(key, {
        key,
        item,
        name: item.name + (len != null ? ` — EWL ${len.toFixed(2).replace('.', ',')} m` : ''),
        wll_t: item.wll_t,
        qty,
        unitWeight_t: unitW,
        certNo: item.certNo || '',
        where: [opts.where],
      });
  };
  if (!rig || rig.error) return [];
  for (const leg of rig.legs) {
    add(leg.comps.bottomShackle, 1, { where: leg.label });
    add(leg.comps.sling, 1, { length_m: leg.slingLength, where: leg.label });
    add(leg.comps.topConn, 1, { where: leg.label });
  }
  const h = rig.head;
  if (h) {
    add(h.masterlink, 1, { where: 'Tête' });
    if (h.useSub && h.subLink) add({ ...h.subLink, id: `${h.subLink.id}#sub`, name: `Sous-anneau — ${h.subLink.name}` }, h.pairs.length, { where: 'Tête' });
    add(h.topShackle, 1, { where: 'Tête' });
  }
  const out = [...lines.values()];
  if (rig.spreader) {
    const sp = project.rigging.spreader || {};
    out.push({
      key: 'spreader',
      item: null,
      name: `${sp.name || 'Palonnier'} — entraxe ${rig.spreader.length.toFixed(2)} m`,
      wll_t: Number(sp.wll_t) || null,
      qty: 1,
      unitWeight_t: Number(sp.weight_t) || 0,
      certNo: sp.certNo || '',
      where: ['Palonnier'],
    });
  }
  out.forEach((l, i) => (l.no = i + 1));
  return out;
}

export function worstStatus(checks) {
  return checks.reduce((w, c) => (STATUS_ORDER[c.status] > STATUS_ORDER[w] ? c.status : w), 'ok');
}

/** Calcule tout le projet. */
export function computeProject(project) {
  setUserCatalog(project.inventory || []);
  const rules = { ...DEFAULT_RULES, ...(project.rules || {}) };
  const rig = solveRigging(project, rules);
  const checks = riggingChecks(rig, project, rules);
  const crane = project.crane || {};
  const res = { rig, rules, checks, steps: [], bom: [] };
  if (rig.error) {
    res.status = 'fail';
    return res;
  }
  const hookBlock = Number(crane.hookBlock_t) || 0;
  res.shlStatic = rig.W + rig.rigWeight; // charge + gréement
  res.shlCrane = res.shlStatic + (crane.deductHookBlock !== false ? hookBlock : 0);
  res.dynamicHookLoad = rig.W * rig.factors.daf + rig.rigWeight * rig.factors.daf;
  if (Number(crane.hookSWL_t) > 0) {
    const u = res.shlStatic / Number(crane.hookSWL_t);
    checks.push({
      cat: 'Grue', item: 'Moufle / crochet', label: `SWL crochet ${crane.hookSWL_t} t`, value: round2(res.shlStatic),
      limit: Number(crane.hookSWL_t), unit: 't', util: u, status: u > 1 ? 'fail' : 'ok',
    });
  }

  const zMin = (Number(project.load?.origin_mm?.z) || 0) / 1000;
  const hookAboveBottom = rig.hook.z - zMin; // hauteur crochet → dessous de la charge
  res.hookAboveBottom = hookAboveBottom;
  const steps = project.storyboard?.steps?.length
    ? project.storyboard.steps
    : [{ name: 'Rayon max', radius_m: crane.radius_m, loadElevation_m: null }];
  steps.forEach((st, i) => {
    const R = Number(st.radius_m);
    const label = st.name || `Étape ${i + 1}`;
    if (!(R > 0)) {
      res.steps.push({ step: st, label, checks: [] });
      return;
    }
    const cc = craneCheck(crane, res.shlCrane, R, label);
    let hh = [];
    let requiredHook = null;
    if (st.loadElevation_m != null && st.loadElevation_m !== '') {
      requiredHook = Number(st.loadElevation_m) + hookAboveBottom;
      hh = hookHeightCheck(crane, R, requiredHook, label);
    }
    const stepChecks = [...cc.checks, ...hh];
    checks.push(...stepChecks);
    res.steps.push({ step: st, label, checks: stepChecks, capacity: cc.capacity, boom: cc.boom, requiredHook });
  });

  res.bom = buildBOM(rig, project);
  res.status = worstStatus(checks);
  const utils = checks.filter((c) => c.util != null && isFinite(c.util));
  res.governing = utils.sort((a, b) => b.util - a.util).slice(0, 5);
  const craneUtils = checks.filter((c) => c.cat === 'Grue' && c.util != null);
  res.craneMaxUtil = craneUtils.length ? Math.max(...craneUtils.map((c) => c.util)) : null;
  res.category = liftCategory(res, project);
  return res;
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Catégorie de levage indicative (à adapter à la procédure de l'entreprise). */
export function liftCategory(res, project) {
  const reasons = [];
  const lim = Number(project.crane?.utilLimit) || 0.85;
  if (res.craneMaxUtil != null && res.craneMaxUtil > lim) reasons.push(`utilisation grue > ${(lim * 100).toFixed(0)} %`);
  if (project.flags?.tandem) reasons.push('levage en tandem');
  if (project.flags?.overLive) reasons.push('au-dessus d\'installations en service');
  if (project.flags?.personnel) reasons.push('levage de personnel');
  if (project.flags?.subsea) reasons.push('passage zone de déferlement / sous-marin');
  if (project.environment === 'offshore' && project.flags?.vesselToVessel) reasons.push('transfert navire ↔ navire / plateforme');
  if ((Number(project.load?.weight_t) || 0) >= (Number(project.flags?.heavyThreshold_t) || 50)) reasons.push('charge lourde');
  if (project.rigging?.type === 'spreader') reasons.push('gréement avec palonnier');
  const cat = reasons.length >= 2 || res.craneMaxUtil > 0.95 ? 'Critique / complexe' : reasons.length === 1 ? 'Complexe' : 'Routine';
  return { cat, reasons };
}
