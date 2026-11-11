// Tests du moteur de calcul — lancer avec : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distributeVertical, legTensions } from '../js/engine/statics.js';
import { dafDNV } from '../js/engine/factors.js';
import { chartCapacity, boomGeometry } from '../js/engine/crane.js';
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

test('répartition 2 points : règle du levier', () => {
  const { R } = distributeVertical([v3(0, 0, 0), v3(4, 0, 0)], v3(1, 0, 0), 10);
  near(R[0], 7.5);
  near(R[1], 2.5);
});

test('répartition 4 points symétrique', () => {
  const pts = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 2, 0), v3(0, 2, 0)];
  const { R } = distributeVertical(pts, v3(2, 1, 0), 10);
  R.forEach((r) => near(r, 2.5));
});

test('répartition 4 points COG excentré (plaque rigide)', () => {
  const pts = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 2, 0), v3(0, 2, 0)];
  const { R } = distributeVertical(pts, v3(1, 1, 0), 10);
  near(R.reduce((s, r) => s + r, 0), 10);
  near(R[0], 3.75); // bilinéaire : 10 × 0.75 × 0.5
  near(R[1], 1.25);
});

test('3 jambes : résolution exacte = équilibre vectoriel', () => {
  const pts = [v3(0, 0, 0), v3(3, 0, 0), v3(1, 2, 0)];
  const cog = v3(4 / 3, 2 / 3, 0);
  const top = v3(cog.x, cog.y, 3);
  const t = legTensions(top, pts, 9, cog);
  const sum = t.u.reduce((s, u, i) => ({ x: s.x + u.x * t.T[i], y: s.y + u.y * t.T[i], z: s.z + u.z * t.T[i] }), v3());
  near(sum.x, 0);
  near(sum.y, 0);
  near(sum.z, 9);
});

test('DAF DNV dans l\'air', () => {
  near(dafDNV(100, 'offshore'), 1.3);
  near(dafDNV(50, 'offshore'), 1.15 + 0.15 * Math.sqrt(2));
  near(dafDNV(200, 'offshore'), 1.25);
  near(dafDNV(50, 'onshore'), 1.1);
  near(dafDNV(100, 'inshore'), 1.12);
});

test('tableau de charge : lecture conservative et interpolation', () => {
  const chart = { columns: ['Base'], rows: [[10, 50], [12, 40], [14, 32]] };
  assert.equal(chartCapacity(chart, 11).capacity, 40);
  near(chartCapacity(chart, 11, 0, 'linear').capacity, 45);
  assert.equal(chartCapacity(chart, 15).status, 'beyond');
});

test('géométrie de flèche', () => {
  const g = boomGeometry({ boom: { length: 30, pivotHeight: 2, pivotOffset: 1 } }, 16);
  near(g.angle, 60, 1e-6);
  near(g.tipHeight, 2 + 30 * Math.sin(Math.PI / 3), 1e-6);
});

test('crochet direct 4 points symétrique à 60° : T = W/4 / sin60', () => {
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
  assert.ok(r.head.masterlink, 'masterlink choisi');
  assert.ok(r.rigWeight > 0);
});

test('palonnier 4 points : élingues basses verticales, compression = V/tan(angle)', () => {
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
  // élingues basses en V (2 par lug, écartées de 2 m en Y)
  bot.forEach((l) => assert.ok(l.angleH >= 59.5));
  const VA = r.spreader.VA;
  near(VA, 5 + r.legs.filter((l) => l.level === 'bottom').reduce((s, l) => s, 0), 0.2);
  top.forEach((l) => near(r.spreader.compression, l.Tstatic * Math.cos(l.angleH * Math.PI / 180), 1e-6));
});

test('sélection manille : compatibilité trou/axe', () => {
  const s = selectShackle(5, { holeDia: 30, padeyeThk: 30 }, DEFAULT_RULES);
  assert.equal(s.id, 'GP-G4163-8.5'); // la 6,5 t (axe Ø25) a trop de jeu dans un trou Ø30
  near(shackleSideLoadFactor(45), 0.7);
  near(shackleSideLoadFactor(90), 0.5);
});

test('calcul complet du projet exemple sans erreur bloquante de données', () => {
  const p = defaultProject();
  const res = computeProject(p);
  assert.ok(!res.rig.error, res.rig.error);
  assert.ok(res.checks.length > 5);
  assert.ok(res.bom.length >= 3);
  assert.ok(getItem('CR-A342-1in'));
});

import { estimateTilt } from '../js/engine/equilibrium.js';

test('assiette : symétrique = 0°, longueurs inégales = inclinaison', () => {
  const pts = [v3(-2, 0, 0), v3(2, 0, 0)];
  const cog = v3(0, 0, -0.5);
  near(estimateTilt(pts, cog, [4, 4]).tilt_deg, 0, 1e-6);
  const t = estimateTilt(pts, cog, [3.8, 4.2]);
  assert.ok(t.tilt_deg > 3, `tilt ${t.tilt_deg}`);
});

test('COG hors du polygone : réaction négative signalée', () => {
  const p = baseProject([['A', 0, 0, 0], ['B', 4000, 0, 0], ['C', 4000, 2000, 0], ['D', 0, 2000, 0]], { x: 5000, y: 1000, z: -500 });
  const res = computeProject(p);
  assert.ok(res.checks.some((c) => c.cat === 'Stabilité' && c.status === 'fail'));
});

test('offshore : DAF DNV appliqué aux jambes, pas à la grue', () => {
  const p = defaultProject();
  p.environment = 'offshore';
  const res = computeProject(p);
  const shl = res.rig.shl;
  near(res.rig.factors.daf, 1.15 + 0.15 * Math.sqrt(100 / shl), 1e-6);
  const crane = res.checks.find((c) => c.cat === 'Grue' && c.util != null && c.label.startsWith('Capacité'));
  near(crane.value, res.shlCrane, 0.01);
});
