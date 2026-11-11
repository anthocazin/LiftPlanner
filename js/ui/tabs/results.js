import { app } from '../app.js';
import { el, panel, fmt, badge, utilBar, download } from '../dom.js';

let filter = 'all';

export function render(root) {
  root.append(el('div', { id: 'res-root', class: 'grid' }));
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
    c('Crane load', `${fmt(res.shlCrane)} t`, app.project.crane.deductHookBlock !== false ? 'hook block included' : 'hook block excluded'),
    c('Dynamic hook load', `${fmt(res.dynamicHookLoad)} t`, `DAF ${fmt(r.factors.daf)}`),
    c('Leg load factor', fmt(r.fac, 3), `DAF ${fmt(r.factors.daf)} · SKL ${fmt(r.factors.skl)}`),
    c('Max crane utilisation', res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(1)} %` : '—'),
    c('Rigging height', `${fmt(r.riggingHeight)} m`, 'padeyes → hook'),
    r.tilt ? c('Estimated tilt', `${fmt(r.tilt.tilt_deg)}°`) : null,
  );
}

export function checksTable(checks, { compact = false } = {}) {
  const groups = {};
  checks.forEach((c) => (groups[c.cat] = groups[c.cat] || []).push(c));
  const tb = el('tbody');
  for (const [cat, list] of Object.entries(groups)) {
    tb.append(el('tr', { class: 'group' }, el('td', { colspan: 7 }, cat)));
    for (const c of list)
      tb.append(
        el(
          'tr',
          {},
          el('td', {}, badge(c.status)),
          el('td', {}, c.item),
          el('td', {}, c.label, c.note ? el('div', { class: 'muted', style: { fontSize: '11px' } }, c.note) : null),
          el('td', { class: 'num' }, c.value != null ? `${fmt(c.value)} ${c.unit || ''}` : ''),
          el('td', { class: 'num' }, c.limit != null ? `${fmt(c.limit)} ${c.unit || ''}` : ''),
          el('td', {}, c.util != null ? utilBar(c.util) : ''),
        ),
      );
  }
  return el('table', { class: `data ${compact ? 'compact' : ''}` }, el('thead', {}, el('tr', {}, ['Status', 'Item', 'Check', 'Value', 'Limit', 'Utilisation'].map((h) => el('th', {}, h)))), tb);
}

const nm = (i) => (i ? i.short || i.name : '—');

export function legsTable(res) {
  const rig = res.rig;
  return el(
    'table',
    { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['Leg', 'Point', 'EWL (m)', 'Eff. L (m)', 'Angle to horiz.', 'Vert. R (t)', 'Static T (t)', 'Design F (t)', 'Sling', 'Bottom shackle', 'Top connection'].map((h) => el('th', {}, h)))),
    el(
      'tbody',
      {},
      rig.legs.map((l) =>
        el(
          'tr',
          {},
          el('td', {}, el('b', {}, l.label)),
          el('td', {}, l.pointId || (l.level === 'top' ? 'Spreader' : '')),
          el('td', { class: 'num' }, fmt(l.slingLength)),
          el('td', { class: 'num' }, fmt(l.Leff)),
          el('td', { class: 'num' }, `${l.angleH.toFixed(1)}°`),
          el('td', { class: 'num' }, fmt(l.R)),
          el('td', { class: 'num' }, fmt(l.Tstatic)),
          el('td', { class: 'num' }, el('b', {}, fmt(l.Fdesign))),
          el('td', {}, nm(l.comps.sling)),
          el('td', {}, nm(l.comps.bottomShackle)),
          el('td', {}, l.comps.topConn ? nm(l.comps.topConn) : 'direct'),
        ),
      ),
    ),
  );
}

export function bomTable(res) {
  const tot = res.bom.reduce((s, b) => s + b.qty * b.unitWeight_t, 0);
  return el(
    'table',
    { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['Item', 'Qty', 'Description', 'WLL (t)', 'Unit weight (kg)', 'Location', 'Certificate no.'].map((h) => el('th', {}, h)))),
    el(
      'tbody',
      {},
      res.bom.map((b) =>
        el(
          'tr',
          {},
          el('td', {}, b.no),
          el('td', { class: 'num' }, b.qty),
          el('td', {}, b.name),
          el('td', { class: 'num' }, fmt(b.wll_t)),
          el('td', { class: 'num' }, fmt(b.unitWeight_t * 1000, 1)),
          el('td', {}, [...new Set(b.where)].join(', ')),
          el('td', {}, b.certNo || ''),
        ),
      ),
      el('tr', { class: 'group' }, el('td', { colspan: 4 }, 'Total rigging weight'), el('td', { class: 'num' }, fmt(tot * 1000, 1)), el('td', { colspan: 2 }, '')),
    ),
  );
}

function update(res) {
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
      el('div', { class: 'tbl-wrap' }, checksTable(shown)),
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
