// Rigging views: isometric, plan (top), front (XZ) and side (YZ) elevations.
import { svgDoc, fitter, line, poly, circle, text, label, path, dim, group, STEEL_DARK } from './svg.js';
import { fmt } from './fmt.js';

const C30 = Math.SQRT1_2, S30 = 1 / Math.sqrt(6);
export const PROJ = {
  iso: (p) => [(p.x + p.y) * C30, (p.x - p.y - 2 * p.z) * S30],
  plan: (p) => [p.x, -p.y],
  front: (p) => [p.x, -p.z],
  side: (p) => [p.y, -p.z],
};
export const VIEW_TITLES = {
  iso: 'Isometric view',
  plan: 'Plan view (X-Y)',
  front: 'Front elevation (X-Z)',
  side: 'Side elevation (Y-Z)',
};

const P = (x, y, z) => ({ x, y, z });

function boxCorners(load) {
  const o = load.origin_mm || {}, d = load.dims_mm || {};
  const x0 = (o.x || 0) / 1000, y0 = (o.y || 0) / 1000, z0 = (o.z || 0) / 1000;
  const x1 = x0 + (d.L || 0) / 1000, y1 = y0 + (d.W || 0) / 1000, z1 = z0 + (d.H || 0) / 1000;
  return { x0, y0, z0, x1, y1, z1 };
}

function boxFaces(b) {
  const c = (x, y, z) => P(x, y, z);
  return {
    top: [c(b.x0, b.y0, b.z1), c(b.x1, b.y0, b.z1), c(b.x1, b.y1, b.z1), c(b.x0, b.y1, b.z1)],
    bottom: [c(b.x0, b.y0, b.z0), c(b.x1, b.y0, b.z0), c(b.x1, b.y1, b.z0), c(b.x0, b.y1, b.z0)],
    xmax: [c(b.x1, b.y0, b.z0), c(b.x1, b.y1, b.z0), c(b.x1, b.y1, b.z1), c(b.x1, b.y0, b.z1)],
    ymin: [c(b.x0, b.y0, b.z0), c(b.x1, b.y0, b.z0), c(b.x1, b.y0, b.z1), c(b.x0, b.y0, b.z1)],
  };
}

function hookGlyph(x, y, s = 1) {
  // stylised crane hook, bearing point at (x, y)
  const d = `M ${x} ${y - 30 * s} L ${x} ${y - 14 * s} M ${x - 5 * s} ${y - 14 * s} h ${10 * s} v ${-8 * s} h ${-10 * s} z
    M ${x} ${y - 6 * s} C ${x + 10 * s} ${y - 6 * s} ${x + 11 * s} ${y + 8 * s} ${x} ${y + 8 * s} C ${x - 7 * s} ${y + 8 * s} ${x - 9 * s} ${y + 2 * s} ${x - 8 * s} ${y - 1 * s}`;
  return path(d, { fill: 'none', stroke: STEEL_DARK, 'stroke-width': 2.4 * s, 'stroke-linecap': 'round' }) +
    line(x, y - 14 * s, x, y - 6 * s, { stroke: STEEL_DARK, 'stroke-width': 2.4 * s });
}

function linkGlyph(x, yTop, len, w, color = STEEL_DARK) {
  const r = w / 2;
  return path(`M ${x - r} ${yTop + r} A ${r} ${r} 0 0 1 ${x + r} ${yTop + r} L ${x + r} ${yTop + len - r} A ${r} ${r} 0 0 1 ${x - r} ${yTop + len - r} Z`, {
    fill: 'none', stroke: color, 'stroke-width': 2.2,
  });
}

/** Small shackle symbol at the bottom of a sling, oriented along the sling (screen space). */
function shackleGlyph(p, dir, color = STEEL_DARK) {
  const [x, y] = p;
  const L = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / L, uy = dir[1] / L; // towards the top of the sling
  const nx = -uy, ny = ux;
  const len = 11, w = 5;
  const a = [x + nx * w, y + ny * w], b = [x - nx * w, y - ny * w];
  const tip = [x + ux * len, y + uy * len];
  return (
    path(`M ${a[0]} ${a[1]} Q ${a[0] + ux * len * 1.3} ${a[1] + uy * len * 1.3} ${tip[0]} ${tip[1]} Q ${b[0] + ux * len * 1.3} ${b[1] + uy * len * 1.3} ${b[0]} ${b[1]}`, {
      fill: 'none', stroke: color, 'stroke-width': 2,
    }) + line(a[0] - nx * 2, a[1] - ny * 2, b[0] + nx * 2, b[1] + ny * 2, { stroke: color, 'stroke-width': 2.6 })
  );
}

/**
 * Draws one view. opts: { width, height, labels, forces, dims }
 * Returns an SVG string.
 */
export function drawRiggingView(project, res, view = 'iso', opts = {}) {
  const W = opts.width || 620, H = opts.height || 440;
  const rig = res?.rig;
  const pr = PROJ[view];
  if (!rig || rig.error) return svgDoc(W, H, text(20, 30, rig?.error || 'No result', { fill: '#c0392b' }));
  const load = project.load;
  const b = boxCorners(load);
  const faces = boxFaces(b);
  const hook = rig.hook;
  const ml = rig.head?.masterlink;
  const mlLen = ml ? (ml.dims.insideLength || 0) / 1000 : 0;
  const subLen = rig.head?.useSub && rig.head.subLink ? (rig.head.subLink.dims.insideLength || 0) / 1000 : 0;
  const hookTop = P(hook.x, hook.y, hook.z + 1.2);

  // points used for framing
  const pts3 = [...faces.top, ...faces.bottom, hook, hookTop, ...rig.legs.map((l) => l.bottom)];
  const f = fitter(pts3.map(pr), W, H, 34, { top: 40, bottom: 34 });
  const pp = (p) => f(pr(p));
  let body = '';
  // label de-cluttering: shift down, or hide when no free slot is found
  const placed = [];
  const place = (x, y, w, h) => {
    for (let k = 0; k < 6; k++) {
      const yy = y + k * h;
      if (!placed.some((r) => x < r.x + r.w && x + w > r.x && yy - h < r.y && yy > r.y - r.h)) {
        placed.push({ x, y: yy, w, h });
        return [x, yy];
      }
    }
    return null;
  };

  // ---------- load
  const faceStyle = { stroke: '#4a5562', 'stroke-width': 1.1, 'stroke-linejoin': 'round' };
  if (view === 'iso') {
    body += poly(faces.ymin.map(pp), { ...faceStyle, fill: '#c9d3dd' });
    body += poly(faces.xmax.map(pp), { ...faceStyle, fill: '#b3c0cc' });
    body += poly(faces.top.map(pp), { ...faceStyle, fill: '#e2e8ee' });
  } else {
    const all = [...faces.top, ...faces.bottom].map(pp);
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    body += poly(
      [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]],
      { ...faceStyle, fill: '#e2e8ee' },
    );
  }
  // COG
  const cog = pp(rig.cog);
  body += circle(cog[0], cog[1], 7, { fill: '#fff', stroke: '#111', 'stroke-width': 1.2 }) +
    path(`M ${cog[0]} ${cog[1] - 7} A 7 7 0 0 1 ${cog[0] + 7} ${cog[1]} L ${cog[0]} ${cog[1]} Z M ${cog[0]} ${cog[1] + 7} A 7 7 0 0 1 ${cog[0] - 7} ${cog[1]} L ${cog[0]} ${cog[1]} Z`, { fill: '#111' });
  if (opts.labels !== false) body += label(cog[0] + 10, cog[1] + 4, 'COG', { 'font-size': 10, 'font-weight': 700 });

  // ---------- spreader bar
  if (rig.spreader) {
    const s = rig.spreader;
    const half = 0.09;
    const off = s.axis === 'x' ? P(0, half, 0) : P(half, 0, 0);
    const A0 = P(s.lugA.x - off.x, s.lugA.y - off.y, s.zBot), A1 = P(s.lugA.x + off.x, s.lugA.y + off.y, s.zBot);
    const B0 = P(s.lugB.x - off.x, s.lugB.y - off.y, s.zBot), B1 = P(s.lugB.x + off.x, s.lugB.y + off.y, s.zBot);
    const up = (p) => P(p.x, p.y, s.zTop);
    const facesBar = [
      [A0, B0, up(B0), up(A0)],
      [A1, B1, up(B1), up(A1)],
      [up(A0), up(B0), up(B1), up(A1)],
    ];
    facesBar.forEach((fc) => (body += poly(fc.map(pp), { fill: '#f0a35e', stroke: '#9b5a1d', 'stroke-width': 1 })));
    const mid = pp(P((s.lugA.x + s.lugB.x) / 2, (s.lugA.y + s.lugB.y) / 2, s.zTop));
    if (opts.labels !== false) body += label(mid[0], mid[1] - 6, `Spreader ${fmt(s.length)} m`, { 'text-anchor': 'middle', 'font-size': 10, fill: '#9b5a1d', 'font-weight': 700 });
  }

  // ---------- slings
  const convergeTop = (leg) => {
    if (leg.level === 'bottom') return leg.top;
    return P(leg.top.x, leg.top.y, leg.top.z - mlLen - subLen);
  };
  for (const leg of rig.legs) {
    const a = pp(leg.bottom);
    const t = pp(convergeTop(leg));
    const col = leg.comps.sling?.colorHex || '#2a5db0';
    body += line(a[0], a[1], t[0], t[1], { stroke: col, 'stroke-width': 4.2, 'stroke-linecap': 'round', opacity: 0.92 });
    body += line(a[0], a[1], t[0], t[1], { stroke: '#fff', 'stroke-width': 0.8, 'stroke-dasharray': '6 5', opacity: 0.7 });
    body += shackleGlyph(a, [t[0] - a[0], t[1] - a[1]]);
    if (leg.point) body += circle(a[0], a[1], 2.6, { fill: '#111' });
    if (opts.labels !== false) {
      const m = [a[0] + (t[0] - a[0]) * 0.32, a[1] + (t[1] - a[1]) * 0.32];
      const txt = opts.forces !== false ? `${leg.key} · ${fmt(leg.slingLength)} m · ${leg.angleH.toFixed(0)}° · ${fmt(leg.Fdesign)} t` : leg.key;
      const pos = place(m[0] + 6, m[1], txt.length * 5.4, 12);
      if (pos) body += label(pos[0], pos[1], txt, { 'font-size': 10, 'font-weight': 600, fill: '#1c2733' });
    }
  }
  if (opts.labels !== false)
    rig.pts.forEach((p) => {
      const a = pp(p.pos);
      body += label(a[0] - 4, a[1] + 15, p.id, { 'font-size': 11, 'font-weight': 800, fill: '#c0392b', 'text-anchor': 'middle' });
    });

  // ---------- head: master link / hook
  const ht = pp(hook);
  const htop = pp(hookTop);
  body += line(ht[0], ht[1] - 30, htop[0], htop[1], { stroke: '#555', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' });
  if (ml) {
    const bot = pp(P(hook.x, hook.y, hook.z - mlLen));
    const len = Math.max(bot[1] - ht[1], 12);
    body += linkGlyph(ht[0], ht[1], len, Math.max(len * 0.55, 8));
    if (subLen) {
      const sb = pp(P(hook.x, hook.y, hook.z - mlLen - subLen));
      const slen = Math.max(sb[1] - bot[1], 10);
      body += linkGlyph(ht[0] - 4, bot[1] - 2, slen, Math.max(slen * 0.5, 6), '#6b7785');
      body += linkGlyph(ht[0] + 4, bot[1] - 2, slen, Math.max(slen * 0.5, 6), '#6b7785');
    }
  }
  body += hookGlyph(ht[0], ht[1], 0.9);
  if (opts.labels !== false) {
    body += label(ht[0] + 14, ht[1] - 18, `Hook · ${fmt(res.shlCrane)} t (static)`, { 'font-size': 10, 'font-weight': 700 });
  }

  // ---------- dimensions (elevations)
  if (opts.dims !== false && (view === 'front' || view === 'side')) {
    const zPad = Math.max(...rig.pts.map((p) => p.pos.z));
    const xEdge = view === 'front' ? b.x1 + 0.4 : b.y1 + 0.4;
    const mk = (z) => (view === 'front' ? P(xEdge, 0, z) : P(0, xEdge, z));
    // dimensions to the right of the load (text outside) and under the load
    body += dim(pp(mk(hook.z)), pp(mk(zPad)), `${fmt(hook.z - zPad)} m`, { offset: 26, side: -1 });
    body += dim(pp(mk(b.z1)), pp(mk(b.z0)), `${fmt(b.z1 - b.z0)} m`, { offset: 8, side: -1, color: '#777' });
    const a1 = view === 'front' ? P(b.x0, 0, b.z0) : P(0, b.y0, b.z0);
    const a2 = view === 'front' ? P(b.x1, 0, b.z0) : P(0, b.y1, b.z0);
    body += dim(pp(a2), pp(a1), `${fmt(view === 'front' ? b.x1 - b.x0 : b.y1 - b.y0)} m`, { offset: 14, side: -1, color: '#777' });
  }
  if (view === 'plan' && opts.dims !== false) {
    body += dim(pp(P(b.x1, b.y0, 0)), pp(P(b.x0, b.y0, 0)), `${fmt(b.x1 - b.x0)} m`, { offset: 14, side: -1, color: '#777' });
    body += dim(pp(P(b.x0, b.y0, 0)), pp(P(b.x0, b.y1, 0)), `${fmt(b.y1 - b.y0)} m`, { offset: 14, side: -1, color: '#777' });
  }

  // ---------- axes
  body += axesGlyph(view, 16, H - 16);
  body += text(12, 20, VIEW_TITLES[view], { 'font-size': 12, 'font-weight': 700, fill: '#173a5e' });
  return svgDoc(W, H, body, { title: VIEW_TITLES[view] });
}

function axesGlyph(view, x, y) {
  const L = 22;
  const ax = {
    iso: [['X', PROJ.iso(P(1, 0, 0))], ['Y', PROJ.iso(P(0, 1, 0))], ['Z', PROJ.iso(P(0, 0, 1))]],
    plan: [['X', [1, 0]], ['Y', [0, -1]]],
    front: [['X', [1, 0]], ['Z', [0, -1]]],
    side: [['Y', [1, 0]], ['Z', [0, -1]]],
  }[view];
  const cols = { X: '#c0392b', Y: '#1f8f4e', Z: '#2a5db0' };
  return group(
    ax.map(([k, v]) => {
      const l = Math.hypot(v[0], v[1]) || 1;
      const e = [x + (v[0] / l) * L, y + (v[1] / l) * L];
      return line(x, y, e[0], e[1], { stroke: cols[k], 'stroke-width': 1.6 }) + text(e[0] + (v[0] / l) * 6 - 3, e[1] + (v[1] / l) * 6 + 4, k, { 'font-size': 10, fill: cols[k], 'font-weight': 700 });
    }).join(''),
    { transform: `translate(8,-8)` },
  );
}

export { group };
