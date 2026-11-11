// Rigging solver: leg geometry, leg assemblies, equipment selection, forces.
// Conventions: coordinates in m in the load frame (X length, Y width, Z up), forces in t
// (tonnes-force). The hook is assumed vertically above the COG (freely suspended load).
//
// A leg is an ASSEMBLY: an ordered list of parts from the load (lift point) to the hook, e.g.
//   shackle → connecting link → chain → connecting link → shackle
//   shackle → roundsling → shackle
//   roundsling (choked around the load)
// Exactly one part is the LENGTH ELEMENT (sling or chain): its length is what is left of the
// required bearing-to-bearing length once every connector has been deducted.
import { v3, vsub, vlen, vnorm, hdist, deg, rad } from './vec.js';
import { legTensions, distributeVertical } from './statics.js';
import { estimateTilt } from './equilibrium.js';
import { resolveFactors } from './factors.js';
import {
  getItem,
  selectShackle,
  selectSling,
  selectChain,
  selectConnlink,
  selectMasterlink,
  selectGlink,
  connectorLength,
  itemWeight_t,
  standardLength,
  shackleSideLoadFactor,
  slingModeFactor,
  chainLinks,
  enModeFactor,
  ROUNDSLING_STD_LENGTHS,
  WIRE_STD_LENGTHS,
} from '../catalog/index.js';

const mm = (v) => (Number(v) || 0) / 1000;
const isAuto = (id) => !id || id === 'auto';
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export const PART_KINDS = {
  shackle: 'Shackle',
  connlink: 'Connecting link',
  glink: 'G-Link (Slingmax)',
  sling: 'Sling',
  chain: 'Chain',
};
export const isLengthPart = (p) => p && (p.kind === 'sling' || p.kind === 'chain');

export const DEFAULT_ASSEMBLY = [
  { kind: 'shackle', id: 'auto' },
  { kind: 'sling', family: 'RS-PES', id: 'auto', hitch: 'direct' },
];
export const DEFAULT_ASSEMBLY_TOP = [
  { kind: 'shackle', id: 'auto' },
  { kind: 'sling', family: 'RS-PES', id: 'auto', hitch: 'direct' },
];

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Assembly of a leg: leg override → level default → built-in default. */
export function legAssembly(rig, key, level = 'main') {
  const own = rig?.legs?.[key]?.parts;
  if (Array.isArray(own) && own.length) return clone(own);
  const def = level === 'top' ? rig?.assemblyTop : rig?.assembly;
  if (Array.isArray(def) && def.length) return clone(def);
  return clone(level === 'top' ? DEFAULT_ASSEMBLY_TOP : DEFAULT_ASSEMBLY);
}

export function legOverride(rig, key) {
  return rig?.legs?.[key] || {};
}

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

/** A lift point has a padeye unless explicitly unticked. */
export const hasPadeye = (p) => !!p && p.padeye !== false;

/** Padeye context used for the shackle fit (total thickness = main plate + 2 cheek plates). */
export function padeyeCtx(p) {
  if (!hasPadeye(p)) return {};
  const thk = (Number(p.thk_mm) || 0) + 2 * (Number(p.cheekThk_mm) || 0);
  return { holeDia: Number(p.holeDia_mm) || 0, padeyeThk: thk || 0, padeyeRadius: Number(p.radius_mm) || 0 };
}

/** Angle (°) between the sling direction and the padeye plane (plane azimuth in ° from the X axis). */
export function outOfPlaneAngle(u, azimuthDeg) {
  if (azimuthDeg == null || azimuthDeg === '' || !isFinite(Number(azimuthDeg))) return null;
  const a = rad(Number(azimuthDeg));
  const n = { x: -Math.sin(a), y: Math.cos(a) }; // horizontal normal to the padeye plane
  const s = Math.abs(u.x * n.x + u.y * n.y);
  return deg(Math.asin(Math.min(1, s)));
}

/** COG variants for the ± dx, ± dy envelope (m). */
function cogVariants(cog, env) {
  const dx = mm(env?.dx), dy = mm(env?.dy);
  const list = [cog];
  if (dx > 0 || dy > 0) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) list.push(v3(cog.x + sx * dx, cog.y + sy * dy, cog.z));
  }
  return list;
}

/** Maximum static tensions over the COG envelope (hook always above the COG). */
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

/** Nominal / max / min vertical reactions over the COG envelope. */
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

const stdLengths = (item) => item?.lengths || (item && ['wiresling', 'grommet'].includes(item.type) ? WIRE_STD_LENGTHS : ROUNDSLING_STD_LENGTHS);

function roundSlingLength(req, mode, lengths) {
  if (mode === 'exact') return Math.max(0.1, Math.round(req * 100) / 100);
  return standardLength(req, lengths, mode === 'up' || mode === 'set');
}

// ---------------------------------------------------------------------------
// Assembly resolution

/**
 * Picks the catalogue item of every part of a leg for a design force F.
 * ctx: { point, beta, bottomLug, topLug, level, rules }
 * Returns { parts: [{ ...part, item, factor, role, reqWll, ... }], li (index of the length element), errors }
 */
function resolveParts(partsIn, F, ctx) {
  const { point, beta, rules } = ctx;
  const parts = partsIn.map((p) => ({ ...p }));
  const errors = [];
  let li = parts.findIndex(isLengthPart);
  if (li < 0) errors.push('No sling or chain in the assembly');
  // 1) length element
  if (li >= 0) {
    const p = parts[li];
    p.factor = slingModeFactor(p.hitch);
    const Fl = Math.max(F, ctx.Flen || 0); // EN set rating: leg WLL ≥ W / K
    if (p.kind === 'sling') p.item = isAuto(p.id) ? selectSling(Fl, p.hitch, p.family || 'RS-PES') : getItem(p.id);
    else p.item = isAuto(p.id) ? selectChain(Fl, p.hitch, p.family || 'CH-G80') : getItem(p.id);
    p.reqWll = Fl / p.factor;
    p.reqWllLeg = F / p.factor;
  }
  const lengthItem = li >= 0 ? parts[li].item : null;
  const slingWidth = lengthItem?.type === 'chain' ? lengthItem.dims?.width || 0 : lengthItem?.dims?.width || 0;
  // 2) connectors
  parts.forEach((p, i) => {
    if (isLengthPart(p)) return;
    const atLoad = i === 0;
    const atTop = i === parts.length - 1;
    p.factor = 1;
    if (p.kind === 'shackle') {
      let pctx = {};
      if (atLoad && ctx.level !== 'top' && point) pctx = padeyeCtx(point);
      if (atLoad && ctx.level === 'top') pctx = ctx.topLug || {};
      if (atTop && ctx.level === 'bottom') pctx = ctx.bottomLug || {};
      if (atLoad && ctx.level !== 'top') p.factor = shackleSideLoadFactor(beta || 0);
      const ranges = p.family ? [p.family] : null;
      p.item = isAuto(p.id) ? selectShackle(F / p.factor, { ...pctx, slingWidth }, rules, ranges) : getItem(p.id);
      p.ctx = pctx;
      const inHole = (atLoad && ctx.level !== 'top' && hasPadeye(point)) || (atLoad && ctx.level === 'top') || (atTop && ctx.level === 'bottom');
      p.role = inHole ? 'hole' : 'link';
    } else if (p.kind === 'connlink') {
      const grade = p.family === 'CL-G100' ? 100 : 80;
      p.item = isAuto(p.id) ? selectConnlink(F, lengthItem?.type === 'chain' ? lengthItem : null, lengthItem?.grade || grade) : getItem(p.id);
      p.role = 'link';
    } else if (p.kind === 'glink') {
      p.item = isAuto(p.id) ? selectGlink(F, lengthItem?.type !== 'chain' ? slingWidth : 0) : getItem(p.id);
      p.role = 'link';
    }
    p.reqWll = F / p.factor;
  });
  parts.forEach((p) => {
    if (!p.item) errors.push(`No suitable ${PART_KINDS[p.kind]?.toLowerCase() || p.kind} in the catalogue`);
  });
  return { parts, li, errors };
}

/** Bearing-to-bearing length of the connectors of a leg (m). */
function connectorsLength(parts) {
  return parts.reduce((s, p) => (isLengthPart(p) ? s : s + connectorLength(p.item, p.role || 'link')), 0);
}

/** Sets the length of the length element for a required effective length Lreq (m). */
function sizeLengthElement(leg, Lreq, roundMode) {
  const p = leg.parts[leg.li];
  if (!p) return;
  const wrap = p.hitch === 'choke' ? Math.max(0, Number(p.wrap_m) || 0) : 0;
  const need = Lreq - leg.hwLength + wrap;
  leg.slingLengthReq = need;
  if (p.kind === 'chain') {
    const c = chainLinks(p.item, need, roundMode === 'exact' ? 'nearest' : 'up');
    p.links = c.n;
    p.length_m = c.length_m;
    p.overall_m = c.overall_m;
    leg.slingLength = c.length_m;
  } else {
    let L;
    if (p.lock && Number(p.length_m) > 0) L = Number(p.length_m);
    else if (p.item?.length_m) L = Number(p.item.length_m);
    else L = roundSlingLength(need, roundMode, stdLengths(p.item));
    p.length_m = L;
    leg.slingLength = L;
  }
  leg.wrap = wrap;
  leg.Leff = leg.slingLength + leg.hwLength - wrap;
}

/** "Matched set" mode: one standard sling length (rounded up from the longest requirement) for a group. */
function applyLengthSet(legs, roundMode) {
  if (roundMode !== 'set') return;
  const free = legs.filter((l) => {
    const p = l.parts[l.li];
    return p && p.kind === 'sling' && !(p.lock && Number(p.length_m) > 0) && !p.item?.length_m;
  });
  if (!free.length) return;
  const maxReq = Math.max(...free.map((l) => l.slingLengthReq));
  const L = standardLength(maxReq, stdLengths(free[0].parts[free[0].li].item), true);
  free.forEach((l) => {
    l.parts[l.li].length_m = L;
    l.slingLength = L;
    l.Leff = L + l.hwLength - (l.wrap || 0);
  });
}

function legWeight(leg) {
  return leg.parts.reduce((s, p) => s + itemWeight_t(p.item, isLengthPart(p) ? p.length_m : 0), 0);
}

/** Compatibility aliases used by the drawings, the BOM and older code. */
function aliasComps(leg) {
  const parts = leg.parts;
  const len = parts[leg.li];
  leg.comps = {
    sling: len?.kind === 'sling' ? len.item : null,
    chain: len?.kind === 'chain' ? len.item : null,
    lengthItem: len?.item || null,
    bottomShackle: parts[0]?.kind === 'shackle' ? parts[0].item : null,
    topConn: leg.li >= 0 && parts.length - 1 > leg.li ? parts[parts.length - 1].item : null,
  };
  leg.lengthKind = len?.kind || null;
  leg.hitch = len?.hitch || 'direct';
  leg.cfg = { mode: leg.hitch };
}

function headConfig(rig) {
  const h = rig.head || {};
  const ml = rig.masterlink || {};
  const type = h.type || (rig.headType === 'hook' ? 'hook' : ml.subLinks ? 'assembly' : 'masterlink');
  return {
    type,
    itemId: h.itemId ?? ml.itemId ?? 'auto',
    subLinkItemId: h.subLinkItemId ?? ml.subLinkItemId ?? 'auto',
    topShackle: h.topShackle ?? !!rig.topShackle?.enabled,
    topShackleId: h.topShackleId ?? rig.topShackle?.itemId ?? 'auto',
  };
}

/** Master link (+ optional sub-links) and top shackle. */
function pickHead(rig, legs, Fvert, rules) {
  const hc = headConfig(rig);
  const nLegs = legs.length;
  const useSub = hc.type === 'assembly' && nLegs >= 3;
  let pairs = null;
  let subLink = null;
  let fitWidth = 0;
  let masterlink = null;
  // space taken along the master link / hook bearing bar by the last part of each leg
  const widthOf = (leg) => {
    const last = leg.parts[leg.parts.length - 1]?.item;
    if (!last) return 0;
    if (last.type === 'shackle') return last.dims?.eyeDia || last.dims?.bowDia || 0;
    if (last.type === 'chain') return last.dims?.dia || 0;
    if (last.type === 'connlink' || last.type === 'glink') return last.dims?.barThk || 0;
    return last.dims?.width || 0;
  };
  const topShackle = hc.topShackle ? (isAuto(hc.topShackleId) ? selectShackle(Fvert, {}, rules) : getItem(hc.topShackleId)) : null;
  if (hc.type === 'hook') {
    return {
      type: 'hook', masterlink: null, subLink: null, pairs: null, useSub: false, topShackle: null, onHook: true,
      headLen: 0, subLen: 0, fitWidth: legs.reduce((s, l) => s + widthOf(l), 0), weight: 0,
    };
  }
  let integrated = false;
  let pairWidth = 0;
  if (useSub) {
    const sorted = [...legs].sort((a, b) => a.azimuth - b.azimuth);
    pairs = [];
    for (let i = 0; i < sorted.length; i += 2) pairs.push(sorted.slice(i, i + 2));
    const pairLoad = Math.max(...pairs.map((p) => p.reduce((s, l) => s + l.Fdesign * Math.cos(rad(l.angleV)), 0)));
    pairWidth = Math.max(...pairs.map((p) => p.reduce((s, l) => s + widthOf(l), 0)));
    const chosen = isAuto(hc.itemId) ? null : getItem(hc.itemId);
    const asm = chosen?.sub ? chosen : isAuto(hc.itemId) ? selectMasterlink(Fvert, 0, 2, { assembly: true, subWidth: pairWidth }) : null;
    if (asm?.sub) {
      masterlink = asm;
      integrated = true;
      subLink = {
        id: `${asm.id}#sub`, type: 'masterlink', name: `${asm.short || asm.name} — sub-link`, short: `${asm.short || asm.name} sub-link`,
        wll_t: asm.wll_t, weight_kg: 0, integrated: true,
        dims: { stockDia: asm.sub.stockDia, insideLength: asm.sub.insideLength, insideWidth: asm.sub.insideWidth },
      };
    } else {
      subLink = isAuto(hc.subLinkItemId) ? selectMasterlink(pairLoad, pairWidth, 2, { assembly: false }) : getItem(hc.subLinkItemId);
      fitWidth = pairs.length * (subLink?.dims?.stockDia || 0);
    }
  } else {
    fitWidth = legs.reduce((s, l) => s + widthOf(l), 0);
  }
  if (!masterlink) masterlink = isAuto(hc.itemId) ? selectMasterlink(Fvert, fitWidth, 2, { assembly: false }) : getItem(hc.itemId);
  const headLen = connectorLength(masterlink) + connectorLength(topShackle, 'link');
  const subLen = useSub ? connectorLength(subLink) : 0;
  const weight = itemWeight_t(masterlink) + itemWeight_t(topShackle) + (useSub && !integrated ? (pairs?.length || 0) * itemWeight_t(subLink) : 0);
  return { type: hc.type, masterlink, subLink, pairs, useSub, integrated, topShackle, headLen, subLen, fitWidth, pairWidth, weight };
}

/** Result of a converging leg (final geometry + forces). */
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

/** True when an automatically selected part is no longer sufficient for the final force. */
function needsReselect(leg) {
  const F = leg.Fdesign;
  return leg.parts.some((p, i) => {
    if (!isAuto(p.id) || !p.item) return false;
    let f = p.factor || 1;
    if (i === 0 && p.kind === 'shackle' && leg.level !== 'top') f = shackleSideLoadFactor(leg.beta || 0);
    return p.item.wll_t * f < F - 1e-9;
  });
}

/** Design force used for selection: uniform sizing (max of the group) unless disabled. */
function selectionForces(F, design) {
  if (design?.uniformLegs === false) return F;
  const m = Math.max(...F);
  return F.map(() => m);
}

/** EN 13414 / EN 818-4 / EN 1492: minimum leg WLL so that K × leg WLL ≥ load. */
function enMinLegWll(load, n, betaDeg, rules) {
  if (rules?.enCheck === false || rules?.enSizing === false) return 0;
  const K = enModeFactor(n, betaDeg);
  return K ? load / K : 0;
}

const designAngleV = (design) => {
  if (Number(design?.targetAngleV_deg) > 0) return Number(design.targetAngleV_deg);
  if (Number(design?.targetAngle_deg) > 0) return 90 - Number(design.targetAngle_deg); // v2 (angle to horizontal)
  return 30;
};

// ---------------------------------------------------------------------------
// Configuration 1: direct hook (1 to n converging legs)
function solveHook(project, ctx) {
  const { pts, W, cog, fac, rules } = ctx;
  const rig = project.rigging;
  const design = rig.design || {};
  const roundMode = design.roundLengths || 'set';
  const env = project.load.cogEnvelope_mm;
  const n = pts.length;
  const zPadMax = Math.max(...pts.map((p) => p.pos.z));

  // 1) design geometry: target angle to the vertical, or imposed hook height
  let zDesign;
  if (design.mode === 'height' && Number(design.hookHeight_m) > 0) zDesign = zPadMax + Number(design.hookHeight_m);
  else {
    const a = rad(Math.min(85, Math.max(1, designAngleV(design))));
    zDesign = Math.max(...pts.map((p) => p.pos.z + hdist(cog, p.pos) / Math.tan(a)));
    if (n === 1 || zDesign - zPadMax < 0.3) zDesign = Math.max(zDesign, zPadMax + (Number(design.minHeight_m) || 1.0));
  }
  const tD = envelopeTensions(zDesign, pts.map((p) => p.pos), W, cog, env);
  const topD = v3(cog.x, cog.y, zDesign);

  const betaD = Math.max(...pts.map((p) => deg(Math.acos(Math.min(1, vnorm(vsub(topD, p.pos)).z)))));
  const build = (Fmin = []) => {
    // 2) equipment selection per leg (uniform sizing of the set by default)
    const Fsel = selectionForces(pts.map((_, i) => Math.max(tD.T[i] * fac, Fmin[i] || 0)), design);
    const Flen = enMinLegWll(W, n, betaD, rules);
    let legs = pts.map((p, i) => {
      const u = vnorm(vsub(topD, p.pos));
      const beta = outOfPlaneAngle(u, p.azimuth_deg);
      const F = Fsel[i];
      const r = resolveParts(legAssembly(rig, p.id, 'main'), F, { point: p, beta, rules, level: 'main', Flen });
      const leg = {
        key: p.id, label: `Leg ${p.id}`, level: 'main', pointId: p.id, point: p, bottom: p.pos, azimuthPad: p.azimuth_deg,
        parts: r.parts, li: r.li, errors: r.errors, Fsel: F, Fdesign: tD.T[i] * fac, Flen,
        angleV: deg(Math.acos(Math.min(1, u.z))), azimuth: deg(Math.atan2(p.pos.y - cog.y, p.pos.x - cog.x)),
      };
      aliasComps(leg);
      return leg;
    });
    const head = pickHead(rig, legs, W * ctx.facHead, rules);
    // 3) lengths
    legs.forEach((leg) => {
      leg.hwLength = connectorsLength(leg.parts) + head.headLen + (head.useSub ? head.subLen : 0);
      sizeLengthElement(leg, vlen(vsub(topD, leg.bottom)), roundMode);
    });
    applyLengthSet(legs, roundMode);
    // 4) actual geometry: hook height given by each leg
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
    return { legs, head, hook, tooShort, zHook };
  };

  let b = build();
  // re-select once with the final forces if an automatic part became insufficient
  if (b.legs.some(needsReselect)) b = build(b.legs.map((l) => l.Fdesign * 1.0001));
  const { legs, head, hook, tooShort, zHook } = b;

  const rigWeight = legs.reduce((s, l) => s + legWeight(l), 0) + head.weight;
  const tilt = tooShort.length ? null : estimateTilt(legs.map((l) => l.bottom), cog, legs.map((l) => l.Leff));
  return {
    type: 'hook', hook, legs, head, tooShort, zDesign, rigWeight, tilt,
    Fvert_design: (W + rigWeight - head.weight) * ctx.facHead,
    riggingHeight: zHook - zPadMax,
    spreader: null,
  };
}

// ---------------------------------------------------------------------------
// Configuration 2: spreader bar — 2 top legs, 1 or 2 bottom legs per bar end
function solveSpreader(project, ctx) {
  const { pts, W, cog, fac, rules } = ctx;
  const rig = project.rigging;
  const sp = rig.spreader || {};
  const design = rig.design || {};
  const roundMode = design.roundLengths || 'set';
  const env = project.load.cogEnvelope_mm;
  const axis = sp.axis === 'y' ? 'y' : 'x';
  const other = axis === 'x' ? 'y' : 'x';
  const Lbar = Number(sp.length_m) || 0;
  const depth = Number(sp.depth_m) || 0.3;
  const Wbar = Number(sp.weight_t) || 0;

  const groupA = pts.filter((p) => p.pos[axis] < cog[axis]);
  const groupB = pts.filter((p) => p.pos[axis] >= cog[axis]);
  const errors = [];
  if (!groupA.length || !groupB.length) errors.push('All lift points are on the same side of the COG along the spreader axis');
  if (!(Lbar > 0)) errors.push('Spreader bar lug spacing not entered');

  const cA = groupA.length ? mean(groupA.map((p) => p.pos[axis])) : cog[axis] - Lbar / 2;
  const cB = groupB.length ? mean(groupB.map((p) => p.pos[axis])) : cog[axis] + Lbar / 2;
  const center = sp.position === 'cog' ? cog[axis] : (cA + cB) / 2;
  const L = Lbar > 0 ? Lbar : Math.abs(cB - cA);
  const mk = (a) => (axis === 'x' ? v3(a, cog.y, 0) : v3(cog.x, a, 0));
  const lugA = mk(center - L / 2);
  const lugB = mk(center + L / 2);
  const groupOf = (p) => (p.pos[axis] < cog[axis] ? 'A' : 'B');

  // ---- bottom legs: design
  const aBot = rad(Math.min(85, Math.max(1, Number(sp.bottomTargetAngleV_deg) || (Number(sp.bottomTargetAngle_deg) ? 90 - Number(sp.bottomTargetAngle_deg) : 30))));
  const hMin = Number(sp.minBottomHeight_m) || 1.0;
  const zPadMax = Math.max(...pts.map((p) => p.pos.z));
  const zBotDesign = Math.max(
    ...pts.map((p) => {
      const lug = groupOf(p) === 'A' ? lugA : lugB;
      const d = hdist(lug, p.pos);
      return p.pos.z + Math.max(d / Math.tan(aBot), hMin);
    }),
  );
  const ptsPos = pts.map((p) => p.pos);
  const tBotD = envelopeReactions(ptsPos, W, cog, env);
  const Rd = tBotD.Rmax;

  const topLugCtx = { holeDia: Number(sp.topLugHoleDia_mm) || 0, padeyeThk: Number(sp.topLugThk_mm) || 0 };
  const botLugCtx = { holeDia: Number(sp.bottomLugHoleDia_mm) || 0, padeyeThk: Number(sp.bottomLugThk_mm) || 0 };

  const Fbot = selectionForces(
    pts.map((p, i) => {
      const lug = groupOf(p) === 'A' ? lugA : lugB;
      const u = vnorm(vsub(v3(lug.x, lug.y, zBotDesign), p.pos));
      return (u.z > 1e-6 ? Rd[i] / u.z : Infinity) * fac;
    }),
    design,
  );
  let bottomLegs = pts.map((p, i) => {
    const g = groupOf(p);
    const lug = g === 'A' ? lugA : lugB;
    const topPt = v3(lug.x, lug.y, zBotDesign);
    const u = vnorm(vsub(topPt, p.pos));
    const F = Fbot[i];
    const beta = outOfPlaneAngle(u, p.azimuth_deg);
    const r = resolveParts(legAssembly(rig, p.id, 'main'), F, { point: p, beta, rules, level: 'bottom', bottomLug: botLugCtx });
    const leg = {
      key: p.id, label: `Bottom ${p.id}`, level: 'bottom', group: g, pointId: p.id, point: p, bottom: p.pos, azimuthPad: p.azimuth_deg,
      parts: r.parts, li: r.li, errors: r.errors, Fsel: F, lug,
    };
    aliasComps(leg);
    leg.hwLength = connectorsLength(leg.parts);
    sizeLengthElement(leg, vlen(vsub(topPt, p.pos)), roundMode);
    return leg;
  });
  applyLengthSet(bottomLegs, roundMode);

  // ---- actual bottom geometry → spreader elevation
  const zBotLeg = bottomLegs.map((leg) => {
    const d = hdist(leg.lug, leg.bottom);
    return leg.Leff > d ? leg.bottom.z + Math.sqrt(leg.Leff ** 2 - d ** 2) : null;
  });
  const tooShort = bottomLegs.filter((_, i) => zBotLeg[i] == null).map((l) => l.key);
  const zBot = mean(zBotLeg.filter((z) => z != null)) || zBotDesign;
  const R = tBotD.R;
  const RminAll = tBotD.Rmin;
  const Rmax = Rd;
  bottomLegs = bottomLegs.map((leg, i) => {
    const top = v3(leg.lug.x, leg.lug.y, zBot);
    const u = vnorm(vsub(top, leg.bottom));
    const tens = { T: [], Tnom: [], R: [], Rmin: [] };
    tens.T[i] = u.z > 1e-6 ? Rmax[i] / u.z : Infinity;
    tens.Tnom[i] = u.z > 1e-6 ? R[i] / u.z : Infinity;
    tens.R[i] = R[i];
    tens.Rmin[i] = RminAll[i];
    return finalizeLeg(leg, top, tens, i, fac, zBotLeg[i]);
  });

  // ---- loads at the spreader ends
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

  // ---- top legs: design
  const aTop = rad(Math.min(85, Math.max(1, designAngleV(design))));
  const dA = Math.abs(hookPlan[axis] - lugA[axis]);
  const dB = Math.abs(lugB[axis] - hookPlan[axis]);
  const zHookDesign = zTopLug + Math.max(dA, dB) / Math.tan(aTop);
  const topKeys = [
    { key: 'TA', lug: lugA, V: VA, Vm: VAm },
    { key: 'TB', lug: lugB, V: VB, Vm: VBm },
  ];
  const topPtD = v3(hookPlan.x, hookPlan.y, zHookDesign);
  const Ftop = selectionForces(
    topKeys.map((t) => (t.Vm / Math.max(vnorm(vsub(topPtD, v3(t.lug.x, t.lug.y, zTopLug))).z, 1e-6)) * fac),
    design,
  );
  const betaTop = Math.max(...topKeys.map((t) => deg(Math.acos(Math.min(1, vnorm(vsub(topPtD, v3(t.lug.x, t.lug.y, zTopLug))).z)))));
  const FlenTop = enMinLegWll(VA + VB, 2, betaTop, rules);
  let topLegs = topKeys.map((t, k) => {
    const bottomPt = v3(t.lug.x, t.lug.y, zTopLug);
    const u = vnorm(vsub(topPtD, bottomPt));
    const F = Ftop[k];
    const r = resolveParts(legAssembly(rig, t.key, 'top'), F, { point: null, beta: 0, rules, level: 'top', topLug: topLugCtx, Flen: FlenTop });
    const leg = {
      key: t.key, label: `Top ${t.key === 'TA' ? 'A' : 'B'}`, level: 'top', group: t.key === 'TA' ? 'A' : 'B', bottom: bottomPt, azimuthPad: null,
      parts: r.parts, li: r.li, errors: r.errors, Fsel: F, Fdesign: F, V: t.V, Vm: t.Vm,
      angleV: deg(Math.acos(Math.min(1, u.z))), azimuth: deg(Math.atan2(bottomPt.y - hookPlan.y, bottomPt.x - hookPlan.x)), lugCtx: topLugCtx,
    };
    aliasComps(leg);
    return leg;
  });
  const head = pickHead(rig, topLegs, (VAm + VBm) * ctx.facHead, rules);
  topLegs.forEach((leg) => {
    leg.hwLength = connectorsLength(leg.parts) + head.headLen;
    sizeLengthElement(leg, vlen(vsub(topPtD, leg.bottom)), roundMode);
  });
  applyLengthSet(topLegs, roundMode);
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
  const compression = Math.max(...topLegs.map((l) => l.Tstatic * Math.cos(rad(l.angleH))));
  const bottomAxial = Math.max(Math.abs(end.A[`H${axis}`]), Math.abs(end.B[`H${axis}`]));
  const bottomLateral = Math.max(Math.abs(end.A[`H${other}`]), Math.abs(end.B[`H${other}`]));

  const legs = [...topLegs, ...bottomLegs];
  const rigWeight = legs.reduce((s, l) => s + legWeight(l), 0) + head.weight + Wbar;
  return {
    type: 'spreader', hook, legs, head, tooShort, errors, rigWeight,
    Fvert_design: (VA + VB + topLegs.reduce((s, l) => s + legWeight(l), 0)) * ctx.facHead,
    tilt: null,
    riggingHeight: zHook - zPadMax,
    spreader: {
      axis, lugA: v3(lugA.x, lugA.y, zBot), lugB: v3(lugB.x, lugB.y, zBot), zBot, zTop: zTopLug, length: L, depth, weight: Wbar,
      VA, VB, totalV: VA + VB, compression, compressionDesign: compression * fac, bottomAxial, bottomLateral,
      centerOffset: center - cog[axis], lugGap: Math.abs(cB - cA) - L,
    },
  };
}

/** Entry point: solves the rigging, iterating on rigging weight (SHL → DAF). */
export function solveRigging(project, rules = {}) {
  const load = project.load || {};
  const pts = usedLiftPoints(load);
  if (!pts.length) return { error: 'No active lift point' };
  const W = loadWeightWithContingency(load);
  if (!(W > 0)) return { error: 'Load weight not entered' };
  const cog = cogM(load);
  let rigW = 0.03 * W;
  let res = null;
  let f = null;
  for (let it = 0; it < 5; it++) {
    const shl = W + rigW;
    f = resolveFactors(project.factors, project.environment, shl, pts.length);
    const fac = f.daf * f.skl * f.cog * f.extra;
    const facHead = f.daf * f.extra; // total vertical load: no SKL
    const ctx = { pts, W, cog, fac, facHead, rules };
    res = project.rigging?.type === 'spreader' ? solveSpreader(project, ctx) : solveHook(project, ctx);
    const conv = Math.abs(res.rigWeight - rigW) < 1e-4;
    rigW = res.rigWeight;
    if (conv) break;
  }
  const shl = W + rigW;
  return { ...res, W, cog, pts, factors: f, fac: f.daf * f.skl * f.cog * f.extra, facHead: f.daf * f.extra, shl };
}
