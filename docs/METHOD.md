# Calculation method — LiftPlanner v0.2

## 1. Frames and units

- Load frame: X (length), Y (width), Z up, entered in **mm**, used in **m** in the calculation.
- Forces in **t** (tonnes-force, 1 t ≈ 9.81 kN). Weights in t, sling lengths in m (EWL).
- Site frame (storyboard): m, free origin, crane slewing axis at (X, Y). Slew angle measured from the X axis, counter-clockwise.

## 2. Weights and factors

| Quantity | Definition |
|---|---|
| W | net weight × WCF (weight contingency factor) |
| W_r | rigging weight (sum of the components, slings per metre of EWL, spreader bar) |
| SHL | W + W_r (static hook load, used for the DAF) |
| Crane load | SHL + hook block (when "deduct hook block" is ticked) |
| DAF | DNV-ST-N001 in-air table, function of SHL and environment, or user value |
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
- **Design mode**: hook height such that the most spread leg makes the target angle with the horizontal (or a fixed hook height). This gives the required effective length of each leg, then the sling length: `EWL = L_eff − Σ connectors`.
- Contribution of the components to the effective length:
  - shackle, pin in a hole (padeye, lug): `f + pin Ø / 2` (hole centre → inside of the bow);
  - shackle, pin bearing on a link: `f + pin Ø`;
  - master link / sub-link: inside length;
  - G-Link: effective length.
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
| Sling | F ≤ WLL × hitch factor (straight 1.0; choked 0.8) |
| Bottom shackle | F ≤ WLL × side-load factor (Green Pin curve: 0° 1.0 / 45° 0.70 / 90° 0.50, interpolated) |
| Top connection | F ≤ WLL |
| Padeye | F ≤ SWL; warning if out-of-plane load > 5° |
| Compatibility | pin ≤ hole; clearance ≤ max(3 mm; 4 % of pin Ø); thickness < jaw width and ≥ 0.75 × jaw width; padeye radius + sling ≤ inside length; sling width / bow width (info); D/d of wire rope slings and grommets over the bow ≥ 1 (warning) |
| Master link, sub-links, top shackle | vertical load × DAF × f_other ≤ WLL; sling congestion ≤ inside width |
| Angles | angle to horizontal ≥ 45° (fail), warning below 55° |
| Tilt | warning above 2°, fail above 5° |
| Stability | 2 points or spreader bar: COG below the lift points; positive reactions |
| Spreader bar | vertical load × DAF ≤ WLL; top sling angle ≥ minimum angle from the certificate |
| Crane | crane load ≤ capacity at the radius (conservative reading by default); above the critical threshold → warning; boom angle within limits |
| Height | required hook height = elevation + (hook → underside of load) ≤ boom tip − minimum distance |

All thresholds can be changed (Settings tab) and are saved with the project.

## 6. Assumptions and limits

- Inextensible slings, rigid load, no wind or vessel motion effect (other than through the DAF).
- The master link is treated as a point (its length is counted in the leg).
- Padeye, lug and spreader bar strength is not calculated: only their declared SWL / WLL are checked.
- Master link ratings from the DS Levage tables are sling assembly ratings; they are used as the vertical capacity of the link (conservative).
- Tandem lifts, subsea / splash zone lifts: out of scope of this version.
