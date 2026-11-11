// Rigging detail to scale: each leg drawn end to end with the real geometry of the catalogue
// components (Green Pin shackles, master links, roundslings…).
// Convention: bearing axes alternate by 90° from one component to the next (front / side view).
import { svgDoc, path, rect, circle, line, text, label, group, esc } from './svg.js';
import { fmt } from './fmt.js';
import { slingModeFactor, shackleSideLoadFactor } from '../catalog/index.js';

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

/** Builds the column of one leg (coordinates in mm, y down). */
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

  const fromHook = leg.level !== 'bottom';
  if (fromHook) {
    const hs = Math.max((head.masterlink?.dims?.stockDia || 30) * 1.4, 35);
    parts.push(hookShape(0, hs));
    labels.push({ y: -hs * 1.5, x: hs * 1.2, t: [`Crane hook`, `static load ${fmt(rig.shl)} t`] });
    ext(hs * 1.6);
    y = 0;
    if (head.topShackle) {
      const s = head.topShackle;
      const r = shackleSide(s, y + s.dims.pinDia / 2, 1);
      parts.push(r.svg);
      labels.push({ y: y + s.dims.insideLength / 2, x: r.halfWidth, t: [s.name, `WLL ${fmt(s.wll_t)} t`] });
      y = r.crownY;
      bar = r.crownDir;
      barA = r.a;
      ext(r.halfWidth);
    }
    if (head.masterlink) {
      const m = head.masterlink.dims;
      parts.push(ringFace(y, m.insideLength, m.insideWidth, m.stockDia));
      labels.push({ y: y + m.insideLength / 2, x: m.insideWidth / 2 + m.stockDia, t: [head.masterlink.name, `WLL ${fmt(head.masterlink.wll_t)} t · ${util(rig.Fvert_design, head.masterlink.wll_t)}`] });
      ext(m.insideWidth / 2 + m.stockDia);
      y += m.insideLength;
      bar = 'lr';
      barA = m.stockDia;
      if (head.useSub && head.subLink && leg.level === 'main') {
        const sd = head.subLink.dims;
        parts.push(ringEdge(y, sd.insideLength, sd.stockDia));
        labels.push({ y: y + sd.insideLength / 2, x: sd.stockDia, t: [/sub-link/i.test(head.subLink.short || head.subLink.name) ? head.subLink.short || head.subLink.name : `Sub-link ${head.subLink.short || head.subLink.name}`, `WLL ${fmt(head.subLink.wll_t)} t`] });
        y += sd.insideLength;
        bar = 'depth';
        barA = sd.stockDia;
      }
    } else if (head.onHook) {
      bar = 'depth';
      barA = 40;
    }
  } else {
    // spreader bottom sling: starts at the bottom lug
    const sp = project.rigging.spreader || {};
    const tc = leg.comps.topConn;
    const pinY = 0;
    const pe = padeyeEdge(pinY, Number(sp.bottomLugThk_mm) || (tc ? tc.dims.jawWidth * 0.8 : 30), (tc?.dims.pinDia || 30) * 1.6, Number(sp.bottomLugHoleDia_mm) || (tc?.dims.pinDia || 0) + 2, -1);
    parts.push(pe.svg);
    labels.push({ y: pe.top + 30, x: 40, t: ['Spreader bar bottom lug'] });
    y = pinY;
    bar = 'lug';
  }

  // top connector
  const tc = leg.comps.topConn;
  if (tc && tc.type === 'shackle') {
    const pinCenter = bar === 'lug' ? y : y + tc.dims.pinDia / 2;
    const r = bar === 'lr' ? shackleSide(tc, pinCenter, 1) : shackleFront(tc, pinCenter, 1);
    parts.push(r.svg);
    labels.push({ y: pinCenter + tc.dims.insideLength * 0.5, x: r.halfWidth, t: [tc.name, `WLL ${fmt(tc.wll_t)} t · ${util(F, tc.wll_t)}`] });
    ext(r.halfWidth);
    y = r.crownY;
    bar = r.crownDir;
    barA = r.a;
  } else if (tc && tc.type === 'glink') {
    const L = tc.dims.effLength || 100, t = tc.dims.barThk || 20;
    parts.push(bar === 'lr' ? ringEdge(y, L, t) : ringFace(y, L, tc.dims.maxSlingWidth || 60, t));
    labels.push({ y: y + L / 2, x: (tc.dims.maxSlingWidth || 60) / 2 + t, t: [tc.name, `WLL ${fmt(tc.wll_t)} t · ${util(F, tc.wll_t)}`] });
    y += L;
    bar = bar === 'lr' ? 'depth' : 'lr';
    barA = t;
  }

  // sling
  const s = leg.comps.sling;
  const bottomSh = leg.comps.bottomShackle;
  const slingTop = y;
  const slingBot = y + slingDisp;
  const sr = sling(s, slingTop, slingBot, bar === 'depth' ? 'depth' : 'lr', { a: barA }, leg.slingLength, bottomSh?.dims?.bowDia || 0);
  ext(sr.w / 2 + 20);
  const wllS = s ? s.wll_t * slingModeFactor(leg.cfg.mode) : null;
  labels.push({
    y: sr.mid,
    x: sr.w / 2,
    t: [s ? s.name : 'Sling ?', `EWL ${fmt(leg.slingLength)} m · WLL ${fmt(wllS)} t · ${util(F, wllS)}`, `Design T ${fmt(F)} t · ${leg.angleH.toFixed(1)}° to horiz.`],
    strong: true,
  });

  // bottom shackle (bow up), sling drawn on top
  y = slingBot;
  if (bottomSh) {
    const d = bottomSh.dims;
    const pinCenter = y + d.insideLength + d.pinDia / 2;
    const r = shackleFront(bottomSh, pinCenter, -1);
    // padeye / lug
    const pt = leg.point;
    const sp = project.rigging.spreader || {};
    const thk = pt ? Number(pt.thk_mm) : Number(sp.topLugThk_mm);
    const hole = pt ? Number(pt.holeDia_mm) : Number(sp.topLugHoleDia_mm);
    const rad = pt ? Number(pt.radius_mm) : 0;
    const pe = padeyeEdge(pinCenter, thk || d.jawWidth * 0.8, rad || d.pinDia * 1.8, hole || d.pinDia + 2, 1);
    parts.push(pe.svg, r.svg);
    const sf = shackleSideLoadFactor(leg.beta || 0);
    labels.push({ y: pinCenter - d.insideLength * 0.45, x: r.halfWidth, t: [bottomSh.name, `WLL ${fmt(bottomSh.wll_t * sf)} t · ${util(F, bottomSh.wll_t * sf)} · pin Ø${d.pinDia} mm`] });
    ext(r.halfWidth + d.pinDia);
    labels.push({
      y: pinCenter + 40,
      x: (thk || 30) * 3,
      t: pt
        ? [`Padeye ${pt.id} · SWL ${pt.swl_t ? fmt(pt.swl_t) + ' t' : '—'}`, `thk. ${thk || '?'} mm · hole Ø${hole || '?'} mm`]
        : ['Spreader bar top lug'],
    });
    y = pe.bottom;
  }
  parts.push(sr.svg);
  inline.push({ x: -sr.w / 2, y: sr.mid, t: `${fmt(leg.slingLength)} m` });
  return { parts, labels, inline, height: y, minX, maxX, top: fromHook ? -Math.max((head.masterlink?.dims?.stockDia || 30) * 1.4, 35) * 4.3 : -120 };
}

function legSignature(l) {
  return [l.level, l.comps.sling?.id, l.slingLength?.toFixed(2), l.comps.bottomShackle?.id, l.comps.topConn?.id, l.cfg.mode].join('|');
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
    const lvl = c.legs[0].level === 'top' ? 'Top slings' : c.legs[0].level === 'bottom' ? 'Bottom slings' : 'Legs';
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
  body += text(20, Hpx - 10, 'Components to scale (sling body shortened). Catalogue data to be confirmed against the certificates of the equipment used.', { 'font-size': 9.5, fill: '#5d6b7a' });
  return svgDoc(Math.max(x, 600), Hpx, body, { title: 'Rigging detail' });
}

export { esc };
