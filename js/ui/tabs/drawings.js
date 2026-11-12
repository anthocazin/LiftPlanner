// Drawings: rigging schematic, rigging on the load (plan XY, elevations XZ and YZ) and the
// components to scale. Every drawing exports as SVG or PNG.
import { app } from '../app.js';
import { el, panel } from '../dom.js';
import { drawRiggingDetail } from '../../draw/detail.js';
import { schematicSvg } from '../../draw/schematic.js';
import { staticViewSvg } from '../loadview.js';
import { figure } from '../figure.js';

export function render(root) {
  root.append(
    panel(null,
      el('div', { class: 'panel-head' }, el('h2', {}, 'Drawings')),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Every drawing exports as SVG (vector, editable in Inkscape / Illustrator / PowerPoint) or PNG with its buttons. The same drawings go into the report.'),
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
  const sch = schematicSvg(p, res, { width: 900 });
  box.append(
    panel('Rigging arrangement (schematic)', sch.svg ? figure(sch.svg, 'rigging-schematic') : el('div', { class: 'note warn' }, 'No lift point yet.')),
    panel('Rigging on the load',
      el('div', { class: 'grid g2' },
        figure(staticViewSvg('xz', p, res, { width: 720, height: 460, title: 'Front elevation — XZ' }), 'rigging-elevation-xz'),
        figure(staticViewSvg('yz', p, res, { width: 720, height: 460, title: 'Side elevation — YZ' }), 'rigging-elevation-yz'),
        figure(staticViewSvg('xy', p, res, { width: 720, height: 460, title: 'Plan — XY' }), 'rigging-plan-xy'),
      ),
      el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Each leg is labelled with its name, bearing-to-bearing length and angle to the vertical; legs seen on top of each other share one label (e.g. A/D).'),
    ),
    panel('Rigging detail (components to scale)', figure(drawRiggingDetail(p, res, { height: 680 }), 'rigging-detail')),
  );
}

/** Keeps a single, inert SVG (no scripts, event handlers, external links or foreign content). */
export function sanitizeSvg(txt) {
  const m = String(txt).match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  root.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, a').forEach((n) => n.remove());
  const walk = (node) => {
    for (const a of [...(node.attributes || [])]) {
      const nm = a.name.toLowerCase();
      const v = a.value.trim().toLowerCase();
      if (nm.startsWith('on')) node.removeAttribute(a.name);
      else if ((nm === 'href' || nm === 'xlink:href') && !v.startsWith('#')) node.removeAttribute(a.name);
      else if (nm === 'style' && /url\(\s*['"]?(?!#)/.test(v)) node.removeAttribute(a.name);
    }
    [...node.children].forEach(walk);
  };
  walk(root);
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', '0 0 900 520');
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.setAttribute('style', 'background:#fff;width:100%;height:auto');
  return new XMLSerializer().serializeToString(root);
}
