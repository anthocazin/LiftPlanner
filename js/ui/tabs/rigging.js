import { app } from '../app.js';
import { el, field, panel, fmt, utilBar } from '../dom.js';
import { listByType, slingModeFactor, shackleSideLoadFactor } from '../../catalog/index.js';
import { DAF_REFERENCE, SKL_REFERENCE } from '../../engine/factors.js';
import { drawRiggingView } from '../../draw/rigging.js';
import { figure } from '../figure.js';

const itemOptions = (type, filter = () => true) => [['auto', 'Auto (sélection)'], ...listByType(type).filter(filter).map((i) => [i.id, `${i.user ? '★ ' : ''}${i.name}${i.certNo ? ` — ${i.certNo}` : ''}`])];

export function render(root) {
  const R = 'rigging.';
  const rig = app.project.rigging;
  const isSp = rig.type === 'spreader';
  const config = panel(
    'Configuration',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'Type de gréement', path: `${R}type`, type: 'select', options: [['hook', 'Crochet direct (élingues convergentes)'], ['spreader', 'Palonnier (spreader bar)']], onchange: () => window.__rerender() }),
      field({ label: 'Tête de gréement', path: `${R}headType`, type: 'select', options: [['masterlink', 'Masterlink'], ['hook', 'Élingues directement au crochet']], onchange: () => window.__rerender() }),
      rig.headType !== 'hook' ? field({ label: 'Masterlink', path: `${R}masterlink.itemId`, type: 'select', options: itemOptions('masterlink') }) : null,
      rig.headType !== 'hook' && !isSp ? field({ label: 'Sous-anneaux (assemblage quadruple)', path: `${R}masterlink.subLinks`, type: 'checkbox', onchange: () => window.__rerender() }) : null,
      rig.headType !== 'hook' && rig.masterlink?.subLinks && !isSp ? field({ label: 'Sous-anneau', path: `${R}masterlink.subLinkItemId`, type: 'select', options: itemOptions('masterlink') }) : null,
      field({ label: 'Manille de tête (crochet ↔ gréement)', path: `${R}topShackle.enabled`, type: 'checkbox', onchange: () => window.__rerender() }),
      rig.topShackle?.enabled ? field({ label: 'Manille de tête', path: `${R}topShackle.itemId`, type: 'select', options: itemOptions('shackle') }) : null,
    ),
    el('h3', {}, isSp ? 'Conception des élingues hautes' : 'Conception des longueurs'),
    el(
      'div',
      { class: 'fields' },
      !isSp ? field({ label: 'Critère', path: `${R}design.mode`, type: 'select', options: [['angle', 'Angle cible des élingues'], ['height', 'Hauteur de crochet imposée']], onchange: () => window.__rerender() }) : null,
      rig.design?.mode === 'height' && !isSp
        ? field({ label: 'Hauteur crochet / padeyes', path: `${R}design.hookHeight_m`, unit: 'm' })
        : field({ label: 'Angle cible / horizontale', path: `${R}design.targetAngle_deg`, unit: '°', hint: '60° recommandé' }),
      field({
        label: 'Longueurs d\'élingues',
        path: `${R}design.roundLengths`,
        type: 'select',
        options: [['set', 'Jeu de même longueur (standard, arrondi sup.)'], ['nearest', 'Standard la plus proche'], ['up', 'Standard arrondie au-dessus'], ['exact', 'Sur mesure (longueur exacte)']],
      }),
    ),
  );

  const factors = panel(
    'Facteurs de calcul',
    el(
      'div',
      { class: 'fields' },
      field({ label: 'DAF', path: 'factors.dafMode', type: 'select', options: [['dnv', 'Auto — DNV-ST-N001 (dans l\'air)'], ['manual', 'Valeur imposée']], onchange: () => window.__rerender() }),
      app.project.factors.dafMode === 'manual' ? field({ label: 'DAF imposé', path: 'factors.dafManual', unit: '×', step: 0.01 }) : null,
      field({ label: 'SKL (charge déséquilibrée)', path: 'factors.sklMode', type: 'select', options: [['auto', 'Auto (1,0 / 1,25 si ≥ 4 jambes)'], ['manual', 'Valeur imposée']], onchange: () => window.__rerender() }),
      app.project.factors.sklMode === 'manual' ? field({ label: 'SKL imposé', path: 'factors.sklManual', unit: '×', step: 0.01 }) : null,
      field({ label: 'Facteur COG', path: 'factors.cogFactor', unit: '×', step: 0.01, hint: 'Si pas d\'enveloppe COG' }),
      field({ label: 'Autre facteur', path: 'factors.extraFactor', unit: '×', step: 0.01, hint: 'Yaw, tilt, consequence…' }),
    ),
    el('div', { id: 'factors-live', class: 'cards', style: { marginTop: '10px' } }),
    el('details', { style: { marginTop: '8px', fontSize: '12px' } }, el('summary', { class: 'muted' }, 'Références des facteurs'), el('p', {}, DAF_REFERENCE), el('p', {}, SKL_REFERENCE)),
  );

  let spreader = null;
  if (isSp) {
    const S = `${R}spreader.`;
    spreader = panel(
      'Palonnier',
      el(
        'div',
        { class: 'fields' },
        field({ label: 'Désignation', path: `${S}name`, type: 'text' }),
        field({ label: 'N° certificat', path: `${S}certNo`, type: 'text' }),
        field({ label: 'Entraxe des lugs', path: `${S}length_m`, unit: 'm' }),
        field({ label: 'Hauteur lug bas → lug haut', path: `${S}depth_m`, unit: 'm' }),
        field({ label: 'Poids', path: `${S}weight_t`, unit: 't' }),
        field({ label: 'WLL', path: `${S}wll_t`, unit: 't' }),
        field({ label: 'Axe du palonnier', path: `${S}axis`, type: 'select', options: [['x', 'Selon X (longueur)'], ['y', 'Selon Y (largeur)']] }),
        field({ label: 'Position', path: `${S}position`, type: 'select', options: [['points', 'Centré sur les points de levage'], ['cog', 'Centré sur le COG']] }),
        field({ label: 'Angle mini élingues hautes (certificat)', path: `${S}minTopAngle_deg`, unit: '°' }),
        field({ label: 'Angle cible élingues basses', path: `${S}bottomTargetAngle_deg`, unit: '°' }),
        field({ label: 'Hauteur mini sous palonnier', path: `${S}minBottomHeight_m`, unit: 'm' }),
        field({ label: 'Lug haut : Ø trou', path: `${S}topLugHoleDia_mm`, unit: 'mm' }),
        field({ label: 'Lug haut : épaisseur', path: `${S}topLugThk_mm`, unit: 'mm' }),
        field({ label: 'Lug bas : Ø trou', path: `${S}bottomLugHoleDia_mm`, unit: 'mm' }),
        field({ label: 'Lug bas : épaisseur', path: `${S}bottomLugThk_mm`, unit: 'mm' }),
      ),
    );
  }

  const legs = panel(
    null,
    el('div', { class: 'panel-head' }, el('h2', {}, 'Jambes de gréement'), el('span', { class: 'muted', style: { fontSize: '12px' } }, 'Laissez « Auto » pour une sélection automatique dans le catalogue + votre inventaire (★).')),
    el('div', { id: 'legs-table', class: 'tbl-wrap' }),
  );
  const pv = panel(null, el('div', { id: 'rig-preview' }));
  root.append(
    el('div', { class: 'grid g-side' }, el('div', { class: 'grid' }, config, factors, spreader), el('div', { class: 'grid' }, pv)),
    el('div', { style: { marginTop: '14px' } }, legs),
  );
  update(app.result);
  root._update = update;
}

function legRow(leg) {
  const key = leg.key;
  const base = `rigging.legs.${key}`;
  const cfg = app.project.rigging.legs?.[key] || {};
  const ensure = () => {
    if (!app.project.rigging.legs) app.project.rigging.legs = {};
    if (!app.project.rigging.legs[key]) app.project.rigging.legs[key] = {};
    return app.project.rigging.legs[key];
  };
  const sel = (prop, options, val) => {
    const s = el('select', { onchange: (e) => { ensure()[prop] = e.target.value; app.recompute(); } });
    options.forEach(([v, t]) => s.append(el('option', { value: v, selected: String(v) === String(val ?? 'auto') }, t)));
    return s;
  };
  const autoLabel = (item, cfgId) => (cfgId && cfgId !== 'auto' ? null : el('div', { class: 'muted', style: { fontSize: '11px' } }, item ? `→ ${item.short || item.name}` : '→ aucune'));
  const topKind = cfg.topConnector || leg.cfg.topConnector || 'direct';
  const lenInput = el('input', {
    type: 'number', step: '0.01', value: cfg.lockLength ? cfg.length_m ?? '' : '', placeholder: fmt(leg.slingLength),
    title: 'Saisir une longueur pour l\'imposer (EWL, m)', style: { width: '70px' },
    onchange: (e) => { const c = ensure(); const v = e.target.value === '' ? null : Number(e.target.value); c.length_m = v; c.lockLength = v != null; app.recompute(); },
  });
  const sling = leg.comps.sling;
  const wllS = sling ? sling.wll_t * slingModeFactor(leg.cfg.mode) : null;
  const sh = leg.comps.bottomShackle;
  const wllSh = sh ? sh.wll_t * shackleSideLoadFactor(leg.beta || 0) : null;
  const utils = [wllS && leg.Fdesign / wllS, wllSh && leg.Fdesign / wllSh, leg.comps.topConn && leg.Fdesign / leg.comps.topConn.wll_t, leg.point?.swl_t && leg.Fdesign / leg.point.swl_t].filter((u) => u != null);
  return el(
    'tr',
    {},
    el('td', {}, el('b', {}, leg.label)),
    el('td', {}, sel('slingId', itemOptions('roundsling'), cfg.slingId), autoLabel(sling, cfg.slingId)),
    el('td', {}, sel('mode', [['direct', 'Direct'], ['choke', 'Étranglé']], cfg.mode || 'direct')),
    el('td', {}, el('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '4px' } }, lenInput, cfg.lockLength ? el('span', { title: 'Longueur imposée' }, '🔒') : null), el('div', { class: 'muted', style: { fontSize: '11px' } }, `requis ${fmt(leg.slingLengthReq)} m`)),
    el('td', {}, sel('bottomShackleId', itemOptions('shackle'), cfg.bottomShackleId), autoLabel(sh, cfg.bottomShackleId)),
    el(
      'td',
      {},
      sel('topConnector', [['direct', 'Direct'], ['shackle', 'Manille'], ['glink', 'G-Link']], topKind),
      topKind === 'shackle' ? sel('topConnectorId', itemOptions('shackle'), cfg.topConnectorId) : topKind === 'glink' ? sel('topConnectorId', itemOptions('glink'), cfg.topConnectorId) : null,
      topKind !== 'direct' ? autoLabel(leg.comps.topConn, cfg.topConnectorId) : null,
    ),
    el('td', { class: 'num' }, `${leg.angleH.toFixed(1)}°`),
    el('td', { class: 'num' }, fmt(leg.Tstatic)),
    el('td', { class: 'num' }, el('b', {}, fmt(leg.Fdesign))),
    el('td', {}, utilBar(utils.length ? Math.max(...utils) : null)),
  );
}

function update(res) {
  const box = document.getElementById('legs-table');
  const rig = res?.rig;
  if (box) {
    box.innerHTML = '';
    if (!rig || rig.error) box.append(el('div', { class: 'note fail' }, rig?.error || 'Calcul impossible'));
    else {
      const head = ['Jambe', 'Élingue', 'Mode', 'EWL (m)', 'Manille basse', 'Connexion haute', 'Angle', 'T stat. (t)', 'F calc. (t)', 'Util. max'];
      box.append(el('table', { class: 'data compact' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), el('tbody', {}, rig.legs.map(legRow))));
    }
  }
  const fl = document.getElementById('factors-live');
  if (fl && rig && !rig.error) {
    const f = rig.factors;
    const c = (k, v, s) => el('div', { class: 'card' }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v), s ? el('div', { class: 's' }, s) : null);
    fl.innerHTML = '';
    fl.append(...[
      c('SHL', `${fmt(rig.shl)} t`, 'charge + gréement'),
      c('DAF', fmt(f.daf), f.dafAuto ? 'DNV auto' : 'imposé'),
      c('SKL', fmt(f.skl), f.sklAuto ? 'auto' : 'imposé'),
      c('Facteur jambes', fmt(rig.fac, 3), 'DAF × SKL × COG × autre'),
      c('Hauteur gréement', `${fmt(rig.riggingHeight)} m`, 'padeyes → crochet'),
      rig.tilt ? c('Assiette', `${fmt(rig.tilt.tilt_deg)}°`, 'inclinaison estimée') : null,
    ].filter(Boolean));
  }
  const pv = document.getElementById('rig-preview');
  if (pv) {
    pv.innerHTML = '';
    pv.append(figure(drawRiggingView(app.project, res, 'iso', { width: 600, height: 470 }), 'gréement-iso'));
  }
}
