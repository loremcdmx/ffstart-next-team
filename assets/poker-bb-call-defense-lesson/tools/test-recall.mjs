import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { window: {} };
for (const file of ["range-data.js", "data.js", "recall.js"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}

const Data = context.window.PokerBbCallData;
const Recall = context.window.PokerBbCallRecall;
const validCodes = new Set(["R", "C", "F", "B", "M"]);

assert.ok(Data);
assert.ok(Recall);
assert.deepEqual(Array.from(Recall.states), ["F", "C", "R", "B", "M"]);
assert.equal(Recall.normalizeState("unknown"), "F");
assert.equal(Recall.nextState("F"), "C");

let sawRaiseCallMix = false;
let sawCallFoldMix = false;

for (const sizeKey of ["2_0", "2_5", "3_0"]) {
  for (const position of ["EP", "MP", "HJ", "CO", "BTN"]) {
    const expected = {};
    for (let row = 0; row < 13; row += 1) {
      for (let column = 0; column < 13; column += 1) {
        const hand = Data.matrixHandAt(row, column);
        const code = Data.rangeCellFor(sizeKey, position, hand).code;
        assert.ok(validCodes.has(code), `${sizeKey}:${position}:${hand}:${code}`);
        expected[hand] = code;
        sawRaiseCallMix ||= code === "B";
        sawCallFoldMix ||= code === "M";
      }
    }

    const exact = Recall.gradeDraft(expected, expected);
    assert.equal(exact.total, 169);
    assert.equal(exact.correct, 169);
    assert.equal(exact.totalCombos, 1326);
    assert.equal(exact.correctCombos, 1326);
    assert.equal(exact.wrongCombos, 0);
    assert.equal(exact.errors.length, 0);

    const empty = Recall.gradeDraft({}, expected);
    const sourceFolds = Object.values(expected).filter((code) => code === "F").length;
    const sourceFoldCombos = Object.entries(expected).reduce((total, [hand, code]) => {
      const overlap = code === "F" ? 1 : code === "M" ? 0.5 : 0;
      return total + Recall.handComboCount(hand) * overlap;
    }, 0);
    assert.equal(empty.correct, sourceFolds, `${sizeKey}:${position}:empty draft`);
    assert.equal(empty.correctCombos, sourceFoldCombos, `${sizeKey}:${position}:empty combo draft`);
    assert.equal(
      empty.missedDefenseCombos + empty.extraDefenseCombos + empty.wrongActionCombos,
      empty.wrongCombos,
      `${sizeKey}:${position}:combo error partition`
    );
  }
}

assert.equal(sawRaiseCallMix, true);
assert.equal(sawCallFoldMix, true);
assert.equal(Recall.handComboCount("AA"), 6);
assert.equal(Recall.handComboCount("A5s"), 4);
assert.equal(Recall.handComboCount("K4o"), 12);
assert.equal(Recall.matchingComboFraction("C", "B"), 0.5);
assert.equal(Recall.matchingComboFraction("F", "M"), 0.5);

const mixedExpected = { A5s: "B", T6o: "M", K4o: "C", AA: "R", "72o": "F" };
const mixedGrade = Recall.gradeDraft({ A5s: "C", T6o: "F", K4o: "R", AA: "R", "72o": "C" }, mixedExpected);
assert.equal(mixedGrade.correct, 1);
assert.equal(mixedGrade.totalCombos, 46);
assert.equal(mixedGrade.correctCombos, 14);
assert.equal(mixedGrade.wrongCombos, 32);
assert.equal(mixedGrade.missedDefenseCombos, 6);
assert.equal(mixedGrade.extraDefenseCombos, 12);
assert.equal(mixedGrade.wrongActionCombos, 14);
assert.equal(mixedGrade.missedDefense.length, 1);
assert.equal(mixedGrade.extraDefense.length, 1);
assert.equal(mixedGrade.wrongAction.length, 2);
assert.deepEqual(Array.from(mixedGrade.missedDefense, (error) => error.hand), ["T6o"]);
assert.deepEqual(Array.from(mixedGrade.extraDefense, (error) => error.hand), ["72o"]);
assert.deepEqual(Array.from(mixedGrade.wrongAction, (error) => error.hand), ["A5s", "K4o"]);
assert.equal(mixedGrade.wrongAction[0].wrongActionCombos, 2);
assert.equal(mixedGrade.wrongAction[1].wrongActionCombos, 12);

const splitGrade = Recall.gradeDraft({ T6o: "R" }, { T6o: "M" });
assert.equal(splitGrade.totalCombos, 12);
assert.equal(splitGrade.correctCombos, 0);
assert.equal(splitGrade.extraDefenseCombos, 6);
assert.equal(splitGrade.wrongActionCombos, 6);
assert.deepEqual(Array.from(splitGrade.extraDefense, (error) => error.hand), ["T6o"]);
assert.deepEqual(Array.from(splitGrade.wrongAction, (error) => error.hand), ["T6o"]);
assert.equal(Recall.reviewState("B", "B"), "correct");
assert.equal(Recall.reviewState("C", "M"), "error");
assert.equal(Recall.errorType("F", "M"), "missed");
assert.equal(Recall.errorType("C", "F"), "extra");
assert.equal(Recall.errorType("C", "M"), "action");
assert.equal(Recall.errorType("R", "R"), "");

console.log("BB call defense recall: ok");
