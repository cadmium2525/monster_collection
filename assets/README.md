# Visual assets

`images/battle-arena.png` is an original raster background generated for this project on 2026-08-24. It intentionally contains no card text, numeric values, interface controls, or baked-in game state. All gameplay information is rendered from master data and battle state in HTML/CSS.

`images/monster-atlas.png` is an original 6-by-3 raster portrait atlas for the 18 base monsters in master-id order. CSS selects a cell at runtime; names, TP, stats, traits, effects, learned moves, and special-fusion state remain dynamic HTML and are never baked into the artwork.

`images/special-fusion-atlas-v1.jpg` is an original 6-by-6 atlas for `fusion-001` through `fusion-036` in master order. `specialFusionId` selects the cell at runtime; a form-name fallback keeps older in-memory units renderable.

`images/support-card-atlas-v1.jpg` is an original 5-by-5 atlas. Cells 1–5 map to `growthCards` master order, followed by `breeder-001` through `breeder-020`. All card names, TP, effects, and changing game state remain HTML.

`icons/app-icon.svg` is the source mark for the installable PWA. `scripts/generate-pwa-icons.ps1` reproducibly renders the 180, 192, 512, and maskable PNG variants used by iOS and the Web App Manifest.

Exact built-in ImageGen prompts and JPEG optimization notes are recorded in `CHANGELOG.md`.
