export const fmt = (v, d = 2) =>
  v == null || v === '' || !isFinite(v) ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
