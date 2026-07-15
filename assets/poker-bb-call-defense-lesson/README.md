# BB call defense lesson alpha

Standalone lesson prototype based on physical pages 10 and 11 of:

`/Users/loremcdmx/Downloads/Telegram Desktop/часть методички для аишки (1) (2).pdf`

Trainer voice and teaching priorities come from:

`/Users/loremcdmx/Downloads/Telegram Desktop/покерный урок 2.txt`

## Evidence boundaries

- Pot odds, fold/continue aggregates, opener widths, and the 38.5% to 27.8% equity-realization example come directly from the supplied methodology pages.
- The source matrices define fold, cold-call, and 3-bet actions, but not an exact 3-bet size; the lesson therefore labels that option only as `3-бет`.
- The 15 range PNG files are measured crops of the rendered source page. `range-data.js` is a reproducible color transcription of those crops into 169 clickable action cells per scenario; the PNGs remain the provenance evidence.
- These ranges are educational source material, not a measured player-EV or bb/100 analysis.
- Practice spots use only clear 100% cells from the source matrices. No EV number is invented for an individual hand.
- Per-hand showdown equity is a marked model: the existing reproducible 169×169 all-in equity matrix is averaged against a blocker-aware top-X% opener range, where X is the lesson's opener width. It is not postflop realization and not a solver result for the source matrix.
- The clickable readout shows the minimum share of raw equity that a hypothetical call must realize (`pot odds / modelled raw equity`). Actual per-hand realization is unavailable in the PDF; the source's 38.5% → 27.8% example remains explicitly range-level only.
- A separate empirical readout comes from a frozen, aggregated FF tracker export for BB calls at 25–40 BB effective (`data/ff-bb-call-realization.json`). It is descriptive data about hands that were actually called, not a solver recommendation or a causal estimate.
- The empirical headline uses all FF 3–9 max tables to reach a publishable per-hand sample and says so in the UI. Exact 7-max observations are stored as a separate sparse diagnostic and are never blended into that number.
- Empirical EV is measured relative to folding: the pass baseline is `-(1 BB + hero ante)`. The observed equity share is a ratio of hand-weighted sums, then the page divides it by the same local raw-equity model used in the theoretical block. The frozen ClickHouse query is `tools/q_ff_realization.sql`; the CSV-to-JSON builder is `tools/build-ff-realization.mjs`.
- The memory check grades a simplified four-state chart for all 169 cells: pure raise, call, fold, or the 50/50 raise/call mix. The 50/50 call/fold boundary is treated as fold, and an unpainted cell is also fold. The review view keeps the newer difference map, filters, and per-hand correction panel.
- The 21-spot queue was checked cell-by-cell against all referenced source crops; causal coaching cues remain transcript-based interpretation rather than claims extracted from the matrices.
- Claims such as missed defenses costing tenths of a blind are presented only as a trainer estimate from the transcript, not as measured storage-backed EV.
- Noisy ASR wording is edited for clarity; ambiguous fragments are not promoted into rules.

## Deliberate alpha scope

- Standalone route only: `bb-call-defense-lesson.html`.
- No hub registration, progress persistence, trainer telemetry, or production deployment.
- Practice uses the shared trainer table snapshot with a deterministic lesson queue; it does not add a second special case to the uncommitted resteal simulator pack.
- The lesson keeps its own frozen copy of the neighboring lesson shell styles, so this standalone route does not depend on untracked resteal files at runtime.
