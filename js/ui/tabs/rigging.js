// Rigging page: visual schematic (hook → head → one leg per lift point) built by drag & drop of
// catalogue items, load share and lengths of every leg, 3D view.
import { app } from '../app.js';
import { el, field, panel, fmt, utilBar, toast } from '../dom.js';
import { listByType, listSlingFamily, listChainFamily, niceName } from '../../catalog/index.js';
import { SLING_FAMILIES, SHACKLE_RANGES, DEFAULT_SHACKLE_RANGES } from '../../catalog/data.js';
import { isLengthPart } from '../../engine/rigging.js';
import { schematicSvg, assemblyOf as asmOf, SCHEM_COL as COL } from '../../draw/schematic.js';
import { viewer3d } from '../viewer3d.js';
import { loadView, lvState } from '../loadview.js';

// one flat list: drag any item onto any "+" of a leg (hook items go on the hook)
const PALETTE = [
  { kind: 'shackle', label: 'Shackle' },
  { kind: 'sling', family: 'RS-PES', hitch: 'direct', label: 'Round sling' },
  { kind: 'sling', family: 'RS-PES', hitch: 'choke', label: 'Round sling, choked' },
  { kind: 'sling', family: 'WEB', hitch: 'direct', label: 'Flat webbing sling' },
  { kind: 'sling', family: 'WIRE', hitch: 'direct', label: 'Steel wire rope sling' },
  { kind: 'chain', family: 'CH-G80', hitch: 'direct', label: 'Chain G80' },
  { kind: 'connlink', family: 'CL-G80', label: 'Connecting link G80' },
  { kind: 'hook', label: 'Safety hook G80' },
  { kind: 'glink', label: 'G-Link' },
  { head: 'masterlink', label: 'Masterlink (on the hook)' },
  { head: 'assembly', label: 'Quad masterlink (on the hook)' },
  { head: 'hook', label: 'Legs directly on the hook' },
];

let linked = null; // true: a change on one leg is applied to every leg
let lastLeg = null; // last leg edited on its own
let pop = null;
let v3 = null;
let lviews = [];
let highlight = null;

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- data helpers
const assemblyOf = (key, level) => asmOf(app.project.rigging, key, level);
const hasOwnLegs = () => Object.values(app.project.rigging.legs || {}).some((l) => l?.parts?.length);
/** Array to edit when the user acts on leg `key` (all legs when linked). */
function editable(key, level) {
  const rig = app.project.rigging;
  if (linked) {
    if (rig.legs?.[key]?.parts) delete rig.legs[key].parts;
    return assemblyOf(key, level).parts;
  }
  rig.legs = rig.legs || {};
  if (!rig.legs[key]?.parts?.length) rig.legs[key] = { ...(rig.legs[key] || {}), parts: clone(assemblyOf(key, level).parts) };
  lastLeg = { key, level };
  return rig.legs[key].parts;
}

/** "Same assembly on every leg" ticked: every leg takes the assembly last edited. */
function linkLegs() {
  const rig = app.project.rigging;
  const src = lastLeg && rig.legs?.[lastLeg.key]?.parts?.length ? lastLeg : Object.entries(rig.legs || {}).map(([key, l]) => (l?.parts?.length ? { key, level: ['TA', 'TB'].includes(key) ? 'top' : 'main' } : null)).find(Boolean);
  if (src) {
    const parts = clone(rig.legs[src.key].parts);
    if (src.level === 'top') rig.assemblyTop = parts;
    else rig.assembly = parts;
  }
  for (const l of Object.values(rig.legs || {})) if (l) delete l.parts;
  lastLeg = null;
  app.recompute();
  toast(src ? `Every leg now uses the assembly of leg ${src.key}` : 'Every leg uses the same assembly');
}

function itemsFor(part) {
  switch (part.kind) {
    case 'shackle': return listByType('shackle');
    case 'sling': return listSlingFamily(part.family || 'RS-PES');
    case 'chain': return listChainFamily(part.family || 'CH-G80');
    case 'connlink': return listByType('connlink');
    case 'glink': return listByType('glink');
    case 'hook': return listByType('hook');
    default: return [];
  }
}

function insert(key, level, it, index) {
  const rig = app.project.rigging;
  if (it.head) {
    rig.head = rig.head || {};
    rig.head.type = it.head;
    rig.head.itemId = 'auto';
    app.recompute();
    return;
  }
  const parts = editable(key, level);
  const np = { kind: it.kind, id: 'auto' };
  if (it.family) np.family = it.family;
  if (it.hitch) np.hitch = it.hitch;
  // placed exactly where it was dropped (index 0 = on the lift point)
  parts.splice(index ?? parts.length, 0, np);
  if (isLengthPart(np) && parts.filter(isLengthPart).length > 1) toast('Two slings / chains in this leg: the first one is sized, set the length of the other one (click it)');
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

  if (linked == null) linked = !hasOwnLegs();
  lvState.mode = 'select';
  lvState.tool = null;
  const palette = el('div', { class: 'palette flat' });
  PALETTE.forEach((it) => {
    const chip = el('span', { class: 'chip', draggable: 'true', title: it.head ? 'Drag onto the crane hook' : 'Drag onto any "+" of a leg' }, el('i', { style: { background: COL[it.kind] || COL.head } }), it.label);
    chip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ add: it })); e.dataTransfer.effectAllowed = 'copy'; });
    palette.append(chip);
  });
  const schemPanel = panel(null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Rigging arrangement'),
      el('label', { class: 'check', title: 'When ticked, a change on one leg is applied to every leg' }, el('input', { type: 'checkbox', checked: linked, onchange: (e) => { linked = e.target.checked; if (linked) linkLegs(); else drawSchematic(); } }), 'Same assembly on every leg'),
    ),
    palette,
    el('p', { class: 'muted', style: { fontSize: '11.5px', margin: '4px 0 8px' } }, 'Drag any item onto any "+" of a leg: it is placed exactly there (the bottom "+" is on the lift point). Hook items go on the crane hook. Click an item of the schematic to change its size, type or length, or to remove it — "Auto" sizes it from the force of the leg. One leg is drawn for every lift point.'),
    el('div', { id: 'schem', class: 'schem' }),
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

function drawSchematic() {
  const box = document.getElementById('schem');
  if (!box) return;
  const { svg: markup, W, H, drops, empty } = schematicSvg(app.project, app.result, { width: box.clientWidth || 900, interactive: true, highlight });
  if (empty) {
    box.innerHTML = '<div class="note warn">No lift point yet: add them on the Load page.</div>';
    return;
  }
  box.innerHTML = markup;
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
    if (!d || d.level === 'head') return toast('Drop it on a "+" of a leg');
    insert(d.key, d.level, data.add, d.idx);
  });
  svg.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-pop]');
    if (g) openPop(g.dataset.pop, ev);
  });
}

/** Called from the Checks page: open the rigging page on the part to adjust. */
export function focus(ref) {
  highlight = ref?.head ? { head: true } : ref?.leg ? { leg: ref.leg, part: ref.part } : ref?.point ? { point: ref.point } : null;
  setTimeout(() => {
    drawSchematic();
    const box = document.getElementById('schem');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { highlight = null; }, 200);
  }, 60);
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
    const typ = el('select', { onchange: (e) => { proj.head.type = e.target.value; proj.head.itemId = 'auto'; done(); } });
    [['masterlink', 'Masterlink'], ['assembly', 'Quad masterlink (sub-links)'], ['hook', 'Directly on the hook']].forEach(([v, t]) => typ.append(el('option', { value: v, selected: proj.head.type === v }, t)));
    box.append(el('b', {}, 'On the crane hook'), typ);
    if (proj.head.type !== 'hook') {
      const sel = el('select', { onchange: (e) => { proj.head.itemId = e.target.value; done(); } });
      sel.append(el('option', { value: 'auto' }, 'Auto size'));
      listByType('masterlink').filter((m) => (proj.head.type === 'assembly' ? true : !m.sub)).forEach((m) => sel.append(el('option', { value: m.id, selected: m.id === proj.head.itemId }, niceName(m))));
      box.append(sel,
        el('label', { title: 'For a masterlink already on the crane hook whose SWL you do not have' }, el('input', { type: 'checkbox', checked: !!proj.head.unknownSWL, onchange: (e) => { proj.head.unknownSWL = e.target.checked; done(); } }), ' SWL not known (existing masterlink)'),
        el('div', { class: 'muted', style: { fontSize: '11px', maxWidth: '260px' } }, proj.head.unknownSWL ? 'Assumed suitable, not checked. The report only shows its shape. The size above is used for the geometry and the fit of the slings.' : 'Tick it for a masterlink already fitted on the hook whose SWL is not known: it is then assumed suitable and left out of the checks and of the equipment list.'));
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
    const kindName = { connlink: 'connecting link', glink: 'G-Link', hook: 'safety hook', sling: 'sling', chain: 'chain G80', shackle: 'shackle' }[cur.kind] || cur.kind;
    box.append(el('b', {}, `${linked ? 'All legs' : `Leg ${key}`} — ${kindName}`), sel);
    if (cur.kind === 'sling') {
      const fam = el('select', { onchange: (e) => { const t = target(); t.family = e.target.value; t.id = 'auto'; done(); } });
      Object.entries(SLING_FAMILIES).forEach(([k, v]) => fam.append(el('option', { value: k, selected: (cur.family || 'RS-PES') === k }, v)));
      box.append(fam);
    }
    if (isLengthPart(cur)) {
      const h = el('select', { onchange: (e) => { target().hitch = e.target.value; done(); } });
      [['direct', 'Straight (×1.0)'], ['choke', 'Choked (×0.8)']].forEach(([k, v]) => h.append(el('option', { value: k, selected: (cur.hitch || 'direct') === k }, v)));
      box.append(h);
      if (cur.hitch === 'choke') box.append(el('label', {}, 'Length taken by the choke (m) ', el('input', { type: 'number', step: 'any', value: cur.wrap_m ?? '', style: { width: '70px' }, onchange: (e) => { target().wrap_m = e.target.value === '' ? null : Number(e.target.value); done(); } })));
      box.append(el('label', {}, cur.kind === 'chain' ? 'Fixed length ' : 'Fixed EWL ', el('input', { type: 'number', step: 'any', value: cur.lock || cur.fixed ? cur.length_m ?? '' : '', placeholder: 'auto', style: { width: '70px' }, onchange: (e) => { const t = target(); t.length_m = Number(e.target.value) || null; t.lock = !!t.length_m; done(); } }), ' m'));
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
