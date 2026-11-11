// Petits utilitaires DOM + liaison des champs à l'état de l'application.
import { app } from './app.js';

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export const fmt = (v, d = 2) => (v == null || v === '' || !isFinite(v) ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmt0 = (v) => fmt(v, 0);
export const fmt1 = (v) => fmt(v, 1);

const parse = (type, raw) => {
  if (type === 'number') {
    if (raw === '' || raw == null) return null;
    const n = Number(String(raw).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  return raw;
};

/**
 * Champ lié à un chemin de l'état. opts : { label, path, type, unit, step, options, hint, cls, live, onchange, placeholder }
 * - type 'number' | 'text' | 'date' | 'select' | 'checkbox' | 'textarea' | 'percent'
 * - 'percent' : stocké en fraction (0.85), affiché en %
 */
export function field(opts) {
  const { label, path, type = 'number', unit, step = 'any', options, hint, cls = '', placeholder } = opts;
  const cur = app.get(path);
  let input;
  const commit = (raw) => {
    let v = type === 'percent' ? (raw === '' ? null : Number(String(raw).replace(',', '.')) / 100) : parse(type, raw);
    if (type === 'checkbox') v = raw;
    app.set(path, v);
    opts.onchange?.(v);
  };
  if (type === 'select') {
    input = el('select', { onchange: (e) => commit(e.target.value) });
    for (const o of options) {
      const [val, txt] = Array.isArray(o) ? o : [o.value, o.label];
      input.append(el('option', { value: val, selected: String(val) === String(cur) }, txt));
    }
  } else if (type === 'checkbox') {
    const cb = el('input', { type: 'checkbox', checked: !!cur, onchange: (e) => commit(e.target.checked) });
    return el('label', { class: `check ${cls}` }, cb, label);
  } else if (type === 'textarea') {
    input = el('textarea', { placeholder, oninput: (e) => commit(e.target.value) }, cur ?? '');
  } else {
    const shown = type === 'percent' ? (cur == null ? '' : Math.round(cur * 1000) / 10) : cur ?? '';
    input = el('input', {
      type: type === 'percent' ? 'number' : type,
      step: type === 'number' || type === 'percent' ? step : null,
      value: shown,
      placeholder,
    });
    input.addEventListener(opts.live === false ? 'change' : 'input', (e) => commit(e.target.value));
  }
  return el(
    'label',
    { class: `field ${cls}` },
    label ? el('span', { class: 'lbl' }, label) : null,
    el('div', { class: 'inp' }, input, unit ? el('span', { class: 'unit' }, type === 'percent' ? '%' : unit) : type === 'percent' ? el('span', { class: 'unit' }, '%') : null),
    hint ? el('span', { class: 'hint' }, hint) : null,
  );
}

/** Champ de cellule de tableau (valide au changement). */
export function cell(path, type = 'number', opts = {}) {
  const cur = app.get(path);
  if (type === 'select') {
    const s = el('select', { onchange: (e) => { app.set(path, e.target.value); opts.onchange?.(e.target.value); } });
    for (const o of opts.options) {
      const [val, txt] = Array.isArray(o) ? o : [o.value, o.label];
      s.append(el('option', { value: val, selected: String(val) === String(cur ?? '') }, txt));
    }
    return s;
  }
  if (type === 'checkbox')
    return el('input', { type: 'checkbox', checked: !!cur, onchange: (e) => { app.set(path, e.target.checked); opts.onchange?.(e.target.checked); } });
  const i = el('input', { type, step: type === 'number' ? 'any' : null, value: cur ?? '', placeholder: opts.placeholder, style: opts.width ? { width: opts.width } : null });
  i.addEventListener(opts.live ? 'input' : 'change', (e) => {
    const v = parse(type, e.target.value);
    app.set(path, v);
    opts.onchange?.(v);
  });
  return i;
}

export function badge(status) {
  const txt = { ok: 'OK', warn: 'Alerte', fail: 'Non conforme', info: 'Info' }[status] || status;
  return el('span', { class: `badge ${status}` }, txt);
}

export function utilBar(u) {
  if (u == null || !isFinite(u)) return el('span', { class: 'muted' }, '—');
  const pct = u * 100;
  const color = u > 1 ? 'var(--fail)' : u > 0.9 ? 'var(--warn)' : 'var(--ok)';
  return el(
    'span',
    { class: 'util' },
    el('span', { class: 'bar' }, el('i', { style: { width: `${Math.min(100, pct)}%`, background: color } })),
    el('span', { class: 'pct' }, `${pct.toFixed(0)} %`),
  );
}

export function panel(title, ...children) {
  return el('section', { class: 'panel' }, title ? el('h2', {}, title) : null, ...children);
}

export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

export function download(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function slug(s) {
  return (s || 'liftplan').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}
