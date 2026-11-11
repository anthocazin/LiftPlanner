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
      el('div', { class: 'panel-head' }, el('h2', {}, 'Rigging drawings'), el('div', { class: 'row', style: { gap: '14px' } }, tog('labels', 'Labels'), tog('forces', 'Forces / angles'), tog('dims', 'Dimensions'))),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Every drawing exports as SVG (vector, editable in Inkscape / Illustrator / PowerPoint) or PNG for your storyboards.'),
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
      figure(drawRiggingView(p, res, 'iso', { width: 700, height: 520, ...opts }), 'rigging-iso'),
      el('div', { class: 'grid' }, figure(drawRiggingView(p, res, 'plan', { width: 640, height: 250, ...opts }), 'rigging-plan'), figure(drawRiggingView(p, res, 'front', { width: 640, height: 260, ...opts }), 'rigging-front')),
    ),
    el('div', { class: 'grid g2' }, figure(drawRiggingView(p, res, 'side', { width: 640, height: 300, ...opts }), 'rigging-side'), el('div')),
    panel('Rigging detail (components to scale)', figure(drawRiggingDetail(p, res, { height: 680 }), 'rigging-detail')),
  );
}
