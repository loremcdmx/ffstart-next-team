# BB direct resteal pushes by FF rank-at-hand

This frozen dataset powers the novice-versus-league comparison in the Resteal lesson.

## Files

- `resteal-rank-hand-cube.csv` — lossless ClickHouse aggregate at cohort × opener × size × depth × hand-class grain.
- `resteal-rank-data.js` — compact browser payload exported as `window.PokerRestealRankData`.
- `resteal-rank-diagnostics.json` — deterministic coverage, totals, sparsity and association QA.
- `../tools/resteal-rank-cube.sql` — BigQuery rank bridge, ClickHouse cube and same-window ABI queries.
- `../tools/build-resteal-rank-data.mjs` — deterministic CSV-to-browser build.
- `../tools/test-resteal-rank-data.mjs` — fail-fast data and query-contract validation.

## Frozen contract

- Window: `[2026-01-01 00:00:00, 2026-07-14 00:00:00)` UTC.
- Rank is joined at the exact hand timestamp from `mcp__check_rank_history` using half-open, non-overlapping intervals.
- Cohorts: novice 16–18, league 3 ranks 11–15, league 2 ranks 6–10, league 1 ranks 1–5.
- Hero is BB only, can 3-bet, faces exactly one CO/BTN raiser and no limpers at a 3–9 handed table.
- Effective stack is 25–40 BB; frontend bands are 25–30, 30–35, 35–40 and a count-pooled 25–40 view.
- Open sizes are 2.0, 2.5 and 3.0 BB with ±0.05 BB tolerance.
- `jam` is only the direct action `preflop_action='R' AND is_preflop_allin=1`.
- Any other `R*` line, including `RC/RR` that later reached all-in, is `small3bet` rather than a direct jam.
- Unknown cards remain in chart-level opportunities and action totals but are not painted into a 13×13 cell.
- Percentages and pooled views must be calculated by summing integer counts, never by averaging cell percentages.

## ABI and association

Same-window ABI uses `SUM(load_usd) / SUM(1 + multientries)` with real players, `pack_id IS NOT NULL` and self-play excluded. The browser payload stores the refreshed ABI inputs and values.

The predeclared association slice is BTN versus a 2.0 BB open. Direct-jam rates are standardized to one common effective-stack distribution: the pooled opportunity weights of all four cohorts across the three depth bands. `correlation.abiVsStandardizedJamPearson` is an ecological four-point Pearson correlation. It is descriptive and must not be presented as evidence that resteal training caused ABI growth.

## Frozen QA and default slice

- 11,406 lossless CSV rows, no duplicate keys and no unknown action bucket.
- 1,155,121 opportunities reconcile exactly to 368,413 folds, 630,226 calls, 85,209 non-all-in 3-bets and 71,273 direct jams.
- 1,022,356 opportunities have canonical hole cards; 132,765 missing-card decisions remain only in chart totals (88.506% known-card coverage).
- BTN versus 2.0 BB, depth-standardized direct-jam rates: novice 1.769% (N=4,129), league 3 4.951% (N=251,737), league 2 9.201% (N=204,093), league 1 10.273% (N=77,388).
- Same-slice ABI-versus-jam Pearson `r=0.8565`, four aggregate cohorts.

The novice default pooled chart is usable as a whole but remains thin at cell level: 88 of 169 cells have N<20 and one has N<5. Its individual depth charts have 162, 166 and 169 cells with N<20 respectively. Other novice open sizes are substantially sparser, so the UI must expose N and visually suppress cells below the thresholds in `meta.sampleThresholds`.

## Rebuild and validation

```sh
node assets/poker-resteal-lesson/tools/build-resteal-rank-data.mjs
node assets/poker-resteal-lesson/tools/test-resteal-rank-data.mjs
```

Use `build-resteal-rank-data.mjs --check` to verify that checked-in generated files exactly match the lossless CSV without writing them.
