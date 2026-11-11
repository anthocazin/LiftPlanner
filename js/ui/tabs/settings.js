// Settings: check rules (max angle…), explanation of the maths (leg force vs angle, EN mode
// factors, shackle side load, hole / pin clearance), local data.
import { app } from '../app.js';
import { el, field, panel, fmt } from '../dom.js';
import { DEFAULT_RULES } from '../../engine/checks.js';
import { DAF_REFERENCE, SKL_REFERENCE } from '../../engine/factors.js';
import { GREEN_PIN_SIDE_LOAD } from '../../catalog/data.js';
import { figure } from '../figure.js';

const RULES = [
  ['targetAngleV_deg', 'Target max leg angle to the VERTICAL (warning above)', '°'],
  ['maxAngleV_deg', 'Maximum allowable leg angle to the vertical (reject above)', '°'],
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
    el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '8px' } }, 'Saved with the project. Padeye fit tolerances (hole / pin clearance, thickness / jaw) are on the Load page with the padeye characteristics.'),
    el('div', { class: 'fields wide' },
      RULES.map(([k, label, unit]) => {
        if (app.project.rules[k] == null) app.project.rules[k] = DEFAULT_RULES[k];
        return field({ label, path: `rules.${k}`, unit, step: 0.01, hint: `Default: ${DEFAULT_RULES[k]}`, onchange: () => app.recompute() });
      }),
    ),
    el('div', { class: 'row', style: { marginTop: '10px' } }, el('button', { class: 'small', onclick: () => { const keep = app.project.rules.shackleRanges; app.project.rules = { ...DEFAULT_RULES, shackleRanges: keep || DEFAULT_RULES.shackleRanges }; app.recompute(); window.__rerender(); } }, 'Restore defaults')),
  );

  const maths = panel(
    'WLL and leg angle — the maths',
    el('p', { style: { fontSize: '13px' } },
      'A leg inclined at β to the vertical carries its share of the load R vertically, so its tension is ', el('b', {}, 'T = R / cos β'), '. The sling, the chain and every connector of the leg must have WLL ≥ T × factors. ',
      'At 30° the tension is 15 % higher than for a vertical leg, at 45° it is 41 % higher, at 60° it is doubled — and the horizontal component (H = R · tan β) pulls the padeyes inwards and compresses the load.'),
    el('div', { class: 'tbl-wrap' }, angleTable()),
    figure(angleChart(), 'leg-force-vs-angle'),
    el('h3', {}, 'Standard multi-leg slings (EN 13414-1 / EN 818-4 / EN 1492)'),
    el('p', { style: { fontSize: '13px' } },
      'A sling set is rated with a mode factor K applied to the WLL of one leg: rated load = K × WLL(leg). K = 1.4 for 2 legs and 2.1 for 3 or 4 legs while β ≤ 45°, 1.0 / 1.5 between 45° and 60°; beyond 60° the set must not be used. ',
      'For 4 legs, K = 2.1 (not 4 × cos 45° = 2.83) because a 4-leg set is assumed to hang on 3 legs. Choked: × 0.8. LiftPlanner checks both this rule and the actual leg forces, and sizes the sling / chain for the larger of the two.'),
    el('h3', {}, 'Shackle side load (Green Pin)'),
    el('p', { style: { fontSize: '13px' } }, 'When the load on a shackle is not in its plane (padeye plane azimuth entered on the Load page), its WLL is reduced: 100 % in plane, 70 % at 45°, 50 % at 90°.'),
    figure(sideLoadChart(), 'shackle-side-load'),
  );

  const clearance = panel(
    'Hole / pin clearance — what it means',
    figure(clearanceFigure(), 'hole-pin-clearance'),
    el('ul', { style: { fontSize: '13px', lineHeight: 1.5 } },
      el('li', {}, el('b', {}, 'Clearance = hole Ø − pin Ø. '), 'The pin must pass through the padeye hole, so the hole is always slightly bigger (typically +1 to +3 mm).'),
      el('li', {}, el('b', {}, 'Too much clearance '), 'means the pin only bears on a narrow arc of the hole: high contact (bearing) stress in the padeye and the pin, and the shackle can rock. Rule used: clearance ≤ max(3 mm; 4 % of the pin Ø) — otherwise choose the shackle size whose pin matches the hole (LiftPlanner upsizes automatically), or bush the hole.'),
      el('li', {}, el('b', {}, 'Thickness / jaw: '), 'the padeye (main plate + cheek plates) must fit in the jaw of the shackle. If it is much thinner (< 75 % of the jaw width) the shackle slides on the pin: fit cheek plates or spacers.'),
      el('li', {}, el('b', {}, 'Inside length: '), 'the material above the hole plus the sling / link in the bow must fit inside the shackle.'),
    ),
  );

  const about = panel(
    'Calculation method',
    el('ul', { style: { fontSize: '13px', lineHeight: 1.5 } },
      el('li', {}, 'Freely suspended load: the hook is vertically above the COG. Load frame X/Y/Z in mm, Z up.'),
      el('li', {}, 'Vertical reactions: lever rule (2 points), exact equilibrium (3 points), rigid plate on equal-stiffness supports (4 points and more). Statically indeterminate cases are covered by the SKL.'),
      el('li', {}, 'Leg design force F = T × DAF × SKL × COG factor × other factor. Master link and spreader bar: vertical load × DAF (no SKL). The DAF can be switched off on the Checks page.'),
      el('li', {}, 'Crane: static hook load (weight × WCF + rigging) against the load chart, between its minimum and maximum radius.'),
      el('li', {}, 'Leg length (bearing to bearing) = connectors (shackle: inside length + ½ pin Ø in a hole, + pin Ø on a link; connecting link / G-Link: effective length) + sling EWL or chain (n links × pitch) + head (master link and sub-link inside lengths). The required length comes from the target angle; the sling is rounded to a standard length, the chain to a whole number of links.'),
    ),
    el('p', { style: { fontSize: '12px' } }, DAF_REFERENCE),
    el('p', { style: { fontSize: '12px' } }, SKL_REFERENCE),
    el('div', { class: 'note warn' }, 'Planning aid: it does not replace review by a competent person, nor the certificates of the equipment and of the crane.'),
  );
  const data = panel(
    'Local data',
    el('div', { class: 'muted', style: { fontSize: '12px' } }, 'The current project and the inventory are saved automatically in this browser (drawings included while there is room). Use "Save" to get a .liftplan.json file with the drawings, the map and the logos.'),
    el('div', { class: 'row', style: { marginTop: '8px' } },
      el('button', { class: 'small danger', onclick: () => { if (confirm('Clear the local data (project + inventory) from this browser?')) { try { localStorage.clear(); } catch {} location.reload(); } } }, 'Clear local data')),
  );
  root.append(el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, r, clearance, data), el('div', { class: 'grid' }, maths, about)));
}

function angleTable() {
  const rows = [0, 10, 20, 30, 40, 45, 50, 60];
  const lim = app.project.rules?.maxAngleV_deg ?? DEFAULT_RULES.maxAngleV_deg;
  const tgt = app.project.rules?.targetAngleV_deg ?? DEFAULT_RULES.targetAngleV_deg;
  return el('table', { class: 'data compact' },
    el('thead', {}, el('tr', {}, ['β to vertical', 'Angle to horizontal', 'T / R = 1 / cos β', 'H / R = tan β', '2 legs, 10 t: T per leg', '4 legs (3 effective), 10 t: T per leg', 'EN factor K (2 / 3-4 legs)'].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((b) => {
      const c = Math.cos((b * Math.PI) / 180);
      const K2 = b <= 45 ? 1.4 : b <= 60 ? 1.0 : null, K4 = b <= 45 ? 2.1 : b <= 60 ? 1.5 : null;
      return el('tr', { style: { background: b > lim ? 'var(--fail-bg)' : b > tgt ? 'var(--warn-bg)' : '' } },
        el('td', { class: 'num' }, `${b}°`), el('td', { class: 'num' }, `${90 - b}°`), el('td', { class: 'num' }, fmt(1 / c, 3)), el('td', { class: 'num' }, fmt(Math.tan((b * Math.PI) / 180), 3)),
        el('td', { class: 'num' }, `${fmt(5 / c)} t`), el('td', { class: 'num' }, `${fmt(10 / 3 / c)} t`), el('td', { class: 'num' }, K2 ? `${K2} / ${K4}` : 'not allowed'));
    })),
  );
}

function svgChart(W, H, pts, { xMax, yMin, yMax, xLabel, yLabel, title, marks = [] }) {
  const m = { l: 44, r: 12, t: 24, b: 30 };
  const X = (x) => m.l + (x / xMax) * (W - m.l - m.r);
  const Y = (y) => H - m.b - ((y - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  let s = '';
  for (let x = 0; x <= xMax; x += 10) s += `<line x1="${X(x)}" y1="${m.t}" x2="${X(x)}" y2="${H - m.b}" stroke="#eef1f4"/><text x="${X(x)}" y="${H - m.b + 12}" font-size="9" text-anchor="middle" fill="#5d6b7a">${x}</text>`;
  const st = (yMax - yMin) / 5;
  for (let y = yMin; y <= yMax + 1e-9; y += st) s += `<line x1="${m.l}" y1="${Y(y)}" x2="${W - m.r}" y2="${Y(y)}" stroke="#eef1f4"/><text x="${m.l - 5}" y="${Y(y) + 3}" font-size="9" text-anchor="end" fill="#5d6b7a">${Math.round(y * 100) / 100}</text>`;
  marks.forEach((mk) => (s += `<rect x="${X(mk.x0)}" y="${m.t}" width="${X(mk.x1) - X(mk.x0)}" height="${H - m.t - m.b}" fill="${mk.color}" opacity=".12"/><text x="${X(mk.x0) + 3}" y="${m.t + 10}" font-size="9" fill="${mk.text}">${mk.label}</text>`));
  s += `<polyline points="${pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="#2a5db0" stroke-width="2"/>`;
  s += `<line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" stroke="#333"/><line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}" stroke="#333"/>`;
  s += `<text x="${m.l}" y="15" font-size="11" font-weight="700" fill="#173a5e">${title}</text><text x="${W - m.r}" y="${H - 5}" font-size="10" text-anchor="end" fill="#5d6b7a">${xLabel}</text><text x="${m.l + 4}" y="${m.t + 22}" font-size="10" fill="#5d6b7a">${yLabel}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff;max-width:100%">${s}</svg>`;
}

function angleChart() {
  const tgt = app.project.rules?.targetAngleV_deg ?? 30, lim = app.project.rules?.maxAngleV_deg ?? 45;
  const pts = [];
  for (let b = 0; b <= 70; b += 1) pts.push([b, 1 / Math.cos((b * Math.PI) / 180)]);
  return svgChart(560, 240, pts, {
    xMax: 70, yMin: 1, yMax: 3, xLabel: 'Leg angle to vertical β (°)', yLabel: 'T / R', title: 'Leg tension factor 1 / cos β',
    marks: [{ x0: tgt, x1: lim, color: '#b7791f', text: '#b7791f', label: 'warning' }, { x0: lim, x1: 70, color: '#c0392b', text: '#c0392b', label: 'rejected' }],
  });
}

function sideLoadChart() {
  return svgChart(560, 220, GREEN_PIN_SIDE_LOAD.map(([a, p]) => [a, p / 100]), { xMax: 90, yMin: 0.4, yMax: 1, xLabel: 'Side load angle (° from the shackle plane)', yLabel: 'WLL factor', title: 'Green Pin bow shackle — WLL under side load' });
}

function clearanceFigure() {
  const W = 520, H = 200;
  const hole = 34, pin = 28, k = 2.6;
  const cx = 130, cy = 100;
  let s = '';
  s += `<circle cx="${cx}" cy="${cy}" r="${(hole / 2 + 30) * k}" fill="#c6ced6" stroke="#3c4652"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${(hole / 2) * k}" fill="#fff" stroke="#3c4652"/>`;
  s += `<circle cx="${cx}" cy="${cy - ((hole - pin) / 2) * k}" r="${(pin / 2) * k}" fill="#2e8b3a" stroke="#1d5c25"/>`;
  s += `<line x1="${cx}" y1="${cy + (hole / 2) * k}" x2="${cx}" y2="${cy + (hole / 2 - (hole - pin)) * k}" stroke="#c0392b" stroke-width="2"/>`;
  s += `<text x="${cx + 6}" y="${cy + (hole / 2) * k - 2}" font-size="11" fill="#c0392b" font-weight="700">gap = ${hole - pin} mm</text>`;
  s += `<text x="${cx}" y="18" font-size="11" text-anchor="middle" font-weight="700" fill="#173a5e">Padeye hole Ø${hole}, pin Ø${pin}</text>`;
  s += `<path d="M ${cx - 40} ${cy - (hole / 2) * k - 8} A 60 60 0 0 1 ${cx + 40} ${cy - (hole / 2) * k - 8}" fill="none" stroke="#e8822a" stroke-width="3"/>`;
  s += `<text x="${cx}" y="${cy - (hole / 2) * k - 16}" font-size="10" text-anchor="middle" fill="#c96a17">contact arc (load ↑)</text>`;
  const tx = 280;
  s += `<text x="${tx}" y="60" font-size="12" fill="#1c2733">Allowed: max(3 mm ; 4 % × pin Ø)</text>`;
  s += `<text x="${tx}" y="80" font-size="12" fill="#1c2733">pin Ø28 → max(3 ; 1.1) = 3 mm</text>`;
  s += `<text x="${tx}" y="100" font-size="12" fill="#c0392b">gap 6 mm > 3 mm → next size</text>`;
  s += `<text x="${tx}" y="120" font-size="12" fill="#1f8f4e">(shackle with pin Ø32 → gap 2 mm ✓)</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff;max-width:100%">${s}</svg>`;
}
