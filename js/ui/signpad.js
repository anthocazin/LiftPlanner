// Signature pad: draw with the mouse, a finger or a pen; saved as a small transparent PNG.
import { el } from './dom.js';

/** Opens the pad; onSave(dataUrl) is called with the trimmed signature (or null when cleared). */
export function openSignPad(title, onSave, name = '') {
  document.getElementById('signpad')?.remove();
  const W = 640, H = 220;
  const cv = el('canvas', { width: W * 2, height: H * 2, class: 'sign-canvas', style: { width: `${W}px`, height: `${H}px` } });
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#13294b';
  let drawing = false, last = null, lastW = 2.2, empty = true;
  const pos = (ev) => { const r = cv.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H, t: ev.timeStamp, p: ev.pressure }; };
  const guide = () => {
    ctx.save();
    ctx.strokeStyle = '#c9d3dd';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, H - 50);
    ctx.lineTo(W - 30, H - 50);
    ctx.stroke();
    ctx.restore();
  };
  const clear = () => { ctx.clearRect(0, 0, W, H); guide(); empty = true; };
  cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); cv.setPointerCapture(ev.pointerId); drawing = true; last = pos(ev); });
  cv.addEventListener('pointermove', (ev) => {
    if (!drawing) return;
    const q = pos(ev);
    const d = Math.hypot(q.x - last.x, q.y - last.y);
    if (d < 0.6) return;
    // thinner when fast, thicker with pen pressure
    const v = d / Math.max(1, q.t - last.t);
    const w = Math.max(1.1, Math.min(3.4, (ev.pointerType === 'pen' && q.p ? 1 + 3 * q.p : 3.2 - v * 1.4)));
    lastW = lastW * 0.6 + w * 0.4;
    ctx.lineWidth = lastW;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    last = q;
    empty = false;
  });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  const close = () => box.remove();
  const save = () => {
    onSave(empty ? null : trimmed(cv));
    close();
  };
  const box = el('div', { id: 'signpad', class: 'modal' }, el('div', { class: 'modal-box sign-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Signature'), el('span', { class: 'muted' }, title), el('span', { class: 'spacer' }),
      el('button', { class: 'small', onclick: clear }, 'Clear'), el('button', { class: 'small', onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: save }, 'Save')),
    el('div', { class: 'sign-body' }, el('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 6px' } }, 'Sign on the line with the mouse, a finger or a pen.'), cv)));
  document.body.append(box);
  clear();
}

/** The drawn part only (white space cut), at most 600 px wide, transparent PNG. */
function trimmed(cv) {
  const ctx = cv.getContext('2d');
  const { width: w, height: h } = cv;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    // ink only: the dark blue strokes, not the light guide line
    if (d[i + 3] > 40 && d[i] < 120) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const m = 8;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const k = Math.min(1, 600 / (x1 - x0 + 1));
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0 + 1) * k);
  out.height = Math.round((y1 - y0 + 1) * k);
  // copy the ink only (the guide line is light grey: left out)
  const src = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  for (let i = 0; i < src.data.length; i += 4) if (src.data[i] >= 120) src.data[i + 3] = 0;
  const tmp = document.createElement('canvas');
  tmp.width = src.width;
  tmp.height = src.height;
  tmp.getContext('2d').putImageData(src, 0, 0);
  out.getContext('2d').drawImage(tmp, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
