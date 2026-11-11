// UI entry point.
import { app } from './app.js';
import { el, fmt, toast, download, slug } from './dom.js';
import { defaultProject, emptyProject } from '../state.js';
import * as tProject from './tabs/project.js';
import * as tLoad from './tabs/load.js';
import * as tCrane from './tabs/crane.js';
import * as tRigging from './tabs/rigging.js';
import * as tResults from './tabs/results.js';
import * as tDrawings from './tabs/drawings.js';
import * as tStory from './tabs/storyboard.js';
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
  { id: 'story', title: 'Storyboard', mod: tStory },
  { id: 'report', title: 'Report', mod: tReport },
  { id: 'inventory', title: 'Inventory', mod: tInventory },
  { id: 'settings', title: 'Settings', mod: tSettings },
];

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
  t.mod.render(root);
  window.scrollTo({ top: 0 });
}

/** Full re-render of the current tab (after adding / removing rows, etc.). */
export function rerender() {
  const y = window.scrollY;
  show(active);
  window.scrollTo({ top: y });
}
window.__rerender = rerender;
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
