# Source Evidence Ledger

This ledger maps every material conclusion in `PRODUCT_TRUTH.md` and `canonical-obstacle.json` to the supplied sources. Page numbers are PDF page numbers, not the printed catalogue folio. Spreadsheet references use the only sheet, `OFFER`.

Evidence statuses:

- `confirmed_current`
- `confirmed_but_historical`
- `conflicting`
- `inferred`
- `missing_supplier_confirmation`

## Source A - Catalogue

Filename: `chinajumps 2026 9M(2026-04-03 16_56_49)(2026-05-19 21_12_10).pdf`

The PDF is image-only. All 20 pages were rendered and visually inspected. Text extraction returned no usable text. No page was unreadable, but small catalogue text and identifiers were checked visually rather than through an embedded text layer.

| ID | Page | Exact evidence | English interpretation | Status | Used for |
|---|---:|---|---|---|---|
| CAT-001 | file metadata | Creation/modification `2024-11-06`; filename contains `2026` and later parenthetical dates; no visible publication date | Source date is internally inconsistent | `conflicting` | Date assessment; catalogue facts not treated as current commercial confirmation |
| CAT-002 | 1 | `NINGBO REEDS MECHANICAL MFR. CO., LTD`, REEDS/CHINAJUMPS branding, `chinajumps.com` | Older company/brand identity | `confirmed_but_historical` | Supplier identity comparison |
| CAT-003 | 16 | `CHINAJUMPS SHOW JUMPS`; `strongest aluminum frame` and `safest materials HDPE`; feet described as angled and fillable with sand; broad personalization/custom-shape claims | Broad show-jump construction and customization claims, not item-specific specifications | `confirmed_but_historical` | Material/customization context only |
| CAT-004 | 16 | `Working flow: initial sketch -> 3D visual -> Digital printer -> CNC cutting -> Welding-Assembly -> Package` | Supplier shows a design/print/CNC/fabrication workflow | `confirmed_but_historical` | Fixed-panel production-path rationale |
| CAT-005 | 16 | Complete obstacle images labelled `SPJ-01`, `SPJ-02`, `SPJ-03`, `SPJ-04`, `SPJ-08`, `SPJ-06`, `SPJ-07`, `SPJ-05` | Eight SPJ designs shown as complete obstacle compositions | `confirmed_but_historical` | SPJ inventory and visual candidate scoring |
| CAT-006 | 16 | `SPJ-04` image shows tall rectangular printed side panels and horizontal poles | SPJ-04 has the clearest fixed rectangular artwork surface and comparatively simple geometry | Visual fact `confirmed_but_historical`; suitability `inferred` | Canonical recommendation |
| CAT-007 | 17 | `Show jumps parts`; `Alu Cavaletti CA-01`, jump number block, `Magic Block JB-01`, `Show jump stand SJP-01`, `Show jump stand SJP-02`, `Pole Trolley PT-01`, flags, caps, cups, water trays, tracks, poles | Catalogue explicitly separates loose parts/accessories from full designs | `confirmed_but_historical` | Complete-vs-component classification |
| CAT-008 | 18 | Complete front-view concepts labelled `JW-01` through `JW-36` | JW is a broad design family, but page supplies no bill of materials or dimensions | `confirmed_but_historical` | JW inventory |
| CAT-009 | 19 | Complete front-view concepts labelled `JWS-01` through `JWS-19` | JWS is a grand-prix design family; catalogue code is `JWS-14`, not `JWS-014` | `confirmed_but_historical` | JWS inventory and identifier conflict |
| CAT-010 | 19 | `JWS-11` image shows a conventional blue-and-white panel/pole design with broad wing faces | Suitable fallback with less bespoke geometry than sculptural designs | Visual fact `confirmed_but_historical`; suitability `inferred` | Fallback recommendation |
| CAT-011 | 20 | Factory imagery shows welding, panel/component storage, robotic/automated production equipment, and finished stall assemblies | Supplier presents manufacturing capability, but not SPJ-04 source geometry | `confirmed_but_historical` | Supplier-request rationale for CAD/drawings |

Catalogue pages 2-15 and 20 were also visually inspected. They cover company profile, arena construction/levelers, fencing, stalls, stable accessories, solarium, walker, treadmill, and racing gate; they do not add current product truth for the canonical show-jump choice.

## Source B - Older export quotation

Filename: `quotation  2026for export.pdf`

All seven PDF pages were rendered and visually inspected. Pages 1-5 contain the quotation; page 6 is blank; page 7 is otherwise blank except for one Chinese note.

| ID | Page | Exact evidence | English interpretation | Status | Used for |
|---|---:|---|---|---|---|
| OLD-001 | file metadata + 1 | PDF metadata creation/modification `2026-01-05`; visible `DATE: 2018 1107` | Visible commercial date is 2018-11-07; filename/metadata do not make prices current | `conflicting`; commercial facts `confirmed_but_historical` | Date assessment |
| OLD-002 | 1 | `NINGBO REEDS EQUESTRIAN EQUIPMENT QUOTATION`; `Ningbo Reeds Mechanical Manufacturing Co., Ltd.` | Older supplier legal-name evidence | `confirmed_but_historical` | Supplier identity comparison |
| OLD-003 | 1 | `PAYMENT CONDITIONS T/T 40% advance and balance should be paid before delivery.` | 40% deposit, balance before delivery | `confirmed_but_historical` | Payment-term conflict |
| OLD-004 | 1 | Column header `FOB Ningbo`, `USD/PC`, `MOQ pcs` | Prices are FOB Ningbo supplier prices in USD per piece with stated MOQs | `confirmed_but_historical` | Preventing retail/delivered-price misuse |
| OLD-005 | 1 | `SP-01`, 0.09x0.09x3.0 m, MOQ `50 PER COLOR`, USD 13.80; red/yellow/white/blue | Historical soft-pole/color evidence | `confirmed_but_historical` | Color/pole context only |
| OLD-006 | 1 | `JS-01` and `JS-02`, 1.7 m high, pole size 7x7 cm or on request, MOQ 10, USD 55; aluminum; natural or powder-coated yellow/blue/red/white | Loose stands, not complete obstacles | `confirmed_but_historical` | Component classification |
| OLD-007 | 1 | `JW-02` 170x45 cm, MOQ 4, USD 80; `JW-20` 170x50 cm, MOQ 4, USD 100; `JW-01` about 600x1700 mm, MOQ 4, USD 138 | Historical `JW-*` identifiers price wing/standard assemblies | `confirmed_but_historical` | JW identifier-semantic conflict |
| OLD-008 | 2 | `JW-24`, about 600x1700 mm, MOQ 4, USD 138; `JW-28/29`, butterfly on aluminum frame, about 600x1700 mm, MOQ 4, USD 138 | More historical JW wing/standard evidence | `confirmed_but_historical` | JW identifier-semantic conflict |
| OLD-009 | 2 | Unidentified row: `made in aluminum or wooden, includes 5 pole(or filler, Plank,Gate)`, about `800mm x 1800mm`, MOQ `4`, USD `1,080.00` | A historical complete package existed, but no product identifier ties it to SPJ-04 | Row `confirmed_but_historical`; mapping `missing_supplier_confirmation` | Historical complete-package evidence |
| OLD-010 | 2 | `HP-01 plank-01`, 3500x200 mm, about 10 kg, MOQ 2, USD 110 | Historical loose plank | `confirmed_but_historical` | Component evidence |
| OLD-011 | 2 | `GA-01 gate-01`, 3500x450 mm, about 18 kg, MOQ 2, USD 198; horse logo can be centered; special design available | Historical gate/logo evidence | `confirmed_but_historical` | Logo/gate context only |
| OLD-012 | 2 | `GA-02`, 3500x450 mm, about 10 kg, MOQ 2, USD 208; horse logo/special design available | Historical gate/logo evidence | `confirmed_but_historical` | Logo/gate context only |
| OLD-013 | 2 | `FL-02`, coated aluminum and 2 cm PVC, about 1500x60 mm, MOQ 2, USD 48; `FL-03`, coated aluminum, about 600x400 mm, MOQ 10, USD 38 | Historical fillers, not current SPJ-04 components | `confirmed_but_historical` | Component evidence |
| OLD-014 | 2 | `JB-02 cavaletti/show jump block B`, aluminum 50x50 mm pipe, 50x50 cm, MOQ 2, USD 46 | Loose cavaletti | `confirmed_but_historical` | Component classification |
| OLD-015 | 2 | `C2, keyhole track release adaptor`, nylon, one cup and one adaptor per set, MOQ 50, USD 5; claims FEI or DRF certification | Historical hardware row; certification claim not adopted or repeated as a product claim | `confirmed_but_historical` | Hardware question only |
| OLD-016 | 2 | `C1, jumps cup`, nylon standard size, 20 mm depth, 130-140 g, MOQ 100, USD 1.80 | Historical cup evidence | `confirmed_but_historical` | Hardware question only |
| OLD-017 | 3 | `KTA-01` ABS/nylon track, 50x13x500 mm, 4 mm thick, MOQ 100, USD 1.98; `KTM-01` galvanized steel track, 35x13x1500 mm, MOQ 100, USD 6 | Historical alternative track systems | `confirmed_but_historical` | Compatibility questions |
| OLD-018 | 3 | `AL-02 Alu pole 350`, diameter 10 cm, length 3.5 m, thickness 2.5 mm, MOQ 10, USD 60; two colors, more customized | Historical aluminum pole evidence | `confirmed_but_historical` | Pole/option context only |
| OLD-019 | 3 | `WP-01 Wood pole 300`, diameter 10 cm, length 3 m, MOQ 45, USD 48.50; `WP-02 wood pole 350`, diameter 10 cm, length 3.5 m, MOQ 45, USD 69; two colors, more customized | Historical wood-pole options | `confirmed_but_historical` | Pole/option context only |
| OLD-020 | 3 | `HF01 flag`, one red and one white flag plus two plastic bases, MOQ 30, USD 2.98; `EC-01 end cap`, nylon 95/100 mm, MOQ 100, USD 0.98 | Historical accessory evidence | `confirmed_but_historical` | Included-component questions |
| OLD-021 | 5 | `Time Of Delivery: 30 days after order confirmed.` | Historical 30-day lead time | `confirmed_but_historical` | Lead-time gap |
| OLD-022 | 5 | `Payment: T/T 40% as deposit, the balance shoud be paid before delivery.` | Historical payment term repeated | `confirmed_but_historical` | Payment conflict |
| OLD-023 | 5 | `price will be variable as the raw material price change within 3%` | Historical price-adjustment condition | `confirmed_but_historical` | Quote-validity questions |
| OLD-024 | 5 | `Not acceptable for client's appointed shipping agent!` | Historical shipping-agent restriction | `confirmed_but_historical` | Freight questions |
| OLD-025 | 5 | `If value lower than 2000USD, 5% extra cost added for package.` | Historical small-order packaging surcharge | `confirmed_but_historical` | Surcharge questions |
| OLD-026 | 6 | Blank page | No evidence | n/a | Readability/completeness report |
| OLD-027 | 7 | `买整套障碍可以免费送` | `When buying a complete obstacle set, [an unspecified item] can be included free.` The omitted subject prevents identifying the free item. | `missing_supplier_confirmation` | Not used as inclusion or price evidence |

No historical safety/federation claim has been adopted in the recommendation. The old quotation's certification wording is recorded only as source text and requires independent product-specific verification if ever relevant.

## Source C - 20260711 workbook

Filename: `宁波睿姿机械报价单 20260711 荷兰障碍架.xls`

Inspection notes:

- One sheet: `OFFER`, used range `A1:I67` after a temporary read-only conversion to XLSX.
- The original `.xls` was not modified.
- The sheet was rendered through LibreOffice to five PDF pages and visually inspected. Pages 4-5 are mostly blank because the print range includes stray content.
- Temporary XLSX XML contains no `mergeCells` collection. It contains 42 embedded images/drawings.
- Only one formula exists: broken `G51 = SUM(G10,#REF!)`.
- Currency formats in `F10:F50` use a yen/yuan glyph format; the header text explicitly states `人民币` (RMB).

| ID | Sheet/cell | Original evidence | English translation / interpretation | Status | Used for |
|---|---|---|---|---|---|
| CUR-001 | `OFFER!A1` | `宁波睿姿机械有限公司销售单` | `Ningbo Ruizi Machinery Co., Ltd. sales order/quotation` (inferred transliteration; official English legal name not supplied) | Original `confirmed_current`; English rendering `inferred` | Current supplier legal-name evidence |
| CUR-002 | `OFFER!B2` | `2026  0711` | 2026-07-11 visible date | `confirmed_current` | Current-source date |
| CUR-003 | `OFFER!C2` | `联系人： NIKO， 销售经理` plus telephone `+86 17757465686`, fax, and `www.chinajumps.com` | NIKO, sales manager and current contact details | `confirmed_current` | Supplier request routing |
| CUR-004 | `OFFER!B4` | blank customer name (`客户名称`) | The sheet does not confirm a customer or destination; `荷兰` appears only in filename | `confirmed_current` blank; destination `missing_supplier_confirmation` | Prevents assuming Netherlands delivery basis |
| CUR-005 | `OFFER!B5` | `50%定金，100% 付清发货前` | 50% deposit; 100% paid in full before shipment | `confirmed_current` | Current payment term |
| CUR-006 | `OFFER!B6` | `物流托运，由需方承担` | Logistics consignment; borne by buyer | `confirmed_current` | Freight basis; not delivered price |
| CUR-007 | `OFFER!B7` | blank (`发货日期`) | No current shipping/lead-time value | `missing_supplier_confirmation` | Current lead-time blocker |
| CUR-008 | `OFFER!A8:H9` | Headers `款号`, `照片`, `描述`, `尺寸`, `数量`, `单价`, `总 价`, `包装`; units `套`, `人民币`, `人民币（不含税）` | Model, photo, description, size, quantity, unit price, total price, packaging; set, RMB, RMB excluding tax | `confirmed_current`; exact unit-price VAT treatment `missing_supplier_confirmation` | Currency/unit/tax interpretation |
| CUR-009 | `OFFER!A10` | `SPJ-01` | First SPJ row anchors the shared SPJ description | `confirmed_current` | SPJ family description provenance |
| CUR-010 | `OFFER!C10` | `铝合金框架马术障碍架，尺寸 170×60厘米，配套 4 根障碍杆 / 装饰挡板（亦可搭配障碍门、装饰填充板），款式详见附图。` | Aluminum-alloy-frame equestrian obstacle, size 170x60 cm, supplied with four jump poles / decorative baffle panel; may also pair with gate or decorative filler; styles per image | `confirmed_current`; slash/count semantics and applicability to every SPJ row `missing_supplier_confirmation` | SPJ material, component, option, and dimension evidence |
| CUR-011 | `OFFER!A10:A17` | `SPJ-01`, `SPJ-02`, `SPJ-03`, `SPJ-04`, `SPJ-08`, `SPJ-06`, `SPJ-05`, `SPJ-07` | All eight SPJ identifiers are currently quoted | `confirmed_current` | SPJ inventory |
| CUR-012 | `OFFER!D10:F17` | Row dimensions, quantity 1, and prices: 19,800; 19,800; 19,800; 9,000; 19,800; 9,000; 19,800; 9,800 RMB | Exact current row evidence | `confirmed_current` | Candidate comparison |
| CUR-013 | `OFFER!A13,D13,E13,F13,H13` | `SPJ-04`; `180x80厘米`; `1`; `9000`; `气泡塑料膜` | SPJ-04, 180x80 cm, quantity one set, RMB 9,000 unit price, bubble plastic film | `confirmed_current` | Canonical identity, price, displayed dimension, packaging |
| CUR-014 | `OFFER!C10` vs `OFFER!D13` | `170×60厘米` vs `180x80厘米` | Two incompatible dimensions are attached to the SPJ group/SPJ-04 row | `conflicting` | Production-grade asset/factory-handoff blocker |
| CUR-015 | `OFFER!A18:A36` | `JW-03`, `JW-04`, `JW-05`, `JW-07`, `JW-12`, `JW-13`, `JW-16`, `JW-17`, `JW-18`, `JW-22`, `JW-23`, `JW-25`, `JW-27`, `JW-28`, `JW-29`, `JW-31`, `JW-33`, `JW-34`, `JW-35` | Nineteen JW rows quoted as sets | `confirmed_current` | JW inventory |
| CUR-016 | `OFFER!C18:C36` | blank | No JW component description | `missing_supplier_confirmation` | JW cannot be a confident canonical selection |
| CUR-017 | `OFFER!D18:H36` | Repeated `170×60厘米`, quantity 1, RMB 4,200, bubble plastic film | Current repeated JW row evidence | `confirmed_current` | JW commercial evidence; completeness still unresolved |
| CUR-018 | `OFFER!A37:A50` | `JWS-01`, `JWS-03`, `JWS-04`, `JWS-05`, `JWS-06`, `JWS-07`, `JWS-08`, `JWS-09`, `JWS-10`, `JWS-11`, `JWS-12`, `JWS-13`, `JWS-014`, `JWS-19` | Fourteen JWS rows currently quoted | `confirmed_current` | JWS inventory |
| CUR-019 | `OFFER!C37` | `铝合金框架马术障碍架，尺寸约 180×80 厘米，标配 4 根障碍杆、1 块装饰翼板（可替换为造型门或装饰填充板），款式详见附图。` | Aluminum-alloy-frame equestrian obstacle, about 180x80 cm, standard four poles and one decorative wing panel; replaceable by shaped gate or decorative filler | `confirmed_current`; exact application/counts `missing_supplier_confirmation` | JWS completeness and fallback evidence |
| CUR-020 | `OFFER!D37:H50` | Repeated `180×80 厘米`, quantity 1, RMB 9,000, bubble plastic film | Current repeated JWS row evidence | `confirmed_current` | JWS commercial evidence |
| CUR-021 | `OFFER!A49` vs catalogue PDF page 19 | `JWS-014` vs `JWS-14` | Identifier formatting differs | `conflicting` | Do not normalize identifier silently |
| CUR-022 | `OFFER!G10:G50` | blank line totals | Workbook supplies no usable row totals | `confirmed_current` | Total-price warning |
| CUR-023 | `OFFER!G51` | `=SUM(G10,#REF!)`, rendered `#N/A`/`Err:520` | Total formula is broken | `confirmed_current` | Do not use workbook total |
| CUR-024 | `OFFER!H67` | `111500` | Isolated unexplained value outside quote table; does not reconcile to listed rows | `confirmed_current` value; meaning `missing_supplier_confirmation` | Do not use workbook total |

## Prototype decision boundary

On 2026-07-13, SPJ-04 was intentionally locked as the best-guess object for a non-sellable prototype. This is a product decision, not new supplier evidence.

The prototype profile in `canonical-obstacle.json` interprets `180x80 cm` as each wing's approximate height x face width and assumes 3,500 mm poles, a 5,100 x 800 mm footprint, a bounded component list, fixed artwork slots, and limited visual options. Every one of those values is `inferred`. They may be used to benchmark the prototype experience, but they must not be used to update the confirmed supplier-truth fields, fabricate an obstacle, make safety or federation claims, quote a customer, calculate landed cost, or produce a factory order.

The RMB 9,000 value is the one current supplier fact used in the prototype price treatment. Its prototype label is inferred and explicitly identifies it as a supplier-cost example excluding tax, freight, and retail markup.

## Cross-source identifier reconciliation

| Identifier/family | Catalogue | Older quotation | 20260711 workbook | Reconciliation |
|---|---|---|---|---|
| SPJ-01..08 | Complete obstacle images on page 16 | Not listed | All eight listed as sets | Current workbook confirms current quoted identifiers; complete BOM still missing |
| JW-01..36 | Complete front-view design concepts on page 18 | Several `JW-*` codes price individual wing/standard assemblies | Nineteen `JW-*` rows quoted as sets with no description | `conflicting`: identifier may refer to wing/design style, not a complete BOM |
| JWS-01..19 | Complete concepts on page 19 | Not listed | Fourteen rows quoted as sets | Current rows are plausible complete sets; exact counts missing |
| JWS-14 | `JWS-14` | Not listed | `JWS-014` | `conflicting`; supplier must confirm canonical code |
| Unidentified complete set | Not identifiable | USD 1,080 FOB, MOQ 4 | No mapped row | Historical complete-package evidence only |

## Conclusion-to-evidence map

| Conclusion | Evidence IDs | Status |
|---|---|---|
| SPJ-04 is currently quoted as one set for RMB 9,000 | CUR-002, CUR-008, CUR-013 | `confirmed_current` |
| SPJ-04 is visually suitable for one fixed print panel | CAT-004, CAT-006 | `inferred` from historical visual/process evidence |
| SPJ-04 is the recommended canonical benchmark | CAT-006, CUR-010, CUR-013, CUR-014 | `inferred` |
| JWS-11 is the fallback | CAT-010, CUR-018, CUR-019, CUR-020 | `inferred` |
| Current price is not retail or delivered | CUR-006, CUR-008, CUR-013, OLD-004 | `confirmed_current` for buyer-paid freight; retail/delivered amount absent |
| Current workbook cannot supply a total | CUR-022, CUR-023, CUR-024 | `confirmed_current` |
| Production-grade geometry and factory handoff cannot start | CUR-014, CUR-016, CAT-006 | `missing_supplier_confirmation` |
| A non-sellable prototype benchmark may use the isolated best-guess profile | CAT-006, CUR-010, CUR-013, OLD-018, OLD-020 | `inferred` product decision |
| Current lead time/MOQ/weights/package dimensions are missing | CUR-007, CUR-008, CUR-013 | `missing_supplier_confirmation` |
| Historical 30-day/40%/FOB terms must not be applied silently | OLD-003, OLD-004, OLD-021, CUR-005, CUR-006 | `confirmed_but_historical` plus current differences |

## Readability and extraction uncertainty

- Catalogue: all 20 pages readable visually; no embedded text layer. Small identifiers were inspected at rendered resolution. No current dimensions or prices appear on the show-jump concept pages.
- Older quotation: pages 1-5 readable; page 6 blank; page 7 has only the incomplete Chinese note. Some English spelling is irregular but values and identifiers are legible.
- Workbook: one sheet fully inspected. Embedded product images are small but match catalogue identifiers. The current file's print range creates two mostly blank pages. The total formula and stray value are objectively unreliable.
- Dimension semantics remain ambiguous: neither source says whether `180x80 cm` means a wing, a pair, a frame, or the complete obstacle envelope.
