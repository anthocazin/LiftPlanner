// Facteurs de calcul : DAF, contingence de poids, SKL.
// Les valeurs par défaut suivent l'approche DNV-ST-N001 (ex DNV-OS-H205) pour les levages dans l'air.
// Elles sont toutes modifiables dans l'outil : alignez-les sur la procédure applicable à votre projet.

export const ENVIRONMENTS = {
  onshore: 'Onshore (à terre)',
  inshore: 'Inshore (eaux abritées)',
  offshore: 'Offshore',
};

/**
 * DAF minimal dans l'air — DNV-ST-N001 (table "Dynamic amplification factors in air",
 * reprise de DNV-OS-H205 Tab. 2-1). SHL = charge statique au crochet (t).
 */
export function dafDNV(shl_t, env = 'offshore') {
  const shl = Math.max(shl_t || 0, 0.001);
  if (shl <= 100) {
    if (env === 'onshore') return 1.1;
    if (env === 'inshore') return 1.07 + 0.05 * Math.sqrt(100 / shl);
    return 1.15 + 0.15 * Math.sqrt(100 / shl);
  }
  const rows = [
    [300, 1.05, 1.12, 1.25],
    [1000, 1.05, 1.1, 1.2],
    [2500, 1.03, 1.08, 1.15],
    [Infinity, 1.03, 1.05, 1.1],
  ];
  const r = rows.find((row) => shl <= row[0]);
  return env === 'onshore' ? r[1] : env === 'inshore' ? r[2] : r[3];
}

export const DAF_REFERENCE =
  'DNV-ST-N001 — DAF dans l\'air : SHL ≤ 100 t : onshore 1,10 ; inshore 1,07+0,05√(100/SHL) ; offshore 1,15+0,15√(100/SHL). ' +
  '100–300 t : 1,05 / 1,12 / 1,25 ; 300–1000 t : 1,05 / 1,10 / 1,20 ; 1000–2500 t : 1,03 / 1,08 / 1,15 ; > 2500 t : 1,03 / 1,05 / 1,10. ' +
  'À confirmer avec l\'édition en vigueur et la procédure projet / MWS.';

export const WCF_PRESETS = [
  { id: 'weighed', label: 'Pesé (certificat de pesée) — 1,03', value: 1.03 },
  { id: 'calculated', label: 'Calculé (modèle 3D / plans) — 1,05', value: 1.05 },
  { id: 'estimated', label: 'Estimé — 1,10', value: 1.1 },
  { id: 'custom', label: 'Valeur libre', value: null },
];

/** Facteur de charge déséquilibrée (skew load) par défaut. */
export function defaultSKL(nLiftPoints) {
  return nLiftPoints >= 4 ? 1.25 : 1.0;
}

export const SKL_REFERENCE =
  'SKL : 1,0 pour un gréement isostatique (1 à 3 jambes) ; 1,25 par défaut pour 4 jambes et plus sans palonnier/équilibreur (hyperstatique) — DNV-ST-N001.';

/** Rassemble les facteurs effectifs utilisés par le calcul. */
export function resolveFactors(factors = {}, env, shl_t, nLiftPoints) {
  const daf = factors.dafMode === 'manual' && factors.dafManual > 0 ? factors.dafManual : dafDNV(shl_t, env);
  const skl = factors.sklMode === 'manual' && factors.sklManual > 0 ? factors.sklManual : defaultSKL(nLiftPoints);
  const cog = factors.cogFactor > 0 ? factors.cogFactor : 1.0;
  const extra = factors.extraFactor > 0 ? factors.extraFactor : 1.0;
  return { daf, skl, cog, extra, dafAuto: factors.dafMode !== 'manual', sklAuto: factors.sklMode !== 'manual' };
}
