// Storyboard annotation shapes, to scale (site frame in metres, X right, Y up).
// Rendered in "SVG site coordinates" (x, −y): wrap in a transform to place them in a drawing.
export const SHAPE_TYPES = {
  rect: 'Rectangle',
  circle: 'Circle',
  line: 'Line',
  arc: 'Arc',
  triangle: 'Triangle',
  text: 'Text',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toString();
const col = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : d);
const rad = (d) => (d * Math.PI) / 180;

export function defaultShape(type, x, y) {
  const base = { id: `S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type, x, y, rot: 0, stroke: '#1c2733', fill: type === 'text' || type === 'line' || type === 'arc' ? 'none' : '#9aa5b1', fillOpacity: 0.35, lw: 2, dash: false };
  if (type === 'rect' || type === 'triangle') return { ...base, w: 4, h: 3 };
  if (type === 'circle') return { ...base, r: 2 };
  if (type === 'arc') return { ...base, r: 3, a0: 0, a1: 90 };
  if (type === 'line') return { ...base, x2: x + 4, y2: y };
  return { ...base, text: 'Text', size: 1, stroke: '#1c2733' };
}

/** Points of a triangle (isosceles, apex up before rotation). */
function triPts(s) {
  const a = rad(s.rot || 0), c = Math.cos(a), sn = Math.sin(a);
  return [[0, s.h / 2], [-s.w / 2, -s.h / 2], [s.w / 2, -s.h / 2]].map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
}
function rectPts(s) {
  const a = rad(s.rot || 0), c = Math.cos(a), sn = Math.sin(a);
  return [[-s.w / 2, -s.h / 2], [s.w / 2, -s.h / 2], [s.w / 2, s.h / 2], [-s.w / 2, s.h / 2]].map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
}

/** Handle positions (site coords) for resizing. */
export function shapeHandles(s) {
  switch (s.type) {
    case 'rect': return [{ k: 'size', p: rectPts(s)[2] }];
    case 'triangle': return [{ k: 'size', p: rectPts(s)[2] }];
    case 'circle': return [{ k: 'r', p: [s.x + s.r, s.y] }];
    case 'arc': return [{ k: 'a0', p: [s.x + s.r * Math.cos(rad(s.a0)), s.y + s.r * Math.sin(rad(s.a0))] }, { k: 'a1', p: [s.x + s.r * Math.cos(rad(s.a1)), s.y + s.r * Math.sin(rad(s.a1))] }];
    case 'line': return [{ k: 'p1', p: [s.x, s.y] }, { k: 'p2', p: [s.x2, s.y2] }];
    default: return [];
  }
}

/** Applies a handle drag (site coords). */
export function dragHandle(s, k, x, y) {
  if (k === 'p1') { s.x = x; s.y = y; }
  else if (k === 'p2') { s.x2 = x; s.y2 = y; }
  else if (k === 'r') s.r = Math.max(0.05, Math.hypot(x - s.x, y - s.y));
  else if (k === 'a0' || k === 'a1') { s[k] = Math.round(((Math.atan2(y - s.y, x - s.x) * 180) / Math.PI) * 10) / 10; s.r = Math.max(0.05, Math.hypot(x - s.x, y - s.y)); }
  else if (k === 'size') {
    const a = rad(-(s.rot || 0)), dx = x - s.x, dy = y - s.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    s.w = Math.max(0.05, Math.abs(lx) * 2);
    s.h = Math.max(0.05, Math.abs(ly) * 2);
  }
}

export function moveShape(s, dx, dy) {
  s.x += dx;
  s.y += dy;
  if (s.type === 'line') { s.x2 += dx; s.y2 += dy; }
}

/** SVG of the shapes in site-SVG coordinates (x, −y). sel = selected id (handles drawn), u = 1 px in m. */
export function shapesSvg(shapes = [], { sel = null, u = 0.05, interactive = false } = {}) {
  let s = '';
  for (const sh of shapes) {
    const st = `stroke="${col(sh.stroke, '#1c2733')}" stroke-width="${n(sh.lw || 2)}" vector-effect="non-scaling-stroke" ${sh.dash ? 'stroke-dasharray="6 4"' : ''}`;
    const fl = sh.fill && sh.fill !== 'none' ? `fill="${col(sh.fill, '#9aa5b1')}" fill-opacity="${n(sh.fillOpacity ?? 0.35)}"` : 'fill="none"';
    const attrs = interactive ? ` data-shape="${esc(sh.id)}" class="grab"` : '';
    let body = '';
    if (sh.type === 'rect') body = `<polygon points="${rectPts(sh).map(([x, y]) => `${n(x)},${n(-y)}`).join(' ')}" ${fl} ${st}/>`;
    else if (sh.type === 'triangle') body = `<polygon points="${triPts(sh).map(([x, y]) => `${n(x)},${n(-y)}`).join(' ')}" ${fl} ${st}/>`;
    else if (sh.type === 'circle') body = `<circle cx="${n(sh.x)}" cy="${n(-sh.y)}" r="${n(sh.r)}" ${fl} ${st}/>`;
    else if (sh.type === 'line') body = `<line x1="${n(sh.x)}" y1="${n(-sh.y)}" x2="${n(sh.x2)}" y2="${n(-sh.y2)}" ${st}/>${interactive ? `<line x1="${n(sh.x)}" y1="${n(-sh.y)}" x2="${n(sh.x2)}" y2="${n(-sh.y2)}" stroke="transparent" stroke-width="12" vector-effect="non-scaling-stroke"/>` : ''}`;
    else if (sh.type === 'arc') {
      const a0 = rad(sh.a0 || 0), a1 = rad(sh.a1 ?? 90);
      let sweep = a1 - a0;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const p0 = [sh.x + sh.r * Math.cos(a0), sh.y + sh.r * Math.sin(a0)], p1 = [sh.x + sh.r * Math.cos(a0 + sweep), sh.y + sh.r * Math.sin(a0 + sweep)];
      const d = `M ${n(p0[0])} ${n(-p0[1])} A ${n(sh.r)} ${n(sh.r)} 0 ${sweep > Math.PI ? 1 : 0} 0 ${n(p1[0])} ${n(-p1[1])}`;
      body = `<path d="${d}" fill="none" ${st}/>${interactive ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" vector-effect="non-scaling-stroke"/>` : ''}`;
    } else if (sh.type === 'text') {
      body = `<text x="${n(sh.x)}" y="${n(-sh.y)}" font-size="${n(sh.size || 1)}" fill="${col(sh.stroke, '#1c2733')}" font-family="Arial, sans-serif" ${sh.rot ? `transform="rotate(${n(-sh.rot)} ${n(sh.x)} ${n(-sh.y)})"` : ''}>${esc(sh.text || '')}</text>`;
    }
    s += `<g${attrs}>${body}</g>`;
    if (sel === sh.id) {
      for (const h of shapeHandles(sh)) s += `<rect data-handle="${h.k}" x="${n(h.p[0] - 5 * u)}" y="${n(-h.p[1] - 5 * u)}" width="${n(10 * u)}" height="${n(10 * u)}" fill="#fff" stroke="#e8822a" stroke-width="2" vector-effect="non-scaling-stroke" class="grab"/>`;
      s += `<circle cx="${n(sh.x)}" cy="${n(-sh.y)}" r="${n(3 * u)}" fill="#e8822a" pointer-events="none"/>`;
    }
  }
  return s;
}
