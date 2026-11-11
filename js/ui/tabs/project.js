import { app } from '../app.js';
import { el, field, panel, badge } from '../dom.js';
import { ENVIRONMENTS } from '../../engine/factors.js';

export function render(root) {
  const p = 'project.';
  const info = panel(
    'Lift identification',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Lift name', path: `${p}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Lift plan ref.', path: `${p}liftId`, type: 'text' }),
      field({ label: 'Revision', path: `${p}revision`, type: 'text' }),
      field({ label: 'Date', path: `${p}date`, type: 'date' }),
      field({ label: 'Client / project', path: `${p}client`, type: 'text' }),
      field({ label: 'Site / installation', path: `${p}site`, type: 'text' }),
      field({ label: 'Vessel / barge', path: `${p}vessel`, type: 'text' }),
      field({ label: 'Prepared by', path: `${p}preparedBy`, type: 'text' }),
      field({ label: 'Checked by', path: `${p}checkedBy`, type: 'text' }),
      field({ label: 'Approved by', path: `${p}approvedBy`, type: 'text' }),
      field({ label: 'Description of the operation', path: `${p}description`, type: 'textarea', cls: 'full' }),
    ),
  );

  const env = panel(
    'Environment & type of lift',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Environment', path: 'environment', type: 'select', options: Object.entries(ENVIRONMENTS) }),
      field({ label: '"Heavy load" threshold', path: 'flags.heavyThreshold_t', unit: 't' }),
    ),
    el(
      'div',
      { class: 'row', style: { marginTop: '10px', gap: '16px' } },
      field({ label: 'Tandem lift (2 cranes)', path: 'flags.tandem', type: 'checkbox' }),
      field({ label: 'Over live plant', path: 'flags.overLive', type: 'checkbox' }),
      field({ label: 'Personnel lift', path: 'flags.personnel', type: 'checkbox' }),
      field({ label: 'Splash zone / subsea', path: 'flags.subsea', type: 'checkbox' }),
      field({ label: 'Vessel ↔ vessel / platform transfer', path: 'flags.vesselToVessel', type: 'checkbox' }),
    ),
    el('div', { class: 'note', style: { marginTop: '10px' }, id: 'cat-box' }),
  );

  const weather = panel(
    'Weather limits',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Max Hs', path: 'weather.hsMax_m', unit: 'm' }),
      field({ label: 'Max mean wind', path: 'weather.windMax_ms', unit: 'm/s' }),
      field({ label: 'Max gusts', path: 'weather.windGust_ms', unit: 'm/s' }),
      field({ label: 'Visibility', path: 'weather.visibility', type: 'text' }),
      field({ label: 'Other conditions', path: 'weather.notes', type: 'textarea', cls: 'full', placeholder: 'Swell period, current, weather window, stop criteria…' }),
    ),
  );

  const checklist = panel('Pre-lift checklist', el('div', { id: 'checklist' }));
  const notes = panel('Notes / detailed sequence', field({ path: 'notes', type: 'textarea', placeholder: 'Sequence, communication, personnel, rescue plan…' }));

  root.append(el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, info, notes), el('div', { class: 'grid' }, env, weather, checklist)));
  renderChecklist();
  update(app.result);
  root._update = update;
}

function renderChecklist() {
  const box = document.getElementById('checklist');
  if (!box) return;
  box.innerHTML = '';
  const list = app.project.checklist || [];
  list.forEach((item, i) => {
    box.append(
      el(
        'div',
        { class: 'row', style: { borderBottom: '1px solid var(--line)', padding: '4px 0' } },
        el('input', { type: 'checkbox', checked: !!item.checked, onchange: (e) => app.set(`checklist.${i}.checked`, e.target.checked) }),
        el('input', { type: 'text', value: item.label, style: { flex: 1, border: 'none', font: 'inherit' }, onchange: (e) => app.set(`checklist.${i}.label`, e.target.value) }),
        el('button', { class: 'small danger', title: 'Delete', onclick: () => { list.splice(i, 1); app.recompute(); renderChecklist(); } }, '✕'),
      ),
    );
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
