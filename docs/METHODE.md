# Note de méthode — LiftPlanner v0.1

## 1. Repères et unités

- Repère de la pièce : X (longueur), Y (largeur), Z vers le haut, en **mm** à la saisie, en **m** dans le calcul.
- Efforts en **t** (tonnes-force, 1 t ≈ 9,81 kN). Poids en t, longueurs d'élingues en m (EWL).
- Repère du site (storyboard) : m, origine libre, grue en (X, Y). Orientation (slew) mesurée depuis l'axe X, sens trigonométrique.

## 2. Poids et facteurs

| Grandeur | Définition |
|---|---|
| W | poids net × WCF (contingence de poids) |
| W_g | poids du gréement (somme des composants, élingues au mètre, palonnier) |
| SHL | W + W_g (charge statique au crochet, sert au DAF) |
| Charge grue | SHL + moufle (si « déduire le moufle ») |
| DAF | DNV-ST-N001 dans l'air, fonction de SHL et de l'environnement, ou valeur imposée |
| SKL | 1,0 pour 1 à 3 jambes ; 1,25 à partir de 4 jambes (hyperstatique) ; ou valeur imposée |

DAF par défaut (DNV-ST-N001, levages dans l'air) :

| SHL (t) | Onshore | Inshore | Offshore |
|---|---|---|---|
| ≤ 100 | 1,10 | 1,07 + 0,05·√(100/SHL) | 1,15 + 0,15·√(100/SHL) |
| 100 – 300 | 1,05 | 1,12 | 1,25 |
| 300 – 1000 | 1,05 | 1,10 | 1,20 |
| 1000 – 2500 | 1,03 | 1,08 | 1,15 |
| > 2500 | 1,03 | 1,05 | 1,10 |

> À confirmer avec l'édition en vigueur de la norme et la procédure projet / MWS.

Le calcul itère (≤ 5 passes) car le poids du gréement dépend du matériel choisi, lequel dépend des efforts.

## 3. Géométrie

- Charge libre : le crochet H est à la verticale du COG.
- **Mode conception** : hauteur de crochet telle que l'élingue la plus écartée fasse l'angle cible avec l'horizontale (ou hauteur imposée). On en déduit la longueur effective requise de chaque jambe, puis la longueur d'élingue : `EWL = L_eff − Σ connecteurs`.
- Contribution des composants à la longueur effective :
  - manille, axe dans un trou (padeye, lug) : `f + Ø_axe / 2` (centre du trou → fond de l'arc) ;
  - manille, axe en appui sur un anneau : `f + Ø_axe` ;
  - masterlink / sous-anneau : longueur intérieure ;
  - G-Link : longueur utile.
- **Géométrie réelle** : avec les longueurs retenues, chaque jambe donne une hauteur de crochet ; la moyenne est utilisée pour les angles et efforts.
- **Assiette** : rotation du corps rigide autour du COG telle que les longueurs soient respectées (exact pour 1 à 3 jambes, moindres carrés au-delà) ; une élingue plus longue que nécessaire est signalée détendue.

## 4. Répartition des efforts

- 1 point : R = W.
- 2 points : règle du levier sur la droite des deux points (projection du COG).
- 3 points : résolution exacte de l'équilibre vectoriel `Σ T_i·u_i = (0, 0, W)`.
- ≥ 4 points : plaque rigide sur appuis de même raideur, `R_i = a + b·x_i + c·y_i` avec `ΣR = W`, `ΣR·x = W·x_G`, `ΣR·y = W·y_G` ; le caractère hyperstatique est couvert par le SKL.
- Tension : `T_i = R_i · L_i / h_i` ; effort de calcul `F_i = T_i × DAF × SKL × f_COG × f_autre`.
- Enveloppe de COG : calcul pour le COG nominal et les 4 coins (± dx, ± dy) ; on retient la tension maximale par jambe et on signale toute réaction négative.

**Palonnier** : points répartis par extrémité selon leur position par rapport au COG (axe du palonnier) ; lugs à l'entraxe du palonnier, centré sur les points ou sur le COG, axe passant à la verticale du COG. Efforts des élingues basses depuis les réactions R_i ; charges d'extrémité `V = ΣR + ½ poids palonnier + ½ élingues basses` ; crochet au-dessus du barycentre des charges d'extrémité ; compression `C = V · d / h` (élingues hautes).

## 5. Vérifications

| Élément | Critère |
|---|---|
| Élingue | F ≤ WLL × facteur de mode (direct 1,0 ; étranglé 0,8) |
| Manille basse | F ≤ WLL × facteur de charge latérale (0° 1,0 / 45° 0,7 / 90° 0,5, interpolé) |
| Connexion haute | F ≤ WLL |
| Padeye | F ≤ SWL ; alerte si effort hors plan > 5° |
| Compatibilité | axe ≤ trou ; jeu ≤ max(3 mm ; 4 % Ø axe) ; épaisseur < ouverture et ≥ 0,75 × ouverture ; rayon padeye + élingue ≤ longueur intérieure ; largeur élingue / largeur d'arc (info) |
| Masterlink, sous-anneaux, manille de tête | charge verticale × DAF × f_autre ≤ WLL ; encombrement ≤ largeur intérieure |
| Angles | angle / horizontale ≥ 45° (rejet), alerte < 55° |
| Assiette | alerte > 2°, rejet > 5° |
| Stabilité | 2 points ou palonnier : COG sous les points de levage ; réactions positives |
| Palonnier | charge verticale × DAF ≤ WLL ; angle élingues hautes ≥ angle mini du certificat |
| Grue | charge grue ≤ capacité au rayon (lecture conservative par défaut) ; > seuil critique → alerte ; angle de flèche dans les limites |
| Hauteur | crochet requis = élévation + (crochet → dessous de charge) ≤ tête de flèche − distance mini |

Tous les seuils sont modifiables (onglet Réglages) et enregistrés avec le projet.

## 6. Hypothèses et limites

- Élingues inextensibles, charge rigide, pas d'effet du vent ni de mouvement de navire (hors DAF).
- La position réelle du masterlink est assimilée à un point (sa longueur est comptée dans la jambe).
- Le calcul de résistance des padeyes, des lugs et du palonnier n'est pas fait : seules leurs SWL / WLL déclarées sont vérifiées.
- Levages en tandem, sous-marins / zone de déferlement : hors périmètre de cette version.
