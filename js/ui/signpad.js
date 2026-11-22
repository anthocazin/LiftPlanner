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
      name ? el('button', { class: 'small', title: 'Signature written from the name', onclick: () => { close(); openNameSignature(name, onSave); } }, `✍ From the name (${name})`) : null,
      el('button', { class: 'small', onclick: clear }, 'Clear'), el('button', { class: 'small', onclick: close }, 'Cancel'), el('button', { class: 'primary', onclick: save }, 'Save')),
    el('div', { class: 'sign-body' }, el('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 6px' } }, 'Sign on the line with the mouse, a finger or a pen.'), cv)));
  document.body.append(box);
  clear();
}

// ---------------------------------------------------------------- signature written from the name
// Signature fonts (Google Fonts, loaded when first needed; without network, the handwriting fonts of
// the computer are used instead).
export const SIGN_STYLES = [
  { id: 'delafield', font: 'Mrs Saint Delafield', size: 150, label: 'Classic' },
  { id: 'muellerhoff', font: 'Herr Von Muellerhoff', size: 150, label: 'Fast' },
  { id: 'vibes', font: 'Great Vibes', size: 118, label: 'Elegant' },
];
const FALLBACK = "'Segoe Script', 'Snell Roundhand', 'Brush Script MT', 'Apple Chancery', 'URW Chancery L', cursive";
let fontsReady = null;
function loadSignFonts() {
  if (fontsReady) return fontsReady;
  if (!document.getElementById('sign-fonts')) {
    const fam = SIGN_STYLES.map((x) => `family=${x.font.replace(/ /g, '+')}`).join('&');
    document.head.append(el('link', { id: 'sign-fonts', rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${fam}&display=swap` }));
  }
  const all = Promise.all(SIGN_STYLES.map((x) => document.fonts.load(`80px "${x.font}"`, 'Ab').catch(() => null)));
  fontsReady = Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
  return fontsReady;
}

/**
 * Signature written from the name in a signature font (style: one of SIGN_STYLES), dark blue ink,
 * slightly rising, transparent PNG. Async: the font is loaded first.
 */
export async function signatureFromName(name, style = SIGN_STYLES[0].id) {
  const n = String(name || '').trim();
  if (!n) return null;
  await loadSignFonts();
  const sty = SIGN_STYLES.find((x) => x.id === style) || SIGN_STYLES[0];
  const cv = document.createElement('canvas');
  cv.width = 1800; cv.height = 420;
  const ctx = cv.getContext('2d');
  ctx.font = `${sty.size}px "${sty.font}", ${FALLBACK}`;
  const w = Math.min(ctx.measureText(n).width, 1700);
  ctx.fillStyle = '#16264a';
  ctx.save();
  ctx.translate(50, 270);
  ctx.rotate(-0.035);
  ctx.fillText(n, 0, 0, 1700);
  ctx.restore();
  // a light pen stroke under the name, as on a real signature
  ctx.strokeStyle = '#16264a';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50 + w * 0.08, 318);
  ctx.bezierCurveTo(50 + w * 0.4, 306, 50 + w * 0.75, 300, 50 + w * 0.98, 284);
  ctx.stroke();
  return trimmed(cv);
}

/** Chooses the style of the signature written from the name; onSave(dataUrl). */
export function openNameSignature(name, onSave) {
  const n = String(name || '').trim();
  if (!n) return false;
  document.getElementById('signname')?.remove();
  const list = el('div', { class: 'signname-list' }, el('p', { class: 'muted' }, 'Preparing the signatures…'));
  const close = () => box.remove();
  const box = el('div', { id: 'signname', class: 'modal' }, el('div', { class: 'modal-box sign-box' },
    el('div', { class: 'modal-head' }, el('h2', {}, 'Signature'), el('span', { class: 'muted' }, n), el('span', { class: 'spacer' }), el('button', { class: 'small', onclick: close }, 'Cancel')),
    el('div', { class: 'sign-body' }, el('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 8px' } }, 'Choose the signature:'), list)));
  document.body.append(box);
  loadSignFonts().then(async () => {
    // styles whose font is available (none without network: one signature in a font of the computer)
    const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')));
    let styles = SIGN_STYLES.filter((x) => loaded.has(x.font));
    if (!styles.length) styles = [{ ...SIGN_STYLES[0], label: '' }];
    const urls = await Promise.all(styles.map((x) => signatureFromName(n, x.id)));
    list.innerHTML = '';
    styles.forEach((x, i) => list.append(el('button', { class: 'signname-opt', onclick: () => { onSave(urls[i]); close(); } },
      el('img', { src: urls[i], alt: '' }), el('span', {}, x.label))));
  });
  return true;
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
