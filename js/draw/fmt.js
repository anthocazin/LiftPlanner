export const fmt = (v, d = 2) =>
  v == null || v === '' || !isFinite(v) ? '—' : Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
