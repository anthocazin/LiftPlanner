// COG deduced from the leg lengths: with known lengths (lift point → hook) the hook is where the legs
// meet, and the load hangs with its COG straight under the hook. Used for a lift plan of the
// engineering office, whose leg lengths already put the hook above the COG.
import { usedLiftPoints, legAssembly, isLengthPart, solveRigging } from './rigging.js';

/**
 * Point where legs of lengths L meet above the lift points P (m): exact for 1 and 2 legs (the hook
 * in the vertical plane of the 2 points), least squares for 3 legs and more. Legs without a length
 * (null) are ignored. Returns { x, y, z, rms } or null.
 */
export function hookFromLegs(P, L) {
  const idx = P.map((_, i) => i).filter((i) => Number(L[i]) > 0);
  if (!idx.length) return null;
  if (idx.length === 1) { const p = P[idx[0]]; return { x: p.x, y: p.y, z: p.z + Number(L[idx[0]]), rms: 0 }; }
  if (idx.length === 2) {
    const [a, b] = idx.map((i) => P[i]);
    const [La, Lb] = idx.map((i) => Number(L[i]));
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-6) return null;
    const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    // circles centred (0, za) radius La and (d, zb) radius Lb in the vertical plane
    const dz = b.z - a.z, D = Math.hypot(d, dz);
    if (D > La + Lb || D < Math.abs(La - Lb)) return null;
    const t = (La * La - Lb * Lb + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, La * La - t * t));
    const ex = d / D, ez = dz / D; // unit a → b in the plane
    // the two solutions: ± h along the normal; the upper one is kept
    const s1 = { s: t * ex - h * ez, z: a.z + t * ez + h * ex };
    const s2 = { s: t * ex + h * ez, z: a.z + t * ez - h * ex };
    const s = s1.z >= s2.z ? s1 : s2;
    return { x: a.x + ux * s.s, y: a.y + uy * s.s, z: s.z, rms: 0 };
  }
  // 3 legs and more: Levenberg–Marquardt on Σ (|H − Pi| − Li)²
  const pts = idx.map((i) => P[i]), Ls = idx.map((i) => Number(L[i]));
  const mean = (f) => pts.reduce((t, p) => t + f(p), 0) / pts.length;
  let H = [mean((p) => p.x), mean((p) => p.y), Math.max(...pts.map((p) => p.z)) + Ls.reduce((a, b) => a + b, 0) / Ls.length * 0.8];
  let lambda = 1e-3;
  const cost = (h) => pts.reduce((t, p, i) => t + (Math.hypot(h[0] - p.x, h[1] - p.y, h[2] - p.z) - Ls[i]) ** 2, 0);
  let c0 = cost(H);
  for (let it = 0; it < 200; it++) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    pts.forEach((p, i) => {
      const v = [H[0] - p.x, H[1] - p.y, H[2] - p.z];
      const n = Math.hypot(...v) || 1e-9;
      const r = n - Ls[i];
      const J = v.map((x) => x / n);
      for (let a = 0; a < 3; a++) { g[a] += J[a] * r; for (let b = 0; b < 3; b++) A[a][b] += J[a] * J[b]; }
    });
    for (let a = 0; a < 3; a++) A[a][a] += lambda * (1 + A[a][a]);
    const dlt = solve3(A, g.map((x) => -x));
    if (!dlt) break;
    const Hn = H.map((x, a) => x + dlt[a]);
    const c1 = cost(Hn);
    if (c1 < c0) { H = Hn; lambda = Math.max(1e-9, lambda / 3); if (c0 - c1 < 1e-14) { c0 = c1; break; } c0 = c1; } else lambda *= 4;
    if (Math.hypot(...dlt) < 1e-9) break;
  }
  return { x: H[0], y: H[1], z: H[2], rms: Math.sqrt(c0 / pts.length) };
}

function solve3(A, b) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-18) return null;
  return [0, 1, 2].map((c) => det(A.map((row, r) => row.map((v, k) => (k === c ? b[r] : v)))) / D);
}

/**
 * COG (mm) of a load whose leg lengths are known: x, y under the hook, z kept. The lengths are the
 * imposed lengths (lift point → hook) or, for a locked sling length, the sling plus its hardware
 * (one trial calculation). Returns { cog, hook, n } or { error }.
 */
export function cogFromLegs(project, rules) {
  const ld = project.load || {};
  const rig = project.rigging || {};
  if (rig.type === 'spreader') return { error: 'COG from the leg lengths: only for legs on the hook (no spreader bar)' };
  const pts = usedLiftPoints(ld);
  if (!pts.length) return { error: 'No active lift point' };
  const kind = pts.map((p) => (Number(rig.legs?.[p.id]?.Leff_m) > 0 ? 'imp' : legAssembly(rig, p.id, 'main').some((x) => isLengthPart(x) && x.lock && Number(x.length_m) > 0) ? 'lock' : null));
  const n = kind.filter(Boolean).length;
  if (n < Math.min(3, pts.length)) return { error: `COG deduced from the leg lengths: give the length of ${pts.length >= 3 ? 'at least 3 legs' : 'every leg'}` };
  const c0 = ld.cog_mm || {};
  let cog = { x: +c0.x || 0, y: +c0.y || 0, z: +c0.z || 0 };
  if (!(Math.abs(cog.x) + Math.abs(cog.y) > 0)) { cog.x = Math.round(pts.reduce((t, p) => t + p.x, 0) / pts.length); cog.y = Math.round(pts.reduce((t, p) => t + p.y, 0) / pts.length); }
  let hook = null;
  const anyLock = kind.includes('lock');
  for (let it = 0; it < 4; it++) {
    let L;
    if (!anyLock) L = pts.map((p, i) => (kind[i] ? Number(rig.legs[p.id].Leff_m) : null));
    else {
      const r = solveRigging({ ...project, load: { ...ld, cog_mm: cog, cogBasis: 'drawing' } }, rules);
      if (r.error) return { error: r.error };
      L = pts.map((p, i) => (kind[i] ? r.legs.find((l) => l.pointId === p.id && l.level !== 'top')?.Leff ?? null : null));
    }
    hook = hookFromLegs(pts.map((p) => p.pos), L);
    if (!hook) return { error: 'COG deduced from the leg lengths: the legs given cannot meet (lengths too short for the distance between the points?)' };
    // the hook must be above the lift points (the COG of a hung load is inside them)
    const xs = pts.map((p) => p.pos.x), ys = pts.map((p) => p.pos.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.5);
    if (hook.x < Math.min(...xs) - 0.25 * span || hook.x > Math.max(...xs) + 0.25 * span || hook.y < Math.min(...ys) - 0.25 * span || hook.y > Math.max(...ys) + 0.25 * span || hook.rms > 0.05 * span + 0.05) {
      return { error: 'COG deduced from the leg lengths: the legs do not meet above the lift points — check the lengths (m) and the positions (mm)' };
    }
    const next = { x: Math.round(hook.x * 1000), y: Math.round(hook.y * 1000), z: cog.z };
    const done = Math.hypot(next.x - cog.x, next.y - cog.y) < 0.5;
    cog = next;
    if (!anyLock || done) break;
  }
  return { cog, hook, n };
}

/**
 * Simplified method (lift plan of the engineering office, COG taken as centred): the lift points are
 * laid out evenly around the COG (4 legs: square), each leg at `angleDeg` to the vertical with its
 * length (m, lift point → hook). lengths: { pointId: L }. Moves the points of `ld`; false if a
 * length is missing.
 */
export function equalShareLayout(ld, lengths, angleDeg) {
  const pts = (ld.liftPoints || []).filter((q) => q.used !== false);
  const n = pts.length;
  if (!n) return false;
  const a = ((n === 1 ? 0 : Number(angleDeg) || 30) * Math.PI) / 180;
  const geo = pts.map((q, i) => {
    const L = Number(lengths[q.id]);
    if (!(L > 0)) return null;
    const phi = (2 * Math.PI * i) / n + (n === 4 ? Math.PI / 4 : n === 3 ? Math.PI / 2 : 0);
    return { q, x: L * Math.sin(a) * Math.cos(phi), y: L * Math.sin(a) * Math.sin(phi), drop: L * Math.cos(a) };
  });
  if (geo.some((g) => !g)) return false;
  const c = ld.cog_mm || { x: 0, y: 0, z: 0 };
  const H = Math.max(...geo.map((g) => g.drop));
  geo.forEach((g) => {
    g.q.x = Math.round((+c.x || 0) + g.x * 1000);
    g.q.y = Math.round((+c.y || 0) + g.y * 1000);
    g.q.z = Math.round((H - g.drop) * 1000);
  });
  return true;
}
