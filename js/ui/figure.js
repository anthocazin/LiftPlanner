// SVG drawing container with SVG / PNG export.
import { el, download, toast } from './dom.js';
import { svgToPng } from '../draw/svg.js';

export function figure(svg, filename = 'schema', { exportable = true, cls = '' } = {}) {
  const box = el('div', { class: `drawing ${cls}` });
  box.innerHTML = svg;
  if (exportable) {
    const tools = el(
      'div',
      { class: 'tools no-print' },
      el('button', { title: 'Download as SVG (vector, editable)', onclick: () => download(`${filename}.svg`, box.querySelector('svg').outerHTML, 'image/svg+xml') }, 'SVG'),
      el('button', {
        title: 'Download as PNG (for PowerPoint / Word)',
        onclick: async () => {
          try {
            download(`${filename}.png`, await svgToPng(box.querySelector('svg').outerHTML, 2), 'image/png');
          } catch (e) {
            toast(e.message);
          }
        },
      }, 'PNG'),
    );
    box.append(tools);
  }
  box.setSvg = (s) => {
    const t = box.querySelector('.tools');
    box.innerHTML = s;
    if (t) box.append(t);
  };
  return box;
}
