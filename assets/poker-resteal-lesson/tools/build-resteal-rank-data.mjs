#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(toolDirectory, '../data');
const csvPath = path.join(dataDirectory, 'resteal-rank-hand-cube.csv');
const dataPath = path.join(dataDirectory, 'resteal-rank-data.js');
const diagnosticsPath = path.join(dataDirectory, 'resteal-rank-diagnostics.json');
const checkOnly = process.argv.includes('--check');

const expectedColumns = [
  'cohort',
  'opener_position',
  'open_size_bb',
  'depth_band',
  'holecards_str',
  'opportunities',
  'unique_players',
  'folds',
  'calls',
  'small3bets',
  'jams',
  'other',
  'first_hand_at',
  'last_hand_at',
];
const cohortOrder = ['novice', 'league3', 'league2', 'league1'];
const positionOrder = ['CO', 'BTN'];
const sizeOrder = ['2.0', '2.5', '3.0'];
const sourceDepthOrder = ['25-30', '30-35', '35-40'];
const depthOrder = ['25-40', ...sourceDepthOrder];
const ranks = 'AKQJT98765432'.split('');
const handOrder = ranks.flatMap((_, row) => ranks.map((__, column) => {
  if (row === column) return `${ranks[row]}${ranks[column]}`;
  if (row < column) return `${ranks[row]}${ranks[column]}s`;
  return `${ranks[column]}${ranks[row]}o`;
}));
const handIndex = new Map(handOrder.map((hand, index) => [hand, index]));
const missingHand = '__MISSING__';
const windowStart = '2026-01-01T00:00:00Z';
const windowEnd = '2026-07-14T00:00:00Z';
const abi = {
  novice: { abiUsd: 1.25, abiPlayers: 231, abiEntries: 51166, loadUsd: 64042.87 },
  league3: { abiUsd: 5.5, abiPlayers: 1616, abiEntries: 1768355, loadUsd: 9720787.96 },
  league2: { abiUsd: 16.44, abiPlayers: 667, abiEntries: 1082199, loadUsd: 17794990.19 },
  league1: { abiUsd: 42.62, abiPlayers: 216, abiEntries: 366251, loadUsd: 15609661.05 },
};
const cohortMeta = {
  novice: { label: 'Совсем новички', ranks: [16, 17, 18] },
  league3: { label: '3 лига', ranks: [11, 12, 13, 14, 15] },
  league2: { label: '2 лига', ranks: [6, 7, 8, 9, 10] },
  league1: { label: '1 лига', ranks: [1, 2, 3, 4, 5] },
};

const csvBuffer = fs.readFileSync(csvPath);
const csvText = csvBuffer.toString('utf8').trimEnd();
const [headerLine, ...csvLines] = csvText.split(/\r?\n/);
assert.deepEqual(headerLine.split(','), expectedColumns, 'unexpected CSV columns');

const rows = csvLines.map((line, index) => {
  const values = line.split(',');
  assert.equal(values.length, expectedColumns.length, `CSV width mismatch on row ${index + 2}`);
  return Object.fromEntries(expectedColumns.map((column, columnIndex) => [column, values[columnIndex]]));
});

const charts = precreateCharts();
const rowKeys = new Set();
const globalTotals = emptyTotals();
let firstHandAt = null;
let lastHandAt = null;

for (const [index, row] of rows.entries()) {
  const rowNumber = index + 2;
  assert(cohortOrder.includes(row.cohort), `bad cohort on row ${rowNumber}`);
  assert(positionOrder.includes(row.opener_position), `bad position on row ${rowNumber}`);
  assert(sizeOrder.includes(row.open_size_bb), `bad size on row ${rowNumber}`);
  assert(sourceDepthOrder.includes(row.depth_band), `bad depth on row ${rowNumber}`);
  assert(row.holecards_str === missingHand || handIndex.has(row.holecards_str), `bad hand on row ${rowNumber}`);

  const key = [row.cohort, row.opener_position, row.open_size_bb, row.depth_band, row.holecards_str].join('|');
  assert(!rowKeys.has(key), `duplicate cube row ${key}`);
  rowKeys.add(key);

  const counts = {
    opportunities: integer(row.opportunities, 'opportunities', rowNumber),
    folds: integer(row.folds, 'folds', rowNumber),
    calls: integer(row.calls, 'calls', rowNumber),
    small3bets: integer(row.small3bets, 'small3bets', rowNumber),
    jams: integer(row.jams, 'jams', rowNumber),
    other: integer(row.other, 'other', rowNumber),
  };
  const players = integer(row.unique_players, 'unique_players', rowNumber);
  assert(players <= counts.opportunities, `players exceed opportunities on row ${rowNumber}`);
  assert.equal(
    counts.folds + counts.calls + counts.small3bets + counts.jams + counts.other,
    counts.opportunities,
    `actions do not sum to opportunities on row ${rowNumber}`,
  );
  assert.equal(counts.other, 0, `unknown preflop action on row ${rowNumber}`);
  assertDate(row.first_hand_at, rowNumber);
  assertDate(row.last_hand_at, rowNumber);
  assert(Date.parse(`${row.first_hand_at}Z`) <= Date.parse(`${row.last_hand_at}Z`), `reversed dates on row ${rowNumber}`);

  const chart = charts[row.cohort][row.opener_position][row.open_size_bb][row.depth_band];
  addTotals(chart.totals, counts);
  addTotals(globalTotals, counts);
  if (row.holecards_str === missingHand) {
    chart.totals.missingOpportunities += counts.opportunities;
    globalTotals.missingOpportunities += counts.opportunities;
  } else {
    chart.totals.knownOpportunities += counts.opportunities;
    globalTotals.knownOpportunities += counts.opportunities;
    addCell(chart.cells[handIndex.get(row.holecards_str)], counts);
  }
  chart.firstHandAt = minDate(chart.firstHandAt, row.first_hand_at);
  chart.lastHandAt = maxDate(chart.lastHandAt, row.last_hand_at);
  firstHandAt = minDate(firstHandAt, row.first_hand_at);
  lastHandAt = maxDate(lastHandAt, row.last_hand_at);
}

for (const cohort of cohortOrder) {
  for (const position of positionOrder) {
    for (const size of sizeOrder) {
      const pooled = charts[cohort][position][size]['25-40'];
      for (const depth of sourceDepthOrder) addChart(pooled, charts[cohort][position][size][depth]);
    }
  }
}

validateCharts(charts);

const defaultSlice = { position: 'BTN', size: '2.0', depth: '25-40' };
const defaultDepthOpportunities = Object.fromEntries(sourceDepthOrder.map((depth) => [depth, sum(
  cohortOrder.map((cohort) => charts[cohort][defaultSlice.position][defaultSlice.size][depth].totals.opportunities),
)]));
const defaultDepthTotal = sum(Object.values(defaultDepthOpportunities));
const defaultDepthWeights = Object.fromEntries(sourceDepthOrder.map((depth) => [
  depth,
  round(defaultDepthOpportunities[depth] / defaultDepthTotal, 6),
]));

const summaries = Object.fromEntries(cohortOrder.map((cohort) => {
  const chart = charts[cohort][defaultSlice.position][defaultSlice.size][defaultSlice.depth];
  const standardizedRate = sum(sourceDepthOrder.map((depth) => {
    const depthChart = charts[cohort][defaultSlice.position][defaultSlice.size][depth];
    assert(depthChart.totals.opportunities > 0, `${cohort} has no data for default ${depth}`);
    return defaultDepthWeights[depth] * depthChart.totals.jams / depthChart.totals.opportunities;
  }));
  assert.equal(round(abi[cohort].loadUsd / abi[cohort].abiEntries, 2), abi[cohort].abiUsd, `${cohort} ABI mismatch`);
  return [cohort, {
    label: cohortMeta[cohort].label,
    ranks: cohortMeta[cohort].ranks,
    abiUsd: abi[cohort].abiUsd,
    abiPlayers: abi[cohort].abiPlayers,
    abiEntries: abi[cohort].abiEntries,
    abiLoadUsd: abi[cohort].loadUsd,
    standardizedJamPct: round(standardizedRate * 100, 3),
    standardizedOpportunities: chart.totals.opportunities,
    observedJamPct: pct(chart.totals.jams, chart.totals.opportunities),
    jams: chart.totals.jams,
  }];
}));

const correlationValues = cohortOrder.map((cohort) => ({
  cohort,
  abiUsd: summaries[cohort].abiUsd,
  standardizedJamPct: summaries[cohort].standardizedJamPct,
  opportunities: summaries[cohort].standardizedOpportunities,
}));
const correlation = {
  abiVsStandardizedJamPearson: round(pearson(
    correlationValues.map((item) => item.abiUsd),
    correlationValues.map((item) => item.standardizedJamPct),
  ), 4),
  method: 'Pearson r across four aggregate rank-at-hand cohorts; descriptive ecological association, not a causal training effect.',
  defaultSlice: {
    ...defaultSlice,
    depthStandardization: 'Common opportunity weights across all four cohorts in the three effective-stack bands.',
    depthWeights: defaultDepthWeights,
  },
  observations: correlationValues,
};

const payload = {
  version: 'resteal-rank-cube-20260715-v1',
  meta: {
    generatedOn: '2026-07-15',
    source: 'analytics.int_tracker_hand_joined',
    rankSource: 'analytics_mcp_readonly.mcp__check_rank_history',
    abiSource: 'analytics_mcp_readonly.mcp__fulltplayers',
    windowStartInclusive: windowStart,
    windowEndExclusive: windowEnd,
    rankAssignment: 'Exact rank interval at played_at; intervals are half-open and non-overlapping.',
    cohortOrder,
    cohorts: cohortMeta,
    positionOrder,
    sizeOrder,
    depthOrder,
    sourceDepthOrder,
    handOrder,
    missingHolecardsKey: missingHand,
    sampleThresholds: { unavailableBelow: 5, lowConfidenceBelow: 20, strongAtLeast: 50 },
    filters: {
      heroPosition: 'BB',
      facing: 'Exactly one preflop raiser (val_preflop_action_facing=4)',
      couldThreebet: true,
      limpers: 0,
      tablePlayers: [3, 9],
      effectiveStackBb: [25, 40],
      openerPositions: positionOrder,
      openSizesBb: sizeOrder.map(Number),
      openSizeToleranceBb: 0.05,
    },
    actionContract: {
      jam: "preflop_action='R' AND is_preflop_allin=1",
      small3bet: "preflop_action starts with R except exact direct jam; RC/RR remain here even if the later line reached all-in",
      call: 'preflop_action starts with C',
      fold: "preflop_action='F'",
    },
    aggregation: 'All percentages must be calculated from integer counts. Pooling sums counts, never percentages.',
    uniquePlayers: 'CSV unique_players is cell-level and non-additive; it is intentionally omitted from pooled frontend totals.',
    provenance: {
      rankIntervals: { rows: 6426, users: 2463, queryJobId: 'mcp_bq_683fbe8611e54520a69576dbcbae4b92', sha256: '488da5b060b13e953214596fdadf12c4554a0426b72a709c62a4ee3d7a965989' },
      handCube: { rows: rows.length, queryJobId: 'mcp_ch_job_d5206525489f4a89aeece3161579b4ea', sha256: sha256(csvBuffer) },
      abi: { queryJobId: 'mcp_bq_e10bac6af6714a819a4df59cafa2bc3d' },
    },
  },
  summaries,
  correlation,
  charts,
};

const diagnostics = buildDiagnostics(payload, rows.length, globalTotals, firstHandAt, lastHandAt);
const dataText = `window.PokerRestealRankData=${JSON.stringify(payload)};\n`;
const diagnosticsText = `${JSON.stringify(diagnostics, null, 2)}\n`;

if (checkOnly) {
  assert.equal(fs.readFileSync(dataPath, 'utf8'), dataText, 'resteal-rank-data.js is stale');
  assert.equal(fs.readFileSync(diagnosticsPath, 'utf8'), diagnosticsText, 'resteal-rank-diagnostics.json is stale');
  console.log(`resteal rank data is current: ${rows.length} CSV rows, ${diagnostics.global.opportunities} opportunities`);
} else {
  fs.writeFileSync(dataPath, dataText);
  fs.writeFileSync(diagnosticsPath, diagnosticsText);
  console.log(JSON.stringify({ dataPath, diagnosticsPath, diagnostics }, null, 2));
}

function precreateCharts() {
  return Object.fromEntries(cohortOrder.map((cohort) => [cohort,
    Object.fromEntries(positionOrder.map((position) => [position,
      Object.fromEntries(sizeOrder.map((size) => [size,
        Object.fromEntries(depthOrder.map((depth) => [depth, emptyChart()])),
      ])),
    ])),
  ]));
}

function emptyChart() {
  return {
    totals: emptyTotals(),
    cells: Array.from({ length: handOrder.length }, () => [0, 0, 0, 0, 0]),
    firstHandAt: null,
    lastHandAt: null,
  };
}

function emptyTotals() {
  return { opportunities: 0, folds: 0, calls: 0, small3bets: 0, jams: 0, knownOpportunities: 0, missingOpportunities: 0 };
}

function addTotals(target, source) {
  target.opportunities += source.opportunities;
  target.folds += source.folds;
  target.calls += source.calls;
  target.small3bets += source.small3bets;
  target.jams += source.jams;
  return target;
}

function addCell(target, counts) {
  target[0] += counts.opportunities;
  target[1] += counts.folds;
  target[2] += counts.calls;
  target[3] += counts.small3bets;
  target[4] += counts.jams;
}

function addChart(target, source) {
  addTotals(target.totals, source.totals);
  target.totals.knownOpportunities += source.totals.knownOpportunities;
  target.totals.missingOpportunities += source.totals.missingOpportunities;
  source.cells.forEach((cell, index) => cell.forEach((value, actionIndex) => { target.cells[index][actionIndex] += value; }));
  target.firstHandAt = minDate(target.firstHandAt, source.firstHandAt);
  target.lastHandAt = maxDate(target.lastHandAt, source.lastHandAt);
}

function validateCharts(tree) {
  for (const cohort of cohortOrder) for (const position of positionOrder) for (const size of sizeOrder) for (const depth of depthOrder) {
    const chart = tree[cohort][position][size][depth];
    const knownFromCells = sum(chart.cells.map((cell) => cell[0]));
    assert.equal(chart.cells.length, 169, `bad cell count for ${cohort}/${position}/${size}/${depth}`);
    assert.equal(knownFromCells, chart.totals.knownOpportunities, `known total mismatch for ${cohort}/${position}/${size}/${depth}`);
    assert.equal(chart.totals.knownOpportunities + chart.totals.missingOpportunities, chart.totals.opportunities, `coverage mismatch for ${cohort}/${position}/${size}/${depth}`);
    assert.equal(chart.totals.folds + chart.totals.calls + chart.totals.small3bets + chart.totals.jams, chart.totals.opportunities, `action total mismatch for ${cohort}/${position}/${size}/${depth}`);
    for (const cell of chart.cells) {
      assert.equal(cell.length, 5);
      assert(cell.every((value) => Number.isSafeInteger(value) && value >= 0));
      assert.equal(cell[1] + cell[2] + cell[3] + cell[4], cell[0]);
    }
  }
}

function buildDiagnostics(data, csvRows, sourceTotals, first, last) {
  const chartCoverage = [];
  for (const cohort of cohortOrder) for (const position of positionOrder) for (const size of sizeOrder) for (const depth of depthOrder) {
    const chart = data.charts[cohort][position][size][depth];
    const sampleSizes = chart.cells.map((cell) => cell[0]);
    chartCoverage.push({
      cohort, position, size, depth,
      opportunities: chart.totals.opportunities,
      jams: chart.totals.jams,
      jamPct: pct(chart.totals.jams, chart.totals.opportunities),
      knownOpportunities: chart.totals.knownOpportunities,
      knownCoveragePct: pct(chart.totals.knownOpportunities, chart.totals.opportunities),
      cellsN0: sampleSizes.filter((n) => n === 0).length,
      cellsNlt5: sampleSizes.filter((n) => n < 5).length,
      cellsNlt20: sampleSizes.filter((n) => n < 20).length,
      cellsNge50: sampleSizes.filter((n) => n >= 50).length,
    });
  }
  return {
    csvRows,
    csvSha256: data.meta.provenance.handCube.sha256,
    duplicateRows: csvRows - rowKeys.size,
    sourceChartsExpected: cohortOrder.length * positionOrder.length * sizeOrder.length * sourceDepthOrder.length,
    frontendChartsExpected: cohortOrder.length * positionOrder.length * sizeOrder.length * depthOrder.length,
    firstHandAt: first,
    lastHandAt: last,
    global: {
      opportunities: sourceTotals.opportunities,
      folds: sourceTotals.folds,
      calls: sourceTotals.calls,
      small3bets: sourceTotals.small3bets,
      jams: sourceTotals.jams,
      jamPct: pct(sourceTotals.jams, sourceTotals.opportunities),
      knownOpportunities: sourceTotals.knownOpportunities,
      missingOpportunities: sourceTotals.missingOpportunities,
      knownCoveragePct: pct(sourceTotals.knownOpportunities, sourceTotals.opportunities),
    },
    summaries: data.summaries,
    correlation: data.correlation,
    chartCoverage,
  };
}

function integer(value, field, rowNumber) {
  assert(/^\d+$/.test(value), `${field} is not an unsigned integer on row ${rowNumber}`);
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed), `${field} is unsafe on row ${rowNumber}`);
  return parsed;
}

function assertDate(value, rowNumber) {
  const timestamp = Date.parse(`${value}Z`);
  assert(Number.isFinite(timestamp), `bad date on row ${rowNumber}`);
  assert(timestamp >= Date.parse(windowStart) && timestamp < Date.parse(windowEnd), `date outside window on row ${rowNumber}`);
}

function minDate(current, candidate) { return current === null || candidate < current ? candidate : current; }
function maxDate(current, candidate) { return current === null || candidate > current ? candidate : current; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function round(value, places) { const factor = 10 ** places; return Math.round(value * factor) / factor; }
function pct(numerator, denominator) { return denominator ? round(100 * numerator / denominator, 3) : null; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function pearson(xs, ys) {
  assert.equal(xs.length, ys.length);
  const xMean = sum(xs) / xs.length;
  const yMean = sum(ys) / ys.length;
  const numerator = sum(xs.map((x, index) => (x - xMean) * (ys[index] - yMean)));
  const xDenominator = Math.sqrt(sum(xs.map((x) => (x - xMean) ** 2)));
  const yDenominator = Math.sqrt(sum(ys.map((y) => (y - yMean) ** 2)));
  return numerator / (xDenominator * yDenominator);
}
