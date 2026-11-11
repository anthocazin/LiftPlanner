// Lifting equipment catalogue.
//
// IMPORTANT: data taken from public manufacturer / distributor literature (main source: DS Levage
// general catalogue 2025; Crosby A-342 and Slingmax G-Link from Unirope tables). It is meant for
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

// G-4161 Standard bow shackle, screw collar pin — grade 6 (DS p.92). Not for long-term use or
// where the pin may rotate: excluded from auto-selection by default.
const G4161 = [
  [0.33, 5, 6, 12, 5, 9.5, 22, 16, 36, 0.02],
  [0.5, 7, 8, 16.5, 7, 12, 29, 20, 45.5, 0.05],
  [0.75, 9, 10, 20, 9, 13.5, 32, 22, 56, 0.1],
  [1, 10, 11, 22.5, 10, 17, 36.5, 26, 63.5, 0.14],
  [1.5, 11, 13, 26.5, 11, 19, 43, 29, 74, 0.19],
  [2, 13.5, 16, 34, 13, 22, 51, 32, 89, 0.36],
  [3.25, 16, 19, 40, 16, 27, 64, 43, 110, 0.63],
  [4.75, 19, 22, 46, 19, 31, 76, 51, 129, 1.01],
  [6.5, 22, 25, 52, 22, 36, 83, 58, 144, 1.5],
  [8.5, 25, 28, 59, 25, 43, 95, 68, 164, 2.21],
  [9.5, 28, 32, 66, 28, 47, 108, 75, 185, 3.16],
  [12, 32, 35, 72, 32, 51, 115, 83, 201, 4.31],
  [13.5, 35, 38, 80, 35, 57, 133, 92, 227, 5.55],
  [17, 38, 42, 88, 38, 60, 146, 99, 249, 7.43],
  [25, 45, 50, 103, 45, 74, 178, 126, 300, 12.84],
  [35, 50, 57, 111, 50, 83, 197, 138, 331, 18.15],
  [42.5, 57, 65, 130, 57, 95, 222, 160, 377, 26.29],
  [55, 65, 70, 145, 65, 105, 260, 180, 433, 37.6],
];

// G-5263 Super bow shackle, safety bolt — grade 8, MBL = 5 × WLL (DS p.95)
const G5263 = [
  [3.3, 13.5, 16, 34, 13, 22, 51, 32, 89, 0.4],
  [5, 16, 19, 40, 16, 27, 64, 43, 110, 0.73],
  [7, 19, 22, 46, 19, 31, 76, 51, 129, 1.19],
  [9.5, 22, 25, 52, 22, 36, 83, 58, 144, 1.73],
  [12.5, 25, 28, 59, 25, 43, 95, 68, 164, 2.56],
  [15, 28, 32, 66, 28, 47, 108, 75, 185, 3.6],
  [18, 32, 35, 72, 32, 51, 115, 83, 201, 4.95],
  [21, 35, 38, 80, 35, 57, 133, 92, 227, 6.62],
  [30, 38, 42, 88, 38, 60, 146, 99, 249, 8.11],
  [40, 45, 50, 103, 45, 74, 178, 126, 300, 15],
  [55, 57, 57, 117, 57, 83, 197, 138, 341, 23],
  [85, 70, 70, 143, 70, 105, 260, 180, 437, 44],
  [120, 83, 83, 162, 83, 127, 329, 190, 535, 72],
  [150, 95, 95, 208, 91, 147, 400, 238, 647, 112],
  [175, 105, 108, 238, 102, 169, 410, 275, 688, 160],
];

// P-6036 Heavy Duty bow shackle, safety bolt — grade 8, MBL = 5 × WLL (DS p.94)
const P6036 = [
  [120, 95, 95, 208, 95, 147, 400, 238, 647, 110],
  [150, 105, 108, 238, 105, 169, 410, 275, 688, 160],
  [200, 120, 130, 279, 120, 179, 513, 290, 838, 235],
  [250, 130, 140, 299, 130, 205, 554, 305, 904, 295],
  [300, 140, 150, 325, 140, 205, 618, 305, 996, 368],
  [400, 170, 175, 376, 164, 231, 668, 325, 1114, 560],
  [500, 180, 185, 398, 164, 256, 718, 350, 1190, 685],
  [600, 200, 205, 444, 189, 282, 718, 375, 1243, 880],
  [700, 210, 215, 454, 204, 308, 718, 400, 1263, 980],
  [800, 210, 220, 464, 204, 308, 718, 400, 1270, 1100],
  [900, 220, 230, 485, 215, 328, 718, 420, 1296, 1280],
  [1000, 240, 240, 515, 215, 349, 718, 420, 1336, 1460],
  [1250, 260, 270, 585, 230, 369, 768, 450, 1456, 1990],
  [1500, 280, 290, 625, 230, 369, 818, 450, 1556, 2400],
];

// Green Pin Wide Body bow shackle, safety bolt (DS p.95). Extra column l = width of the wide bow
// (sling bearing width). Larger bearing radius = longer sling life: well suited to roundslings
// and grommets.
const WIDE = [
  // wll, a, b, c, d, e, f, g, h, l, kg
  [7, 22, 22, 46, 19, 32, 96, 64, 153, 41, 2],
  [12.5, 28, 28, 61, 25, 44, 121, 82, 197, 54, 4],
  [18, 35, 35, 69, 30, 54, 148, 102, 239, 64, 7],
  [30, 40, 42, 90, 35, 69, 165, 126, 279, 79, 13],
  [40, 55, 51, 109, 45, 84, 199, 140, 331, 97, 21],
  [55, 60, 57, 115, 55, 90, 240, 160, 389, 100, 30],
  [75, 68, 70, 125, 54, 110, 290, 185, 473, 120, 48],
  [125, 85, 80, 154, 85, 137, 366, 220, 583, 150, 92],
  [150, 94, 95, 179, 89, 147, 391, 253, 645, 170, 140],
  [200, 110, 105, 199, 100, 158, 481, 280, 759, 205, 205],
  [250, 126, 120, 227, 110, 179, 542, 300, 859, 240, 264],
  [300, 135, 134, 245, 122, 195, 601, 350, 947, 265, 360],
  [400, 160, 160, 293, 145, 231, 576, 370, 985, 320, 580],
  [500, 170, 180, 328, 160, 263, 681, 450, 1131, 339, 780],
  [600, 190, 200, 348, 170, 289, 741, 490, 1234, 370, 980],
  [700, 200, 215, 392, 190, 315, 751, 540, 1284, 400, 1360],
  [800, 218, 230, 420, 200, 342, 851, 554, 1426, 420, 1430],
  [900, 242, 255, 466, 220, 368, 851, 580, 1488, 440, 1650],
  [1000, 260, 270, 490, 240, 399, 851, 614, 1532, 460, 2970],
  [1250, 285, 300, 510, 260, 452, 931, 650, 1666, 530, 3700],
  [1550, 285, 320, 550, 280, 483, 950, 680, 1710, 560, 4000],
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
  'G-4163': 'Green Pin Standard, safety bolt G-4163 (0.5–85 t, 6:1)',
  'P-6036': 'Green Pin Heavy Duty, safety bolt P-6036 (120–1500 t, 5:1)',
  'G-5263': 'Green Pin Super, safety bolt G-5263 (3.3–175 t, 5:1)',
  WIDE: 'Green Pin Wide Body, safety bolt (7–1550 t)',
  'G-4161': 'Green Pin Standard, screw pin G-4161 (0.33–55 t) — not for permanent rigging',
};
export const DEFAULT_SHACKLE_RANGES = ['G-4163', 'P-6036'];

export const SHACKLES = [
  ...shackleRows(G4163, { brand: 'Green Pin', model: 'G-4163', family: 'G-4163', prefix: 'GP-G4163', mbl: 6, label: 'Green Pin G-4163 bow shackle, safety bolt', source: `${DS} p.93 / Green Pin datasheet` }),
  ...shackleRows(P6036, { brand: 'Green Pin', model: 'P-6036', family: 'P-6036', prefix: 'GP-P6036', mbl: 5, label: 'Green Pin P-6036 heavy duty bow shackle, safety bolt', source: `${DS} p.94` }),
  ...shackleRows(G5263, { brand: 'Green Pin', model: 'G-5263', family: 'G-5263', prefix: 'GP-G5263', mbl: 5, label: 'Green Pin G-5263 Super bow shackle, safety bolt', source: `${DS} p.95` }),
  ...shackleRows(WIDE, { brand: 'Green Pin', model: 'Wide Body', family: 'WIDE', prefix: 'GP-WB', mbl: null, label: 'Green Pin Wide Body shackle, safety bolt', source: `${DS} p.95`, wide: true }),
  ...shackleRows(G4161, { brand: 'Green Pin', model: 'G-4161', family: 'G-4161', prefix: 'GP-G4161', mbl: 6, label: 'Green Pin G-4161 bow shackle, screw pin', source: `${DS} p.92` }),
];

/** Green Pin side-load reduction curve (% of WLL vs angle from the shackle plane), DS p.90. */
export const GREEN_PIN_SIDE_LOAD = [
  [0, 100], [5, 100], [10, 94], [15, 89.5], [20, 85.5], [25, 82], [30, 78.5], [35, 76], [40, 72.5],
  [45, 70], [50, 66.5], [55, 64], [60, 61], [65, 59], [70, 56.5], [75, 54.5], [80, 53], [85, 51], [90, 50],
];

// ---------------------------------------------------------------------------
// MASTER LINKS
// Crosby® A-342 alloy master links — Unirope table (lbs → t, in → mm)
const A342 = [
  // size, WLL lbs, IL in, IW in, D in, weight lbs
  ['1/2"W', 7400, 5.0, 2.8, 0.62, 1.3],
  ['5/8"', 9000, 6.0, 3.0, 0.62, 1.5],
  ['3/4"', 12300, 6.0, 3.2, 0.73, 2.0],
  ['7/8"', 15200, 6.38, 3.75, 0.87, 3.3],
  ['1"', 26000, 7.5, 4.3, 1.1, 6.1],
  ['1-1/4"', 39100, 9.5, 5.5, 1.33, 12.0],
  ['1-1/2"', 61100, 10.5, 5.9, 1.61, 18.6],
  ['1-3/4"', 84900, 12.0, 6.0, 1.75, 25.2],
  ['2"', 102600, 14.0, 7.0, 2.0, 37.0],
  ['2-1/4"', 143100, 16.0, 8.0, 2.25, 54.1],
  ['2-1/2"', 160000, 16.0, 8.38, 2.5, 68.5],
  ['2-3/4"', 216900, 18.0, 9.88, 2.75, 94.0],
  ['3"', 228000, 18.0, 9.88, 3.0, 115.0],
  ['3-1/4"', 262200, 20.0, 10.0, 3.25, 145.0],
  ['3-1/2"', 279000, 24.0, 12.0, 3.5, 200.0],
  ['3-3/4"', 336000, 20.0, 10.0, 3.75, 198.0],
  ['4"', 373000, 24.0, 12.0, 4.0, 264.0],
];

const CROSBY = A342.map(([size, lbs, il, iw, d, wlbs]) => ({
  id: `CR-A342-${size.replace(/"/g, 'in')}`,
  type: 'masterlink',
  family: 'A-342',
  brand: 'Crosby',
  model: 'A-342',
  name: `Crosby A-342 master link ${size}`,
  short: `Crosby A-342 ${size}`,
  wll_t: Math.round((lbs / LBS_PER_T) * 100) / 100,
  mbl_factor: 4,
  weight_kg: Math.round((wlbs / 2.20462) * 10) / 10,
  dims: { stockDia: Math.round(d * IN), insideWidth: Math.round(iw * IN), insideLength: Math.round(il * IN) },
  source: 'Crosby A-342 — Unirope table (converted lbs→t, in→mm)',
}));

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
// Large G80 master links for big crane hooks (DIN 15401 hook no. 25 / 50 / 100) — DS p.39.
// t = overall link length, w = inside width; inside length taken as t − d (estimate).
const G80_LARGE = [
  // hook no, wll t, d, t, w, kg
  [25, 2.5, 23, 340, 180, 3.4], [25, 4, 27, 340, 180, 4.8], [25, 6.7, 27, 340, 180, 4.4], [25, 10, 33, 340, 180, 6.7],
  [25, 19, 40, 340, 180, 10], [50, 10, 33, 500, 250, 10], [50, 16, 40, 460, 250, 13.13], [50, 22.4, 45, 500, 250, 17.81],
  [50, 33.6, 50, 460, 250, 21], [50, 40, 56, 460, 250, 26.1], [100, 40, 60, 800, 320, 48],
];

export const MASTERLINKS = [
  ...CROSBY,
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
  ...G80_LARGE.map(([hook, wll, d, t, w, kg]) => ({
    id: `DS-G80-LML-${hook}-${wll}`,
    type: 'masterlink',
    family: 'G80-LARGE',
    brand: 'DS Levage',
    model: `G80 large master link (hook no. ${hook})`,
    name: `G80 large master link ${wll} t for DIN 15401 hook no. ${hook}`,
    short: `G80 large link ${wll} t (no. ${hook})`,
    wll_t: wll,
    mbl_factor: 4,
    weight_kg: kg,
    dims: { stockDia: d, insideWidth: w, insideLength: t - d },
    source: `${DS} p.39 (inside length estimated as t − d)`,
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
// UHMWPE roundslings (DS p.66): WLL, MBL, single strand dia, kg per metre EWL. SF 7:1.
const RS_UHMWPE = [
  [15, 105, 49, 1.6], [20, 140, 55, 1.9], [50, 350, 82, 4.6], [100, 700, 114, 8.4], [120, 840, 127, 10.3], [170, 1190, 146, 14],
];
export const ROUNDSLING_STD_LENGTHS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20];

const ROUNDSLINGS = [
  ...RS_PES.map(([wll, colour, hex, width, kgm, est]) => ({
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
  ...RS_UHMWPE.map(([wll, mbl, strand, kgm]) => ({
    id: `RS-UHMWPE-${wll}`,
    type: 'roundsling',
    family: 'RS-UHMWPE',
    brand: 'DS Levage',
    model: 'UHMWPE',
    name: `UHMWPE roundsling ${wll} t (MBL ${mbl} t)`,
    short: `UHMWPE roundsling ${wll} t`,
    wll_t: wll,
    mbl_factor: 7,
    colorHex: '#c9ced4',
    weight_kg_per_m: kgm,
    dims: { width: 2 * strand, strandDia: strand },
    lengths: ROUNDSLING_STD_LENGTHS,
    source: `${DS} p.66 (bearing width taken as 2 × strand Ø)`,
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
export const WIRE_STD_LENGTHS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20];

const WIRESLINGS = WIRE.map(([d, wll]) => ({
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
const ENDLESS = [
  [8, 1.4, 0.231], [10, 2.1, 0.361], [12, 3.1, 0.52], [14, 4.24, 0.708], [16, 5.4, 0.924], [18, 6.8, 1.17],
  [20, 8.7, 1.444], [22, 10.4, 1.747], [24, 12.6, 2.079], [26, 14.4, 2.44], [28, 16.8, 2.83], [32, 22, 2.697], [36, 28, 4.679],
];
const ENDLESS_SLINGS = ENDLESS.map(([d, wll, kgm]) => ({
  id: `WR-END-${d}`,
  type: 'wiresling',
  family: 'WIRE-ENDLESS',
  brand: 'DS Levage',
  model: 'Endless',
  name: `Endless sleeved wire rope sling Ø${d} mm`,
  short: `Endless wire sling Ø${d}`,
  wll_t: wll,
  mbl_factor: 5,
  colorHex: '#8d99a6',
  weight_kg_per_m: kgm,
  dims: { width: d * 2, ropeDia: d },
  lengths: WIRE_STD_LENGTHS,
  source: `${DS} p.20`,
}));

// Cable-laid grommets 7x6x36 (DS p.20): rope Ø, grommet body Ø, WLL; weight per metre of body,
// converted here to kg per metre of effective working length (× 2).
const GROMMET = [
  ['7x7x19', 9, 27, 12.7, 2.41], ['7x6x36', 10, 30, 15.4, 3.07], ['7x6x36', 12, 36, 22, 4.42], ['7x6x36', 13, 39, 25.9, 5.18],
  ['7x6x36', 14, 42, 29.7, 6.01], ['7x6x36', 16, 48, 39.1, 7.87], ['7x6x36', 18, 54, 49.5, 9.97], ['7x6x36', 20, 60, 61.1, 12.3],
  ['7x6x36', 22, 66, 75.9, 14.8], ['7x6x36', 24, 72, 92.4, 17.7], ['7x6x36', 26, 78, 112.2, 20.8], ['7x6x36', 28, 84, 133.1, 24.1],
  ['7x6x36', 30, 90, 158, 22.6], ['7x6x36', 32, 96, 184.8, 31.4], ['7x6x36', 34, 102, 217, 35.6], ['7x6x36', 36, 108, 249.7, 39.7],
  ['7x6x36', 38, 114, 262, 42.3], ['7x6x36', 40, 120, 300, 46.8], ['7x6x36', 42, 126, 344, 51.7], ['7x6x36', 44, 132, 392, 56.7],
  ['7x6x36', 48, 144, 505, 67.5], ['7x6x36', 52, 156, 700, 79.1], ['7x6x36', 56, 168, 800, 95.2], ['7x6x36', 64, 192, 1000, 119.7],
];
const GROMMETS = GROMMET.map(([constr, rope, body, wll, kgm]) => ({
  id: `GR-${body}`,
  type: 'grommet',
  family: 'GROMMET',
  brand: 'DS Levage',
  model: 'Cable-laid',
  name: `Cable-laid grommet ${constr} Ø${body} mm (rope Ø${rope}), WLL ${wll} t`,
  short: `Grommet Ø${body} (${wll} t)`,
  wll_t: wll,
  mbl_factor: 5,
  colorHex: '#6f7b88',
  weight_kg_per_m: Math.round(kgm * 2 * 100) / 100,
  dims: { width: body, ropeDia: body },
  lengths: WIRE_STD_LENGTHS,
  source: `${DS} p.20 (weight × 2 per metre of EWL)`,
}));

// Polyester webbing slings EN 1492-1, SF 7:1 (DS p.64). Weight per metre: TYPICAL.
const WEB = [
  [1, 'Violet', '#7b3fa0', 30], [2, 'Green', '#2e8b3a', 60], [3, 'Yellow', '#e0c020', 90], [4, 'Grey', '#8a8f96', 120],
  [5, 'Red', '#c8302c', 150], [6, 'Brown', '#7a4a26', 180], [8, 'Blue', '#2a5db0', 240], [10, 'Orange', '#e8822a', 300],
  [12, 'Orange', '#e8822a', 300], [15, 'Orange', '#e8822a', 300], [16, 'Orange', '#e8822a', 300], [20, 'Orange', '#e8822a', 300],
  [30, 'Orange', '#e8822a', 300], [40, 'Orange', '#e8822a', 300],
];
const WEBBINGS = WEB.map(([wll, colour, hex, width]) => ({
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

export const SLINGS = [...ROUNDSLINGS, ...WIRESLINGS, ...ENDLESS_SLINGS, ...GROMMETS, ...WEBBINGS];
export const SLING_TYPES = ['roundsling', 'wiresling', 'grommet', 'webbing'];

export const SLING_FAMILIES = {
  'RS-PES': 'Roundsling — polyester (EN 1492-2)',
  'RS-UHMWPE': 'Roundsling — UHMWPE',
  WIRE: 'Wire rope sling 6x36 IWRC, eye–eye',
  'WIRE-ENDLESS': 'Endless sleeved wire rope sling',
  GROMMET: 'Cable-laid grommet',
  WEB: 'Webbing sling — polyester (EN 1492-1)',
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
const CH100 = [
  [6, 1.4, 18, 22, 0.96], [7, 1.9, 21, 25, 1.2], [8, 2.5, 24, 29, 1.57], [10, 4.0, 30, 36, 2.46],
  [13, 6.7, 39, 47, 4.18], [16, 10.0, 48, 58, 6.28], [19, 14.0, 57, 69, 8.92], [22, 19.0, 66, 79, 11.88],
  [26, 26.5, 78, 94, 16.18], [32, 40.0, 96, 115, 24.1],
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
export const CHAINS = [...mkChain(CH80, 80, 20), ...mkChain(CH100, 100, 24)];
export const CHAIN_FAMILIES = { 'CH-G80': 'Chain grade 80 (EN 818-2)', 'CH-G100': 'Chain grade 100' };

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
  ...CH100.map(([d, wll]) => {
    const g = CL80.find((r) => r[0].includes(d)) || CL80.find((r) => r[0][0] >= d) || CL80[CL80.length - 1];
    return {
      id: `DS-CL100-${d}`,
      type: 'connlink',
      family: 'CL-G100',
      grade: 100,
      brand: 'DS Levage',
      model: 'Connecting link G100 (CW)',
      name: `Connecting link G100 for chain Ø${d} mm`,
      short: `Conn. link G100 Ø${d}`,
      chainDias: [d],
      wll_t: wll,
      mbl_factor: 4,
      weight_kg: g[5] / 100,
      dims: clDims(g[2], g[3], g[4]),
      source: `${DS} p.26 (WLL); dimensions indicative from the G80 link — check the certificate`,
    };
  }),
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
  other: 'Other',
};

export const BUILTIN_CATALOG = [...SHACKLES, ...MASTERLINKS, ...SLINGS, ...GLINKS, ...CHAINS, ...CONNLINKS, ...PADEYES];
