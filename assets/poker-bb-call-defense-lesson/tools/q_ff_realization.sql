/*
  FF BB-call realization export for the lesson UI.

  Frozen window: [2026-01-01 00:00:00, 2026-07-14 00:00:00).
  Primary and diagnostic cohorts stay separate:
    - all_ff_3_9max: the sample large enough for per-hand display;
    - exact_7max: a sparse diagnostic matching the illustrated table.

  Incremental versions and duplicate ingest ids are collapsed to one latest row
  per (network, tourney_id, hand_id) with deterministic argMax ordering.

  chips_ev_bb is the all-in-adjusted net result of the complete hand. The BB
  fold baseline is -(1 BB + hero ante), therefore:

    ev_vs_fold_bb = chips_ev_bb + 1 + hero_ante_bb

  The observed equity share is aggregated as a ratio of hand-weighted sums:

    call_cost_bb      = open_bb - 1
    pot_after_call_bb = 2 * open_bb + 0.5 + total_ante_bb
    realized_equity   = SUM(ev_vs_fold_bb + call_cost_bb)
                        / SUM(pot_after_call_bb)

  This is not EQR. The page divides this observed share by its own raw-equity
  model and labels the result as a descriptive FF estimate.
*/
WITH
raw_latest AS
(
    SELECT
        network,
        tourney_id,
        hand_id,
        argMax(
            tuple(
                hand_player_id,
                user_id,
                played_at,
                holecards_str,
                cnt_players,
                preflop_effective_stack_size_bb,
                preflop_2bet_and_blind_facing_amount_bb,
                preflop_aggressor_position,
                chips_ev,
                chips_won,
                ante_amount,
                bb_amount
            ),
            tuple(version, hand_player_id)
        ) AS x
    FROM analytics.int_tracker_hand_joined
    WHERE month_start_date >= toDate('2026-01-01')
      AND month_start_date < toDate('2026-08-01')
      AND played_at >= toDateTime('2026-01-01 00:00:00')
      AND played_at < toDateTime('2026-07-14 00:00:00')
      AND is_bb = 1
      AND val_preflop_action_facing = 4
      AND preflop_action = 'C'
      AND is_preflop_allin = 0
      AND cnt_flop_players = 2
      AND cnt_players BETWEEN 3 AND 9
      AND preflop_effective_stack_size_bb BETWEEN 25 AND 40
      AND bb_amount > 0
      AND hand_player_id IS NOT NULL
      AND hand_id IS NOT NULL
      AND tourney_id IS NOT NULL
      AND network IS NOT NULL
      AND network != ''
      AND preflop_aggressor_position IN (0, 1, 2, 3, 4, 5, 6, 7)
      AND
      (
          abs(preflop_2bet_and_blind_facing_amount_bb - 2.0) <= 0.05
          OR abs(preflop_2bet_and_blind_facing_amount_bb - 2.5) <= 0.05
          OR abs(preflop_2bet_and_blind_facing_amount_bb - 3.0) <= 0.05
      )
    GROUP BY network, tourney_id, hand_id
),
source AS
(
    SELECT
        x.1 AS hand_player_id,
        hand_id,
        tourney_id,
        network,
        x.2 AS user_id,
        x.3 AS played_at,
        x.4 AS holecards_str,
        x.5 AS cnt_players,
        x.6 AS effective_stack_bb,
        x.7 AS open_bb,
        multiIf(
            x.8 = 0, 'BTN',
            x.8 = 1, 'CO',
            x.8 = 2, 'HJ',
            x.8 IN (3, 4), 'MP',
            'EP'
        ) AS opener_position,
        multiIf(
            abs(x.7 - 2.0) <= 0.05, toFloat64(2.0),
            abs(x.7 - 2.5) <= 0.05, toFloat64(2.5),
            toFloat64(3.0)
        ) AS open_size_bb,
        toFloat64(x.9) / toFloat64(x.12) AS chips_ev_bb,
        toFloat64(x.10) / toFloat64(x.12) AS chips_won_bb,
        toFloat64(x.11) / toFloat64(x.12) AS hero_ante_bb,
        (toFloat64(x.11) / toFloat64(x.12)) * x.5 AS total_ante_bb
    FROM raw_latest
    WHERE x.2 IS NOT NULL
      AND x.4 IS NOT NULL
      AND x.4 != ''
      AND x.9 IS NOT NULL
      AND x.10 IS NOT NULL
      AND x.11 IS NOT NULL
),
cohorts AS
(
    SELECT 'all_ff_3_9max' AS cohort, * FROM source

    UNION ALL

    SELECT 'exact_7max' AS cohort, * FROM source WHERE cnt_players = 7
),
expanded AS
(
    SELECT '25-40' AS stack_bucket, * FROM cohorts

    UNION ALL

    SELECT
        multiIf(
            effective_stack_bb < 30, '25-30',
            effective_stack_bb < 35, '30-35',
            '35-40'
        ) AS stack_bucket,
        *
    FROM cohorts
)
SELECT
    cohort,
    stack_bucket,
    holecards_str,
    opener_position,
    open_size_bb,
    count() AS hand_count,
    uniqExact(user_id) AS unique_players,
    round(avg(chips_ev_bb), 6) AS avg_chips_ev_bb,
    round(avg(chips_won_bb), 6) AS avg_chips_won_bb,
    round(avg(hero_ante_bb), 6) AS mean_hero_ante_bb,
    round(avg(total_ante_bb), 6) AS mean_total_ante_bb,
    round(avg(open_bb), 6) AS mean_open_bb,
    round(avg(2 * open_bb + 0.5 + total_ante_bb), 6) AS mean_pot_after_call_bb,
    round(avg(chips_ev_bb + 1 + hero_ante_bb), 6) AS mean_ev_vs_fold_bb,
    round(
        100 * sum(chips_ev_bb + open_bb + hero_ante_bb)
        / nullIf(sum(2 * open_bb + 0.5 + total_ante_bb), 0),
        4
    ) AS realized_equity_pct,
    min(played_at) AS first_hand_at,
    max(played_at) AS last_hand_at
FROM expanded
GROUP BY
    cohort,
    stack_bucket,
    holecards_str,
    opener_position,
    open_size_bb
ORDER BY
    cohort,
    stack_bucket,
    opener_position,
    open_size_bb,
    holecards_str;
