// Lift plan data model + example project + migrations.

export const SCHEMA_VERSION = 2;

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
      description: 'Lift the skid from the trailer and set it down on its foundation.',
      preparedBy: '',
      checkedBy: '',
      approvedBy: '',
    },
    environment: 'onshore',
    flags: { tandem: false, overLive: false, personnel: false, subsea: false, vesselToVessel: false, heavyThreshold_t: 50 },
    factors: { dafMode: 'dnv', dafManual: 1.1, sklMode: 'auto', sklManual: 1.25, cogFactor: 1.0, extraFactor: 1.0 },
    rules: {},
    load: {
      name: 'Pump skid P-101',
      weight_t: 12.5,
      wcfPreset: 'calculated',
      wcf: 1.05,
      dims_mm: { L: 6000, W: 2500, H: 2600 },
      origin_mm: { x: 0, y: 0, z: 0 },
      cog_mm: { x: 2850, y: 1300, z: 1100 },
      cogEnvelope_mm: { dx: 0, dy: 0 },
      windArea_m2: null,
      liftPoints: [
        { id: 'A', x: 300, y: 300, z: 2600, swl_t: 8.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 65, azimuth_deg: null, used: true },
        { id: 'B', x: 5700, y: 300, z: 2600, swl_t: 8.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 65, azimuth_deg: null, used: true },
        { id: 'C', x: 5700, y: 2200, z: 2600, swl_t: 8.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 65, azimuth_deg: null, used: true },
        { id: 'D', x: 300, y: 2200, z: 2600, swl_t: 8.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 65, azimuth_deg: null, used: true },
      ],
    },
    crane: {
      name: 'EXAMPLE — 100 t mobile crane (fictitious chart, DO NOT USE)',
      type: 'mobile',
      boom: { length: 30, pivotHeight: 2.2, pivotOffset: 1.2, minAngle_deg: 10, maxAngle_deg: 82 },
      hookBlock_t: 1.2,
      hookSWL_t: 100,
      deductHookBlock: true,
      utilLimit: 0.85,
      minTipToHook: 3.5,
      radius_m: 16,
      interpolation: 'step',
      activeColumn: 0,
      chart: {
        columns: ['30 m boom — full counterweight'],
        rows: [
          [6, 60.0], [8, 45.0], [10, 35.5], [12, 28.6], [14, 23.7], [16, 20.0],
          [18, 17.1], [20, 14.8], [22, 12.9], [24, 11.3], [26, 9.9],
        ],
      },
    },
    rigging: {
      type: 'hook',
      slingFamily: 'RS-PES',
      design: { mode: 'angle', targetAngle_deg: 60, hookHeight_m: 4, minHeight_m: 1, roundLengths: 'set' },
      headType: 'masterlink',
      masterlink: { itemId: 'auto', subLinks: true, subLinkItemId: 'auto' },
      topShackle: { enabled: false, itemId: 'auto' },
      legs: {
        A: { topConnector: 'shackle' },
        B: { topConnector: 'shackle' },
        C: { topConnector: 'shackle' },
        D: { topConnector: 'shackle' },
      },
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
        bottomTargetAngle_deg: 60,
        minBottomHeight_m: 2.0,
        topLugHoleDia_mm: 0,
        topLugThk_mm: 0,
        bottomLugHoleDia_mm: 0,
        bottomLugThk_mm: 0,
      },
    },
    storyboard: {
      crane: { x: 0, y: 0, heading_deg: 0, footprint: { L: 12, W: 3 } },
      obstacles: [
        { name: 'Trailer', x: 10, y: 0, sx: 12, sy: 2.6, h: 1.5, rot_deg: 0, color: '#9aa5b1' },
        { name: 'Wall / fence', x: 9, y: 10, sx: 0.4, sy: 8, h: 3.5, rot_deg: 30, color: '#c0794f' },
        { name: 'Foundation', x: -5.5, y: 15, sx: 6.5, sy: 3, h: 0.3, rot_deg: 20, color: '#7f8c8d' },
      ],
      steps: [
        { name: '1. Pick from trailer', radius_m: 10, slew_deg: 0, loadElevation_m: 1.5, heading_deg: 0, note: 'Take the weight progressively, check the load is level.' },
        { name: '2. Slew over the wall', radius_m: 14, slew_deg: 60, loadElevation_m: 4.0, heading_deg: 30, note: 'Keep ≥ 0.5 m clearance above the wall. Tag lines held.' },
        { name: '3. Set down on foundation', radius_m: 16, slew_deg: 110, loadElevation_m: 0.3, heading_deg: 20, note: 'Slow set-down, guide onto the dowels.' },
      ],
    },
    weather: { hsMax_m: null, windMax_ms: 9.8, windGust_ms: 12, visibility: 'Good', notes: '' },
    checklist: DEFAULT_CHECKLIST.map((label) => ({ label, checked: false })),
    inventory: [],
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
  const out = merge(base, data || {});
  // v1 → v2: roundslings were the only sling family
  if (!data?.rigging?.slingFamily) out.rigging.slingFamily = 'RS-PES';
  out.schema = SCHEMA_VERSION;
  return out;
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
