// Import of a lift plan made by the engineering office (BE): its drawing (PDF or image, framed if
// needed) is kept for the report, and the data read on it — weight, lift points measured from the
// COG, known leg lengths — set up the load and the rigging. The legs keep the lengths given.
import { app } from './app.js';
import { el, toast, fmt } from './dom.js';
import { openSource } from './pdfutil.js';
import { legAssembly, isLengthPart } from '../engine/rigging.js';

const NS = 'http://www.w3.org/2000/svg';
const IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const num = (v) => (v === '' || v == null || !isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Current imported data of the project, as the form shows it (coordinates from the COG). */
function fromProject() {
  const p = app.project, ld = p.load, rig = p.rigging || {};
  const be = ld.bePlan || {};
  const c = ld.cog_mm || { x: 0, y: 0, z: 0 };
  const lenKind = be.lenKind || 'overall';
  const rows = (ld.liftPoints || []).filter((q) => q.used !== false).map((q) => {
    let len = null;
    const own = rig.legs?.[q.id];
    if (lenKind === 'overall') len = num(own?.Leff_m);
    else len = num(own?.parts?.find((x) => isLengthPart(x) && x.lock)?.length_m);
    return { id: q.id, x: Math.round((+q.x || 0) - (+c.x || 0)), y: Math.round((+q.y || 0) - (+c.y || 0)), z: Math.round((+q.z || 0) - (+c.z || 0)), len };
  });
  return { ref: be.ref || '', weight: ld.weight_t ?? null, lenKind, rows };
}

/** Applies the import to the project (also used by the tests). */
export function applyPlanImport(p, d) {
  const ld = p.load;
  const rows = d.rows.filter((r) => r.id && [r.x, r.y, r.z].some((v) => num(v) != null));
  if (!rows.length) throw new Error('Enter at least one lift point');
  if (num(d.weight) > 0) ld.weight_t = num(d.weight);
  // coordinates measured from the COG: the COG is the origin of the load frame
  ld.cog_mm = { x: 0, y: 0, z: 0 };
  ld.cogBasis = 'drawing';
  const tpl = ld.liftPoints.find((q) => q.kind === 'padeye' || q.padeye) || ld.liftPoints[0] || { kind: 'padeye', padeye: true };
  const { id: _i, x: _x, y: _y, z: _z, picks: _p, used: _u, ...props } = tpl;
  ld.liftPoints = rows.map((r) => {
    const old = ld.liftPoints.find((q) => q.id === r.id);
    const base = old ? (({ id, x, y, z, picks, ...o }) => o)(old) : { ...props };
    return { ...base, id: String(r.id).trim(), x: num(r.x) || 0, y: num(r.y) || 0, z: num(r.z) || 0, used: true, picks: {} };
  });
  // overall size of the part (as typed on the Load page) drawn centred on the COG, top at the lift points
  const d0 = ld.dims_mm || {};
  if (+d0.L > 0 && +d0.W > 0) ld.origin_mm = { x: -Math.round(d0.L / 2), y: -Math.round(d0.W / 2), z: Math.round(Math.max(...ld.liftPoints.map((q) => q.z)) - (+d0.H || 0)) };
  ld.setupMode = 'import';
  ld.bePlan = { ...(ld.bePlan || {}), ref: d.ref || '', lenKind: d.lenKind };
  if (d.image) Object.assign(ld.bePlan, { image: d.image, w: d.w, h: d.h, file: d.file || '', page: d.page || 1 });
  // rigging: converging legs on the hook; the lengths given are kept
  const rig = p.rigging;
  const wasSpreader = rig.type === 'spreader';
  rig.type = 'hook';
  rig.legs = rig.legs || {};
  for (const r of rows) {
    const id = String(r.id).trim();
    const L = num(r.len);
    const leg = (rig.legs[id] = rig.legs[id] || {});
    delete leg.Leff_m;
    if (Array.isArray(leg.parts)) leg.parts.forEach((x) => { if (isLengthPart(x) && x.lock) { x.lock = false; x.length_m = null; } });
    if (!(L > 0)) continue;
    if (d.lenKind === 'overall') leg.Leff_m = L;
    else {
      const parts = Array.isArray(leg.parts) && leg.parts.length ? leg.parts : clone(legAssembly(rig, id, 'main'));
      const s = parts.find((x) => isLengthPart(x));
      if (s) { s.lock = true; s.length_m = L; }
      leg.parts = parts;
    }
  }
  for (const k of Object.keys(rig.legs)) if (!rows.some((r) => String(r.id).trim() === k) && !['TA', 'TB'].includes(k)) delete rig.legs[k];
  // report: the plan of the engineering office replaces the views drawn from points only
  p.report = p.report || {};
  p.report.figs = p.report.figs || {};
  p.report.figs.be = true;
  ['xy', 'xz', 'yz'].forEach((k) => { p.report.figs[k] = false; });
  return { wasSpreader };
}

export function openPlanImport(onDone) {
  document.getElementById('planimport')?.remove();
  const ld = app.project.load;
  const had = !!ld.bePlan;
  const st = {
    src: null, page: ld.bePlan?.page || 1, zoom: 1, crop: null, cropMode: false, text: [], drag: null, active: null,
    image: ld.bePlan?.image || null,
    ...(had ? fromProject() : { ref: '', weight: ld.weight_t ?? null, lenKind: 'overall', rows: IDS.slice(0, 4).split('').map((id) => ({ id, x: null, y: null, z: null, len: null })) }),
  };

  // ---------------------------------------------------------------- form
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

  const inp = (r, k, attrs = {}) => {
    const e = el('input', { type: k === 'id' ? 'text' : 'number', step: 'any', value: r[k] ?? '', 'data-k': k, ...attrs,
      oninput: (ev) => { r[k] = k === 'id' ? ev.target.value : num(ev.target.value); },
      onfocus: (ev) => { st.active = ev.target; } });
    return e;
  };

  function buildSide() {
    side.innerHTML = '';
    const rowsT = el('tbody');
    st.rows.forEach((r, i) => rowsT.append(el('tr', {},
      el('td', {}, inp(r, 'id', { style: { width: '42px' } })),
      el('td', {}, inp(r, 'x', { placeholder: 'mm' })), el('td', {}, inp(r, 'y', { placeholder: 'mm' })), el('td', {}, inp(r, 'z', { placeholder: 'mm' })),
      el('td', {}, inp(r, 'len', { placeholder: 'auto' })),
      el('td', {}, el('button', { class: 'small danger', title: 'Remove the point', onclick: () => { st.rows.splice(i, 1); buildSide(); } }, '✕')))));
    const lenSel = el('select', { onchange: (e) => { st.lenKind = e.target.value; } },
      el('option', { value: 'overall', selected: st.lenKind === 'overall' }, 'Overall: lift point → crane hook'),
      el('option', { value: 'sling', selected: st.lenKind === 'sling' }, 'Sling only (EWL): shackles and links added'));
    side.append(
      el('div', { class: 'pi-step' }, el('b', {}, '1. The lift plan'),
        el('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } },
          el('button', { class: 'small primary', onclick: () => fileInp.click() }, st.src || st.image ? 'Change the file…' : 'Choose the file (PDF or image)…'), fileInp,
          st.src ? el('span', { class: 'muted', style: { fontSize: '12px' } }, st.src.name) : null),
        el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Reference of the plan (printed under the drawing)'),
          el('input', { type: 'text', value: st.ref, placeholder: 'e.g. BE-2026-114 rev. B', oninput: (e) => { st.ref = e.target.value; } }))),
      el('div', { class: 'pi-step' }, el('b', {}, '2. Weight'),
        el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Net weight of the load (t)'),
          el('input', { type: 'number', step: 'any', value: st.weight ?? '', oninput: (e) => { st.weight = num(e.target.value); }, onfocus: (e) => { st.active = e.target; } }))),
      el('div', { class: 'pi-step' }, el('b', {}, '3. Lift points measured from the COG, and leg lengths'),
        el('p', { class: 'muted', style: { fontSize: '12px', margin: '2px 0 6px' } },
          'X, Y along the load (seen from above), Z upwards: distance of each lift point from the centre of gravity, in mm (e.g. 1501, −2646, +592). Leg length in m, empty = chosen by LiftPlanner.'),
        el('table', { class: 'data compact pi-pts' },
          el('thead', {}, el('tr', {}, ['Point', 'X (mm)', 'Y (mm)', 'Z (mm)', 'Leg length (m)', ''].map((h) => el('th', {}, h)))), rowsT),
        el('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
          el('button', { class: 'small', onclick: () => { const used = new Set(st.rows.map((r) => r.id)); st.rows.push({ id: IDS.split('').find((c) => !used.has(c)) || `P${st.rows.length + 1}`, x: null, y: null, z: null, len: null }); buildSide(); } }, '+ Point'),
          el('button', { class: 'small', title: 'Same leg length on every leg (the first one given)', onclick: () => { const L = st.rows.find((r) => r.len > 0)?.len; if (!L) return toast('Enter the length of one leg first'); st.rows.forEach((r) => { r.len = L; }); buildSide(); } }, 'Same length on every leg')),
        el('label', { class: 'field', style: { marginTop: '6px' } }, el('span', { class: 'lbl' }, 'The leg lengths given are'), lenSel)),
      el('p', { class: 'muted', style: { fontSize: '12px' } },
        'The shackles, slings and master link are then chosen on the Rigging page for the forces; the leg lengths stay as given. The plan is printed in the report (Drawings).'),
    );
  }

  // ---------------------------------------------------------------- preview of the plan
  let pv = null; // { k, size, holder }
  async function render() {
    canvasBox.innerHTML = '';
    if (!st.src && !st.image) {
      canvasBox.append(el('div', { class: 'pi-empty' }, el('p', {}, 'Lift plan of the engineering office (PDF or image: screenshot of the 3D, sheet of the drawing…)'),
        el('button', { class: 'primary', onclick: () => fileInp.click() }, 'Choose the file…')));
      hint.textContent = '';
      return;
    }
    let c, size;
    if (st.src) {
      size = st.src.pageSize(st.page);
      const k = ((canvasBox.clientWidth || 800) - 24) / size.w * st.zoom;
      c = await st.src.render(st.page, k * (window.devicePixelRatio || 1));
      pv = { k, size };
      c.style.width = `${size.w * k}px`;
      c.style.height = `${size.h * k}px`;
    } else {
      c = el('img', { src: st.image, alt: '' });
      await new Promise((r) => { if (c.complete) r(); else c.onload = r; });
      size = { w: c.naturalWidth, h: c.naturalHeight };
      const k = ((canvasBox.clientWidth || 800) - 24) / size.w * st.zoom;
      pv = { k, size };
      c.style.width = `${size.w * k}px`;
    }
    const ov = document.createElementNS(NS, 'svg');
    ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    ov.setAttribute('class', 'wz-overlay');
    ov.style.width = c.style.width;
    ov.style.height = `${size.h * pv.k}px`;
    ov.style.cursor = st.cropMode ? 'crosshair' : st.text.length ? 'pointer' : 'default';
    const holder = el('div', { class: 'wz-page' }, c, ov);
    canvasBox.append(holder);
    pv.ov = ov;
    ov.addEventListener('pointerdown', onDown);
    ov.addEventListener('pointermove', onMove);
    ov.addEventListener('pointerup', onUp);
    drawOverlay();
    hint.textContent = st.cropMode ? 'Drag a frame around the part of the sheet to keep (the rest is not printed).'
      : st.text.length ? 'Tip: click a dimension on the drawing to put its value in the field selected on the left.'
        : st.src ? 'Zoom in to read the values; "Frame the view" keeps only a part of the sheet for the report.' : '';
  }

  function drawOverlay() {
    if (!pv?.ov) return;
    const ov = pv.ov;
    ov.innerHTML = '';
    const s = 1 / pv.k;
    const add = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); ov.append(e); return e; };
    const r = st.drag?.rect || st.crop;
    if (r) {
      add('path', { d: `M0 0H${pv.size.w}V${pv.size.h}H0Z M${r.x} ${r.y}v${r.h}h${r.w}v${-r.h}Z`, fill: 'rgba(20,30,45,.45)', 'fill-rule': 'evenodd' });
      add('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none', stroke: '#e8822a', 'stroke-width': 2 * s, 'stroke-dasharray': `${6 * s} ${4 * s}` });
    }
    if (!st.cropMode) st.text.forEach((t) => add('rect', { class: 'pi-tok', x: t.u - 2, y: t.v - t.h - 1, width: Math.max(t.w, t.h) + 4, height: t.h + 3, fill: 'transparent' }));
  }

  const pagePt = (ev) => { const b = pv.ov.getBoundingClientRect(); return { u: ((ev.clientX - b.left) / b.width) * pv.size.w, v: ((ev.clientY - b.top) / b.height) * pv.size.h }; };
  function onDown(ev) {
    if (!pv) return;
    const q = pagePt(ev);
    if (st.cropMode) {
      pv.ov.setPointerCapture(ev.pointerId);
      st.drag = { a: q, rect: { x: q.u, y: q.v, w: 0, h: 0 } };
      return;
    }
    // a number clicked on the drawing goes into the field selected (which keeps the focus)
    ev.preventDefault();
    const near = st.text.map((t) => ({ t, d: Math.hypot(q.u - (t.u + t.w / 2), q.v - (t.v - t.h / 2)) })).sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > Math.max(14, near.t.w)) return;
    const m = String(near.t.str).replace(/\s/g, '').match(/[-+−]?\d+(?:[.,]\d+)?/);
    if (!m) return;
    const v = Number(m[0].replace('−', '-').replace(',', '.'));
    const a = st.active && side.contains(st.active) ? st.active : null;
    if (!a || a.type !== 'number') return toast('Select a field on the left first, then click the value on the drawing');
    a.value = String(v);
    a.dispatchEvent(new Event('input'));
    const all = [...side.querySelectorAll('input[type=number]')];
    const nx = all[all.indexOf(a) + 1];
    if (nx) { nx.focus(); st.active = nx; }
    toast(`${v} entered`);
  }
  function onMove(ev) {
    if (!st.drag) return;
    const q = pagePt(ev), a = st.drag.a;
    st.drag.rect = { x: Math.min(a.u, q.u), y: Math.min(a.v, q.v), w: Math.abs(q.u - a.u), h: Math.abs(q.v - a.v) };
    drawOverlay();
  }
  function onUp() {
    if (!st.drag) return;
    const r = st.drag.rect;
    st.drag = null;
    if (r.w > 20 && r.h > 20) { st.crop = r; st.cropMode = false; render(); refreshTools(); } else drawOverlay();
  }

  const tools = el('div', { class: 'wz-tools' });
  function refreshTools() {
    tools.innerHTML = '';
    const has = !!(st.src || st.image);
    if (!has) return;
    const pageSel = st.src?.pages > 1 ? el('select', { onchange: async (e) => { st.page = Number(e.target.value); st.crop = null; await loadText(); render(); } },
      Array.from({ length: st.src.pages }, (_, i) => el('option', { value: i + 1, selected: st.page === i + 1 }, `Page ${i + 1}`))) : null;
    tools.append(...[
      pageSel,
      el('button', { class: 'small', onclick: () => { st.zoom = Math.max(0.4, st.zoom / 1.3); render(); } }, '−'),
      el('button', { class: 'small', onclick: () => { st.zoom = Math.min(8, st.zoom * 1.3); render(); } }, '+'),
      el('button', { class: 'small', onclick: () => { st.zoom = 1; render(); } }, 'Fit'),
      st.src ? el('button', { class: `small ${st.cropMode ? 'primary' : ''}`, onclick: () => { st.cropMode = !st.cropMode; render(); refreshTools(); } }, '✂ Frame the view') : null,
      st.src && st.crop ? el('button', { class: 'small', onclick: () => { st.crop = null; render(); refreshTools(); } }, 'Whole sheet') : null,
      hint,
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------- apply
  async function apply() {
    try {
      const d = { ref: st.ref, weight: st.weight, lenKind: st.lenKind, rows: st.rows };
      if (st.src) {
        const size = st.src.pageSize(st.page);
        const r = st.crop || { x: 0, y: 0, w: size.w, h: size.h };
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
  const legs = res?.rig?.legs || [];
  const c = ld.cog_mm || {};
  const tb = el('tbody');
  (ld.liftPoints || []).filter((q) => q.used !== false).forEach((q) => {
    const l = legs.find((x) => x.pointId === q.id && x.level !== 'top');
    const imp = Number(p.rigging.legs?.[q.id]?.Leff_m) > 0;
    tb.append(el('tr', {},
      el('td', {}, el('b', {}, q.id)),
      el('td', { class: 'num' }, fmt((+q.x || 0) - (+c.x || 0), 0)), el('td', { class: 'num' }, fmt((+q.y || 0) - (+c.y || 0), 0)), el('td', { class: 'num' }, fmt((+q.z || 0) - (+c.z || 0), 0)),
      el('td', { class: 'num' }, l ? `${fmt(l.Leff, 3)} m${imp ? '' : ' (auto)'}` : '—'),
      el('td', { class: 'num' }, l ? `${l.angleV.toFixed(1)}°` : '—'),
      el('td', { class: 'num' }, l ? `${fmt(l.Tstatic)} t` : '—')));
  });
  const tilt = res?.rig?.tilt;
  return el('div', { class: 'pi-sum' },
    be.image ? el('img', { src: be.image, alt: '', class: 'pi-thumb', title: 'Printed in the report', onclick: () => openPlanImport() }) : el('div', { class: 'pi-thumb muted' }, 'No drawing'),
    el('div', {},
      el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, [be.ref || 'No reference', be.file ? ` · ${be.file}` : '', ` · weight ${fmt(ld.weight_t)} t`, ` · leg lengths: ${be.lenKind === 'sling' ? 'sling EWL' : 'lift point → hook'}`].join('')),
      el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, ['Point', 'X from COG (mm)', 'Y (mm)', 'Z (mm)', 'Leg length', 'Angle to vert.', 'Static tension'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))), tb),
      tilt ? el('p', { class: 'muted', style: { fontSize: '12px', margin: '6px 0 0' } }, `Hook ${fmt(res.rig.riggingHeight)} m above the highest lift point · estimated tilt ${tilt.tilt_deg.toFixed(2)}°${tilt.slack?.length ? ` · slack: ${tilt.slack.map((i) => legs[i]?.label).join(', ')}` : ''}`) : null));
}
