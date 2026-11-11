// Catalogue de matériel de levage.
//
// IMPORTANT : ces données proviennent de fiches catalogue publiques (fabricants / distributeurs)
// relevées en nov. 2026. Elles servent à la pré-sélection. Le lift plan final doit TOUJOURS
// être vérifié contre les certificats du matériel réellement utilisé (WLL, dimensions, poids).
// Toutes les dimensions sont en mm, les poids en kg, les WLL en tonnes (t).

const IN = 25.4; // mm par pouce
const LBS_PER_T = 2204.62;

// ---------------------------------------------------------------------------
// Manilles lyre à boulon Green Pin® G-4163 (Bow Shackle BN) — grade 6, MBL = 6 × WLL
// Colonnes catalogue : a Ø arc | b Ø axe | c Ø œil | d largeur œil | e largeur intérieure (au droit de l'axe)
// f longueur intérieure | g largeur intérieure de l'arc | h longueur hors-tout | poids
// Source : fiche G-4163 Green Pin (table métrique).
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

// Manilles lyre à boulon Green Pin® Heavy Duty P-6036 — grade 8, MBL = 5 × WLL
// Source : fiche P-6036 (table distributeur Mennens).
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

const fmtT = (w) => String(w).replace('.', ',');

function shackleRows(rows, { brand, model, prefix, mbl, label, source }) {
  return rows.map(([wll, a, b, c, d, e, f, g, h, kg]) => ({
    id: `${prefix}-${wll}`,
    type: 'shackle',
    brand,
    model,
    name: `${label} ${model} ${fmtT(wll)} t`,
    short: `${brand} ${model} ${fmtT(wll)} t`,
    wll_t: wll,
    mbl_factor: mbl,
    weight_kg: kg,
    dims: { bowDia: a, pinDia: b, eyeDia: c, eyeWidth: d, jawWidth: e, insideLength: f, bowWidth: g, length: h },
    source,
  }));
}

export const SHACKLES = [
  ...shackleRows(G4163, {
    brand: 'Green Pin',
    model: 'G-4163',
    prefix: 'GP-G4163',
    mbl: 6,
    label: 'Manille lyre à boulon Green Pin',
    source: 'Green Pin G-4163 Bow Shackle BN — fiche catalogue',
  }),
  ...shackleRows(P6036, {
    brand: 'Green Pin',
    model: 'P-6036',
    prefix: 'GP-P6036',
    mbl: 5,
    label: 'Manille lyre HD à boulon Green Pin',
    source: 'Green Pin P-6036 Heavy Duty Bow Shackle BN — fiche catalogue',
  }),
];

// ---------------------------------------------------------------------------
// Masterlinks (anneaux de tête oblongs) Crosby® A-342 — alliage, WLL en traction simple
// Source : table Unirope / Crosby A-342 (WLL lbs, IL = longueur int., IW = largeur int., D = Ø barre).
const A342 = [
  // taille, WLL lbs, IL in, IW in, D in, poids lbs
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

export const MASTERLINKS = A342.map(([size, lbs, il, iw, d, wlbs]) => ({
  id: `CR-A342-${size.replace(/"/g, 'in')}`,
  type: 'masterlink',
  brand: 'Crosby',
  model: 'A-342',
  name: `Masterlink Crosby A-342 ${size}`,
  short: `Crosby A-342 ${size}`,
  wll_t: Math.round((lbs / LBS_PER_T) * 100) / 100,
  mbl_factor: 4,
  weight_kg: Math.round((wlbs / 2.20462) * 10) / 10,
  dims: { stockDia: Math.round(d * IN), insideWidth: Math.round(iw * IN), insideLength: Math.round(il * IN) },
  source: 'Crosby A-342 Alloy Master Link — table Unirope (converti lbs→t, in→mm)',
}));

// ---------------------------------------------------------------------------
// Élingues rondes textiles polyester EN 1492-2 — coefficient d'utilisation 7:1
// Code couleur normalisé jusqu'à 10 t ; au-delà orange.
// Largeur "sous charge" et poids au mètre : VALEURS TYPIQUES (varient selon fabricant / gaine
// simple ou double). À remplacer par la fiche de votre fournisseur.
const RS = [
  // wll, couleur, hex, largeur sous charge mm, kg/m (EWL)
  [1, 'Violet', '#7b3fa0', 50, 0.3],
  [2, 'Vert', '#2e8b3a', 60, 0.45],
  [3, 'Jaune', '#e0c020', 70, 0.6],
  [4, 'Gris', '#8a8f96', 80, 0.8],
  [5, 'Rouge', '#c8302c', 90, 1.0],
  [6, 'Marron', '#7a4a26', 95, 1.2],
  [8, 'Bleu', '#2a5db0', 110, 1.6],
  [10, 'Orange', '#e8822a', 130, 2.0],
  [12, 'Orange', '#e8822a', 140, 2.3],
  [15, 'Orange', '#e8822a', 160, 2.8],
  [20, 'Orange', '#e8822a', 180, 3.6],
  [25, 'Orange', '#e8822a', 200, 4.4],
  [30, 'Orange', '#e8822a', 220, 5.2],
  [40, 'Orange', '#e8822a', 250, 6.8],
  [50, 'Orange', '#e8822a', 280, 8.4],
  [60, 'Orange', '#e8822a', 300, 10.0],
  [80, 'Orange', '#e8822a', 340, 13.2],
  [100, 'Orange', '#e8822a', 380, 16.5],
];

export const ROUNDSLING_STD_LENGTHS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20];

export const ROUNDSLINGS = RS.map(([wll, color, hex, width, kgm]) => ({
  id: `RS-PES-${wll}`,
  type: 'roundsling',
  brand: 'EN 1492-2',
  model: 'Polyester',
  name: `Élingue ronde textile PES ${fmtT(wll)} t (${color.toLowerCase()})`,
  short: `Ronde PES ${fmtT(wll)} t ${color.toLowerCase()}`,
  wll_t: wll,
  mbl_factor: 7,
  color,
  colorHex: hex,
  weight_kg_per_m: kgm,
  dims: { width: width },
  lengths: ROUNDSLING_STD_LENGTHS,
  source: 'EN 1492-2 (code couleur) — largeur/poids typiques, à confirmer fournisseur',
}));

// Facteurs de mode EN 1492-2 (élingue seule)
export const SLING_MODE_FACTORS = {
  direct: { label: 'Direct', factor: 1.0 },
  choke: { label: 'Étranglé (choke)', factor: 0.8 },
};

// ---------------------------------------------------------------------------
// G-Link Slingmax® (connecteur pour élingues rondes Twin-Path / Uni-Path)
// WLL : 1 G-Link (étranglé) ou 2 G-Links — table Unirope (lbs → t).
// Dimensions : la table source n'indique pas les libellés de colonnes ; la longueur utile
// retenue ici est une ESTIMATION (H − 2·B). À confirmer avec la fiche Slingmax.
const GL = [
  // code, largeur nominale in, WLL lbs, B in, H in
  ['WF-GL-2', 2, 5000, 0.625, 5],
  ['WF-GL-3', 3, 10000, 0.6875, 6.625],
  ['WF-GL-4', 4, 15000, 0.8125, 7.5],
  ['WF-GL-5', 5, 30000, 1.0625, 9.75],
  ['WF-GL-6', 6, 50000, 1.25, 12.5],
];

export const GLINKS = GL.map(([code, w, lbs, b, h]) => ({
  id: `SM-${code}`,
  type: 'glink',
  brand: 'Slingmax',
  model: 'G-Link',
  name: `G-Link Slingmax ${code}`,
  short: `G-Link ${code}`,
  wll_t: Math.round((lbs / LBS_PER_T) * 100) / 100,
  mbl_factor: 5,
  weight_kg: null,
  dims: { maxSlingWidth: Math.round(w * IN), effLength: Math.round((h - 2 * b) * IN), length: Math.round(h * IN), barThk: Math.round(b * IN) },
  source: 'Slingmax G-Link — table Unirope ; longueur utile estimée, à vérifier',
}));

export const CATALOG_TYPES = {
  shackle: 'Manille',
  masterlink: 'Masterlink',
  roundsling: 'Élingue ronde',
  glink: 'G-Link',
  wiresling: 'Élingue câble',
  other: 'Autre',
};

export const BUILTIN_CATALOG = [...SHACKLES, ...MASTERLINKS, ...ROUNDSLINGS, ...GLINKS];
