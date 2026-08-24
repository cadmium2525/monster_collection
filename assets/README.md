# Visual assets

`images/battle-arena.png` is an original raster background generated for this project on 2026-08-24. It intentionally contains no card text, numeric values, interface controls, or baked-in game state. All gameplay information is rendered from master data and battle state in HTML/CSS.

`images/monster-atlas.png` is an original 6-by-3 raster portrait atlas for the 18 base monsters in master-id order. CSS selects a cell at runtime; names, TP, stats, traits, effects, learned moves, and special-fusion state remain dynamic HTML and are never baked into the artwork.

`icons/app-icon.svg` is the source mark for the installable PWA. `scripts/generate-pwa-icons.ps1` reproducibly renders the 180, 192, 512, and maskable PNG variants used by iOS and the Web App Manifest.

Generation prompt is recorded in `CHANGELOG.md` and the delivery notes.
