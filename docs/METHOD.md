# Calculation method — LiftPlanner v0.2

## 1. Frames and units

- Load frame: X (length), Y (width), Z up, entered in **mm**, used in **m** in the calculation.
- Forces in **t** (tonnes-force, 1 t ≈ 9.81 kN). Weights in t, sling lengths in m (EWL).

## 2. Weights and factors

| Quantity | Definition |
|---|---|
| W | net weight × WCF (weight contingency factor) |
| W_r | rigging weight (sum of the components, slings per metre of EWL, spreader bar) |
| SHL | W + W_r (static hook load, used for the DAF) |
| Crane load | SHL, checked against the load chart (SWL versus radius) |
| DAF | DNV-ST-N001 in-air table, function of SHL and environment, or user value; can be switched off (DAF = 1) |
| SKL | 1.0 for 1 to 3 legs; 1.25 from 4 legs (statically indeterminate); or user value |

Default DAF (DNV-ST-N001, lifts in air):

| SHL (t) | Onshore | Inshore | Offshore |
|---|---|---|---|
| ≤ 100 | 1.10 | 1.07 + 0.05·√(100/SHL) | 1.15 + 0.15·√(100/SHL) |
| 100 – 300 | 1.05 | 1.12 | 1.25 |
| 300 – 1000 | 1.05 | 1.10 | 1.20 |
| 1000 – 2500 | 1.03 | 1.08 | 1.15 |
| > 2500 | 1.03 | 1.05 | 1.10 |

> To be confirmed against the edition in force and the project / MWS procedure.

The calculation iterates (≤ 5 passes) because the rigging weight depends on the selected equipment, which depends on the forces.

## 3. Geometry

- Freely suspended load: the hook H is vertically above the COG.
- **Leg assembly**: an ordered list of parts from the lift point to the hook (e.g. shackle → connecting link → chain → connecting link → shackle). Exactly one part is the length element (sling or chain).
- **Design mode**: hook height such that the most spread leg makes the **target angle to the vertical** (default 30°), or a fixed hook height. This gives the required bearing-to-bearing length of each leg `L_eff = |hook − lift point|`, then the length element: `L = L_eff − Σ connectors − head (+ choke wrap)`.
- Contribution of the components to the effective length:
  - shackle, pin in a hole (padeye, lug): `f + pin Ø / 2` (hole centre → inside of the bow);
  - shackle, pin bearing on a link: `f + pin Ø`;
  - master link / sub-link: inside length;
  - connecting link (chain): effective length, estimated `A − 2·C` from the catalogue dimensions; G-Link: effective length;
  - chain: `n × pitch` bearing to bearing (n links); overall length `n × pitch + 2 d`. n is rounded up to the next link (nearest link in "exact" mode);
  - sling: EWL rounded to a standard length (matched set, nearest, next up) or exact.
- **Actual geometry**: with the selected lengths each leg gives a hook height; the mean is used for angles and forces.
- **Tilt**: rotation of the rigid body about its COG such that the lengths are respected (exact for 1 to 3 legs, least squares above); a sling longer than needed is reported as slack.

## 4. Force distribution

- 1 point: R = W.
- 2 points: lever rule along the line through the two points (projection of the COG).
- 3 points: exact solution of the vector equilibrium `Σ T_i·u_i = (0, 0, W)`.
- ≥ 4 points: rigid plate on equal-stiffness supports, `R_i = a + b·x_i + c·y_i` with `ΣR = W`, `ΣR·x = W·x_G`, `ΣR·y = W·y_G`; the indeterminacy is covered by the SKL.
- Tension: `T_i = R_i · L_i / h_i`; design force `F_i = T_i × DAF × SKL × f_COG × f_other`.
- COG envelope: calculation for the nominal COG and the 4 corners (± dx, ± dy); the maximum tension per leg is kept and any negative reaction is reported.

**Spreader bar**: lift points are split per end according to their position relative to the COG (along the bar axis); lugs at the bar lug spacing, centred on the points or on the COG, bar axis vertically above the COG. Bottom sling forces from the reactions R_i; end loads `V = ΣR + ½ bar weight + ½ bottom slings`; hook above the centroid of the end loads; compression `C = V · d / h` (top slings).

## 5. Checks

| Item | Criterion |
|---|---|
| Sling / chain | F ≤ WLL × hitch factor (straight 1.0; choked 0.8) |
| Shackle on the lift point | F ≤ WLL × side-load factor (Green Pin curve: 0° 1.0 / 45° 0.70 / 90° 0.50, interpolated) |
| Other parts (shackles, connecting links, G-Links) | F ≤ WLL; connecting link of the same size and grade as the chain |
| EN mode factor | load ≤ K × WLL of one leg: K = 1 (1 leg), 1.4 / 1.0 (2 legs, β ≤ 45° / ≤ 60°), 2.1 / 1.5 (3–4 legs); β > 60° not allowed (EN 13414-1, EN 818-4, EN 1492). Slings and chains are also sized to satisfy it |
| Padeye (if the point has one) | F ≤ SWL; warning if out-of-plane load > 5° |
| Compatibility | pin ≤ hole; clearance ≤ max(3 mm; 4 % of pin Ø); total padeye thickness (main + 2 cheeks) < jaw width and ≥ 0.75 × jaw width; material above the hole (R − hole/2) + sling ≤ inside length; then every joint of the leg, part by part (see below) |
| Master link, sub-links, top shackle | vertical load × DAF × f_other ≤ WLL; sling congestion ≤ inside width |
| Angles | every leg: angle to the vertical ≤ 30° (target, warning above) and ≤ 45° (maximum, fail above) — both editable |
| Tilt | warning above 2°, fail above 5° |
| Stability | 2 points or spreader bar: COG below the lift points; positive reactions |
| Spreader bar | vertical load × DAF ≤ WLL; top sling angle ≥ minimum angle from the certificate |
| Crane | crane load ≤ SWL at the radius (conservative reading by default); radius within the chart (min / max); above the critical threshold → warning |

All thresholds can be changed (Settings tab; padeye tolerances on the Load page) and are saved with the project.

## 6. Assumptions and limits

- Inextensible slings, rigid load, no wind or vessel motion effect (other than through the DAF).
- The master link is treated as a point (its length is counted in the leg).
- Padeye, lug and spreader bar strength is not calculated: only their declared SWL / WLL are checked.
- Master link ratings from the DS Levage tables are sling assembly ratings; they are used as the vertical capacity of the link (conservative).
- Tandem lifts, subsea / splash zone lifts: out of scope of this version.


## Part-to-part compatibility (v0.5)

Every joint between two parts of a leg (lift point → … → master link) is checked with the face each part offers:

| Part | Face used |
|---|---|
| Shackle | bow: inside width at the bow 2 × R (bearing for a sling), pin: jaw width (what goes on the pin) and pin Ø |
| Round sling | bunches on its bearing: width taken ≈ 0.5 × flat width |
| Flat webbing sling | must lie flat: needs a bearing ≥ its width |
| Wire rope sling | eye: D/d ≥ 1 over the bearing (warning), eye width ≈ 2 d along the bar |
| Chain / connecting link / hook / master link | bar Ø (must enter the jaw / the eye) and inside width |

Master link congestion: Σ of the widths taken by every leg on the bottom bar ≤ inside width. A master link marked *SWL not known* is assumed suitable: it is used for the geometry only, not checked and left out of the equipment list.
