import { app } from '../app.js';
import { el, field, panel, fmt, utilBar } from '../dom.js';
import { listByType, listSlingFamily, slingModeFactor, shackleSideLoadFactor, isSlingType } from '../../catalog/index.js';
import { SLING_FAMILIES, SHACKLE_RANGES, DEFAULT_SHACKLE_RANGES } from '../../catalog/data.js';
import { DAF_REFERENCE, SKL_REFERENCE } from '../../engine/factors.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { figure } from '../figure.js';

const label = (i) => `${i.user ? '★ ' : ''}${i.name}${i.certNo ? ` — ${i.certNo}` : ''}`;
const itemOptions = (type, filter = () => true) => [['auto', 'Auto (selection)'], ...listByType(type).filter(filter).map((i) => [i.id, label(i)])];
const slingOptions = (family) => [['auto', 'Auto (selection)'], ...listSlingFamily(family).map((i) => [i.id, label(i)])];

export function render(root) {
  const R = 'rigging.';
  const rig = app.project.rigging;
  const isSp = rig.type === 'spreader';
  app.project.rules = app.project.rules || {};
  const ranges = app.project.rules.shackleRanges || DEFAULT_SHACKLE_RANGES;

  const config = panel(
    'Configuration',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Rigging type', path: `${R}type`, type: 'select', options: [['hook', 'Direct to hook (converging legs)'], ['spreader', 'Spreader bar']], onchange: () => window.__rerender() }),
      field({ label: 'Default sling type', path: `${R}slingFamily`, type: 'select', options: Object.entries(SLING_FAMILIES), onchange: () => window.__rerender() }),
      field({ label: 'Rigging head', path: `${R}headType`, type: 'select', options: [['masterlink', 'Master link'], ['hook', 'Slings directly on the hook']], onchange: () => window.__rerender() }),
      rig.headType !== 'hook' ? field({ label: 'Master link', path: `${R}masterlink.itemId`, type: 'select', options: itemOptions('masterlink') }) : null,
      rig.headType !== 'hook' && !isSp ? field({ label: 'Sub-links (quad assembly)', path: `${R}masterlink.subLinks`, type: 'checkbox', onchange: () => window.__rerender() }) : null,
      rig.headType !== 'hook' && rig.masterlink?.subLinks && !isSp
        ? field({ label: 'Separate sub-link (if no assembly)', path: `${R}masterlink.subLinkItemId`, type: 'select', options: itemOptions('masterlink', (m) => !m.sub) })
        : null,
      field({ label: 'Top shackle (hook ↔ rigging)', path: `${R}topShackle.enabled`, type: 'checkbox', onchange: () => window.__rerender() }),
      rig.topShackle?.enabled ? field({ label: 'Top shackle', path: `${R}topShackle.itemId`, type: 'select', options: itemOptions('shackle') }) : null,
    ),
    el('h3', {}, 'Shackle ranges used by auto-selection'),
    el(
      'div',
      { class: 'row', style: { gap: '14px' } },
      Object.entries(SHACKLE_RANGES).map(([k, v]) =>
        el(
          'label',
          { class: 'check', style: { fontSize: '13px' } },
          el('input', {
            type: 'checkbox',
            checked: ranges.includes(k),
            onchange: (e) => {
              const cur = new Set(app.project.rules.shackleRanges || DEFAULT_SHACKLE_RANGES);
              if (e.target.checked) cur.add(k);
              else cur.delete(k);
              app.project.rules.shackleRanges = [...cur];
              app.recompute();
            },
          }),
          v,
        ),
      ),
    ),
    el('h3', {}, isSp ? 'Top sling design' : 'Length design'),
    el(
      'div',
      { class: 'fields' },
      !isSp ? field({ label: 'Criterion', path: `${R}design.mode`, type: 'select', options: [['angle', 'Target sling angle'], ['height', 'Imposed hook height']], onchange: () => window.__rerender() }) : null,
      rig.design?.mode === 'height' && !isSp
        ? field({ label: 'Hook height above padeyes', path: `${R}design.hookHeight_m`, unit: 'm' })
        : field({ label: 'Target angle to horizontal', path: `${R}design.targetAngle_deg`, unit: '°', hint: '60° recommended' }),
      field({
        label: 'Sling lengths',
        path: `${R}design.roundLengths`,
        type: 'select',
        options: [['set', 'Matched set (standard, rounded up)'], ['nearest', 'Nearest standard length'], ['up', 'Standard length rounded up'], ['exact', 'Made to measure (exact length)']],
      }),
    ),
  );

  const factors = panel(
    'Design factors',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'DAF', path: 'factors.dafMode', type: 'select', options: [['dnv', 'Auto — DNV-ST-N001 (in air)'], ['manual', 'Imposed value']], onchange: () => window.__rerender() }),
      app.project.factors.dafMode === 'manual' ? field({ label: 'Imposed DAF', path: 'factors.dafManual', unit: '×', step: 0.01 }) : null,
      field({ label: 'SKL (skew load factor)', path: 'factors.sklMode', type: 'select', options: [['auto', 'Auto (1.0 / 1.25 if ≥ 4 legs)'], ['manual', 'Imposed value']], onchange: () => window.__rerender() }),
      app.project.factors.sklMode === 'manual' ? field({ label: 'Imposed SKL', path: 'factors.sklManual', unit: '×', step: 0.01 }) : null,
      field({ label: 'COG factor', path: 'factors.cogFactor', unit: '×', step: 0.01, hint: 'If no COG envelope' }),
      field({ label: 'Other factor', path: 'factors.extraFactor', unit: '×', step: 0.01, hint: 'Yaw, tilt, consequence…' }),
    ),
    el('div', { id: 'factors-live', class: 'cards', style: { marginTop: '10px' } }),
    el('details', { style: { marginTop: '8px', fontSize: '12px' } }, el('summary', { class: 'muted' }, 'Factor references'), el('p', {}, DAF_REFERENCE), el('p', {}, SKL_REFERENCE)),
  );

  let spreader = null;
  if (isSp) {
    const S = `${R}spreader.`;
    spreader = panel(
      'Spreader bar',
      el(
        'div',
        { class: 'fields' },
        field({ label: 'Description', path: `${S}name`, type: 'text' }),
        field({ label: 'Certificate no.', path: `${S}certNo`, type: 'text' }),
        field({ label: 'Lug spacing', path: `${S}length_m`, unit: 'm' }),
        field({ label: 'Bottom lug → top lug height', path: `${S}depth_m`, unit: 'm' }),
        field({ label: 'Weight', path: `${S}weight_t`, unit: 't' }),
        field({ label: 'WLL', path: `${S}wll_t`, unit: 't' }),
        field({ label: 'Spreader axis', path: `${S}axis`, type: 'select', options: [['x', 'Along X (length)'], ['y', 'Along Y (width)']] }),
        field({ label: 'Position', path: `${S}position`, type: 'select', options: [['points', 'Centred on the lift points'], ['cog', 'Centred on the COG']] }),
        field({ label: 'Min top sling angle (certificate)', path: `${S}minTopAngle_deg`, unit: '°' }),
        field({ label: 'Target bottom sling angle', path: `${S}bottomTargetAngle_deg`, unit: '°' }),
        field({ label: 'Min height under spreader', path: `${S}minBottomHeight_m`, unit: 'm' }),
        field({ label: 'Top lug: hole Ø', path: `${S}topLugHoleDia_mm`, unit: 'mm' }),
        field({ label: 'Top lug: thickness', path: `${S}topLugThk_mm`, unit: 'mm' }),
        field({ label: 'Bottom lug: hole Ø', path: `${S}bottomLugHoleDia_mm`, unit: 'mm' }),
        field({ label: 'Bottom lug: thickness', path: `${S}bottomLugThk_mm`, unit: 'mm' }),
      ),
    );
  }

  const legs = panel(
    null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Rigging legs'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Leave "Auto" for automatic selection from the catalogue + your inventory (★).')),
    el('div', { id: 'legs-table', class: 'tbl-wrap' }),
  );
  const pv = panel(null, el('div', { id: 'rig-preview' }));
  root.append(
    el('div', { class: 'grid g-side' }, el('div', { class: 'grid' }, config, factors, spreader), el('div', { class: 'grid' }, pv)),
    el('div', { style: { marginTop: '14px' } }, legs),
  );
  update(app.result);
  root._update = update;
}

function legRow(leg) {
  const key = leg.key;
  const cfg = app.project.rigging.legs?.[key] || {};
  const ensure = () => {
    if (!app.project.rigging.legs) app.project.rigging.legs = {};
    if (!app.project.rigging.legs[key]) app.project.rigging.legs[key] = {};
    return app.project.rigging.legs[key];
  };
  const sel = (prop, options, val, after) => {
    const s = el('select', { onchange: (e) => { ensure()[prop] = e.target.value; after?.(); app.recompute(); } });
    options.forEach(([v, t]) => s.append(el('option', { value: v, selected: String(v) === String(val ?? 'auto') }, t)));
    return s;
  };
  const autoLabel = (item, cfgId) => (cfgId && cfgId !== 'auto' ? null : el('div', { class: 'muted', style: { fontSize: '11px' } }, item ? `→ ${item.short || item.name}` : '→ none'));
  const topKind = cfg.topConnector || leg.cfg.topConnector || 'direct';
  const family = leg.cfg.slingFamily;
  const lenInput = el('input', {
    type: 'number', step: '0.01', value: cfg.lockLength ? cfg.length_m ?? '' : '', placeholder: fmt(leg.slingLength),
    title: 'Enter a length to impose it (EWL, m)', style: { width: '70px' },
    onchange: (e) => { const c = ensure(); const v = e.target.value === '' ? null : Number(e.target.value); c.length_m = v; c.lockLength = v != null; app.recompute(); },
  });
  const sling = leg.comps.sling;
  const wllS = sling ? sling.wll_t * slingModeFactor(leg.cfg.mode) : null;
  const sh = leg.comps.bottomShackle;
  const wllSh = sh ? sh.wll_t * shackleSideLoadFactor(leg.beta || 0) : null;
  const utils = [wllS && leg.Fdesign / wllS, wllSh && leg.Fdesign / wllSh, leg.comps.topConn && leg.Fdesign / leg.comps.topConn.wll_t, leg.point?.swl_t && leg.Fdesign / leg.point.swl_t].filter((u) => u != null);
  const familyOpts = [['', `Default (${(SLING_FAMILIES[app.project.rigging.slingFamily] || '').split(' (')[0]})`], ...Object.entries(SLING_FAMILIES)];
  return el(
    'tr',
    {},
    el('td', {}, el('b', {}, leg.label)),
    el(
      'td',
      {},
      sel('slingFamily', familyOpts, cfg.slingFamily ?? '', () => { ensure().slingId = 'auto'; }),
      sel('slingId', slingOptions(family), cfg.slingId),
      autoLabel(sling, cfg.slingId),
    ),
    el('td', {}, sel('mode', [['direct', 'Straight'], ['choke', 'Choked']], cfg.mode || 'direct')),
    el('td', {}, el('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '4px' } }, lenInput, cfg.lockLength ? el('span', { title: 'Imposed length' }, '🔒') : null), el('div', { class: 'muted', style: { fontSize: '11px' } }, `required ${fmt(leg.slingLengthReq)} m`)),
    el('td', {}, sel('bottomShackleId', itemOptions('shackle'), cfg.bottomShackleId), autoLabel(sh, cfg.bottomShackleId)),
    el(
      'td',
      {},
      sel('topConnector', [['direct', 'Direct'], ['shackle', 'Shackle'], ['glink', 'G-Link']], topKind),
      topKind === 'shackle' ? sel('topConnectorId', itemOptions('shackle'), cfg.topConnectorId) : topKind === 'glink' ? sel('topConnectorId', itemOptions('glink'), cfg.topConnectorId) : null,
      topKind !== 'direct' ? autoLabel(leg.comps.topConn, cfg.topConnectorId) : null,
    ),
    el('td', { class: 'num' }, `${leg.angleH.toFixed(1)}°`),
    el('td', { class: 'num' }, fmt(leg.Tstatic)),
    el('td', { class: 'num' }, el('b', {}, fmt(leg.Fdesign))),
    el('td', {}, utilBar(utils.length ? Math.max(...utils) : null)),
  );
}

function update(res) {
  const box = document.getElementById('legs-table');
  const rig = res?.rig;
  if (box) {
    box.innerHTML = '';
    if (!rig || rig.error) box.append(el('div', { class: 'note fail' }, rig?.error || 'Calculation not possible'));
    else {
      const head = ['Leg', 'Sling', 'Hitch', 'EWL (m)', 'Bottom shackle', 'Top connection', 'Angle', 'Static T (t)', 'Design F (t)', 'Max util.'];
      box.append(el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), el('tbody', {}, rig.legs.map(legRow))));
    }
  }
  const fl = document.getElementById('factors-live');
  if (fl && rig && !rig.error) {
    const f = rig.factors;
    const c = (k, v, s) => el('div', { class: 'card' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v), s ? el('div', { class: 's' }, s) : null);
    fl.innerHTML = '';
    fl.append(
      ...[
        c('SHL', `${fmt(rig.shl)} t`, 'load + rigging'),
        c('DAF', fmt(f.daf), f.dafAuto ? 'DNV auto' : 'imposed'),
        c('SKL', fmt(f.skl), f.sklAuto ? 'auto' : 'imposed'),
        c('Leg factor', fmt(rig.fac, 3), 'DAF × SKL × COG × other'),
        c('Rigging height', `${fmt(rig.riggingHeight)} m`, 'padeyes → hook'),
        rig.tilt ? c('Attitude', `${fmt(rig.tilt.tilt_deg)}°`, 'estimated tilt') : null,
      ].filter(Boolean),
    );
  }
  const pv = document.getElementById('rig-preview');
  if (pv) {
    pv.innerHTML = '';
    pv.append(figure(drawRiggingView(app.project, res, 'iso', { width: 600, height: 470 }), 'rigging-iso'));
  }
}

export { isSlingType };
