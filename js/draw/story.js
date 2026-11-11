// Storyboard: site plan view and radial section (elevation) of crane / load for each step.
import { svgDoc, fitter, line, poly, circle, text, label, path, dim, rect } from './svg.js';
import { fmt } from './fmt.js';
import { shapesSvg } from './shapes.js';

const rad = (d) => (d * Math.PI) / 180;

function rectCorners(cx, cy, sx, sy, rotDeg) {
  const a = rad(rotDeg || 0), c = Math.cos(a), s = Math.sin(a);
  return [[-sx / 2, -sy / 2], [sx / 2, -sy / 2], [sx / 2, sy / 2], [-sx / 2, sy / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/** Interval [r1, r2] of the radial line (crane origin, angle θ) crossing an oriented rectangle. */
function radialSpan(ob, crane, thetaDeg, rMax) {
  const a = rad(ob.rot_deg || 0);
  const ca = Math.cos(-a), sa = Math.sin(-a);
  const px = crane.x - ob.x, py = crane.y - ob.y;
  const p0 = [px * ca - py * sa, px * sa + py * ca];
  const t = rad(thetaDeg);
  const dx = Math.cos(t), dy = Math.sin(t);
  const d = [dx * ca - dy * sa, dx * sa + dy * ca];
  let r1 = 0, r2 = rMax;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > r2) return false; if (r > r1) r1 = r; }
    else { if (r < r1) return false; if (r < r2) r2 = r; }
    return true;
  };
  const hx = ob.sx / 2, hy = ob.sy / 2;
  if (clip(-d[0], p0[0] + hx) && clip(d[0], hx - p0[0]) && clip(-d[1], p0[1] + hy) && clip(d[1], hy - p0[1]) && r2 > r1) return [r1, r2];
  return null;
}

function loadFootprint(load) {
  const d = load.dims_mm || {};
  return { L: (d.L || 0) / 1000, W: (d.W || 0) / 1000, H: (d.H || 0) / 1000 };
}

/** Plan view of one step (or of all steps when stepIndex = null). */
export function drawStoryPlan(project, res, stepIndex, opts = {}) {
  const W = opts.width || 520, H = opts.height || 420;
  const sb = project.storyboard || {};
  const cr = sb.crane || { x: 0, y: 0, heading_deg: 0, footprint: { L: 10, W: 3 } };
  const steps = (sb.steps || []).map((st, i) => ({ ...st, _i: i })).filter((st) => Number(st.radius_m) > 0);
  stepIndex = stepIndex == null ? null : steps.findIndex((st) => st._i === stepIndex);
  if (stepIndex === -1) stepIndex = null;
  const fp = loadFootprint(project.load);
  const rMax = Math.max(...steps.map((s) => Number(s.radius_m) || 0), Number(project.crane?.radius_m) || 0, 5);
  const chartMax = Math.max(...(project.crane?.chart?.rows || []).map((r) => Number(r[0]) || 0), 0);
  const pts = [];
  const ext = Math.max(rMax + Math.max(fp.L, fp.W), 6);
  pts.push([cr.x - ext, -(cr.y - ext)], [cr.x + ext, -(cr.y + ext)]);
  (sb.obstacles || []).forEach((o) => rectCorners(o.x, o.y, o.sx, o.sy, o.rot_deg).forEach(([x, y]) => pts.push([x, -y])));
  (sb.shapes || []).forEach((q) => pts.push([q.x, -q.y]));
  const safe = typeof sb.map?.image === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(sb.map.image);
  const map = safe && sb.map.s > 0 ? sb.map : null;
  const f = fitter(pts, W, H, 26, { top: 34 });
  const P = (x, y) => f([x, -y]);
  let body = '';
  if (map) {
    const a = P(-map.ou * map.s, map.ov * map.s), b = P((map.w - map.ou) * map.s, (map.ov - map.h) * map.s);
    body += `<image href="${map.image}" x="${a[0].toFixed(1)}" y="${a[1].toFixed(1)}" width="${(b[0] - a[0]).toFixed(1)}" height="${(b[1] - a[1]).toFixed(1)}" preserveAspectRatio="none" opacity="${Number(map.opacity ?? 0.85) || 0.85}"/>`;
  }
  // grid
  const step = ext > 30 ? 10 : 5;
  for (let g = -Math.ceil(ext / step) * step; g <= ext; g += step) {
    const a = P(cr.x + g, cr.y - ext), b = P(cr.x + g, cr.y + ext);
    const c = P(cr.x - ext, cr.y + g), d = P(cr.x + ext, cr.y + g);
    body += line(a[0], a[1], b[0], b[1], { stroke: '#eef1f4' }) + line(c[0], c[1], d[0], d[1], { stroke: '#eef1f4' });
  }
  // obstacles
  for (const o of sb.obstacles || []) {
    const c = rectCorners(o.x, o.y, o.sx, o.sy, o.rot_deg).map(([x, y]) => P(x, y));
    body += poly(c, { fill: o.color || '#9aa5b1', 'fill-opacity': 0.45, stroke: '#4a5562', 'stroke-width': 1 });
    const m = P(o.x, o.y);
    body += label(m[0], m[1] + 3, `${o.name} (h ${fmt(o.h, 1)} m)`, { 'text-anchor': 'middle', 'font-size': 9.5 });
  }
  // annotation shapes (site coords → drawing)
  if ((sb.shapes || []).length) {
    const o = P(0, 0);
    body += `<g transform="translate(${o[0].toFixed(2)} ${o[1].toFixed(2)}) scale(${f.scale.toFixed(5)})">${shapesSvg(sb.shapes)}</g>`;
  }
  // crane
  const c0 = P(cr.x, cr.y);
  const fpC = rectCorners(cr.x, cr.y, cr.footprint?.L || 10, cr.footprint?.W || 3, cr.heading_deg).map(([x, y]) => P(x, y));
  body += poly(fpC, { fill: '#f2c14e', 'fill-opacity': 0.5, stroke: '#7a5a10', 'stroke-width': 1.2 });
  if (chartMax > 0) {
    const r = chartMax * f.scale;
    body += circle(c0[0], c0[1], r, { fill: 'none', stroke: '#c0392b', 'stroke-dasharray': '2 4', 'stroke-width': 0.8 });
  }
  body += circle(c0[0], c0[1], 5, { fill: '#7a5a10' });
  body += label(c0[0] + 8, c0[1] - 8, 'Crane', { 'font-size': 10, 'font-weight': 700 });

  // steps
  const draw = (st, i, faint) => {
    const R = Number(st.radius_m) || 0;
    const th = rad(Number(st.slew_deg) || 0);
    const lx = cr.x + R * Math.cos(th), ly = cr.y + R * Math.sin(th);
    const corners = rectCorners(lx, ly, fp.L, fp.W, st.heading_deg).map(([x, y]) => P(x, y));
    const res_i = res?.steps?.[st._i];
    const util = res_i?.checks?.find((c) => c.cat === 'Crane' && c.util != null)?.util;
    const col = util > 1 ? '#c0392b' : util > (project.crane?.utilLimit || 0.85) ? '#b7791f' : '#1f8f4e';
    const lp = P(lx, ly);
    if (!faint) {
      body += circle(c0[0], c0[1], R * f.scale, { fill: 'none', stroke: '#2a5db0', 'stroke-dasharray': '6 4', 'stroke-width': 1 });
      body += line(c0[0], c0[1], lp[0], lp[1], { stroke: '#2a5db0', 'stroke-width': 1.4 });
      body += dim(c0, lp, `R = ${fmt(R, 1)} m`, { offset: 12, color: '#2a5db0' });
    }
    body += poly(corners, { fill: faint ? '#cfd8e3' : '#e8822a', 'fill-opacity': faint ? 0.4 : 0.75, stroke: faint ? '#9aa5b1' : '#9b5a1d', 'stroke-width': faint ? 0.8 : 1.4 });
    body += circle(lp[0], lp[1], faint ? 7 : 9, { fill: '#fff', stroke: faint ? '#9aa5b1' : col, 'stroke-width': 2 });
    body += text(lp[0], lp[1] + 3.5, String(st._i + 1), { 'text-anchor': 'middle', 'font-size': faint ? 9 : 10, 'font-weight': 700, fill: faint ? '#7d8996' : '#1c2733' });
  };
  steps.forEach((st, i) => {
    if (stepIndex == null || i !== stepIndex) draw(st, i, stepIndex != null);
  });
  if (stepIndex != null && steps[stepIndex]) draw(steps[stepIndex], stepIndex, false);
  // load path
  if (steps.length > 1) {
    const ptsPath = steps.map((st) => {
      const th = rad(Number(st.slew_deg) || 0);
      return P(cr.x + (Number(st.radius_m) || 0) * Math.cos(th), cr.y + (Number(st.radius_m) || 0) * Math.sin(th));
    });
    body += path(`M ${ptsPath.map((p) => p.join(' ')).join(' L ')}`, { fill: 'none', stroke: '#173a5e', 'stroke-width': 0.8, 'stroke-dasharray': '3 3', 'marker-end': null });
  }
  // scale bar
  const sbLen = step;
  const s0 = [W - 20 - sbLen * f.scale, H - 16];
  body += line(s0[0], s0[1], s0[0] + sbLen * f.scale, s0[1], { stroke: '#333', 'stroke-width': 2 }) + text(s0[0], s0[1] - 4, `${sbLen} m`, { 'font-size': 9.5 });
  // axes
  body += line(16, H - 16, 40, H - 16, { stroke: '#c0392b', 'stroke-width': 1.5 }) + text(43, H - 13, 'X', { 'font-size': 9, fill: '#c0392b' });
  body += line(16, H - 16, 16, H - 40, { stroke: '#1f8f4e', 'stroke-width': 1.5 }) + text(13, H - 43, 'Y', { 'font-size': 9, fill: '#1f8f4e' });
  const ttl = stepIndex != null && steps[stepIndex] ? `Plan — ${steps[stepIndex]._i + 1}. ${steps[stepIndex].name || ''}` : 'Site plan — all crane steps';
  body += text(12, 20, ttl, { 'font-size': 12, 'font-weight': 700, fill: '#173a5e' });
  return svgDoc(W, H, body, { title: ttl });
}

/** Radial section (elevation) of crane + load for one step. */
export function drawStoryElevation(project, res, stepIndex, opts = {}) {
  const W = opts.width || 520, H = opts.height || 420;
  const st = project.storyboard?.steps?.[stepIndex];
  const crane = project.crane || {};
  if (!st) return svgDoc(W, H, text(20, 30, 'Step not found'));
  const R = Number(st.radius_m) || 0;
  const rig = res?.rig;
  const fp = loadFootprint(project.load);
  const elev = Number(st.loadElevation_m) || 0;
  const hookAboveBottom = res?.hookAboveBottom || fp.H + 3;
  const hookZ = elev + hookAboveBottom;
  const rel = rad((Number(st.heading_deg) || 0) - (Number(st.slew_deg) || 0));
  const wRad = Math.abs(fp.L * Math.cos(rel)) + Math.abs(fp.W * Math.sin(rel)); // radial footprint
  const tipZ = hookZ + Math.max(3, 0.15 * R);
  const g = { valid: true, tipHeight: tipZ, angle: (Math.atan2(tipZ - 2, Math.max(R - 1, 0.1)) * 180) / Math.PI };
  const zTop = Math.max(tipZ, hookZ) + 2;
  const rLeft = -5;
  const rRight = R + wRad / 2 + 3;
  const zMin = Math.min(0, elev, ...(project.storyboard?.obstacles || []).map((o) => Number(o.h) || 0));
  const f = fitter([[rLeft, -zTop], [rRight, -zMin + 0.5]], W, H, 30, { top: 36, bottom: 40 });
  const P = (r, z) => f([r, -z]);
  let body = '';
  // ground
  const g0 = P(rLeft, 0), g1 = P(rRight, 0);
  body += line(g0[0], g0[1], g1[0], g1[1], { stroke: '#4a5562', 'stroke-width': 1.6 });
  for (let r = rLeft; r < rRight; r += 1) {
    const a = P(r, 0), b = P(r - 0.6, -0.6);
    body += line(a[0], a[1], b[0], b[1], { stroke: '#9aa5b1', 'stroke-width': 0.6 });
  }
  // obstacles cut by the radial line
  const sb = project.storyboard || {};
  const cr = sb.crane || { x: 0, y: 0 };
  for (const o of sb.obstacles || []) {
    const span = radialSpan(o, cr, Number(st.slew_deg) || 0, rRight);
    if (!span) continue;
    if (Number(o.h) < 0) {
      // lower level (e.g. supply vessel deck below the platform deck)
      const a = P(span[0], o.h), b = P(span[1], o.h);
      body += line(a[0], a[1], b[0], b[1], { stroke: o.color || '#4a5562', 'stroke-width': 3 });
      body += label((a[0] + b[0]) / 2, a[1] + 13, `${o.name} ${fmt(o.h, 1)} m`, { 'text-anchor': 'middle', 'font-size': 9.5 });
      continue;
    }
    const a = P(span[0], o.h), b = P(span[1], 0);
    body += rect(a[0], a[1], b[0] - a[0], b[1] - a[1], { fill: o.color || '#9aa5b1', 'fill-opacity': 0.55, stroke: '#4a5562' });
    body += label((a[0] + b[0]) / 2, a[1] - 4, `${o.name} ${fmt(o.h, 1)} m`, { 'text-anchor': 'middle', 'font-size': 9.5 });
  }
  // crane (schematic)
  const hp = 2, a0 = 1;
  const cb0 = P(-3, 0), cb1 = P(3, hp * 0.75);
  body += rect(cb0[0], cb1[1], cb1[0] - cb0[0], cb0[1] - cb1[1], { fill: '#f2c14e', stroke: '#7a5a10', rx: 3 });
  const cab = P(-2.6, hp + 1.3), cab1 = P(-0.4, hp * 0.75);
  body += rect(cab[0], cab[1], cab1[0] - cab[0], cab1[1] - cab[1], { fill: '#dfe7ef', stroke: '#4a5562' });
  const piv = P(a0, hp);
  if (g.valid) {
    const tip = P(R, g.tipHeight);
    body += line(piv[0], piv[1], tip[0], tip[1], { stroke: '#d4a017', 'stroke-width': 7, 'stroke-linecap': 'round' });
    body += line(piv[0], piv[1], tip[0], tip[1], { stroke: '#7a5a10', 'stroke-width': 1, 'stroke-dasharray': '4 4' });
    body += circle(tip[0], tip[1], 4, { fill: '#7a5a10' });
    // boom angle
    const ar = 34;
    const ang = rad(g.angle);
    body += path(`M ${piv[0] + ar} ${piv[1]} A ${ar} ${ar} 0 0 0 ${piv[0] + ar * Math.cos(ang)} ${piv[1] - ar * Math.sin(ang)}`, { fill: 'none', stroke: '#7a5a10' });
    body += label(piv[0] + ar + 4, piv[1] - 10, 'boom (schematic)', { 'font-size': 9.5, fill: '#7a5a10' });
    // hoist rope + hook
    const hk = P(R, hookZ);
    body += line(tip[0], tip[1], hk[0], hk[1] - 10, { stroke: '#333', 'stroke-width': 1.2 });
    body += rect(hk[0] - 6, hk[1] - 22, 12, 12, { fill: '#6b7785' });
  } else {
    body += label(piv[0] + 10, piv[1] - 20, g.reason || 'Boom geometry not entered', { fill: '#c0392b', 'font-size': 10 });
  }
  body += circle(piv[0], piv[1], 3.5, { fill: '#333' });
  // rigging + load
  const hk = P(R, hookZ);
  const zPad = elev + (rig && !rig.error ? Math.max(...rig.pts.map((p) => p.pos.z)) - (Number(project.load.origin_mm?.z) || 0) / 1000 : fp.H);
  const l0 = P(R - wRad / 2, elev + fp.H), l1 = P(R + wRad / 2, elev);
  const pa = P(R - wRad * 0.42, zPad), pb = P(R + wRad * 0.42, zPad);
  if (rig?.spreader) {
    const zb = elev + rig.spreader.zBot - (Number(project.load.origin_mm?.z) || 0) / 1000;
    const b0 = P(R - wRad * 0.42, zb), b1 = P(R + wRad * 0.42, zb + rig.spreader.depth);
    body += line(hk[0], hk[1], b0[0], b1[1], { stroke: '#2a5db0', 'stroke-width': 2 }) + line(hk[0], hk[1], b1[0], b1[1], { stroke: '#2a5db0', 'stroke-width': 2 });
    body += rect(b0[0], b1[1], b1[0] - b0[0], b0[1] - b1[1], { fill: '#f0a35e', stroke: '#9b5a1d' });
    body += line(b0[0], b0[1], pa[0], pa[1], { stroke: '#2a5db0', 'stroke-width': 2 }) + line(b1[0], b0[1], pb[0], pb[1], { stroke: '#2a5db0', 'stroke-width': 2 });
  } else {
    body += line(hk[0], hk[1], pa[0], pa[1], { stroke: '#2a5db0', 'stroke-width': 2 }) + line(hk[0], hk[1], pb[0], pb[1], { stroke: '#2a5db0', 'stroke-width': 2 });
  }
  body += rect(l0[0], l0[1], l1[0] - l0[0], l1[1] - l0[1], { fill: '#e8822a', 'fill-opacity': 0.8, stroke: '#9b5a1d', 'stroke-width': 1.2 });
  body += label((l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2 + 4, project.load.name || 'Load', { 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700 });
  // dimensions
  const axis0 = P(0, 0);
  body += line(axis0[0], P(0, zTop)[1], axis0[0], axis0[1] + 6, { stroke: '#555', 'stroke-dasharray': '8 3 2 3', 'stroke-width': 0.8 });
  body += dim(P(0, 0), P(R, 0), `R = ${fmt(R, 1)} m`, { offset: 18, side: -1, color: '#2a5db0' });
  body += dim(P(rRight - 1, 0), P(rRight - 1, hookZ), `hook ${fmt(hookZ, 1)} m`, { offset: 0, side: 1, color: '#173a5e' });
  if (elev > 0) body += dim(P(R + wRad / 2 + 0.6, 0), P(R + wRad / 2 + 0.6, elev), `${fmt(elev, 2)} m`, { offset: 0, color: '#777' });
  // title block
  const sr = res?.steps?.[stepIndex];
  const cc = sr?.checks?.find((c) => c.cat === 'Crane' && c.util != null);
  const lines = [
    `${stepIndex + 1}. ${st.name || ''}`,
    `Radius ${fmt(R, 1)} m · slew ${fmt(Number(st.slew_deg) || 0, 0)}°`,
    cc ? `Load ${fmt(cc.value)} t / SWL ${fmt(cc.limit)} t → ${(cc.util * 100).toFixed(0)} %` : 'SWL: —',
    `Hook about ${fmt(hookZ, 1)} m above the reference level`,
  ].filter(Boolean);
  const bx = 12, by = 44;
  body += rect(bx, by - 14, 240, lines.length * 14 + 10, { fill: '#fff', stroke: '#c9d3dd', rx: 4 });
  lines.forEach((t, i) => (body += text(bx + 8, by + i * 14, t, { 'font-size': i === 0 ? 11 : 10, 'font-weight': i === 0 ? 700 : 400, fill: i === 2 && cc?.util > 1 ? '#c0392b' : '#1c2733' })));
  body += text(12, 20, 'Elevation (radial section)', { 'font-size': 12, 'font-weight': 700, fill: '#173a5e' });
  return svgDoc(W, H, body, { title: `Elevation — ${st.name || ''}` });
}
