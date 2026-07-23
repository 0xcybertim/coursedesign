# SPJ-04 Prototype-v1 Asset Benchmark

Status: **PASS_FOR_NON_SELLABLE_PROTOTYPE**  
Configuration hash: `a16e5d4c7b04bafbdd463b230827351de071ada9700ec67413cf2446143830f7`  
Evidence status: `inferred`

## Outcome

The GLB, six deterministic fallback views, bill of materials, footprint, artwork mapping, and supplier-cost example were generated from the same pinned configuration. This proves the shared-object loop for the prototype without promoting any assumed value into supplier-confirmed production truth.

## Performance

| Check | Actual | Budget | Result |
|---|---:|---:|---|
| GLB size | 207,740 bytes | 3,145,728 bytes | **PASS** |
| Triangles | 2,676 | 150,000 | **PASS** |
| Maximum texture dimension | 2,048 px | 2,048 px | **PASS** |
| Mesh parts | 66 | n/a | Informational |
| Vertices | 3,032 | n/a | Informational |

## Parity checks

- Two printed wing assemblies: **PASS**
- Four poles with two cups and two end caps each: **PASS**
- Fixed artwork mapped to both wing panels: **PASS**
- Top-down 5,100 x 800 mm footprint and central anchor: **PASS**
- CNY 9,000 presented only as a supplier-cost example: **PASS**
- Original supplier-truth dimensions, footprint, and artwork fields remain unresolved/null: **PASS**

## Files

- `spj-04-prototype-v1.glb` — binary glTF 2.0 asset
- `prototype-config-v1.json` — pinned shared configuration
- `asset-manifest.json` — hashes, budgets, and validation results
- `bom.json` — prototype bill of materials and price display
- `footprint.json` — course footprint polygon and anchor
- `panel-artwork.png` — fixed prototype artwork texture
- `benchmark-board.png` — visual comparison board
- `renders/` — front, left/right angle, artwork, hardware, and top views

## Boundary

This package is suitable for interface prototyping and renderer-parity testing only. It is not suitable for fabrication, safety validation, supplier ordering, customer quoting, or checkout.
