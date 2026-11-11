import { app } from '../app.js';
import { el, field, panel, toast } from '../dom.js';
import { drawCapacityChart } from '../../draw/chart.js';
import { figure } from '../figure.js';

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
    'Crane',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Crane / configuration', path: `${C}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Type', path: `${C}type`, type: 'select', options: TYPES }),
      field({ label: 'Hook block', path: `${C}hookBlock_t`, unit: 't', hint: 'Hook block + rope weight if not included in the chart' }),
      field({ label: 'Hook SWL', path: `${C}hookSWL_t`, unit: 't' }),
      field({ label: 'Hook seat width', path: `${C}hookSeatWidth_mm`, unit: 'mm', hint: 'For slings placed directly on the hook' }),
      field({ label: 'Critical lift threshold', path: `${C}utilLimit`, type: 'percent', hint: 'Utilisation above which the lift is critical' }),
      field({ label: 'Working radius (without storyboard)', path: `${C}radius_m`, unit: 'm' }),
      field({ label: 'Deduct hook block from capacity', path: `${C}deductHookBlock`, type: 'checkbox' }),
    ),
    el('h3', {}, 'Boom geometry (hook heights and drawings)'),
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Boom length', path: `${C}boom.length`, unit: 'm' }),
      field({ label: 'Boom foot height', path: `${C}boom.pivotHeight`, unit: 'm', hint: 'Above the reference ground / deck' }),
      field({ label: 'Boom foot offset from slew axis', path: `${C}boom.pivotOffset`, unit: 'm' }),
      field({ label: 'Min boom angle', path: `${C}boom.minAngle_deg`, unit: '°' }),
      field({ label: 'Max boom angle', path: `${C}boom.maxAngle_deg`, unit: '°' }),
      field({ label: 'Min boom tip → hook distance', path: `${C}minTipToHook`, unit: 'm', hint: 'Anti-two-block limit' }),
    ),
  );

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
    ),
    el(
      'div',
      { id: 'paste-box', class: 'hide', style: { marginTop: '8px' } },
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Paste a table (columns separated by tab or semicolon): 1st column = radius (m), next columns = capacities (t). A header row is detected automatically.'),
      el('textarea', { id: 'paste-area', style: { width: '100%', minHeight: '120px', fontFamily: 'var(--mono)', fontSize: '12px' } }),
      el('button', { class: 'small primary', onclick: pasteChart }, 'Replace the chart'),
    ),
  );

  const graph = panel(null, el('div', { id: 'cap-chart' }));
  root.append(el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, ident, graph), chartP));
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
  const box = document.getElementById('cap-chart');
  if (!box) return;
  box.innerHTML = '';
  box.append(figure(drawCapacityChart(app.project, res, { width: 640, height: 320 }), 'capacity-curve'));
}
