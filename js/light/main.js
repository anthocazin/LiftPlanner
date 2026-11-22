// LiftPlanner Light — a lift plan on site in 5 minutes: photos with the lift points (background
// removable), weight and crane, rigging (legs and their lengths), sketch on a grid, step by step and
// safety measures, checks and a short PDF.
import { el, fmt, toast } from '../ui/dom.js';
import { listByType, listSlingFamily, listChainFamily, niceName } from '../catalog/index.js';
import { isLengthPart } from '../engine/rigging.js';
import { schematicSvg } from '../draw/schematic.js';
import { openSignPad } from '../ui/signpad.js';
import { brandLogo, setBrandLogo, shrinkLogo } from '../ui/brand.js';
import { openCutout } from './cutout.js';
import { newState, compute, legIds, checkKey, PALETTE, HEADS, ANGLE, BOARD, SAFETY_MEASURES, DEFAULT_STEPS, DEFAULT_SAFETY } from './model.js';

/** Length given for a leg: the sling / chain, or the leg (lift point → hook). */
const givenLen = (id) => num((st.lenMode === 'sling' ? st.slings : st.lengths)?.[id]);

const LS = 'liftplanner.light.v1';
const STEPS = [['photos', '1 Photos'], ['load', '2 Load & crane'], ['rigging', '3 Rigging'], ['sketch', '4 Sketch'], ['safety', '5 Steps & safety'], ['plan', '6 Plan']];
const VIEWS = ['Side view', 'Front view', 'Top view', 'Isometric view'];
const num = (v) => (v === '' || v == null || !isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
const safeImg = (u) => (typeof u === 'string' && /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(u) ? u : null);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let st = load();
let step = STEPS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'photos';
let cur = st.photos[0]?.id || null; // photo being edited
let activePt = 1;
let out = compute(st);
let saveTimer = null;
let uid = 0;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || 'null');
    if (s && s.v === 1) return fixState(s);
  } catch { /* new */ }
  return newState();
}
function fixState(s) {
  const n = newState();
  const steps = (Array.isArray(s.steps) ? s.steps : n.steps).map((x) => (typeof x === 'string' ? { note: x, resp: '' } : { note: x?.note || '', resp: x?.resp || '' }));
  if (s.board && Array.isArray(s.photos)) { const ph = s.photos.find((p) => p.id === s.board.photo); if (ph && !ph.board) { const { photo, ...b } = s.board; ph.board = b; } delete s.board; }
  (s.photos || []).forEach((p) => { if (p.name === 'Other') p.name = 'Isometric view'; });
  const lenMode = s.lenMode || (Object.values(s.lengths || {}).some((v) => v > 0) ? 'leg' : 'sling');
  return { ...n, ...s, lenMode, slings: s.slings || {}, crane: { ...n.crane, ...(s.crane || {}) }, comms: { ...n.comms, ...(s.comms || {}) }, steps, safety: Array.isArray(s.safety) ? s.safety : n.safety, hidden: Array.isArray(s.hidden) ? s.hidden : [] };
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS, JSON.stringify(st)); } catch { toast('Storage full on this device: remove a photo, or save the file'); }
  }, 300);
}
/** State changed: recompute, save, refresh the status (and the page when asked). */
function changed(rerender = false) {
  out = compute(st);
  save();
  status();
  if (rerender) render();
}

// ------------------------------------------------------------------ layout
const root = document.getElementById('light');
function shell() {
  root.innerHTML = '';
  root.append(
    el('header', { class: 'lt-top no-print' },
      el('div', { class: 'lt-brand' }, el('b', {}, 'LiftPlanner'), el('span', {}, 'Light')),
      el('div', { id: 'lt-status' }),
      el('details', { class: 'lt-act', onclick: (e) => { if (e.target.closest('.lt-menu button, .lt-menu a')) e.currentTarget.open = false; } }, el('summary', { title: 'Menu' }, '☰'), el('div', { class: 'lt-menu' },
        el('button', { onclick: () => { if (confirm('Start a new lift plan? The current one is cleared from this device.')) { st = newState(); cur = null; activePt = 1; changed(); go('photos'); } } }, 'New'),
        el('button', { onclick: saveFile }, 'Save'),
        el('label', { class: 'btn' }, 'Open', el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: openFile })),
        el('a', { class: 'btn', href: '../', title: 'Full version (drawings, pad eyes, COG, report…)' }, 'Full version')))),
    el('nav', { class: 'lt-steps no-print', id: 'lt-steps' }),
    el('main', { id: 'lt-main', class: 'no-print' }),
    el('footer', { class: 'lt-foot no-print', id: 'lt-foot' }),
    el('div', { id: 'lt-print', class: 'print-only' }),
    el('div', { id: 'toast', class: 'toast no-print' }));
}
function go(k) { step = k; history.replaceState(null, '', `#${k}`); render(); window.scrollTo(0, 0); }
function status() {
  const s = document.getElementById('lt-status');
  if (!s) return;
  const t = { empty: ['Weight?', 'muted'], ok: ['All checks OK', 'ok'], warn: ['Warnings', 'warn'], fail: ['Not OK', 'fail'] }[out.status];
  s.innerHTML = '';
  s.append(el('button', { class: `lt-pill ${t[1]}`, onclick: () => go('plan') }, t[0], out.perLeg ? el('small', {}, ` · ${fmt(out.perLeg)} t / leg`) : null));
}
function render() {
  const nav = document.getElementById('lt-steps');
  nav.innerHTML = '';
  STEPS.forEach(([k, t]) => nav.append(el('button', { class: k === step ? 'on' : '', onclick: () => go(k) }, t)));
  const m = document.getElementById('lt-main');
  m.innerHTML = '';
  m.append(({ photos: stepPhotos, load: stepLoad, rigging: stepRigging, sketch: stepSketch, safety: stepSafety, plan: stepPlan })[step]());
  const i = STEPS.findIndex(([k]) => k === step);
  const f = document.getElementById('lt-foot');
  f.innerHTML = '';
  f.append(i > 0 ? el('button', { onclick: () => go(STEPS[i - 1][0]) }, '← Back') : el('span'),
    i < STEPS.length - 1 ? el('button', { class: 'primary', onclick: () => go(STEPS[i + 1][0]) }, 'Next →') : el('button', { class: 'primary', onclick: printPlan }, 'PDF / Print'));
  status();
}

// ------------------------------------------------------------------ drawing helpers
/** The photo as SVG, background removed when there is a mask. */
function photoSvg(ph, x, y, w, h, attrs = '') {
  const img = safeImg(ph.img);
  if (!img) return '';
  const m = safeImg(ph.mask);
  const id = `lm${++uid}`;
  return (m ? `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><image href="${m}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/></mask></defs>` : '')
    + `<image href="${img}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" ${m ? `mask="url(#${id})"` : ''} ${attrs}/>`;
}
const label = (x, y, t, c, fs, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${fs}" font-weight="800" text-anchor="${anchor}" font-family="Arial, sans-serif" fill="${c}" stroke="#fff" stroke-width="${fs * 0.22}" paint-order="stroke">${esc(t)}</text>`;
function pointMarks(ids, P, r, fs, live) {
  let s = '';
  ids.forEach((id, i) => {
    const a = P(i + 1);
    if (!a) return;
    s += `<circle cx="${a.x}" cy="${a.y}" r="${r}" fill="#d64541" stroke="#fff" stroke-width="${r * 0.25}" ${live ? `data-m="p:${i + 1}" class="lt-drag"` : ''}/>`;
    s += `<text x="${a.x}" y="${a.y + fs * 0.33}" font-size="${fs * 0.9}" font-weight="800" text-anchor="middle" font-family="Arial, sans-serif" fill="#fff" pointer-events="none">${esc(id)}</text>`;
  });
  return s;
}
/** Photo with its lift points (step 1, and the other photos of the PDF). */
function photoMarked(ph, live) {
  const m = Math.max(ph.w, ph.h);
  const r = m * 0.022, fs = m * 0.04;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ph.w} ${ph.h}" class="lt-psvg">${photoSvg(ph, 0, 0, ph.w, ph.h)}${pointMarks(legIds(st), (n) => (ph.points[n] ? { x: ph.points[n].u * ph.w, y: ph.points[n].v * ph.h } : null), r, fs, live)}</svg>`;
}
const svgPt = (svg, ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };

/** Interactive SVG: drag of the marks, tap elsewhere. */
function interactive(html, { onTap, onDrag, onEnd, cls = '' }) {
  const box = el('div', { class: `lt-ia ${cls}` });
  box.innerHTML = html();
  let drag = null;
  box.addEventListener('pointerdown', (ev) => {
    const svg = box.querySelector('svg');
    const m = ev.target.getAttribute?.('data-m');
    ev.preventDefault();
    const p = svgPt(svg, ev);
    drag = { m, p0: p, last: p, moved: false };
    box.setPointerCapture(ev.pointerId);
  });
  box.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const p = svgPt(box.querySelector('svg'), ev);
    if (!drag.moved && Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) < 6) return;
    drag.moved = true;
    if (drag.m && onDrag) { onDrag(drag.m, p, { dx: p.x - drag.last.x, dy: p.y - drag.last.y }); box.innerHTML = html(); }
    drag.last = p;
  });
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) onTap?.(d.p0, d.m);
    else onEnd?.();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  return box;
}

// ------------------------------------------------------------------ 1. photos
async function addPhotos(files) {
  for (const f of files) {
    const img = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = r.result; }; r.onerror = rej; r.readAsDataURL(f); });
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const ph = { id: Math.random().toString(36).slice(2, 8), name: VIEWS[Math.min(st.photos.length, 3)], img: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height, points: {}, mask: null };
    st.photos.push(ph);
    cur = ph.id;
  }
  if (!st.sketch && st.photos[0]) st.sketch = st.photos[0].id;
  activePt = 1;
  changed(true);
}

const thumbs = (selId, pick) => el('div', { class: 'lt-thumbs' }, st.photos.map((p) => el('button', { class: `lt-thumb ${p.id === selId ? 'on' : ''}`, onclick: () => pick(p) },
  el('span', { class: `lt-th ${p.mask ? 'cut' : ''}`, html: `<svg viewBox="0 0 ${p.w} ${p.h}" preserveAspectRatio="xMidYMid slice">${photoSvg(p, 0, 0, p.w, p.h)}</svg>` }), el('span', {}, p.name))));

function stepPhotos() {
  const ph = st.photos.find((p) => p.id === cur) || st.photos[0];
  if (ph) cur = ph.id;
  const n = legIds(st).length;
  const wrap = el('section', { class: 'lt-card' });
  wrap.append(
    el('h2', {}, 'Photos of the load and lift points'),
    el('div', { class: 'lt-row' },
      el('label', { class: 'btn primary big' }, '📷 Take a photo', el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => addPhotos([...e.target.files]) })),
      el('label', { class: 'btn big' }, '🖼 From the gallery', el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => addPhotos([...e.target.files]) }))),
    el('div', { class: 'lt-row lt-n' }, el('span', {}, 'Lift points'),
      el('button', { onclick: () => { st.nPoints = Math.max(1, n - 1); changed(true); } }, '−'), el('b', {}, String(n)),
      el('button', { onclick: () => { st.nPoints = Math.min(8, n + 1); changed(true); } }, '+')));
  if (!ph) { wrap.append(el('p', { class: 'muted' }, 'Take one or more photos (side, front, top…), then tap each lift point on them: A, B, C…')); return wrap; }
  wrap.append(thumbs(cur, (p) => { cur = p.id; render(); }));
  const chips = el('div', { class: 'lt-row lt-chips' }, el('span', {}, 'Tap point:'),
    legIds(st).map((_, i) => el('button', { class: `chip ${activePt === i + 1 ? 'on' : ''} ${ph.points[i + 1] ? 'set' : ''}`, onclick: () => { activePt = i + 1; render(); } }, legIds(st)[i])));
  const uv = (p) => ({ u: Math.min(1, Math.max(0, p.x / ph.w)), v: Math.min(1, Math.max(0, p.y / ph.h)) });
  const view = interactive(() => photoMarked(ph, true), {
    cls: `lt-photo ${ph.mask ? 'cut' : ''}`,
    onTap: (p, m) => { if (m) return; ph.points[activePt] = uv(p); activePt = Math.min(n, activePt + 1); changed(true); },
    onDrag: (m, p) => { if (m.startsWith('p:')) ph.points[Number(m.slice(2))] = uv(p); },
    onEnd: () => changed(true),
  });
  view.style.maxWidth = `min(100%, calc(64vh * ${(ph.w / ph.h).toFixed(4)}))`;
  wrap.append(chips, view,
    el('div', { class: 'lt-row' },
      el('button', { class: 'primary', onclick: () => openCutout(ph, (mask) => { ph.mask = mask; changed(true); }) }, ph.mask ? '✂ Edit the cut-out' : '✂ Remove the background'),
      ph.mask ? el('button', { onclick: () => { ph.mask = null; changed(true); } }, 'Put the background back') : null),
    el('div', { class: 'lt-row' },
      el('select', { onchange: (e) => { ph.name = e.target.value; changed(true); } }, VIEWS.map((v) => el('option', { value: v, selected: v === ph.name }, v))),
      el('button', { onclick: () => { delete ph.points[activePt]; changed(true); } }, `Clear point ${legIds(st)[activePt - 1] || ''}`),
      el('button', { class: 'danger', onclick: () => { if (!confirm('Remove this photo?')) return; st.photos = st.photos.filter((p) => p !== ph); if (st.sketch === ph.id) st.sketch = st.photos[0]?.id || null; cur = st.photos[0]?.id || null; changed(true); } }, 'Remove photo')),
    el('p', { class: 'muted small' }, 'Tap the photo to place the point selected (it then goes to the next one); drag a point to move it.'));
  return wrap;
}

// ------------------------------------------------------------------ 2. load and crane
const field = (label, value, set, attrs = {}) => el('label', { class: 'lt-f' }, el('span', {}, label),
  el('input', { type: attrs.type || 'number', value: value ?? '', placeholder: attrs.ph || '', onchange: (e) => { set(attrs.type === 'text' || attrs.type === 'date' ? e.target.value : num(e.target.value)); changed(attrs.rerender); } }),
  attrs.unit ? el('i', {}, attrs.unit) : null);

function stepLoad() {
  const c = st.crane;
  return el('div', {},
    el('section', { class: 'lt-card' }, el('h2', {}, 'Load'),
      field('Project', st.project, (v) => { st.project = v; }, { type: 'text', ph: 'e.g. Quay extension — phase 2' }),
      field('What is lifted', st.title, (v) => { st.title = v; }, { type: 'text', ph: 'e.g. Pump skid P-101' }),
      field('Where', st.location, (v) => { st.location = v; }, { type: 'text', ph: 'e.g. Quay 3' }),
      el('div', { class: 'lt-2' },
        field('Weight', st.weight_t, (v) => { st.weight_t = v; }, { unit: 't', rerender: true }),
        field('Factor', st.factor, (v) => { st.factor = v > 0 ? v : 1; }, { unit: '×', rerender: true })),
      el('p', { class: 'muted small' }, `Each leg: weight × factor ÷ ${legIds(st).length} legs ÷ cos ${ANGLE}°${out.perLeg ? ` = ${fmt(out.perLeg)} t` : ''}.`)),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Crane'),
      field('Crane', c.name, (v) => { c.name = v; }, { type: 'text', ph: 'e.g. Liebherr LTM 1100' }),
      el('div', { class: 'lt-2' },
        field('SWL at min. radius', c.swlMin_t, (v) => { c.swlMin_t = v; }, { unit: 't', rerender: true }),
        field('Min. radius', c.rMin_m, (v) => { c.rMin_m = v; }, { unit: 'm' })),
      el('div', { class: 'lt-2' },
        field('SWL at max. radius', c.swlMax_t, (v) => { c.swlMax_t = v; }, { unit: 't', rerender: true }),
        field('Max. radius', c.rMax_m, (v) => { c.rMax_m = v; }, { unit: 'm' })),
      el('p', { class: 'muted small' }, `Hook load (weight + rigging) × factor: ${out.hook ? `${fmt(out.hook)} t` : '—'} — checked against the SWL at the max. radius.`)));
}

// ------------------------------------------------------------------ 3. rigging
function itemsFor(part) {
  switch (part.kind) {
    case 'shackle': return listByType('shackle');
    case 'sling': return listSlingFamily(part.family || 'RS-PES');
    case 'chain': return listChainFamily(part.family || 'CH-G80');
    case 'connlink': return listByType('connlink');
    case 'masterlink': return listByType('masterlink').filter((m) => !m.sub);
    case 'hook': return listByType('hook');
    default: return [];
  }
}
const kindLabel = (p) => PALETTE.find((x) => x.kind === p.kind && (!x.family || x.family === p.family) && (!x.hitch || x.hitch === (p.hitch || 'direct')))?.label || p.kind;

function fanSvg() {
  if (!out.legs.length || !(Number(st.weight_t) > 0)) return '';
  try { return schematicSvg(out.project, out.res, { width: Math.max(560, legIds(st).length * 210), lite: true }).svg || ''; } catch { return ''; }
}

function stepRigging() {
  const ids = legIds(st);
  const leg0 = out.legs[0];
  const A = st.assembly;
  const list = el('div', { class: 'lt-asm' });
  // shown from the hook down to the lift point
  for (let i = A.length - 1; i >= 0; i--) {
    const p = A[i];
    const chosen = leg0?.parts?.[i]?.item;
    const sel = el('select', { onchange: (e) => { p.id = e.target.value; changed(true); } },
      el('option', { value: 'auto', selected: p.id === 'auto' }, `Auto${chosen && p.id === 'auto' ? ` — ${niceName(chosen)}` : ''}`),
      itemsFor(p).map((it) => el('option', { value: it.id, selected: p.id === it.id }, niceName(it))));
    list.append(el('div', { class: 'lt-part' },
      el('b', {}, kindLabel(p)), sel,
      el('div', { class: 'lt-part-b' },
        el('button', { title: 'Towards the hook', disabled: i === A.length - 1, onclick: () => { [A[i], A[i + 1]] = [A[i + 1], A[i]]; changed(true); } }, '↑'),
        el('button', { title: 'Towards the lift point', disabled: i === 0, onclick: () => { [A[i], A[i - 1]] = [A[i - 1], A[i]]; changed(true); } }, '↓'),
        el('button', { class: 'danger', onclick: () => { A.splice(i, 1); changed(true); } }, '✕'))));
  }
  const sl = st.lenMode === 'sling';
  const store = () => { if (sl) st.slings = st.slings || {}; else st.lengths = st.lengths || {}; return sl ? st.slings : st.lengths; };
  const lens = el('div', { class: 'lt-lens' }, ids.map((id, i) => {
    const l = out.legs.find((x) => x.pointId === id);
    const s = l?.parts?.[l.li];
    const what = s?.kind === 'chain' ? 'chain' : 'sling';
    return el('label', { class: 'lt-f' }, el('span', {}, `Leg ${id}`),
      el('input', { type: 'number', value: store()[id] ?? '', placeholder: 'm', onchange: (e) => { store()[id] = num(e.target.value); changed(true); } }), el('i', {}, 'm'),
      sl ? (l?.Leff && givenLen(id) ? el('small', { class: 'muted' }, `${s?.kind === 'chain' && s.links ? `${s.links} links · ` : ''}leg ${fmt(l.Leff, 2)} m (point → hook)`) : null)
        : s?.length_m ? el('small', { class: 'muted' }, `${what} ${fmt(s.length_m, 2)} m${s.kind === 'chain' && s.links ? ` (${s.links} links)` : ''}`) : null);
  }));
  const fan = fanSvg();
  return el('div', {},
    el('section', { class: 'lt-card' }, el('h2', {}, 'On the crane hook'),
      el('select', { class: 'wide', onchange: (e) => { st.head = e.target.value; changed(true); } }, Object.entries(HEADS).map(([k, t]) => el('option', { value: k, selected: st.head === k }, t))),
      out.rig?.head?.masterlink && st.head === 'masterlink' ? el('p', { class: 'muted small' }, `Proposed: ${niceName(out.rig.head.masterlink)}`) : null),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Each leg, from the hook down to the lift point'),
      list,
      el('div', { class: 'lt-row lt-add' }, el('span', {}, 'Add:'), PALETTE.map((x) => el('button', { onclick: () => { A.push({ kind: x.kind, family: x.family, hitch: x.hitch, id: 'auto' }); changed(true); } }, `+ ${x.label}`))),
      el('p', { class: 'muted small' }, `Auto = smallest size whose SWL holds ${out.legs[0] ? `${fmt(out.legs[0].Fdesign)} t` : 'the force of the leg'} (legs at ${ANGLE}°, same force in every leg).`)),
    el('section', { class: 'lt-card' }, el('h2', {}, sl ? 'Length of the sling of each leg' : 'Length of each leg (lift point → hook)'),
      el('div', { class: 'lt-seg' },
        el('button', { class: sl ? 'on' : '', onclick: () => { st.lenMode = 'sling'; changed(true); } }, 'Sling length'),
        el('button', { class: sl ? '' : 'on', onclick: () => { st.lenMode = 'leg'; changed(true); } }, 'Leg length')),
      lens,
      el('div', { class: 'lt-row' },
        el('button', { onclick: () => { const S = store(); const L = ids.map((id) => num(S[id])).find((v) => v > 0); if (!L) return toast('Type one length first'); ids.forEach((id) => { S[id] = L; }); changed(true); } }, 'Same length on every leg'),
        sl ? el('span', { class: 'muted small' }, 'The sling you use, eye to eye; the leg adds the shackles and links.')
          : el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: st.std !== false, onchange: (e) => { st.std = e.target.checked; changed(true); } }), ' Standard sling lengths (else made to measure)'))),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Rigging arrangement'),
      fan ? el('div', { class: 'lt-fan', html: fan }) : el('p', { class: 'muted' }, 'Give the weight (step 2) and the lengths of the legs.'),
      legend()));
}

/** What each leg is made of (identical legs grouped). */
function legend() {
  const groups = [];
  out.legs.forEach((l) => {
    const t = (l.parts || []).filter((x) => x.item).map((x) => niceName(x.item, isLengthPart(x) ? { length_m: x.length_m, links: x.kind === 'chain' ? x.links : null } : {})).join(' → ');
    const g = groups.find((x) => x.t === t);
    if (g) g.ids.push(l.pointId); else groups.push({ ids: [l.pointId], t });
  });
  const h = out.rig?.head;
  return el('div', { class: 'lt-legend' },
    groups.map((g) => el('div', {}, el('b', {}, `${g.ids.join(', ')}:`), ` ${g.t}`)),
    st.head !== 'hook' ? el('div', {}, el('b', {}, 'Hook:'), ` ${st.head === 'crane' ? 'master link of the crane' : h?.masterlink ? niceName(h.masterlink) : 'master link'}`) : null);
}

// ------------------------------------------------------------------ 4. sketch on a grid
/** Sketch of a photo: its own placement on the grid, hook and legs (each view independent). */
function boardFor(ph) {
  let b = ph.board;
  if (!b) {
    const a = ph.w / ph.h;
    const w = Math.min(760, 520 * a);
    b = { w, x: (BOARD.w - w) / 2, y: BOARD.h - w / a - 40, hook: null, tops: {} };
    ph.board = b;
  }
  b.tops = b.tops || {};
  return b;
}

/** The sketch: grid, photo (cut out or not), lift points, legs and hook, in board units. */
function boardSvg(ph, b, live) {
  const bh = (b.w * ph.h) / ph.w;
  const P = (n) => (ph.points[n] ? { x: b.x + ph.points[n].u * b.w, y: b.y + ph.points[n].v * bh } : null);
  const r = 18, fs = 30, sw = 6;
  const g = ++uid;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD.w} ${BOARD.h}" class="lt-board">`;
  s += `<defs><pattern id="g${g}a" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#e3e8ee" stroke-width="1.2"/></pattern><pattern id="g${g}b" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#g${g}a)"/><path d="M100 0H0V100" fill="none" stroke="#c4ced9" stroke-width="2"/></pattern></defs>`;
  s += `<rect width="${BOARD.w}" height="${BOARD.h}" fill="#fff"/><rect width="${BOARD.w}" height="${BOARD.h}" fill="url(#g${g}b)"/>`;
  s += photoSvg(ph, b.x, b.y, b.w, bh, live ? 'data-m="photo" class="lt-move"' : '');
  if (live) s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${bh}" fill="none" stroke="#9aa7b4" stroke-width="2" stroke-dasharray="8 6" pointer-events="none"/>`;
  const ids = legIds(st);
  if (b.hook) {
    const h = b.hook;
    b.labels = b.labels || {};
    let lines = '', badges = '', handles = '';
    ids.forEach((id, i) => {
      const a = P(i + 1);
      if (!a) return;
      const t = b.tops[id] || h;
      if (b.tops[id]) lines += `<line x1="${t.x}" y1="${t.y}" x2="${h.x}" y2="${h.y}" stroke="#1c2733" stroke-width="2.5" stroke-dasharray="10 8"/>`;
      lines += `<line x1="${a.x}" y1="${a.y}" x2="${t.x}" y2="${t.y}" stroke="#e8822a" stroke-width="${sw}" stroke-linecap="round"/>`;
      // name of the leg in a badge (letter, lift point number, length), movable; a leader line when moved
      const L = givenLen(id);
      const anchor = { x: a.x * 0.58 + t.x * 0.42, y: a.y * 0.58 + t.y * 0.42 };
      const pos = b.labels[id] || anchor;
      const txt = `${id}${L ? ` ${fmt(L, 2)} m` : ''}`;
      const bw = txt.length * 21 + 26;
      if (b.labels[id]) lines += `<line x1="${anchor.x}" y1="${anchor.y}" x2="${pos.x}" y2="${pos.y}" stroke="#b4561a" stroke-width="2.5"/><circle cx="${anchor.x}" cy="${anchor.y}" r="5" fill="#b4561a"/>`;
      badges += `<g><rect x="${pos.x - bw / 2}" y="${pos.y - 26}" width="${bw}" height="50" rx="10" fill="#fff" stroke="#e8822a" stroke-width="4" ${live ? `data-m="l:${id}" class="lt-move"` : ''}/><text x="${pos.x}" y="${pos.y + 13}" font-size="36" font-weight="800" text-anchor="middle" font-family="Arial, sans-serif" fill="#b4561a" pointer-events="none">${esc(txt)}</text></g>`;
      if (live) {
        const c = b.tops[id] ? t : { x: a.x * 0.3 + t.x * 0.7, y: a.y * 0.3 + t.y * 0.7 };
        handles += `<circle cx="${c.x}" cy="${c.y}" r="${r * 0.9}" fill="#fff" stroke="#e8822a" stroke-width="4" data-m="t:${id}" class="lt-drag"/>`;
      }
    });
    s += lines + handles + badges;
    s += `<path d="M${h.x} ${h.y - 70}V${h.y - 18}" stroke="#1c2733" stroke-width="4"/><circle cx="${h.x}" cy="${h.y}" r="${r * 1.3}" fill="#f2b705" stroke="#1c2733" stroke-width="3" ${live ? 'data-m="hook" class="lt-drag"' : ''}/>` + label(h.x + r * 2, h.y - r * 0.4, 'Hook', '#7a5a10', fs);
  }
  s += pointMarks(ids, P, r, fs, false);
  const vn = esc(ph.name || 'View');
  s += `<rect x="12" y="12" width="${vn.length * 23 + 36}" height="62" rx="8" fill="#0f2742"/><text x="30" y="56" font-size="38" font-weight="700" font-family="Arial, sans-serif" fill="#fff">${vn}</text>`;
  return `${s}</svg>`;
}

function stepSketch() {
  const wrap = el('section', { class: 'lt-card' }, el('h2', {}, 'Sketch on a grid'));
  if (!st.photos.length) { wrap.append(el('p', { class: 'muted' }, 'Add a photo first (step 1).')); return wrap; }
  const ph = st.photos.find((p) => p.id === st.sketch) || st.photos[0];
  st.sketch = ph.id;
  const b = boardFor(ph);
  const bh = () => (b.w * ph.h) / ph.w;
  const clamp = (p) => ({ x: Math.min(BOARD.w, Math.max(0, p.x)), y: Math.min(BOARD.h, Math.max(0, p.y)) });
  const view = interactive(() => boardSvg(ph, b, true), {
    cls: 'lt-boardbox',
    onTap: (p, m) => { if (!b.hook && (!m || m === 'photo')) { b.hook = clamp(p); changed(true); } },
    onDrag: (m, p, d) => {
      if (m === 'hook') b.hook = clamp(p);
      else if (m.startsWith('t:')) b.tops[m.slice(2)] = clamp(p);
      else if (m.startsWith('l:')) { b.labels = b.labels || {}; b.labels[m.slice(2)] = clamp(p); }
      else if (m === 'photo') { b.x += d.dx; b.y += d.dy; }
    },
    onEnd: () => changed(true),
  });
  const missing = legIds(st).filter((_, i) => !ph.points[i + 1]);
  wrap.append(
    thumbs(ph.id, (p) => { st.sketch = p.id; changed(true); }),
    el('p', { class: 'muted small' }, 'Each view has its own sketch: choose the photo above.'),
    el('p', { class: 'muted small' }, b.hook ? 'Drag the hook anywhere on the grid (above the photo too), drag the photo to move it, drag the round handle of a leg to lengthen or shorten it, drag the name of a leg to put it where it is clearly visible.' : 'Tap where the crane hook is — above the photo if needed: the legs are drawn from the lift points to it. Drag the photo to move it.'),
    view,
    el('div', { class: 'lt-row' },
      el('label', { class: 'lt-range' }, 'Photo size ', el('input', { type: 'range', min: '20', max: '100', value: String(Math.round((b.w / BOARD.w) * 100)), oninput: (e) => {
        const cx = b.x + b.w / 2, bottom = b.y + bh();
        b.w = (Number(e.target.value) / 100) * BOARD.w;
        b.x = cx - b.w / 2;
        b.y = bottom - bh();
        view.innerHTML = boardSvg(ph, b, true);
      }, onchange: () => changed() }))),
    missing.length ? el('p', { class: 'note warn small' }, `Points not placed on this photo: ${missing.join(', ')} — place them in step 1.`) : '',
    el('div', { class: 'lt-row' },
      el('button', { onclick: () => { const pts = legIds(st).map((_, i) => ph.points[i + 1]).filter(Boolean); if (!pts.length || !b.hook) return; b.hook.x = b.x + (pts.reduce((a, q) => a + q.u, 0) / pts.length) * b.w; changed(true); } }, 'Hook above the middle'),
      el('button', { onclick: () => { b.hook = null; b.tops = {}; changed(true); } }, 'Place the hook again'),
      el('button', { onclick: () => { b.tops = {}; changed(true); } }, 'Legs back to the hook'),
      el('button', { onclick: () => { b.labels = {}; changed(true); } }, 'Leg names back in place')),
    '');
  return wrap;
}

// ------------------------------------------------------------------ 5. step by step and safety
function stepSafety() {
  const S = st.steps;
  const list = el('ol', { class: 'lt-seq' }, S.map((t, i) => el('li', {},
    el('textarea', { rows: '3', placeholder: 'Details of the step', onchange: (e) => { t.note = e.target.value; changed(); } }, t.note),
    el('div', { class: 'lt-seq-b' },
      el('input', { type: 'text', value: t.resp || '', placeholder: 'Responsible', onchange: (e) => { t.resp = e.target.value; changed(); } }),
      el('button', { disabled: i === 0, onclick: () => { [S[i], S[i - 1]] = [S[i - 1], S[i]]; changed(true); } }, '↑'),
      el('button', { class: 'danger', onclick: () => { S.splice(i, 1); changed(true); } }, '✕')))));
  const all = [...SAFETY_MEASURES, ...st.safety.filter((x) => !SAFETY_MEASURES.includes(x))];
  const cm = st.comms;
  let custom = '';
  const tick = (k, t) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!cm[k], onchange: (e) => { cm[k] = e.target.checked; changed(); } }), ` ${t}`);
  return el('div', {},
    el('section', { class: 'lt-card' }, el('h2', {}, 'Step by step'), list,
      el('div', { class: 'lt-row' },
        el('button', { onclick: () => { S.push({ note: '', resp: '' }); changed(true); } }, '+ Step'),
        el('button', { onclick: () => { if (confirm('Back to the default steps?')) { st.steps = DEFAULT_STEPS.map((note) => ({ note, resp: '' })); changed(true); } } }, 'Default steps'))),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Communications'),
      el('div', { class: 'lt-2' },
        field('Primary', cm.primary, (v) => { cm.primary = v; }, { type: 'text', ph: 'e.g. Radio ch. 12' }),
        field('Secondary', cm.secondary, (v) => { cm.secondary = v; }, { type: 'text', ph: 'e.g. Hand signals' })),
      field('Other', cm.other, (v) => { cm.other = v; }, { type: 'text', ph: '—' }),
      el('div', { class: 'lt-row' }, tick('primaryChecked', 'Primary checked'), tick('secondaryChecked', 'Secondary checked'))),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Safety measures'),
      el('p', { class: 'muted small' }, 'Tap to tick the measures that apply to this lift.'),
      el('div', { class: 'lt-safety' }, all.map((m) => el('button', { class: `chip ${st.safety.includes(m) ? 'on' : ''}`, onclick: () => { st.safety = st.safety.includes(m) ? st.safety.filter((x) => x !== m) : [...st.safety, m]; changed(true); } }, `${st.safety.includes(m) ? '☑' : '☐'} ${m}`))),
      el('div', { class: 'lt-row' },
        el('input', { type: 'text', placeholder: 'Other measure…', oninput: (e) => { custom = e.target.value; } }),
        el('button', { onclick: () => { const v = custom.trim(); if (v && !st.safety.includes(v)) { st.safety.push(v); changed(true); } } }, '+ Add'),
        el('button', { onclick: () => { st.safety = [...DEFAULT_SAFETY]; changed(true); } }, 'Default'))));
}

// ------------------------------------------------------------------ 6. plan
const ICON = { ok: '✓', warn: '!', fail: '✕', info: 'i' };
function checkList(all = false) {
  const bad = out.checks.filter((c) => !c.hidden && c.status !== 'ok');
  const shown = all ? out.checks.filter((c) => !c.hidden) : bad;
  const hidden = out.checks.filter((c) => c.hidden);
  const hide = (list) => { st.hidden = [...new Set([...(st.hidden || []), ...list.map(checkKey)])]; changed(true); };
  const removable = bad.filter((c) => c.status !== 'fail');
  return el('div', { class: 'lt-checks' },
    !out.checks.length ? el('p', { class: 'muted' }, 'Give the weight and the lengths of the legs.') : null,
    shown.map((c) => el('div', { class: `lt-chk ${c.status}` }, el('b', {}, ICON[c.status] || '•'), el('span', {}, `${c.item}: ${c.label}${c.util != null ? ` — ${Math.round(c.util * 100)} %` : ''}`),
      !all && c.status !== 'fail' ? el('button', { class: 'lt-x', title: 'Remove this warning', onclick: () => hide([c]) }, '✕') : null)),
    !all && removable.length > 1 ? el('button', { class: 'lt-small', onclick: () => hide(removable) }, 'Remove all the warnings') : null,
    !all && !bad.some((c) => c.status === 'fail' || c.status === 'warn') && out.checks.length ? el('div', { class: 'lt-chk ok' }, el('b', {}, '✓'), el('span', {}, `All ${out.checks.filter((c) => !c.hidden).length} checks OK (SWL of every part, parts compatible, crane)`)) : null,
    !all && hidden.length ? el('p', { class: 'muted small' }, `${hidden.length} warning(s) removed. `, el('a', { href: '#', onclick: (e) => { e.preventDefault(); st.hidden = []; changed(true); } }, 'Show them again')) : null);
}

function stepPlan() {
  const sigImg = safeImg(st.signature);
  return el('div', {},
    el('section', { class: 'lt-card' }, el('h2', {}, 'Checks'), checkList(),
      el('p', { class: 'muted small' }, 'A warning can be removed with ✕ (it is then left out of the PDF); a check that is not OK cannot.'),
      el('details', {}, el('summary', {}, 'All the checks'), checkList(true))),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Equipment'), equipmentTable()),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Prepared by'),
      el('div', { class: 'lt-2' },
        field('Name', st.preparedBy, (v) => { st.preparedBy = v; }, { type: 'text', ph: 'Name' }),
        field('Date', st.date, (v) => { st.date = v; }, { type: 'date' })),
      el('div', { class: 'lt-sig' }, sigImg ? el('img', { src: sigImg, alt: '' }) : el('span', { class: 'muted' }, 'No signature')),
      signedTxt() ? el('p', { class: 'muted small' }, signedTxt()) : null,
      el('div', { class: 'lt-row' },
        el('button', { onclick: () => openSignPad('Prepared by', (u) => setSignature(u), st.preparedBy) }, '✎ Sign'),
        sigImg ? el('button', { class: 'danger', onclick: () => setSignature(null) }, 'Remove') : null)),
    logoCard());
}

/** Company logo, kept in this browser and put at the top left of the report. */
function logoCard() {
  const u = brandLogo();
  return el('section', { class: 'lt-card' }, el('h2', {}, 'Company logo'),
    el('p', { class: 'muted small' }, 'Put automatically at the top left of the report. Kept on this device only.'),
    el('div', { class: 'lt-sig' }, u ? el('img', { src: u, alt: '' }) : el('span', { class: 'muted' }, 'No logo')),
    el('div', { class: 'lt-row' },
      el('label', { class: 'btn' }, u ? 'Change' : 'Choose an image', el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!setBrandLogo(await shrinkLogo(f))) toast('Storage full on this device');
        render();
      } })),
      u ? el('button', { class: 'danger', onclick: () => { setBrandLogo(null); render(); } }, 'Remove') : null));
}

/** "Signed on …" with the date and time the signature was made. */
function signedTxt() {
  if (!st.signature || !st.signedAt) return '';
  const d = new Date(st.signedAt);
  return isNaN(d) ? '' : `Signed on ${d.toLocaleDateString('en-GB')} at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
const setSignature = (u) => { st.signature = u; st.signedAt = u ? new Date().toISOString() : null; if (u) st.date = new Date().toISOString().slice(0, 10); changed(true); };

function equipmentTable() {
  return el('table', { class: 'lt-tbl' },
    el('thead', {}, el('tr', {}, ['Qty', 'Item', 'Length', 'SWL', 'Legs'].map((h) => el('th', {}, h)))),
    el('tbody', {}, out.bom.map((b) => el('tr', {},
      el('td', {}, String(b.qty)), el('td', {}, b.name),
      el('td', { class: 'nw' }, b.ewl_m != null ? `${fmt(b.ewl_m)} m${b.links ? ` (${b.links} links)` : ''}` : '—'),
      el('td', { class: 'nw' }, b.wll_t != null ? `${fmt(b.wll_t)} t` : '—'),
      el('td', {}, b.config || '')))));
}

// ------------------------------------------------------------------ PDF: template of the full version, A4, no browser header / footer
function printPlan() {
  const pr = document.getElementById('lt-print');
  pr.innerHTML = '';
  const c = st.crane, cm = st.comms || {};
  const live = out.checks.filter((x) => !x.hidden);
  const bad = live.filter((x) => x.status === 'fail' || x.status === 'warn');
  const sigImg = safeImg(st.signature);
  const ids = legIds(st);
  const tr = (...xs) => el('tr', {}, ...xs);
  const sec = (t, sub, cols = 1) => tr(el('th', { colspan: String(cols), class: 'sec' }, t, sub ? el('span', {}, ` ${sub}`) : null));
  const box = (v) => el('span', { class: 'tick' }, v ? '☒' : '☐');
  const ul = (arr) => el('ul', {}, arr.filter(Boolean).map((t) => el('li', {}, t)));
  const bar = (t) => el('div', { class: 'bar' }, t);
  const drawing = (html, cls = '') => el('div', { class: `drawing ${cls}`, html });
  const logo = brandLogo();
  const header = el('div', { class: 'rhead' },
    el('div', { class: 'logo' }, logo ? el('img', { src: logo, alt: '' }) : null),
    el('div', { class: 'mid' }, el('div', { class: 'h1' }, st.project || ''), el('div', { class: 'h2' }, st.location || ''), el('div', { class: 'h3' }, st.title || '')),
    el('div'));
  const footer = (n, N) => el('div', { class: 'rfoot' }, el('span', {}, [st.project, st.title, st.date].filter(Boolean).join(' · ')), el('span', {}, `Page ${n} / ${N}`));
  const swlMax = Number(c.swlMax_t) > 0 ? Number(c.swlMax_t) : null;
  const headTxt = st.head === 'hook' ? 'Legs directly on the crane hook' : st.head === 'crane' ? 'On the master link of the crane' : out.rig?.head?.masterlink ? `On ${niceName(out.rig.head.masterlink)}` : 'On a master link';
  const fan = fanSvg();
  const steps = st.steps.filter((t) => String(t.note || '').trim());
  const views = st.photos.slice(0, 9);
  const third = Math.ceil(SAFETY_MEASURES.length / 3);
  const col = (k) => el('td', { class: 'small' }, SAFETY_MEASURES.slice(k * third, (k + 1) * third).map((m) => el('div', {}, box(st.safety.includes(m)), ' ', m)));
  const further = st.safety.filter((x) => !SAFETY_MEASURES.includes(x));

  // blocks in the order of the report, then laid out on A4 pages
  const blocks = [
    el('table', { class: 'tb' },
      tr(el('th', { colspan: '4', class: 'big' }, 'LIFTING PLAN')),
      tr(el('th', {}, 'Project'), el('td', { colspan: '3' }, st.project || '—')),
      tr(el('th', {}, 'Title'), el('td', { colspan: '3' }, st.title || '—')),
      tr(el('th', {}, 'Lift Location'), el('td', {}, st.location || '—'), el('th', {}, 'Date'), el('td', {}, st.date || '—'))),
    el('table', { class: 'tb' },
      sec('Load details/crane details', '(maximum hook load not to be exceeded)', 3),
      tr(
        el('td', {}, el('b', {}, 'Load identification:'), ul([st.title || null, `${ids.length} lift point(s) ${ids.join(', ')}`, `Direct to hook, ${ids.length} legs`, headTxt])),
        el('td', {}, el('b', {}, 'Gross lift weight/maximum hook load:'), ul([
          `Net weight ${st.weight_t ? `${fmt(st.weight_t)} t` : '—'}`, `Rigging ${fmt(out.rigW)} t`, `Factor × ${fmt(st.factor, 2)}`,
          el('b', {}, `Max hook load: ${out.hook ? `${fmt(out.hook)} t` : '—'}`)])),
        el('td', {}, el('b', {}, 'Crane:'), ul([c.name || '—',
          c.swlMin_t ? `SWL ${fmt(c.swlMin_t)} t at min. radius${c.rMin_m ? ` ${c.rMin_m} m` : ''}` : null,
          swlMax ? `SWL ${fmt(swlMax)} t at max. radius${c.rMax_m ? ` ${c.rMax_m} m` : ''}${out.hook ? ` → ${Math.round((out.hook / swlMax) * 100)} % used` : ''}` : null])))),
    el('table', { class: 'tb eq' },
      sec('Lifting equipment and accessories to be used', '(specify type, SWL and configuration)', 5),
      el('tr', { class: 'colh' }, ['Qty', 'Item', 'EWL', 'SWL', 'Configuration'].map((h) => el('td', {}, h))),
      out.bom.map((b) => tr(el('td', { class: 'c' }, String(b.qty)), el('td', {}, b.name),
        el('td', { class: 'c' }, b.ewl_m != null ? `${fmt(b.ewl_m)} m${b.links ? ` (${b.links} links)` : ''}` : 'n/a'),
        el('td', { class: 'c' }, b.wll_t != null ? `${fmt(b.wll_t)} t` : '—'), el('td', {}, b.config || '')))),
    el('table', { class: 'tb steps' },
      tr(el('th', { colspan: '2', class: 'sec' }, 'Step-by-step details of lifting operation'), el('th', { class: 'sec resp' }, 'Responsible')),
      steps.map((t, i) => tr(el('td', { class: 'c n' }, String(i + 1)), el('td', {}, t.note), el('td', { class: 'c' }, t.resp || '')))),
    el('div', {}, bar('Sketch detailing the rigging-up of the lifting equipment and lifting accessories'),
      views.length ? el('div', { class: `figs views v${views.length <= 2 ? 2 : 3}` }, views.map((p) => drawing(boardSvg(p, boardFor(p), false), 'sk'))) : el('div', { class: 'p-empty' }, 'No photo')),
    fan ? el('div', {}, el('div', { class: 'sub-t' }, 'Rigging arrangement'), drawing(fan, 'fan')) : null,
    el('table', { class: 'tb' },
      sec('Possible safety measures to be considered', '(tick as applicable and detail in ‘step-by-step’)', 3),
      tr(col(0), col(1), col(2))),
    further.length ? el('table', { class: 'tb' }, sec('Any further safety measures'), tr(el('td', {}, ul(further)))) : null,
    el('table', { class: 'tb' },
      sec('Communications', '', 2),
      tr(
        el('td', {}, el('b', {}, 'Communication available:'), el('div', {}, box(!!cm.primary), ` Primary (${cm.primary || '—'})   `, box(!!cm.secondary), ` Secondary (${cm.secondary || '—'})   `, box(!!cm.other), ` Other: ${cm.other || '—'}`)),
        el('td', {}, el('b', {}, 'Communications checks:'), el('div', {}, box(!!cm.primaryChecked), ' Primary checked   ', box(!!cm.secondaryChecked), ' Secondary checked')))),
    el('table', { class: 'tb signoff' },
      sec('Prepared by', '', 4),
      tr(el('th', {}, 'Name'), el('td', {}, st.preparedBy || ''), el('th', {}, 'Date'), el('td', {}, st.date || '')),
      tr(el('th', {}, 'Signature'), el('td', { colspan: '3', class: 'sigc' }, sigImg ? el('img', { src: sigImg, alt: '' }) : '', signedTxt() ? el('div', { class: 'signed' }, signedTxt()) : null))),
  ].filter(Boolean).map((x) => el('div', { class: 'blk' }, x));
  // measured at the printed width; packed on pages (a block taller than a page is scaled down)
  const meas = el('div', { class: 'p-in lt-rep' }, header, ...blocks);
  pr.append(meas);
  const imgs = [...pr.querySelectorAll('img')];
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => {
    Object.assign(pr.style, { display: 'block', position: 'absolute', left: '-10000px', top: '0' });
    const mm = meas.getBoundingClientRect().width / 190;
    const cap = 272 - header.getBoundingClientRect().height / mm;
    const pages = [[]];
    let used = 0;
    blocks.forEach((bk) => {
      let h = bk.getBoundingClientRect().height / mm;
      if (h > cap) { bk.style.zoom = String(Math.floor((cap / h) * 100) / 100); h = cap; }
      if (used + h > cap && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      pages[pages.length - 1].push(bk);
      used += h;
    });
    pr.removeAttribute('style');
    pr.innerHTML = '';
    pages.forEach((list, k) => pr.append(el('div', { class: 'p-page' }, el('div', { class: 'p-in lt-rep' }, k ? header.cloneNode(true) : header, ...list), footer(k + 1, pages.length))));
    const t = document.title;
    document.title = `Lift plan${st.title ? ` - ${st.title}` : ''}${st.date ? ` - ${st.date}` : ''}`;
    setTimeout(() => { window.print(); setTimeout(() => { document.title = t; }, 500); }, 50);
  });
}

// ------------------------------------------------------------------ file
function saveFile() {
  const blob = new Blob([JSON.stringify(st)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${(st.title || 'lift-plan').replace(/[^\w-]+/g, '_')}.liftlight.json` });
  document.body.append(a);
  a.click();
  a.remove();
}
function openFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (s.v !== 1) throw new Error('not a LiftPlanner Light file');
      st = fixState(s);
      cur = st.photos[0]?.id || null;
      changed();
      go('photos');
    } catch (err) { alert(`Unreadable file: ${err.message}`); }
  };
  r.readAsText(f);
}

// published page: offer to reload when a new version is online
function checkUpdate() {
  const b = document.querySelector('meta[name="build"]')?.content;
  if (!b || location.protocol === 'file:') return;
  fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).then((v) => {
    if (!v.build || v.build === b || document.getElementById('lt-update')) return;
    document.body.append(el('div', { id: 'lt-update', class: 'lt-update no-print' }, `New version ${v.version || ''} available`,
      el('button', { onclick: () => location.reload() }, 'Reload')));
  }).catch(() => {});
}

shell();
render();
window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (k !== step && STEPS.some(([x]) => x === k)) go(k); });
setTimeout(checkUpdate, 10000);
setInterval(checkUpdate, 180000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
