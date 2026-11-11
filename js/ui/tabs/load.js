// Load page: visual workspace (XY plan + XZ elevation on the imported drawing), weight, COG,
// lift points and padeye characteristics with the shackle fit.
import { app } from '../app.js';
import { el, field, cell, panel, fmt, toast } from '../dom.js';
import { WCF_PRESETS } from '../../engine/factors.js';
import { shackleCompatibility } from '../../catalog/index.js';
import { drawPadeyeFit } from '../../draw/detail.js';
import { figure } from '../figure.js';
import { loadView, lvState, resetZoom } from '../loadview.js';
import { openImportWizard } from '../importwizard.js';

let views = [];

export function render(root) {
  const L = 'load.';
  const load = app.project.load;
  if (!lvState.selected || !load.liftPoints.some((p) => p.id === lvState.selected)) lvState.selected = load.liftPoints[0]?.id || null;

  // ---------- identification, weight, COG
  const presetField = field({
    label: 'Weight contingency (WCF)', path: `${L}wcfPreset`, type: 'select',
    options: WCF_PRESETS.map((p) => [p.id, p.label]),
    onchange: (id) => {
      const pr = WCF_PRESETS.find((p) => p.id === id);
      if (pr?.value) app.set(`${L}wcf`, pr.value);
      window.__rerender();
    },
  });
  const ident = panel(
    'Load',
    el('div', { class: 'fields' },
      field({ label: 'Description', path: `${L}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Net weight', path: `${L}weight_t`, unit: 't', hint: 'Weight of the item alone' }),
      field({ label: 'Weight basis', path: `${L}weightBasis`, type: 'select', options: [['actual', 'Actual (weighed)'], ['assessed', 'Assessed (calculated)'], ['drawing', 'From the drawing']] }),
      presetField,
      field({ label: 'WCF', path: `${L}wcf`, unit: '×', step: 0.01, onchange: () => app.set(`${L}wcfPreset`, 'custom', { silent: true }) }),
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Design weight'), el('div', { class: 'card', id: 'wdesign' }, '—')),
    ),
    el('div', { id: 'detected' }),
    el('h3', {}, 'Centre of gravity'),
    el('div', { class: 'fields' },
      field({ label: 'COG X', path: `${L}cog_mm.x`, unit: 'mm' }),
      field({ label: 'COG Y', path: `${L}cog_mm.y`, unit: 'mm' }),
      field({ label: 'COG Z', path: `${L}cog_mm.z`, unit: 'mm' }),
      field({ label: 'COG basis', path: `${L}cogBasis`, type: 'select', options: [['drawing', 'Drawing'], ['estimated', 'Estimated'], ['obvious', 'Obvious']] }),
      field({ label: 'COG envelope ± X', path: `${L}cogEnvelope_mm.dx`, unit: 'mm', hint: 'Uncertainty: max forces over the envelope' }),
      field({ label: 'COG envelope ± Y', path: `${L}cogEnvelope_mm.dy`, unit: 'mm' }),
    ),
    el('details', { class: 'sub' },
      el('summary', {}, 'Overall envelope (for drawings and default positions)'),
      el('div', { class: 'fields' },
        field({ label: 'Overall length (X)', path: `${L}dims_mm.L`, unit: 'mm' }),
        field({ label: 'Overall width (Y)', path: `${L}dims_mm.W`, unit: 'mm' }),
        field({ label: 'Overall height (Z)', path: `${L}dims_mm.H`, unit: 'mm' }),
        field({ label: 'Envelope origin X', path: `${L}origin_mm.x`, unit: 'mm', hint: 'Minimum corner in the load frame' }),
        field({ label: 'Envelope origin Y', path: `${L}origin_mm.y`, unit: 'mm' }),
        field({ label: 'Envelope origin Z', path: `${L}origin_mm.z`, unit: 'mm' }),
      ),
      el('p', { class: 'muted', style: { fontSize: '12px' } }, 'The load does not need to be a box: the envelope is only the dashed outline. The calculation uses the lift points and the COG.'),
    ),
  );

  // ---------- workspace
  const fileIn = el('input', { type: 'file', accept: 'application/pdf,image/*', hidden: true, onchange: (e) => { const f = e.target.files?.[0]; if (f) openImportWizard(f, () => window.__rerender()); e.target.value = ''; } });
  const modeBtn = (m, txt, title) => el('button', { class: `small ${lvState.mode === m ? 'active' : ''}`, title, onclick: () => { lvState.mode = m; window.__rerender(); } }, txt);
  const snapSel = el('select', { onchange: (e) => (lvState.snap = Number(e.target.value)) });
  [1, 5, 10, 50, 100].forEach((v) => snapSel.append(el('option', { value: v, selected: lvState.snap === v }, `snap ${v} mm`)));
  const hasViews = !!(load.views?.xy || load.views?.xz);
  views = [
    loadView('xy', { editable: true, height: 430, onAdd: addAt, onSelect: selectPoint, onChange: () => {} }),
    loadView('xz', { editable: true, height: 430, onAdd: addAt, onSelect: selectPoint, onChange: () => {} }),
  ];
  const ws = panel(
    null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Lift points & COG on the drawing'),
      el('div', { class: 'row' },
        el('label', { class: 'btn small primary' }, hasViews ? 'Import another drawing…' : 'Import drawing (PDF / image)…', fileIn),
        hasViews ? el('button', { class: 'small danger', onclick: () => { if (confirm('Remove the drawings from the views?')) { load.views = { xy: null, xz: null }; app.recompute(); window.__rerender(); } } }, 'Remove drawings') : null,
      ),
    ),
    el('div', { class: 'toolbar' },
      modeBtn('select', 'Select / drag', 'Drag the points and the COG; drag the background to pan, wheel to zoom, double-click to reset'),
      modeBtn('add', '+ Lift point', 'Click in a view to add a lift point'),
      modeBtn('cog', 'Place COG', 'Click in a view to place the COG'),
      snapSel,
      el('label', { class: 'check', style: { fontSize: '12px' } }, 'Drawing', el('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: lvState.opacity, oninput: (e) => { lvState.opacity = Number(e.target.value); views.forEach((v) => v.refresh()); } })),
      el('label', { class: 'check', style: { fontSize: '12px' } }, el('input', { type: 'checkbox', checked: lvState.showRig, onchange: (e) => { lvState.showRig = e.target.checked; views.forEach((v) => v.refresh()); } }), 'Show rigging'),
      el('button', { class: 'small', onclick: () => { resetZoom(); views.forEach((v) => v.refresh()); } }, 'Fit views'),
    ),
    el('div', { class: 'grid g2 lv-pair' }, ...views),
    el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } },
      'XY gives X and Y of each point, XZ gives Z. Points: red = padeye, blue = no padeye (choked sling, trunnion…), grey = not used. Lengths and forces are recalculated as soon as a point is moved.'),
  );
  ws.addEventListener('dragover', (e) => { e.preventDefault(); ws.classList.add('over'); });
  ws.addEventListener('dragleave', () => ws.classList.remove('over'));
  ws.addEventListener('drop', (e) => { e.preventDefault(); ws.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) openImportWizard(f, () => window.__rerender()); });

  // ---------- lift points table
  const pts = panel(
    null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Lift points'),
      el('div', { class: 'row' },
        el('button', { class: 'small', onclick: () => addAt(null) }, '+ Point'),
        el('button', { class: 'small', title: 'Creates 4 points at the top corners of the envelope, 300 mm from the edges', onclick: corners }, '4 top corners'),
      ),
    ),
    el('div', { class: 'tbl-wrap', id: 'lp-table' }),
  );

  const pad = panel(null, el('div', { id: 'padeye-panel' }));
  root.append(ws, el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, ident, pts), pad));
  renderPoints();
  renderPadeye();
  update(app.result);
  root._update = update;
}

function selectPoint(id) {
  lvState.selected = id;
  document.querySelectorAll('#lp-table tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === id));
  renderPadeye();
  views.forEach((v) => v.refresh());
}

function nextId(list) {
  const used = new Set(list.map((p) => p.id));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  return `P${list.length + 1}`;
}

function newPoint(list) {
  const ld = app.project.load;
  const last = list.find((p) => p.id === lvState.selected) || list[list.length - 1] || {};
  const zTop = (Number(ld.origin_mm?.z) || 0) + (Number(ld.dims_mm?.H) || 0);
  const { id: _i, x: _x, y: _y, z: _z, ...props } = last;
  return { padeye: true, swl_t: null, holeDia_mm: null, thk_mm: null, cheekThk_mm: 0, radius_mm: null, height_mm: null, azimuth_deg: null, ...props, id: nextId(list), x: 0, y: Number(ld.cog_mm?.y) || 0, z: last.z ?? zTop, used: true };
}

function addAt(key, a, b) {
  const list = app.project.load.liftPoints;
  const p = newPoint(list);
  if (key === 'xy') { p.x = a; p.y = b; }
  if (key === 'xz') { p.x = a; p.z = b; }
  list.push(p);
  lvState.selected = p.id;
  app.recompute();
  window.__rerender();
  toast(`Point ${p.id} added${key ? ` — set its ${key === 'xy' ? 'Z in the XZ view' : 'Y in the XY view'} or in the table` : ''}`);
}

function corners() {
  const ld = app.project.load;
  const o = ld.origin_mm, d = ld.dims_mm;
  const m = 300;
  const z = (o.z || 0) + (d.H || 0);
  const tpl = newPoint(ld.liftPoints);
  const mk = (id, x, y) => ({ ...tpl, id, x, y, z });
  ld.liftPoints = [mk('A', o.x + m, o.y + m), mk('B', o.x + d.L - m, o.y + m), mk('C', o.x + d.L - m, o.y + d.W - m), mk('D', o.x + m, o.y + d.W - m)];
  lvState.selected = 'A';
  app.recompute();
  window.__rerender();
}

function renderPoints() {
  const box = document.getElementById('lp-table');
  if (!box) return;
  const list = app.project.load.liftPoints;
  const head = ['Id', 'X', 'Y', 'Z', 'Used', 'Padeye', 'SWL (t)', 'Design force', 'Min WLL', ''];
  const tb = el('tbody');
  list.forEach((p, i) => {
    const b = `load.liftPoints.${i}.`;
    const tr = el('tr', { 'data-id': p.id, class: p.id === lvState.selected ? 'sel' : '', onclick: (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') selectPoint(p.id); } },
      el('td', { style: { width: '50px' } }, cell(`${b}id`, 'text', { onchange: () => { lvState.selected = app.project.load.liftPoints[i].id; app.recompute(); window.__rerender(); } })),
      ...['x', 'y', 'z'].map((k) => el('td', {}, cell(b + k, 'number', { onchange: () => app.recompute() }))),
      el('td', { style: { textAlign: 'center' } }, cell(`${b}used`, 'checkbox', { onchange: () => app.recompute() })),
      el('td', { style: { textAlign: 'center' } }, cell(`${b}padeye`, 'checkbox', { onchange: () => { app.recompute(); renderPadeye(); } })),
      el('td', {}, p.padeye === false ? el('span', { class: 'muted' }, 'n/a') : cell(`${b}swl_t`, 'number', { onchange: () => app.recompute() })),
      el('td', { class: 'num', 'data-k': 'F' }, '—'),
      el('td', { class: 'num', 'data-k': 'W' }, '—'),
      el('td', {}, el('button', { class: 'small danger', title: 'Delete', onclick: () => { list.splice(i, 1); app.recompute(); window.__rerender(); } }, '✕')),
    );
    tb.append(tr);
  });
  box.innerHTML = '';
  box.append(el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), tb));
  box.append(el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'Coordinates in mm in the load frame (Z up). Min WLL = design leg force (DAF × SKL × COG factor) — every component of the leg must have at least this WLL. Click a row to edit its padeye.'));
}

function renderPadeye() {
  const box = document.getElementById('padeye-panel');
  if (!box) return;
  box.innerHTML = '';
  const list = app.project.load.liftPoints;
  const i = list.findIndex((p) => p.id === lvState.selected);
  const p = list[i];
  if (!p) {
    box.append(el('h2', {}, 'Padeye'), el('p', { class: 'muted' }, 'Add or select a lift point.'));
    return;
  }
  const b = `load.liftPoints.${i}.`;
  box.append(
    el('div', { class: 'panel-head' },
      el('h2', {}, `Lift point ${p.id} — padeye`),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: p.padeye !== false, onchange: (e) => { p.padeye = e.target.checked; app.recompute(); renderPadeye(); renderPoints(); } }), 'This point has a padeye'),
    ),
  );
  if (p.padeye === false) {
    box.append(el('div', { class: 'note' }, 'No padeye at this point (sling choked or around a trunnion, hook point, etc.): the padeye / shackle fit and the lift point SWL are not checked. Choose the load-side connection (e.g. choked sling) on the Rigging page.'));
    return;
  }
  const on = () => app.recompute();
  box.append(
    el('div', { class: 'fields' },
      field({ label: 'SWL of the padeye', path: `${b}swl_t`, unit: 't', onchange: on }),
      field({ label: 'Main plate thickness', path: `${b}thk_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Cheek plate thickness (each)', path: `${b}cheekThk_mm`, unit: 'mm', onchange: on, hint: '0 if none' }),
      field({ label: 'Hole diameter', path: `${b}holeDia_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Outer radius at the hole', path: `${b}radius_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Hole centre height above base', path: `${b}height_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Plane azimuth', path: `${b}azimuth_deg`, unit: '°', onchange: on, hint: 'Plan angle of the padeye plane from X; empty = faces the hook' }),
    ),
    el('div', { class: 'row', style: { margin: '6px 0' } },
      el('button', { class: 'small', onclick: () => { const keys = ['padeye', 'swl_t', 'thk_mm', 'cheekThk_mm', 'holeDia_mm', 'radius_mm', 'height_mm']; list.forEach((q) => keys.forEach((k) => (q[k] = p[k]))); app.recompute(); toast(`Padeye of ${p.id} copied to all points`); } }, 'Copy to all points'),
    ),
    el('div', { id: 'padeye-fit' }),
    el('details', { class: 'sub' },
      el('summary', {}, 'Fit tolerances'),
      el('div', { class: 'fields' },
        field({ label: 'Max hole / pin clearance', path: 'load.padeyeRules.maxHoleClearance_mm', unit: 'mm', onchange: on }),
        field({ label: '… or % of pin Ø (larger of the two)', path: 'load.padeyeRules.maxHoleClearance_pct', unit: '%', onchange: on }),
        field({ label: 'Min padeye thickness / jaw width', path: 'load.padeyeRules.minThicknessRatio', unit: '', step: 0.05, onchange: on }),
      ),
      el('p', { class: 'muted', style: { fontSize: '12px' } },
        'Hole / pin clearance: the pin must pass through the hole (hole Ø > pin Ø) but a large gap concentrates the bearing stress on a small arc of the pin and of the hole, and lets the shackle rock. Usual rule: clearance ≤ max(3 mm; 4 % of the pin Ø) — otherwise take the next shackle size whose pin matches the hole, or bush the hole. ' +
        'Thickness / jaw: the padeye (main + cheek plates) must fit inside the jaw; if it is much thinner (< 75 % of the jaw) the shackle can slide sideways on the pin and load the bow off-centre — fit spacers or cheek plates. ' +
        'Inside length: the material above the hole plus what sits in the bow (sling, link) must fit inside the shackle.'),
    ),
  );
  updatePadeyeFit(app.result);
}

function updatePadeyeFit(res) {
  const box = document.getElementById('padeye-fit');
  if (!box) return;
  box.innerHTML = '';
  const p = app.project.load.liftPoints.find((q) => q.id === lvState.selected);
  const leg = res?.rig?.legs?.find((l) => l.pointId === p?.id && l.level !== 'top');
  const sh = leg?.parts?.[0]?.kind === 'shackle' ? leg.parts[0] : null;
  if (!p || p.padeye === false) return;
  if (!sh?.item) {
    box.append(el('div', { class: 'note warn' }, p.used === false ? 'Point not used in the lift.' : 'No shackle at this point: the leg assembly does not start with a shackle (see the Rigging page).'));
    return;
  }
  const rules = res.rules || {};
  const ctx = { ...sh.ctx, slingWidth: leg.parts[leg.li]?.kind === 'sling' ? leg.parts[leg.li].item?.dims?.width : null };
  const issues = shackleCompatibility(sh.item, ctx, rules);
  const fail = issues.some((x) => x.level === 'fail');
  const warn = issues.some((x) => x.level === 'warn');
  box.append(
    el('div', { class: `note ${fail ? 'fail' : warn ? 'warn' : 'ok'}` },
      el('b', {}, fail ? 'The shackle does NOT fit this padeye' : warn ? 'The shackle fits, with remarks' : 'The shackle fits this padeye'),
      ` — ${sh.item.name} (pin Ø${sh.item.dims.pinDia}, jaw ${sh.item.dims.jawWidth}, inside length ${sh.item.dims.insideLength} mm), min WLL ${fmt(sh.reqWll)} t`,
      issues.length ? el('ul', {}, issues.map((x) => el('li', {}, x.msg))) : null,
    ),
    figure(drawPadeyeFit(p, sh.item, { width: 520, height: 280 }), `padeye-${p.id}`),
  );
}

function renderDetected() {
  const box = document.getElementById('detected');
  if (!box) return;
  box.innerHTML = '';
  const d = app.detected;
  if (!d) return;
  const load = app.project.load;
  const items = [];
  const w = d.weights?.[0];
  if (w && Math.abs((Number(load.weight_t) || 0) - w.value) > 1e-6)
    items.push(el('span', {}, `Weight on the drawing: `, el('b', {}, `${fmt(w.value, 3)} t`), ' ', el('button', { class: 'small', onclick: () => { load.weight_t = Math.round(w.value * 1000) / 1000; load.weightBasis = 'drawing'; app.recompute(); window.__rerender(); } }, 'Use')));
  const c = d.cogs?.[0];
  if (c)
    items.push(el('span', {}, 'COG in the drawing text: ', el('b', {}, ['x', 'y', 'z'].filter((k) => c.value[k] != null).map((k) => `${k.toUpperCase()} ${c.value[k]}`).join(' · ')), ' ',
      el('button', { class: 'small', onclick: () => { Object.assign(load.cog_mm, c.value); load.cogBasis = 'drawing'; app.recompute(); window.__rerender(); } }, 'Use')));
  (d.cogMarks || []).slice(0, 2).forEach((m) => {
    const [A, B] = m.view === 'xy' ? ['x', 'y'] : ['x', 'z'];
    items.push(el('span', {}, `COG mark on the ${m.view.toUpperCase()} view: `, el('b', {}, `${A.toUpperCase()} ${m.a} · ${B.toUpperCase()} ${m.b}`), ' ',
      el('button', { class: 'small', onclick: () => { load.cog_mm[A] = m.a; load.cog_mm[B] = m.b; load.cogBasis = 'drawing'; app.recompute(); window.__rerender(); } }, 'Use')));
  });
  if (items.length) box.append(el('div', { class: 'note info detected' }, el('b', {}, 'Found on the drawing — '), ...items.flatMap((x, i) => (i ? [' · ', x] : [x]))));
}

function update(res) {
  const w = document.getElementById('wdesign');
  if (w) w.textContent = res?.rig?.W ? `${fmt(res.rig.W)} t` : '—';
  views.forEach((v) => v.refresh());
  document.querySelectorAll('#lp-table tbody tr').forEach((tr) => {
    const leg = res?.rig?.legs?.find((l) => l.pointId === tr.dataset.id && l.level !== 'top');
    const F = tr.querySelector('[data-k="F"]');
    const W = tr.querySelector('[data-k="W"]');
    if (F) F.textContent = leg ? `${fmt(leg.Fdesign)} t` : '—';
    if (W) W.textContent = leg ? `${fmt(Math.max(...leg.parts.map((q) => q.reqWll || 0)))} t` : '—';
  });
  updatePadeyeFit(res);
  renderDetected();
}
