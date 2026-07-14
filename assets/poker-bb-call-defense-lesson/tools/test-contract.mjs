import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rangeSource = fs.readFileSync(path.join(root, "range-data.js"), "utf8");
const source = fs.readFileSync(path.join(root, "data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(rangeSource, context);
vm.runInNewContext(source, context);
const Data = context.window.PokerBbCallData;

assert.ok(Data);
assert.deepEqual(Array.from(Data.physicalPages), [10, 11]);
assert.equal(Data.firstSpot.correct, "call");
assert.equal(Data.firstSpot.options.find((option) => option.key === "raise").feedback, "Стандартное решение тут колл.");
assert.equal(Data.practiceSpots.length, 21);
assert.deepEqual([Data.matrixCellForHand("TT").row, Data.matrixCellForHand("TT").column], [4, 4]);
assert.deepEqual([Data.matrixCellForHand("QTs").row, Data.matrixCellForHand("QTs").column], [2, 4]);
assert.deepEqual([Data.matrixCellForHand("K4o").row, Data.matrixCellForHand("K4o").column], [10, 1]);
assert.deepEqual([Data.matrixCellForHand("AKo").row, Data.matrixCellForHand("AKo").column], [1, 0]);
assert.throws(() => Data.matrixCellForHand("AK"));
assert.throws(() => Data.matrixCellForHand("TTs"));
assert.match(Data.rangeDataVersion, /source-png-pages-10-11/);
assert.equal(100 - Data.rangeScenarios["2_5"].BTN.foldPct, 55);
assert.equal(100 - Data.rangeScenarios["3_0"].BTN.foldPct, 27);
assert.equal(Data.sizes["2_5"].potOddsPct, 23.1);
assert.equal(Data.sizes["3_0"].potOddsPct, 26.7);

for (const sizeKey of ["2_0", "2_5", "3_0"]) {
  for (const position of ["EP", "MP", "HJ", "CO", "BTN"]) {
    const scenario = Data.rangeScenarios[sizeKey][position];
    assert.ok(scenario);
    assert.ok(scenario.foldPct >= 0 && scenario.foldPct <= 100);
    const chartPath = path.join(root, scenario.chart);
    assert.ok(fs.existsSync(chartPath), scenario.chart);
    const png = fs.readFileSync(chartPath);
    assert.equal(png.readUInt32BE(16), 470, scenario.chart + " width");
    assert.equal(png.readUInt32BE(20), 470, scenario.chart + " height");
    const hands = new Set();
    const actionCombos = { raise: 0, call: 0, fold: 0, total: 0 };
    for (let row = 0; row < 13; row += 1) {
      for (let column = 0; column < 13; column += 1) {
        const hand = Data.matrixHandAt(row, column);
        const cell = Data.rangeCellFor(sizeKey, position, hand);
        const combos = row === column ? 6 : row < column ? 4 : 12;
        hands.add(hand);
        assert.equal(cell.raisePct + cell.callPct + cell.foldPct, 100, sizeKey + ":" + position + ":" + hand);
        actionCombos.raise += combos * cell.raisePct / 100;
        actionCombos.call += combos * cell.callPct / 100;
        actionCombos.fold += combos * cell.foldPct / 100;
        actionCombos.total += combos;
      }
    }
    assert.equal(hands.size, 169, sizeKey + ":" + position);
    const extractedFoldPct = actionCombos.fold / actionCombos.total * 100;
    assert.ok(Math.abs(extractedFoldPct - scenario.foldPct) <= 4, sizeKey + ":" + position + " extracted fold aggregate");
    if (Number.isFinite(scenario.threeBetPct)) {
      const extractedRaisePct = actionCombos.raise / actionCombos.total * 100;
      assert.ok(Math.abs(extractedRaisePct - scenario.threeBetPct) <= 1, sizeKey + ":" + position + " extracted 3-bet aggregate");
    }
  }
}

for (const spot of [Data.firstSpot, ...Data.practiceSpots]) {
  assert.equal(spot.table.heroPosition, "BB");
  assert.equal(spot.table.anteBb, 1);
  assert.equal(spot.options.length, 3);
  assert.equal(spot.options.filter((option) => option.correct).length, 1);
  assert.equal(spot.options.find((option) => option.key === "raise").label, "3-бет");
  assert.doesNotMatch(spot.table.historyLine, /UTG/);
  assert.match(spot.sourceCell, /100%/);
  assert.ok(Number.isInteger(spot.sourceChartCell.row));
  assert.ok(Number.isInteger(spot.sourceChartCell.column));
  assert.ok(spot.sourceChartCell.row >= 0 && spot.sourceChartCell.row <= 12);
  assert.ok(spot.sourceChartCell.column >= 0 && spot.sourceChartCell.column <= 12);
  assert.equal(spot.sourceChart, Data.rangeScenarios[spot.sizeKey][spot.openPosition].chart);
  const sourceCell = Data.rangeCellFor(spot.sizeKey, spot.openPosition, spot.hand);
  const expectedPct = spot.correct === "raise" ? sourceCell.raisePct : spot.correct === "call" ? sourceCell.callPct : sourceCell.foldPct;
  assert.equal(expectedPct, 100, spot.id + " structured source action");
}

assert.equal(Data.positions.EP.tableSeat, "UTG");
assert.ok(Data.firstSpot.table.seats.some((seat) => seat.label === "UTG"));
assert.ok(Data.practiceSpots.find((spot) => spot.id === "qq-mp-25").table.actionLine.includes("MP open 2.5 BB"));

console.log("BB call defense content contract: ok");
