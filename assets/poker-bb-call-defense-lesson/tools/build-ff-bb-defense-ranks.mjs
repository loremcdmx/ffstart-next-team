import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/ff-bb-defense-ranks.json"
);

if (!inputPath) {
  throw new Error("Usage: node build-ff-bb-defense-ranks.mjs <hand-cube.csv> [output.json]");
}

const COHORTS = ["novice", "league3", "league2", "league1"];
const POSITIONS = ["EP", "MP", "HJ", "CO", "BTN"];
const SIZES = [2, 2.5, 3];
const RANKS = "AKQJT98765432";
const HANDS = [];
for (let row = 0; row < RANKS.length; row += 1) {
  for (let column = 0; column < RANKS.length; column += 1) {
    HANDS.push(row === column
      ? RANKS[row] + RANKS[column]
      : row < column
        ? RANKS[row] + RANKS[column] + "s"
        : RANKS[column] + RANKS[row] + "o");
  }
}
const HAND_SET = new Set(HANDS);

// Frozen result of the same cube grouped without holecards_str. It preserves
// chart-level uniqExact(user_id), which cannot be reconstructed by summing the
// per-hand-class export. Every count is reconciled below against that export.
const AGGREGATE_TSV = `cohort\tposition\tsize\tn\tplayers\tfolds\tcalls\tthreeBets
novice\tEP\t2\t12391\t974\t5018\t6675\t698
novice\tEP\t2.5\t683\t427\t409\t241\t33
novice\tEP\t3\t1451\t613\t1014\t369\t68
novice\tMP\t2\t60503\t1060\t23742\t33161\t3600
novice\tMP\t2.5\t5098\t888\t3049\t1795\t254
novice\tMP\t3\t7553\t964\t5334\t1879\t340
novice\tHJ\t2\t49242\t1044\t18496\t27521\t3225
novice\tHJ\t2.5\t5157\t824\t3006\t1860\t291
novice\tHJ\t3\t6594\t919\t4723\t1563\t308
novice\tCO\t2\t58253\t1052\t20320\t33393\t4540
novice\tCO\t2.5\t6137\t855\t3486\t2267\t384
novice\tCO\t3\t8294\t938\t5931\t1985\t378
novice\tBTN\t2\t70644\t1061\t22229\t40787\t7628
novice\tBTN\t2.5\t8298\t901\t4399\t3193\t706
novice\tBTN\t3\t10677\t964\t7439\t2631\t607
league3\tEP\t2\t43522\t1466\t17394\t23986\t2142
league3\tEP\t2.5\t2125\t898\t1320\t728\t77
league3\tEP\t3\t3916\t1088\t2791\t955\t170
league3\tMP\t2\t207432\t1548\t78636\t117348\t11448
league3\tMP\t2.5\t16547\t1380\t10131\t5686\t730
league3\tMP\t3\t21081\t1451\t15464\t4730\t887
league3\tHJ\t2\t174480\t1533\t60692\t102012\t11776
league3\tHJ\t2.5\t17474\t1324\t10386\t6162\t926
league3\tHJ\t3\t19284\t1401\t14216\t4227\t841
league3\tCO\t2\t204184\t1543\t62413\t122483\t19288
league3\tCO\t2.5\t20484\t1351\t11492\t7655\t1337
league3\tCO\t3\t24039\t1431\t17349\t5376\t1314
league3\tBTN\t2\t251737\t1552\t66048\t151589\t34100
league3\tBTN\t2.5\t28697\t1393\t14804\t11306\t2587
league3\tBTN\t3\t31004\t1457\t21649\t7389\t1966
league2\tEP\t2\t38261\t648\t15261\t21146\t1854
league2\tEP\t2.5\t1525\t469\t918\t554\t53
league2\tEP\t3\t2104\t520\t1549\t454\t101
league2\tMP\t2\t165868\t657\t61904\t94118\t9846
league2\tMP\t2.5\t10995\t634\t6654\t3823\t518
league2\tMP\t3\t10785\t639\t7882\t2410\t493
league2\tHJ\t2\t139789\t661\t45625\t82136\t12028
league2\tHJ\t2.5\t12090\t625\t6890\t4494\t706
league2\tHJ\t3\t10346\t630\t7491\t2263\t592
league2\tCO\t2\t160542\t660\t44012\t94560\t21970
league2\tCO\t2.5\t13854\t632\t7566\t5153\t1135
league2\tCO\t3\t11939\t637\t8467\t2635\t837
league2\tBTN\t2\t204093\t658\t45928\t118519\t39646
league2\tBTN\t2.5\t20700\t638\t10236\t8204\t2260
league2\tBTN\t3\t16386\t644\t11092\t3886\t1408
league1\tEP\t2\t14337\t213\t5722\t7850\t765
league1\tEP\t2.5\t430\t156\t246\t162\t22
league1\tEP\t3\t511\t164\t360\t129\t22
league1\tMP\t2\t64697\t216\t23969\t36631\t4097
league1\tMP\t2.5\t3332\t209\t1902\t1256\t174
league1\tMP\t3\t2945\t209\t2099\t709\t137
league1\tHJ\t2\t53792\t216\t17209\t31698\t4885
league1\tHJ\t2.5\t3645\t209\t1941\t1495\t209
league1\tHJ\t3\t2824\t208\t1960\t708\t156
league1\tCO\t2\t61873\t216\t16434\t35930\t9509
league1\tCO\t2.5\t4157\t212\t2088\t1687\t382
league1\tCO\t3\t3383\t207\t2341\t782\t260
league1\tBTN\t2\t77388\t216\t16507\t44431\t16450
league1\tBTN\t2.5\t6152\t209\t2924\t2464\t764
league1\tBTN\t3\t4555\t210\t3003\t1125\t427`;

function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }
  const [header, ...data] = records;
  if (!header) throw new Error("CSV export is empty");
  return data
    .filter((values) => values.length === header.length)
    .map((values) => Object.fromEntries(header.map((name, index) => [name, values[index]])));
}

function numeric(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${field}: ${value}`);
  return parsed;
}

function sizeKey(value) {
  return Number(value).toFixed(1).replace(".", "_");
}

function aggregateKey(cohort, position, size) {
  return `${cohort}:${position}:${sizeKey(size)}`;
}

function handKey(cohort, position, size, hand) {
  return `${aggregateKey(cohort, position, size)}:${hand}`;
}

function countsFrom(row) {
  return {
    n: numeric(row.hand_count, "hand_count"),
    folds: numeric(row.fold_hands, "fold_hands"),
    calls: numeric(row.call_hands, "call_hands"),
    threeBets: numeric(row.threebet_hands, "threebet_hands"),
    other: numeric(row.other_hands, "other_hands")
  };
}

function addCounts(target, source) {
  target.n += source.n;
  target.folds += source.folds;
  target.calls += source.calls;
  target.threeBets += source.threeBets;
  target.other += source.other;
}

function pearson(left, right) {
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const leftMean = mean(left);
  const rightMean = mean(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftScale = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
  const rightScale = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
  return numerator / Math.sqrt(leftScale * rightScale);
}

const frozenAggregates = {};
for (const line of AGGREGATE_TSV.trim().split("\n").slice(1)) {
  const [cohort, position, size, n, players, folds, calls, threeBets] = line.split("\t");
  frozenAggregates[aggregateKey(cohort, position, size)] = {
    n: Number(n), players: Number(players), folds: Number(folds), calls: Number(calls), threeBets: Number(threeBets)
  };
}

const aggregates = {};
const hands = {};
for (const key of Object.keys(frozenAggregates)) {
  aggregates[key] = { ...frozenAggregates[key], cardKnownN: 0 };
}

const rows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const rowKeys = new Set();
for (const row of rows) {
  const cohort = row.cohort;
  const position = row.opener_position;
  const size = numeric(row.open_size_bb, "open_size_bb");
  const hand = row.holecards_str;
  if (!COHORTS.includes(cohort) || !POSITIONS.includes(position) || !SIZES.includes(size)) {
    throw new Error(`Unexpected cube dimension: ${cohort}/${position}/${size}`);
  }
  const sourceKey = `${cohort}:${position}:${sizeKey(size)}:${hand}`;
  if (rowKeys.has(sourceKey)) throw new Error(`Duplicate cube row: ${sourceKey}`);
  rowKeys.add(sourceKey);
  const counts = countsFrom(row);
  if (counts.folds + counts.calls + counts.threeBets + counts.other !== counts.n || counts.other !== 0) {
    throw new Error(`Action reconciliation failed: ${sourceKey}`);
  }
  const aggregate = aggregates[aggregateKey(cohort, position, size)];
  if (!aggregate) throw new Error(`Aggregate is missing: ${sourceKey}`);
  if (hand === "__MISSING__") continue;
  if (!HAND_SET.has(hand)) throw new Error(`Unexpected hand class: ${hand}`);
  const key = handKey(cohort, position, size, hand);
  hands[key] = {
    n: counts.n,
    players: numeric(row.unique_players, "unique_players"),
    folds: counts.folds,
    calls: counts.calls,
    threeBets: counts.threeBets
  };
  aggregate.cardKnownN += counts.n;
}

const cubeTotals = Object.fromEntries(Object.keys(aggregates).map((key) => [key, {
  n: 0, folds: 0, calls: 0, threeBets: 0, other: 0
}]));
for (const row of rows) {
  addCounts(cubeTotals[aggregateKey(row.cohort, row.opener_position, Number(row.open_size_bb))], countsFrom(row));
}

for (const [key, aggregate] of Object.entries(aggregates)) {
  const observed = cubeTotals[key];
  for (const field of ["n", "folds", "calls", "threeBets"]) {
    if (observed[field] !== aggregate[field]) {
      throw new Error(`Frozen aggregate mismatch ${key}/${field}: ${observed[field]} != ${aggregate[field]}`);
    }
  }
  if (aggregate.folds + aggregate.calls + aggregate.threeBets !== aggregate.n) {
    throw new Error(`Aggregate action mismatch: ${key}`);
  }
  if (aggregate.cardKnownN > aggregate.n) throw new Error(`Coverage exceeds N: ${key}`);
}

const abi = {
  novice: { players: 1116, entries: 628101, loadUsd: 1687390.61, abiUsd: 2.69 },
  league3: { players: 1616, entries: 1768356, loadUsd: 9720802.96, abiUsd: 5.50 },
  league2: { players: 667, entries: 1082216, loadUsd: 17795180.04, abiUsd: 16.44 },
  league1: { players: 216, entries: 366251, loadUsd: 15609661.05, abiUsd: 42.62 }
};
const defaultDefend = COHORTS.map((cohort) => {
  const aggregate = aggregates[aggregateKey(cohort, "BTN", 2)];
  return 100 * (aggregate.calls + aggregate.threeBets) / aggregate.n;
});
const abiValues = COHORTS.map((cohort) => abi[cohort].abiUsd);
const correlation = pearson(abiValues.map(Math.log), defaultDefend);
const totalN = Object.values(aggregates).reduce((sum, row) => sum + row.n, 0);
const cardKnownN = Object.values(aggregates).reduce((sum, row) => sum + row.cardKnownN, 0);

const output = {
  meta: {
    version: "2026-07-15.2",
    window: {
      startInclusive: "2026-01-01T00:00:00Z",
      endExclusive: "2026-07-14T00:00:00Z",
      label: "1 января — 13 июля 2026"
    },
    scope: "FF tracker · BB vs one raiser · 3–9 max · effective stack 25–40 BB · opens 2/2.5/3 BB ±0.05",
    cohorts: {
      novice: { label: "Совсем новички", detail: "ранги 15–18", ranks: [15, 16, 17, 18] },
      league3: { label: "3 лига", detail: "ранги 11–15", ranks: [11, 12, 13, 14, 15] },
      league2: { label: "2 лига", detail: "ранги 6–10", ranks: [6, 7, 8, 9, 10] },
      league1: { label: "1 лига", detail: "ранги 1–5", ranks: [1, 2, 3, 4, 5] }
    },
    positions: POSITIONS,
    sizes: SIZES,
    minChartDisplayN: 300,
    minCellDisplayN: 20,
    minCellReliableN: 80,
    samplePolicy: "Cells below N=20 keep their action color and receive a gray corner; charts below N=300 get a low-sample overlay.",
    cohortPolicy: "Rank 15 intentionally appears in both novice (15-18) and league3 (11-15).",
    abiMetric: "SUM(load_usd) / SUM(1 + multientries), pack only, selfplay excluded, real players",
    abi,
    abiCorrelation: {
      method: "Pearson correlation between log cohort ABI and BTN/2 BB total defend",
      cohortCount: 4,
      pearsonR: Number(correlation.toFixed(6)),
      abiFrom: abi.novice.abiUsd,
      abiTo: abi.league1.abiUsd,
      defendFrom: Number(defaultDefend[0].toFixed(6)),
      defendTo: Number(defaultDefend[3].toFixed(6)),
      caveat: "Ecological cross-sectional association; it does not establish training causality."
    },
    coverage: {
      totalN,
      cardKnownN,
      cardKnownPct: Number((100 * cardKnownN / totalN).toFixed(2)),
      aggregateCells: Object.keys(aggregates).length,
      observedHandCells: Object.keys(hands).length,
      expectedHandClassesPerChart: HANDS.length
    },
    source: {
      hands: "analytics.int_tracker_hand_joined",
      ranks: "analytics_mcp_readonly.mcp__check_rank_history",
      players: "analytics_mcp_readonly.mcp__check_users",
      abi: "analytics_mcp_readonly.mcp__fulltplayers",
      query: "assets/poker-bb-call-defense-lesson/tools/q_ff_bb_defense_ranks.sql"
    }
  },
  aggregates,
  hands
};

if (Object.keys(aggregates).length !== 60 || totalN !== 2500279 || cardKnownN !== 2218014) {
  throw new Error(`Snapshot reconciliation failed: ${Object.keys(aggregates).length} charts / ${totalN} hands / ${cardKnownN} known`);
}
if (Object.keys(hands).length !== 10081) {
  throw new Error(`Hand-cell reconciliation failed: ${Object.keys(hands).length}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({
  output: outputPath,
  bytes: fs.statSync(outputPath).size,
  charts: Object.keys(aggregates).length,
  handCells: Object.keys(hands).length,
  totalN,
  cardKnownN,
  cardKnownPct: output.meta.coverage.cardKnownPct,
  pearsonR: output.meta.abiCorrelation.pearsonR
}, null, 2));
