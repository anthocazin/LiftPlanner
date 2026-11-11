// Interactive site plan for the storyboard: background map (PDF / image) with a 2-point scale,
// crane and step positions placed by clicking, obstacles. Site frame in metres, X right, Y up.
import { app } from './app.js';
import { el, toast } from './dom.js';
import { openSource } from './pdfutil.js';
import { safeImg } from './loadview.js';
import { shapesSvg, defaultShape, dragHandle, moveShape } from '../draw/shapes.js';

const NS = 'http://www.w3.org/2000/svg';
export const svState = { mode: 'select', step: null, tmp: [], shapeTool: null, selShape: null, snap: 0.1 };
let zoom = null;

const n = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rad = (d) => (d * Math.PI) / 180;
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function rectCorners(cx, cy, sx, sy, rotDeg) {
  const a = rad(rotDeg || 0), c = Math.cos(a), s = Math.sin(a);
  return [[-sx / 2, -sy / 2], [sx / 2, -sy / 2], [sx / 2, sy / 2], [-sx / 2, sy / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/** Position of a step in the site frame (from pos, or from radius / slew around the crane). */
export function stepPos(st, cr) {
  if (st.pos) return st.pos;
  const R = Number(st.radius_m) || 0, th = rad(Number(st.slew_deg) || 0);
  return { x: cr.x + R * Math.cos(th), y: cr.y + R * Math.sin(th) };
}

const niceText = (vb) => vb.w / 60; // default text height: readable at the current zoom

export async function importMap(file) {
  const src = await openSource(file);
  let page = 1;
  if (src.pages > 1) page = Math.min(src.pages, Math.max(1, Number(prompt(`Page of the map (1–${src.pages}):`, '1')) || 1));
  const size = src.pageSize(page);
  const { canvas } = await src.renderRegion(page, { x: 0, y: 0, w: size.w, h: size.h }, 2400);
  const sb = app.project.storyboard;
  const load = app.project.load;
  const guess = Math.max(40, ((Number(load.dims_mm?.L) || 5000) / 1000) * 12);
  const s = guess / canvas.width;
  const cr = sb.crane || { x: 0, y: 0 };
  sb.map = { image: canvas.toDataURL('image/jpeg', 0.82), w: canvas.width, h: canvas.height, s, ou: canvas.width / 2 - cr.x / s, ov: canvas.height / 2 + cr.y / s, file: src.name, page, scaled: false, opacity: 0.85 };
  zoom = null;
  app.recompute();
  toast('Map imported — now set its scale: "Scale (2 clicks)" on two points of known distance');
}

export function siteView(opts = {}) {
  const box = el('div', { class: 'lv' });
  const head = el('div', { class: 'lv-head' }, el('b', {}, 'Site plan'), el('span', { class: 'muted lv-coord' }, ''));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lv-svg');
  svg.style.height = `${opts.height || 560}px`;
  box.append(head, svg);
  const coord = head.querySelector('.lv-coord');
  let vb = null;
  let drag = null;

  const toSite = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, -q.y];
  };

  function extents() {
    const p = app.project;
    const sb = p.storyboard;
    const cr = sb.crane;
    const rMax = Math.max(...(p.crane?.chart?.rows || []).map((r) => Number(r[0]) || 0), ...(sb.steps || []).map((s) => Number(s.radius_m) || 0), 10);
    const pts = [[cr.x - rMax * 1.1, cr.y - rMax * 1.1], [cr.x + rMax * 1.1, cr.y + rMax * 1.1]];
    (sb.steps || []).forEach((st) => { if (Number(st.radius_m) > 0 || st.pos) { const q = stepPos(st, cr); pts.push([q.x, q.y]); } });
    const m = sb.map;
    if (m?.image) pts.push([-m.ou * m.s, m.ov * m.s], [(m.w - m.ou) * m.s, (m.ov - m.h) * m.s]);
    return { x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])) };
  }

  function draw() {
    const p = app.project;
    const sb = p.storyboard;
    const cr = sb.crane || (sb.crane = { x: 0, y: 0, heading_deg: 0, footprint: { L: 10, W: 3 } });
    const e = extents();
    const cw = svg.clientWidth || 800, ch = svg.clientHeight || 560;
    let w = e.x1 - e.x0, h = e.y1 - e.y0;
    const ar = cw / ch;
    if (w / h > ar) h = w / ar;
    else w = h * ar;
    let cx = (e.x0 + e.x1) / 2, cy = -(e.y0 + e.y1) / 2;
    if (zoom) { w *= zoom.k; h *= zoom.k; cx = zoom.cx; cy = zoom.cy; }
    vb = { x: cx - w / 2, y: cy - h / 2, w, h };
    svg.setAttribute('viewBox', `${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}`);
    const u = vb.w / cw;
    let s = '';
    const step = niceStep(vb.w / 12);
    let g = '';
    for (let x = Math.floor(vb.x / step) * step; x <= vb.x + vb.w; x += step) g += `<line x1="${n(x)}" y1="${n(vb.y)}" x2="${n(x)}" y2="${n(vb.y + vb.h)}"/>`;
    for (let y = Math.floor(vb.y / step) * step; y <= vb.y + vb.h; y += step) g += `<line x1="${n(vb.x)}" y1="${n(y)}" x2="${n(vb.x + vb.w)}" y2="${n(y)}"/>`;
    s += `<g stroke="#e6ebf0" stroke-width="${n(u)}">${g}</g>`;
    const m = sb.map;
    if (safeImg(m?.image)) s += `<image href="${safeImg(m.image)}" x="${n(-m.ou * m.s)}" y="${n(-m.ov * m.s)}" width="${n(m.w * m.s)}" height="${n(m.h * m.s)}" preserveAspectRatio="none" opacity="${n(m.opacity ?? 0.85)}"/>`;
    // obstacles
    (sb.obstacles || []).forEach((o) => {
      const c = rectCorners(o.x, o.y, o.sx, o.sy, o.rot_deg);
      s += `<polygon points="${c.map(([x, y]) => `${n(x)},${n(-y)}`).join(' ')}" fill="${esc(o.color || '#9aa5b1')}" fill-opacity=".45" stroke="#4a5562" stroke-width="${n(u)}"/>`;
      s += `<text x="${n(o.x)}" y="${n(-o.y)}" font-size="${n(10 * u)}" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}">${esc(o.name)}</text>`;
    });
    // annotation shapes (to scale)
    s += shapesSvg(sb.shapes || [], { sel: svState.selShape, u, interactive: true });
    // chart radii
    const rows = (p.crane?.chart?.rows || []).map((r) => Number(r[0])).filter((r) => r > 0);
    if (rows.length) {
      const rMin = Math.min(...rows), rMax = Math.max(...rows);
      s += `<circle cx="${n(cr.x)}" cy="${n(-cr.y)}" r="${n(rMax)}" fill="none" stroke="#c0392b" stroke-dasharray="${n(6 * u)} ${n(5 * u)}" stroke-width="${n(1.2 * u)}"/>`;
      s += `<circle cx="${n(cr.x)}" cy="${n(-cr.y)}" r="${n(rMin)}" fill="#c0392b" fill-opacity=".06" stroke="#c0392b" stroke-dasharray="${n(3 * u)} ${n(3 * u)}" stroke-width="${n(u)}"/>`;
      s += `<text x="${n(cr.x + rMax * 0.71)}" y="${n(-cr.y - rMax * 0.71)}" font-size="${n(10 * u)}" fill="#c0392b">R max ${rMax} m</text>`;
    }
    // steps
    const fp = { L: (Number(p.load.dims_mm?.L) || 0) / 1000, W: (Number(p.load.dims_mm?.W) || 0) / 1000 };
    const crSteps = (sb.steps || []).map((st, i) => ({ st, i })).filter(({ st }) => Number(st.radius_m) > 0 || st.pos);
    if (crSteps.length > 1)
      s += `<polyline points="${crSteps.map(({ st }) => { const q = stepPos(st, cr); return `${n(q.x)},${n(-q.y)}`; }).join(' ')}" fill="none" stroke="#173a5e" stroke-width="${n(1.2 * u)}" stroke-dasharray="${n(4 * u)} ${n(4 * u)}"/>`;
    crSteps.forEach(({ st, i }) => {
      const q = stepPos(st, cr);
      const sel = svState.step === i;
      const res = app.result?.steps?.[i];
      const util = res?.checks?.find((c) => c.cat === 'Crane' && c.util != null)?.util;
      const failed = res?.checks?.some((c) => c.status === 'fail');
      const col = failed || util > 1 ? '#c0392b' : util > (p.crane?.utilLimit || 0.85) ? '#b7791f' : '#1f8f4e';
      if (sel) s += `<line x1="${n(cr.x)}" y1="${n(-cr.y)}" x2="${n(q.x)}" y2="${n(-q.y)}" stroke="#2a5db0" stroke-width="${n(1.5 * u)}"/><circle cx="${n(cr.x)}" cy="${n(-cr.y)}" r="${n(Math.hypot(q.x - cr.x, q.y - cr.y))}" fill="none" stroke="#2a5db0" stroke-dasharray="${n(6 * u)} ${n(4 * u)}" stroke-width="${n(u)}"/>`;
      if (fp.L > 0 && fp.W > 0) {
        const c = rectCorners(q.x, q.y, fp.L, fp.W, st.heading_deg);
        s += `<polygon points="${c.map(([x, y]) => `${n(x)},${n(-y)}`).join(' ')}" fill="#e8822a" fill-opacity="${sel ? 0.75 : 0.45}" stroke="#9b5a1d" stroke-width="${n(u)}"/>`;
      }
      s += `<g data-drag="step" data-i="${i}" transform="translate(${n(q.x)} ${n(-q.y)})" class="grab"><circle r="${n(10 * u)}" fill="#fff" stroke="${col}" stroke-width="${n((sel ? 3 : 2) * u)}"/><text y="${n(4 * u)}" text-anchor="middle" font-size="${n(11 * u)}" font-weight="700">${i + 1}</text></g>`;
      s += `<text x="${n(q.x + 13 * u)}" y="${n(-q.y - 8 * u)}" font-size="${n(10 * u)}" fill="#173a5e" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}" pointer-events="none">${esc((st.name || '').slice(0, 28))} · R ${(Number(st.radius_m) || 0).toFixed(1)} m</text>`;
    });
    // crane
    const fc = rectCorners(cr.x, cr.y, cr.footprint?.L || 10, cr.footprint?.W || 3, cr.heading_deg);
    s += `<polygon points="${fc.map(([x, y]) => `${n(x)},${n(-y)}`).join(' ')}" fill="#f2c14e" fill-opacity=".6" stroke="#7a5a10" stroke-width="${n(1.2 * u)}"/>`;
    s += `<g data-drag="crane" transform="translate(${n(cr.x)} ${n(-cr.y)})" class="grab"><circle r="${n(8 * u)}" fill="#7a5a10"/><text x="${n(11 * u)}" y="${n(-9 * u)}" font-size="${n(11 * u)}" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}">Crane</text></g>`;
    // scale tool points
    svState.tmp.forEach(([x, y]) => (s += `<circle cx="${n(x)}" cy="${n(-y)}" r="${n(5 * u)}" fill="#e8822a" stroke="#fff" stroke-width="${n(u)}"/>`));
    // scale bar
    const sbv = niceStep(vb.w / 6);
    const sx = vb.x + 14 * u, sy = vb.y + vb.h - 14 * u;
    s += `<g pointer-events="none"><rect x="${n(sx - 4 * u)}" y="${n(sy - 18 * u)}" width="${n(sbv + 8 * u)}" height="${n(24 * u)}" fill="rgba(255,255,255,.85)"/><line x1="${n(sx)}" y1="${n(sy)}" x2="${n(sx + sbv)}" y2="${n(sy)}" stroke="#111" stroke-width="${n(2 * u)}"/><text x="${n(sx)}" y="${n(sy - 5 * u)}" font-size="${n(10 * u)}">${sbv} m</text></g>`;
    if (m?.image && !m.scaled) s += `<text x="${n(vb.x + vb.w / 2)}" y="${n(vb.y + 22 * u)}" text-anchor="middle" font-size="${n(12 * u)}" fill="#c0392b" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}">Map not scaled yet — use "Scale (2 clicks)"</text>`;
    svg.innerHTML = s;
  }

  const snapV = (v) => { const k = Number(svState.snap) || 0; return k > 0 ? Math.round(v / k) * k : Math.round(v * 1000) / 1000; };
  const shapeById = (id) => (app.project.storyboard.shapes || []).find((q) => q.id === id);
  svg.addEventListener('pointermove', (ev) => {
    const [x, y] = toSite(ev);
    coord.textContent = `X ${x.toFixed(2)} · Y ${y.toFixed(2)} m`;
    if (!drag) return;
    if (drag.kind === 'create') {
      const sh = drag.shape, [x0, y0] = drag.start, X = snapV(x), Y = snapV(y);
      if (sh.type === 'rect' || sh.type === 'triangle') { sh.x = (x0 + X) / 2; sh.y = (y0 + Y) / 2; sh.w = Math.max(0.05, Math.abs(X - x0)); sh.h = Math.max(0.05, Math.abs(Y - y0)); }
      else if (sh.type === 'circle') sh.r = Math.max(0.05, Math.hypot(X - x0, Y - y0));
      else if (sh.type === 'arc') { sh.r = Math.max(0.05, Math.hypot(X - x0, Y - y0)); const a = (Math.atan2(Y - y0, X - x0) * 180) / Math.PI; sh.a0 = Math.round(a - 45); sh.a1 = Math.round(a + 45); }
      else if (sh.type === 'line') { sh.x2 = X; sh.y2 = Y; }
      draw();
      return;
    }
    if (drag.kind === 'shape') {
      const sh = shapeById(drag.id);
      if (sh) { const nx = snapV(drag.ox + (x - drag.x0)), ny = snapV(drag.oy + (y - drag.y0)); moveShape(sh, nx - sh.x, ny - sh.y); draw(); opts.onShape?.(); }
      return;
    }
    if (drag.kind === 'handle') {
      const sh = shapeById(svState.selShape);
      if (sh) { dragHandle(sh, drag.h, snapV(x), snapV(y)); draw(); opts.onShape?.(); }
      return;
    }
    if (drag.kind === 'pan') {
      zoom = { k: drag.z.k, cx: drag.z.cx - (ev.clientX - drag.x0) * (vb.w / svg.clientWidth), cy: drag.z.cy - (ev.clientY - drag.y0) * (vb.h / svg.clientHeight) };
      draw();
      return;
    }
    const sb = app.project.storyboard;
    const r = (v) => Math.round(v * 10) / 10;
    if (drag.kind === 'crane') { sb.crane.x = r(x); sb.crane.y = r(y); }
    else if (drag.kind === 'step') sb.steps[drag.i].pos = { x: r(x), y: r(y) };
    drag.moved = true;
    drag.g.setAttribute('transform', `translate(${x} ${-y})`);
  });
  svg.addEventListener('pointerdown', (ev) => {
    const [x, y] = toSite(ev);
    const sb = app.project.storyboard;
    const g = ev.target.closest('[data-drag]');
    const r = (v) => Math.round(v * 10) / 10;
    if (svState.mode === 'crane') {
      sb.crane.x = r(x); sb.crane.y = r(y);
      svState.mode = 'select';
      opts.onChange?.();
      app.recompute();
      return;
    }
    if (svState.mode === 'step' && svState.step != null && sb.steps[svState.step]) {
      sb.steps[svState.step].pos = { x: r(x), y: r(y) };
      svState.mode = 'select';
      opts.onChange?.();
      app.recompute();
      return;
    }
    if (svState.mode === 'shape' && svState.shapeTool) {
      sb.shapes = sb.shapes || [];
      const sh = defaultShape(svState.shapeTool, snapV(x), snapV(y));
      if (sh.type === 'text') {
        const t = prompt('Text:', 'Text');
        if (!t) return;
        sh.text = t;
        sh.size = Math.max(0.2, Math.round(niceText(vb) * 10) / 10);
        sb.shapes.push(sh);
        svState.selShape = sh.id;
        svState.mode = 'select';
        svState.shapeTool = null;
        app.persist();
        draw();
        opts.onShape?.(true);
        return;
      }
      if (sh.type === 'rect' || sh.type === 'triangle') { sh.w = 0.05; sh.h = 0.05; }
      if (sh.type === 'circle' || sh.type === 'arc') sh.r = 0.05;
      if (sh.type === 'line') { sh.x2 = sh.x; sh.y2 = sh.y; }
      sb.shapes.push(sh);
      svState.selShape = sh.id;
      drag = { kind: 'create', shape: sh, start: [sh.x, sh.y] };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    const hnd = ev.target.closest('[data-handle]');
    if (hnd && svState.selShape) {
      drag = { kind: 'handle', h: hnd.dataset.handle };
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }
    const shp = ev.target.closest('[data-shape]');
    if (shp && svState.mode === 'select') {
      const sh = shapeById(shp.dataset.shape);
      svState.selShape = sh.id;
      drag = { kind: 'shape', id: sh.id, x0: x, y0: y, ox: sh.x, oy: sh.y };
      svg.setPointerCapture(ev.pointerId);
      draw();
      opts.onShape?.(true);
      ev.preventDefault();
      return;
    }
    if (svState.mode === 'scale') {
      svState.tmp.push([x, y]);
      if (svState.tmp.length === 2) {
        const [[x1, y1], [x2, y2]] = svState.tmp;
        svState.tmp = [];
        const cur = Math.hypot(x2 - x1, y2 - y1);
        const real = Number(String(prompt(`Real distance between the two points (m) — currently ${cur.toFixed(2)} m on the map:`, '') || '').replace(',', '.'));
        const m = sb.map;
        if (real > 0 && m && cur > 0) {
          // rescale the map about the first point (it stays where it is)
          const k = real / cur;
          const u1 = x1 / m.s + m.ou, v1 = m.ov - y1 / m.s;
          m.s *= k;
          m.ou = u1 - x1 / m.s;
          m.ov = v1 + y1 / m.s;
          m.scaled = true;
          zoom = null;
          toast(`Map scale set: 1 px = ${(m.s * 1000).toFixed(1)} mm`);
        }
        svState.mode = 'select';
        opts.onChange?.();
        app.recompute();
      } else draw();
      return;
    }
    if (g) {
      drag = { kind: g.dataset.drag, i: Number(g.dataset.i), g, moved: false };
      if (drag.kind === 'step') { svState.step = drag.i; opts.onSelect?.(drag.i); }
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }
    if (svState.selShape) { svState.selShape = null; draw(); opts.onShape?.(true); }
    drag = { kind: 'pan', x0: ev.clientX, y0: ev.clientY, z: zoom || { k: 1, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 } };
    svg.setPointerCapture(ev.pointerId);
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'create' || d.kind === 'shape' || d.kind === 'handle') {
      if (d.kind === 'create') { svState.mode = 'select'; svState.shapeTool = null; }
      app.persist();
      opts.onShape?.(true);
      return;
    }
    if (d.kind !== 'pan' && d.moved) { opts.onChange?.(); app.recompute(); }
    else if (d.kind === 'step') draw();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [x, y] = toSite(ev);
    const cur = zoom || { k: 1, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
    const k = Math.min(5, Math.max(0.02, cur.k * (ev.deltaY > 0 ? 1.15 : 1 / 1.15)));
    const r = k / cur.k;
    zoom = { k, cx: x + (cur.cx - x) * r, cy: -y + (cur.cy + y) * r };
    draw();
  }, { passive: false });
  svg.addEventListener('dblclick', (ev) => { if (!ev.target.closest('[data-drag]')) { zoom = null; draw(); } });
  box.refresh = () => { if (!drag) draw(); };
  requestAnimationFrame(draw);
  return box;
}
