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
  const pts = [[e[`${A}0`], e[`${B}0`]], [e[`${A}1`], e[`${B}1`]]];
  (load.liftPoints || []).forEach((p) => pts.push([+p[A] || 0, +p[B] || 0]));
  const c = load.cog_mm || {};
  pts.push([+c[A] || 0, +c[B] || 0]);
  const ip = imagePlacement(load.views?.[key]);
  if (ip) pts.push([ip.x, -ip.y], [ip.x + ip.w, -(ip.y + ip.h)]);
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
function viewContent(key, load, rig, vb, u, editable) {
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
    if (ea1 > ea0 && eb1 > eb0)
      s += `<rect x="${n(ea0)}" y="${n(-eb1)}" width="${n(ea1 - ea0)}" height="${n(eb1 - eb0)}" fill="${ip ? 'none' : 'rgba(23,58,94,.05)'}" stroke="#173a5e" stroke-width="${n(1.2 * u)}" stroke-dasharray="${n(6 * u)} ${n(4 * u)}"/>`;
    // rigging overlay
    if (rig && lvState.showRig) {
      const hk = [rig.hook[A] * 1000, rig.hook[B] * 1000];
      let rg = '';
      for (const leg of rig.legs) {
        const p0 = [leg.bottom[A] * 1000, leg.bottom[B] * 1000];
        const p1 = [leg.top[A] * 1000, leg.top[B] * 1000];
        const col = leg.lengthKind === 'chain' ? '#5d6b7a' : leg.comps?.sling?.colorHex || '#2a5db0';
        rg += `<line x1="${n(p0[0])}" y1="${n(-p0[1])}" x2="${n(p1[0])}" y2="${n(-p1[1])}" stroke="${esc(col)}" stroke-width="${n(3 * u)}" stroke-linecap="round" opacity=".85"/>`;
        const mx = p0[0] + (p1[0] - p0[0]) * 0.45, my = p0[1] + (p1[1] - p0[1]) * 0.45;
        if (key !== 'xy' || leg.level !== 'top')
          rg += `<text x="${n(mx + 6 * u)}" y="${n(-my)}" font-size="${n(10 * u)}" fill="#173a5e" font-weight="600" paint-order="stroke" stroke="#fff" stroke-width="${n(3 * u)}">${esc(leg.key)} ${leg.angleV.toFixed(0)}° · ${leg.Leff.toFixed(2)} m</text>`;
      }
      if (rig.spreader) {
        const sa = rig.spreader.lugA, sb = rig.spreader.lugB;
        rg += `<line x1="${n(sa[A] * 1000)}" y1="${n(-sa[B] * 1000)}" x2="${n(sb[A] * 1000)}" y2="${n(-sb[B] * 1000)}" stroke="#c97a2b" stroke-width="${n(6 * u)}" stroke-linecap="round"/>`;
      }
      rg += `<circle cx="${n(hk[0])}" cy="${n(-hk[1])}" r="${n(5 * u)}" fill="#f2c14e" stroke="#7a5a10" stroke-width="${n(1.5 * u)}"/>`;
      if (key !== 'xy') rg += `<text x="${n(hk[0] + 9 * u)}" y="${n(-hk[1] - 6 * u)}" font-size="${n(10 * u)}" fill="#7a5a10" font-weight="700">Hook +${(rig.riggingHeight).toFixed(2)} m</text>`;
      s += `<g pointer-events="none">${rg}</g>`;
    }
    // COG
    const c = load.cog_mm || {};
    const ca = +c[A] || 0, cb = +c[B] || 0, r = 9 * u;
    const pe = lvState.mode === 'pick' ? ' pointer-events="none"' : '';
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

/**
 * Creates a view. opts: { editable, height, onSelect(id), onChange(), title }
 * The element exposes .refresh().
 */
export function loadView(key, opts = {}) {
  const [A, B] = AXES[key];
  const box = el('div', { class: 'lv' });
  const head = el('div', { class: 'lv-head' }, el('b', {}, opts.title || VIEW_NAMES[key]), el('span', { class: 'muted lv-coord' }, ''));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lv-svg');
  svg.style.height = `${opts.height || 420}px`;
  box.append(head, svg);
  const coord = head.querySelector('.lv-coord');
  let vb = null; // current viewBox {x, y, w, h}
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

  function draw() {
    const load = app.project.load;
    const res = app.result;
    const rig = res?.rig && !res.rig.error ? res.rig : null;
    const cw = svg.clientWidth || 600, ch = svg.clientHeight || opts.height || 420;
    vb = fitBox(key, load, rig, cw, ch, zoomState[key]);
    svg.setAttribute('viewBox', `${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}`);
    svg.innerHTML = viewContent(key, load, rig, vb, vb.w / cw, !!opts.editable);
  }

  // ---------- interactions
  svg.addEventListener('pointermove', (ev) => {
    const [a, b] = toModel(ev);
    coord.textContent = `${A.toUpperCase()} ${Math.round(a)} · ${B.toUpperCase()} ${Math.round(b)} mm`;
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = (ev.clientX - drag.x0) * (vb.w / svg.clientWidth);
      const dy = (ev.clientY - drag.y0) * (vb.h / svg.clientHeight);
      zoomState[key] = { k: drag.z.k, cx: drag.z.cx - dx, cy: drag.z.cy - dy };
      draw();
      return;
    }
    const sa = snap(a), sbv = snap(b);
    const load = app.project.load;
    if (drag.kind === 'pt') {
      const p = load.liftPoints[drag.i];
      p[A] = sa;
      p[B] = sbv;
      if (p.picks) p.picks[key] = [sa, sbv];
    } else if (drag.kind === 'cog') {
      load.cog_mm[A] = sa;
      load.cog_mm[B] = sbv;
      if (load.cogPicks) load.cogPicks[key] = [sa, sbv];
      load.cogBasis = load.cogBasis || 'estimated';
    }
    drag.moved = true;
    drag.g.setAttribute('transform', `translate(${sa} ${-sbv})`);
  });
  svg.addEventListener('pointerdown', (ev) => {
    const g = ev.target.closest('[data-drag]');
    const [a, b] = toModel(ev);
    if (opts.editable && lvState.mode === 'pick' && !g) {
      opts.onPick?.(key, snap(a), snap(b));
      return;
    }
    if (opts.editable && lvState.mode === 'add' && !g) {
      opts.onAdd?.(key, snap(a), snap(b));
      return;
    }
    if (opts.editable && lvState.mode === 'cog' && !g) {
      const c = app.project.load.cog_mm;
      c[A] = snap(a);
      c[B] = snap(b);
      lvState.mode = 'select';
      opts.onChange?.();
      app.recompute();
      return;
    }
    if (g && opts.editable) {
      const kind = g.dataset.drag;
      const i = Number(g.dataset.i);
      if (kind === 'pt') {
        lvState.selected = app.project.load.liftPoints[i]?.id || null;
        opts.onSelect?.(lvState.selected);
      }
      drag = { kind, i, g, moved: false };
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }
    if (g && !opts.editable && g.dataset.drag === 'pt') {
      lvState.selected = app.project.load.liftPoints[Number(g.dataset.i)]?.id || null;
      opts.onSelect?.(lvState.selected);
      return;
    }
    // pan
    const z = zoomState[key] || { k: 1, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
    drag = { kind: 'pan', x0: ev.clientX, y0: ev.clientY, z };
    svg.setPointerCapture(ev.pointerId);
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind !== 'pan' && d.moved) {
      opts.onChange?.();
      app.recompute();
    } else if (d.kind === 'pt') {
      opts.onChange?.();
      draw();
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const [a, b] = toModel(ev);
    const cur = zoomState[key] || { k: 1, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
    const f = ev.deltaY > 0 ? 1.15 : 1 / 1.15;
    const k = Math.min(4, Math.max(0.05, cur.k * f));
    const r = k / cur.k;
    // keep the point under the cursor fixed
    zoomState[key] = { k, cx: a + (cur.cx - a) * r, cy: -b + (cur.cy + b) * r };
    draw();
  }, { passive: false });
  svg.addEventListener('dblclick', (ev) => {
    if (ev.target.closest('[data-drag]')) return;
    delete zoomState[key];
    draw();
  });

  box.refresh = () => {
    if (drag) return;
    draw();
  };
  // first draw once in the DOM (needs the element size)
  requestAnimationFrame(draw);
  return box;
}

export function resetZoom() {
  for (const k of Object.keys(zoomState)) delete zoomState[k];
}
