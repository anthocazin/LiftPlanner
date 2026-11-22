// Company logo kept in this browser (never in the project repository): added automatically at the
// top left of the reports of the full version and of LiftPlanner Light.
const LS = 'liftplanner.branding.v1';
const safe = (u) => (typeof u === 'string' && /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(u) ? u : null);

export function brandLogo() {
  try { return safe(JSON.parse(localStorage.getItem(LS) || 'null')?.logos?.company); } catch { return null; }
}

export function setBrandLogo(url) {
  try {
    const b = JSON.parse(localStorage.getItem(LS) || 'null') || {};
    b.logos = { ...(b.logos || {}), company: safe(url) };
    localStorage.setItem(LS, JSON.stringify(b));
    return true;
  } catch { return false; }
}

/** Image file → PNG data URL at most maxW px wide. */
export async function shrinkLogo(file, maxW = 500) {
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, maxW / im.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k);
  c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
