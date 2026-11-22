// Lift plan report, laid out like the company lifting plan template (header with logos, blue
// section bars, lifting plan block, load / crane details, safety measures, equipment, step-by-step,
// sketches, checklift) followed by the calculation summary.
import { app } from '../app.js';
import { el, fmt } from '../dom.js';
import { legsTable } from './results.js';
import { drawRiggingDetail, drawPadeyeFit } from '../../draw/detail.js';
import { schematicSvg } from '../../draw/schematic.js';
import { drawCapacityChart } from '../../draw/chart.js';
import { staticViewSvg, safeImg } from '../loadview.js';
import { figure } from '../figure.js';
import { ENVIRONMENTS } from '../../engine/factors.js';
import { pointKind } from '../../engine/rigging.js';
import { SAFETY_MEASURES, CHECKLIFT, getPath, setPath } from '../../state.js';
import { craneSwl } from './crane.js';
import { openSignPad } from '../signpad.js';
import { bePlanSvg, legCompositions } from '../../draw/beplan.js';

const opts = { calc: true, checksAll: false };

// ---------- editing in the report: every field writes back into the project (and so into the
// other pages); the report is rebuilt when the editing is over.
let holdUpdate = false;
let pendingUpdate = false;
let panelStale = false; // the sign-off panel must show what was typed in the report
const pathGS = (path, { num = false } = {}) => ({
  get: () => getPath(app.project, path),
  set: (v) => setPath(app.project, path, num ? (v === '' ? null : Number(String(v).replace(',', '.'))) : v),
});
/** Editable text: { get, set } or a project path. */
function ed(target, { multi = false, ph = '', num = false, show } = {}) {
  const gs = typeof target === 'string' ? pathGS(target, { num }) : target;
  const cur = gs.get();
  const txt = show ? show(cur) : cur ?? '';
  const e = el(multi ? 'div' : 'span', { class: `ed ${multi ? 'multi' : ''}`, contenteditable: 'true', spellcheck: 'false', 'data-ph': ph, 'data-ed': '1', title: 'Click to edit — saved in the project' }, txt == null ? '' : String(txt));
  e.addEventListener('keydown', (ev) => { if (!multi && ev.key === 'Enter') { ev.preventDefault(); e.blur(); } });
  e.addEventListener('focus', () => { if (show && cur != null) e.textContent = String(cur); });
  e.addEventListener('focusout', (ev) => {
    const v = multi ? e.innerText.replace(/\n+$/, '').trim() : e.textContent.trim();
    const next = ev.relatedTarget?.closest?.('#report-preview [data-ed]');
    const before = gs.get();
    if (String(before ?? '') !== v) {
      if (num && v !== '' && !isFinite(Number(v.replace(',', '.')))) { e.textContent = before ?? ''; return; }
      gs.set(v);
      panelStale = true;
      holdUpdate = !!next;
      app.recompute();
      holdUpdate = false;
    } else if (!next && pendingUpdate) update();
  });
  return e;
}
/** Tick box that can be clicked in the report. */
function tk(get, set) {
  return act(el('span', { class: 'tick ed-tick', title: 'Click to tick / untick' }, get() ? '☒' : '☐'), () => set(!get()));
}
/** Action on press (before the field being edited loses the focus and the report is rebuilt). */
function act(e, fn) {
  e.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    if (document.activeElement?.dataset?.ed) document.activeElement.blur();
    fn();
    app.recompute();
  });
  return e;
}
const tkp = (path) => tk(() => getPath(app.project, path), (v) => setPath(app.project, path, v));

// ---------- drawings of the report: windows (move, widen, resize, remove), saved with the project
const FIGS = [
  ['be', 'Lift plan — engineering office'],
  ['schem', 'Rigging arrangement (schematic)'],
  ['detail', 'Rigging detail (to scale)'],
  ['xy', 'Plan — XY'],
  ['xz', 'Front elevation — XZ'],
  ['yz', 'Side elevation — YZ'],
  ['padeye', 'Pad eye / shackle fit'],
  ['capacity', 'Crane capacity chart'],
];
const DEF_W = { be: 1, schem: 0.6, detail: 0.4, xy: 0.5, xz: 0.5, yz: 0.5, padeye: 0.5, capacity: 0.5 };
const figOn = (k) => app.project.report?.figs?.[k] !== false;
const ownKey = (d) => `own:${d.id}`;

/** Windows that can be shown (data available), whether ticked or not: { key: info } in default order. */
function availableWins(p, res, all = false) {
  const out = {};
  const ld = p.load, r = res?.rig;
  const on = (k) => all || figOn(k);
  if (safeImg(ld.bePlan?.image) && on('be')) out.be = true;
  ['schem', 'detail', 'xy', 'xz', 'yz'].forEach((k) => { if (on(k)) out[k] = true; });
  const pts = (ld.liftPoints || []).filter((q) => q.used !== false && pointKind(q) === 'padeye');
  const lg = pts.length ? r?.legs?.find((l) => l.pointId === pts[0].id && l.level !== 'top') : null;
  const sh = lg?.parts?.[0]?.kind === 'shackle' ? lg.parts[0].item : null;
  if (sh && on('padeye')) out.padeye = { pq: pts[0], sh, n: pts.length };
  if (on('capacity')) out.capacity = true;
  (p.report?.drawings || []).forEach((d) => {
    if (!d.id) d.id = Math.random().toString(36).slice(2, 8);
    if (safeImg(d.image) && on(ownKey(d))) out[ownKey(d)] = d;
  });
  return out;
}

/** Order and size of the windows: saved order first, new windows at their default place. */
function layoutOf(p, wins) {
  p.report = p.report || {};
  const L = (p.report.layout = p.report.layout || {});
  L.win = L.win || {};
  const def = FIGS.map(([k]) => k).concat(Object.keys(wins).filter((k) => k.startsWith('own:')));
  const rank = (k) => { const i = def.indexOf(k); return i < 0 ? 999 : i; };
  const order = (L.order || []).filter((k) => wins[k]);
  Object.keys(wins).filter((k) => !order.includes(k)).forEach((k) => {
    const at = order.findIndex((o) => rank(o) > rank(k));
    order.splice(at < 0 ? order.length : at, 0, k);
  });
  const win = {};
  order.forEach((k) => {
    const s = L.win[k] || {};
    win[k] = { w: Math.min(1, Math.max(0.2, Number(s.w) || DEF_W[k] || 1)), h: Number(s.h) > 0 ? Number(s.h) : null };
  });
  return { order, win, store: L };
}

/** Rows of windows: they follow on while the widths add up to the page width. */
function packRows(lay) {
  const rows = [];
  let cur = [], sum = 0;
  for (const k of lay.order) {
    const w = lay.win[k].w;
    if (cur.length && sum + w > 1.001) { rows.push(cur); cur = []; sum = 0; }
    cur.push(k);
    sum += w;
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function saveLayout(lay, k, patch) {
  const st = lay.store;
  st.order = [...lay.order];
  st.win = st.win || {};
  if (k) st.win[k] = { ...lay.win[k], ...(st.win[k] || {}), ...patch };
}

/** Buttons shown on a window of the preview (not printed). */
function winTools(k, lay) {
  const i = lay.order.indexOf(k);
  const W = lay.win[k];
  const move = (d) => { const o = lay.order; const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; saveLayout(lay); };
  const curH = () => { const e = document.querySelector(`#report-preview .win[data-key="${k}"] .drawing`); return e ? Math.round(e.getBoundingClientRect().height * mmPerPx()) : 80; };
  const b = (txt, title, fn, cls = '') => act(el('button', { class: cls, title }, txt), fn);
  return el('div', { class: 'win-tools no-print' },
    b('←', 'Move before', () => move(-1)),
    b('→', 'Move after', () => move(1)),
    b('½', 'Half the page width', () => saveLayout(lay, k, { w: 0.5 }), W.w === 0.5 ? 'on' : ''),
    b('⬌', 'Whole page width', () => saveLayout(lay, k, { w: 1 }), W.w === 1 ? 'on' : ''),
    b('−', 'Smaller (height)', () => saveLayout(lay, k, { h: Math.max(25, (W.h || curH()) - 10) })),
    b('+', 'Bigger (height)', () => saveLayout(lay, k, { h: Math.min(260, (W.h || curH()) + 10) })),
    W.h || lay.store.win?.[k]?.w ? b('↺', 'Size as default', () => { delete lay.store.win[k]; saveLayout(lay); }) : null,
    b('✕', 'Remove from the report (tick it again in "Drawings in the report")', () => { const f = (app.project.report.figs = app.project.report.figs || {}); f[k] = false; }, 'del'));
}

/** Millimetres of paper per screen pixel in the preview (the sheet is 210 mm wide). */
function mmPerPx() {
  const sh = document.querySelector('#report-preview > .report');
  return sh ? 210 / sh.getBoundingClientRect().width : 0.2646;
}

/** Corner of a window dragged: width (in % of the page, by 5 %) and height (by 5 mm). */
function resizeWin(ev, w, k) {
  ev.preventDefault();
  if (document.activeElement?.dataset?.ed) document.activeElement.blur();
  const row = w.parentElement, dr = w.querySelector('.drawing');
  const rowW = row.getBoundingClientRect().width;
  const r0 = w.getBoundingClientRect(), d0 = dr?.getBoundingClientRect();
  const mm = mmPerPx();
  const x0 = ev.clientX, y0 = ev.clientY;
  const keys = [...row.children].map((c) => c.dataset.key);
  const lay = layoutOf(app.project, availableWins(app.project, app.result));
  let nw = lay.win[k].w, nh = lay.win[k].h || (d0 ? Math.round(d0.height * mm) : null);
  const tag = el('div', { class: 'win-size no-print' });
  w.append(tag);
  w.classList.add('resizing');
  const grip = ev.target;
  grip.setPointerCapture(ev.pointerId);
  const move = (e) => {
    nw = Math.min(1, Math.max(0.2, Math.round(((r0.width + e.clientX - x0) / rowW) * 20) / 20));
    if (d0) nh = Math.min(260, Math.max(25, Math.round(((d0.height + e.clientY - y0) * mm) / 5) * 5));
    const ws = keys.map((x) => (x === k ? nw : lay.win[x].w));
    const sum = ws.reduce((a, b) => a + b, 0);
    row.style.gridTemplateColumns = ws.map((x) => `${x}fr`).join(' ') + (sum < 0.999 ? ` ${(1 - sum).toFixed(3)}fr` : '');
    if (dr && nh) { dr.style.height = `${nh}mm`; w.classList.add('sized'); }
    tag.textContent = `${Math.round(nw * 100)} % × ${nh ?? '—'} mm`;
  };
  const up = () => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', up);
    saveLayout(lay, k, { w: nw, h: nh });
    app.recompute();
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', up);
}

/** Scrolling element of the page (for the automatic scroll while a window is dragged). */
function scroller(e) {
  for (let x = e?.parentElement; x; x = x.parentElement) {
    const o = getComputedStyle(x).overflowY;
    if ((o === 'auto' || o === 'scroll') && x.scrollHeight > x.clientHeight + 4) return x;
  }
  return document.scrollingElement || document.documentElement;
}

/** Window dragged and dropped before or after another one (the page scrolls near its top / bottom). */
function dragWin(ev, w, k) {
  if (ev.button !== 0 || ev.target.closest('.win-tools, .win-grip, [data-ed], button, input, select, a')) return;
  ev.preventDefault();
  if (document.activeElement?.dataset?.ed) document.activeElement.blur();
  const x0 = ev.clientX, y0 = ev.clientY;
  const sc = scroller(w);
  let on = false, target = null, side = 'before', ghost = null, mark = null, last = null, raf = 0;
  const others = () => [...document.querySelectorAll('#report-preview .win')].filter((x) => x !== w);
  const place = (e) => {
    let best = null, bd = Infinity;
    for (const x of others()) {
      const r = x.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
      if (d < bd) { bd = d; best = x; }
    }
    target = best && bd < 150 ? best : null;
    if (!target) { mark.style.display = 'none'; return; }
    const r = target.getBoundingClientRect();
    side = e.clientX < r.left + r.width / 2 ? 'before' : 'after';
    Object.assign(mark.style, { display: 'block', left: `${(side === 'before' ? r.left - 5 : r.right + 2)}px`, top: `${r.top}px`, height: `${r.height}px` });
  };
  const tick = () => {
    if (!on || !last) return;
    const y = last.clientY, H = window.innerHeight;
    const v = y < 90 ? -Math.ceil((90 - y) / 6) : y > H - 70 ? Math.ceil((y - H + 70) / 6) : 0;
    if (v) { sc.scrollTop += v; place(last); }
    raf = requestAnimationFrame(tick);
  };
  const move = (e) => {
    last = e;
    if (!on) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      on = true;
      w.classList.add('dragging');
      ghost = el('div', { class: 'win-ghost' }, w.querySelector('.sub-t')?.textContent || FIGS.find(([f]) => f === k)?.[1] || 'Drawing');
      mark = el('div', { class: 'win-mark' });
      document.body.append(ghost, mark);
      raf = requestAnimationFrame(tick);
    }
    Object.assign(ghost.style, { left: `${e.clientX + 14}px`, top: `${e.clientY + 10}px` });
    place(e);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    cancelAnimationFrame(raf);
    ghost?.remove();
    mark?.remove();
    w.classList.remove('dragging');
    if (!on || !target) return;
    const lay = layoutOf(app.project, availableWins(app.project, app.result));
    const o = lay.order;
    o.splice(o.indexOf(k), 1);
    let j = o.indexOf(target.dataset.key);
    if (j < 0) return;
    if (side === 'after') j++;
    o.splice(j, 0, k);
    saveLayout(lay);
    app.recompute();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function figsPanel() {
  const p = app.project;
  p.report = p.report || {};
  p.report.figs = p.report.figs || {};
  const avail = availableWins(p, app.result, true);
  const items = [...FIGS.filter(([k]) => avail[k]), ...(p.report.drawings || []).filter((d) => avail[ownKey(d)]).map((d) => [ownKey(d), d.caption || 'My drawing'])];
  return el('div', { id: 'figs-panel', class: 'panel no-print', style: { marginBottom: '12px' } },
    el('div', { class: 'panel-head' }, el('h2', {}, 'Drawings in the report'),
      el('button', { class: 'small', title: 'Default order and sizes', onclick: () => { delete p.report.layout; app.recompute(); } }, 'Reset the layout')),
    el('div', { class: 'row', style: { gap: '4px 16px' } },
      items.map(([k, t]) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: figOn(k), onchange: (e) => { p.report.figs[k] = e.target.checked; app.recompute(); } }), t))),
    el('p', { class: 'muted', style: { fontSize: '12px', margin: '6px 0 0' } }, 'In the preview: drag a drawing to move it, drag its corner ◢ to resize it; or point at it: ← → move, ½ / ⬌ half or whole page width, − + height, ✕ remove. Saved with the project.'));
}

export function render(root) {
  const tog = (k, t) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: opts[k], onchange: (e) => { opts[k] = e.target.checked; update(); } }), t);
  root.append(
    el('div', { class: 'row no-print', style: { marginBottom: '12px', gap: '14px' } },
      el('button', { class: 'primary', onclick: () => window.__printReport?.() }, 'Print / Save as PDF'),
      el('span', { class: 'muted' }, 'In the print dialog choose "Save as PDF", A4 portrait, margins "default".'),
      tog('calc', 'Calculation summary'), tog('checksAll', 'All checks (not only issues)'),
    ),
    figsPanel(),
    signoffPanel(),
    ownDrawingsPanel(),
    el('div', { id: 'report-preview' }),
  );
  update();
  root._update = update;
  // the preview is the A4 sheet as printed, scaled down when the window is narrower
  const box = document.getElementById('report-preview');
  if (window.ResizeObserver && box) {
    const ro = new ResizeObserver(() => { if (!box.isConnected) { ro.disconnect(); return; } zoomSheet(); });
    ro.observe(box);
  }
}

/** Content wider than the page (a long word, a wide table…) is scaled down to the page width
 *  instead of being cut on the right. `rep` is a laid-out .report element. */
export function fitContent(rep) {
  const t = rep?.querySelector(':scope > table.pt');
  if (!t) return;
  t.style.zoom = '';
  const cs = getComputedStyle(rep);
  const avail = rep.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const w = Math.max(t.offsetWidth, t.scrollWidth);
  if (avail > 0 && w > avail + 1) t.style.zoom = (avail / w).toFixed(4);
}

/** Report as it will be printed: built and measured off screen at the A4 width, fitted, then returned. */
export function buildPrintReport() {
  const rep = buildReport();
  const probe = el('div', { class: 'print-probe' }, rep);
  document.body.append(probe);
  fitContent(rep);
  probe.remove();
  return rep;
}

function zoomSheet() {
  const box = document.getElementById('report-preview');
  const sh = box?.querySelector(':scope > .report');
  if (!sh) return;
  sh.style.zoom = '';
  const z = box.clientWidth / sh.offsetWidth;
  if (z < 0.999) sh.style.zoom = Math.max(0.3, z).toFixed(4);
}

function update() {
  const box = document.getElementById('report-preview');
  if (!box) return;
  if (holdUpdate || box.contains(document.activeElement) && document.activeElement?.dataset?.ed) { pendingUpdate = true; return; }
  pendingUpdate = false;
  box.innerHTML = '';
  const rep = buildReport();
  box.append(rep);
  fitContent(rep);
  zoomSheet();
  // keep the sign-off panel in step with what was typed in the report
  const sp = document.getElementById('signoff-panel');
  if (panelStale && sp) sp.replaceWith(signoffPanel());
  panelStale = false;
  const fp = document.getElementById('figs-panel');
  if (fp) { const n = figsPanel(); fp.replaceWith(n); }
}

const fig = (svg, cls = '') => figure(svg, '', { exportable: false, cls });
const box = (t) => el('span', { class: 'tick' }, t ? '☒' : '☐');
const bar = (title, sub) => el('div', { class: 'bar' }, title, sub ? el('span', {}, ` ${sub}`) : null);
const lines = (txt) => String(txt || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

function header(p) {
  const pr = p.project;
  const hl = pr.headerLines || [];
  const logo = (k) => (safeImg(p.logos?.[k]) ? el('img', { src: p.logos[k], alt: '' }) : el('div'));
  return el('div', { class: 'rhead' },
    el('div', { class: 'logo l' }, logo('company')),
    el('div', { class: 'mid' },
      el('div', { class: 'h1' }, ed({ get: () => hl[0] || pr.client || '', set: (v) => { pr.headerLines = [...(pr.headerLines || [])]; pr.headerLines[0] = v; } }, { ph: 'Header line 1' })),
      el('div', { class: 'h2' }, ed({ get: () => hl[1] || pr.site || '', set: (v) => { pr.headerLines = [...(pr.headerLines || [])]; pr.headerLines[1] = v; } }, { ph: 'Header line 2' })),
      el('div', { class: 'h3' }, ed({ get: () => hl[2] || pr.name || '', set: (v) => { pr.headerLines = [...(pr.headerLines || [])]; pr.headerLines[2] = v; } }, { ph: 'Header line 3' })),
    ),
    el('div', { class: 'logo r' }, logo('client')),
  );
}

export function buildReport() {
  const p = app.project;
  const res = app.result;
  const pr = p.project;
  const r = res?.rig;
  const ld = p.load;
  // header / footer repeated on every printed page (table header / footer groups)
  const body = el('td');
  const rep = el('div', { class: 'report tpl' },
    el('table', { class: 'pt' },
      el('thead', {}, el('tr', {}, el('td', {}, header(p)))),
      el('tfoot', {}, el('tr', {}, el('td', {}, el('div', { class: 'rfoot' }, `${pr.liftId || ''} · Rev. ${pr.revision || '-'} · ${pr.date || ''}`)))),
      el('tbody', {}, el('tr', {}, body)),
    ),
  );
  const add = (...xs) => body.append(...xs.flat().filter((x) => x != null && x !== false));

  // ---- LIFTING PLAN block
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 4, class: 'big' }, 'LIFTING PLAN')),
    el('tr', {}, el('th', {}, 'Title'), el('td', { colspan: 3 }, ed('project.name', { ph: 'Title of the lift' }))),
    el('tr', {}, el('th', {}, 'Reference'), el('td', {}, ed('project.liftId', { ph: 'Reference' })), el('th', {}, 'Revision / date'), el('td', {}, ed('project.revision', { ph: 'Rev.' }), ' — ', ed('project.date', { ph: 'Date' }))),
    el('tr', {}, el('th', {}, 'Vessel/Site'), el('td', {}, ed('project.site', { ph: 'Vessel / site' })), el('th', {}, 'Category'), el('td', {}, `${res?.category?.cat || '—'}`)),
    el('tr', {}, el('th', {}, 'Client'), el('td', { colspan: 3 }, ed('project.client', { ph: 'Client' }))),
    el('tr', {}, el('th', {}, 'Lift Location'), el('td', { colspan: 3 }, ed('project.location', { ph: 'Location of the lift' }))),
  ));
  if (!r || r.error) {
    add(el('div', { class: 'note fail' }, r?.error || 'Calculation not possible'));
    return rep;
  }

  // ---- Load / crane details
  const crane = p.crane;
  const ul = (arr) => el('ul', {}, arr.filter(Boolean).map((t) => el('li', {}, t)));
  const cc = res.checks.find((k) => k.cat === 'Crane' && k.util != null);
  // Crane #1 (calculated) then the other cranes, side by side
  const craneBlock = (c, P, n) => {
    const swl = n === 1 ? (cc ? cc.limit : null) : craneSwl(c);
    return el('div', { class: 'crane-b' }, el('b', {}, `Crane #${n}`, c.role ? ` (${c.role})` : '', ':'),
      ul([ed(`${P}name`, { ph: 'Crane' }), ed(`${P}configuration`, { ph: 'Boom, counterweight…' }),
        el('span', {}, 'Radius: ', ed(`${P}radius_m`, { num: true, ph: '—' }), ' m'),
        swl != null ? `SWL ${fmt(swl)} t${n === 1 && cc ? ` → ${(cc.util * 100).toFixed(0)} % used` : ''}` : null,
        n === 1 && res.chartRange ? `Load chart ${res.chartRange.rMin}–${res.chartRange.rMax} m` : null]));
  };
  const cranes = [craneBlock(crane, 'crane.', 1), ...(p.otherCranes || []).map((c, i) => craneBlock(c, `otherCranes.${i}.`, i + 2))];
  const w = p.weather || {};
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 3, class: 'sec' }, 'Load details/crane details', el('span', {}, ' (maximum hook load not to be exceeded)'))),
    el('tr', {},
      el('td', {}, el('b', {}, 'Load identification:'), ul([ed('load.name', { ph: 'Name of the load' }), el('span', {}, 'Overall ', ed('load.dims_mm.L', { num: true }), ' × ', ed('load.dims_mm.W', { num: true }), ' × ', ed('load.dims_mm.H', { num: true }), ' mm'), `${r.pts.length} lift point(s) ${r.pts.map((q) => q.id).join(', ')}`, p.rigging.type === 'spreader' ? `Spreader bar ${fmt(r.spreader.length)} m` : `Direct to hook, ${r.legs.length} legs`])),
      el('td', {}, el('b', {}, 'Centre of Gravity:'), el('div', { style: { margin: '4px 0' } },
        tk(() => ld.cogBasis === 'obvious', () => { ld.cogBasis = 'obvious'; }), ' Obvious  ',
        tk(() => ['estimated', 'geometric'].includes(ld.cogBasis), () => { ld.cogBasis = 'estimated'; }), ' Estimated  ',
        tk(() => ['drawing', 'legs', 'centred'].includes(ld.cogBasis) || !ld.cogBasis, () => { ld.cogBasis = 'drawing'; }), ' Drawing'),
        ld.cogBasis === 'centred'
          ? el('div', {}, 'Taken as centred — same force in every leg (lift plan of the engineering office)')
          : ld.cogBasis === 'legs'
          ? el('div', {}, `X ${fmt(ld.cog_mm?.x, 0)} · Y ${fmt(ld.cog_mm?.y, 0)}${ld.cogZUnknown ? '' : ` · Z ${fmt(ld.cog_mm?.z, 0)}`} mm — under the hook given by the leg lengths of the lift plan`)
          : el('div', {}, 'X ', ed('load.cog_mm.x', { num: true }), ' · Y ', ed('load.cog_mm.y', { num: true }), ' · Z ', ed('load.cog_mm.z', { num: true }), ' mm'),
        ld.cogBasis === 'geometric' ? el('div', {}, 'Geometric centre of the part (weight assumed evenly spread)') : null),
      el('td', {}, el('b', {}, 'Gross lift weight/maximum hook load:'), el('div', { style: { margin: '4px 0' } },
        tk(() => ld.weightBasis === 'actual', () => { ld.weightBasis = 'actual'; }), ' Actual  ',
        tk(() => ld.weightBasis !== 'actual', () => { ld.weightBasis = 'assessed'; }), ' Assessed'),
        ul([el('span', {}, 'Net weight ', ed('load.weight_t', { num: true }), ` t × WCF ${fmt(ld.wcf)} = ${fmt(r.W)} t`), `Rigging ${fmt(r.rigWeight)} t`, `Max hook load: ${fmt(res.shlCrane)} t static / ${fmt(res.dynamicHookLoad)} t dynamic`])),
    ),
    el('tr', {},
      el('td', { colspan: 2 }, el('div', { class: 'cranes' }, cranes), el('div', { class: 'env' }, `Environment: ${ENVIRONMENTS[p.environment]}`)),
      el('td', {}, el('b', {}, 'Design lift conditions (maximum):'), ul([
        el('span', {}, 'Wind speed: ', ed('weather.windMax_ms', { num: true, ph: '—' }), ' m/s (gusts ', ed('weather.windGust_ms', { num: true, ph: '—' }), ' m/s)'),
        el('span', {}, 'Hs: ', ed('weather.hsMax_m', { num: true, ph: '—' }), ' m'),
        el('span', {}, 'Visibility: ', ed('weather.visibility', { ph: '—' })),
        ed('weather.notes', { multi: true, ph: 'Other conditions' })])),
    ),
  ));

  // ---- Description
  add(el('table', { class: 'tb' }, el('tr', {}, el('th', { class: 'sec' }, 'Description of lifting')), el('tr', {}, el('td', {}, ed('project.description', { multi: true, ph: 'Describe the lift' })))));

  // ---- Safety measures
  const ms = p.safety?.measures || {};
  const third = Math.ceil(SAFETY_MEASURES.length / 3);
  const col = (k) => el('td', { class: 'small' }, SAFETY_MEASURES.slice(k * third, (k + 1) * third).map((m) => el('div', {}, tk(() => ms[m], (v) => { p.safety = p.safety || {}; p.safety.measures = p.safety.measures || {}; p.safety.measures[m] = v; }), ' ', m)));
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 3, class: 'sec' }, 'Possible safety measures to be considered', el('span', {}, ' (tick as applicable and detail in ‘step-by-step’)'))),
    el('tr', {}, col(0), col(1), col(2)),
  ));
  const fu = lines(p.safety?.further);
  add(el('table', { class: `tb ${fu.length ? '' : 'print-empty'}` }, el('tr', {}, el('th', { class: 'sec' }, 'Any further safety measures', el('span', {}, ' (as identified in the risk assessment; remember SIMOPs)'))), el('tr', {}, el('td', {}, ed('safety.further', { multi: true, ph: 'One measure per line' })))));
  const cm = p.safety?.comms || {};
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 2, class: 'sec' }, 'Communications')),
    el('tr', {},
      el('td', {}, el('b', {}, 'Communication available:'), el('div', {}, box(!!cm.primary), ' Primary (', ed('safety.comms.primary', { ph: '—' }), ')   ', box(!!cm.secondary), ' Secondary (', ed('safety.comms.secondary', { ph: '—' }), ')   ', box(!!cm.other), ' Other: ', ed('safety.comms.other', { ph: '—' }))),
      el('td', {}, el('b', {}, 'Communications checks:'), el('div', {}, tkp('safety.comms.primaryChecked'), ' Primary checked   ', tkp('safety.comms.secondaryChecked'), ' Secondary checked')),
    ),
  ));

  // ---- Lifting equipment
  add(el('table', { class: 'tb eq avoid-break' },
    el('tr', {}, el('th', { colspan: 5, class: 'sec' }, 'Lifting equipment and accessories to be used', el('span', {}, ' (specify type, SWL and configuration)'))),
    el('tr', { class: 'colh' }, ['Qty', 'Item', 'EWL', 'SWL', 'Configuration'].map((h) => el('td', {}, h))),
    res.bom.filter((b) => !b.unknown).map((b) => el('tr', {},
      el('td', { class: 'c' }, String(b.qty)),
      el('td', {}, b.name),
      el('td', { class: 'c' }, b.ewl_m != null ? `${fmt(b.ewl_m)} m${b.links ? ` (${b.links} links)` : ''}` : 'n/a'),
      el('td', { class: 'c' }, b.wll_t != null ? `${fmt(b.wll_t)} t` : '—'),
      el('td', {}, b.config || ''),
    )),
  ));

  // ---- Step-by-step
  const steps = (p.storyboard.steps = p.storyboard.steps || []);
  add(el('table', { class: 'tb steps' },
    el('tr', {}, el('th', { colspan: 2, class: 'sec' }, 'Step-by-step details of lifting operation'), el('th', { class: 'sec resp' }, 'Responsible')),
    steps.map((st, i) => el('tr', {},
      el('td', { class: 'c n' }, String(i + 1)),
      el('td', {}, ed(`storyboard.steps.${i}.note`, { multi: true, ph: 'Details of the step' }), act(el('button', { class: 'ed-del no-print', title: 'Delete the step' }, '✕'), () => steps.splice(i, 1))),
      el('td', { class: 'c' }, ed(`storyboard.steps.${i}.responsible`, { ph: 'Responsible' })))),
  ), act(el('button', { class: 'small no-print ed-add' }, '+ Add a step'), () => { steps.push({ note: '', responsible: '' }); setTimeout(() => { const all = document.querySelectorAll('#report-preview table.steps [data-ed].multi'); all[all.length - 1]?.focus(); }, 30); }));

  // ---- Drawings: windows that can be moved, widened, resized or removed (layout saved with the project)
  const sub = (t) => el('div', { class: 'sub-t' }, t);
  const wins = availableWins(p, res);
  const lay = layoutOf(p, wins);
  const content = {
    be: () => {
      const be = ld.bePlan;
      const svg = bePlanSvg(be, safeImg(be.image));
      const marked = (be.legs || []).some((l) => l.p);
      const comp = marked ? legCompositions(res) : null;
      return [sub(`Lift plan — engineering office${be.ref ? ` (${be.ref})` : ''}`),
        svg ? fig(svg, 'img-win be-plan') : el('div', { class: 'drawing img-win' }, el('img', { src: safeImg(be.image) || '', alt: '' })),
        comp?.groups.length ? el('div', { class: 'be-legend' },
          comp.groups.map((g) => el('div', {}, el('b', {}, `${g.ids.length > 1 ? 'Legs' : 'Leg'} ${g.ids.join(', ')}:`), ` ${g.text || '—'}`)),
          comp.head ? el('div', {}, el('b', {}, 'Hook:'), ` ${comp.head}`) : null) : null];
    },
    schem: () => { const sv = schematicSvg(p, res, { width: 760 })?.svg; return sv ? [sub('Rigging arrangement'), fig(sv, 'schem-r')] : null; },
    detail: () => { const sv = drawRiggingDetail(p, res, { height: 560 }); return sv ? [sub('Rigging detail (to scale)'), fig(sv, 'detail')] : null; },
    xy: () => [fig(staticViewSvg('xy', p, res, { width: 520, height: 300, title: 'Plan — XY' }))],
    xz: () => [fig(staticViewSvg('xz', p, res, { width: 520, height: 300, title: 'Front elevation — XZ' }))],
    yz: () => [fig(staticViewSvg('yz', p, res, { width: 520, height: 300, title: 'Side elevation — YZ' }))],
    padeye: () => { const { pq, sh, n } = wins.padeye; return [sub(`Padeye / shackle fit (point ${pq.id}${n > 1 ? ', same for similar points' : ''})`), fig(drawPadeyeFit(pq, sh, { width: 460, height: 230 }), 'pfit')]; },
    capacity: () => [sub('Crane capacity'), fig(drawCapacityChart(p, res, { width: 480, height: 250 }))],
  };
  const bodies = {};
  lay.order.forEach((k) => {
    const own = k.startsWith('own:') ? wins[k] : null;
    bodies[k] = own ? [own.caption ? sub(own.caption) : null, el('div', { class: 'drawing img-win' }, el('img', { src: safeImg(own.image) || '', alt: '' }))] : content[k]?.();
  });
  lay.order = lay.order.filter((k) => bodies[k]);
  const winEl = (k) => {
    const body = bodies[k];
    const L = lay.win[k];
    const w = el('div', { class: `win ${L.h ? 'sized' : ''}`, 'data-key': k }, winTools(k, lay), body, el('div', { class: 'win-grip no-print', title: 'Drag to resize (width and height)' }));
    const dr = w.querySelector('.drawing');
    if (dr && L.h) dr.style.height = `${L.h}mm`;
    w.querySelector('.win-grip').addEventListener('pointerdown', (ev) => resizeWin(ev, w, k));
    w.addEventListener('pointerdown', (ev) => dragWin(ev, w, k));
    return w;
  };
  packRows(lay).forEach((row, i) => {
    const sum = row.reduce((t, k) => t + lay.win[k].w, 0);
    const cols = row.map((k) => `${lay.win[k].w}fr`).join(' ') + (sum < 0.999 ? ` ${(1 - sum).toFixed(3)}fr` : '');
    const r = el('div', { class: 'figs-row', style: { gridTemplateColumns: cols } }, row.map(winEl));
    add(el('div', { class: 'avoid-break' }, i === 0 ? bar('Sketch detailing the rigging-up of the lifting equipment and lifting accessories') : null, r));
  });

  // ---- Calculation summary (concise)
  if (opts.calc) {
    const f = r.factors;
    add(el('div', { class: 'avoid-break' }, bar('Calculation summary'), el('table', { class: 'tb kvt' },
      el('tr', {}, el('th', {}, 'Design weight'), el('td', {}, `${fmt(r.W)} t`), el('th', {}, 'Rigging weight'), el('td', {}, `${fmt(r.rigWeight)} t`), el('th', {}, 'Static hook load'), el('td', {}, `${fmt(res.shlCrane)} t`)),
      el('tr', {}, el('th', {}, 'DAF'), el('td', {}, f.dafOn ? fmt(f.daf) : 'not applied'), el('th', {}, 'SKL · COG factor'), el('td', {}, `${fmt(f.skl)} · ${fmt(f.cog)}`), el('th', {}, 'Leg factor'), el('td', {}, fmt(r.fac, 3))),
      el('tr', {}, el('th', {}, 'Rig height'), el('td', {}, `${fmt(r.riggingHeight)} m above the lift points`), el('th', {}, 'Max crane util.'), el('td', {}, res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(0)} %` : '—'), el('th', {}, 'Est. tilt'), el('td', {}, r.tilt ? `${fmt(r.tilt.tilt_deg)}°` : '—')),
    )));
    add(el('div', { class: 'avoid-break' }, el('div', { class: 'sub-t' }, 'Leg forces and assemblies'), el('div', { class: 'legs-t' }, legsTable(res))));
    // no warnings in the report (they stay on the Checks page): only what fails, in plain text
    const shownChecks = res.checks.filter((c) => !c.hideInReport && c.status !== 'warn' && c.status !== 'info');
    const fails = shownChecks.filter((c) => c.status === 'fail');
    const list = opts.checksAll ? shownChecks : fails;
    const nOk = shownChecks.filter((c) => c.status === 'ok').length;
    add(el('div', { class: 'sub-t' }, opts.checksAll ? `Checks (${nOk} OK)` : fails.length ? `Checks not satisfied (${nOk} checks OK)` : `Checks — ${nOk} checks OK`),
      list.length ? reportChecks(list) : null);
  }

  // ---- Checklift + sign-off
  add(el('table', { class: 'tb avoid-break' },
    el('tr', {}, el('th', { class: 'sec' }, 'Performing the lift: Checklift')),
    el('tr', {}, el('td', { class: 'cols2' }, CHECKLIFT.map((t) => el('div', {}, `→ ${t}`)))),
  ));
  const who = [['Prepared by', 'preparedBy'], ['Checked by', 'checkedBy'], ['Approved by', 'approvedBy']];
  add(el('table', { class: 'tb signoff avoid-break' },
    el('colgroup', {}, el('col', { class: 'h' }), who.map(() => el('col', {}))),
    el('tr', {}, el('th', { class: 'sec' }, ''), who.map(([t]) => el('th', { class: 'sec' }, t))),
    el('tr', {}, el('th', {}, 'Name'), who.map(([, k]) => el('td', {}, ed(`project.${k}`, { ph: 'Name' })))),
    el('tr', {}, el('th', {}, 'Date'), who.map(([, k]) => el('td', {}, ed(`signoff.${k}.date`, { ph: 'Date' })))),
    el('tr', { class: 'sig' }, el('th', {}, 'Signature'), who.map(([t, k]) => {
      const img = safeImg(p.signoff?.[k]?.signature);
      return el('td', { class: 'sig-cell', title: 'Click to sign', onclick: () => signFor(k, t) }, img ? el('img', { src: img, alt: '' }) : el('span', { class: 'no-print sig-hint' }, '✎ Click to sign'));
    })),
  ));
  return rep;
}

// ---------- the user's own drawings (half page of the report)
function ownDrawingsPanel() {
  const p = app.project;
  p.report = p.report || {};
  p.report.drawings = p.report.drawings || [];
  const list = el('div', { class: 'row', style: { gap: '10px' } });
  const inp = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'hide', onchange: async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const url = await shrink(f);
    if (!url) return alert('Unreadable image');
    p.report.drawings.push({ id: Math.random().toString(36).slice(2, 8), image: url, caption: f.name.replace(/\.[a-z0-9]+$/i, '') });
    app.recompute();
    draw();
  } });
  const draw = () => {
    list.innerHTML = '';
    p.report.drawings.forEach((d, i) => list.append(el('div', { class: 'own-thumb' },
      el('img', { src: safeImg(d.image) || '', alt: '' }),
      el('input', { type: 'text', value: d.caption || '', placeholder: 'Caption', onchange: (e) => { d.caption = e.target.value; app.recompute(); } }),
      el('button', { class: 'small danger', onclick: () => { p.report.drawings.splice(i, 1); app.recompute(); draw(); } }, '✕'))));
  };
  draw();
  return el('div', { class: 'panel no-print', style: { marginBottom: '12px' } },
    el('div', { class: 'panel-head' }, el('h2', {}, 'My drawings in the report'),
      el('button', { class: 'small primary', onclick: () => inp.click() }, '+ Add a drawing (PNG / JPG)'), inp),
    el('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 6px' } }, 'Your drawings come after the other drawings, the whole page width: move or resize them in the preview. A PDF page can be added as a screenshot (PNG).'),
    list);
}

/** Reads an image and reduces it to 1600 px max (keeps the project file small). */
function shrink(file) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      im.onerror = () => resolve(null);
      im.src = fr.result;
    };
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(file);
  });
}

/** Checks in the report, plain (no colour badges). */
function reportChecks(list) {
  const word = { ok: 'OK', fail: 'NOT OK' };
  return el('table', { class: 'tb rchecks' },
    el('tr', { class: 'colh' }, ['Item', 'Check', 'Value', 'Limit', 'Result'].map((h) => el('td', {}, h))),
    list.map((c) => el('tr', {},
      el('td', {}, c.item || ''), el('td', {}, c.label || ''),
      el('td', { class: 'c' }, c.value != null ? `${fmt(c.value)} ${c.unit || ''}` : ''),
      el('td', { class: 'c' }, c.limit != null ? `${fmt(c.limit)} ${c.unit || ''}` : ''),
      el('td', { class: 'c' }, el('b', {}, word[c.status] || '')))));
}

// ---------- sign-off: names, dates and signatures (drawn), also editable in the report
function signFor(k, role) {
  const p = app.project;
  const who = p.project?.[k] || '';
  openSignPad(`${role}${who ? ` — ${who}` : ''}`, (url) => {
    p.signoff = p.signoff || {};
    p.signoff[k] = { ...(p.signoff[k] || {}), signature: url };
    if (url && !p.signoff[k].date) p.signoff[k].date = new Date().toISOString().slice(0, 10);
    app.recompute();
    window.__rerender?.();
  });
}

function signoffPanel() {
  const p = app.project;
  p.signoff = p.signoff || {};
  const roles = [['Prepared by', 'preparedBy'], ['Checked by', 'checkedBy'], ['Approved by', 'approvedBy']];
  const col = ([t, k]) => {
    const so = (p.signoff[k] = p.signoff[k] || {});
    const img = safeImg(so.signature);
    return el('div', { class: 'sign-col' },
      el('b', {}, t),
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Name'), el('input', { type: 'text', value: p.project[k] || '', placeholder: 'Name', onchange: (e) => { p.project[k] = e.target.value; app.recompute(); } })),
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Date'), el('input', { type: 'text', value: so.date || '', placeholder: 'e.g. 2026-11-21', onchange: (e) => { so.date = e.target.value; app.recompute(); } })),
      el('div', { class: 'sign-prev' }, img ? el('img', { src: img, alt: '' }) : el('span', { class: 'muted' }, 'No signature')),
      el('div', { class: 'row' },
        el('button', { class: 'small primary', onclick: () => signFor(k, t) }, img ? 'Sign again' : '✎ Draw the signature'),
        img ? el('button', { class: 'small danger', onclick: () => { so.signature = null; app.recompute(); window.__rerender?.(); } }, 'Remove') : null));
  };
  return el('div', { id: 'signoff-panel', class: 'panel no-print', style: { marginBottom: '12px' } },
    el('div', { class: 'panel-head' }, el('h2', {}, 'Sign-off'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Names, dates and signatures printed at the end of the lift plan (also editable in the report). Signatures stay in the project file.')),
    el('div', { class: 'sign-grid' }, roles.map(col)));
}
