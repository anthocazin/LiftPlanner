import { app } from '../app.js';
import { el, field, panel } from '../dom.js';
import { DEFAULT_RULES } from '../../engine/checks.js';
import { DAF_REFERENCE, SKL_REFERENCE } from '../../engine/factors.js';

const RULES = [
  ['minSlingAngleFail_deg', 'Angle mini élingue / horizontale (rejet)', '°'],
  ['minSlingAngleWarn_deg', 'Angle élingue sous lequel alerter', '°'],
  ['maxHoleClearance_mm', 'Jeu trou / axe admissible (absolu)', 'mm'],
  ['maxHoleClearance_pct', 'Jeu trou / axe admissible (% Ø axe)', '%'],
  ['minThicknessRatio', 'Épaisseur padeye / ouverture manille mini', '×'],
  ['utilWarn', 'Alerte au-delà de ce taux d\'utilisation (matériel)', '×'],
  ['maxTiltWarn_deg', 'Inclinaison de charge : alerte au-delà de', '°'],
  ['maxTiltFail_deg', 'Inclinaison de charge : rejet au-delà de', '°'],
  ['lengthMismatchWarn_mm', 'Écart de longueur admissible (palonnier)', 'mm'],
  ['maxOutOfPlane_deg', 'Angle hors plan admissible sur padeye', '°'],
];

export function render(root) {
  app.project.rules = app.project.rules || {};
  const r = panel(
    'Règles de vérification',
    el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '8px' } }, 'Valeurs par défaut issues des pratiques courantes (DNV-ST-N001, recommandations fabricants). Adaptez-les à la procédure de votre entreprise : elles sont enregistrées avec le projet.'),
    el(
      'div',
      { class: 'fields wide' },
      RULES.map(([k, label, unit]) => {
        if (app.project.rules[k] == null) app.project.rules[k] = DEFAULT_RULES[k];
        return field({ label, path: `rules.${k}`, unit, step: 0.01, hint: `Défaut : ${DEFAULT_RULES[k]}` });
      }),
    ),
    el('div', { class: 'row', style: { marginTop: '10px' } }, el('button', { class: 'small', onclick: () => { app.project.rules = { ...DEFAULT_RULES }; app.recompute(); window.__rerender(); } }, 'Rétablir les valeurs par défaut')),
  );
  const about = panel(
    'Méthode de calcul',
    el(
      'ul',
      { style: { fontSize: '13px', lineHeight: 1.5 } },
      el('li', {}, 'Charge suspendue librement : le crochet est à la verticale du COG. Repère pièce X/Y/Z en mm, Z vers le haut.'),
      el('li', {}, 'Réactions verticales : levier (2 points), équilibre exact (3 points), plaque rigide sur appuis de même raideur (4 points et +). Les cas hyperstatiques sont couverts par le SKL.'),
      el('li', {}, 'Tension d\'élingue T = R · L / h ; effort de calcul F = T × DAF × SKL × facteur COG × autre facteur. Masterlink et palonnier : charge verticale × DAF (sans SKL).'),
      el('li', {}, 'Grue : charge statique (poids × WCF + gréement + moufle si déduit) comparée au tableau de charge — le DAF n\'est pas appliqué, le tableau étant déjà certifié pour son usage (offshore : choisir la colonne Hs adaptée).'),
      el('li', {}, 'Manilles : réduction de WLL en charge latérale (0° 100 %, 45° 70 %, 90° 50 %) si l\'orientation du padeye est renseignée ; contrôle jeu trou/axe, épaisseur/ouverture, largeur d\'élingue dans l\'arc.'),
      el('li', {}, 'Longueurs : longueur effective = élingue (EWL) + manilles (f + Ø axe) + masterlink / sous-anneau (longueur intérieure). Assiette de la charge estimée avec les longueurs retenues.'),
    ),
    el('p', { style: { fontSize: '12px' } }, DAF_REFERENCE),
    el('p', { style: { fontSize: '12px' } }, SKL_REFERENCE),
    el('div', { class: 'note warn' }, 'Outil d\'aide à la préparation : il ne remplace pas la revue par une personne compétente, ni les certificats du matériel et de la grue.'),
  );
  const data = panel(
    'Données locales',
    el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Le projet en cours et l\'inventaire sont sauvegardés automatiquement dans ce navigateur. Utilisez « Enregistrer » pour obtenir un fichier .liftplan.json à archiver avec le lift plan.'),
    el(
      'div',
      { class: 'row', style: { marginTop: '8px' } },
      field({ label: 'Inclure le plan PDF importé dans le fichier projet', path: 'drawingEmbed', type: 'checkbox' }),
      el('button', { class: 'small danger', onclick: () => { if (confirm('Effacer les données locales (projet + inventaire) de ce navigateur ?')) { try { localStorage.clear(); } catch {} location.reload(); } } }, 'Effacer les données locales'),
    ),
  );
  root.append(el('div', { class: 'grid g2' }, el('div', { class: 'grid' }, r, data), about));
}
