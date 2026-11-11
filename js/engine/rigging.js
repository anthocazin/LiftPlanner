// Résolution du gréement : géométrie des jambes, sélection du matériel, efforts.
// Conventions : coordonnées en m dans le repère de la pièce (X longueur, Y largeur, Z vers le haut),
// efforts en t (tonnes-force). Le crochet est supposé à la verticale du COG (charge libre).
import { v3, vsub, vlen, vnorm, hdist, deg, rad } from './vec.js';
import { legTensions, distributeVertical } from './statics.js';
import { estimateTilt } from './equilibrium.js';
import { resolveFactors } from './factors.js';
import {
  getItem,
  selectShackle,
  selectRoundsling,
  selectMasterlink,
  selectGlink,
  connectorLength,
  itemWeight_t,
  standardLength,
  shackleSideLoadFactor,
} from '../catalog/index.js';

const mm = (v) => (Number(v) || 0) / 1000;
const isAuto = (id) => !id || id === 'auto';
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export const DEFAULT_LEG = {
  slingId: 'auto',
  length_m: null,
  lockLength: false,
  mode: 'direct',
  bottomShackleId: 'auto',
  topConnector: 'direct',
  topConnectorId: 'auto',
};

export function usedLiftPoints(load) {
  return (load?.liftPoints || [])
    .filter((p) => p.used !== false)
    .map((p) => ({ ...p, pos: v3(mm(p.x), mm(p.y), mm(p.z)) }));
}

export function loadWeightWithContingency(load) {
  const w = Number(load?.weight_t) || 0;
  const wcf = Number(load?.wcf) > 0 ? Number(load.wcf) : 1;
  return w * wcf;
}

export function cogM(load) {
  const c = load?.cog_mm || {};
  return v3(mm(c.x), mm(c.y), mm(c.z));
}

/** Angle (°) entre la direction de l'élingue et le plan du padeye (azimut du plan en ° / axe X). */
export function outOfPlaneAngle(u, azimuthDeg) {
  if (azimuthDeg == null || azimuthDeg === '' || !isFinite(Number(azimuthDeg))) return null;
  const a = rad(Number(azimuthDeg));
  const n = { x: -Math.sin(a), y: Math.cos(a) }; // normale horizontale au plan du padeye
  const s = Math.abs(u.x * n.x + u.y * n.y);
  return deg(Math.asin(Math.min(1, s)));
}

/** Variantes de COG pour l'enveloppe ± dx, ± dy (m). */
function cogVariants(cog, env) {
  const dx = mm(env?.dx), dy = mm(env?.dy);
  const list = [cog];
  if (dx > 0 || dy > 0) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) list.push(v3(cog.x + sx * dx, cog.y + sy * dy, cog.z));
  }
  return list;
}

/** Tensions statiques maximales sur l'enveloppe de COG (crochet toujours à la verticale du COG). */
function envelopeTensions(zTop, pts, W, cog, env) {
  const nominal = legTensions(v3(cog.x, cog.y, zTop), pts, W, cog);
  const T = [...nominal.T];
  const Rmin = [...nominal.R];
  for (const c of cogVariants(cog, env).slice(1)) {
    const t = legTensions(v3(c.x, c.y, zTop), pts, W, c);
    t.T.forEach((v, i) => (T[i] = Math.max(T[i], v)));
    t.R.forEach((v, i) => (Rmin[i] = Math.min(Rmin[i], v)));
  }
  return { ...nominal, Tnom: nominal.T, T, Rmin };
}

/** Réactions verticales nominales / max / min sur l'enveloppe de COG. */
function envelopeReactions(ptsPos, W, cog, env) {
  const R = distributeVertical(ptsPos, cog, W).R;
  const Rmax = [...R];
  const Rmin = [...R];
  for (const c of cogVariants(cog, env).slice(1)) {
    distributeVertical(ptsPos, c, W).R.forEach((v, i) => {
      Rmax[i] = Math.max(Rmax[i], v);
      Rmin[i] = Math.min(Rmin[i], v);
    });
  }
  return { R, Rmax, Rmin };
}

function roundSlingLength(req, mode) {
  if (mode === 'exact') return Math.max(0.1, Math.round(req * 100) / 100);
  return standardLength(req, undefined, mode === 'up' || mode === 'set');
}

/** Choisit (ou reprend) les composants d'une jambe. */
function pickComponents(cfg, F, beta, ctxBottom, ctxTop, rules) {
  const sling = isAuto(cfg.slingId) ? selectRoundsling(F, cfg.mode) : getItem(cfg.slingId);
  const slingWidth = sling?.dims?.width || 0;
  const sf = shackleSideLoadFactor(beta || 0);
  const bottomShackle = isAuto(cfg.bottomShackleId)
    ? selectShackle(F / sf, { ...ctxBottom, slingWidth }, rules)
    : getItem(cfg.bottomShackleId);
  let topConn = null;
  if (cfg.topConnector === 'shackle')
    topConn = isAuto(cfg.topConnectorId) ? selectShackle(F, { ...(ctxTop || {}), slingWidth }, rules) : getItem(cfg.topConnectorId);
  else if (cfg.topConnector === 'glink')
    topConn = isAuto(cfg.topConnectorId) ? selectGlink(F, slingWidth) : getItem(cfg.topConnectorId);
  return { sling, bottomShackle, topConn };
}

function slingLengthFor(cfg, comps, Lreq, roundMode) {
  if (cfg.lockLength && Number(cfg.length_m) > 0) return Number(cfg.length_m);
  if (comps.sling?.length_m) return Number(comps.sling.length_m); // élingue d'inventaire à longueur fixe
  return roundSlingLength(Lreq, roundMode);
}

/** Mode "jeu" : une même longueur standard (arrondie au-dessus de la plus grande requise) pour un groupe de jambes. */
function applyLengthSet(legs, roundMode) {
  if (roundMode !== 'set') return;
  const free = legs.filter((l) => !(l.cfg.lockLength && Number(l.cfg.length_m) > 0) && !l.comps.sling?.length_m);
  if (!free.length) return;
  const maxReq = Math.max(...free.map((l) => l.slingLengthReq));
  const L = standardLength(maxReq, undefined, true);
  free.forEach((l) => {
    l.slingLength = L;
    l.Leff = L + l.hwLength;
  });
}

function legHardwareLength(comps, extra = 0, topRole = 'link') {
  return connectorLength(comps.bottomShackle, 'hole') + connectorLength(comps.topConn, topRole) + extra;
}

function legWeight(leg) {
  return (
    itemWeight_t(leg.comps.sling, leg.slingLength) +
    itemWeight_t(leg.comps.bottomShackle) +
    itemWeight_t(leg.comps.topConn)
  );
}

/** Masterlink (+ sous-anneaux éventuels) et manille de tête. */
function pickHead(rig, legs, Fvert, rules) {
  const ml = rig.masterlink || {};
  const nLegs = legs.length;
  const useSub = !!ml.subLinks && nLegs >= 3;
  let pairs = null;
  let subLink = null;
  let fitWidth = 0;
  // encombrement le long de la barre du masterlink / du crochet
  const widthOf = (leg) => {
    const t = leg.comps.topConn;
    if (!t) return leg.comps.sling?.dims?.width || 0;
    if (t.type === 'shackle') return t.dims?.eyeDia || t.dims?.bowDia || 0;
    return t.dims?.barThk || t.dims?.maxSlingWidth || 0;
  };
  if (rig.headType === 'hook') {
    // élingues / connecteurs directement dans le crochet (pas de masterlink)
    let topShackle = null;
    if (rig.topShackle?.enabled)
      topShackle = isAuto(rig.topShackle.itemId) ? selectShackle(Fvert, {}, rules) : getItem(rig.topShackle.itemId);
    return {
      masterlink: null, subLink: null, pairs: null, useSub: false, topShackle, onHook: true,
      headLen: connectorLength(topShackle, 'link'), subLen: 0,
      fitWidth: legs.reduce((s, l) => s + widthOf(l), 0), weight: itemWeight_t(topShackle),
    };
  }
  if (useSub) {
    // regroupe les jambes deux à deux par azimut autour du crochet
    const sorted = [...legs].sort((a, b) => a.azimuth - b.azimuth);
    pairs = [];
    for (let i = 0; i < sorted.length; i += 2) pairs.push(sorted.slice(i, i + 2));
    const pairLoad = Math.max(...pairs.map((p) => p.reduce((s, l) => s + l.Fdesign * Math.cos(rad(l.angleV)), 0)));
    const pairWidth = Math.max(...pairs.map((p) => p.reduce((s, l) => s + widthOf(l), 0)));
    subLink = isAuto(ml.subLinkItemId) ? selectMasterlink(pairLoad, pairWidth) : getItem(ml.subLinkItemId);
    fitWidth = pairs.length * (subLink?.dims?.stockDia || 0);
  } else {
    fitWidth = legs.reduce((s, l) => s + widthOf(l), 0);
  }
  const masterlink = isAuto(ml.itemId) ? selectMasterlink(Fvert, fitWidth) : getItem(ml.itemId);
  let topShackle = null;
  if (rig.topShackle?.enabled)
    topShackle = isAuto(rig.topShackle.itemId) ? selectShackle(Fvert, {}, rules) : getItem(rig.topShackle.itemId);
  const headLen = connectorLength(masterlink) + connectorLength(topShackle, 'link');
  const subLen = useSub ? connectorLength(subLink) : 0;
  const weight =
    itemWeight_t(masterlink) + itemWeight_t(topShackle) + (useSub ? (pairs?.length || 0) * itemWeight_t(subLink) : 0);
  const pairWidth = useSub ? Math.max(...pairs.map((p) => p.reduce((s, l) => s + widthOf(l), 0))) : 0;
  return { masterlink, subLink, pairs, useSub, topShackle, headLen, subLen, fitWidth, pairWidth, weight };
}

/** Résultat d'une jambe convergente (géométrie finale + efforts). */
function finalizeLeg(leg, top, tens, i, fac, zLegTop) {
  const p = leg.bottom;
  const d = hdist(top, p);
  const h = top.z - p.z;
  const L = vlen(vsub(top, p));
  const u = vnorm(vsub(top, p));
  leg.top = top;
  leg.d = d;
  leg.h = h;
  leg.Lgeom = L;
  leg.angleH = deg(Math.atan2(h, d));
  leg.angleV = 90 - leg.angleH;
  leg.azimuth = deg(Math.atan2(p.y - top.y, p.x - top.x));
  leg.u = u;
  leg.beta = outOfPlaneAngle(u, leg.azimuthPad);
  leg.Tstatic = tens.T[i];
  leg.Tnom = tens.Tnom[i];
  leg.R = tens.R[i];
  leg.Rmin = tens.Rmin[i];
  leg.Fdesign = leg.Tstatic * fac;
  leg.mismatch_mm = zLegTop != null ? (zLegTop - top.z) * 1000 : 0;
  return leg;
}

// ---------------------------------------------------------------------------
// Configuration 1 : crochet direct (élingues 1 à n jambes sur masterlink)
function solveHook(project, ctx) {
  const { pts, W, cog, fac, rules } = ctx;
  const rig = project.rigging;
  const design = rig.design || {};
  const env = project.load.cogEnvelope_mm;
  const n = pts.length;
  const zPadMax = Math.max(...pts.map((p) => p.pos.z));

  // 1) Géométrie de conception : angle cible ou hauteur de crochet imposée
  let zDesign;
  if (design.mode === 'height' && Number(design.hookHeight_m) > 0) zDesign = zPadMax + Number(design.hookHeight_m);
  else {
    const a = rad(Number(design.targetAngle_deg) || 60);
    zDesign = Math.max(...pts.map((p) => p.pos.z + Math.max(hdist(cog, p.pos) * Math.tan(a), 0)));
    if (n === 1 || zDesign - zPadMax < 0.3) zDesign = Math.max(zDesign, zPadMax + (Number(design.minHeight_m) || 1.0));
  }
  const tD = envelopeTensions(zDesign, pts.map((p) => p.pos), W, cog, env);
  const topD = v3(cog.x, cog.y, zDesign);

  // 2) Sélection du matériel par jambe
  let legs = pts.map((p, i) => {
    const cfg = { ...DEFAULT_LEG, ...(rig.legs?.[p.id] || {}) };
    const u = vnorm(vsub(topD, p.pos));
    const beta = outOfPlaneAngle(u, p.azimuth_deg);
    const F = tD.T[i] * fac;
    const comps = pickComponents(
      cfg,
      F,
      beta,
      { holeDia: Number(p.holeDia_mm) || 0, padeyeThk: Number(p.thk_mm) || 0, padeyeRadius: Number(p.radius_mm) || 0 },
      null,
      rules,
    );
    return {
      key: p.id,
      label: `Jambe ${p.id}`,
      level: 'main',
      pointId: p.id,
      point: p,
      bottom: p.pos,
      azimuthPad: p.azimuth_deg,
      cfg,
      comps,
      Fdesign: F,
      angleV: deg(Math.acos(Math.min(1, u.z))),
      azimuth: deg(Math.atan2(p.pos.y - cog.y, p.pos.x - cog.x)),
    };
  });
  const head = pickHead(rig, legs, W * ctx.facHead, rules);

  // 3) Longueurs d'élingues
  legs.forEach((leg) => {
    const inSub = head.useSub ? head.subLen : 0;
    leg.hwLength = legHardwareLength(leg.comps, head.headLen + inSub);
    leg.slingLengthReq = vlen(vsub(topD, leg.bottom)) - leg.hwLength;
    leg.slingLength = slingLengthFor(leg.cfg, leg.comps, leg.slingLengthReq, design.roundLengths || 'set');
    leg.Leff = leg.slingLength + leg.hwLength;
  });
  applyLengthSet(legs, design.roundLengths || 'set');

  // 4) Géométrie réelle : hauteur de crochet donnée par chaque jambe
  const zLeg = legs.map((leg) => {
    const d = hdist(cog, leg.bottom);
    return leg.Leff > d ? leg.bottom.z + Math.sqrt(leg.Leff ** 2 - d ** 2) : null;
  });
  const tooShort = legs.filter((_, i) => zLeg[i] == null).map((l) => l.key);
  const valid = zLeg.filter((z) => z != null);
  const zHook = valid.length ? mean(valid) : zDesign;
  const hook = v3(cog.x, cog.y, zHook);
  const tA = envelopeTensions(zHook, pts.map((p) => p.pos), W, cog, env);
  legs = legs.map((leg, i) => finalizeLeg(leg, hook, tA, i, fac, zLeg[i]));
  // re-vérifie la sélection auto avec les efforts finaux (sécurité si la géométrie a changé)
  legs.forEach((leg) => {
    const F = leg.Fdesign;
    const sf = shackleSideLoadFactor(leg.beta || 0);
    if (isAuto(leg.cfg.slingId) && leg.comps.sling && leg.comps.sling.wll_t < F) leg.comps.sling = selectRoundsling(F, leg.cfg.mode) || leg.comps.sling;
    if (isAuto(leg.cfg.bottomShackleId) && leg.comps.bottomShackle && leg.comps.bottomShackle.wll_t * sf < F)
      leg.comps.bottomShackle =
        selectShackle(F / sf, { holeDia: Number(leg.point.holeDia_mm) || 0, padeyeThk: Number(leg.point.thk_mm) || 0, slingWidth: leg.comps.sling?.dims?.width }, rules) ||
        leg.comps.bottomShackle;
  });

  const rigWeight = legs.reduce((s, l) => s + legWeight(l), 0) + head.weight;
  const tilt = tooShort.length ? null : estimateTilt(legs.map((l) => l.bottom), cog, legs.map((l) => l.Leff));
  return {
    type: 'hook',
    hook,
    legs,
    head,
    tooShort,
    zDesign,
    rigWeight,
    tilt,
    Fvert_design: (W + rigWeight - head.weight) * ctx.facHead,
    riggingHeight: zHook - zPadMax,
    spreader: null,
  };
}

// ---------------------------------------------------------------------------
// Configuration 2 : palonnier (spreader bar) — 2 élingues hautes, 1 ou 2 élingues basses par extrémité
function solveSpreader(project, ctx) {
  const { pts, W, cog, fac, rules } = ctx;
  const rig = project.rigging;
  const sp = rig.spreader || {};
  const design = rig.design || {};
  const env = project.load.cogEnvelope_mm;
  const axis = sp.axis === 'y' ? 'y' : 'x';
  const other = axis === 'x' ? 'y' : 'x';
  const Lbar = Number(sp.length_m) || 0;
  const depth = Number(sp.depth_m) || 0.3;
  const Wbar = Number(sp.weight_t) || 0;

  const groupA = pts.filter((p) => p.pos[axis] < cog[axis]);
  const groupB = pts.filter((p) => p.pos[axis] >= cog[axis]);
  const errors = [];
  if (!groupA.length || !groupB.length) errors.push('Points de levage tous du même côté du COG selon l\'axe du palonnier');
  if (!(Lbar > 0)) errors.push('Longueur entre lugs du palonnier non renseignée');

  const cA = groupA.length ? mean(groupA.map((p) => p.pos[axis])) : cog[axis] - Lbar / 2;
  const cB = groupB.length ? mean(groupB.map((p) => p.pos[axis])) : cog[axis] + Lbar / 2;
  const center = sp.position === 'cog' ? cog[axis] : (cA + cB) / 2;
  const L = Lbar > 0 ? Lbar : Math.abs(cB - cA);
  const mk = (a) => (axis === 'x' ? v3(a, cog.y, 0) : v3(cog.x, a, 0));
  const lugA = mk(center - L / 2);
  const lugB = mk(center + L / 2);
  const groupOf = (p) => (p.pos[axis] < cog[axis] ? 'A' : 'B');

  // ---- élingues basses : conception
  const aBot = rad(Number(sp.bottomTargetAngle_deg) || 60);
  const hMin = Number(sp.minBottomHeight_m) || 1.0;
  const zPadMax = Math.max(...pts.map((p) => p.pos.z));
  let zBotDesign = Math.max(
    ...pts.map((p) => {
      const lug = groupOf(p) === 'A' ? lugA : lugB;
      const d = hdist(lug, p.pos);
      return p.pos.z + Math.max(d * Math.tan(aBot), hMin);
    }),
  );
  const ptsPos = pts.map((p) => p.pos);
  // réactions verticales (nominales et enveloppe COG) — chaque élingue basse va à son propre lug
  const tBotD = envelopeReactions(ptsPos, W, cog, env);
  const Rd = tBotD.Rmax;

  const topLugCtx = { holeDia: Number(sp.topLugHoleDia_mm) || 0, padeyeThk: Number(sp.topLugThk_mm) || 0 };
  const botLugCtx = { holeDia: Number(sp.bottomLugHoleDia_mm) || 0, padeyeThk: Number(sp.bottomLugThk_mm) || 0 };

  let bottomLegs = pts.map((p, i) => {
    const g = groupOf(p);
    const lug = g === 'A' ? lugA : lugB;
    const topPt = v3(lug.x, lug.y, zBotDesign);
    const u = vnorm(vsub(topPt, p.pos));
    const T = u.z > 1e-6 ? Rd[i] / u.z : Infinity;
    const F = T * fac;
    const cfg = { ...DEFAULT_LEG, topConnector: 'shackle', ...(rig.legs?.[p.id] || {}) };
    const beta = outOfPlaneAngle(u, p.azimuth_deg);
    const comps = pickComponents(
      cfg,
      F,
      beta,
      { holeDia: Number(p.holeDia_mm) || 0, padeyeThk: Number(p.thk_mm) || 0, padeyeRadius: Number(p.radius_mm) || 0 },
      botLugCtx,
      rules,
    );
    const hw = legHardwareLength(comps, 0, 'hole'); // manille haute dans le lug bas du palonnier
    const Lreq = vlen(vsub(topPt, p.pos)) - hw;
    const slingLength = slingLengthFor(cfg, comps, Lreq, design.roundLengths || 'set');
    return {
      key: p.id,
      label: `Basse ${p.id}`,
      level: 'bottom',
      group: g,
      pointId: p.id,
      point: p,
      bottom: p.pos,
      azimuthPad: p.azimuth_deg,
      cfg,
      comps,
      hwLength: hw,
      slingLengthReq: Lreq,
      slingLength,
      Leff: slingLength + hw,
      lug: g === 'A' ? lugA : lugB,
    };
  });

  applyLengthSet(bottomLegs, design.roundLengths || 'set');

  // ---- géométrie réelle des élingues basses → élévation du palonnier
  const zBotLeg = bottomLegs.map((leg) => {
    const d = hdist(leg.lug, leg.bottom);
    return leg.Leff > d ? leg.bottom.z + Math.sqrt(leg.Leff ** 2 - d ** 2) : null;
  });
  const tooShort = bottomLegs.filter((_, i) => zBotLeg[i] == null).map((l) => l.key);
  const zBot = mean(zBotLeg.filter((z) => z != null)) || zBotDesign;
  const R = tBotD.R; // réactions verticales nominales
  const RminAll = tBotD.Rmin;
  const Rmax = Rd;
  bottomLegs = bottomLegs.map((leg, i) => {
    const top = v3(leg.lug.x, leg.lug.y, zBot);
    const u = vnorm(vsub(top, leg.bottom));
    const Tn = u.z > 1e-6 ? R[i] / u.z : Infinity;
    const Tm = u.z > 1e-6 ? Rmax[i] / u.z : Infinity;
    const tens = { T: [], Tnom: [], R: [], Rmin: [] };
    tens.T[i] = Tm; tens.Tnom[i] = Tn; tens.R[i] = R[i]; tens.Rmin[i] = RminAll[i];
    return finalizeLeg(leg, top, tens, i, fac, zBotLeg[i]);
  });

  // ---- charges aux extrémités du palonnier
  const botRigW = bottomLegs.reduce((s, l) => s + legWeight(l), 0);
  const end = { A: { V: 0, Vmax: 0, Hx: 0, Hy: 0 }, B: { V: 0, Vmax: 0, Hx: 0, Hy: 0 } };
  bottomLegs.forEach((l, i) => {
    end[l.group].V += R[i];
    end[l.group].Vmax += Rmax[i];
    end[l.group].Hx += -l.Tnom * l.u.x;
    end[l.group].Hy += -l.Tnom * l.u.y;
  });
  const VA = end.A.V + Wbar / 2 + botRigW / 2;
  const VB = end.B.V + Wbar / 2 + botRigW / 2;
  const VAm = end.A.Vmax + Wbar / 2 + botRigW / 2;
  const VBm = end.B.Vmax + Wbar / 2 + botRigW / 2;
  const zTopLug = zBot + depth;
  const hookPlanA = (VA * lugA[axis] + VB * lugB[axis]) / Math.max(VA + VB, 1e-9);
  const hookPlan = axis === 'x' ? v3(hookPlanA, cog.y, 0) : v3(cog.x, hookPlanA, 0);

  // ---- élingues hautes : conception
  const aTop = rad(Number(design.targetAngle_deg) || Number(sp.minTopAngle_deg) || 60);
  const dA = Math.abs(hookPlan[axis] - lugA[axis]);
  const dB = Math.abs(lugB[axis] - hookPlan[axis]);
  const zHookDesign = zTopLug + Math.max(dA, dB) * Math.tan(aTop);
  const topKeys = [
    { key: 'TA', lug: lugA, V: VA, Vm: VAm, d: dA },
    { key: 'TB', lug: lugB, V: VB, Vm: VBm, d: dB },
  ];
  let topLegs = topKeys.map((t) => {
    const bottomPt = v3(t.lug.x, t.lug.y, zTopLug);
    const topPt = v3(hookPlan.x, hookPlan.y, zHookDesign);
    const u = vnorm(vsub(topPt, bottomPt));
    const F = (t.Vm / Math.max(u.z, 1e-6)) * fac;
    const cfg = { ...DEFAULT_LEG, ...(rig.legs?.[t.key] || {}) };
    const comps = pickComponents(cfg, F, 0, topLugCtx, null, rules);
    return {
      key: t.key,
      label: `Haute ${t.key === 'TA' ? 'A' : 'B'}`,
      level: 'top',
      group: t.key === 'TA' ? 'A' : 'B',
      bottom: bottomPt,
      azimuthPad: null,
      cfg,
      comps,
      Fdesign: F,
      V: t.V,
      Vm: t.Vm,
      angleV: deg(Math.acos(Math.min(1, u.z))),
      azimuth: deg(Math.atan2(bottomPt.y - hookPlan.y, bottomPt.x - hookPlan.x)),
      lugCtx: topLugCtx,
    };
  });
  const totalV = VA + VB;
  const head = pickHead(rig, topLegs, (VAm + VBm) * ctx.facHead, rules);
  topLegs.forEach((leg) => {
    leg.hwLength = legHardwareLength(leg.comps, head.headLen);
    const topPt = v3(hookPlan.x, hookPlan.y, zHookDesign);
    leg.slingLengthReq = vlen(vsub(topPt, leg.bottom)) - leg.hwLength;
    leg.slingLength = slingLengthFor(leg.cfg, leg.comps, leg.slingLengthReq, design.roundLengths || 'set');
    leg.Leff = leg.slingLength + leg.hwLength;
  });
  applyLengthSet(topLegs, design.roundLengths || 'set');
  const zTopLeg = topLegs.map((leg) => {
    const d = hdist(hookPlan, leg.bottom);
    return leg.Leff > d ? leg.bottom.z + Math.sqrt(leg.Leff ** 2 - d ** 2) : null;
  });
  topLegs.filter((_, i) => zTopLeg[i] == null).forEach((l) => tooShort.push(l.key));
  const zHook = mean(zTopLeg.filter((z) => z != null)) || zHookDesign;
  const hook = v3(hookPlan.x, hookPlan.y, zHook);
  topLegs = topLegs.map((leg, i) => {
    const u = vnorm(vsub(hook, leg.bottom));
    const tens = { T: [], Tnom: [], R: [], Rmin: [] };
    tens.T[i] = leg.Vm / Math.max(u.z, 1e-6);
    tens.Tnom[i] = leg.V / Math.max(u.z, 1e-6);
    tens.R[i] = leg.V;
    tens.Rmin[i] = leg.V;
    return finalizeLeg(leg, hook, tens, i, fac, zTopLeg[i]);
  });
  // effort axial dans le palonnier (compression) = composante horizontale des élingues hautes
  const compression = Math.max(...topLegs.map((l) => l.Tstatic * Math.cos(rad(l.angleH))));
  const bottomAxial = Math.max(Math.abs(end.A[`H${axis}`]), Math.abs(end.B[`H${axis}`]));
  const bottomLateral = Math.max(Math.abs(end.A[`H${other}`]), Math.abs(end.B[`H${other}`]));

  const legs = [...topLegs, ...bottomLegs];
  const rigWeight = legs.reduce((s, l) => s + legWeight(l), 0) + head.weight + Wbar;
  return {
    type: 'spreader',
    hook,
    legs,
    head,
    tooShort,
    errors,
    rigWeight,
    Fvert_design: (totalV + topLegs.reduce((s, l) => s + legWeight(l), 0)) * ctx.facHead,
    tilt: null,
    riggingHeight: zHook - zPadMax,
    spreader: {
      axis,
      lugA: v3(lugA.x, lugA.y, zBot),
      lugB: v3(lugB.x, lugB.y, zBot),
      zBot,
      zTop: zTopLug,
      length: L,
      depth,
      weight: Wbar,
      VA,
      VB,
      totalV,
      compression,
      compressionDesign: compression * fac,
      bottomAxial,
      bottomLateral,
      centerOffset: center - cog[axis],
      lugGap: Math.abs(cB - cA) - L,
    },
  };
}

/** Point d'entrée : résout le gréement avec itération sur le poids de gréement (SHL → DAF). */
export function solveRigging(project, rules = {}) {
  const load = project.load || {};
  const pts = usedLiftPoints(load);
  if (!pts.length) return { error: 'Aucun point de levage actif' };
  const W = loadWeightWithContingency(load);
  if (!(W > 0)) return { error: 'Poids de la charge non renseigné' };
  const cog = cogM(load);
  let rigW = 0.03 * W;
  let res = null;
  let f = null;
  for (let it = 0; it < 5; it++) {
    const shl = W + rigW;
    f = resolveFactors(project.factors, project.environment, shl, pts.length);
    const fac = f.daf * f.skl * f.cog * f.extra;
    const facHead = f.daf * f.extra; // charge verticale totale : pas de SKL
    const ctx = { pts, W, cog, fac, facHead, rules };
    res = project.rigging?.type === 'spreader' ? solveSpreader(project, ctx) : solveHook(project, ctx);
    const conv = Math.abs(res.rigWeight - rigW) < 1e-4;
    rigW = res.rigWeight;
    if (conv) break;
  }
  const shl = W + rigW;
  return { ...res, W, cog, pts, factors: f, fac: f.daf * f.skl * f.cog * f.extra, facHead: f.daf * f.extra, shl };
}
