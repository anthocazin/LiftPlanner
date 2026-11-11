// Load chart reader: extracts a radius / SWL table from the text layer of a PDF load chart.
// The user frames the table, picks the radius column and the SWL column, checks the values.
import { app } from './app.js';
import { el, toast } from './dom.js';
import { openSource } from './pdfutil.js';

const NS = 'http://www.w3.org/2000/svg';
let st = null;

const NUM_RE = /^-?\d+(?:[.,]\d+)?$/;
const toNum = (t) => Number(String(t).replace(',', '.'));

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

export async function openChartReader(file, onDone) {
  let src;
  try { src = await openSource(file); } catch (e) { alert(`Cannot open the file: ${e.message}`); return; }
  if (src.kind !== 'pdf') { alert('The load chart reader needs a PDF with text (not a scan or an image).'); return; }
  st = { src, page: 1, frame: null, drag: null, items: [], table: null, rCol: 0, sCol: 1, kSwl: 1, kR: 1, onDone, mode: 'replace', colName: '' };
  build();
  await loadPage();
}

function close() { document.getElementById('chartreader')?.remove(); st = null; }

function build() {
  document.getElementById('chartreader')?.remove();
  const pageSel = el('select', { onchange: async (e) => { st.page = Number(e.target.value); st.frame = null; await loadPage(); } });
  for (let i = 1; i <= st.src.pages; i++) pageSel.append(el('option', { value: i }, `Page ${i}`));
  document.body.append(el('div', { id: 'chartreader', class: 'modal' }, el('div', { class: 'modal-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Read a load chart from a PDF'), el('span', { class: 'muted' }, st.src.name), pageSel, el('span', { class: 'spacer' }),
      el('button', { class: 'small', onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: doImport }, 'Use these values')),
    el('div', { class: 'modal-body' },
      el('div', { class: 'wz-side', id: 'cr-side' }),
      el('div', { class: 'wz-main' }, el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, 'Drag a frame around the table of the chart you need (one boom length / one mode), then pick the radius and SWL columns on the left.'), el('div', { class: 'wz-canvas', id: 'cr-canvas' }))),
  )));
}

async function loadPage() {
  st.items = await st.src.text(st.page);
  await renderPage();
  extract();
}

async function renderPage() {
  const box = document.getElementById('cr-canvas');
  const size = st.src.pageSize(st.page);
  const k = ((box.clientWidth || 800) - 20) / size.w;
  st.k = k;
  const c = await st.src.render(st.page, k * (window.devicePixelRatio || 1));
  c.style.width = `${size.w * k}px`;
  c.style.height = `${size.h * k}px`;
  const ov = document.createElementNS(NS, 'svg');
  ov.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  ov.setAttribute('class', 'pv-overlay');
  ov.style.width = c.style.width;
  ov.style.height = c.style.height;
  box.innerHTML = '';
  box.append(el('div', { class: 'pv-page' }, c, ov));
  const pt = (ev) => { const r = ov.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * size.w, ((ev.clientY - r.top) / r.height) * size.h]; };
  ov.addEventListener('pointerdown', (ev) => { const [u, v] = pt(ev); st.drag = { u0: u, v0: v, u1: u, v1: v }; ov.setPointerCapture(ev.pointerId); });
  ov.addEventListener('pointermove', (ev) => { if (!st.drag) return; const [u, v] = pt(ev); st.drag.u1 = u; st.drag.v1 = v; overlay(); });
  ov.addEventListener('pointerup', () => {
    if (!st.drag) return;
    const d = st.drag;
    st.drag = null;
    const f = { x: Math.min(d.u0, d.u1), y: Math.min(d.v0, d.v1), w: Math.abs(d.u1 - d.u0), h: Math.abs(d.v1 - d.v0) };
    st.frame = f.w > 5 && f.h > 5 ? f : null;
    extract();
  });
  overlay();
}

function overlay() {
  const ov = document.querySelector('#chartreader .pv-overlay');
  if (!ov) return;
  const u = 1 / st.k;
  const f = st.drag ? { x: Math.min(st.drag.u0, st.drag.u1), y: Math.min(st.drag.v0, st.drag.v1), w: Math.abs(st.drag.u1 - st.drag.u0), h: Math.abs(st.drag.v1 - st.drag.v0) } : st.frame;
  ov.innerHTML = f ? `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="rgba(232,130,42,.1)" stroke="#e8822a" stroke-width="${2 * u}"/>` : '';
}

function extract() {
  const t = buildTable(tokens(st.items, st.frame));
  st.table = t;
  const n = t.cols.length;
  if (n >= 2) Object.assign(st, guess(t.rows, n));
  overlay();
  side();
}

function side() {
  const box = document.getElementById('cr-side');
  if (!box) return;
  box.innerHTML = '';
  const t = st.table;
  if (!st.items.length) { box.append(el('div', { class: 'note warn' }, 'No text on this page: the chart is probably a scan or an image — type the values instead.')); return; }
  if (!t?.rows.length) { box.append(el('div', { class: 'note' }, 'No numeric table found here. Drag a frame around the table.')); return; }
  const n = t.cols.length;
  const colSel = (key, label) => {
    const s = el('select', { onchange: (e) => { st[key] = Number(e.target.value); side(); } });
    for (let i = 0; i < n; i++) s.append(el('option', { value: i, selected: st[key] === i }, `Column ${i + 1}  (${t.rows.map((r) => r[i]).filter((x) => x != null).slice(0, 3).join(' · ')}…)`));
    return el('label', { class: 'field' }, el('span', { class: 'lbl' }, label), s);
  };
  const unit = (key, label, opts) => {
    const s = el('select', { onchange: (e) => { st[key] = Number(e.target.value); side(); } });
    opts.forEach(([v, t2]) => s.append(el('option', { value: v, selected: st[key] === v }, t2)));
    return el('label', { class: 'field' }, el('span', { class: 'lbl' }, label), s);
  };
  const modeSel = el('select', { onchange: (e) => { st.mode = e.target.value; } });
  [['replace', 'Replace the load chart (SWL column only)'], ['add', 'Add the SWL column to the chart'], ['all', 'Replace with every column (one per boom / mode)']].forEach(([v, t2]) => modeSel.append(el('option', { value: v, selected: st.mode === v }, t2)));
  box.append(el('h3', {}, 'Columns'), colSel('rCol', 'Radius column'), colSel('sCol', 'SWL column'),
    unit('kR', 'Radius unit', [[1, 'm'], [0.3048, 'ft → m']]), unit('kSwl', 'SWL unit', [[1, 't'], [0.001, 'kg → t'], [0.000453592, 'lbs → t']]),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Name of the column'), el('input', { type: 'text', value: st.colName, placeholder: 'e.g. Boom 30 m – offshore', oninput: (e) => { st.colName = e.target.value; } })),
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Import'), modeSel));
  const rows = pairs();
  box.append(el('h3', {}, `${rows.length} values`), el('div', { class: 'tbl-wrap', style: { maxHeight: '45vh' } }, el('table', { class: 'data compact' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Radius (m)'), el('th', {}, 'SWL (t)'))),
    el('tbody', {}, rows.map(([r, w]) => el('tr', {}, el('td', { class: 'num' }, String(r)), el('td', { class: 'num' }, String(w))))))));
  box.append(el('p', { class: 'muted', style: { fontSize: '11.5px' } }, 'Check every value against the chart before using it. Rows with a missing value are skipped.'));
}

function pairs() {
  const t = st.table;
  if (!t) return [];
  return t.rows.map((r) => [r[st.rCol], r[st.sCol]]).filter(([a, b]) => a != null && b != null && a >= 0 && b > 0)
    .map(([a, b]) => [Math.round(a * st.kR * 100) / 100, Math.round(b * st.kSwl * 1000) / 1000]).sort((a, b) => a[0] - b[0]);
}

function doImport() {
  if (st.mode === 'all') return importAll();
  const rows = pairs();
  if (rows.length < 2) { alert('Not enough values: frame the table and pick the columns.'); return; }
  const c = app.project.crane;
  const name = st.colName.trim() || 'SWL (from PDF)';
  const old = c.chart || { columns: [], rows: [] };
  if (st.mode === 'add' && old.columns.length && old.rows.length) {
    // union of the radii; missing values stay empty (skipped by the checks)
    const n = old.columns.length;
    const map = new Map(old.rows.map((r) => [Number(r[0]), [...r, null]]));
    for (const [r, w] of rows) {
      if (!map.has(r)) map.set(r, [r, ...new Array(n).fill(null), null]);
      map.get(r)[n + 1] = w;
    }
    c.chart = { columns: [...old.columns, name], rows: [...map.values()].sort((a, b) => a[0] - b[0]) };
    c.activeColumn = n;
  } else {
    c.chart = { columns: [name], rows };
    c.activeColumn = 0;
  }
  const cb = st.onDone;
  close();
  app.recompute();
  toast(`${rows.length} load chart values imported`);
  cb?.();
}
function importAll() {
  const t = st.table;
  const idx = t ? t.cols.map((_, i) => i).filter((i) => i !== st.rCol) : [];
  const rows = (t?.rows || []).filter((r) => r[st.rCol] != null && idx.some((i) => r[i] != null))
    .map((r) => [Math.round(r[st.rCol] * st.kR * 100) / 100, ...idx.map((i) => (r[i] == null ? null : Math.round(r[i] * st.kSwl * 1000) / 1000))])
    .sort((a, b) => a[0] - b[0]);
  if (rows.length < 2 || !idx.length) { alert('Not enough values: frame the table and pick the radius column.'); return; }
  const base = st.colName.trim();
  const c = app.project.crane;
  c.chart = { columns: idx.map((i, k) => (base ? `${base} ${k + 1}` : `Column ${i + 1}`)), rows };
  c.activeColumn = Math.max(0, idx.indexOf(st.sCol));
  const cb = st.onDone;
  close();
  app.recompute();
  toast(`${rows.length} rows × ${idx.length} columns imported — rename the columns in the table`);
  cb?.();
}

