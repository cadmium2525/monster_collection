# AI Validation Baseline

Date: 2026-08-24  
Rules: Sim8.7 canon with the user-requested distance-system removal  
Mode: identical 40-card baseline deck on both sides; AI only differs  
Search budget: 12 ms per decision for search-based levels  
Seeds are reproducible through `tools/ai-lab.mjs`.

| Matchup | Games | Upper-level wins | First wins | Second wins | Avg. round | 40T rate |
|---|---:|---:|---:|---:|---:|---:|
| Bronze vs Silver (`phase4-bs3`) | 20 | Silver 55.0% | 8 | 12 | 14.90 | 5.0% |
| Silver vs Gold (`phase4-sg4`) | 30 | Gold 60.0% | 14 | 16 | 14.43 | 20.0% |
| Gold vs Legend (`phase4-gl`) | 30 | Legend 56.7% | 20 | 10 | 12.03 | 13.3% |
| Legend vs Champion (`phase4-lc`) | 20 | Champion 55.0% | 11 | 9 | 19.15 | 40.0% |

These are an initial calibration baseline, not a final balance guarantee. The sample is intentionally performed before tournament-rank deck generation is integrated. Distance-free balance had no prior simulator evidence in the supplied save point, so this table must be rerun after deck-generator and trait coverage changes.

## Reproduce

```sh
npm run sim -- --a bronze --b silver --games 20 --seed phase4-bs3 --time-ms 12
npm run sim -- --a silver --b gold --games 30 --seed phase4-sg4 --time-ms 12
npm run sim -- --a gold --b legend --games 30 --seed phase4-gl --time-ms 12
npm run sim -- --a legend --b champion --games 20 --seed phase4-lc --time-ms 12
```

AI evaluators receive the full contents of their own hand plus public opponent state. They do not inspect opponent hand identities, deck order, future draws, or unresolved RNG. Champion response search limits simulated replies to moves from visible opposing monsters and adds a probability-based hidden-opportunity risk instead of reading hidden cards.
