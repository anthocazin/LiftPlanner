// Répartition des efforts entre points de levage.
import { vsub, vlen, vnorm, solveLinear, leastSquares } from './vec.js';

/**
 * Réactions verticales aux points de levage pour une charge rigide de poids W dont le COG est
 * à la verticale du crochet.
 *  - 1 point : tout le poids
 *  - 2 points : règle du levier sur la droite P1-P2 (projection du COG)
 *  - ≥ 3 points : hypothèse "plaque rigide sur appuis de même raideur" R_i = a + b·x_i + c·y_i
 *    (exacte pour 3 points, hypothèse classique pour 4 points et plus → à couvrir par le SKL)
 * Les points sont en plan (x, y). Retourne { R: [...], collinear }.
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
    // points alignés : on se ramène aux deux points extrêmes
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
  const t = ((cog.x - p1.x) * dx + (cog.y - p1.y) * dy) / L2; // position du COG projeté sur P1→P2
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

/** Distance horizontale (en plan) du COG à la droite P1-P2. */
export function offsetFromLine(p1, p2, c) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return Math.hypot(c.x - p1.x, c.y - p1.y);
  return Math.abs((c.x - p1.x) * dy - (c.y - p1.y) * dx) / L;
}

/**
 * Tensions dans des jambes convergeant en un point (crochet / œil de palonnier) qui supportent
 * une charge verticale W.
 *  - 2 jambes : moindres carrés sur Σ T_i·u_i = (0,0,W) (exact si COG dans le plan des élingues)
 *  - 3 jambes : résolution exacte 3×3
 *  - 4 jambes et + : T_i = R_i · L_i / h_i avec R_i issus de distributeVertical
 * top : point de convergence ; pts : points bas (3D) ; R : réactions verticales (si déjà calculées).
 */
export function legTensions(top, pts, W, cog, R = null) {
  const n = pts.length;
  const u = pts.map((p) => vnorm(vsub(top, p))); // vecteur unitaire du point bas vers le haut
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
