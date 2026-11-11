// Estimate of the attitude (tilt) of a suspended load with given sling lengths.
// Model: rigid body rotating about its COG, hook vertically above the COG, inextensible slings.
// 1–3 legs: exact solution; 4 legs and more: least squares (≈ equally stiff slings), with
// detection of slack slings.
import { vsub, vlen, vcross, vnorm, solveLinear, deg } from './vec.js';

function rotX(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z };
}
function rotY(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}
function rotAxis(v, k, a) {
  // Rodrigues
  const c = Math.cos(a), s = Math.sin(a);
  const kv = vcross(k, v);
  const kd = k.x * v.x + k.y * v.y + k.z * v.z;
  return {
    x: v.x * c + kv.x * s + k.x * kd * (1 - c),
    y: v.y * c + kv.y * s + k.y * kd * (1 - c),
    z: v.z * c + kv.z * s + k.z * kd * (1 - c),
  };
}

/**
 * pts: lift points (m), cog: COG (m), L: effective lengths (m).
 * Returns: { tilt_deg, tiltX_deg, tiltY_deg, hz, residual_mm[], slack[] }
 */
export function estimateTilt(pts, cog, L) {
  const n = pts.length;
  const rel = pts.map((p) => vsub(p, cog));
  if (n === 0) return null;
  if (n === 1) {
    const d = Math.hypot(rel[0].x, rel[0].y);
    const t = deg(Math.atan2(d, Math.max(rel[0].z, 1e-6)));
    return { tilt_deg: t, tiltX_deg: null, tiltY_deg: null, residual_mm: [0], slack: [] };
  }
  let k = null;
  if (n === 2) k = vnorm(vcross(vsub(pts[1], pts[0]), { x: 0, y: 0, z: 1 }));
  const rotate = (v, q) => (n === 2 ? rotAxis(v, k, q[0]) : rotY(rotX(v, q[0]), q[1]));
  const nq = n === 2 ? 2 : 3;

  const residual = (q, active) =>
    active.map((i) => {
      const p = rotate(rel[i], q);
      return vlen(vsub({ x: 0, y: 0, z: q[nq - 1] }, p)) - L[i];
    });

  const fit = (active) => {
    const hz0 =
      active.reduce((s, i) => {
        const d = Math.hypot(rel[i].x, rel[i].y);
        return s + rel[i].z + Math.sqrt(Math.max(L[i] * L[i] - d * d, 0));
      }, 0) / active.length;
    let q = n === 2 ? [0, hz0] : [0, 0, hz0];
    for (let it = 0; it < 40; it++) {
      const r = residual(q, active);
      const J = active.map(() => new Array(nq).fill(0));
      const h = 1e-7;
      for (let j = 0; j < nq; j++) {
        const qp = [...q];
        qp[j] += h;
        const rp = residual(qp, active);
        rp.forEach((v, i) => (J[i][j] = (v - r[i]) / h));
      }
      const JtJ = Array.from({ length: nq }, () => new Array(nq).fill(0));
      const Jtr = new Array(nq).fill(0);
      for (let i = 0; i < active.length; i++)
        for (let a = 0; a < nq; a++) {
          Jtr[a] -= J[i][a] * r[i];
          for (let b = 0; b < nq; b++) JtJ[a][b] += J[i][a] * J[i][b];
        }
      for (let a = 0; a < nq; a++) JtJ[a][a] += 1e-10;
      const dq = solveLinear(JtJ, Jtr);
      if (!dq) break;
      q = q.map((v, i) => v + dq[i]);
      if (Math.hypot(...dq) < 1e-10) break;
    }
    return q;
  };

  let active = pts.map((_, i) => i);
  let q = fit(active);
  const slack = [];
  // 4 legs and more: a sling longer than needed goes slack and the others carry the load
  for (let pass = 0; pass < n - 3 && n >= 4; pass++) {
    const all = residual(q, pts.map((_, i) => i));
    let worst = -1, wv = -2e-3;
    all.forEach((r, i) => {
      if (active.includes(i) && r < wv) { wv = r; worst = i; }
    });
    if (worst < 0) break;
    slack.push(worst);
    active = active.filter((i) => i !== worst);
    q = fit(active);
  }
  const zAxis = rotate({ x: 0, y: 0, z: 1 }, q);
  const tilt = deg(Math.acos(Math.min(1, Math.abs(zAxis.z))));
  const res = residual(q, pts.map((_, i) => i)).map((r) => r * 1000);
  return {
    tilt_deg: tilt,
    tiltX_deg: n === 2 ? null : deg(q[0]),
    tiltY_deg: n === 2 ? null : deg(q[1]),
    tiltAxis: n === 2 ? 'axis ⟂ to the 2 points' : null,
    hz: q[nq - 1],
    residual_mm: res,
    slack,
  };
}
