// Courbe de capacité de la grue avec les points de travail.
import { svgDoc, line, polyline, circle, text, label } from './svg.js';
import { fmt } from './fmt.js';

export function drawCapacityChart(project, res, opts = {}) {
  const W = opts.width || 560, H = opts.height || 300;
  const crane = project.crane || {};
  const col = Number(crane.activeColumn) || 0;
  const rows = (crane.chart?.rows || []).map((r) => [Number(r[0]), Number(r[col + 1])]).filter((r) => isFinite(r[0]) && isFinite(r[1]) && r[1] > 0).sort((a, b) => a[0] - b[0]);
  if (rows.length < 1) return svgDoc(W, H, text(20, 30, 'Tableau de charge vide', { fill: '#c0392b' }));
  const shl = res?.shlCrane || 0;
  const lim = Number(crane.utilLimit) || 0.85;
  const rMax = rows[rows.length - 1][0] * 1.05;
  const cMax = Math.max(...rows.map((r) => r[1]), shl) * 1.1;
  const m = { l: 46, r: 14, t: 26, b: 34 };
  const X = (r) => m.l + (r / rMax) * (W - m.l - m.r);
  const Y = (c) => H - m.b - (c / cMax) * (H - m.t - m.b);
  let b = '';
  // grille
  const stepC = cMax > 200 ? 50 : cMax > 80 ? 20 : cMax > 30 ? 10 : 5;
  for (let c = 0; c <= cMax; c += stepC) b += line(m.l, Y(c), W - m.r, Y(c), { stroke: '#eef1f4' }) + text(m.l - 6, Y(c) + 3, String(c), { 'font-size': 9, 'text-anchor': 'end', fill: '#5d6b7a' });
  const stepR = rMax > 60 ? 10 : 5;
  for (let r = 0; r <= rMax; r += stepR) b += line(X(r), m.t, X(r), H - m.b, { stroke: '#eef1f4' }) + text(X(r), H - m.b + 12, String(r), { 'font-size': 9, 'text-anchor': 'middle', fill: '#5d6b7a' });
  b += line(m.l, H - m.b, W - m.r, H - m.b, { stroke: '#333' }) + line(m.l, m.t, m.l, H - m.b, { stroke: '#333' });
  // escalier conservatif
  const stair = [];
  let prevR = 0;
  rows.forEach(([r, c]) => {
    stair.push([X(prevR), Y(c)], [X(r), Y(c)]);
    prevR = r;
  });
  b += polyline(stair, { stroke: '#2a5db0', 'stroke-width': 1.2, opacity: 0.5 });
  b += polyline(rows.map(([r, c]) => [X(r), Y(c)]), { stroke: '#2a5db0', 'stroke-width': 2 });
  rows.forEach(([r, c]) => (b += circle(X(r), Y(c), 2.2, { fill: '#2a5db0' })));
  // charge et limite
  if (shl > 0) {
    b += line(m.l, Y(shl), W - m.r, Y(shl), { stroke: '#e8822a', 'stroke-width': 1.6 });
    b += label(W - m.r - 4, Y(shl) + 13, `Charge au crochet ${fmt(shl)} t`, { 'text-anchor': 'end', 'font-size': 10, fill: '#c96a17', 'font-weight': 700 });
    b += line(m.l, Y(shl / lim), W - m.r, Y(shl / lim), { stroke: '#b7791f', 'stroke-dasharray': '5 4' });
    b += label(W - m.r - 4, Y(shl / lim) - 4, `Capacité mini pour ${(lim * 100).toFixed(0)} % : ${fmt(shl / lim)} t`, { 'text-anchor': 'end', 'font-size': 9.5, fill: '#b7791f' });
  }
  (res?.steps || []).forEach((s, i) => {
    const R = Number(s.step.radius_m);
    if (!(R > 0) || s.capacity?.capacity == null) return;
    const u = shl / s.capacity.capacity;
    const colr = u > 1 ? '#c0392b' : u > lim ? '#b7791f' : '#1f8f4e';
    b += line(X(R), m.t, X(R), H - m.b, { stroke: colr, 'stroke-dasharray': '2 3' });
    b += circle(X(R), Y(s.capacity.capacity), 4.5, { fill: '#fff', stroke: colr, 'stroke-width': 2 });
    b += label(X(R) + 4, m.t + 10 + (i % 3) * 11, `${i + 1} · ${(u * 100).toFixed(0)} %`, { 'font-size': 9.5, fill: colr, 'font-weight': 700 });
  });
  b += text(m.l, 16, `Capacité (t) — ${crane.chart?.columns?.[col] || ''}`, { 'font-size': 11, 'font-weight': 700, fill: '#173a5e' });
  b += text(W - m.r, H - 6, 'Rayon (m)', { 'font-size': 10, 'text-anchor': 'end', fill: '#5d6b7a' });
  return svgDoc(W, H, b, { title: 'Courbe de capacité' });
}
