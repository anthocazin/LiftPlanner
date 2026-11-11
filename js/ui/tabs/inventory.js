// User inventory (certified equipment of your own fleet) + browser for the built-in catalogue.
import { app } from '../app.js';
import { el, panel, fmt, download, toast, badge } from '../dom.js';
import { BUILTIN_CATALOG, CATALOG_TYPES } from '../../catalog/data.js';

const DIMS = {
  shackle: [['bowDia', 'Bow Ø'], ['pinDia', 'Pin Ø'], ['jawWidth', 'Jaw'], ['insideLength', 'Inside L'], ['bowWidth', 'Bow width'], ['eyeDia', 'Eye Ø']],
  masterlink: [['stockDia', 'Stock Ø'], ['insideWidth', 'Inside W'], ['insideLength', 'Inside L']],
  roundsling: [['width', 'Width']],
  wiresling: [['ropeDia', 'Rope Ø']],
  grommet: [['ropeDia', 'Body Ø'], ['componentDia', 'Strand Ø']],
  webbing: [['width', 'Width']],
  glink: [['maxSlingWidth', 'Max sling W'], ['effLength', 'Eff. length'], ['barThk', 'Bar thk.']],
  chain: [['dia', 'Chain Ø'], ['pitch', 'Pitch'], ['width', 'Outside W']],
  connlink: [['length', 'Length A'], ['width', 'Width B'], ['barThk', 'Section C'], ['effLength', 'Eff. length']],
  other: [['effLength', 'Eff. length']],
};
const SLINGS = ['roundsling', 'wiresling', 'grommet', 'webbing'];

let catFilter = 'shackle';
let catSearch = '';

export function render(root) {
  const inv = panel(
    null,
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, 'My inventory (certified equipment)'),
      el(
        'div',
        { class: 'row' },
        el('select', { id: 'new-type' }, Object.entries(CATALOG_TYPES).filter(([k]) => k !== 'other').map(([k, v]) => el('option', { value: k }, v))),
        el('button', { class: 'small', onclick: () => addItem(document.getElementById('new-type').value) }, '+ Add'),
        el('button', { class: 'small', onclick: exportInv }, 'Export'),
        el('label', { class: 'btn small' }, 'Import', el('input', { type: 'file', accept: '.json', hidden: true, onchange: importInv })),
      ),
    ),
    el(
      'div',
      { class: 'muted', style: { fontSize: '12px', marginBottom: '6px' } },
      'Inventory items (★) are offered in the rigging lists and preferred by the automatic selection at equal WLL. A sling with a length entered is used at that length. The inventory is kept in this browser and can be exported.',
    ),
    el('div', { id: 'inv-table', class: 'tbl-wrap' }),
  );
  const cat = panel(null, el('div', { id: 'cat-root' }));
  const need = panel(null, el('div', { id: 'need-root' }));
  root.append(el('div', { class: 'grid' }, need, inv, cat));
  renderNeed(app.result);
  renderInv();
  renderCatalog();
  root._update = renderNeed;
}

/** Equipment needed for this lift: exact quantities, on-hand check, certificate numbers. */
function renderNeed(res) {
  const box = document.getElementById('need-root');
  if (!box) return;
  box.innerHTML = '';
  const bom = res?.bom || [];
  const chk = (app.project.equipmentCheck = app.project.equipmentCheck || {});
  const inv = app.project.inventory || [];
  const onHandCount = bom.filter((b) => chk[b.key]?.onHand).length;
  const totQty = bom.reduce((s, b) => s + b.qty, 0);
  box.append(
    el('div', { class: 'panel-head' },
      el('h2', {}, 'Equipment for this lift — check it is on hand'),
      el('div', { class: 'row' },
        el('span', {}, `${onHandCount} / ${bom.length} lines on hand · ${totQty} items`),
        onHandCount === bom.length && bom.length ? badge('ok') : badge('warn'),
        el('button', { class: 'small', onclick: () => exportNeed(bom, chk) }, 'Export CSV'),
      ),
    ),
  );
  if (!bom.length) {
    box.append(el('div', { class: 'note warn' }, res?.rig?.error || 'No rigging calculated yet.'));
    return;
  }
  const tb = el('tbody');
  bom.forEach((b) => {
    const c = (chk[b.key] = chk[b.key] || { onHand: false, certNo: '', notes: '' });
    const inInv = b.item?.user || inv.some((i) => i.id === b.item?.id);
    tb.append(el('tr', {},
      el('td', { style: { textAlign: 'center' } }, el('input', { type: 'checkbox', checked: !!c.onHand, onchange: (e) => { c.onHand = e.target.checked; app.persist(); renderNeed(app.result); } })),
      el('td', { class: 'num' }, el('b', {}, b.qty)),
      el('td', {}, b.name, inInv ? el('span', { class: 'muted' }, ' ★ inventory') : null),
      el('td', { class: 'num' }, b.ewl_m != null ? (b.links ? `${b.links} links` : `${fmt(b.ewl_m)} m`) : 'n/a'),
      el('td', { class: 'num' }, b.wll_t != null ? `${fmt(b.wll_t)} t` : '—'),
      el('td', { style: { fontSize: '12px' } }, b.config || [...new Set(b.where)].join(', ')),
      el('td', {}, el('input', { type: 'text', value: c.certNo || b.certNo || '', placeholder: 'cert. / serial no.', onchange: (e) => { c.certNo = e.target.value; app.persist(); } })),
    ));
  });
  box.append(el('div', { class: 'tbl-wrap' }, el('table', { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['On hand', 'Qty', 'Item', 'EWL / length', 'WLL', 'Configuration', 'Certificate no.'].map((h) => el('th', {}, h)))), tb)));
  box.append(el('p', { class: 'muted', style: { fontSize: '12px' } }, 'Quantities come from the rigging calculated on the Rigging page (one line per size and length). Tick each line once the item is physically checked, tagged and its certificate in date. The list is printed in the report.'));
}

function exportNeed(bom, chk) {
  const rows = [['On hand', 'Qty', 'Item', 'EWL / length', 'WLL_t', 'Configuration', 'Certificate']];
  bom.forEach((b) => rows.push([chk[b.key]?.onHand ? 'yes' : 'no', b.qty, b.name, b.ewl_m != null ? (b.links ? `${b.links} links` : b.ewl_m) : 'n/a', b.wll_t ?? '', b.config || '', chk[b.key]?.certNo || '']));
  download('lift-equipment-check.csv', '\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}

function uid() {
  return `U-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function addItem(type, from = null) {
  const inv = (app.project.inventory = app.project.inventory || []);
  const base = from ? JSON.parse(JSON.stringify(from)) : { type, name: `${CATALOG_TYPES[type]} — new`, brand: '', model: '', wll_t: null, dims: {} };
  delete base.user;
  inv.push({ ...base, id: uid(), certNo: '', serial: '', source: from ? `Copy of ${from.id}` : 'User inventory' });
  app.recompute();
  renderInv();
  toast('Item added to the inventory');
}

function renderInv() {
  const box = document.getElementById('inv-table');
  if (!box) return;
  const inv = app.project.inventory || [];
  box.innerHTML = '';
  if (!inv.length) {
    box.append(el('div', { class: 'note' }, 'Inventory is empty. Add your certified shackles / slings / master links, or copy a catalogue item below ("+ Inventory" button).'));
    return;
  }
  const inp = (obj, key, type = 'text', w) =>
    el('input', {
      type, step: type === 'number' ? 'any' : null, value: obj[key] ?? '', style: w ? { width: w } : null,
      onchange: (e) => { obj[key] = type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value; app.recompute(); },
    });
  const rows = inv.map((it, i) => {
    it.dims = it.dims || {};
    const isSling = SLINGS.includes(it.type);
    return el(
      'tr',
      {},
      el('td', {}, CATALOG_TYPES[it.type] || it.type),
      el('td', { style: { minWidth: '220px' } }, inp(it, 'name')),
      el('td', {}, inp(it, 'wll_t', 'number', '70px')),
      el('td', {}, isSling ? inp(it, 'weight_kg_per_m', 'number', '70px') : inp(it, 'weight_kg', 'number', '70px')),
      el('td', {}, isSling ? inp(it, 'length_m', 'number', '70px') : '—'),
      el('td', {}, el('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, (DIMS[it.type] || []).map(([k, lbl]) => el('label', { title: `${lbl} (mm)`, style: { fontSize: '10px', color: 'var(--muted)' } }, lbl, inp(it.dims, k, 'number', '62px'))))),
      el('td', {}, inp(it, 'certNo', 'text', '110px')),
      el('td', {}, inp(it, 'serial', 'text', '90px')),
      el('td', {}, el('button', { class: 'small danger', onclick: () => { inv.splice(i, 1); app.recompute(); renderInv(); } }, '✕')),
    );
  });
  box.append(
    el(
      'table',
      { class: 'data compact' },
      el('thead', {}, el('tr', {}, ['Type', 'Description', 'WLL (t)', 'Weight (kg | kg/m)', 'Length (m)', 'Dimensions (mm)', 'Certificate no.', 'Serial no.', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows),
    ),
  );
}

function renderCatalog() {
  const root = document.getElementById('cat-root');
  if (!root) return;
  root.innerHTML = '';
  const items = BUILTIN_CATALOG.filter((i) => i.type === catFilter && (!catSearch || `${i.name} ${i.model || ''}`.toLowerCase().includes(catSearch.toLowerCase())));
  const keys = DIMS[catFilter] || [];
  root.append(
    el(
      'div',
      { class: 'panel-head' },
      el('h2', {}, `Built-in catalogue (${BUILTIN_CATALOG.length} items)`),
      el(
        'div',
        { class: 'row' },
        ...['shackle', 'masterlink', 'roundsling', 'wiresling', 'grommet', 'webbing', 'chain', 'connlink', 'glink'].map((t) =>
          el('button', { class: `small ${catFilter === t ? 'active' : ''}`, onclick: () => { catFilter = t; renderCatalog(); } }, CATALOG_TYPES[t]),
        ),
        el('input', { type: 'search', placeholder: 'Filter…', value: catSearch, oninput: (e) => { catSearch = e.target.value; renderCatalog(); }, style: { padding: '4px 8px', border: '1px solid var(--line)', borderRadius: '6px' } }),
      ),
    ),
    el(
      'div',
      { class: 'tbl-wrap', style: { maxHeight: '480px', overflowY: 'auto' } },
      el(
        'table',
        { class: 'data compact' },
        el('thead', {}, el('tr', {}, ['Description', 'WLL (t)', 'SF', ...keys.map((k) => `${k[1]} (mm)`), 'Weight', 'Source', ''].map((h) => el('th', {}, h)))),
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
              el('td', {}, el('button', { class: 'small', title: 'Copy into my inventory to add certificate / serial numbers', onclick: () => addItem(it.type, it) }, '+ Inventory')),
            ),
          ),
        ),
      ),
    ),
    el(
      'div',
      { class: 'note warn', style: { marginTop: '8px', fontSize: '12px' } },
      'Data taken from public manufacturer / distributor literature (mainly the DS Levage 2025 catalogue). Some values are typical or estimated (see Source column). Always check against the certificate of the equipment used.',
    ),
  );
}

function exportInv() {
  download('rigging-inventory.json', JSON.stringify(app.project.inventory || [], null, 2));
}

async function importInv(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data)) throw new Error('expected an array of items');
    const inv = (app.project.inventory = app.project.inventory || []);
    data.forEach((it) => inv.push({ ...it, id: it.id || uid() }));
    app.recompute();
    renderInv();
    toast(`${data.length} item(s) imported`);
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  }
}
