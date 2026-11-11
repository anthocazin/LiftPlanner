// Rigging page: visual schematic (hook → head → one leg per lift point) built by drag & drop of
// catalogue items, load share and lengths of every leg, 3D view.
import { app } from '../app.js';
import { el, field, panel, fmt, utilBar, toast } from '../dom.js';
import { listByType, listSlingFamily, listChainFamily, niceName } from '../../catalog/index.js';
import { SLING_FAMILIES, SHACKLE_RANGES, DEFAULT_SHACKLE_RANGES, CHAIN_FAMILIES } from '../../catalog/data.js';
import { DEFAULT_ASSEMBLY, DEFAULT_ASSEMBLY_TOP, isLengthPart } from '../../engine/rigging.js';
import { viewer3d } from '../viewer3d.js';
import { loadView } from '../loadview.js';

const COL = { shackle: '#6b7785', sling: '#2a5db0', chain: '#4a5562', connlink: '#9b5a1d', glink: '#7b3fb0', head: '#4a5562' };
const PALETTE = [
  { group: 'Load side / in line', items: [
    { kind: 'shackle', label: 'Shackle' },
    { kind: 'shackle', family: 'WIDE', label: 'Shackle wide body' },
    { kind: 'connlink', family: 'CL-G80', label: 'Connecting link' },
    { kind: 'glink', label: 'G-Link' },
  ] },
  { group: 'Sling / chain (one per leg)', items: [
    { kind: 'sling', family: 'RS-PES', hitch: 'direct', label: 'Roundsling' },
    { kind: 'sling', family: 'RS-PES', hitch: 'choke', label: 'Roundsling choked' },
    { kind: 'sling', family: 'RS-UHMWPE', hitch: 'direct', label: 'Roundsling UHMWPE' },
    { kind: 'sling', family: 'WIRE', hitch: 'direct', label: 'Wire sling' },
    { kind: 'sling', family: 'GROMMET', hitch: 'direct', label: 'Grommet' },
    { kind: 'sling', family: 'WEB', hitch: 'direct', label: 'Webbing sling' },
    { kind: 'chain', family: 'CH-G80', hitch: 'direct', label: 'Chain G80' },
    { kind: 'chain', family: 'CH-G100', hitch: 'direct', label: 'Chain G100' },
  ] },
  { group: 'On the crane hook', items: [
    { head: 'masterlink', label: 'Masterlink' },
    { head: 'assembly', label: 'Quad masterlink' },
    { head: 'hook', label: 'Directly on the hook' },
    { head: 'topShackle', label: 'Hook shackle' },
  ] },
];

let linked = true; // dropping on a leg edits every leg
let pop = null;
let v3 = null;
let lviews = [];

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- data helpers
function assemblyOf(key, level) {
  const rig = app.project.rigging;
  const own = rig.legs?.[key]?.parts;
  if (own?.length) return { parts: own, own: true };
  const def = level === 'top' ? (rig.assemblyTop = rig.assemblyTop?.length ? rig.assemblyTop : clone(DEFAULT_ASSEMBLY_TOP)) : (rig.assembly = rig.assembly?.length ? rig.assembly : clone(DEFAULT_ASSEMBLY));
  return { parts: def, own: false };
}
/** Array to edit when the user acts on leg `key` (all legs when linked). */
function editable(key, level) {
  const rig = app.project.rigging;
  if (linked) {
    if (rig.legs?.[key]?.parts) delete rig.legs[key].parts;
    return assemblyOf(key, level).parts;
  }
  rig.legs = rig.legs || {};
  if (!rig.legs[key]?.parts?.length) rig.legs[key] = { ...(rig.legs[key] || {}), parts: clone(assemblyOf(key, level).parts) };
  return rig.legs[key].parts;
}

function itemsFor(part) {
  switch (part.kind) {
    case 'shackle': return listByType('shackle').filter((s) => !part.family || s.family === part.family || s.user);
    case 'sling': return listSlingFamily(part.family || 'RS-PES');
    case 'chain': return listChainFamily(part.family || 'CH-G80');
    case 'connlink': return listByType('connlink').filter((c) => !part.family || c.family === part.family || c.user);
    case 'glink': return listByType('glink');
    default: return [];
  }
}

function insert(key, level, it, index) {
  const rig = app.project.rigging;
  if (it.head) {
    rig.head = rig.head || {};
    if (it.head === 'topShackle') rig.head.topShackle = !rig.head.topShackle;
    else rig.head.type = it.head;
    app.recompute();
    return;
  }
  const parts = editable(key, level);
  const np = { kind: it.kind, id: 'auto' };
  if (it.family) np.family = it.family;
  if (it.hitch) np.hitch = it.hitch;
  if (isLengthPart(np) && parts.some(isLengthPart)) {
    parts.splice(parts.findIndex(isLengthPart), 1, np);
    toast('One sling or chain per leg: replaced');
  } else parts.splice(index ?? parts.length, 0, np);
  if (np.hitch === 'choke' && level !== 'top') {
    // a choked sling goes around the load: it is the first part
    const i = parts.indexOf(np);
    parts.splice(i, 1);
    if (parts[0]?.kind === 'shackle') parts.splice(0, 1);
    parts.unshift(np);
  }
  app.recompute();
}

// ---------------------------------------------------------------- page
export function render(root) {
  const R = 'rigging.';
  const rig = app.project.rigging;
  const isSp = rig.type === 'spreader';
  app.project.rules = app.project.rules || {};
  rig.head = rig.head || { type: 'masterlink', itemId: 'auto' };
  if (rig.design && rig.design.uniformLegs == null) rig.design.uniformLegs = true;
  const rules = app.result?.rules || {};
  const ranges = app.project.rules.shackleRanges || DEFAULT_SHACKLE_RANGES;

  const config = panel('Configuration',
    el('div', { class: 'fields' },
      field({ label: 'Rigging type', path: `${R}type`, type: 'select', options: [['hook', 'Direct to hook'], ['spreader', 'Spreader bar']], onchange: () => window.__rerender() }),
      field({ label: 'Leg design', path: `${R}design.mode`, type: 'select', options: [['angle', 'Target angle to the vertical'], ['height', 'Imposed hook height']], onchange: () => window.__rerender() }),
      rig.design?.mode === 'height'
        ? field({ label: 'Hook height above the lift points', path: `${R}design.hookHeight_m`, unit: 'm' })
        : field({ label: 'Target angle to vertical', path: `${R}design.targetAngleV_deg`, unit: '°', hint: `max ${rules.maxAngleV_deg ?? 45}° (Settings)` }),
      field({ label: 'Sling lengths', path: `${R}design.roundLengths`, type: 'select', options: [['set', 'Matched set (standard, rounded up)'], ['nearest', 'Nearest standard'], ['up', 'Standard rounded up'], ['exact', 'Made to measure']] }),
      field({ label: 'Same size on every leg', path: `${R}design.uniformLegs`, type: 'select', options: [['true', 'Yes'], ['false', 'No — each leg on its own force']], onchange: (v) => { rig.design.uniformLegs = v === 'true'; app.recompute(); } }),
    ),
    el('details', { class: 'sub' }, el('summary', {}, 'Shackle ranges used by "auto"'),
      el('div', { class: 'row', style: { gap: '14px' } }, Object.entries(SHACKLE_RANGES).map(([k, v]) =>
        el('label', { class: 'check', style: { fontSize: '13px' } }, el('input', { type: 'checkbox', checked: ranges.includes(k), onchange: (e) => { const cur = new Set(app.project.rules.shackleRanges || DEFAULT_SHACKLE_RANGES); if (e.target.checked) cur.add(k); else cur.delete(k); app.project.rules.shackleRanges = [...cur]; app.recompute(); } }), v)))),
  );
  let spreader = null;
  if (isSp) {
    const S = `${R}spreader.`;
    spreader = panel('Spreader bar', el('div', { class: 'fields' },
      field({ label: 'Description', path: `${S}name`, type: 'text' }), field({ label: 'Certificate no.', path: `${S}certNo`, type: 'text' }),
      field({ label: 'Lug spacing', path: `${S}length_m`, unit: 'm' }), field({ label: 'Bottom → top lug height', path: `${S}depth_m`, unit: 'm' }),
      field({ label: 'Weight', path: `${S}weight_t`, unit: 't' }), field({ label: 'WLL', path: `${S}wll_t`, unit: 't' }),
      field({ label: 'Axis', path: `${S}axis`, type: 'select', options: [['x', 'Along X'], ['y', 'Along Y']] }),
      field({ label: 'Position', path: `${S}position`, type: 'select', options: [['points', 'Centred on the lift points'], ['cog', 'Centred on the COG']] }),
      field({ label: 'Min top angle to horizontal (certificate)', path: `${S}minTopAngle_deg`, unit: '°' }),
      field({ label: 'Target bottom angle to vertical', path: `${S}bottomTargetAngleV_deg`, unit: '°' }),
      field({ label: 'Min height under the bar', path: `${S}minBottomHeight_m`, unit: 'm' }),
      field({ label: 'Top lug hole Ø', path: `${S}topLugHoleDia_mm`, unit: 'mm' }), field({ label: 'Top lug thickness', path: `${S}topLugThk_mm`, unit: 'mm' }),
      field({ label: 'Bottom lug hole Ø', path: `${S}bottomLugHoleDia_mm`, unit: 'mm' }), field({ label: 'Bottom lug thickness', path: `${S}bottomLugThk_mm`, unit: 'mm' }),
    ));
  }

  const palette = el('div', { class: 'palette' });
  for (const g of PALETTE) {
    const grp = el('div', { class: 'pgroup' }, el('b', {}, g.group));
    g.items.forEach((it) => {
      const chip = el('span', { class: 'chip', draggable: 'true', title: 'Drag onto a leg (or onto the hook)' }, el('i', { style: { background: COL[it.kind] || COL.head } }), it.label);
      chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ add: it })); e.dataTransfer.effectAllowed = 'copy'; });
      grp.append(chip);
    });
    palette.append(grp);
  }
  const schemPanel = panel(null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Rigging arrangement'),
      el('label', { class: 'check', title: 'When ticked, a change on one leg is applied to every leg' }, el('input', { type: 'checkbox', checked: linked, onchange: (e) => { linked = e.target.checked; drawSchematic(); } }), 'Same assembly on every leg'),
    ),
    el('div', { class: 'schem-grid' },
      el('div', {}, palette, el('p', { class: 'muted', style: { fontSize: '11.5px' } }, 'Drag an item onto a "+" of a leg (or onto the hook). Click an item of the schematic to change its size or remove it. One leg is drawn for every lift point.')),
      el('div', { id: 'schem', class: 'schem' }),
    ),
  );
  v3 = viewer3d({ height: 420, title: '' });
  lviews = [loadView('xy', { editable: true, height: 300 }), loadView('xz', { editable: true, height: 300 })];
  const views = panel(null, el('div', { class: 'panel-head' }, el('h2', {}, '3D and views'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Drag the lift points or the COG in the views: lengths and forces update live.')),
    el('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '10px' } }, v3, el('div', { class: 'grid', style: { gap: '8px' } }, ...lviews)));
  const legs = panel(null, el('div', { class: 'panel-head' }, el('h2', {}, 'Legs — load share and lengths'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Lengths bearing to bearing (lift point → hook). The hook is above the COG.')), el('div', { id: 'legs-table', class: 'tbl-wrap' }));
  root.append(el('div', { class: 'grid g2' }, config, spreader || el('div', { id: 'factors-mini' })), schemPanel, legs, views);
  update(app.result);
  root._update = update;
}

// ---------------------------------------------------------------- schematic
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function icon(kind, x, y, part, item) {
  // returns { svg, h } — icon centred on x, top at y
  const c = COL[kind] || '#555';
  if (kind === 'shackle')
    return { h: 34, svg: `<path d="M${x - 9} ${y + 26} L${x - 9} ${y + 12} A9 9 0 0 1 ${x + 9} ${y + 12} L${x + 9} ${y + 26}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/><rect x="${x - 13}" y="${y + 25}" width="26" height="5" rx="2" fill="#2e8b3a"/>` };
  if (kind === 'sling') {
    const col = item?.colorHex || c;
    const choke = part?.hitch === 'choke';
    return { h: 74, svg: `<rect x="${x - 7}" y="${y}" width="14" height="${choke ? 56 : 74}" rx="7" fill="${esc(col)}" stroke="#1c2733" stroke-width=".8"/>${choke ? `<path d="M${x - 16} ${y + 66} q16 -14 32 0 q-16 14 -32 0z" fill="none" stroke="${esc(col)}" stroke-width="5"/>` : ''}` };
  }
  if (kind === 'chain') {
    let s = '';
    for (let i = 0; i < 6; i++) s += i % 2 ? `<rect x="${x - 2.5}" y="${y + i * 12}" width="5" height="16" rx="2.5" fill="${c}"/>` : `<rect x="${x - 6}" y="${y + i * 12}" width="12" height="16" rx="6" fill="none" stroke="${c}" stroke-width="3"/>`;
    return { h: 78, svg: s };
  }
  if (kind === 'connlink' || kind === 'glink') return { h: 26, svg: `<rect x="${x - 7}" y="${y + 2}" width="14" height="22" rx="7" fill="none" stroke="${c}" stroke-width="4"/>` };
  return { h: 20, svg: '' };
}

function drawSchematic() {
  const box = document.getElementById('schem');
  if (!box) return;
  const res = app.result;
  const rig = res?.rig && !res.rig.error ? res.rig : null;
  const proj = app.project.rigging;
  const W = Math.max(520, box.clientWidth || 900);
  const used = (app.project.load.liftPoints || []).filter((p) => p.used !== false);
  if (!used.length) {
    box.innerHTML = '<div class="note warn">No lift point yet: add them on the Load page.</div>';
    return;
  }
  const isSp = proj.type === 'spreader';
  const legOf = (key) => rig?.legs?.find((l) => l.key === key);
  const pts = [...used].sort((a, b) => (+a.x || 0) - (+b.x || 0) || (+a.y || 0) - (+b.y || 0));
  const nCol = pts.length;
  const colW = Math.min(230, (W - 40) / nCol);
  const x0 = (W - colW * nCol) / 2 + colW / 2;
  let s = '';
  const drops = [];
  const head = rig?.head;
  const hx = W / 2;
  // hook
  s += `<line x1="${hx}" y1="0" x2="${hx}" y2="22" stroke="#333" stroke-width="1.4"/><rect x="${hx - 12}" y="22" width="24" height="16" rx="3" fill="#f2c14e" stroke="#7a5a10"/>`;
  s += `<path d="M${hx} 38 L${hx} 46 C ${hx + 16} 46 ${hx + 16} 70 ${hx} 70 C ${hx - 10} 70 ${hx - 12} 62 ${hx - 11} 58" fill="none" stroke="#7a5a10" stroke-width="4" stroke-linecap="round"/>`;
  s += `<text x="${hx + 22}" y="36" font-size="12" font-weight="700" fill="#7a5a10">Crane hook${res?.shlCrane ? ` · ${res.shlCrane.toFixed(2)} t` : ''}</text>`;
  let y = 74;
  const hType = proj.head?.type || 'masterlink';
  const headParts = [];
  if (proj.head?.topShackle && hType !== 'hook') headParts.push({ k: 'top', txt: head?.topShackle ? niceName(head.topShackle) : 'Hook shackle' });
  if (hType !== 'hook') headParts.push({ k: 'ml', txt: head?.masterlink ? niceName(head.masterlink) : hType === 'assembly' ? 'Quad masterlink' : 'Masterlink' });
  else headParts.push({ k: 'ml', txt: 'Legs directly on the hook', none: true });
  for (const hp of headParts) {
    if (hp.k === 'top') s += `<path d="M${hx - 9} ${y + 2} L${hx - 9} ${y + 16} A9 9 0 0 0 ${hx + 9} ${y + 16} L${hx + 9} ${y + 2}" fill="none" stroke="${COL.shackle}" stroke-width="4.5"/><rect x="${hx - 13}" y="${y - 2}" width="26" height="5" rx="2" fill="#2e8b3a"/>`;
    else if (!hp.none) s += `<rect x="${hx - 15}" y="${y}" width="30" height="44" rx="15" fill="none" stroke="${COL.head}" stroke-width="5"/>`;
    const ty = y + (hp.k === 'top' ? 2 : 12);
    s += `<g data-pop="head:${hp.k}" class="clk"><rect x="${hx + 20}" y="${ty}" width="${hp.txt.length * 6.6 + 12}" height="19" rx="9" fill="#fff" stroke="#c9d3dd"/><text x="${hx + 26}" y="${ty + 13.5}" font-size="11.5" font-weight="600">${esc(hp.txt)}</text></g>`;
    y += hp.k === 'top' ? 26 : hp.none ? 22 : 48;
  }
  drops.push({ x: hx - 60, y: 20, w: 120, h: y - 20, key: '__head', level: 'head', idx: 0 });
  const headBottom = y;
  let colTop = headBottom + 60;
  const topCols = [];
  let barY = 0;
  if (isSp) {
    ['TA', 'TB'].forEach((k, j) => topCols.push({ key: k, x: W / 2 + (j ? 1 : -1) * Math.min(W * 0.28, 260), level: 'top', top: headBottom + 40 }));
  }
  const columns = [...topCols, ...pts.map((p, i) => ({ key: p.id, x: x0 + i * colW, level: 'main', point: p, top: colTop }))];
  const drawCol = (c, fromX, fromY) => {
    const leg = legOf(c.key);
    const { parts, own } = assemblyOf(c.key, c.level === 'top' ? 'top' : 'main');
    s += `<line x1="${fromX}" y1="${fromY}" x2="${c.x}" y2="${c.top}" stroke="#9aa5b1" stroke-width="2" stroke-dasharray="4 3"/>`;
    let yy = c.top;
    const slot = (idx) => {
      drops.push({ x: c.x - 30, y: yy, w: 60, h: 16, key: c.key, level: c.level === 'top' ? 'top' : 'main', idx });
      s += `<g class="slot"><rect x="${c.x - 22}" y="${yy}" width="44" height="14" rx="7" fill="#eef4fa" stroke="#9db6d1" stroke-dasharray="3 2"/><text x="${c.x}" y="${yy + 11}" font-size="12" text-anchor="middle" fill="#6b8bb0">+</text></g>`;
      yy += 18;
    };
    slot(parts.length);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const rp = leg?.parts?.[i];
      const ic = icon(p.kind, c.x, yy, p, rp?.item);
      const txt = rp?.item ? niceName(rp.item, isLengthPart(p) ? { length_m: rp.length_m, links: p.kind === 'chain' ? rp.links : null } : {}) : `${p.kind} ?`;
      const sub = rp?.item && leg ? `min ${fmt(rp.reqWll)} t · ${Math.round((leg.Fdesign / (rp.item.wll_t * (rp.factor || 1))) * 100)} %` : 'not found';
      s += `<g data-pop="${esc(c.key)}:${i}:${c.level}" class="clk">${ic.svg}<rect x="${c.x - 16}" y="${yy}" width="${Math.max(colW - 14, 120)}" height="${ic.h}" fill="transparent"/>`;
      s += `<text x="${c.x + 16}" y="${yy + ic.h / 2 - 2}" font-size="11.5" font-weight="700" fill="${rp && !rp.item ? '#c0392b' : '#1c2733'}">${esc(txt)}${p.id && p.id !== 'auto' ? ' ★' : ''}</text>`;
      s += `<text x="${c.x + 16}" y="${yy + ic.h / 2 + 11}" font-size="10" fill="#5d6b7a">${esc(sub)}</text></g>`;
      yy += ic.h + 2;
      slot(i);
    }
    if (c.point) {
      const pad = c.point.padeye !== false;
      s += pad ? `<path d="M${c.x - 16} ${yy + 22} L${c.x - 10} ${yy + 4} A10 10 0 0 1 ${c.x + 10} ${yy + 4} L${c.x + 16} ${yy + 22} Z" fill="#c6ced6" stroke="#3c4652"/><circle cx="${c.x}" cy="${yy + 6}" r="3.5" fill="#fff" stroke="#3c4652"/>` : `<rect x="${c.x - 24}" y="${yy + 4}" width="48" height="18" fill="#e8edf2" stroke="#3c4652" stroke-dasharray="4 3"/>`;
      s += `<rect x="${c.x - 40}" y="${yy + 22}" width="80" height="6" fill="#9aa5b1"/>`;
      s += `<text x="${c.x}" y="${yy + 44}" font-size="13" font-weight="800" text-anchor="middle" fill="#c0392b">${esc(c.point.id)}</text>`;
      s += `<text x="${c.x}" y="${yy + 58}" font-size="10" text-anchor="middle" fill="#5d6b7a">${pad ? `pad eye ${c.point.swl_t ? `${fmt(c.point.swl_t, 1)}t` : '?'}` : 'no pad eye'}</text>`;
      if (leg) s += `<text x="${c.x}" y="${yy + 72}" font-size="10.5" text-anchor="middle" fill="#173a5e" font-weight="600">${fmt(leg.R, 2)} t (${(leg.share * 100).toFixed(0)} %) · ${leg.angleV.toFixed(0)}°</text>`;
      yy += 78;
    }
    if (own) s += `<text x="${c.x}" y="${c.top - 6}" font-size="9.5" text-anchor="middle" fill="#c96a17" font-weight="700">custom leg</text>`;
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
  box.innerHTML = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, Arial, sans-serif">${s}</svg>`;
  const svg = box.querySelector('svg');
  const hit = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W, yv = ((ev.clientY - r.top) / r.height) * H;
    let best = null, bd = 1e9;
    for (const d of drops) {
      const dist = Math.hypot(Math.max(d.x - x, 0, x - (d.x + d.w)), Math.max(d.y - yv, 0, yv - (d.y + d.h)));
      if (dist < bd) { bd = dist; best = d; }
    }
    return bd < 60 ? best : null;
  };
  let hl = null;
  svg.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    const d = hit(ev);
    if (hl && hl._d === d) return;
    hl?.remove();
    hl = null;
    if (d) {
      hl = document.createElementNS(NS, 'rect');
      hl._d = d;
      Object.entries({ x: d.x - 4, y: d.y - 3, width: d.w + 8, height: d.h + 6, rx: 8, fill: 'rgba(232,130,42,.15)', stroke: '#e8822a', 'stroke-width': 2.5, 'pointer-events': 'none' }).forEach(([k, v]) => hl.setAttribute(k, v));
      svg.append(hl);
    }
  });
  svg.addEventListener('dragleave', (ev) => { if (!svg.contains(ev.relatedTarget)) { hl?.remove(); hl = null; } });
  svg.addEventListener('drop', (ev) => {
    ev.preventDefault();
    hl?.remove();
    hl = null;
    let data;
    try { data = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return; }
    if (!data?.add) return;
    if (data.add.head) return insert(null, 'head', data.add);
    const d = hit(ev);
    if (!d || d.level === 'head') return toast('Drop slings, chains and shackles on a "+" of a leg');
    insert(d.key, d.level, data.add, d.idx);
  });
  svg.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-pop]');
    if (g) openPop(g.dataset.pop, ev);
  });
}

// ---------------------------------------------------------------- popover
function closePop() {
  pop?.remove();
  pop = null;
}
document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest?.('[data-pop]')) closePop(); });

function openPop(ref, ev) {
  closePop();
  const proj = app.project.rigging;
  const box = el('div', { class: 'pop' });
  const done = () => { closePop(); app.recompute(); };
  if (ref.startsWith('head:')) {
    const k = ref.slice(5);
    if (k === 'ml') {
      const typ = el('select', { onchange: (e) => { proj.head.type = e.target.value; proj.head.itemId = 'auto'; done(); } });
      [['masterlink', 'Masterlink'], ['assembly', 'Quad masterlink (sub-links)'], ['hook', 'Directly on the hook']].forEach(([v, t]) => typ.append(el('option', { value: v, selected: proj.head.type === v }, t)));
      box.append(el('b', {}, 'On the crane hook'), typ);
      if (proj.head.type !== 'hook') {
        const sel = el('select', { onchange: (e) => { proj.head.itemId = e.target.value; done(); } });
        sel.append(el('option', { value: 'auto' }, 'Auto size'));
        listByType('masterlink').filter((m) => (proj.head.type === 'assembly' ? true : !m.sub)).forEach((m) => sel.append(el('option', { value: m.id, selected: m.id === proj.head.itemId }, niceName(m))));
        box.append(sel, el('label', {}, el('input', { type: 'checkbox', checked: !!proj.head.topShackle, onchange: (e) => { proj.head.topShackle = e.target.checked; done(); } }), ' shackle between hook and masterlink'));
      }
    } else {
      const sel = el('select', { onchange: (e) => { proj.head.topShackleId = e.target.value; done(); } });
      sel.append(el('option', { value: 'auto' }, 'Auto size'));
      listByType('shackle').forEach((m) => sel.append(el('option', { value: m.id, selected: m.id === proj.head.topShackleId }, niceName(m))));
      box.append(el('b', {}, 'Hook shackle'), sel, el('button', { class: 'small danger', onclick: () => { proj.head.topShackle = false; done(); } }, 'Remove'));
    }
  } else {
    const [key, iStr, level] = ref.split(':');
    const i = Number(iStr);
    const lvl = level === 'top' ? 'top' : 'main';
    const cur = assemblyOf(key, lvl).parts[i];
    if (!cur) return;
    const target = () => editable(key, lvl)[i];
    const sel = el('select', { onchange: (e) => { target().id = e.target.value; done(); } });
    sel.append(el('option', { value: 'auto' }, 'Auto size'));
    itemsFor(cur).forEach((it) => sel.append(el('option', { value: it.id, selected: it.id === cur.id }, `${it.user ? '★ ' : ''}${niceName(it)}`)));
    box.append(el('b', {}, `${linked ? 'All legs' : `Leg ${key}`} — ${cur.kind === 'connlink' ? 'connecting link' : cur.kind}`), sel);
    if (cur.kind === 'sling') {
      const fam = el('select', { onchange: (e) => { const t = target(); t.family = e.target.value; t.id = 'auto'; done(); } });
      Object.entries(SLING_FAMILIES).forEach(([k, v]) => fam.append(el('option', { value: k, selected: (cur.family || 'RS-PES') === k }, v)));
      box.append(fam);
    }
    if (cur.kind === 'chain') {
      const fam = el('select', { onchange: (e) => { const t = target(); t.family = e.target.value; t.id = 'auto'; done(); } });
      Object.entries(CHAIN_FAMILIES).forEach(([k, v]) => fam.append(el('option', { value: k, selected: (cur.family || 'CH-G80') === k }, v)));
      box.append(fam);
    }
    if (isLengthPart(cur)) {
      const h = el('select', { onchange: (e) => { target().hitch = e.target.value; done(); } });
      [['direct', 'Straight (×1.0)'], ['choke', 'Choked (×0.8)']].forEach(([k, v]) => h.append(el('option', { value: k, selected: (cur.hitch || 'direct') === k }, v)));
      box.append(h);
      if (cur.hitch === 'choke') box.append(el('label', {}, 'Length taken by the choke (m) ', el('input', { type: 'number', step: 'any', value: cur.wrap_m ?? '', style: { width: '70px' }, onchange: (e) => { target().wrap_m = e.target.value === '' ? null : Number(e.target.value); done(); } })));
      if (cur.kind === 'sling') box.append(el('label', {}, 'Fixed EWL ', el('input', { type: 'number', step: 'any', value: cur.lock ? cur.length_m ?? '' : '', placeholder: 'auto', style: { width: '70px' }, onchange: (e) => { const t = target(); t.length_m = Number(e.target.value) || null; t.lock = !!t.length_m; done(); } }), ' m'));
    }
    box.append(el('div', { class: 'row' },
      el('button', { class: 'small danger', onclick: () => { editable(key, lvl).splice(i, 1); done(); } }, 'Remove'),
      !linked && app.project.rigging.legs?.[key]?.parts ? el('button', { class: 'small', onclick: () => { delete app.project.rigging.legs[key].parts; done(); } }, 'Back to the common assembly') : null));
  }
  document.body.append(box);
  const r = box.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 10, ev.clientX + 8))}px`;
  box.style.top = `${Math.min(window.innerHeight - r.height - 10, ev.clientY + 8) + window.scrollY}px`;
  pop = box;
}

// ---------------------------------------------------------------- update
function update(res) {
  drawSchematic();
  v3?.refresh();
  lviews.forEach((v) => v.refresh());
  const fm = document.getElementById('factors-mini');
  if (fm && res?.rig?.factors) {
    const f = res.rig.factors;
    fm.innerHTML = '';
    fm.append(panel('Design factors', el('div', { class: 'cards' },
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'DAF'), el('div', { class: 'v' }, f.dafOn ? fmt(f.daf) : 'off')),
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'SKL'), el('div', { class: 'v' }, fmt(f.skl))),
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'COG factor'), el('div', { class: 'v' }, fmt(f.cog))),
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'Leg factor'), el('div', { class: 'v' }, fmt(res.rig.fac, 3))),
    ), el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Set on the Checks page.')));
  }
  const box = document.getElementById('legs-table');
  if (!box) return;
  box.innerHTML = '';
  const rig = res?.rig;
  if (!rig || rig.error) {
    box.append(el('div', { class: 'note fail' }, rig?.error || 'No result'));
    return;
  }
  const tgt = res.rules?.targetAngleV_deg ?? 30, mx = res.rules?.maxAngleV_deg ?? 45;
  const tA = rig.legs[0]?.need?.target?.angle ?? tgt;
  const head = ['Leg', 'Static load share', 'Static tension', 'Design force (min WLL)', `Length for ${fmt(tA, 0)}°`, `Min. length for ${mx}°`, 'Sling / chain to use', 'Actual length · angle', 'Max util.'];
  const tb = el('tbody');
  for (const l of rig.legs) {
    const len = l.parts[l.li];
    const nd = l.need || {};
    const utilMax = Math.max(...l.parts.filter((p) => p.item).map((p) => l.Fdesign / (p.item.wll_t * (p.factor || 1))));
    const lenTxt = (L, elem) => `${fmt(L, 2)} m${len ? ` (${len.kind === 'chain' && len.item ? `${Math.ceil((elem * 1000) / len.item.dims.pitch - 1e-6)} links` : `sling ${fmt(elem, 2)} m`})` : ''}`;
    tb.append(el('tr', {},
      el('td', {}, el('b', {}, l.label)),
      el('td', { class: 'num' }, `${fmt(l.R)} t`, el('span', { class: 'muted' }, ` (${(l.share * 100).toFixed(1)} %)`)),
      el('td', { class: 'num' }, `${fmt(l.Tstatic)} t`),
      el('td', { class: 'num' }, el('b', {}, `${fmt(l.Fdesign)} t`)),
      el('td', { class: 'num' }, nd.target ? lenTxt(nd.target.L, nd.target.elem) : '—'),
      el('td', { class: 'num' }, nd.max ? lenTxt(nd.max.L, nd.max.elem) : '—'),
      el('td', {}, len?.item ? niceName(len.item, { length_m: len.length_m, links: len.kind === 'chain' ? len.links : null }) : '—'),
      el('td', { class: 'num', style: { color: l.angleV > mx + 0.2 ? 'var(--fail)' : l.angleV > tgt + 0.2 ? 'var(--warn)' : '' } }, `${fmt(l.Leff, 2)} m · ${l.angleV.toFixed(1)}°`),
      el('td', {}, utilBar(utilMax)),
    ));
  }
  const totR = rig.legs.filter((l) => l.level !== 'top').reduce((s, l) => s + l.R, 0);
  box.append(el('table', { class: 'data' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), tb));
  box.append(el('p', { class: 'muted', style: { fontSize: '12px' } },
    `Static load ${fmt(rig.W)} t (net weight × WCF) shared by the legs: Σ = ${fmt(totR)} t. Tension = share / cos(angle). Design force = tension × DAF × SKL × COG factor (× ${fmt(rig.fac, 3)}). `,
    `"Length for ${fmt(tA, 0)}°" is the bearing-to-bearing length each leg needs so that the most spread leg is at ${fmt(tA, 0)}°; "min. length for ${mx}°" is the shortest acceptable. In brackets: the sling EWL or the chain once the shackles, links and master link are deducted.`));
}
