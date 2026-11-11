// Load page: visual workspace (XY plan + XZ elevation on the imported drawing), weight, COG,
// lift points and padeye characteristics with the shackle fit.
import { app } from '../app.js';
import { el, field, cell, panel, fmt, toast } from '../dom.js';
import { WCF_PRESETS } from '../../engine/factors.js';
import { shackleCompatibility, listPadeyes, getItem, listByType, niceName } from '../../catalog/index.js';
import { pointKind } from '../../engine/rigging.js';
import { drawPadeyeFit } from '../../draw/detail.js';
import { figure } from '../figure.js';
import { lvState } from '../loadview.js';
import { loadSetup, refreshSetup } from '../loadsetup.js';

const views = [];

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
    el('div', { class: 'fields', id: 'cog-fields' },
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
  root.append(loadSetup(), el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, ident, pts), pad));
  renderPoints();
  renderPadeye();
  update(app.result);
  root._update = update;
}

function selectPoint(id) {
  lvState.selected = id;
  document.querySelectorAll('#lp-table tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === id));
  renderPadeye();
  refreshSetup();
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
  const head = ['Id', 'X', 'Y', 'Z', 'Used', 'Type', 'SWL (t)', 'Design force', 'Min WLL', ''];
  const tb = el('tbody');
  list.forEach((p, i) => {
    const b = `load.liftPoints.${i}.`;
    const tr = el('tr', { 'data-id': p.id, class: p.id === lvState.selected ? 'sel' : '', onclick: (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') selectPoint(p.id); } },
      el('td', { style: { width: '50px' } }, cell(`${b}id`, 'text', { onchange: () => { lvState.selected = app.project.load.liftPoints[i].id; app.recompute(); window.__rerender(); } })),
      ...['x', 'y', 'z'].map((k) => el('td', {}, cell(b + k, 'number', { onchange: () => { p.picks = {}; app.recompute(); } }))),
      el('td', { style: { textAlign: 'center' } }, cell(`${b}used`, 'checkbox', { onchange: () => app.recompute() })),
      el('td', {}, { padeye: 'pad eye', ring: 'ring', none: '—' }[pointKind(p)]),
      el('td', {}, pointKind(p) === 'none' ? el('span', { class: 'muted' }, 'n/a') : cell(`${b}swl_t`, 'number', { onchange: () => app.recompute() })),
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
  const kind = pointKind(p);
  const kindSel = el('select', { onchange: (e) => { p.kind = e.target.value; p.padeye = e.target.value === 'padeye'; app.recompute(); renderPadeye(); renderPoints(); } },
    [['padeye', 'Pad eye (shackle pin in a hole)'], ['ring', 'Anchor point / eye bolt (ring)'], ['none', 'None — sling choked, trunnion, hook point…']].map(([v, t]) => el('option', { value: v, selected: kind === v }, t)));
  box.append(
    el('div', { class: 'panel-head' }, el('h2', {}, `Lift point ${p.id}`), el('label', { class: 'field', style: { minWidth: '280px' } }, kindSel)),
  );
  if (kind === 'none') {
    box.append(el('div', { class: 'note' }, 'No pad eye at this point (sling choked or around a trunnion, hook point, etc.): the pad eye / shackle fit and the lift point SWL are not checked. Choose the load-side connection (e.g. choked round sling) on the Rigging page.'));
    return;
  }
  if (kind === 'ring') {
    const on2 = () => { app.recompute(); renderPadeye(); };
    const rs = el('select', { onchange: (e) => { const it = getItem(e.target.value); p.ringStd = e.target.value || null; if (it) Object.assign(p, { swl_t: it.wll_t, ringBar_mm: it.dims.bar, ringIn_mm: it.dims.inW }); on2(); renderPoints(); } });
    rs.append(el('option', { value: '' }, 'Custom (type the dimensions)'));
    listByType('ring').forEach((it) => rs.append(el('option', { value: it.id, selected: p.ringStd === it.id }, niceName(it))));
    const it = getItem(p.ringStd);
    const leg = app.result?.rig?.legs?.find((l) => l.pointId === p.id && l.level !== 'top');
    const first = leg?.parts?.[0];
    const issues = [];
    if (first?.item?.type === 'shackle') {
      const d = first.item.dims;
      if (Number(p.ringBar_mm) > d.jawWidth) issues.push(`ring bar Ø${p.ringBar_mm} > shackle jaw ${d.jawWidth} mm`);
      if (Number(p.ringIn_mm) && d.pinDia > Number(p.ringIn_mm)) issues.push(`shackle pin Ø${d.pinDia} > ring inside ${p.ringIn_mm} mm`);
    }
    box.append(
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Standard anchor point / eye bolt'), rs),
      it ? el('div', { class: 'muted', style: { fontSize: '12px', margin: '4px 0 8px' } }, `${it.name}: bar Ø${it.dims.bar}, inside ${it.dims.inW}${it.dims.inL && it.dims.inL !== it.dims.inW ? ` × ${it.dims.inL}` : ''} mm${it.note ? ` — ${it.note}` : ''}`) : null,
      el('div', { class: 'fields' },
        field({ label: 'SWL of the lift point', path: `${b}swl_t`, unit: 't', onchange: on2 }),
        field({ label: 'Ring bar Ø', path: `${b}ringBar_mm`, unit: 'mm', onchange: on2 }),
        field({ label: 'Ring inside width', path: `${b}ringIn_mm`, unit: 'mm', onchange: on2 }),
      ),
      first?.item ? el('div', { class: `note ${issues.length ? 'fail' : 'ok'}` }, issues.length ? `${niceName(first.item)} does not fit: ${issues.join('; ')}` : `${niceName(first.item)} fits the ring (bar in the jaw, pin through the ring).`) : null,
    );
    return;
  }
  const on = () => { p.padeyeStd = null; app.recompute(); renderPadeye(); };
  const std = el('select', { onchange: (e) => applyStd(p, e.target.value) });
  std.append(el('option', { value: '' }, 'Custom (type the dimensions)'), el('option', { value: 'auto' }, 'Auto — smallest standard pad eye for the leg force'));
  listPadeyes().forEach((pe) => std.append(el('option', { value: pe.id, selected: p.padeyeStd === pe.id }, `Pad eye S ${pe.wll_t} t — shackle ${pe.shackleSize} — ${pe.stock}`)));
  const sel = getItem(p.padeyeStd);
  box.append(
    el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Standard pad eye (type S)'), std),
    sel ? el('div', { class: 'muted', style: { fontSize: '12px', margin: '4px 0 8px' } },
      `${sel.stock}: L ${sel.dims.L} · A ${sel.dims.A} · H Ø${sel.dims.H} · R ${sel.dims.R} · t ${sel.dims.t} · T ${sel.dims.T} mm · ${sel.weight_kg} kg · wire ${sel.wire}. Datasheet: T ≥ 75 % of the shackle inside width, H ≤ 106 % of the pin Ø.`) : null,
    el('div', { class: 'fields' },
      field({ label: 'SWL of the padeye', path: `${b}swl_t`, unit: 't', onchange: on }),
      field({ label: 'Main plate thickness', path: `${b}thk_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Cheek plate thickness (each)', path: `${b}cheekThk_mm`, unit: 'mm', onchange: on, hint: '0 if none' }),
      field({ label: 'Hole diameter', path: `${b}holeDia_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Outer radius at the hole', path: `${b}radius_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Hole centre height above base (A)', path: `${b}height_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Base length (L)', path: `${b}baseL_mm`, unit: 'mm', onchange: on }),
      field({ label: 'Plane azimuth', path: `${b}azimuth_deg`, unit: '°', onchange: on, hint: 'Plan angle of the padeye plane from X; empty = faces the hook' }),
    ),
    el('div', { class: 'row', style: { margin: '6px 0' } },
      el('button', { class: 'small', onclick: () => { const keys = ['padeye', 'padeyeStd', 'swl_t', 'thk_mm', 'cheekThk_mm', 'holeDia_mm', 'radius_mm', 'height_mm', 'baseL_mm']; list.forEach((q) => keys.forEach((k) => (q[k] = p[k]))); app.recompute(); toast(`Padeye of ${p.id} copied to all points`); } }, 'Copy to all points'),
    ),
    el('div', { id: 'padeye-fit' }),
    el('details', { class: 'sub' },
      el('summary', {}, 'Fit tolerances'),
      el('div', { class: 'fields' },
        field({ label: 'Max hole / pin clearance', path: 'load.padeyeRules.maxHoleClearance_mm', unit: 'mm', onchange: on }),
        field({ label: '… or % of pin Ø (larger of the two)', path: 'load.padeyeRules.maxHoleClearance_pct', unit: '%', onchange: on }),
        field({ label: 'Min padeye thickness / jaw width', path: 'load.padeyeRules.minThicknessRatio', unit: '', step: 0.05, onchange: on }),
        field({ label: 'Max hole Ø / pin Ø (pad eye datasheet 1.06)', path: 'load.padeyeRules.maxHoleRatio', unit: '×', step: 0.01, onchange: on }),
      ),
      el('p', { class: 'muted', style: { fontSize: '12px' } },
        'Hole / pin clearance: the pin must pass through the hole (hole Ø > pin Ø) but a large gap concentrates the bearing stress on a small arc of the pin and of the hole, and lets the shackle rock. Usual rule: clearance ≤ max(3 mm; 4 % of the pin Ø) — otherwise take the next shackle size whose pin matches the hole, or bush the hole. ' +
        'Thickness / jaw: the padeye (main + cheek plates) must fit inside the jaw; if it is much thinner (< 75 % of the jaw) the shackle can slide sideways on the pin and load the bow off-centre — fit spacers or cheek plates. ' +
        'Inside length: the material above the hole plus what sits in the bow (sling, link) must fit inside the shackle.'),
    ),
  );
  updatePadeyeFit(app.result);
}

/** Fills the padeye of a point from the standard table (or the smallest one for the leg force). */
function applyStd(p, id) {
  let pe = id && id !== 'auto' ? getItem(id) : null;
  if (id === 'auto') {
    const leg = app.result?.rig?.legs?.find((l) => l.pointId === p.id && l.level !== 'top');
    const F = leg?.Fdesign || 0;
    pe = listPadeyes().sort((a, b) => a.wll_t - b.wll_t).find((x) => x.wll_t >= F) || null;
    if (!pe) { toast('No standard pad eye is large enough'); return; }
    toast(`Pad eye S ${pe.wll_t} t for a design force of ${fmt(F)} t`);
  }
  if (!pe) { p.padeyeStd = null; renderPadeye(); return; }
  Object.assign(p, { padeye: true, padeyeStd: pe.id, swl_t: pe.wll_t, holeDia_mm: pe.dims.H, thk_mm: pe.dims.t, cheekThk_mm: pe.dims.cheek, radius_mm: pe.dims.R, height_mm: pe.dims.A, baseL_mm: pe.dims.L });
  app.recompute();
  renderPadeye();
  renderPoints();
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

function syncCogFields() {
  const box = document.getElementById('cog-fields');
  if (!box || box.contains(document.activeElement)) return;
  const c = app.project.load.cog_mm;
  const ins = box.querySelectorAll('input');
  [c.x, c.y, c.z].forEach((v, i) => { if (ins[i]) ins[i].value = v ?? ''; });
  const sel = box.querySelector('select');
  if (sel) sel.value = app.project.load.cogBasis || 'drawing';
}

function update(res) {
  syncCogFields();
  if (!document.querySelector('#lp-table')?.contains(document.activeElement)) {
    document.querySelectorAll('#lp-table tbody tr').forEach((tr, i) => {
      const p = app.project.load.liftPoints[i];
      const ins = tr.querySelectorAll('input[type=number]');
      if (p && ins.length >= 3) ['x', 'y', 'z'].forEach((k, j) => (ins[j].value = p[k] ?? ''));
    });
  }
  const w = document.getElementById('wdesign');
  if (w) w.textContent = res?.rig?.W ? `${fmt(res.rig.W)} t` : '—';
  refreshSetup();
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
