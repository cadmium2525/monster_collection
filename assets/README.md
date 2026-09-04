# Visual assets

`images/battle-arena.webp` is an original raster background generated for this project on 2026-08-24. It intentionally contains no card text, numeric values, interface controls, or baked-in game state. All gameplay information is rendered from master data and battle state in HTML/CSS.

`images/monster-atlas.webp` is an original 6-by-3 raster portrait atlas for the 18 base monsters in master-id order. CSS selects a cell at runtime; names, TP, stats, traits, effects, learned moves, and special-fusion state remain dynamic HTML and are never baked into the artwork.

`images/special-fusion-atlas-v1.webp` is the original source sheet for `fusion-001` through `fusion-036` in master order. Its six row heights are not uniform (`234 / 235 / 230 / 205 / 178 / 172px`), so it is retained for provenance but is no longer sampled with CSS atlas coordinates.

`images/special-fusions/fusion-001.webp` through `fusion-048.webp` are standalone runtime illustrations. The first 36 are cropped at the legacy source sheet's measured row boundaries (`fusion-014` uses the dedicated full-bleed Blue Drill replacement); `fusion-037` through `fusion-048` are native vertical illustrations for the second-generation monsters. Every form therefore loads one image without adjacent-cell bleed. Matching premium alternates are stored as `images/showcase-fusions/showcase-fusion-001.webp` through `showcase-fusion-048.webp`.

The 12 second-generation forms use built-in ImageGen in two passes: a regular fusion constrained by the main and material references, followed by a showcase edit constrained to the completed regular design. Their exact design briefs and generated-source mapping are recorded in `images/special-fusions/GENERATION_037_048.md`.

`images/support-card-atlas-v1.webp` is an original 5-by-5 atlas. Cells 1–5 map to `growthCards` master order, followed by `breeder-001` through `breeder-020`. All card names, TP, effects, and changing game state remain HTML.

`images/breeders/breeder-021.webp` through `breeder-040.webp` are original, individually generated square illustrations for the 2026-08-26 breeder expansion. They contain illustration only; names, TP, faction/category, and effect text remain dynamic HTML. Project copies are optimized to 768×768 lossy WebP quality 90 for GitHub Pages and PWA caching. The original generated PNGs remain in the Codex generated-image archive.

`images/booster/monster-019.webp` through `monster-024.webp` are the six booster-exclusive monster portraits. `images/showcase/showcase-{inorganic,creation,spirit,demon,beast,monster}-01.webp` are premium alternate illustrations of the same six characters. They are vertical, full-figure, textless art with safe headroom; all names, costs, stats, traits, rarity and Foil sheen are dynamic UI. The project copies are RGB WebP quality 90, maximum 1024×1366. These growing collections are copied into the Pages artifact but deliberately omitted from install-time precache and cached when first viewed.

Generation mode was the built-in ImageGen raster workflow. Base prompts established: a clockwork colossus with cyan clock core; an ivory-and-gold alchemical automaton; a crystalline deer spirit; a winged eclipse knight; a silver-blue saber wolf; and an obsidian crystal devourer. Showcase edits used each matching base image as reference and placed the same character in, respectively, an astral clock dais, celestial transmutation laboratory, aurora-eclipse lake, obsidian eclipse throne, moonlit pack-sovereign summit, and molten gemstone banquet hall. Every prompt required vertical 3:4 composition, generous safe margins, and no text, frame, logo, UI or watermark.

`icons/app-icon-source.png` is the generated high-resolution source for the installable PWA's mechanical-monster crest. `scripts/generate-pwa-icons.ps1` reproducibly renders the 180, 192, 512, and maskable PNG variants used by iOS and the Web App Manifest. The source PNG stays in Git for regeneration but is excluded from the deployed Pages artifact.

`ui/card-badges/{life,cost,atk,def}.webp` are transparent status badges supplied by the project owner. The original green heart, cyan cost coin, blue sword, and red shield artwork is preserved; only the uniform gray JPEG background was removed and the assets were normalized to transparent 512px canvases. These four files use lossless WebP so their alpha edges and visible pixels are retained.

`ui/currency/diamond-premium.webp` is the shared free-currency icon generated for v1.15.8 with the built-in ImageGen workflow. It is a centered cyan/sapphire faceted gemstone with a restrained magical glint and genuine transparency, designed to remain readable at 21–36px. The project copy is 384×384 WebP quality 90 with alpha quality 100; numbers and prices remain dynamic HTML.

All runtime game artwork is delivered as WebP as of v1.12.0. Lossy illustrations use high-quality settings (quality 90–92, effort 6, alpha quality 100); status badges use lossless WebP. PNG is retained for the PWA installation icons required for broad OS/iOS compatibility and for their deploy-excluded generated source.

Exact built-in ImageGen prompts and JPEG optimization notes are recorded in `CHANGELOG.md`.
