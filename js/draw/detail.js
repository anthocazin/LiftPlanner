// Rigging detail to scale: each leg drawn end to end with the real geometry of the catalogue
// components (Green Pin shackles, master links, roundslings…).
// Convention: bearing axes alternate by 90° from one component to the next (front / side view).
import { svgDoc, path, rect, circle, line, text, label, group, esc } from './svg.js';
import { fmt } from './fmt.js';
import { shackleSideLoadFactor, niceName } from '../catalog/index.js';

const STEEL = '#8b96a3';
const STEEL_EDGE = '#3c4652';
const sw = { 'vector-effect': 'non-scaling-stroke' };

function ringFace(y0, IL, IW, D) {
  // oblong link seen face-on; y0 = top inside bearing
  const ri = IW / 2, ro = ri + D;
  const straight = Math.max(IL - IW, 0);
  const cyT = y0 + ri, cyB = y0 + ri + straight;
  const outer = `M ${-ro} ${cyT} A ${ro} ${ro} 0 0 1 ${ro} ${cyT} L ${ro} ${cyB} A ${ro} ${ro} 0 0 1 ${-ro} ${cyB} Z`;
  const inner = `M ${-ri} ${cyT} A ${ri} ${ri} 0 0 1 ${ri} ${cyT} L ${ri} ${cyB} A ${ri} ${ri} 0 0 1 ${-ri} ${cyB} Z`;
  return path(`${outer} ${inner}`, { fill: STEEL, 'fill-rule': 'evenodd', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
}

/** G-link (chain connecting link), face-on, in its own colour so it is not taken for a chain link. */
function glinkFace(y0, L, IW, D) {
  const ri = IW / 2, ro = ri + D;
  const straight = Math.max(L - IW, 0);
  const cyT = y0 + ri, cyB = y0 + ri + straight;
  const outer = `M ${-ro} ${cyT} A ${ro} ${ro} 0 0 1 ${ro} ${cyT} L ${ro} ${cyB} A ${ro} ${ro} 0 0 1 ${-ro} ${cyB} Z`;
  const inner = `M ${-ri} ${cyT} A ${ri} ${ri} 0 0 1 ${ri} ${cyT} L ${ri} ${cyB} A ${ri} ${ri} 0 0 1 ${-ri} ${cyB} Z`;
  const ym = (cyT + cyB) / 2;
  return path(`${outer} ${inner}`, { fill: '#c9853f', 'fill-rule': 'evenodd', stroke: '#7a4512', 'stroke-width': 1, ...sw }) +
    line(-ro, ym, -ri, ym, { stroke: '#7a4512', 'stroke-width': 1.2, ...sw }) + line(ri, ym, ro, ym, { stroke: '#7a4512', 'stroke-width': 1.2, ...sw });
}

function ringEdge(y0, IL, D, dx = 0) {
  return rect(dx - D / 2, y0 - D, D, IL + 2 * D, { rx: D / 2, fill: STEEL, stroke: STEEL_EDGE, 'stroke-width': 1, ...sw }) +
    line(dx - D / 2, y0, dx + D / 2, y0, { stroke: STEEL_EDGE, 'stroke-width': 0.6, 'stroke-dasharray': '2 2', ...sw }) +
    line(dx - D / 2, y0 + IL, dx + D / 2, y0 + IL, { stroke: STEEL_EDGE, 'stroke-width': 0.6, 'stroke-dasharray': '2 2', ...sw });
}

/** Shackle, front view (bow). yPin = pin centre; dir = +1 bow downwards, −1 bow upwards. */
function shackleFront(s, yPin, dir) {
  const d = s.dims;
  const a = d.bowDia, b = d.pinDia, e = d.jawWidth, f = d.insideLength, g = d.bowWidth, c = d.eyeDia, ew = d.eyeWidth || a;
  const Y = (v) => yPin + dir * v;
  const y0 = b / 2, yc = b / 2 + f;
  const inner = `M ${-e / 2} ${Y(y0)} C ${-e / 2} ${Y(y0 + 0.3 * f)} ${-g / 2} ${Y(y0 + 0.3 * f)} ${-g / 2} ${Y(y0 + 0.62 * f)} C ${-g / 2} ${Y(y0 + 0.9 * f)} ${-g / 4} ${Y(yc)} 0 ${Y(yc)} C ${g / 4} ${Y(yc)} ${g / 2} ${Y(y0 + 0.9 * f)} ${g / 2} ${Y(y0 + 0.62 * f)} C ${g / 2} ${Y(y0 + 0.3 * f)} ${e / 2} ${Y(y0 + 0.3 * f)} ${e / 2} ${Y(y0)}`;
  const go = g / 2 + a, eo = e / 2 + ew;
  const outer = `M ${-eo} ${Y(0)} C ${-eo} ${Y(y0 + 0.3 * f)} ${-go} ${Y(y0 + 0.25 * f)} ${-go} ${Y(y0 + 0.62 * f)} C ${-go} ${Y(y0 + f + a * 0.6)} ${-g / 4} ${Y(yc + a)} 0 ${Y(yc + a)} C ${g / 4} ${Y(yc + a)} ${go} ${Y(y0 + f + a * 0.6)} ${go} ${Y(y0 + 0.62 * f)} C ${go} ${Y(y0 + 0.25 * f)} ${eo} ${Y(y0 + 0.3 * f)} ${eo} ${Y(0)}`;
  let out = path(`${outer} L ${e / 2} ${Y(0)} ${inner.replace(/^M/, 'L')} Z`, { fill: STEEL, stroke: STEEL_EDGE, 'stroke-width': 1, 'fill-rule': 'evenodd', ...sw });
  // eyes
  out += rect(-e / 2 - ew, yPin - c / 2, ew, c, { rx: ew * 0.3, fill: '#9aa5b1', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  out += rect(e / 2, yPin - c / 2, ew, c, { rx: ew * 0.3, fill: '#9aa5b1', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  // pin + nut (right side) + head (left)
  const pinL = e + 2 * ew;
  out += rect(-pinL / 2 - b * 0.5, yPin - b / 2, pinL + b * 1.4, b, { fill: '#2e8b3a', stroke: '#1d5c25', 'stroke-width': 1, ...sw });
  out += rect(pinL / 2 + b * 0.25, yPin - b * 0.6, b * 0.5, b * 1.2, { fill: '#6b7785', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  out += rect(-pinL / 2 - b * 0.55, yPin - b * 0.7, b * 0.35, b * 1.4, { fill: '#2e8b3a', stroke: '#1d5c25', 'stroke-width': 1, ...sw });
  return { svg: out, crownY: Y(yc), crownBarY: Y(yc + a / 2), halfWidth: go, crownDir: 'lr', a };
}

/** Shackle, side view (pin seen end-on). */
function shackleSide(s, yPin, dir) {
  const d = s.dims;
  const a = d.bowDia, b = d.pinDia, f = d.insideLength, c = d.eyeDia;
  const yc = yPin + dir * (b / 2 + f); // inside bearing of the bow
  const yEnd = yPin + dir * (b / 2 + f + a);
  const y1 = Math.min(yPin, yEnd), y2 = Math.max(yPin, yEnd);
  let out = rect(-a / 2, y1, a, y2 - y1, { rx: a / 2, fill: STEEL, stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  out += circle(0, yPin, c / 2, { fill: '#9aa5b1', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  out += circle(0, yPin, b / 2, { fill: '#2e8b3a', stroke: '#1d5c25', 'stroke-width': 1, ...sw });
  out += circle(0, yc + dir * (a / 2), a / 2, { fill: '#7d8996', stroke: STEEL_EDGE, 'stroke-width': 0.8, ...sw });
  return { svg: out, crownY: yc, crownBarY: yc + dir * (a / 2), halfWidth: c / 2, crownDir: 'depth', a };
}

/** Sling: band (bearing axis left-right) or side-view loop (bearing axis in depth). */
function sling(item, yTop, yBot, topStyle, topBar, len_m, botBarA = 0) {
  const w = item?.dims?.width || 60;
  const col = item?.colorHex || '#2a5db0';
  const tk = Math.max(w * 0.22, 8);
  const st = { fill: col, stroke: '#222', 'stroke-width': 0.8, ...sw };
  let out = '';
  let bandTop = yTop - (topBar.a || 0);
  if (topStyle === 'depth') {
    const r = (topBar.a || 30) / 2;
    const cy = yTop - r; // centre of the bearing bar
    bandTop = yTop + w * 0.9;
    out += path(
      `M ${-r - tk} ${cy} A ${r + tk} ${r + tk} 0 0 1 ${r + tk} ${cy} L ${r + tk} ${cy + r + w * 0.3} L ${w / 2} ${bandTop} L ${-w / 2} ${bandTop} L ${-r - tk} ${cy + r + w * 0.3} Z ` +
        `M ${-r} ${cy} A ${r} ${r} 0 0 1 ${r} ${cy} L ${r} ${cy + r} L ${-r} ${cy + r} Z`,
      { ...st, 'fill-rule': 'evenodd' },
    );
  }
  const yEnd = yBot + botBarA;
  const mid = (bandTop + yEnd) / 2;
  const gap = Math.min(30, (yEnd - bandTop) * 0.08);
  const gz = gap * 0.6;
  out += path(`M ${-w / 2} ${bandTop} L ${w / 2} ${bandTop} L ${w / 2} ${mid - gap} L ${w / 4} ${mid - gap + gz} L ${-w / 4} ${mid - gap - gz} L ${-w / 2} ${mid - gap} Z`, st);
  out += path(`M ${-w / 2} ${mid + gap} L ${-w / 4} ${mid + gap - gz} L ${w / 4} ${mid + gap + gz} L ${w / 2} ${mid + gap} L ${w / 2} ${yEnd} L ${-w / 2} ${yEnd} Z`, st);
  for (let i = 1; i <= Math.min(5, Math.round(item?.wll_t || 1)); i++) {
    const xx = -w / 2 + (i * w) / 6;
    out += line(xx, bandTop + 4, xx, mid - gap - 4, { stroke: 'rgba(255,255,255,.5)', 'stroke-width': 0.8, ...sw });
    out += line(xx, mid + gap + 6, xx, yEnd - 4, { stroke: 'rgba(255,255,255,.5)', 'stroke-width': 0.8, ...sw });
  }
  return { svg: out, w, mid, labelY: mid, len_m };
}

function padeyeEdge(yPin, t, R, hole, dir = 1) {
  // padeye / lug seen edge-on; dir = +1: the plate extends downwards
  const th = Math.max(t || 25, 10);
  const r = Math.max(R || th * 2, (hole || 30) * 0.8);
  const y1 = yPin - dir * r, y2 = yPin + dir * (r + 90);
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  let out = rect(-th / 2, ya, th, yb - ya, { fill: '#c6ced6', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  if (hole) {
    out += line(-th / 2, yPin - hole / 2, th / 2, yPin - hole / 2, { stroke: STEEL_EDGE, 'stroke-dasharray': '3 2', 'stroke-width': 0.7, ...sw });
    out += line(-th / 2, yPin + hole / 2, th / 2, yPin + hole / 2, { stroke: STEEL_EDGE, 'stroke-dasharray': '3 2', 'stroke-width': 0.7, ...sw });
  }
  const yBase = dir > 0 ? yb : ya;
  out += rect(-th * 3, dir > 0 ? yBase : yBase - 14, th * 6, 14, { fill: '#dfe4ea', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  for (let i = -3; i < 3; i++)
    out += line(th * i, dir > 0 ? yBase + 14 : yBase - 14, th * (i + 0.7), dir > 0 ? yBase : yBase, { stroke: STEEL_EDGE, 'stroke-width': 0.5, ...sw });
  return { svg: out, top: ya, bottom: yb + (dir > 0 ? 14 : 0) };
}

/** Padeye seen face-on (hole facing the viewer), base plate below; yPin = hole centre. */
function padeyeFace(yPin, hole, R) {
  const r = Math.max(R, hole * 0.9);
  const A = r * 1.5, L = r * 2.7;
  const yb = yPin + A;
  let out = path(`M ${-r} ${yPin} A ${r} ${r} 0 0 1 ${r} ${yPin} L ${L / 2} ${yb} L ${-L / 2} ${yb} Z`, { fill: '#c6ced6', stroke: STEEL_EDGE, 'stroke-width': 1.2, ...sw });
  out += circle(0, yPin, hole / 2, { fill: '#fff', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  out += rect(-L * 0.75, yb, L * 1.5, 14, { fill: '#dfe4ea', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
  for (let i = -6; i < 6; i++) out += line((L * 0.75 * i) / 6, yb + 28, (L * 0.75 * (i + 0.8)) / 6, yb + 14, { stroke: STEEL_EDGE, 'stroke-width': 0.5, ...sw });
  return { svg: out, bottom: yb + 28, half: L * 0.75 };
}

function hookShape(y0, size) {
  const r = size;
  return path(
    `M ${-r * 0.35} ${y0 - r * 3.2} L ${r * 0.35} ${y0 - r * 3.2} L ${r * 0.3} ${y0 - r * 2.2}
     C ${r * 1.5} ${y0 - r * 2.0} ${r * 1.6} ${y0 + r * 1.3} ${0} ${y0 + r * 1.25}
     C ${-r * 1.1} ${y0 + r * 1.2} ${-r * 1.45} ${y0 + r * 0.2} ${-r * 1.25} ${y0 - r * 0.6}
     L ${-r * 0.85} ${y0 - r * 0.55}
     C ${-r * 0.9} ${y0 - r * 0.05} ${-r * 0.6} ${y0} ${0} ${y0}
     C ${r * 0.7} ${y0} ${r * 0.85} ${y0 - r * 1.5} ${-r * 0.3} ${y0 - r * 2.2} Z`,
    { fill: '#f2c14e', stroke: '#7a5a10', 'stroke-width': 1.2, ...sw },
  ) + rect(-r * 0.5, y0 - r * 4.2, r, r * 1.0, { fill: '#6b7785', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw });
}

/** Chain drawn to scale: a few links at each end, the middle shortened. */
function chainDraw(item, y0, links, dispMax = 520) {
  const d = item?.dims?.dia || 13, p = item?.dims?.pitch || 3 * d, w = item?.dims?.width || 3.6 * d;
  const iw = Math.max(w - 2 * d, d * 1.1);
  const total = links * p;
  const shown = Math.min(total, dispMax);
  const nShow = Math.max(1, Math.round(shown / p));
  const nTop = links <= nShow ? links : Math.ceil(nShow * 0.65);
  const nBot = links <= nShow ? 0 : nShow - nTop;
  let out = '';
  const link = (k, yy) => (k % 2 === 0 ? ringFace(yy, p, iw, d) : ringEdge(yy, p, d));
  for (let k = 0; k < nTop; k++) out += link(k, y0 + k * p);
  let y = y0 + nTop * p;
  let gapMid = null;
  if (nBot > 0) {
    const g = Math.max(2 * p, 40);
    gapMid = y + g / 2;
    out += path(`M ${-w} ${y + g * 0.35} L ${w} ${y + g * 0.15} M ${-w} ${y + g * 0.85} L ${w} ${y + g * 0.65}`, { stroke: '#5d6b7a', 'stroke-width': 1, fill: 'none', ...sw });
    y += g;
    for (let k = 0; k < nBot; k++) out += link(links - nBot + k, y + k * p);
    y += nBot * p;
  }
  // the last link bearing is at y; the next element hangs in the plane of the last link
  const lastFace = (links - 1) % 2 === 0;
  return { svg: out, end: y, mid: gapMid ?? y0 + (y - y0) / 2, halfWidth: w / 2 + d, nextBar: lastFace ? 'lr' : 'depth', a: d };
}

/** Builds the column of one leg (coordinates in mm, y down): from the hook down to the lift point. */
function buildColumn(leg, rig, project, { slingDisp = 420, chainDisp = 520, lite = false, quiet = lite } = {}) {
  const head = rig.head || {};
  const parts = [];
  const labels = [];
  const inline = [];
  let y = 0;
  let bar = 'depth';
  let barA = 40;
  let minX = -60, maxX = 60;
  const ext = (hw) => { minX = Math.min(minX, -hw); maxX = Math.max(maxX, hw); };
  // quiet (engineering office lift plan, Light): no utilisation, no angle, no leg force;
  // lite (LiftPlanner Light): quiet + the padeye seen face-on
  const util = (F, wll) => (wll && !quiet ? `${Math.round((F / wll) * 100)} %` : '');
  const j = (...xs) => xs.filter(Boolean).join(' · ');
  const F = leg.Fdesign;
  const sp = project.rigging.spreader || {};

  const fromHook = leg.level !== 'bottom';
  if (fromHook) {
    const hs = Math.max((head.masterlink?.dims?.stockDia || 30) * 1.4, 35);
    parts.push(hookShape(0, hs));
    labels.push({ y: -hs * 1.5, x: hs * 1.2, t: [`Crane hook`, lite ? `hook load ${fmt(rig.shl)} t` : `static load ${fmt(rig.shl)} t`] });
    var hookBottom = hs * 1.25; // eslint-disable-line no-var
    ext(hs * 1.6);
    if (head.topShackle) {
      const s = head.topShackle;
      const r = shackleSide(s, y + s.dims.pinDia / 2, 1);
      parts.push(r.svg);
      labels.push({ y: y + s.dims.insideLength / 2, x: r.halfWidth, t: [niceName(s), `hook ↔ master link`] });
      y = r.crownY; bar = r.crownDir; barA = r.a; ext(r.halfWidth);
    }
    if (head.masterlink) {
      const m = head.masterlink.dims;
      parts.push(ringFace(y, m.insideLength, m.insideWidth, m.stockDia));
      labels.push({ y: y + m.insideLength / 2, x: m.insideWidth / 2 + m.stockDia, t: head.unknownSWL ? ['Masterlink'] : [niceName(head.masterlink), `util. ${util(rig.Fvert_design, head.masterlink.wll_t)}`] });
      ext(m.insideWidth / 2 + m.stockDia);
      y += m.insideLength; bar = 'lr'; barA = m.stockDia;
      if (head.useSub && head.subLink && leg.level === 'main') {
        const sd = head.subLink.dims;
        parts.push(ringEdge(y, sd.insideLength, sd.stockDia));
        labels.push({ y: y + sd.insideLength / 2, x: sd.stockDia, t: [head.unknownSWL ? 'Sub-link' : `Sub-link ${fmt(head.subLink.wll_t)}t`] });
        y += sd.insideLength; bar = 'depth'; barA = sd.stockDia;
      }
    }
  }
  const headN = parts.length, headLabelsN = labels.length, headY = y;
  if (!fromHook) {
    // spreader bottom leg: starts at the bottom lug of the bar
    const last = leg.parts[leg.parts.length - 1]?.item;
    const pe = padeyeEdge(0, Number(sp.bottomLugThk_mm) || (last?.dims?.jawWidth || 38) * 0.8, (last?.dims?.pinDia || 30) * 1.6, Number(sp.bottomLugHoleDia_mm) || (last?.dims?.pinDia || 0) + 2, -1);
    parts.push(pe.svg);
    labels.push({ y: pe.top + 30, x: 40, t: ['Spreader bar bottom lug'] });
    bar = 'lug';
  }

  const list = leg.parts;
  let slingSvg = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const it = p.item;
    const wll = it ? it.wll_t * (p.factor || 1) : null;
    if (!it) {
      labels.push({ y: y + 20, x: 20, t: [`${p.kind} — not found`] });
      y += 60;
      continue;
    }
    if (p.kind === 'sling') {
      const below = list[i - 1]?.item;
      const sr = sling(it, y, y + slingDisp, bar === 'depth' ? 'depth' : 'lr', { a: barA }, p.length_m, below?.type === 'shackle' ? below.dims?.bowDia || 0 : 0);
      ext(sr.w / 2 + 20);
      labels.push({
        y: sr.mid, x: sr.w / 2, strong: true,
        t: quiet ? [niceName(it), `EWL ${fmt(p.length_m)} m${p.hitch === 'choke' ? ' choked' : ''}`] : [niceName(it), `EWL ${fmt(p.length_m)} m${p.hitch === 'choke' ? ' choked' : ''} · ${util(F, wll)}`, `${fmt(F)} t · ${leg.angleV.toFixed(1)}° to vertical`],
      });
      inline.push({ x: -sr.w / 2, y: sr.mid, t: `${fmt(p.length_m)} m` });
      slingSvg = sr.svg; // drawn last (on top of the bow)
      y += slingDisp; bar = 'depth'; barA = 0;
      if (i === 0 && p.hitch === 'choke') {
        parts.push(rect(-120, y + 10, 240, 60, { fill: '#e8edf2', stroke: STEEL_EDGE, 'stroke-width': 1, 'stroke-dasharray': '5 3', ...sw }));
        labels.push({ y: y + 40, x: 120, t: ['Choked around the load', p.wrap_m ? `wrap ${fmt(p.wrap_m)} m` : ''] });
        y += 80;
      }
      continue;
    }
    if (p.kind === 'chain') {
      const c = chainDraw(it, y, p.links || 1, i === leg.li ? chainDisp : 520);
      parts.push(c.svg);
      ext(c.halfWidth + 10);
      labels.push({
        y: c.mid, x: c.halfWidth, strong: true,
        t: quiet ? [niceName(it), `${fmt(p.length_m, 2)} m (${p.links} links)`] : [niceName(it), `${fmt(p.length_m, 2)} m (${p.links} links) · ${util(F, wll)}`, `${fmt(F)} t · ${leg.angleV.toFixed(1)}° to vertical`],
      });
      inline.push({ x: -c.halfWidth, y: c.mid, t: `${fmt(p.length_m, 2)} m` });
      y = c.end; bar = c.nextBar; barA = c.a;
      continue;
    }
    if (p.kind === 'hook') {
      // eye hook in the leg: eye up on the element above, the element below in its saddle
      const d = it.dims || {};
      const C = d.eyeDia || 40, B = d.saddle || 30, eff = d.effLength || (d.length || 200) * 0.75;
      const t = Math.max(B * 0.45, 8);
      parts.push(ringFace(y, C, C, t));
      const yS = y + eff;
      const r = Math.max((yS - (y + C + t)) / 4.2, B * 0.5);
      parts.push(hookShape(yS, r));
      labels.push({ y: y + eff * 0.6, x: r * 1.5, t: [niceName(it), util(F, it.wll_t)].filter(Boolean) });
      ext(r * 1.6);
      y = yS; bar = 'depth'; barA = t;
      continue;
    }
    if (p.kind === 'connlink' || p.kind === 'glink' || p.kind === 'masterlink') {
      const ml = p.kind === 'masterlink';
      const L = ml ? it.dims.insideLength || 120 : it.dims.effLength || 60, t = ml ? it.dims.stockDia || 15 : it.dims.barThk || 15;
      const W = ml ? it.dims.insideWidth || 60 : p.kind === 'glink' ? it.dims.maxSlingWidth || 60 : Math.max((it.dims.width || 30) - 2 * t, t);
      parts.push(p.kind === 'connlink' ? glinkFace(y, L, W, t) : bar === 'lr' ? ringEdge(y, L, t) : ringFace(y, L, W, t));
      labels.push({ y: y + L / 2, x: W / 2 + t, t: [niceName(it), util(F, it.wll_t)].filter(Boolean) });
      ext(W / 2 + t);
      y += L; bar = bar === 'lr' ? 'depth' : 'lr'; barA = t;
      continue;
    }
    if (p.kind === 'shackle') {
      const d = it.dims;
      if (i > leg.li || (i === list.length - 1 && leg.li < 0)) {
        // hook side: pin up on the element above, bow down
        const pinCenter = bar === 'lug' ? y : y + d.pinDia / 2;
        const r = bar === 'lr' ? shackleSide(it, pinCenter, 1) : shackleFront(it, pinCenter, 1);
        parts.push(r.svg);
        labels.push({ y: pinCenter + d.insideLength * 0.5, x: r.halfWidth, t: [niceName(it), util(F, wll)].filter(Boolean) });
        ext(r.halfWidth);
        y = r.crownY; bar = r.crownDir; barA = r.a;
      } else {
        // load side: bow up holding the element above, pin down
        const pinCenter = y + d.insideLength + d.pinDia / 2;
        const liteEye = lite && i === 0 && leg.level !== 'top';
        const r = liteEye ? shackleSide(it, pinCenter, -1) : shackleFront(it, pinCenter, -1);
        const sf = i === 0 && leg.level !== 'top' ? shackleSideLoadFactor(leg.beta || 0) : 1;
        if (liteEye) {
          const pt = leg.point;
          const pe = padeyeFace(pinCenter, d.pinDia + 3, d.eyeDia * 0.85);
          parts.push(pe.svg);
          labels.push({ y: pinCenter + d.eyeDia * 0.9, x: pe.half * 0.55, t: [`Padeye ${pt?.id || ''}`.trim()] });
          ext(pe.half);
          y = pe.bottom;
        } else if (i === 0) {
          const pt = leg.point;
          const pad = pt && pt.padeye !== false;
          const thk = pad ? (Number(pt.thk_mm) || 0) + 2 * (Number(pt.cheekThk_mm) || 0) : Number(sp.topLugThk_mm);
          const hole = pad ? Number(pt.holeDia_mm) : Number(sp.topLugHoleDia_mm);
          const R = pad ? Number(pt.radius_mm) : 0;
          const pe = padeyeEdge(pinCenter, thk || d.jawWidth * 0.8, R || d.pinDia * 1.8, hole || d.pinDia + 2, 1);
          parts.push(pe.svg);
          labels.push({
            y: pinCenter + 40, x: (thk || 30) * 3,
            t: pt ? [pad ? `Padeye ${pt.id} · SWL ${pt.swl_t ? fmt(pt.swl_t) + ' t' : '—'}` : `Lift point ${pt.id} (no padeye)`, pad ? `thk. ${thk || '?'} mm · hole Ø${hole || '?'} mm` : ''] : ['Spreader bar top lug'],
          });
          y = pe.bottom;
        } else y = pinCenter + d.pinDia;
        parts.push(r.svg);
        labels.push({ y: pinCenter - d.insideLength * 0.45, x: r.halfWidth, t: quiet ? [niceName(it), `pin Ø${d.pinDia}`] : [niceName(it), `${util(F, it.wll_t * sf)} · pin Ø${d.pinDia}`] });
        ext(r.halfWidth + d.pinDia);
        bar = 'depth'; barA = d.pinDia;
      }
    }
  }
  if (slingSvg) parts.push(slingSvg);
  return { parts, labels, inline, height: y, minX, maxX, headN, headLabelsN, headY, hookBottom: fromHook ? hookBottom : 0, top: fromHook ? -Math.max((head.masterlink?.dims?.stockDia || 30) * 1.4, 35) * 4.3 : -120 };
}

function legSignature(l) {
  return [l.level, ...l.parts.map((p) => `${p.kind}:${p.item?.id}:${p.links ?? (p.length_m != null ? Number(p.length_m).toFixed(2) : '')}:${p.hitch || ''}`)].join('|');
}

/** Full drawing: one column per distinct leg configuration. */
export function drawRiggingDetail(project, res, opts = {}) {
  const rig = res?.rig;
  const Hpx = opts.height || 640;
  if (!rig || rig.error) return svgDoc(600, 200, text(20, 30, rig?.error || 'No result', { fill: '#c0392b' }));
  const groups = [];
  for (const leg of rig.legs) {
    const sig = legSignature(leg);
    const g = groups.find((x) => x.sig === sig);
    if (g) g.legs.push(leg);
    else groups.push({ sig, legs: [leg] });
  }
  const cols = groups.map((g) => ({ ...g, col: buildColumn(g.legs[0], rig, project) }));
  const spanMm = Math.max(...cols.map((c) => c.col.height - c.col.top));
  const s = (Hpx - 70) / spanMm; // px per mm
  const labelW = 230;
  let x = 20;
  let body = '';
  for (const c of cols) {
    const colW = (c.col.maxX - c.col.minX) * s + 50;
    const cx = x + 50 - c.col.minX * s;
    const oy = 50 - c.col.top * s;
    body += group(c.col.parts.join(''), { transform: `translate(${cx.toFixed(1)} ${oy.toFixed(1)}) scale(${s.toFixed(5)})` });
    for (const il of c.col.inline)
      body += label(cx + il.x * s - 6, oy + il.y * s + 4, il.t, { 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: '#173a5e' });
    // column title
    const names = c.legs.map((l) => l.key).join(', ');
    const lvl = c.legs[0].level === 'top' ? 'Top legs' : c.legs[0].level === 'bottom' ? 'Bottom legs' : 'Legs';
    body += text(x, 22, `${lvl} ${names} (×${c.legs.length})`, { 'font-size': 12, 'font-weight': 700, fill: '#173a5e' });
    // callouts
    let lastY = -1e9;
    const ordered = [...c.col.labels].sort((a, b) => a.y - b.y);
    for (const lb of ordered) {
      const ax = cx + lb.x * s + 4;
      const ay = oy + lb.y * s;
      const ty = Math.max(ay, lastY + 12 * lb.t.length + 6);
      const tx = x + colW + 12;
      body += line(ax, ay, tx - 4, ty - 3, { stroke: '#8a96a3', 'stroke-width': 0.7 });
      body += circle(ax, ay, 1.8, { fill: '#555' });
      lb.t.forEach((t, i) => (body += text(tx, ty + i * 12, t, { 'font-size': i === 0 ? 10.5 : 10, 'font-weight': i === 0 && lb.strong ? 700 : i === 0 ? 600 : 400, fill: i === 0 ? '#1c2733' : '#4d5966' })));
      lastY = ty + 12 * (lb.t.length - 1);
    }
    x += colW + labelW + 24;
  }
  body += text(20, Hpx - 10, 'Components to scale (sling and chain bodies shortened).', { 'font-size': 9.5, fill: '#5d6b7a' });
  return svgDoc(Math.max(x, 600), Hpx, body, { title: 'Rigging detail' });
}


/**
 * Rigging arrangement to scale: laid out like the rigging arrangement (crane hook and master link
 * once at the top, one column per leg, side by side, joined to the master link), every component to
 * scale (sling and chain bodies shortened). Callouts as in the rigging detail; a leg made like an
 * earlier one only gets its name.
 */
export function drawRiggingFan(project, res, opts = {}) {
  const rig = res?.rig;
  const Hpx = opts.height || 620;
  if (!rig || rig.error) return svgDoc(600, 200, text(20, 30, rig?.error || 'No result', { fill: '#c0392b' }));
  const ids = (project.load.liftPoints || []).filter((q) => q.used !== false).map((q) => q.id);
  const legs = rig.legs.filter((l) => l.level === 'main').sort((a, b) => ids.indexOf(a.pointId) - ids.indexOf(b.pointId));
  if (!legs.length || rig.type === 'spreader') return drawRiggingDetail(project, res, opts);
  // sling / chain bodies all shown with the same (cut) length: the length is written beside each leg
  const Ls = legs.map((l) => Number(l.parts?.[l.li]?.length_m) || 0);
  const lite = !!opts.lite;
  // engineering office lift plan: the angle only serves the checks — no angle, %, nor leg force shown
  const quiet = lite || project.load?.setupMode === 'import';
  const disp = () => (lite ? 360 : 420);
  const cols = legs.map((l, i) => { const d = disp(Ls[i]); return buildColumn(l, rig, project, { slingDisp: d, chainDisp: d, lite, quiet }); });
  const c0 = cols[0];
  const gap = 46; // px between the crane hook and the top of the legs
  const legSpan = Math.max(...cols.map((c) => c.height - c.headY));
  const s = (Hpx - 80 - gap) / (c0.hookBottom - c0.top + legSpan + 50);
  const sig = (l) => l.parts.map((p) => `${p.kind}:${p.item?.id}:${p.length_m != null ? Number(p.length_m).toFixed(2) : ''}`).join('|');
  const first = new Map();
  legs.forEach((l) => { if (!first.has(sig(l))) first.set(sig(l), l.pointId); });
  const labelled = legs.map((l) => first.get(sig(l)) === l.pointId);
  const FS = lite ? 21 : 15, LH = lite ? 25 : 17; // text size and line height
  const labelW = lite ? 255 : 205;
  // columns side by side (room for the callouts only where there are some), the whole centred,
  // the hook above the middle of the legs
  const half = Math.max(...cols.map((c) => Math.max(-c.minX, c.maxX))) * s;
  let xx = 70 + half;
  const lay = cols.map((c, i) => {
    const o = { c, cx: xx, l: legs[i], lab: labelled[i] };
    xx += 2 * half + (labelled[i] ? labelW + 24 : 40);
    return o;
  });
  const right = lay[lay.length - 1].cx + half + (labelled[lay.length - 1] ? labelW + 10 : 20);
  const W = Math.round(Math.max(right + 20, 520));
  const headCx = (lay[0].cx + lay[lay.length - 1].cx) / 2;
  const oy = 30 - c0.top * s;
  const headBottom = oy + c0.hookBottom * s;
  const legTop = headBottom + gap;
  let body = '';
  // crane hook only (its master link belongs to the crane)
  body += group(c0.parts[0], { transform: `translate(${headCx.toFixed(1)} ${oy.toFixed(1)}) scale(${s.toFixed(5)})` });
  const callout = (ax, ay, tx, ty, t, strong) => {
    let out = line(ax, ay, tx - 4, ty - 3, { stroke: '#8a96a3', 'stroke-width': 0.7 }) + circle(ax, ay, 1.8, { fill: '#555' });
    t.filter(Boolean).forEach((tt, i) => (out += text(tx, ty + i * LH, tt, { 'font-size': i === 0 ? FS : FS - 1.5, 'font-weight': i === 0 && strong ? 700 : i === 0 ? 600 : 400, fill: i === 0 ? '#1c2733' : '#4d5966' })));
    return out;
  };
  const hl = c0.labels[0];
  body += callout(headCx + hl.x * s + 4, oy + hl.y * s, headCx + 90, oy + hl.y * s, hl.t, false);
  for (const { c, cx, l, lab } of lay) {
    const topY = legTop + 2;
    body += line(headCx, headBottom, cx, topY - 4, { stroke: '#9aa5b1', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' });
    body += group(c.parts.slice(c.headN).join(''), { transform: `translate(${cx.toFixed(1)} ${(topY - c.headY * s).toFixed(1)}) scale(${s.toFixed(5)})` });
    const Y = (y) => topY + (y - c.headY) * s;
    for (const il of c.inline) body += label(cx + il.x * s - 6, Y(il.y) + 5, il.t, { 'text-anchor': 'end', 'font-size': FS, 'font-weight': 700, fill: '#173a5e' });
    const by = Y(c.height);
    body += text(cx, by + (lite ? 26 : 20), lite ? `${l.pointId} (${ids.indexOf(l.pointId) + 1})` : l.pointId, { 'text-anchor': 'middle', 'font-size': lite ? 26 : 18, 'font-weight': 800, fill: '#c0392b' });
    if (!quiet) body += text(cx, by + 37, `${fmt(l.Tstatic)} t · ${l.angleV.toFixed(1)}°`, { 'text-anchor': 'middle', 'font-size': FS - 1.5, fill: '#173a5e', 'font-weight': 600 });
    if (!lab) continue;
    const tx = cx + half + 14;
    let last = -1e9;
    for (const lb of [...c.labels.slice(c.headLabelsN)].sort((a, b) => a.y - b.y)) {
      const ay = Y(lb.y);
      const ty = Math.max(ay, last + LH + 6);
      body += callout(cx + lb.x * s + 4, ay, tx, ty, lb.t, lb.strong);
      last = ty + LH * (lb.t.filter(Boolean).length - 1);
    }
  }
  const maxBy = Math.max(...lay.map(({ c }) => legTop + 2 + (c.height - c.headY) * s)) + (lite ? 36 : 46);
  const H = Math.max(Math.round(maxBy), 300);
  return svgDoc(W, H, body, { title: 'Rigging arrangement to scale' });
}

export { esc };

/**
 * Padeye + shackle fit, drawn like the pad eye datasheet: FACE view (base L, hole height A, radius R,
 * hole ØH, shackle bow in front) and SIDE view (main plate t, cheek plates → total T, weld bevel,
 * shackle jaw around the padeye with its pin through the hole). To scale, same scale in both views.
 */
export function drawPadeyeFit(point, shackle, opts = {}) {
  const W = opts.width || 560, H = opts.height || 300;
  const t = Number(point?.thk_mm) || 0, tc = Number(point?.cheekThk_mm) || 0;
  const T = t + 2 * tc;
  const Dh = Number(point?.holeDia_mm) || 0, R = Number(point?.radius_mm) || 0, A = Number(point?.height_mm) || R * 1.2, L = Number(point?.baseL_mm) || Math.max(2.4 * R, 2 * R + 20);
  if (!shackle?.dims || !(R > 0)) return svgDoc(W, H, text(16, 30, !shackle?.dims ? 'No shackle selected at this point yet' : 'Enter the padeye radius R', { fill: '#5d6b7a' }));
  const d = shackle.dims;
  const pin = d.pinDia, hole = Dh || pin + 2;
  const topPad = A + R;
  const shTop = A - hole / 2 + pin + d.insideLength + d.bowDia; // pin bears at the top of the hole
  const hModel = Math.max(topPad, shTop) + 40;
  const k = Math.min((H - 70) / hModel, (W * 0.42) / Math.max(L + 60, d.width || d.length * 0.7 || 1));
  const dimC = '#3b6ea5';
  const dimLine = (x1, y1, x2, y2, txt, o = {}) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ah = (x, y, a) => `M ${x} ${y} l ${(6 * Math.cos(a + 0.4)).toFixed(1)} ${(6 * Math.sin(a + 0.4)).toFixed(1)} M ${x} ${y} l ${(6 * Math.cos(a - 0.4)).toFixed(1)} ${(6 * Math.sin(a - 0.4)).toFixed(1)}`;
    return path(`M ${x1} ${y1} L ${x2} ${y2} ${ah(x1, y1, ang)} ${ah(x2, y2, ang + Math.PI)}`, { stroke: dimC, 'stroke-width': 1, fill: 'none' }) +
      text((x1 + x2) / 2 + (o.dx || 0), (y1 + y2) / 2 + (o.dy ?? -4), txt, { 'text-anchor': o.anchor || 'middle', 'font-size': 10.5, fill: o.color || dimC, 'font-weight': 600 });
  };
  let body = '';
  // ---------------- FACE view (left)
  const fx = W * 0.28, fy = H - (W >= 640 ? 46 : 60); // base centre on screen (room for 2 lines of text when narrow)
  const X = (x) => fx + x * k, Y = (y) => fy - y * k;
  // tangent points from the base corners to the circle (centre (0, A), radius R)
  const tan = (sx) => {
    const px = sx * L / 2, py = 0, dx = px, dy = py - A, dist = Math.hypot(dx, dy);
    if (dist <= R) return [sx * R, A];
    const base = Math.atan2(dy, dx), off = Math.acos(R / dist);
    const ang = base + (sx > 0 ? off : -off);
    return [R * Math.cos(ang), A + R * Math.sin(ang)];
  };
  const [tlx, tly] = tan(-1), [trx, try_] = tan(1);
  body += path(`M ${X(-L / 2)} ${Y(0)} L ${X(tlx)} ${Y(tly)} A ${R * k} ${R * k} 0 1 1 ${X(trx)} ${Y(try_)} L ${X(L / 2)} ${Y(0)} Z`, { fill: '#c6ced6', stroke: STEEL_EDGE, 'stroke-width': 1.2 });
  body += line(X(-L / 2) - 8, Y(0), X(L / 2) + 8, Y(0), { stroke: '#5d6b7a', 'stroke-width': 2 });
  body += circle(X(0), Y(A), (hole / 2) * k, { fill: '#fff', stroke: STEEL_EDGE, 'stroke-width': 1 });
  // shackle seen along its pin (face view): its plane is perpendicular to the plate, so the shackle is
  // seen edge-on — a band as wide as the bow material, from the eyes up to the crown; pin end-on
  const pinY = A + hole / 2 - pin / 2;
  const bow = d.bowDia;
  const crownY = pinY + pin / 2 + d.insideLength; // inside of the crown
  const bandTop = crownY + bow;
  body += path(`M ${X(-bow / 2)} ${Y(pinY)} L ${X(-bow / 2)} ${Y(bandTop - bow / 2)} A ${(bow / 2) * k} ${(bow / 2) * k} 0 0 1 ${X(bow / 2)} ${Y(bandTop - bow / 2)} L ${X(bow / 2)} ${Y(pinY)} Z`, { fill: 'rgba(107,119,133,.55)', stroke: '#4a5562', 'stroke-width': 1 });
  body += line(X(0), Y(pinY), X(0), Y(bandTop), { stroke: '#4a5562', 'stroke-width': 0.6, 'stroke-dasharray': '6 3' });
  body += circle(X(0), Y(pinY), (d.eyeDia / 2) * k, { fill: 'rgba(107,119,133,.45)', stroke: '#4a5562', 'stroke-width': 1 });
  body += circle(X(0), Y(A), (hole / 2) * k, { fill: 'none', stroke: STEEL_EDGE, 'stroke-width': 0.9, 'stroke-dasharray': '3 2' });
  body += circle(X(0), Y(pinY), (pin / 2) * k, { fill: '#2e8b3a', stroke: '#1d5c25', 'stroke-width': 1 });
  body += text(X(bow / 2) + 6, Y(bandTop) + 10, 'shackle (edge-on)', { 'font-size': 9.5, fill: '#5d6b7a' });
  // dimensions
  body += dimLine(X(-L / 2), fy + 14, X(L / 2), fy + 14, `L ${L}`, { dy: 13 });
  body += dimLine(X(-L / 2) - 18, Y(0), X(-L / 2) - 18, Y(A), `A ${A}`, { dx: -6, anchor: 'end', dy: 4 });
  body += path(`M ${X(0)} ${Y(A)} L ${X(R * 0.707)} ${Y(A + R * 0.707)}`, { stroke: dimC, 'stroke-width': 1 }) + text(X(R * 0.75) + 3, Y(A + R * 0.75) - 2, `R ${R}`, { 'font-size': 10.5, fill: dimC, 'font-weight': 600 });
  body += text(X(-hole / 2) - 4, Y(A) + 4, `ØH ${Dh || '?'}`, { 'font-size': 10.5, fill: dimC, 'font-weight': 600, 'text-anchor': 'end' });
  body += text(fx, 16, `Face view — ${niceName(shackle)}`, { 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: '#173a5e' });
  // ---------------- SIDE view (right): main plate t, cheek plates → T, bevel; shackle jaw around it
  const sx = W * 0.7;
  const XS = (x) => sx + x * k;
  const bev = Math.min(t * 0.5, 12);
  // main plate with weld bevel at the base
  body += path(`M ${XS(-t / 2)} ${Y(topPad)} L ${XS(t / 2)} ${Y(topPad)} L ${XS(t / 2)} ${Y(bev)} L ${XS(0)} ${Y(0)} L ${XS(-t / 2)} ${Y(bev)} Z`, { fill: '#c6ced6', stroke: STEEL_EDGE, 'stroke-width': 1.2 });
  // cheek plates (bosses around the hole)
  if (tc > 0) {
    const cb = Math.max(A - R, bev + 2);
    body += rect(XS(-T / 2), Y(topPad), tc * k, (topPad - cb) * k, { fill: '#aab4be', stroke: STEEL_EDGE, 'stroke-width': 1 });
    body += rect(XS(t / 2), Y(topPad), tc * k, (topPad - cb) * k, { fill: '#aab4be', stroke: STEEL_EDGE, 'stroke-width': 1 });
  }
  body += line(XS(-T / 2) - 10, Y(0), XS(T / 2) + 10, Y(0), { stroke: '#5d6b7a', 'stroke-width': 2 });
  // hole (hidden lines)
  body += line(XS(-T / 2), Y(A + hole / 2), XS(T / 2), Y(A + hole / 2), { stroke: STEEL_EDGE, 'stroke-dasharray': '3 2', 'stroke-width': 0.8 });
  body += line(XS(-T / 2), Y(A - hole / 2), XS(T / 2), Y(A - hole / 2), { stroke: STEEL_EDGE, 'stroke-dasharray': '3 2', 'stroke-width': 0.8 });
  // shackle in its own plane: pin across the plate, an eye on each side (jaw), bow above, wider than the jaw
  const e = d.jawWidth, ew = d.eyeWidth || d.bowDia;
  const jawCol = T > 0 && T >= e ? '#c0392b' : '#4a5562';
  const xl = e / 2 + ew / 2; // centreline of the legs at the eyes
  const rC = Math.max(xl, (d.bowWidth || e) / 2 + bow / 2); // centreline radius of the bow
  const yC = crownY + bow / 2 - rC; // centre of the crown arc
  const y1 = pinY + d.eyeDia / 2;
  const yF = Math.max(y1 + 1, yC);
  const leg = (sgn) => `C ${XS(sgn * xl)} ${Y(y1 + (yF - y1) * 0.55)} ${XS(sgn * rC)} ${Y(yF - (yF - y1) * 0.35)} ${XS(sgn * rC)} ${Y(yF)}`;
  const bowD = `M ${XS(-xl)} ${Y(pinY)} L ${XS(-xl)} ${Y(y1)} ${leg(-1)} A ${rC * k} ${rC * k} 0 0 1 ${XS(rC)} ${Y(yF)} C ${XS(rC)} ${Y(yF - (yF - y1) * 0.35)} ${XS(xl)} ${Y(y1 + (yF - y1) * 0.55)} ${XS(xl)} ${Y(y1)} L ${XS(xl)} ${Y(pinY)}`;
  body += path(bowD, { fill: 'none', stroke: '#8a96a3', 'stroke-width': Math.max(2, bow * k), 'stroke-opacity': 0.75 });
  body += path(bowD, { fill: 'none', stroke: '#4a5562', 'stroke-width': 0.6, 'stroke-dasharray': '6 3' });
  body += rect(XS(-e / 2 - ew), Y(pinY + d.eyeDia / 2), ew * k, d.eyeDia * k, { fill: 'rgba(107,119,133,.75)', stroke: jawCol, 'stroke-width': 1 });
  body += rect(XS(e / 2), Y(pinY + d.eyeDia / 2), ew * k, d.eyeDia * k, { fill: 'rgba(107,119,133,.75)', stroke: jawCol, 'stroke-width': 1 });
  const pl = d.pinLength || e + 2 * ew + 20;
  body += rect(XS(-pl / 2), Y(pinY + pin / 2), pl * k, pin * k, { fill: '#2e8b3a', stroke: '#1d5c25', 'stroke-width': 1 });
  if (d.nutThk) body += rect(XS(e / 2 + ew), Y(pinY + pin * 0.85), d.nutThk * k, pin * 1.7 * k, { fill: '#5d6b7a', stroke: '#2b333c', 'stroke-width': 0.8 });
  // dimensions t, T, jaw
  const yd = Y(topPad) - 14;
  const ty = Math.max(bev + 6, Math.min(A - R - 8, A * 0.35));
  body += dimLine(XS(-t / 2) - 26, Y(ty), XS(-t / 2), Y(ty), '', {}) + dimLine(XS(t / 2), Y(ty), XS(t / 2) + 26, Y(ty), '', {}) + text(XS(t / 2) + 30, Y(ty) + 4, `t ${t}`, { 'font-size': 10.5, fill: '#3b6ea5', 'font-weight': 600 });
  if (tc > 0) body += dimLine(XS(-T / 2), yd, XS(T / 2), yd, `T ${T}`, { dy: -4 });
  body += dimLine(XS(-e / 2), Y(pinY) + d.eyeDia / 2 * k + 10, XS(e / 2), Y(pinY) + d.eyeDia / 2 * k + 10, '', { color: jawCol }) + text(XS(-e / 2 - ew) - 4, Y(pinY) + d.eyeDia / 2 * k + 14, `jaw ${e}`, { 'text-anchor': 'end', 'font-size': 10.5, fill: jawCol, 'font-weight': 600 });
  body += text(sx, 16, 'Side view — shackle in its plane', { 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: '#173a5e' });
  const clr = Dh ? Dh - pin : null;
  const l1 = `pin Ø${pin} in hole Ø${Dh || '?'}${clr != null ? ` (clearance ${clr.toFixed(1)} mm)` : ''}`;
  const l2 = `padeye T ${T || '?'} mm in jaw ${e} mm (${T ? Math.round((T / e) * 100) : '?'} %) · inside length ${d.insideLength} mm`;
  if (W >= 640) body += text(W / 2, H - 6, `${l1} · ${l2}`, { 'text-anchor': 'middle', 'font-size': 10, fill: '#5d6b7a' });
  else body += text(W / 2, H - 18, l1, { 'text-anchor': 'middle', 'font-size': 10, fill: '#5d6b7a' }) + text(W / 2, H - 5, l2, { 'text-anchor': 'middle', 'font-size': 10, fill: '#5d6b7a' });
  return svgDoc(W, H, body, { title: 'Padeye / shackle fit' });
}
