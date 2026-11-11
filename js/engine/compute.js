// Full lift plan calculation.
import { solveRigging } from './rigging.js';
import { riggingChecks, craneCheck, DEFAULT_RULES, STATUS_ORDER } from './checks.js';
import { isLengthPart } from './rigging.js';
import { setUserCatalog, itemWeight_t } from '../catalog/index.js';
import { chartRange } from './crane.js';

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
      if (opts.config && !prev.config.includes(opts.config)) prev.config += ` / ${opts.config}`;
    } else
      lines.set(key, {
        key,
        item,
        name: item.name + (opts.links ? ` — ${opts.links} links (${len.toFixed(3)} m)` : len != null ? ` — EWL ${len.toFixed(2)} m` : ''),
        ewl_m: len,
        links: opts.links || null,
        config: opts.config || '',
        wll_t: item.wll_t,
        qty,
        unitWeight_t: unitW,
        certNo: item.certNo || '',
        where: [opts.where],
      });
  };
  if (!rig || rig.error) return [];
  for (const leg of rig.legs) {
    const n = leg.parts.length;
    leg.parts.forEach((p, i) => {
      const pos = i === 0 ? (leg.level === 'top' ? 'spreader lug' : 'lift point') : i === n - 1 ? (leg.level === 'bottom' ? 'spreader lug' : 'hook side') : 'in line';
      const lvl = leg.level === 'top' ? 'top legs' : leg.level === 'bottom' ? 'bottom legs' : 'legs';
      if (isLengthPart(p))
        add(p.item, 1, { length_m: p.length_m, links: p.kind === 'chain' ? p.links : null, where: leg.label, config: `${lvl}${p.hitch === 'choke' ? ', choked' : ''}` });
      else add(p.item, 1, { where: leg.label, config: `${lvl} — ${pos}` });
    });
  }
  const h = rig.head;
  if (h) {
    add(h.masterlink, 1, { where: 'Head', config: h.integrated ? 'on crane hook, with sub-links' : 'on crane hook' });
    if (h.useSub && h.subLink && !h.integrated)
      add({ ...h.subLink, id: `${h.subLink.id}#sub`, name: `Sub-link — ${h.subLink.name}` }, h.pairs.length, { where: 'Head', config: 'under the master link' });
    add(h.topShackle, 1, { where: 'Head', config: 'crane hook ↔ master link' });
  }
  const out = [...lines.values()];
  if (rig.spreader) {
    const sp = project.rigging.spreader || {};
    out.push({
      key: 'spreader',
      item: null,
      name: `${sp.name || 'Spreader bar'} — lug spacing ${rig.spreader.length.toFixed(2)} m`,
      wll_t: Number(sp.wll_t) || null,
      qty: 1,
      unitWeight_t: Number(sp.weight_t) || 0,
      certNo: sp.certNo || '',
      ewl_m: rig.spreader.length,
      config: 'horizontal, between top and bottom legs',
      where: ['Spreader'],
    });
  }
  out.forEach((l, i) => (l.no = i + 1));
  return out;
}

export function worstStatus(checks) {
  return checks.reduce((w, c) => (STATUS_ORDER[c.status] > STATUS_ORDER[w] ? c.status : w), 'ok');
}

/** Computes the whole project. */
export function computeProject(project) {
  setUserCatalog(project.inventory || []);
  const rules = { ...DEFAULT_RULES, ...(project.rules || {}), ...(project.load?.padeyeRules || {}) };
  const rig = solveRigging(project, rules);
  const checks = riggingChecks(rig, project, rules);
  const crane = project.crane || {};
  const res = { rig, rules, checks, steps: [], bom: [] };
  if (rig.error) {
    res.status = 'fail';
    return res;
  }
  res.shlStatic = rig.W + rig.rigWeight; // load + rigging
  res.shlCrane = res.shlStatic + (Number(crane.extraHookLoad_t) || 0);
  res.dynamicHookLoad = res.shlCrane * rig.factors.daf;
  res.chartRange = chartRange(crane.chart, Number(crane.activeColumn) || 0);

  const zMin = (Number(project.load?.origin_mm?.z) || 0) / 1000;
  const hookAboveBottom = rig.hook.z - zMin; // hook height above the underside of the load
  res.hookAboveBottom = hookAboveBottom;
  // steps placed on the site map: radius and slew from the crane position
  const cr = project.storyboard?.crane || { x: 0, y: 0 };
  (project.storyboard?.steps || []).forEach((st) => {
    if (st.pos && isFinite(st.pos.x) && isFinite(st.pos.y)) {
      st.radius_m = Math.round(Math.hypot(st.pos.x - cr.x, st.pos.y - cr.y) * 100) / 100;
      st.slew_deg = Math.round((Math.atan2(st.pos.y - cr.y, st.pos.x - cr.x) * 180) / Math.PI * 10) / 10;
    }
  });
  const steps = project.storyboard?.steps?.length
    ? project.storyboard.steps
    : [{ name: 'Max radius', radius_m: crane.radius_m, loadElevation_m: null }];
  steps.forEach((st, i) => {
    const R = Number(st.radius_m);
    const label = st.name || `Step ${i + 1}`;
    if (!(R > 0)) {
      res.steps.push({ step: st, label, checks: [] });
      return;
    }
    const cc = craneCheck(crane, res.shlCrane, R, label);
    const requiredHook = st.loadElevation_m != null && st.loadElevation_m !== '' ? Number(st.loadElevation_m) + hookAboveBottom : null;
    checks.push(...cc.checks);
    res.steps.push({ step: st, label, checks: cc.checks, capacity: cc.capacity, requiredHook });
  });

  res.bom = buildBOM(rig, project);
  res.status = worstStatus(checks);
  const utils = checks.filter((c) => c.util != null && isFinite(c.util));
  res.governing = utils.sort((a, b) => b.util - a.util).slice(0, 5);
  const craneUtils = checks.filter((c) => c.cat === 'Crane' && c.util != null);
  res.craneMaxUtil = craneUtils.length ? Math.max(...craneUtils.map((c) => c.util)) : null;
  res.category = liftCategory(res, project);
  return res;
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Indicative lift category (adapt to your company procedure). */
export function liftCategory(res, project) {
  const reasons = [];
  const lim = Number(project.crane?.utilLimit) || 0.85;
  if (res.craneMaxUtil != null && res.craneMaxUtil > lim) reasons.push(`crane utilisation > ${(lim * 100).toFixed(0)} %`);
  const f = project.flags || {};
  if (f.overLive) reasons.push('over live plant');
  if (f.subsea) reasons.push('splash zone / subsea');
  if (f.vesselToVessel) reasons.push('vessel ↔ vessel / platform transfer');
  if (f.quayToVessel) reasons.push('quay → vessel');
  if (f.vesselToQuay) reasons.push('vessel → quay');
  if ((Number(project.load?.weight_t) || 0) >= (Number(project.flags?.heavyThreshold_t) || 50)) reasons.push('heavy load');
  if (project.rigging?.type === 'spreader') reasons.push('spreader bar rigging');
  const cat = reasons.length >= 2 || res.craneMaxUtil > 0.95 ? 'Critical / complex' : reasons.length === 1 ? 'Complex' : 'Routine';
  return { cat, reasons };
}
