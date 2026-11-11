// Rigging page: configuration, leg assembly builder (drag & drop from the catalogue), views of
// the object with the rigging, per-leg lengths and minimum WLL.
import { app } from '../app.js';
import { el, field, panel, fmt, utilBar, toast } from '../dom.js';
import { listByType, listSlingFamily, listChainFamily } from '../../catalog/index.js';
import { SLING_FAMILIES, SHACKLE_RANGES, DEFAULT_SHACKLE_RANGES, CHAIN_FAMILIES } from '../../catalog/data.js';
import { DEFAULT_ASSEMBLY, DEFAULT_ASSEMBLY_TOP, PART_KINDS, isLengthPart } from '../../engine/rigging.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { figure } from '../figure.js';
import { loadView } from '../loadview.js';

const COL = { shackle: '#7d8996', sling: '#2a5db0', chain: '#4a5562', connlink: '#9b5a1d', glink: '#7b3fb0' };
const PALETTE = [
  {
    group: 'Shackles (bolt type)',
    items: [
      { kind: 'shackle', label: 'Bow shackle — auto range' },
      { kind: 'shackle', family: 'G-4163', label: 'Green Pin G-4163 standard' },
      { kind: 'shackle', family: 'G-5263', label: 'Green Pin G-5263 Super' },
      { kind: 'shackle', family: 'P-6036', label: 'Green Pin P-6036 heavy duty' },
      { kind: 'shackle', family: 'WIDE', label: 'Green Pin Wide Body' },
    ],
  },
  {
    group: 'Slings',
    items: [
      { kind: 'sling', family: 'RS-PES', hitch: 'direct', label: 'Roundsling polyester' },
      { kind: 'sling', family: 'RS-PES', hitch: 'choke', label: 'Roundsling choked on the load' },
      { kind: 'sling', family: 'RS-UHMWPE', hitch: 'direct', label: 'Roundsling UHMWPE' },
      { kind: 'sling', family: 'WIRE', hitch: 'direct', label: 'Wire rope sling' },
      { kind: 'sling', family: 'WIRE-ENDLESS', hitch: 'direct', label: 'Endless wire sling' },
      { kind: 'sling', family: 'GROMMET', hitch: 'direct', label: 'Grommet' },
      { kind: 'sling', family: 'WEB', hitch: 'direct', label: 'Webbing sling' },
    ],
  },
  {
    group: 'Chain',
    items: [
      { kind: 'chain', family: 'CH-G80', hitch: 'direct', label: 'Chain grade 80' },
      { kind: 'chain', family: 'CH-G100', hitch: 'direct', label: 'Chain grade 100' },
    ],
  },
  {
    group: 'Connectors',
    items: [
      { kind: 'connlink', family: 'CL-G80', label: 'Connecting link G80 (chain)' },
      { kind: 'connlink', family: 'CL-G100', label: 'Connecting link G100 (chain)' },
      { kind: 'glink', label: 'Slingmax G-Link (roundsling)' },
    ],
  },
];

let activeTab = 'main'; // 'main' | 'top' | leg key
let views = [];

const label = (i) => `${i.user ? '★ ' : ''}${i.short || i.name}${i.certNo ? ` — ${i.certNo}` : ''}`;

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

/** Array being edited for the active tab (created from the default when a leg is customised). */
function editedAssembly(create = false) {
  const rig = app.project.rigging;
  if (activeTab === 'main') return (rig.assembly = rig.assembly?.length ? rig.assembly : JSON.parse(JSON.stringify(DEFAULT_ASSEMBLY)));
  if (activeTab === 'top') return (rig.assemblyTop = rig.assemblyTop?.length ? rig.assemblyTop : JSON.parse(JSON.stringify(DEFAULT_ASSEMBLY_TOP)));
  rig.legs = rig.legs || {};
  const own = rig.legs[activeTab]?.parts;
  if (own?.length) return own;
  if (!create) return null;
  const def = ['TA', 'TB'].includes(activeTab) ? rig.assemblyTop || DEFAULT_ASSEMBLY_TOP : rig.assembly || DEFAULT_ASSEMBLY;
  rig.legs[activeTab] = { ...(rig.legs[activeTab] || {}), parts: JSON.parse(JSON.stringify(def)) };
  return rig.legs[activeTab].parts;
}

export function render(root) {
  const R = 'rigging.';
  const rig = app.project.rigging;
  const isSp = rig.type === 'spreader';
  app.project.rules = app.project.rules || {};
  const ranges = app.project.rules.shackleRanges || DEFAULT_SHACKLE_RANGES;
  rig.head = rig.head || { type: 'masterlink', itemId: 'auto' };
  const rules = app.result?.rules || {};

  const config = panel(
    'Configuration',
    el('div', { class: 'fields' },
      field({ label: 'Rigging type', path: `${R}type`, type: 'select', options: [['hook', 'Direct to hook (converging legs)'], ['spreader', 'Spreader bar']], onchange: () => { activeTab = 'main'; window.__rerender(); } }),
      field({ label: 'On the crane hook', path: `${R}head.type`, type: 'select', options: [['masterlink', 'Master link'], ['assembly', 'Master link + sub-links (quad assembly)'], ['hook', 'Legs directly on the hook']], onchange: () => window.__rerender() }),
      rig.head.type !== 'hook' ? field({ label: 'Master link', path: `${R}head.itemId`, type: 'select', options: [['auto', 'Auto (selection)'], ...listByType('masterlink').filter((m) => (rig.head.type === 'assembly' ? true : !m.sub)).map((i) => [i.id, label(i)])] }) : null,
      rig.head.type !== 'hook' ? field({ label: 'Shackle hook ↔ master link', path: `${R}head.topShackle`, type: 'checkbox', onchange: () => window.__rerender() }) : null,
      rig.head.topShackle && rig.head.type !== 'hook' ? field({ label: 'Top shackle', path: `${R}head.topShackleId`, type: 'select', options: [['auto', 'Auto (selection)'], ...listByType('shackle').map((i) => [i.id, label(i)])] }) : null,
    ),
    el('h3', {}, 'Leg length design'),
    el('div', { class: 'fields' },
      field({ label: 'Criterion', path: `${R}design.mode`, type: 'select', options: [['angle', 'Target angle to the vertical'], ['height', 'Imposed hook height']], onchange: () => window.__rerender() }),
      rig.design?.mode === 'height'
        ? field({ label: 'Hook height above the lift points', path: `${R}design.hookHeight_m`, unit: 'm' })
        : field({ label: isSp ? 'Target angle of the top legs to vertical' : 'Target leg angle to vertical', path: `${R}design.targetAngleV_deg`, unit: '°', hint: `${rules.targetAngleV_deg ?? 30}° recommended, ${rules.maxAngleV_deg ?? 45}° max (Settings)` }),
      field({ label: 'Sling lengths', path: `${R}design.roundLengths`, type: 'select', options: [['set', 'Matched set (standard, rounded up)'], ['nearest', 'Nearest standard length'], ['up', 'Standard length rounded up'], ['exact', 'Made to measure (exact)']], hint: 'Chains: whole number of links' }),
      field({ label: 'Same size on every leg', path: `${R}design.uniformLegs`, type: 'select', options: [['true', 'Yes — sized on the most loaded leg'], ['false', 'No — each leg sized on its own force']], onchange: (v) => { app.project.rigging.design.uniformLegs = v === 'true'; app.recompute(); } }),
    ),
    el('details', { class: 'sub' },
      el('summary', {}, 'Shackle ranges used by "auto"'),
      el('div', { class: 'row', style: { gap: '14px' } },
        Object.entries(SHACKLE_RANGES).map(([k, v]) =>
          el('label', { class: 'check', style: { fontSize: '13px' } },
            el('input', {
              type: 'checkbox', checked: ranges.includes(k),
              onchange: (e) => {
                const cur = new Set(app.project.rules.shackleRanges || DEFAULT_SHACKLE_RANGES);
                if (e.target.checked) cur.add(k);
                else cur.delete(k);
                app.project.rules.shackleRanges = [...cur];
                app.recompute();
              },
            }), v)),
      ),
    ),
  );
  if (rig.design && rig.design.uniformLegs == null) rig.design.uniformLegs = true;

  let spreader = null;
  if (isSp) {
    const S = `${R}spreader.`;
    spreader = panel(
      'Spreader bar',
      el('div', { class: 'fields' },
        field({ label: 'Description', path: `${S}name`, type: 'text' }),
        field({ label: 'Certificate no.', path: `${S}certNo`, type: 'text' }),
        field({ label: 'Lug spacing', path: `${S}length_m`, unit: 'm' }),
        field({ label: 'Bottom lug → top lug height', path: `${S}depth_m`, unit: 'm' }),
        field({ label: 'Weight', path: `${S}weight_t`, unit: 't' }),
        field({ label: 'WLL', path: `${S}wll_t`, unit: 't' }),
        field({ label: 'Spreader axis', path: `${S}axis`, type: 'select', options: [['x', 'Along X (length)'], ['y', 'Along Y (width)']] }),
        field({ label: 'Position', path: `${S}position`, type: 'select', options: [['points', 'Centred on the lift points'], ['cog', 'Centred on the COG']] }),
        field({ label: 'Min top leg angle to horizontal (certificate)', path: `${S}minTopAngle_deg`, unit: '°' }),
        field({ label: 'Target bottom leg angle to vertical', path: `${S}bottomTargetAngleV_deg`, unit: '°' }),
        field({ label: 'Min height under the spreader', path: `${S}minBottomHeight_m`, unit: 'm' }),
        field({ label: 'Top lug: hole Ø', path: `${S}topLugHoleDia_mm`, unit: 'mm' }),
        field({ label: 'Top lug: thickness', path: `${S}topLugThk_mm`, unit: 'mm' }),
        field({ label: 'Bottom lug: hole Ø', path: `${S}bottomLugHoleDia_mm`, unit: 'mm' }),
        field({ label: 'Bottom lug: thickness', path: `${S}bottomLugThk_mm`, unit: 'mm' }),
      ),
    );
  }

  // ---------- assembly builder
  const builder = panel(
    null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Leg assembly — from the load to the hook'),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Drag items from the catalogue into the leg (or click them to add on the hook side). Drag a part to move it.'),
    ),
    el('div', { class: 'grid', style: { gridTemplateColumns: '260px minmax(0,1fr)', gap: '14px' } },
      paletteEl(),
      el('div', {}, el('div', { class: 'leg-tabs', id: 'leg-tabs' }), el('div', { id: 'strip-box' }), el('div', { id: 'asm-summary', style: { marginTop: '8px' } })),
    ),
  );

  views = [loadView('xy', { editable: true, height: 360 }), loadView('xz', { editable: true, height: 360 })];
  const pv = panel(null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Object and rigging'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Drag the lift points / COG here or on the Load page — lengths and forces update live.')),
    el('div', { class: 'grid g3', style: { gridTemplateColumns: 'repeat(3, minmax(0,1fr))' } }, ...views, el('div', { id: 'rig-iso' })),
  );
  const legs = panel(null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Legs — required length and minimum WLL'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Min WLL = design force of the leg (incl. DAF, SKL, COG factor); for the sling / chain also ≥ load / K (EN mode factor).')),
    el('div', { id: 'legs-table', class: 'tbl-wrap' }),
  );

  root.append(
    el('div', { class: 'grid g2' }, config, spreader || el('div', { id: 'factors-mini' })),
    builder,
    pv,
    legs,
  );
  renderTabs();
  renderStrip();
  update(app.result);
  root._update = update;
}

function paletteEl() {
  const box = el('div', { class: 'palette' });
  for (const g of PALETTE) {
    const grp = el('div', { class: 'pgroup' }, el('b', {}, g.group));
    for (const it of g.items) {
      const chip = el('span', { class: 'chip', draggable: 'true', title: 'Drag into the leg, or click to add on the hook side' }, el('i', { style: { background: COL[it.kind] } }), it.label);
      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ add: it }));
        e.dataTransfer.effectAllowed = 'copy';
        setTimeout(() => document.querySelector('.strip')?.classList.add('dragging'), 0);
      });
      chip.addEventListener('dragend', () => document.querySelector('.strip')?.classList.remove('dragging'));
      chip.addEventListener('click', () => insertPart(it, null));
      grp.append(chip);
    }
    box.append(grp);
  }
  box.append(el('p', { class: 'muted', style: { fontSize: '11.5px' } }, 'Catalogue: DS Levage 2025 + your inventory (★). "Auto" picks the smallest suitable size.'));
  return box;
}

function renderTabs() {
  const box = document.getElementById('leg-tabs');
  if (!box) return;
  box.innerHTML = '';
  const rig = app.project.rigging;
  const isSp = rig.type === 'spreader';
  const keys = (app.project.load.liftPoints || []).filter((p) => p.used !== false).map((p) => p.id);
  const tab = (id, txt) => el('button', { class: `small ${activeTab === id ? 'active' : ''}`, onclick: () => { activeTab = id; renderTabs(); renderStrip(); updateSummary(app.result); } }, txt);
  box.append(tab('main', isSp ? 'Bottom legs (default)' : 'All legs (default)'));
  if (isSp) box.append(tab('top', 'Top legs (default)'));
  keys.forEach((k) => box.append(tab(k, `${isSp ? 'Bottom' : 'Leg'} ${k}${rig.legs?.[k]?.parts?.length ? ' ✎' : ''}`)));
  if (isSp) ['TA', 'TB'].forEach((k) => box.append(tab(k, `Top ${k.slice(1)}${rig.legs?.[k]?.parts?.length ? ' ✎' : ''}`)));
}

/** Result leg shown for the active tab. */
function shownLeg(res) {
  const legs = res?.rig?.legs || [];
  if (!legs.length) return null;
  if (activeTab === 'main' || activeTab === 'top') {
    const rig = app.project.rigging;
    const lvl = activeTab === 'top' ? 'top' : rig.type === 'spreader' ? 'bottom' : 'main';
    const cand = legs.filter((l) => l.level === lvl && !rig.legs?.[l.key]?.parts?.length);
    return cand.sort((a, b) => b.Fdesign - a.Fdesign)[0] || null;
  }
  return legs.find((l) => l.key === activeTab) || null;
}

function renderStrip() {
  const box = document.getElementById('strip-box');
  if (!box) return;
  box.innerHTML = '';
  const rig = app.project.rigging;
  let parts = editedAssembly(false);
  const isLegTab = !['main', 'top'].includes(activeTab);
  if (isLegTab && !parts) {
    const def = ['TA', 'TB'].includes(activeTab) ? 'top legs' : rig.type === 'spreader' ? 'bottom legs' : 'all legs';
    box.append(el('div', { class: 'note' }, `This leg uses the default assembly (${def}). `,
      el('button', { class: 'small', onclick: () => { editedAssembly(true); app.recompute(); renderTabs(); renderStrip(); } }, 'Customise this leg')));
    parts = (['TA', 'TB'].includes(activeTab) ? rig.assemblyTop : rig.assembly) || DEFAULT_ASSEMBLY;
    box.append(stripEl(parts, true));
    return;
  }
  if (isLegTab)
    box.append(el('div', { class: 'row', style: { marginBottom: '6px' } }, el('span', { class: 'muted', style: { fontSize: '12px' } }, `Custom assembly for ${activeTab}.`),
      el('button', { class: 'small', onclick: () => { delete rig.legs[activeTab].parts; app.recompute(); renderTabs(); renderStrip(); } }, 'Back to the default')));
  box.append(stripEl(parts, false));
}

function stripEl(parts, readOnly) {
  const rig = app.project.rigging;
  const res = app.result;
  const leg = shownLeg(res);
  const strip = el('div', { class: 'strip' });
  const isTop = activeTab === 'top' || ['TA', 'TB'].includes(activeTab);
  const isBottomSp = rig.type === 'spreader' && !isTop;
  const loadEnd = isTop ? 'Spreader bar\ntop lug' : 'LOAD\n(lift point)';
  const hookEnd = isBottomSp ? 'Spreader bar\nbottom lug' : rig.head?.type === 'hook' ? 'CRANE HOOK' : rig.head?.type === 'assembly' ? 'Master link\n+ sub-links\n→ hook' : 'Master link\n→ hook';
  strip.append(el('div', { class: 'end' }, ...loadEnd.split('\n').map((t) => el('div', {}, t))));
  const slot = (i) => {
    const s = el('div', { class: 'slot' }, '+');
    if (readOnly) return s;
    s.addEventListener('dragover', (e) => { e.preventDefault(); s.classList.add('over'); });
    s.addEventListener('dragleave', () => s.classList.remove('over'));
    s.addEventListener('drop', (e) => {
      e.preventDefault();
      s.classList.remove('over');
      let d;
      try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (d.add) insertPart(d.add, i);
      else if (d.move != null) movePart(d.move, i);
    });
    return s;
  };
  strip.append(slot(0));
  parts.forEach((p, i) => {
    strip.append(partEl(p, i, leg?.parts?.[i], readOnly, leg));
    strip.append(slot(i + 1));
  });
  strip.append(el('div', { class: 'end' }, ...hookEnd.split('\n').map((t) => el('div', {}, t))));
  return strip;
}

function partEl(p, i, rp, readOnly, leg) {
  const items = itemsFor(p);
  const isLen = isLengthPart(p);
  const card = el('div', { class: `part ${p.kind === 'chain' ? 'chain' : isLen ? 'len' : ''} ${rp && !rp.item ? 'bad' : ''}`, draggable: readOnly ? null : 'true' });
  if (!readOnly) {
    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ move: i })); setTimeout(() => document.querySelector('.strip')?.classList.add('dragging'), 0); });
    card.addEventListener('dragend', () => document.querySelector('.strip')?.classList.remove('dragging'));
  }
  const commit = () => { app.recompute(); renderStrip(); };
  const title = p.kind === 'sling' ? SLING_FAMILIES[p.family || 'RS-PES']?.split(' — ')[0] || 'Sling' : p.kind === 'chain' ? CHAIN_FAMILIES[p.family || 'CH-G80']?.split(' (')[0] || 'Chain' : p.kind === 'shackle' ? (p.family ? SHACKLE_RANGES[p.family]?.split(',')[0] || p.family : 'Shackle (auto range)') : PART_KINDS[p.kind] + (p.family ? ` ${p.family.slice(3)}` : '');
  card.append(el('div', { class: 't' }, title), readOnly ? null : el('button', { class: 'x', title: 'Remove', onclick: () => { editedAssembly(true).splice(i, 1); commit(); } }, '✕'));
  if (!readOnly) {
    const sel = el('select', { onchange: (e) => { p.id = e.target.value; commit(); } });
    sel.append(el('option', { value: 'auto', selected: !p.id || p.id === 'auto' }, 'Auto size'));
    items.forEach((it) => sel.append(el('option', { value: it.id, selected: it.id === p.id }, label(it))));
    card.append(sel);
    if (p.kind === 'sling') {
      const fam = el('select', { onchange: (e) => { p.family = e.target.value; p.id = 'auto'; commit(); } });
      Object.entries(SLING_FAMILIES).forEach(([k, v]) => fam.append(el('option', { value: k, selected: (p.family || 'RS-PES') === k }, v.split(' — ')[0] + (v.includes('—') ? ` ${v.split('— ')[1]}` : ''))));
      card.append(fam);
    }
    if (p.kind === 'chain') {
      const fam = el('select', { onchange: (e) => { p.family = e.target.value; p.id = 'auto'; commit(); } });
      Object.entries(CHAIN_FAMILIES).forEach(([k, v]) => fam.append(el('option', { value: k, selected: (p.family || 'CH-G80') === k }, v)));
      card.append(fam);
    }
    if (isLen) {
      const h = el('select', { onchange: (e) => { p.hitch = e.target.value; commit(); } });
      [['direct', 'Straight (×1.0)'], ['choke', 'Choked (×0.8)']].forEach(([k, v]) => h.append(el('option', { value: k, selected: (p.hitch || 'direct') === k }, v)));
      card.append(h);
      if (p.hitch === 'choke')
        card.append(el('label', { class: 'r' }, 'Length in the choke (m) ', el('input', { type: 'number', step: 'any', value: p.wrap_m ?? '', onchange: (e) => { p.wrap_m = e.target.value === '' ? null : Number(e.target.value); commit(); } })));
      if (p.kind === 'sling')
        card.append(el('label', { class: 'r' }, el('input', { type: 'checkbox', checked: !!p.lock, style: { width: 'auto' }, onchange: (e) => { p.lock = e.target.checked; if (p.lock && !(p.length_m > 0)) p.length_m = rp?.length_m ?? null; commit(); } }), ' fixed EWL ',
          p.lock ? el('input', { type: 'number', step: 'any', value: p.length_m ?? '', style: { width: '60px' }, onchange: (e) => { p.length_m = Number(e.target.value) || null; commit(); } }) : null));
    }
  }
  // result of the calculation for this part
  if (rp) {
    if (!rp.item) card.append(el('div', { class: 'r', style: { color: 'var(--fail)' } }, 'No suitable item'));
    else {
      card.append(el('div', { class: 'r' }, el('b', {}, rp.item.short || rp.item.name), ` · WLL ${fmt(rp.item.wll_t * (rp.factor || 1))} t`));
      card.append(el('div', { class: 'r' }, `min WLL ${fmt(rp.reqWll)} t · ${leg ? `${Math.round((leg.Fdesign / (rp.item.wll_t * (rp.factor || 1))) * 100)} %` : ''}`));
      if (rp.kind === 'chain') card.append(el('div', { class: 'r' }, el('b', {}, `${rp.links} links = ${fmt(rp.length_m, 3)} m`), ` (overall ${fmt(rp.overall_m, 3)} m)`));
      if (rp.kind === 'sling') card.append(el('div', { class: 'r' }, el('b', {}, `EWL ${fmt(rp.length_m)} m`), ` (needed ${fmt(leg?.slingLengthReq)} m)`));
    }
  }
  return card;
}

function insertPart(it, index) {
  const parts = editedAssembly(true);
  if (!parts) return;
  const np = { kind: it.kind, id: 'auto' };
  if (it.family) np.family = it.family;
  if (it.hitch) np.hitch = it.hitch;
  if (isLengthPart(np) && parts.some(isLengthPart)) {
    // one length element per leg: replace the existing one
    const k = parts.findIndex(isLengthPart);
    parts.splice(k, 1, np);
    toast('One sling or chain per leg: the length element was replaced');
  } else if (index == null) parts.push(np);
  else parts.splice(index, 0, np);
  // a choked sling sits directly on the load
  if (np.hitch === 'choke' && np.kind === 'sling' && parts[0] !== np && parts[0]?.kind === 'shackle' && !['top', 'TA', 'TB'].includes(activeTab)) {
    parts.splice(parts.indexOf(np), 1);
    parts.splice(0, parts[0]?.kind === 'shackle' ? 1 : 0, np);
    toast('Choked sling placed directly on the load (the shackle on the load side was removed)');
  }
  app.recompute();
  renderTabs();
  renderStrip();
}

function movePart(from, to) {
  const parts = editedAssembly(true);
  const [p] = parts.splice(from, 1);
  parts.splice(to > from ? to - 1 : to, 0, p);
  app.recompute();
  renderStrip();
}

function updateSummary(res) {
  const box = document.getElementById('asm-summary');
  if (!box) return;
  box.innerHTML = '';
  const leg = shownLeg(res);
  if (!leg) return;
  const chainTxt = leg.parts.map((p) => (p.item ? p.item.short || p.item.name : `${p.kind}?`) + (p.kind === 'chain' ? ` × ${p.links} links` : p.kind === 'sling' ? ` ${fmt(p.length_m)} m` : '')).join(' → ');
  box.append(el('div', { class: 'note' },
    el('b', {}, `${leg.label}: `), `bearing-to-bearing length ${fmt(leg.Leff, 3)} m = connectors ${fmt(leg.hwLength, 3)} m + ${leg.lengthKind === 'chain' ? 'chain' : 'sling'} ${fmt(leg.slingLength, 3)} m${leg.wrap ? ` − choke ${fmt(leg.wrap)} m` : ''}. `,
    `Angle ${leg.angleV.toFixed(1)}° to vertical · design force ${fmt(leg.Fdesign)} t.`,
    el('div', { class: 'muted', style: { marginTop: '4px' } }, `Load → ${chainTxt} → ${leg.level === 'bottom' ? 'spreader' : 'hook'}`),
  ));
}

function update(res) {
  views.forEach((v) => v.refresh());
  const fm = document.getElementById('factors-mini');
  if (fm && res?.rig?.factors) {
    const f = res.rig.factors;
    fm.innerHTML = '';
    fm.append(panel('Design factors', el('div', { class: 'cards' },
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'DAF'), el('div', { class: 'v' }, f.dafOn ? fmt(f.daf) : 'off')),
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'SKL'), el('div', { class: 'v' }, fmt(f.skl))),
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'COG factor'), el('div', { class: 'v' }, fmt(f.cog))),
      el('div', { class: 'card' }, el('div', { class: 'k' }, 'Leg factor'), el('div', { class: 'v' }, fmt(res.rig.fac, 3))),
    ), el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Set on the Checks page (offshore / dynamic factor on or off, SKL, COG factor).')));
  }
  const iso = document.getElementById('rig-iso');
  if (iso) {
    iso.innerHTML = '';
    iso.append(figure(drawRiggingView(app.project, res, 'iso', { width: 520, height: 400 }), 'rigging-iso'));
  }
  // part results inside the strip (no inputs are rebuilt while typing elsewhere)
  if (!document.activeElement || !document.activeElement.closest?.('.strip')) renderStrip();
  updateSummary(res);
  const box = document.getElementById('legs-table');
  if (!box) return;
  box.innerHTML = '';
  const rig = res?.rig;
  if (!rig || rig.error) {
    box.append(el('div', { class: 'note fail' }, rig?.error || 'No result'));
    return;
  }
  const head = ['Leg', 'Angle to vertical', 'Design force = min WLL', 'Required length (bearing–bearing)', 'Connectors', 'Sling / chain', 'Assembly', 'Max util.'];
  const tb = el('tbody');
  for (const l of rig.legs) {
    const len = l.parts[l.li];
    const utilMax = Math.max(...l.parts.filter((p) => p.item).map((p) => l.Fdesign / (p.item.wll_t * (p.factor || 1))));
    const lim = rig.legs && res.rules ? res.rules.maxAngleV_deg : 45;
    tb.append(el('tr', {},
      el('td', {}, el('b', {}, l.label)),
      el('td', { class: 'num', style: { color: l.angleV > lim + 0.2 ? 'var(--fail)' : l.angleV > (res.rules?.targetAngleV_deg ?? 30) + 0.2 ? 'var(--warn)' : '' } }, `${l.angleV.toFixed(1)}°`),
      el('td', { class: 'num' }, `${fmt(l.Fdesign)} t${len?.reqWll > l.Fdesign + 1e-6 ? ` (sling/chain ≥ ${fmt(len.reqWll)} t)` : ''}`),
      el('td', { class: 'num' }, `${fmt(l.Leff, 3)} m`),
      el('td', { class: 'num' }, `${fmt(l.hwLength, 3)} m`),
      el('td', {}, len?.item ? `${len.item.short || len.item.name} — ${len.kind === 'chain' ? `${len.links} links (${fmt(len.length_m, 3)} m)` : `EWL ${fmt(len.length_m)} m`}` : '—'),
      el('td', { style: { fontSize: '12px' } }, l.parts.map((p) => p.item?.short || p.item?.name || `${p.kind}?`).join(' → ')),
      el('td', {}, utilBar(utilMax)),
    ));
  }
  box.append(el('table', { class: 'data' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), tb));
  const h = rig.head;
  if (h)
    box.append(el('p', { class: 'muted', style: { fontSize: '12px' } },
      h.onHook ? `Legs directly on the crane hook (space taken ${fmt(h.fitWidth, 0)} mm).` : `Head: ${h.masterlink?.name || '—'}${h.useSub && !h.integrated ? ` + ${h.pairs.length} × ${h.subLink?.name}` : ''}${h.topShackle ? ` + ${h.topShackle.name}` : ''} — vertical design load ${fmt(rig.Fvert_design)} t. Rig height above the lift points ${fmt(rig.riggingHeight)} m.`));
}
