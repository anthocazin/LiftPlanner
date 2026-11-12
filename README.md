# LiftPlanner

Lift planning tool for **offshore and onshore lifts**: import the drawing of the part, click the lift points and the COG on it, build each leg from **standard rigging hardware** (Green Pin bow shackles 0.5–85 t, G80 master links, G80 chain, connecting links and safety hooks, round slings, flat webbing slings and steel wire rope slings up to 30 t), get the length of every leg and the minimum WLL, check everything, draw the rigging, print the lifting plan in your company template.

**No installation**: a single HTML file that also works **offline** (on board, on site).

> ⚠️ Planning aid only. Catalogue data are indicative and must be checked against the certificates of the equipment actually used. Every lift plan must be reviewed and approved by a competent person according to the applicable procedures.

---

## Getting started

| Use | How |
|---|---|
| **Offline (recommended)** | Download [`dist/LiftPlanner.html`](dist/LiftPlanner.html) and open it in Chrome or Edge (double-click). Everything is included, PDF reader too. |
| Local (development) | `python3 -m http.server 8080` in the repository root, then open <http://localhost:8080> |
| Online | GitHub Pages workflow provided (`.github/workflows/pages.yml`): enable *Settings → Pages → Source = GitHub Actions*. |

The current project and the inventory are saved automatically in the browser. **Save** produces a `.liftplan.json` file to archive with the lift plan (drawing views, logos and your own report drawings included). Three examples are in [`examples/`](examples/).

## What's new in v0.6

- **Views by a simple frame**: frame each view edge to edge — the frame gives the size of the part and its bottom-left corner is the origin (another reference point stays possible). A front view that is clearly the side view (same width as the depth of the top view) is exchanged automatically; *Swap front ↔ side* button.
- **Easier picking**: a coordinate given by one view is kept by the next one (dashed orange guide lines show where to click; no more "views disagree"), the view to click is highlighted, a click on a marker selects it. **Mirror X / Mirror Y / 4 symmetric points** from one point, **COG at the geometric centre** of the part. COG envelope removed.
- **Pad eye drawing**: shackle seen edge-on in the face view (its plane is perpendicular to the plate) and in its plane in the side view.
- **Rigging**: click a "+" to choose the item to add (drag and drop still works); **master link anywhere** in a leg; G-Link removed; the **sling length of every leg is recalculated with its own hardware** — standard lengths chosen so that the legs agree best (exact length shown when it differs).
- **Report**: the "Additional drawings" section only appears when drawings were added; **choose the drawings printed** (schematic, detail, XY, XZ, YZ, pad eye fit, crane chart).
- **No 3D any more**: plan and elevations only (Load, Rigging, Drawings, report).
- **Views**: for each plane, choose the image (the drawing or a file of its own, with its own scale) — 1. frame, 2. origin clicked (or the frame corner).
- **Rigging**: *Same WLL on every leg* button — the largest WLL of each item is set on every leg, the sling length stays calculated leg by leg.

## What's new in v0.5

- **Simpler flow**: every page starts with a one-line explanation and ends with *Next →*; the Storyboard page is gone (the crane radius of each step stays on the Project page).
- **Load**: draw the part with **simple shapes** (boxes, cylinders, voids) — uniform weight → **COG computed**; views pan with a drag, zoom with the wheel or the + / − / Fit buttons, full screen; view mismatch warnings only above max(40 mm, 1.5 % of the size). Lift point type: pad eye (drawing as per the type S datasheet, cheeks included), **anchor point / eye bolt G80**, or none.
- **Crane**: **My cranes** library (save / reuse / export / import) and a **PDF load chart reader** (frame the table, pick the radius and SWL columns, check, import — text PDFs only).
- **Rigging**: standard ranges only — Green Pin G-4163 bow shackles 0.5–85 t, G80 single / quad master links, chain and connecting links G80, safety hooks G80, G-Links, round / webbing / wire rope slings 0.5–30 t in lengths 1–20 m. One flat palette: **drop any item anywhere** in a leg; *Same assembly on every leg* applies the last edited leg to all; master link **"SWL not known"** (assumed OK, shape only in the report); hook shackle removed.
- **Checks**: click a warning → the page and the item to adjust are opened and highlighted; compatibility rewritten part by part (sling on shackle bow / pin, shackle on master link, links, hooks) with a plain explanation of why.
- **Drawings / report**: clearer front (XZ) and side (YZ) elevations with merged leg labels; report order = rigging schematic → rigging detail → plan XY, elevations XZ and YZ, 3D → **half page for your own drawings** → calculation summary.

## What's new in v0.4

- **Load set-up in 4 guided steps**: 1 drawing (PDF / image) → 2 scale (1:n read from the title block, or 2-click calibration) → 3 **top, front and side views** (frame + the same reference corner in each view) → 4 **click every lift point and the COG on each view**: LiftPlanner combines them into X / Y / Z (X from top + front, Y from top + side, Z from front + side) and flags views that disagree.
- **Real 3D view** (drag to rotate, wheel to zoom, Top / Front / Side presets) with the drawing views projected on their planes; used on the Load and Rigging pages, in Drawings and in the report.
- **Standard pad eyes type S** (1 → 150 t) in a drop-down that fills SWL, hole, plate, cheeks, radius, height and base length; *auto* picks the smallest for the leg force; datasheet rules T ≥ 75 % jaw and H ≤ 106 % pin checked.
- **Rigging arrangement schematic**: hook → head → **one leg per lift point** (always in step with the Load page), drag shackles / slings / chains / links onto the legs, click an item to change its size; same assembly on every leg or leg by leg.
- **Load share of every leg** (static share in t and %, tension, design force) and the **leg length needed for the target angle and the minimum length for the maximum angle**, in bearing-to-bearing length and as sling EWL / number of chain links.
- **Plain equipment names**: "Shackle 17t", "Roundsling 8t — 6 m", "Chain Ø13 G80 — 106 links", "Quad masterlink 17t".

## Features

**Project** — lifting plan identification (title, reference, revision, vessel / site, client, lift location), **report header lines and logos** (company left, client right, saved as your defaults in the browser), environment, **nature of the lift** (quay → vessel, vessel → quay, vessel ↔ vessel / platform, over live plant, splash zone), **step-by-step sequence** (step, details, responsible, crane radius, load height), design lift conditions, the **safety measures tick list**, further measures, communications and technical review of the template.

**Load** — the page is visual:
- **Import into LiftPlanner** wizard (PDF or image): choose the page and frame of the **XY plan** and **XZ elevation** views, calibrate in two clicks on the outline of the part (or on a known dimension, or with the drawing scale 1:n), set the origin; the overall dimensions are read from the outline.
- **Weight and COG read from the drawing text** (title block, notes, "COG" mark on the views) with *Use* buttons; COG basis obvious / estimated / drawing.
- Lift points and COG **placed and dragged on the drawing** (XY gives X / Y, XZ gives Z): lengths, angles and forces are recalculated live. White grid when there is no drawing. The load does not need to be a box.
- **Padeye characteristics** per point (SWL, main plate, cheek plates, hole Ø, outer radius, hole height, orientation) with the **shackle fit** (pin / hole, thickness / jaw, inside length) and a to-scale drawing; untick *padeye* for choked slings / trunnions and the padeye checks are skipped.

**Crane** — just the load chart: SWL versus radius, minimum and maximum radius (outside = fail), paste from Excel or read a PDF load chart, conservative or interpolated reading, critical lift threshold; *My cranes* library kept in the browser (exportable).

**Rigging**
- **Leg assembly builder**: drag standard items (Green Pin shackles, round slings straight / choked, flat webbing, steel wire rope slings, chain G80, connecting links G80, safety hooks G80, G-Links) anywhere in the leg; one assembly for all legs, override leg by leg. Hook side: master link, quad master link (sub-links) or directly on the hook; master link SWL can be marked *not known*.
- For each leg, from the COG: **required bearing-to-bearing length, connector lengths, sling EWL or chain length in whole links** (e.g. *shackle → connecting link → chain → connecting link → shackle* gives the number of links), **minimum WLL** of every part, utilisation.
- Design to a **target angle to the vertical (30°, up to 45°)** or a fixed hook height; same size on every leg (default) or per leg; sling length of each leg (nearest standard, rounded up, made to measure) or matched set.
- Object views with the drawing and the rigging overlaid (plan and elevations); spreader bar (top + bottom assemblies).

**Checks** — DAF **on / off** (DNV-ST-N001 per environment, or imposed), SKL, COG factor; every part of every leg; **angle to the vertical on all legs** (warning > 30°, fail > 45°, editable); **EN 13414-1 / EN 818-4 / EN 1492 mode factor K** (set WLL = K × leg WLL, also used to size slings and chains); padeyes, shackle side load (Green Pin curve), D/d of wire slings, connecting link / chain grade and size, master link congestion, load tilt with the selected lengths, slack legs, stability, crane at every step.

**Drawings** — rigging schematic, rigging on the load in plan XY and elevations XZ / YZ (on the imported drawing when there is one), rigging detail to scale (chains drawn link by link). SVG / PNG export.

**Report** — laid out like the company lifting plan template: header with logos, lifting plan block, load / crane details, description, safety measures, communications, **equipment table (Qty / Item / EWL / SWL / Configuration / Cert.)**, step-by-step with responsible, technical review, rigging schematic and detail, views XY / XZ / YZ (chosen), your own drawings if any, concise calculation summary (legs, padeye fit, issues only), checklift, sign-off → *Print / Save as PDF*.

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
| Master links G80, single (1–2 legs) and quad assemblies (3–4 legs) | supplied tables | 2.4 → 67 t |
| Chain grade 80 (EN 818-2) | supplied table / DS Levage p.20 | Ø6 → Ø32 mm |
| Connecting links G80 | supplied table; effective length **estimated** | Ø6 → Ø32 mm |
| Self-locking eye hooks G80 | supplied table; effective length **estimated** | Ø6 → Ø32 mm |
| Polyester round slings EN 1492-2 (7:1) | DS Levage p.64 | 0.5 → 30 t, 1 → 20 m |
| Polyester flat webbing slings EN 1492-1 | supplied table | 0.5 → 30 t, 1 → 20 m |
| Steel wire rope slings eye–eye | DS Levage p.18 / supplied table | → 30 t, 1 → 20 m |
| Pad eyes type S, weld-on anchor points, eye bolts G80 (lift points) | supplied datasheets | 0.3 → 150 t |

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
  compat.js           part-to-part compatibility (with the explanation)
  shape.js            simple shapes → volume and COG
  compute.js          orchestration, equipment list, lift category
js/catalog/           equipment data + selection rules
js/draw/              SVG generators (schematic, detail, capacity curve)
js/ui/                user interface: tabs, load views (loadview.js), load set-up, PDF tools, load chart reader
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
- Reading scanned (image) load charts.
- DXF export.

## Licence

Code: all rights reserved. pdf.js: Apache-2.0 (`vendor/pdfjs/LICENSE`). Green Pin®, Crosby®, Slingmax® are trademarks of their respective owners; the data used come from their public documentation and from the DS Levage catalogue.
