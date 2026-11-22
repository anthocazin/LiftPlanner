// LiftPlanner Light — field lift plan: the light state is turned into a project of the full
// engine (equal share between the legs at 30°, one factor, no pad eye, no COG) and only the rigging
// checks are kept (WLL of every part, parts compatible with each other) plus the crane.
import { defaultProject } from '../state.js';
import { computeProject } from '../engine/compute.js';
import { equalShareLayout } from '../engine/legcog.js';

export const LEG_IDS = 'ABCDEFGH'.split('');
export const ANGLE = 30; // angle to the vertical taken for every leg (sizing)

export const PALETTE = [
  { kind: 'shackle', label: 'Shackle' },
  { kind: 'sling', family: 'RS-PES', hitch: 'direct', label: 'Round sling' },
  { kind: 'sling', family: 'RS-PES', hitch: 'choke', label: 'Round sling, choked' },
  { kind: 'sling', family: 'WIRE', hitch: 'direct', label: 'Wire rope sling' },
  { kind: 'sling', family: 'WEB', hitch: 'direct', label: 'Webbing sling' },
  { kind: 'chain', family: 'CH-G80', hitch: 'direct', label: 'Chain' },
  { kind: 'connlink', family: 'CL-G80', label: 'G-link' },
  { kind: 'hook', label: 'Safety hook' },
  { kind: 'masterlink', label: 'Master link' },
];

export const HEADS = {
  masterlink: 'Master link supplied',
  crane: 'Master link of the crane (not checked)',
  hook: 'Legs directly on the hook',
};

export function newState() {
  return {
    v: 1,
    title: '',
    location: '',
    date: new Date().toISOString().slice(0, 10),
    preparedBy: '',
    signature: null,
    weight_t: null,
    factor: 1,
    crane: { name: '', swlMin_t: null, rMin_m: null, swlMax_t: null, rMax_m: null },
    nPoints: 4,
    photos: [], // { id, name, img, w, h, points: { 1: {u, v} }, hook: {u, v} | null, tops: { A: {u, v} } }
    sketch: null, // id of the photo used for the sketch
    head: 'masterlink',
    std: true, // standard sling lengths (nearest), otherwise made to measure
    assembly: [
      { kind: 'shackle', id: 'auto' },
      { kind: 'sling', family: 'RS-PES', hitch: 'direct', id: 'auto' },
      { kind: 'shackle', id: 'auto' },
    ],
    lengths: {}, // { A: 4.5 }
  };
}

export const legIds = (st) => LEG_IDS.slice(0, Math.max(1, Math.min(8, Number(st.nPoints) || 1)));

/** Project of the full engine for the light state. */
export function toProject(st) {
  const p = defaultProject();
  const ids = legIds(st);
  const ld = p.load;
  ld.name = st.title || 'Load';
  ld.weight_t = Number(st.weight_t) || 0;
  ld.wcf = 1;
  ld.cog_mm = { x: 0, y: 0, z: 0 };
  ld.cogBasis = 'centred';
  ld.cogZUnknown = true;
  ld.liftPoints = ids.map((id) => ({ id, padeye: false, used: true, x: 0, y: 0, z: 0, picks: {} }));
  const L = Object.fromEntries(ids.map((id) => [id, Number(st.lengths?.[id]) > 0 ? Number(st.lengths[id]) : 3]));
  equalShareLayout(ld, L, ANGLE);
  const r = p.rigging;
  r.type = 'hook';
  r.equalShare = true;
  r.equalAngle_deg = ids.length === 1 ? 0 : ANGLE;
  r.design = { ...r.design, mode: 'angle', targetAngleV_deg: ANGLE, sizingAngleV_deg: ids.length === 1 ? null : ANGLE, roundLengths: st.std === false ? 'exact' : 'nearest', uniformLegs: false };
  r.assembly = (st.assembly || []).map((x) => ({ ...x }));
  r.legs = Object.fromEntries(ids.map((id) => [id, { Leff_m: L[id] }]));
  r.head = { ...(r.head || {}), type: st.head === 'hook' ? 'hook' : ids.length > 2 ? 'assembly' : 'masterlink', itemId: 'auto', subLinkItemId: 'auto', topShackle: false, unknownSWL: st.head === 'crane' };
  const f = Number(st.factor) > 0 ? Number(st.factor) : 1;
  p.factors = { applyDAF: true, dafMode: 'manual', dafManual: f, sklMode: 'manual', sklManual: 1, cogFactor: 1, extraFactor: 1 };
  p.crane = {};
  return p;
}

const KEEP = ['Shackles', 'Slings', 'Chains', 'G-links', 'Hooks', 'Master link', 'Rigging', 'Compatibility', 'Legs'];

/** Calculation: legs, equipment, checks (rigging + crane). */
export function compute(st) {
  const p = toProject(st);
  const res = computeProject(p);
  const rig = res.rig || {};
  const checks = (res.checks || []).filter((c) => KEEP.includes(c.cat) && !/pad ?eye|hole|padeye/i.test(c.label || ''));
  // crane: total hook load × factor ≤ SWL at the largest radius (and at the smallest)
  const W = Number(st.weight_t) || 0;
  const f = Number(st.factor) > 0 ? Number(st.factor) : 1;
  const rigW = Number(rig.rigWeight) || 0;
  const hook = (W + rigW) * f;
  const cr = st.crane || {};
  const crane = [];
  for (const [swl, r, name] of [[cr.swlMax_t, cr.rMax_m, 'max'], [cr.swlMin_t, cr.rMin_m, 'min']]) {
    if (!(Number(swl) > 0)) continue;
    const u = hook / Number(swl);
    crane.push({ cat: 'Crane', item: `SWL at ${name}. radius${Number(r) > 0 ? ` (${r} m)` : ''}`, label: `Hook load ${hook.toFixed(2)} t / SWL ${Number(swl).toFixed(2)} t`, util: u, status: u > 1 ? 'fail' : u > 0.9 ? 'warn' : 'ok' });
  }
  checks.forEach((c) => { if (typeof c.item === 'string') c.item = c.item.replace(/^Leg /, ''); });
  const legs = (rig.legs || []).filter((l) => l.level !== 'top');
  const all = [...crane, ...checks];
  const status = !W ? 'empty' : all.some((c) => c.status === 'fail') || rig.error ? 'fail' : all.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  return { project: p, res, rig, legs, checks: all, bom: res.bom || [], hook, rigW, perLeg: legs[0]?.Fdesign ?? null, status };
}
