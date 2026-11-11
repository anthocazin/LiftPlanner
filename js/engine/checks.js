// Vérifications : chaque contrôle produit une ligne { cat, item, label, value, limit, unit, util, status, note }.
import { slingModeFactor, shackleSideLoadFactor, shackleCompatibility } from '../catalog/index.js';
import { chartCapacity, boomGeometry, maxHookHeight } from './crane.js';
import { offsetFromLine } from './statics.js';
import { deg } from './vec.js';

export const DEFAULT_RULES = {
  minSlingAngleFail_deg: 45, // angle mini élingue / horizontale (rejet)
  minSlingAngleWarn_deg: 55, // angle sous lequel on alerte
  maxHoleClearance_mm: 3, // jeu trou/axe admissible : max(3 mm ; 4 % Ø axe)
  maxHoleClearance_pct: 4,
  minThicknessRatio: 0.75, // épaisseur padeye / ouverture manille
  lengthMismatchWarn_mm: 25, // écart de hauteur de convergence entre jambes (palonnier)
  maxTiltWarn_deg: 2, // inclinaison estimée de la charge (alerte)
  maxTiltFail_deg: 5, // inclinaison estimée de la charge (rejet)
  utilWarn: 0.9, // taux d'utilisation au-delà duquel on alerte (matériel)
  maxOutOfPlane_deg: 5, // angle hors plan admissible sur padeye
};

export const STATUS_ORDER = { fail: 3, warn: 2, ok: 1, info: 0 };

function utilStatus(util, warnAt = 0.9) {
  if (util == null || !isFinite(util)) return 'fail';
  if (util > 1 + 1e-9) return 'fail';
  if (util > warnAt) return 'warn';
  return 'ok';
}

const r2 = (v) => (v == null || !isFinite(v) ? v : Math.round(v * 100) / 100);

function push(list, c) {
  list.push({ util: null, unit: 't', ...c, value: r2(c.value), limit: r2(c.limit) });
}

/** Contrôles du gréement. */
export function riggingChecks(rig, project, rules) {
  const out = [];
  if (!rig || rig.error) {
    push(out, { cat: 'Données', item: '—', label: rig?.error || 'Calcul impossible', status: 'fail' });
    return out;
  }
  (rig.errors || []).forEach((e) => push(out, { cat: 'Géométrie', item: 'Palonnier', label: e, status: 'fail' }));
  rig.tooShort.forEach((k) =>
    push(out, { cat: 'Géométrie', item: k, label: 'Élingue trop courte : n\'atteint pas le point de convergence', status: 'fail' }),
  );

  for (const leg of rig.legs) {
    const F = leg.Fdesign;
    const c = leg.comps;
    const name = leg.label;
    // Élingue
    if (!c.sling) push(out, { cat: 'Élingues', item: name, label: 'Aucune élingue adaptée dans le catalogue', status: 'fail' });
    else {
      const wll = c.sling.wll_t * slingModeFactor(leg.cfg.mode);
      push(out, {
        cat: 'Élingues', item: name, label: `${c.sling.name} — L = ${leg.slingLength?.toFixed(2)} m`,
        value: F, limit: wll, util: F / wll, status: utilStatus(F / wll, rules.utilWarn),
      });
    }
    // Manille basse
    const sf = shackleSideLoadFactor(leg.beta || 0);
    if (!c.bottomShackle) push(out, { cat: 'Manilles', item: name, label: 'Aucune manille adaptée', status: 'fail' });
    else {
      const wll = c.bottomShackle.wll_t * sf;
      push(out, {
        cat: 'Manilles', item: name,
        label: `${c.bottomShackle.name}${sf < 1 ? ` (charge latérale ${leg.beta.toFixed(0)}° → ×${sf.toFixed(2)})` : ''}`,
        value: F, limit: wll, util: F / wll, status: utilStatus(F / wll, rules.utilWarn),
      });
      const p = leg.point;
      const ctx = p
        ? { holeDia: Number(p.holeDia_mm) || 0, padeyeThk: Number(p.thk_mm) || 0, padeyeRadius: Number(p.radius_mm) || 0, slingWidth: c.sling?.dims?.width }
        : { ...(leg.lugCtx || {}), slingWidth: c.sling?.dims?.width };
      shackleCompatibility(c.bottomShackle, ctx, rules).forEach((iss) =>
        push(out, { cat: 'Compatibilité', item: name, label: iss.msg, status: iss.level, unit: '' }),
      );
    }
    // Connecteur haut
    if (c.topConn) {
      const wll = c.topConn.wll_t;
      push(out, {
        cat: c.topConn.type === 'glink' ? 'G-Link' : 'Manilles', item: name, label: `${c.topConn.name} (connexion haute)`,
        value: F, limit: wll, util: F / wll, status: utilStatus(F / wll, rules.utilWarn),
      });
    } else if (leg.cfg.topConnector && leg.cfg.topConnector !== 'direct') {
      push(out, { cat: 'Manilles', item: name, label: 'Connecteur haut introuvable dans le catalogue', status: 'fail' });
    }
    // Point de levage (padeye)
    if (leg.point) {
      const swl = Number(leg.point.swl_t);
      if (swl > 0)
        push(out, {
          cat: 'Points de levage', item: name, label: `Padeye ${leg.point.id} (SWL ${swl} t)`,
          value: F, limit: swl, util: F / swl, status: utilStatus(F / swl, rules.utilWarn),
        });
      else push(out, { cat: 'Points de levage', item: name, label: `Padeye ${leg.point.id} : SWL non renseignée`, status: 'warn', unit: '' });
      if (leg.beta != null && leg.beta > rules.maxOutOfPlane_deg)
        push(out, {
          cat: 'Points de levage', item: name, label: `Effort hors plan du padeye : ${leg.beta.toFixed(1)}°`,
          value: leg.beta, limit: rules.maxOutOfPlane_deg, unit: '°', status: 'warn',
          note: 'Orienter le padeye vers le crochet ou vérifier sa résistance hors plan',
        });
    }
    // Angle
    const aH = leg.angleH;
    const st = aH < rules.minSlingAngleFail_deg ? 'fail' : aH < rules.minSlingAngleWarn_deg ? 'warn' : 'ok';
    if (!(leg.level === 'bottom' && leg.d < 0.01))
      push(out, {
        cat: 'Angles', item: name, label: `Angle élingue ${aH.toFixed(1)}° / horizontale (${leg.angleV.toFixed(1)}° / verticale)`,
        value: aH, limit: rules.minSlingAngleFail_deg, unit: '°', status: st,
        note: st !== 'ok' ? `Mini recommandé ${rules.minSlingAngleWarn_deg}°` : '',
      });
    // Équilibre des longueurs (palonnier : l'inclinaison de la charge est traitée globalement en crochet direct)
    if (rig.type === 'spreader' && Math.abs(leg.mismatch_mm) > rules.lengthMismatchWarn_mm)
      push(out, {
        cat: 'Géométrie', item: name,
        label: `Longueur non équilibrée : écart ${leg.mismatch_mm > 0 ? '+' : ''}${leg.mismatch_mm.toFixed(0)} mm sur la hauteur de crochet`,
        value: Math.abs(leg.mismatch_mm), limit: rules.lengthMismatchWarn_mm, unit: 'mm', status: 'warn',
        note: 'La charge (ou le palonnier) s\'inclinera : ajuster les longueurs / ajouter manilles ou élingues sur mesure',
      });
    // Élingue détendue (COG hors polygone)
    if (leg.Rmin != null && leg.Rmin < -1e-6)
      push(out, {
        cat: 'Stabilité', item: name, label: 'Réaction négative : élingue détendue (COG hors du polygone des points de levage)',
        status: 'fail', unit: '',
      });
  }

  // Assiette de la charge (crochet direct)
  if (rig.tilt) {
    const t = rig.tilt;
    push(out, {
      cat: 'Géométrie', item: 'Charge',
      label: `Inclinaison estimée de la charge avec les longueurs retenues : ${t.tilt_deg.toFixed(2)}°`,
      value: t.tilt_deg, limit: rules.maxTiltWarn_deg, unit: '°',
      status: t.tilt_deg > rules.maxTiltFail_deg ? 'fail' : t.tilt_deg > rules.maxTiltWarn_deg ? 'warn' : 'info',
      note: t.tilt_deg > rules.maxTiltWarn_deg ? 'Ajuster les longueurs (élingues sur mesure, manilles de rallonge) ou accepter l\'inclinaison' : '',
    });
    t.slack.forEach((i) =>
      push(out, {
        cat: 'Géométrie', item: rig.legs[i]?.label || `Jambe ${i + 1}`,
        label: 'Élingue probablement détendue avec ces longueurs (charge reprise par les autres jambes)',
        status: 'warn', unit: '', note: 'Le SKL doit couvrir ce cas, sinon raccourcir l\'élingue',
      }),
    );
  }

  // Masterlink / sous-anneaux / manille de tête
  const h = rig.head;
  const Fv = rig.Fvert_design;
  if (h && h.onHook) {
    const nOn = rig.legs.filter((l) => l.level !== 'bottom').length;
    const seat = Number(project.crane?.hookSeatWidth_mm) || 0;
    if (seat > 0 && h.fitWidth > seat)
      push(out, { cat: 'Compatibilité', item: 'Crochet', label: `Encombrement ${h.fitWidth.toFixed(0)} mm > largeur d'assise du crochet ${seat} mm`, status: 'warn', unit: '' });
    if (nOn > 2)
      push(out, { cat: 'Compatibilité', item: 'Crochet', label: `${nOn} élingues directement dans le crochet`, status: 'warn', unit: '', note: 'Bonne pratique : regrouper les jambes sur un masterlink (ou max. 2 œils par crochet)' });
    const maxV = Math.max(...rig.legs.filter((l) => l.level !== 'bottom').map((l) => l.angleV));
    if (maxV > 45)
      push(out, { cat: 'Angles', item: 'Crochet', label: `Angle inclus au crochet ${(2 * maxV).toFixed(0)}° > 90°`, status: 'warn', unit: '' });
  }
  if (h && !h.onHook) {
    if (!h.masterlink) push(out, { cat: 'Masterlink', item: 'Tête', label: 'Aucun masterlink adapté', status: 'fail' });
    else {
      push(out, {
        cat: 'Masterlink', item: 'Tête', label: h.masterlink.name, value: Fv, limit: h.masterlink.wll_t,
        util: Fv / h.masterlink.wll_t, status: utilStatus(Fv / h.masterlink.wll_t, rules.utilWarn),
      });
      const iw = h.masterlink.dims?.insideWidth || 0;
      if (h.fitWidth > iw)
        push(out, {
          cat: 'Compatibilité', item: 'Masterlink', label: `Encombrement des élingues ${h.fitWidth.toFixed(0)} mm > largeur intérieure ${iw} mm`,
          status: 'warn', unit: '', note: 'Prévoir un masterlink plus grand ou des sous-anneaux / manilles',
        });
    }
    if (h.useSub && h.subLink) {
      const pairLoad = Math.max(...h.pairs.map((p) => p.reduce((s, l) => s + l.Fdesign * Math.cos((l.angleV * Math.PI) / 180), 0)));
      push(out, {
        cat: 'Masterlink', item: 'Sous-anneaux', label: `${h.subLink.name} (×${h.pairs.length})`, value: pairLoad, limit: h.subLink.wll_t,
        util: pairLoad / h.subLink.wll_t, status: utilStatus(pairLoad / h.subLink.wll_t, rules.utilWarn),
      });
      const siw = h.subLink.dims?.insideWidth || 0;
      if (h.pairWidth > siw)
        push(out, {
          cat: 'Compatibilité', item: 'Sous-anneaux', label: `Encombrement par sous-anneau ${h.pairWidth.toFixed(0)} mm > largeur intérieure ${siw} mm`,
          status: 'warn', unit: '', note: 'Utiliser des manilles de connexion ou des sous-anneaux plus grands',
        });
    }
    if (h.topShackle)
      push(out, {
        cat: 'Manilles', item: 'Tête', label: `${h.topShackle.name} (crochet ↔ masterlink)`, value: Fv, limit: h.topShackle.wll_t,
        util: Fv / h.topShackle.wll_t, status: utilStatus(Fv / h.topShackle.wll_t, rules.utilWarn),
      });
  }

  // Palonnier
  if (rig.spreader) {
    const sp = project.rigging.spreader || {};
    const s = rig.spreader;
    const wll = Number(sp.wll_t);
    const Fd = s.totalV * rig.facHead;
    if (wll > 0)
      push(out, {
        cat: 'Palonnier', item: sp.name || 'Palonnier', label: 'Charge verticale (dynamique) vs WLL palonnier',
        value: Fd, limit: wll, util: Fd / wll, status: utilStatus(Fd / wll, rules.utilWarn),
      });
    else push(out, { cat: 'Palonnier', item: sp.name || 'Palonnier', label: 'WLL du palonnier non renseignée', status: 'warn', unit: '' });
    const minTop = Number(sp.minTopAngle_deg) || 0;
    rig.legs
      .filter((l) => l.level === 'top')
      .forEach((l) => {
        if (minTop > 0 && l.angleH < minTop - 1e-6)
          push(out, {
            cat: 'Palonnier', item: l.label, label: `Angle élingue haute ${l.angleH.toFixed(1)}° < angle mini du certificat palonnier`,
            value: l.angleH, limit: minTop, unit: '°', status: 'fail',
          });
      });
    push(out, {
      cat: 'Palonnier', item: sp.name || 'Palonnier', label: 'Effort de compression (statique / dynamique)',
      value: s.compression, limit: s.compressionDesign, unit: 't', status: 'info',
      note: `Inclinaison des élingues basses : effort axial ${s.bottomAxial.toFixed(2)} t, transversal ${s.bottomLateral.toFixed(2)} t`,
    });
    if (Math.abs(s.lugGap) > 0.05)
      push(out, {
        cat: 'Palonnier', item: sp.name || 'Palonnier',
        label: `Entraxe des lugs ≠ entraxe des points de levage (écart ${(s.lugGap * 1000).toFixed(0)} mm) → élingues basses inclinées`,
        status: 'info', unit: '',
      });
  }

  // Stabilité
  const load = project.load;
  const zCog = rig.cog.z;
  const zPad = rig.pts.reduce((s, p) => s + p.pos.z, 0) / rig.pts.length;
  if (rig.pts.length === 1) {
    const off = Math.hypot(rig.pts[0].pos.x - rig.cog.x, rig.pts[0].pos.y - rig.cog.y);
    if (off > 0.01) {
      const tilt = deg(Math.atan2(off, Math.max(rig.pts[0].pos.z - zCog, 1e-6)));
      push(out, { cat: 'Stabilité', item: 'Charge', label: `Point unique décalé du COG de ${(off * 1000).toFixed(0)} mm : inclinaison ≈ ${tilt.toFixed(1)}°`, status: 'warn', unit: '' });
    }
  }
  if (rig.pts.length === 2 || rig.type === 'spreader') {
    if (zCog >= zPad)
      push(out, {
        cat: 'Stabilité', item: 'Charge',
        label: `COG (z = ${(zCog * 1000).toFixed(0)} mm) au-dessus des points de levage (z = ${(zPad * 1000).toFixed(0)} mm) : risque de basculement`,
        status: rig.pts.length === 2 ? 'fail' : 'warn', unit: '',
      });
    if (rig.pts.length === 2) {
      const off = offsetFromLine(rig.pts[0].pos, rig.pts[1].pos, rig.cog);
      if (off > 0.005) {
        const tilt = deg(Math.atan2(off, Math.max(zPad - zCog, 1e-6)));
        push(out, { cat: 'Stabilité', item: 'Charge', label: `COG décalé de ${(off * 1000).toFixed(0)} mm de l'axe des 2 points : rotation ≈ ${tilt.toFixed(1)}° autour de l'axe`, status: 'warn', unit: '' });
      }
    }
  } else if (zCog > zPad) {
    push(out, { cat: 'Stabilité', item: 'Charge', label: 'COG au-dessus du plan des points de levage (charge "lourde du haut") : stable sous crochet mais sensible', status: 'info', unit: '' });
  }
  if (Number(load?.cogEnvelope_mm?.dx) > 0 || Number(load?.cogEnvelope_mm?.dy) > 0)
    push(out, { cat: 'Facteurs', item: 'COG', label: `Enveloppe COG ±${load.cogEnvelope_mm.dx || 0} / ±${load.cogEnvelope_mm.dy || 0} mm prise en compte`, status: 'info', unit: '' });
  return out;
}

/** Contrôle grue pour un rayon donné (charge statique au crochet). */
export function craneCheck(crane, shlCrane, R, label = 'Opération') {
  const out = [];
  const col = Number(crane.activeColumn) || 0;
  const cap = chartCapacity(crane.chart, R, col, crane.interpolation || 'step');
  const lim = Number(crane.utilLimit) > 0 ? Number(crane.utilLimit) : 0.85;
  const colName = crane.chart?.columns?.[col] || '';
  if (cap.status === 'nochart') push(out, { cat: 'Grue', item: label, label: 'Tableau de charge non renseigné', status: 'fail', unit: '' });
  else if (cap.status === 'beyond')
    push(out, { cat: 'Grue', item: label, label: `Rayon ${R} m au-delà du tableau (max ${cap.rMax} m)`, status: 'fail', unit: '' });
  else {
    if (cap.status === 'below') push(out, { cat: 'Grue', item: label, label: `Rayon ${R} m inférieur au rayon mini du tableau (${cap.rMin} m)`, status: 'warn', unit: '' });
    const util = shlCrane / cap.capacity;
    push(out, {
      cat: 'Grue', item: label,
      label: `Capacité à R = ${R} m${cap.rUsed != null && cap.rUsed !== R ? ` (lue à ${cap.rUsed} m)` : ''}${colName ? ` — ${colName}` : ''}`,
      value: shlCrane, limit: cap.capacity, util,
      status: util > 1 ? 'fail' : util > lim ? 'warn' : 'ok',
      note: util > lim && util <= 1 ? `> ${(lim * 100).toFixed(0)} % : levage critique` : '',
    });
  }
  const g = boomGeometry(crane, R);
  if (crane.boom?.length) {
    if (!g.valid) push(out, { cat: 'Grue', item: label, label: g.reason, status: 'fail', unit: '' });
    else {
      const amin = Number(crane.boom.minAngle_deg) || 0, amax = Number(crane.boom.maxAngle_deg) || 90;
      const st = g.angle < amin || g.angle > amax ? 'fail' : 'ok';
      push(out, { cat: 'Grue', item: label, label: `Angle de flèche ${g.angle.toFixed(1)}° (limites ${amin}–${amax}°)`, value: g.angle, unit: '°', status: st });
    }
  }
  return { checks: out, capacity: cap, boom: g };
}

/** Hauteur sous crochet : requise vs disponible. */
export function hookHeightCheck(crane, R, requiredHook_m, label) {
  const avail = maxHookHeight(crane, R);
  if (avail == null || !(requiredHook_m > 0)) return [];
  const st = requiredHook_m > avail ? 'fail' : avail - requiredHook_m < 1 ? 'warn' : 'ok';
  return [
    {
      cat: 'Hauteur', item: label, label: 'Hauteur de crochet requise / disponible', value: r2(requiredHook_m), limit: r2(avail),
      unit: 'm', util: requiredHook_m / avail, status: st, note: st === 'warn' ? 'Marge < 1 m' : '',
    },
  ];
}
