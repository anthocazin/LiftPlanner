// Guided set-up of the load from its drawing, in 4 steps:
//   1 drawing (PDF / image)  2 scale  3 top / front / side views  4 lift points & COG clicked on each view
// The 3D coordinates are combined from the views: X from top + front, Y from top + side, Z from front + side.
import { app } from './app.js';
import { el, fmt, toast } from './dom.js';
import { openSource, scanText } from './pdfutil.js';
import { loadView, lvState, AXES } from './loadview.js';
import { viewer3d } from './viewer3d.js';
import { shapesCog, shapeVolume } from '../engine/shape.js';

const NS = 'http://www.w3.org/2000/svg';
const PT_MM = 25.4 / 72;
export const VIEW_DEF = {
  xy: { name: 'Top view', short: 'Top', axes: 'X → right, Y → up', h: 'X', v: 'Y', look: 'seen from above' },
  xz: { name: 'Front view', short: 'Front', axes: 'X → right, Z → up', h: 'X', v: 'Z', look: 'seen from the front (−Y)' },
  yz: { name: 'Side view', short: 'Side', axes: 'Y → right, Z → up', h: 'Y', v: 'Z', look: 'seen from the right (+X)' },
};
const STEPS = ['Drawing', 'Scale', 'Views', 'Shape (optional)', 'Lift points & COG'];

export const setup = { step: 1, edit: null, tool: 'frame', page: 1, zoom: 1, tmp: [], drag: null, draft: null, item: 'COG', selShape: null, voidNext: false };
let viewer = null;
let pickViews = [];
let root = null;

const L = () => app.project.load;
const scale = () => L().drawingScale || (L().drawingScale = { ratio: null, mmPerUnit: null, kind: null });

export function loadSetup() {
  root = el('section', { class: 'panel setup' });
  build();
  return root;
}

export function refreshSetup() {
  viewer?.refresh();
  pickViews.forEach((v) => v.refresh());
  const st = document.getElementById('pick-status');
  if (st) st.replaceWith(pickStatus());
  const list = document.getElementById('pick-list');
  if (list) list.replaceWith(pickList());
}

function rebuild() {
  build();
  if (setup.step === 4) setTimeout(renderShapeTable, 0);
}

function stepDone(i) {
  const ld = L();
  if (i === 1) return !!app.drawSource || Object.values(ld.views || {}).some(Boolean);
  if (i === 2) return scale().mmPerUnit > 0 || Object.values(ld.views || {}).some(Boolean);
  if (i === 3) return Object.values(ld.views || {}).some(Boolean);
  if (i === 4) return (ld.shapes || []).length > 0;
  if (i === 5) return (ld.liftPoints || []).length > 0;
  return false;
}

function build() {
  root.innerHTML = '';
  pickViews = [];
  const head = el('div', { class: 'panel-head' },
    el('h2', {}, 'Load set-up from the drawing'),
    el('div', { class: 'stepper' }, STEPS.map((t, i) =>
      el('button', { class: `step ${setup.step === i + 1 ? 'on' : ''} ${stepDone(i + 1) ? 'done' : ''}`, onclick: () => { setup.step = i + 1; setup.edit = null; rebuild(); } },
        el('b', {}, stepDone(i + 1) && setup.step !== i + 1 ? '✓' : String(i + 1)), t))),
  );
  const body = el('div', { class: 'setup-body' });
  if (setup.step === 1) body.append(stepDrawing());
  if (setup.step === 2) body.append(stepScale());
  if (setup.step === 3) body.append(stepViews());
  if (setup.step === 4) body.append(stepShape());
  if (setup.step === 5) body.append(stepPoints());
  if (setup.step !== 4) lvState.tool = null;
  viewer = viewer3d({ height: setup.step >= 4 ? 360 : 420, title: '' });
  root.append(head, el('div', { class: 'setup-grid' }, body, el('div', { class: 'setup-3d' }, el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, '3D preview — the drawing views are shown on their planes'), viewer)));
}

const nextBtn = (txt = 'Next →') => el('button', { class: 'primary', onclick: () => { setup.step = Math.min(5, setup.step + 1); setup.edit = null; rebuild(); } }, txt);

// ---------------- step 1: drawing
function stepDrawing() {
  const box = el('div');
  const inp = el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f); } });
  const src = app.drawSource;
  const dz = el('div', { class: 'dropzone big' },
    el('div', { style: { fontSize: '15px', fontWeight: 600 } }, src ? `${src.name} — ${src.pages} page(s)` : 'Drop the drawing of the part here'),
    el('div', { class: 'muted', style: { margin: '6px 0 10px' } }, 'PDF (vector or scanned) or image (PNG / JPG). It stays on your computer.'),
    el('label', { class: 'btn primary' }, src ? 'Open another drawing…' : 'Choose a file…', inp),
  );
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) openFile(f); });
  box.append(dz);
  if (!src && Object.values(L().views || {}).some(Boolean))
    box.append(el('div', { class: 'note', style: { marginTop: '8px' } }, `Views already imported${L().views.xy?.file ? ` from "${L().views.xy.file}"` : ''}. Open the drawing again only to change them.`));
  const sc = app.drawScan;
  if (sc) {
    const ld = L();
    const rows = [];
    const w = sc.weights?.[0];
    if (w) rows.push(el('div', { class: 'hit' }, el('span', {}, 'Weight: ', el('b', {}, `${fmt(w.value, 3)} t`), el('span', { class: 'muted' }, ` — ${w.text}`)), el('button', { class: 'small', onclick: () => { ld.weight_t = Math.round(w.value * 1000) / 1000; ld.weightBasis = 'drawing'; app.recompute(); toast('Weight applied'); } }, 'Use')));
    const c = sc.cogs?.[0];
    if (c) rows.push(el('div', { class: 'hit' }, el('span', {}, 'COG: ', el('b', {}, ['x', 'y', 'z'].filter((k) => c.value[k] != null).map((k) => `${k.toUpperCase()} ${c.value[k]}`).join(' · ')), el('span', { class: 'muted' }, ` — ${c.text}`)), el('button', { class: 'small', onclick: () => { Object.assign(ld.cog_mm, c.value); ld.cogBasis = 'drawing'; app.recompute(); toast('COG applied'); } }, 'Use')));
    const s = sc.scales?.[0];
    if (s) rows.push(el('div', { class: 'hit' }, el('span', {}, 'Scale: ', el('b', {}, `1:${s.value}`), el('span', { class: 'muted' }, ` — ${s.text}`)), el('button', { class: 'small', onclick: () => { setRatio(s.value); toast(`Scale 1:${s.value}`); rebuild(); } }, 'Use')));
    box.append(el('h3', {}, 'Read from the drawing'), rows.length ? el('div', {}, rows) : el('div', { class: 'muted' }, src?.kind === 'pdf' ? 'Nothing found in the text of the PDF (scanned drawing?): enter the values by hand.' : 'Images have no text: enter the values by hand.'));
  }
  box.append(el('div', { class: 'row', style: { marginTop: '12px' } }, nextBtn(), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'No drawing? Go on anyway: the views will be a white grid and you can click or type the points.')));
  return box;
}

async function openFile(f) {
  try {
    app.drawSource = await openSource(f);
    app.drawScan = null;
    setup.page = 1;
    scale().kind = app.drawSource.kind;
    if (app.drawSource.kind === 'image') scale().ratio = null;
    else if (scale().ratio) scale().mmPerUnit = PT_MM * scale().ratio;
    rebuild();
    app.drawScan = await scanText(app.drawSource).catch(() => null);
    const s = app.drawScan?.scales?.[0];
    if (s && !scale().mmPerUnit && app.drawSource.kind === 'pdf') setRatio(s.value);
    rebuild();
  } catch (e) {
    alert(`Cannot open the file: ${e.message}`);
  }
}

function setRatio(r) {
  const s = scale();
  s.ratio = r;
  s.mmPerUnit = PT_MM * r;
  s.kind = 'pdf';
  applyScaleToViews();
}

function applyScaleToViews() {
  const s = scale();
  for (const v of Object.values(L().views || {})) if (v && v.pxPerUnit && s.mmPerUnit) v.s = s.mmPerUnit / v.pxPerUnit;
  app.recompute();
}

// ---------------- step 2: scale
function stepScale() {
  const s = scale();
  const src = app.drawSource;
  const box = el('div');
  const isPdf = (src?.kind || s.kind) === 'pdf';
  const ratioIn = el('input', { type: 'number', min: 1, step: 'any', value: s.ratio ?? '', style: { width: '90px', fontSize: '16px' }, onchange: (e) => { const r = Number(e.target.value); if (r > 0) { setRatio(r); rebuild(); } } });
  if (isPdf)
    box.append(
      el('div', { class: 'scale-line' }, el('span', {}, 'Drawing scale'), el('b', {}, '1 :'), ratioIn, el('span', { class: 'muted' }, s.mmPerUnit ? `→ 1 mm on the paper = ${fmt(s.ratio, 0)} mm on the part` : 'as printed in the title block (sheet printed at 100 %)')),
      (app.drawScan?.scales || []).length ? el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Found in the drawing: ', ...app.drawScan.scales.map((x) => el('button', { class: 'small', onclick: () => { setRatio(x.value); rebuild(); } }, `1:${x.value}`))) : null,
    );
  box.append(
    el('h3', {}, isPdf ? 'Or calibrate on a known dimension' : 'Calibrate on a known dimension'),
    el('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Click both ends of a dimension you know (e.g. the overall length), then type its real length. Use it for images, scanned drawings or when the scale is not known.'),
  );
  if (src) {
    setup.tool = 'cal';
    box.append(pageViewer());
  } else box.append(el('div', { class: 'note warn' }, 'Open the drawing (step 1) to calibrate on it.'));
  box.append(el('div', { class: 'row', style: { marginTop: '10px' } }, el('span', {}, s.mmPerUnit ? `Scale: 1 drawing unit = ${fmt(s.mmPerUnit, 3)} mm` : 'Scale not set yet'), nextBtn()));
  return box;
}

// ---------------- step 3: views
function stepViews() {
  const box = el('div');
  const ld = L();
  ld.views = ld.views || {};
  box.append(el('div', { class: 'view-cards' }, ...Object.entries(VIEW_DEF).map(([k, d]) => {
    const v = ld.views[k];
    return el('div', { class: `view-card ${setup.edit === k ? 'on' : ''} ${v ? 'ok' : ''}` },
      el('div', { class: 'vc-head' }, el('b', {}, d.name), el('span', { class: 'muted' }, d.axes)),
      v?.image ? el('img', { src: v.image, alt: '' }) : el('div', { class: 'vc-empty' }, cubeIcon(k)),
      el('div', { class: 'row' },
        el('button', { class: `small ${v ? '' : 'primary'}`, disabled: !app.drawSource, onclick: () => { setup.edit = k; setup.tool = 'frame'; setup.draft = v?.wizard ? { ...v.wizard } : { page: setup.page, crop: null, origin: null, flipH: false }; setup.page = setup.draft.page || setup.page; rebuild(); } }, v ? 'Redo on the drawing' : 'Select on the drawing'),
        v ? el('button', { class: 'small danger', onclick: () => { ld.views[k] = null; app.recompute(); rebuild(); } }, 'Remove') : null),
    );
  })));
  if (!app.drawSource) box.append(el('div', { class: 'note', style: { marginTop: '8px' } }, 'Open the drawing (step 1) to select the views. Without views you can still place the points on a white grid (step 4).'));
  if (setup.edit && app.drawSource) {
    const d = VIEW_DEF[setup.edit];
    const dr = setup.draft;
    const toolBtn = (t, txt) => el('button', { class: `small ${setup.tool === t ? 'active' : ''}`, onclick: () => { setup.tool = t; rebuild(); } }, txt);
    box.append(
      el('div', { class: 'note info', style: { margin: '10px 0 6px' } },
        el('b', {}, `${d.name} (${d.look}): `),
        dr.crop ? (dr.origin ? 'frame and reference point set — save the view.' : el('span', {}, el('b', {}, '2. '), 'click the REFERENCE POINT of the part in this view (the origin X = 0, Y = 0, Z = 0 — use the same corner of the part in every view, e.g. bottom-left-front).')) : el('span', {}, el('b', {}, '1. '), `drag a frame around the ${d.name.toLowerCase()} on the drawing.`)),
      el('div', { class: 'toolbar' }, toolBtn('frame', '1. Frame'), toolBtn('origin', '2. Reference point'),
        el('label', { class: 'check', style: { fontSize: '12px' } }, el('input', { type: 'checkbox', checked: !!dr.flipH, onchange: (e) => { dr.flipH = e.target.checked; drawOverlay(); } }), `${d.h} increases to the LEFT on this view`),
        el('span', { class: 'spacer' }),
        el('button', { class: 'small', onclick: () => { setup.edit = null; rebuild(); } }, 'Cancel'),
        el('button', { class: 'primary small', disabled: !(dr.crop && dr.origin), onclick: saveView }, 'Save view')),
      pageViewer(),
    );
  }
  box.append(el('div', { class: 'row', style: { marginTop: '10px' } }, nextBtn('Next: shape (optional) →')));
  return box;
}

function cubeIcon(k) {
  // small cube with the origin corner and the viewing direction
  const face = { xy: 'M30 22 L62 14 L86 22 L54 30 Z', xz: 'M30 22 L54 30 L54 62 L30 54 Z', yz: 'M54 30 L86 22 L86 54 L54 62 Z' }[k];
  return el('span', { html: `<svg viewBox="0 0 110 76" width="110" height="76"><path d="M30 22 L62 14 L86 22 L86 54 L54 62 L30 54 Z M54 30 L54 62 M30 22 L54 30 L86 22" fill="none" stroke="#8a96a3"/><path d="${face}" fill="#e8822a" fill-opacity=".35" stroke="#c96a17"/><circle cx="30" cy="54" r="3.5" fill="#c0392b"/><text x="6" y="70" font-size="9" fill="#c0392b">origin</text></svg>` });
}

async function saveView() {
  const k = setup.edit, dr = setup.draft, src = app.drawSource;
  if (!k || !dr?.crop || !dr?.origin) return;
  const { canvas, pxPerUnit } = await src.renderRegion(dr.page, dr.crop, 1800);
  const s = scale();
  const mmPerUnit = s.mmPerUnit || null;
  L().views[k] = {
    image: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height, pxPerUnit,
    s: mmPerUnit ? mmPerUnit / pxPerUnit : 1 / pxPerUnit, ou: (dr.origin.u - dr.crop.x) * pxPerUnit, ov: (dr.origin.v - dr.crop.y) * pxPerUnit,
    flipH: !!dr.flipH, file: src.name, page: dr.page, wizard: { ...dr },
  };
  if (!mmPerUnit) toast('View saved — set the scale (step 2) so that it has the right size');
  else toast(`${VIEW_DEF[k].name} saved`);
  const nextK = Object.keys(VIEW_DEF).find((x) => !L().views[x]);
  setup.edit = null;
  if (nextK) setup.draft = null;
  app.recompute();
  rebuild();
}

// ---------------- page viewer (steps 2 and 3)
let pv = null; // { k, size }
const pageCache = new Map();
function pageViewer() {
  const src = app.drawSource;
  const pageSel = el('select', { onchange: (e) => { setup.page = Number(e.target.value); if (setup.draft) setup.draft.page = setup.page; renderPage(); } });
  for (let i = 1; i <= src.pages; i++) pageSel.append(el('option', { value: i, selected: i === setup.page }, `Page ${i}`));
  const wrap = el('div', { class: 'pv' },
    el('div', { class: 'toolbar' }, src.pages > 1 ? pageSel : null,
      el('button', { class: 'small', onclick: () => { setup.zoom = Math.max(0.4, setup.zoom / 1.3); renderPage(); } }, '−'),
      el('button', { class: 'small', onclick: () => { setup.zoom = Math.min(8, setup.zoom * 1.3); renderPage(); } }, '+'),
      el('button', { class: 'small', onclick: () => { setup.zoom = 1; renderPage(); } }, 'Fit'),
      el('span', { class: 'muted', id: 'pv-status', style: { fontSize: '12px' } }, '')),
    el('div', { class: 'pv-canvas', id: 'pv-canvas' }),
  );
  setTimeout(renderPage, 0);
  return wrap;
}

async function renderPage() {
  const box = document.getElementById('pv-canvas');
  const src = app.drawSource;
  if (!box || !src) return;
  const size = src.pageSize(setup.page);
  const k = ((box.clientWidth || 700) - 20) / size.w * setup.zoom;
  pv = { k, size };
  const key = `${src.name}#${setup.page}@${k.toFixed(4)}`;
  let c = pageCache.get(key);
  if (!c) {
    c = await src.render(setup.page, k * (window.devicePixelRatio || 1));
    if (pageCache.size > 6) pageCache.clear();
    pageCache.set(key, c);
  }
  c.style.width = `${size.w * k}px`;
  c.style.height = `${size.h * k}px`;
  const ov = document.createElementNS(NS, 'svg');
  ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  ov.setAttribute('class', 'pv-overlay');
  ov.style.width = c.style.width;
  ov.style.height = c.style.height;
  const holder = el('div', { class: 'pv-page' }, c, ov);
  box.innerHTML = '';
  box.append(holder);
  ov.addEventListener('pointerdown', onDown);
  ov.addEventListener('pointermove', onMove);
  ov.addEventListener('pointerup', onUp);
  drawOverlay();
}

function evPt(ev) {
  const ov = document.querySelector('.pv-overlay');
  const r = ov.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * pv.size.w, ((ev.clientY - r.top) / r.height) * pv.size.h];
}

function onDown(ev) {
  const [u, v] = evPt(ev);
  if (setup.tool === 'frame' && setup.draft) {
    setup.drag = { u0: u, v0: v, u1: u, v1: v };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    return;
  }
  if (setup.tool === 'origin' && setup.draft) {
    setup.draft.origin = { u, v };
    setup.draft.page = setup.page;
    rebuild();
    return;
  }
  if (setup.tool === 'cal') {
    setup.tmp.push([u, v]);
    if (setup.tmp.length === 2) {
      const [[u1, v1], [u2, v2]] = setup.tmp;
      setup.tmp = [];
      const real = Number(String(prompt('Real length of this dimension (mm):', '') || '').replace(',', '.'));
      if (real > 0) {
        const s = scale();
        s.mmPerUnit = real / Math.hypot(u2 - u1, v2 - v1);
        s.ratio = app.drawSource.kind === 'pdf' ? Math.round((s.mmPerUnit / PT_MM) * 10) / 10 : null;
        applyScaleToViews();
        toast(`Scale set${s.ratio ? ` (≈ 1:${s.ratio})` : ''}`);
        rebuild();
        return;
      }
    }
    drawOverlay();
  }
}

function onMove(ev) {
  const [u, v] = evPt(ev);
  const st = document.getElementById('pv-status');
  const dr = setup.draft;
  const s = scale();
  if (st && dr?.origin && s.mmPerUnit && setup.edit) {
    const d = VIEW_DEF[setup.edit];
    st.textContent = `${d.h} ${Math.round((u - dr.origin.u) * s.mmPerUnit * (dr.flipH ? -1 : 1))} · ${d.v} ${Math.round((dr.origin.v - v) * s.mmPerUnit)} mm`;
  }
  if (!setup.drag) return;
  setup.drag.u1 = u;
  setup.drag.v1 = v;
  drawOverlay();
}

function onUp() {
  if (!setup.drag) return;
  const d = setup.drag;
  setup.drag = null;
  const r = { x: Math.min(d.u0, d.u1), y: Math.min(d.v0, d.v1), w: Math.abs(d.u1 - d.u0), h: Math.abs(d.v1 - d.v0) };
  if (r.w > 4 && r.h > 4) {
    setup.draft.crop = r;
    setup.draft.page = setup.page;
    setup.tool = 'origin';
  }
  rebuild();
}

function drawOverlay() {
  const ov = document.querySelector('.pv-overlay');
  if (!ov || !pv) return;
  const u = 1 / pv.k;
  let s = '';
  for (const [k, v] of Object.entries(L().views || {})) {
    const w = v?.wizard;
    if (!w?.crop || w.page !== setup.page || k === setup.edit) continue;
    s += `<rect x="${w.crop.x}" y="${w.crop.y}" width="${w.crop.w}" height="${w.crop.h}" fill="rgba(59,110,165,.06)" stroke="#3b6ea5" stroke-width="${1.5 * u}" stroke-dasharray="${6 * u} ${4 * u}"/><text x="${w.crop.x + 4 * u}" y="${w.crop.y + 14 * u}" font-size="${12 * u}" fill="#3b6ea5" font-weight="700">${VIEW_DEF[k].short}</text>`;
  }
  const dr = setup.draft;
  if (dr?.crop && (dr.page || setup.page) === setup.page)
    s += `<rect x="${dr.crop.x}" y="${dr.crop.y}" width="${dr.crop.w}" height="${dr.crop.h}" fill="rgba(232,130,42,.08)" stroke="#e8822a" stroke-width="${2 * u}"/>`;
  if (dr?.origin) {
    const d = dr.flipH ? -1 : 1, Lx = 50 * u;
    s += `<g stroke-width="${2 * u}"><line x1="${dr.origin.u}" y1="${dr.origin.v}" x2="${dr.origin.u + d * Lx}" y2="${dr.origin.v}" stroke="#c0392b"/><line x1="${dr.origin.u}" y1="${dr.origin.v}" x2="${dr.origin.u}" y2="${dr.origin.v - Lx}" stroke="#2a5db0"/></g><circle cx="${dr.origin.u}" cy="${dr.origin.v}" r="${5 * u}" fill="#c0392b" stroke="#fff" stroke-width="${u}"/>`;
  }
  setup.tmp.forEach(([a, b]) => (s += `<circle cx="${a}" cy="${b}" r="${4 * u}" fill="#e8822a" stroke="#fff" stroke-width="${u}"/>`));
  if (setup.tmp.length === 1 && setup.tool === 'cal') s += '';
  if (setup.drag) {
    const g = setup.drag;
    s += `<rect x="${Math.min(g.u0, g.u1)}" y="${Math.min(g.v0, g.v1)}" width="${Math.abs(g.u1 - g.u0)}" height="${Math.abs(g.v1 - g.v0)}" fill="rgba(232,130,42,.1)" stroke="#e8822a" stroke-width="${2 * u}"/>`;
  }
  ov.innerHTML = s;
}

// ---------------- step 4: lift points & COG
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function itemTarget(id) {
  const ld = L();
  if (id === 'COG') return { t: ld.cog_mm, picks: (ld.cogPicks = ld.cogPicks || {}) };
  const p = ld.liftPoints.find((q) => q.id === id);
  if (!p) return null;
  return { t: p, picks: (p.picks = p.picks || {}) };
}

/** Combines the picks of the views into X, Y, Z (mean where two views give the same coordinate). */
export function combinePicks(t, picks) {
  const X = [picks.xy?.[0], picks.xz?.[0]].filter((v) => v != null);
  const Y = [picks.xy?.[1], picks.yz?.[0]].filter((v) => v != null);
  const Z = [picks.xz?.[1], picks.yz?.[1]].filter((v) => v != null);
  if (X.length) t.x = Math.round(mean(X));
  if (Y.length) t.y = Math.round(mean(Y));
  if (Z.length) t.z = Math.round(mean(Z));
  const dx = X.length === 2 ? Math.abs(X[0] - X[1]) : 0, dy = Y.length === 2 ? Math.abs(Y[0] - Y[1]) : 0, dz = Z.length === 2 ? Math.abs(Z[0] - Z[1]) : 0;
  return { dx, dy, dz };
}

function shownViews() {
  const v = L().views || {};
  const have = Object.keys(VIEW_DEF).filter((k) => v[k]);
  return have.length >= 2 ? have : have.length === 1 ? [...new Set([...have, 'xy', 'xz'])] : ['xy', 'xz', 'yz'];
}

function nextNeeded(id) {
  const it = itemTarget(id);
  if (!it) return null;
  return shownViews().find((k) => !it.picks[k]) || null;
}

function onPick(key, a, b) {
  const id = setup.item;
  const it = itemTarget(id);
  if (!it) return;
  it.picks[key] = [a, b];
  const mm = combinePicks(it.t, it.picks);
  if (id === 'COG') L().cogBasis = 'drawing';

  // advance: next view for this item, else next item
  if (!nextNeeded(id)) {
    const ids = ['COG', ...L().liftPoints.map((p) => p.id)];
    const nxt = ids.slice(ids.indexOf(id) + 1).find((x) => nextNeeded(x));
    if (nxt) setup.item = nxt;
  }
  lvState.selected = setup.item;
  app.recompute();
}

function pickStatus() {
  const id = setup.item;
  const need = nextNeeded(id);
  const name = id === 'COG' ? 'the COG' : `point ${id}`;
  return el('div', { id: 'pick-status', class: 'note info pick-status' },
    need ? el('span', {}, 'Click ', el('b', {}, name), ' on the ', el('b', {}, VIEW_DEF[need].name.toUpperCase()), '.') : el('span', {}, el('b', {}, `${id === 'COG' ? 'COG' : `Point ${id}`} placed in every view.`), ' Choose another item, or drag the markers to adjust.'));
}

const tol = () => { const d = L().dims_mm || {}; return Math.max(40, 0.015 * Math.max(+d.L || 0, +d.W || 0, +d.H || 0)); };

function pickList() {
  const ld = L();
  const items = ['COG', ...ld.liftPoints.map((p) => p.id)];
  const row = (id) => {
    const it = itemTarget(id);
    const mm = it ? combinePicks({ ...it.t }, it.picks) : { dx: 0, dy: 0, dz: 0 };
    const worst = Math.max(mm.dx, mm.dy, mm.dz);
    const t = it?.t || {};
    return el('button', { class: `pick-item ${setup.item === id ? 'on' : ''}`, onclick: () => { setup.item = id; lvState.selected = id; lvState.mode = 'pick'; refreshSetup(); } },
      el('b', {}, id),
      el('span', { class: 'views' }, shownViews().map((k) => el('i', { class: it?.picks?.[k] ? 'ok' : '' }, VIEW_DEF[k].short))),
      el('span', { class: 'xyz' }, `${fmt(t.x, 0)} · ${fmt(t.y, 0)} · ${fmt(t.z, 0)}`),
      worst > tol() ? el('span', { class: 'warn', title: 'The two views give a different value for the same coordinate (the mean is used). Normal if you clicked two different features; otherwise check the reference point or the mirror option of the view.' }, `Δ ${Math.round(worst)} mm`) : null);
  };
  return el('div', { id: 'pick-list', class: 'pick-list' },
    items.map(row),
    el('button', { class: 'small', onclick: addPoint }, '+ Lift point'),
  );
}

function addPoint() {
  const ld = L();
  const used = new Set(ld.liftPoints.map((p) => p.id));
  const id = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !used.has(c)) || `P${ld.liftPoints.length + 1}`;
  const tpl = ld.liftPoints[ld.liftPoints.length - 1] || {};
  const { id: _a, x: _b, y: _c, z: _d, picks: _e, ...props } = tpl;
  ld.liftPoints.push({ padeye: true, ...props, id, x: 0, y: 0, z: (Number(ld.origin_mm?.z) || 0) + (Number(ld.dims_mm?.H) || 0), used: true, picks: {} });
  setup.item = id;
  lvState.selected = id;
  lvState.mode = 'pick';
  app.recompute();
  window.__rerender();
}

// ---------------- step 4: shape (optional) → COG with a uniform weight
const third = { xy: 'z', xz: 'y', yz: 'x' };
function envRange(k) {
  const ld = L(), o = ld.origin_mm || {}, d = ld.dims_mm || {};
  const len = { x: +d.L || 0, y: +d.W || 0, z: +d.H || 0 }[k];
  const o0 = +o[k] || 0;
  return len > 0 ? [o0, o0 + len] : [0, 1000];
}
function createShape(tool, key, a, b) {
  const ld = L();
  ld.shapes = ld.shapes || [];
  const [A, B] = AXES[key];
  const k = third[key];
  const [k0, k1] = envRange(k);
  const id = `S${ld.shapes.length + 1}`;
  let sh;
  if (tool === 'box') sh = { id, type: 'box', name: `Box ${ld.shapes.length + 1}`, [`${A}0`]: a, [`${A}1`]: a, [`${B}0`]: b, [`${B}1`]: b, [`${k}0`]: k0, [`${k}1`]: k1 };
  else sh = { id, type: 'cyl', name: `Cylinder ${ld.shapes.length + 1}`, axis: k, [`c${A}`]: a, [`c${B}`]: b, [`c${k}`]: k0, r: 1, L: k1 - k0 };
  if (setup.voidNext) { sh.void = true; sh.name = `Void ${ld.shapes.length + 1}`; }
  ld.shapes.push(sh);
  setup.selShape = id;
  return sh;
}

function stepShape() {
  lvState.mode = 'select';
  const ld = L();
  const vs = shownViews();
  const shapes = { editable: true, selected: () => setup.selShape, onSelect: (id) => { setup.selShape = id; renderShapeTable(); }, onCreate: createShape, onChange: (end) => { if (end) renderShapeTable(); else updateShapeNumbers(); } };
  pickViews = vs.map((k) => loadView(k, { editable: false, height: 330, title: VIEW_DEF[k].name, shapes }));
  const toolBtn = (t, txt, title) => el('button', { class: `small ${lvState.tool === t ? 'active' : ''}`, title, onclick: () => { lvState.tool = lvState.tool === t ? null : t; rebuild(); } }, txt);
  const g = shapesCog(ld.shapes || []);
  return el('div', {},
    el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '0 0 6px' } },
      'Optional — draw the part with simple shapes; with the weight spread evenly, LiftPlanner finds the COG. ',
      el('b', {}, 'Box'), ': drag a rectangle in a view. ', el('b', {}, 'Cylinder'), ': drag from its centre (its axis is perpendicular to the view). ',
      'The third dimension takes the overall size: adjust it in another view by dragging the shape or its orange corner, or type it in the table.'),
    el('div', { class: 'toolbar' },
      toolBtn('box', '+ Box', 'Drag a rectangle on a view'), toolBtn('cyl', '+ Cylinder', 'Drag from the centre on a view'),
      el('label', { class: 'check', style: { fontSize: '12px' } }, el('input', { type: 'checkbox', checked: setup.voidNext, onchange: (e) => { setup.voidNext = e.target.checked; } }), 'next shape is a hole / void'),
      el('span', { class: 'spacer' }),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: ld.cogBasis === 'shape', disabled: !g, onchange: (e) => { ld.cogBasis = e.target.checked ? 'shape' : 'estimated'; app.recompute(); rebuild(); } }), el('b', {}, 'Use the COG of the shape')),
    ),
    el('div', { class: `grid ${vs.length === 3 ? 'g3' : 'g2'}`, style: { gap: '8px' } }, ...pickViews),
    el('div', { id: 'shape-table', style: { marginTop: '8px' } }),
    el('div', { class: 'row', style: { marginTop: '8px' } }, nextBtn('Next: lift points & COG →')),
  );
}

function shapeRow(sh, i) {
  const num = (k, w = '74px') => el('input', { type: 'number', step: 'any', 'data-k': k, value: Math.round(Number(sh[k]) || 0), style: { width: w }, onchange: (e) => { sh[k] = Number(e.target.value) || 0; app.recompute(); renderShapeTable(); } });
  const dims = sh.type === 'box'
    ? ['x', 'y', 'z'].map((k) => el('span', { class: 'sh-dim' }, `${k.toUpperCase()} `, num(`${k}0`), ' → ', num(`${k}1`)))
    : [el('span', { class: 'sh-dim' }, 'axis ', el('select', { onchange: (e) => { sh.axis = e.target.value; app.recompute(); renderShapeTable(); } }, ['x', 'y', 'z'].map((a) => el('option', { value: a, selected: (sh.axis || 'z') === a }, a.toUpperCase())))),
      el('span', { class: 'sh-dim' }, 'base centre ', num('cx', '64px'), num('cy', '64px'), num('cz', '64px')),
      el('span', { class: 'sh-dim' }, 'Ø ', el('input', { type: 'number', step: 'any', value: Math.round(2 * (Number(sh.r) || 0)), style: { width: '64px' }, onchange: (e) => { sh.r = (Number(e.target.value) || 0) / 2; app.recompute(); renderShapeTable(); } }), ' length ', num('L', '70px'))];
  return el('div', { class: `sh-row ${setup.selShape === sh.id ? 'on' : ''}`, onclick: (e) => { if (e.target.tagName === 'DIV' || e.target.tagName === 'B') { setup.selShape = sh.id; pickViews.forEach((v) => v.refresh()); renderShapeTable(); } } },
    el('b', {}, sh.void ? '◌' : '■'),
    el('input', { type: 'text', value: sh.name || '', style: { width: '110px' }, onchange: (e) => { sh.name = e.target.value; pickViews.forEach((v) => v.refresh()); } }),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!sh.void, onchange: (e) => { sh.void = e.target.checked; app.recompute(); renderShapeTable(); } }), 'void'),
    ...dims,
    el('span', { class: 'muted' }, `${fmt(shapeVolume(sh) / 1e9, 3)} m³`),
    el('button', { class: 'small danger', onclick: () => { L().shapes.splice(i, 1); setup.selShape = null; app.recompute(); renderShapeTable(); } }, '✕'));
}

function renderShapeTable() {
  const box = document.getElementById('shape-table');
  if (!box) return;
  const ld = L();
  const list = ld.shapes || [];
  const g = shapesCog(list);
  box.innerHTML = '';
  if (!list.length) { box.append(el('div', { class: 'muted', style: { fontSize: '12px' } }, 'No shape yet. Example: a skid = one box for the frame + one cylinder for a tank.')); pickViews.forEach((v) => v.refresh()); return; }
  box.append(...list.map(shapeRow));
  if (g)
    box.append(el('div', { class: 'note info', style: { marginTop: '6px' } },
      el('b', {}, `Shape COG: X ${Math.round(g.x)} · Y ${Math.round(g.y)} · Z ${Math.round(g.z)} mm`), ` — volume ${fmt(g.volume_m3, 3)} m³, weight spread evenly. `,
      ld.cogBasis === 'shape' ? el('span', {}, '(used as the COG)') : el('button', { class: 'small', onclick: () => { ld.cogBasis = 'shape'; app.recompute(); rebuild(); } }, 'Use it'),
      ' ', el('button', { class: 'small', title: 'Overall envelope = bounding box of the solids', onclick: () => { const b = g.box; ld.origin_mm = { x: Math.round(b.x0), y: Math.round(b.y0), z: Math.round(b.z0) }; ld.dims_mm = { L: Math.round(b.x1 - b.x0), W: Math.round(b.y1 - b.y0), H: Math.round(b.z1 - b.z0) }; app.recompute(); toast('Envelope set from the shapes'); } }, 'Set the envelope from the shapes')));
  pickViews.forEach((v) => v.refresh());
}
function updateShapeNumbers() {
  const sh = (L().shapes || []).find((q) => q.id === setup.selShape);
  const row = document.querySelector('.sh-row.on');
  if (!sh || !row) return;
  row.querySelectorAll('input[data-k]').forEach((i) => (i.value = Math.round(Number(sh[i.dataset.k]) || 0)));
}

function stepPoints() {
  lvState.mode = 'pick';
  if (!['COG', ...L().liftPoints.map((p) => p.id)].includes(setup.item)) setup.item = 'COG';
  lvState.selected = setup.item;
  const vs = shownViews();
  pickViews = vs.map((k) => loadView(k, { editable: true, height: 330, onPick, title: VIEW_DEF[k].name }));
  return el('div', {},
    el('div', { class: 'pick-head' }, pickList(), el('div', { class: 'pick-side' }, pickStatus(),
      el('div', { class: 'row', style: { fontSize: '12px' } },
        el('span', { class: 'muted' }, el('b', {}, 'Click'), ' = place the selected item · ', el('b', {}, 'drag'), ' = move the view · drag a marker = move it · ', el('b', {}, 'wheel'), ' = zoom · ⤢ = full screen'),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: lvState.showRig, onchange: (e) => { lvState.showRig = e.target.checked; refreshSetup(); } }), 'Show rigging')))),
    el('div', { class: `grid ${vs.length === 3 ? 'g3' : 'g2'}`, style: { gap: '8px', marginTop: '8px' } }, ...pickViews),
  );
}

// table of shapes rendered after the step is in the DOM

