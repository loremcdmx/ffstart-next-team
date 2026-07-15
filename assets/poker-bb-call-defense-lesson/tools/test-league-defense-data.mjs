import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const lessonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(lessonRoot, "data/ff-bb-defense-ranks.json");
assert.ok(fs.existsSync(dataPath), "missing data/ff-bb-defense-ranks.json");

const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
assert.ok(payload && typeof payload === "object", "payload");
assert.ok(payload.meta && typeof payload.meta === "object", "meta");
assert.ok(payload.aggregates && typeof payload.aggregates === "object", "aggregates");
assert.ok(payload.hands && typeof payload.hands === "object", "hands");

const cohorts = ["novice", "league3", "league2", "league1"];
const positions = ["EP", "MP", "HJ", "CO", "BTN"];
const sizes = ["2_0", "2_5", "3_0"];
assert.deepEqual(Object.keys(payload.meta.cohorts).sort(), cohorts.slice().sort(), "cohort metadata");
for (const cohort of cohorts) {
  assert.equal(typeof payload.meta.cohorts[cohort].label, "string", cohort + " label");
  assert.ok(payload.meta.cohorts[cohort].label.length > 0, cohort + " label");
  assert.equal(typeof payload.meta.cohorts[cohort].detail, "string", cohort + " detail");
  assert.ok(payload.meta.cohorts[cohort].detail.length > 0, cohort + " detail");
  assert.ok(Array.isArray(payload.meta.cohorts[cohort].ranks) && payload.meta.cohorts[cohort].ranks.length > 0, cohort + " ranks");
}
assert.deepEqual(payload.meta.cohorts.novice.ranks, [15, 16, 17, 18], "novice ranks include rank 15");
assert.deepEqual(payload.meta.cohorts.league3.ranks, [11, 12, 13, 14, 15], "league 3 ranks");
assert.ok(payload.meta.cohorts.novice.ranks.includes(15) && payload.meta.cohorts.league3.ranks.includes(15), "rank 15 intentionally overlaps cohorts");
assert.deepEqual(payload.meta.cohorts.league2.ranks, [6, 7, 8, 9, 10], "league 2 ranks");
assert.deepEqual(payload.meta.cohorts.league1.ranks, [1, 2, 3, 4, 5], "league 1 ranks");
assert.deepEqual(payload.meta.positions, positions, "position metadata");
assert.deepEqual(payload.meta.sizes, [2, 2.5, 3], "size metadata");

for (const key of ["minChartDisplayN", "minCellDisplayN", "minCellReliableN"]) {
  assert.ok(Number.isInteger(payload.meta[key]) && payload.meta[key] > 0, "meta." + key);
}
assert.ok(payload.meta.minCellReliableN >= payload.meta.minCellDisplayN, "reliable threshold is not below display threshold");
assert.match(payload.meta.cohortPolicy, /Rank 15 intentionally appears in both novice/);
assert.ok(payload.meta.window && typeof payload.meta.window.label === "string" && payload.meta.window.label.length > 0, "window label");
assert.ok(Number.isFinite(Date.parse(payload.meta.window.startInclusive)), "window start");
assert.ok(Number.isFinite(Date.parse(payload.meta.window.endExclusive)), "window end");
assert.ok(Date.parse(payload.meta.window.startInclusive) < Date.parse(payload.meta.window.endExclusive), "window ordering");

assert.equal(typeof payload.meta.abiMetric, "string", "ABI definition");
assert.deepEqual(Object.keys(payload.meta.abi).sort(), cohorts.slice().sort(), "ABI cohort metadata");
for (const cohort of cohorts) {
  const abi = payload.meta.abi[cohort];
  for (const key of ["players", "entries"]) {
    assert.ok(Number.isInteger(abi[key]) && abi[key] > 0, "abi." + cohort + "." + key);
  }
  assert.ok(Number.isFinite(abi.loadUsd) && abi.loadUsd > 0, "abi." + cohort + ".loadUsd");
  assert.ok(Number.isFinite(abi.abiUsd) && abi.abiUsd > 0, "abi." + cohort + ".abiUsd");
  assert.ok(Math.abs(abi.loadUsd / abi.entries - abi.abiUsd) <= 0.01, "abi." + cohort + " weighted ABI");
}

const correlation = payload.meta.abiCorrelation;
assert.ok(correlation && typeof correlation === "object", "ABI correlation metadata");
assert.equal(correlation.cohortCount, cohorts.length, "ABI correlation cohort count");
assert.equal(typeof correlation.method, "string", "ABI correlation method");
assert.equal(typeof correlation.caveat, "string", "ABI correlation caveat");
assert.ok(Number.isFinite(correlation.pearsonR) && correlation.pearsonR >= -1 && correlation.pearsonR <= 1, "Pearson r");
for (const key of ["abiFrom", "abiTo"]) {
  assert.ok(Number.isFinite(correlation[key]) && correlation[key] > 0, "abiCorrelation." + key);
}
for (const key of ["defendFrom", "defendTo"]) {
  assert.ok(Number.isFinite(correlation[key]) && correlation[key] >= 0 && correlation[key] <= 100, "abiCorrelation." + key);
}
assert.ok(correlation.abiTo > correlation.abiFrom, "ABI endpoints are ordered");

function assertCount(value, label) {
  assert.ok(Number.isInteger(value) && value >= 0, label);
}

const aggregateKeys = Object.keys(payload.aggregates);
assert.equal(aggregateKeys.length, cohorts.length * positions.length * sizes.length, "4 cohorts x 5 positions x 3 sizes");
const expectedAggregateKeys = new Set();
for (const cohort of cohorts) {
  for (const position of positions) {
    for (const size of sizes) expectedAggregateKeys.add([cohort, position, size].join(":"));
  }
}
assert.deepEqual(new Set(aggregateKeys), expectedAggregateKeys, "aggregate key cube");

for (const key of aggregateKeys) {
  const row = payload.aggregates[key];
  for (const field of ["n", "players", "folds", "calls", "threeBets", "cardKnownN"]) {
    assertCount(row[field], key + "." + field);
  }
  assert.equal(row.folds + row.calls + row.threeBets, row.n, key + " action reconciliation");
  assert.ok(row.players <= row.n, key + " players <= decisions");
  assert.ok(row.cardKnownN <= row.n, key + " cardKnownN <= n");
}

assert.equal(payload.meta.coverage.aggregateCells, aggregateKeys.length, "aggregate coverage metadata");
assert.equal(payload.meta.coverage.expectedHandClassesPerChart, 169, "hand-class coverage metadata");
assert.equal(payload.meta.coverage.observedHandCells, Object.keys(payload.hands).length, "observed hand-cell metadata");

const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const handClasses = new Set();
for (let row = 0; row < ranks.length; row += 1) {
  for (let column = 0; column < ranks.length; column += 1) {
    handClasses.add(row === column
      ? ranks[row] + ranks[column]
      : row < column
        ? ranks[row] + ranks[column] + "s"
        : ranks[column] + ranks[row] + "o");
  }
}
assert.equal(handClasses.size, 169, "canonical 13x13 hand classes");

const observedHands = new Set();
const handSums = new Map(aggregateKeys.map((key) => [key, {
  n: 0,
  folds: 0,
  calls: 0,
  threeBets: 0,
  classes: new Set()
}]));

for (const [key, row] of Object.entries(payload.hands)) {
  const parts = key.split(":");
  assert.equal(parts.length, 4, key + " key shape");
  const [cohort, position, size, hand] = parts;
  const aggregateKey = [cohort, position, size].join(":");
  assert.ok(expectedAggregateKeys.has(aggregateKey), key + " aggregate exists");
  assert.ok(handClasses.has(hand), key + " canonical hand class");
  for (const field of ["n", "players", "folds", "calls", "threeBets"]) {
    assertCount(row[field], key + "." + field);
  }
  assert.equal(row.folds + row.calls + row.threeBets, row.n, key + " action reconciliation");
  assert.ok(row.players <= row.n, key + " players <= decisions");
  const sum = handSums.get(aggregateKey);
  assert.ok(!sum.classes.has(hand), key + " is unique");
  sum.classes.add(hand);
  sum.n += row.n;
  sum.folds += row.folds;
  sum.calls += row.calls;
  sum.threeBets += row.threeBets;
  observedHands.add(hand);
}

assert.deepEqual(observedHands, handClasses, "dataset covers all 169 hand classes");
for (const hand of handClasses) {
  const row = payload.hands["novice:BTN:2_0:" + hand];
  assert.ok(row && row.n >= payload.meta.minCellReliableN, "novice BTN/2 BB is reliable for " + hand);
}
let totalN = 0;
let totalCardKnownN = 0;
for (const key of aggregateKeys) {
  const aggregate = payload.aggregates[key];
  const sum = handSums.get(key);
  assert.ok(sum.classes.size <= 169, key + " hand-class count");
  assert.equal(sum.n, aggregate.cardKnownN, key + " known-card reconciliation");
  assert.ok(sum.folds <= aggregate.folds, key + " known folds <= all folds");
  assert.ok(sum.calls <= aggregate.calls, key + " known calls <= all calls");
  assert.ok(sum.threeBets <= aggregate.threeBets, key + " known 3-bets <= all 3-bets");
  if (aggregate.cardKnownN === aggregate.n) {
    assert.equal(sum.folds, aggregate.folds, key + " full-coverage folds");
    assert.equal(sum.calls, aggregate.calls, key + " full-coverage calls");
    assert.equal(sum.threeBets, aggregate.threeBets, key + " full-coverage 3-bets");
  }
  totalN += aggregate.n;
  totalCardKnownN += aggregate.cardKnownN;
}
assert.equal(payload.meta.coverage.totalN, totalN, "total decision coverage");
assert.equal(payload.meta.coverage.cardKnownN, totalCardKnownN, "known-card coverage");
assert.ok(Math.abs(payload.meta.coverage.cardKnownPct - totalCardKnownN / totalN * 100) <= 0.01, "known-card percentage");

console.log("BB league-defense data contract: ok");
