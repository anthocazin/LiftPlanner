import { app } from '../app.js';
import { el, field, panel, toast } from '../dom.js';
import { drawCapacityChart } from '../../draw/chart.js';
import { figure } from '../figure.js';

const TYPES = [
  ['mobile', 'Grue mobile / télescopique'],
  ['crawler', 'Grue sur chenilles (treillis)'],
  ['offshore', 'Grue offshore / pedestal'],
  ['vessel', 'Grue de navire (heavy lift)'],
  ['tower', 'Grue à tour'],
  ['other', 'Autre'],
];

export function render(root) {
  const C = 'crane.';
  const ident = panel(
    'Grue',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Désignation / configuration', path: `${C}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Type', path: `${C}type`, type: 'select', options: TYPES }),
      field({ label: 'Moufle / crochet', path: `${C}hookBlock_t`, unit: 't', hint: 'Poids du moufle + câble si non inclus' }),
      field({ label: 'SWL du crochet', path: `${C}hookSWL_t`, unit: 't' }),
      field({ label: 'Largeur d\'assise crochet', path: `${C}hookSeatWidth_mm`, unit: 'mm', hint: 'Pour les élingues posées dans le crochet' }),
      field({ label: 'Seuil levage critique', path: `${C}utilLimit`, type: 'percent', hint: 'Utilisation au-delà de laquelle le levage est critique' }),
      field({ label: 'Rayon de travail (sans storyboard)', path: `${C}radius_m`, unit: 'm' }),
      field({ label: 'Déduire le moufle de la capacité', path: `${C}deductHookBlock`, type: 'checkbox' }),
    ),
    el('h3', {}, 'Géométrie de flèche (pour hauteurs sous crochet et schémas)'),
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Longueur de flèche', path: `${C}boom.length`, unit: 'm' }),
      field({ label: 'Hauteur du pied de flèche', path: `${C}boom.pivotHeight`, unit: 'm', hint: 'Au-dessus du sol / pont de référence' }),
      field({ label: 'Déport du pied / axe d\'orientation', path: `${C}boom.pivotOffset`, unit: 'm' }),
      field({ label: 'Angle de flèche mini', path: `${C}boom.minAngle_deg`, unit: '°' }),
      field({ label: 'Angle de flèche maxi', path: `${C}boom.maxAngle_deg`, unit: '°' }),
      field({ label: 'Distance mini tête de flèche → crochet', path: `${C}minTipToHook`, unit: 'm', hint: 'Fin de course / anti-collision moufle' }),
    ),
  );

  const chartP = panel(
    null,
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'Tableau de charge'),
      el(
        'div',
        { class: 'row' },
        field({ path: `${C}interpolation`, type: 'select', options: [['step', 'Lecture conservative (rayon tabulé supérieur)'], ['linear', 'Interpolation linéaire']] }),
      ),
    ),
    el('div', { id: 'chart-table', class: 'tbl-wrap', style: { maxHeight: '420px', overflowY: 'auto' } }),
    el(
      'div',
      { class: 'row', style: { marginTop: '8px' } },
      el('button', { class: 'small', onclick: () => { app.project.crane.chart.rows.push([null, ...app.project.crane.chart.columns.map(() => null)]); renderTable(); } }, '+ Ligne'),
      el('button', { class: 'small', onclick: addColumn }, '+ Colonne'),
      el('button', { class: 'small', onclick: () => document.getElementById('paste-box').classList.toggle('hide') }, 'Coller depuis Excel…'),
    ),
    el(
      'div',
      { id: 'paste-box', class: 'hide', style: { marginTop: '8px' } },
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Collez un tableau (colonnes séparées par tabulation ou point-virgule) : 1re colonne = rayon (m), suivantes = capacités (t). Une 1re ligne d\'en-têtes est reconnue automatiquement.'),
      el('textarea', { id: 'paste-area', style: { width: '100%', minHeight: '120px', fontFamily: 'var(--mono)', fontSize: '12px' } }),
      el('button', { class: 'small primary', onclick: pasteChart }, 'Remplacer le tableau'),
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
    el('th', {}, 'Rayon (m)'),
    ch.columns.map((c, j) =>
      el(
        'th',
        { style: { minWidth: '130px' } },
        el(
          'div',
          { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
          el('input', { type: 'radio', name: 'activecol', checked: j === active, title: 'Colonne utilisée pour les vérifications', onchange: () => { app.set('crane.activeColumn', j); app.recompute(); } }),
          el('input', { type: 'text', value: c, onchange: (e) => { ch.columns[j] = e.target.value; app.recompute(); } }),
          ch.columns.length > 1 ? el('button', { class: 'small danger', title: 'Supprimer la colonne', onclick: () => { ch.columns.splice(j, 1); ch.rows.forEach((r) => r.splice(j + 1, 1)); if (active >= ch.columns.length) app.set('crane.activeColumn', 0, { silent: true }); app.recompute(); renderTable(); } }, '✕') : null,
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
  if (!rows.length) return toast('Aucune ligne valide');
  app.project.crane.chart = { columns: header ? header.slice(1, ncol + 1) : [...Array(ncol)].map((_, j) => `Config ${j + 1}`), rows };
  app.set('crane.activeColumn', 0, { silent: true });
  app.recompute();
  renderTable();
  toast(`${rows.length} lignes importées`);
}

function update(res) {
  const box = document.getElementById('cap-chart');
  if (!box) return;
  box.innerHTML = '';
  box.append(figure(drawCapacityChart(app.project, res, { width: 640, height: 320 }), 'courbe-capacite'));
}
