import { app } from '../app.js';
import { el, panel, fmt, badge, utilBar, download, field } from '../dom.js';
import { DAF_REFERENCE, SKL_REFERENCE, ENVIRONMENTS } from '../../engine/factors.js';
import { niceName } from '../../catalog/index.js';

let filter = 'all';

export function render(root) {
  const f = app.project.factors;
  const factors = panel(
    null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Design factors'), el('div', { id: 'fac-live', class: 'row' })),
    el('div', { class: 'fields' },
      field({ label: 'Environment', path: 'environment', type: 'select', options: Object.entries(ENVIRONMENTS), onchange: () => app.recompute() }),
      field({ label: 'Apply the dynamic factor (DAF)', path: 'factors.applyDAF', type: 'checkbox', onchange: () => window.__rerender() }),
      f.applyDAF !== false ? field({ label: 'DAF', path: 'factors.dafMode', type: 'select', options: [['dnv', 'Auto — DNV-ST-N001 (in air, per environment)'], ['manual', 'Imposed value']], onchange: () => window.__rerender() }) : null,
      f.applyDAF !== false && f.dafMode === 'manual' ? field({ label: 'Imposed DAF', path: 'factors.dafManual', unit: '×', step: 0.01 }) : null,
      field({ label: 'SKL (skew load factor)', path: 'factors.sklMode', type: 'select', options: [['auto', 'Auto (1.0 / 1.25 if ≥ 4 legs)'], ['manual', 'Imposed value']], onchange: () => window.__rerender() }),
      f.sklMode === 'manual' ? field({ label: 'Imposed SKL', path: 'factors.sklManual', unit: '×', step: 0.01 }) : null,
      field({ label: 'COG factor', path: 'factors.cogFactor', unit: '×', step: 0.01, hint: 'If no COG envelope' }),
      field({ label: 'Other factor', path: 'factors.extraFactor', unit: '×', step: 0.01, hint: 'Yaw, tilt, consequence…' }),
      field({ label: 'EN mode factor check (K)', path: 'rules.enCheck', type: 'select', options: [['true', 'On — check and size the slings / chains'], ['false', 'Off']], onchange: (v) => { app.project.rules.enCheck = v !== 'false'; app.recompute(); } }),
    ),
    el('details', { class: 'sub' }, el('summary', {}, 'How the factors are applied'),
      el('p', { style: { fontSize: '12.5px' } }, 'Leg design force F = T(static, max over the COG envelope) × DAF × SKL × COG factor × other factor. Master link / head: vertical load × DAF × other factor (no SKL). Crane: static hook load (load × WCF + rigging) against the load chart — the dynamic factor is not applied to the crane, the chart already covers it for the declared mode (check the crane manual, offshore cranes use the sea-state chart).'),
      el('p', { style: { fontSize: '12.5px' } }, 'EN 13414-1 / EN 818-4 / EN 1492 standard method: rated WLL of a sling set = K × WLL of one leg, K = 1 (1 leg), 1.4 / 1.0 (2 legs, β ≤ 45° / 45–60°), 2.1 / 1.5 (3 or 4 legs). Above 60° to vertical: not allowed. It is checked as well as the leg-by-leg forces.'),
      el('p', { style: { fontSize: '12px' }, class: 'muted' }, DAF_REFERENCE), el('p', { style: { fontSize: '12px' }, class: 'muted' }, SKL_REFERENCE)),
  );
  if (app.project.rules && app.project.rules.enCheck == null) app.project.rules.enCheck = true;
  root.append(factors, el('div', { id: 'res-root', class: 'grid' }));
  update(app.result);
  root._update = update;
}

export function summaryCards(res) {
  const r = res.rig;
  const c = (k, v, s) => el('div', { class: 'card' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v), s ? el('div', { class: 's' }, s) : null);
  return el(
    'div',
    { class: 'cards' },
    c('Net weight', `${fmt(app.project.load.weight_t)} t`, `WCF ${fmt(app.project.load.wcf)}`),
    c('Design weight', `${fmt(r.W)} t`),
    c('Rigging weight', `${fmt(r.rigWeight)} t`, r.spreader ? 'spreader bar included' : ''),
    c('Static hook load', `${fmt(res.shlStatic)} t`, 'load + rigging'),
    c('Crane load', `${fmt(res.shlCrane)} t`, 'against the load chart'),
    c('Dynamic hook load', `${fmt(res.dynamicHookLoad)} t`, r.factors.dafOn ? `DAF ${fmt(r.factors.daf)}` : 'DAF off'),
    c('Leg load factor', fmt(r.fac, 3), `DAF ${fmt(r.factors.daf)} · SKL ${fmt(r.factors.skl)}`),
    c('Max crane utilisation', res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(1)} %` : '—'),
    c('Rigging height', `${fmt(r.riggingHeight)} m`, 'padeyes → hook'),
    r.tilt ? c('Estimated tilt', `${fmt(r.tilt.tilt_deg)}°`) : null,
  );
}

export function checksTable(checks, { compact = false, nav = false } = {}) {
  const groups = {};
  checks.forEach((c) => (groups[c.cat] = groups[c.cat] || []).push(c));
  const tb = el('tbody');
  for (const [cat, list] of Object.entries(groups)) {
    tb.append(el('tr', { class: 'group' }, el('td', { colspan: nav ? 7 : 6 }, cat)));
    for (const c of list) {
      const go = nav && c.ref ? () => window.__goto?.(c.ref) : null;
      tb.append(
        el(
          'tr',
          go ? { class: 'clk-row', title: 'Click to go to the item to adjust', onclick: go } : {},
          el('td', {}, badge(c.status)),
          el('td', {}, c.item),
          el('td', {}, c.label, c.note ? el('div', { class: 'muted', style: { fontSize: '11px' } }, c.note) : null),
          el('td', { class: 'num' }, c.value != null ? `${fmt(c.value)} ${c.unit || ''}` : ''),
          el('td', { class: 'num' }, c.limit != null ? `${fmt(c.limit)} ${c.unit || ''}` : ''),
          el('td', {}, c.util != null ? utilBar(c.util) : ''),
          nav ? el('td', {}, go ? el('button', { class: `small ${c.status === 'fail' || c.status === 'warn' ? 'primary' : ''}`, onclick: (e) => { e.stopPropagation(); go(); } }, { rigging: 'Rigging →', load: 'Load →', crane: 'Crane →' }[c.ref.tab] || 'Go →') : '') : null,
        ),
      );
    }
  }
  const heads = ['Status', 'Item', 'Check', 'Value', 'Limit', 'Utilisation', ...(nav ? [''] : [])];
  return el('table', { class: `data ${compact ? 'compact' : ''}` }, el('thead', {}, el('tr', {}, heads.map((h) => el('th', {}, h)))), tb);
}

const nm = (i) => niceName(i);

export function legsTable(res) {
  const rig = res.rig;
  return el(
    'table',
    { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['Leg', 'Point', 'Eff. length (m)', 'Sling / chain', 'Angle to vert.', 'Vert. R (t)', 'Static T (t)', 'Design F (t)', 'Assembly (load → hook)'].map((h) => el('th', {}, h)))),
    el('tbody', {},
      rig.legs.map((l) => {
        const len = l.parts[l.li];
        return el('tr', {},
          el('td', {}, el('b', {}, l.label)),
          el('td', {}, l.pointId || (l.level === 'top' ? 'Spreader' : '')),
          el('td', { class: 'num' }, fmt(l.Leff, 3)),
          el('td', {}, len?.item ? `${len.kind === 'chain' ? `${len.links} links` : `EWL ${fmt(len.length_m)} m`}` : '—'),
          el('td', { class: 'num' }, `${l.angleV.toFixed(1)}°`),
          el('td', { class: 'num' }, fmt(l.R)),
          el('td', { class: 'num' }, fmt(l.Tstatic)),
          el('td', { class: 'num' }, el('b', {}, fmt(l.Fdesign))),
          el('td', { style: { fontSize: '12px' } }, l.parts.map((p) => nm(p.item)).join(' → ')),
        );
      }),
    ),
  );
}

export function bomTable(res, { hideUnknown = false } = {}) {
  const bom = hideUnknown ? res.bom.filter((b) => !b.unknown) : res.bom;
  const tot = bom.reduce((s, b) => s + b.qty * b.unitWeight_t, 0);
  return el(
    'table',
    { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['Item', 'Qty', 'Description', 'WLL (t)', 'Unit weight (kg)', 'Location', 'Certificate no.'].map((h) => el('th', {}, h)))),
    el(
      'tbody',
      {},
      bom.map((b) =>
        el(
          'tr',
          {},
          el('td', {}, b.no),
          el('td', { class: 'num' }, b.qty),
          el('td', {}, b.name, b.ewl_m != null ? ` — ${b.links ? `${b.links} links` : `${fmt(b.ewl_m)} m`}` : ''),
          el('td', { class: 'num' }, b.unknown ? 'not known' : fmt(b.wll_t)),
          el('td', { class: 'num' }, b.unknown ? '—' : fmt(b.unitWeight_t * 1000, 1)),
          el('td', {}, [...new Set(b.where)].join(', ')),
          el('td', {}, b.certNo || ''),
        ),
      ),
      el('tr', { class: 'group' }, el('td', { colspan: 4 }, 'Total rigging weight'), el('td', { class: 'num' }, fmt(tot * 1000, 1)), el('td', { colspan: 2 }, '')),
    ),
  );
}

function update(res) {
  const fl = document.getElementById('fac-live');
  if (fl && res?.rig?.factors) {
    const f = res.rig.factors;
    fl.innerHTML = '';
    fl.append(el('span', { class: 'muted' }, `DAF ${f.dafOn ? fmt(f.daf) : 'off (1.00)'} · SKL ${fmt(f.skl)} · COG ${fmt(f.cog)} · other ${fmt(f.extra)} → leg factor `), el('b', {}, fmt(res.rig.fac, 3)));
  }
  const root = document.getElementById('res-root');
  if (!root) return;
  root.innerHTML = '';
  if (!res || res.rig?.error) {
    root.append(el('div', { class: 'note fail' }, res?.rig?.error || 'Calculation not possible'));
    return;
  }
  const nF = res.checks.filter((c) => c.status === 'fail').length;
  const nW = res.checks.filter((c) => c.status === 'warn').length;
  const shown = res.checks.filter((c) => filter === 'all' || (filter === 'issues' ? c.status === 'fail' || c.status === 'warn' : c.status === filter));
  const fbtn = (f, t) => el('button', { class: `small ${filter === f ? 'active' : ''}`, onclick: () => { filter = f; update(app.result); } }, t);
  root.append(
    panel(
      null,
      el(
        'div',
        { class: 'panel-head' },
        el('h2', {}, 'Summary'),
        el('div', { class: 'row' }, badge(res.status), el('span', {}, nF ? `${nF} failed check(s)` : nW ? `${nW} warning(s)` : 'All checks passed')),
      ),
      summaryCards(res),
      res.governing?.length
        ? el('div', { style: { marginTop: '10px' } }, el('b', {}, 'Governing items: '), res.governing.slice(0, 3).map((g, i) => el('span', {}, `${i ? ' · ' : ''}${g.item} — ${g.label.split(' — ')[0]} (${(g.util * 100).toFixed(0)} %)`)))
        : null,
    ),
    panel(
      null,
      el('div', { class: 'panel-head' }, el('h2', {}, 'Checks'), el('div', { class: 'row' }, fbtn('all', 'All'), fbtn('issues', 'Issues'), fbtn('fail', 'Failed'), fbtn('warn', 'Warnings'))),
      el('p', { class: 'muted', style: { fontSize: '12px', margin: '0 0 6px' } }, 'Click a row (or its button) to open the page and the item to adjust. The grey line under a compatibility check explains why.'),
      el('div', { class: 'tbl-wrap' }, checksTable(shown, { nav: true })),
    ),
    panel('Leg forces', el('div', { class: 'tbl-wrap' }, legsTable(res))),
    panel(
      null,
      el('div', { class: 'panel-head' }, el('h2', {}, 'Rigging equipment list'), el('button', { class: 'small', onclick: () => exportBomCsv(res) }, 'Export CSV')),
      el('div', { class: 'tbl-wrap' }, bomTable(res)),
    ),
  );
}

function exportBomCsv(res) {
  const rows = [['Item', 'Qty', 'Description', 'WLL_t', 'Unit_weight_kg', 'Location', 'Certificate']];
  res.bom.forEach((b) => rows.push([b.no, b.qty, b.name, b.wll_t ?? '', (b.unitWeight_t * 1000).toFixed(1), [...new Set(b.where)].join(' / '), b.certNo || '']));
  download('rigging-equipment-list.csv', '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}
