// Simple solid model of the load: boxes and cylinders (solid or void), uniform density.
// COG = Σ V·c / Σ V (voids count negative). Dimensions in mm.

export function shapeVolume(sh) {
  if (sh.type === 'box') return Math.abs((sh.x1 - sh.x0) * (sh.y1 - sh.y0) * (sh.z1 - sh.z0));
  return Math.PI * (Number(sh.r) || 0) ** 2 * Math.abs(Number(sh.L) || 0);
}

export function shapeCentroid(sh) {
  if (sh.type === 'box') return { x: (sh.x0 + sh.x1) / 2, y: (sh.y0 + sh.y1) / 2, z: (sh.z0 + sh.z1) / 2 };
  const c = { x: +sh.cx || 0, y: +sh.cy || 0, z: +sh.cz || 0 };
  c[sh.axis || 'z'] += (Number(sh.L) || 0) / 2;
  return c;
}

export function shapeBounds(sh) {
  if (sh.type === 'box') return { x0: Math.min(sh.x0, sh.x1), x1: Math.max(sh.x0, sh.x1), y0: Math.min(sh.y0, sh.y1), y1: Math.max(sh.y0, sh.y1), z0: Math.min(sh.z0, sh.z1), z1: Math.max(sh.z0, sh.z1) };
  const ax = sh.axis || 'z', r = Number(sh.r) || 0, L = Number(sh.L) || 0;
  const c = { x: +sh.cx || 0, y: +sh.cy || 0, z: +sh.cz || 0 };
  const b = {};
  for (const k of ['x', 'y', 'z']) {
    const lo = k === ax ? Math.min(c[k], c[k] + L) : c[k] - r;
    const hi = k === ax ? Math.max(c[k], c[k] + L) : c[k] + r;
    b[`${k}0`] = lo;
    b[`${k}1`] = hi;
  }
  return b;
}

/** COG and volume of the solids (voids subtracted). Returns null when there is no solid. */
export function shapesCog(shapes = []) {
  let V = 0, mx = 0, my = 0, mz = 0;
  const box = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (const sh of shapes) {
    const v = shapeVolume(sh) * (sh.void ? -1 : 1);
    const c = shapeCentroid(sh);
    V += v;
    mx += v * c.x;
    my += v * c.y;
    mz += v * c.z;
    if (!sh.void) {
      const b = shapeBounds(sh);
      for (const k of ['x', 'y', 'z']) {
        box[`${k}0`] = Math.min(box[`${k}0`], b[`${k}0`]);
        box[`${k}1`] = Math.max(box[`${k}1`], b[`${k}1`]);
      }
    }
  }
  if (!(V > 0)) return null;
  return { x: mx / V, y: my / V, z: mz / V, volume_m3: V / 1e9, box };
}
