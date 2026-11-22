// Guided set-up of the load from its drawing, in 3 steps:
//   1 drawing (PDF / image) and its scale  2 top / front / side views (a frame and an origin each,
//   overall dimensions read on the drawing)  3 lift points & COG clicked on the views
// The X, Y, Z coordinates are combined from the views: X from top + front, Y from top + side, Z from front + side.
import { app } from './app.js';
import { el, fmt, toast } from './dom.js';
import { openSource, scanText } from './pdfutil.js';
import { loadView, lvState, AXES } from './loadview.js';
import { openPlanImport, importedSummary, leaveImport } from './planimport.js';
import { panZoomBox } from './panzoom.js';

const NS = 'http://www.w3.org/2000/svg';
const PT_MM = 25.4 / 72;
export const VIEW_DEF = {
  xy: { name: 'Top view', short: 'Top', axes: 'X → right, Y → up', h: 'X', v: 'Y', look: 'seen from above' },
  xz: { name: 'Front view', short: 'Front', axes: 'X → right, Z → up', h: 'X', v: 'Z', look: 'seen from the front (−Y)' },
  yz: { name: 'Side view', short: 'Side', axes: 'Y → right, Z → up', h: 'Y', v: 'Z', look: 'seen from the right (+X)' },
};
const STEPS = ['Drawing & scale', 'Views', 'Lift points & COG'];

export const setup = { step: 1, edit: null, tool: 'frame', page: 1, zoom: 1, tmp: [], drag: null, draft: null, item: 'COG', four: false };
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
  const sum = document.getElementById('pi-summary');
  if (sum) { const n = importedSummary(app.result); n.id = 'pi-summary'; sum.replaceWith(n); return; }
  const need = setup.step === 3 ? nextNeeded(setup.item) : null;
  pickViews.forEach((v) => { v.classList.toggle('need', !!need && v.dataset.key === need); v.refresh(); });
  const st = document.getElementById('pick-status');
  if (st) st.replaceWith(pickStatus());
  const list = document.getElementById('pick-list');
  if (list) list.replaceWith(pickList());
}

function rebuild() {
  build();
}

function stepDone(i) {
  const ld = L();
  if (i === 1) return !!app.drawSource || Object.values(ld.views || {}).some(Boolean);
  if (i === 2) return Object.values(ld.views || {}).some(Boolean);
  if (i === 3) return (ld.liftPoints || []).length > 0;
  return false;
}

function build() {
  if (!(setup.step >= 1 && setup.step <= 3)) setup.step = 1;
  root.innerHTML = '';
  pickViews = [];
  const ld = L();
  const importBtn = (t) => el('button', { class: 'small primary', title: 'Lift plan made by the engineering office: drawing + lift points from the COG + leg lengths', onclick: () => openPlanImport() }, t);
  if (ld.setupMode === 'import' && ld.bePlan) {
    const sum = importedSummary(app.result);
    sum.id = 'pi-summary';
    root.append(
      el('div', { class: 'panel-head' },
        el('h2', {}, 'Load from the engineering office lift plan'),
        el('div', { class: 'row' },
          importBtn('Edit the import…'),
          el('button', { class: 'small', title: 'Set up the load from its drawing (views, points and COG clicked): real geometry instead of equal shares', onclick: () => { leaveImport(app.project); app.recompute(); window.__rerender?.(); } }, 'Set up from the drawing instead'))),
      sum);
    return;
  }
  const head = el('div', { class: 'panel-head' },
    el('h2', {}, 'Load set-up from the drawing'),
    importBtn('⇪ Import a lift plan (engineering office)…'),
    el('div', { class: 'stepper' }, STEPS.map((t, i) =>
      el('button', { class: `step ${setup.step === i + 1 ? 'on' : ''} ${stepDone(i + 1) ? 'done' : ''}`, onclick: () => { setup.step = i + 1; setup.edit = null; rebuild(); } },
        el('b', {}, stepDone(i + 1) && setup.step !== i + 1 ? '✓' : String(i + 1)), t))),
  );
  const body = el('div', { class: 'setup-body' });
  if (setup.step === 1) body.append(stepDrawing());
  if (setup.step === 2) body.append(stepViews());
  if (setup.step === 3) body.append(stepPoints());
  lvState.tool = null;
  root.append(head, body);
}

const nextBtn = (txt = 'Next →') => el('button', { class: 'primary', onclick: () => { setup.step = Math.min(3, setup.step + 1); setup.edit = null; rebuild(); } }, txt);

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
  if (src) box.append(el('h3', {}, 'Scale'), stepScale());
  box.append(el('div', { class: 'row', style: { marginTop: '12px' } }, nextBtn('Next: views →'), el('span', { class: 'muted', style: { fontSize: '12px' } }, src ? 'No scale? Frame each view edge to edge and pick its overall dimension: the scale is set from it.' : 'No drawing? Go on anyway: the views will be a white grid and you can click or type the points.')));
  return box;
}

/** Scale of the file open for this view (each file can have its own). */
function scaleLine(toolBtn) {
  const s = scale(), src = app.drawSource;
  const isPdf = src?.kind === 'pdf';
  return el('div', { class: `row ${s.mmPerUnit ? '' : 'note warn'}`, style: { fontSize: '12px', margin: '0 0 6px', gap: '8px' } },
    el('span', {}, s.mmPerUnit ? `Scale of this file: ${isPdf && s.ratio ? `1:${fmt(s.ratio, 0)}` : `1 unit = ${fmt(s.mmPerUnit, 3)} mm`}` : 'Scale of this file not set:'),
    isPdf ? el('span', {}, '1 : ', el('input', { type: 'number', min: 1, step: 'any', value: s.ratio ?? '', style: { width: '70px' }, onchange: (e) => { const r = Number(e.target.value); if (r > 0) { setRatio(r); rebuild(); } } })) : null,
    toolBtn('cal', 'Calibrate on a dimension'),
    setup.tool === 'cal' ? el('span', { class: 'muted' }, 'click both ends of a known dimension, then type its length') : null);
}

function startEdit(k) {
  const v = L().views?.[k];
  setup.edit = k;
  setup.tool = 'frame';
  const same = v?.wizard && v.file === app.drawSource?.name;
  setup.draft = same ? { ...v.wizard } : { page: setup.page, crop: null, origin: null, flipH: !!v?.flipH };
  setup.page = setup.draft.page || setup.page;
  setup.step = 2;
  rebuild();
}

async function openFile(f, editKey) {
  try {
    const prev = app.drawSource?.name;
    app.drawSource = await openSource(f);
    app.drawScan = null;
    setup.page = 1;
    if (editKey) { startEdit(editKey); setup.draft.page = 1; }
    scale().kind = app.drawSource.kind;
    if (app.drawSource.kind === 'image') { scale().ratio = null; if (app.drawSource.name !== prev) scale().mmPerUnit = null; }
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
  // only the views taken from this file (each file may have its own scale)
  const name = app.drawSource?.name;
  for (const v of Object.values(L().views || {})) if (v && v.pxPerUnit && s.mmPerUnit && (!name || !v.file || v.file === name)) { v.s = s.mmPerUnit / v.pxPerUnit; v.scaled = true; }
  // views framed edge to edge: the size of the part follows the new scale
  if (Object.values(L().views || {}).some((v) => v?.autoOrigin)) envelopeFromViews();
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
  const cal = el('details', { class: 'sub', open: !isPdf || !s.mmPerUnit },
    el('summary', {}, isPdf ? 'Or calibrate on a known dimension' : 'Calibrate on a known dimension'),
    el('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Click both ends of a dimension you know (e.g. the overall length), then type its real length.'));
  cal.addEventListener('toggle', () => { if (cal.open && !cal.querySelector('.pv-wrap,.pv-canvas')) { setup.tool = 'cal'; cal.append(pageViewer()); } });
  if (cal.open) { setup.tool = 'cal'; cal.append(pageViewer()); }
  box.append(cal, el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, s.mmPerUnit ? `Scale: 1 drawing unit = ${fmt(s.mmPerUnit, 3)} mm` : 'Scale not set yet'));
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
      v?.file ? el('div', { class: 'muted', style: { fontSize: '11px' } }, `${v.file}${v.page ? ` — page ${v.page}` : ''}${v.autoOrigin ? ' · origin: frame corner' : ' · origin clicked'}${v.dimH || v.dimV ? ` · overall ${v.dimH ? `${VIEW_DEF[k].h} ${v.dimH}` : ''}${v.dimH && v.dimV ? ' × ' : ''}${v.dimV ? `${VIEW_DEF[k].v} ${v.dimV}` : ''} mm` : ''}`) : null,
      el('div', { class: 'row' },
        el('button', { class: `small ${v ? '' : 'primary'}`, disabled: !app.drawSource, title: app.drawSource ? `On ${app.drawSource.name}` : 'Open a drawing first (or choose a file for this view)', onclick: () => startEdit(k) }, v ? 'Redo' : 'Select on the drawing'),
        el('label', { class: 'btn small', title: 'A PDF or an image for this view only' }, 'Choose a file…', el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f, k); } })),
        v ? el('button', { class: 'small danger', onclick: () => { ld.views[k] = null; app.recompute(); rebuild(); } }, 'Remove') : null),
    );
  })));
  if (!app.drawSource) box.append(el('div', { class: 'note', style: { marginTop: '8px' } }, 'Choose a file for each view (the same drawing or one image per view), or open the drawing in step 1. Without views you can still place the points on a white grid (step 3).'));
  const dm = ld.dims_mm || {};
  if (ld.views.xz || ld.views.yz)
    box.append(el('div', { class: 'row', style: { marginTop: '8px', fontSize: '12.5px' } },
      el('span', {}, 'Size of the part: ', el('b', {}, `${fmt(dm.L, 0)} (X) × ${fmt(dm.W, 0)} (Y) × ${fmt(dm.H, 0)} (Z) mm`)),
      el('span', { class: 'muted' }, 'From the overall dimensions picked on the drawing (or the frames).'),
      el('button', { class: 'small', title: 'Use the frames of the views as the outline of the part', onclick: () => { envelopeFromViews(true); applyDrawingDims(); app.recompute(); toast('Size of the part taken from the frames'); rebuild(); } }, 'Size from the frames'),
      el('button', { class: 'small', title: 'Exchange the front and the side view', onclick: () => { swapFrontSide(); toast('Front and side views exchanged'); rebuild(); } }, 'Swap front ↔ side')));
  if (setup.edit && app.drawSource) {
    const d = VIEW_DEF[setup.edit];
    const dr = setup.draft;
    const toolBtn = (t, txt) => el('button', { class: `small ${setup.tool === t ? 'active' : ''}`, onclick: () => { setup.tool = t; rebuild(); } }, txt);
    box.append(
      el('div', { class: 'note info', style: { margin: '10px 0 6px' } },
        el('b', {}, `${d.name} (${d.look}) — `),
        !dr.crop
          ? el('span', {}, el('b', {}, '1. Frame: '), 'drag a frame around this view on the drawing (the image kept for this plane).')
          : !dr.origin
            ? el('span', {}, el('b', {}, '2. Origin: '), `click the origin of this view (the same reference point of the part in every view, ${d.h} and ${d.v} = 0) — or save directly to take the bottom-left corner of the frame.`)
            : el('span', {}, 'Frame and origin set: ', el('b', {}, 'save the view'), '.')),
      scaleLine(toolBtn),
      dr.crop ? el('div', { id: 'dim-pick', class: 'dim-pick' }) : null,
      el('div', { class: 'toolbar' }, toolBtn('frame', '1. Frame'), toolBtn('origin', '2. Origin'),
        el('label', { class: 'check', style: { fontSize: '12px' }, title: 'For a view drawn from the other side (the part appears mirrored)' }, el('input', { type: 'checkbox', checked: !!dr.flipH, onchange: (e) => { dr.flipH = e.target.checked; drawOverlay(); } }), 'Mirrored view'),
        dr.origin ? el('button', { class: 'small', onclick: () => { dr.origin = null; setup.tool = 'origin'; rebuild(); } }, 'Use the frame corner') : null,
        el('label', { class: 'btn small', title: 'Another PDF or image for this view' }, 'Other file…', el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f, setup.edit); } })),
        el('span', { class: 'muted', style: { fontSize: '12px' } }, app.drawSource?.name || ''),
        el('span', { class: 'spacer' }),
        el('button', { class: 'small', onclick: () => { setup.edit = null; rebuild(); } }, 'Cancel'),
        el('button', { class: 'primary small', disabled: !dr.crop, onclick: saveView }, 'Save view')),
      pageViewer(),
    );
    if (dr.crop) setTimeout(fillDimPick, 0);
  }
  box.append(el('div', { class: 'row', style: { marginTop: '10px' } }, nextBtn('Next: lift points & COG →')));
  return box;
}

function cubeIcon(k) {
  // small cube with the origin corner and the viewing direction
  const face = { xy: 'M30 22 L62 14 L86 22 L54 30 Z', xz: 'M30 22 L54 30 L54 62 L30 54 Z', yz: 'M54 30 L86 22 L86 54 L54 62 Z' }[k];
  return el('span', { html: `<svg viewBox="0 0 110 76" width="110" height="76"><path d="M30 22 L62 14 L86 22 L86 54 L54 62 L30 54 Z M54 30 L54 62 M30 22 L54 30 L86 22" fill="none" stroke="#8a96a3"/><path d="${face}" fill="#e8822a" fill-opacity=".35" stroke="#c96a17"/><circle cx="30" cy="54" r="3.5" fill="#c0392b"/><text x="6" y="70" font-size="9" fill="#c0392b">origin</text></svg>` });
}

/** Extent of a view in model mm: { a0, a1, b0, b1 } (the frame of the view). */
function viewExtent(v) {
  if (!v || !(v.s > 0)) return null;
  const kf = v.flipH ? -1 : 1;
  const a0 = (0 - v.ou) * v.s * kf, a1 = (v.w - v.ou) * v.s * kf;
  return { a0: Math.min(a0, a1), a1: Math.max(a0, a1), b0: (v.ov - v.h) * v.s, b1: v.ov * v.s };
}

/** Overall size and origin of the part from the frames of the views. */
function envelopeFromViews(all = false) {
  const ld = L(), vs = ld.views || {};
  // a frame is the outline of the part only when the origin is its corner (or when asked)
  const ext = (v) => (v && v.scaled !== false && (all || v.autoOrigin) ? viewExtent(v) : null);
  const e = { xy: ext(vs.xy), xz: ext(vs.xz), yz: ext(vs.yz) };
  const rx = e.xy ? [e.xy.a0, e.xy.a1] : e.xz ? [e.xz.a0, e.xz.a1] : null;
  const ry = e.xy ? [e.xy.b0, e.xy.b1] : e.yz ? [e.yz.a0, e.yz.a1] : null;
  const rz = e.xz ? [e.xz.b0, e.xz.b1] : e.yz ? [e.yz.b0, e.yz.b1] : null;
  ld.origin_mm = ld.origin_mm || { x: 0, y: 0, z: 0 };
  ld.dims_mm = ld.dims_mm || { L: 0, W: 0, H: 0 };
  if (rx) { ld.origin_mm.x = Math.round(rx[0]); ld.dims_mm.L = Math.round(rx[1] - rx[0]); }
  if (ry) { ld.origin_mm.y = Math.round(ry[0]); ld.dims_mm.W = Math.round(ry[1] - ry[0]); }
  if (rz) { ld.origin_mm.z = Math.round(rz[0]); ld.dims_mm.H = Math.round(rz[1] - rz[0]); }
}

// ---- overall dimensions read on the drawing (the dimension values printed around the view)
const textCache = new Map();
async function pageText(page) {
  const src = app.drawSource;
  if (!src) return [];
  const key = `${src.name}:${page}`;
  if (!textCache.has(key)) textCache.set(key, await src.text(page).catch(() => []));
  return textCache.get(key);
}

/** Dimension values (mm) printed near a frame: [{ val, u, v }]. */
export function dimTokens(items, crop) {
  const m = 0.35 * Math.max(crop.w, crop.h) + 30;
  const out = [];
  for (const it of items) {
    if (it.u < crop.x - m || it.u > crop.x + crop.w + m || it.v < crop.y - m || it.v > crop.y + crop.h + m) continue;
    const str = String(it.str).replace(/(\d)[\s\u202f\u00a0](?=\d{3}\b)/g, '$1');
    for (const t of str.split(/[\s()=]+/)) {
      if (!/^\d{2,6}(?:[.,]\d+)?$/.test(t)) continue; // no Ø, R, M… prefixed values
      const val = Number(t.replace(',', '.'));
      if (val >= 20 && val <= 100000 && !out.some((o) => o.val === val)) out.push({ val, u: it.u, v: it.v });
    }
  }
  return out;
}

/** Candidates for one axis: closest to the measured size first (or the largest values). */
export function rankDims(tokens, measured) {
  const list = tokens.map((t) => t.val);
  if (measured > 0) return list.sort((a, b) => Math.abs(a - measured) - Math.abs(b - measured)).slice(0, 5);
  return list.sort((a, b) => b - a).slice(0, 5);
}

async function fillDimPick() {
  const box = document.getElementById('dim-pick');
  const dr = setup.draft, k = setup.edit;
  if (!box || !dr?.crop || !k) return;
  const d = VIEW_DEF[k];
  const s = scale();
  const items = await pageText(dr.page || setup.page);
  const toks = dimTokens(items, dr.crop);
  const mH = s.mmPerUnit ? dr.crop.w * s.mmPerUnit : 0, mV = s.mmPerUnit ? dr.crop.h * s.mmPerUnit : 0;
  const cH = rankDims(toks, mH), cV = rankDims(toks, mV);
  // proposed automatically when a value matches the frame within 4 %
  if (dr.dimH == null && cH[0] && mH && Math.abs(cH[0] - mH) < 0.04 * mH) dr.dimH = cH[0];
  if (dr.dimV == null && cV[0] && mV && Math.abs(cV[0] - mV) < 0.04 * mV) dr.dimV = cV[0];
  const axis = (key, label, cands, measured) => {
    const chips = cands.map((v) => el('button', { class: `chip-btn ${dr[key] === v ? 'on' : ''}`, onclick: () => setDim(key, v) }, String(v)));
    const inp = el('input', { type: 'number', min: 0, step: 'any', value: dr[key] ?? '', placeholder: 'mm', style: { width: '80px' }, onchange: (e) => setDim(key, Number(e.target.value) || null) });
    return el('span', { class: 'dim-axis' }, el('b', {}, label), ...chips, inp, measured ? el('span', { class: 'muted' }, `(frame ≈ ${Math.round(measured)})`) : null);
  };
  box.innerHTML = '';
  box.append(
    el('span', { class: 'muted' }, cH.length || cV.length ? 'Overall dimensions on the drawing — click the right value:' : 'Overall dimensions (type them if the drawing has no text):'),
    axis('dimH', `${d.h}:`, cH, mH), axis('dimV', `${d.v}:`, cV, mV));
  const ref = dr.dimH || dr.dimV;
  const meas = dr.dimH ? mH : mV;
  if (ref && meas && Math.abs(ref - meas) > 0.03 * ref)
    box.append(el('button', { class: 'small', title: 'Frame drawn edge to edge: the scale is set so that the frame measures the overall dimension', onclick: () => scaleFromDim() }, 'Set the scale from it'));
}

function setDim(key, v) {
  const dr = setup.draft;
  dr[key] = v || null;
  if (v && !scale().mmPerUnit) scaleFromDim(true);
  else fillDimPick();
}

/** Scale from the frame (edge to edge) and the overall dimension picked. */
function scaleFromDim(quiet) {
  const dr = setup.draft;
  const s = scale();
  const k = dr.dimH ? dr.dimH / dr.crop.w : dr.dimV ? dr.dimV / dr.crop.h : null;
  if (!k) return;
  s.mmPerUnit = k;
  s.ratio = app.drawSource?.kind === 'pdf' ? Math.round((k / PT_MM) * 10) / 10 : null;
  applyScaleToViews();
  toast(`Scale set from the overall dimension${s.ratio ? ` (≈ 1:${s.ratio})` : ''}${quiet ? ' — the frame must be drawn edge to edge' : ''}`);
  rebuild();
}

/** Overall size of the part from the dimensions picked on the drawing (centred on the frames). */
function applyDrawingDims() {
  const ld = L(), vs = ld.views || {};
  const name = { x: 'L', y: 'W', z: 'H' };
  ld.origin_mm = ld.origin_mm || { x: 0, y: 0, z: 0 };
  ld.dims_mm = ld.dims_mm || { L: 0, W: 0, H: 0 };
  for (const [k, v] of Object.entries(vs)) {
    if (!v) continue;
    const [A, B] = AXES[k];
    const e = v.scaled !== false ? viewExtent(v) : null;
    for (const [ax, val, lo, hi] of [[A, v.dimH, e?.a0, e?.a1], [B, v.dimV, e?.b0, e?.b1]]) {
      if (!(val > 0)) continue;
      ld.dims_mm[name[ax]] = Math.round(val);
      if (lo != null) ld.origin_mm[ax] = Math.round((lo + hi) / 2 - val / 2);
    }
  }
}

/** Exchanges the front and the side view (and what was clicked on them). */
export function swapFrontSide() {
  const ld = L(), vs = ld.views || (ld.views = {});
  [vs.xz, vs.yz] = [vs.yz || null, vs.xz || null];
  applyDrawingDims();
  const items = [{ t: ld.cog_mm, picks: ld.cogPicks }, ...ld.liftPoints.map((p) => ({ t: p, picks: p.picks }))];
  for (const it of items) {
    if (!it.picks) continue;
    [it.picks.xz, it.picks.yz] = [it.picks.yz, it.picks.xz];
    if (!it.picks.xz) delete it.picks.xz;
    if (!it.picks.yz) delete it.picks.yz;
    combinePicks(it.t, it.picks);
  }
  envelopeFromViews();
  app.recompute();
}

/** The front view must be as wide as the top view (X); exchanged automatically when it is clearly the side view. */
function autoSwap() {
  const vs = L().views || {};
  const t = viewExtent(vs.xy), f = viewExtent(vs.xz), sd = viewExtent(vs.yz);
  if (!t || (!f && !sd)) return false;
  const tx = t.a1 - t.a0, ty = t.b1 - t.b0;
  if (Math.abs(tx - ty) < 0.1 * Math.max(tx, ty)) return false; // square part: cannot tell
  const near = (a, b) => Math.abs(a - b) < 0.08 * b;
  const fw = f ? f.a1 - f.a0 : null, sw = sd ? sd.a1 - sd.a0 : null;
  const frontIsSide = fw != null && near(fw, ty) && !near(fw, tx);
  const sideIsFront = sw != null && near(sw, tx) && !near(sw, ty);
  if ((frontIsSide && (sw == null || sideIsFront)) || (sideIsFront && fw == null)) { swapFrontSide(); return true; }
  return false;
}

async function saveView() {
  const k = setup.edit, dr = setup.draft, src = app.drawSource;
  if (!k || !dr?.crop) return;
  const { canvas, pxPerUnit } = await src.renderRegion(dr.page, dr.crop, 1800);
  const s = scale();
  const mmPerUnit = s.mmPerUnit || null;
  // origin: the reference point clicked, else the bottom-left corner of the frame (bottom-right if mirrored)
  const org = dr.origin || { u: dr.crop.x + (dr.flipH ? dr.crop.w : 0), v: dr.crop.y + dr.crop.h };
  L().views[k] = {
    image: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height, pxPerUnit,
    s: mmPerUnit ? mmPerUnit / pxPerUnit : 1 / pxPerUnit, ou: (org.u - dr.crop.x) * pxPerUnit, ov: (org.v - dr.crop.y) * pxPerUnit,
    flipH: !!dr.flipH, autoOrigin: !dr.origin, scaled: !!mmPerUnit, file: src.name, page: dr.page, wizard: { ...dr },
    dimH: dr.dimH || null, dimV: dr.dimV || null,
  };
  const swapped = autoSwap();
  envelopeFromViews();
  applyDrawingDims();
  if (!mmPerUnit) toast('View saved — set the scale (Scale of this file, or pick the overall dimension) so that it has the right size');
  else toast(swapped ? 'The front and side views were exchanged: the front view is the one as wide as the top view' : `${VIEW_DEF[k].name} saved`);
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
  const cv = el('div', { class: 'pv-canvas', id: 'pv-canvas' });
  panZoomBox(cv, { get: () => setup.zoom, set: (z) => { setup.zoom = z; }, redraw: renderPage, min: 0.4, max: 10 });
  const wrap = el('div', { class: 'pv' },
    el('div', { class: 'toolbar' }, src.pages > 1 ? pageSel : null,
      el('button', { class: 'small', onclick: () => { setup.zoom = Math.max(0.4, setup.zoom / 1.3); renderPage(); } }, '−'),
      el('button', { class: 'small', onclick: () => { setup.zoom = Math.min(8, setup.zoom * 1.3); renderPage(); } }, '+'),
      el('button', { class: 'small', onclick: () => { setup.zoom = 1; renderPage(); } }, 'Fit'),
      el('span', { class: 'muted', id: 'pv-status', style: { fontSize: '12px' } }, ''),
      el('span', { class: 'muted', style: { fontSize: '12px', marginLeft: 'auto' } }, 'Wheel = zoom · right / middle button drag or Space + drag = move')),
    cv,
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
    c = await src.render(setup.page, Math.min(k * (window.devicePixelRatio || 1), Math.sqrt(40e6 / (size.w * size.h))));
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
    setup.tool = 'frame';
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
        if (setup.edit) setup.tool = setup.draft?.crop ? 'origin' : 'frame';
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
  const og = dr?.origin || (dr?.crop ? { u: dr.crop.x + (dr.flipH ? dr.crop.w : 0), v: dr.crop.y + dr.crop.h } : null);
  if (st && og && s.mmPerUnit && setup.edit) {
    const d = VIEW_DEF[setup.edit];
    st.textContent = `${d.h} ${Math.round((u - og.u) * s.mmPerUnit * (dr.flipH ? -1 : 1))} · ${d.v} ${Math.round((og.v - v) * s.mmPerUnit)} mm${dr.crop ? ` — frame ${Math.round(dr.crop.w * s.mmPerUnit)} × ${Math.round(dr.crop.h * s.mmPerUnit)} mm` : ''}`;
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
  const og = dr?.origin || (dr?.crop ? { u: dr.crop.x + (dr.flipH ? dr.crop.w : 0), v: dr.crop.y + dr.crop.h } : null);
  if (og && (dr.page || setup.page) === setup.page) {
    const d = dr.flipH ? -1 : 1, Lx = 50 * u;
    s += `<g stroke-width="${2 * u}"><line x1="${og.u}" y1="${og.v}" x2="${og.u + d * Lx}" y2="${og.v}" stroke="#c0392b"/><line x1="${og.u}" y1="${og.v}" x2="${og.u}" y2="${og.v - Lx}" stroke="#2a5db0"/></g><circle cx="${og.u}" cy="${og.v}" r="${5 * u}" fill="#c0392b" stroke="#fff" stroke-width="${u}"/><text x="${og.u + 6 * u}" y="${og.v + 14 * u}" font-size="${11 * u}" fill="#c0392b" font-weight="700">0</text>`;
  }
  setup.tmp.forEach(([a, b]) => (s += `<circle cx="${a}" cy="${b}" r="${4 * u}" fill="#e8822a" stroke="#fff" stroke-width="${u}"/>`));
  if (setup.tmp.length === 1 && setup.tool === 'cal') s += '';
  if (setup.drag) {
    const g = setup.drag;
    s += `<rect x="${Math.min(g.u0, g.u1)}" y="${Math.min(g.v0, g.v1)}" width="${Math.abs(g.u1 - g.u0)}" height="${Math.abs(g.v1 - g.v0)}" fill="rgba(232,130,42,.1)" stroke="#e8822a" stroke-width="${2 * u}"/>`;
  }
  ov.innerHTML = s;
}

// ---------------- step 5: lift points & COG
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

/** Axes already given by the views clicked (optionally except one view). */
export function knownAxes(picks, except) {
  const s = new Set();
  for (const k of Object.keys(picks || {})) if (k !== except && picks[k] && AXES[k]) AXES[k].forEach((a) => s.add(a));
  return s;
}

/** Rewrites the picks of every view from the coordinates (one value per coordinate, no mismatch). */
export function syncPicks(t, picks) {
  for (const k of Object.keys(picks || {})) if (picks[k] && AXES[k]) picks[k] = [Math.round(+t[AXES[k][0]] || 0), Math.round(+t[AXES[k][1]] || 0)];
}

/**
 * A click on view `key` at (a, b) for item {t, picks}: a coordinate already given by another view is
 * kept (the click only adds what is missing), unless the item is already complete (then the click
 * moves it in this view).
 */
export function applyPick(t, picks, key, a, b) {
  const [A, B] = AXES[key];
  const known = knownAxes(picks, key);
  const complete = knownAxes(picks).size === 3;
  if (complete || !known.has(A)) t[A] = Math.round(a);
  if (complete || !known.has(B)) t[B] = Math.round(b);
  picks[key] = [t[A], t[B]];
  syncPicks(t, picks);
}

function shownViews() {
  const v = L().views || {};
  const have = Object.keys(VIEW_DEF).filter((k) => v[k]);
  return have.length >= 2 ? have : have.length === 1 ? [...new Set([...have, 'xy', 'xz'])] : ['xy', 'xz', 'yz'];
}

/** Next view to click for this item (a view that gives a missing coordinate), null when complete. */
function nextNeeded(id) {
  const it = itemTarget(id);
  if (!it) return null;
  const known = knownAxes(it.picks);
  if (known.size === 3) return null;
  return shownViews().find((k) => !it.picks[k] && AXES[k].some((ax) => !known.has(ax))) || null;
}

const ITEMS = () => ['COG', ...L().liftPoints.map((p) => p.id)];

function onPick(key, a, b) {
  const id = setup.item;
  const it = itemTarget(id);
  if (!it) return;
  applyPick(it.t, it.picks, key, a, b);
  if (id === 'COG' && L().cogBasis !== 'drawing') L().cogBasis = 'drawing';
  // advance: next item still to place
  if (!nextNeeded(id)) {
    if (id !== 'COG') setup.lastDone = id;
    const ids = ITEMS();
    const nxt = [...ids.slice(ids.indexOf(id) + 1), ...ids.slice(0, ids.indexOf(id))].find((x) => nextNeeded(x));
    if (nxt) setup.item = nxt;
  }
  lvState.selected = setup.item;
  app.recompute();
}

/** Selects an item from a click on its marker (when the selected item does not need this view). */
function onSelectMarker(key, id) {
  const need = nextNeeded(setup.item);
  if (need === key) return false; // the click places the selected item
  setup.item = id;
  lvState.selected = id;
  refreshSetup();
  return true;
}

/** Dashed guide lines: where the selected item is, from the other views. */
function guideFor(key) {
  if (lvState.mode !== 'pick') return null;
  const it = itemTarget(setup.item);
  if (!it || it.picks[key]) return null;
  const known = knownAxes(it.picks);
  if (known.size === 3) return null;
  const [A, B] = AXES[key];
  if (!known.has(A) && !known.has(B)) return null;
  return { a: known.has(A) ? +it.t[A] || 0 : null, b: known.has(B) ? +it.t[B] || 0 : null, label: setup.item };
}

function pickStatus() {
  const id = setup.item;
  const need = nextNeeded(id);
  const name = id === 'COG' ? 'the COG' : `point ${id}`;
  const it = itemTarget(id);
  const started = it && Object.keys(it.picks).length > 0;
  let msg;
  if (!need) msg = el('span', {}, el('b', {}, `${id === 'COG' ? 'COG' : `Point ${id}`} placed.`), ' Click another item in the list, drag a marker to adjust it, or use the symmetry buttons.');
  else if (!started) msg = el('span', {}, 'Click ', el('b', {}, name), ' on the ', el('b', {}, VIEW_DEF[need].name.toUpperCase()), ' (or on any view).');
  else {
    const known = knownAxes(it.picks);
    const give = AXES[need].filter((ax) => !known.has(ax)).map((ax) => ax.toUpperCase()).join(' and ');
    msg = el('span', {}, 'Now click ', el('b', {}, name), ' on the ', el('b', {}, VIEW_DEF[need].name.toUpperCase()), ` — it only gives ${give}: follow the orange dashed line.`);
  }
  return el('div', { id: 'pick-status', class: 'note info pick-status' }, msg);
}

function pickList() {
  const ld = L();
  const row = (id) => {
    const it = itemTarget(id);
    const t = it?.t || {};
    const done = !nextNeeded(id);
    return el('button', { class: `pick-item ${setup.item === id ? 'on' : ''} ${done ? 'done' : ''}`, onclick: () => { setup.item = id; lvState.selected = id; lvState.mode = 'pick'; refreshSetup(); } },
      el('b', {}, id),
      el('span', { class: 'views' }, shownViews().map((k) => el('i', { class: it?.picks?.[k] ? 'ok' : '' }, VIEW_DEF[k].short))),
      el('span', { class: 'xyz' }, `${fmt(t.x, 0)} · ${fmt(t.y, 0)} · ${fmt(t.z, 0)}`),
      done ? el('span', { class: 'ok-mark' }, '✓') : null);
  };
  return el('div', { id: 'pick-list', class: 'pick-list' }, ITEMS().map(row));
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

/** Centre used for the symmetries: geometric centre of the part, else the COG. */
function symCentre() {
  const ld = L(), o = ld.origin_mm || {}, d = ld.dims_mm || {};
  const c = ld.cog_mm || {};
  return {
    x: +d.L > 0 ? (+o.x || 0) + d.L / 2 : +c.x || 0,
    y: +d.W > 0 ? (+o.y || 0) + d.W / 2 : +c.y || 0,
  };
}

/** Mirror copies of the selected lift point: mode 'x' (across the centre in X), 'y', or 'xy' (4 points). */
export function mirrorPoints(ld, srcId, mode, centre) {
  const src = ld.liftPoints.find((p) => p.id === srcId);
  if (!src) return [];
  const mx = (v) => Math.round(2 * centre.x - v), my = (v) => Math.round(2 * centre.y - v);
  const targets = mode === 'x' ? [[mx(src.x), src.y]] : mode === 'y' ? [[src.x, my(src.y)]] : [[mx(src.x), src.y], [mx(src.x), my(src.y)], [src.x, my(src.y)]];
  const used = new Set(ld.liftPoints.map((p) => p.id));
  const nextId = () => { const id = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !used.has(c)) || `P${used.size + 1}`; used.add(id); return id; };
  const { id: _a, x: _b, y: _c, picks, ...props } = src;
  const out = [];
  // 4 points: the other points of the list are reused in order (A → B, C, D)
  const others = mode === 'xy' ? ld.liftPoints.filter((p) => p.id !== srcId) : [];
  targets.forEach(([x, y], i) => {
    const near = ld.liftPoints.find((p) => p.id !== srcId && Math.hypot((+p.x || 0) - x, (+p.y || 0) - y) < 30 && Math.abs((+p.z || 0) - (+src.z || 0)) < 30);
    let p = mode === 'xy' ? others[i] : near;
    if (!p) { p = { ...props, id: nextId(), used: true }; ld.liftPoints.push(p); }
    else Object.assign(p, { ...props, id: p.id, used: p.used !== false });
    Object.assign(p, { x, y, z: src.z });
    p.picks = {};
    for (const k of Object.keys(picks || {})) p.picks[k] = [0, 0];
    syncPicks(p, p.picks);
    out.push(p.id);
  });
  return out;
}

function mirror(mode) {
  // the selected point when it is placed, else the last point placed
  let id = setup.item;
  if (id === 'COG' || nextNeeded(id)) id = setup.lastDone && itemTarget(setup.lastDone) && !nextNeeded(setup.lastDone) ? setup.lastDone : null;
  if (!id) return toast('Place a lift point in two views first, then use the symmetry');
  const ids = mirrorPoints(L(), id, mode, symCentre());
  setup.item = id;
  lvState.selected = id;
  app.recompute();
  window.__rerender();
  toast(`Point${ids.length > 1 ? 's' : ''} ${ids.join(', ')} placed symmetrically to ${id}`);
}

function stepPoints() {
  lvState.mode = 'pick';
  if (!ITEMS().includes(setup.item)) setup.item = 'COG';
  lvState.selected = setup.item;
  const vs = shownViews();
  const need = nextNeeded(setup.item);
  pickViews = vs.map((k) => {
    const v = loadView(k, { editable: true, height: 330, onPick, onMarker: onSelectMarker, guide: () => guideFor(k), title: VIEW_DEF[k].name });
    if (k === need) v.classList.add('need');
    return v;
  });
  const ld = L();
  const hasSize = +ld.dims_mm?.L > 0 && +ld.dims_mm?.W > 0 && +ld.dims_mm?.H > 0;
  return el('div', {},
    el('div', { class: 'pick-head' },
      el('div', {}, pickList(),
        el('div', { class: 'pick-tools' },
          el('button', { class: 'small', onclick: addPoint }, '+ Lift point'),
          el('button', { class: 'small', title: 'Copy of the selected point on the other side in X (about the centre of the part)', onclick: () => mirror('x') }, '⇆ Mirror X'),
          el('button', { class: 'small', title: 'Copy of the selected point on the other side in Y', onclick: () => mirror('y') }, '⇅ Mirror Y'),
          el('button', { class: `small ${setup.four ? 'active' : ''}`, title: '4 identical lift points, symmetric about the centre', onclick: () => { setup.four = !setup.four; rebuild(); } }, '4 similar lift points…'),
          el('button', { class: 'small', disabled: !hasSize, title: hasSize ? 'COG at the centre of the overall size (weight evenly spread)' : 'Needs the size of the part (frames of the views)', onclick: () => { ld.cogBasis = 'geometric'; ld.cogPicks = { xy: [0, 0], xz: [0, 0], yz: [0, 0] }; app.recompute(); syncPicks(ld.cog_mm, ld.cogPicks); toast('COG at the geometric centre of the part'); window.__rerender(); } }, 'COG at the geometric centre'))),
      el('div', { class: 'pick-side' }, pickStatus(),
        el('div', { class: 'row', style: { fontSize: '12px' } },
          el('span', { class: 'muted' }, el('b', {}, 'Click'), ' = place the selected item · click a marker = select it · ', el('b', {}, 'drag'), ' = move the view or a marker · ', el('b', {}, 'wheel'), ' = zoom · ⤢ = full screen'),
          el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: lvState.showRig, onchange: (e) => { lvState.showRig = e.target.checked; refreshSetup(); } }), 'Show rigging')))),
    setup.four ? fourPointsForm(() => { setup.four = false; setup.item = 'A'; window.__rerender(); }) : null,
    el('div', { class: `grid ${vs.length === 3 ? 'g3' : 'g2'}`, style: { gap: '8px', marginTop: '8px' } }, ...pickViews),
  );
}

// ---- 4 similar lift points (same pad eye, symmetric about the centre of the part or the COG)
/** Creates (or replaces) A, B, C, D: spacing sx along X, sy along Y, height z, about centre c. */
export function fourSimilar(ld, { sx, sy, z, c }) {
  const tpl = ld.liftPoints[0] || { padeye: true, kind: 'padeye' };
  const { id: _i, x: _x, y: _y, z: _z, picks: _p, ...props } = tpl;
  const pos = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const ids = ['A', 'B', 'C', 'D'];
  const keep = ld.liftPoints.filter((p) => !ids.includes(p.id) && p !== tpl);
  const pts = pos.map(([i, j], n) => {
    const p = { ...props, id: ids[n], used: true, x: Math.round(c.x + (i * sx) / 2), y: Math.round(c.y + (j * sy) / 2), z: Math.round(z) };
    p.picks = { xy: [p.x, p.y], xz: [p.x, p.z], yz: [p.y, p.z] };
    return p;
  });
  ld.liftPoints = [...pts, ...keep];
  return pts;
}

export function fourPointsForm(onDone) {
  const ld = L(), o = ld.origin_mm || {}, d = ld.dims_mm || {}, g = ld.cog_mm || {};
  const hasSize = +d.L > 0 && +d.W > 0;
  const A = ld.liftPoints.find((p) => p.id === 'A');
  const geo = { x: (+o.x || 0) + (+d.L || 0) / 2, y: (+o.y || 0) + (+d.W || 0) / 2 };
  const st = {
    centre: hasSize ? 'geo' : 'cog',
    sx: A && hasSize ? Math.round(2 * Math.abs(A.x - geo.x)) || Math.max(0, d.L - 300) : hasSize ? Math.max(0, d.L - 300) : 2000,
    sy: A && hasSize ? Math.round(2 * Math.abs(A.y - geo.y)) || Math.max(0, d.W - 300) : hasSize ? Math.max(0, d.W - 300) : 1500,
    z: A ? +A.z || 0 : (+o.z || 0) + (+d.H || 0),
  };
  const num = (key, label) => el('label', { class: 'field' }, el('span', { class: 'lbl' }, label), el('input', { type: 'number', step: 'any', value: st[key], oninput: (e) => { st[key] = Number(e.target.value) || 0; } }));
  const cSel = el('select', { onchange: (e) => { st.centre = e.target.value; } },
    el('option', { value: 'geo', selected: st.centre === 'geo', disabled: !hasSize }, 'Geometric centre of the part'),
    el('option', { value: 'cog', selected: st.centre === 'cog' }, 'COG'));
  return el('div', { class: 'four-form' },
    el('b', {}, '4 similar lift points (A, B, C, D)'),
    el('span', { class: 'muted', style: { fontSize: '12px' } }, `Same pad eye as point ${ld.liftPoints[0]?.id || 'A'}; A at −X −Y, then B, C, D anticlockwise seen from above.`),
    el('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-end' } },
      num('sx', 'Distance between points along X (mm)'), num('sy', 'Distance along Y (mm)'), num('z', 'Height Z of the points (mm)'),
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Centred on'), cSel),
      el('button', { class: 'primary small', onclick: () => {
        const c = st.centre === 'geo' && hasSize ? geo : { x: +g.x || 0, y: +g.y || 0 };
        fourSimilar(ld, { sx: st.sx, sy: st.sy, z: st.z, c });
        app.recompute();
        toast('Lift points A, B, C, D created');
        onDone?.();
      } }, 'Create A, B, C, D'),
      el('button', { class: 'small', onclick: () => onDone?.() }, 'Cancel')));
}
