import { app } from '../app.js';
import { el, fmt, badge } from '../dom.js';
import { checksTable, legsTable, bomTable, summaryCards } from './results.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { drawRiggingDetail } from '../../draw/detail.js';
import { drawStoryPlan, drawStoryElevation } from '../../draw/story.js';
import { drawCapacityChart } from '../../draw/chart.js';
import { figure } from '../figure.js';
import { ENVIRONMENTS, DAF_REFERENCE, SKL_REFERENCE } from '../../engine/factors.js';
import { worstStatus } from '../../engine/compute.js';

export function render(root) {
  root.append(
    el(
      'div',
      { class: 'row', style: { marginBottom: '12px' } },
      el('button', { class: 'primary', onclick: () => window.__printReport?.() }, 'Print / Save as PDF'),
      el('span', { class: 'muted' }, 'In the print dialog choose "Save as PDF". A4 portrait.'),
    ),
    el('div', { id: 'report-preview' }),
  );
  update();
  root._update = update;
}

function update() {
  const box = document.getElementById('report-preview');
  if (!box) return;
  box.innerHTML = '';
  box.append(buildReport());
}

const kv = (pairs) => el('div', { class: 'kv' }, pairs.flatMap(([k, v]) => [el('div', {}, k), el('div', {}, v ?? '—')]));
const fig = (svg) => figure(svg, '', { exportable: false });

export function buildReport() {
  const p = app.project;
  const res = app.result;
  const pr = p.project;
  const r = res?.rig;
  const rep = el('div', { class: 'report' });
  const add = (...xs) => rep.append(...xs.filter((x) => x != null && x !== false));
  add(
    el(
      'div',
      { class: 'head' },
      el('div', {}, el('div', { style: { fontSize: '11px', color: '#666', letterSpacing: '.1em' } }, 'LIFT PLAN'), el('h1', {}, pr.name || 'Untitled'), el('div', {}, `${pr.client || ''} ${pr.site ? '· ' + pr.site : ''} ${pr.vessel ? '· ' + pr.vessel : ''}`)),
      el('div', { style: { textAlign: 'right' } }, el('div', {}, el('b', {}, pr.liftId || ''), ` — Rev. ${pr.revision || '-'}`), el('div', {}, pr.date || ''), res ? badge(res.status) : null, el('div', { style: { fontSize: '11px' } }, `Category: ${res?.category?.cat || '—'}`)),
    ),
  );
  if (!r || r.error) {
    add(el('div', { class: 'note fail' }, r?.error || 'Calculation not possible'));
    return rep;
  }
  add(
    el('h2', {}, '1. Operation'),
    kv([
      ['Description', pr.description],
      ['Environment', ENVIRONMENTS[p.environment]],
      ['Prepared by', pr.preparedBy],
      ['Checked by', pr.checkedBy],
      ['Category (indicative)', `${res.category.cat}${res.category.reasons.length ? ' — ' + res.category.reasons.join(', ') : ''}`],
      ['Approved by', pr.approvedBy],
    ]),
    el('div', { style: { marginTop: '8px' } }, summaryCards(res)),
    el('h2', {}, '2. Load'),
    kv([
      ['Description', p.load.name],
      ['Net weight', `${fmt(p.load.weight_t)} t`],
      ['Weight contingency (WCF)', fmt(p.load.wcf)],
      ['Design weight', `${fmt(r.W)} t`],
      ['Dimensions L × W × H', `${fmt(p.load.dims_mm.L, 0)} × ${fmt(p.load.dims_mm.W, 0)} × ${fmt(p.load.dims_mm.H, 0)} mm`],
      ['COG (X; Y; Z)', `${fmt(p.load.cog_mm.x, 0)}; ${fmt(p.load.cog_mm.y, 0)}; ${fmt(p.load.cog_mm.z, 0)} mm`],
      ['COG envelope', `± ${fmt(p.load.cogEnvelope_mm?.dx || 0, 0)} / ± ${fmt(p.load.cogEnvelope_mm?.dy || 0, 0)} mm`],
      ['Wind area', p.load.windArea_m2 ? `${fmt(p.load.windArea_m2, 1)} m²` : '—'],
    ]),
    el(
      'table',
      { class: 'data compact', style: { marginTop: '6px' } },
      el('thead', {}, el('tr', {}, ['Point', 'X', 'Y', 'Z (mm)', 'SWL (t)', 'Hole Ø', 'Thk.', 'Design F (t)'].map((h) => el('th', {}, h)))),
      el(
        'tbody',
        {},
        p.load.liftPoints.filter((x) => x.used !== false).map((lp) => {
          const leg = r.legs.find((l) => l.pointId === lp.id);
          return el('tr', {}, el('td', {}, lp.id), ...[lp.x, lp.y, lp.z].map((v) => el('td', { class: 'num' }, fmt(v, 0))), el('td', { class: 'num' }, fmt(lp.swl_t)), el('td', { class: 'num' }, fmt(lp.holeDia_mm, 0)), el('td', { class: 'num' }, fmt(lp.thk_mm, 0)), el('td', { class: 'num' }, leg ? fmt(leg.Fdesign) : '—'));
        }),
      ),
    ),
    el('h2', {}, '3. Crane'),
    kv([
      ['Crane / configuration', p.crane.name],
      ['Hook block', `${fmt(p.crane.hookBlock_t)} t — SWL ${fmt(p.crane.hookSWL_t)} t`],
      ['Boom length', `${fmt(p.crane.boom?.length, 1)} m`],
      ['Crane hook load', `${fmt(res.shlCrane)} t`],
      ['Load chart reading', p.crane.interpolation === 'linear' ? 'linear interpolation' : 'conservative (next tabulated radius)'],
      ['Max utilisation', res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(1)} % (critical lift threshold ${((p.crane.utilLimit || 0.85) * 100).toFixed(0)} %)` : '—'],
    ]),
    el('div', { style: { marginTop: '6px' } }, fig(drawCapacityChart(p, res, { width: 700, height: 260 }))),
    el('h2', {}, '4. Rigging'),
    kv([
      ['Configuration', p.rigging.type === 'spreader' ? `Spreader bar ${p.rigging.spreader?.name || ''}` : `Direct to hook — ${r.legs.length} leg(s)`],
      ['Head', r.head?.onHook ? 'Slings directly on the hook' : `${r.head?.masterlink?.name || '—'}${r.head?.useSub && !r.head?.integrated ? ' + sub-links' : ''}`],
      ['DAF', `${fmt(r.factors.daf)} ${r.factors.dafAuto ? '(DNV-ST-N001, auto)' : '(user value)'}`],
      ['SKL', `${fmt(r.factors.skl)} ${r.factors.sklAuto ? '(auto)' : '(user value)'}`],
      ['COG factor / other factor', `${fmt(r.factors.cog)} / ${fmt(r.factors.extra)}`],
      ['Factor applied to legs', fmt(r.fac, 3)],
      ['Rigging height', `${fmt(r.riggingHeight)} m (padeyes → hook)`],
      ['Rigging weight', `${fmt(r.rigWeight * 1000, 0)} kg`],
    ]),
    el('div', { style: { marginTop: '6px' } }, legsTable(res)),
    el('h3', {}, 'Rigging equipment list'),
    bomTable(res),
    el('div', { class: 'page-break' }),
    el('h2', {}, '5. Rigging arrangement'),
    el(
      'div',
      { class: 'figs' },
      fig(drawRiggingView(p, res, 'iso', { width: 560, height: 420 })),
      fig(drawRiggingView(p, res, 'plan', { width: 560, height: 420 })),
      fig(drawRiggingView(p, res, 'front', { width: 560, height: 380 })),
      fig(drawRiggingView(p, res, 'side', { width: 560, height: 380 })),
    ),
    el('div', { style: { marginTop: '6px' } }, fig(drawRiggingDetail(p, res, { height: 620 }))),
    el('div', { class: 'page-break' }),
    el('h2', {}, '6. Checks'),
    checksTable(res.checks, { compact: true }),
    el('div', { class: 'disclaimer' }, DAF_REFERENCE, ' ', SKL_REFERENCE),
  );
  const steps = p.storyboard?.steps || [];
  if (steps.length) {
    add(el('div', { class: 'page-break' }), el('h2', {}, '7. Storyboard'), fig(drawStoryPlan(p, res, null, { width: 760, height: 420 })));
    steps.forEach((st, i) => {
      const sr = res.steps[i];
      add(
        el(
          'div',
          { class: 'avoid-break', style: { marginTop: '8px' } },
          el('div', { style: { fontWeight: 700, margin: '6px 0 4px' } }, st.name || `Step ${i + 1}`, ' ', sr ? badge(worstStatus(sr.checks)) : null),
          st.note ? el('div', { style: { fontSize: '10.5px', marginBottom: '4px' } }, st.note) : null,
          el('div', { class: 'figs' }, fig(drawStoryPlan(p, res, i, { width: 520, height: 380 })), fig(drawStoryElevation(p, res, i, { width: 520, height: 380 }))),
        ),
      );
    });
  }
  const w = p.weather || {};
  add(
    el('h2', {}, `${steps.length ? '8' : '7'}. Limits, preparation and authorisation`),
    kv([
      ['Hs max', w.hsMax_m != null ? `${fmt(w.hsMax_m, 1)} m` : '—'],
      ['Max mean wind', w.windMax_ms != null ? `${fmt(w.windMax_ms, 1)} m/s` : '—'],
      ['Max gusts', w.windGust_ms != null ? `${fmt(w.windGust_ms, 1)} m/s` : '—'],
      ['Visibility', w.visibility],
    ]),
    w.notes ? el('p', {}, w.notes) : null,
    el(
      'table',
      { class: 'data compact', style: { marginTop: '6px' } },
      el('tbody', {}, (p.checklist || []).map((c) => el('tr', {}, el('td', { style: { width: '24px', textAlign: 'center' } }, c.checked ? '☑' : '☐'), el('td', {}, c.label)))),
    ),
    p.notes ? el('div', { style: { marginTop: '6px', whiteSpace: 'pre-wrap' } }, p.notes) : null,
    el(
      'div',
      { class: 'sign' },
      ['Prepared by', 'Checked by', 'Approved by'].map((t, i) => el('div', {}, el('b', {}, t), el('div', {}, [pr.preparedBy, pr.checkedBy, pr.approvedBy][i] || ''), el('div', { class: 'muted', style: { marginTop: '22px' } }, 'Date / signature'))),
    ),
    el(
      'div',
      { class: 'disclaimer' },
      'Document generated by LiftPlanner (calculation aid). Catalogue data (WLL, dimensions, weights) are indicative and must be checked against the certificates of the equipment actually used. This plan must be reviewed and approved by a competent person in accordance with the applicable procedures.',
    ),
  );
  return rep;
}
