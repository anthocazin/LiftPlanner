// Import d'un plan (PDF ou image), calibration d'échelle, pointage des points de levage / COG,
// mesure et détection de texte (poids, COG) dans le PDF.
import { app } from './app.js';
import { el, toast, fmt } from './dom.js';

let pdfjs = null;
let doc = null;
let img = null;
let zoom = 1.2;
let mode = 'none';
let tmp = [];
let pickTarget = 'new';
let hits = [];

async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  const url = window.__PDFJS_URL || new URL('../../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
  pdfjs = await import(url);
  // version autonome (file://) : worker embarqué en blob ; si le navigateur refuse le worker,
  // pdf.js bascule automatiquement sur le thread principal (un peu plus lent, même résultat).
  pdfjs.GlobalWorkerOptions.workerSrc = window.__PDFJS_WORKER_URL || new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

const D = () => app.project.drawing;
const VIEW_AXES = { top: ['x', 'y'], front: ['x', 'z'], side: ['y', 'z'] };
const VIEW_LABEL = { top: 'Vue de dessus (X / Y)', front: 'Vue de face (X / Z)', side: 'Vue de côté (Y / Z)' };

function toModel(u, v) {
  const d = D();
  if (!d?.scale || !d.origin) return null;
  const a = (u - d.origin.x) * d.scale * (d.flipX ? -1 : 1);
  const b = (d.origin.y - v) * d.scale;
  return [Math.round(a), Math.round(b)];
}
function toPage(a, b) {
  const d = D();
  if (!d?.scale || !d.origin) return null;
  return [d.origin.x + (a / d.scale) * (d.flipX ? -1 : 1), d.origin.y - b / d.scale];
}

let onPoints = null;

export function pdfPanel(opts = {}) {
  onPoints = opts.onPoints || null;
  const wrap = el('section', { class: 'panel', id: 'pdf-panel' });
  build(wrap);
  return wrap;
}

function build(wrap) {
  wrap.innerHTML = '';
  const d = D();
  const fileInput = el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: (e) => openFile(e.target.files?.[0]) });
  wrap.append(
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'Plan de la pièce (PDF / image)'),
      el('div', { class: 'row' }, el('label', { class: 'btn small' }, 'Importer…', fileInput), app.drawingFile ? el('button', { class: 'small danger', onclick: closeFile }, 'Fermer') : null),
    ),
  );
  if (!app.drawingFile) {
    const dz = el(
      'div',
      { class: 'dropzone' },
      el('div', {}, 'Déposez ici le plan de la pièce (PDF, PNG, JPG)'),
      el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'Calibrez l\'échelle avec une cote connue, placez l\'origine, puis cliquez les padeyes et le COG : les coordonnées sont reportées dans le tableau.'),
      d?.fileName ? el('div', { class: 'note warn', style: { marginTop: '8px' } }, `Calibration enregistrée pour « ${d.fileName} » : ré-importez le fichier pour l\'afficher.`) : null,
    );
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); openFile(e.dataTransfer.files?.[0]); });
    wrap.append(dz);
    return;
  }

  const pts = app.project.load.liftPoints;
  const sel = (opts, val, onchange) => {
    const s = el('select', { onchange: (e) => onchange(e.target.value) });
    opts.forEach(([v, t]) => s.append(el('option', { value: v, selected: v === val }, t)));
    return s;
  };
  const modeBtn = (m, txt, title) => el('button', { class: `small ${mode === m || (m === 'cal' && mode.startsWith('cal')) || (m === 'measure' && mode.startsWith('measure')) ? 'active' : ''}`, title, onclick: () => setMode(m) }, txt);
  wrap.append(
    el(
      'div',
      { class: 'toolbar' },
      doc ? el('span', {}, 'Page ', sel([...Array(doc.numPages)].map((_, i) => [String(i + 1), String(i + 1)]), String(d.page || 1), (v) => { D().page = Number(v); renderPage(); })) : null,
      el('span', {}, 'Vue ', sel(Object.entries(VIEW_LABEL), d.view || 'top', (v) => { D().view = v; app.recompute(); drawOverlay(); })),
      el('button', { class: 'small', onclick: () => { zoom = Math.max(0.3, zoom / 1.25); renderPage(); } }, '−'),
      el('button', { class: 'small', onclick: () => { zoom = Math.min(6, zoom * 1.25); renderPage(); } }, '+'),
      el('label', { class: 'check', style: { fontSize: '12px' } }, el('input', { type: 'checkbox', checked: !!d.flipX, onchange: (e) => { D().flipX = e.target.checked; drawOverlay(); } }), 'Inverser horizontal'),
    ),
    el(
      'div',
      { class: 'toolbar' },
      modeBtn('cal', '1. Calibrer', 'Cliquez deux points d\'une cote connue puis saisissez la distance réelle'),
      modeBtn('origin', '2. Origine', 'Cliquez l\'origine du repère pièce (0,0) dans cette vue'),
      modeBtn('pick', '3. Padeye', 'Cliquez la position d\'un point de levage'),
      sel([['new', '→ nouveau point'], ...pts.map((p) => [p.id, `→ point ${p.id}`])], pickTarget, (v) => (pickTarget = v)),
      modeBtn('cog', '4. COG', 'Cliquez la position du centre de gravité'),
      modeBtn('measure', 'Mesurer', 'Mesure entre deux points'),
      el('span', { class: 'muted', id: 'pdf-status', style: { fontSize: '12px' } }, status()),
    ),
  );
  const viewer = el('div', { class: `viewer ${mode !== 'none' ? 'mode-pick' : ''}`, id: 'pdf-viewer' });
  const canvas = el('canvas', { id: 'pdf-canvas' });
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('class', 'overlay');
  overlay.id = 'pdf-overlay';
  viewer.append(canvas, overlay);
  canvas.addEventListener('click', onClick);
  wrap.append(viewer);
  wrap.append(el('div', { id: 'pdf-hits' }));
  renderPage();
}

function status() {
  const d = D();
  if (!d) return '';
  const parts = [];
  parts.push(d.scale ? `Échelle : 1 unité = ${fmt(d.scale, 3)} mm` : 'Échelle non calibrée');
  parts.push(d.origin ? 'origine définie' : 'origine non définie');
  if (mode === 'cal1') parts.push('→ cliquez le 1er point de la cote');
  if (mode === 'cal2') parts.push('→ cliquez le 2e point');
  if (mode === 'origin') parts.push('→ cliquez l\'origine');
  if (mode === 'pick') parts.push('→ cliquez un padeye');
  if (mode === 'cog') parts.push('→ cliquez le COG');
  if (mode.startsWith('measure')) parts.push('→ cliquez deux points');
  return parts.join(' · ');
}

function setMode(m) {
  tmp = [];
  if (m === 'cal') mode = 'cal1';
  else if (m === 'measure') mode = 'measure1';
  else mode = mode === m ? 'none' : m;
  build(document.getElementById('pdf-panel'));
}

async function openFile(file) {
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'image';
  const prev = D();
  const same = prev && prev.fileName === file.name;
  app.drawingFile = { kind, name: file.name, bytes, type: file.type };
  app.project.drawing = same ? prev : { fileName: file.name, kind, page: 1, view: 'top', scale: null, origin: null, flipX: false };
  await loadDoc();
  mode = same && prev.scale ? 'none' : 'cal1';
  build(document.getElementById('pdf-panel'));
  toast(same ? 'Plan rechargé avec sa calibration' : 'Plan importé — commencez par calibrer l\'échelle');
}

function closeFile() {
  app.drawingFile = null;
  doc = null;
  img = null;
  build(document.getElementById('pdf-panel'));
}

async function loadDoc() {
  const f = app.drawingFile;
  doc = null;
  img = null;
  if (!f) return;
  if (f.kind === 'pdf') {
    try {
      const lib = await loadPdfJs();
      doc = await lib.getDocument({ data: f.bytes.slice() }).promise;
      await findText();
    } catch (e) {
      console.error(e);
      toast(`PDF illisible : ${e.message}`);
    }
  } else {
    img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(new Blob([f.bytes], { type: f.type || 'image/png' }));
    });
  }
}

async function renderPage() {
  const canvas = document.getElementById('pdf-canvas');
  if (!canvas) return;
  if (!doc && !img && app.drawingFile) await loadDoc();
  const ctx = canvas.getContext('2d');
  if (doc) {
    const page = await doc.getPage(D().page || 1);
    const vp = page.getViewport({ scale: zoom });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  } else if (img) {
    canvas.width = img.width * zoom;
    canvas.height = img.height * zoom;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  drawOverlay();
  renderHits();
}

function svgEl(tag, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function drawOverlay() {
  const ov = document.getElementById('pdf-overlay');
  const canvas = document.getElementById('pdf-canvas');
  if (!ov || !canvas) return;
  ov.setAttribute('width', canvas.width);
  ov.setAttribute('height', canvas.height);
  ov.innerHTML = '';
  const d = D();
  const Z = (p) => [p[0] * zoom, p[1] * zoom];
  const mark = (p, color, txt, shape = 'cross') => {
    const [x, y] = Z(p);
    if (shape === 'cross') {
      ov.append(svgEl('line', { x1: x - 8, y1: y, x2: x + 8, y2: y, stroke: color, 'stroke-width': 2 }));
      ov.append(svgEl('line', { x1: x, y1: y - 8, x2: x, y2: y + 8, stroke: color, 'stroke-width': 2 }));
    } else ov.append(svgEl('circle', { cx: x, cy: y, r: 6, fill: 'none', stroke: color, 'stroke-width': 2.5 }));
    if (txt) {
      const t = svgEl('text', { x: x + 9, y: y - 7, fill: color, 'font-size': 13, 'font-weight': 700, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' });
      t.textContent = txt;
      ov.append(t);
    }
  };
  if (d?.cal?.p1) mark([d.cal.p1.x, d.cal.p1.y], '#2a5db0', '');
  if (d?.cal?.p2) {
    mark([d.cal.p2.x, d.cal.p2.y], '#2a5db0', `${d.cal.dist_mm} mm`);
    const [a, b] = [Z([d.cal.p1.x, d.cal.p1.y]), Z([d.cal.p2.x, d.cal.p2.y])];
    ov.append(svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#2a5db0', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
  }
  tmp.forEach((p) => mark(p, '#e8822a', ''));
  if (d?.origin) {
    const [x, y] = Z([d.origin.x, d.origin.y]);
    const sx = d.flipX ? -1 : 1;
    ov.append(svgEl('line', { x1: x, y1: y, x2: x + 40 * sx, y2: y, stroke: '#c0392b', 'stroke-width': 2.5 }));
    ov.append(svgEl('line', { x1: x, y1: y, x2: x, y2: y - 40, stroke: '#1f8f4e', 'stroke-width': 2.5 }));
    const [ax, bx] = VIEW_AXES[d.view || 'top'];
    const t1 = svgEl('text', { x: x + 44 * sx, y: y + 4, fill: '#c0392b', 'font-size': 12, 'font-weight': 700 });
    t1.textContent = ax.toUpperCase();
    const t2 = svgEl('text', { x: x - 4, y: y - 44, fill: '#1f8f4e', 'font-size': 12, 'font-weight': 700 });
    t2.textContent = bx.toUpperCase();
    ov.append(t1, t2);
    // points existants projetés dans la vue
    const [ka, kb] = VIEW_AXES[d.view || 'top'];
    for (const p of app.project.load.liftPoints) {
      const pg = toPage(Number(p[ka]) || 0, Number(p[kb]) || 0);
      if (pg) mark(pg, '#c0392b', p.id, 'circle');
    }
    const c = app.project.load.cog_mm;
    const pg = toPage(Number(c[ka]) || 0, Number(c[kb]) || 0);
    if (pg) mark(pg, '#111', 'COG', 'circle');
  }
  if (mode === 'measure2' && tmp.length === 2) {
    const [a, b] = [Z(tmp[0]), Z(tmp[1])];
    ov.append(svgEl('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#e8822a', 'stroke-width': 2 }));
  }
}

function onClick(e) {
  const canvas = e.currentTarget;
  const r = canvas.getBoundingClientRect();
  const u = ((e.clientX - r.left) * (canvas.width / r.width)) / zoom;
  const v = ((e.clientY - r.top) * (canvas.height / r.height)) / zoom;
  const d = D();
  if (mode === 'cal1') {
    d.cal = { p1: { x: u, y: v } };
    mode = 'cal2';
  } else if (mode === 'cal2') {
    const dist = Number(String(prompt('Distance réelle entre les deux points (mm) :', d.cal?.dist_mm || '1000') || '').replace(',', '.'));
    if (dist > 0) {
      d.cal = { ...d.cal, p2: { x: u, y: v }, dist_mm: dist };
      const px = Math.hypot(u - d.cal.p1.x, v - d.cal.p1.y);
      d.scale = dist / px;
      mode = d.origin ? 'none' : 'origin';
      toast(`Échelle : 1 unité = ${fmt(d.scale, 3)} mm`);
    } else mode = 'cal1';
  } else if (mode === 'origin') {
    d.origin = { x: u, y: v };
    mode = 'pick';
    toast('Origine définie');
  } else if (mode === 'pick' || mode === 'cog') {
    const m = toModel(u, v);
    if (!m) {
      toast('Calibrez l\'échelle et définissez l\'origine d\'abord');
      return;
    }
    const [ka, kb] = VIEW_AXES[d.view || 'top'];
    if (mode === 'cog') {
      app.set(`load.cog_mm.${ka}`, m[0], { silent: true });
      app.set(`load.cog_mm.${kb}`, m[1], { silent: true });
      toast(`COG : ${ka.toUpperCase()} = ${m[0]} · ${kb.toUpperCase()} = ${m[1]} mm`);
      mode = 'none';
    } else {
      const list = app.project.load.liftPoints;
      let p = list.find((x) => x.id === pickTarget);
      if (!p) {
        const used = new Set(list.map((x) => x.id));
        const id = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) => !used.has(c)) || `P${list.length + 1}`;
        const tpl = list[list.length - 1] || {};
        p = { id, x: 0, y: 0, z: tpl.z ?? app.project.load.dims_mm.H ?? 0, swl_t: tpl.swl_t ?? null, holeDia_mm: tpl.holeDia_mm ?? null, thk_mm: tpl.thk_mm ?? null, radius_mm: tpl.radius_mm ?? null, azimuth_deg: null, used: true };
        list.push(p);
      }
      p[ka] = m[0];
      p[kb] = m[1];
      toast(`Point ${p.id} : ${ka.toUpperCase()} = ${m[0]} · ${kb.toUpperCase()} = ${m[1]} mm`);
      pickTarget = 'new';
    }
    app.recompute();
    onPoints?.();
  } else if (mode === 'measure1') {
    tmp = [[u, v]];
    mode = 'measure2';
  } else if (mode === 'measure2') {
    tmp.push([u, v]);
    const px = Math.hypot(tmp[1][0] - tmp[0][0], tmp[1][1] - tmp[0][1]);
    toast(d.scale ? `Distance : ${fmt(px * d.scale, 0)} mm` : 'Calibrez l\'échelle pour mesurer');
    drawOverlay();
    mode = 'measure1';
    setTimeout(() => { tmp = []; drawOverlay(); }, 2500);
    return;
  }
  if (mode !== 'measure2') tmp = [];
  build(document.getElementById('pdf-panel'));
}

// ---------------- détection de texte (poids, COG) ----------------
async function findText() {
  hits = [];
  if (!doc) return;
  const re = /(poids|masse|weight|mass|c\.?o\.?g|cdg|centre de gravit|center of gravity|centre of gravity)/i;
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = new Map();
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      const key = [...lines.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      lines.set(key, `${lines.get(key) || ''} ${it.str}`.trim());
    }
    for (const t of lines.values()) if (re.test(t) || /\d[\d\s.,]*\s?(kg|t|tonnes?)\b/i.test(t)) hits.push({ page: p, text: t.slice(0, 160) });
  }
}

function parseWeight(t) {
  const m = t.match(/(\d[\d\s]*[.,]?\d*)\s*(kg|t|tonnes?|tons?)\b/i);
  if (!m) return null;
  const v = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(v)) return null;
  return /kg/i.test(m[2]) ? v / 1000 : v;
}

function renderHits() {
  const box = document.getElementById('pdf-hits');
  if (!box) return;
  box.innerHTML = '';
  if (!hits.length) return;
  box.append(el('h3', {}, 'Texte détecté dans le plan'));
  const list = el('div', { class: 'hits' });
  hits.slice(0, 60).forEach((h) => {
    const w = parseWeight(h.text);
    list.append(
      el(
        'div',
        {
          title: w ? `Cliquer pour appliquer ${fmt(w, 3)} t comme poids net` : '',
          onclick: () => {
            if (w && confirm(`Appliquer ${fmt(w, 3)} t comme poids net de la charge ?`)) {
              app.set('load.weight_t', Math.round(w * 1000) / 1000);
              app.recompute();
              window.__rerender();
            }
          },
        },
        el('span', { class: 'muted' }, `p.${h.page} `),
        h.text,
        w ? el('b', { style: { color: 'var(--accent-2)' } }, `  → ${fmt(w, 3)} t`) : null,
      ),
    );
  });
  box.append(list);
}
