// Lift plan of the engineering office, as printed in the report: the plan with the hook and the lift
// points placed on it (named), and what each leg is made of.
import { niceName } from '../catalog/index.js';
import { isLengthPart } from '../engine/rigging.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = (v) => Math.round(v * 10) / 10;

/** SVG of the plan (image `img`, a safe data URL) with its marks, or null when its size is unknown. */
export function bePlanSvg(be, img, { maxHeight = '130mm' } = {}) {
  const w = Number(be?.w), h = Number(be?.h);
  if (!img || !(w > 0 && h > 0)) return null;
  const m = Math.max(w, h);
  const fs = m * 0.024, r = m * 0.008, sw = m * 0.0028;
  const P = (q) => (q && isFinite(q.u) && isFinite(q.v) ? { x: q.u * w, y: q.v * h } : null);
  const hk = P(be.hook);
  const legs = (be.legs || []).map((l) => ({ id: l.id, q: P(l.p) })).filter((l) => l.q);
  // labels kept inside the image (below the mark near the top edge, to its left near the right edge)
  const label = (x, y, t) => {
    const right = x + fs * 0.6 * String(t).length > w;
    const yy = y - fs < 0 ? y + fs * 2.2 : y;
    return `<text x="${n1(right ? x - r * 2.8 : x)}" y="${n1(yy)}" text-anchor="${right ? 'end' : 'start'}" font-size="${n1(fs)}" font-weight="700" font-family="Arial, sans-serif" fill="#b4561a" stroke="#fff" stroke-width="${n1(fs * 0.22)}" paint-order="stroke">${esc(t)}</text>`;
  };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;max-height:${maxHeight}"><image href="${img}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  if (hk) legs.forEach((l) => { s += `<line x1="${n1(hk.x)}" y1="${n1(hk.y)}" x2="${n1(l.q.x)}" y2="${n1(l.q.y)}" stroke="#e8822a" stroke-width="${n1(sw)}" opacity=".85"/>`; });
  legs.forEach((l) => { s += `<circle cx="${n1(l.q.x)}" cy="${n1(l.q.y)}" r="${n1(r)}" fill="#d64541" stroke="#fff" stroke-width="${n1(sw * 0.7)}"/>${label(l.q.x + r * 1.4, l.q.y - r * 1.2, l.id)}`; });
  if (hk) s += `<circle cx="${n1(hk.x)}" cy="${n1(hk.y)}" r="${n1(r * 1.2)}" fill="#f2b705" stroke="#1c2733" stroke-width="${n1(sw * 0.7)}"/>${label(hk.x + r * 1.8, hk.y - r * 1.2, 'Hook')}`;
  return `${s}</svg>`;
}

/** What each leg is made of, legs with the same rigging grouped: [{ ids: ['A', 'C'], text }], and the head. */
export function legCompositions(res) {
  const legs = (res?.rig?.legs || []).filter((l) => l.level !== 'top');
  const groups = [];
  legs.forEach((l) => {
    const text = (l.parts || []).filter((x) => x.item).map((x) => niceName(x.item, isLengthPart(x) ? { length_m: x.length_m, links: x.kind === 'chain' ? x.links : null } : {})).join(' → ');
    const g = groups.find((x) => x.text === text);
    if (g) g.ids.push(l.pointId); else groups.push({ ids: [l.pointId], text });
  });
  const ml = res?.rig?.head?.masterlink;
  return { groups, head: ml ? niceName(ml) : null };
}
