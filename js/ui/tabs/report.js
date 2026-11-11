// Lift plan report, laid out like the company lifting plan template (header with logos, blue
// section bars, lifting plan block, load / crane details, safety measures, equipment, step-by-step,
// sketches, checklift) followed by the calculation summary.
import { app } from '../app.js';
import { el, fmt, badge } from '../dom.js';
import { checksTable, legsTable } from './results.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { drawRiggingDetail, drawPadeyeFit } from '../../draw/detail.js';
import { drawStoryPlan, drawStoryElevation } from '../../draw/story.js';
import { drawCapacityChart } from '../../draw/chart.js';
import { staticViewSvg, safeImg } from '../loadview.js';
import { draw3d } from '../../draw/view3d.js';
import { figure } from '../figure.js';
import { ENVIRONMENTS } from '../../engine/factors.js';
import { worstStatus } from '../../engine/compute.js';
import { SAFETY_MEASURES, CHECKLIFT } from '../../state.js';
import { sanitizeSvg } from './drawings.js';

const opts = { calc: true, sketches: true, checksAll: false };

export function render(root) {
  const tog = (k, t) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: opts[k], onchange: (e) => { opts[k] = e.target.checked; update(); } }), t);
  root.append(
    el('div', { class: 'row no-print', style: { marginBottom: '12px', gap: '14px' } },
      el('button', { class: 'primary', onclick: () => window.__printReport?.() }, 'Print / Save as PDF'),
      el('span', { class: 'muted' }, 'In the print dialog choose "Save as PDF", A4 portrait, margins "default".'),
      tog('sketches', 'Sequence sketches'), tog('calc', 'Calculation summary'), tog('checksAll', 'All checks (not only issues)'),
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
      el('div', { class: 'h1' }, hl[0] || pr.client || ''),
      el('div', { class: 'h2' }, hl[1] || pr.site || ''),
      el('div', { class: 'h3' }, hl[2] || pr.name || ''),
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
      el('tfoot', {}, el('tr', {}, el('td', {}, el('div', { class: 'rfoot' }, `${pr.liftId || ''} · Rev. ${pr.revision || '-'} · ${pr.date || ''}`, el('span', {}, 'LiftPlanner — check against the equipment certificates'))))),
      el('tbody', {}, el('tr', {}, body)),
    ),
  );
  const add = (...xs) => body.append(...xs.flat().filter((x) => x != null && x !== false));

  // ---- LIFTING PLAN block
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 4, class: 'big' }, 'LIFTING PLAN')),
    el('tr', {}, el('th', {}, 'Title'), el('td', { colspan: 3 }, pr.name || '')),
    el('tr', {}, el('th', {}, 'Reference'), el('td', {}, pr.liftId || ''), el('th', {}, 'Revision / date'), el('td', {}, `${pr.revision || '-'} — ${pr.date || ''}`)),
    el('tr', {}, el('th', {}, 'Vessel/Site'), el('td', {}, pr.site || pr.vessel || ''), el('th', {}, 'Category'), el('td', {}, `${res?.category?.cat || '—'}`, res ? el('span', { style: { marginLeft: '6px' } }, badge(res.status)) : null)),
    el('tr', {}, el('th', {}, 'Client'), el('td', { colspan: 3 }, pr.client || '')),
    el('tr', {}, el('th', {}, 'Lift Location'), el('td', { colspan: 3 }, pr.location || '')),
  ));
  if (!r || r.error) {
    add(el('div', { class: 'note fail' }, r?.error || 'Calculation not possible'));
    return rep;
  }

  // ---- Load / crane details
  const crSteps = (p.storyboard.steps || []).map((st, i) => ({ st, i, sr: res.steps?.[i] })).filter((x) => Number(x.st.radius_m) > 0);
  const radii = crSteps.map((x) => Number(x.st.radius_m));
  const crane = p.crane;
  const swlLines = crSteps.map(({ st, i, sr }) => {
    const c = sr?.checks?.find((k) => k.cat === 'Crane' && k.util != null);
    return c ? `Step ${i + 1}: SWL ${fmt(c.limit)} t @ ${fmt(st.radius_m, 1)} m → ${(c.util * 100).toFixed(0)} %` : `Step ${i + 1}: R ${fmt(st.radius_m, 1)} m — ${sr?.checks?.[0]?.label || ''}`;
  });
  if (!crSteps.length && Number(crane.radius_m) > 0) {
    const c = res.checks.find((k) => k.cat === 'Crane' && k.util != null);
    if (c) swlLines.push(`SWL ${fmt(c.limit)} t @ ${fmt(crane.radius_m, 1)} m → ${(c.util * 100).toFixed(0)} %`);
  }
  const ul = (arr) => el('ul', {}, arr.filter(Boolean).map((t) => el('li', {}, t)));
  const w = p.weather || {};
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 3, class: 'sec' }, 'Load details/crane details', el('span', {}, ' (maximum hook load not to be exceeded)'))),
    el('tr', {},
      el('td', {}, el('b', {}, 'Load identification:'), ul([ld.name, `Overall ${fmt(ld.dims_mm.L, 0)} × ${fmt(ld.dims_mm.W, 0)} × ${fmt(ld.dims_mm.H, 0)} mm`, `${r.pts.length} lift point(s) ${r.pts.map((q) => q.id).join(', ')}`, p.rigging.type === 'spreader' ? `Spreader bar ${fmt(r.spreader.length)} m` : `Direct to hook, ${r.legs.length} legs`])),
      el('td', {}, el('b', {}, 'Centre of Gravity:'), el('div', { style: { margin: '4px 0' } }, box(ld.cogBasis === 'obvious'), ' Obvious  ', box(ld.cogBasis === 'estimated'), ' Estimated  ', box(ld.cogBasis === 'drawing' || !ld.cogBasis), ' Drawing'),
        el('div', {}, `X ${fmt(ld.cog_mm.x, 0)} · Y ${fmt(ld.cog_mm.y, 0)} · Z ${fmt(ld.cog_mm.z, 0)} mm`), Number(ld.cogEnvelope_mm?.dx) || Number(ld.cogEnvelope_mm?.dy) ? el('div', {}, `Envelope ±${ld.cogEnvelope_mm.dx || 0} / ±${ld.cogEnvelope_mm.dy || 0} mm`) : null),
      el('td', {}, el('b', {}, 'Gross lift weight/maximum hook load:'), el('div', { style: { margin: '4px 0' } }, box(ld.weightBasis === 'actual'), ' Actual  ', box(ld.weightBasis !== 'actual'), ' Assessed'),
        ul([`Net weight ${fmt(ld.weight_t)} t × WCF ${fmt(ld.wcf)} = ${fmt(r.W)} t`, `Rigging ${fmt(r.rigWeight)} t`, `Max hook load: ${fmt(res.shlCrane)} t static / ${fmt(res.dynamicHookLoad)} t dynamic`])),
    ),
    el('tr', {},
      el('td', {}, el('b', {}, 'Crane identification/configuration/mode:'), ul([crane.name, crane.configuration, radii.length ? `Radius: ${radii.map((x) => fmt(x, 1)).join(' → ')} m` : null, `Mode: ${ENVIRONMENTS[p.environment]}`])),
      el('td', {}, el('b', {}, 'Crane specifications:'), ul([...swlLines, res.chartRange ? `Load chart ${res.chartRange.rMin}–${res.chartRange.rMax} m` : null])),
      el('td', {}, el('b', {}, 'Design lift conditions (maximum):'), ul([w.windMax_ms ? `Wind speed: ${w.windMax_ms} m/s${w.windGust_ms ? ` (gusts ${w.windGust_ms} m/s)` : ''}` : null, w.hsMax_m ? `Hs: ${w.hsMax_m} m` : null, w.visibility ? `Visibility: ${w.visibility}` : null, ...lines(w.notes)])),
    ),
  ));

  // ---- Description
  add(el('table', { class: 'tb' }, el('tr', {}, el('th', { class: 'sec' }, 'Description of lifting')), el('tr', {}, el('td', {}, pr.description || ''))));

  // ---- Safety measures
  const ms = p.safety?.measures || {};
  const third = Math.ceil(SAFETY_MEASURES.length / 3);
  const col = (k) => el('td', { class: 'small' }, SAFETY_MEASURES.slice(k * third, (k + 1) * third).map((m) => el('div', {}, box(ms[m]), ' ', m)));
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 3, class: 'sec' }, 'Possible safety measures to be considered', el('span', {}, ' (tick as applicable and detail in ‘step-by-step’)'))),
    el('tr', {}, col(0), col(1), col(2)),
  ));
  const fu = lines(p.safety?.further);
  if (fu.length) add(el('table', { class: 'tb' }, el('tr', {}, el('th', { class: 'sec' }, 'Any further safety measures', el('span', {}, ' (as identified in the risk assessment; remember SIMOPs)'))), el('tr', {}, el('td', {}, ul(fu)))));
  const cm = p.safety?.comms || {};
  add(el('table', { class: 'tb' },
    el('tr', {}, el('th', { colspan: 2, class: 'sec' }, 'Communications')),
    el('tr', {},
      el('td', {}, el('b', {}, 'Communication available:'), el('div', {}, box(!!cm.primary), ` Primary (${cm.primary || '—'})   `, box(!!cm.secondary), ` Secondary (${cm.secondary || '—'})   `, box(!!cm.other), ` Other: ${cm.other || ''}`)),
      el('td', {}, el('b', {}, 'Communications checks:'), el('div', {}, box(cm.primaryChecked), ' Primary checked   ', box(cm.secondaryChecked), ' Secondary checked')),
    ),
  ));

  // ---- Lifting equipment
  const chk = p.equipmentCheck || {};
  add(el('table', { class: 'tb eq avoid-break' },
    el('tr', {}, el('th', { colspan: 6, class: 'sec' }, 'Lifting equipment and accessories to be used', el('span', {}, ' (specify type, SWL and configuration)'))),
    el('tr', { class: 'colh' }, ['Qty', 'Item', 'EWL', 'SWL', 'Configuration', 'Cert. no.'].map((h) => el('td', {}, h))),
    res.bom.map((b) => el('tr', {},
      el('td', { class: 'c' }, String(b.qty)),
      el('td', {}, b.name),
      el('td', { class: 'c' }, b.ewl_m != null ? (b.links ? `${b.links} links (${fmt(b.ewl_m, 3)} m)` : `${fmt(b.ewl_m)} m`) : 'n/a'),
      el('td', { class: 'c' }, b.wll_t != null ? `${fmt(b.wll_t)} t` : '—'),
      el('td', {}, b.config || ''),
      el('td', {}, chk[b.key]?.certNo || b.certNo || ''),
    )),
  ));

  // ---- Step-by-step
  const steps = p.storyboard.steps || [];
  const rv = p.safety?.review || {};
  add(el('table', { class: 'tb steps' },
    el('tr', {}, el('th', { colspan: 2, class: 'sec' }, 'Step-by-step details of lifting operation'), el('th', { class: 'sec' }, 'Responsible')),
    steps.map((st, i) => el('tr', {}, el('td', { class: 'c n' }, String(i + 1)), el('td', {}, el('b', {}, st.name || ''), st.note ? ` — ${st.note}` : '', Number(st.radius_m) > 0 ? el('span', { class: 'muted' }, ` (R ${fmt(st.radius_m, 1)} m, load +${fmt(st.loadElevation_m ?? 0, 1)} m)`) : null), el('td', { class: 'c' }, st.responsible || ''))),
    el('tr', {}, el('th', { colspan: 3, class: 'sec' }, 'Technical Review')),
    el('tr', {}, el('td', { colspan: 2 }, 'Has a technical review been conducted'), el('td', {}, box(rv.done), ` Yes ${rv.ref ? `(${rv.ref})` : ''}  `, box(!rv.done), ' No')),
  ));

  // ---- Sketches
  add(el('div', { class: 'page-break' }));
  add(bar('Sketch detailing the rigging-up of the lifting equipment and lifting accessories'));
  const hasImg = ld.views?.xy?.image || ld.views?.xz?.image;
  add(el('div', { class: 'figs avoid-break' },
    hasImg ? fig(staticViewSvg('xy', p, res, { width: 520, height: 330, title: 'Plan XY — rigging on the drawing' })) : fig(drawRiggingView(p, res, 'plan', { width: 520, height: 330 })),
    hasImg ? fig(staticViewSvg('xz', p, res, { width: 520, height: 330, title: 'Elevation XZ — rigging on the drawing' })) : fig(drawRiggingView(p, res, 'front', { width: 520, height: 330 })),
  ));
  add(el('div', { class: 'figs avoid-break' }, fig(draw3d(p, res, { width: 520, height: 380, title: 'Rigging — 3D view' })), fig(drawCapacityChart(p, res, { width: 520, height: 300 }))));
  add(el('div', { class: 'avoid-break' }, fig(drawRiggingDetail(p, res, { height: 560 }), 'detail')));
  if (opts.sketches) {
    let lastCrane = null;
    steps.forEach((st, i) => {
      if (Number(st.radius_m) > 0) lastCrane = i;
      if (!st.sketch) return;
      const ref = Number(st.radius_m) > 0 ? i : lastCrane;
      const sr = res.steps?.[i];
      const ai = st.aiSketch ? sanitizeSvg(st.aiSketch) : null;
      add(el('div', { class: 'avoid-break seq' },
        el('div', { class: 'seqt' }, `Step ${i + 1} — ${st.name || ''}`, sr?.checks?.length ? el('span', { style: { marginLeft: '6px' } }, badge(worstStatus(sr.checks))) : null),
        ref != null ? el('div', { class: 'figs' }, fig(drawStoryPlan(p, res, ref, { width: 520, height: 340 })), fig(drawStoryElevation(p, res, ref, { width: 520, height: 340 }))) : null,
        ai ? fig(ai) : null,
      ));
    });
  }

  // ---- Calculation summary (concise)
  if (opts.calc) {
    add(el('div', { class: 'page-break' }));
    add(bar('Calculation summary'));
    const f = r.factors;
    add(el('table', { class: 'tb kvt' },
      el('tr', {}, el('th', {}, 'Design weight'), el('td', {}, `${fmt(r.W)} t`), el('th', {}, 'Rigging weight'), el('td', {}, `${fmt(r.rigWeight)} t`), el('th', {}, 'Static hook load'), el('td', {}, `${fmt(res.shlCrane)} t`)),
      el('tr', {}, el('th', {}, 'DAF'), el('td', {}, f.dafOn ? fmt(f.daf) : 'not applied'), el('th', {}, 'SKL · COG factor'), el('td', {}, `${fmt(f.skl)} · ${fmt(f.cog)}`), el('th', {}, 'Leg factor'), el('td', {}, fmt(r.fac, 3))),
      el('tr', {}, el('th', {}, 'Rig height'), el('td', {}, `${fmt(r.riggingHeight)} m above the lift points`), el('th', {}, 'Max crane util.'), el('td', {}, res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(0)} %` : '—'), el('th', {}, 'Est. tilt'), el('td', {}, r.tilt ? `${fmt(r.tilt.tilt_deg)}°` : '—')),
    ));
    add(el('div', { class: 'sub-t' }, 'Leg forces and assemblies'), legsTable(res));
    const pts = ld.liftPoints.filter((q) => q.used !== false && q.padeye !== false);
    const legOf = (id) => r.legs.find((l) => l.pointId === id && l.level !== 'top');
    if (pts.length) {
      const pq = pts[0], lg = legOf(pq.id);
      const sh = lg?.parts?.[0]?.kind === 'shackle' ? lg.parts[0].item : null;
      if (sh) add(el('div', { class: 'avoid-break' }, el('div', { class: 'sub-t' }, `Padeye / shackle fit (point ${pq.id}${pts.length > 1 ? ', same for similar points' : ''})`), fig(drawPadeyeFit(pq, sh, { width: 600, height: 240 }), 'pfit')));
    }
    const issues = opts.checksAll ? res.checks : res.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
    const nOk = res.checks.filter((c) => c.status === 'ok').length;
    add(el('div', { class: 'sub-t' }, opts.checksAll ? 'Checks' : `Checks — issues only (${nOk} other checks OK)`), issues.length ? checksTable(issues, { compact: true }) : el('div', { class: 'note ok' }, 'All checks passed.'));
  }

  // ---- Checklift + sign-off
  add(el('table', { class: 'tb avoid-break' },
    el('tr', {}, el('th', { class: 'sec' }, 'Performing the lift: Checklift')),
    el('tr', {}, el('td', {}, CHECKLIFT.map((t) => el('div', {}, `→ ${t}`)))),
  ));
  add(el('table', { class: 'tb sign avoid-break' },
    el('tr', {}, ['Prepared by', 'Checked by', 'Approved by'].map((t) => el('th', { class: 'sec' }, t))),
    el('tr', {}, [pr.preparedBy, pr.checkedBy, pr.approvedBy].map((t) => el('td', {}, t || '', el('div', { class: 'muted', style: { marginTop: '26px' } }, 'Date / signature')))),
  ));
  add(el('div', { class: 'disclaimer' }, 'Lift plan prepared with LiftPlanner (planning aid). Equipment data from manufacturer / distributor catalogues (DS Levage 2025): check every item against its certificate. The plan must be reviewed by a competent person before the lift.'));
  return rep;
}
