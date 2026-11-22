// Import of a lift plan made by the engineering office (BE), simplified method: the plan (PDF or
// image) is kept for the report; the legs and their lengths are typed; the COG is taken as centred,
// so every leg carries the same force, at the angle assumed (30° to the vertical by default).
import { app } from './app.js';
import { el, toast, fmt } from './dom.js';
import { openSource } from './pdfutil.js';
import { isLengthPart } from '../engine/rigging.js';
import { equalShareLayout } from '../engine/legcog.js';
import { bePlanSvg } from '../draw/beplan.js';
import { safeImg } from './loadview.js';
import { panZoomBox } from './panzoom.js';

const NS = 'http://www.w3.org/2000/svg';
const IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const num = (v) => (v === '' || v == null || !isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
const rad = (d) => (d * Math.PI) / 180;

/**
 * Applies the import to the project (also used by the tests). d = { ref, weight, angle (° to the
 * vertical, assumed for every leg), legs: [{ id, len (m) }], image, w, h, file, page }.
 * The legs are laid out around the COG (centred), each at the angle assumed with its own length,
 * and share the load equally.
 */
export function applyPlanImport(p, d) {
  const ld = p.load;
  const legs = (d.legs || []).filter((l) => String(l.id || '').trim());
  if (!legs.length) throw new Error('Add at least one leg');
  for (const l of legs) {
    if (!(num(l.len) > 0)) throw new Error(`Leg ${l.id}: type its length (m)`);
    if (num(l.len) > 60) throw new Error(`Leg ${l.id}: ${num(l.len)} m? The lengths are in metres (e.g. 5.85 or 5,85).`);
  }
  const A = legs.length === 1 ? 0 : num(d.angle) ?? 30;
  if (!(A >= 0 && A < 80)) throw new Error(`Angle to the vertical ${A}°? (0 to 80°)`);
  if (num(d.weight) > 0) ld.weight_t = num(d.weight);
  const geo = legs.map((l) => ({ id: String(l.id).trim(), L: num(l.len) }));
  const tpl = ld.liftPoints.find((q) => q.kind === 'padeye' || q.padeye) || ld.liftPoints[0] || { kind: 'padeye', padeye: true };
  const { id: _i, x: _x, y: _y, z: _z, picks: _p, used: _u, ...props } = tpl;
  ld.liftPoints = geo.map((g) => {
    const old = ld.liftPoints.find((q) => q.id === g.id);
    const base = old ? (({ id, x, y, z, picks, ...o }) => o)(old) : { ...props };
    return { ...base, id: g.id, x: 0, y: 0, z: 0, used: true, picks: {} };
  });
  ld.cog_mm = { x: 0, y: 0, z: 0 };
  ld.cogBasis = 'centred';
  ld.cogZUnknown = true;
  // legs spread evenly around the COG (4 legs: square), each at the angle A with its length
  equalShareLayout(ld, Object.fromEntries(geo.map((g) => [g.id, g.L])), A);
  const d0 = ld.dims_mm || {};
  if (+d0.L > 0 && +d0.W > 0) ld.origin_mm = { x: -Math.round(d0.L / 2), y: -Math.round(d0.W / 2), z: Math.round(Math.max(...ld.liftPoints.map((q) => q.z)) - (+d0.H || 0)) };
  ld.setupMode = 'import';
  ld.bePlan = { ...(ld.bePlan || {}), ref: d.ref || '', lenKind: 'overall', angle: A, hook: d.hook || null, legs: legs.map((l) => ({ id: String(l.id).trim(), len: num(l.len), p: l.p || null })) };
  if (d.image) Object.assign(ld.bePlan, { image: d.image, w: d.w, h: d.h, file: d.file || '', page: d.page || 1 });
  // rigging: legs on the hook, lengths kept, same share for every leg, sized for the angle assumed
  const rig = p.rigging;
  const wasSpreader = rig.type === 'spreader';
  rig.type = 'hook';
  rig.equalShare = true;
  rig.equalAngle_deg = A;
  rig.design = rig.design || {};
  rig.design.sizingAngleV_deg = A > 0 ? A : null;
  // slings: standard lengths (the setting kept if already standard), or made to measure
  if (d.std === false) rig.design.roundLengths = 'exact';
  else rig.design.roundLengths = 'up';
  delete rig.design.imposedStd;
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

/** Leaves the simplified method (back to the set-up from the drawing). */
export function leaveImport(p) {
  p.load.setupMode = 'drawing';
  if (p.load.cogBasis === 'centred' || p.load.cogBasis === 'legs') p.load.cogBasis = 'drawing';
  delete p.rigging.equalShare;
  // from the drawing: lengths from the target angle, slings sized on the actual angle
  if (p.rigging.design) p.rigging.design.sizingAngleV_deg = null;
  Object.values(p.rigging.legs || {}).forEach((l) => { if (l) delete l.Leff_m; });
}

/** Data of the project as the dialog shows it. */
function fromProject() {
  const p = app.project, ld = p.load, be = ld.bePlan || {};
  const legs = (be.legs || []).map((l) => ({ id: l.id, len: l.len ?? null, p: l.p || null }));
  if (!legs.length) (ld.liftPoints || []).filter((q) => q.used !== false).forEach((q) => legs.push({ id: q.id, len: num(p.rigging.legs?.[q.id]?.Leff_m), p: null }));
  return { ref: be.ref || '', weight: ld.weight_t ?? null, angle: be.angle ?? p.rigging.design?.sizingAngleV_deg ?? 30, std: p.rigging.design?.roundLengths !== 'exact', legs, hook: be.hook || null };
}

export function openPlanImport(onDone) {
  document.getElementById('planimport')?.remove();
  const ld = app.project.load;
  const had = !!ld.bePlan;
  const st = {
    src: null, page: ld.bePlan?.page || 1, zoom: 1, crop: null, cropMode: false, text: [], drag: null, active: null,
    image: ld.bePlan?.image || null, size: null, sel: null, awaitHook: false,
    ...(had ? fromProject() : { ref: '', weight: ld.weight_t ?? null, angle: 30, std: true, hook: null, legs: ['A', 'B', 'C', 'D'].map((id) => ({ id, len: null, p: null })) }),
  };
  // marks on the plan (sketch only): hook and lift points, normalised (0–1) on the sheet shown
  const clearMarks = () => { st.hook = null; st.awaitHook = false; st.sel = null; st.legs.forEach((l) => { l.p = null; }); };
  const toPage = (n) => (n && st.size ? { u: n.u * st.size.w, v: n.v * st.size.h } : null);
  const toNorm = (q) => ({ u: q.u / st.size.w, v: q.v / st.size.h });

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
      st.crop = null;
      st.zoom = 1;
      clearMarks();
      await loadText();
      buildSide();
      refreshTools();
      render();
    } catch (err) {
      alert(`Unreadable file: ${err.message}`);
    }
  } });

  async function loadText() {
    st.text = [];
    try { st.text = st.src ? (await st.src.text(st.page)).filter((t) => /\d/.test(t.str)) : []; } catch { st.text = []; }
  }

  // ---------------------------------------------------------------- form
  function buildSide() {
    side.innerHTML = '';
    const tb = el('tbody');
    const has = !!(st.src || st.image);
    st.legs.forEach((l, i) => {
      const on = st.sel === i && !st.awaitHook;
      tb.append(el('tr', { class: on ? 'pi-on' : '' },
        el('td', {}, el('input', { type: 'text', value: l.id, style: { width: '44px', fontWeight: 700 }, oninput: (e) => { l.id = e.target.value.trim(); drawOverlay(); } })),
        el('td', {}, el('input', { type: 'number', value: l.len ?? '', placeholder: 'm', style: { width: '90px' }, 'data-len': i,
          oninput: (e) => { l.len = num(e.target.value); }, onfocus: (e) => { st.active = e.target; } })),
        el('td', {}, has ? el('button', { class: `small ${on ? 'primary' : ''}`, title: 'Sketch only: click its lift point on the plan', onclick: () => { st.sel = on ? null : i; st.awaitHook = false; buildSide(); refreshHint(); } },
          on ? 'Click on the plan…' : l.p ? '✓ Move' : '✎ Place') : null),
        el('td', {}, el('button', { class: 'small danger', title: 'Remove the leg', onclick: () => { st.legs.splice(i, 1); st.sel = null; buildSide(); drawOverlay(); } }, '✕'))));
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
      el('div', { class: 'pi-step' }, el('b', {}, '3. The legs and their length'),
        el('p', { class: 'muted', style: { fontSize: '12px', margin: '2px 0 6px' } }, 'On the plan (optional, for the sketch only): place the hook and each lift point — they are named on the plan in the report, with what each leg is made of.'),
        el('table', { class: 'data compact pi-pts' },
          el('thead', {}, el('tr', {}, ['Leg', 'Length (m)', 'On the plan', ''].map((h) => el('th', {}, h)))), tb),
        el('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
          el('button', { class: 'small', onclick: () => { const used = new Set(st.legs.map((l) => l.id)); st.legs.push({ id: IDS.split('').find((c) => !used.has(c)) || `L${st.legs.length + 1}`, len: null, p: null }); buildSide(); } }, '+ Leg'),
          has ? el('button', { class: `small ${st.awaitHook ? 'primary' : ''}`, title: 'Sketch only: click the hook on the plan', onclick: () => { st.awaitHook = !st.awaitHook; buildSide(); refreshHint(); } }, st.awaitHook ? 'Click the hook…' : st.hook ? '✓ Move the hook' : '✎ Place the hook') : null,
          el('button', { class: 'small', title: 'The length of the first leg given, on every leg', onclick: () => { const L = st.legs.find((l) => l.len > 0)?.len; if (!L) return toast('Type the length of one leg first'); st.legs.forEach((l) => { l.len = L; }); buildSide(); } }, 'Same length on every leg')),
        el('div', { style: { marginTop: '8px' } }, el('span', { class: 'lbl', style: { fontSize: '12.5px' } }, 'Slings'),
          el('label', { class: 'check', style: { display: 'flex' } }, el('input', { type: 'radio', name: 'pi-std', checked: st.std, onchange: () => { st.std = true; } }), ' Standard lengths (rounded up)'),
          el('label', { class: 'check', style: { display: 'flex' } }, el('input', { type: 'radio', name: 'pi-std', checked: !st.std, onchange: () => { st.std = false; } }), ' Exact lengths (made to measure)'))),
      el('div', { class: 'pi-step' }, el('b', {}, '4. Angle of the legs'),
        el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Angle to the vertical taken for every leg (°)'),
          el('input', { type: 'number', value: st.angle ?? '', oninput: (e) => { st.angle = num(e.target.value); } }))),
      el('p', { class: 'note info', style: { fontSize: '12.5px' } },
        'COG taken as centred: every leg carries the same force = weight ÷ number of legs ÷ cos(angle). The shackles, slings and master link are chosen for it on the Rigging page; the leg lengths stay as given. The plan is printed in the report.'),
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
    drawOverlay();
    refreshHint();
  }

  function refreshHint() {
    const l = st.sel != null ? st.legs[st.sel] : null;
    hint.textContent = st.cropMode ? 'Drag a frame around the part of the sheet to keep (the rest is not printed).'
      : st.awaitHook ? 'Click the HOOK on the plan.'
        : l ? `Click the lift point of leg ${l.id} on the plan.`
          : `Wheel = zoom · drag = move · markers can be dragged${st.text.length ? ' · click a dimension = value in the field selected on the left' : ''}`;
    if (pv?.ov) pv.ov.style.cursor = st.cropMode || l || st.awaitHook ? 'crosshair' : 'grab';
  }

  function drawOverlay() {
    if (!pv?.ov) return;
    const ov = pv.ov;
    ov.innerHTML = '';
    const s = 1 / pv.k;
    const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); ov.append(e); return e; };
    const r = st.drag?.rect || st.crop;
    if (r) {
      add('path', { d: `M0 0H${pv.size.w}V${pv.size.h}H0Z M${r.x} ${r.y}v${r.h}h${r.w}v${-r.h}Z`, fill: 'rgba(20,30,45,.35)', 'fill-rule': 'evenodd' });
      add('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none', stroke: '#e8822a', 'stroke-width': 2 * s, 'stroke-dasharray': `${6 * s} ${4 * s}` });
    }
    if (st.cropMode) return;
    const label = (x, y, t) => { const e = add('text', { x, y, 'font-size': 15 * s, 'font-weight': 700, fill: '#b4561a', stroke: '#fff', 'stroke-width': 3 * s, 'paint-order': 'stroke', 'font-family': 'Arial, sans-serif' }); e.textContent = t; };
    const h = toPage(st.hook);
    st.legs.forEach((l) => { const q = toPage(l.p); if (h && q) add('line', { x1: h.u, y1: h.v, x2: q.u, y2: q.v, stroke: '#e8822a', 'stroke-width': 2.5 * s, opacity: 0.85 }); });
    st.legs.forEach((l, i) => {
      const q = toPage(l.p);
      if (!q) return;
      add('circle', { cx: q.u, cy: q.v, r: (st.sel === i ? 8 : 7) * s, fill: '#d64541', stroke: '#fff', 'stroke-width': 2 * s, 'data-m': `p${i}`, style: 'cursor:move' });
      label(q.u + 10 * s, q.v - 8 * s, l.id);
    });
    if (h) {
      add('circle', { cx: h.u, cy: h.v, r: 9 * s, fill: '#f2b705', stroke: '#1c2733', 'stroke-width': 2 * s, 'data-m': 'hook', style: 'cursor:move' });
      label(h.u + 12 * s, h.v - 8 * s, 'Hook');
    }
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
    const mk = ev.target.getAttribute?.('data-m');
    if (mk) {
      pv.ov.setPointerCapture(ev.pointerId);
      st.drag = { marker: mk };
      return;
    }
    // placing the hook or the lift point of the leg selected (the next legs follow)
    const l = st.sel != null ? st.legs[st.sel] : null;
    if (st.awaitHook || l) {
      if (st.awaitHook) st.hook = toNorm(q);
      else l.p = toNorm(q);
      st.awaitHook = !st.hook;
      const nx = st.legs.findIndex((x) => !x.p);
      st.sel = st.awaitHook ? st.sel : nx >= 0 ? nx : null;
      buildSide();
      drawOverlay();
      refreshHint();
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
    if (st.drag.marker) {
      const n = toNorm(pagePt(ev));
      if (st.drag.marker === 'hook') st.hook = n;
      else st.legs[Number(st.drag.marker.slice(1))].p = n;
      drawOverlay();
      return;
    }
    const q = pagePt(ev), a = st.drag.a;
    st.drag.rect = { x: Math.min(a.u, q.u), y: Math.min(a.v, q.v), w: Math.abs(q.u - a.u), h: Math.abs(q.v - a.v) };
    drawOverlay();
  }
  function onUp() {
    if (!st.drag) return;
    if (st.drag.marker) { st.drag = null; buildSide(); return; }
    const r = st.drag.rect;
    st.drag = null;
    if (r.w > 20 && r.h > 20) { st.crop = r; st.cropMode = false; render(); refreshTools(); } else drawOverlay();
  }

  const panner = panZoomBox(canvasBox, { get: () => st.zoom, set: (z) => { st.zoom = z; }, redraw: render, min: 0.4, max: 10 });
  const tools = el('div', { class: 'wz-tools' });
  function refreshTools() {
    tools.innerHTML = '';
    if (!(st.src || st.image)) return;
    const pageSel = st.src?.pages > 1 ? el('select', { onchange: async (e) => { st.page = Number(e.target.value); st.crop = null; clearMarks(); await loadText(); buildSide(); render(); } },
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
      const d = { ref: st.ref, weight: st.weight, angle: st.angle, std: st.std, legs: st.legs.map((l) => ({ ...l })), hook: st.hook };
      if (st.src) {
        const size = st.src.pageSize(st.page);
        const r = st.crop || { x: 0, y: 0, w: size.w, h: size.h };
        // marks kept on the image printed (normalised to it, framing taken into account)
        const toImg = (n) => (n ? { u: (n.u * size.w - r.x) / r.w, v: (n.v * size.h - r.y) / r.h } : null);
        d.hook = toImg(st.hook);
        d.legs.forEach((l) => { l.p = toImg(l.p); });
        const { canvas } = await st.src.renderRegion(st.page, r, 1800);
        Object.assign(d, { image: canvas.toDataURL('image/jpeg', 0.88), w: canvas.width, h: canvas.height, file: st.src.name, page: st.page });
      } else if (!st.image) return alert('Choose the file of the lift plan first');
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
  const exact = p.rigging.design?.roundLengths === 'exact';
  const legs = res?.rig?.legs || [];
  const tb = el('tbody');
  (ld.liftPoints || []).filter((q) => q.used !== false).forEach((q) => {
    const l = legs.find((x) => x.pointId === q.id && x.level !== 'top');
    const asked = be.legs?.find((x) => x.id === q.id)?.len;
    const sl = l?.parts?.[l.li];
    tb.append(el('tr', {},
      el('td', {}, el('b', {}, q.id)),
      el('td', { class: 'num' }, asked ? `${fmt(asked, 2)} m` : '—'),
      el('td', { class: 'num' }, l ? `${fmt(l.Leff, 2)} m` : '—'),
      el('td', { class: 'num' }, sl?.length_m ? `${fmt(sl.length_m, sl.kind === 'chain' ? 2 : exact ? 3 : 1)} m` : '—'),
      el('td', { class: 'num' }, l ? `${fmt(l.Tstatic)} t` : '—'),
      el('td', { class: 'num' }, l ? `${fmt(l.Fdesign)} t` : '—'),
      el('td', {}, l?.parts?.filter((x) => x.item).map((x) => x.item.name || x.item.id).join(' → ') || '')));
  });
  const n = (ld.liftPoints || []).filter((q) => q.used !== false).length;
  return el('div', { class: 'pi-sum' },
    be.image ? el('div', { class: 'pi-thumb', title: 'Printed in the report — click to edit', onclick: () => openPlanImport(), html: bePlanSvg(be, safeImg(be.image), { maxHeight: '260px' }) || `<img src="${safeImg(be.image) || ''}" alt="" style="width:100%">` }) : el('div', { class: 'pi-thumb muted' }, 'No drawing'),
    el('div', {},
      el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, [be.ref || 'No reference', be.file ? ` · ${be.file}` : '', ` · weight ${fmt(ld.weight_t)} t`].join('')),
      el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, ['Leg', 'Length asked', 'Actual length', exact ? 'Sling (exact)' : 'Sling (standard)', 'Force per leg', 'Design force', 'Rigging'].map((h, i) => el('th', { class: i && i < 6 ? 'num' : '' }, h)))), tb),
      el('p', { class: 'muted', style: { fontSize: '12px', margin: '6px 0 0' } },
        `COG taken as centred: same force in the ${n} legs, at ${fmt(be.angle ?? 30, 0)}° to the vertical (weight × factors ÷ ${n} ÷ cos ${fmt(be.angle ?? 30, 0)}°).`)));
}
