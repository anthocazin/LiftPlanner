import { app } from '../app.js';
import { el, field, panel } from '../dom.js';
import { DEFAULT_RULES } from '../../engine/checks.js';
import { DAF_REFERENCE, SKL_REFERENCE } from '../../engine/factors.js';

const RULES = [
  ['minSlingAngleFail_deg', 'Minimum sling angle to horizontal (reject)', '°'],
  ['minSlingAngleWarn_deg', 'Warn below this sling angle', '°'],
  ['maxHoleClearance_mm', 'Allowed hole / pin clearance (absolute)', 'mm'],
  ['maxHoleClearance_pct', 'Allowed hole / pin clearance (% of pin Ø)', '%'],
  ['minThicknessRatio', 'Minimum padeye thickness / shackle jaw width', '×'],
  ['utilWarn', 'Warn above this equipment utilisation', '×'],
  ['maxTiltWarn_deg', 'Load tilt: warn above', '°'],
  ['maxTiltFail_deg', 'Load tilt: reject above', '°'],
  ['lengthMismatchWarn_mm', 'Allowed length mismatch (spreader)', 'mm'],
  ['minBendingRatio', 'Wire rope / grommet: minimum D/d over the bearing', '×'],
  ['maxOutOfPlane_deg', 'Allowed out-of-plane angle on a padeye', '°'],
];

export function render(root) {
  app.project.rules = app.project.rules || {};
  const r = panel(
    'Check rules',
    el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '8px' } }, 'Defaults follow common practice (DNV-ST-N001, manufacturer recommendations). Align them with your company procedure: they are saved with the project.'),
    el(
      'div',
      { class: 'fields wide' },
      RULES.map(([k, label, unit]) => {
        if (app.project.rules[k] == null) app.project.rules[k] = DEFAULT_RULES[k];
        return field({ label, path: `rules.${k}`, unit, step: 0.01, hint: `Default: ${DEFAULT_RULES[k]}` });
      }),
    ),
    el('div', { class: 'row', style: { marginTop: '10px' } }, el('button', { class: 'small', onclick: () => { app.project.rules = { ...DEFAULT_RULES }; app.recompute(); window.__rerender(); } }, 'Restore defaults')),
  );
  const about = panel(
    'Calculation method',
    el(
      'ul',
      { style: { fontSize: '13px', lineHeight: 1.5 } },
      el('li', {}, 'Freely suspended load: the hook is vertically above the COG. Load frame X/Y/Z in mm, Z up.'),
      el('li', {}, 'Vertical reactions: lever rule (2 points), exact equilibrium (3 points), rigid plate on equal-stiffness supports (4 points and more). Statically indeterminate cases are covered by the SKL.'),
      el('li', {}, 'Sling tension T = R · L / h; design force F = T × DAF × SKL × COG factor × other factor. Master link and spreader bar: vertical load × DAF (no SKL).'),
      el('li', {}, 'Crane: static load (weight × WCF + rigging + hook block if deducted) against the load chart — no DAF, the chart being certified for its use (offshore: pick the right Hs column).'),
      el('li', {}, 'Shackles: WLL reduction under side load (Green Pin curve: 0° 100 %, 45° 70 %, 90° 50 %) when the padeye orientation is entered; hole/pin clearance, thickness/jaw and sling width in the bow are checked.'),
      el('li', {}, 'Lengths: effective length = sling (EWL) + shackles (f + pin Ø) + master link / sub-link (inside length). The load tilt is estimated with the selected lengths.'),
    ),
    el('p', { style: { fontSize: '12px' } }, DAF_REFERENCE),
    el('p', { style: { fontSize: '12px' } }, SKL_REFERENCE),
    el('div', { class: 'note warn' }, 'Planning aid: it does not replace review by a competent person, nor the certificates of the equipment and of the crane.'),
  );
  const data = panel(
    'Local data',
    el('div', { class: 'muted', style: { fontSize: '12px' } }, 'The current project and the inventory are saved automatically in this browser. Use "Save" to get a .liftplan.json file to archive with the lift plan.'),
    el(
      'div',
      { class: 'row', style: { marginTop: '8px' } },
      field({ label: 'Embed the imported PDF drawing in the project file', path: 'drawingEmbed', type: 'checkbox' }),
      el('button', { class: 'small danger', onclick: () => { if (confirm('Clear the local data (project + inventory) from this browser?')) { try { localStorage.clear(); } catch {} location.reload(); } } }, 'Clear local data'),
    ),
  );
  root.append(el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, r, data), about));
}
