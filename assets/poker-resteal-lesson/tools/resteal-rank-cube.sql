-- Exact rank-at-hand BB direct-resteal cube.
-- Window: [2026-01-01 00:00:00, 2026-07-14 00:00:00) UTC.
-- Replace {{RANK_INTERVAL_ROWS}} with the result of query 1 rendered as
-- (user_id,rang,'rank_start_at','rank_end_at') tuples before running query 2.

-- 1. BigQuery rank bridge. Result used for the frozen export: 6,426 rows,
-- 2,463 users, no overlapping intervals, all ranks 1-18.
SELECT
  h.user_id,
  h.rang,
  FORMAT_TIMESTAMP('%F %T', GREATEST(h.rang_start_at, TIMESTAMP '2026-01-01 00:00:00+00'), 'UTC') AS rank_start_at,
  FORMAT_TIMESTAMP('%F %T', LEAST(COALESCE(h.rang_end_at, TIMESTAMP '2026-07-14 00:00:00+00'), TIMESTAMP '2026-07-14 00:00:00+00'), 'UTC') AS rank_end_at
FROM `analytics_mcp_readonly.mcp__check_rank_history` AS h
JOIN `analytics_mcp_readonly.mcp__check_users` AS u USING (user_id)
WHERE h.rang BETWEEN 1 AND 18
  AND h.rang_start_at < TIMESTAMP '2026-07-14 00:00:00+00'
  AND COALESCE(h.rang_end_at, TIMESTAMP '2026-07-14 00:00:00+00') > TIMESTAMP '2026-01-01 00:00:00+00'
  AND u.is_real_player = TRUE
ORDER BY h.user_id, h.rang_start_at;

-- 2. ClickHouse lossless cube. Direct jam is deliberately stricter than
-- startsWith(action,'R'): RC/RR sequences are non-all-in 3-bet lines.
WITH
rank_intervals AS
(
  SELECT *
  FROM values(
    'user_id Int32, rang Int16, rank_start_at DateTime, rank_end_at DateTime',
    {{RANK_INTERVAL_ROWS}}
  )
),
latest AS
(
  SELECT
    argMax(
      tuple(
        h.user_id,
        r.rang,
        h.played_at,
        h.preflop_action,
        toUInt8(coalesce(h.is_preflop_allin, 0)),
        h.preflop_aggressor_position,
        h.preflop_2bet_and_blind_facing_amount_bb,
        h.preflop_effective_stack_size_bb,
        h.holecards_str
      ),
      tuple(h.version, h.hand_player_id)
    ) AS x
  FROM analytics.int_tracker_hand_joined AS h
  INNER JOIN rank_intervals AS r ON h.user_id = r.user_id
  WHERE h.played_at >= r.rank_start_at
    AND h.played_at < r.rank_end_at
    AND h.month_start_date >= toDate('2026-01-01')
    AND h.month_start_date < toDate('2026-08-01')
    AND h.played_at >= toDateTime('2026-01-01 00:00:00')
    AND h.played_at < toDateTime('2026-07-14 00:00:00')
    AND h.is_bb = 1
    AND h.val_preflop_action_facing = 4
    AND coalesce(h.is_preflop_could_3bet, 0) = 1
    AND coalesce(h.cnt_preflop_face_limpers, 0) = 0
    AND h.cnt_players BETWEEN 3 AND 9
    AND h.preflop_effective_stack_size_bb BETWEEN 25 AND 40
    AND h.preflop_aggressor_position IN (0, 1)
    AND (
      abs(h.preflop_2bet_and_blind_facing_amount_bb - 2.0) <= 0.05
      OR abs(h.preflop_2bet_and_blind_facing_amount_bb - 2.5) <= 0.05
      OR abs(h.preflop_2bet_and_blind_facing_amount_bb - 3.0) <= 0.05
    )
    AND h.hand_player_id IS NOT NULL
    AND h.hand_id IS NOT NULL
    AND h.tourney_id IS NOT NULL
    AND h.network IS NOT NULL
    AND h.network != ''
  GROUP BY h.network, h.tourney_id, h.hand_id
),
classified AS
(
  SELECT
    multiIf(
      x.2 BETWEEN 16 AND 18, 'novice',
      x.2 BETWEEN 11 AND 15, 'league3',
      x.2 BETWEEN 6 AND 10, 'league2',
      'league1'
    ) AS cohort,
    if(x.6 = 0, 'BTN', 'CO') AS opener_position,
    multiIf(abs(x.7 - 2.0) <= 0.05, '2.0', abs(x.7 - 2.5) <= 0.05, '2.5', '3.0') AS open_size_bb,
    multiIf(x.8 < 30, '25-30', x.8 < 35, '30-35', '35-40') AS depth_band,
    x.1 AS user_id,
    x.3 AS played_at,
    ifNull(nullIf(x.9, ''), '__MISSING__') AS holecards_str,
    multiIf(
      x.4 = 'R' AND x.5 = 1, 'jam',
      startsWith(x.4, 'R'), 'small3bet',
      startsWith(x.4, 'C'), 'call',
      x.4 = 'F', 'fold',
      'other'
    ) AS action_class
  FROM latest
)
SELECT
  cohort,
  opener_position,
  open_size_bb,
  depth_band,
  holecards_str,
  count() AS opportunities,
  uniqExact(user_id) AS unique_players,
  countIf(action_class = 'fold') AS folds,
  countIf(action_class = 'call') AS calls,
  countIf(action_class = 'small3bet') AS small3bets,
  countIf(action_class = 'jam') AS jams,
  countIf(action_class = 'other') AS other,
  min(played_at) AS first_hand_at,
  max(played_at) AS last_hand_at
FROM classified
GROUP BY cohort, opener_position, open_size_bb, depth_band, holecards_str
ORDER BY cohort, opener_position, open_size_bb, depth_band, holecards_str;

-- 3. BigQuery same-window ABI provenance.
WITH abi_base AS
(
  SELECT
    CASE
      WHEN f.rang BETWEEN 16 AND 18 THEN 'novice'
      WHEN f.rang BETWEEN 11 AND 15 THEN 'league3'
      WHEN f.rang BETWEEN 6 AND 10 THEN 'league2'
      WHEN f.rang BETWEEN 1 AND 5 THEN 'league1'
    END AS cohort,
    f.user_id,
    CAST(f.load_usd AS FLOAT64) AS load_usd,
    1 + COALESCE(f.multientries, 0) AS entries
  FROM `analytics_mcp_readonly.mcp__fulltplayers` AS f
  JOIN `analytics_mcp_readonly.mcp__check_users` AS u USING (user_id)
  WHERE f.date_start >= TIMESTAMP '2026-01-01 00:00:00+00'
    AND f.date_start < TIMESTAMP '2026-07-14 00:00:00+00'
    AND f.rang BETWEEN 1 AND 18
    AND f.pack_id IS NOT NULL
    AND f.is_selfplay = FALSE
    AND u.is_real_player = TRUE
    AND f.load_usd IS NOT NULL
)
SELECT cohort, COUNT(DISTINCT user_id) AS players, SUM(entries) AS entries,
       ROUND(SUM(load_usd), 2) AS load_usd,
       ROUND(SAFE_DIVIDE(SUM(load_usd), SUM(entries)), 2) AS abi_usd
FROM abi_base
GROUP BY cohort
ORDER BY cohort;
