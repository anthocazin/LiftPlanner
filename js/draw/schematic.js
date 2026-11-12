// Rigging schematic (hook → head → one leg per lift point). Pure SVG string, used by the
// Rigging page (interactive: drop slots and clickable parts) and by the report (static).
import { niceName } from '../catalog/index.js';
import { DEFAULT_ASSEMBLY, DEFAULT_ASSEMBLY_TOP, isLengthPart, pointKind } from '../engine/rigging.js';
import { fmt } from './fmt.js';

export const SCHEM_COL = { shackle: '#6b7785', sling: '#2a5db0', chain: '#4a5562', connlink: '#9b5a1d', masterlink: '#4a5562', glink: '#7b3fb0', hook: '#b8860b', head: '#4a5562' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Parts of leg `key` as entered by the user (own parts or the common assembly). */
export function assemblyOf(rigProj, key, level) {
  const own = rigProj.legs?.[key]?.parts;
  if (own?.length) return { parts: own, own: true };
  if (level === 'top') {
    if (!rigProj.assemblyTop?.length) rigProj.assemblyTop = clone(DEFAULT_ASSEMBLY_TOP);
    return { parts: rigProj.assemblyTop, own: false };
  }
  if (!rigProj.assembly?.length) rigProj.assembly = clone(DEFAULT_ASSEMBLY);
  return { parts: rigProj.assembly, own: false };
}

/** Icon centred on x, top at y → { svg, h }. */
function icon(kind, x, y, part, item) {
  const c = SCHEM_COL[kind] || '#555';
  if (kind === 'shackle')
    return { h: 34, svg: `<path d="M${x - 9} ${y + 26} L${x - 9} ${y + 12} A9 9 0 0 1 ${x + 9} ${y + 12} L${x + 9} ${y + 26}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/><rect x="${x - 13}" y="${y + 25}" width="26" height="5" rx="2" fill="#2e8b3a"/>` };
  if (kind === 'sling') {
    const col = item?.colorHex || (item?.type === 'wiresling' ? '#6d7680' : c);
    const choke = part?.hitch === 'choke';
    if (item?.type === 'webbing') return { h: 74, svg: `<rect x="${x - 9}" y="${y}" width="18" height="${choke ? 56 : 74}" rx="2" fill="${esc(col)}" stroke="#1c2733" stroke-width=".8"/><line x1="${x}" y1="${y + 4}" x2="${x}" y2="${y + (choke ? 52 : 70)}" stroke="#fff" stroke-width=".8" stroke-dasharray="3 3"/>` };
    if (item?.type === 'wiresling') return { h: 74, svg: `<path d="M${x} ${y + 12} L${x} ${y + 62}" stroke="${col}" stroke-width="5"/><ellipse cx="${x}" cy="${y + 7}" rx="6" ry="7" fill="none" stroke="${col}" stroke-width="3"/><ellipse cx="${x}" cy="${y + 67}" rx="6" ry="7" fill="none" stroke="${col}" stroke-width="3"/><rect x="${x - 4}" y="${y + 13}" width="8" height="7" fill="#9aa5b1"/><rect x="${x - 4}" y="${y + 54}" width="8" height="7" fill="#9aa5b1"/>` };
    return { h: 74, svg: `<rect x="${x - 7}" y="${y}" width="14" height="${choke ? 56 : 74}" rx="7" fill="${esc(col)}" stroke="#1c2733" stroke-width=".8"/>${choke ? `<path d="M${x - 16} ${y + 66} q16 -14 32 0 q-16 14 -32 0z" fill="none" stroke="${esc(col)}" stroke-width="5"/>` : ''}` };
  }
  if (kind === 'chain') {
    let s = '';
    for (let i = 0; i < 6; i++) s += i % 2 ? `<rect x="${x - 2.5}" y="${y + i * 12}" width="5" height="16" rx="2.5" fill="${c}"/>` : `<rect x="${x - 6}" y="${y + i * 12}" width="12" height="16" rx="6" fill="none" stroke="${c}" stroke-width="3"/>`;
    return { h: 78, svg: s };
  }
  if (kind === 'hook')
    return { h: 36, svg: `<circle cx="${x}" cy="${y + 5}" r="4.5" fill="none" stroke="${c}" stroke-width="3"/><path d="M${x} ${y + 10} L${x} ${y + 16} C ${x - 14} ${y + 16} ${x - 14} ${y + 34} ${x} ${y + 34} C ${x + 9} ${y + 34} ${x + 11} ${y + 27} ${x + 10} ${y + 23}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="${x + 10}" y1="${y + 22}" x2="${x + 2}" y2="${y + 15}" stroke="#2e8b3a" stroke-width="2"/>` };
  if (kind === 'glink') return { h: 26, svg: `<path d="M${x - 6} ${y + 2} h12 v8 l-5 3 l5 3 v8 h-12 v-8 l5 -3 l-5 -3z" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round"/>` };
  if (kind === 'masterlink') return { h: 40, svg: `<rect x="${x - 10}" y="${y + 2}" width="20" height="36" rx="10" fill="none" stroke="${c}" stroke-width="4.5"/>` };
  if (kind === 'connlink') return { h: 26, svg: `<rect x="${x - 7}" y="${y + 2}" width="14" height="22" rx="7" fill="none" stroke="${c}" stroke-width="4"/><line x1="${x - 7}" y1="${y + 13}" x2="${x + 7}" y2="${y + 13}" stroke="${c}" stroke-width="2"/>` };
  return { h: 20, svg: '' };
}

/**
 * opts: { width, interactive, highlight: { leg, part } | { head: true } | { point } }
 * → { svg, W, H, drops: [{ x, y, w, h, key, level, idx }] }
 */
export function schematicSvg(project, res, { width = 900, interactive = false, highlight = null } = {}) {
  const rig = res?.rig && !res.rig.error ? res.rig : null;
  const proj = project.rigging;
  const W = Math.max(520, width);
  const used = (project.load.liftPoints || []).filter((p) => p.used !== false);
  if (!used.length) return { svg: '', W, H: 0, drops: [], empty: true };
  const isSp = proj.type === 'spreader';
  const legOf = (key) => rig?.legs?.find((l) => l.key === key);
  const pts = [...used]; // in the order of the list (A, B, C…)
  const nCol = pts.length;
  const colW = Math.min(230, (W - 40) / nCol);
  const x0 = (W - colW * nCol) / 2 + colW / 2;
  let s = '';
  const drops = [];
  const head = rig?.head;
  const hx = W / 2;
  const ring = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="rgba(232,130,42,.12)" stroke="#e8822a" stroke-width="3"/>`;
  // crane hook
  s += `<line x1="${hx}" y1="0" x2="${hx}" y2="22" stroke="#333" stroke-width="1.4"/><rect x="${hx - 12}" y="22" width="24" height="16" rx="3" fill="#f2c14e" stroke="#7a5a10"/>`;
  s += `<path d="M${hx} 38 L${hx} 46 C ${hx + 16} 46 ${hx + 16} 70 ${hx} 70 C ${hx - 10} 70 ${hx - 12} 62 ${hx - 11} 58" fill="none" stroke="#7a5a10" stroke-width="4" stroke-linecap="round"/>`;
  s += `<text x="${hx + 22}" y="36" font-size="12" font-weight="700" fill="#7a5a10">Crane hook${res?.shlCrane ? ` · ${res.shlCrane.toFixed(2)} t` : ''}</text>`;
  let y = 74;
  const hType = proj.head?.type || 'masterlink';
  if (highlight?.head) s += ring(hx - 26, y - 6, 210, 58);
  if (hType !== 'hook') {
    const unknown = !!proj.head?.unknownSWL;
    const txt = unknown ? 'Masterlink' : head?.masterlink ? niceName(head.masterlink) : hType === 'assembly' ? 'Quad masterlink' : 'Masterlink';
    s += `<rect x="${hx - 15}" y="${y}" width="30" height="44" rx="15" fill="none" stroke="${SCHEM_COL.head}" stroke-width="5"/>`;
    const lbl = `<rect x="${hx + 20}" y="${y + 12}" width="${txt.length * 6.6 + 12}" height="19" rx="9" fill="#fff" stroke="#c9d3dd"/><text x="${hx + 26}" y="${y + 25.5}" font-size="11.5" font-weight="600">${esc(txt)}</text>`;
    s += interactive ? `<g data-pop="head:ml" class="clk">${lbl}<rect x="${hx - 18}" y="${y - 2}" width="40" height="48" fill="transparent"/></g>` : lbl;
    if (unknown && interactive) s += `<text x="${hx + 26}" y="${y + 44}" font-size="10" fill="#5d6b7a">SWL not known — assumed OK</text>`;
    y += 48;
  } else {
    const lbl = `<rect x="${hx + 20}" y="${y + 2}" width="170" height="19" rx="9" fill="#fff" stroke="#c9d3dd"/><text x="${hx + 26}" y="${y + 15.5}" font-size="11.5" font-weight="600">Legs directly on the hook</text>`;
    s += interactive ? `<g data-pop="head:ml" class="clk">${lbl}</g>` : lbl;
    y += 22;
  }
  drops.push({ x: hx - 60, y: 20, w: 120, h: y - 20, key: '__head', level: 'head', idx: 0 });
  const headBottom = y;
  let colTop = headBottom + 60;
  const topCols = [];
  let barY = 0;
  if (isSp) ['TA', 'TB'].forEach((k, j) => topCols.push({ key: k, x: W / 2 + (j ? 1 : -1) * Math.min(W * 0.28, 260), level: 'top', top: headBottom + 40 }));
  const columns = [...topCols, ...pts.map((p, i) => ({ key: p.id, x: x0 + i * colW, level: 'main', point: p, top: colTop }))];
  const drawCol = (c, fromX, fromY) => {
    const leg = legOf(c.key);
    const { parts, own } = assemblyOf(proj, c.key, c.level === 'top' ? 'top' : 'main');
    s += `<line x1="${fromX}" y1="${fromY}" x2="${c.x}" y2="${c.top}" stroke="#9aa5b1" stroke-width="2" stroke-dasharray="4 3"/>`;
    let yy = c.top;
    const slot = (idx) => {
      if (!interactive) return;
      drops.push({ x: c.x - 30, y: yy, w: 60, h: 16, key: c.key, level: c.level === 'top' ? 'top' : 'main', idx });
      s += `<g class="slot" data-slot="${drops.length - 1}"><rect x="${c.x - 22}" y="${yy}" width="44" height="14" rx="7" fill="#eef4fa" stroke="#9db6d1" stroke-dasharray="3 2"/><text x="${c.x}" y="${yy + 11}" font-size="12" text-anchor="middle" fill="#6b8bb0">+</text></g>`;
      yy += 18;
    };
    if (!interactive) yy += 4;
    slot(parts.length);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const rp = leg?.parts?.[i];
      const ic = icon(p.kind, c.x, yy, p, rp?.item);
      const txt = rp?.item ? niceName(rp.item, isLengthPart(p) ? { length_m: rp.length_m, links: p.kind === 'chain' ? rp.links : null } : {}) : `${p.kind} ?`;
      const util = rp?.item && leg ? Math.round((leg.Fdesign / (rp.item.wll_t * (rp.factor || 1))) * 100) : null;
      const need = i === leg?.li && p.kind === 'sling' && leg.slingLengthReq > 0 && Math.abs(leg.slingLengthReq - (rp?.length_m || 0)) > 0.03 ? ` · exact ${fmt(leg.slingLengthReq, 2)} m` : '';
      const sub = rp?.item && leg ? (interactive ? `min ${fmt(rp.reqWll)} t · ${util} %${need}` : `${p.hitch === 'choke' ? 'choked · ' : ''}${util} % of WLL`) : 'not found';
      const lblW = Math.max(colW - 14, 120);
      if (highlight && highlight.leg === c.key && highlight.part === i) s += ring(c.x - 22, yy - 3, lblW + 10, ic.h + 6);
      s += interactive ? `<g data-pop="${esc(c.key)}:${i}:${c.level}" class="clk">` : '<g>';
      s += `${ic.svg}<rect x="${c.x - 16}" y="${yy}" width="${lblW}" height="${ic.h}" fill="transparent"/>`;
      s += `<text x="${c.x + 16}" y="${yy + ic.h / 2 - 2}" font-size="11.5" font-weight="700" fill="${rp && !rp.item ? '#c0392b' : '#1c2733'}">${esc(txt)}${interactive && p.id && p.id !== 'auto' ? ' ★' : ''}</text>`;
      s += `<text x="${c.x + 16}" y="${yy + ic.h / 2 + 11}" font-size="10" fill="#5d6b7a">${esc(sub)}</text></g>`;
      yy += ic.h + 2;
      slot(i);
    }
    if (c.point) {
      const kind = pointKind(c.point);
      if (highlight?.point === c.point.id) s += ring(c.x - 44, yy - 2, 88, 80);
      if (kind === 'padeye') s += `<path d="M${c.x - 16} ${yy + 22} L${c.x - 10} ${yy + 4} A10 10 0 0 1 ${c.x + 10} ${yy + 4} L${c.x + 16} ${yy + 22} Z" fill="#c6ced6" stroke="#3c4652"/><circle cx="${c.x}" cy="${yy + 6}" r="3.5" fill="#fff" stroke="#3c4652"/>`;
      else if (kind === 'ring') s += `<ellipse cx="${c.x}" cy="${yy + 10}" rx="8" ry="10" fill="none" stroke="#3c4652" stroke-width="3.5"/><rect x="${c.x - 10}" y="${yy + 18}" width="20" height="5" fill="#9aa5b1"/>`;
      else s += `<rect x="${c.x - 24}" y="${yy + 4}" width="48" height="18" fill="#e8edf2" stroke="#3c4652" stroke-dasharray="4 3"/>`;
      s += `<rect x="${c.x - 40}" y="${yy + 22}" width="80" height="6" fill="#9aa5b1"/>`;
      s += `<text x="${c.x}" y="${yy + 44}" font-size="13" font-weight="800" text-anchor="middle" fill="#c0392b">${esc(c.point.id)}</text>`;
      const pl = kind === 'padeye' ? `pad eye ${c.point.swl_t ? `${fmt(c.point.swl_t, 1)}t` : '?'}` : kind === 'ring' ? `ring ${c.point.swl_t ? `${fmt(c.point.swl_t, 1)}t` : '?'}` : 'no pad eye';
      s += `<text x="${c.x}" y="${yy + 58}" font-size="10" text-anchor="middle" fill="#5d6b7a">${pl}</text>`;
      if (leg) s += `<text x="${c.x}" y="${yy + 72}" font-size="10.5" text-anchor="middle" fill="#173a5e" font-weight="600">${fmt(leg.R, 2)} t (${(leg.share * 100).toFixed(0)} %) · ${leg.angleV.toFixed(0)}°</text>`;
      yy += 78;
    }
    if (own && interactive) s += `<text x="${c.x}" y="${c.top - 6}" font-size="9.5" text-anchor="middle" fill="#c96a17" font-weight="700">own assembly</text>`;
    return yy;
  };
  let maxY = 0;
  if (isSp) {
    let topEnd = 0;
    topCols.forEach((c) => (topEnd = Math.max(topEnd, drawCol(c, hx, headBottom))));
    barY = topEnd + 4;
    s += `<rect x="${topCols[0].x - 30}" y="${barY}" width="${topCols[1].x - topCols[0].x + 60}" height="16" rx="3" fill="#e8a35e" stroke="#9b5a1d"/><text x="${W / 2}" y="${barY + 12}" font-size="11" text-anchor="middle" font-weight="700">Spreader bar${rig?.spreader ? ` ${fmt(rig.spreader.length)} m` : ''}</text>`;
    colTop = barY + 60;
    columns.filter((c) => c.level === 'main').forEach((c) => {
      c.top = colTop;
      const fx = Math.min(Math.max(c.x, topCols[0].x), topCols[1].x);
      maxY = Math.max(maxY, drawCol(c, fx, barY + 16));
    });
  } else columns.forEach((c) => (maxY = Math.max(maxY, drawCol(c, hx, headBottom))));
  const H = maxY + 10;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:${W}px;width:100%;height:auto" font-family="system-ui, Arial, sans-serif">${s}</svg>`;
  return { svg, W, H, drops };
}
