import { app } from '../app.js';
import { el, field, cell, panel, badge, fmt } from '../dom.js';
import { drawStoryPlan, drawStoryElevation } from '../../draw/story.js';
import { figure } from '../figure.js';
import { worstStatus } from '../../engine/compute.js';

export function render(root) {
  const S = 'storyboard.';
  const site = panel(
    'Crane position',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Position X', path: `${S}crane.x`, unit: 'm' }),
      field({ label: 'Position Y', path: `${S}crane.y`, unit: 'm' }),
      field({ label: 'Carrier heading', path: `${S}crane.heading_deg`, unit: '°' }),
      field({ label: 'Footprint length', path: `${S}crane.footprint.L`, unit: 'm' }),
      field({ label: 'Footprint width', path: `${S}crane.footprint.W`, unit: 'm' }),
    ),
    el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'Site frame in metres, crane slewing axis at (X, Y). Slew angle measured from the X axis, counter-clockwise.'),
  );
  const obs = panel(
    null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Obstacles / areas'), el('button', { class: 'small', onclick: addObstacle }, '+ Obstacle')),
    el('div', { id: 'obs-table', class: 'tbl-wrap' }),
  );
  const steps = panel(
    null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Lift steps'), el('button', { class: 'small', onclick: addStep }, '+ Step')),
    el('div', { id: 'steps-table', class: 'tbl-wrap' }),
    el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'Elevation = height of the underside of the load above the crane reference level (ground / deck). It is used for the hook height check.'),
  );
  root.append(el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, site, obs), steps), el('div', { id: 'story-cards', class: 'grid', style: { marginTop: '14px' } }));
  renderTables();
  update(app.result);
  root._update = update;
}

function renderTables() {
  const sb = app.project.storyboard;
  const ob = document.getElementById('obs-table');
  if (ob) {
    ob.innerHTML = '';
    ob.append(
      el(
        'table',
        { class: 'data compact' },
        el('thead', {}, el('tr', {}, ['Name', 'X (m)', 'Y (m)', 'Length (m)', 'Width (m)', 'Height (m)', 'Rot. °', 'Colour', ''].map((h) => el('th', {}, h)))),
        el(
          'tbody',
          {},
          sb.obstacles.map((o, i) =>
            el(
              'tr',
              {},
              el('td', {}, cell(`storyboard.obstacles.${i}.name`, 'text')),
              ...['x', 'y', 'sx', 'sy', 'h', 'rot_deg'].map((k) => el('td', {}, cell(`storyboard.obstacles.${i}.${k}`, 'number'))),
              el('td', {}, el('input', { type: 'color', value: o.color || '#9aa5b1', onchange: (e) => { o.color = e.target.value; app.recompute(); } })),
              el('td', {}, el('button', { class: 'small danger', onclick: () => { sb.obstacles.splice(i, 1); app.recompute(); renderTables(); } }, '✕')),
            ),
          ),
        ),
      ),
    );
  }
  const st = document.getElementById('steps-table');
  if (st) {
    st.innerHTML = '';
    st.append(
      el(
        'table',
        { class: 'data compact' },
        el('thead', {}, el('tr', {}, ['#', 'Name', 'Radius (m)', 'Slew °', 'Elevation (m)', 'Load heading °', 'Note', ''].map((h) => el('th', {}, h)))),
        el(
          'tbody',
          {},
          sb.steps.map((s, i) =>
            el(
              'tr',
              {},
              el('td', {}, i + 1),
              el('td', { style: { minWidth: '160px' } }, cell(`storyboard.steps.${i}.name`, 'text')),
              ...['radius_m', 'slew_deg', 'loadElevation_m', 'heading_deg'].map((k) => el('td', { style: { width: '90px' } }, cell(`storyboard.steps.${i}.${k}`, 'number'))),
              el('td', { style: { minWidth: '200px' } }, cell(`storyboard.steps.${i}.note`, 'text')),
              el(
                'td',
                { style: { whiteSpace: 'nowrap' } },
                el('button', { class: 'small', title: 'Move up', onclick: () => move(i, -1) }, '↑'),
                el('button', { class: 'small', title: 'Move down', onclick: () => move(i, 1) }, '↓'),
                el('button', { class: 'small danger', onclick: () => { sb.steps.splice(i, 1); app.recompute(); renderTables(); } }, '✕'),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

function move(i, d) {
  const s = app.project.storyboard.steps;
  const j = i + d;
  if (j < 0 || j >= s.length) return;
  [s[i], s[j]] = [s[j], s[i]];
  app.recompute();
  renderTables();
}

function addObstacle() {
  app.project.storyboard.obstacles.push({ name: 'Obstacle', x: 8, y: 8, sx: 3, sy: 3, h: 2, rot_deg: 0, color: '#9aa5b1' });
  app.recompute();
  renderTables();
}
function addStep() {
  const s = app.project.storyboard.steps;
  const last = s[s.length - 1] || { radius_m: app.project.crane.radius_m || 10, slew_deg: 0, loadElevation_m: 0, heading_deg: 0 };
  s.push({ name: `${s.length + 1}. New step`, radius_m: last.radius_m, slew_deg: (Number(last.slew_deg) || 0) + 30, loadElevation_m: last.loadElevation_m, heading_deg: last.heading_deg, note: '' });
  app.recompute();
  renderTables();
}

function update(res) {
  const box = document.getElementById('story-cards');
  if (!box) return;
  box.innerHTML = '';
  const p = app.project;
  box.append(panel('Overview', figure(drawStoryPlan(p, res, null, { width: 900, height: 520 }), 'storyboard-site-plan')));
  p.storyboard.steps.forEach((st, i) => {
    const sr = res?.steps?.[i];
    const stat = sr ? worstStatus(sr.checks) : 'info';
    box.append(
      el(
        'section',
        { class: 'panel avoid-break' },
        el('div', { class: 'panel-head' }, el('h2', {}, st.name || `Step ${i + 1}`), badge(stat)),
        st.note ? el('div', { class: 'note', style: { marginBottom: '8px' } }, st.note) : null,
        el('div', { class: 'story-step' }, figure(drawStoryPlan(p, res, i, { width: 560, height: 420 }), `step-${i + 1}-plan`), figure(drawStoryElevation(p, res, i, { width: 560, height: 420 }), `step-${i + 1}-elevation`)),
        sr?.checks?.length
          ? el('div', { class: 'row', style: { marginTop: '8px', gap: '12px' } }, sr.checks.map((c) => el('span', {}, badge(c.status), ' ', c.label, c.util != null ? ` — ${(c.util * 100).toFixed(0)} %` : '')))
          : null,
      ),
    );
  });
  if (!p.storyboard.steps.length) box.append(el('div', { class: 'note' }, 'Add steps (pick-up, slewing, set-down…) to build the storyboard and check the capacity at every radius.'));
}

export { fmt };
