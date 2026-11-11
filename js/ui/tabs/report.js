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
      el('button', { class: 'primary', onclick: () => window.__printReport?.() }, 'Imprimer / Enregistrer en PDF'),
      el('span', { class: 'muted' }, 'Dans la fenêtre d\'impression, choisissez « Enregistrer au format PDF ». Format A4 portrait.'),
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
      el('div', {}, el('div', { style: { fontSize: '11px', color: '#666', letterSpacing: '.1em' } }, 'LIFT PLAN — PLAN DE LEVAGE'), el('h1', {}, pr.name || 'Sans titre'), el('div', {}, `${pr.client || ''} ${pr.site ? '· ' + pr.site : ''} ${pr.vessel ? '· ' + pr.vessel : ''}`)),
      el('div', { style: { textAlign: 'right' } }, el('div', {}, el('b', {}, pr.liftId || ''), ` — Rév. ${pr.revision || '-'}`), el('div', {}, pr.date || ''), res ? badge(res.status) : null, el('div', { style: { fontSize: '11px' } }, `Catégorie : ${res?.category?.cat || '—'}`)),
    ),
  );
  if (!r || r.error) {
    add(el('div', { class: 'note fail' }, r?.error || 'Calcul impossible'));
    return rep;
  }
  add(
    el('h2', {}, '1. Opération'),
    kv([
      ['Description', pr.description],
      ['Environnement', ENVIRONMENTS[p.environment]],
      ['Préparé par', pr.preparedBy],
      ['Vérifié par', pr.checkedBy],
      ['Catégorie (indicative)', `${res.category.cat}${res.category.reasons.length ? ' — ' + res.category.reasons.join(', ') : ''}`],
      ['Approuvé par', pr.approvedBy],
    ]),
    el('div', { style: { marginTop: '8px' } }, summaryCards(res)),
    el('h2', {}, '2. Charge'),
    kv([
      ['Désignation', p.load.name],
      ['Poids net', `${fmt(p.load.weight_t)} t`],
      ['Contingence (WCF)', fmt(p.load.wcf)],
      ['Poids de calcul', `${fmt(r.W)} t`],
      ['Dimensions L × l × H', `${fmt(p.load.dims_mm.L, 0)} × ${fmt(p.load.dims_mm.W, 0)} × ${fmt(p.load.dims_mm.H, 0)} mm`],
      ['COG (X ; Y ; Z)', `${fmt(p.load.cog_mm.x, 0)} ; ${fmt(p.load.cog_mm.y, 0)} ; ${fmt(p.load.cog_mm.z, 0)} mm`],
      ['Enveloppe COG', `± ${fmt(p.load.cogEnvelope_mm?.dx || 0, 0)} / ± ${fmt(p.load.cogEnvelope_mm?.dy || 0, 0)} mm`],
      ['Surface au vent', p.load.windArea_m2 ? `${fmt(p.load.windArea_m2, 1)} m²` : '—'],
    ]),
    el(
      'table',
      { class: 'data compact', style: { marginTop: '6px' } },
      el('thead', {}, el('tr', {}, ['Point', 'X', 'Y', 'Z (mm)', 'SWL (t)', 'Ø trou', 'Ép.', 'Effort calc. (t)'].map((h) => el('th', {}, h)))),
      el(
        'tbody',
        {},
        p.load.liftPoints.filter((x) => x.used !== false).map((lp) => {
          const leg = r.legs.find((l) => l.pointId === lp.id);
          return el('tr', {}, el('td', {}, lp.id), ...[lp.x, lp.y, lp.z].map((v) => el('td', { class: 'num' }, fmt(v, 0))), el('td', { class: 'num' }, fmt(lp.swl_t)), el('td', { class: 'num' }, fmt(lp.holeDia_mm, 0)), el('td', { class: 'num' }, fmt(lp.thk_mm, 0)), el('td', { class: 'num' }, leg ? fmt(leg.Fdesign) : '—'));
        }),
      ),
    ),
    el('h2', {}, '3. Grue'),
    kv([
      ['Grue / configuration', p.crane.name],
      ['Moufle / crochet', `${fmt(p.crane.hookBlock_t)} t — SWL ${fmt(p.crane.hookSWL_t)} t`],
      ['Flèche', `${fmt(p.crane.boom?.length, 1)} m`],
      ['Charge au crochet (grue)', `${fmt(res.shlCrane)} t`],
      ['Lecture du tableau', p.crane.interpolation === 'linear' ? 'interpolation linéaire' : 'conservative (rayon tabulé supérieur)'],
      ['Utilisation max', res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(1)} % (seuil critique ${((p.crane.utilLimit || 0.85) * 100).toFixed(0)} %)` : '—'],
    ]),
    el('div', { style: { marginTop: '6px' } }, fig(drawCapacityChart(p, res, { width: 700, height: 260 }))),
    el('h2', {}, '4. Gréement'),
    kv([
      ['Configuration', p.rigging.type === 'spreader' ? `Palonnier ${p.rigging.spreader?.name || ''}` : `Crochet direct — ${r.legs.length} jambe(s)`],
      ['Tête', r.head?.onHook ? 'Élingues au crochet' : `${r.head?.masterlink?.name || '—'}${r.head?.useSub ? ' + sous-anneaux' : ''}`],
      ['DAF', `${fmt(r.factors.daf)} ${r.factors.dafAuto ? '(DNV-ST-N001, auto)' : '(imposé)'}`],
      ['SKL', `${fmt(r.factors.skl)} ${r.factors.sklAuto ? '(auto)' : '(imposé)'}`],
      ['Facteur COG / autre', `${fmt(r.factors.cog)} / ${fmt(r.factors.extra)}`],
      ['Facteur appliqué aux jambes', fmt(r.fac, 3)],
      ['Hauteur gréement', `${fmt(r.riggingHeight)} m (padeyes → crochet)`],
      ['Poids du gréement', `${fmt(r.rigWeight * 1000, 0)} kg`],
    ]),
    el('div', { style: { marginTop: '6px' } }, legsTable(res)),
    el('h3', {}, 'Liste du matériel'),
    bomTable(res),
    el('div', { class: 'page-break' }),
    el('h2', {}, '5. Arrangement de gréement'),
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
    el('h2', {}, '6. Vérifications'),
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
          el('div', { style: { fontWeight: 700, margin: '6px 0 4px' } }, st.name || `Étape ${i + 1}`, ' ', sr ? badge(worstStatus(sr.checks)) : null),
          st.note ? el('div', { style: { fontSize: '10.5px', marginBottom: '4px' } }, st.note) : null,
          el('div', { class: 'figs' }, fig(drawStoryPlan(p, res, i, { width: 520, height: 380 })), fig(drawStoryElevation(p, res, i, { width: 520, height: 380 }))),
        ),
      );
    });
  }
  const w = p.weather || {};
  add(
    el('h2', {}, `${steps.length ? '8' : '7'}. Limites, préparation et autorisation`),
    kv([
      ['Hs max', w.hsMax_m != null ? `${fmt(w.hsMax_m, 1)} m` : '—'],
      ['Vent moyen max', w.windMax_ms != null ? `${fmt(w.windMax_ms, 1)} m/s` : '—'],
      ['Rafales max', w.windGust_ms != null ? `${fmt(w.windGust_ms, 1)} m/s` : '—'],
      ['Visibilité', w.visibility],
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
      ['Préparé par', 'Vérifié par', 'Approuvé par'].map((t, i) => el('div', {}, el('b', {}, t), el('div', {}, [pr.preparedBy, pr.checkedBy, pr.approvedBy][i] || ''), el('div', { class: 'muted', style: { marginTop: '22px' } }, 'Date / signature'))),
    ),
    el(
      'div',
      { class: 'disclaimer' },
      'Document généré par LiftPlanner (outil d\'aide au calcul). Les données catalogue (WLL, dimensions, poids) sont indicatives et doivent être vérifiées contre les certificats du matériel effectivement utilisé. Ce plan doit être revu et approuvé par une personne compétente conformément aux procédures applicables.',
    ),
  );
  return rep;
}
