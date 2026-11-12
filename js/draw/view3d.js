// 3D view of the load and its rigging (orthographic, orbitable). Pure SVG string generator.
// The drawing views imported on the Load page are projected on their planes (top on the top face,
// front on the front face, side on the right face), so the part can be "seen" in 3D.
import { esc } from './svg.js';

const rad = (d) => (d * Math.PI) / 180;
const n = (v) => (Math.round(v * 100) / 100).toString();
const SAFE_IMG = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export const DEFAULT_CAM = { yaw: -35, pitch: 24, zoom: 1, panX: 0, panY: 0 };

function envelope(load) {
  const o = load.origin_mm || {}, d = load.dims_mm || {};
  const x0 = +o.x || 0, y0 = +o.y || 0, z0 = +o.z || 0;
  return { x0, y0, z0, x1: x0 + (+d.L || 0), y1: y0 + (+d.W || 0), z1: z0 + (+d.H || 0) };
}

/** Camera transform: world mm → { sx, sy (up), d (towards the viewer) } before fitting. */
function camera(cam, c) {
  const cy = Math.cos(rad(cam.yaw)), sy = Math.sin(rad(cam.yaw));
  const cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
  return (p) => {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    return { sx: x1, sy: z * cp + y1 * sp, d: -y1 * cp + z * sp };
  };
}

/**
 * opts: { width, height, cam, drawings (bool), labels (bool), forces (bool), title }
 * Returns an SVG string.
 */
/** Box given by the frames of the drawing views (per axis, the envelope where no view gives it). */
function viewsBox(load, e) {
  const vs = load.views || {};
  const ext = (v) => {
    if (!v?.image || !(v.s > 0)) return null;
    const kf = v.flipH ? -1 : 1;
    const a0 = (0 - v.ou) * v.s * kf, a1 = (v.w - v.ou) * v.s * kf;
    return { a0: Math.min(a0, a1), a1: Math.max(a0, a1), b0: (v.ov - v.h) * v.s, b1: v.ov * v.s };
  };
  const t = ext(vs.xy), f = ext(vs.xz), sd = ext(vs.yz);
  const pick = (...c) => c.find(Boolean);
  const rx = pick(t && [t.a0, t.a1], f && [f.a0, f.a1], [e.x0, e.x1]);
  const ry = pick(t && [t.b0, t.b1], sd && [sd.a0, sd.a1], [e.y0, e.y1]);
  const rz = pick(f && [f.b0, f.b1], sd && [sd.b0, sd.b1], [e.z0, e.z1]);
  return { x0: rx[0], x1: rx[1], y0: ry[0], y1: ry[1], z0: rz[0], z1: rz[1], any: !!(t || f || sd) };
}

export function draw3d(project, res, opts = {}) {
  const W = opts.width || 640, H = opts.height || 460;
  const cam = { ...DEFAULT_CAM, ...(opts.cam || {}) };
  const load = project.load || {};
  const rig = res?.rig && !res.rig.error ? res.rig : null;
  const env = envelope(load);
  const vb = viewsBox(load, env);
  const e = vb.any ? vb : env; // with drawings, the planes and extents follow the frames of the views
  const P = (x, y, z) => ({ x, y, z });
  const M = (v) => P(v.x * 1000, v.y * 1000, v.z * 1000); // m → mm
  const pts = (load.liftPoints || []).filter((p) => p.used !== false);
  const cog = load.cog_mm || {};
  // scene extents
  const all = [P(e.x0, e.y0, e.z0), P(e.x1, e.y1, e.z1)];
  pts.forEach((p) => all.push(P(+p.x || 0, +p.y || 0, +p.z || 0)));
  if (rig) all.push(M(rig.hook), M({ ...rig.hook, z: rig.hook.z + 0.6 }));
  const c = { x: (Math.min(...all.map((q) => q.x)) + Math.max(...all.map((q) => q.x))) / 2, y: (Math.min(...all.map((q) => q.y)) + Math.max(...all.map((q) => q.y))) / 2, z: (Math.min(...all.map((q) => q.z)) + Math.max(...all.map((q) => q.z))) / 2 };
  const pr = camera(cam, c);
  // fit (independent of the yaw so that orbiting does not "breathe")
  const span = Math.max(...all.map((q) => Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z))) * 2 || 1000;
  const k = (Math.min(W, H - 30) / span) * 0.95 * cam.zoom;
  const ox = W / 2 + (cam.panX || 0), oy = (H + 18) / 2 + (cam.panY || 0);
  const S = (p) => {
    const q = pr(p);
    return { x: ox + q.sx * k, y: oy - q.sy * k, d: q.d };
  };
  const items = []; // { d, svg }
  const push = (d, svg) => items.push({ d, svg });
  const u = 1; // px
  const poly = (ps, a) => `<polygon points="${ps.map((q) => `${n(q.x)},${n(q.y)}`).join(' ')}" ${a}/>`;

  // ground grid at the underside of the load
  const g0 = Math.max(e.x1 - e.x0, e.y1 - e.y0, 2000);
  const step = g0 > 8000 ? 2000 : g0 > 3000 ? 1000 : 500;
  let grid = '';
  const gx0 = Math.floor((e.x0 - g0 * 0.4) / step) * step, gx1 = e.x1 + g0 * 0.4, gy0 = Math.floor((e.y0 - g0 * 0.4) / step) * step, gy1 = e.y1 + g0 * 0.4;
  for (let x = gx0; x <= gx1; x += step) { const a = S(P(x, gy0, e.z0)), b = S(P(x, gy1, e.z0)); grid += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`; }
  for (let y = gy0; y <= gy1; y += step) { const a = S(P(gx0, y, e.z0)), b = S(P(gx1, y, e.z0)); grid += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`; }
  let body = `<g stroke="#e4e9ef" stroke-width="${u}">${grid}</g>`;
  // shadow
  const sh = [P(e.x0, e.y0, e.z0), P(e.x1, e.y0, e.z0), P(e.x1, e.y1, e.z0), P(e.x0, e.y1, e.z0)].map(S);
  body += poly(sh, 'fill="#1c2733" fill-opacity=".08"');

  // ---- load envelope: faces with flat shading
  const hasBox = e.x1 > e.x0 && e.y1 > e.y0 && e.z1 > e.z0;
  const views = load.views || {};
  const showDw = opts.drawings !== false && Object.values(views).some((v) => v?.image);
  const cyw = Math.cos(rad(cam.yaw)), syw = Math.sin(rad(cam.yaw)), cpp = Math.cos(rad(cam.pitch)), spp = Math.sin(rad(cam.pitch));
  const view = [-syw * cpp, -cyw * cpp, spp]; // direction towards the viewer
  const face = (corners, nrm, shade, { fillOp = 0.9, isVoid = false } = {}) => {
    const facing = nrm[0] * view[0] + nrm[1] * view[1] + nrm[2] * view[2];
    const sp2 = corners.map(S);
    const d = sp2.reduce((s2, q) => s2 + q.d, 0) / sp2.length - (facing > 0 ? 0 : 1e9);
    const light = Math.max(0, nrm[0] * -0.3 + nrm[1] * -0.5 + nrm[2] * 0.8);
    const col = Math.round(150 + 80 * (shade ?? 0.5 + 0.5 * light));
    if (isVoid) { if (facing > 0) push(d + 2, poly(sp2, 'fill="none" stroke="#7b3fb0" stroke-width="1" stroke-dasharray="4 3"')); return; }
    push(d, poly(sp2, `fill="rgb(${col - 12},${col},${Math.min(255, col + 20)})" fill-opacity="${facing > 0 ? fillOp : 0.18}" stroke="#4a5562" stroke-width="${facing > 0 ? 1 : 0.5}" stroke-linejoin="round" ${facing > 0 ? '' : 'stroke-dasharray="4 3"'}`));
  };
  const boxFaces = (b, o = {}) => {
    const V = (x, y, z) => P(x ? b.x1 : b.x0, y ? b.y1 : b.y0, z ? b.z1 : b.z0);
    face([V(0, 0, 1), V(1, 0, 1), V(1, 1, 1), V(0, 1, 1)], [0, 0, 1], 0.95, o);
    face([V(0, 0, 0), V(1, 0, 0), V(1, 1, 0), V(0, 1, 0)], [0, 0, -1], 0.55, o);
    face([V(0, 0, 0), V(1, 0, 0), V(1, 0, 1), V(0, 0, 1)], [0, -1, 0], 0.8, o);
    face([V(0, 1, 0), V(1, 1, 0), V(1, 1, 1), V(0, 1, 1)], [0, 1, 0], 0.7, o);
    face([V(0, 0, 0), V(0, 1, 0), V(0, 1, 1), V(0, 0, 1)], [-1, 0, 0], 0.66, o);
    face([V(1, 0, 0), V(1, 1, 0), V(1, 1, 1), V(1, 0, 1)], [1, 0, 0], 0.76, o);
  };
  const cylFaces = (sh, o = {}) => {
    const ax = sh.axis || 'z', r = +sh.r || 0, Lc = +sh.L || 0, N = 24;
    const c = { x: +sh.cx || 0, y: +sh.cy || 0, z: +sh.cz || 0 };
    const [u1, u2] = ['x', 'y', 'z'].filter((k) => k !== ax);
    const pt = (t, along) => { const q = { ...c }; q[u1] += r * Math.cos(t); q[u2] += r * Math.sin(t); q[ax] += along; return P(q.x, q.y, q.z); };
    const nv = (t) => { const q = { x: 0, y: 0, z: 0 }; q[u1] = Math.cos(t); q[u2] = Math.sin(t); return [q.x, q.y, q.z]; };
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * 2 * Math.PI, t1 = ((i + 1) / N) * 2 * Math.PI;
      face([pt(t0, 0), pt(t1, 0), pt(t1, Lc), pt(t0, Lc)], nv((t0 + t1) / 2), null, o);
    }
    const cap = (along, sign) => { const q = [0, 0, 0]; q['xyz'.indexOf(ax)] = sign; face(Array.from({ length: N }, (_, i) => pt((i / N) * 2 * Math.PI, along)), q, 0.9, o); };
    cap(0, Lc >= 0 ? -1 : 1);
    cap(Lc, Lc >= 0 ? 1 : -1);
  };
  const shapes = (load.shapes || []).filter(Boolean);
  if (shapes.length) {
    for (const sh of shapes) {
      const o = { isVoid: !!sh.void, fillOp: showDw ? 0.55 : 0.92 };
      if (sh.type === 'box') boxFaces({ x0: Math.min(sh.x0, sh.x1), x1: Math.max(sh.x0, sh.x1), y0: Math.min(sh.y0, sh.y1), y1: Math.max(sh.y0, sh.y1), z0: Math.min(sh.z0, sh.z1), z1: Math.max(sh.z0, sh.z1) }, o);
      else cylFaces(sh, o);
    }
  } else if (hasBox && !showDw) boxFaces(e, { fillOp: 0.9 }); // with the drawings shown they are the part: no box over them
  // ---- drawing views projected on their planes
  if (showDw) {
    const planes = {
      xy: (a, b) => P(a, b, e.z1 || e.z0),
      xz: (a, b) => P(a, e.y0, b),
      yz: (a, b) => P(e.x1, a, b),
    };
    for (const [key, v] of Object.entries(views)) {
      if (!v?.image || !SAFE_IMG.test(v.image) || !(v.s > 0) || !planes[key]) continue;
      const kf = v.flipH ? -1 : 1;
      const at = (px, py) => S(planes[key]((px - v.ou) * v.s * kf, (v.ov - py) * v.s));
      const o0 = at(0, 0), ou = at(1, 0), ovv = at(0, 1);
      const m = [ou.x - o0.x, ou.y - o0.y, ovv.x - o0.x, ovv.y - o0.y, o0.x, o0.y];
      const centre = at(v.w / 2, v.h / 2);
      push(centre.d + 1, `<image href="${v.image}" width="${v.w}" height="${v.h}" preserveAspectRatio="none" transform="matrix(${m.map(n).join(' ')})" opacity="0.8" style="mix-blend-mode:multiply"/>`);
    }
  }

  // ---- COG
  const cg = S(P(+cog.x || 0, +cog.y || 0, +cog.z || 0));
  const r = 8;
  push(cg.d + 5e8, `<g transform="translate(${n(cg.x)} ${n(cg.y)})"><circle r="${r}" fill="#fff" stroke="#111" stroke-width="1.4"/><path d="M0 0 L${r} 0 A${r} ${r} 0 0 1 0 ${r} Z M0 0 L${-r} 0 A${r} ${r} 0 0 1 0 ${-r} Z" fill="#111"/>${opts.labels !== false ? `<text x="${r + 4}" y="${-r}" font-size="11" font-weight="800" paint-order="stroke" stroke="#fff" stroke-width="3">COG</text>` : ''}</g>`);

  // ---- rigging
  if (rig) {
    const hk = S(M(rig.hook));
    const head = rig.head || {};
    const mlLen = ((head.masterlink?.dims?.insideLength || 0) + (head.useSub ? head.subLink?.dims?.insideLength || 0 : 0)) * k;
    const labels = [];
    for (const leg of rig.legs) {
      const a = S(M(leg.bottom));
      let t = S(M(leg.top));
      if (leg.level !== 'bottom' && !head.onHook) t = { ...t, y: t.y + Math.min(mlLen, 0.4 * Math.hypot(t.x - a.x, t.y - a.y)) };
      const col = leg.lengthKind === 'chain' ? '#4a5562' : esc(leg.comps?.sling?.colorHex || '#2a5db0');
      const d = (a.d + t.d) / 2 + 1e6;
      let s = `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(t.x)}" y2="${n(t.y)}" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/>`;
      s += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(t.x)}" y2="${n(t.y)}" stroke="${col}" stroke-width="4" stroke-linecap="round"${leg.lengthKind === 'chain' ? ' stroke-dasharray="3 2"' : ''}/>`;
      // shackle glyph at the lift point
      if (leg.parts?.[0]?.kind === 'shackle') {
        const ang = Math.atan2(t.y - a.y, t.x - a.x);
        const gx = a.x + Math.cos(ang) * 9, gy = a.y + Math.sin(ang) * 9;
        s += `<circle cx="${n(gx)}" cy="${n(gy)}" r="5" fill="none" stroke="#4a5562" stroke-width="2.2"/>`;
      }
      push(d, s);
      if (opts.labels !== false) {
        const mx = a.x + (t.x - a.x) * 0.26, my = a.y + (t.y - a.y) * 0.26;
        // legs seen on top of each other share one label
        const g = labels.find((q) => Math.hypot(q.ax - a.x, q.ay - a.y) < 4 && Math.hypot(q.tx - t.x, q.ty - t.y) < 4);
        if (g) g.legs.push(leg);
        else labels.push({ ax: a.x, ay: a.y, tx: t.x, ty: t.y, mx, my, d: d + 2e8, legs: [leg] });
      }
    }
    for (const q of labels) {
      const keys = q.legs.map((l) => l.key).join('/');
      const same = q.legs.every((l) => Math.abs(l.Leff - q.legs[0].Leff) < 0.005);
      const len = same ? `${q.legs[0].Leff.toFixed(2)} m` : q.legs.map((l) => `${l.Leff.toFixed(2)}`).join(' / ') + ' m';
      const txt = opts.forces !== false ? `${keys} · ${len} · ${q.legs[0].angleV.toFixed(0)}°` : keys;
      push(q.d, `<text x="${n(q.mx + 7)}" y="${n(q.my)}" font-size="10.5" font-weight="700" fill="#173a5e" paint-order="stroke" stroke="#fff" stroke-width="3.2">${esc(txt)}</text>`);
    }
    if (rig.spreader) {
      const sa = S(M(rig.spreader.lugA)), sb = S(M(rig.spreader.lugB));
      push((sa.d + sb.d) / 2 + 1.5e6, `<line x1="${n(sa.x)}" y1="${n(sa.y)}" x2="${n(sb.x)}" y2="${n(sb.y)}" stroke="#9b5a1d" stroke-width="9" stroke-linecap="round"/><line x1="${n(sa.x)}" y1="${n(sa.y)}" x2="${n(sb.x)}" y2="${n(sb.y)}" stroke="#e8a35e" stroke-width="5" stroke-linecap="round"/>`);
    }
    // head: master link, hook, rope
    let h = '';
    if (!head.onHook && head.masterlink) {
      const L = Math.max(mlLen, 16), w = Math.max(L * 0.55, 9);
      h += `<rect x="${n(hk.x - w / 2)}" y="${n(hk.y)}" width="${n(w)}" height="${n(L)}" rx="${n(w / 2)}" fill="none" stroke="#4a5562" stroke-width="3"/>`;
    }
    h += `<path d="M ${n(hk.x)} ${n(hk.y - 2)} C ${n(hk.x + 11)} ${n(hk.y - 2)} ${n(hk.x + 12)} ${n(hk.y - 18)} ${n(hk.x)} ${n(hk.y - 18)} L ${n(hk.x)} ${n(hk.y - 30)}" fill="none" stroke="#7a5a10" stroke-width="3.2" stroke-linecap="round"/>`;
    h += `<rect x="${n(hk.x - 8)}" y="${n(hk.y - 44)}" width="16" height="14" rx="2" fill="#f2c14e" stroke="#7a5a10"/>`;
    h += `<line x1="${n(hk.x)}" y1="${n(hk.y - 44)}" x2="${n(hk.x)}" y2="${n(Math.max(4, hk.y - 120))}" stroke="#333" stroke-width="1.2"/>`;
    if (opts.labels !== false) h += `<text x="${n(hk.x + 14)}" y="${n(hk.y - 22)}" font-size="10.5" font-weight="700" fill="#7a5a10" paint-order="stroke" stroke="#fff" stroke-width="3">Hook · ${res.shlCrane?.toFixed(2) ?? ''} t</text>`;
    push(hk.d + 3e8, h);
    // vertical through the COG
    const cgHook = S(P(+cog.x || 0, +cog.y || 0, rig.hook.z * 1000));
    push(-5e8, `<line x1="${n(cg.x)}" y1="${n(cg.y)}" x2="${n(cgHook.x)}" y2="${n(cgHook.y)}" stroke="#7a5a10" stroke-width="0.8" stroke-dasharray="5 4" opacity=".7"/>`);
  }
  // ---- lift points
  const ptLbl = [];
  for (const p of pts) {
    const a = S(P(+p.x || 0, +p.y || 0, +p.z || 0));
    push(a.d + 4e8, `<circle cx="${n(a.x)}" cy="${n(a.y)}" r="4.2" fill="${p.padeye === false ? '#1f6fb2' : '#c0392b'}" stroke="#fff" stroke-width="1.4"/>`);
    const g = ptLbl.find((q) => Math.hypot(q.x - a.x, q.y - a.y) < 6);
    if (g) g.ids.push(p.id);
    else ptLbl.push({ x: a.x, y: a.y, d: a.d + 4.5e8, ids: [p.id] });
  }
  if (opts.labels !== false)
    for (const q of ptLbl) push(q.d, `<text x="${n(q.x - 6)}" y="${n(q.y + 15)}" font-size="11.5" font-weight="800" fill="#c0392b" paint-order="stroke" stroke="#fff" stroke-width="3" text-anchor="middle">${esc(q.ids.join('/'))}</text>`);
  items.sort((a, b) => a.d - b.d);
  body += items.map((i) => i.svg).join('');

  // ---- axes triad
  const tri = (dx, dy, dz) => { const q = pr(P(c.x + dx, c.y + dy, c.z + dz)); return [q.sx, -q.sy]; };
  const ax = [['X', tri(1, 0, 0), '#c0392b'], ['Y', tri(0, 1, 0), '#1f8f4e'], ['Z', tri(0, 0, 1), '#2a5db0']];
  const bx = 34, by = H - 30;
  body += ax.map(([t, v, col]) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    const x2 = bx + (v[0] / l) * 22 * Math.min(1, l), y2 = by + (v[1] / l) * 22 * Math.min(1, l);
    return `<line x1="${bx}" y1="${by}" x2="${n(x2)}" y2="${n(y2)}" stroke="${col}" stroke-width="1.8"/><text x="${n(x2 + (v[0] / l) * 6 - 3)}" y="${n(y2 + (v[1] / l) * 6 + 4)}" font-size="10" fill="${col}" font-weight="700">${t}</text>`;
  }).join('');
  const title = opts.title ?? '3D view';
  if (title) body += `<text x="12" y="20" font-size="12" font-weight="700" fill="#173a5e">${esc(title)}</text>`;
  if (rig && opts.labels !== false) body += `<text x="${W - 12}" y="20" font-size="10.5" fill="#5d6b7a" text-anchor="end">Hook ${rig.riggingHeight.toFixed(2)} m above the lift points</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif" style="background:#fff">${body}</svg>`;
}
