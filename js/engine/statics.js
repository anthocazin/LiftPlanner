// Load sharing between lift points.
import { vsub, vlen, vnorm, solveLinear, leastSquares } from './vec.js';

/**
 * Vertical reactions at the lift points for a rigid load of weight W with its COG vertically
 * below the hook.
 *  - 1 point: the whole weight
 *  - 2 points: lever rule along line P1-P2 (projection of the COG)
 *  - ≥ 3 points: "rigid plate on equally stiff supports" R_i = a + b·x_i + c·y_i
 *    (exact for 3 points, classic assumption for 4 points and more → covered by the SKL)
 * Points are in plan (x, y). Returns { R: [...], collinear }.
 */
export function distributeVertical(points, cog, W) {
  const n = points.length;
  if (n === 0) return { R: [], collinear: false };
  if (n === 1) return { R: [W], collinear: false };
  if (n === 2) return { R: lever2(points[0], points[1], cog, W), collinear: true };

  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0;
  for (const p of points) {
    Sx += p.x; Sy += p.y; Sxx += p.x * p.x; Syy += p.y * p.y; Sxy += p.x * p.y;
  }
  const M = [
    [n, Sx, Sy],
    [Sx, Sxx, Sxy],
    [Sy, Sxy, Syy],
  ];
  const sol = solveLinear(M, [W, W * cog.x, W * cog.y]);
  if (!sol || !sol.every(isFinite)) {
    // collinear points: fall back to the two extreme points
    const [i, j] = farthestPair(points);
    const R = new Array(n).fill(0);
    const r2 = lever2(points[i], points[j], cog, W);
    R[i] = r2[0];
    R[j] = r2[1];
    return { R, collinear: true };
  }
  const [a, b, c] = sol;
  return { R: points.map((p) => a + b * p.x + c * p.y), collinear: false };
}

function lever2(p1, p2, cog, W) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return [W / 2, W / 2];
  const t = ((cog.x - p1.x) * dx + (cog.y - p1.y) * dy) / L2; // projected COG position along P1→P2
  return [W * (1 - t), W * t];
}

function farthestPair(points) {
  let best = [0, 1], d = -1;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const dd = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (dd > d) { d = dd; best = [i, j]; }
    }
  return best;
}

/** Horizontal (plan) distance from the COG to line P1-P2. */
export function offsetFromLine(p1, p2, c) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return Math.hypot(c.x - p1.x, c.y - p1.y);
  return Math.abs((c.x - p1.x) * dy - (c.y - p1.y) * dx) / L;
}

/**
 * Tensions in legs converging to one point (hook / spreader lug) carrying a vertical load W.
 *  - 2 legs: least squares on Σ T_i·u_i = (0,0,W) (exact if the COG is in the sling plane)
 *  - 3 legs: exact 3×3 solution
 *  - 4 legs and more: T_i = R_i · L_i / h_i with R_i from distributeVertical
 * top: convergence point; pts: bottom points (3D); R: vertical reactions (if already known).
 */
export function legTensions(top, pts, W, cog, R = null) {
  const n = pts.length;
  const u = pts.map((p) => vnorm(vsub(top, p))); // unit vector from bottom point upwards
  const L = pts.map((p) => vlen(vsub(top, p)));
  const h = pts.map((p) => top.z - p.z);
  let T;
  if (n === 2 || n === 3) {
    const A = [[], [], []];
    for (let i = 0; i < n; i++) {
      A[0].push(u[i].x); A[1].push(u[i].y); A[2].push(u[i].z);
    }
    T = n === 3 ? solveLinear(A, [0, 0, W]) : leastSquares(A, [0, 0, W]);
  }
  if (!T || !T.every(isFinite)) {
    const Rv = R || distributeVertical(pts, cog, W).R;
    T = Rv.map((r, i) => (h[i] > 1e-9 ? (r * L[i]) / h[i] : Infinity));
  }
  const Rv = T.map((t, i) => t * u[i].z);
  return { T, R: Rv, u, L, h };
}
