// Interactive 3D viewer: drag to orbit, shift-drag / right-drag to pan, wheel to zoom, presets.
import { app } from './app.js';
import { el, download, toast } from './dom.js';
import { draw3d, DEFAULT_CAM } from '../draw/view3d.js';
import { svgToPng } from '../draw/svg.js';

const shared = { cam: { ...DEFAULT_CAM }, drawings: true };

/** Camera of the 3D views on screen (the report uses the same orientation). */
export const current3d = () => ({ cam: { ...shared.cam, panX: 0, panY: 0, zoom: 1 }, drawings: shared.drawings });

export function viewer3d(opts = {}) {
  const H = opts.height || 460;
  const box = el('div', { class: 'v3d' });
  const stage = el('div', { class: 'v3d-stage', style: { height: `${H}px` } });
  const preset = (txt, c) => el('button', { class: 'small', onclick: () => { Object.assign(shared.cam, c, { panX: 0, panY: 0 }); draw(); } }, txt);
  const bar = el('div', { class: 'v3d-bar' },
    preset('3D', { yaw: -35, pitch: 24 }), preset('Top', { yaw: 0, pitch: 89.9 }), preset('Front', { yaw: 0, pitch: 0 }), preset('Side', { yaw: -90, pitch: 0 }),
    el('label', { class: 'check', style: { fontSize: '12px' } }, el('input', { type: 'checkbox', checked: shared.drawings, onchange: (e) => { shared.drawings = e.target.checked; draw(); } }), 'Drawings'),
    el('span', { class: 'muted', style: { fontSize: '11px' } }, 'drag = rotate · right-drag or shift-drag = move · wheel = zoom'),
    el('span', { class: 'spacer' }),
    el('button', { class: 'lv-btn', title: 'Zoom in', onclick: () => zoom(1.25) }, '+'),
    el('button', { class: 'lv-btn', title: 'Zoom out', onclick: () => zoom(1 / 1.25) }, '−'),
    el('button', { class: 'lv-btn', title: 'Fit', onclick: () => { Object.assign(shared.cam, { zoom: DEFAULT_CAM.zoom ?? 1, panX: 0, panY: 0 }); draw(); } }, 'Fit'),
    el('button', { class: 'lv-btn', title: 'Full screen / back', onclick: () => { box.classList.toggle('lv-max'); stage.style.height = box.classList.contains('lv-max') ? 'calc(100vh - 90px)' : `${H}px`; setTimeout(draw, 30); } }, '⤢'),
    el('button', { class: 'small', onclick: () => download('view-3d.svg', stage.innerHTML, 'image/svg+xml') }, 'SVG'),
    el('button', { class: 'small', onclick: async () => { try { download('view-3d.png', await svgToPng(stage.innerHTML, 2), 'image/png'); } catch (e) { toast(e.message); } } }, 'PNG'),
  );
  box.append(bar, stage);
  let drag = null;
  const zoom = (f) => { shared.cam.zoom = Math.max(0.3, Math.min(6, (shared.cam.zoom || 1) * f)); draw(); };
  function draw() {
    const W = stage.clientWidth || opts.width || 640;
    const h = stage.clientHeight || H;
    stage.innerHTML = draw3d(app.project, app.result, { width: W, height: h, cam: shared.cam, drawings: shared.drawings, title: opts.title ?? '' });
  }
  stage.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cam: { ...shared.cam }, pan: e.shiftKey || e.button === 2 };
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.pan) Object.assign(shared.cam, { panX: drag.cam.panX + dx, panY: drag.cam.panY + dy });
    else Object.assign(shared.cam, { yaw: drag.cam.yaw - dx * 0.45, pitch: Math.max(-5, Math.min(89.9, drag.cam.pitch + dy * 0.35)) });
    draw();
  });
  const end = () => (drag = null);
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    shared.cam.zoom = Math.max(0.3, Math.min(6, shared.cam.zoom * (e.deltaY > 0 ? 1 / 1.12 : 1.12)));
    draw();
  }, { passive: false });
  stage.addEventListener('dblclick', () => { Object.assign(shared.cam, DEFAULT_CAM); draw(); });
  box.refresh = draw;
  requestAnimationFrame(draw);
  return box;
}
