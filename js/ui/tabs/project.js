// Project page: identification (lifting plan header), logos, nature of the lift, detailed
// sequence (crane radius of every step, checked against the load chart), weather, safety
// measures, communications.
import { app } from '../app.js';
import { brandLogo, setBrandLogo } from '../brand.js';
import { el, field, panel, badge, toast } from '../dom.js';
import { ENVIRONMENTS } from '../../engine/factors.js';
import { SAFETY_MEASURES } from '../../state.js';

const LS_BRAND = 'liftplanner.branding.v1';

export function render(root) {
  const p = 'project.';
  const pr = app.project.project;
  if (!Array.isArray(pr.headerLines)) pr.headerLines = ['', '', ''];
  const info = panel(
    'Lifting plan — identification',
    el('div', { class: 'fields' },
      field({ label: 'Title', path: `${p}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Reference', path: `${p}liftId`, type: 'text' }),
      field({ label: 'Revision', path: `${p}revision`, type: 'text' }),
      field({ label: 'Date', path: `${p}date`, type: 'date' }),
      field({ label: 'Client', path: `${p}client`, type: 'text' }),
      field({ label: 'Vessel / site', path: `${p}site`, type: 'text' }),
      field({ label: 'Lift location', path: `${p}location`, type: 'text', cls: 'span2' }),
      field({ label: 'Procedure / document ref.', path: `${p}reference`, type: 'text' }),
      field({ label: 'Prepared by', path: `${p}preparedBy`, type: 'text' }),
      field({ label: 'Checked by', path: `${p}checkedBy`, type: 'text' }),
      field({ label: 'Approved by', path: `${p}approvedBy`, type: 'text' }),
      field({ label: 'Description of lifting', path: `${p}description`, type: 'textarea', cls: 'full' }),
    ),
    el('h3', {}, 'Report header'),
    el('div', { class: 'fields wide' },
      field({ label: 'Header line 1 (bold)', path: `${p}headerLines.0`, type: 'text', placeholder: 'e.g. SAINT-NAZAIRE OFFSHORE WIND FARM' }),
      field({ label: 'Header line 2', path: `${p}headerLines.1`, type: 'text', placeholder: 'e.g. Inter Array Grid EPCI' }),
      field({ label: 'Header line 3 (bold)', path: `${p}headerLines.2`, type: 'text', placeholder: 'e.g. Cable repair procedure' }),
    ),
    el('div', { class: 'grid g2', style: { marginTop: '8px' } }, logoField('company', 'Company logo (left)'), logoField('client', 'Client / project logo (right)')),
    el('div', { class: 'row', style: { marginTop: '6px' } },
      el('button', { class: 'small', onclick: saveBrand, title: 'Keeps the logos and header lines in this browser for your next lift plans' }, 'Save logos & header as my defaults'),
      el('button', { class: 'small', onclick: loadBrand }, 'Use my defaults'),
    ),
  );

  const env = panel(
    'Environment & nature of the lift',
    el('div', { class: 'fields' },
      field({ label: 'Environment', path: 'environment', type: 'select', options: Object.entries(ENVIRONMENTS) }),
      field({ label: '"Heavy load" threshold', path: 'flags.heavyThreshold_t', unit: 't' }),
    ),
    el('div', { class: 'row', style: { marginTop: '10px', gap: '16px' } },
      field({ label: 'Quay → vessel', path: 'flags.quayToVessel', type: 'checkbox' }),
      field({ label: 'Vessel → quay', path: 'flags.vesselToQuay', type: 'checkbox' }),
      field({ label: 'Vessel ↔ vessel / platform', path: 'flags.vesselToVessel', type: 'checkbox' }),
      field({ label: 'Over live plant', path: 'flags.overLive', type: 'checkbox' }),
      field({ label: 'Splash zone / subsea', path: 'flags.subsea', type: 'checkbox' }),
    ),
    el('div', { class: 'note', style: { marginTop: '10px' }, id: 'cat-box' }),
  );

  const seq = panel(
    null,
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Step-by-step details of the lifting operation'),
      el('div', { class: 'row' }, el('button', { class: 'small', onclick: () => addStep() }, '+ Step')),
    ),
    el('div', { id: 'seq-table', class: 'tbl-wrap' }),
    el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Printed in the report (and editable there). The crane is checked at the working radius of the Crane page.'),
  );

  const weather = panel(
    'Design lift conditions (maximum)',
    el('div', { class: 'fields' },
      field({ label: 'Max mean wind', path: 'weather.windMax_ms', unit: 'm/s' }),
      field({ label: 'Max gusts', path: 'weather.windGust_ms', unit: 'm/s' }),
      field({ label: 'Max Hs (m)', path: 'weather.hsMax_m', type: 'text', placeholder: 'e.g. 1.5 — or N/A' }),
      field({ label: 'Visibility', path: 'weather.visibility', type: 'text' }),
      field({ label: 'Other conditions', path: 'weather.notes', type: 'textarea', cls: 'full', placeholder: 'Swell period, current, lighting, thunderstorms, weather window…' }),
    ),
  );

  const s = app.project.safety || (app.project.safety = { measures: {}, further: '', comms: {} });
  const measures = el('div', { class: 'measures' });
  SAFETY_MEASURES.forEach((m) =>
    measures.append(el('label', { class: 'check', style: { fontSize: '12.5px' } }, el('input', { type: 'checkbox', checked: !!s.measures?.[m], onchange: (e) => { s.measures = s.measures || {}; s.measures[m] = e.target.checked; app.persist(); } }), m)));
  const safety = panel(
    'Safety measures (tick as applicable)',
    measures,
    el('h3', {}, 'Further safety measures (risk assessment, SIMOPs)'),
    field({ path: 'safety.further', type: 'textarea', placeholder: 'One measure per line' }),
    el('h3', {}, 'Communications'),
    el('div', { class: 'fields' },
      field({ label: 'Primary', path: 'safety.comms.primary', type: 'text' }),
      field({ label: 'Secondary', path: 'safety.comms.secondary', type: 'text' }),
      field({ label: 'Other', path: 'safety.comms.other', type: 'text' }),
      field({ label: 'Primary checked', path: 'safety.comms.primaryChecked', type: 'checkbox' }),
      field({ label: 'Secondary checked', path: 'safety.comms.secondaryChecked', type: 'checkbox' }),
    ),
  );

  const checklist = panel('Pre-lift checklist', el('div', { id: 'checklist' }));
  root.append(
    el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, info), el('div', { class: 'grid' }, env, weather, checklist)),
    seq,
    safety,
  );
  renderSequence();
  renderChecklist();
  update(app.result);
  root._update = update;
}

function logoField(key, labelTxt) {
  const logos = app.project.logos || (app.project.logos = { company: null, client: null });
  const dflt = key === 'company' && !logos[key] ? brandLogo() : null;
  const shown = logos[key] || dflt;
  const img = shown ? el('div', {}, el('img', { src: shown, style: { maxHeight: '60px', maxWidth: '200px', display: 'block', margin: '6px 0' } }), dflt ? el('div', { class: 'muted', style: { fontSize: '11px' } }, 'Logo kept in this browser, added automatically') : null) : el('div', { class: 'muted', style: { fontSize: '12px', margin: '6px 0' } }, 'No logo');
  const inp = el('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onchange: async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      logos[key] = await shrinkImage(f, 400);
      if (key === 'company') setBrandLogo(logos[key]); // kept in this browser for the next lift plans
      app.recompute();
      window.__rerender();
    },
  });
  return el('div', { class: 'card' }, el('b', {}, labelTxt), img,
    el('div', { class: 'row' }, el('label', { class: 'btn small' }, 'Choose image…', inp), shown ? el('button', { class: 'small danger', onclick: () => { logos[key] = null; if (key === 'company') setBrandLogo(null); app.recompute(); window.__rerender(); } }, 'Remove') : null));
}

async function shrinkImage(file, maxW) {
  const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); });
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, maxW / im.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k);
  c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function saveBrand() {
  try {
    localStorage.setItem(LS_BRAND, JSON.stringify({ logos: app.project.logos, headerLines: app.project.project.headerLines }));
    toast('Saved in this browser');
  } catch {
    toast('Browser storage full');
  }
}
function loadBrand() {
  try {
    const b = JSON.parse(localStorage.getItem(LS_BRAND) || 'null');
    if (!b) return toast('No defaults saved yet');
    app.project.logos = { ...b.logos };
    if (b.headerLines) app.project.project.headerLines = [...b.headerLines];
    app.recompute();
    window.__rerender();
  } catch {
    toast('Cannot read the defaults');
  }
}

function addStep() {
  const steps = (app.project.storyboard.steps = app.project.storyboard.steps || []);
  steps.push({ note: '', responsible: '' });
  app.recompute();
  renderSequence();
}

function renderSequence() {
  const box = document.getElementById('seq-table');
  if (!box) return;
  const steps = app.project.storyboard.steps || [];
  const tb = el('tbody');
  steps.forEach((st, i) => {
    const P = `storyboard.steps.${i}.`;
    tb.append(el('tr', {},
      el('td', { class: 'num' }, String(i + 1)),
      el('td', { style: { minWidth: '420px', width: '70%' } }, el('textarea', { rows: 2, style: { width: '100%', font: 'inherit', fontSize: '12.5px', border: '1px solid var(--line)', borderRadius: '4px' }, onchange: (e) => app.set(`${P}note`, e.target.value) }, st.note || '')),
      el('td', {}, el('input', { type: 'text', value: st.responsible || '', onchange: (e) => app.set(`${P}responsible`, e.target.value) })),
      el('td', { style: { whiteSpace: 'nowrap' } },
        el('button', { class: 'small', title: 'Up', onclick: () => { if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; app.recompute(); renderSequence(); } } }, '↑'),
        el('button', { class: 'small', title: 'Down', onclick: () => { if (i < steps.length - 1) { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; app.recompute(); renderSequence(); } } }, '↓'),
        el('button', { class: 'small danger', title: 'Delete', onclick: () => { steps.splice(i, 1); app.recompute(); renderSequence(); } }, '✕')),
    ));
  });
  box.innerHTML = '';
  box.append(el('table', { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['#', 'Details', 'Responsible', ''].map((h) => el('th', {}, h)))), tb));
}

function renderChecklist() {
  const box = document.getElementById('checklist');
  if (!box) return;
  box.innerHTML = '';
  const list = app.project.checklist || [];
  list.forEach((item, i) => {
    box.append(el('div', { class: 'row', style: { borderBottom: '1px solid var(--line)', padding: '4px 0' } },
      el('input', { type: 'checkbox', checked: !!item.checked, onchange: (e) => app.set(`checklist.${i}.checked`, e.target.checked) }),
      el('input', { type: 'text', value: item.label, style: { flex: 1, border: 'none', font: 'inherit' }, onchange: (e) => app.set(`checklist.${i}.label`, e.target.value) }),
      el('button', { class: 'small danger', title: 'Delete', onclick: () => { list.splice(i, 1); app.recompute(); renderChecklist(); } }, '✕'),
    ));
  });
  box.append(el('button', { class: 'small', style: { marginTop: '6px' }, onclick: () => { list.push({ label: 'New item', checked: false }); app.recompute(); renderChecklist(); } }, '+ Add item'));
}

function update(res) {
  const box = document.getElementById('cat-box');
  if (!box || !res?.category) return;
  box.innerHTML = '';
  box.append(
    el('b', {}, `Indicative category: ${res.category.cat} `),
    badge(res.status || 'info'),
    el('div', { class: 'muted', style: { marginTop: '4px' } }, res.category.reasons.length ? `Reasons: ${res.category.reasons.join(', ')}` : 'No complex-lift criterion detected'),
    el('div', { class: 'muted', style: { fontSize: '11px' } }, 'Indicative classification — apply your company / client lifting procedure.'),
  );
}
