// Inventaire utilisateur (matériel certifié du parc) + consultation du catalogue intégré.
import { app } from '../app.js';
import { el, panel, fmt, download, toast } from '../dom.js';
import { BUILTIN_CATALOG, CATALOG_TYPES } from '../../catalog/data.js';

const DIMS = {
  shackle: [['bowDia', 'Ø arc'], ['pinDia', 'Ø axe'], ['jawWidth', 'Ouverture'], ['insideLength', 'Long. int.'], ['bowWidth', 'Larg. arc'], ['eyeDia', 'Ø œil']],
  masterlink: [['stockDia', 'Ø barre'], ['insideWidth', 'Larg. int.'], ['insideLength', 'Long. int.']],
  roundsling: [['width', 'Largeur']],
  glink: [['maxSlingWidth', 'Larg. élingue max'], ['effLength', 'Long. utile'], ['barThk', 'Ép. barre']],
  wiresling: [['width', 'Ø câble']],
  other: [['effLength', 'Long. utile']],
};

let catFilter = 'shackle';
let catSearch = '';

export function render(root) {
  const inv = panel(
    null,
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'Mon inventaire (matériel certifié)'),
      el(
        'div',
        { class: 'row' },
        el('select', { id: 'new-type' }, Object.entries(CATALOG_TYPES).filter(([k]) => k !== 'other').map(([k, v]) => el('option', { value: k }, v))),
        el('button', { class: 'small', onclick: () => addItem(document.getElementById('new-type').value) }, '+ Ajouter'),
        el('button', { class: 'small', onclick: exportInv }, 'Exporter'),
        el('label', { class: 'btn small' }, 'Importer', el('input', { type: 'file', accept: '.json', hidden: true, onchange: importInv })),
      ),
    ),
    el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '6px' } }, 'Les articles de l\'inventaire (★) sont proposés dans les listes du gréement et utilisés en priorité par la sélection automatique à WLL égale. Une élingue avec une longueur renseignée est utilisée à cette longueur. L\'inventaire est conservé dans ce navigateur et peut être exporté.'),
    el('div', { id: 'inv-table', class: 'tbl-wrap' }),
  );
  const cat = panel(null, el('div', { id: 'cat-root' }));
  root.append(el('div', { class: 'grid' }, inv, cat));
  renderInv();
  renderCatalog();
}

function uid() {
  return `U-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function addItem(type, from = null) {
  const inv = (app.project.inventory = app.project.inventory || []);
  const base = from ? JSON.parse(JSON.stringify(from)) : { type, name: `${CATALOG_TYPES[type]} — nouveau`, brand: '', model: '', wll_t: null, dims: {} };
  delete base.user;
  inv.push({ ...base, id: uid(), certNo: '', serial: '', source: from ? `Copie de ${from.id}` : 'Inventaire utilisateur' });
  app.recompute();
  renderInv();
  toast('Article ajouté à l\'inventaire');
}

function renderInv() {
  const box = document.getElementById('inv-table');
  if (!box) return;
  const inv = app.project.inventory || [];
  box.innerHTML = '';
  if (!inv.length) {
    box.append(el('div', { class: 'note' }, 'Inventaire vide. Ajoutez vos manilles / élingues / masterlinks certifiés, ou copiez un article du catalogue ci-dessous (bouton « + Inventaire »).'));
    return;
  }
  const inp = (obj, key, type = 'text', w) =>
    el('input', {
      type, step: type === 'number' ? 'any' : null, value: obj[key] ?? '', style: w ? { width: w } : null,
      onchange: (e) => { obj[key] = type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value; app.recompute(); },
    });
  const rows = inv.map((it, i) => {
    it.dims = it.dims || {};
    return el(
      'tr',
      {},
      el('td', {}, CATALOG_TYPES[it.type] || it.type),
      el('td', { style: { minWidth: '220px' } }, inp(it, 'name')),
      el('td', {}, inp(it, 'wll_t', 'number', '70px')),
      el('td', {}, it.type === 'roundsling' || it.type === 'wiresling' ? inp(it, 'weight_kg_per_m', 'number', '70px') : inp(it, 'weight_kg', 'number', '70px')),
      el('td', {}, it.type === 'roundsling' || it.type === 'wiresling' ? inp(it, 'length_m', 'number', '70px') : '—'),
      el('td', {}, el('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, (DIMS[it.type] || []).map(([k, lbl]) => el('label', { title: `${lbl} (mm)`, style: { fontSize: '10px', color: 'var(--muted)' } }, lbl, inp(it.dims, k, 'number', '62px'))))),
      el('td', {}, inp(it, 'certNo', 'text', '110px')),
      el('td', {}, inp(it, 'serial', 'text', '90px')),
      el('td', {}, el('button', { class: 'small danger', onclick: () => { inv.splice(i, 1); app.recompute(); renderInv(); } }, '✕')),
    );
  });
  box.append(el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, ['Type', 'Désignation', 'WLL (t)', 'Poids (kg | kg/m)', 'Long. (m)', 'Dimensions (mm)', 'N° certificat', 'N° série', ''].map((h) => el('th', {}, h)))), el('tbody', {}, rows)));
}

function renderCatalog() {
  const root = document.getElementById('cat-root');
  if (!root) return;
  root.innerHTML = '';
  const items = BUILTIN_CATALOG.filter((i) => i.type === catFilter && (!catSearch || i.name.toLowerCase().includes(catSearch.toLowerCase())));
  const keys = DIMS[catFilter] || [];
  root.append(
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'Catalogue intégré'),
      el(
        'div',
        { class: 'row' },
        ...['shackle', 'masterlink', 'roundsling', 'glink'].map((t) => el('button', { class: `small ${catFilter === t ? 'active' : ''}`, onclick: () => { catFilter = t; renderCatalog(); } }, CATALOG_TYPES[t])),
        el('input', { type: 'search', placeholder: 'Filtrer…', value: catSearch, oninput: (e) => { catSearch = e.target.value; renderCatalog(); }, style: { padding: '4px 8px', border: '1px solid var(--line)', borderRadius: '6px' } }),
      ),
    ),
    el(
      'div',
      { class: 'tbl-wrap', style: { maxHeight: '480px', overflowY: 'auto' } },
      el(
        'table',
        { class: 'data compact' },
        el('thead', {}, el('tr', {}, ['Désignation', 'WLL (t)', 'CU', ...keys.map((k) => `${k[1]} (mm)`), 'Poids', 'Source', ''].map((h) => el('th', {}, h)))),
        el(
          'tbody',
          {},
          items.map((it) =>
            el(
              'tr',
              {},
              el('td', {}, it.colorHex ? el('span', { style: { display: 'inline-block', width: '10px', height: '10px', background: it.colorHex, borderRadius: '2px', marginRight: '6px' } }) : null, it.name),
              el('td', { class: 'num' }, fmt(it.wll_t)),
              el('td', { class: 'num' }, it.mbl_factor ? `${it.mbl_factor}:1` : ''),
              ...keys.map(([k]) => el('td', { class: 'num' }, fmt(it.dims?.[k], 0))),
              el('td', { class: 'num' }, it.weight_kg != null ? `${fmt(it.weight_kg, 2)} kg` : it.weight_kg_per_m != null ? `${fmt(it.weight_kg_per_m, 2)} kg/m` : '—'),
              el('td', { class: 'muted', style: { fontSize: '11px' } }, it.source || ''),
              el('td', {}, el('button', { class: 'small', title: 'Copier dans mon inventaire pour y ajouter n° de certificat / série', onclick: () => addItem(it.type, it) }, '+ Inventaire')),
            ),
          ),
        ),
      ),
    ),
    el('div', { class: 'note warn', style: { marginTop: '8px', fontSize: '12px' } }, 'Données relevées sur les fiches publiques des fabricants / distributeurs. Les largeurs et poids des élingues rondes sont des valeurs typiques. Vérifiez toujours contre le certificat du matériel utilisé.'),
  );
}

function exportInv() {
  download('inventaire-levage.json', JSON.stringify(app.project.inventory || [], null, 2));
}

async function importInv(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data)) throw new Error('format attendu : tableau d\'articles');
    const inv = (app.project.inventory = app.project.inventory || []);
    data.forEach((it) => inv.push({ ...it, id: it.id || uid() }));
    app.recompute();
    renderInv();
    toast(`${data.length} article(s) importé(s)`);
  } catch (err) {
    alert(`Import impossible : ${err.message}`);
  }
}
