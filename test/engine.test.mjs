// Calculation engine tests — run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distributeVertical, legTensions } from '../js/engine/statics.js';
import { dafDNV } from '../js/engine/factors.js';
import { chartCapacity, chartRange } from '../js/engine/crane.js';
import { solveRigging } from '../js/engine/rigging.js';
import { computeProject } from '../js/engine/compute.js';
import { selectShackle, shackleSideLoadFactor, getItem } from '../js/catalog/index.js';
import { DEFAULT_RULES } from '../js/engine/checks.js';
import { v3 } from '../js/engine/vec.js';
import { defaultProject } from '../js/state.js';

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

function baseProject(points, cog, extra = {}) {
  const p = defaultProject();
  p.environment = 'onshore';
  p.factors = { dafMode: 'manual', dafManual: 1, sklMode: 'manual', sklManual: 1, cogFactor: 1, extraFactor: 1 };
  p.load.weight_t = 10;
  p.load.wcf = 1;
  p.load.cog_mm = cog;
  p.load.cogEnvelope_mm = { dx: 0, dy: 0 };
  p.load.liftPoints = points.map(([id, x, y, z]) => ({ id, x, y, z, swl_t: 20, used: true }));
  p.rigging = { ...p.rigging, type: 'hook', legs: {}, design: { mode: 'angle', targetAngle_deg: 60, roundLengths: 'exact' } };
  return Object.assign(p, extra);
}

test('2-point distribution: lever rule', () => {
  const { R } = distributeVertical([v3(0, 0, 0), v3(4, 0, 0)], v3(1, 0, 0), 10);
  near(R[0], 7.5);
  near(R[1], 2.5);
});

test('4-point symmetric distribution', () => {
  const pts = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 2, 0), v3(0, 2, 0)];
  const { R } = distributeVertical(pts, v3(2, 1, 0), 10);
  R.forEach((r) => near(r, 2.5));
});

test('4-point distribution with offset COG (rigid plate)', () => {
  const pts = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 2, 0), v3(0, 2, 0)];
  const { R } = distributeVertical(pts, v3(1, 1, 0), 10);
  near(R.reduce((s, r) => s + r, 0), 10);
  near(R[0], 3.75); // bilinear: 10 × 0.75 × 0.5
  near(R[1], 1.25);
});

test('3 legs: exact solution = vector equilibrium', () => {
  const pts = [v3(0, 0, 0), v3(3, 0, 0), v3(1, 2, 0)];
  const cog = v3(4 / 3, 2 / 3, 0);
  const top = v3(cog.x, cog.y, 3);
  const t = legTensions(top, pts, 9, cog);
  const sum = t.u.reduce((s, u, i) => ({ x: s.x + u.x * t.T[i], y: s.y + u.y * t.T[i], z: s.z + u.z * t.T[i] }), v3());
  near(sum.x, 0);
  near(sum.y, 0);
  near(sum.z, 9);
});

test('DNV DAF in air', () => {
  near(dafDNV(100, 'offshore'), 1.3);
  near(dafDNV(50, 'offshore'), 1.15 + 0.15 * Math.sqrt(2));
  near(dafDNV(200, 'offshore'), 1.25);
  near(dafDNV(50, 'onshore'), 1.1);
  near(dafDNV(100, 'inshore'), 1.12);
});

test('load chart: conservative reading and interpolation', () => {
  const chart = { columns: ['Base'], rows: [[10, 50], [12, 40], [14, 32]] };
  assert.equal(chartCapacity(chart, 11).capacity, 40);
  near(chartCapacity(chart, 11, 0, 'linear').capacity, 45);
  assert.equal(chartCapacity(chart, 15).status, 'beyond');
});

test('load chart range: min / max radius', () => {
  const r = chartRange({ rows: [[12, 40], [10, 50], [14, 32]] });
  assert.equal(r.rMin, 10);
  assert.equal(r.rMax, 14);
  assert.equal(chartCapacity({ rows: [[10, 50], [14, 32]] }, 8).status, 'below');
});

test('direct hook, symmetric 4 points at 60°: T = W/4 / sin60', () => {
  const p = baseProject(
    [['A', 0, 0, 0], ['B', 4000, 0, 0], ['C', 4000, 2000, 0], ['D', 0, 2000, 0]],
    { x: 2000, y: 1000, z: -500 },
  );
  const r = solveRigging(p, DEFAULT_RULES);
  assert.ok(!r.error, r.error);
  r.legs.forEach((l) => {
    near(l.angleH, 60, 0.3);
    near(l.Tstatic, 2.5 / Math.sin(l.angleH * Math.PI / 180), 1e-3);
  });
  assert.ok(r.head.masterlink, 'master link selected');
  assert.ok(r.rigWeight > 0);
});

test('4-point spreader bar: compression = horizontal component of top slings', () => {
  const p = baseProject(
    [['A', 0, 0, 0], ['B', 6000, 0, 0], ['C', 6000, 2000, 0], ['D', 0, 2000, 0]],
    { x: 3000, y: 1000, z: -500 },
  );
  p.rigging.type = 'spreader';
  p.rigging.spreader = { length_m: 6, depth_m: 0.3, weight_t: 0, wll_t: 30, axis: 'x', position: 'points', minTopAngle_deg: 60, bottomTargetAngle_deg: 60, minBottomHeight_m: 2 };
  const r = solveRigging(p, DEFAULT_RULES);
  assert.ok(!r.error, r.error);
  const top = r.legs.filter((l) => l.level === 'top');
  const bot = r.legs.filter((l) => l.level === 'bottom');
  assert.equal(top.length, 2);
  assert.equal(bot.length, 4);
  // bottom slings in a V (2 per lug, 2 m apart in Y)
  bot.forEach((l) => assert.ok(l.angleH >= 59.5));
  const VA = r.spreader.VA;
  near(VA, 5 + r.legs.filter((l) => l.level === 'bottom').reduce((s, l) => s, 0), 0.2);
  top.forEach((l) => near(r.spreader.compression, l.Tstatic * Math.cos(l.angleH * Math.PI / 180), 1e-6));
});

test('shackle selection: hole / pin compatibility', () => {
  const s = selectShackle(5, { holeDia: 30, padeyeThk: 30 }, DEFAULT_RULES);
  assert.equal(s.id, 'GP-G4163-8.5'); // the 6.5 t (pin Ø25) has too much clearance in a Ø30 hole
  near(shackleSideLoadFactor(45), 0.7);
  near(shackleSideLoadFactor(90), 0.5);
});

test('full calculation of the example project', () => {
  const p = defaultProject();
  const res = computeProject(p);
  assert.ok(!res.rig.error, res.rig.error);
  assert.ok(res.checks.length > 5);
  assert.ok(res.bom.length >= 3);
  assert.ok(getItem('CR-A342-1in'));
});

import { estimateTilt } from '../js/engine/equilibrium.js';

test('load tilt: symmetric = 0°, unequal lengths = tilt', () => {
  const pts = [v3(-2, 0, 0), v3(2, 0, 0)];
  const cog = v3(0, 0, -0.5);
  near(estimateTilt(pts, cog, [4, 4]).tilt_deg, 0, 1e-6);
  const t = estimateTilt(pts, cog, [3.8, 4.2]);
  assert.ok(t.tilt_deg > 3, `tilt ${t.tilt_deg}`);
});

test('COG outside the lift point polygon: negative reaction reported', () => {
  const p = baseProject([['A', 0, 0, 0], ['B', 4000, 0, 0], ['C', 4000, 2000, 0], ['D', 0, 2000, 0]], { x: 5000, y: 1000, z: -500 });
  const res = computeProject(p);
  assert.ok(res.checks.some((c) => c.cat === 'Stability' && c.status === 'fail'));
});

test('offshore: DNV DAF applied to the legs, not to the crane', () => {
  const p = defaultProject();
  p.environment = 'offshore';
  const res = computeProject(p);
  const shl = res.rig.shl;
  near(res.rig.factors.daf, 1.15 + 0.15 * Math.sqrt(100 / shl), 1e-6);
  const crane = res.checks.find((c) => c.cat === 'Crane' && c.util != null && c.label.startsWith('SWL'));
  near(crane.value, res.shlCrane, 0.01);
});

import { selectSling, bendingRatio, listSlingFamily } from '../js/catalog/index.js';

test('DS Levage catalogue: sling families and wide body shackles', () => {
  const wire = selectSling(5, 'direct', 'WIRE');
  assert.equal(wire.type, 'wiresling');
  assert.ok(wire.wll_t >= 5 && wire.wll_t < 6.5, `wire sling ${wire.wll_t}`);
  assert.ok(listSlingFamily('RS-UHMWPE').every((s) => s.type === 'roundsling'));
  assert.equal(selectSling(30, 'direct', 'GROMMET').type, 'grommet');
  const wb = selectShackle(10, {}, { ...DEFAULT_RULES, shackleRanges: ['WIDE'] });
  assert.equal(wb.wll_t, 12.5);
  near(bendingRatio({ type: 'wiresling', dims: { ropeDia: 24 } }, 48), 2);
});

test('wire rope rigging: smaller shackle bow than rope gives a D/d warning', () => {
  const p = baseProject([['A', 0, 0, 0], ['B', 4000, 0, 0], ['C', 4000, 2000, 0], ['D', 0, 2000, 0]], { x: 2000, y: 1000, z: -500 });
  p.rigging.assembly = [{ kind: 'shackle', id: 'auto' }, { kind: 'sling', family: 'WIRE', id: 'auto', hitch: 'direct' }, { kind: 'shackle', id: 'auto' }];
  const res = computeProject(p);
  assert.ok(!res.rig.error, res.rig.error);
  assert.ok(res.rig.legs.every((l) => l.comps.sling.type === 'wiresling'));
  assert.ok(res.rig.rigWeight > 0);
});

test('quad master link assembly from the catalogue carries the sub-links', () => {
  const p = defaultProject();
  p.rigging.head = { type: 'assembly', itemId: 'auto', subLinkItemId: 'auto', topShackle: false };
  const res = computeProject(p);
  const h = res.rig.head;
  assert.ok(h.masterlink);
  if (h.integrated) assert.ok(h.subLink && h.masterlink.sub);
});

import { chainLinks, selectChain, selectConnlink, enModeFactor, connectorLength } from '../js/catalog/index.js';
import { migrate } from '../js/state.js';

test('chain assembly: shackle → connecting link → chain → connecting link → shackle', () => {
  const p = baseProject([['A', 0, 0, 0], ['B', 4000, 0, 0], ['C', 4000, 2000, 0], ['D', 0, 2000, 0]], { x: 2000, y: 1000, z: -500 });
  p.rigging.design = { mode: 'angle', targetAngleV_deg: 30, roundLengths: 'exact' };
  p.rigging.head = { type: 'masterlink', itemId: 'auto' };
  p.rigging.assembly = [
    { kind: 'shackle', id: 'auto' }, { kind: 'connlink', id: 'auto' }, { kind: 'chain', family: 'CH-G80', id: 'auto', hitch: 'direct' },
    { kind: 'connlink', id: 'auto' }, { kind: 'shackle', id: 'auto' },
  ];
  const r = solveRigging(p, DEFAULT_RULES);
  assert.ok(!r.error, r.error);
  r.legs.forEach((l) => {
    const ch = l.parts[2];
    assert.equal(ch.item.type, 'chain');
    assert.ok(Number.isInteger(ch.links) && ch.links > 0);
    near(ch.length_m, (ch.links * ch.item.dims.pitch) / 1000, 1e-9);
    // connecting links match the chain size and grade
    [l.parts[1], l.parts[3]].forEach((c) => assert.ok(c.item.chainDias.includes(ch.item.dims.dia)));
    // bearing-to-bearing length = connectors + chain + head
    const hw = connectorLength(l.parts[0].item, 'hole') + 2 * connectorLength(l.parts[1].item) + connectorLength(l.parts[4].item, 'link') + r.head.headLen;
    near(l.Leff, hw + ch.length_m, 1e-9);
    // the chain length is within half a link of the requirement
    assert.ok(Math.abs(l.slingLengthReq - ch.length_m) <= ch.item.dims.pitch / 2000 + 1e-9);
    near(l.angleV, 30, 1.5);
  });
});

test('chain catalogue helpers', () => {
  const c = selectChain(5, 'direct', 'CH-G80');
  assert.equal(c.dims.dia, 13);
  assert.equal(selectChain(5, 'choke', 'CH-G80').dims.dia, 16);
  const cl = selectConnlink(4, c);
  assert.ok(cl.chainDias.includes(13));
  assert.equal(chainLinks(c, 1.0).n, 26); // 1000 / 39 = 25.6 → 26 links
  assert.equal(enModeFactor(4, 30), 2.1);
  assert.equal(enModeFactor(2, 50), 1.0);
  assert.equal(enModeFactor(3, 61), null);
});

test('no padeye: padeye checks skipped', () => {
  const p = defaultProject();
  p.load.liftPoints.forEach((pt) => (pt.padeye = false));
  const res = computeProject(p);
  assert.ok(!res.checks.some((c) => c.cat === 'Lift points'));
  assert.ok(!res.checks.some((c) => c.cat === 'Compatibility' && /hole|Padeye/.test(c.label)));
});

test('example padeye upsizes the shackle for the hole', () => {
  const res = computeProject(defaultProject());
  res.rig.legs.forEach((l) => assert.equal(l.parts[0].item.dims.pinDia, 28));
});

test('DAF can be switched off; EN mode factor check present', () => {
  const p = defaultProject();
  p.environment = 'offshore';
  p.factors.applyDAF = false;
  const res = computeProject(p);
  assert.equal(res.rig.factors.daf, 1);
  assert.ok(res.checks.some((c) => c.cat === 'Factors' && /EN mode factor/.test(c.label)));
});

test('angle to the vertical: warn above 30°, fail above 45°', () => {
  const mk = (a) => {
    const p = baseProject([['A', 0, 0, 0], ['B', 4000, 0, 0]], { x: 2000, y: 0, z: -500 });
    p.rigging.design = { mode: 'angle', targetAngleV_deg: a, roundLengths: 'exact' };
    return computeProject(p).checks.filter((c) => c.cat === 'Angles').map((c) => c.status);
  };
  assert.ok(mk(25).every((s) => s === 'ok'));
  assert.ok(mk(38).every((s) => s === 'warn'));
  assert.ok(mk(50).every((s) => s === 'fail'));
});

test('v2 project file migrates to leg assemblies', () => {
  const v2 = {
    schema: 2,
    rigging: {
      type: 'hook', slingFamily: 'WIRE', headType: 'masterlink', masterlink: { itemId: 'auto', subLinks: false },
      design: { mode: 'angle', targetAngle_deg: 60, roundLengths: 'set' },
      legs: { A: { topConnector: 'shackle', mode: 'choke' }, B: { topConnector: 'shackle', mode: 'choke' } },
    },
    rules: { minSlingAngleFail_deg: 45 },
    load: { liftPoints: [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 4000, y: 0, z: 0 }], weight_t: 5, cog_mm: { x: 2000, y: 0, z: -500 } },
  };
  const p = migrate(v2);
  assert.equal(p.schema, 3);
  assert.equal(p.rigging.design.targetAngleV_deg, 30);
  assert.equal(p.rigging.head.type, 'masterlink');
  assert.deepEqual(p.rigging.assembly.map((x) => x.kind), ['shackle', 'sling', 'shackle']);
  assert.equal(p.rigging.assembly[1].family, 'WIRE');
  assert.equal(p.rigging.assembly[1].hitch, 'choke');
  assert.equal(p.rules.maxAngleV_deg, 45);
  const res = computeProject(p);
  assert.ok(!res.rig.error, res.rig.error);
});

import { niceName, listPadeyes, shackleCompatibility as compat } from '../js/catalog/index.js';
import { draw3d } from '../js/draw/view3d.js';
import { shapesSvg, defaultShape, dragHandle } from '../js/draw/shapes.js';

test('standard pad eyes type S and the H ≤ 106 % pin rule', () => {
  const pe = listPadeyes().find((p) => p.wll_t === 8.5);
  assert.equal(pe.dims.H, 29.5);
  assert.equal(listPadeyes().length, 17);
  const sh = getItem('GP-G4163-8.5');
  const iss = compat(sh, { holeDia: 32, padeyeThk: 35 }, { ...DEFAULT_RULES, maxHoleRatio: 1.06 });
  assert.ok(iss.some((i) => i.code === 'hole-ratio' || i.code === 'clearance'));
  assert.ok(!compat(sh, { holeDia: 29.5, padeyeThk: 35 }, { ...DEFAULT_RULES, maxHoleRatio: 1.06 }).length);
});

test('static load shared between the legs and lengths needed for the target / max angle', () => {
  const res = computeProject(defaultProject());
  const legs = res.rig.legs;
  near(legs.reduce((s, l) => s + l.share, 0), 1, 1e-6);
  legs.forEach((l) => {
    assert.ok(l.need.target.L > l.need.max.L, 'a smaller angle needs a longer leg');
    near(l.need.target.elem, l.need.target.L - l.hwLength, 1e-9);
  });
  // the most spread leg is exactly at the target angle with the target length
  const t = legs.map((l) => Math.asin(Math.hypot(l.top.x - l.bottom.x, l.top.y - l.bottom.y) / l.need.target.L) * 180 / Math.PI);
  near(Math.max(...t), 30, 1e-6);
});

test('simple equipment names', () => {
  assert.equal(niceName(getItem('GP-G4163-17')), 'Shackle 17t');
  assert.match(niceName(selectChain(5, 'direct', 'CH-G80')), /^Chain Ø13 G80$/);
  assert.match(niceName(selectSling(8, 'direct', 'RS-PES'), { length_m: 6 }), /^Roundsling 8t — 6 m$/);
});

test('3D view and storyboard shapes render', () => {
  const p = defaultProject();
  const svg = draw3d(p, computeProject(p), { width: 500, height: 400 });
  assert.ok(svg.startsWith('<svg') && svg.includes('COG') && svg.includes('Hook'));
  const r = defaultShape('rect', 0, 0);
  dragHandle(r, 'size', 3, 2);
  near(r.w, 6);
  near(r.h, 4);
  const s = shapesSvg([r, defaultShape('arc', 0, 0), { ...defaultShape('text', 1, 1), text: '<b>x</b>' }]);
  assert.ok(s.includes('<polygon') && s.includes(' A ') && s.includes('&lt;b&gt;'));
});

import { combinePicks } from '../js/ui/loadsetup.js';

test('lift point 3D coordinates combined from the top, front and side views', () => {
  const t = {};
  const d = combinePicks(t, { xy: [400, 350], xz: [410, 2200], yz: [340, 2190] });
  assert.deepEqual([t.x, t.y, t.z], [405, 345, 2195]);
  assert.equal(d.dx, 10);
});
