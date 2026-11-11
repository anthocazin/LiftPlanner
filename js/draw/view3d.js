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
export function draw3d(project, res, opts = {}) {
  const W = opts.width || 640, H = opts.height || 460;
  const cam = { ...DEFAULT_CAM, ...(opts.cam || {}) };
  const load = project.load || {};
  const rig = res?.rig && !res.rig.error ? res.rig : null;
  const e = envelope(load);
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
  if (hasBox) {
    const V = (x, y, z) => P(x ? e.x1 : e.x0, y ? e.y1 : e.y0, z ? e.z1 : e.z0);
    const faces = [
      { c: [V(0, 0, 1), V(1, 0, 1), V(1, 1, 1), V(0, 1, 1)], nrm: [0, 0, 1], shade: 0.95 },
      { c: [V(0, 0, 0), V(1, 0, 0), V(1, 1, 0), V(0, 1, 0)], nrm: [0, 0, -1], shade: 0.6 },
      { c: [V(0, 0, 0), V(1, 0, 0), V(1, 0, 1), V(0, 0, 1)], nrm: [0, -1, 0], shade: 0.82 },
      { c: [V(0, 1, 0), V(1, 1, 0), V(1, 1, 1), V(0, 1, 1)], nrm: [0, 1, 0], shade: 0.72 },
      { c: [V(0, 0, 0), V(0, 1, 0), V(0, 1, 1), V(0, 0, 1)], nrm: [-1, 0, 0], shade: 0.68 },
      { c: [V(1, 0, 0), V(1, 1, 0), V(1, 1, 1), V(1, 0, 1)], nrm: [1, 0, 0], shade: 0.78 },
    ];
    const cy = Math.cos(rad(cam.yaw)), sy = Math.sin(rad(cam.yaw)), cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
    const view = [sy * cp * -1, -cy * cp * -1, sp]; // direction towards the viewer in world coords
    // (derived from d = -y1·cos p + z·sin p with y1 = x·sin y + y·cos y)
    view[0] = -sy * cp;
    view[1] = -cy * cp;
    for (const f of faces) {
      const facing = f.nrm[0] * view[0] + f.nrm[1] * view[1] + f.nrm[2] * view[2];
      const sp2 = f.c.map(S);
      const d = sp2.reduce((s, q) => s + q.d, 0) / 4 - (facing > 0 ? 0 : 1e9);
      const col = Math.round(200 * f.shade + 30);
      push(d, poly(sp2, `fill="rgb(${col - 10},${col},${Math.min(255, col + 18)})" fill-opacity="${showDw ? 0.35 : facing > 0 ? 0.9 : 0.25}" stroke="#4a5562" stroke-width="${facing > 0 ? 1.1 : 0.6}" ${facing > 0 ? '' : 'stroke-dasharray="4 3"'}`));
    }
  }
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
        const txt = opts.forces !== false ? `${leg.key} · ${leg.Leff.toFixed(2)} m · ${leg.angleV.toFixed(0)}°` : leg.key;
        push(d + 2e8, `<text x="${n(mx + 7)}" y="${n(my)}" font-size="10.5" font-weight="700" fill="#173a5e" paint-order="stroke" stroke="#fff" stroke-width="3.2">${esc(txt)}</text>`);
      }
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
  for (const p of pts) {
    const a = S(P(+p.x || 0, +p.y || 0, +p.z || 0));
    push(a.d + 4e8, `<circle cx="${n(a.x)}" cy="${n(a.y)}" r="4.2" fill="${p.padeye === false ? '#1f6fb2' : '#c0392b'}" stroke="#fff" stroke-width="1.4"/>${opts.labels !== false ? `<text x="${n(a.x - 6)}" y="${n(a.y + 15)}" font-size="11.5" font-weight="800" fill="#c0392b" paint-order="stroke" stroke="#fff" stroke-width="3" text-anchor="middle">${esc(p.id)}</text>` : ''}`);
  }
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
