// SVG generation (strings): used on screen, in the report and for export.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const n = (v) => (Math.round(v * 100) / 100).toString();

export function attrs(o = {}) {
  return Object.entries(o)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${k}="${esc(typeof v === 'number' ? n(v) : v)}"`)
    .join(' ');
}

export const line = (x1, y1, x2, y2, a = {}) => `<line ${attrs({ x1, y1, x2, y2, stroke: '#333', ...a })}/>`;
export const rect = (x, y, w, h, a = {}) => `<rect ${attrs({ x, y, width: w, height: h, ...a })}/>`;
export const circle = (cx, cy, r, a = {}) => `<circle ${attrs({ cx, cy, r, ...a })}/>`;
export const poly = (pts, a = {}) => `<polygon ${attrs({ points: pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' '), ...a })}/>`;
export const polyline = (pts, a = {}) => `<polyline ${attrs({ points: pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' '), fill: 'none', ...a })}/>`;
export const path = (d, a = {}) => `<path ${attrs({ d, ...a })}/>`;
export const text = (x, y, s, a = {}) => `<text ${attrs({ x, y, 'font-size': 11, fill: '#1c2733', ...a })}>${esc(s)}</text>`;
export const group = (body, a = {}) => `<g ${attrs(a)}>${body}</g>`;

/** Text with a white halo so it stays readable over lines. */
export const label = (x, y, s, a = {}) =>
  text(x, y, s, { stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round', ...a });

export function svgDoc(w, h, body, { bg = '#ffffff', title = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" font-family="system-ui, Segoe UI, Arial, sans-serif">${
    title ? `<title>${esc(title)}</title>` : ''
  }<rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`;
}

/** Fits a set of 2D points (model units, y down) into a w×h frame. */
export function fitter(points, w, h, margin = 30, extra = {}) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (!isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
  const top = extra.top ?? margin, bottom = extra.bottom ?? margin;
  const sx = (w - 2 * margin) / Math.max(x1 - x0, 1e-6);
  const sy = (h - top - bottom) / Math.max(y1 - y0, 1e-6);
  const s = Math.min(sx, sy);
  const ox = margin + ((w - 2 * margin) - (x1 - x0) * s) / 2;
  const oy = top + ((h - top - bottom) - (y1 - y0) * s) / 2;
  const f = (p) => [ox + (p[0] - x0) * s, oy + (p[1] - y0) * s];
  f.scale = s;
  return f;
}

/** Dimension line with arrows and text. */
export function dim(p1, p2, txt, { offset = 14, color = '#3b6ea5', side = 1 } = {}) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * offset * side, ny = (dx / L) * offset * side;
  const a = [p1[0] + nx, p1[1] + ny], b = [p2[0] + nx, p2[1] + ny];
  const ux = dx / L, uy = dy / L;
  const ah = 6;
  const arrow = (p, s) =>
    poly([p, [p[0] - s * ux * ah - uy * 3, p[1] - s * uy * ah + ux * 3], [p[0] - s * ux * ah + uy * 3, p[1] - s * uy * ah - ux * 3]], { fill: color });
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  return (
    line(p1[0], p1[1], a[0], a[1], { stroke: color, 'stroke-width': 0.6 }) +
    line(p2[0], p2[1], b[0], b[1], { stroke: color, 'stroke-width': 0.6 }) +
    line(a[0], a[1], b[0], b[1], { stroke: color, 'stroke-width': 0.8 }) +
    arrow(b, 1) +
    arrow(a, -1) +
    label(mid[0], mid[1] - 3, txt, { 'text-anchor': 'middle', fill: color, 'font-size': 10, transform: `rotate(${ang.toFixed(1)} ${mid[0].toFixed(1)} ${(mid[1] - 3).toFixed(1)})` })
  );
}

/** Converts an SVG string to PNG (Blob) through a canvas. */
export function svgToPng(svgString, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * scale;
      c.height = img.height * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Invalid SVG'));
    img.src = url;
  });
}

export const STEEL = '#7d8996';
export const STEEL_DARK = '#4a5562';
