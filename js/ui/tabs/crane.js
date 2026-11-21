import { app } from '../app.js';
import { el, field, panel, toast } from '../dom.js';
import { drawCapacityChart } from '../../draw/chart.js';
import { figure } from '../figure.js';
import { openChartReader } from '../chartreader.js';
import { chartCapacity } from '../../engine/crane.js';

const LIB_KEY = 'liftplanner.cranes.v1';
const readLib = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch { return []; } };
const writeLib = (l) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(l)); return true; } catch { toast('Cannot save in this browser'); return false; } };
const clone = (o) => JSON.parse(JSON.stringify(o));

const TYPES = [
  ['mobile', 'Mobile / telescopic crane'],
  ['crawler', 'Crawler crane (lattice boom)'],
  ['offshore', 'Offshore / pedestal crane'],
  ['vessel', 'Vessel crane (heavy lift)'],
  ['tower', 'Tower crane'],
  ['other', 'Other'],
];

export function render(root) {
  const C = 'crane.';
  const ident = panel(
    'Crane #1 — used for the calculation',
    el('div', { class: 'fields' },
      field({ label: 'Crane', path: `${C}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Configuration', path: `${C}configuration`, type: 'text', cls: 'span2', hint: 'Boom, counterweight, offshore / harbour…' }),
      field({ label: 'Type', path: `${C}type`, type: 'select', options: TYPES }),
      field({ label: 'Critical lift threshold', path: `${C}utilLimit`, type: 'percent', hint: 'Utilisation above which the lift is critical' }),
      field({ label: 'Working radius', path: `${C}radius_m`, unit: 'm', hint: 'Largest radius of the lift: the SWL is checked there' }),
    ),
    el('div', { id: 'chart-range', class: 'cards', style: { marginTop: '10px' } }),
    el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Only the load chart is used: SWL as a function of the radius, between its minimum and maximum radius. Enter the chart of the configuration and mode used (the hook block and rigging deductions are as stated by the crane manual).'),
  );

  const pdfIn = el('input', { type: 'file', accept: 'application/pdf,image/*', class: 'hide', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openChartReader(f, () => { renderTable(); window.__rerender?.(); }); } });
  const chartP = panel(
    null,
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'Load chart'),
      el(
        'div',
        { class: 'row' },
        field({ path: `${C}interpolation`, type: 'select', options: [['step', 'Conservative reading (next tabulated radius)'], ['linear', 'Linear interpolation']] }),
      ),
    ),
    el('div', { id: 'chart-table', class: 'tbl-wrap', style: { maxHeight: '420px', overflowY: 'auto' } }),
    el(
      'div',
      { class: 'row', style: { marginTop: '8px' } },
      el('button', { class: 'small', onclick: () => { app.project.crane.chart.rows.push([null, ...app.project.crane.chart.columns.map(() => null)]); renderTable(); } }, '+ Row'),
      el('button', { class: 'small', onclick: addColumn }, '+ Column'),
      el('button', { class: 'small', onclick: () => document.getElementById('paste-box').classList.toggle('hide') }, 'Paste from Excel…'),
      el('button', { class: 'small primary', onclick: () => pdfIn.click() }, 'Read a load chart (PDF or image)…'),
      pdfIn,
    ),
    el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Load chart reader: a graph (curves) is read by calibrating its axes and clicking the curve; a table by framing it; or Claude reads it with your API key. Works with PDF (vector or scanned) and images.'),
    el(
      'div',
      { id: 'paste-box', class: 'hide', style: { marginTop: '8px' } },
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Paste a table (columns separated by tab or semicolon): 1st column = radius (m), next columns = capacities (t). A header row is detected automatically.'),
      el('textarea', { id: 'paste-area', style: { width: '100%', minHeight: '120px', fontFamily: 'var(--mono)', fontSize: '12px' } }),
      el('button', { class: 'small primary', onclick: pasteChart }, 'Replace the chart'),
    ),
  );

  const graph = panel(null, el('div', { id: 'cap-chart' }));
  root.append(libraryPanel(), el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, ident, graph), chartP), otherCranesPanel());
  renderTable();
  update(app.result);
  root._update = update;
}

function renderTable() {
  const box = document.getElementById('chart-table');
  if (!box) return;
  const ch = app.project.crane.chart;
  const active = Number(app.project.crane.activeColumn) || 0;
  const thead = el(
    'tr',
    {},
    el('th', {}, 'Radius (m)'),
    ch.columns.map((c, j) =>
      el(
        'th',
        { style: { minWidth: '130px' } },
        el(
          'div',
          { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
          el('input', { type: 'radio', name: 'activecol', checked: j === active, title: 'Column used for the checks', onchange: () => { app.set('crane.activeColumn', j); app.recompute(); } }),
          el('input', { type: 'text', value: c, onchange: (e) => { ch.columns[j] = e.target.value; app.recompute(); } }),
          ch.columns.length > 1 ? el('button', { class: 'small danger', title: 'Delete column', onclick: () => { ch.columns.splice(j, 1); ch.rows.forEach((r) => r.splice(j + 1, 1)); if (active >= ch.columns.length) app.set('crane.activeColumn', 0, { silent: true }); app.recompute(); renderTable(); } }, '✕') : null,
        ),
      ),
    ),
    el('th', {}, ''),
  );
  const tb = el('tbody');
  ch.rows.forEach((r, i) => {
    tb.append(
      el(
        'tr',
        {},
        [0, ...ch.columns.map((_, j) => j + 1)].map((k) =>
          el('td', {}, el('input', { type: 'number', step: 'any', value: r[k] ?? '', onchange: (e) => { r[k] = e.target.value === '' ? null : Number(e.target.value); app.recompute(); } })),
        ),
        el('td', {}, el('button', { class: 'small danger', onclick: () => { ch.rows.splice(i, 1); app.recompute(); renderTable(); } }, '✕')),
      ),
    );
  });
  box.innerHTML = '';
  box.append(el('table', { class: 'data compact' }, el('thead', {}, thead), tb));
}

function addColumn() {
  const ch = app.project.crane.chart;
  ch.columns.push(`Config ${ch.columns.length + 1}`);
  ch.rows.forEach((r) => r.push(null));
  app.recompute();
  renderTable();
}

function pasteChart() {
  const raw = document.getElementById('paste-area').value.trim();
  if (!raw) return;
  const lines = raw.split(/\r?\n/).map((l) => l.split(/\t|;/).map((c) => c.trim()));
  const num = (s) => {
    const v = Number(String(s).replace(/\s/g, '').replace(',', '.'));
    return isFinite(v) && s !== '' ? v : null;
  };
  let header = null;
  if (lines[0].slice(1).some((c) => num(c) == null && c !== '')) header = lines.shift();
  const ncol = Math.max(...lines.map((l) => l.length)) - 1;
  const rows = lines.map((l) => [num(l[0]), ...[...Array(ncol)].map((_, j) => num(l[j + 1]))]).filter((r) => r[0] != null);
  if (!rows.length) return toast('No valid row');
  app.project.crane.chart = { columns: header ? header.slice(1, ncol + 1) : [...Array(ncol)].map((_, j) => `Config ${j + 1}`), rows };
  app.set('crane.activeColumn', 0, { silent: true });
  app.recompute();
  renderTable();
  toast(`${rows.length} rows imported`);
}

function update(res) {
  const cr = document.getElementById('chart-range');
  if (cr) {
    cr.innerHTML = '';
    const r = res?.chartRange;
    const c = (k, v) => el('div', { class: 'card' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v));
    cr.append(c('Min radius', r ? `${r.rMin} m` : '—'), c('Max radius', r ? `${r.rMax} m` : '—'), c('Max SWL', r ? `${r.capMax} t` : '—'), c('Hook load', res?.shlCrane ? `${res.shlCrane.toFixed(2)} t` : '—'));
  }
  const box = document.getElementById('cap-chart');
  if (!box) return;
  box.innerHTML = '';
  box.append(figure(drawCapacityChart(app.project, res, { width: 640, height: 320 }), 'capacity-curve'));
}

// ---------- crane library (kept in this browser, exportable) ----------
function libraryPanel() {
  const box = el('div', { id: 'crane-lib' });
  const p = panel(null, el('div', { class: 'panel-head' }, el('h2', {}, 'My cranes'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Save a crane once (name, type, load chart) and reuse it in every project.')), box);
  renderLib(box);
  return p;
}

function renderLib(box = document.getElementById('crane-lib')) {
  if (!box) return;
  const lib = readLib();
  const sel = el('select', { style: { minWidth: '260px' } }, el('option', { value: '' }, lib.length ? '— choose a saved crane —' : '— no saved crane yet —'));
  lib.forEach((c, i) => sel.append(el('option', { value: i }, `${c.name || 'Crane'}${c.configuration ? ` — ${c.configuration}` : ''}`)));
  const imp = el('input', { type: 'file', accept: '.json,application/json', class: 'hide', onchange: importLib });
  box.innerHTML = '';
  box.append(el('div', { class: 'row' },
    sel,
    el('button', { class: 'small primary', onclick: () => { if (sel.value === '') return toast('Choose a crane'); useCrane(lib[Number(sel.value)]); } }, 'Use this crane'),
    el('button', { class: 'small danger', onclick: () => { if (sel.value === '') return; const c = lib[Number(sel.value)]; if (!confirm(`Remove "${c.name}" from my cranes?`)) return; lib.splice(Number(sel.value), 1); writeLib(lib); renderLib(); } }, 'Remove'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'small', onclick: saveCurrent }, 'Save the current crane'),
    el('button', { class: 'small', onclick: exportLib, disabled: !lib.length }, 'Export…'),
    el('button', { class: 'small', onclick: () => imp.click() }, 'Import…'),
    imp,
  ));
}

function saveCurrent() {
  const c = app.project.crane;
  const name = (c.name || '').trim();
  if (!name) return toast('Give the crane a name first');
  if (!c.chart?.rows?.length) return toast('The load chart is empty');
  const lib = readLib();
  const keep = { name, configuration: c.configuration || '', type: c.type, utilLimit: c.utilLimit, interpolation: c.interpolation, chart: clone(c.chart), activeColumn: c.activeColumn || 0, savedAt: new Date().toISOString() };
  const i = lib.findIndex((x) => x.name === keep.name && (x.configuration || '') === keep.configuration);
  if (i >= 0) { if (!confirm(`"${name}" is already saved. Replace it?`)) return; lib[i] = keep; } else lib.push(keep);
  if (writeLib(lib)) { toast(`"${name}" saved in my cranes`); renderLib(); }
}

function useCrane(c) {
  if (!c) return;
  const cur = app.project.crane;
  Object.assign(cur, clone({ name: c.name, configuration: c.configuration, type: c.type, utilLimit: c.utilLimit ?? cur.utilLimit, interpolation: c.interpolation || cur.interpolation, chart: c.chart, activeColumn: c.activeColumn || 0 }));
  app.recompute();
  window.__rerender?.();
  toast(`${c.name} loaded`);
}

function exportLib() {
  const blob = new Blob([JSON.stringify(readLib(), null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'liftplanner-cranes.json' });
  document.body.append(a);
  a.click();
  a.remove();
}

async function importLib(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const list = (Array.isArray(data) ? data : [data]).filter((c) => c && c.name && c.chart?.rows);
    if (!list.length) return toast('No crane found in this file');
    const lib = readLib();
    for (const c of list) {
      const i = lib.findIndex((x) => x.name === c.name && (x.configuration || '') === (c.configuration || ''));
      if (i >= 0) lib[i] = c; else lib.push(c);
    }
    if (writeLib(lib)) { toast(`${list.length} crane(s) imported`); renderLib(); }
  } catch (err) {
    toast(`Cannot read the file: ${err.message}`);
  }
}

// ---------- other cranes (Crane #2, #3…): shown in the lift plan, the calculation uses Crane #1 ----------
/** SWL of a crane at its working radius: from its load chart, else the value typed. */
export function craneSwl(c) {
  if (!c) return null;
  if (c.chart?.rows?.length && +c.radius_m > 0) {
    const v = chartCapacity(c.chart, +c.radius_m, Number(c.activeColumn) || 0, c.interpolation || 'step');
    return v.status === 'ok' && v.capacity > 0 ? Math.round(v.capacity * 100) / 100 : null;
  }
  return +c.swl_t > 0 ? +c.swl_t : null;
}

const newCrane = () => ({ name: '', configuration: '', type: 'offshore', role: '', radius_m: null, swl_t: null, chart: null, activeColumn: 0, interpolation: 'step' });

function otherCranesPanel() {
  const p = app.project;
  const list = (p.otherCranes = p.otherCranes || []);
  const wrap = el('div', { class: 'grid' });
  list.forEach((c, i) => wrap.append(otherCranePanel(c, i)));
  wrap.append(el('div', { class: 'row' },
    el('button', { class: 'small primary', onclick: () => { list.push(newCrane()); app.recompute(); window.__rerender(); } }, `+ Add Crane #${list.length + 2}`),
    el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Other cranes of the operation are listed in the lift plan with their radius and SWL; the calculation uses Crane #1.')));
  return wrap;
}

function otherCranePanel(c, i) {
  const p = app.project;
  const P = `otherCranes.${i}.`;
  const n = i + 2;
  const lib = readLib();
  const libSel = el('select', { onchange: (e) => { const l = lib[Number(e.target.value)]; if (!l) return; Object.assign(c, clone({ name: l.name, configuration: l.configuration, type: l.type, chart: l.chart, activeColumn: l.activeColumn || 0, interpolation: l.interpolation || 'step' })); app.recompute(); window.__rerender(); toast(`${l.name} set as Crane #${n}`); } },
    el('option', { value: '' }, lib.length ? '— fill from my cranes —' : '— no saved crane —'), ...lib.map((l, k) => el('option', { value: k }, `${l.name}${l.configuration ? ` — ${l.configuration}` : ''}`)));
  const hasChart = !!c.chart?.rows?.length;
  const swl = craneSwl(c);
  return panel(null,
    el('div', { class: 'panel-head' }, el('h2', {}, `Crane #${n}`), el('span', { class: 'spacer' }),
      el('button', { class: 'small', title: `Crane #${n} becomes Crane #1 (used for the calculation) and Crane #1 takes its place`, onclick: () => makeFirst(i) }, '⇄ Make it Crane #1'),
      el('button', { class: 'small danger', onclick: () => { p.otherCranes.splice(i, 1); app.recompute(); window.__rerender(); } }, 'Remove')),
    el('div', { class: 'fields' },
      field({ label: 'Crane', path: `${P}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Configuration', path: `${P}configuration`, type: 'text', cls: 'span2' }),
      field({ label: 'Type', path: `${P}type`, type: 'select', options: TYPES }),
      field({ label: 'Role in the operation', path: `${P}role`, type: 'text', hint: 'e.g. standby, tailing, assist, back-up' }),
      field({ label: 'Working radius', path: `${P}radius_m`, unit: 'm' }),
      hasChart ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'SWL at this radius'), el('div', { class: 'card' }, swl != null ? `${swl} t (from its load chart)` : 'outside its load chart'))
        : field({ label: 'SWL at this radius', path: `${P}swl_t`, unit: 't', hint: 'From its load chart' })),
    el('div', { class: 'row', style: { marginTop: '6px' } }, libSel, hasChart ? el('span', { class: 'muted', style: { fontSize: '12px' } }, `Load chart: ${c.chart.rows.length} rows (${c.chart.columns[Number(c.activeColumn) || 0] || ''})`) : null));
}

function makeFirst(i) {
  const p = app.project;
  const c1 = p.crane, c = p.otherCranes[i];
  if (!c) return;
  // no load chart but an SWL at the working radius: it becomes a one-line load chart
  const oneRow = !c.chart?.rows?.length && +c.swl_t > 0 && +c.radius_m > 0 ? { columns: ['SWL'], rows: [[+c.radius_m, +c.swl_t]] } : null;
  if (!c.chart?.rows?.length && !oneRow && !confirm('This crane has no load chart nor SWL: after the exchange, enter its load chart for the calculation. Exchange anyway?')) return;
  const keep = { utilLimit: c1.utilLimit ?? 0.85, interpolation: 'step', activeColumn: 0, chart: oneRow || { columns: ['SWL'], rows: [] } };
  p.crane = { ...keep, ...clone(c), chart: c.chart?.rows?.length ? clone(c.chart) : keep.chart };
  delete p.crane.swl_t;
  delete p.crane.role;
  p.otherCranes[i] = { ...clone(c1), role: c.role || '', swl_t: null };
  app.recompute();
  window.__rerender();
  toast(`${p.crane.name || `Crane #${i + 2}`} is now Crane #1`);
}
