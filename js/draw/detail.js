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
function buildColumn(leg, rig, project, { slingDisp = 420 } = {}) {
  const head = rig.head || {};
  const parts = [];
  const labels = [];
  const inline = [];
  let y = 0;
  let bar = 'depth';
  let barA = 40;
  let minX = -60, maxX = 60;
  const ext = (hw) => { minX = Math.min(minX, -hw); maxX = Math.max(maxX, hw); };
  const util = (F, wll) => (wll ? `${Math.round((F / wll) * 100)} %` : '');
  const F = leg.Fdesign;
  const sp = project.rigging.spreader || {};

  const fromHook = leg.level !== 'bottom';
  if (fromHook) {
    const hs = Math.max((head.masterlink?.dims?.stockDia || 30) * 1.4, 35);
    parts.push(hookShape(0, hs));
    labels.push({ y: -hs * 1.5, x: hs * 1.2, t: [`Crane hook`, `static load ${fmt(rig.shl)} t`] });
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
      labels.push({ y: y + m.insideLength / 2, x: m.insideWidth / 2 + m.stockDia, t: [niceName(head.masterlink), `util. ${util(rig.Fvert_design, head.masterlink.wll_t)}`] });
      ext(m.insideWidth / 2 + m.stockDia);
      y += m.insideLength; bar = 'lr'; barA = m.stockDia;
      if (head.useSub && head.subLink && leg.level === 'main') {
        const sd = head.subLink.dims;
        parts.push(ringEdge(y, sd.insideLength, sd.stockDia));
        labels.push({ y: y + sd.insideLength / 2, x: sd.stockDia, t: [`Sub-link ${fmt(head.subLink.wll_t)}t`] });
        y += sd.insideLength; bar = 'depth'; barA = sd.stockDia;
      }
    }
  } else {
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
        t: [niceName(it), `EWL ${fmt(p.length_m)} m${p.hitch === 'choke' ? ' choked' : ''} · ${util(F, wll)}`, `${fmt(F)} t · ${leg.angleV.toFixed(1)}° to vertical`],
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
      const c = chainDraw(it, y, p.links || 1);
      parts.push(c.svg);
      ext(c.halfWidth + 10);
      labels.push({
        y: c.mid, x: c.halfWidth, strong: true,
        t: [niceName(it), `${p.links} links = ${fmt(p.length_m, 3)} m · ${util(F, wll)}`, `${fmt(F)} t · ${leg.angleV.toFixed(1)}° to vertical`],
      });
      inline.push({ x: -c.halfWidth, y: c.mid, t: `${p.links} links` });
      y = c.end; bar = c.nextBar; barA = c.a;
      continue;
    }
    if (p.kind === 'connlink' || p.kind === 'glink') {
      const L = it.dims.effLength || 60, t = it.dims.barThk || 15;
      const W = p.kind === 'glink' ? it.dims.maxSlingWidth || 60 : Math.max((it.dims.width || 30) - 2 * t, t);
      parts.push(bar === 'lr' ? ringEdge(y, L, t) : ringFace(y, L, W, t));
      labels.push({ y: y + L / 2, x: W / 2 + t, t: [niceName(it), util(F, it.wll_t)] });
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
        labels.push({ y: pinCenter + d.insideLength * 0.5, x: r.halfWidth, t: [niceName(it), util(F, wll)] });
        ext(r.halfWidth);
        y = r.crownY; bar = r.crownDir; barA = r.a;
      } else {
        // load side: bow up holding the element above, pin down
        const pinCenter = y + d.insideLength + d.pinDia / 2;
        const r = shackleFront(it, pinCenter, -1);
        const sf = i === 0 && leg.level !== 'top' ? shackleSideLoadFactor(leg.beta || 0) : 1;
        if (i === 0) {
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
        labels.push({ y: pinCenter - d.insideLength * 0.45, x: r.halfWidth, t: [niceName(it), `${util(F, it.wll_t * sf)} · pin Ø${d.pinDia}`] });
        ext(r.halfWidth + d.pinDia);
        bar = 'depth'; barA = d.pinDia;
      }
    }
  }
  if (slingSvg) parts.push(slingSvg);
  return { parts, labels, inline, height: y, minX, maxX, top: fromHook ? -Math.max((head.masterlink?.dims?.stockDia || 30) * 1.4, 35) * 4.3 : -120 };
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
  body += text(20, Hpx - 10, 'Components to scale (sling and chain bodies shortened). Catalogue data to be confirmed against the certificates of the equipment used.', { 'font-size': 9.5, fill: '#5d6b7a' });
  return svgDoc(Math.max(x, 600), Hpx, body, { title: 'Rigging detail' });
}

export { esc };

/**
 * Padeye + shackle fit, to scale: shackle front view (bow up, pin in the hole) with the padeye
 * seen edge-on (main plate + cheek plates), and the padeye face view with hole and outer radius.
 */
export function drawPadeyeFit(point, shackle, opts = {}) {
  const W = opts.width || 520, H = opts.height || 300;
  const t = Number(point?.thk_mm) || 0, tc = Number(point?.cheekThk_mm) || 0;
  const Dh = Number(point?.holeDia_mm) || 0, R = Number(point?.radius_mm) || 0, Hh = Number(point?.height_mm) || 0;
  const total = t + 2 * tc;
  if (!shackle?.dims) return svgDoc(W, H, text(16, 30, 'No shackle selected at this point yet', { fill: '#5d6b7a' }));
  const d = shackle.dims;
  // model extents (mm)
  const span = Math.max(d.length || d.insideLength * 2, (R || d.pinDia * 1.8) * 2 + (Hh || R * 1.5));
  const k = (H - 60) / (span * 1.25);
  let body = '';
  // ---- left: shackle front + padeye edge-on
  const cx = W * 0.27, pinY = 40 + (d.insideLength + d.pinDia + d.bowDia) * k;
  const sh = shackleFront(shackle, 0, -1);
  const peR = R || d.pinDia * 1.8;
  const pe = padeyeEdge(0, total || d.jawWidth * 0.8, peR, Dh || d.pinDia + 2, 1);
  let cheeks = '';
  if (tc > 0)
    cheeks = rect(-total / 2, -peR * 0.9, tc, peR * 1.8, { fill: '#aab4be', stroke: STEEL_EDGE, 'stroke-width': 0.8, ...sw }) +
      rect(total / 2 - tc, -peR * 0.9, tc, peR * 1.8, { fill: '#aab4be', stroke: STEEL_EDGE, 'stroke-width': 0.8, ...sw });
  body += group(pe.svg + cheeks + sh.svg, { transform: `translate(${cx} ${pinY}) scale(${k})` });
  const fitJaw = total > 0 ? total < d.jawWidth : true;
  const jawCol = fitJaw ? '#1f8f4e' : '#c0392b';
  const yJ = pinY + (peR + 20) * k + 10;
  body += line(cx - (d.jawWidth / 2) * k, yJ, cx + (d.jawWidth / 2) * k, yJ, { stroke: '#3b6ea5', 'stroke-width': 1 });
  body += text(cx, yJ + 13, `jaw ${d.jawWidth} mm · padeye ${total || '?'} mm`, { 'text-anchor': 'middle', 'font-size': 10.5, fill: jawCol, 'font-weight': 700 });
  body += text(cx, 18, `${niceName(shackle)} — pin Ø${d.pinDia}, jaw ${d.jawWidth} mm`, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#173a5e' });
  // ---- right: padeye face view with hole and pin
  const fx = W * 0.72, fy = H * 0.5;
  const base = Hh || peR * 1.4;
  const face =
    path(`M ${-peR} 0 A ${peR} ${peR} 0 0 1 ${peR} 0 L ${peR * 1.25} ${base} L ${-peR * 1.25} ${base} Z`, { fill: '#c6ced6', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw }) +
    rect(-peR * 1.7, base, peR * 3.4, 12, { fill: '#dfe4ea', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw }) +
    circle(0, 0, (Dh || d.pinDia + 2) / 2, { fill: '#fff', stroke: STEEL_EDGE, 'stroke-width': 1, ...sw }) +
    circle(0, -((Dh || d.pinDia) - d.pinDia) / 2, d.pinDia / 2, { fill: '#2e8b3a', stroke: '#1d5c25', 'stroke-width': 1, ...sw });
  const k2 = Math.min((H - 80) / (peR + base + 20), (W * 0.4) / (peR * 3.6));
  body += group(face, { transform: `translate(${fx} ${fy - ((base - peR) / 2) * k2}) scale(${k2})` });
  const clr = Dh ? Dh - d.pinDia : null;
  body += text(fx, 18, `Padeye ${point?.id || ''} — face view`, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#173a5e' });
  body += text(fx, H - 26, `hole Ø${Dh || '?'} · pin Ø${d.pinDia}${clr != null ? ` · clearance ${clr.toFixed(1)} mm` : ''}`, { 'text-anchor': 'middle', 'font-size': 10.5, fill: clr != null && clr < 0 ? '#c0392b' : '#1c2733', 'font-weight': 600 });
  body += text(fx, H - 12, `R ${R || '?'} mm · hole centre ${Hh || '?'} mm above base · inside length ${d.insideLength} mm`, { 'text-anchor': 'middle', 'font-size': 10, fill: '#5d6b7a' });
  return svgDoc(W, H, body, { title: 'Padeye / shackle fit' });
}
