// Design factors: DAF, weight contingency, SKL.
// Defaults follow the DNV-ST-N001 (ex DNV-OS-H205) approach for lifts in air.
// All of them can be changed in the tool: align them with the procedure applicable to your project.

export const ENVIRONMENTS = {
  onshore: 'Onshore',
  inshore: 'Inshore (sheltered waters)',
  offshore: 'Offshore',
};

/**
 * Minimum DAF in air — DNV-ST-N001 ("Dynamic amplification factors in air", taken over from
 * DNV-OS-H205 Table 2-1). SHL = static hook load (t).
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
  'DNV-ST-N001 — DAF in air: SHL ≤ 100 t: onshore 1.10; inshore 1.07+0.05√(100/SHL); offshore 1.15+0.15√(100/SHL). ' +
  '100–300 t: 1.05 / 1.12 / 1.25; 300–1000 t: 1.05 / 1.10 / 1.20; 1000–2500 t: 1.03 / 1.08 / 1.15; > 2500 t: 1.03 / 1.05 / 1.10. ' +
  'To be confirmed against the edition in force and the project / MWS procedure.';

export const WCF_PRESETS = [
  { id: 'weighed', label: 'Weighed (weighing certificate) — 1.03', value: 1.03 },
  { id: 'calculated', label: 'Calculated (3D model / drawings) — 1.05', value: 1.05 },
  { id: 'estimated', label: 'Estimated — 1.10', value: 1.1 },
  { id: 'custom', label: 'Custom value', value: null },
];

/** Default skew load factor. */
export function defaultSKL(nLiftPoints) {
  return nLiftPoints >= 4 ? 1.25 : 1.0;
}

export const SKL_REFERENCE =
  'SKL: 1.0 for statically determinate rigging (1 to 3 legs); 1.25 by default for 4 or more legs without spreader / equaliser (statically indeterminate) — DNV-ST-N001.';

/** Gathers the effective factors used by the calculation. */
export function resolveFactors(factors = {}, env, shl_t, nLiftPoints) {
  const dafOn = factors.applyDAF !== false;
  const daf = !dafOn ? 1 : factors.dafMode === 'manual' && factors.dafManual > 0 ? factors.dafManual : dafDNV(shl_t, env);
  const skl = factors.sklMode === 'manual' && factors.sklManual > 0 ? factors.sklManual : defaultSKL(nLiftPoints);
  const cog = factors.cogFactor > 0 ? factors.cogFactor : 1.0;
  const extra = factors.extraFactor > 0 ? factors.extraFactor : 1.0;
  return { daf, skl, cog, extra, dafOn, dafAuto: dafOn && factors.dafMode !== 'manual', sklAuto: factors.sklMode !== 'manual' };
}
