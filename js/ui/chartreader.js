// Load chart reader: turns a load chart (PDF page or image) into radius / SWL values.
//  • Curve (abaque): calibrate the two axes (automatic from the axis labels of a PDF, or two clicks per
//    axis), click the curve: it is followed by its colour; the SWL is read every step of radius.
//  • Table: for a table in a PDF with text — frame it, pick the radius and SWL columns.
//  • Claude: the page (or the framed part) is sent to Claude with your own API key, which reads it.
import { app } from './app.js';
import { el, toast } from './dom.js';
import { openSource } from './pdfutil.js';

const LS_KEY = 'liftplanner.claude.key';
const LS_MODEL = 'liftplanner.claude.model';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
let st = null;

const NUM_RE = /^-?\d+(?:[.,]\d+)?$/;
const toNum = (t) => Number(String(t).replace(',', '.'));
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- table (text of the PDF)
/** Number tokens with an estimated position (a text item may hold several numbers). */
function tokens(items, frame) {
  const out = [];
  for (const it of items) {
    const parts = it.str.split(/(\s+)/);
    let pos = 0;
    const len = it.str.length || 1;
    for (const p of parts) {
      const u = it.u + ((pos + p.length / 2) / len) * (it.w || p.length * it.h * 0.5);
      pos += p.length;
      const t = p.trim();
      if (!t || !NUM_RE.test(t)) continue;
      if (frame && (u < frame.x || u > frame.x + frame.w || it.v < frame.y || it.v > frame.y + frame.h)) continue;
      out.push({ u, v: it.v, h: it.h, val: toNum(t) });
    }
  }
  return out;
}

/** Rows (same baseline) × columns (1-D clustering of the x positions). */
export function buildTable(toks) {
  if (!toks.length) return { rows: [], cols: [] };
  const hMed = toks.map((t) => t.h).sort((a, b) => a - b)[Math.floor(toks.length / 2)] || 8;
  const rows = [];
  for (const t of [...toks].sort((a, b) => a.v - b.v)) {
    const r = rows.find((x) => Math.abs(x.v - t.v) < hMed * 0.45);
    if (r) r.toks.push(t);
    else rows.push({ v: t.v, toks: [t] });
  }
  const us = toks.map((t) => t.u).sort((a, b) => a - b);
  const cols = [];
  for (const u of us) {
    const c = cols[cols.length - 1];
    if (c && u - c.max < hMed * 1.3) { c.max = u; c.sum += u; c.n++; }
    else cols.push({ min: u, max: u, sum: u, n: 1 });
  }
  // keep the real columns: a column of a table holds a value on most rows (drops titles, notes, page numbers)
  const maxN = Math.max(...cols.map((c) => c.n));
  const centers = cols.filter((c) => c.n >= Math.max(3, maxN * 0.4)).map((c) => c.sum / c.n);
  if (!centers.length) return { rows: [], cols: [] };
  const table = rows.map((r) => {
    const row = new Array(centers.length).fill(null);
    for (const t of r.toks) {
      let best = 0;
      centers.forEach((c, i) => { if (Math.abs(c - t.u) < Math.abs(centers[best] - t.u)) best = i; });
      if (Math.abs(centers[best] - t.u) < hMed * 2.5 && row[best] == null) row[best] = t.val;
    }
    return row;
  }).filter((r) => r.filter((x) => x != null).length >= 2);
  return { rows: table, cols: centers };
}

/** Guess: radius = column increasing down the rows, SWL = column decreasing. */
function guess(rows, n) {
  const score = (i, sign) => {
    const v = rows.map((r) => r[i]).filter((x) => x != null);
    if (v.length < 3) return -1;
    let ok = 0;
    for (let k = 1; k < v.length; k++) if (Math.sign(v[k] - v[k - 1]) === sign) ok++;
    return ok / (v.length - 1);
  };
  let rCol = 0, best = -1;
  for (let i = 0; i < n; i++) { const s = score(i, 1); if (s > best) { best = s; rCol = i; } }
  let sCol = rCol === 0 ? 1 : 0; best = -1;
  for (let i = 0; i < n; i++) { if (i === rCol) continue; const s = score(i, -1); if (s > best) { best = s; sCol = i; } }
  return { rCol, sCol };
}

// ---------------------------------------------------------------- curve (graph)
/** Least squares val = a + b·p. */
function fit(pairs) {
  const xs = pairs.map((q) => q[0]), ys = pairs.map((q) => q[1]);
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  pairs.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
  if (!sxx || !syy) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: (sxy * sxy) / (sxx * syy) };
}

/**
 * Axes calibrated from the tick labels of a PDF: a row of ≥ 3 numbers evenly spread (X, values growing
 * to the right) and a column of ≥ 3 numbers (Y, values growing upwards). → { x: {a,b}, y: {a,b} }.
 */
export function autoAxes(items) {
  const toks = items.map((it) => {
    const t = String(it.str).trim();
    if (!NUM_RE.test(t)) return null;
    const w = it.w || 0;
    return { val: toNum(t), l: it.u, c: it.u + w / 2, r: it.u + w, v: it.v - 0.35 * (it.h || 8), h: it.h || 8 };
  }).filter(Boolean);
  /** Fit with up to 2 outliers dropped (a label of the other axis caught in the group). */
  const robust = (pairs) => {
    let ps = [...pairs];
    for (let k = 0; k <= 2 && ps.length >= 3; k++) {
      const f = fit(ps);
      if (f && f.r2 >= 0.9995) return { ...f, n: ps.length, ps };
      if (!f) return null;
      let worst = 0, wv = -1;
      ps.forEach(([x, y], i) => { const e = Math.abs(f.a + f.b * x - y); if (e > wv) { wv = e; worst = i; } });
      ps.splice(worst, 1);
    }
    return null;
  };
  // pos: coordinate along the axis; group: coordinates the labels share (alignments tried)
  const best = (pos, groupKeys, sign) => {
    let res = null;
    for (const gk of groupKeys) {
      const groups = [];
      for (const t of toks) {
        const g = groups.find((q) => Math.abs(q.c - t[gk]) < Math.max(1.5, t.h * 0.45));
        if (g) g.t.push(t);
        else groups.push({ c: t[gk], t: [t] });
      }
      for (const g of groups) {
        const vals = g.t.map((t) => t.val);
        const ts = g.t.filter((t) => vals.filter((v) => v === t.val).length === 1);
        if (ts.length < 3) continue;
        const f = robust(ts.map((t) => [t[pos], t.val]));
        if (!f || Math.sign(f.b) !== sign) continue;
        const xs = f.ps.map((q) => q[0]), vs = f.ps.map((q) => q[1]);
        const score = f.n * 1000 + (Math.max(...xs) - Math.min(...xs));
        if (!res || score > res.score) res = { a: f.a, b: f.b, score, n: f.n, lo: Math.min(...vs), hi: Math.max(...vs) };
      }
    }
    return res;
  };
  return { x: best('c', ['v'], 1), y: best('v', ['r', 'c', 'l'], -1) };
}

/** Calibration from two clicked points per axis: { p, val } × 2 → { a, b }. */
function cal2(p1, p2) {
  if (!p1 || !p2 || p1.val == null || p2.val == null || p1.p == null || p2.p == null || p1.p === p2.p) return null;
  const b = (p2.val - p1.val) / (p2.p - p1.p);
  return { a: p1.val - b * p1.p, b };
}

const axX = () => st.axMode === 'manual' ? cal2(st.cal.x1, st.cal.x2) : st.auto?.x || null;
const axY = () => st.axMode === 'manual' ? cal2(st.cal.y1, st.cal.y2) : st.auto?.y || null;

/**
 * Follows a curve by its colour from a pixel (x0, y0) of an RGBA image, to the left and to the right.
 * Returns [[x, y], …] in pixels.
 */
export function traceCurve(data, W, H, x0, y0, clip = null) {
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const bg = ([r, g, b]) => r > 225 && g > 225 && b > 225;
  // snap to the nearest coloured pixel
  let s = null;
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= W || y >= H || bg(px(x, y))) continue;
    const d = dx * dx + dy * dy;
    if (!s || d < s.d) s = { x, y, d };
  }
  if (!s) return [];
  const tgt = px(s.x, s.y);
  const dist = (c) => Math.hypot(c[0] - tgt[0], c[1] - tgt[1], c[2] - tgt[2]);
  const match = (x, y) => dist(px(x, y)) < 80;
  const xMin = clip ? Math.max(0, Math.floor(clip.x0)) : 0, xMax = clip ? Math.min(W - 1, Math.ceil(clip.x1)) : W - 1;
  const yMin = clip ? Math.max(0, Math.floor(clip.y0)) : 0, yMax = clip ? Math.min(H - 1, Math.ceil(clip.y1)) : H - 1;
  // centre of the line at the start
  let y1 = s.y, y2 = s.y;
  while (y1 > yMin && match(s.x, y1 - 1)) y1--;
  while (y2 < yMax && match(s.x, y2 + 1)) y2++;
  const start = [s.x, (y1 + y2) / 2];
  const follow = (dir) => {
    const out = [];
    let [lx, ly] = start;
    let slope = 0, miss = 0;
    for (let x = s.x + dir; x >= xMin && x <= xMax; x += dir) {
      const pred = ly + slope * (x - lx);
      const win = Math.min(220, 10 + miss * 4);
      let cand = null;
      for (let y = Math.max(yMin, Math.round(pred - win)); y <= Math.min(yMax, Math.round(pred + win)); y++) {
        if (!match(x, y)) continue;
        let e = y;
        while (e + 1 <= yMax && match(x, e + 1)) e++;
        const mid = (y + e) / 2;
        if (e - y < 30 && (cand == null || Math.abs(mid - pred) < Math.abs(cand - pred))) cand = mid;
        y = e;
      }
      if (cand == null) { if (++miss > 40) break; continue; }
      const sl = (cand - ly) / (x - lx);
      slope = miss ? 0 : 0.6 * slope + 0.4 * sl;
      lx = x; ly = cand; miss = 0;
      out.push([x, cand]);
    }
    return out;
  };
  return [...follow(-1).reverse(), start, ...follow(1)];
}

/** SWL every `step` m of radius along a polyline [[R, SWL], …] (rounded down to 0.01 t). */
export function sampleCurve(pts, step = 1, rMin = null, rMax = null) {
  const p = [...pts].filter(([r, w]) => isFinite(r) && isFinite(w)).sort((a, b) => a[0] - b[0]);
  if (p.length < 2) return [];
  const lo = rMin ?? p[0][0], hi = rMax ?? p[p.length - 1][0];
  const out = [];
  for (let R = Math.ceil(lo / step - 1e-9) * step; R <= hi + 1e-9; R += step) {
    let i = p.findIndex((q) => q[0] >= R);
    if (i < 0) break;
    if (i === 0) i = 1;
    const [ra, wa] = p[i - 1], [rb, wb] = p[i];
    const w = rb === ra ? Math.min(wa, wb) : wa + ((wb - wa) * (R - ra)) / (rb - ra);
    if (w > 0) out.push([r2(R), Math.floor(w * 100 + 1e-6) / 100]);
  }
  return out;
}

// ---------------------------------------------------------------- modal
export async function openChartReader(file, onDone) {
  let src;
  try { src = await openSource(file); } catch (e) { alert(`Cannot open the file: ${e.message}`); return; }
  st = {
    src, page: 1, mode: 'curve', zoom: 1, items: [], tool: null, frame: null, drag: null,
    axMode: 'auto', auto: null, cal: { x1: null, x2: null, y1: null, y2: null },
    pts: [], step: 1, table: null, rCol: 0, sCol: 1, kR: 1, kSwl: 1,
    ai: null, aiBusy: false, colName: '', importMode: 'replace', onDone,
  };
  build();
  await loadPage();
}

function close() { document.getElementById('chartreader')?.remove(); st = null; }

function build() {
  document.getElementById('chartreader')?.remove();
  const pageSel = el('select', { onchange: async (e) => { st.page = Number(e.target.value); st.frame = null; st.pts = []; await loadPage(); } });
  for (let i = 1; i <= st.src.pages; i++) pageSel.append(el('option', { value: i }, `Page ${i}`));
  document.body.append(el('div', { id: 'chartreader', class: 'modal' }, el('div', { class: 'modal-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Read a load chart'), el('span', { class: 'muted' }, st.src.name), st.src.pages > 1 ? pageSel : null,
      el('button', { class: 'small', title: 'Zoom out', onclick: () => setZoom(st.zoom / 1.4) }, '−'),
      el('button', { class: 'small', title: 'Zoom in', onclick: () => setZoom(st.zoom * 1.4) }, '+'),
      el('span', { class: 'spacer' }),
      el('button', { class: 'small', onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: doImport }, 'Use these values')),
    el('div', { class: 'modal-body' },
      el('div', { class: 'wz-side', id: 'cr-side' }),
      el('div', { class: 'wz-main' }, el('div', { class: 'muted', id: 'cr-hint', style: { fontSize: '12px', marginBottom: '4px' } }), el('div', { class: 'wz-canvas', id: 'cr-canvas' }))),
  )));
}

async function setZoom(z) {
  st.zoom = Math.max(0.5, Math.min(5, z));
  await renderPage();
}

async function loadPage() {
  st.items = await st.src.text(st.page).catch(() => []);
  st.auto = st.items.length ? autoAxes(st.items) : null;
  st.axMode = st.auto?.x && st.auto?.y ? 'auto' : 'manual';
  if (st.src.kind === 'pdf' && st.items.length && st.mode === 'curve' && !(st.auto?.x && st.auto?.y)) {
    // a text table rather than a graph?
    const t = buildTable(tokens(st.items, null));
    if (t.cols.length >= 2 && t.rows.length >= 4) st.mode = 'table';
  }
  await renderPage();
  extract();
}

async function renderPage() {
  const box = document.getElementById('cr-canvas');
  const size = st.src.pageSize(st.page);
  const k = (((box.clientWidth || 800) - 24) / size.w) * st.zoom;
  st.k = k;
  st.kPx = k * Math.max(1.5, window.devicePixelRatio || 1);
  const c = await st.src.render(st.page, st.kPx);
  st.canvas = c;
  st.img = null;
  c.style.width = `${size.w * k}px`;
  c.style.height = `${size.h * k}px`;
  const ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  ov.setAttribute('class', 'pv-overlay');
  ov.style.width = c.style.width;
  ov.style.height = c.style.height;
  box.innerHTML = '';
  box.append(el('div', { class: 'pv-page' }, c, ov));
  const pt = (ev) => { const r = ov.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * size.w, ((ev.clientY - r.top) / r.height) * size.h]; };
  ov.addEventListener('pointerdown', (ev) => {
    const [u, v] = pt(ev);
    if (st.tool && st.tool !== 'frame') return onClick(u, v);
    st.drag = { u0: u, v0: v, u1: u, v1: v };
    ov.setPointerCapture(ev.pointerId);
  });
  ov.addEventListener('pointermove', (ev) => {
    const [u, v] = pt(ev);
    const ax = axX(), ay = axY();
    const hint = document.getElementById('cr-hint');
    if (hint && st.mode === 'curve' && ax && ay) hint.textContent = `Radius ${r2(ax.a + ax.b * u)} m · SWL ${r2(ay.a + ay.b * v)} t at the cursor`;
    if (!st.drag) return;
    st.drag.u1 = u; st.drag.v1 = v;
    overlay();
  });
  ov.addEventListener('pointerup', () => {
    if (!st.drag) return;
    const d = st.drag;
    st.drag = null;
    const f = { x: Math.min(d.u0, d.u1), y: Math.min(d.v0, d.v1), w: Math.abs(d.u1 - d.u0), h: Math.abs(d.v1 - d.v0) };
    st.frame = f.w > 5 && f.h > 5 ? f : null;
    if (st.tool === 'frame') st.tool = null;
    extract();
  });
  overlay();
  side();
}

function imageData() {
  if (!st.img) {
    const ctx = st.canvas.getContext('2d', { willReadFrequently: true });
    st.img = ctx.getImageData(0, 0, st.canvas.width, st.canvas.height);
  }
  return st.img;
}

function onClick(u, v) {
  const t = st.tool;
  if (/^[xy][12]$/.test(t)) {
    const isX = t[0] === 'x';
    const prev = st.cal[t];
    const val = Number(String(prompt(`${isX ? 'Radius (m)' : 'SWL (t)'} at this ${isX ? 'vertical' : 'horizontal'} graduation:`, prev?.val ?? '') ?? '').replace(',', '.'));
    if (!isFinite(val)) return;
    st.cal[t] = { p: isX ? u : v, val };
    st.axMode = 'manual';
    st.tool = { x1: 'x2', x2: 'y1', y1: 'y2', y2: null }[t];
  } else if (t === 'trace') {
    if (!axX() || !axY()) return toast('Calibrate the two axes first');
    const im = imageData();
    const k = st.kPx;
    const f = st.frame;
    const clip = f ? { x0: f.x * k, x1: (f.x + f.w) * k, y0: f.y * k, y1: (f.y + f.h) * k } : null;
    const line = traceCurve(im.data, im.width, im.height, Math.round(u * k), Math.round(v * k), clip);
    if (line.length < 5) return toast('No curve found here: click right on the line of the curve');
    st.pts = line.filter((_, i) => i % 2 === 0).map(([x, y]) => [x / k, y / k]);
    toast(`Curve followed over ${line.length} px — check the red dots`);
  } else if (t === 'point') {
    st.pts.push([u, v]);
  }
  overlay();
  side();
}

/** Points of the curve in chart values [[R, SWL]]. */
function curveValues() {
  const ax = axX(), ay = axY();
  if (!ax || !ay) return [];
  return st.pts.map(([u, v]) => [(ax.a + ax.b * u) * st.kR, (ay.a + ay.b * v) * st.kSwl]);
}

function overlay() {
  const ov = document.querySelector('#chartreader .pv-overlay');
  if (!ov) return;
  const u = 1 / st.k;
  let s = '';
  const f = st.drag ? { x: Math.min(st.drag.u0, st.drag.u1), y: Math.min(st.drag.v0, st.drag.v1), w: Math.abs(st.drag.u1 - st.drag.u0), h: Math.abs(st.drag.v1 - st.drag.v0) } : st.frame;
  if (f) s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="rgba(232,130,42,.06)" stroke="#e8822a" stroke-width="${2 * u}" stroke-dasharray="${6 * u} ${4 * u}"/>`;
  if (st.mode === 'curve') {
    const size = st.src.pageSize(st.page);
    for (const key of ['x1', 'x2', 'y1', 'y2']) {
      const c = st.cal[key];
      if (!c || st.axMode !== 'manual') continue;
      s += key[0] === 'x'
        ? `<line x1="${c.p}" y1="0" x2="${c.p}" y2="${size.h}" stroke="#2a5db0" stroke-width="${1.2 * u}" stroke-dasharray="${4 * u} ${3 * u}"/><text x="${c.p + 3 * u}" y="${14 * u}" font-size="${11 * u}" fill="#2a5db0" font-weight="700">${c.val} m</text>`
        : `<line x1="0" y1="${c.p}" x2="${size.w}" y2="${c.p}" stroke="#2e8b3a" stroke-width="${1.2 * u}" stroke-dasharray="${4 * u} ${3 * u}"/><text x="${4 * u}" y="${c.p - 3 * u}" font-size="${11 * u}" fill="#2e8b3a" font-weight="700">${c.val} t</text>`;
    }
    st.pts.forEach(([a, b]) => (s += `<circle cx="${a}" cy="${b}" r="${1.6 * u}" fill="#c0392b"/>`));
    // values read, drawn back on the chart for checking
    const ax = axX(), ay = axY();
    if (ax && ay) for (const [R, W] of samples()) {
      const a = (R / st.kR - ax.a) / ax.b, b = (W / st.kSwl - ay.a) / ay.b;
      s += `<circle cx="${a}" cy="${b}" r="${4 * u}" fill="none" stroke="#173a5e" stroke-width="${1.6 * u}"/>`;
    }
  }
  ov.innerHTML = s;
}

function samples() {
  return sampleCurve(curveValues(), st.step || 1);
}

function extract() {
  if (st.mode === 'table') {
    const t = buildTable(tokens(st.items, st.frame));
    st.table = t;
    if (t.cols.length >= 2) Object.assign(st, guess(t.rows, t.cols.length));
  }
  overlay();
  side();
}

// ---------------------------------------------------------------- side panel
const unitSel = (key, label, opts) => {
  const s = el('select', { onchange: (e) => { st[key] = Number(e.target.value); overlay(); side(); } });
  opts.forEach(([v, t]) => s.append(el('option', { value: v, selected: st[key] === v }, t)));
  return el('label', { class: 'field' }, el('span', { class: 'lbl' }, label), s);
};

function side() {
  const box = document.getElementById('cr-side');
  if (!box || !st) return;
  box.innerHTML = '';
  const modeBtn = (m, t) => el('button', { class: `small ${st.mode === m ? 'active' : ''}`, onclick: () => { st.mode = m; st.tool = null; extract(); } }, t);
  box.append(el('div', { class: 'row', style: { gap: '4px' } }, modeBtn('curve', 'Curve (graph)'), modeBtn('table', 'Table'), modeBtn('ai', 'Ask Claude')));
  const hint = document.getElementById('cr-hint');
  if (st.mode === 'curve') curveSide(box, hint);
  else if (st.mode === 'table') tableSide(box, hint);
  else aiSide(box, hint);
  box.append(el('h3', {}, 'Import'),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Name of the column'), el('input', { type: 'text', value: st.colName, placeholder: 'e.g. Hs 1.5 m / boom 30 m', oninput: (e) => { st.colName = e.target.value; } })),
    (() => {
      const s = el('select', { onchange: (e) => { st.importMode = e.target.value; } });
      [['replace', 'Replace the load chart'], ['add', 'Add as new column(s)']].forEach(([v, t]) => s.append(el('option', { value: v, selected: st.importMode === v }, t)));
      return el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Import'), s);
    })(),
    el('p', { class: 'muted', style: { fontSize: '11.5px' } }, 'Check every value against the chart before using it.'));
}

function valuesTable(rows, heads) {
  return el('div', { class: 'tbl-wrap', style: { maxHeight: '32vh' } }, el('table', { class: 'data compact' },
    el('thead', {}, el('tr', {}, heads.map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v) => el('td', { class: 'num' }, v == null ? '—' : String(v))))))));
}

function curveSide(box, hint) {
  const ax = axX(), ay = axY();
  if (hint) hint.textContent = st.tool === 'trace' ? 'Click right on the line of the curve: it is followed to its ends.' : st.tool === 'point' ? 'Click points along the curve.' : /^[xy][12]$/.test(st.tool || '') ? `Click a ${st.tool[0] === 'x' ? 'vertical (radius)' : 'horizontal (SWL)'} graduation of the axis, then type its value.` : 'Drag a frame around the graph to limit the curve (optional).';
  const tool = (t, txt) => el('button', { class: `small ${st.tool === t ? 'active' : ''}`, onclick: () => { st.tool = t; side(); } }, txt);
  box.append(el('h3', {}, '1. Axes'));
  if (st.auto?.x && st.auto?.y) {
    const autoOn = st.axMode === 'auto';
    box.append(el('label', { class: 'check' }, el('input', { type: 'radio', name: 'axm', checked: autoOn, onchange: () => { st.axMode = 'auto'; overlay(); side(); } }), `Read from the axis labels (radius ${st.auto.x.lo}–${st.auto.x.hi}, SWL ${st.auto.y.lo}–${st.auto.y.hi})`),
      el('label', { class: 'check' }, el('input', { type: 'radio', name: 'axm', checked: !autoOn, onchange: () => { st.axMode = 'manual'; overlay(); side(); } }), 'Calibrate by hand'));
  } else box.append(el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Click two graduations on each axis and type their values (the farther apart, the better).'));
  if (st.axMode === 'manual') {
    const row = (key, label, unit) => el('div', { class: 'row', style: { gap: '6px', fontSize: '12px' } }, tool(key, label), el('span', {}, st.cal[key] ? `${st.cal[key].val} ${unit}` : '—'));
    box.append(row('x1', 'Radius 1', 'm'), row('x2', 'Radius 2', 'm'), row('y1', 'SWL 1', 't'), row('y2', 'SWL 2', 't'));
  }
  box.append(el('div', { class: `note ${ax && ay ? 'ok' : 'warn'}`, style: { fontSize: '12px' } }, ax && ay ? 'Axes calibrated: move the mouse on the graph to check the values.' : 'Axes not calibrated yet.'),
    unitSel('kR', 'Radius unit on the chart', [[1, 'm'], [0.3048, 'ft → m']]), unitSel('kSwl', 'Load unit on the chart', [[1, 't'], [0.001, 'kg → t'], [0.000453592, 'lbs → t']]));
  box.append(el('h3', {}, '2. Curve'),
    el('div', { class: 'row', style: { gap: '4px' } }, tool('trace', 'Click the curve (auto)'), tool('point', 'Add points by hand'), tool('frame', 'Frame the graph'),
      el('button', { class: 'small', onclick: () => { st.pts = []; overlay(); side(); } }, 'Clear')),
    el('div', { class: 'muted', style: { fontSize: '12px' } }, `${st.pts.length} point(s) on the curve. One curve at a time: import it, then trace the next one ("Add as new column").`));
  const rows = samples();
  box.append(el('h3', {}, '3. Values'),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Read every (m of radius)'), el('input', { type: 'number', min: 0.1, step: 'any', value: st.step, onchange: (e) => { st.step = Math.max(0.1, Number(e.target.value) || 1); overlay(); side(); } })),
    rows.length ? valuesTable(rows, ['Radius (m)', 'SWL (t)']) : el('div', { class: 'muted', style: { fontSize: '12px' } }, 'No values yet.'),
    rows.length ? el('div', { class: 'muted', style: { fontSize: '11.5px' } }, 'Circles = values read, drawn back on the graph. Values rounded down to 0.01 t.') : null);
}

function tableSide(box, hint) {
  if (hint) hint.textContent = 'Drag a frame around the table you need (one boom length / one mode), then pick the radius and SWL columns.';
  const t = st.table;
  if (!st.items.length) { box.append(el('div', { class: 'note warn' }, 'No text on this page (scan or image): use "Curve" for a graph, or "Ask Claude".')); return; }
  if (!t?.rows.length) { box.append(el('div', { class: 'note' }, 'No numeric table found here. Drag a frame around the table.')); return; }
  const n = t.cols.length;
  const colSel = (key, label) => {
    const s = el('select', { onchange: (e) => { st[key] = Number(e.target.value); side(); } });
    for (let i = 0; i < n; i++) s.append(el('option', { value: i, selected: st[key] === i }, `Column ${i + 1}  (${t.rows.map((r) => r[i]).filter((x) => x != null).slice(0, 3).join(' · ')}…)`));
    return el('label', { class: 'field' }, el('span', { class: 'lbl' }, label), s);
  };
  box.append(el('h3', {}, 'Columns'), colSel('rCol', 'Radius column'), colSel('sCol', 'SWL column'),
    unitSel('kR', 'Radius unit', [[1, 'm'], [0.3048, 'ft → m']]), unitSel('kSwl', 'SWL unit', [[1, 't'], [0.001, 'kg → t'], [0.000453592, 'lbs → t']]));
  const rows = tableRows();
  box.append(el('h3', {}, `${rows.length} values`), valuesTable(rows, ['Radius (m)', 'SWL (t)']));
}

function tableRows() {
  const t = st.table;
  if (!t) return [];
  return t.rows.map((r) => [r[st.rCol], r[st.sCol]]).filter(([a, b]) => a != null && b != null && a >= 0 && b > 0)
    .map(([a, b]) => [r2(a * st.kR), Math.round(b * st.kSwl * 1000) / 1000]).sort((a, b) => a[0] - b[0]);
}

function aiSide(box, hint) {
  if (hint) hint.textContent = 'Optional: drag a frame around the chart to send only that part.';
  let key = '';
  try { key = localStorage.getItem(LS_KEY) || ''; } catch { /* storage off */ }
  let model = DEFAULT_MODEL;
  try { model = localStorage.getItem(LS_MODEL) || DEFAULT_MODEL; } catch { /* storage off */ }
  box.append(el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Claude reads the chart (table or curves) and returns the values. The image is sent to Anthropic with your own API key, kept only in this browser (never in the project file).'),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Anthropic API key'), el('input', { type: 'password', value: key, placeholder: 'sk-ant-…', autocomplete: 'off', onchange: (e) => { try { localStorage.setItem(LS_KEY, e.target.value.trim()); } catch { /* storage off */ } } })),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Model'), el('input', { type: 'text', value: model, onchange: (e) => { try { localStorage.setItem(LS_MODEL, e.target.value.trim() || DEFAULT_MODEL); } catch { /* storage off */ } } })),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'For curves, read every (m)'), el('input', { type: 'number', min: 0.1, step: 'any', value: st.step, onchange: (e) => { st.step = Math.max(0.1, Number(e.target.value) || 1); } })),
    el('button', { class: 'primary small', disabled: st.aiBusy, onclick: askClaude }, st.aiBusy ? 'Reading…' : st.frame ? 'Read the framed part with Claude' : 'Read the page with Claude'));
  const a = st.ai;
  if (a?.error) box.append(el('div', { class: 'note fail', style: { fontSize: '12px' } }, a.error));
  if (a?.rows?.length) box.append(el('h3', {}, `${a.rows.length} rows × ${a.columns.length} column(s)`), valuesTable(a.rows, ['Radius (m)', ...a.columns.map((c) => `${c} (t)`)]));
}

export function parseClaudeChart(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No values in the answer');
  const j = JSON.parse(m[0]);
  if (j.error) throw new Error(j.error);
  const kR = /ft|feet/i.test(j.radius_unit || '') ? 0.3048 : 1;
  const kW = /lb/i.test(j.load_unit || '') ? 0.000453592 : /kg/i.test(j.load_unit || '') ? 0.001 : 1;
  const cols = (j.columns || []).map(String);
  const rows = (j.rows || []).filter((r) => Array.isArray(r) && isFinite(Number(r[0])))
    .map((r) => [r2(Number(r[0]) * kR), ...cols.map((_, i) => (r[i + 1] == null || r[i + 1] === '' || !isFinite(Number(r[i + 1])) ? null : Math.round(Number(r[i + 1]) * kW * 1000) / 1000))])
    .sort((a, b) => a[0] - b[0]);
  if (!cols.length || rows.length < 2) throw new Error('Not enough values in the answer');
  return { columns: cols, rows };
}

async function askClaude() {
  let key = '', model = DEFAULT_MODEL;
  try { key = localStorage.getItem(LS_KEY) || ''; model = localStorage.getItem(LS_MODEL) || DEFAULT_MODEL; } catch { /* storage off */ }
  if (!key) return toast('Enter your Anthropic API key first');
  const size = st.src.pageSize(st.page);
  const rect = st.frame || { x: 0, y: 0, w: size.w, h: size.h };
  st.aiBusy = true;
  st.ai = null;
  side();
  try {
    const { canvas } = await st.src.renderRegion(st.page, rect, 1600);
    const data = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const prompt = `This image is a crane load chart. Extract the safe working load (SWL) as a function of the working radius.
If it is a table, return every row. If it is a graph with curves, read each curve every ${st.step || 1} of radius over its whole range.
Answer with JSON only, no other text:
{"radius_unit": "m" or "ft", "load_unit": "t", "kg" or "lbs", "columns": ["name of each configuration / curve"], "rows": [[radius, swl_column_1, swl_column_2, ...], ...]}
Use null where a configuration has no value at that radius. Never invent a value; if the chart cannot be read, answer {"error": "why"}.`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }, { type: 'text', text: prompt }] }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    st.ai = parseClaudeChart(text);
  } catch (e) {
    st.ai = { error: `Claude could not read the chart: ${e.message}` };
  }
  st.aiBusy = false;
  side();
}

// ---------------------------------------------------------------- import
/** Writes columns into the crane chart (replace, or add as new columns on the union of the radii). */
export function mergeChart(old, names, rows, mode) {
  if (mode !== 'add' || !old?.columns?.length || !old?.rows?.length) return { columns: names, rows };
  const n = old.columns.length, m = names.length;
  const map = new Map(old.rows.map((r) => [Number(r[0]), [...r, ...new Array(m).fill(null)]]));
  for (const r of rows) {
    if (!map.has(r[0])) map.set(r[0], [r[0], ...new Array(n + m).fill(null)]);
    const row = map.get(r[0]);
    for (let j = 0; j < m; j++) row[n + 1 + j] = r[j + 1];
  }
  return { columns: [...old.columns, ...names], rows: [...map.values()].sort((a, b) => a[0] - b[0]) };
}

function doImport() {
  let names, rows;
  const nm = st.colName.trim();
  if (st.mode === 'ai') {
    if (!st.ai?.rows?.length) return alert('No values yet: ask Claude first.');
    names = st.ai.columns.map((c, i) => (nm ? (st.ai.columns.length > 1 ? `${nm} ${c}` : nm) : c || `Column ${i + 1}`));
    rows = st.ai.rows;
  } else {
    rows = st.mode === 'curve' ? samples() : tableRows();
    if (rows.length < 2) return alert(st.mode === 'curve' ? 'Not enough values: calibrate the axes and click the curve.' : 'Not enough values: frame the table and pick the columns.');
    names = [nm || (st.mode === 'curve' ? 'SWL (from the graph)' : 'SWL (from PDF)')];
  }
  const c = app.project.crane;
  const before = c.chart?.columns?.length || 0;
  c.chart = mergeChart(c.chart, names, rows, st.importMode);
  c.activeColumn = st.importMode === 'add' && before ? before : 0;
  const cb = st.onDone;
  const n = rows.length;
  close();
  app.recompute();
  toast(`${n} load chart values imported — check them in the table`);
  cb?.();
}
