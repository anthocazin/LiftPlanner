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

/** Minimum / maximum radius of the load chart (m). */
export function chartRange(chart, col = 0) {
  const rows = (chart?.rows || []).map((r) => [Number(r[0]), Number(r[col + 1])]).filter((r) => isFinite(r[0]) && r[1] > 0).sort((a, b) => a[0] - b[0]);
  if (!rows.length) return null;
  return { rMin: rows[0][0], rMax: rows[rows.length - 1][0], capMax: Math.max(...rows.map((r) => r[1])) };
}
