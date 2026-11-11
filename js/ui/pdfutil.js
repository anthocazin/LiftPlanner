// PDF / image helpers: loading pdf.js, opening a document, rendering pages and regions,
// reading the text (weight / COG detection).

let pdfjs = null;

export async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  const url = window.__PDFJS_URL || new URL('../../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
  pdfjs = await import(url);
  // standalone build (file://): worker embedded as a blob; if the browser refuses the worker,
  // pdf.js falls back to the main thread automatically (a little slower, same result).
  pdfjs.GlobalWorkerOptions.workerSrc = window.__PDFJS_WORKER_URL || new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

/**
 * Opens a PDF or an image. Returns a "source":
 *  { kind: 'pdf'|'image', name, pages, pageSize(i) → {w,h} (units), render(i, pxPerUnit) → canvas,
 *    renderRegion(i, rect, maxPx) → { canvas, pxPerUnit }, text(i) → [{ str, u, v, h }] }
 * Units: PDF points for a PDF (y down, page top-left origin), pixels for an image.
 */
export async function openSource(file) {
  const name = file.name || 'drawing';
  const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(name);
  if (isPdf) {
    const lib = await loadPdfJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data: bytes.slice() }).promise;
    const cache = new Map();
    const page = async (i) => {
      if (!cache.has(i)) cache.set(i, await doc.getPage(i));
      return cache.get(i);
    };
    const sizes = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const vp = (await page(i)).getViewport({ scale: 1 });
      sizes.push({ w: vp.width, h: vp.height });
    }
    return {
      kind: 'pdf', name, bytes, pages: doc.numPages,
      pageSize: (i) => sizes[i - 1],
      async render(i, pxPerUnit = 1.5) {
        const pg = await page(i);
        const vp = pg.getViewport({ scale: pxPerUnit });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width);
        c.height = Math.ceil(vp.height);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
        return c;
      },
      async renderRegion(i, r, maxPx = 2000) {
        const pg = await page(i);
        const k = Math.min(6, maxPx / Math.max(r.w, r.h));
        const vp = pg.getViewport({ scale: k, offsetX: -r.x * k, offsetY: -r.y * k });
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(r.w * k));
        c.height = Math.max(1, Math.round(r.h * k));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
        return { canvas: c, pxPerUnit: k };
      },
      async text(i) {
        const pg = await page(i);
        const vp = pg.getViewport({ scale: 1 });
        const tc = await pg.getTextContent();
        return tc.items
          .filter((it) => it.str && it.str.trim())
          .map((it) => {
            const [u, v] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
            return { str: it.str, u, v, h: Math.hypot(it.transform[2], it.transform[3]) || 8 };
          });
      },
    };
  }
  // image
  const url = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Unreadable image'));
    im.src = url;
  });
  return {
    kind: 'image', name, pages: 1, url,
    pageSize: () => ({ w: img.naturalWidth, h: img.naturalHeight }),
    async render(_i, k = 1) {
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    },
    async renderRegion(_i, r, maxPx = 2000) {
      const k = Math.min(1, maxPx / Math.max(r.w, r.h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(r.w * k));
      c.height = Math.max(1, Math.round(r.h * k));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      return { canvas: c, pxPerUnit: k };
    },
    async text() {
      return [];
    },
  };
}

/** Groups text items into lines (same baseline ± 2 units). */
export function textLines(items) {
  const lines = [];
  for (const it of [...items].sort((a, b) => a.v - b.v || a.u - b.u)) {
    const l = lines.find((x) => Math.abs(x.v - it.v) <= Math.max(2, it.h * 0.35));
    if (l) {
      l.items.push(it);
    } else lines.push({ v: it.v, items: [it] });
  }
  return lines.map((l) => {
    l.items.sort((a, b) => a.u - b.u);
    return { v: l.v, u: l.items[0].u, text: l.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(), items: l.items };
  });
}

const NUM = String.raw`(-?\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)`;
const toNum = (s) => Number(String(s).replace(/[  ]/g, '').replace(',', '.'));

/** Weight in t from a text ("12.5 t", "12 500 kg", "Weight: 12,5 tonnes"). */
export function parseWeight(t) {
  const m = t.match(new RegExp(`${NUM}\\s*(kg|t|tonnes?|tons?|te|mt)\\b`, 'i'));
  if (!m) return null;
  const v = toNum(m[1]);
  if (!isFinite(v) || v <= 0) return null;
  return /kg/i.test(m[2]) ? v / 1000 : v;
}

/** COG coordinates from a text ("COG X=2850 Y=1300 Z=1100", "CoG (2850; 1300; 1100)"). */
export function parseCog(t) {
  if (!/(c\.?\s?o\.?\s?g|cdg|c\.d\.g|centre of gravity|center of gravity|centre de gravit|centre of mass)/i.test(t)) return null;
  const out = {};
  for (const k of ['x', 'y', 'z']) {
    const m = t.match(new RegExp(`\\b${k}\\s*[=:]?\\s*${NUM}`, 'i'));
    if (m) out[k] = toNum(m[1]);
  }
  if (Object.keys(out).length >= 2) return out;
  const tri = t.match(new RegExp(`\\(?\\s*${NUM}\\s*[;,/]\\s*${NUM}\\s*[;,/]\\s*${NUM}\\s*\\)?`));
  if (tri) return { x: toNum(tri[1]), y: toNum(tri[2]), z: toNum(tri[3]) };
  return null;
}

const WEIGHT_RE = /(weight|mass|poids|masse|gross|net|dry|operating|lift weight|w\s*=)/i;
const COG_LABEL_RE = /^\s*(c\.?\s?o\.?\s?g\.?|cog|cdg|c\.d\.g\.?|g)\s*$/i;

/**
 * Scans the text of a source. Returns { weights: [{page,text,value,score}], cogs: [{page,text,value}],
 * cogLabels: [{page,u,v}] } — cogLabels are isolated "COG" labels (position of the COG symbol).
 */
export async function scanText(src, maxPages = 20) {
  const weights = [], cogs = [], cogLabels = [];
  for (let p = 1; p <= Math.min(src.pages, maxPages); p++) {
    const items = await src.text(p);
    for (const it of items) if (COG_LABEL_RE.test(it.str) && !/^\s*g\s*$/i.test(it.str)) cogLabels.push({ page: p, u: it.u, v: it.v });
    for (const l of textLines(items)) {
      const w = parseWeight(l.text);
      if (w != null) weights.push({ page: p, text: l.text.slice(0, 140), value: w, score: WEIGHT_RE.test(l.text) ? 2 : 1 });
      const c = parseCog(l.text);
      if (c) cogs.push({ page: p, text: l.text.slice(0, 140), value: c });
    }
  }
  weights.sort((a, b) => b.score - a.score);
  return { weights: weights.slice(0, 30), cogs: cogs.slice(0, 10), cogLabels };
}
