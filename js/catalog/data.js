// Lifting equipment catalogue.
//
// IMPORTANT: data taken from public manufacturer / distributor literature (main source: DS Levage
// general catalogue 2025 and the tables supplied by the user; Slingmax G-Link from Unirope). It is meant for
// pre-selection only. The final lift plan must ALWAYS be checked against the certificates of the
// equipment actually used (WLL, dimensions, weights).
// Dimensions in mm, weights in kg, WLL in tonnes (t).

const IN = 25.4; // mm per inch
const LBS_PER_T = 2204.62;
const DS = 'DS Levage catalogue 2025';

const fmtT = (w) => String(w);

// ---------------------------------------------------------------------------
// SHACKLES — Green Pin®. Catalogue columns:
// a bow dia | b pin dia | c eye dia | d eye width | e inside width at pin (jaw) | f inside length
// g bow width (inside) | h overall length | weight
//
// G-4163 Standard bow shackle, safety bolt — grade 6, MBL = 6 × WLL (DS p.93, Green Pin datasheet)
const G4163_IJ = { 0.5: [42, 34, 4], 0.75: [50, 40, 5], 1: [60, 46, 8], 1.5: [67, 51, 11], 2: [82, 58, 13], 3.25: [98, 75, 17], 4.75: [114, 89, 19], 6.5: [130, 102, 22], 8.5: [150, 118, 25], 9.5: [166, 131, 27], 12: [178, 147, 30], 13.5: [197, 162, 33], 17: [202, 175, 19], 25: [249, 216, 23], 35: [269, 238, 26], 42.5: [301, 274, 29], 55: [330, 310, 32], 85: [380, 340, 39] };
const G4163 = [
  // wll, a, b, c, d, e, f, g, h, kg
  [0.5, 7, 8, 16.5, 7, 12, 29, 20, 48.5, 0.06],
  [0.75, 9, 10, 20, 9, 13.5, 32, 22, 56, 0.11],
  [1, 10, 11, 22.5, 10, 17, 36.5, 26, 63.5, 0.16],
  [1.5, 11, 13, 26.5, 11, 19, 43, 29, 74, 0.22],
  [2, 13.5, 16, 34, 13, 22, 51, 32, 89, 0.42],
  [3.25, 16, 19, 40, 16, 27, 64, 43, 110, 0.74],
  [4.75, 19, 22, 46, 19, 31, 76, 51, 129, 1.18],
  [6.5, 22, 25, 52, 22, 36, 83, 58, 144, 1.77],
  [8.5, 25, 28, 59, 25, 43, 95, 68, 164, 2.58],
  [9.5, 28, 32, 66, 28, 47, 108, 75, 185, 3.66],
  [12, 32, 35, 72, 32, 51, 115, 83, 201, 4.91],
  [13.5, 35, 38, 80, 35, 57, 133, 92, 227, 6.54],
  [17, 38, 42, 88, 38, 60, 146, 99, 249, 8.19],
  [25, 45, 50, 103, 45, 74, 178, 126, 300, 14.22],
  [35, 50, 57, 111, 50, 83, 197, 138, 331, 19.53],
  [42.5, 57, 65, 130, 57, 95, 222, 160, 377, 28.33],
  [55, 65, 70, 145, 65, 105, 260, 180, 433, 39.59],
  [85, 75, 83, 162, 73, 127, 329, 190, 527, 62],
];





function shackleRows(rows, { brand, model, family, prefix, mbl, label, source, wide = false }) {
  return rows.map((r) => {
    const [wll, a, b, c, d, e, f, g, h] = r;
    const l = wide ? r[9] : null;
    const kg = wide ? r[10] : r[9];
    return {
      id: `${prefix}-${wll}`,
      type: 'shackle',
      family,
      brand,
      model,
      name: `${label} ${fmtT(wll)} t`,
      short: `${brand} ${model} ${fmtT(wll)} t`,
      wll_t: wll,
      mbl_factor: mbl,
      weight_kg: kg,
      dims: { bowDia: a, pinDia: b, eyeDia: c, eyeWidth: d, jawWidth: e, insideLength: f, bowWidth: g, length: h, ...(l ? { bearingWidth: l } : {}) },
      wideBody: wide || undefined,
      source,
    };
  });
}

export const SHACKLE_RANGES = {
  'G-4163': 'Green Pin bow shackle, safety bolt (0.5–85 t)',
};
export const DEFAULT_SHACKLE_RANGES = ['G-4163'];

export const SHACKLES = shackleRows(G4163, { brand: 'Green Pin', model: 'G-4163', family: 'G-4163', prefix: 'GP-G4163', mbl: 6, label: 'Green Pin bow shackle, safety bolt', source: 'Green Pin bow shackle with safety bolt (manille lyre à axe boulonné goupillé) — table supplied' }).map((it) => {
  const [i, j, nut] = G4163_IJ[it.wll_t] || [];
  return { ...it, dims: { ...it.dims, pinLength: i, width: j, nutThk: nut } };
});

/** Green Pin side-load reduction curve (% of WLL vs angle from the shackle plane), DS p.90. */
export const GREEN_PIN_SIDE_LOAD = [
  [0, 100], [5, 100], [10, 94], [15, 89.5], [20, 85.5], [25, 82], [30, 78.5], [35, 76], [40, 72.5],
  [45, 70], [50, 66.5], [55, 64], [60, 61], [65, 59], [70, 56.5], [75, 54.5], [80, 53], [85, 51], [90, 50],
];

// ---------------------------------------------------------------------------
// MASTER LINKS

// G80 master links for 1- and 2-leg slings (DS p.38): stock dia A, inside width B, inside length C
const G80_SINGLE = [
  // dia, kg, wll, B, C
  [13, 0.36, 2.5, 60, 120], [17, 0.86, 4.1, 90, 160], [19, 1.08, 6.7, 90, 160], [22, 1.59, 8.5, 90, 170],
  [25, 2.43, 11.5, 115, 210], [28, 3.22, 12.9, 110, 210], [31, 4.86, 17, 145, 275], [36, 6.87, 24, 155, 285],
  [38, 7.63, 31.5, 140, 270], [45, 12.7, 38.3, 170, 320], [50, 17.6, 45, 200, 380], [57, 24.5, 65.3, 203, 406],
];
// G80 master link assemblies for 3- and 4-leg slings (DS p.38): main link A/B/C + 2 sub-links D/E/F
const G80_QUAD = [
  // name, kg, wll, A, B, C, D (sub stock), E (sub inside length), F (sub inside width)
  ['13/12', 0.81, 2.4, 13, 60, 120, 12, 85, 45], ['17/13', 1.56, 4.1, 17, 90, 160, 13, 120, 60],
  ['19/13', 1.8, 4.25, 19, 90, 160, 13, 120, 60], ['22/17', 3.35, 7.98, 22, 100, 180, 17, 160, 90],
  ['28/22', 7.17, 14.5, 28, 145, 275, 22, 180, 100], ['31/25', 9.72, 17, 31, 145, 275, 25, 210, 115],
  ['40/31', 18.68, 28.1, 40, 160, 300, 31, 275, 145], ['45/36', 26.56, 38.3, 45, 180, 340, 36, 285, 155],
  ['51/45', 42.92, 45, 51, 190, 350, 45, 340, 180], ['57/50', 59.7, 67, 57, 203, 406, 50, 380, 200],
];

export const MASTERLINKS = [
  ...G80_SINGLE.map(([d, kg, wll, B, C]) => ({
    id: `DS-G80-ML-${d}`,
    type: 'masterlink',
    family: 'G80',
    brand: 'DS Levage',
    model: 'G80 master link',
    name: `G80 master link Ø${d} mm (1–2 legs)`,
    short: `G80 master link Ø${d}`,
    wll_t: wll,
    mbl_factor: 4,
    weight_kg: kg,
    dims: { stockDia: d, insideWidth: B, insideLength: C },
    source: `${DS} p.38`,
  })),
  ...G80_QUAD.map(([n, kg, wll, A, B, C, D, E, F]) => ({
    id: `DS-G80-QML-${n.replace('/', '-')}`,
    type: 'masterlink',
    family: 'G80-QUAD',
    brand: 'DS Levage',
    model: 'G80 master link assembly',
    name: `G80 master link assembly ${n} (3–4 legs, 2 sub-links)`,
    short: `G80 assembly ${n}`,
    wll_t: wll,
    mbl_factor: 4,
    weight_kg: kg,
    dims: { stockDia: A, insideWidth: B, insideLength: C },
    sub: { stockDia: D, insideLength: E, insideWidth: F, count: 2 },
    source: `${DS} p.38`,
  })),
];

// ---------------------------------------------------------------------------
// SLINGS
// Polyester roundslings EN 1492-2, SF 7:1 — widths from DS p.64. DS gives no weight:
// kg/m values are TYPICAL; widths for 50–150 t are ESTIMATES (not given by DS).
const RS_PES = [
  // wll, colour, hex, width mm, kg/m (EWL), width estimated?
  [1, 'Violet', '#7b3fa0', 45, 0.3], [2, 'Green', '#2e8b3a', 50, 0.45], [3, 'Yellow', '#e0c020', 65, 0.6],
  [4, 'Grey', '#8a8f96', 70, 0.8], [5, 'Red', '#c8302c', 85, 1.0], [6, 'Brown', '#7a4a26', 90, 1.2],
  [8, 'Blue', '#2a5db0', 95, 1.6], [10, 'Orange', '#e8822a', 120, 2.0], [12, 'Orange', '#e8822a', 150, 2.3],
  [15, 'Orange', '#e8822a', 200, 2.8], [20, 'Orange', '#e8822a', 200, 3.6], [25, 'Orange', '#e8822a', 230, 4.4],
  [50, 'Orange', '#e8822a', 280, 8.4, true], [75, 'Orange', '#e8822a', 330, 12.5, true], [100, 'Orange', '#e8822a', 380, 16.5, true],
  [120, 'Orange', '#e8822a', 410, 19.8, true], [150, 'Orange', '#e8822a', 450, 24.5, true],
];
// every length from 1 m to 20 m in 0.5 m steps (all three sling types)
export const ROUNDSLING_STD_LENGTHS = Array.from({ length: 39 }, (_, i) => 1 + i * 0.5);

const ROUNDSLINGS = [
  ...RS_PES.filter((r) => r[0] <= 30).map(([wll, colour, hex, width, kgm, est]) => ({
    id: `RS-PES-${wll}`,
    type: 'roundsling',
    family: 'RS-PES',
    brand: 'EN 1492-2',
    model: 'PES',
    name: `Polyester roundsling ${fmtT(wll)} t (${colour.toLowerCase()})`,
    short: `PES roundsling ${fmtT(wll)} t ${colour.toLowerCase()}`,
    wll_t: wll,
    mbl_factor: 7,
    color: colour,
    colorHex: hex,
    weight_kg_per_m: kgm,
    dims: { width },
    lengths: ROUNDSLING_STD_LENGTHS,
    source: `${DS} p.64 (width${est ? ' estimated' : ''}; weight typical)`,
  })),
];

// Steel wire rope slings, eye–eye, 6x36 IWRC, SF 5:1 — single-leg WLL by rope Ø (DS p.19).
// Weight per metre from the 6x36 WS IWRC rope table (DS p.13); Ø > 68 mm extrapolated (0.00418·d²).
const WIRE = [
  [8, 0.7], [10, 1.05], [11, 1.3], [12, 1.55], [13, 1.8], [14, 2.12], [16, 2.7], [18, 3.4], [20, 4.35],
  [22, 5.2], [24, 6.3], [26, 8.58], [28, 9.9], [32, 12.98], [36, 16.5], [40, 20.35], [44, 24.75], [48, 28.6],
  [52, 34], [56, 40], [60, 46], [62, 49], [64, 53], [68, 59], [72, 66.5], [77, 80], [83, 100], [90, 117],
];
const ROPE_KGM = { 8: 0.27, 10: 0.42, 12: 0.6, 14: 0.82, 16: 1.07, 18: 1.36, 20: 1.67, 22: 2.02, 24: 2.41, 26: 2.83, 28: 3.28, 30: 3.76, 32: 4.28, 34: 4.83, 36: 5.42, 38: 6.04, 40: 6.69, 42: 7.38, 44: 8.1, 46: 8.85, 48: 9.64, 50: 10.5, 52: 11.3, 54: 12.2, 56: 13.1, 58: 14.1, 60: 15.1, 62: 16.1, 64: 17.1, 66: 18.2, 68: 19.3 };
const ropeKgm = (d) => ROPE_KGM[d] ?? Math.round(0.00418 * d * d * 100) / 100;
export const WIRE_STD_LENGTHS = ROUNDSLING_STD_LENGTHS;

const WIRESLINGS = WIRE.filter((r) => r[1] <= 30).map(([d, wll]) => ({
  id: `WR-6x36-${d}`,
  type: 'wiresling',
  family: 'WIRE',
  brand: 'DS Levage',
  model: '6x36 IWRC',
  name: `Wire rope sling 6x36 IWRC Ø${d} mm, eye–eye`,
  short: `Wire sling Ø${d}`,
  wll_t: wll,
  mbl_factor: 5,
  colorHex: '#8d99a6',
  weight_kg_per_m: ropeKgm(d),
  dims: { width: d, ropeDia: d },
  lengths: WIRE_STD_LENGTHS,
  source: `${DS} p.19 / p.13${d === 90 ? ' (single-leg WLL derived from the 2-leg 45–60° column)' : ''}${d > 68 ? ' (weight extrapolated)' : ''}`,
}));

// Endless sleeved wire rope slings (DS p.20): WLL straight (M1), weight per extra metre.

// Cable-laid grommets 7x6x36 (DS p.20): rope Ø, grommet body Ø, WLL; weight per metre of body,
// converted here to kg per metre of effective working length (× 2).

// Polyester webbing slings EN 1492-1, SF 7:1 (DS p.64). Weight per metre: TYPICAL.
const WEB = [
  [1, 'Violet', '#7b3fa0', 30], [2, 'Green', '#2e8b3a', 60], [3, 'Yellow', '#e0c020', 90], [4, 'Grey', '#8a8f96', 120],
  [5, 'Red', '#c8302c', 150], [6, 'Brown', '#7a4a26', 180], [8, 'Blue', '#2a5db0', 240], [10, 'Orange', '#e8822a', 300],
  [12, 'Orange', '#e8822a', 300], [15, 'Orange', '#e8822a', 300], [16, 'Orange', '#e8822a', 300], [20, 'Orange', '#e8822a', 300],
  [30, 'Orange', '#e8822a', 300], [40, 'Orange', '#e8822a', 300],
];
const WEBBINGS = WEB.filter((r) => r[0] <= 30).map(([wll, colour, hex, width]) => ({
  id: `WEB-PES-${wll}`,
  type: 'webbing',
  family: 'WEB',
  brand: 'EN 1492-1',
  model: 'PES',
  name: `Polyester webbing sling ${wll} t (${colour.toLowerCase()}, ${width} mm)`,
  short: `Webbing ${wll} t ${width} mm`,
  wll_t: wll,
  mbl_factor: 7,
  color: colour,
  colorHex: hex,
  weight_kg_per_m: Math.round(0.0025 * width * Math.max(1, wll / 10) * 100) / 100,
  dims: { width },
  lengths: ROUNDSLING_STD_LENGTHS,
  source: `${DS} p.64 (weight typical)`,
}));

export const SLINGS = [...ROUNDSLINGS, ...WIRESLINGS, ...WEBBINGS];
export const SLING_TYPES = ['roundsling', 'wiresling', 'webbing'];

export const SLING_FAMILIES = {
  'RS-PES': 'Round sling (polyester)',
  WEB: 'Flat webbing sling (polyester)',
  WIRE: 'Steel wire rope sling',
};

// Mode factors (single sling)
export const SLING_MODE_FACTORS = {
  direct: { label: 'Straight', factor: 1.0 },
  choke: { label: 'Choked', factor: 0.8 },
};

// ---------------------------------------------------------------------------
// G-Link Slingmax® (connector for Twin-Path / Uni-Path roundslings)
// WLL: one G-Link (choker) or two G-Links — Unirope table (lbs → t). Effective length is an
// ESTIMATE (H − 2·B): column labels are not given in the source table. Check the Slingmax sheet.
const GL = [
  ['WF-GL-2', 2, 5000, 0.625, 5],
  ['WF-GL-3', 3, 10000, 0.6875, 6.625],
  ['WF-GL-4', 4, 15000, 0.8125, 7.5],
  ['WF-GL-5', 5, 30000, 1.0625, 9.75],
  ['WF-GL-6', 6, 50000, 1.25, 12.5],
];

export const GLINKS = GL.map(([code, w, lbs, b, h]) => ({
  id: `SM-${code}`,
  type: 'glink',
  family: 'GLINK',
  brand: 'Slingmax',
  model: 'G-Link',
  name: `Slingmax G-Link ${code}`,
  short: `G-Link ${code}`,
  wll_t: Math.round((lbs / LBS_PER_T) * 100) / 100,
  mbl_factor: 5,
  weight_kg: null,
  dims: { maxSlingWidth: Math.round(w * IN), effLength: Math.round((h - 2 * b) * IN), length: Math.round(h * IN), barThk: Math.round(b * IN) },
  source: 'Slingmax G-Link — Unirope table; effective length estimated',
}));


// ---------------------------------------------------------------------------
// CHAIN — DS Levage grade 80 (p.20) and grade 100 (p.24), EN 818-2 type.
// a = chain Ø, b = pitch (inside length of a link), c = outside width, weight per metre.
// Length of n links measured bearing to bearing = n × pitch.
const CH80 = [
  // d, wll, pitch, width, kg/m
  [6, 1.12, 18, 22, 0.78], [7, 1.5, 21, 26, 1.14], [8, 2.0, 24, 30, 1.5], [10, 3.15, 30, 36, 2.27],
  [13, 5.3, 39, 47, 3.74], [16, 8.0, 48, 58, 5.54], [20, 12.5, 60, 72, 8.94], [22, 15.0, 66, 79, 11.57],
  [26, 21.2, 78, 93, 15.26], [32, 31.5, 96, 112, 22.61],
];
const mkChain = (rows, grade, page) =>
  rows.map(([d, wll, p, w, kgm]) => ({
    id: `DS-CH${grade}-${d}`,
    type: 'chain',
    family: `CH-G${grade}`,
    grade,
    brand: 'DS Levage',
    model: `Chain G${grade}`,
    name: `Chain G${grade} Ø${d} mm`,
    short: `Chain G${grade} Ø${d}`,
    wll_t: wll,
    mbl_factor: 4,
    weight_kg_per_m: kgm,
    dims: { dia: d, pitch: p, width: w },
    source: `${DS} p.${page}`,
  }));
export const CHAINS = mkChain(CH80, 80, 20);
export const CHAIN_FAMILIES = { 'CH-G80': 'Chain grade 80' };

// CONNECTING LINKS (chain coupling links, "maille d'accouplement") — DS Levage G80 p.22.
// A overall length, B width, C bearing section. Effective length (bearing to bearing) is
// ESTIMATED as A − 2·C. G100 (CW) links: WLL of the G100 chain, dimensions of the G80 link of the
// same size (indicative — the G100 table of the catalogue is not legible enough).
const CL80 = [
  // chain Ø list, wll kg, A, B, C, kg per 100 pcs
  [[6], 1120, 42, 15, 7.5, 8], [[7, 8], 2000, 60.5, 19.5, 9.5, 14.6], [[10], 3150, 68, 26, 12, 30],
  [[13], 5300, 87, 30, 15, 63], [[16], 8000, 108.4, 35, 19.4, 115], [[20], 12500, 121.5, 41.8, 24, 210],
  [[22], 15000, 141.5, 49.5, 26, 300], [[26], 21500, 158, 58, 31, 450], [[32], 31500, 205, 67.5, 38, 821],
];
const clDims = (A, B, C) => ({ length: A, width: B, barThk: C, effLength: Math.round((A - 2 * C) * 10) / 10 });
export const CONNLINKS = [
  ...CL80.map(([dias, wll, A, B, C, kg]) => ({
    id: `DS-CL80-${dias.join('-')}`,
    type: 'connlink',
    family: 'CL-G80',
    grade: 80,
    brand: 'DS Levage',
    model: 'Connecting link G80',
    name: `Connecting link G80 for chain Ø${dias.join('/')} mm`,
    short: `Conn. link G80 Ø${dias.join('/')}`,
    chainDias: dias,
    wll_t: wll / 1000,
    mbl_factor: 4,
    weight_kg: kg / 100,
    dims: clDims(A, B, C),
    source: `${DS} p.22 (effective length estimated A − 2C)`,
  })),
];


// ---------------------------------------------------------------------------
// PAD EYES type S (standard weld-on padeyes, datasheet supplied by the user).
// L base length | A hole centre height | H hole Ø | R outer radius | t main plate | T total thickness
// (T − t = cheek plates). Datasheet rules: T ≥ 75 % of the shackle inside width, H ≤ 106 % of the pin Ø.
const PE_S = [
  // stock, shackle size, WLL t, wire in, wire mm, L, A, H, R, t, T, kg
  ['53.001.00.0S', '3/8"', 1, '3/8"', '9-10', 76, 32, 11.5, 26, 14, 14, 0.3],
  ['53.001.50.0S', '7/16"', 1.5, '3/8"', '9-10', 90, 32, 13.5, 32, 15, 15, 0.5],
  ['53.002.00.0S', '1/2"', 2, '1/2"', '12-13', 100, 38, 17, 35, 18, 18, 0.7],
  ['53.003.25.0S', '5/8"', 3.25, '3/4"', '19', 115, 45, 20, 38, 22, 22, 1.5],
  ['53.004.75.0S', '3/4"', 4.75, '3/4"', '19', 140, 51, 23, 45, 25, 25, 2],
  ['53.006.50.0S', '7/8"', 6.5, '1"', '25-26', 150, 57, 26, 51, 30, 30, 3],
  ['53.008.50.0S', '1"', 8.5, '1"', '25-26', 180, 64, 29.5, 64, 35, 35, 5],
  ['53.009.50.0S', '1 1/8"', 9.5, '1"', '25-26', 203, 76, 33.5, 76, 40, 40, 7.5],
  ['53.012.00.0S', '1 1/4"', 12, '1 1/4"', '32', 216, 83, 37, 83, 45, 45, 10],
  ['53.013.50.0S', '1 3/8"', 13.5, '1 1/4"', '32', 228, 89, 40, 89, 30, 50, 10],
  ['53.017.00.0S', '1 1/2"', 17, '1 3/8"', '35', 280, 140, 44, 102, 40, 50, 18],
  ['53.025.00.0S', '1 3/4"', 25, '1 5/8"', '41-42', 305, 140, 53, 121, 40, 60, 23],
  ['53.035.00.0S', '2"', 35, '2"', '51', 356, 153, 60, 133, 50, 70, 35],
  ['53.055.00.0S', '2 1/2"', 55, '2 1/2"', '63-64', 482, 165, 74, 152, 50, 90, 55],
  ['53.085.00.0S', '3"', 85, '3"', '76-77', 559, 203, 87, 178, 60, 110, 90],
  ['53.120.00.0S', '3 1/2"', 120, '3 3/4"', '95-96', 711, 254, 100, 229, 70, 120, 170],
  ['53.150.00.0S', '4"', 150, '4"', '102', 813, 280, 114, 254, 80, 150, 250],
];
export const PADEYES = PE_S.map(([stock, shackle, wll, wireIn, wireMm, L, A, H, R, t, T, kg]) => ({
  id: `PE-S-${stock}`,
  type: 'padeye',
  family: 'PE-S',
  stock,
  shackleSize: shackle,
  name: `Pad eye type S ${wll} t (${stock})`,
  short: `Pad eye S ${wll}t`,
  wll_t: wll,
  wire: `${wireIn} / ${wireMm} mm`,
  weight_kg: kg,
  dims: { L, A, H, R, t, T, cheek: (T - t) / 2 },
  source: 'Pad eye type S datasheet (S355J2G3, EN 10204 3.1)',
}));


// ---------------------------------------------------------------------------
// SELF-LOCKING EYE HOOKS G80 (crochet de sécurité automatique à l'œil) — table supplied.
// A overall length | B section at the saddle | C eye inside Ø | O opening.
// Effective length (eye bearing → hook saddle) ESTIMATED as A − 1.5·B.
const HK80 = [
  // chain Ø list, wll kg, A, B, C, O, kg/100
  [[6], 1120, 130, 19.5, 22, 28, 50], [[7, 8], 2000, 160, 24, 25, 34, 80], [[10], 3150, 201, 30, 32, 44, 143],
  [[13], 5300, 248.5, 40, 40.5, 52, 286], [[16], 8000, 308, 50.5, 56, 60, 564], [[20], 12500, 330, 55, 64.5, 81, 850],
  [[22], 15000, 387, 67, 70, 82, 1300], [[26], 21200, 498, 75, 80, 110, 1800], [[32], 31500, 570, 97, 105, 168, 4450],
];
export const HOOKS = HK80.map(([dias, wll, A, B, C, O, kg]) => ({
  id: `HK80-${dias.join('-')}`,
  type: 'hook',
  family: 'HK-G80',
  grade: 80,
  name: `Self-locking eye hook G80 for chain Ø${dias.join('/')}`,
  short: `Safety hook ${wll / 1000}t`,
  chainDias: dias,
  wll_t: wll / 1000,
  mbl_factor: 4,
  weight_kg: kg / 100,
  dims: { length: A, saddle: B, eyeDia: C, opening: O, effLength: Math.round((A - 1.5 * B) * 10) / 10 },
  source: 'Self-locking eye hook G80 table supplied (effective length estimated A − 1.5 B)',
}));

// LIFT POINTS WITH A RING — weld-on anchor points and eye bolts G80 (tables supplied).
// bar = ring bar Ø, inW / inL = inside width / length of the ring.
const ANCHOR = [
  // wll, a bar, b inside W, c inside L, d sole L, e sole H, f length, kg
  [1.2, 13, 40, 42, 35, 28, 83, 0.4], [3.2, 18, 45, 48, 42, 30, 99, 0.77], [5.4, 22, 55, 57, 49, 42, 121, 1.42],
  [8.2, 26, 70, 64, 60, 50, 143, 2.5], [12.8, 28, 85, 90, 78, 55, 173, 3.7], [15.5, 34, 99, 93, 90, 63, 190, 5.67],
];
const EYEBOLT = [
  // wll, thread, b base Ø, c eye outside Ø, d eye inside Ø, e length, f base thk, g bar Ø, kg
  [0.2, 'M6', 20, 34, 20, 17, 7, 5, 0.05], [0.4, 'M8', 20, 34, 20, 24, 7, 5, 0.06], [0.7, 'M10', 20, 38, 22, 30, 8, 8, 0.08],
  [1, 'M12', 25, 47, 26, 36, 23, 10, 0.14], [1.2, 'M14', 30, 57, 29, 40, 28, 14, 0.25], [1.5, 'M16', 30, 65, 35, 55, 30, 14, 0.39],
  [2, 'M18', 35, 65, 35, 54, 30, 14, 0.38], [2.5, 'M20', 40, 73, 39, 59, 34, 16, 0.58], [3, 'M22', 42, 82, 45, 59, 39, 18, 1.01],
  [4, 'M24', 55, 95, 54, 84, 40, 20, 1.12], [5, 'M27', 55, 95, 54, 84, 40, 20, 1.18], [6, 'M30', 60, 108, 59, 100, 40, 24, 2.01],
  [7, 'M33', 60, 108, 59, 100, 49, 24, 2.01], [8, 'M36', 65, 118, 67, 118, 45, 25, 2.44], [9, 'M39', 65, 118, 67, 118, 45, 25, 2.62],
  [10, 'M42', 70, 139, 79, 135, 56, 31, 5.41], [12, 'M45', 70, 139, 79, 135, 56, 31, 4.16], [15, 'M48', 95, 181, 97, 150, 68, 43, 8.22],
  [20, 'M52', 95, 181, 97, 150, 68, 43, 8.55], [25, 'M56', 95, 181, 97, 150, 68, 43, 8.85], [30, 'M60', 95, 181, 97, 150, 68, 43, 9.16],
  [36, 'M64', 95, 181, 97, 150, 68, 43, 9.55],
];
export const RINGS = [
  ...ANCHOR.map(([wll, a, b, c, d, e, f, kg]) => ({
    id: `ANC-${wll}`, type: 'ring', family: 'ANCHOR', name: `Weld-on anchor point ${wll} t`, short: `Anchor point ${wll}t`,
    wll_t: wll, weight_kg: kg, dims: { bar: a, inW: b, inL: c, soleL: d, soleH: e, length: f }, source: 'Weld-on anchor point table supplied',
  })),
  ...EYEBOLT.map(([wll, th, b, c, d, e, f, g, kg]) => ({
    id: `EB80-${th}`, type: 'ring', family: 'EYEBOLT', name: `Eye bolt G80 ${th} — ${wll} t (axial)`, short: `Eye bolt ${th} ${wll}t`,
    wll_t: wll, weight_kg: kg, dims: { bar: g, inW: d, inL: d, thread: th, baseDia: b, outDia: c, length: e, baseThk: f },
    note: 'WLL for an axial (vertical) pull — reduce for angled pulls as per the manufacturer', source: 'Eye bolt G80 table supplied',
  })),
];

export const CATALOG_TYPES = {
  shackle: 'Shackle',
  masterlink: 'Master link',
  roundsling: 'Roundsling',
  wiresling: 'Wire rope sling',
  grommet: 'Grommet',
  webbing: 'Webbing sling',
  glink: 'G-Link (Slingmax)',
  chain: 'Chain',
  connlink: 'Connecting link',
  padeye: 'Pad eye',
  hook: 'Safety hook',
  ring: 'Anchor point / eye bolt',
  other: 'Other',
};

export const BUILTIN_CATALOG = [...SHACKLES, ...MASTERLINKS, ...SLINGS, ...GLINKS, ...CHAINS, ...CONNLINKS, ...HOOKS, ...PADEYES, ...RINGS];
