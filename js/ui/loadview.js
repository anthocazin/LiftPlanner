// Interactive 2D view of the load (XY plan or XZ elevation) on top of the imported drawing:
// lift points and COG can be added / dragged, the rigging is overlaid from the calculation.
import { app } from './app.js';
import { el } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
export const AXES = { xy: ['x', 'y'], xz: ['x', 'z'], yz: ['y', 'z'] };
export const VIEW_NAMES = { xy: 'Plan — XY (top view)', xz: 'Elevation — XZ (front view)', yz: 'Elevation — YZ (side view)' };

/** UI state shared by the views of a page. */
export const lvState = { mode: 'select', selected: null, opacity: 0.8, snap: 5, showRig: true };
const zoomState = {};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (v) => (Math.round(v * 100) / 100).toString();

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** Placement of a view image in model mm: returns { x, y, w, h, flip } in SVG coords (y = −b). */
export const safeImg = (u) => (typeof u === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(u) ? u : null);

export function imagePlacement(v) {
  if (!safeImg(v?.image) || !(v.s > 0)) return null;
  const k = v.flipH ? -1 : 1;
  const a0 = (0 - v.ou) * v.s * k;
  const a1 = (v.w - v.ou) * v.s * k;
  const x = Math.min(a0, a1);
  const y = -(v.ov * v.s);
  return { x, y, w: v.w * v.s, h: v.h * v.s, flip: !!v.flipH };
}

function envelope(load) {
  const o = load.origin_mm || {}, d = load.dims_mm || {};
  return { x0: +o.x || 0, y0: +o.y || 0, z0: +o.z || 0, x1: (+o.x || 0) + (+d.L || 0), y1: (+o.y || 0) + (+d.W || 0), z1: (+o.z || 0) + (+d.H || 0) };
}

function bounds(key, load, rig) {
  const [A, B] = AXES[key];
  const e = envelope(load);
  const ip0 = imagePlacement(load.views?.[key]);
  // with a drawing, the view is framed on the drawing (the overall size may be out of date)
  const pts = ip0 ? [] : [[e[`${A}0`], e[`${B}0`]], [e[`${A}1`], e[`${B}1`]]];
  (load.liftPoints || []).forEach((p) => pts.push([+p[A] || 0, +p[B] || 0]));
  const c = load.cog_mm || {};
  pts.push([+c[A] || 0, +c[B] || 0]);
  const ip = imagePlacement(load.views?.[key]);
  if (ip) pts.push([ip.x, -ip.y], [ip.x + ip.w, -(ip.y + ip.h)]);
  (load.shapes || []).forEach((sh) => { const q = shapeProj(sh, key); if (q.kind === 'circle') pts.push([q.ca - q.r, q.cb - q.r], [q.ca + q.r, q.cb + q.r]); else pts.push([q.a0, q.b0], [q.a1, q.b1]); });
  if (rig && !rig.error && lvState.showRig && key !== 'xy') pts.push([rig.hook[A] * 1000, rig.hook[B] * 1000 + 300]);
  let a0 = Math.min(...pts.map((p) => p[0])), a1 = Math.max(...pts.map((p) => p[0]));
  let b0 = Math.min(...pts.map((p) => p[1])), b1 = Math.max(...pts.map((p) => p[1]));
  if (a1 - a0 < 500) { a0 -= 250; a1 += 250; }
  if (b1 - b0 < 500) { b0 -= 250; b1 += 250; }
  const m = 0.08 * Math.max(a1 - a0, b1 - b0);
  return { a0: a0 - m, a1: a1 + m, b0: b0 - m, b1: b1 + m };
}


/** viewBox fitted to the element (aspect ratio kept), with an optional zoom state. */
function fitBox(key, load, rig, cw, ch, z) {
  const bb = bounds(key, load, rig);
  const full = { x: bb.a0, y: -bb.b1, w: bb.a1 - bb.a0, h: bb.b1 - bb.b0 };
  const ar = cw / ch;
  let w = full.w, h = full.h;
  if (w / h > ar) h = w / ar;
  else w = h * ar;
  let cx = full.x + full.w / 2, cy = full.y + full.h / 2;
  if (z) {
    w *= z.k; h *= z.k; cx = z.cx; cy = z.cy;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** SVG content of a view (model mm, y = −b). u = size of one screen pixel in mm. */
function viewContent(key, load, rig, vb, u, editable, extra = {}) {
  const [A, B] = AXES[key];
  const opts = { editable };
    let s = '';
    // grid
    const step = niceStep(vb.w / 10);
    const gx0 = Math.floor(vb.x / step) * step, gy0 = Math.floor(vb.y / step) * step;
    let g = '';
    for (let x = gx0; x <= vb.x + vb.w; x += step) g += `<line x1="${n(x)}" y1="${n(vb.y)}" x2="${n(x)}" y2="${n(vb.y + vb.h)}"/>`;
    for (let y = gy0; y <= vb.y + vb.h; y += step) g += `<line x1="${n(vb.x)}" y1="${n(y)}" x2="${n(vb.x + vb.w)}" y2="${n(y)}"/>`;
    s += `<g stroke="#e3e8ee" stroke-width="${n(u)}">${g}</g>`;
    // image
    const v = load.views?.[key];
    const ip = imagePlacement(v);
    if (ip) {
      const tr = ip.flip ? ` transform="translate(${n(2 * ip.x + ip.w)} 0) scale(-1 1)"` : '';
      s += `<image href="${safeImg(v.image)}" x="${n(ip.x)}" y="${n(ip.y)}" width="${n(ip.w)}" height="${n(ip.h)}" preserveAspectRatio="none" opacity="${lvState.opacity}"${tr}/>`;
    }
    // axes through the origin
    s += `<g stroke-width="${n(1.4 * u)}"><line x1="0" y1="0" x2="${n(60 * u)}" y2="0" stroke="#c0392b"/><line x1="0" y1="0" x2="0" y2="${n(-60 * u)}" stroke="${B === 'y' ? '#1f8f4e' : '#2a5db0'}"/></g>`;
    s += `<text x="${n(64 * u)}" y="${n(4 * u)}" font-size="${n(11 * u)}" fill="#c0392b" font-weight="700">${A.toUpperCase()}</text><text x="${n(-4 * u)}" y="${n(-66 * u)}" font-size="${n(11 * u)}" fill="${B === 'y' ? '#1f8f4e' : '#2a5db0'}" font-weight="700">${B.toUpperCase()}</text>`;
    // envelope
    const e = envelope(load);
    const ea0 = e[`${A}0`], ea1 = e[`${A}1`], eb0 = e[`${B}0`], eb1 = e[`${B}1`];
    if (!ip && ea1 > ea0 && eb1 > eb0)
      s += `<rect x="${n(ea0)}" y="${n(-eb1)}" width="${n(ea1 - ea0)}" height="${n(eb1 - eb0)}" fill="${ip ? 'none' : 'rgba(23,58,94,.05)'}" stroke="#173a5e" stroke-width="${n(1.2 * u)}" stroke-dasharray="${n(6 * u)} ${n(4 * u)}"/>`;
    // simple shapes of the load (uniform weight → COG)
    s += shapesContent(key, load, u, extra);
    // rigging overlay
    if (rig && lvState.showRig) {
      const hk = [rig.hook[A] * 1000, rig.hook[B] * 1000];
      let rg = '';
      // legs that coincide in this view share one label
      const groupsL = [];
      for (const leg of rig.legs) {
        const p0 = [leg.bottom[A] * 1000, leg.bottom[B] * 1000];
        const p1 = [leg.top[A] * 1000, leg.top[B] * 1000];
        const col = leg.lengthKind === 'chain' ? '#5d6b7a' : leg.comps?.sling?.colorHex || '#2a5db0';
        rg += `<line x1="${n(p0[0])}" y1="${n(-p0[1])}" x2="${n(p1[0])}" y2="${n(-p1[1])}" stroke="${esc(col)}" stroke-width="${n(3 * u)}" stroke-linecap="round" opacity=".85"/>`;
        if (key === 'xy' && leg.level === 'top') continue;
        const g = groupsL.find((q) => Math.hypot(q.p0[0] - p0[0], q.p0[1] - p0[1]) < 25 * u && Math.hypot(q.p1[0] - p1[0], q.p1[1] - p1[1]) < 25 * u);
        if (g) g.legs.push(leg);
        else groupsL.push({ p0, p1, legs: [leg] });
      }
      for (const g of groupsL) {
        const { p0, p1 } = g;
        const t = g.legs.length > 1 ? 0.55 : 0.45;
        const mx = p0[0] + (p1[0] - p0[0]) * t, my = p0[1] + (p1[1] - p0[1]) * t;
        const side = p1[0] >= p0[0] ? -1 : 1; // label outside the legs
        const L = Math.max(...g.legs.map((l) => l.Leff)), ang = Math.max(...g.legs.map((l) => l.angleV));
        const txt = `${g.legs.map((l) => l.key).join('/')} · ${L.toFixed(2)} m · ${ang.toFixed(0)}°`;
        rg += `<text x="${n(mx + side * 8 * u)}" y="${n(-my)}" text-anchor="${side > 0 ? 'start' : 'end'}" font-size="${n(11 * u)}" fill="#173a5e" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="${n(3.5 * u)}">${esc(txt)}</text>`;
      }
      if (rig.spreader) {
        const sa = rig.spreader.lugA, sb = rig.spreader.lugB;
        rg += `<line x1="${n(sa[A] * 1000)}" y1="${n(-sa[B] * 1000)}" x2="${n(sb[A] * 1000)}" y2="${n(-sb[B] * 1000)}" stroke="#c97a2b" stroke-width="${n(6 * u)}" stroke-linecap="round"/>`;
      }
      rg += `<circle cx="${n(hk[0])}" cy="${n(-hk[1])}" r="${n(5 * u)}" fill="#f2c14e" stroke="#7a5a10" stroke-width="${n(1.5 * u)}"/>`;
      if (key !== 'xy') rg += `<text x="${n(hk[0] + 9 * u)}" y="${n(-hk[1] - 6 * u)}" font-size="${n(10 * u)}" fill="#7a5a10" font-weight="700">Hook +${(rig.riggingHeight).toFixed(2)} m</text>`;
      s += `<g pointer-events="none">${rg}</g>`;
    }
    // guide lines of the selected item (from the other views)
    const gd = extra.guide;
    if (gd) {
      const gs = `stroke="#e8822a" stroke-width="${n(1.6 * u)}" stroke-dasharray="${n(8 * u)} ${n(5 * u)}" pointer-events="none"`;
      if (gd.a != null) s += `<line x1="${n(gd.a)}" y1="${n(vb.y)}" x2="${n(gd.a)}" y2="${n(vb.y + vb.h)}" ${gs}/>`;
      if (gd.b != null) s += `<line x1="${n(vb.x)}" y1="${n(-gd.b)}" x2="${n(vb.x + vb.w)}" y2="${n(-gd.b)}" ${gs}/>`;
      const ga = gd.a ?? vb.x + 20 * u, gb = gd.b ?? -(vb.y + 30 * u);
      s += `<text x="${n(ga + 5 * u)}" y="${n(-gb - 6 * u)}" font-size="${n(11 * u)}" font-weight="800" fill="#c96a17" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}" pointer-events="none">${esc(gd.label)} here</text>`;
    }
    // COG
    const c = load.cog_mm || {};
    const ca = +c[A] || 0, cb = +c[B] || 0, r = 9 * u;
    const pe = '';
    s += `<g data-drag="cog"${pe} class="${opts.editable ? 'grab' : ''}" transform="translate(${n(ca)} ${n(-cb)})">
      ${lvState.selected === 'COG' ? `<circle r="${n(r + 5 * u)}" fill="none" stroke="#e8822a" stroke-width="${n(3 * u)}"/>` : ''}
      <circle r="${n(r)}" fill="#fff" stroke="#111" stroke-width="${n(1.4 * u)}"/>
      <path d="M0 0 L${n(r)} 0 A${n(r)} ${n(r)} 0 0 1 0 ${n(r)} Z M0 0 L${n(-r)} 0 A${n(r)} ${n(r)} 0 0 1 0 ${n(-r)} Z" fill="#111"/>
      <text x="${n(r + 4 * u)}" y="${n(-r)}" font-size="${n(11 * u)}" font-weight="800" fill="#111" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}">COG</text></g>`;
    // lift points (labels merged when points coincide in this view)
    const pts = load.liftPoints || [];
    const groups = [];
    pts.forEach((p, i) => {
      const a = +p[A] || 0, b = +p[B] || 0;
      const gp = groups.find((x) => Math.hypot(x.a - a, x.b - b) < 6 * u);
      if (gp) gp.ids.push(p.id);
      else groups.push({ a, b, ids: [p.id], i });
    });
    pts.forEach((p, i) => {
      const a = +p[A] || 0, b = +p[B] || 0;
      const sel = lvState.selected === p.id;
      const off = p.used === false;
      const col = off ? '#9aa5b1' : p.padeye === false ? '#1f6fb2' : '#c0392b';
      s += `<g data-drag="pt" data-i="${i}"${pe} class="${opts.editable ? 'grab' : ''}" transform="translate(${n(a)} ${n(-b)})">
        <circle r="${n((sel ? 9 : 7) * u)}" fill="${col}" fill-opacity="${off ? 0.4 : 0.9}" stroke="${sel ? '#e8822a' : '#fff'}" stroke-width="${n((sel ? 3 : 1.5) * u)}"/>
        <line x1="${n(-12 * u)}" y1="0" x2="${n(12 * u)}" y2="0" stroke="${col}" stroke-width="${n(u)}"/><line x1="0" y1="${n(-12 * u)}" x2="0" y2="${n(12 * u)}" stroke="${col}" stroke-width="${n(u)}"/></g>`;
    });
    groups.forEach((gp) => {
      s += `<text x="${n(gp.a + 10 * u)}" y="${n(-gp.b + 16 * u)}" font-size="${n(12 * u)}" font-weight="800" fill="#c0392b" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}" pointer-events="none">${esc(gp.ids.join('/'))}</text>`;
    });
    // scale bar
    const sb = niceStep(vb.w / 6);
    const sx = vb.x + 14 * u, sy = vb.y + vb.h - 14 * u;
    s += `<g pointer-events="none"><rect x="${n(sx - 4 * u)}" y="${n(sy - 18 * u)}" width="${n(sb + 8 * u)}" height="${n(24 * u)}" fill="rgba(255,255,255,.85)"/><line x1="${n(sx)}" y1="${n(sy)}" x2="${n(sx + sb)}" y2="${n(sy)}" stroke="#111" stroke-width="${n(2 * u)}"/><text x="${n(sx)}" y="${n(sy - 5 * u)}" font-size="${n(10 * u)}">${sb >= 1000 ? `${sb / 1000} m` : `${sb} mm`}</text></g>`;
    if (!ip && opts.editable)
      s += `<text x="${n(vb.x + vb.w / 2)}" y="${n(vb.y + 20 * u)}" text-anchor="middle" font-size="${n(11 * u)}" fill="#8a96a3" pointer-events="none">No drawing for this view — white background, grid ${step >= 1000 ? `${step / 1000} m` : `${step} mm`}</text>`;
  return s;
}

/** Static SVG of a view (drawings page, report). */
export function staticViewSvg(key, project, res, { width = 560, height = 380, title } = {}) {
  const rig = res?.rig && !res.rig.error ? res.rig : null;
  const vb = fitBox(key, project.load, rig, width, height, null);
  const save = { ...lvState };
  lvState.showRig = true;
  lvState.selected = null;
  const inner = viewContent(key, project.load, rig, vb, vb.w / width, false);
  Object.assign(lvState, save);
  const t = title || VIEW_NAMES[key];
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height + 22}" viewBox="0 0 ${width} ${height + 22}" style="background:#fff">` +
    `<text x="10" y="15" font-size="12" font-weight="700" fill="#173a5e" font-family="Arial, sans-serif">${esc(t)}</text>` +
    `<svg x="0" y="22" width="${width}" height="${height}" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" font-family="Arial, sans-serif">${inner}</svg></svg>`;
}

/** Projection of a load shape in a view: { kind: 'rect', a0, a1, b0, b1 } or { kind: 'circle', ca, cb, r }. */
export function shapeProj(sh, key) {
  const [A, B] = AXES[key];
  if (sh.type === 'box') return { kind: 'rect', a0: Math.min(sh[`${A}0`], sh[`${A}1`]), a1: Math.max(sh[`${A}0`], sh[`${A}1`]), b0: Math.min(sh[`${B}0`], sh[`${B}1`]), b1: Math.max(sh[`${B}0`], sh[`${B}1`]) };
  const ax = sh.axis || 'z';
  const c = { x: +sh.cx || 0, y: +sh.cy || 0, z: +sh.cz || 0 };
  const r = +sh.r || 0, L = +sh.L || 0;
  if (ax !== A && ax !== B) return { kind: 'circle', ca: c[A], cb: c[B], r };
  const span = (k) => (k === ax ? [c[k], c[k] + L] : [c[k] - r, c[k] + r]);
  const [a0, a1] = span(A), [b0, b1] = span(B);
  return { kind: 'rect', a0: Math.min(a0, a1), a1: Math.max(a0, a1), b0: Math.min(b0, b1), b1: Math.max(b0, b1) };
}

function shapesContent(key, load, u, extra) {
  let s = '';
  for (const sh of load.shapes || []) {
    const pr = shapeProj(sh, key);
    const sel = extra.selShape === sh.id;
    const st = `stroke="${sh.void ? '#7b3fb0' : '#c96a17'}" stroke-width="${n((sel ? 2.4 : 1.4) * u)}" ${sh.void ? `stroke-dasharray="${n(5 * u)} ${n(3 * u)}"` : ''} fill="${sh.void ? 'rgba(123,63,176,.06)' : 'rgba(232,130,42,.16)'}"`;
    const pe = extra.shapesEditable ? ` data-shape="${esc(sh.id)}" class="grab"` : ' pointer-events="none"';
    if (pr.kind === 'circle') s += `<g${pe}><circle cx="${n(pr.ca)}" cy="${n(-pr.cb)}" r="${n(pr.r)}" ${st}/></g>`;
    else s += `<g${pe}><rect x="${n(pr.a0)}" y="${n(-pr.b1)}" width="${n(pr.a1 - pr.a0)}" height="${n(pr.b1 - pr.b0)}" ${st}/></g>`;
    if (sel && extra.shapesEditable) {
      const h = pr.kind === 'circle' ? [pr.ca + pr.r, pr.cb] : [pr.a1, pr.b1];
      s += `<rect data-shandle="1" x="${n(h[0] - 6 * u)}" y="${n(-h[1] - 6 * u)}" width="${n(12 * u)}" height="${n(12 * u)}" fill="#fff" stroke="#e8822a" stroke-width="${n(2 * u)}" class="grab"/>`;
    }
    if (sh.name) s += `<text x="${n((pr.kind === 'circle' ? pr.ca : pr.a0) + 4 * u)}" y="${n(-(pr.kind === 'circle' ? pr.cb : pr.b1) + 12 * u)}" font-size="${n(10 * u)}" fill="#9b5a1d" pointer-events="none">${esc(sh.name)}</text>`;
  }
  return s;
}

/**
 * Creates a view. opts: { editable, height, title, onPick(key,a,b), onAdd(key,a,b), onSelect(id),
 * onChange(), shapes: { editable, selected(), onSelect(id), onCreate(shape) } }.
 * Mouse: click = place (current tool), drag the background = pan, drag a marker = move it,
 * wheel = zoom at the cursor, double-click = fit. Buttons: + − fit and full screen.
 */
export function loadView(key, opts = {}) {
  const [A, B] = AXES[key];
  const box = el('div', { class: 'lv', 'data-key': key });
  const zoomBtn = (t, f, title) => el('button', { class: 'lv-btn', title, onclick: (e) => { e.stopPropagation(); f(); } }, t);
  const head = el('div', { class: 'lv-head' }, el('b', {}, opts.title || VIEW_NAMES[key]), el('span', { class: 'muted lv-coord' }, ''),
    el('span', { class: 'lv-tools' },
      zoomBtn('+', () => zoomBy(1 / 1.3), 'Zoom in'), zoomBtn('−', () => zoomBy(1.3), 'Zoom out'), zoomBtn('Fit', () => { delete zoomState[key]; draw(); }, 'Fit the view'),
      zoomBtn('⤢', () => { box.classList.toggle('lv-max'); setTimeout(draw, 30); }, 'Full screen / back')));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lv-svg');
  svg.style.height = `${opts.height || 420}px`;
  box.append(head, svg);
  const coord = head.querySelector('.lv-coord');
  let vb = null;
  let drag = null;

  const toModel = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const q = pt.matrixTransform(m.inverse());
    return [q.x, -q.y];
  };
  const snap = (v) => {
    const s = Number(lvState.snap) || 1;
    return Math.round(v / s) * s;
  };
  const curZoom = () => zoomState[key] || { k: 1, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
  function zoomBy(f, at) {
    const cur = curZoom();
    const k = Math.min(6, Math.max(0.02, cur.k * f));
    const r = k / cur.k;
    const [a, b] = at || [cur.cx, -cur.cy];
    zoomState[key] = { k, cx: a + (cur.cx - a) * r, cy: -b + (cur.cy + b) * r };
    draw();
  }

  function draw() {
    const load = app.project.load;
    const res = app.result;
    const rig = res?.rig && !res.rig.error ? res.rig : null;
    const cw = svg.clientWidth || 600, ch = svg.clientHeight || opts.height || 420;
    vb = fitBox(key, load, rig, cw, ch, zoomState[key]);
    svg.setAttribute('viewBox', `${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}`);
    svg.innerHTML = viewContent(key, load, rig, vb, vb.w / cw, !!opts.editable, { shapesEditable: !!opts.shapes?.editable, selShape: opts.shapes?.selected?.(), guide: opts.guide?.() });
    svg.style.cursor = lvState.tool ? 'crosshair' : 'grab';
  }

  const load = () => app.project.load;
  svg.addEventListener('pointermove', (ev) => {
    const [a, b] = toModel(ev);
    coord.textContent = `${A.toUpperCase()} ${Math.round(a)} · ${B.toUpperCase()} ${Math.round(b)} mm`;
    if (!drag) return;
    const moved = Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4;
    if (moved) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === 'bg') {
      // background: pan (or draw a new shape with a shape tool)
      if (drag.create) {
        const sh = drag.create;
        const [a0, b0] = drag.m0;
        if (sh.type === 'box') { sh[`${A}0`] = snap(Math.min(a0, a)); sh[`${A}1`] = snap(Math.max(a0, a)); sh[`${B}0`] = snap(Math.min(b0, b)); sh[`${B}1`] = snap(Math.max(b0, b)); }
        else sh.r = Math.max(1, snap(Math.hypot(a - a0, b - b0)));
        draw();
        return;
      }
      const dx = (ev.clientX - drag.sx) * (vb.w / svg.clientWidth);
      const dy = (ev.clientY - drag.sy) * (vb.h / svg.clientHeight);
      zoomState[key] = { k: drag.z.k, cx: drag.z.cx - dx, cy: drag.z.cy - dy };
      draw();
      return;
    }
    const sa = snap(a), sbv = snap(b);
    if (drag.kind === 'pt') {
      const p = load().liftPoints[drag.i];
      p[A] = sa;
      p[B] = sbv;
      if (p.picks) { p.picks[key] = [sa, sbv]; syncPicks(p, p.picks); }
      drag.g.setAttribute('transform', `translate(${sa} ${-sbv})`);
    } else if (drag.kind === 'cog') {
      const c = load().cog_mm;
      c[A] = sa;
      c[B] = sbv;
      if (load().cogPicks) { load().cogPicks[key] = [sa, sbv]; syncPicks(c, load().cogPicks); }
      if (['shape', 'geometric'].includes(load().cogBasis)) load().cogBasis = 'drawing';
      drag.g.setAttribute('transform', `translate(${sa} ${-sbv})`);
    } else if (drag.kind === 'shape' || drag.kind === 'shandle') {
      const sh = (load().shapes || []).find((q) => q.id === drag.id);
      if (!sh) return;
      const da = snap(a - drag.m0[0]), db = snap(b - drag.m0[1]);
      const o = drag.orig;
      if (drag.kind === 'shape') {
        if (sh.type === 'box') { sh[`${A}0`] = o[`${A}0`] + da; sh[`${A}1`] = o[`${A}1`] + da; sh[`${B}0`] = o[`${B}0`] + db; sh[`${B}1`] = o[`${B}1`] + db; }
        else { sh[`c${A}`] = o[`c${A}`] + da; sh[`c${B}`] = o[`c${B}`] + db; }
      } else if (sh.type === 'box') { sh[`${A}1`] = Math.max(o[`${A}0`] + 1, o[`${A}1`] + da); sh[`${B}1`] = Math.max(o[`${B}0`] + 1, o[`${B}1`] + db); }
      else {
        const ax = sh.axis || 'z';
        if (ax !== A && ax !== B) sh.r = Math.max(1, snap(Math.hypot(a - o[`c${A}`], b - o[`c${B}`])));
        else {
          const other = ax === A ? B : A;
          sh.L = Math.max(1, (o.L || 0) + (ax === A ? da : db));
          sh.r = Math.max(1, (o.r || 0) + (other === A ? da : db));
        }
      }
      opts.shapes?.onChange?.(false);
      draw();
    }
  });
  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button === 1 || ev.button === 2) ev.preventDefault();
    const [a, b] = toModel(ev);
    const tgt = ev.target;
    const base = { sx: ev.clientX, sy: ev.clientY, m0: [a, b], moved: false };
    const hnd = tgt.closest('[data-shandle]');
    const shp = tgt.closest('[data-shape]');
    const mk = tgt.closest('[data-drag]');
    if (hnd && opts.shapes?.editable) {
      const sh = (load().shapes || []).find((q) => q.id === opts.shapes.selected());
      if (sh) drag = { ...base, kind: 'shandle', id: sh.id, orig: { ...sh } };
    } else if (mk && opts.editable && !lvState.tool) {
      const kind = mk.dataset.drag;
      const i = Number(mk.dataset.i);
      drag = { ...base, kind, i, g: mk };
    } else if (shp && opts.shapes?.editable && !lvState.tool) {
      const sh = (load().shapes || []).find((q) => q.id === shp.dataset.shape);
      opts.shapes.onSelect?.(sh.id);
      drag = { ...base, kind: 'shape', id: sh.id, orig: { ...sh } };
      draw();
    } else {
      drag = { ...base, kind: 'bg', z: curZoom() };
      if (lvState.tool && opts.shapes?.editable) {
        const sh = opts.shapes.onCreate?.(lvState.tool, key, snap(a), snap(b));
        if (sh) drag.create = sh;
      }
    }
    if (drag) svg.setPointerCapture(ev.pointerId);
  });
  const end = (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const [a, b] = ev ? toModel(ev) : d.m0;
    if (d.kind === 'bg' && d.create) {
      opts.shapes?.onChange?.(true);
      lvState.tool = null;
      app.recompute();
      return;
    }
    if (!d.moved) {
      // a click: place with the current mode (also when clicking on a marker)
      if (d.kind === 'pt' && lvState.mode !== 'pick') { lvState.selected = load().liftPoints[d.i]?.id || null; opts.onSelect?.(lvState.selected); draw(); return; }
      if ((d.kind === 'pt' || d.kind === 'cog') && lvState.mode === 'pick' && opts.onMarker?.(key, d.kind === 'cog' ? 'COG' : load().liftPoints[d.i]?.id)) return;
      if (lvState.mode === 'pick' && opts.onPick) { opts.onPick(key, snap(a), snap(b)); return; }
      if (lvState.mode === 'add' && opts.onAdd) { opts.onAdd(key, snap(a), snap(b)); return; }
      if (lvState.mode === 'cog' && opts.editable) { const c = load().cog_mm; c[A] = snap(a); c[B] = snap(b); lvState.mode = 'select'; app.recompute(); return; }
      if (d.kind === 'bg' && opts.shapes?.editable) { opts.shapes.onSelect?.(null); draw(); }
      return;
    }
    if (d.kind === 'pt' || d.kind === 'cog') { opts.onChange?.(); app.recompute(); }
    else if (d.kind === 'shape' || d.kind === 'shandle') { opts.shapes?.onChange?.(true); app.recompute(); }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', () => { drag = null; });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomBy(ev.deltaY > 0 ? 1.15 : 1 / 1.15, toModel(ev));
  }, { passive: false });
  svg.addEventListener('dblclick', (ev) => {
    if (ev.target.closest('[data-drag],[data-shape]')) return;
    delete zoomState[key];
    draw();
  });
  box.refresh = () => {
    if (drag) return;
    draw();
  };
  requestAnimationFrame(draw);
  return box;
}

/** Same value of a coordinate in every view clicked. */
function syncPicks(t, picks) {
  for (const k of Object.keys(picks || {})) if (picks[k] && AXES[k]) picks[k] = [Math.round(+t[AXES[k][0]] || 0), Math.round(+t[AXES[k][1]] || 0)];
}

export function resetZoom() {
  for (const k of Object.keys(zoomState)) delete zoomState[k];
}
