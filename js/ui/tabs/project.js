import { app } from '../app.js';
import { el, field, panel, badge } from '../dom.js';
import { ENVIRONMENTS } from '../../engine/factors.js';

export function render(root) {
  const p = 'project.';
  const info = panel(
    'Identification du levage',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Nom du levage', path: `${p}name`, type: 'text', cls: 'span2' }),
      field({ label: 'Réf. lift plan', path: `${p}liftId`, type: 'text' }),
      field({ label: 'Révision', path: `${p}revision`, type: 'text' }),
      field({ label: 'Date', path: `${p}date`, type: 'date' }),
      field({ label: 'Client / projet', path: `${p}client`, type: 'text' }),
      field({ label: 'Site / installation', path: `${p}site`, type: 'text' }),
      field({ label: 'Navire / barge', path: `${p}vessel`, type: 'text' }),
      field({ label: 'Préparé par', path: `${p}preparedBy`, type: 'text' }),
      field({ label: 'Vérifié par', path: `${p}checkedBy`, type: 'text' }),
      field({ label: 'Approuvé par', path: `${p}approvedBy`, type: 'text' }),
      field({ label: 'Description de l\'opération', path: `${p}description`, type: 'textarea', cls: 'full' }),
    ),
  );

  const env = panel(
    'Environnement & nature du levage',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Environnement', path: 'environment', type: 'select', options: Object.entries(ENVIRONMENTS) }),
      field({ label: 'Seuil "charge lourde"', path: 'flags.heavyThreshold_t', unit: 't' }),
    ),
    el(
      'div',
      { class: 'row', style: { marginTop: '10px', gap: '16px' } },
      field({ label: 'Levage en tandem (2 grues)', path: 'flags.tandem', type: 'checkbox' }),
      field({ label: 'Au-dessus d\'installations en service', path: 'flags.overLive', type: 'checkbox' }),
      field({ label: 'Levage de personnel', path: 'flags.personnel', type: 'checkbox' }),
      field({ label: 'Passage zone de déferlement / immersion', path: 'flags.subsea', type: 'checkbox' }),
      field({ label: 'Transfert navire ↔ navire / plateforme', path: 'flags.vesselToVessel', type: 'checkbox' }),
    ),
    el('div', { class: 'note', style: { marginTop: '10px' }, id: 'cat-box' }),
  );

  const weather = panel(
    'Limites météo-océaniques',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Hs max', path: 'weather.hsMax_m', unit: 'm' }),
      field({ label: 'Vent moyen max', path: 'weather.windMax_ms', unit: 'm/s' }),
      field({ label: 'Rafales max', path: 'weather.windGust_ms', unit: 'm/s' }),
      field({ label: 'Visibilité', path: 'weather.visibility', type: 'text' }),
      field({ label: 'Autres conditions', path: 'weather.notes', type: 'textarea', cls: 'full', placeholder: 'Période de houle, courant, fenêtre météo, critères d\'arrêt…' }),
    ),
  );

  const checklist = panel('Check-list avant levage', el('div', { id: 'checklist' }));
  const notes = panel('Notes / séquence détaillée', field({ path: 'notes', type: 'textarea', placeholder: 'Séquence, moyens de communication, personnel, plan de secours…' }));

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
        el('button', { class: 'small danger', title: 'Supprimer', onclick: () => { list.splice(i, 1); app.recompute(); renderChecklist(); } }, '✕'),
      ),
    );
  });
  box.append(el('button', { class: 'small', style: { marginTop: '6px' }, onclick: () => { list.push({ label: 'Nouveau point', checked: false }); app.recompute(); renderChecklist(); } }, '+ Ajouter un point'));
}

function update(res) {
  const box = document.getElementById('cat-box');
  if (!box || !res?.category) return;
  box.innerHTML = '';
  box.append(
    el('b', {}, `Catégorie indicative : ${res.category.cat} `),
    badge(res.status || 'info'),
    el('div', { class: 'muted', style: { marginTop: '4px' } }, res.category.reasons.length ? `Motifs : ${res.category.reasons.join(', ')}` : 'Aucun critère de levage complexe détecté'),
    el('div', { class: 'muted', style: { fontSize: '11px' } }, 'Classification indicative — appliquez la procédure de levage de votre entreprise / du client.'),
  );
}
