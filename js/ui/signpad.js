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
      name ? el('button', { class: 'small', title: 'Signature written from the name, in a handwriting font', onclick: () => { onSave(signatureFromName(name)); close(); } }, `✍ From the name (${name})`) : null,
      el('button', { class: 'small', onclick: clear }, 'Clear'), el('button', { class: 'small', onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: save }, 'Save')),
    el('div', { class: 'sign-body' }, el('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 6px' } }, 'Sign on the line with the mouse, a finger or a pen.'), cv)));
  document.body.append(box);
  clear();
}

/**
 * Signature made from the name, like a hand signature: a large initial (long loop and tall stroke)
 * followed by a fast cursive scribble of the name, thin pen line. The same name always gives the same
 * signature. Transparent PNG.
 */
export function signatureFromName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const words = n.split(/\s+/);
  const plain = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const rest = plain(words.length > 1 ? words[words.length - 1] : words[0].slice(1)).slice(0, 7) || 'a';
  let seed = [...n].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const j = (v) => v + (rnd() - 0.5) * 2 * 6;

  const cv = document.createElement('canvas');
  cv.width = 1400; cv.height = 420;
  const ctx = cv.getContext('2d');
  const y0 = 250; // base line
  const vx = 300 + rnd() * 40; // the tall stroke of the initial
  // 1) initial: long thin loop to the left, closing on the tall stroke
  const loop = [[vx + 14, y0 - 52], [vx - 70, y0 - 66], [190, y0 - 62], [70, y0 - 44], [48, y0 - 24], [110, y0 - 8], [260, y0 - 2], [vx + 20, y0 - 8], [vx + 60, y0 - 20]].map(([x, y]) => [j(x), j(y)]);
  const stem = [[vx - 18, y0 - 205], [vx - 8, y0 - 130], [vx + 2, y0 - 50], [vx + 8, y0 + 12]].map(([x, y]) => [x + (rnd() - 0.5) * 4, y]);
  // 2) the name, fast cursive: humps, tall loops for b d f h k l t, low loops for g j p q y
  const pts = [[vx + 60, y0 - 20]];
  let x = vx + 72;
  for (const ch of rest) {
    const w = 40 + rnd() * 14, hx = 42 + rnd() * 12;
    if ('bdfhklt'.includes(ch)) {
      pts.push([x + w * 0.2, y0 - hx * 0.6], [x + w * 0.55, y0 - 135 - rnd() * 25], [x + w * 0.3, y0 - 105], [x + w * 0.45, y0 - 8]);
    } else if ('gjpqy'.includes(ch)) {
      pts.push([x + w * 0.3, y0 - hx], [x + w * 0.5, y0 - 6], [x + w * 0.45, y0 + 70], [x + w * 0.25, y0 + 40], [x + w * 0.7, y0 - 4]);
    } else if ('mnw'.includes(ch)) {
      pts.push([x + w * 0.2, y0 - hx], [x + w * 0.4, y0 - 2], [x + w * 0.65, y0 - hx], [x + w * 0.9, y0 - 2]);
      x += w * 0.35;
    } else {
      pts.push([x + w * 0.3, y0 - hx], [x + w * 0.62, y0 - 3]);
    }
    x += w;
  }
  pts.push([x + 26, y0 - 12], [x + 70, y0 - 30 - rnd() * 14]);

  // Catmull-Rom spline drawn in short pieces, the width following the speed of the pen
  const stroke = (P, w0) => {
    if (P.length < 2) return;
    const Q = [P[0], ...P, P[P.length - 1]];
    let prev = null;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1d2b4a';
    for (let i = 1; i < Q.length - 2; i++) {
      const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const pt = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
        if (prev) {
          const v = Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
          ctx.lineWidth = Math.max(1.6, w0 * (1.25 - Math.min(v, 30) / 40));
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke();
        }
        prev = pt;
      }
    }
  };
  stroke(stem, 4.2);
  stroke(loop, 3.6);
  stroke(pts, 3.6);
  return trimmed(cv);
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
