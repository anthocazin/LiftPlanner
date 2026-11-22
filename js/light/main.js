// LiftPlanner Light — a lift plan on site in 5 minutes: photos with the lift points, weight and
// crane, rigging (legs and their lengths), sketch on the photo, checks and a one-page PDF.
import { el, fmt, toast } from '../ui/dom.js';
import { listByType, listSlingFamily, listChainFamily, niceName } from '../catalog/index.js';
import { isLengthPart } from '../engine/rigging.js';
import { openSignPad, signatureFromName } from '../ui/signpad.js';
import { newState, compute, legIds, PALETTE, HEADS, ANGLE } from './model.js';

const LS = 'liftplanner.light.v1';
const NS = 'http://www.w3.org/2000/svg';
const STEPS = [['photos', '1 Photos'], ['load', '2 Load & crane'], ['rigging', '3 Rigging'], ['sketch', '4 Sketch'], ['plan', '5 Plan']];
const VIEWS = ['Side view', 'Front view', 'Top view', 'Other'];
const num = (v) => (v === '' || v == null || !isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
const safeImg = (u) => (typeof u === 'string' && /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(u) ? u : null);

let st = load();
let step = location.hash.slice(1) && STEPS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'photos';
let cur = st.photos[0]?.id || null; // photo being edited
let activePt = 1;
let out = compute(st);
let saveTimer = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || 'null');
    if (s && s.v === 1) return { ...newState(), ...s, crane: { ...newState().crane, ...(s.crane || {}) } };
  } catch { /* new */ }
  return newState();
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
  m.append(({ photos: stepPhotos, load: stepLoad, rigging: stepRigging, sketch: stepSketch, plan: stepPlan })[step]());
  const i = STEPS.findIndex(([k]) => k === step);
  const f = document.getElementById('lt-foot');
  f.innerHTML = '';
  f.append(i > 0 ? el('button', { onclick: () => go(STEPS[i - 1][0]) }, '← Back') : el('span'),
    i < STEPS.length - 1 ? el('button', { class: 'primary', onclick: () => go(STEPS[i + 1][0]) }, 'Next →') : el('button', { class: 'primary', onclick: printPlan }, 'PDF / Print'));
  status();
}

// ------------------------------------------------------------------ photos and marks
async function addPhotos(files) {
  for (const f of files) {
    const img = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = r.result; }; r.onerror = rej; r.readAsDataURL(f); });
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const ph = { id: Math.random().toString(36).slice(2, 8), name: VIEWS[Math.min(st.photos.length, 3)], img: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height, points: {}, hook: null, tops: {} };
    st.photos.push(ph);
    cur = ph.id;
  }
  if (!st.sketch && st.photos[0]) st.sketch = st.photos[0].id;
  activePt = 1;
  changed(true);
}

/** SVG of the marks of a photo: lift points, and with `legs` the hook and the legs. */
function marksSvg(ph, { legs = false, live = false } = {}) {
  const m = Math.max(ph.w, ph.h);
  const r = m * 0.022, fs = m * 0.04, sw = m * 0.006;
  const P = (q) => ({ x: q.u * ph.w, y: q.v * ph.h });
  const lab = (x, y, t, c) => `<text x="${x}" y="${y}" font-size="${fs}" font-weight="800" font-family="Arial, sans-serif" fill="${c}" stroke="#fff" stroke-width="${fs * 0.2}" paint-order="stroke">${t}</text>`;
  let s = `<svg xmlns="${NS}" viewBox="0 0 ${ph.w} ${ph.h}" class="lt-ov">`;
  const ids = legIds(st);
  if (legs && ph.hook) {
    const h = P(ph.hook);
    ids.forEach((id, i) => {
      const q = ph.points[i + 1];
      if (!q) return;
      const a = P(q), t = P(ph.tops?.[id] || ph.hook);
      if (ph.tops?.[id]) s += `<line x1="${t.x}" y1="${t.y}" x2="${h.x}" y2="${h.y}" stroke="#1c2733" stroke-width="${sw * 0.4}" stroke-dasharray="${sw * 2} ${sw * 1.5}"/>`;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${t.x}" y2="${t.y}" stroke="#e8822a" stroke-width="${sw}" stroke-linecap="round"/>`;
      const L = num(st.lengths?.[id]);
      s += lab(a.x * 0.62 + t.x * 0.38 + r, a.y * 0.62 + t.y * 0.38, `${id}${L ? ` ${fmt(L, 2)} m` : ''}`, '#b4561a');
      if (live && ph.tops?.[id]) s += `<circle cx="${t.x}" cy="${t.y}" r="${r * 0.8}" fill="#fff" stroke="#e8822a" stroke-width="${sw * 0.6}" data-m="t:${id}" class="lt-drag"/>`;
      if (live && !ph.tops?.[id]) s += `<circle cx="${(a.x * 0.35 + t.x * 0.65)}" cy="${(a.y * 0.35 + t.y * 0.65)}" r="${r * 0.7}" fill="#fff" stroke="#e8822a" stroke-width="${sw * 0.6}" data-m="t:${id}" class="lt-drag"/>`;
    });
    s += `<circle cx="${h.x}" cy="${h.y}" r="${r * 1.1}" fill="#f2b705" stroke="#1c2733" stroke-width="${sw * 0.5}" ${live ? 'data-m="hook" class="lt-drag"' : ''}/>` + lab(h.x + r * 1.5, h.y - r * 0.5, 'Hook', '#7a5a10');
  }
  ids.forEach((id, i) => {
    const q = ph.points[i + 1];
    if (!q) return;
    const a = P(q);
    s += `<circle cx="${a.x}" cy="${a.y}" r="${r}" fill="#d64541" stroke="#fff" stroke-width="${sw * 0.6}" ${live && !legs ? `data-m="p:${i + 1}" class="lt-drag"` : ''}/>`;
    s += `<text x="${a.x}" y="${a.y + fs * 0.35}" font-size="${fs * 0.9}" font-weight="800" text-anchor="middle" font-family="Arial, sans-serif" fill="#fff" pointer-events="none">${i + 1}</text>`;
    if (legs && !ph.hook) s += lab(a.x + r * 1.3, a.y + r * 2.2, id, '#c0392b');
  });
  return `${s}</svg>`;
}

/** Photo with its marks; a tap calls onTap({u, v}), dragging a mark calls onDrag(mark, {u, v}). */
function photoView(ph, { legs = false, onTap, onDrag } = {}) {
  const box = el('div', { class: 'lt-photo', style: `max-width: min(100%, calc(68vh * ${(ph.w / ph.h).toFixed(4)}))` }, el('img', { src: safeImg(ph.img) || '', alt: '', draggable: 'false' }));
  box.insertAdjacentHTML('beforeend', marksSvg(ph, { legs, live: true }));
  const pt = (ev) => { const b = box.getBoundingClientRect(); return { u: Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)), v: Math.min(1, Math.max(0, (ev.clientY - b.top) / b.height)) }; };
  let drag = null;
  box.addEventListener('pointerdown', (ev) => {
    const m = ev.target.getAttribute?.('data-m');
    ev.preventDefault();
    if (m) { drag = { m }; box.setPointerCapture(ev.pointerId); return; }
    onTap?.(pt(ev));
  });
  box.addEventListener('pointermove', (ev) => { if (drag) { onDrag?.(drag.m, pt(ev)); redrawMarks(box, ph, legs); } });
  const end = () => { if (drag) { drag = null; changed(true); } };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  return box;
}

function redrawMarks(box, ph, legs) {
  const tmp = document.createElement('div');
  tmp.innerHTML = marksSvg(ph, { legs, live: true });
  box.querySelector('svg').replaceWith(tmp.firstChild);
}

// ------------------------------------------------------------------ 1. photos
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
  if (!ph) { wrap.append(el('p', { class: 'muted' }, 'Take one or more photos (side, front, top…), then tap each lift point on them: 1, 2, 3…')); return wrap; }
  wrap.append(el('div', { class: 'lt-thumbs' }, st.photos.map((p) => el('button', { class: `lt-thumb ${p.id === cur ? 'on' : ''}`, onclick: () => { cur = p.id; render(); } }, el('img', { src: safeImg(p.img) || '', alt: '' }), el('span', {}, p.name)))));
  const chips = el('div', { class: 'lt-row lt-chips' }, el('span', {}, 'Tap point:'),
    legIds(st).map((_, i) => el('button', { class: `chip ${activePt === i + 1 ? 'on' : ''} ${ph.points[i + 1] ? 'set' : ''}`, onclick: () => { activePt = i + 1; render(); } }, String(i + 1))));
  const view = photoView(ph, {
    onTap: (q) => { ph.points[activePt] = q; activePt = Math.min(n, activePt + 1); changed(true); },
    onDrag: (m, q) => { ph.points[Number(m.slice(2))] = q; redrawMarks(view, ph, false); },
  });
  wrap.append(chips, view,
    el('div', { class: 'lt-row' },
      el('select', { onchange: (e) => { ph.name = e.target.value; changed(true); } }, VIEWS.map((v) => el('option', { value: v, selected: v === ph.name }, v))),
      el('button', { onclick: () => { delete ph.points[activePt]; changed(true); } }, `Clear point ${activePt}`),
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
  const lens = el('div', { class: 'lt-lens' }, ids.map((id, i) => {
    const l = out.legs.find((x) => x.pointId === id);
    const s = l?.parts?.[l.li];
    return el('label', { class: 'lt-f' }, el('span', {}, `${id} (point ${i + 1})`),
      el('input', { type: 'number', value: st.lengths?.[id] ?? '', placeholder: 'm', onchange: (e) => { st.lengths = st.lengths || {}; st.lengths[id] = num(e.target.value); changed(true); } }), el('i', {}, 'm'),
      s?.length_m ? el('small', { class: 'muted' }, `${s.kind === 'chain' ? 'chain' : 'sling'} ${fmt(s.length_m, 2)} m${s.kind === 'chain' && s.links ? ` (${s.links} links)` : ''}`) : null);
  }));
  return el('div', {},
    el('section', { class: 'lt-card' }, el('h2', {}, 'On the crane hook'),
      el('select', { class: 'wide', onchange: (e) => { st.head = e.target.value; changed(true); } }, Object.entries(HEADS).map(([k, t]) => el('option', { value: k, selected: st.head === k }, t))),
      out.rig?.head?.masterlink && st.head === 'masterlink' ? el('p', { class: 'muted small' }, `Proposed: ${niceName(out.rig.head.masterlink)}`) : null),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Each leg, from the hook down to the lift point'),
      list,
      el('div', { class: 'lt-row lt-add' }, el('span', {}, 'Add:'), PALETTE.map((x) => el('button', { onclick: () => { A.push({ kind: x.kind, family: x.family, hitch: x.hitch, id: 'auto' }); changed(true); } }, `+ ${x.label}`))),
      el('p', { class: 'muted small' }, `Auto = smallest size whose SWL holds ${out.legs[0] ? `${fmt(out.legs[0].Fdesign)} t` : 'the force of the leg'} (legs at ${ANGLE}°, same force in every leg).`)),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Length of each leg (lift point → hook)'),
      lens,
      el('div', { class: 'lt-row' },
        el('button', { onclick: () => { const L = ids.map((id) => num(st.lengths?.[id])).find((v) => v > 0); if (!L) return toast('Type the length of one leg first'); ids.forEach((id) => { st.lengths[id] = L; }); changed(true); } }, 'Same length on every leg'),
        el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: st.std !== false, onchange: (e) => { st.std = e.target.checked; changed(true); } }), ' Standard sling lengths (else made to measure)'))));
}

// ------------------------------------------------------------------ 4. sketch
function stepSketch() {
  const wrap = el('section', { class: 'lt-card' }, el('h2', {}, 'Sketch on the photo'));
  if (!st.photos.length) { wrap.append(el('p', { class: 'muted' }, 'Add a photo first (step 1).')); return wrap; }
  const ph = st.photos.find((p) => p.id === st.sketch) || st.photos[0];
  st.sketch = ph.id;
  ph.tops = ph.tops || {};
  wrap.append(el('div', { class: 'lt-thumbs' }, st.photos.map((p) => el('button', { class: `lt-thumb ${p.id === ph.id ? 'on' : ''}`, onclick: () => { st.sketch = p.id; changed(true); } }, el('img', { src: safeImg(p.img) || '', alt: '' }), el('span', {}, p.name)))));
  const view = photoView(ph, {
    legs: true,
    onTap: (q) => { if (!ph.hook) { ph.hook = q; changed(true); } },
    onDrag: (m, q) => { if (m === 'hook') ph.hook = q; else ph.tops[m.slice(2)] = q; redrawMarks(view, ph, true); },
  });
  const missing = legIds(st).filter((_, i) => !ph.points[i + 1]);
  wrap.append(
    el('p', { class: 'muted small' }, ph.hook ? 'Drag the hook, or the round handle of a leg to make it longer or shorter on the sketch.' : 'Tap where the crane hook is: the legs are drawn from the lift points to it.'),
    view,
    missing.length ? el('p', { class: 'note warn small' }, `Points not placed on this photo: ${missing.map((id) => `${legIds(st).indexOf(id) + 1} (${id})`).join(', ')} — place them in step 1.`) : '',
    el('div', { class: 'lt-row' },
      el('button', { onclick: () => { ph.hook = null; ph.tops = {}; changed(true); } }, 'Place the hook again'),
      el('button', { onclick: () => { ph.tops = {}; changed(true); } }, 'Legs back to the hook')),
    legend());
  return wrap;
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

// ------------------------------------------------------------------ 5. plan
function checkList(all = false) {
  const bad = out.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const shown = all ? out.checks : bad;
  return el('div', { class: 'lt-checks' },
    !out.checks.length ? el('p', { class: 'muted' }, 'Give the weight and the lengths of the legs.') : null,
    shown.map((c) => el('div', { class: `lt-chk ${c.status}` }, el('b', {}, { ok: '✓', warn: '!', fail: '✕', info: 'i' }[c.status] || '•'), el('span', {}, `${c.item}: ${c.label}${c.util != null ? ` — ${Math.round(c.util * 100)} %` : ''}`))),
    !all && !bad.length && out.checks.length ? el('div', { class: 'lt-chk ok' }, el('b', {}, '✓'), el('span', {}, `All ${out.checks.length} checks OK (SWL of every part, parts compatible, crane)`)) : null);
}

function stepPlan() {
  const sigImg = safeImg(st.signature);
  return el('div', {},
    el('section', { class: 'lt-card' }, el('h2', {}, 'Checks'), checkList(),
      el('details', {}, el('summary', {}, 'All the checks'), checkList(true))),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Equipment'), equipmentTable()),
    el('section', { class: 'lt-card' }, el('h2', {}, 'Prepared by'),
      el('div', { class: 'lt-2' },
        field('Name', st.preparedBy, (v) => { st.preparedBy = v; }, { type: 'text', ph: 'Name' }),
        field('Date', st.date, (v) => { st.date = v; }, { type: 'date' })),
      el('div', { class: 'lt-sig' }, sigImg ? el('img', { src: sigImg, alt: '' }) : el('span', { class: 'muted' }, 'No signature')),
      el('div', { class: 'lt-row' },
        el('button', { onclick: () => { const u = signatureFromName(st.preparedBy); if (!u) return toast('Type the name first'); st.signature = u; changed(true); } }, '✍ From the name'),
        el('button', { onclick: () => openSignPad('Prepared by', (u) => { st.signature = u; changed(true); }, st.preparedBy) }, '✎ Draw'),
        sigImg ? el('button', { class: 'danger', onclick: () => { st.signature = null; changed(true); } }, 'Remove') : null)));
}

function equipmentTable() {
  return el('table', { class: 'lt-tbl' },
    el('thead', {}, el('tr', {}, ['Qty', 'Item', 'Length', 'SWL', 'Legs'].map((h) => el('th', {}, h)))),
    el('tbody', {}, out.bom.map((b) => el('tr', {},
      el('td', {}, String(b.qty)), el('td', {}, b.name),
      el('td', { class: 'nw' }, b.ewl_m != null ? `${fmt(b.ewl_m)} m${b.links ? ` (${b.links} links)` : ''}` : '—'),
      el('td', { class: 'nw' }, b.wll_t != null ? `${fmt(b.wll_t)} t` : '—'),
      el('td', {}, b.config || '')))));
}

// ------------------------------------------------------------------ PDF (one page)
function printPlan() {
  const pr = document.getElementById('lt-print');
  pr.innerHTML = '';
  const sk = st.photos.find((p) => p.id === st.sketch) || st.photos[0];
  const others = st.photos.filter((p) => p !== sk);
  const fig = (ph, legs) => { const i = el('div', { class: 'p-img' }, el('img', { src: safeImg(ph.img) || '', alt: '' })); i.insertAdjacentHTML('beforeend', marksSvg(ph, { legs })); return el('div', { class: 'p-fig' }, i, el('div', { class: 'p-cap' }, ph.name)); };
  const kv = (k, v) => el('tr', {}, el('th', {}, k), el('td', {}, v ?? '—'));
  const c = st.crane;
  const bad = out.checks.filter((x) => x.status === 'fail' || x.status === 'warn');
  const sigImg = safeImg(st.signature);
  pr.append(el('div', { class: 'p-page' },
    el('div', { class: 'p-head' }, el('div', {}, el('h1', {}, 'LIFT PLAN'), el('div', {}, [st.title, st.location].filter(Boolean).join(' — ') || '—')), el('div', { class: 'p-date' }, st.date || '')),
    el('div', { class: 'p-sketch' }, sk ? fig(sk, true) : el('div', { class: 'p-empty' }, 'No photo')),
    el('div', { class: 'p-top' },
      el('table', { class: 'p-kv' },
        kv('Weight', st.weight_t ? `${fmt(st.weight_t)} t` : null), kv('Factor', `× ${fmt(st.factor, 2)}`),
        kv('Rigging', out.rigW ? `${fmt(out.rigW)} t` : null), kv('Hook load × factor', out.hook ? `${fmt(out.hook)} t` : null),
        kv('Legs', `${legIds(st).length} at ${ANGLE}° (sizing)`), kv('Force per leg', out.legs[0] ? `${fmt(out.legs[0].Fdesign)} t` : null),
        kv('Crane', c.name || null),
        kv('SWL min. radius', c.swlMin_t ? `${fmt(c.swlMin_t)} t${c.rMin_m ? ` at ${c.rMin_m} m` : ''}` : null),
        kv('SWL max. radius', c.swlMax_t ? `${fmt(c.swlMax_t)} t${c.rMax_m ? ` at ${c.rMax_m} m` : ''}` : null)),
      el('div', { class: 'p-side' },
        legend(),
        el('div', { class: `p-res ${out.status}` }, out.status === 'ok' ? `✓ All ${out.checks.length} checks OK — SWL of every part, parts compatible, crane` : `${bad.length} point(s) to resolve`),
        bad.length ? el('ul', { class: 'p-bad' }, bad.slice(0, 8).map((x) => el('li', {}, `${x.item}: ${x.label}`))) : null)),
    others.length ? el('div', { class: 'p-others' }, others.slice(0, 3).map((p) => fig(p, false))) : null,
    equipmentTable(),
    el('div', { class: 'p-sign' }, el('div', {}, el('b', {}, 'Prepared by: '), st.preparedBy || '—', el('span', {}, `   Date: ${st.date || ''}`)), sigImg ? el('img', { src: sigImg, alt: '' }) : null)));
  // one A4 page: measured at the printed width, scaled down when too tall
  const imgs = [...pr.querySelectorAll('img')];
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => {
    const pg = pr.firstChild;
    pg.style.zoom = '';
    Object.assign(pr.style, { display: 'block', position: 'absolute', left: '-10000px', top: '0', width: '190mm' });
    const mm = pr.getBoundingClientRect().width / 190;
    const h = pg.getBoundingClientRect().height / mm;
    pr.removeAttribute('style');
    if (h > 274) pg.style.zoom = String(Math.floor((274 / h) * 100) / 100);
    setTimeout(() => window.print(), 50);
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
      st = { ...newState(), ...s };
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
