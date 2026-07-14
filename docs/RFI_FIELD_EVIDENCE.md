# RFI field evidence for the first carousel slide

Updated: 2026-07-13.

The first RFI carousel slide compares the exact situations shown in the visual: UTG/EP at a 7-max table with six players behind, and BTN with two blinds behind.

## Measured FF outcomes

| Spot | Players in sample | RFI opportunities | Opens | Everyone folded | Faced a 3-bet |
| --- | ---: | ---: | ---: | ---: | ---: |
| EP, six behind | 1,117 | 2,461,986 | 512,710 | 68,456 (13.35%) | 156,835 (30.59%) |
| BTN, two behind | 1,113 | 634,461 | 395,286 | 91,647 (23.18%) | 88,452 (22.38%) |

The UI rounds these values to one decimal place: `13.4% / 30.6%` for EP and `23.2% / 22.4%` for BTN.

Source and boundaries:

- ClickHouse table: `analytics.int_tracker_hand_joined`.
- FunFarm MCP ClickHouse job: `mcp_ch_job_e430098b2fb14271b7d27c6cfdce6627`.
- Cohort: active real FF players in `training_league = 3`, using the user-id snapshot from the July 12 RFI research.
- Hand window: 2026-01-01 through 2026-07-11; the latest observed hand in this result is 2026-07-07.
- Filters: unopened pot, 7-max, stack at least 15 BB, known hole cards, valid BB amount, `position IN (0, 4)` where `0 = BTN` and `4 = UTG/EP` at 7-max.
- “Everyone folded” is the operational proxy `is_rfi = 1 AND is_preflop_face_3bet != 1 AND is_saw_flop != 1`.
- “Faced a 3-bet” is `is_rfi = 1 AND is_preflop_face_3bet = 1`.

Adjacent source artifacts in the research working copy:

- `outputs/third-league-rfi-2026-07-12/queries.sql`
- `outputs/third-league-rfi-2026-07-12/ep_handclass_by_user_stack.csv`
- `outputs/third-league-rfi-mp-btn-2026-07-12/mp_btn_handclass_clustered.csv`

The two rows contain 907,996 opens in total, displayed as “908 thousand opens.”

## Probability illustration

The slide separately uses a simple teaching assumption: each remaining opponent has a strong hand 5% of the time.

```text
P(at least one strong hand) = 1 - (1 - p)^n

six players: 1 - 0.95^6 = 26.49%
two players: 1 - 0.95^2 = 9.75%
```

This is an illustration of the “more players, more chances someone wakes up strong” mechanism. It is not a fitted prediction of the measured fold-through or 3-bet rates: the 5% threshold is an explicit teaching assumption, opponents’ cards are not fully independent, and real strategies differ by position.
