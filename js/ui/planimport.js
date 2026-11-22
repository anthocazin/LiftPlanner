// Import of a lift plan made by the engineering office (BE). Free and simple: the plan (PDF or image)
// is shown, the legs are drawn on it — a click on the lift point, a click on the hook — and their
// length is typed. The angle of each leg is read on the drawing (or typed), the lift points follow
// from the length and the angle, and the COG is under the hook. The plan is printed in the report.
import { app } from './app.js';
import { el, toast, fmt } from './dom.js';
import { openSource } from './pdfutil.js';
import { isLengthPart } from '../engine/rigging.js';
import { panZoomBox } from './panzoom.js';

const NS = 'http://www.w3.org/2000/svg';
const IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const num = (v) => (v === '' || v == null || !isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Angle to the vertical (°) and side (−1 left, +1 right) of a leg drawn from the hook h to the point p (page units, v down). */
export function legAngle(h, p) {
  if (!h || !p) return null;
  const du = p.u - h.u, dv = p.v - h.v;
  if (dv <= 0) return null; // the lift point must be under the hook
  return { angle: deg(Math.atan2(Math.abs(du), dv)), side: du < 0 ? -1 : 1 };
}

/**
 * Applies the import to the project (also used by the tests). d = { ref, weight, sizingAngle,
 * legs: [{ id, len (m), angle (° to the vertical), side (±1), p, meas }], hook, image, w, h, file, page }.
 * The lift points are placed in the vertical plane of the drawing: at `len` from the hook, at `angle`.
 */
export function applyPlanImport(p, d) {
  const ld = p.load;
  const legs = (d.legs || []).filter((l) => l.id);
  if (!legs.length) throw new Error('Add at least one leg');
  for (const l of legs) {
    if (!(num(l.len) > 0)) throw new Error(`Leg ${l.id}: type its length (m)`);
    if (num(l.len) > 60) throw new Error(`Leg ${l.id}: ${num(l.len)} m? The lengths are in metres (e.g. 5.85 or 5,85).`);
    if (num(l.angle) == null) throw new Error(`Leg ${l.id}: draw it on the plan (its lift point, then the hook) or type its angle`);
    if (!(num(l.angle) >= 0 && num(l.angle) < 85)) throw new Error(`Leg ${l.id}: angle to the vertical ${num(l.angle)}°? (0 to 85°)`);
  }
  if (num(d.weight) > 0) ld.weight_t = num(d.weight);
  // lift points from the hook: horizontal L·sin(a) on the side drawn, vertical L·cos(a)
  const geo = legs.map((l) => {
    const L = num(l.len), a = rad(num(l.angle));
    return { id: String(l.id).trim(), L, x: (l.side < 0 ? -1 : 1) * L * Math.sin(a), drop: L * Math.cos(a) };
  });
  const H = Math.max(...geo.map((g) => g.drop));
  const tpl = ld.liftPoints.find((q) => q.kind === 'padeye' || q.padeye) || ld.liftPoints[0] || { kind: 'padeye', padeye: true };
  const { id: _i, x: _x, y: _y, z: _z, picks: _p, used: _u, ...props } = tpl;
  ld.liftPoints = geo.map((g) => {
    const old = ld.liftPoints.find((q) => q.id === g.id);
    const base = old ? (({ id, x, y, z, picks, ...o }) => o)(old) : { ...props };
    return { ...base, id: g.id, x: Math.round(g.x * 1000), y: 0, z: Math.round((H - g.drop) * 1000), used: true, picks: {} };
  });
  // the COG is under the hook (x = 0): kept so by the leg lengths; its height is not known
  ld.cog_mm = { x: 0, y: 0, z: 0 };
  ld.cogBasis = 'legs';
  ld.cogZUnknown = true;
  const d0 = ld.dims_mm || {};
  const xs = ld.liftPoints.map((q) => q.x);
  if (+d0.L > 0 && +d0.W > 0) ld.origin_mm = { x: Math.round((Math.min(...xs) + Math.max(...xs) - d0.L) / 2), y: -Math.round(d0.W / 2), z: Math.round(Math.max(...ld.liftPoints.map((q) => q.z)) - (+d0.H || 0)) };
  ld.setupMode = 'import';
  ld.bePlan = { ...(ld.bePlan || {}), ref: d.ref || '', lenKind: 'overall', legs: legs.map((l) => ({ id: l.id, len: num(l.len), angle: num(l.angle), side: l.side < 0 ? -1 : 1, meas: l.meas ?? null, typed: l.typed ?? null, p: l.p || null })), hook: d.hook || null };
  if (d.image) Object.assign(ld.bePlan, { image: d.image, w: d.w, h: d.h, file: d.file || '', page: d.page || 1 });
  // rigging: legs on the hook, lengths kept as given
  const rig = p.rigging;
  const wasSpreader = rig.type === 'spreader';
  rig.type = 'hook';
  rig.design = rig.design || {};
  rig.design.sizingAngleV_deg = num(d.sizingAngle) > 0 ? num(d.sizingAngle) : null;
  rig.legs = rig.legs || {};
  for (const g of geo) {
    const leg = (rig.legs[g.id] = rig.legs[g.id] || {});
    if (Array.isArray(leg.parts)) leg.parts.forEach((x) => { if (isLengthPart(x) && x.lock) { x.lock = false; x.length_m = null; } });
    leg.Leff_m = g.L;
  }
  for (const k of Object.keys(rig.legs)) if (!geo.some((g) => g.id === k) && !['TA', 'TB'].includes(k)) delete rig.legs[k];
  p.report = p.report || {};
  p.report.figs = p.report.figs || {};
  p.report.figs.be = true;
  ['xy', 'xz', 'yz'].forEach((k) => { p.report.figs[k] = false; });
  return { wasSpreader };
}

/** Data of the project as the dialog shows it (coordinates of the drawn legs normalised to the image). */
function fromProject() {
  const p = app.project, ld = p.load, be = ld.bePlan || {};
  const legs = (be.legs || []).map((l) => ({ id: l.id, len: l.len, typed: l.typed ?? null, meas: l.meas ?? null, side: l.side || 1, p: l.p || null }));
  if (!legs.length) {
    // earlier import (points + lengths): lengths kept, legs to draw again
    (ld.liftPoints || []).filter((q) => q.used !== false).forEach((q) => legs.push({ id: q.id, len: num(p.rigging.legs?.[q.id]?.Leff_m), typed: null, meas: null, side: 1, p: null }));
  }
  return { ref: be.ref || '', weight: ld.weight_t ?? null, sizingAngle: p.rigging.design?.sizingAngleV_deg ?? 30, legs, hook: be.hook || null };
}

export function openPlanImport(onDone) {
  document.getElementById('planimport')?.remove();
  const ld = app.project.load;
  const had = !!ld.bePlan;
  const st = {
    src: null, page: ld.bePlan?.page || 1, zoom: 1, crop: null, cropMode: false, text: [], drag: null, active: null,
    image: ld.bePlan?.image || null, sel: null, size: null,
    ...(had ? fromProject() : { ref: '', weight: ld.weight_t ?? null, sizingAngle: 30, hook: null, legs: ['A', 'B'].map((id) => ({ id, len: null, typed: null, meas: null, side: 1, p: null })) }),
  };
  // coordinates of the hook and of the lift points: normalised (0–1) on the sheet shown
  if (st.sel == null) st.sel = st.legs.findIndex((l) => !l.p);
  if (st.sel < 0) st.sel = null;

  const side = el('div', { class: 'wz-side pi-side' });
  const canvasBox = el('div', { class: 'wz-canvas', id: 'pi-canvas' });
  const hint = el('div', { class: 'muted pi-hint' });
  const fileInp = el('input', { type: 'file', accept: 'application/pdf,image/*', class: 'hide', onchange: async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      st.src = await openSource(f);
      st.page = 1;
      clearDrawn();
      await loadText();
      buildSide();
      refreshTools();
      render();
    } catch (err) {
      alert(`Unreadable file: ${err.message}`);
    }
  } });
  const clearDrawn = () => { st.crop = null; st.zoom = 1; st.hook = null; st.awaitHook = false; st.legs.forEach((l) => { l.p = null; l.meas = null; }); st.sel = st.legs.length ? 0 : null; };

  async function loadText() {
    st.text = [];
    try { st.text = st.src ? (await st.src.text(st.page)).filter((t) => /\d/.test(t.str)) : []; } catch { st.text = []; }
  }

  // ---------------------------------------------------------------- page units ↔ normalised
  const toPage = (n) => (n && st.size ? { u: n.u * st.size.w, v: n.v * st.size.h } : null);
  const toNorm = (q) => ({ u: q.u / st.size.w, v: q.v / st.size.h });
  function measure() {
    const h = toPage(st.hook);
    st.legs.forEach((l) => {
      const a = legAngle(h, toPage(l.p));
      if (a) { l.meas = Math.round(a.angle * 10) / 10; l.side = a.side; } else if (!l.p) l.meas = null;
    });
  }
  const angleOf = (l) => (num(l.typed) != null ? num(l.typed) : l.meas);

  // ---------------------------------------------------------------- form
  function buildSide() {
    side.innerHTML = '';
    const tb = el('tbody');
    st.legs.forEach((l, i) => {
      const on = st.sel === i;
      const a = angleOf(l);
      tb.append(el('tr', { class: on ? 'pi-on' : '' },
        el('td', {}, el('input', { type: 'text', value: l.id, style: { width: '38px', fontWeight: 700 }, oninput: (e) => { l.id = e.target.value.trim(); drawOverlay(); } })),
        el('td', {}, el('button', { class: `small ${on ? 'primary' : ''}`, title: 'Click the lift point on the plan, then the hook', onclick: () => { st.sel = on ? null : i; buildSide(); drawOverlay(); refreshHint(); } },
          on ? (st.awaitHook ? 'Now the hook…' : 'Click its lift point…') : l.p ? '✓ Redraw' : '✎ Draw')),
        el('td', {}, el('input', { type: 'number', value: l.len ?? '', placeholder: 'm', style: { width: '70px' }, 'data-len': i,
          oninput: (e) => { l.len = num(e.target.value); drawOverlay(); }, onfocus: (e) => { st.active = e.target; } })),
        el('td', {}, el('input', { type: 'number', value: l.typed ?? '', placeholder: l.meas != null ? `${fmt(l.meas, 1)}` : '°', title: 'Angle to the vertical: read on the plan when the leg is drawn; type it to change it', style: { width: '62px' },
          oninput: (e) => { l.typed = num(e.target.value); drawOverlay(); }, onfocus: (e) => { st.active = e.target; } })),
        el('td', { class: 'muted', style: { fontSize: '11px' } }, a != null ? (num(l.typed) != null ? 'typed' : 'on plan') : ''),
        el('td', {}, el('button', { class: 'small danger', title: 'Remove the leg', onclick: () => { st.legs.splice(i, 1); if (st.sel === i) st.sel = null; else if (st.sel > i) st.sel--; buildSide(); drawOverlay(); } }, '✕'))));
    });
    side.append(
      el('div', { class: 'pi-step' }, el('b', {}, '1. The lift plan'),
        el('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } },
          el('button', { class: 'small primary', onclick: () => fileInp.click() }, st.src || st.image ? 'Change the file…' : 'Choose the file (PDF or image)…'), fileInp,
          st.src ? el('span', { class: 'muted', style: { fontSize: '12px' } }, st.src.name) : null),
        el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Reference of the plan (printed under the drawing)'),
          el('input', { type: 'text', value: st.ref, placeholder: 'e.g. BE-2026-114 rev. B', oninput: (e) => { st.ref = e.target.value; } }))),
      el('div', { class: 'pi-step' }, el('b', {}, '2. Weight'),
        el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Net weight of the load (t)'),
          el('input', { type: 'number', value: st.weight ?? '', oninput: (e) => { st.weight = num(e.target.value); }, onfocus: (e) => { st.active = e.target; } }))),
      el('div', { class: 'pi-step' }, el('b', {}, '3. The legs: draw them on the plan and give their length'),
        el('p', { class: 'muted', style: { fontSize: '12px', margin: '2px 0 6px' } },
          '✎ Draw, then click the lift point of the leg on the plan, then the hook (one click is enough for the next legs: they go to the same hook). Markers can be dragged. Length = lift point → hook.'),
        el('table', { class: 'data compact pi-pts' },
          el('thead', {}, el('tr', {}, ['Leg', 'On the plan', 'Length (m)', 'Angle (°)', '', ''].map((h) => el('th', {}, h)))), tb),
        el('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
          el('button', { class: 'small', onclick: () => { const used = new Set(st.legs.map((l) => l.id)); st.legs.push({ id: IDS.split('').find((c) => !used.has(c)) || `L${st.legs.length + 1}`, len: null, typed: null, meas: null, side: 1, p: null }); st.sel = st.legs.length - 1; buildSide(); refreshHint(); } }, '+ Leg'),
          el('button', { class: 'small', title: 'The length of the first leg given, on every leg', onclick: () => { const L = st.legs.find((l) => l.len > 0)?.len; if (!L) return toast('Type the length of one leg first'); st.legs.forEach((l) => { l.len = L; }); buildSide(); drawOverlay(); } }, 'Same length on every leg'),
          st.hook ? el('button', { class: 'small', title: 'Click the hook again on the plan (or drag it)', onclick: () => { st.awaitHook = true; buildSide(); refreshHint(); } }, 'Move the hook') : null)),
      el('div', { class: 'pi-step' }, el('b', {}, '4. Sizing of the slings'),
        el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Slings and shackles sized for an angle to the vertical of at least (°)'),
          el('input', { type: 'number', value: st.sizingAngle ?? '', placeholder: 'actual angle', oninput: (e) => { st.sizingAngle = num(e.target.value); } }))),
      el('p', { class: 'muted', style: { fontSize: '12px' } },
        'The COG is under the hook. The shackles, slings and master link are chosen on the Rigging page for the forces; the leg lengths stay as given. The plan is printed in the report.'),
    );
  }

  // ---------------------------------------------------------------- preview of the plan
  let pv = null;
  async function render() {
    if (!st.src && !st.image) {
      canvasBox.innerHTML = '';
      canvasBox.append(el('div', { class: 'pi-empty' }, el('p', {}, 'Lift plan of the engineering office (PDF or image: sheet of the plan, screenshot of the 3D…)'),
        el('button', { class: 'primary', onclick: () => fileInp.click() }, 'Choose the file…')));
      refreshHint();
      return;
    }
    let c, size;
    if (st.src) {
      size = st.src.pageSize(st.page);
      const k = ((canvasBox.clientWidth || 800) - 24) / size.w * st.zoom;
      c = await st.src.render(st.page, Math.min(k * (window.devicePixelRatio || 1), Math.sqrt(40e6 / (size.w * size.h))));
      pv = { k, size };
      c.style.width = `${size.w * k}px`;
      c.style.height = `${size.h * k}px`;
    } else {
      c = el('img', { src: st.image, alt: '', draggable: 'false' });
      await new Promise((r) => { if (c.complete) r(); else c.onload = r; });
      size = { w: c.naturalWidth, h: c.naturalHeight };
      const k = ((canvasBox.clientWidth || 800) - 24) / size.w * st.zoom;
      pv = { k, size };
      c.style.width = `${size.w * k}px`;
      c.style.height = `${size.h * k}px`;
    }
    st.size = size;
    const ov = document.createElementNS(NS, 'svg');
    ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    ov.setAttribute('class', 'wz-overlay');
    ov.style.width = c.style.width;
    ov.style.height = `${size.h * pv.k}px`;
    const holder = el('div', { class: 'wz-page' }, c, ov);
    canvasBox.innerHTML = '';
    canvasBox.append(holder);
    pv.ov = ov;
    ov.addEventListener('pointerdown', onDown);
    ov.addEventListener('pointermove', onMove);
    ov.addEventListener('pointerup', onUp);
    measure();
    drawOverlay();
    refreshHint();
  }

  function refreshHint() {
    const l = st.sel != null ? st.legs[st.sel] : null;
    hint.textContent = st.cropMode ? 'Drag a frame around the part of the sheet to keep (the rest is not printed).'
      : st.awaitHook ? 'Now click the HOOK on the plan.'
        : l ? `Leg ${l.id}: click its LIFT POINT on the plan.`
        : `Wheel = zoom · drag = move · ✎ Draw a leg, then click on the plan${st.text.length ? ' · click a dimension = value in the field selected' : ''}`;
    if (pv?.ov) pv.ov.style.cursor = st.cropMode || l || st.awaitHook ? 'crosshair' : 'grab';
  }

  function drawOverlay() {
    if (!pv?.ov) return;
    const ov = pv.ov;
    ov.innerHTML = '';
    const s = 1 / pv.k; // one screen pixel in page units
    const add = (tag, attrs, txt) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; ov.append(e); return e; };
    const r = st.drag?.rect || (st.cropMode ? null : st.crop);
    if (r) {
      add('path', { d: `M0 0H${pv.size.w}V${pv.size.h}H0Z M${r.x} ${r.y}v${r.h}h${r.w}v${-r.h}Z`, fill: 'rgba(20,30,45,.35)', 'fill-rule': 'evenodd' });
      add('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none', stroke: '#e8822a', 'stroke-width': 2 * s, 'stroke-dasharray': `${6 * s} ${4 * s}` });
    }
    if (st.cropMode) return;
    const h = toPage(st.hook);
    const label = (x, y, t, anchor = 'start') => {
      const g = add('text', { x, y, 'font-size': 13 * s, 'font-weight': 700, fill: '#b4561a', stroke: '#fff', 'stroke-width': 3 * s, 'paint-order': 'stroke', 'text-anchor': anchor, 'font-family': 'Arial, sans-serif' }, t);
      return g;
    };
    st.legs.forEach((l, i) => {
      const q = toPage(l.p);
      if (!q) return;
      const on = st.sel === i;
      if (h) {
        add('line', { x1: h.u, y1: h.v, x2: q.u, y2: q.v, stroke: '#e8822a', 'stroke-width': (on ? 4 : 3) * s, 'stroke-linecap': 'round', opacity: 0.9 });
        const a = angleOf(l);
        const mx = (h.u + q.u) / 2, my = (h.v + q.v) / 2;
        label(mx + (q.u < h.u ? -8 : 8) * s, my, `${l.id}${l.len ? ` · ${fmt(l.len, 2)} m` : ''}${a != null ? ` · ${fmt(a, 1)}°` : ''}`, q.u < h.u ? 'end' : 'start');
      }
      add('circle', { cx: q.u, cy: q.v, r: (on ? 8 : 7) * s, fill: '#d64541', stroke: '#fff', 'stroke-width': 2 * s, 'data-m': `p${i}`, style: 'cursor:move' });
      if (!h) label(q.u + 10 * s, q.v - 8 * s, l.id);
    });
    if (h) {
      add('circle', { cx: h.u, cy: h.v, r: 9 * s, fill: '#f2b705', stroke: '#1c2733', 'stroke-width': 2 * s, 'data-m': 'hook', style: 'cursor:move' });
      label(h.u + 12 * s, h.v - 8 * s, 'Hook');
    }
    st.text.forEach((t) => add('rect', { class: 'pi-tok', x: t.u - 2, y: t.v - t.h - 1, width: Math.max(t.w, t.h) + 4, height: t.h + 3, fill: 'transparent', 'pointer-events': 'none' }));
  }

  const pagePt = (ev) => { const b = pv.ov.getBoundingClientRect(); return { u: ((ev.clientX - b.left) / b.width) * pv.size.w, v: ((ev.clientY - b.top) / b.height) * pv.size.h }; };
  function onDown(ev) {
    if (!pv) return;
    const q = pagePt(ev);
    ev.preventDefault();
    if (st.cropMode) {
      pv.ov.setPointerCapture(ev.pointerId);
      st.drag = { a: q, rect: { x: q.u, y: q.v, w: 0, h: 0 } };
      return;
    }
    // a marker: dragged
    const m = ev.target.getAttribute?.('data-m');
    if (m) {
      pv.ov.setPointerCapture(ev.pointerId);
      st.drag = { marker: m, moved: false };
      return;
    }
    // drawing a leg: its lift point, then the hook (once: the next legs go to the same hook)
    const l = st.sel != null ? st.legs[st.sel] : null;
    if (st.awaitHook || l) {
      if (st.awaitHook) { st.hook = toNorm(q); st.awaitHook = false; }
      else {
        l.p = toNorm(q);
        if (!st.hook) { st.awaitHook = true; measure(); buildSide(); drawOverlay(); refreshHint(); return; }
      }
      measure();
      const done = l || st.legs.find((x) => x.p);
      const nx = st.legs.findIndex((x) => !x.p);
      st.sel = nx >= 0 ? nx : null;
      buildSide();
      drawOverlay();
      refreshHint();
      const a = done ? angleOf(done) : null;
      if (a != null) toast(`Leg ${done.id}: ${fmt(a, 1)}° to the vertical`);
      return;
    }
    // a dimension clicked goes into the field selected
    const near = st.text.map((t) => ({ t, d: Math.hypot(q.u - (t.u + t.w / 2), q.v - (t.v - t.h / 2)) })).sort((a, b) => a.d - b.d)[0];
    const fld = st.active && side.contains(st.active) && st.active.dataset.num ? st.active : null;
    if (fld && near && near.d <= Math.max(14, near.t.w)) {
      const mm = String(near.t.str).replace(/\s/g, '').match(/[-+−]?\d+(?:[.,]\d+)?/);
      if (mm) {
        const v = Number(mm[0].replace('−', '-').replace(',', '.'));
        fld.value = String(v);
        fld.dispatchEvent(new Event('input'));
        toast(`${v} entered`);
        return;
      }
    }
    panner.startPan(ev);
  }
  function onMove(ev) {
    if (!st.drag) return;
    const q = pagePt(ev);
    if (st.drag.marker) {
      st.drag.moved = true;
      const n = toNorm(q);
      if (st.drag.marker === 'hook') st.hook = n;
      else st.legs[Number(st.drag.marker.slice(1))].p = n;
      measure();
      drawOverlay();
      return;
    }
    const a = st.drag.a;
    st.drag.rect = { x: Math.min(a.u, q.u), y: Math.min(a.v, q.v), w: Math.abs(q.u - a.u), h: Math.abs(q.v - a.v) };
    drawOverlay();
  }
  function onUp() {
    if (!st.drag) return;
    const d = st.drag;
    st.drag = null;
    if (d.marker) {
      if (!d.moved && d.marker !== 'hook') { st.sel = Number(d.marker.slice(1)); refreshHint(); }
      buildSide();
      drawOverlay();
      return;
    }
    const r = d.rect;
    if (r.w > 20 && r.h > 20) { st.crop = r; st.cropMode = false; render(); refreshTools(); } else drawOverlay();
  }

  const panner = panZoomBox(canvasBox, { get: () => st.zoom, set: (z) => { st.zoom = z; }, redraw: render, min: 0.4, max: 10 });
  const tools = el('div', { class: 'wz-tools' });
  function refreshTools() {
    tools.innerHTML = '';
    if (!(st.src || st.image)) return;
    const pageSel = st.src?.pages > 1 ? el('select', { onchange: async (e) => { st.page = Number(e.target.value); clearDrawn(); await loadText(); buildSide(); render(); } },
      Array.from({ length: st.src.pages }, (_, i) => el('option', { value: i + 1, selected: st.page === i + 1 }, `Page ${i + 1}`))) : null;
    tools.append(...[
      pageSel,
      el('button', { class: 'small', onclick: () => { st.zoom = Math.max(0.4, st.zoom / 1.3); render(); } }, '−'),
      el('button', { class: 'small', onclick: () => { st.zoom = Math.min(10, st.zoom * 1.3); render(); } }, '+'),
      el('button', { class: 'small', onclick: () => { st.zoom = 1; render(); } }, 'Fit'),
      st.src ? el('button', { class: `small ${st.cropMode ? 'primary' : ''}`, title: 'Keep only a part of the sheet for the report', onclick: () => { st.cropMode = !st.cropMode; render(); refreshTools(); } }, '✂ Frame for the report') : null,
      st.src && st.crop ? el('button', { class: 'small', onclick: () => { st.crop = null; render(); refreshTools(); } }, 'Whole sheet') : null,
      hint,
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------- apply
  async function apply() {
    try {
      measure();
      const d = {
        ref: st.ref, weight: st.weight, sizingAngle: st.sizingAngle, hook: null,
        legs: st.legs.map((l) => ({ id: l.id, len: l.len, angle: angleOf(l), side: l.side, meas: l.meas, typed: num(l.typed), p: null })),
      };
      // positions of the drawing kept on the image printed (normalised to it)
      let toImg = (n) => n;
      if (st.src) {
        const size = st.src.pageSize(st.page);
        const r = st.crop || { x: 0, y: 0, w: size.w, h: size.h };
        toImg = (n) => (n ? { u: (n.u * size.w - r.x) / r.w, v: (n.v * size.h - r.y) / r.h } : null);
        const { canvas } = await st.src.renderRegion(st.page, r, 1800);
        Object.assign(d, { image: canvas.toDataURL('image/jpeg', 0.88), w: canvas.width, h: canvas.height, file: st.src.name, page: st.page });
      } else if (!st.image) return alert('Choose the file of the lift plan first');
      d.hook = st.hook ? toImg(st.hook) : null;
      d.legs.forEach((x, i) => { x.p = st.legs[i].p ? toImg(st.legs[i].p) : null; });
      const { wasSpreader } = applyPlanImport(app.project, d);
      close();
      app.recompute();
      window.__rerender?.();
      toast(wasSpreader ? 'Lift plan imported — rigging changed to legs on the hook' : 'Lift plan imported');
      onDone?.();
    } catch (e) {
      alert(e.message);
    }
  }

  const close = () => { document.removeEventListener('keydown', esc); modal.remove(); };
  const esc = (e) => { if (e.key === 'Escape' && !e.target.closest?.('input')) close(); };
  const modal = el('div', { id: 'planimport', class: 'modal' }, el('div', { class: 'modal-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Import a lift plan (engineering office)'), el('span', { style: { flex: 1 } }),
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: apply }, had ? 'Update the load' : 'Import')),
    el('div', { class: 'modal-body pi-body' }, side, el('div', { class: 'wz-main' }, tools, canvasBox))));
  document.addEventListener('keydown', esc);
  document.body.append(modal);
  buildSide();
  refreshTools();
  render();
  return { st, apply, close };
}

/** Summary shown on the Load page once a lift plan has been imported. */
export function importedSummary(res) {
  const p = app.project, ld = p.load, be = ld.bePlan || {};
  const legs = res?.rig?.legs || [];
  const tb = el('tbody');
  (ld.liftPoints || []).filter((q) => q.used !== false).forEach((q) => {
    const l = legs.find((x) => x.pointId === q.id && x.level !== 'top');
    tb.append(el('tr', {},
      el('td', {}, el('b', {}, q.id)),
      el('td', { class: 'num' }, l ? `${fmt(l.Leff, 2)} m` : '—'),
      el('td', { class: 'num' }, l ? `${l.angleV.toFixed(1)}°` : '—'),
      el('td', { class: 'num' }, l ? `${fmt(l.Tstatic)} t` : '—'),
      el('td', { class: 'num' }, l ? `${fmt(l.Fdesign)} t${l.sizedAt ? ` (at ${fmt(l.sizedAt, 0)}°)` : ''}` : '—'),
      el('td', {}, l?.parts?.filter((x) => x.item).map((x) => x.item.name || x.item.id).join(' → ') || '')));
  });
  const tilt = res?.rig?.tilt;
  const sa = Number(p.rigging.design?.sizingAngleV_deg);
  return el('div', { class: 'pi-sum' },
    be.image ? el('img', { src: be.image, alt: '', class: 'pi-thumb', title: 'Printed in the report — click to edit', onclick: () => openPlanImport() }) : el('div', { class: 'pi-thumb muted' }, 'No drawing'),
    el('div', {},
      el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, [be.ref || 'No reference', be.file ? ` · ${be.file}` : '', ` · weight ${fmt(ld.weight_t)} t`].join('')),
      el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, ['Leg', 'Length', 'Angle to vert.', 'Static tension', 'Design force', 'Rigging'].map((h, i) => el('th', { class: i && i < 5 ? 'num' : '' }, h)))), tb),
      res?.legCog?.error ? el('p', { class: 'note fail', style: { fontSize: '12.5px', margin: '6px 0 0' } }, res.legCog.error) : null,
      tilt ? el('p', { class: 'muted', style: { fontSize: '12px', margin: '6px 0 0' } }, `COG under the hook · hook ${fmt(res.rig.riggingHeight)} m above the highest lift point${tilt.slack?.length ? ` · slack: ${tilt.slack.map((i) => legs[i]?.label).join(', ')}` : ''}${sa > 0 ? ` · slings sized for ${fmt(sa, 0)}° at least` : ''}`) : null));
}
