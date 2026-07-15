-- Provenance: frozen source-backed extraction used by the BB call-defense lesson.
-- Canonical copy: outputs/bb-defense-league-2026-07-15/queries.sql in the
-- ff-start-poker-hub workspace; copied 2026-07-15 without changing filters.
-- Window: [2026-01-01 00:00:00, 2026-07-14 00:00:00) UTC.

-- BB defense by hand class and rank-at-hand cohort.
-- Output grain: cohort x opener position x open size x 169 hand class.
-- Rank 15 intentionally contributes to both novice (15-18) and league3
-- (11-15), so the comparison cohorts overlap at that boundary.

-- ---------------------------------------------------------------------------
-- BigQuery: export rank intervals for real FF players.
-- Clamp intervals to the analysis window before converting them to ClickHouse
-- VALUES tuples: (user_id, rang, 'rank_start_at', 'rank_end_at').
-- ---------------------------------------------------------------------------
SELECT
  h.user_id,
  h.rang,
  FORMAT_TIMESTAMP(
    '%F %T',
    GREATEST(h.rang_start_at, TIMESTAMP '2026-01-01 00:00:00+00'),
    'UTC'
  ) AS rank_start_at,
  FORMAT_TIMESTAMP(
    '%F %T',
    LEAST(
      COALESCE(h.rang_end_at, TIMESTAMP '2026-07-14 00:00:00+00'),
      TIMESTAMP '2026-07-14 00:00:00+00'
    ),
    'UTC'
  ) AS rank_end_at
FROM `analytics_mcp_readonly.mcp__check_rank_history` AS h
JOIN `analytics_mcp_readonly.mcp__check_users` AS u
  USING (user_id)
WHERE h.rang BETWEEN 1 AND 18
  AND h.rang_start_at < TIMESTAMP '2026-07-14 00:00:00+00'
  AND COALESCE(
    h.rang_end_at,
    TIMESTAMP '2026-07-14 00:00:00+00'
  ) > TIMESTAMP '2026-01-01 00:00:00+00'
  AND u.is_real_player = TRUE
ORDER BY h.user_id, h.rang_start_at;

-- ---------------------------------------------------------------------------
-- ClickHouse: replace {{RANK_INTERVAL_ROWS}} with the BigQuery export rendered
-- as comma-separated tuples. ClickHouse 24.7 only permits the user_id equality
-- in JOIN ON; the as-of interval predicates therefore live in WHERE.
-- ---------------------------------------------------------------------------
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
        h.preflop_aggressor_position,
        h.preflop_2bet_and_blind_facing_amount_bb,
        h.preflop_effective_stack_size_bb,
        h.holecards_str
      ),
      tuple(h.version, h.hand_player_id)
    ) AS x
  FROM analytics.int_tracker_hand_joined AS h
  INNER JOIN rank_intervals AS r
    ON h.user_id = r.user_id
  WHERE h.played_at >= r.rank_start_at
    AND h.played_at < r.rank_end_at
    AND h.month_start_date >= toDate('2026-01-01')
    AND h.month_start_date < toDate('2026-08-01')
    AND h.played_at >= toDateTime('2026-01-01 00:00:00')
    AND h.played_at < toDateTime('2026-07-14 00:00:00')
    AND h.is_bb = 1
    AND h.val_preflop_action_facing = 4
    AND h.cnt_players BETWEEN 3 AND 9
    AND h.preflop_effective_stack_size_bb BETWEEN 25 AND 40
    AND h.preflop_aggressor_position IN (0, 1, 2, 3, 4, 5, 6, 7)
    AND
    (
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
cube AS
(
  SELECT
    arrayJoin(multiIf(
      x.2 = 15, ['novice', 'league3'],
      x.2 BETWEEN 16 AND 18, ['novice'],
      x.2 BETWEEN 11 AND 14, ['league3'],
      x.2 BETWEEN 6 AND 10, ['league2'],
      ['league1']
    )) AS cohort,
    multiIf(
      x.5 = 0, 'BTN',
      x.5 = 1, 'CO',
      x.5 = 2, 'HJ',
      x.5 IN (3, 4), 'MP',
      'EP'
    ) AS opener_position,
    multiIf(
      abs(x.6 - 2.0) <= 0.05, toFloat64(2.0),
      abs(x.6 - 2.5) <= 0.05, toFloat64(2.5),
      toFloat64(3.0)
    ) AS open_size_bb,
    x.1 AS user_id,
    x.3 AS played_at,
    ifNull(nullIf(x.8, ''), '__MISSING__') AS holecards_str,
    left(x.4, 1) AS action
  FROM latest
)
SELECT
  cohort,
  opener_position,
  open_size_bb,
  holecards_str,
  count() AS hand_count,
  uniqExact(user_id) AS unique_players,
  countIf(action = 'F') AS fold_hands,
  countIf(action = 'C') AS call_hands,
  countIf(action = 'R') AS threebet_hands,
  countIf(action NOT IN ('F', 'C', 'R')) AS other_hands,
  min(played_at) AS first_hand_at,
  max(played_at) AS last_hand_at
FROM cube
GROUP BY cohort, opener_position, open_size_bb, holecards_str;

-- ---------------------------------------------------------------------------
-- ClickHouse: chart-level 60-cell aggregate cube.
-- This intentionally repeats the hand-cube CTE so uniqExact(user_id) is
-- computed at cohort x position x size grain rather than summed across hands.
-- ---------------------------------------------------------------------------
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
        h.preflop_aggressor_position,
        h.preflop_2bet_and_blind_facing_amount_bb,
        h.preflop_effective_stack_size_bb,
        h.holecards_str
      ),
      tuple(h.version, h.hand_player_id)
    ) AS x
  FROM analytics.int_tracker_hand_joined AS h
  INNER JOIN rank_intervals AS r
    ON h.user_id = r.user_id
  WHERE h.played_at >= r.rank_start_at
    AND h.played_at < r.rank_end_at
    AND h.month_start_date >= toDate('2026-01-01')
    AND h.month_start_date < toDate('2026-08-01')
    AND h.played_at >= toDateTime('2026-01-01 00:00:00')
    AND h.played_at < toDateTime('2026-07-14 00:00:00')
    AND h.is_bb = 1
    AND h.val_preflop_action_facing = 4
    AND h.cnt_players BETWEEN 3 AND 9
    AND h.preflop_effective_stack_size_bb BETWEEN 25 AND 40
    AND h.preflop_aggressor_position IN (0, 1, 2, 3, 4, 5, 6, 7)
    AND
    (
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
cube AS
(
  SELECT
    arrayJoin(multiIf(
      x.2 = 15, ['novice', 'league3'],
      x.2 BETWEEN 16 AND 18, ['novice'],
      x.2 BETWEEN 11 AND 14, ['league3'],
      x.2 BETWEEN 6 AND 10, ['league2'],
      ['league1']
    )) AS cohort,
    multiIf(
      x.5 = 0, 'BTN',
      x.5 = 1, 'CO',
      x.5 = 2, 'HJ',
      x.5 IN (3, 4), 'MP',
      'EP'
    ) AS opener_position,
    multiIf(
      abs(x.6 - 2.0) <= 0.05, toFloat64(2.0),
      abs(x.6 - 2.5) <= 0.05, toFloat64(2.5),
      toFloat64(3.0)
    ) AS open_size_bb,
    x.1 AS user_id,
    left(x.4, 1) AS action
  FROM latest
)
SELECT
  cohort,
  opener_position,
  open_size_bb,
  count() AS hand_count,
  uniqExact(user_id) AS unique_players,
  countIf(action = 'F') AS fold_hands,
  countIf(action = 'C') AS call_hands,
  countIf(action = 'R') AS threebet_hands,
  countIf(action NOT IN ('F', 'C', 'R')) AS other_hands
FROM cube
GROUP BY cohort, opener_position, open_size_bb
ORDER BY
  field(cohort, 'novice', 'league3', 'league2', 'league1'),
  field(opener_position, 'EP', 'MP', 'HJ', 'CO', 'BTN'),
  open_size_bb;

-- ---------------------------------------------------------------------------
-- BigQuery: ABI at tournament-time rank in the same window.
-- ABI contract: total load / entries, where entries = rows + multientries.
-- Standard in-project exclusions come from the mcp__fulltplayers contract.
-- ---------------------------------------------------------------------------
WITH abi_base AS
(
  SELECT
    cohort,
    f.user_id,
    CAST(f.load_usd AS FLOAT64) AS load_usd,
    1 + COALESCE(f.multientries, 0) AS entries
  FROM `analytics_mcp_readonly.mcp__fulltplayers` AS f
  JOIN `analytics_mcp_readonly.mcp__check_users` AS u
    USING (user_id)
  CROSS JOIN UNNEST(
    CASE
      WHEN f.rang = 15 THEN ['novice', 'league3']
      WHEN f.rang BETWEEN 16 AND 18 THEN ['novice']
      WHEN f.rang BETWEEN 11 AND 14 THEN ['league3']
      WHEN f.rang BETWEEN 6 AND 10 THEN ['league2']
      WHEN f.rang BETWEEN 1 AND 5 THEN ['league1']
    END
  ) AS cohort
  WHERE f.date_start >= TIMESTAMP '2026-01-01 00:00:00+00'
    AND f.date_start < TIMESTAMP '2026-07-14 00:00:00+00'
    AND f.rang BETWEEN 1 AND 18
    AND f.pack_id IS NOT NULL
    AND f.is_selfplay = FALSE
    AND u.is_real_player = TRUE
    AND f.load_usd IS NOT NULL
)
SELECT
  cohort,
  COUNT(DISTINCT user_id) AS players,
  SUM(entries) AS entries,
  ROUND(SUM(load_usd), 2) AS load_usd,
  ROUND(SAFE_DIVIDE(SUM(load_usd), SUM(entries)), 2) AS abi_usd
FROM abi_base
GROUP BY cohort;
