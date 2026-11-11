// Crane: load chart reading and boom geometry.

/**
 * Capacity at radius R (m) in column col of the load chart.
 * chart = { columns: ['Hs 0 m', ...], rows: [[radius, cap1, cap2, ...], ...] }
 * mode 'step' (default, conservative): capacity of the first tabulated radius ≥ R (no interpolation)
 * mode 'linear': linear interpolation between the bracketing radii.
 */
export function chartCapacity(chart, R, col = 0, mode = 'step') {
  const rows = (chart?.rows || [])
    .map((r) => [Number(r[0]), Number(r[col + 1])])
    .filter((r) => isFinite(r[0]) && isFinite(r[1]) && r[1] > 0)
    .sort((a, b) => a[0] - b[0]);
  if (!rows.length || !(R >= 0)) return { capacity: null, status: 'nochart' };
  const rMin = rows[0][0], rMax = rows[rows.length - 1][0];
  if (R > rMax + 1e-9) return { capacity: 0, status: 'beyond', rMin, rMax };
  if (R < rMin - 1e-9) return { capacity: rows[0][1], status: 'below', rMin, rMax };
  const iHi = rows.findIndex((r) => r[0] >= R - 1e-9);
  if (mode === 'linear' && iHi > 0 && rows[iHi][0] > R) {
    const [r0, c0] = rows[iHi - 1], [r1, c1] = rows[iHi];
    return { capacity: c0 + ((c1 - c0) * (R - r0)) / (r1 - r0), status: 'ok', rMin, rMax, rUsed: R };
  }
  return { capacity: rows[iHi][1], status: 'ok', rMin, rMax, rUsed: rows[iHi][0] };
}

/**
 * Simplified lattice / telescopic boom geometry.
 * crane.boom = { length, pivotHeight, pivotOffset } (m) — radius measured from the slew axis.
 * Returns the boom angle (° to horizontal) and the boom tip height.
 */
export function boomGeometry(crane, R) {
  const L = Number(crane?.boom?.length) || 0;
  const hp = Number(crane?.boom?.pivotHeight) || 0;
  const a = Number(crane?.boom?.pivotOffset) || 0;
  const dx = R - a;
  if (!(L > 0)) return { valid: false, reason: 'Boom length not entered' };
  if (Math.abs(dx) > L) return { valid: false, reason: 'Radius beyond the geometric reach of the boom' };
  const angle = (Math.acos(dx / L) * 180) / Math.PI;
  const tipHeight = hp + Math.sqrt(L * L - dx * dx);
  return { valid: true, angle, tipHeight, pivot: { r: a, z: hp }, tip: { r: R, z: tipHeight } };
}

/** Maximum hook height (hook bearing point) under the boom tip. */
export function maxHookHeight(crane, R) {
  const g = boomGeometry(crane, R);
  if (!g.valid) return null;
  return g.tipHeight - (Number(crane?.minTipToHook) || 0);
}
