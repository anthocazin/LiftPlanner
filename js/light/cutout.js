// Background removal on a photo, done on the device (no upload): automatic from the edges of the
// photo (flood fill on the colours of the border), magic wand, brush to erase / restore, keep the
// main object. The result is a black / white mask (white = kept) stored next to the photo.
import { el } from '../ui/dom.js';

/** Flood fill from the seeds: pixels whose colour is within `tol` of the colour of their seed. */
function fill(data, w, h, mask, seeds, tol, value) {
  const t2 = tol * tol * 3;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (const s0 of seeds) {
    if (seen[s0]) continue;
    const r0 = data[s0 * 4], g0 = data[s0 * 4 + 1], b0 = data[s0 * 4 + 2];
    let n = 0;
    stack[n++] = s0;
    seen[s0] = 1;
    while (n) {
      const p = stack[--n];
      mask[p] = value;
      const x = p % w, y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q < 0 || seen[q]) continue;
        const dr = data[q * 4] - r0, dg = data[q * 4 + 1] - g0, db = data[q * 4 + 2] - b0;
        if (dr * dr + dg * dg + db * db <= t2) { seen[q] = 1; stack[n++] = q; }
      }
    }
  }
}

/** Only the largest kept part remains (removes specks left by the automatic fill). */
function keepLargest(mask, w, h) {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0, bestN = 0, id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    id++;
    let n = 0, cnt = 0;
    stack[n++] = s;
    lab[s] = id;
    while (n) {
      const p = stack[--n];
      cnt++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || !mask[q] || lab[q]) continue;
        lab[q] = id;
        stack[n++] = q;
      }
    }
    if (cnt > bestN) { bestN = cnt; best = id; }
  }
  for (let p = 0; p < w * h; p++) mask[p] = lab[p] === best ? 1 : 0;
  // fill the holes inside the object (everything not reachable from the border is kept)
  const out = new Uint8Array(w * h);
  let n = 0;
  const push = (p) => { if (!mask[p] && !out[p]) { out[p] = 1; stack[n++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (n) {
    const p = stack[--n];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (!out[p]) mask[p] = 1;
}

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Opens the editor; onSave(maskDataUrl | null). */
export async function openCutout(ph, onSave) {
  const img = await loadImg(ph.img);
  const w = ph.w, h = ph.h;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h);
  const data = src.data;
  let mask = new Uint8Array(w * h).fill(1);
  if (ph.mask) {
    const m = await loadImg(ph.mask);
    const c2 = document.createElement('canvas');
    c2.width = w;
    c2.height = h;
    const x2 = c2.getContext('2d');
    x2.drawImage(m, 0, 0, w, h);
    const md = x2.getImageData(0, 0, w, h).data;
    for (let p = 0; p < w * h; p++) mask[p] = md[p * 4] > 127 ? 1 : 0;
  }
  const undo = [];
  const snap = () => { undo.push(mask.slice()); if (undo.length > 15) undo.shift(); };
  let tol = 38, mode = 'wand', brush = Math.round(Math.max(w, h) / 40);

  const out = ctx.createImageData(w, h);
  const draw = () => {
    const o = out.data;
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (mask[p]) { o[i] = data[i]; o[i + 1] = data[i + 1]; o[i + 2] = data[i + 2]; o[i + 3] = 255; } else {
        const x = p % w, y = (p - x) / w;
        const chk = ((x >> 4) + (y >> 4)) & 1 ? 235 : 205; // checkerboard: removed
        o[i] = (data[i] * 0.25 + chk * 0.75) | 0; o[i + 1] = (data[i + 1] * 0.25 + chk * 0.75) | 0; o[i + 2] = (data[i + 2] * 0.25 + chk * 0.75) | 0; o[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  };
  const auto = () => {
    snap();
    mask.fill(1);
    const seeds = [];
    const step = Math.max(1, Math.round(Math.max(w, h) / 300));
    for (let x = 0; x < w; x += step) seeds.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y += step) seeds.push(y * w, y * w + w - 1);
    fill(data, w, h, mask, seeds, tol, 0);
    keepLargest(mask, w, h);
    draw();
  };
  const pos = (ev) => { const r = cv.getBoundingClientRect(); return { x: Math.round(((ev.clientX - r.left) / r.width) * w), y: Math.round(((ev.clientY - r.top) / r.height) * h) }; };
  const paint = (q, v) => {
    const r = brush;
    for (let y = Math.max(0, q.y - r); y < Math.min(h, q.y + r); y++) {
      for (let x = Math.max(0, q.x - r); x < Math.min(w, q.x + r); x++) if ((x - q.x) ** 2 + (y - q.y) ** 2 <= r * r) mask[y * w + x] = v;
    }
  };
  let down = false;
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const q = pos(ev);
    if (q.x < 0 || q.y < 0 || q.x >= w || q.y >= h) return;
    snap();
    if (mode === 'wand' || mode === 'wandkeep') {
      fill(data, w, h, mask, [q.y * w + q.x], tol, mode === 'wand' ? 0 : 1);
      draw();
      return;
    }
    down = true;
    cv.setPointerCapture(ev.pointerId);
    paint(q, mode === 'erase' ? 0 : 1);
    draw();
  });
  cv.addEventListener('pointermove', (ev) => { if (down) { paint(pos(ev), mode === 'erase' ? 0 : 1); draw(); } });
  cv.addEventListener('pointerup', () => { down = false; });
  cv.addEventListener('pointercancel', () => { down = false; });

  const modes = [['wand', '🪄 Tap: remove'], ['wandkeep', '🪄 Tap: keep'], ['erase', '🖌 Erase'], ['keep', '🖌 Restore']];
  const modeBar = el('div', { class: 'lt-row' });
  const renderModes = () => {
    modeBar.innerHTML = '';
    modes.forEach(([k, t]) => modeBar.append(el('button', { class: `chip ${mode === k ? 'on' : ''}`, onclick: () => { mode = k; renderModes(); } }, t)));
  };
  renderModes();
  const close = () => box.remove();
  const save = () => {
    const all = mask.every((v) => v === 1);
    if (all) { onSave(null); close(); return; }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    const id = x.createImageData(w, h);
    for (let p = 0; p < w * h; p++) { const v = mask[p] ? 255 : 0; id.data[p * 4] = v; id.data[p * 4 + 1] = v; id.data[p * 4 + 2] = v; id.data[p * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    onSave(c.toDataURL('image/png'));
    close();
  };
  const box = el('div', { class: 'modal lt-cut' }, el('div', { class: 'modal-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Remove the background'), el('span', { class: 'spacer' }),
      el('button', { onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: save }, 'Done')),
    el('div', { class: 'lt-cut-body' },
      el('div', { class: 'lt-row' },
        el('button', { class: 'primary', onclick: auto }, '✨ Auto (from the edges)'),
        el('button', { onclick: () => { snap(); keepLargest(mask, w, h); draw(); } }, 'Keep the main object only'),
        el('button', { onclick: () => { if (undo.length) { mask = undo.pop(); draw(); } } }, '↶ Undo'),
        el('button', { onclick: () => { snap(); mask.fill(1); draw(); } }, 'Reset')),
      modeBar,
      el('div', { class: 'lt-row small' },
        el('label', {}, 'Tolerance ', el('input', { type: 'range', min: '8', max: '110', value: String(tol), oninput: (e) => { tol = Number(e.target.value); } })),
        el('label', {}, 'Brush ', el('input', { type: 'range', min: '4', max: String(Math.round(Math.max(w, h) / 8)), value: String(brush), oninput: (e) => { brush = Number(e.target.value); } }))),
      el('p', { class: 'muted small' }, 'Auto removes the background touching the edges of the photo. Then tap a zone to remove (or keep) it, or paint with the brush. Grey checks = removed.'),
      el('div', { class: 'lt-cut-cv' }, cv))));
  document.body.append(box);
  draw();
  if (!ph.mask) auto();
}
