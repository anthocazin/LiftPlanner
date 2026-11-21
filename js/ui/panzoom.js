// Wheel zoom and panning for the drawing windows (PDF / image viewers and the 2D views).
//   wheel (mouse or trackpad) = zoom at the cursor, Ctrl + wheel / pinch too
//   sideways scroll (trackpad, Shift + wheel) = scroll sideways
//   drag with the middle or right button, Space + drag, or drag on the grey background = move

/** Zoom factor of a wheel event: > 1 zooms in. About 15 % per mouse notch, smooth on a trackpad. */
export function wheelZoom(ev) {
  let d = ev.deltaY;
  if (ev.deltaMode === 1) d *= 33;
  else if (ev.deltaMode === 2) d *= 400;
  d = Math.max(-250, Math.min(250, d));
  return Math.exp(-d * (ev.ctrlKey ? 0.01 : 0.0015));
}

/** True for a sideways scroll (trackpad, Shift + wheel): left to the browser. */
export const sideways = (ev) => ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY);

/**
 * Scroll box holding a page (`.wz-page` / `.pv-page`: the canvas and its overlay, sized in CSS px).
 * opts: { get() → zoom, set(zoom), redraw() → Promise (draws the page again at the zoom set),
 *         min, max }. Returns { startPan(ev) } to move the page from a viewer's own handler.
 */
export function panZoomBox(box, { get, set, redraw, min = 0.3, max = 10 }) {
  let timer = null;
  const page = () => box.querySelector(':scope > .wz-page, :scope > .pv-page');
  box.addEventListener('wheel', (ev) => {
    const pg = page();
    if (!pg || sideways(ev)) return;
    ev.preventDefault();
    const z0 = get();
    const z1 = Math.min(max, Math.max(min, z0 * wheelZoom(ev)));
    if (Math.abs(z1 - z0) < 1e-6) return;
    const r = z1 / z0;
    const pr = pg.getBoundingClientRect();
    const px = ev.clientX - pr.left, py = ev.clientY - pr.top;
    // the page is scaled at once (sharp again a moment later), the point under the cursor stays
    for (const c of pg.children) {
      if (c.style.width) c.style.width = `${parseFloat(c.style.width) * r}px`;
      if (c.style.height) c.style.height = `${parseFloat(c.style.height) * r}px`;
    }
    box.scrollLeft += px * (r - 1);
    box.scrollTop += py * (r - 1);
    set(z1);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const sl = box.scrollLeft, st = box.scrollTop;
      await redraw();
      box.scrollLeft = sl;
      box.scrollTop = st;
    }, 220);
  }, { passive: false });

  let pan = null, space = false;
  const onKey = (e) => {
    if (!box.isConnected) { document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); return; }
    if (e.code !== 'Space' || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    space = e.type === 'keydown';
    box.classList.toggle('pan-ready', space);
    if (space && box.matches(':hover')) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);
  const startPan = (ev) => {
    pan = { x: ev.clientX, y: ev.clientY, sl: box.scrollLeft, st: box.scrollTop, moved: false };
    try { box.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    box.classList.add('panning');
  };
  box.addEventListener('pointerdown', (ev) => {
    if (!(ev.button === 1 || ev.button === 2 || (ev.button === 0 && (space || ev.target === box)))) return;
    ev.preventDefault();
    ev.stopPropagation();
    startPan(ev);
  }, true);
  box.addEventListener('pointermove', (ev) => {
    if (!pan) return;
    pan.moved = true;
    box.scrollLeft = pan.sl - (ev.clientX - pan.x);
    box.scrollTop = pan.st - (ev.clientY - pan.y);
  });
  const end = () => { if (pan) { pan = null; box.classList.remove('panning'); } };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  return { startPan, isPanning: () => !!pan };
}
