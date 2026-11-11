import { app } from '../app.js';
import { el, panel } from '../dom.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { drawRiggingDetail } from '../../draw/detail.js';
import { figure } from '../figure.js';

const opts = { labels: true, forces: true, dims: true };

export function render(root) {
  const tog = (k, t) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: opts[k], onchange: (e) => { opts[k] = e.target.checked; update(app.result); } }), t);
  root.append(
    panel(
      null,
      el('div', { class: 'panel-head' }, el('h2', {}, 'Schémas du gréement'), el('div', { class: 'row', style: { gap: '14px' } }, tog('labels', 'Repères'), tog('forces', 'Efforts / angles'), tog('dims', 'Cotes'))),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Chaque schéma s\'exporte en SVG (vectoriel, modifiable dans Inkscape / Illustrator / PowerPoint) ou en PNG pour vos storyboards.'),
    ),
    el('div', { id: 'draw-root', class: 'grid' }),
  );
  update(app.result);
  root._update = update;
}

function update(res) {
  const box = document.getElementById('draw-root');
  if (!box) return;
  box.innerHTML = '';
  const p = app.project;
  box.append(
    el(
      'div',
      { class: 'grid g2' },
      figure(drawRiggingView(p, res, 'iso', { width: 700, height: 520, ...opts }), 'greement-iso'),
      el('div', { class: 'grid' }, figure(drawRiggingView(p, res, 'plan', { width: 640, height: 250, ...opts }), 'greement-plan'), figure(drawRiggingView(p, res, 'front', { width: 640, height: 260, ...opts }), 'greement-face')),
    ),
    el('div', { class: 'grid g2' }, figure(drawRiggingView(p, res, 'side', { width: 640, height: 300, ...opts }), 'greement-cote'), el('div')),
    panel('Détail d\'élingage (composants à l\'échelle)', figure(drawRiggingDetail(p, res, { height: 680 }), 'detail-elingage')),
  );
}
