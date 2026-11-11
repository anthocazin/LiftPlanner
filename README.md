# LiftPlanner

Lift planning tool for **offshore and onshore lifts**: import the drawing of the part, click the lift points and the COG on it, build each leg from **real rigging hardware** (Green Pin shackles, connecting links, G80 / G100 chain, roundslings, wire rope slings, grommets, webbing, master links, G-Links — DS Levage 2025 catalogue), get the length of every leg and the minimum WLL, check everything, draw the rigging and the sequence, print the lifting plan in your company template.

**No installation**: a single HTML file that also works **offline** (on board, on site).

> ⚠️ Planning aid only. Catalogue data are indicative and must be checked against the certificates of the equipment actually used. Every lift plan must be reviewed and approved by a competent person according to the applicable procedures.

---

## Getting started

| Use | How |
|---|---|
| **Offline (recommended)** | Download [`dist/LiftPlanner.html`](dist/LiftPlanner.html) and open it in Chrome or Edge (double-click). Everything is included, PDF reader too. |
| Local (development) | `python3 -m http.server 8080` in the repository root, then open <http://localhost:8080> |
| Online | GitHub Pages workflow provided (`.github/workflows/pages.yml`): enable *Settings → Pages → Source = GitHub Actions*. |

The current project and the inventory are saved automatically in the browser. **Save** produces a `.liftplan.json` file to archive with the lift plan (drawing views, site map and logos included). Three examples are in [`examples/`](examples/).

## Features (v0.3)

**Project** — lifting plan identification (title, reference, revision, vessel / site, client, lift location), **report header lines and logos** (company left, client right, saved as your defaults in the browser), environment, **nature of the lift** (quay → vessel, vessel → quay, vessel ↔ vessel / platform, over live plant, splash zone), **step-by-step sequence** (step, details, responsible, sketch on / off, crane radius / slew / load height), design lift conditions, the **safety measures tick list**, further measures, communications and technical review of the template.

**Load** — the page is visual:
- **Import into LiftPlanner** wizard (PDF or image): choose the page and frame of the **XY plan** and **XZ elevation** views, calibrate in two clicks on the outline of the part (or on a known dimension, or with the drawing scale 1:n), set the origin; the overall dimensions are read from the outline.
- **Weight and COG read from the drawing text** (title block, notes, "COG" mark on the views) with *Use* buttons; COG basis obvious / estimated / drawing.
- Lift points and COG **placed and dragged on the drawing** (XY gives X / Y, XZ gives Z): lengths, angles and forces are recalculated live. White grid when there is no drawing. The load does not need to be a box.
- **Padeye characteristics** per point (SWL, main plate, cheek plates, hole Ø, outer radius, hole height, orientation) with the **shackle fit** (pin / hole, thickness / jaw, inside length) and a to-scale drawing; untick *padeye* for choked slings / trunnions and the padeye checks are skipped.

**Crane** — just the load chart: SWL versus radius, minimum and maximum radius (outside = fail), paste from Excel, conservative or interpolated reading, critical lift threshold.

**Rigging**
- **Leg assembly builder**: drag DS Levage catalogue items (Green Pin shackles, roundslings straight / choked, wire, grommet, webbing, **chain G80 / G100**, **connecting links G80 / G100**, Slingmax G-Link) into the leg, from the load to the hook; one assembly for all legs, override leg by leg. Hook side: master link, master link + sub-links (quad) or directly on the hook, optional hook shackle.
- For each leg, from the COG: **required bearing-to-bearing length, connector lengths, sling EWL or chain length in whole links** (e.g. *shackle → connecting link → chain → connecting link → shackle* gives the number of links), **minimum WLL** of every part, utilisation.
- Design to a **target angle to the vertical (30°, up to 45°)** or a fixed hook height; same size on every leg (default) or per leg; matched set / standard / exact lengths.
- Object views with the drawing and the rigging overlaid, 3D isometric view; spreader bar (top + bottom assemblies).

**Checks** — DAF **on / off** (DNV-ST-N001 per environment, or imposed), SKL, COG factor; every part of every leg; **angle to the vertical on all legs** (warning > 30°, fail > 45°, editable); **EN 13414-1 / EN 818-4 / EN 1492 mode factor K** (set WLL = K × leg WLL, also used to size slings and chains); padeyes, shackle side load (Green Pin curve), D/d of wire slings, connecting link / chain grade and size, master link congestion, load tilt with the selected lengths, slack legs, stability, crane at every step.

**Drawings** — rigging on the imported drawing (XY / XZ), isometric / front / side views, rigging detail to scale (chains drawn link by link), **one plan + elevation sketch per sequence step** ticked "Sketch"; optional **sketch drawn by Claude** from the step text (your Anthropic API key, kept in the browser). SVG / PNG export.

**Storyboard** — **import a site / deck map** (PDF or image), **set its scale with two points and the real distance**, place the crane and the pick-up / set-down positions by clicking (radius and slew measured on the map), obstacles; white background scaled to the load and the crane when there is no map.

**Report** — laid out like the company lifting plan template: header with logos, lifting plan block, load / crane details, description, safety measures, communications, **equipment table (Qty / Item / EWL / SWL / Configuration / Cert.)**, step-by-step with responsible, technical review, sketches, concise calculation summary (legs, padeye fit, issues only), checklift, sign-off → *Print / Save as PDF*.

**Inventory** — **equipment for this lift with exact quantities**, an *on hand* tick and the certificate number per line (CSV export); your own certified fleet; browser of the built-in catalogue.

**Settings** — target and maximum leg angle, utilisation, tilt…; **the maths of WLL versus angle** (T = R / cos β table and curve, EN mode factors, shackle side-load curve) and **what hole / pin clearance means**.

## Calculation method

Summary below, details in [`docs/METHOD.md`](docs/METHOD.md).

- Freely suspended load: the hook is vertically above the COG; load frame X/Y/Z in mm, Z up.
- Vertical reactions: lever rule (2 points), exact equilibrium (3 points), rigid plate on equal-stiffness supports (≥ 4 points).
- Leg tension `T = R / cos β = R · L / h`; design force `F = T × DAF × SKL × f_COG × f_other`, compared with the WLL of every part of the leg (× hitch factor / side-load factor). Sling or chain also ≥ load / K (EN mode factor).
- Leg length (bearing to bearing) = shackles (inside length + ½ pin in a hole, + pin on a link) + connecting links / G-Links (effective length) + sling EWL or n × chain pitch + head (master link, sub-link).
- Crane: static load `W × WCF + rigging` against the load chart, between its minimum and maximum radius.

## Built-in catalogue

Main source: **DS Levage general catalogue 2025** (supplied by the user), cross-checked with manufacturer data sheets.

| Family | Source | Range |
|---|---|---|
| Green Pin® G-4163 bow shackle, safety bolt (grade 6, 6:1) | DS Levage p.93 / Green Pin sheet | 0.5 → 85 t |
| Green Pin® G-5263 Super bow shackle, safety bolt (grade 8, 5:1) | DS Levage p.95 | 3.3 → 175 t |
| Green Pin® P-6036 heavy duty bow shackle (grade 8, 5:1) | DS Levage p.94 / distributor sheet | 120 → 1500 t |
| Green Pin® Wide Body shackle, safety bolt | DS Levage p.95 | 7 → 1550 t |
| Green Pin® G-4161 bow shackle, screw pin (not auto-selected) | DS Levage p.92 | 0.33 → 55 t |
| Master links 1–2 legs, quad assemblies (3–4 legs), large links for DIN 15401 hooks no. 25 / 50 / 100 | DS Levage p.38–39 / 46–47 | 2.4 → 67 t |
| Crosby® A-342 master links | Unirope / Crosby table | 1/2" → 4" |
| Polyester roundslings EN 1492-2 (7:1) | DS Levage p.64 (WLL, width); weight per metre typical | 1 → 150 t |
| UHMWPE roundslings | DS Levage p.66 | 15 → 170 t |
| Wire rope slings 6x36 IWRC, eye–eye | DS Levage p.18 (WLL) / p.13 (weight) | Ø8 → Ø90 mm |
| Endless sleeved wire rope slings | DS Levage p.20 | Ø8 → Ø36 mm |
| Cable-laid grommets | DS Levage p.20 | 12.7 → 1000 t |
| Polyester webbing slings EN 1492-1 | DS Levage p.64 (weight not stated) | 1 → 40 t |
| Chain grade 80 (EN 818-2) | DS Levage p.20 (WLL, pitch, width, kg/m) | Ø6 → Ø32 mm |
| Chain grade 100 | DS Levage p.24 | Ø6 → Ø32 mm |
| Connecting links G80 | DS Levage p.22; effective length **estimated** A − 2C | Ø6 → Ø32 mm |
| Connecting links G100 | WLL DS Levage p.26; dimensions **indicative** (G80 table) | Ø6 → Ø32 mm |
| Slingmax® G-Link | Unirope table; effective length **estimated** | 2" → 6" |

The *Source* column of the catalogue browser (Inventory tab) states for each item whether values are published, typical or estimated.

## Code structure

```
index.html            user interface (ES modules, no build step)
css/app.css           screen + print styles
js/state.js           project model, example, migrations
js/engine/            pure calculation code (testable under Node)
  rigging.js          leg assemblies, geometry, equipment selection, forces (direct hook / spreader bar)
  statics.js          force distribution
  equilibrium.js      load tilt with given lengths
  factors.js          DAF, WCF, SKL
  crane.js            load chart (SWL vs radius, range)
  checks.js           checks
  compute.js          orchestration, equipment list, lift category
js/catalog/           equipment data + selection rules
js/draw/              SVG generators (views, detail, storyboard, capacity curve)
js/ui/                user interface: tabs, load views (loadview.js), import wizard, site plan, PDF tools
vendor/pdfjs/         pdf.js (Apache-2.0)
tools/                standalone build, example generator
test/                 engine tests (node --test)
```

```bash
npm test          # calculation engine tests
npm run build     # rebuilds dist/LiftPlanner.html (standalone version)
```

## Roadmap (ideas)

- Tandem lifts (2 cranes), 4-lug spreader frames, lifting beams, Modulift spreader bar load tables.
- Full DNV-ST-N001 mode: safety factors on MBL, consequence factors, padeye calculation.
- Wind loads, vessel-to-vessel transfer, splash zone crossing (DNV-RP-N103).
- Crane library (reusable load charts), import of PDF load charts.
- Drag lift points with the mouse on the drawing, DXF export.

## Licence

Code: all rights reserved. pdf.js: Apache-2.0 (`vendor/pdfjs/LICENSE`). Green Pin®, Crosby®, Slingmax® are trademarks of their respective owners; the data used come from their public documentation and from the DS Levage catalogue.
