// Checks: each check yields a row { cat, item, label, value, limit, unit, util, status, note }.
import { shackleSideLoadFactor, shackleCompatibility, enModeFactor, niceName } from '../catalog/index.js';
import { DEFAULT_SHACKLE_RANGES } from '../catalog/data.js';
import { chartCapacity } from './crane.js';
import { hasPadeye, pointKind, padeyeCtx, isLengthPart, PART_KINDS } from './rigging.js';
import { legJointChecks } from './compat.js';
import { offsetFromLine } from './statics.js';
import { deg } from './vec.js';

export const DEFAULT_RULES = {
  targetAngleV_deg: 30, // preferred maximum leg angle to the VERTICAL (warning above)
  maxAngleV_deg: 45, // maximum allowable leg angle to the vertical (reject above)
  maxHoleClearance_mm: 3, // allowed hole/pin clearance: max(3 mm; 4 % of pin Ø)
  maxHoleClearance_pct: 4,
  minThicknessRatio: 0.75, // padeye thickness / shackle jaw width
  lengthMismatchWarn_mm: 25, // convergence height mismatch between legs (spreader)
  maxTiltWarn_deg: 2, // estimated load tilt (warning)
  maxTiltFail_deg: 5, // estimated load tilt (reject)
  utilWarn: 0.9, // equipment utilisation above which a warning is raised
  maxOutOfPlane_deg: 5, // allowed out-of-plane angle on a padeye
  minBendingRatio: 1, // wire rope / grommet: bearing Ø / rope Ø (warn below)
  shackleRanges: DEFAULT_SHACKLE_RANGES, // shackle ranges used by auto-selection
  enCheck: true, // EN 13414 / EN 818-4 / EN 1492 multi-leg mode factor check
};

export const STATUS_ORDER = { fail: 3, warn: 2, ok: 1, info: 0 };

function utilStatus(util, warnAt = 0.9) {
  if (util == null || !isFinite(util)) return 'fail';
  if (util > 1 + 1e-9) return 'fail';
  if (util > warnAt) return 'warn';
  return 'ok';
}

const r2 = (v) => (v == null || !isFinite(v) ? v : Math.round(v * 100) / 100);

function push(list, c) {
  list.push({ util: null, unit: 't', ...c, value: r2(c.value), limit: r2(c.limit) });
}

/** Rigging checks. */
export function riggingChecks(rig, project, rules) {
  const out = [];
  if (!rig || rig.error) {
    push(out, { cat: 'Input', item: '—', label: rig?.error || 'Calculation not possible', status: 'fail' });
    return out;
  }
  (rig.errors || []).forEach((e) => push(out, { cat: 'Geometry', item: 'Spreader', label: e, status: 'fail' }));
  rig.tooShort.forEach((k) =>
    push(out, { cat: 'Geometry', item: k, label: 'Sling too short: it does not reach the convergence point', status: 'fail' }),
  );

  for (const leg of rig.legs) {
    const startIdx = out.length;
    const F = leg.Fdesign;
    const name = leg.label;
    (leg.errors || []).forEach((e) => push(out, { cat: 'Input', item: name, label: e, status: 'fail', unit: '' }));
    const len = leg.parts[leg.li];
    leg.parts.forEach((p, i) => {
      if (!p.item) return;
      const it = p.item;
      if (isLengthPart(p)) {
        const wll = it.wll_t * (p.factor || 1);
        const what = p.kind === 'chain'
          ? `${niceName(it)} — ${p.links} links = ${(p.length_m || 0).toFixed(3)} m`
          : `${niceName(it)} — EWL ${(p.length_m || 0).toFixed(2)} m`;
        push(out, {
          cat: p.kind === 'chain' ? 'Chains' : 'Slings', item: name, label: `${what}${p.hitch === 'choke' ? ' (choked ×0.8)' : ''}${p.defaulted ? ' — length not set, 1 m assumed' : ''}`,
          value: F, limit: wll, util: F / wll, status: p.defaulted ? 'warn' : utilStatus(F / wll, rules.utilWarn), part: i,
          note: p.defaulted ? 'Several slings / chains in this leg: only the first free one is sized; give the others their length (click it on the Rigging page)' : '',
        });
        return;
      }
      const sf = i === 0 && p.kind === 'shackle' && leg.level !== 'top' ? shackleSideLoadFactor(leg.beta || 0) : 1;
      const wll = it.wll_t * sf;
      const where = i === 0 ? (leg.level === 'top' ? 'at spreader lug' : 'at lift point') : i === leg.parts.length - 1 ? (leg.level === 'bottom' ? 'at spreader lug' : 'at hook side') : 'in line';
      const cat = p.kind === 'shackle' ? 'Shackles' : p.kind === 'connlink' ? 'Connecting links' : p.kind === 'hook' ? 'Hooks' : p.kind === 'masterlink' ? 'Master link' : 'G-Link';
      push(out, {
        cat, item: name, label: `${niceName(it)} (${where})${sf < 1 ? ` — side load ${leg.beta.toFixed(0)}° → ×${sf.toFixed(2)}` : ''}`,
        value: F, limit: wll, util: F / wll, status: utilStatus(F / wll, rules.utilWarn), part: i,
      });
      if (p.kind === 'connlink' && len?.kind === 'chain' && len.item && it.chainDias && !it.chainDias.includes(len.item.dims?.dia))
        push(out, { cat: 'Compatibility', item: name, label: `${niceName(it)} does not match chain Ø${len.item.dims?.dia} mm`, status: 'warn', unit: '', part: i, note: 'A connecting link must be of the same size as the chain.' });
      if (p.kind === 'connlink' && len?.kind === 'chain' && len.item && (it.grade || 80) < (len.item.grade || 80))
        push(out, { cat: 'Compatibility', item: name, label: `Grade ${it.grade} connecting link on a grade ${len.item.grade} chain`, status: 'warn', unit: '' });
      // padeye / lug fit of the shackle pinned in a hole
      if (p.kind === 'shackle' && p.role === 'hole') {
        const ctx = { ...(p.ctx || {}), slingWidth: len?.kind === 'sling' ? len.item?.dims?.width : null };
        shackleCompatibility(it, { ...ctx, slingWidth: null }, rules).forEach((iss) => push(out, { cat: 'Compatibility', item: name, label: iss.msg, status: iss.level, unit: '', part: i, note: i === 0 ? 'Shackle pin in the padeye hole: see the padeye on the Load page' : 'Shackle pin in the spreader lug' }));
      }
    });
    // joints between parts (sling on shackle, shackle on master link, links…)
    legJointChecks(leg, rig).forEach((x) => push(out, { cat: 'Compatibility', item: name, label: x.label, status: x.status, unit: '', part: x.part, note: x.why }));
    if (len?.hitch === 'choke' && !(Number(len.wrap_m) > 0))
      push(out, { cat: 'Slings', item: name, label: 'Choked hitch: length taken by the choke around the load not entered (assumed 0)', status: 'info', unit: '' });
    // Lift point with a ring (anchor point, eye bolt): SWL
    if (leg.point && pointKind(leg.point) === 'ring') {
      const swl = Number(leg.point.swl_t);
      if (swl > 0) push(out, { cat: 'Lift points', item: name, label: `Lift point ${leg.point.id} (SWL ${swl} t)`, value: F, limit: swl, util: F / swl, status: utilStatus(F / swl, rules.utilWarn), point: leg.point.id, note: leg.point.ringStd?.startsWith?.('EB80') ? 'Eye bolt: SWL given for an axial pull — reduce it for an angled pull (manufacturer table)' : '' });
      else push(out, { cat: 'Lift points', item: name, label: `Lift point ${leg.point.id}: SWL not entered`, status: 'warn', unit: '', point: leg.point.id });
    }
    // Lift point (padeye) — skipped when the point has no padeye
    if (leg.point && hasPadeye(leg.point)) {
      const swl = Number(leg.point.swl_t);
      if (swl > 0)
        push(out, {
          cat: 'Lift points', item: name, label: `Padeye ${leg.point.id} (SWL ${swl} t)`,
          value: F, limit: swl, util: F / swl, status: utilStatus(F / swl, rules.utilWarn), point: leg.point.id,
        });
      else push(out, { cat: 'Lift points', item: name, label: `Padeye ${leg.point.id}: SWL not entered`, status: 'warn', unit: '', point: leg.point.id });
      if (leg.beta != null && leg.beta > rules.maxOutOfPlane_deg)
        push(out, {
          cat: 'Lift points', item: name, label: `Out-of-plane load on padeye: ${leg.beta.toFixed(1)}°`,
          value: leg.beta, limit: rules.maxOutOfPlane_deg, unit: '°', status: 'warn',
          note: 'Orient the padeye towards the hook or check its out-of-plane capacity',
        });
      if (leg.parts[0]?.kind !== 'shackle')
        push(out, { cat: 'Lift points', item: name, label: `Padeye ${leg.point.id}: the assembly does not start with a shackle`, status: 'warn', unit: '' });
    }
    // Angle to the vertical (all legs)
    const aV = leg.angleV;
    const st = aV > rules.maxAngleV_deg + 0.2 ? 'fail' : aV > rules.targetAngleV_deg + 0.2 ? 'warn' : 'ok'; // 0.2° tolerance for length rounding
    if (!(leg.level === 'bottom' && leg.d < 0.01))
      push(out, {
        cat: 'Angles', item: name, label: `Leg angle ${aV.toFixed(1)}° to vertical (${leg.angleH.toFixed(1)}° to horizontal)`,
        value: aV, limit: rules.maxAngleV_deg, unit: '°', status: st,
        note: st === 'warn' ? `Above the ${rules.targetAngleV_deg}° target — allowed up to ${rules.maxAngleV_deg}°` : st === 'fail' ? `Maximum ${rules.maxAngleV_deg}° to vertical` : '',
      });
    out.slice(startIdx).forEach((c) => {
      c.ref = c.ref || (c.point && c.cat === 'Lift points' ? { tab: 'load', point: c.point } : { tab: 'rigging', leg: leg.key, part: c.part ?? null });
    });
    // Length balance (spreader; for a direct hook the load tilt is checked globally)
    if (rig.type === 'spreader' && Math.abs(leg.mismatch_mm) > rules.lengthMismatchWarn_mm)
      push(out, {
        cat: 'Geometry', item: name,
        label: `Unbalanced length: ${leg.mismatch_mm > 0 ? '+' : ''}${leg.mismatch_mm.toFixed(0)} mm on the convergence height`,
        value: Math.abs(leg.mismatch_mm), limit: rules.lengthMismatchWarn_mm, unit: 'mm', status: 'warn',
        note: 'The load (or spreader) will tilt: adjust lengths / add shackles or use made-to-measure slings',
      });
    // Slack sling (COG outside the lift point polygon)
    if (leg.Rmin != null && leg.Rmin < -1e-6)
      push(out, {
        cat: 'Stability', item: name, label: 'Negative reaction: slack sling (COG outside the lift point polygon)',
        status: 'fail', unit: '',
      });
  }

  // Load attitude (direct hook)
  if (rig.tilt) {
    const t = rig.tilt;
    push(out, {
      cat: 'Geometry', item: 'Load',
      label: `Estimated load tilt with the selected lengths: ${t.tilt_deg.toFixed(2)}°`,
      value: t.tilt_deg, limit: rules.maxTiltWarn_deg, unit: '°',
      status: t.tilt_deg > rules.maxTiltFail_deg ? 'fail' : t.tilt_deg > rules.maxTiltWarn_deg ? 'warn' : 'info',
      note: t.tilt_deg > rules.maxTiltWarn_deg ? 'Adjust lengths (made-to-measure slings, extension shackles) or accept the tilt' : '',
    });
    t.slack.forEach((i) =>
      push(out, {
        cat: 'Geometry', item: rig.legs[i]?.label || `Leg ${i + 1}`,
        label: 'Sling probably slack with these lengths (load taken by the other legs)',
        status: 'warn', unit: '', note: 'The SKL must cover this case, otherwise shorten the sling',
      }),
    );
  }

  // Master link / sub-links / top shackle
  const h = rig.head;
  const Fv = rig.Fvert_design;
  if (h && h.onHook) {
    const nOn = rig.legs.filter((l) => l.level !== 'bottom').length;
    const seat = Number(project.crane?.hookSeatWidth_mm) || 0;
    if (seat > 0 && h.fitWidth > seat)
      push(out, { cat: 'Compatibility', item: 'Hook', label: `Space taken ${h.fitWidth.toFixed(0)} mm > hook seat width ${seat} mm`, status: 'warn', unit: '' });
    if (nOn > 2)
      push(out, { cat: 'Compatibility', item: 'Hook', label: `${nOn} slings placed directly on the hook`, status: 'warn', unit: '', note: 'Good practice: gather the legs on a master link (or max. 2 eyes per hook)' });
    const maxV = Math.max(...rig.legs.filter((l) => l.level !== 'bottom').map((l) => l.angleV));
    if (maxV > rules.maxAngleV_deg)
      push(out, { cat: 'Angles', item: 'Hook', label: `Included angle at hook ${(2 * maxV).toFixed(0)}° > 90°`, status: 'warn', unit: '' });
  }
  if (h && !h.onHook && h.unknownSWL) push(out, { cat: 'Master link', item: 'Head', label: 'Masterlink SWL not known — assumed suitable (not checked)', status: 'info', unit: '', ref: { tab: 'rigging', head: true }, hideInReport: true });
  if (h && !h.onHook && !h.unknownSWL) {
    const headStart = out.length;
    if (!h.masterlink) push(out, { cat: 'Master link', item: 'Head', label: 'No suitable master link', status: 'fail' });
    else {
      push(out, {
        cat: 'Master link', item: 'Head', label: niceName(h.masterlink), value: Fv, limit: h.masterlink.wll_t,
        util: Fv / h.masterlink.wll_t, status: utilStatus(Fv / h.masterlink.wll_t, rules.utilWarn),
      });
      const iw = h.masterlink.dims?.insideWidth || 0;
      if (h.fitWidth > iw)
        push(out, {
          cat: 'Compatibility', item: 'Master link', label: `Items on the masterlink need ${h.fitWidth.toFixed(0)} mm along its bottom bar — inside width ${iw} mm`,
          status: 'warn', unit: '', note: 'Everything hanging on the masterlink sits side by side on its bottom bar (shackle eye Ø, ½ round sling width, webbing width…). Use a larger masterlink, a quad masterlink with sub-links, or shackles.',
        });
    }
    if (h.useSub && h.subLink) {
      if (!h.integrated) {
        const pairLoad = Math.max(...h.pairs.map((p) => p.reduce((s, l) => s + l.Fdesign * Math.cos((l.angleV * Math.PI) / 180), 0)));
        push(out, {
          cat: 'Master link', item: 'Sub-links', label: `${niceName(h.subLink)} (×${h.pairs.length})`, value: pairLoad, limit: h.subLink.wll_t,
          util: pairLoad / h.subLink.wll_t, status: utilStatus(pairLoad / h.subLink.wll_t, rules.utilWarn),
        });
      }
      const siw = h.subLink.dims?.insideWidth || 0;
      if (h.pairWidth > siw)
        push(out, {
          cat: 'Compatibility', item: 'Sub-links', label: `Two legs per sub-link need ${h.pairWidth.toFixed(0)} mm — inside width ${siw} mm`,
          status: 'warn', unit: '', note: 'The two items hanging on each sub-link sit side by side on its bottom bar. Use shackles or a larger assembly.',
        });
    }
    out.slice(headStart).forEach((c) => (c.ref = c.ref || { tab: 'rigging', head: true }));
  }

  // Spreader bar
  if (rig.spreader) {
    const sp = project.rigging.spreader || {};
    const s = rig.spreader;
    const wll = Number(sp.wll_t);
    const Fd = s.totalV * rig.facHead;
    if (wll > 0)
      push(out, {
        cat: 'Spreader', item: sp.name || 'Spreader', label: 'Vertical load (dynamic) vs spreader WLL',
        value: Fd, limit: wll, util: Fd / wll, status: utilStatus(Fd / wll, rules.utilWarn),
      });
    else push(out, { cat: 'Spreader', item: sp.name || 'Spreader', label: 'Spreader WLL not entered', status: 'warn', unit: '' });
    const minTop = Number(sp.minTopAngle_deg) || 0;
    rig.legs
      .filter((l) => l.level === 'top')
      .forEach((l) => {
        if (minTop > 0 && l.angleH < minTop - 1e-6)
          push(out, {
            cat: 'Spreader', item: l.label, label: `Top sling angle ${l.angleH.toFixed(1)}° < minimum angle of the spreader certificate`,
            value: l.angleH, limit: minTop, unit: '°', status: 'fail',
          });
      });
    push(out, {
      cat: 'Spreader', item: sp.name || 'Spreader', label: 'Compression force (static / dynamic)',
      value: s.compression, limit: s.compressionDesign, unit: 't', status: 'info',
      note: `Bottom sling inclination: axial force ${s.bottomAxial.toFixed(2)} t, transverse ${s.bottomLateral.toFixed(2)} t`,
    });
    if (Math.abs(s.lugGap) > 0.05)
      push(out, {
        cat: 'Spreader', item: sp.name || 'Spreader',
        label: `Lug spacing ≠ lift point spacing (difference ${(s.lugGap * 1000).toFixed(0)} mm) → inclined bottom slings`,
        status: 'info', unit: '',
      });
  }

  // Standard method (EN 13414-1 / EN 818-4 / EN 1492): set WLL = K × WLL of one leg
  if (rules.enCheck !== false) enChecks(rig, out);

  // Stability
  const load = project.load;
  const zCog = rig.cog.z;
  const zPad = rig.pts.reduce((s, p) => s + p.pos.z, 0) / rig.pts.length;
  if (rig.pts.length === 1) {
    const off = Math.hypot(rig.pts[0].pos.x - rig.cog.x, rig.pts[0].pos.y - rig.cog.y);
    if (off > 0.01) {
      const tilt = deg(Math.atan2(off, Math.max(rig.pts[0].pos.z - zCog, 1e-6)));
      push(out, { cat: 'Stability', item: 'Load', label: `Single lift point offset ${(off * 1000).toFixed(0)} mm from the COG: tilt ≈ ${tilt.toFixed(1)}°`, status: 'warn', unit: '' });
    }
  }
  if (rig.pts.length === 2 || rig.type === 'spreader') {
    if (zCog >= zPad)
      push(out, {
        cat: 'Stability', item: 'Load',
        label: `COG (z = ${(zCog * 1000).toFixed(0)} mm) above the lift points (z = ${(zPad * 1000).toFixed(0)} mm): risk of toppling`,
        status: rig.pts.length === 2 ? 'fail' : 'warn', unit: '',
      });
    if (rig.pts.length === 2) {
      const off = offsetFromLine(rig.pts[0].pos, rig.pts[1].pos, rig.cog);
      if (off > 0.005) {
        const tilt = deg(Math.atan2(off, Math.max(zPad - zCog, 1e-6)));
        push(out, { cat: 'Stability', item: 'Load', label: `COG offset ${(off * 1000).toFixed(0)} mm from the 2-point axis: rotation ≈ ${tilt.toFixed(1)}° about the axis`, status: 'warn', unit: '' });
      }
    }
  } else if (zCog > zPad) {
    push(out, { cat: 'Stability', item: 'Load', label: 'COG above the lift point plane (top-heavy load): stable under the hook but sensitive', status: 'info', unit: '' });
  }
  if (Number(load?.cogEnvelope_mm?.dx) > 0 || Number(load?.cogEnvelope_mm?.dy) > 0)
    push(out, { cat: 'Factors', item: 'COG', label: `COG envelope ±${load.cogEnvelope_mm.dx || 0} / ±${load.cogEnvelope_mm.dy || 0} mm taken into account`, status: 'info', unit: '' });
  return out;
}

/** EN multi-leg mode factor check (uniform load method). */
function enChecks(rig, out) {
  const groups = rig.type === 'spreader'
    ? [{ name: 'Top legs', legs: rig.legs.filter((l) => l.level === 'top'), load: rig.spreader.totalV }]
    : [{ name: 'Sling set', legs: rig.legs, load: rig.W }];
  for (const g of groups) {
    const legs = g.legs.filter((l) => l.parts[l.li]?.item);
    if (!legs.length) continue;
    const n = legs.length;
    const beta = Math.max(...legs.map((l) => l.angleV));
    const K = enModeFactor(n, beta);
    const legWll = Math.min(...legs.map((l) => l.parts[l.li].item.wll_t * (l.parts[l.li].factor || 1)));
    if (K == null) {
      push(out, { cat: 'Factors', item: g.name, label: `EN method: leg angle ${beta.toFixed(0)}° > 60° to vertical — not allowed`, status: 'fail', unit: '' });
      continue;
    }
    const wll = K * legWll;
    push(out, {
      cat: 'Factors', item: g.name,
      label: `EN mode factor K = ${K} (${n} leg${n > 1 ? 's' : ''}, β ${beta <= 45 ? '≤' : '>'} 45°) × leg WLL ${legWll.toFixed(2)} t = ${wll.toFixed(2)} t`,
      value: g.load, limit: wll, util: g.load / wll, status: utilStatus(g.load / wll, 1),
      note: 'Static load vs rated set WLL (EN 13414-1 / EN 818-4 / EN 1492); assumes symmetric loading — the leg-by-leg check above governs',
    });
  }
}

/** Crane check for a given radius (static hook load) — load chart only. */
export function craneCheck(crane, shlCrane, R, label = 'Operation') {
  const out = [];
  const col = Number(crane.activeColumn) || 0;
  const cap = chartCapacity(crane.chart, R, col, crane.interpolation || 'step');
  const lim = Number(crane.utilLimit) > 0 ? Number(crane.utilLimit) : 0.85;
  if (cap.status === 'nochart') push(out, { cat: 'Crane', item: label, label: 'Load chart not entered', status: 'fail', unit: '' });
  else if (cap.status === 'beyond')
    push(out, { cat: 'Crane', item: label, label: `Radius ${R} m beyond the load chart (max ${cap.rMax} m)`, status: 'fail', unit: '' });
  else if (cap.status === 'below')
    push(out, { cat: 'Crane', item: label, label: `Radius ${R} m below the minimum radius of the load chart (${cap.rMin} m)`, status: 'fail', unit: '' });
  else {
    const util = shlCrane / cap.capacity;
    push(out, {
      cat: 'Crane', item: label,
      label: `SWL at R = ${R} m${cap.rUsed != null && cap.rUsed !== R ? ` (read at ${cap.rUsed} m)` : ''}`,
      value: shlCrane, limit: cap.capacity, util,
      status: util > 1 ? 'fail' : util > lim ? 'warn' : 'ok',
      note: util > lim && util <= 1 ? `> ${(lim * 100).toFixed(0)} %: critical lift` : '',
    });
  }
  return { checks: out, capacity: cap };
}
