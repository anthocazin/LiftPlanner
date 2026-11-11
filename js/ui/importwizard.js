// "Import into LiftPlanner" wizard: choose the page and frame of the XY (plan) and XZ (elevation)
// views of a drawing, calibrate the scale and the origin, read the weight / COG from the text.
import { app } from './app.js';
import { el, fmt, toast } from './dom.js';
import { openSource, scanText } from './pdfutil.js';

const NS = 'http://www.w3.org/2000/svg';
const PT_MM = 25.4 / 72; // 1 PDF point on paper, in mm
const VIEWS = {
  xy: { title: 'XY — plan (top view)', h: 'X', v: 'Y', dim: ['L', 'W'] },
  xz: { title: 'XZ — elevation (front view)', h: 'X', v: 'Z', dim: ['L', 'H'] },
};
const TOOLS = {
  outline: { label: 'Outline (2 clicks)', help: 'Click two opposite corners of the outline of the part in this view (bottom-left and top-right). Scale and origin are set from the real length; the frame is set around it.' },
  frame: { label: 'Frame (drag)', help: 'Drag a rectangle around the view to keep (the part of the page that will be shown in LiftPlanner).' },
  scale: { label: 'Scale (2 clicks)', help: 'Click the two ends of a known dimension, then enter its real length in mm.' },
  origin: { label: 'Origin (1 click)', help: 'Click the point of the part that is the origin of the load frame (X = 0, Y = 0 / Z = 0), usually the bottom-left corner.' },
};

let wz = null;

/** Opens the wizard with a file (PDF or image). onDone() is called after the import. */
export async function openImportWizard(file, onDone) {
  let src;
  try {
    src = await openSource(file);
  } catch (e) {
    alert(`Cannot open the file: ${e.message}`);
    return;
  }
  const prev = app.project.load.views || {};
  wz = {
    src, onDone, active: 'xy', tool: 'outline', zoom: 1, tmp: [], drag: null, scan: null,
    views: {
      xy: { page: 1, crop: null, s: null, origin: null, flipH: false, ...(prev.xy?.wizard && prev.xy.file === src.name ? prev.xy.wizard : {}) },
      xz: { page: Math.min(src.pages, 1), crop: null, s: null, origin: null, flipH: false, ...(prev.xz?.wizard && prev.xz.file === src.name ? prev.xz.wizard : {}) },
    },
  };
  buildModal();
  renderPage();
  scanText(src).then((r) => {
    if (!wz) return;
    wz.scan = r;
    renderSide();
  }).catch(() => {});
}

function closeWizard() {
  document.getElementById('wizard')?.remove();
  wz = null;
}

function buildModal() {
  document.getElementById('wizard')?.remove();
  const m = el('div', { id: 'wizard', class: 'modal' },
    el('div', { class: 'modal-box' },
      el('div', { class: 'modal-head' },
        el('h2', {}, 'Import drawing into LiftPlanner'),
        el('span', { class: 'muted' }, wz.src.name),
        el('span', { class: 'spacer' }),
        el('button', { class: 'small', onclick: closeWizard }, 'Cancel'),
        el('button', { class: 'primary', onclick: doImport }, 'Import into LiftPlanner'),
      ),
      el('div', { class: 'modal-body' },
        el('div', { class: 'wz-side', id: 'wz-side' }),
        el('div', { class: 'wz-main' },
          el('div', { class: 'toolbar', id: 'wz-bar' }),
          el('div', { class: 'wz-canvas', id: 'wz-canvas' }),
        ),
      ),
    ),
  );
  document.body.append(m);
  renderSide();
}

const V = () => wz.views[wz.active];

function status(v) {
  const ok = (b) => (b ? '✓' : '—');
  return `Frame ${ok(v.crop)} · Scale ${v.s ? `${fmt(v.s, 3)} mm/unit ${ok(1)}` : ok(0)} · Origin ${ok(v.origin)}`;
}

function renderSide() {
  const side = document.getElementById('wz-side');
  if (!side || !wz) return;
  side.innerHTML = '';
  const load = app.project.load;
  for (const [k, def] of Object.entries(VIEWS)) {
    const v = wz.views[k];
    side.append(
      el('div', { class: `wz-view ${wz.active === k ? 'active' : ''}`, onclick: () => { wz.active = k; wz.tmp = []; renderSide(); renderPage(); } },
        el('b', {}, def.title),
        el('div', { class: 'muted', style: { fontSize: '12px' } }, `Page ${v.page} · ${status(v)}`),
        v.crop || v.s ? el('button', { class: 'small', onclick: (e) => { e.stopPropagation(); wz.views[k] = { page: v.page, crop: null, s: null, origin: null, flipH: false }; renderSide(); renderPage(); } }, 'Clear') : null,
      ),
    );
  }
  const v = V();
  const def = VIEWS[wz.active];
  const pageSel = el('select', { onchange: (e) => { v.page = Number(e.target.value); wz.tmp = []; renderPage(); renderSide(); } });
  for (let i = 1; i <= wz.src.pages; i++) pageSel.append(el('option', { value: i, selected: i === v.page }, `Page ${i}`));
  const tools = el('div', { class: 'wz-tools' });
  for (const [t, d] of Object.entries(TOOLS))
    tools.append(el('button', { class: `small ${wz.tool === t ? 'active' : ''}`, title: d.help, onclick: () => { wz.tool = t; wz.tmp = []; renderSide(); drawOverlay(); } }, d.label));
  const scaleIn = el('input', { type: 'number', step: 'any', placeholder: 'e.g. 20', style: { width: '80px' } });
  side.append(
    el('h3', {}, `${def.title}`),
    el('div', { class: 'row' }, pageSel),
    tools,
    el('div', { class: 'note info', style: { fontSize: '12px' } }, TOOLS[wz.tool].help),
    wz.src.kind === 'pdf'
      ? el('div', { class: 'row', style: { marginTop: '6px', fontSize: '12px' } }, 'Or drawing scale 1 :', scaleIn,
        el('button', { class: 'small', onclick: () => { const k = Number(scaleIn.value); if (k > 0) { v.s = PT_MM * k; toast(`Scale 1:${k} → ${fmt(v.s, 3)} mm per point`); renderSide(); } } }, 'Apply'))
      : null,
    el('label', { class: 'check', style: { fontSize: '12px' } }, el('input', { type: 'checkbox', checked: v.flipH, onchange: (e) => { v.flipH = e.target.checked; drawOverlay(); } }), `${def.h} increases to the left on this view (mirror)`),
  );
  // detected text
  const sc = wz.scan;
  side.append(el('h3', {}, 'Read from the drawing'));
  if (!sc) side.append(el('div', { class: 'muted', style: { fontSize: '12px' } }, wz.src.kind === 'pdf' ? 'Reading the text…' : 'Images have no text layer: enter the weight and COG on the Load page.'));
  else {
    if (!sc.weights.length && !sc.cogs.length) side.append(el('div', { class: 'muted', style: { fontSize: '12px' } }, 'No weight or COG found in the text of the PDF (scanned drawing?).'));
    sc.weights.slice(0, 8).forEach((w) =>
      side.append(el('div', { class: 'hit' }, el('span', {}, el('b', {}, `${fmt(w.value, 3)} t`), ` p.${w.page} — ${w.text}`),
        el('button', { class: 'small', onclick: () => { load.weight_t = Math.round(w.value * 1000) / 1000; load.weightBasis = 'drawing'; app.recompute(); toast(`Weight ${fmt(w.value, 3)} t applied`); } }, 'Use'))),
    );
    sc.cogs.slice(0, 5).forEach((c) =>
      side.append(el('div', { class: 'hit' }, el('span', {}, el('b', {}, `COG ${['x', 'y', 'z'].map((k) => (c.value[k] != null ? `${k.toUpperCase()} ${c.value[k]}` : '')).join(' ')}`), ` p.${c.page} — ${c.text}`),
        el('button', { class: 'small', onclick: () => { Object.entries(c.value).forEach(([k, val]) => (load.cog_mm[k] = val)); load.cogBasis = 'drawing'; app.recompute(); toast('COG from the drawing applied'); } }, 'Use'))),
    );
  }
  side.append(el('p', { class: 'muted', style: { fontSize: '11.5px', marginTop: '12px' } },
    'A 3D model cannot be rebuilt from a PDF; LiftPlanner uses two orthogonal views instead: XY gives X and Y of each point, XZ gives Z. You can import only one view and type the missing coordinate.'));
}

// ---------------- page display
let pageCanvas = null;
async function renderPage() {
  const box = document.getElementById('wz-canvas');
  const bar = document.getElementById('wz-bar');
  if (!box || !wz) return;
  const v = V();
  const size = wz.src.pageSize(v.page);
  const avail = Math.max(400, box.clientWidth - 20);
  const k = (avail / size.w) * wz.zoom;
  wz.k = k;
  bar.innerHTML = '';
  bar.append(
    el('button', { class: 'small', onclick: () => { wz.zoom = Math.max(0.3, wz.zoom / 1.3); renderPage(); } }, '−'),
    el('button', { class: 'small', onclick: () => { wz.zoom = Math.min(8, wz.zoom * 1.3); renderPage(); } }, '+'),
    el('button', { class: 'small', onclick: () => { wz.zoom = 1; renderPage(); } }, 'Fit'),
    el('span', { class: 'muted', id: 'wz-status' }, `${VIEWS[wz.active].title} — ${status(v)}`),
  );
  box.innerHTML = '';
  const wrap = el('div', { class: 'wz-page' });
  box.append(wrap);
  try {
    pageCanvas = await wz.src.render(v.page, k * (window.devicePixelRatio || 1));
  } catch (e) {
    wrap.append(el('div', { class: 'note fail' }, `Render error: ${e.message}`));
    return;
  }
  pageCanvas.style.width = `${size.w * k}px`;
  pageCanvas.style.height = `${size.h * k}px`;
  const ov = document.createElementNS(NS, 'svg');
  ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  ov.setAttribute('class', 'wz-overlay');
  ov.style.width = `${size.w * k}px`;
  ov.style.height = `${size.h * k}px`;
  wrap.append(pageCanvas, ov);
  ov.addEventListener('pointerdown', onDown);
  ov.addEventListener('pointermove', onMove);
  ov.addEventListener('pointerup', onUp);
  drawOverlay();
}

function evPt(ev) {
  const ov = document.querySelector('#wizard .wz-overlay');
  const r = ov.getBoundingClientRect();
  const size = wz.src.pageSize(V().page);
  return [((ev.clientX - r.left) / r.width) * size.w, ((ev.clientY - r.top) / r.height) * size.h];
}

function onDown(ev) {
  const [u, v] = evPt(ev);
  const view = V();
  if (wz.tool === 'frame') {
    wz.drag = { u0: u, v0: v, u1: u, v1: v };
    ev.target.setPointerCapture?.(ev.pointerId);
    return;
  }
  if (wz.tool === 'origin') {
    view.origin = { u, v };
    wz.tool = 'outline';
    done();
    return;
  }
  wz.tmp.push([u, v]);
  if (wz.tmp.length < 2) {
    drawOverlay();
    return;
  }
  const [[u1, v1], [u2, v2]] = wz.tmp;
  wz.tmp = [];
  const load = app.project.load;
  const def = VIEWS[wz.active];
  if (wz.tool === 'scale') {
    const real = Number(prompt('Real length of this dimension (mm):', ''));
    if (real > 0) view.s = real / Math.hypot(u2 - u1, v2 - v1);
  } else if (wz.tool === 'outline') {
    const du = Math.abs(u2 - u1), dv = Math.abs(v2 - v1);
    const cur = Number(load.dims_mm?.[def.dim[0]]) || 0;
    const real = Number(prompt(`Real length of the outline along ${def.h} (mm) — overall ${def.dim[0]}:`, cur || ''));
    if (real > 0 && du > 0) {
      view.s = real / du;
      view.origin = { u: view.flipH ? Math.max(u1, u2) : Math.min(u1, u2), v: Math.max(v1, v2) };
      const m = 0.12 * Math.max(du, dv);
      const size = wz.src.pageSize(view.page);
      view.crop = clampRect({ x: Math.min(u1, u2) - m, y: Math.min(v1, v2) - m, w: du + 2 * m, h: dv + 2 * m }, size);
      const other = Math.round(dv * view.s);
      load.dims_mm[def.dim[0]] = Math.round(real);
      if (other > 0 && confirm(`Set the overall ${def.dim[1]} to ${other} mm (from the outline)?`)) load.dims_mm[def.dim[1]] = other;
      load.origin_mm = load.origin_mm || { x: 0, y: 0, z: 0 };
      app.recompute();
    }
  }
  done();
}

function onMove(ev) {
  const [u, v] = evPt(ev);
  const s = document.getElementById('wz-status');
  const view = V();
  if (s && view.s && view.origin) {
    const a = (u - view.origin.u) * view.s * (view.flipH ? -1 : 1), b = (view.origin.v - v) * view.s;
    s.textContent = `${VIEWS[wz.active].h} ${Math.round(a)} · ${VIEWS[wz.active].v} ${Math.round(b)} mm — ${status(view)}`;
  }
  if (!wz.drag) return;
  wz.drag.u1 = u;
  wz.drag.v1 = v;
  drawOverlay();
}

function onUp() {
  if (!wz.drag) return;
  const d = wz.drag;
  wz.drag = null;
  const r = { x: Math.min(d.u0, d.u1), y: Math.min(d.v0, d.v1), w: Math.abs(d.u1 - d.u0), h: Math.abs(d.v1 - d.v0) };
  if (r.w > 5 && r.h > 5) V().crop = clampRect(r, wz.src.pageSize(V().page));
  done();
}

function clampRect(r, size) {
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  return { x, y, w: Math.min(size.w - x, r.w - (x - r.x)), h: Math.min(size.h - y, r.h - (y - r.y)) };
}

function done() {
  drawOverlay();
  renderSide();
  const s = document.getElementById('wz-status');
  if (s) s.textContent = `${VIEWS[wz.active].title} — ${status(V())}`;
}

function drawOverlay() {
  const ov = document.querySelector('#wizard .wz-overlay');
  if (!ov || !wz) return;
  const size = wz.src.pageSize(V().page);
  const u = 1 / wz.k; // 1 screen px in page units
  let s = '';
  for (const [k, v] of Object.entries(wz.views)) {
    if (v.page !== V().page || !v.crop) continue;
    const act = k === wz.active;
    s += `<rect x="${v.crop.x}" y="${v.crop.y}" width="${v.crop.w}" height="${v.crop.h}" fill="${act ? 'rgba(232,130,42,.08)' : 'rgba(59,110,165,.06)'}" stroke="${act ? '#e8822a' : '#3b6ea5'}" stroke-width="${2 * u}" stroke-dasharray="${8 * u} ${4 * u}"/>`;
    s += `<text x="${v.crop.x + 4 * u}" y="${v.crop.y + 14 * u}" font-size="${12 * u}" font-weight="700" fill="${act ? '#c96a17' : '#3b6ea5'}">${k.toUpperCase()}</text>`;
  }
  const v = V();
  if (v.origin) {
    const L = 50 * u, d = v.flipH ? -1 : 1;
    s += `<g stroke-width="${2 * u}"><line x1="${v.origin.u}" y1="${v.origin.v}" x2="${v.origin.u + d * L}" y2="${v.origin.v}" stroke="#c0392b"/><line x1="${v.origin.u}" y1="${v.origin.v}" x2="${v.origin.u}" y2="${v.origin.v - L}" stroke="${wz.active === 'xy' ? '#1f8f4e' : '#2a5db0'}"/></g>`;
    s += `<circle cx="${v.origin.u}" cy="${v.origin.v}" r="${4 * u}" fill="#c0392b"/>`;
    s += `<text x="${v.origin.u + d * (L + 4 * u)}" y="${v.origin.v + 4 * u}" font-size="${11 * u}" fill="#c0392b" font-weight="700" text-anchor="${d > 0 ? 'start' : 'end'}">${VIEWS[wz.active].h}</text>`;
    s += `<text x="${v.origin.u + 4 * u}" y="${v.origin.v - L - 4 * u}" font-size="${11 * u}" fill="#2a5db0" font-weight="700">${VIEWS[wz.active].v}</text>`;
  }
  wz.tmp.forEach(([a, b]) => (s += `<circle cx="${a}" cy="${b}" r="${4 * u}" fill="#e8822a" stroke="#fff" stroke-width="${u}"/>`));
  if (wz.drag) {
    const d = wz.drag;
    s += `<rect x="${Math.min(d.u0, d.u1)}" y="${Math.min(d.v0, d.v1)}" width="${Math.abs(d.u1 - d.u0)}" height="${Math.abs(d.v1 - d.v0)}" fill="rgba(232,130,42,.1)" stroke="#e8822a" stroke-width="${2 * u}"/>`;
  }
  // COG labels found in the text of this page
  (wz.scan?.cogLabels || []).filter((c) => c.page === v.page).forEach((c) => (s += `<circle cx="${c.u}" cy="${c.v}" r="${8 * u}" fill="none" stroke="#7b3fb0" stroke-width="${2 * u}"/>`));
  ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  ov.innerHTML = s;
}

// ---------------- import
async function doImport() {
  const load = app.project.load;
  load.views = load.views || {};
  let n = 0;
  const cogHits = [];
  for (const [k, v] of Object.entries(wz.views)) {
    if (!v.s || !v.origin) continue;
    const size = wz.src.pageSize(v.page);
    const crop = v.crop || { x: 0, y: 0, w: size.w, h: size.h };
    const { canvas, pxPerUnit } = await wz.src.renderRegion(v.page, crop, 1800);
    const image = canvas.toDataURL('image/jpeg', 0.85);
    load.views[k] = {
      image, w: canvas.width, h: canvas.height, s: v.s / pxPerUnit, ou: (v.origin.u - crop.x) * pxPerUnit, ov: (v.origin.v - crop.y) * pxPerUnit,
      flipH: !!v.flipH, file: wz.src.name, page: v.page, wizard: { page: v.page, crop, s: v.s, origin: v.origin, flipH: !!v.flipH },
    };
    n++;
    (wz.scan?.cogLabels || [])
      .filter((c) => c.page === v.page && c.u >= crop.x && c.u <= crop.x + crop.w && c.v >= crop.y && c.v <= crop.y + crop.h)
      .forEach((c) => {
        const a = Math.round((c.u - v.origin.u) * v.s * (v.flipH ? -1 : 1)), b = Math.round((v.origin.v - c.v) * v.s);
        cogHits.push({ view: k, a, b });
      });
  }
  if (!n) {
    alert('Calibrate at least one view (scale and origin): use "Outline" — two clicks on the corners of the part.');
    return;
  }
  app.project.drawing = { fileName: wz.src.name, kind: wz.src.kind, pages: wz.src.pages };
  app.detected = { weights: wz.scan?.weights || [], cogs: wz.scan?.cogs || [], cogMarks: cogHits };
  const cb = wz.onDone;
  closeWizard();
  app.recompute();
  toast(`${n} view(s) imported`);
  cb?.();
}
