// Background removal on a photo, done on the device (no upload): a selection line traced around
// the object (everything outside is removed), holes traced the same way, brush to erase / restore,
// automatic removal of a plain background (flood fill from the edges). The result is a black / white mask (white = kept) stored next to the photo.
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

/** Opens the editor; onSave(maskDataUrl | null, extent of the object { u0, v0, u1, v1 } | null). */
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
  const tol = 38;
  let mode = 'keep', brush = Math.round(Math.max(w, h) / 40);
  let pts = []; // selection line being traced (image px)
  let cand = null; // point under the finger, placed on release
  const M = Math.max(w, h);
  const lw = Math.max(2, M / 320);

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
    overlay();
  };
  /** The selection line: segments, points (the first one closes it), and the point under the finger. */
  const overlay = () => {
    const line = cand && !cand.vertex ? [...pts, cand] : pts;
    if (!line.length) return;
    const col = mode === 'cut' ? '#c0392b' : '#e8822a';
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    line.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 2.6; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
    if (line.length > 2) {
      ctx.beginPath(); ctx.moveTo(line[line.length - 1].x, line[line.length - 1].y); ctx.lineTo(line[0].x, line[0].y);
      ctx.setLineDash([lw * 3, lw * 3]); ctx.strokeStyle = col; ctx.lineWidth = lw * 0.7; ctx.stroke(); ctx.setLineDash([]);
    }
    line.forEach((q, i) => {
      ctx.beginPath(); ctx.arc(q.x, q.y, i === 0 ? lw * 4.5 : lw * 2.6, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#fff' : col; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = col; ctx.stroke();
    });
    ctx.restore();
  };
  const auto = () => {
    snap();
    mask.fill(1);
    const seeds = [];
    const step = Math.max(1, Math.round(M / 300));
    for (let x = 0; x < w; x += step) seeds.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y += step) seeds.push(y * w, y * w + w - 1);
    fill(data, w, h, mask, seeds, tol, 0);
    keepLargest(mask, w, h);
    draw();
  };
  /** Closes the selection line: keep what is inside (the object), or remove it (a hole). */
  const apply = () => {
    if (pts.length < 3) return toastIn('Place at least 3 points around the object');
    snap();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.beginPath();
    pts.forEach((q, i) => (i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)));
    x.closePath();
    x.fillStyle = '#000';
    x.fill();
    const a = x.getImageData(0, 0, w, h).data;
    const full = mask.every((v) => v === 1);
    for (let p = 0; p < w * h; p++) {
      const inside = a[p * 4 + 3] > 127;
      if (mode === 'cut') { if (inside) mask[p] = 0; } else mask[p] = full ? (inside ? 1 : 0) : (mask[p] || inside ? 1 : 0);
    }
    pts = [];
    draw();
  };
  const pos = (ev) => { const r = cv.getBoundingClientRect(); return { x: Math.round(((ev.clientX - r.left) / r.width) * w), y: Math.round(((ev.clientY - r.top) / r.height) * h) }; };
  const paint = (q, v) => {
    const r = brush;
    for (let y = Math.max(0, q.y - r); y < Math.min(h, q.y + r); y++) {
      for (let x = Math.max(0, q.x - r); x < Math.min(w, q.x + r); x++) if ((x - q.x) ** 2 + (y - q.y) ** 2 <= r * r) mask[y * w + x] = v;
    }
  };
  // magnifier: the finger hides the point, so the zone under it is shown enlarged in a corner
  const loupe = el('canvas', { class: 'lt-loupe', width: '240', height: '240' });
  const lctx = loupe.getContext('2d');
  const showLoupe = (q) => {
    const r = cv.getBoundingClientRect();
    const k = r.width / w; // screen px per image px
    const half = 25 / k; // zone shown: 50 screen px, enlarged ×3
    lctx.fillStyle = '#fff'; lctx.fillRect(0, 0, 240, 240);
    lctx.drawImage(cv, q.x - half, q.y - half, half * 2, half * 2, 0, 0, 240, 240);
    lctx.strokeStyle = '#000'; lctx.lineWidth = 2;
    lctx.beginPath(); lctx.moveTo(120, 96); lctx.lineTo(120, 144); lctx.moveTo(96, 120); lctx.lineTo(144, 120); lctx.stroke();
    loupe.style.display = 'block';
    loupe.classList.toggle('right', ev0x < r.left + r.width / 2);
  };
  let ev0x = 0;
  const near = (q) => { const r = cv.getBoundingClientRect(); const tolPx = 22 * (w / r.width); let best = -1, bd = tolPx; pts.forEach((p, i) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = i; } }); return best; };
  let down = null;
  const clampQ = (q) => ({ x: Math.min(w - 1, Math.max(0, q.x)), y: Math.min(h - 1, Math.max(0, q.y)) });
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    cv.setPointerCapture(ev.pointerId);
    ev0x = ev.clientX;
    const q = clampQ(pos(ev));
    if (mode === 'erase' || mode === 'restore') {
      snap();
      down = { brush: true };
      paint(q, mode === 'erase' ? 0 : 1);
      draw();
      return;
    }
    const k = near(q);
    down = { k, q0: q, moved: false };
    cand = k >= 0 ? { ...pts[k], vertex: true } : q;
    draw();
    showLoupe(q);
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!down) return;
    ev0x = ev.clientX;
    const q = clampQ(pos(ev));
    if (down.brush) { paint(q, mode === 'erase' ? 0 : 1); draw(); return; }
    if (Math.hypot(q.x - down.q0.x, q.y - down.q0.y) > M / 150) down.moved = true;
    if (down.k >= 0 && down.moved) { pts[down.k] = q; cand = { ...q, vertex: true }; } else if (down.k < 0) cand = q;
    draw();
    showLoupe(q);
  });
  const up = () => {
    if (!down) return;
    const d = down;
    down = null;
    loupe.style.display = 'none';
    if (d.brush) return;
    if (d.k === 0 && !d.moved && pts.length >= 3) { cand = null; apply(); return; }
    if (d.k < 0 && cand) pts.push({ x: cand.x, y: cand.y });
    cand = null;
    draw();
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  const toastIn = (t) => { hint.textContent = t; hint.classList.add('warn'); setTimeout(() => hint.classList.remove('warn'), 1800); };

  const modes = [['keep', '✂ Trace the object (keep inside)'], ['cut', '✂ Trace a hole (remove inside)'], ['erase', '🖌 Erase'], ['restore', '🖌 Restore']];
  const modeBar = el('div', { class: 'lt-row' });
  const renderModes = () => {
    modeBar.innerHTML = '';
    modes.forEach(([k, t]) => modeBar.append(el('button', { class: `chip ${mode === k ? 'on' : ''}`, onclick: () => { mode = k; if (k === 'erase' || k === 'restore') pts = []; renderModes(); renderTools(); draw(); } }, t)));
  };
  const tools = el('div', { class: 'lt-row' });
  const renderTools = () => {
    tools.innerHTML = '';
    if (mode === 'keep' || mode === 'cut') {
      tools.append(
        el('button', { class: 'primary', onclick: apply }, '✓ Close the line & cut'),
        el('button', { onclick: () => { pts.pop(); draw(); } }, '↶ Last point'),
        el('button', { onclick: () => { pts = []; draw(); } }, 'Clear the line'));
    } else {
      tools.append(el('label', {}, 'Brush size ', el('input', { type: 'range', min: '4', max: String(Math.round(M / 8)), value: String(brush), oninput: (e) => { brush = Number(e.target.value); } })));
    }
  };
  renderModes();
  renderTools();
  const hint = el('p', { class: 'muted small lt-hint' }, 'Tap around the object to place the points of the line (keep the finger down and slide to adjust, a point can be moved); tap the first point, or “Close the line & cut”, to remove everything outside. Grey checks = removed.');
  const close = () => box.remove();
  const save = () => {
    if (pts.length >= 3) apply(); // a line left open is closed
    const all = mask.every((v) => v === 1);
    if (all) { onSave(null, null); close(); return; }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    const id = x.createImageData(w, h);
    for (let p = 0; p < w * h; p++) { const v = mask[p] ? 255 : 0; id.data[p * 4] = v; id.data[p * 4 + 1] = v; id.data[p * 4 + 2] = v; id.data[p * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    // extent of the object kept (fractions of the photo): used to show every view at the same scale
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let p = 0; p < w * h; p++) if (mask[p]) { const px = p % w, py = (p - px) / w; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    onSave(c.toDataURL('image/png'), x1 >= 0 ? { u0: x0 / w, v0: y0 / h, u1: (x1 + 1) / w, v1: (y1 + 1) / h } : null);
    close();
  };
  const box = el('div', { class: 'modal lt-cut' }, el('div', { class: 'modal-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Remove the background'), el('span', { class: 'spacer' }),
      el('button', { onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: save }, 'Done')),
    el('div', { class: 'lt-cut-body' },
      modeBar,
      tools,
      hint,
      el('div', { class: 'lt-cut-cv' }, cv, loupe),
      el('div', { class: 'lt-row' },
        el('button', { onclick: () => { if (undo.length) { mask = undo.pop(); draw(); } } }, '↶ Undo the cut'),
        el('button', { onclick: () => { snap(); mask.fill(1); pts = []; draw(); } }, 'Start again'),
        el('button', { onclick: auto }, '✨ Auto (plain background)')))));
  document.body.append(box);
  draw();
}

