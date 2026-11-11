// Storyboard: background map, crane and step positions on the site plan, obstacles, step drawings.
import { app } from '../app.js';
import { el, field, cell, panel, badge, fmt, toast } from '../dom.js';
import { drawStoryPlan, drawStoryElevation } from '../../draw/story.js';
import { figure } from '../figure.js';
import { worstStatus } from '../../engine/compute.js';
import { siteView, svState, importMap } from '../siteview.js';
import { SHAPE_TYPES } from '../../draw/shapes.js';

let sv = null;

export function render(root) {
  const S = 'storyboard.';
  const sb = app.project.storyboard;
  const fileIn = el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { await importMap(f); window.__rerender(); } catch (err) { alert(err.message); } } });
  const modeBtn = (m, txt, title, extra = {}) => el('button', { class: `small ${svState.mode === m ? 'active' : ''}`, title, onclick: () => { svState.mode = m; svState.tmp = []; Object.assign(svState, extra); window.__rerender(); } }, txt);
  const crSteps = (sb.steps || []).map((st, i) => ({ st, i })).filter(({ st }) => Number(st.radius_m) > 0 || st.pos || st.sketch);
  const stepSel = el('select', { onchange: (e) => { svState.step = Number(e.target.value); } });
  crSteps.forEach(({ st, i }) => stepSel.append(el('option', { value: i, selected: svState.step === i }, `${i + 1}. ${st.name || ''}`)));
  if (svState.step == null && crSteps.length) svState.step = crSteps[0].i;
  sv = siteView({ height: 560, onSelect: () => window.__rerender(), onChange: () => setTimeout(() => window.__rerender(), 0), onShape: (full) => renderShapeProps(full) });
  const shapeBtn = (t) => el('button', { class: `small ${svState.mode === 'shape' && svState.shapeTool === t ? 'active' : ''}`, title: t === 'text' ? 'Click where the text goes' : 'Drag on the plan', onclick: () => { svState.mode = 'shape'; svState.shapeTool = t; window.__rerender(); } }, SHAPE_TYPES[t]);
  const snapSel = el('select', { onchange: (e) => (svState.snap = Number(e.target.value)) });
  [[0, 'no snap'], [0.05, 'snap 5 cm'], [0.1, 'snap 0.1 m'], [0.5, 'snap 0.5 m'], [1, 'snap 1 m']].forEach(([v, t]) => snapSel.append(el('option', { value: v, selected: svState.snap === v }, t)));
  const shapeBar = el('div', { class: 'toolbar shapes-bar' }, el('b', { style: { fontSize: '12px', marginRight: '4px' } }, 'Draw (to scale):'), ...Object.keys(SHAPE_TYPES).map(shapeBtn), snapSel, el('span', { id: 'shape-props', class: 'shape-props' }));
  const map = panel(
    null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Site plan'),
      el('div', { class: 'row' },
        el('label', { class: 'btn small primary' }, sb.map?.image ? 'Replace map…' : 'Import map (PDF / image)…', fileIn),
        sb.map?.image ? el('button', { class: 'small danger', onclick: () => { if (confirm('Remove the map?')) { sb.map = null; app.recompute(); window.__rerender(); } } }, 'Remove map') : null,
      ),
    ),
    el('div', { class: 'toolbar' },
      modeBtn('select', 'Select / drag', 'Drag the crane and the step markers; drag the background to pan, wheel to zoom'),
      modeBtn('crane', 'Place crane', 'Click the slewing centre of the crane on the map'),
      el('span', { class: 'muted' }, ' Place step '), stepSel,
      el('button', { class: `small ${svState.mode === 'step' ? 'active' : ''}`, onclick: () => { svState.mode = 'step'; svState.step = Number(stepSel.value); window.__rerender(); } }, 'Click on the map'),
      sb.map?.image ? modeBtn('scale', 'Scale (2 clicks)', 'Click two points whose real distance you know, then enter it') : null,
      sb.map?.image ? el('label', { class: 'check', style: { fontSize: '12px' } }, 'Map', el('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: sb.map.opacity ?? 0.85, oninput: (e) => { sb.map.opacity = Number(e.target.value); sv.refresh(); } })) : null,
    ),
    shapeBar,
    sv,
    el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } },
      sb.map?.image
        ? 'Place the crane, then the pick-up and set-down positions (and any intermediate step). Radius and slew are measured on the map; they are checked against the load chart (red circles = min / max radius).'
        : 'No map: white background with a grid scaled to the load and the crane radius. Import a site / deck plan to place the crane and the load on it.'),
  );
  const site = panel('Crane',
    el('div', { class: 'fields' },
      field({ label: 'Position X', path: `${S}crane.x`, unit: 'm' }),
      field({ label: 'Position Y', path: `${S}crane.y`, unit: 'm' }),
      field({ label: 'Carrier heading', path: `${S}crane.heading_deg`, unit: '°' }),
      field({ label: 'Footprint length', path: `${S}crane.footprint.L`, unit: 'm' }),
      field({ label: 'Footprint width', path: `${S}crane.footprint.W`, unit: 'm' }),
    ),
  );
  const obs = panel(null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Obstacles / areas'), el('button', { class: 'small', onclick: addObstacle }, '+ Obstacle')),
    el('div', { id: 'obs-table', class: 'tbl-wrap' }),
  );
  const steps = panel(null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Crane positions of the sequence'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Texts and responsibilities: Project page')),
    el('div', { id: 'steps-table', class: 'tbl-wrap' }),
    el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'Load height = underside of the load above the crane reference level (ground / deck). A step placed on the map has its radius and slew measured from the crane.'),
  );
  root.append(map, el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, site, obs), steps), el('div', { id: 'story-cards', class: 'grid', style: { marginTop: '14px' } }));
  renderTables();
  renderShapeProps(true);
  update(app.result);
  root._update = update;
}

/** Properties of the selected shape (dimensions in metres, colours, text). */
function renderShapeProps(full) {
  const box = document.getElementById('shape-props');
  if (!box) return;
  document.querySelectorAll('.shapes-bar button').forEach((b) => b.classList.toggle('active', svState.mode === 'shape' && SHAPE_TYPES[svState.shapeTool] === b.textContent));
  const sb = app.project.storyboard;
  const sh = (sb.shapes || []).find((q) => q.id === svState.selShape);
  if (!sh) { box.innerHTML = ''; if ((sb.shapes || []).length) box.append(el('span', { class: 'muted', style: { fontSize: '12px' } }, `${sb.shapes.length} shape(s) — click one to edit`)); return; }
  if (!full && box.dataset.id === sh.id) {
    // live update of the numbers while dragging
    box.querySelectorAll('input[data-k]').forEach((i) => { if (document.activeElement !== i && i.type === 'number') i.value = Math.round((Number(sh[i.dataset.k]) || 0) * 1000) / 1000; });
    return;
  }
  box.dataset.id = sh.id;
  box.innerHTML = '';
  const num = (k, t, w = '64px') => el('label', {}, `${t} `, el('input', { type: 'number', step: 'any', 'data-k': k, value: Math.round((Number(sh[k]) || 0) * 1000) / 1000, style: { width: w }, onchange: (e) => { sh[k] = Number(e.target.value) || 0; app.persist(); sv.refresh(); } }));
  const fields = { rect: [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H'], ['rot', 'rot°']], triangle: [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H'], ['rot', 'rot°']], circle: [['x', 'X'], ['y', 'Y'], ['r', 'R']], arc: [['x', 'X'], ['y', 'Y'], ['r', 'R'], ['a0', 'from°'], ['a1', 'to°']], line: [['x', 'X1'], ['y', 'Y1'], ['x2', 'X2'], ['y2', 'Y2']], text: [['x', 'X'], ['y', 'Y'], ['size', 'height'], ['rot', 'rot°']] }[sh.type] || [];
  box.append(el('b', {}, `${SHAPE_TYPES[sh.type]} (m)`), ...fields.map(([k, t]) => num(k, t)));
  if (sh.type === 'line' || sh.type === 'arc') {
    const L = sh.type === 'line' ? Math.hypot(sh.x2 - sh.x, sh.y2 - sh.y) : (sh.r * (((sh.a1 - sh.a0) % 360) + 360) % 360 * Math.PI) / 180;
    box.append(el('span', { class: 'muted' }, `length ${fmt(L, 2)} m`));
  }
  if (sh.type === 'text') box.append(el('input', { type: 'text', value: sh.text || '', style: { width: '160px' }, onchange: (e) => { sh.text = e.target.value; app.persist(); sv.refresh(); } }));
  box.append(...[
    el('label', { title: 'Line colour' }, el('input', { type: 'color', value: sh.stroke || '#1c2733', onchange: (e) => { sh.stroke = e.target.value; app.persist(); sv.refresh(); } })),
    sh.type !== 'text' && sh.type !== 'line' && sh.type !== 'arc' ? el('label', { title: 'Fill colour' }, el('input', { type: 'checkbox', checked: sh.fill && sh.fill !== 'none', onchange: (e) => { sh.fill = e.target.checked ? '#9aa5b1' : 'none'; app.persist(); renderShapeProps(true); sv.refresh(); } }), 'fill', sh.fill && sh.fill !== 'none' ? el('input', { type: 'color', value: sh.fill, onchange: (e) => { sh.fill = e.target.value; app.persist(); sv.refresh(); } }) : null) : null,
    sh.type !== 'text' ? el('label', {}, 'line ', el('input', { type: 'number', step: 0.5, min: 0.5, value: sh.lw || 2, style: { width: '48px' }, onchange: (e) => { sh.lw = Number(e.target.value) || 2; app.persist(); sv.refresh(); } })) : null,
    sh.type !== 'text' ? el('label', {}, el('input', { type: 'checkbox', checked: !!sh.dash, onchange: (e) => { sh.dash = e.target.checked; app.persist(); sv.refresh(); } }), 'dashed') : null,
    el('button', { class: 'small', onclick: () => { const c = { ...JSON.parse(JSON.stringify(sh)), id: `${sh.id}c${Date.now() % 1000}` }; c.x += 1; c.y -= 1; if (c.type === 'line') { c.x2 += 1; c.y2 -= 1; } sb.shapes.push(c); svState.selShape = c.id; app.persist(); sv.refresh(); renderShapeProps(true); } }, 'Duplicate'),
    el('button', { class: 'small danger', onclick: () => { sb.shapes = sb.shapes.filter((q) => q.id !== sh.id); svState.selShape = null; app.persist(); sv.refresh(); renderShapeProps(true); } }, 'Delete'),
  ].filter(Boolean));
}

document.addEventListener('keydown', (e) => {
  if (!svState.selShape || !document.querySelector('.shapes-bar')) return;
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const sb = app.project.storyboard;
  sb.shapes = (sb.shapes || []).filter((q) => q.id !== svState.selShape);
  svState.selShape = null;
  app.persist();
  sv?.refresh();
  renderShapeProps(true);
});

function renderTables() {
  const sb = app.project.storyboard;
  const ob = document.getElementById('obs-table');
  if (ob) {
    ob.innerHTML = '';
    ob.append(el('table', { class: 'data compact' },
      el('thead', {}, el('tr', {}, ['Name', 'X (m)', 'Y (m)', 'Length (m)', 'Width (m)', 'Height (m)', 'Rot. °', 'Colour', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, sb.obstacles.map((o, i) => el('tr', {},
        el('td', {}, cell(`storyboard.obstacles.${i}.name`, 'text')),
        ...['x', 'y', 'sx', 'sy', 'h', 'rot_deg'].map((k) => el('td', {}, cell(`storyboard.obstacles.${i}.${k}`, 'number', { onchange: () => app.recompute() }))),
        el('td', {}, el('input', { type: 'color', value: o.color || '#9aa5b1', onchange: (e) => { o.color = e.target.value; app.recompute(); } })),
        el('td', {}, el('button', { class: 'small danger', onclick: () => { sb.obstacles.splice(i, 1); app.recompute(); renderTables(); } }, '✕')),
      )))));
  }
  const st = document.getElementById('steps-table');
  if (st) {
    st.innerHTML = '';
    st.append(el('table', { class: 'data compact' },
      el('thead', {}, el('tr', {}, ['#', 'Step', 'Radius (m)', 'Slew °', 'Load height (m)', 'Load heading °', 'On map', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, sb.steps.map((s, i) => el('tr', { class: svState.step === i ? 'sel' : '' },
        el('td', {}, i + 1),
        el('td', { style: { minWidth: '160px' } }, cell(`storyboard.steps.${i}.name`, 'text')),
        ...['radius_m', 'slew_deg'].map((k) => el('td', { style: { width: '90px' } }, s.pos ? el('span', { class: 'muted' }, fmt(s[k], 1)) : cell(`storyboard.steps.${i}.${k}`, 'number', { onchange: () => app.recompute() }))),
        ...['loadElevation_m', 'heading_deg'].map((k) => el('td', { style: { width: '90px' } }, cell(`storyboard.steps.${i}.${k}`, 'number', { onchange: () => app.recompute() }))),
        el('td', {}, s.pos ? el('button', { class: 'small', title: 'Keep radius / slew, forget the map position', onclick: () => { delete s.pos; app.recompute(); renderTables(); } }, `(${fmt(s.pos.x, 1)}; ${fmt(s.pos.y, 1)}) ✕`) : el('button', { class: 'small', onclick: () => { svState.mode = 'step'; svState.step = i; window.__rerender(); } }, 'Place')),
        el('td', {}, el('button', { class: 'small danger', onclick: () => { sb.steps.splice(i, 1); app.recompute(); renderTables(); } }, '✕')),
      )))));
  }
}

function addObstacle() {
  const cr = app.project.storyboard.crane;
  app.project.storyboard.obstacles.push({ name: 'Obstacle', x: cr.x + 8, y: cr.y + 8, sx: 3, sy: 3, h: 2, rot_deg: 0, color: '#9aa5b1' });
  app.recompute();
  renderTables();
}

function update(res) {
  sv?.refresh();
  if (!document.activeElement?.closest?.('#steps-table')) renderTables();
  const box = document.getElementById('story-cards');
  if (!box) return;
  box.innerHTML = '';
  const p = app.project;
  p.storyboard.steps.forEach((st, i) => {
    if (!(Number(st.radius_m) > 0)) return;
    const sr = res?.steps?.[i];
    const stat = sr ? worstStatus(sr.checks) : 'info';
    box.append(el('section', { class: 'panel avoid-break' },
      el('div', { class: 'panel-head' }, el('h2', {}, `${i + 1}. ${st.name || ''}`), badge(stat)),
      st.note ? el('div', { class: 'note', style: { marginBottom: '8px' } }, st.note) : null,
      el('div', { class: 'story-step' }, figure(drawStoryPlan(p, res, i, { width: 560, height: 420 }), `step-${i + 1}-plan`), figure(drawStoryElevation(p, res, i, { width: 560, height: 420 }), `step-${i + 1}-elevation`)),
      sr?.checks?.length ? el('div', { class: 'row', style: { marginTop: '8px', gap: '12px' } }, sr.checks.map((c) => el('span', {}, badge(c.status), ' ', c.label, c.util != null ? ` — ${(c.util * 100).toFixed(0)} %` : ''))) : null,
    ));
  });
  if (!box.children.length) box.append(el('div', { class: 'note' }, 'Add crane steps (pick-up, slewing, set-down…) on the Project page or place them on the map to check the capacity at every radius.'));
  void toast;
}
