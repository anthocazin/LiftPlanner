// Drawings: rigging arrangement (on the load drawing + 3D), components to scale, and one sketch
// per step of the detailed sequence (plan + elevation), optionally drawn by Claude.
import { app } from '../app.js';
import { el, panel, toast } from '../dom.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { drawRiggingDetail } from '../../draw/detail.js';
import { drawStoryPlan, drawStoryElevation } from '../../draw/story.js';
import { staticViewSvg } from '../loadview.js';
import { draw3d } from '../../draw/view3d.js';
import { viewer3d } from '../viewer3d.js';
import { figure } from '../figure.js';
import { niceName } from '../../catalog/index.js';

const opts = { labels: true, forces: true, dims: true };
const LS_KEY = 'liftplanner.claude.key';
const LS_MODEL = 'liftplanner.claude.model';

export function render(root) {
  const tog = (k, t) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: opts[k], onchange: (e) => { opts[k] = e.target.checked; update(app.result); } }), t);
  root.append(
    panel(null,
      el('div', { class: 'panel-head' }, el('h2', {}, 'Drawings'), el('div', { class: 'row', style: { gap: '14px' } }, tog('labels', 'Labels'), tog('forces', 'Forces / angles'), tog('dims', 'Dimensions'))),
      el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Every drawing exports as SVG (vector, editable in Inkscape / Illustrator / PowerPoint) or PNG. The step sketches follow the detailed sequence of the Project page (steps ticked "Sketch").'),
    ),
    el('div', { id: 'draw-root', class: 'grid' }),
  );
  update(app.result);
  root._update = update;
}

function update(res) {
  const box = document.getElementById('draw-root');
  if (!box) return;
  box.innerHTML = '';
  const p = app.project;
  const hasImg = p.load.views?.xy?.image || p.load.views?.xz?.image;
  box.append(
    panel('Rigging arrangement',
      hasImg ? el('div', { class: 'grid g2' }, figure(staticViewSvg('xy', p, res, { width: 640, height: 400, title: 'Rigging on the drawing — plan XY' }), 'rigging-on-drawing-xy'), figure(staticViewSvg('xz', p, res, { width: 640, height: 400, title: 'Rigging on the drawing — elevation XZ' }), 'rigging-on-drawing-xz')) : null,
      el('div', { class: 'grid g2' },
        viewer3d({ height: 520, title: '' }),
        el('div', { class: 'grid' }, figure(drawRiggingView(p, res, 'front', { width: 640, height: 260, ...opts }), 'rigging-front'), figure(drawRiggingView(p, res, 'side', { width: 640, height: 260, ...opts }), 'rigging-side'))),
    ),
    panel('Rigging detail (components to scale)', figure(drawRiggingDetail(p, res, { height: 680 }), 'rigging-detail')),
  );
  // sequence sketches
  const steps = p.storyboard?.steps || [];
  const seq = panel(null, el('div', { class: 'panel-head' }, el('h2', {}, 'Sequence sketches'), claudeSettings()));
  let lastCrane = null;
  let nSk = 0;
  steps.forEach((st, i) => {
    if (Number(st.radius_m) > 0) lastCrane = i;
    if (!st.sketch) return;
    nSk++;
    const ref = Number(st.radius_m) > 0 ? i : lastCrane;
    const figs = ref != null
      ? [figure(drawStoryPlan(p, res, ref, { width: 560, height: 400 }), `step-${i + 1}-plan`), figure(drawStoryElevation(p, res, ref, { width: 560, height: 400 }), `step-${i + 1}-elevation`)]
      : [figure(draw3d(p, res, { width: 560, height: 400, labels: opts.labels, forces: opts.forces, title: 'Rigging — 3D' }), `step-${i + 1}-rigging`)];
    const safe = st.aiSketch ? sanitizeSvg(st.aiSketch) : null;
    const ai = safe ? figure(safe, `step-${i + 1}-claude-sketch`) : null;
    seq.append(el('section', { class: 'seq-step avoid-break' },
      el('div', { class: 'panel-head' },
        el('h3', { style: { margin: 0 } }, `Step ${i + 1} — ${st.name || ''}`),
        el('div', { class: 'row' },
          st.responsible ? el('span', { class: 'muted' }, st.responsible) : null,
          el('button', { class: 'small', title: 'Ask Claude to draw a sketch of this step from its description (needs your API key)', onclick: () => claudeSketch(i) }, st.aiSketch ? 'Redraw with Claude' : 'Sketch with Claude'),
          st.aiSketch ? el('button', { class: 'small danger', onclick: () => { delete st.aiSketch; app.recompute(); } }, 'Remove Claude sketch') : null),
      ),
      st.note ? el('div', { class: 'note', style: { margin: '6px 0' } }, st.note) : null,
      ref != null && ref !== i ? el('div', { class: 'muted', style: { fontSize: '12px' } }, `Crane position of step ${ref + 1}.`) : null,
      el('div', { class: 'story-step' }, ...figs),
      ai ? el('div', { style: { marginTop: '8px' } }, el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Sketch drawn by Claude from the description — check it before use.'), ai) : null,
    ));
  });
  if (!nSk) seq.append(el('div', { class: 'note' }, 'No step is ticked "Sketch" in the detailed sequence (Project page).'));
  box.append(seq);
}

// ---------------- optional: sketch drawn by Claude from the step description
function claudeSettings() {
  let key = '';
  try { key = localStorage.getItem(LS_KEY) || ''; } catch {}
  return el('details', { class: 'claude-cfg' },
    el('summary', { class: 'muted', style: { fontSize: '12px', cursor: 'pointer' } }, key ? 'Claude sketches: API key set' : 'Claude sketches (optional)'),
    el('div', { class: 'fields', style: { minWidth: '420px' } },
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Anthropic API key (kept in this browser only)'), el('input', { type: 'password', value: key, placeholder: 'sk-ant-…', onchange: (e) => { try { localStorage.setItem(LS_KEY, e.target.value.trim()); } catch {} toast('Key saved in this browser'); } })),
      el('label', { class: 'field' }, el('span', { class: 'lbl' }, 'Model'), el('input', { type: 'text', value: (() => { try { return localStorage.getItem(LS_MODEL) || 'claude-sonnet-5-5'; } catch { return 'claude-sonnet-5-5'; } })(), onchange: (e) => { try { localStorage.setItem(LS_MODEL, e.target.value.trim()); } catch {} } })),
    ),
    el('p', { class: 'muted', style: { fontSize: '11.5px', maxWidth: '520px' } }, 'The step text, the load, rigging and crane data are sent to the Anthropic API to get an SVG sketch. The key never leaves this browser except to api.anthropic.com and is not saved in the project file.'),
  );
}

function context(i) {
  const p = app.project, res = app.result, rig = res?.rig;
  const st = p.storyboard.steps[i];
  const legs = rig && !rig.error ? rig.legs.map((l) => `${l.label}: ${l.parts.map((q) => niceName(q.item)).join(' → ')}, ${l.angleV.toFixed(0)}° to vertical, length ${l.Leff.toFixed(2)} m`).join('; ') : 'not calculated';
  const prev = p.storyboard.steps.slice(0, i + 1).filter((s) => Number(s.radius_m) > 0).pop();
  return [
    `Lift: ${p.project.name} (${p.environment}). ${p.project.description || ''}`,
    `Load: ${p.load.name}, ${p.load.weight_t} t, overall ${p.load.dims_mm.L} × ${p.load.dims_mm.W} × ${p.load.dims_mm.H} mm.`,
    `Rigging (${p.rigging.type === 'spreader' ? 'spreader bar' : 'direct to hook'}): ${legs}. Hook about ${rig?.riggingHeight?.toFixed(2) ?? '?'} m above the lift points.`,
    `Crane: ${p.crane.name} ${p.crane.configuration || ''}. ${prev ? `Radius ${prev.radius_m} m, slew ${prev.slew_deg ?? 0}°, load underside ${prev.loadElevation_m ?? 0} m above the reference level.` : ''}`,
    `Obstacles: ${(p.storyboard.obstacles || []).map((o) => `${o.name} (h ${o.h} m)`).join(', ') || 'none'}.`,
    `Sequence: ${p.storyboard.steps.map((s, k) => `${k + 1}. ${s.name}`).join(' / ')}.`,
    `THIS STEP (${i + 1}): ${st.name}. ${st.note || ''} Responsible: ${st.responsible || '-'}.`,
  ].join('\n');
}

async function claudeSketch(i) {
  let key = '', model = 'claude-sonnet-5-5';
  try { key = localStorage.getItem(LS_KEY) || ''; model = localStorage.getItem(LS_MODEL) || model; } catch {}
  if (!key) {
    alert('Enter your Anthropic API key in "Claude sketches (optional)" first.');
    return;
  }
  const prompt = `You draw schematic technical sketches for offshore / onshore lifting plans (storyboards).\n\n${context(i)}\n\n` +
    'Draw ONE clean schematic sketch of THIS STEP only, in the most useful view (side elevation or plan). Show the crane (simplified), the hook, the rigging, the load, the relevant structures / obstacles / vessel / quay, arrows for the movement and short labels. ' +
    'Engineering drawing style: thin dark lines, light fills, sans-serif labels, no decorative elements, no people. ' +
    'Reply with ONLY an <svg> element (viewBox="0 0 900 520", xmlns set), no scripts, no external images or fonts, no text outside the svg.';
  toast('Asking Claude for a sketch…');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 12000, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
    const txt = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const svg = sanitizeSvg(txt);
    if (!svg) throw new Error('No SVG in the answer');
    app.project.storyboard.steps[i].aiSketch = svg;
    app.recompute();
    toast('Sketch received');
  } catch (e) {
    alert(`Claude sketch failed: ${e.message}`);
  }
}

/** Keeps a single, inert SVG (no scripts, event handlers, external links or foreign content). */
export function sanitizeSvg(txt) {
  const m = String(txt).match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  root.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, a').forEach((n) => n.remove());
  const walk = (node) => {
    for (const a of [...(node.attributes || [])]) {
      const nm = a.name.toLowerCase();
      const v = a.value.trim().toLowerCase();
      if (nm.startsWith('on')) node.removeAttribute(a.name);
      else if ((nm === 'href' || nm === 'xlink:href') && !v.startsWith('#')) node.removeAttribute(a.name);
      else if (nm === 'style' && /url\(\s*['"]?(?!#)/.test(v)) node.removeAttribute(a.name);
    }
    [...node.children].forEach(walk);
  };
  walk(root);
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', '0 0 900 520');
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.setAttribute('style', 'background:#fff;width:100%;height:auto');
  return new XMLSerializer().serializeToString(root);
}
