// Lift plan data model + example project + migrations.

export const SCHEMA_VERSION = 3;

export const DEFAULT_CHECKLIST = [
  'Lifting equipment inspected, certificates valid and identified (serial numbers)',
  'Crane: certificate in date, daily inspection done, rated capacity limiter operational',
  'Weight and COG confirmed (weighing certificate or calculation note)',
  'Lift points inspected (visual / NDT if required)',
  'Ground / deck: bearing capacity checked (cribbing, load spreading mats)',
  'Weather within limits (wind, sea state, visibility) — forecast reviewed',
  'Lifting zone barriered off, nobody under the load',
  'Communication agreed (radio / hand signals), banksman / signaller appointed',
  'Tag lines in place',
  'Risk assessment (JSA / TRA) and toolbox talk completed',
  'Permit to work issued',
  'Stop / emergency and rescue plan defined',
];

// "Possible safety measures to be considered" (lifting plan template)
export const SAFETY_MEASURES = [
  'Weight not verified', 'Stability of load', 'High centre of gravity', 'Awkward size/shape/sharp edges', 'No dedicated lift points',
  'No certified suspension points for lifting equipment', 'Packing protection load/lifting equipment/assets', 'Loose objects removed from load',
  'Load on pallet requires securing', 'Tag lines required', 'Buoyancy of objects', 'Lifting of chemicals', 'Access and egress for slinging',
  'No lift points directly above load', 'Accessories/equipment fit for purpose/SWL',
  'Lifting equipment/accessories certificates', 'Stability of lifting equipment', 'Pre-use equipment checks', 'Crane mode verified', 'Vessel stability',
  'Vessel ballasting required', 'Lifting over plant/equipment/assets', 'Restricted head room', 'Lay-down area size/strength/stability',
  'Route and lay-down area clear', 'Route and lay-down area obstructed', 'Lay-down in operational radius of lifting equipment', 'Conflicting operations',
  'Cultural, communications, language issues', 'Diving operations – precautions',
  'Emergency/rescue plans', 'Environment: visibility/wind speed/wave height/tide', 'Sudden changes in environmental conditions',
  'Load visibility during night/subsea working', 'Blind lifting', 'Lighting pick-up and set-down areas', 'Dynamic factors involved', 'Seabed suction',
  'Seabed conditions', 'Competent and sufficient personnel', 'Suitable adequate supervision', 'Correct PPE', 'Toolbox talk required', 'Sea fastenings removed',
];

export const CHECKLIFT = [
  'Keep a copy of this plan at the work site and follow the plan',
  'Assign a designated leader',
  'Ensure all personnel involved in the lift understand the plan',
  'Ensure means of communication are operational',
  'Ensure weather conditions are acceptable for the operation',
  'Provide the task-qualified supervision specified in the planning process',
  'Release all non-essential personnel from the adjacent area',
  'Ensure a signaller is assigned, if required',
  'Identify the crane operator',
  'Follow specific instructions/procedures for attachment of the rigging gear to the load',
  'Use proper rigging techniques',
  'Stop the job when any potentially unsafe condition is recognised',
];

// standard pad eye type S 8.5 t (53.008.50.0S): H 29.5, t = T = 35, R 64, A 64, L 180
const PADEYE_EX = { padeye: true, padeyeStd: 'PE-S-53.008.50.0S', swl_t: 8.5, holeDia_mm: 29.5, thk_mm: 35, cheekThk_mm: 0, radius_mm: 64, height_mm: 64, baseL_mm: 180, azimuth_deg: null };

export function defaultProject() {
  return {
    schema: SCHEMA_VERSION,
    project: {
      name: 'Example — pump skid lift',
      liftId: 'LP-001',
      revision: 'A',
      date: new Date().toISOString().slice(0, 10),
      client: '',
      site: 'Quay / assembly yard',
      vessel: '',
      location: 'Quay 3 — skid foundation F-12',
      description: 'Lift the skid from the trailer and set it down on its foundation.',
      reference: '',
      headerLines: ['', '', ''],
      preparedBy: '',
      checkedBy: '',
      approvedBy: '',
    },
    logos: { company: null, client: null },
    environment: 'onshore',
    flags: { quayToVessel: false, vesselToQuay: false, vesselToVessel: false, overLive: false, subsea: false, heavyThreshold_t: 50 },
    factors: { applyDAF: true, dafMode: 'dnv', dafManual: 1.1, sklMode: 'auto', sklManual: 1.25, cogFactor: 1.0, extraFactor: 1.0 },
    safety: { measures: {}, further: '', comms: { primary: 'UHF radio', secondary: 'Hand signals', other: '', primaryChecked: false, secondaryChecked: false }, review: { done: false, ref: '' } },
    rules: {},
    load: {
      name: 'Pump skid P-101',
      weight_t: 12.5,
      weightBasis: 'assessed',
      wcfPreset: 'calculated',
      wcf: 1.05,
      dims_mm: { L: 6000, W: 2500, H: 2600 },
      origin_mm: { x: 0, y: 0, z: 0 },
      cog_mm: { x: 2850, y: 1300, z: 1100 },
      cogBasis: 'drawing',
      cogEnvelope_mm: { dx: 0, dy: 0 },
      padeyeRules: { maxHoleClearance_mm: 3, maxHoleClearance_pct: 4, minThicknessRatio: 0.75, maxHoleRatio: 1.06 },
      views: { xy: null, xz: null },
      liftPoints: [
        { id: 'A', x: 300, y: 300, z: 2600, used: true, ...PADEYE_EX },
        { id: 'B', x: 5700, y: 300, z: 2600, used: true, ...PADEYE_EX },
        { id: 'C', x: 5700, y: 2200, z: 2600, used: true, ...PADEYE_EX },
        { id: 'D', x: 300, y: 2200, z: 2600, used: true, ...PADEYE_EX },
      ],
    },
    crane: {
      name: 'EXAMPLE — 100 t mobile crane (fictitious chart, DO NOT USE)',
      type: 'mobile',
      configuration: '30 m boom — full counterweight',
      utilLimit: 0.85,
      radius_m: 16,
      interpolation: 'step',
      activeColumn: 0,
      chart: {
        columns: ['SWL'],
        rows: [
          [6, 60.0], [8, 45.0], [10, 35.5], [12, 28.6], [14, 23.7], [16, 20.0],
          [18, 17.1], [20, 14.8], [22, 12.9], [24, 11.3], [26, 9.9],
        ],
      },
    },
    rigging: {
      type: 'hook',
      design: { mode: 'angle', targetAngleV_deg: 30, hookHeight_m: 4, minHeight_m: 1, roundLengths: 'set' },
      head: { type: 'assembly', itemId: 'auto', subLinkItemId: 'auto', topShackle: false, topShackleId: 'auto' },
      assembly: [
        { kind: 'shackle', id: 'auto' },
        { kind: 'sling', family: 'RS-PES', id: 'auto', hitch: 'direct' },
        { kind: 'shackle', id: 'auto' },
      ],
      assemblyTop: [
        { kind: 'shackle', id: 'auto' },
        { kind: 'sling', family: 'RS-PES', id: 'auto', hitch: 'direct' },
      ],
      legs: {},
      spreader: {
        name: 'Spreader bar SB-01',
        certNo: '',
        length_m: 5.4,
        depth_m: 0.35,
        weight_t: 0.45,
        wll_t: 20,
        axis: 'x',
        position: 'points',
        minTopAngle_deg: 60,
        bottomTargetAngleV_deg: 30,
        minBottomHeight_m: 2.0,
        topLugHoleDia_mm: 0,
        topLugThk_mm: 0,
        bottomLugHoleDia_mm: 0,
        bottomLugThk_mm: 0,
      },
    },
    storyboard: {
      crane: { x: 0, y: 0, heading_deg: 0, footprint: { L: 12, W: 3 } },
      map: null,
      shapes: [],
      obstacles: [
        { name: 'Trailer', x: 10, y: 0, sx: 12, sy: 2.6, h: 1.5, rot_deg: 0, color: '#9aa5b1' },
        { name: 'Wall / fence', x: 9, y: 10, sx: 0.4, sy: 8, h: 3.5, rot_deg: 30, color: '#c0794f' },
        { name: 'Foundation', x: -5.5, y: 15, sx: 6.5, sy: 3, h: 0.3, rot_deg: 20, color: '#7f8c8d' },
      ],
      steps: [
        { name: 'Toolbox talk, permit and rigging inspection', note: 'TBT held, PTW in place, rigging inspected and laid out as per sketch.', responsible: 'Lifting supervisor', sketch: false },
        { name: 'Pick from trailer', radius_m: 10, slew_deg: 0, loadElevation_m: 1.5, heading_deg: 0, note: 'Take the weight progressively, lift 300 mm and hold: check the load is level.', responsible: 'Crane operator', sketch: true, phase: 'pick' },
        { name: 'Slew over the wall', radius_m: 14, slew_deg: 60, loadElevation_m: 4.0, heading_deg: 30, note: 'Keep ≥ 0.5 m clearance above the wall. Tag lines held.', responsible: 'Banksman', sketch: true },
        { name: 'Set down on foundation', radius_m: 16, slew_deg: 110, loadElevation_m: 0.3, heading_deg: 20, note: 'Slow set-down, guide onto the dowels.', responsible: 'Crane operator', sketch: true, phase: 'final' },
      ],
    },
    weather: { hsMax_m: null, windMax_ms: 9.8, windGust_ms: 12, visibility: 'Good', notes: '' },
    checklist: DEFAULT_CHECKLIST.map((label) => ({ label, checked: false })),
    inventory: [],
    equipmentCheck: {},
    drawing: null,
    notes: '',
  };
}

export function emptyProject() {
  const p = defaultProject();
  p.project = { ...p.project, name: 'New lift plan', liftId: '', description: '', site: '' };
  p.load = { ...p.load, name: '', weight_t: 0, liftPoints: [] };
  p.rigging.legs = {};
  p.storyboard.steps = [];
  p.storyboard.obstacles = [];
  return p;
}

/** Completes a loaded project (older version, missing fields) with the defaults. */
export function migrate(data) {
  const base = defaultProject();
  const merge = (a, b) => {
    if (Array.isArray(a) || Array.isArray(b)) return b !== undefined ? b : a;
    if (a && typeof a === 'object' && b && typeof b === 'object') {
      const out = { ...a };
      for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
      return out;
    }
    return b !== undefined ? b : a;
  };
  const old = data || {};
  const v = Number(old.schema) || 1;
  const out = merge(base, old);
  if (v < 3) migrateV2(out, old);
  out.schema = SCHEMA_VERSION;
  return out;
}

/** v1/v2 → v3: leg assemblies, angles to the vertical, simplified crane, lift nature flags. */
function migrateV2(out, old) {
  const rig = out.rigging;
  const orig = old.rigging || {};
  // design angle (to horizontal in v2) → angle to the vertical
  const d = orig.design || {};
  if (d.targetAngle_deg != null && d.targetAngleV_deg == null) rig.design.targetAngleV_deg = Math.round((90 - Number(d.targetAngle_deg)) * 10) / 10;
  if (orig.spreader?.bottomTargetAngle_deg != null && orig.spreader?.bottomTargetAngleV_deg == null)
    rig.spreader.bottomTargetAngleV_deg = 90 - Number(orig.spreader.bottomTargetAngle_deg);
  // head
  if (!orig.head) {
    const ml = orig.masterlink || {};
    rig.head = {
      type: orig.headType === 'hook' ? 'hook' : ml.subLinks ? 'assembly' : 'masterlink',
      itemId: ml.itemId || 'auto',
      subLinkItemId: ml.subLinkItemId || 'auto',
      topShackle: !!orig.topShackle?.enabled,
      topShackleId: orig.topShackle?.itemId || 'auto',
    };
  }
  // legs: { slingFamily, slingId, length_m, lockLength, mode, bottomShackleId, topConnector, topConnectorId } → parts
  const fam = orig.slingFamily || 'RS-PES';
  const toParts = (c = {}, level = 'main') => {
    const parts = [];
    parts.push({ kind: 'shackle', id: c.bottomShackleId || 'auto' });
    parts.push({ kind: 'sling', family: c.slingFamily || fam, id: c.slingId || 'auto', hitch: c.mode === 'choke' ? 'choke' : 'direct', length_m: c.length_m ?? null, lock: !!c.lockLength });
    const top = c.topConnector || (level === 'bottom' ? 'shackle' : 'direct');
    if (top === 'shackle') parts.push({ kind: 'shackle', id: c.topConnectorId || 'auto' });
    if (top === 'glink') parts.push({ kind: 'glink', id: c.topConnectorId || 'auto' });
    return parts;
  };
  const legsOld = orig.legs || {};
  const keys = Object.keys(legsOld);
  const isSpreader = orig.type === 'spreader';
  const mainKeys = keys.filter((k) => !['TA', 'TB'].includes(k));
  const sig = (k) => JSON.stringify(toParts(legsOld[k], isSpreader ? 'bottom' : 'main'));
  const common = mainKeys.length && mainKeys.every((k) => sig(k) === sig(mainKeys[0])) ? JSON.parse(sig(mainKeys[0])) : null;
  rig.assembly = common || toParts({}, isSpreader ? 'bottom' : 'main');
  rig.assemblyTop = legsOld.TA ? toParts(legsOld.TA, 'top') : rig.assemblyTop;
  rig.legs = {};
  if (!common) mainKeys.forEach((k) => (rig.legs[k] = { parts: toParts(legsOld[k], isSpreader ? 'bottom' : 'main') }));
  if (legsOld.TB && JSON.stringify(toParts(legsOld.TB, 'top')) !== JSON.stringify(rig.assemblyTop)) rig.legs.TB = { parts: toParts(legsOld.TB, 'top') };
  delete rig.slingFamily; delete rig.headType; delete rig.masterlink; delete rig.topShackle;
  // load
  (out.load.liftPoints || []).forEach((p) => {
    if (p.padeye == null) p.padeye = true;
    if (p.cheekThk_mm == null) p.cheekThk_mm = 0;
  });
  delete out.load.windArea_m2;
  // rules (angle to horizontal → to vertical; padeye tolerances → load page)
  const r = old.rules || {};
  if (r.minSlingAngleFail_deg != null) out.rules.maxAngleV_deg = 90 - Number(r.minSlingAngleFail_deg);
  if (r.minSlingAngleWarn_deg != null) out.rules.targetAngleV_deg = 90 - Number(r.minSlingAngleWarn_deg);
  ['maxHoleClearance_mm', 'maxHoleClearance_pct', 'minThicknessRatio'].forEach((k) => {
    if (r[k] != null) out.load.padeyeRules[k] = r[k];
  });
  delete out.rules.minSlingAngleFail_deg; delete out.rules.minSlingAngleWarn_deg;
  // flags
  delete out.flags.tandem; delete out.flags.personnel;
  // crane: load chart only
  const c = out.crane;
  if (old.crane?.chart?.columns?.length) c.configuration = c.configuration || old.crane.chart.columns[Number(old.crane.activeColumn) || 0] || '';
  ['boom', 'hookBlock_t', 'hookSWL_t', 'deductHookBlock', 'minTipToHook'].forEach((k) => delete c[k]);
  // storyboard steps → detailed sequence
  (out.storyboard.steps || []).forEach((st) => {
    if (st.sketch == null) st.sketch = Number(st.radius_m) > 0;
    if (st.responsible == null) st.responsible = '';
  });
}

/** Path access "a.b.0.c". */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}
