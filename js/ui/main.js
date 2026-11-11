// Point d'entrée de l'interface.
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
  { id: 'project', title: 'Projet', mod: tProject },
  { id: 'load', title: 'Charge', mod: tLoad },
  { id: 'crane', title: 'Grue', mod: tCrane },
  { id: 'rigging', title: 'Gréement', mod: tRigging },
  { id: 'results', title: 'Vérifications', mod: tResults, dot: true },
  { id: 'drawings', title: 'Schémas', mod: tDrawings },
  { id: 'story', title: 'Storyboard', mod: tStory },
  { id: 'report', title: 'Rapport', mod: tReport },
  { id: 'inventory', title: 'Inventaire', mod: tInventory },
  { id: 'settings', title: 'Réglages', mod: tSettings },
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

/** Re-rendu complet de l'onglet courant (après ajout / suppression de lignes, etc.). */
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
    s.append(el('div', { class: 'kpi status-fail' }, 'Calcul', el('b', {}, res?.rig?.error || '—')));
    return;
  }
  const r = res.rig;
  const k = (label, val, cls = '') => el('div', { class: `kpi ${cls}` }, label, el('b', {}, val));
  const nf = res.checks.filter((c) => c.status === 'fail').length;
  const nw = res.checks.filter((c) => c.status === 'warn').length;
  const stTxt = res.status === 'fail' ? `${nf} non conforme(s)` : res.status === 'warn' ? `${nw} alerte(s)` : 'Conforme';
  s.append(
    k('Charge (×WCF)', `${fmt(r.W)} t`),
    k('Gréement', `${fmt(r.rigWeight)} t`),
    k('Charge crochet', `${fmt(res.shlCrane)} t`),
    k('DAF · SKL', `${fmt(r.factors.daf)} · ${fmt(r.factors.skl)}`),
    k('Util. grue max', res.craneMaxUtil != null ? `${(res.craneMaxUtil * 100).toFixed(0)} %` : '—'),
    k('Catégorie', res.category?.cat || '—'),
    k('Statut', stTxt, `status-${res.status}`),
  );
}

function wireActions() {
  document.getElementById('btn-new').onclick = () => {
    if (!confirm('Créer un lift plan vierge ? Le projet en cours sera remplacé (pensez à l\'enregistrer).')) return;
    app.reset(emptyProject());
    show('project');
    toast('Nouveau lift plan');
  };
  document.getElementById('btn-example').onclick = () => {
    if (!confirm('Charger le projet exemple ? Le projet en cours sera remplacé.')) return;
    app.reset(defaultProject());
    show('load');
  };
  document.getElementById('btn-save').onclick = () => {
    const p = app.project;
    const out = JSON.parse(JSON.stringify(p));
    if (p.drawingEmbed && app.drawingFile?.bytes && out.drawing) {
      out.drawing.dataB64 = bytesToB64(app.drawingFile.bytes);
      out.drawing.mime = app.drawingFile.type || (app.drawingFile.kind === 'pdf' ? 'application/pdf' : 'image/png');
    }
    download(`${slug(`${p.project.liftId}-${p.project.name}`)}.liftplan.json`, JSON.stringify(out, null, 2));
    toast('Projet enregistré');
  };
  document.getElementById('file-open').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      app.drawingFile = null;
      if (data.drawing?.dataB64) {
        const bytes = b64ToBytes(data.drawing.dataB64);
        app.drawingFile = { kind: data.drawing.kind, name: data.drawing.fileName, bytes, type: data.drawing.mime };
        delete data.drawing.dataB64;
      }
      app.load(data);
      show(active);
      toast(`Projet « ${app.project.project.name} » chargé`);
    } catch (err) {
      alert(`Fichier illisible : ${err.message}`);
    }
    e.target.value = '';
  };
  document.getElementById('btn-print').onclick = () => printReport();
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
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
