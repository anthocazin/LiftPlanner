// Génère les projets exemples du dossier examples/ : node tools/make-examples.mjs
import { writeFileSync } from 'node:fs';
import { defaultProject } from '../js/state.js';

const write = (name, p) => writeFileSync(new URL(`../examples/${name}`, import.meta.url), JSON.stringify(p, null, 2));

const a = defaultProject();
a.project.date = '2026-11-11';
write('exemple-crochet-4-points.liftplan.json', a);

const b = defaultProject();
b.project.date = '2026-11-11';
b.project.name = 'Exemple — levage skid au palonnier';
b.project.liftId = 'LP-002';
b.rigging.type = 'spreader';
b.rigging.legs = {};
write('exemple-palonnier.liftplan.json', b);

const c = defaultProject();
c.project.date = '2026-11-11';
c.project.name = 'Exemple — transfert offshore depuis supply';
c.project.liftId = 'LP-003';
c.project.site = 'Plateforme XYZ';
c.project.vessel = 'Supply vessel';
c.environment = 'offshore';
c.flags.vesselToVessel = true;
c.load.name = 'Conteneur outillage 20\'';
c.load.weight_t = 8.2;
c.load.wcfPreset = 'weighed';
c.load.wcf = 1.03;
c.load.dims_mm = { L: 6058, W: 2438, H: 2591 };
c.load.cog_mm = { x: 3029, y: 1219, z: 1000 };
c.load.liftPoints = [
  { id: 'A', x: 150, y: 150, z: 2591, swl_t: 9.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 60, azimuth_deg: null, used: true },
  { id: 'B', x: 5908, y: 150, z: 2591, swl_t: 9.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 60, azimuth_deg: null, used: true },
  { id: 'C', x: 5908, y: 2288, z: 2591, swl_t: 9.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 60, azimuth_deg: null, used: true },
  { id: 'D', x: 150, y: 2288, z: 2591, swl_t: 9.5, holeDia_mm: 34, thk_mm: 36, radius_mm: 60, azimuth_deg: null, used: true },
];
c.crane = {
  ...c.crane,
  name: 'EXEMPLE — grue pedestal offshore 50 t (tableau fictif, NE PAS UTILISER)',
  type: 'offshore',
  boom: { length: 40, pivotHeight: 6, pivotOffset: 1.5, minAngle_deg: 15, maxAngle_deg: 80 },
  hookBlock_t: 0.9,
  hookSWL_t: 50,
  utilLimit: 0.85,
  minTipToHook: 4,
  radius_m: 24,
  activeColumn: 1,
  chart: {
    columns: ['Interne (plateforme)', 'Externe Hs ≤ 1,5 m', 'Externe Hs ≤ 2,5 m'],
    rows: [[10, 50, 40, 32], [14, 38, 30, 24], [18, 29, 23, 18.5], [22, 23, 18.5, 14.8], [26, 18.5, 14.8, 11.9], [30, 15, 12, 9.6], [34, 12.4, 9.9, 7.9]],
  },
};
c.storyboard = {
  crane: { x: 0, y: 0, heading_deg: 90, footprint: { L: 4, W: 4 } },
  obstacles: [
    { name: 'Pont du supply', x: 26, y: 0, sx: 40, sy: 14, h: -12, rot_deg: 0, color: '#9aa5b1' },
    { name: 'Garde-corps plateforme', x: 8, y: 0, sx: 0.3, sy: 30, h: 1.1, rot_deg: 0, color: '#c0794f' },
    { name: 'Laydown area', x: -6, y: 10, sx: 10, sy: 8, h: 0, rot_deg: 0, color: '#7f8c8d' },
  ],
  steps: [
    { name: '1. Prise sur le supply', radius_m: 24, slew_deg: 0, loadElevation_m: -12, heading_deg: 0, note: 'Prise franche sur crête de houle, tag lines par l\'équipage du supply.' },
    { name: '2. Remontée et rotation', radius_m: 18, slew_deg: 60, loadElevation_m: 3, heading_deg: 60, note: 'Garde au-dessus du garde-corps ≥ 1 m.' },
    { name: '3. Dépose laydown', radius_m: 12, slew_deg: 120, loadElevation_m: 0.2, heading_deg: 30, note: 'Dépose sur madriers.' },
  ],
};
c.weather = { hsMax_m: 1.5, windMax_ms: 15, windGust_ms: 18, visibility: 'Jour, > 1 NM', notes: 'Prévisions consultées 12 h avant ; arrêt si Hs > 1,5 m ou rafales > 18 m/s.' };
write('exemple-offshore-conteneur.liftplan.json', c);
console.log('examples written');
