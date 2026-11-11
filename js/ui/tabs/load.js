import { app } from '../app.js';
import { el, field, cell, panel, fmt } from '../dom.js';
import { WCF_PRESETS } from '../../engine/factors.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { figure } from '../figure.js';
import { pdfPanel } from '../pdfview.js';

export function render(root) {
  const L = 'load.';
  const presetField = field({
    label: 'Contingence de poids (WCF)',
    path: `${L}wcfPreset`,
    type: 'select',
    options: WCF_PRESETS.map((p) => [p.id, p.label]),
    onchange: (id) => {
      const pr = WCF_PRESETS.find((p) => p.id === id);
      if (pr?.value) app.set(`${L}wcf`, pr.value);
      window.__rerender();
    },
  });
  const ident = panel(
    'Charge',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Désignation', path: `${L}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Poids net', path: `${L}weight_t`, unit: 't', hint: 'Poids de la pièce seule' }),
      presetField,
      field({ label: 'Facteur WCF', path: `${L}wcf`, unit: '×', step: 0.01, onchange: () => app.set(`${L}wcfPreset`, 'custom', { silent: true }) }),
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Poids de calcul'), el('div', { class: 'card', id: 'wdesign' }, '—')),
    ),
    el('h3', {}, 'Encombrement (boîte englobante)'),
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Longueur L (X)', path: `${L}dims_mm.L`, unit: 'mm' }),
      field({ label: 'Largeur l (Y)', path: `${L}dims_mm.W`, unit: 'mm' }),
      field({ label: 'Hauteur H (Z)', path: `${L}dims_mm.H`, unit: 'mm' }),
      field({ label: 'Origine boîte X', path: `${L}origin_mm.x`, unit: 'mm', hint: 'Coin mini dans le repère pièce' }),
      field({ label: 'Origine boîte Y', path: `${L}origin_mm.y`, unit: 'mm' }),
      field({ label: 'Origine boîte Z', path: `${L}origin_mm.z`, unit: 'mm' }),
    ),
    el('h3', {}, 'Centre de gravité'),
    el(
      'div',
      { class: 'fields' },
      field({ label: 'COG X', path: `${L}cog_mm.x`, unit: 'mm' }),
      field({ label: 'COG Y', path: `${L}cog_mm.y`, unit: 'mm' }),
      field({ label: 'COG Z', path: `${L}cog_mm.z`, unit: 'mm' }),
      field({ label: 'Enveloppe COG ± X', path: `${L}cogEnvelope_mm.dx`, unit: 'mm', hint: 'Incertitude : efforts max sur l\'enveloppe' }),
      field({ label: 'Enveloppe COG ± Y', path: `${L}cogEnvelope_mm.dy`, unit: 'mm' }),
      field({ label: 'Surface au vent', path: `${L}windArea_m2`, unit: 'm²', hint: 'Information (rapport)' }),
    ),
  );

  const pts = panel(
    null,
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'Points de levage (padeyes)'),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'small', onclick: addPoint }, '+ Point'),
        el('button', { class: 'small', title: 'Crée 4 points aux coins supérieurs, à 300 mm des bords', onclick: corners }, '4 coins (dessus)'),
      ),
    ),
    el('div', { class: 'tbl-wrap', id: 'lp-table' }),
    el(
      'div',
      { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } },
      'Coordonnées en mm dans le repère de la pièce (Z vers le haut). Azimut = orientation du plan du padeye en vue de dessus (° depuis l\'axe X) ; laisser vide si le padeye est orienté vers le crochet. Épaisseur = tôle + flasques.',
    ),
  );

  const preview = panel(null, el('div', { class: 'grid', id: 'load-preview' }));
  root.append(el('div', { class: 'grid g-side' }, el('div', { class: 'grid' }, ident, pts), el('div', { class: 'grid' }, preview, pdfPanel({ onPoints: () => window.__rerender() }))));
  renderPoints();
  update(app.result);
  root._update = update;
}

function renderPoints() {
  const box = document.getElementById('lp-table');
  if (!box) return;
  const list = app.project.load.liftPoints;
  const res = app.result;
  const head = ['Id', 'X', 'Y', 'Z', 'SWL (t)', 'Ø trou', 'Ép.', 'Rayon', 'Azimut °', 'Actif', 'Effort calc.', ''];
  const tb = el('tbody');
  list.forEach((p, i) => {
    const b = `load.liftPoints.${i}.`;
    const leg = res?.rig?.legs?.find((l) => l.pointId === p.id);
    tb.append(
      el(
        'tr',
        {},
        el('td', { style: { width: '50px' } }, cell(`${b}id`, 'text', { onchange: () => app.recompute() })),
        ...['x', 'y', 'z', 'swl_t', 'holeDia_mm', 'thk_mm', 'radius_mm', 'azimuth_deg'].map((k) => el('td', {}, cell(b + k, 'number', { onchange: () => app.recompute() }))),
        el('td', { style: { textAlign: 'center' } }, cell(`${b}used`, 'checkbox', { onchange: () => app.recompute() })),
        el('td', { class: 'num' }, leg ? `${fmt(leg.Fdesign)} t` : '—'),
        el('td', {}, el('button', { class: 'small danger', title: 'Supprimer', onclick: () => { list.splice(i, 1); app.recompute(); renderPoints(); } }, '✕')),
      ),
    );
  });
  box.innerHTML = '';
  box.append(el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), tb));
}

function nextId(list) {
  const used = new Set(list.map((p) => p.id));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  return `P${list.length + 1}`;
}

function addPoint() {
  const list = app.project.load.liftPoints;
  const last = list[list.length - 1] || {};
  list.push({ id: nextId(list), x: 0, y: 0, z: last.z ?? app.project.load.dims_mm.H ?? 0, swl_t: last.swl_t ?? null, holeDia_mm: last.holeDia_mm ?? null, thk_mm: last.thk_mm ?? null, radius_mm: last.radius_mm ?? null, azimuth_deg: null, used: true });
  app.recompute();
  renderPoints();
}

function corners() {
  const ld = app.project.load;
  const o = ld.origin_mm, d = ld.dims_mm;
  const m = 300;
  const z = (o.z || 0) + (d.H || 0);
  const tpl = ld.liftPoints[0] || {};
  const mk = (id, x, y) => ({ id, x, y, z, swl_t: tpl.swl_t ?? null, holeDia_mm: tpl.holeDia_mm ?? null, thk_mm: tpl.thk_mm ?? null, radius_mm: tpl.radius_mm ?? null, azimuth_deg: null, used: true });
  ld.liftPoints = [
    mk('A', o.x + m, o.y + m),
    mk('B', o.x + d.L - m, o.y + m),
    mk('C', o.x + d.L - m, o.y + d.W - m),
    mk('D', o.x + m, o.y + d.W - m),
  ];
  app.recompute();
  renderPoints();
}

function update(res) {
  const w = document.getElementById('wdesign');
  if (w) w.textContent = res?.rig?.W ? `${fmt(res.rig.W)} t` : '—';
  const pv = document.getElementById('load-preview');
  if (pv) {
    pv.innerHTML = '';
    pv.append(
      figure(drawRiggingView(app.project, res, 'plan', { width: 560, height: 330, forces: false }), 'vue-dessus'),
      figure(drawRiggingView(app.project, res, 'front', { width: 560, height: 330, forces: false }), 'elevation-face'),
    );
  }
  // met à jour la colonne "Effort calc." sans reconstruire les champs en cours d'édition
  const rows = document.querySelectorAll('#lp-table tbody tr');
  rows.forEach((tr, i) => {
    const p = app.project.load.liftPoints[i];
    const leg = res?.rig?.legs?.find((l) => l.pointId === p?.id);
    const td = tr.children[10];
    if (td) td.textContent = leg ? `${fmt(leg.Fdesign)} t` : '—';
  });
}

export { renderPoints };
