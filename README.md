# LiftPlanner

Lift planning tool for **offshore and onshore lifts**: load and crane input, rigging calculation and checks based on **real rigging hardware** (Green Pin shackles, master links, polyester and UHMWPE roundslings, wire rope slings, cable-laid grommets, webbing slings, G-Links), rigging arrangement drawings, lift step storyboard and PDF report.

**No installation**: a single HTML file that also works **offline** (on board, on site).

> ⚠️ Planning aid only. Catalogue data are indicative and must be checked against the certificates of the equipment actually used. Every lift plan must be reviewed and approved by a competent person according to the applicable procedures.

---

## Getting started

| Use | How |
|---|---|
| **Offline (recommended)** | Download [`dist/LiftPlanner.html`](dist/LiftPlanner.html) and open it in Chrome or Edge (double-click). Everything is included, PDF reader too. |
| Local (development) | `python3 -m http.server 8080` in the repository root, then open <http://localhost:8080> |
| Online | GitHub Pages workflow provided (`.github/workflows/pages.yml`): enable *Settings → Pages → Source = GitHub Actions*. |

The current project and the inventory are saved automatically in the browser. **Save** produces a `.liftplan.json` file to archive with the lift plan (optionally with the imported PDF drawing embedded). Three examples are in [`examples/`](examples/).

## Features (v0.2)

**Load**
- Weight, weight contingency (WCF: weighed 1.03 / calculated 1.05 / estimated 1.10 / free), dimensions, COG, **COG envelope** (± dx, ± dy: maximum leg forces over the envelope).
- Lift points: coordinates, padeye SWL, hole Ø, thickness (main plate + cheeks), radius, padeye orientation.
- **Load drawing import (PDF or image)**: scale calibration on a known dimension, origin, picking of padeyes and COG directly on the drawing (top / front / side view), measuring tool, **detection of weight and COG in the PDF text**.

**Crane**
- Multi-column load chart (configurations, offshore Hs columns), **paste straight from Excel**, conservative reading (next tabulated radius) or interpolation.
- Hook block, hook SWL, critical lift threshold, boom geometry (boom angle, height under hook).

**Rigging**
- Direct to hook with 1 to n legs (master link, sub-links or quad assembly, slings directly on the hook, top shackle) or **spreader bar** (top slings + 1 or 2 bottom slings per end).
- **Sling type** per project or per leg: polyester roundsling, UHMWPE roundsling, wire rope sling (eye–eye or endless), cable-laid grommet, webbing sling.
- **Automatic selection** from the catalogue + your inventory: sling, bottom shackle (hole/pin and thickness/jaw compatibility), top connection (direct / shackle / G-Link), master link (sling congestion). Shackle ranges to use are selectable (Green Pin G-4163, G-5263 Super, P-6036, Wide Body, G-4161 screw pin).
- Lengths: matched set of one standard length, nearest standard, next standard up, or custom; length can be fixed leg by leg.
- Factors: **automatic DNV-ST-N001 DAF** (onshore / inshore / offshore) or user value, **SKL** auto (1.25 from 4 legs) or user value, COG factor, free factor.

**Checks** (status OK / Warning / Fail)
- Crane: capacity at each radius, critical lift threshold, boom angle, height under hook, hook SWL.
- Slings (incl. choked hitch), shackles (Green Pin side-load reduction curve), G-Links, master link and sub-links, padeyes (SWL, out-of-plane load).
- Sling angles, component compatibility, **D/d bending ratio** of wire rope slings and grommets over the shackle bow, **estimated load tilt** with the selected lengths (slack sling), stability (COG above the lift points for 2 points / spreader, COG outside the lift point polygon), spreader bar (WLL, minimum angle from certificate, compression).
- Indicative lift category (routine / complex / critical).

**Drawings and storyboard**
- Isometric, plan, front and side views, dimensioned, with forces and angles.
- **Rigging detail to scale** drawn from the catalogue dimensions (shackle bow, pin, eyes, master link, sub-links, sling, padeye seen edge-on).
- Storyboard: crane position, obstacles / areas, steps (radius, slew, elevation) → **plan view + radial section per step** with capacity check.
- **SVG** (vector, editable) and **PNG** export of every drawing.

**Report**: full A4 report (operation, load, crane + capacity curve, rigging, equipment list, drawings, checks, storyboard, weather limits, checklist, signatures) → *Print / Save as PDF*. Equipment list exportable to CSV.

**Inventory**: your fleet of certified equipment (certificate no., serial no., actual lengths) — copy from the built-in catalogue, JSON import / export.

## Calculation method

Summary below, details in [`docs/METHOD.md`](docs/METHOD.md).

- Freely suspended load: the hook is vertically above the COG; load frame X/Y/Z in mm, Z up.
- Vertical reactions: lever rule (2 points), exact equilibrium (3 points), rigid plate on equal-stiffness supports (≥ 4 points).
- Sling tension `T = R · L / h`; design force `F = T × DAF × SKL × f_COG × f_other`, compared with the WLL (× hitch factor / side-load factor).
- Crane: static load `W × WCF + rigging (+ hook block)` against the load chart (no DAF, the chart being certified for its use).

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
| Slingmax® G-Link | Unirope table; effective length **estimated** | 2" → 6" |

The *Source* column of the catalogue browser (Inventory tab) states for each item whether values are published, typical or estimated.

## Code structure

```
index.html            user interface (ES modules, no build step)
css/app.css           screen + print styles
js/state.js           project model, example, migrations
js/engine/            pure calculation code (testable under Node)
  rigging.js          geometry, equipment selection, forces (direct hook / spreader bar)
  statics.js          force distribution
  equilibrium.js      load tilt with given lengths
  factors.js          DAF, WCF, SKL
  crane.js            load chart, boom geometry
  checks.js           checks
  compute.js          orchestration, equipment list, lift category
js/catalog/           equipment data + selection rules
js/draw/              SVG generators (views, detail, storyboard, capacity curve)
js/ui/                user interface (tabs, PDF import, figures)
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
- Chain slings (EN 818) with hitch / angle factors.
- Full DNV-ST-N001 mode: safety factors on MBL, consequence factors, padeye calculation.
- Wind loads, vessel-to-vessel transfer, splash zone crossing (DNV-RP-N103).
- Crane library (reusable load charts), import of PDF load charts.
- Drag lift points with the mouse on the drawing, DXF export.

## Licence

Code: all rights reserved. pdf.js: Apache-2.0 (`vendor/pdfjs/LICENSE`). Green Pin®, Crosby®, Slingmax® are trademarks of their respective owners; the data used come from their public documentation and from the DS Levage catalogue.
