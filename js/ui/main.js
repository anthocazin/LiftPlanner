// UI entry point.
import { app } from './app.js';
import { el, fmt, toast, download, slug } from './dom.js';
import { defaultProject, emptyProject } from '../state.js';
import { lvState } from './loadview.js';
import * as tProject from './tabs/project.js';
import * as tLoad from './tabs/load.js';
import * as tCrane from './tabs/crane.js';
import * as tRigging from './tabs/rigging.js';
import * as tResults from './tabs/results.js';
import * as tDrawings from './tabs/drawings.js';
import * as tReport from './tabs/report.js';
import * as tInventory from './tabs/inventory.js';
import * as tSettings from './tabs/settings.js';

const TABS = [
  { id: 'project', title: 'Project', mod: tProject },
  { id: 'load', title: 'Load', mod: tLoad },
  { id: 'crane', title: 'Crane', mod: tCrane },
  { id: 'rigging', title: 'Rigging', mod: tRigging },
  { id: 'results', title: 'Checks', mod: tResults, dot: true },
  { id: 'drawings', title: 'Drawings', mod: tDrawings },
  { id: 'report', title: 'Report', mod: tReport },
  { id: 'inventory', title: 'Inventory', mod: tInventory },
  { id: 'settings', title: 'Settings', mod: tSettings },
];

// short help on top of every page, and the order of the pages (Next → buttons)
const INTRO = {
  project: ['1 / 7', 'Who, where and how: identification printed in the report header, the lift steps (with the crane radius of each one), weather limits and safety measures.'],
  load: ['2 / 7', 'The object to lift: weight, its drawing (for each view: a frame for the image, then its origin), the lift points and the COG — or use the symmetry buttons and "COG at the geometric centre".'],
  crane: ['3 / 7', 'The crane and its load chart (SWL against radius). Save a crane in "My cranes" to reuse it; a PDF load chart can be read into the table.'],
  rigging: ['4 / 7', 'From the crane hook down to the lift points: click a "+" to add an item to a leg. Sizes are chosen automatically from the force in every leg; the sling length of every leg from the target angle and its own hardware.'],
  results: ['5 / 7', 'Every check with its result. Click a warning to open the item to adjust; the grey line explains why it matters.'],
  drawings: ['6 / 7', 'The drawings of the plan (schematic, elevations, plan, components to scale), exportable as SVG / PNG.'],
  report: ['7 / 7', 'The lift plan as printed. Add your own drawings if needed, then print or save as PDF.'],
};
const FLOW = ['project', 'load', 'crane', 'rigging', 'results', 'drawings', 'report'];

let active = 'load';
let root = null;

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  const st = app.result?.status;
  for (const t of TABS) {
    nav.append(
      el(
        'button',
        { class: t.id === active ? 'active' : '', onclick: () => show(t.id) },
        t.title,
        t.dot && st ? el('span', { class: `dot ${st}` }) : null,
      ),
    );
  }
}

export function show(id) {
  active = id;
  try {
    location.hash = id;
  } catch {}
  renderTabs();
  const main = document.getElementById('main');
  main.innerHTML = '';
  root = el('div', { class: 'tab-root' });
  main.append(root);
  const t = TABS.find((x) => x.id === id) || TABS[0];
  const intro = INTRO[t.id];
  if (intro) root.append(el('div', { class: 'page-intro no-print' }, el('b', {}, `Step ${intro[0]} — ${t.title}. `), intro[1]));
  t.mod.render(root);
  const k = FLOW.indexOf(t.id);
  if (k >= 0) {
    const tt = (i) => TABS.find((x) => x.id === FLOW[i]).title;
    root.append(el('div', { class: 'next-row no-print' },
      k > 0 ? el('button', { onclick: () => show(FLOW[k - 1]) }, `← ${tt(k - 1)}`) : null,
      k < FLOW.length - 1 ? el('button', { class: 'primary', onclick: () => show(FLOW[k + 1]) }, `Next: ${tt(k + 1)} →`) : el('button', { class: 'primary', onclick: () => printReport() }, 'Print / Save as PDF')));
  }
  window.scrollTo({ top: 0 });
}

/** Full re-render of the current tab (after adding / removing rows, etc.). */
export function rerender() {
  const y = window.scrollY;
  show(active);
  window.scrollTo({ top: y });
}
window.__rerender = rerender;
/** Opens the page of a check and shows the item to adjust (ref from engine/checks). */
window.__goto = (ref) => {
  if (!ref?.tab) return;
  if (ref.tab === 'load' && ref.point) lvState.selected = ref.point;
  show(ref.tab);
  if (ref.tab === 'rigging') tRigging.focus(ref);
  if (ref.tab === 'load' && ref.point) setTimeout(() => (document.getElementById("padeye-panel") || document.querySelector(`#lp-table tr[data-id="${CSS.escape(ref.point)}"]`))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
};
window.__printReport = () => printReport();

function renderSummary(res) {
  const s = document.getElementById('summary');
  const p = app.project;
  document.getElementById('project-title').textContent = `${p.project.liftId || ''} ${p.project.name || ''}`.trim() || '—';
  s.innerHTML = '';
  if (!res || res.rig?.error) {
    s.append(el('div', { class: 'kpi status-fail' }, 'Calculation', el('b', {}, res?.rig?.error || '—')));
    return;
  }
  const r = res.rig;
  const k = (label, val, cls = '') => el('div', { class: `kpi ${cls}` }, label, el('b', {}, val));
  const nf = res.checks.filter((c) => c.status === 'fail').length;
  const nw = res.checks.filter((c) => c.status === 'warn').length;
  const stTxt = res.status === 'fail' ? `${nf} failed` : res.status === 'warn' ? `${nw} warning(s)` : 'All checks OK';
  s.append(
    k('Load (×WCF)', `${fmt(r.W)} t`),
    k('Rigging', `${fmt(r.rigWeight)} t`),
    k('Hook load', `${fmt(res.shlCrane)} t`),
    k('DAF · SKL', `${fmt(r.factors.daf)} · ${fmt(r.factors.skl)}`),
    k('Max crane util.', res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(0)} %` : '—'),
    k('Category', res.category?.cat || '—'),
    k('Status', stTxt, `status-${res.status}`),
  );
}

function wireActions() {
  document.getElementById('btn-new').onclick = () => {
    if (!confirm('Create a blank lift plan? The current project will be replaced (save it first).')) return;
    app.reset(emptyProject());
    show('project');
    toast('New lift plan');
  };
  document.getElementById('btn-example').onclick = () => {
    if (!confirm('Load the example project? The current project will be replaced.')) return;
    app.reset(defaultProject());
    show('load');
  };
  document.getElementById('btn-save').onclick = () => {
    const p = app.project;
    download(`${slug(`${p.project.liftId}-${p.project.name}`)}.liftplan.json`, JSON.stringify(p, null, 2));
    toast('Project saved (drawings, map and logos included)');
  };
  document.getElementById('file-open').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      app.detected = null;
      app.load(data);
      show(active);
      toast(`Project "${app.project.project.name}" loaded`);
    } catch (err) {
      alert(`Unreadable file: ${err.message}`);
    }
    e.target.value = '';
  };
  document.getElementById('btn-print').onclick = () => printReport();
}

export function printReport() {
  const pr = document.getElementById('print-root');
  pr.innerHTML = '';
  pr.append(tReport.buildReport());
  setTimeout(() => window.print(), 100);
}

function boot() {
  app.init();
  const h = (location.hash || '').slice(1);
  if (TABS.some((t) => t.id === h)) active = h;
  else if (h === 'story') active = 'project';
  wireActions();
  app.onChange((res) => {
    renderSummary(res);
    renderTabs();
    root?._update?.(res);
  });
  renderSummary(app.result);
  show(active);
}

boot();
