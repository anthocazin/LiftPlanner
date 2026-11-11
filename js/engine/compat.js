// Compatibility between connected parts of a leg, explained in plain words.
// Each joint is "what hangs" (below) on "what holds it" (above), from the lift point to the hook.
// A shackle on the load side of the sling/chain is bow up / pin down; on the hook side, pin up / bow down.
import { niceName } from '../catalog/index.js';

/** How an item meets the next one. side: 'pin' | 'bow' | 'end' (sling eye, link, hook eye) */
function face(part, i, leg, side) {
  const it = part?.item;
  if (!it) return null;
  const d = it.dims || {};
  switch (it.type) {
    case 'shackle':
      return side === 'pin'
        ? { kind: 'pin', name: niceName(it), pin: d.pinDia, jaw: d.jawWidth, len: d.insideLength, along: d.eyeDia }
        : { kind: 'bow', name: niceName(it), bowIn: d.bowWidth, bowBar: d.bowDia, len: d.insideLength, along: d.bowDia };
    case 'roundsling':
      return { kind: 'round', name: niceName(it), width: d.width, along: (d.width || 0) * 0.5 };
    case 'webbing':
      return { kind: 'web', name: niceName(it), width: d.width, along: d.width };
    case 'wiresling':
      return { kind: 'wire', name: niceName(it), rope: d.ropeDia, eyeW: 8 * (d.ropeDia || 0), along: 2 * (d.ropeDia || 0) };
    case 'chain':
      return { kind: 'ring', name: niceName(it), bar: d.dia, inW: Math.max((d.width || 0) - 2 * (d.dia || 0), 0), along: d.dia };
    case 'connlink':
      return { kind: 'ring', name: niceName(it), bar: d.barThk, inW: Math.max((d.width || 0) - 2 * (d.barThk || 0), 0), along: d.barThk };
    case 'glink':
      return { kind: 'ring', name: niceName(it), bar: d.barThk, inW: d.maxSlingWidth, along: d.barThk, glink: true };
    case 'hook':
      return side === 'eye' ? { kind: 'ring', name: niceName(it), bar: d.saddle * 0.6, inW: d.eyeDia, along: d.saddle * 0.6 } : { kind: 'hook', name: niceName(it), opening: d.opening, along: d.saddle };
    case 'masterlink':
      return { kind: 'ring', name: niceName(it), bar: d.stockDia, inW: d.insideWidth, along: d.stockDia };
    default:
      return null;
  }
}

/** One joint: `low` hangs on `high`. Returns issues { status, label, why }. */
function joint(low, high) {
  const out = [];
  if (!low || !high) return out;
  const add = (status, label, why) => out.push({ status, label, why });
  const ringLike = (f) => f.kind === 'ring';
  const sling = (f) => ['round', 'web', 'wire'].includes(f.kind);
  // shackle pin engages a ring (link, master link, chain, eye…)
  const pinOnRing = (pin, ring) => {
    if (ring.bar > pin.jaw) add('fail', `${ring.name} (bar Ø${ring.bar}) does not fit in the jaw of ${pin.name} (${pin.jaw} mm)`, 'The bar of the ring must go between the two eyes of the shackle: take a shackle with a wider jaw (next size up).');
    if (ring.inW && pin.pin > ring.inW) add('fail', `Pin Ø${pin.pin} of ${pin.name} does not pass through ${ring.name} (inside ${Math.round(ring.inW)} mm)`, 'The shackle pin must go through the inside of the ring.');
  };
  // shackle bow holds a ring
  const bowOnRing = (bow, ring) => {
    if (ring.bar > bow.bowIn) add('fail', `${ring.name} (bar Ø${ring.bar}) does not fit in the bow of ${bow.name} (inside ${bow.bowIn} mm)`, 'The ring bar must sit in the crown of the bow.');
  };
  // sling on a bearing (bow, pin or ring bar)
  const slingOn = (s, bearingName, bearingWidth, bearingDia) => {
    if (s.kind === 'web' && bearingWidth && s.width > bearingWidth)
      add('warn', `${s.name} (${s.width} mm wide) is wider than the bearing of ${bearingName} (${Math.round(bearingWidth)} mm)`, 'A flat webbing sling must lie flat on its bearing; folded, it loses capacity. Use a bigger shackle / a wider bearing or a round sling.');
    if (s.kind === 'round' && bearingWidth && s.width * 0.5 > bearingWidth)
      add('warn', `${s.name} (${s.width} mm flat) is too wide for the bearing of ${bearingName} (${Math.round(bearingWidth)} mm)`, 'A round sling bunches up to about half its flat width on a bearing; if it does not fit, use a bigger shackle or link.');
    if (s.kind === 'wire' && bearingDia && bearingDia / s.rope < 1)
      add('warn', `${s.name}: bearing Ø${bearingDia} mm < rope Ø${s.rope} mm (D/d = ${(bearingDia / s.rope).toFixed(2)})`, 'A wire rope sling bent over a bearing thinner than the rope (D/d < 1) loses strength: use a larger shackle or a thimble.');
  };
  if (low.kind === 'pin' && ringLike(high)) pinOnRing(low, high);
  else if (high.kind === 'pin' && ringLike(low)) pinOnRing(high, low);
  else if (low.kind === 'bow' && ringLike(high)) bowOnRing(low, high);
  else if (high.kind === 'bow' && ringLike(low)) bowOnRing(high, low);
  else if (sling(low) && high.kind === 'bow') slingOn(low, high.name, high.bowIn, high.bowBar);
  else if (sling(high) && low.kind === 'bow') slingOn(high, low.name, low.bowIn, low.bowBar);
  else if (sling(low) && high.kind === 'pin') slingOn(low, high.name, high.jaw, high.pin);
  else if (sling(high) && low.kind === 'pin') slingOn(high, low.name, low.jaw, low.pin);
  else if (sling(low) && ringLike(high)) { if (high.glink && low.kind !== 'round') add('warn', `${high.name} is made for round slings`, 'G-Links are designed for round slings.'); else if (high.glink && low.width > high.inW) add('warn', `${low.name} wider than the G-Link (${high.inW} mm)`, 'The round sling must fit in the G-Link.'); else slingOn(low, high.name, high.inW, high.bar); }
  else if (sling(high) && ringLike(low)) slingOn(high, low.name, low.inW, low.bar);
  else if (low.kind === 'hook' && ringLike(high)) { if (high.bar > low.opening) add('fail', `${high.name} (bar Ø${high.bar}) does not enter ${low.name} (opening ${low.opening} mm)`, 'The hook opening must be larger than the bar it engages.'); }
  else if (high.kind === 'hook' && ringLike(low)) { if (low.bar > high.opening) add('fail', `${low.name} does not enter ${high.name} (opening ${high.opening} mm)`, 'The hook opening must be larger than the bar it engages.'); }
  else if (sling(low) && sling(high)) add('info', `${low.name} directly on ${high.name}`, 'Sling on sling: avoid textile on textile contact under load; a shackle between them is usual.');
  return out;
}

/** Side by which a part meets its neighbour above (towards the hook) or below (towards the load). */
function sideOf(part, i, li, towards) {
  if (part.kind !== 'shackle' && part.kind !== 'hook') return 'end';
  if (part.kind === 'hook') return towards === 'up' ? 'eye' : 'hook';
  // load side of the length element: bow up / pin down; hook side: pin up / bow down
  const loadSide = li < 0 ? i === 0 : i < li;
  if (loadSide) return towards === 'up' ? 'bow' : 'pin';
  return towards === 'up' ? 'pin' : 'bow';
}

/** Face of the lift point (padeye hole, ring) for the first part. */
function pointFace(pt) {
  if (!pt) return null;
  if (pt.kind === 'ring' || pt.ringBar_mm) return { kind: 'ring', name: `Lift point ${pt.id}`, bar: Number(pt.ringBar_mm) || 0, inW: Number(pt.ringIn_mm) || 0, along: Number(pt.ringBar_mm) || 0 };
  return null; // padeyes are checked by the padeye fit (pin / hole / thickness)
}

/** Head bar on which the last part of a main leg hangs. */
function headFace(rig, leg) {
  const h = rig.head;
  if (!h || h.onHook || leg.level === 'bottom') return null;
  const link = h.useSub && h.subLink && leg.level === 'main' ? h.subLink : h.masterlink;
  if (!link) return null;
  const d = link.dims || {};
  return { kind: 'ring', name: h.unknownSWL ? 'the masterlink' : niceName(link), bar: d.stockDia, inW: d.insideWidth, along: d.stockDia };
}

/** All joint checks of a leg. Each issue gets the index of the part concerned (for navigation). */
export function legJointChecks(leg, rig) {
  const out = [];
  const parts = leg.parts || [];
  const li = leg.li;
  const p0 = parts[0];
  if (p0 && leg.level !== 'top') {
    const pf = pointFace(leg.point);
    const f0 = face(p0, 0, leg, sideOf(p0, 0, li, 'down'));
    if (pf && f0) joint(f0, pf).forEach((x) => out.push({ ...x, part: 0 }));
  }
  for (let i = 0; i < parts.length - 1; i++) {
    const a = face(parts[i], i, leg, sideOf(parts[i], i, li, 'up'));
    const b = face(parts[i + 1], i + 1, leg, sideOf(parts[i + 1], i + 1, li, 'down'));
    joint(a, b).forEach((x) => out.push({ ...x, part: i + 1 }));
  }
  const last = parts[parts.length - 1];
  const hf = headFace(rig, leg);
  if (last && hf) {
    const lf = face(last, parts.length - 1, leg, sideOf(last, parts.length - 1, li, 'up'));
    joint(lf, hf).forEach((x) => out.push({ ...x, part: parts.length - 1 }));
  }
  return out;
}

/** Space taken along the bottom bar of the master link / sub-link by the item hanging on it (mm). */
export function alongWidth(leg) {
  const parts = leg.parts || [];
  const last = parts[parts.length - 1];
  if (!last) return 0;
  const f = face(last, parts.length - 1, leg, sideOf(last, parts.length - 1, leg.li, 'up'));
  return f?.along || 0;
}

