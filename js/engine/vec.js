// Petites opérations vectorielles 3D (unités libres, en pratique : m)

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vcross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vnorm = (a) => {
  const l = vlen(a);
  return l > 0 ? vscale(a, 1 / l) : v3();
};
export const vdist = (a, b) => vlen(vsub(a, b));
export const hdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** Résout A·x = b (A n×n) par élimination de Gauss avec pivot partiel. Retourne null si singulier. */
export function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Moindres carrés : min |A·x − b|² (A m×n, m ≥ n) via équations normales. */
export function leastSquares(A, b) {
  const n = A[0].length;
  const AtA = Array.from({ length: n }, () => new Array(n).fill(0));
  const Atb = new Array(n).fill(0);
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < n; j++) {
      Atb[j] += A[i][j] * b[i];
      for (let k = 0; k < n; k++) AtA[j][k] += A[i][j] * A[i][k];
    }
  }
  return solveLinear(AtA, Atb);
}

export const round = (v, d = 2) => {
  if (v == null || !isFinite(v)) return v;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
