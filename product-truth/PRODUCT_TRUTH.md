# Phase 0 Product Truth - Canonical Show-Jumping Obstacle

Date of analysis: 2026-07-13  
Scope: evidence pass, canonical-family recommendation, and a separately marked best-guess prototype profile; no application implementation  
Evidence vocabulary: `confirmed_current`, `confirmed_but_historical`, `conflicting`, `inferred`, `missing_supplier_confirmation`

## Executive recommendation

Recommend **SPJ-04**, provisionally described here as the **SPJ-04 printed-panel vertical**, for the Phase 0/1 vertical slice.

- **Supplier-truth recommendation confidence:** **64/100**.
- **Prototype decision confidence:** **85/100**; SPJ-04 is now locked for the non-sellable prototype.
- **Prototype result:** sufficient to begin the 3D/2.5D benchmark using the explicit assumptions below.
- **Production result:** not sufficient for production-grade geometry, a factory handoff, customer pricing, or checkout.
- **Fallback:** **JWS-11**, a more conventional blue-and-white vertical with shaped wing panels and a central lower panel.

SPJ-04 wins because it is present in both the visual catalogue and the dated 20260711 quotation, has a current per-set supplier price, shows a fixed high-impact printed panel on each side, and uses relatively simple panel-and-pole geometry. It demonstrates meaningful color, pole-pattern, panel-artwork, and filler/gate choices without requiring the sculptural complexity of the dragon, chess, dolphin, sunflower, bottle, or butterfly designs.

This is not a confident factory-ready selection. The supplied evidence does not define which objects are included in an SPJ-04 set, what the quoted `180x80厘米` measures, the pole length, the overall footprint, panel thickness, weights, cup/track hardware, print area, packaging dimensions, current production lead time, or a formal option/compatibility matrix.

## Locked prototype profile

**Decision:** keep SPJ-04 as our best guess and move forward for prototyping. Everything in this section is `inferred`, deliberately replaceable, and isolated from the supplier-truth fields. It must not be used for fabrication, a safety claim, a supplier order, customer pricing, or checkout.

### Prototype geometry and footprint

| Field | Locked best guess |
|---|---:|
| Interpretation of `180x80 cm` | Approximate height x face width of each wing assembly |
| Wing assemblies | 2 |
| Each wing face | 800 mm wide x 1,800 mm high |
| Poles | 4 aluminum poles, each 3,500 mm long x 100 mm diameter |
| Overall envelope | 5,100 mm wide x 800 mm deep x 1,800 mm high |
| Course footprint | 5,100 mm x 800 mm |
| Anchor | Midpoint of the primary pole centerline |

The 5,100 mm width is the 3,500 mm pole plus two assumed 800 mm wing faces. The 3,500 x 100 mm pole is borrowed from historical loose-pole evidence and is not mapped by the supplier to SPJ-04.

### Prototype bill of materials

| Component | Quantity | Prototype rule |
|---|---:|---|
| Printed wing/standard assembly | 2 | Left and right |
| Aluminum jump pole | 4 | Fixed base count |
| Cup or release adapter | 8 | Two per pole |
| Keyhole track assembly | 2 | One per wing |
| Foot or ballast assembly | 2 | One per wing |
| Flag | 2 | One red/white pair represented visually |
| Pole end cap | 8 | Two per pole |
| Lower element | 0 or 1 | `none`, decorative panel, gate, or filler; mutually exclusive |

For the prototype, a decorative panel, gate, or filler occupies only the lower-element slot and never replaces one of the four poles. This is a product-design rule, not a confirmed factory rule.

### Prototype options and artwork

- Starting preset: **Club Classic**.
- Default frame: white; prototype choices: white, blue, red, or yellow.
- Default panel/accent: navy. Navy is a design token, not a supplier-confirmed finish.
- Pole pattern: two-color alternating segments.
- Artwork: none or one fixed upload slot applied to both wing panels; no arbitrary placement.
- Assumed printable area per wing: 700 x 1,500 mm, with 20 mm bleed and 50 mm safe margin.
- Prototype upload formats: PNG, JPEG, SVG, or PDF.

### Prototype price display

Use the current RMB 9,000 figure only with this exact meaning:

> **Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup**

It remains supplier-cost evidence, not a retail, delivered, landed, or tax-inclusive price.

## Approved-plan fit

The recommendation follows the approved product plan:

- one family, not the full catalogue;
- one shared configuration driving visual rendering, compatibility, bill of materials, example price, course footprint, and production specification;
- true 3D benchmarked for one obstacle with deterministic front, angle, detail, and top-down outputs;
- one fixed print-panel path rather than arbitrary artwork placement;
- supplier prices used only as supplier evidence, never as customer retail or delivered price.

## Source inventory and date assessment

| Source | What it contains | Date assessment | Use in this pass |
|---|---|---|---|
| `chinajumps 2026 9M(2026-04-03 16_56_49)(2026-05-19 21_12_10).pdf` | 20 image-only PDF pages; show-jump overview, parts, JW concepts, JWS concepts, and factory imagery are on PDF pages 16-20 | No visible publication date. PDF metadata creation/modification is 2024-11-06, while the filename says 2026. Treat catalogue statements as `confirmed_but_historical`, not confirmed current. | Visual identity, family identifiers, broad material/customization claims, and production-workflow evidence |
| `quotation  2026for export.pdf` | Seven PDF pages; priced loose parts, a non-identified complete obstacle line, commercial terms, two blank trailing pages, and a Chinese note on page 7 | Visible quotation date is `2018 1107`; PDF metadata is 2026-01-05. Visible date controls: commercial data is `confirmed_but_historical`. | Historical component prices, dimensions, minimum order quantities, materials, packaging, payment, and lead-time evidence |
| `宁波睿姿机械报价单 20260711 荷兰障碍架.xls` | One sheet, `OFFER`; SPJ, JW, and JWS set rows with product images and RMB prices | Visible date `2026  0711`; original file last-saved timestamp is 2026-07-11. This is the current source for the listed set rows. | Current identifiers, quoted quantity, per-set RMB price, packaging method, payment, and buyer-paid transport evidence |

### Does the 20260711 spreadsheet supersede the older quotation?

**Partly, and only for the exact rows it lists.** The spreadsheet is the newer commercial evidence for SPJ/JW/JWS sets, uses RMB rather than FOB USD, changes the payment term from 40% to 50% deposit, and quotes transport as buyer-paid logistics. It therefore supersedes the older quotation for the current set prices and terms shown in its own rows.

It does **not** safely supersede the old quotation for loose components, minimum order quantities, component weights, historical materials, lead time, or package dimensions because the new sheet omits those fields. It also does not establish a mapping from the older loose-component `JW-*` identifiers to the newer complete-set `JW-*` rows. The commercial bases differ:

- Older quotation: `FOB Ningbo`, USD per piece, visible date 2018-11-07.
- 20260711 sheet: RMB per `套` (set), transport borne by buyer, no FOB/delivered term, and an adjacent total header marked `人民币（不含税）` (RMB, excluding tax).

The 20260711 workbook's total is unusable: `G51` contains `=SUM(G10,#REF!)` and renders as an error; line totals `G10:G50` are blank; `H67` contains an isolated `111500` outside the quotation table and does not reconcile to the listed prices. No total from this workbook is used here.

## Inventory of plausible complete obstacles and families

### SPJ family

Catalogue PDF page 16 shows `SPJ-01`, `SPJ-02`, `SPJ-03`, `SPJ-04`, `SPJ-05`, `SPJ-06`, `SPJ-07`, and `SPJ-08` as complete photographed obstacles. The 20260711 `OFFER` sheet quotes all eight as sets in rows 10-17.

| Identifier | Current sheet row | Quoted dimension | Current unit price | Visual/product note |
|---|---:|---|---:|---|
| SPJ-01 | 10 | 200x100 cm | RMB 19,800/set | Sculptural red championship design; high modelling complexity |
| SPJ-02 | 11 | 200x100 cm | RMB 19,800/set | Red architectural panels; high visual impact |
| SPJ-03 | 12 | 200x100 cm | RMB 19,800/set | Clock/sponsor design; multiple bespoke elements |
| **SPJ-04** | **13** | **180x80 cm** | **RMB 9,000/set** | Rectangular printed wings and poles; strongest fixed-panel benchmark |
| SPJ-08 | 14 | 200x100 cm | RMB 19,800/set | Bottle/sponsor design; bespoke 3D shapes |
| SPJ-06 | 15 | 180x80 cm | RMB 9,000/set | Tree-silhouette wings; custom cut profiles |
| SPJ-05 | 16 | 180x80 cm | RMB 19,800/set | Dark branded competition obstacle; more complex detailing |
| SPJ-07 | 17 | 180x80 cm | RMB 9,800/set | Large brick-print panel; visually simple but atypically solid |

Status for identifier, row price, quantity, and displayed dimension: `confirmed_current`. Status for exact bill of materials and what the displayed dimension measures: `missing_supplier_confirmation`. The shared SPJ description in `C10` conflicts with several row dimensions, including SPJ-04.

### JW family

Catalogue PDF page 18 presents `JW-01` through `JW-36` as front-view complete designs. The 20260711 sheet quotes these 19 rows as sets: `JW-03`, `JW-04`, `JW-05`, `JW-07`, `JW-12`, `JW-13`, `JW-16`, `JW-17`, `JW-18`, `JW-22`, `JW-23`, `JW-25`, `JW-27`, `JW-28`, `JW-29`, `JW-31`, `JW-33`, `JW-34`, and `JW-35` (rows 18-36). Every quoted JW row shows `170x60厘米`, quantity `1`, RMB `4,200`, and bubble-plastic-film packaging.

The older quotation uses `JW-01`, `JW-02`, `JW-20`, `JW-24`, and `JW-28/29` for individual wing/standard assemblies with approximate dimensions and minimum order quantity 4. This makes the identifier semantics `conflicting`: a `JW-*` code may identify a design/wing model rather than a complete obstacle bill of materials. The current sheet contains no JW description or component count. Treat every JW row as a **plausible quoted set**, not a confirmed complete obstacle.

### JWS family

Catalogue PDF page 19 presents `JWS-01` through `JWS-19` as complete grand-prix-style designs. The current sheet quotes `JWS-01`, `JWS-03` through `JWS-13`, `JWS-014`, and `JWS-19` in rows 37-50. Each row shows `180x80厘米`, quantity `1`, RMB `9,000`, and bubble-plastic-film packaging.

The `JWS-014` sheet identifier conflicts with catalogue `JWS-14`; it is probably a formatting typo but must not be silently normalized. The shared JWS description says the aluminum-frame obstacle is approximately 180x80 cm and standard-equipped with four poles and one decorative wing panel, replaceable with a shaped gate or decorative filler panel. Catalogue images frequently show two wings and differing pole/filler counts, so the image cannot be used as a bill of materials.

### Historical unnamed complete package

Older quotation PDF page 2 includes one row with no product identifier: `made in aluminum or wooden, includes 5 pole(or filler, Plank,Gate)`, approximate `800mm x 1800mm`, minimum order quantity 4, and FOB Ningbo USD 1,080. It is plausible evidence that complete packages were sold, but it cannot be mapped to SPJ-04 or any other current identifier. Status: `confirmed_but_historical` for the row itself; `missing_supplier_confirmation` for any mapping.

### Loose components, not complete obstacles

The following are not treated as complete obstacles:

- Catalogue PDF page 17: `CA-01` aluminum cavaletti, jump-number blocks, `JB-01` magic blocks, `SJP-01` and `SJP-02` stands, pole trolley, flags, caps, cups, water trays, tracks, and poles.
- Older quotation pages 1-3: `JS-01`, `JS-02`, `JW-01`, `JW-02`, `JW-20`, `JW-24`, `JW-28/29`, `HP-01`, `GA-01`, `GA-02`, `FL-02`, `FL-03`, `JB-02`, `C1`, `C2`, `KTA-01`, `KTM-01`, `AL-02`, `WP-01`, `WP-02`, `HF01`, and `EC-01`.

These may become components or compatibility evidence after the supplier maps them to the canonical package.

## Candidate comparison

Scores are 1-5. For `Question burden`, 5 means few/low-severity questions and 1 means many/severe questions. Total is out of 50.

| Candidate | Data completeness | Visual impact | Configuration range | 3D feasibility | 2.5D feasibility | Fixed logo panel | Footprint clarity | Production-spec clarity | Commercial evidence | Question burden | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **SPJ-04** | 3 | 5 | 4 | 5 | 5 | 5 | 2 | 3 | 4 | 2 | **38** |
| **JWS-11** | 3 | 4 | 4 | 4 | 5 | 4 | 2 | 3 | 4 | 2 | **35** |
| SPJ-08 | 3 | 5 | 4 | 3 | 4 | 5 | 2 | 2 | 4 | 1 | 33 |
| SPJ-03 | 3 | 5 | 4 | 2 | 4 | 5 | 2 | 2 | 4 | 1 | 32 |
| JWS-14 / JWS-014 | 2 | 4 | 4 | 3 | 4 | 5 | 2 | 2 | 4 | 1 | 31 |
| JW-23 | 2 | 4 | 3 | 5 | 5 | 3 | 2 | 2 | 3 | 1 | 30 |
| JWS-12 | 3 | 5 | 4 | 2 | 4 | 3 | 2 | 2 | 4 | 1 | 30 |
| JWS-01 | 3 | 5 | 4 | 2 | 4 | 2 | 2 | 2 | 4 | 1 | 29 |

The scoring is a product-development judgement, so it is `inferred`. Raw evidence supporting each score remains in `SOURCE_EVIDENCE.md`.

## Recommended canonical obstacle: SPJ-04

### Candidate identity

- Supplier identifier: `SPJ-04` - `confirmed_current`.
- Working internal description: `SPJ-04 printed-panel vertical` - `inferred`, not a supplier name.
- Customer-facing preset name: use the already approved `Club Classic` only after the physical configuration is validated; do not claim SPJ-04 is already that preset.
- Supplier/current legal-name evidence: `宁波睿姿机械有限公司` - `confirmed_current` as the sheet title. `Ningbo Ruizi Machinery Co., Ltd.` is an `inferred` transliteration, not a supplier-confirmed official English legal name.
- Brand evidence: REEDS logo and `chinajumps.com` - `confirmed_current` visually in the sheet.
- Relationship to the older `Ningbo Reeds Mechanical Manufacturing Co., Ltd.` identity - `missing_supplier_confirmation`.

### Exact evidenced component breakdown

```text
SPJ-04 quoted set
|
+-- aluminum-alloy obstacle frame ................ count not stated
+-- jump poles ................................... 4 stated for SPJ group
+-- decorative baffle/panel ...................... wording and count ambiguous
|   +-- shaped gate alternative .................. optional/possible, not priced
|   `-- decorative filler alternative ............ optional/possible, not priced
+-- left/right printed wing assemblies ........... visually shown, BOM not confirmed
+-- cups / safety cups ........................... not stated
+-- keyhole tracks / adapters .................... not stated
+-- feet / ballast covers / hardware ............. not stated
+-- flags ........................................ not stated
`-- packaging .................................... bubble plastic film; no dimensions
```

The exact original group description is:

`铝合金框架马术障碍架，尺寸 170×60厘米，配套 4 根障碍杆 / 装饰挡板（亦可搭配障碍门、装饰填充板），款式详见附图。`

Translation: `Aluminum-alloy-frame equestrian obstacle, size 170x60 cm, supplied with 4 jump poles / decorative baffle panel (it may also be paired with an obstacle gate or decorative filler panel); see the attached images for styles.`

The slash and singular/plural counts are ambiguous. Do not infer that the printed catalogue image is the package bill of materials.

### Optional/configurable component matrix

| Option axis | Evidence | Status | Phase 0 treatment |
|---|---|---|---|
| Pole colors/pattern | Older quotation says two colors per pole are available; more colors require customization | `confirmed_but_historical`, not mapped to SPJ-04 | Ask for current allowed patterns and surcharges |
| Frame/panel color | Catalogue claims broad personalization and older parts list red/yellow/blue/white powder coating | `confirmed_but_historical` | No selectable palette until supplier provides named finish references |
| Decorative board | SPJ group description | `confirmed_current`, count/shape unclear | Candidate base option, pending exact identifier |
| Shaped gate | SPJ group description says it can be paired | `confirmed_current` as possibility; price/compatibility missing | Optional only after supplier matrix |
| Decorative filler | SPJ group description says it can be paired | `confirmed_current` as possibility; price/compatibility missing | Optional only after supplier matrix |
| Printed side-panel artwork/logo | SPJ-04 visibly uses full-height printed panels; catalogue says in-house design and print | `confirmed_but_historical` visual/process evidence | Use one fixed panel only after dimensions and print spec |
| Custom shape | Catalogue says bespoke shapes are offered | `confirmed_but_historical` | Exclude from first slice; it breaks deterministic asset scope |
| Material/finish | Aluminum alloy frame current; exact alloy, panel material, coating, gloss, and RAL references absent | mixed | One supplier-approved material set required |

### Known compatibility rules

No deterministic supplier-approved compatibility rule is confirmed.

The only current compatibility statement is that the obstacle may also be paired with a gate or decorative filler panel. It does not say whether these replace the four poles, replace the decorative board, require different cups/tracks, change the frame, or change price/packaging. Until answered:

1. Do not expose gate/filler as orderable options.
2. Treat pole count, filler count, and panel count as mutually unresolved.
3. Do not reuse historical `C1`, `C2`, `KTA-01`, or `KTM-01` hardware without supplier mapping.
4. Do not assume every 3.5 m historical pole fits SPJ-04.

### Dimensions, weights, materials, finishes, and colors

| Field | Value | Status | Source/caveat |
|---|---|---|---|
| SPJ-04 row dimension | 180x80 cm | `confirmed_current` | `OFFER!D13`; what object this measures is not stated |
| Shared SPJ description dimension | 170x60 cm | `conflicting` | `OFFER!C10`; conflicts with `D13` |
| Overall obstacle width/depth/height | unknown | `missing_supplier_confirmation` | No complete envelope supplied |
| Pole length | unknown for SPJ-04 | `missing_supplier_confirmation` | Older quotation has 3.0 m and 3.5 m loose poles, not linked |
| Frame material | aluminum alloy | `confirmed_current` | SPJ group description |
| Panel material/thickness | unknown | `missing_supplier_confirmation` | Broad catalogue mentions HDPE but not this item |
| Net/gross/component weights | unknown | `missing_supplier_confirmation` | No current weights |
| Finish/coating/RAL references | unknown | `missing_supplier_confirmation` | Broad/historical color claims are not a current palette |
| Allowed colors/patterns | unknown | `missing_supplier_confirmation` | No SPJ-04 matrix or surcharge schedule |

### Logo and print-area evidence

Catalogue PDF page 16 shows SPJ-04 with two tall rectangular printed side panels. The same page states the workflow `initial sketch -> 3D visual -> Digital printer -> CNC cutting -> Welding-Assembly -> Package`. This supports using SPJ-04 to test a fixed sponsor-panel workflow.

It does not supply:

- printable width/height;
- safe area or bleed;
- resolution;
- color profile;
- accepted PDF/SVG/AI/EPS/raster formats;
- UV mapping/orientation;
- whether the print is direct, applied film, or replaceable sheet;
- panel material, thickness, finish, edge clearance, or fastening method;
- print/logo surcharge.

All production artwork fields remain `missing_supplier_confirmation`.

### Supplier price evidence

| Item | Amount | Currency | Unit | Quantity shown | Basis | VAT | Status |
|---|---:|---|---|---:|---|---|---|
| SPJ-04 | 9,000 | RMB/CNY | per `套` (set) | 1 | Not stated as FOB or delivered; buyer bears logistics | Unit-price column says `人民币`; adjacent total column says `人民币（不含税）`, but totals are blank | `confirmed_current` price; tax application `missing_supplier_confirmation` |
| Unidentified complete obstacle | 1,080 | USD | per piece | MOQ 4 | FOB Ningbo | Not stated | `confirmed_but_historical`; not mapped to SPJ-04 |

RMB 9,000 is supplier evidence only. It is **not** a customer retail price, a delivered Netherlands price, a VAT-inclusive amount, or a landed cost. No margin, freight, import duty, value-added tax, delivery, or retail total has been created.

### Production and payment terms

| Term | Evidence | Status |
|---|---|---|
| Current payment | `50%定金，100% 付清发货前` - 50% deposit; 100% paid in full before shipment | `confirmed_current` for the sheet |
| Current transport/freight | `物流托运，由需方承担` - logistics consignment; borne by the buyer | `confirmed_current`; not delivered pricing |
| Current shipment/lead time | blank | `missing_supplier_confirmation` |
| Historical payment | T/T 40% deposit, balance before delivery | `confirmed_but_historical`; differs from current sheet |
| Historical lead time | 30 days after order confirmation | `confirmed_but_historical`; not assumed current |
| Historical price movement | price variable with raw-material change within 3% | `confirmed_but_historical` |
| Historical small-order packaging | 5% extra when value is below USD 2,000 | `confirmed_but_historical`; not applied to RMB quote |
| Historical shipping-agent restriction | buyer-appointed shipping agent not accepted | `confirmed_but_historical`; reconfirm |

## Required production-grade 3D source assets

Before final production-grade modelling or a factory handoff, obtain:

1. Supplier CAD or STEP assembly for SPJ-04, or dimensioned orthographic drawings if CAD is unavailable.
2. Separate geometry for both wings/standards, feet, ballast covers, tracks, cups/adapters, every pole, decorative panel/filler/gate, flags, and fasteners relevant to appearance or assembly.
3. Exact dimensions, pivots, pole-center positions, cup increments, and assembly clearances.
4. Material and finish schedule: alloy/grade, HDPE/PVC/wood where applicable, thickness, coating, gloss, RAL/color references, and print substrate.
5. Print-panel outline as vector/CAD with bleed, safe area, front/back orientation, fastener/edge keep-outs, and accepted artwork formats.
6. Supplier-approved neutral reference photos: front, rear, left, right, 3/4 angle, feet, tracks/cups, panel edge, pole ends, and packaging.
7. One supplier-confirmed allowed option matrix and an example factory production sheet.

The prototype benchmark may begin with the locked assumptions above. It should prove component separation, material slots, pivots, fixed-panel UV mapping, top-down footprint generation, deterministic render hashes, and the approved 3 MB/150,000-triangle/2,048-pixel texture targets from the engineering plan. CAD cleanup and dimensional accuracy remain deferred until supplier files arrive.

## Required deterministic 2.5D views and layers

Required views:

- `front`: exact order/proof view;
- `angle_left_30`: product-dominant commerce view;
- `angle_right_30`: opposite wing/hardware check;
- `detail_artwork`: fixed printed-panel crop;
- `detail_hardware`: cup/track/pole interface;
- `top`: course-planner footprint and anchor line;
- `rear`: production and panel-orientation check.

Required layer groups:

```text
background / floor shadow
left wing frame
left fixed print panel + approved artwork
right wing frame
right fixed print panel + approved artwork
tracks and cups/adapters
pole 1
pole 2
pole 3
pole 4
optional board OR gate OR filler
flags and caps (only if confirmed included)
validation overlays / dimensions (production view only)
```

Every layer must be generated from the same versioned selection and component identifiers as the 3D manifest and bill of materials.

## Supplier-truth footprint and prototype override

No numeric overall footprint can be supplier-confirmed. `180x80 cm` may describe one wing, not the full obstacle. The 3.0 m and 3.5 m pole lengths in the old quotation cannot be mapped to SPJ-04.

For the prototype only, use the locked 5,100 x 800 mm footprint and the midpoint of the primary pole centerline as the anchor. The supplier-truth footprint remains `null` in its original JSON field; the numeric override lives only under `prototype_profile.geometry_mm`.

Use this parameterized footprint contract until the supplier supplies dimensions:

```text
                     obstacle approach direction
                                ^
                                |
        <--------- overall_width_mm (unknown) --------->
        +-----------------------------------------------+
        | [left wing]---- pole centerline ----[right]  |  ^
        |                                               |  |
        +-----------------------------------------------+  |
                overall_depth_mm (unknown) ---------------+

anchor: midpoint of the primary pole centerline
rotation: around anchor
width: full outer foot-to-foot envelope, not pole length alone
depth: maximum forward/backward foot or panel envelope
```

Proposed production fields for this footprint:

- `overall_width_mm`
- `overall_depth_mm`
- `pole_centerline_offset_mm`
- `left_wing_bbox_mm`
- `right_wing_bbox_mm`
- `foot_projection_mm`
- `ballast_state`
- `anchor_x_mm`, `anchor_y_mm`
- `allowed_rotation_deg`

All supplier-truth numeric values remain `null` in the original `footprint` object in `canonical-obstacle.json`.

## Proposed production-spec fields

```text
identity
  supplier legal name, brand, product family, product ID, rule revision

configuration
  obstacle type, overall dimensions, wing IDs, pole IDs/count/lengths,
  cup/track IDs, filler/gate/panel ID, flag/cap/hardware IDs

finish
  material per component, coating/finish, named color, RAL/reference,
  pole pattern with measured segment lengths

artwork
  panel ID, artwork revision/hash, orientation, dimensions, bleed,
  safe area, color profile, proof image, approval timestamp/status

commercial evidence
  supplier quote ID/date, currency, unit, supplier unit price,
  tax basis, freight basis, minimum order quantity, validity

production and logistics
  quantity, lead time, net/gross weight, package count,
  package dimensions/weight, assembly/packing notes

spatial and render
  footprint envelope, anchor, component transforms, asset revision,
  front/angle/top render hashes

approval
  supplier confirmation, internal checker, customer proof reference,
  immutable revision and generated timestamp
```

## Shared configuration-to-output flow

```text
supplier-confirmed definition + versioned assets
                       |
                       v
              customer selections
                       |
                       v
           compatibility validation
               /       |        \
              v        v         v
       render manifest BOM   example price state
          /      \       \        /
         v        v       v      v
       true 3D  2.5D   course footprint
          \        \      /      /
           +--------v----v------+
                    |
                    v
          production specification

No output may carry a newer or different configuration revision than another.
```

## Conflicts and unresolved source issues

1. `OFFER!C10` says the SPJ obstacle size is 170x60 cm; SPJ-04 `OFFER!D13` says 180x80 cm.
2. Catalogue SPJ-04 visually has two printed wings; the current description does not confirm two wing assemblies or a panel count.
3. The shared description says four poles and a decorative board using an ambiguous slash, while optional gate/filler substitution is not defined.
4. Current `JW-*` rows look like complete sets, but historical `JW-*` rows price individual wing/standard assemblies.
5. Current sheet `JWS-014` conflicts with catalogue `JWS-14`.
6. Current payment is 50% deposit; the historical quotation says 40%.
7. Current price is RMB per set and buyer-paid logistics; older price evidence is FOB Ningbo USD per piece.
8. Current unit-price tax treatment is not explicit; only the adjacent total header says RMB excluding tax, and the total column is blank.
9. Current workbook total formula is broken and an unexplained `111500` appears at `H67`.
10. Catalogue filename implies 2026, but PDF metadata is 2024 and no visible catalogue date exists.
11. Older quotation filename/metadata implies 2026, but the visible quotation date is 2018-11-07.
12. Older PDF page 7 says `买整套障碍可以免费送` - `When buying a complete obstacle set, [an unspecified item] can be included free`; the omitted subject makes it unusable as a package inclusion.

## Confirmed facts versus assumptions

### Confirmed current

- SPJ-04 is listed in the 20260711 sheet at row 13.
- Quoted quantity is 1 set.
- Unit price is RMB 9,000 per set.
- Displayed row dimension is 180x80 cm.
- Packaging method says bubble plastic film.
- The SPJ group description states aluminum-alloy frame and four poles, with decorative board/gate/filler wording.
- Payment is 50% deposit and full payment before shipment.
- Logistics cost is borne by the buyer.

### Confirmed but historical

- Catalogue visual and broad personalization/manufacturing workflow.
- Older component materials, dimensions, minimum order quantities, FOB USD prices, 30-day lead time, and 40% deposit.

### Inferred

- SPJ-04 is the best Phase 0 benchmark.
- The catalogue image makes SPJ-04 suitable for one fixed sponsor-artwork panel path.
- Simple rectangular panels make it more feasible than sculptural alternatives.
- The locked prototype geometry, component counts, compatibility rules, artwork area, and visual option set are best-guess design assumptions.
- Those prototype assumptions may be replaced without changing the underlying supplier evidence.

### Missing supplier confirmation

- Exact complete package and component identifiers/counts.
- Meaning of both dimension statements and overall footprint.
- Current component weights, package dimensions/weights, minimum order quantity, lead time, and price validity.
- Current VAT treatment, trade term, and whether RMB 9,000 is ex-factory or another basis.
- Exact colors, finishes, patterns, artwork specs, surcharges, and compatibility restrictions.
- CAD/STEP/dimensioned drawings and accepted production-sheet format.

## Phase 0 pass/fail assessment

| Gate | Result | Reason |
|---|---|---|
| Provisional canonical-family selection | **PASS_WITH_CONDITIONS** | SPJ-04 is the strongest bounded candidate |
| Lock SPJ-04 for prototype | **PASS** | The documented best guess was accepted for prototyping |
| Start prototype 3D/2.5D benchmark | **PASS_WITH_INFERRED_GEOMETRY** | The separate prototype profile supplies a bounded geometry, bill of materials, options, artwork slot, and footprint |
| Source reconciliation | **PASS_WITH_CONCERNS** | Sources are inventoried and conflicts are explicit, but identifiers still need supplier mapping |
| Complete product truth | **FAIL** | Bill of materials, compatibility, dimensions, weights, packaging, lead time, artwork, and footprint are incomplete |
| Start production-grade 3D/2.5D assets or factory handoff | **FAIL** | No CAD/drawings or confirmed geometry/print area |
| Implement customer pricing or checkout | **FAIL** | Supplier price is not retail/delivered; VAT, freight, duty, margin, and commercial policies are unresolved |
| Full Phase 0 exit | **FAIL** | Supplier, commercial, production-spec, artwork, and asset contracts are not signed off |

## Exact blockers before production-grade asset or factory handoff

1. Supplier confirms SPJ-04 is the canonical complete package and lists every included component with identifier and quantity.
2. Supplier resolves 170x60 cm versus 180x80 cm and supplies overall width/depth/height, wing/foot dimensions, pole length/diameter, and all interface positions.
3. Supplier provides net/gross/component weights and package count/dimensions/weight.
4. Supplier provides the current option/compatibility/surcharge matrix for colors, pole patterns, panel, gate, filler, and fixed artwork.
5. Supplier provides print outline, safe area, bleed, resolution, color profile, accepted formats, and panel material/finish.
6. Supplier confirms current price currency/basis, value-added-tax treatment, minimum order quantity, quote validity, lead time, payment, freight/trade term, and transport-agent rule.
7. Supplier provides CAD/STEP or dimensioned orthographic drawings and a production sheet it will accept without interpretation.
8. The returned production data is checked against the real SPJ-04 assembly before any customer-visible option or production-grade asset is frozen.

These items no longer block the non-sellable prototype benchmark. They still block production, ordering, customer-visible commercial promises, and Phase 0 exit.
