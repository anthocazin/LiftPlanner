# LiftPlanner

Outil de préparation de **lift plans offshore / onshore** : saisie de la charge et de la grue, calcul et vérification du gréement à partir de **matériel réel** (manilles Green Pin, masterlinks Crosby, élingues rondes EN 1492-2, G-Link…), schémas de l'arrangement, storyboard des étapes de levage et rapport PDF.

Application web **sans installation** : un seul fichier HTML qui fonctionne aussi **hors-ligne** (à bord, sur chantier).

> ⚠️ Outil d'aide à la préparation. Les données catalogue sont indicatives et doivent être vérifiées contre les certificats du matériel utilisé. Tout lift plan doit être revu et approuvé par une personne compétente selon les procédures applicables.

---

## Démarrer

| Usage | Comment |
|---|---|
| **Hors-ligne (recommandé)** | Télécharger [`dist/LiftPlanner.html`](dist/LiftPlanner.html) et l'ouvrir dans Chrome / Edge (double-clic). Tout est inclus, y compris le lecteur PDF. |
| En local (développement) | `python3 -m http.server 8080` à la racine puis ouvrir <http://localhost:8080> |
| En ligne | Workflow GitHub Pages fourni (`.github/workflows/pages.yml`) — nécessite un dépôt public ou un plan GitHub payant. |

Le projet en cours et l'inventaire sont sauvegardés automatiquement dans le navigateur. **Enregistrer** produit un fichier `.liftplan.json` à archiver avec le lift plan (option : y inclure le plan PDF importé). Trois exemples sont dans [`examples/`](examples/).

## Fonctionnalités (v0.1)

**Charge**
- Poids, contingence (WCF : pesé 1,03 / calculé 1,05 / estimé 1,10 / libre), dimensions, COG, **enveloppe de COG** (± dx, ± dy : efforts maxi sur l'enveloppe).
- Points de levage : coordonnées, SWL padeye, Ø trou, épaisseur (tôle + flasques), rayon, orientation du padeye.
- **Import du plan de la pièce (PDF ou image)** : calibration de l'échelle sur une cote connue, origine, pointage des padeyes et du COG directement sur le plan (vue de dessus / face / côté), outil de mesure, **détection du poids et du COG dans le texte du PDF**.

**Grue**
- Tableau de charge multi-colonnes (configurations, colonnes Hs offshore), **collage direct depuis Excel**, lecture conservative (rayon tabulé supérieur) ou interpolée.
- Moufle, SWL crochet, seuil de levage critique, géométrie de flèche (angle de flèche, hauteur sous crochet).

**Gréement**
- Crochet direct 1 à n jambes (masterlink, sous-anneaux, élingues directement au crochet, manille de tête) ou **palonnier** (élingues hautes + 1 ou 2 élingues basses par extrémité).
- **Sélection automatique** dans le catalogue + votre inventaire : élingue, manille basse (compatibilité trou/axe, épaisseur/ouverture), connexion haute (direct / manille / G-Link), masterlink (encombrement des élingues).
- Longueurs : jeu de même longueur standard, standard la plus proche, arrondie au-dessus, ou sur mesure ; longueur imposable jambe par jambe.
- Facteurs : **DAF DNV-ST-N001 automatique** (onshore / inshore / offshore) ou imposé, **SKL** auto (1,25 à partir de 4 jambes) ou imposé, facteur COG, facteur libre.

**Vérifications** (statut OK / Alerte / Non conforme)
- Grue : capacité à chaque rayon, seuil critique, angle de flèche, hauteur sous crochet, SWL crochet.
- Élingues, manilles (réduction en charge latérale 0° 100 % / 45° 70 % / 90° 50 %), G-Link, masterlink et sous-anneaux, padeyes (SWL, effort hors plan).
- Angles d'élingues, compatibilité des composants, **assiette estimée de la charge** avec les longueurs retenues (élingue détendue), stabilité (COG au-dessus des points sur 2 points / palonnier, COG hors polygone), palonnier (WLL, angle mini du certificat, compression).
- Catégorie de levage indicative (routine / complexe / critique).

**Schémas et storyboard**
- Vues isométrique, dessus, face, côté, cotées, avec efforts et angles.
- **Détail d'élingage à l'échelle** dessiné à partir des dimensions catalogue (manille lyre, axe, œils, masterlink, sous-anneaux, élingue, padeye vu sur la tranche).
- Storyboard : implantation de la grue, obstacles / zones, étapes (rayon, orientation, élévation) → **vue en plan + coupe radiale par étape** avec contrôle de capacité.
- Export **SVG** (vectoriel, modifiable) et **PNG** de chaque schéma.

**Rapport** : rapport A4 complet (opération, charge, grue + courbe de capacité, gréement, liste du matériel, schémas, vérifications, storyboard, limites météo, check-list, signatures) → *Imprimer / Enregistrer en PDF*. Liste du matériel exportable en CSV.

**Inventaire** : votre parc de matériel certifié (n° de certificat, n° de série, longueurs réelles) — copie possible depuis le catalogue intégré, import / export JSON.

## Méthode de calcul

Résumé ci-dessous, détail dans [`docs/METHODE.md`](docs/METHODE.md).

- Charge libre : crochet à la verticale du COG ; repère pièce X/Y/Z en mm, Z vers le haut.
- Réactions verticales : levier (2 points), équilibre exact (3 points), plaque rigide sur appuis de même raideur (≥ 4 points).
- Tension d'élingue `T = R · L / h` ; effort de calcul `F = T × DAF × SKL × f_COG × f_autre`, comparé à la WLL (× facteur de mode / de charge latérale).
- Grue : charge statique `W × WCF + gréement (+ moufle)` comparée au tableau de charge (sans DAF, le tableau étant certifié pour son usage).

## Catalogue intégré

| Famille | Source | Gamme |
|---|---|---|
| Manilles lyre à boulon Green Pin® G-4163 (grade 6, 6:1) | fiche catalogue Green Pin | 0,5 → 85 t |
| Manilles lyre HD Green Pin® P-6036 (grade 8, 5:1) | fiche distributeur | 120 → 1500 t |
| Masterlinks Crosby® A-342 | table Unirope / Crosby (converti) | 1/2" → 4" |
| Élingues rondes PES EN 1492-2 (7:1) | code couleur normalisé ; largeur et poids **typiques** | 1 → 100 t |
| G-Link Slingmax® | table Unirope ; longueur utile **estimée** | 2" → 6" |

## Structure du code

```
index.html            interface (modules ES, sans build)
css/app.css           styles écran + impression
js/state.js           modèle de projet, exemple, migrations
js/engine/            calcul pur (testable sous Node)
  rigging.js          géométrie, sélection du matériel, efforts (crochet / palonnier)
  statics.js          répartition des efforts
  equilibrium.js      assiette de la charge avec longueurs données
  factors.js          DAF, WCF, SKL
  crane.js            tableau de charge, géométrie de flèche
  checks.js           vérifications
  compute.js          orchestration, liste du matériel, catégorie
js/catalog/           données matériel + règles de sélection
js/draw/              générateurs SVG (vues, détail, storyboard, courbe)
js/ui/                interface (onglets, import PDF, figures)
vendor/pdfjs/         pdf.js (Apache-2.0)
tools/                build de la version autonome, génération des exemples
test/                 tests du moteur (node --test)
```

```bash
npm test          # tests du moteur de calcul
npm run build     # régénère dist/LiftPlanner.html (version autonome)
```

## Feuille de route (pistes)

- Levage en tandem (2 grues), palonnier-cadre 4 lugs, lifting beam.
- Élingues câble (EN 13414) et chaîne (EN 818) avec coefficients de mode / angle.
- Mode DNV-ST-N001 complet : coefficients de sécurité sur MBL, facteurs de conséquence, calcul de padeye.
- Charges de vent, transfert navire ↔ navire, passage zone de déferlement (DNV-RP-N103).
- Bibliothèque de grues (tableaux de charge réutilisables), import de tableaux PDF.
- Déplacement des points à la souris sur le plan, export DXF, version anglaise du rapport.

## Licence

Code : tous droits réservés (dépôt privé). pdf.js : Apache-2.0 (`vendor/pdfjs/LICENSE`). Green Pin®, Crosby®, Slingmax® sont des marques de leurs propriétaires respectifs ; les données reprises proviennent de leurs documentations publiques.
