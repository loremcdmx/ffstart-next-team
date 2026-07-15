#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(directory, '../data/resteal-rank-data.js');
const diagnosticsPath = path.resolve(directory, '../data/resteal-rank-diagnostics.json');
const sqlPath = path.join(directory, 'resteal-rank-cube.sql');

const rebuild = spawnSync(process.execPath, [path.join(directory, 'build-resteal-rank-data.mjs'), '--check'], { encoding: 'utf8' });
assert.equal(rebuild.status, 0, rebuild.stderr || rebuild.stdout);

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(dataPath, 'utf8'), context, { filename: dataPath });
const data = context.window.PokerRestealRankData;
const diagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'));
const sql = fs.readFileSync(sqlPath, 'utf8');

assert(data, 'window.PokerRestealRankData is missing');
assert.equal(data.version, 'resteal-rank-cube-20260715-v1');
assert.deepEqual(Array.from(data.meta.cohortOrder), ['novice', 'league3', 'league2', 'league1']);
assert.deepEqual(Array.from(data.meta.positionOrder), ['CO', 'BTN']);
assert.deepEqual(Array.from(data.meta.sizeOrder), ['2.0', '2.5', '3.0']);
assert.deepEqual(Array.from(data.meta.depthOrder), ['25-40', '25-30', '30-35', '35-40']);
assert.equal(data.meta.handOrder.length, 169);
assert.equal(new Set(data.meta.handOrder).size, 169);
assert.match(data.meta.actionContract.jam, /preflop_action='R'.*is_preflop_allin=1/);
assert.match(sql, /x\.4 = 'R' AND x\.5 = 1, 'jam'/);
assert.match(sql, /startsWith\(x\.4, 'R'\), 'small3bet'/);

let frontendCharts = 0;
for (const cohort of data.meta.cohortOrder) {
  const summary = data.summaries[cohort];
  assert(summary);
  assert.equal(Math.round(100 * summary.abiLoadUsd / summary.abiEntries) / 100, summary.abiUsd);
  assert(summary.standardizedOpportunities > 0);
  assert(summary.standardizedJamPct >= 0 && summary.standardizedJamPct <= 100);
  for (const position of data.meta.positionOrder) for (const size of data.meta.sizeOrder) {
    const sourceCharts = data.meta.sourceDepthOrder.map((depth) => data.charts[cohort][position][size][depth]);
    const pooled = data.charts[cohort][position][size]['25-40'];
    for (const depth of data.meta.depthOrder) {
      frontendCharts += 1;
      validateChart(data.charts[cohort][position][size][depth], `${cohort}/${position}/${size}/${depth}`);
    }
    for (const key of ['opportunities', 'folds', 'calls', 'small3bets', 'jams', 'knownOpportunities', 'missingOpportunities']) {
      assert.equal(pooled.totals[key], sourceCharts.reduce((total, chart) => total + chart.totals[key], 0), `bad pooled ${key}`);
    }
    pooled.cells.forEach((cell, index) => cell.forEach((value, actionIndex) => {
      assert.equal(value, sourceCharts.reduce((total, chart) => total + chart.cells[index][actionIndex], 0), `bad pooled cell ${index}/${actionIndex}`);
    }));
  }
}
assert.equal(frontendCharts, diagnostics.frontendChartsExpected);
assert.equal(diagnostics.duplicateRows, 0);
assert.equal(diagnostics.csvRows, data.meta.provenance.handCube.rows);
assert.equal(diagnostics.global.opportunities, diagnostics.global.folds + diagnostics.global.calls + diagnostics.global.small3bets + diagnostics.global.jams);
assert.equal(diagnostics.global.knownOpportunities + diagnostics.global.missingOpportunities, diagnostics.global.opportunities);

// Frozen snapshot anchors: these prevent a query/action/rank contract change from
// silently shipping as a routine rebuild.
assert.equal(diagnostics.csvRows, 11406);
assert.equal(data.meta.provenance.handCube.sha256, '8d33ef87b759d04ee3d15257809db8922820c99c038c9ef3933f47f70427eb5f');
assert.deepEqual(
  [diagnostics.global.opportunities, diagnostics.global.folds, diagnostics.global.calls, diagnostics.global.small3bets, diagnostics.global.jams],
  [1155121, 368413, 630226, 85209, 71273],
);
assert.deepEqual(
  Array.from(data.meta.cohortOrder, (cohort) => [
    data.summaries[cohort].standardizedOpportunities,
    data.summaries[cohort].jams,
    data.summaries[cohort].standardizedJamPct,
  ]),
  [
    [4129, 73, 1.769],
    [251737, 12450, 4.951],
    [204093, 18827, 9.201],
    [77388, 7923, 10.273],
  ],
);

const xs = data.meta.cohortOrder.map((cohort) => data.summaries[cohort].abiUsd);
const ys = data.meta.cohortOrder.map((cohort) => data.summaries[cohort].standardizedJamPct);
assert.equal(round(pearson(xs, ys), 4), data.correlation.abiVsStandardizedJamPearson);
assert.equal(data.correlation.abiVsStandardizedJamPearson, 0.8565);
assert.equal(data.correlation.observations.length, 4);
assert.match(data.correlation.method, /not a causal/i);

console.log(`resteal rank cube passed: ${diagnostics.csvRows} rows, ${diagnostics.global.opportunities} opportunities, ${diagnostics.global.jams} direct jams`);

function validateChart(chart, label) {
  assert(chart, `missing chart ${label}`);
  assert.equal(chart.cells.length, 169, `bad cell count ${label}`);
  assert.equal(chart.totals.knownOpportunities + chart.totals.missingOpportunities, chart.totals.opportunities, `bad coverage ${label}`);
  assert.equal(chart.totals.folds + chart.totals.calls + chart.totals.small3bets + chart.totals.jams, chart.totals.opportunities, `bad actions ${label}`);
  assert.equal(chart.cells.reduce((total, cell) => total + cell[0], 0), chart.totals.knownOpportunities, `bad known total ${label}`);
  for (const cell of chart.cells) {
    assert.equal(cell.length, 5);
    assert(cell.every((value) => Number.isSafeInteger(value) && value >= 0));
    assert.equal(cell[1] + cell[2] + cell[3] + cell[4], cell[0]);
  }
}

function pearson(xs, ys) {
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, value, index) => sum + (value - xMean) * (ys[index] - yMean), 0);
  const xScale = Math.sqrt(xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
  const yScale = Math.sqrt(ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
  return numerator / (xScale * yScale);
}

function round(value, places) { const factor = 10 ** places; return Math.round(value * factor) / factor; }
