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
const Raw = context.window.PokerBbCallRangeData;
const validCodes = new Set(["R", "B", "C", "F"]);

assert.ok(Data);
assert.ok(Recall);
assert.ok(Raw);
assert.deepEqual(Array.from(Recall.states), ["F", "C", "B", "R"]);
assert.equal(Recall.normalizeState("unknown"), "F");
assert.equal(Recall.normalizeState("B"), "B");
assert.equal(Recall.normalizeState("M"), "F");
assert.equal(Recall.nextState("F"), "C");
assert.equal(Recall.nextState("R"), "F");

let sawSourceRaiseCallMix = false;
let sawMemoryMix = false;

for (const sizeKey of ["2_0", "2_5", "3_0"]) {
  for (const position of ["EP", "MP", "HJ", "CO", "BTN"]) {
    const expected = {};
    for (let row = 0; row < 13; row += 1) {
      for (let column = 0; column < 13; column += 1) {
        const hand = Data.matrixHandAt(row, column);
        const sourceCode = Data.rangeCellFor(sizeKey, position, hand).code;
        const code = Recall.normalizeState(sourceCode);
        assert.ok(validCodes.has(code), `${sizeKey}:${position}:${hand}:${code}`);
        expected[hand] = code;
        sawSourceRaiseCallMix ||= sourceCode === "B";
        sawMemoryMix ||= code === "B" || code === "M";
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
    const sourceFoldCombos = Object.entries(expected).reduce((total, [hand, code]) => total + (code === "F" ? Recall.handComboCount(hand) : 0), 0);
    assert.equal(empty.correct, sourceFolds, `${sizeKey}:${position}:empty draft`);
    assert.equal(empty.correctCombos, sourceFoldCombos, `${sizeKey}:${position}:empty combo draft`);
    assert.equal(
      empty.missedDefenseCombos + empty.extraDefenseCombos + empty.wrongActionCombos,
      empty.wrongCombos,
      `${sizeKey}:${position}:combo error partition`
    );
  }
}

assert.equal(sawSourceRaiseCallMix, true);
assert.equal(sawMemoryMix, true);

let rawRaiseCallMixes = 0;
let rawCallFoldMixes = 0;
for (const [scenarioKey, codes] of Object.entries(Raw.scenarios)) {
  const [sizeKey, position] = scenarioKey.split(":");
  Array.from(codes).forEach((sourceCode, index) => {
    if (sourceCode !== "B" && sourceCode !== "M") return;
    const row = Math.floor(index / 13);
    const column = index % 13;
    const hand = Data.matrixHandAt(row, column);
    const memoryCode = Recall.normalizeState(Data.rangeCellFor(sizeKey, position, hand).code);
    assert.equal(
      memoryCode,
      sourceCode === "B" ? "B" : "F",
      `${scenarioKey}:${hand}:raise/call stays mixed, call/fold becomes a memory fold`
    );
    rawRaiseCallMixes += sourceCode === "B" ? 1 : 0;
    rawCallFoldMixes += sourceCode === "M" ? 1 : 0;
  });
}
assert.equal(rawRaiseCallMixes, 87);
assert.equal(rawCallFoldMixes, 7);
assert.equal(Data.rangeCellFor("2_0", "BTN", "A2s").code, "B");
assert.equal(Data.rangeCellFor("2_0", "BTN", "A5s").code, "B");
assert.equal(Data.rangeCellFor("2_0", "BTN", "94o").code, "F");
assert.equal(Recall.handComboCount("AA"), 6);
assert.equal(Recall.handComboCount("A5s"), 4);
assert.equal(Recall.handComboCount("K4o"), 12);
assert.equal(Recall.matchingComboFraction("C", "C"), 1);
assert.equal(Recall.matchingComboFraction("B", "B"), 1);
assert.equal(Recall.matchingComboFraction("C", "B"), 0.5);
assert.equal(Recall.matchingComboFraction("R", "B"), 0.5);
assert.equal(Recall.matchingComboFraction("F", "R"), 0);

const mixedExpected = { A5s: "B", T6o: "M", K4o: "C", AA: "R", "72o": "F" };
const mixedGrade = Recall.gradeDraft({ A5s: "F", T6o: "F", K4o: "R", AA: "R", "72o": "C" }, mixedExpected);
assert.equal(mixedGrade.correct, 2);
assert.equal(mixedGrade.totalCombos, 46);
assert.equal(mixedGrade.correctCombos, 18);
assert.equal(mixedGrade.wrongCombos, 28);
assert.equal(mixedGrade.missedDefenseCombos, 4);
assert.equal(mixedGrade.extraDefenseCombos, 12);
assert.equal(mixedGrade.wrongActionCombos, 12);
assert.equal(mixedGrade.missedDefense.length, 1);
assert.equal(mixedGrade.extraDefense.length, 1);
assert.equal(mixedGrade.wrongAction.length, 1);
assert.deepEqual(Array.from(mixedGrade.missedDefense, (error) => error.hand), ["A5s"]);
assert.deepEqual(Array.from(mixedGrade.extraDefense, (error) => error.hand), ["72o"]);
assert.deepEqual(Array.from(mixedGrade.wrongAction, (error) => error.hand), ["K4o"]);
assert.equal(mixedGrade.wrongAction[0].wrongActionCombos, 12);

assert.equal(Recall.reviewState("B", "B"), "correct");
assert.equal(Recall.reviewState("B", "F"), "error");
assert.equal(Recall.reviewState("C", "M"), "error");
assert.equal(Recall.errorType("F", "B"), "missed");
assert.equal(Recall.errorType("C", "B"), "action");
assert.equal(Recall.errorType("F", "M"), "");
assert.equal(Recall.errorType("C", "F"), "extra");
assert.equal(Recall.errorType("C", "M"), "extra");
assert.equal(Recall.errorType("B", "F"), "extra");
assert.equal(Recall.errorType("R", "R"), "");

const btnMinraiseExpected = {
  A5s: Data.rangeCellFor("2_0", "BTN", "A5s").code,
  K4o: Data.rangeCellFor("2_0", "BTN", "K4o").code,
  "94o": Data.rangeCellFor("2_0", "BTN", "94o").code,
  AA: Data.rangeCellFor("2_0", "BTN", "AA").code
};
const btnMinraiseGrade = Recall.gradeDraft({ A5s: "C", K4o: "F", "94o": "C", AA: "C" }, btnMinraiseExpected);
assert.equal(btnMinraiseGrade.totalCombos, 34);
assert.equal(btnMinraiseGrade.correctCombos, 2);
assert.equal(btnMinraiseGrade.wrongCombos, 32);
assert.equal(btnMinraiseGrade.missedDefenseCombos, 12);
assert.equal(btnMinraiseGrade.extraDefenseCombos, 12);
assert.equal(btnMinraiseGrade.wrongActionCombos, 8);
assert.equal(btnMinraiseGrade.missedDefenseCombos + btnMinraiseGrade.extraDefenseCombos + btnMinraiseGrade.wrongActionCombos, btnMinraiseGrade.wrongCombos);
assert.deepEqual(Array.from(btnMinraiseGrade.missedDefense, (error) => error.hand), ["K4o"]);
assert.deepEqual(Array.from(btnMinraiseGrade.extraDefense, (error) => error.hand), ["94o"]);
assert.deepEqual(Array.from(btnMinraiseGrade.wrongAction, (error) => error.hand), ["A5s", "AA"]);
assert.equal(btnMinraiseGrade.wrongAction[0].wrongActionCombos, 2);

console.log("BB call defense recall: ok");
