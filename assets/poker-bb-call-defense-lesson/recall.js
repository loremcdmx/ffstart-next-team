(function (root) {
  "use strict";

  var STATES = ["F", "C", "R", "B", "M"];
  var META = {
    F: { label: "пас", shortLabel: "Пас" },
    C: { label: "колл", shortLabel: "Колл" },
    R: { label: "3-бет", shortLabel: "3-бет" },
    B: { label: "микс 3-бет / колл", shortLabel: "3-бет / колл" },
    M: { label: "микс колл / пас", shortLabel: "Колл / пас" }
  };
  var ACTION_WEIGHTS = {
    F: { fold: 1, call: 0, raise: 0 },
    C: { fold: 0, call: 1, raise: 0 },
    R: { fold: 0, call: 0, raise: 1 },
    B: { fold: 0, call: 0.5, raise: 0.5 },
    M: { fold: 0.5, call: 0.5, raise: 0 }
  };

  function normalizeState(value) {
    var code = String(value || "F").toUpperCase();
    return STATES.indexOf(code) >= 0 ? code : "F";
  }

  function nextState(value) {
    var current = normalizeState(value);
    return STATES[(STATES.indexOf(current) + 1) % STATES.length];
  }

  function stateLabel(value) {
    return META[normalizeState(value)].label;
  }

  function reviewState(chosen, expected) {
    return normalizeState(chosen) === normalizeState(expected) ? "correct" : "error";
  }

  function errorType(chosen, expected) {
    var chosenCode = normalizeState(chosen);
    var expectedCode = normalizeState(expected);
    if (chosenCode === expectedCode) return "";
    if (chosenCode === "F" && expectedCode !== "F") return "missed";
    if (chosenCode !== "F" && expectedCode === "F") return "extra";
    return "action";
  }

  function handComboCount(hand) {
    var label = String(hand || "");
    if (label.length === 2) return 6;
    return label.endsWith("s") ? 4 : 12;
  }

  function matchingComboFraction(chosen, expected) {
    var chosenWeights = ACTION_WEIGHTS[normalizeState(chosen)];
    var expectedWeights = ACTION_WEIGHTS[normalizeState(expected)];
    return ["fold", "call", "raise"].reduce(function (total, action) {
      return total + Math.min(chosenWeights[action], expectedWeights[action]);
    }, 0);
  }

  function gradeDraft(draft, expected) {
    var source = expected || {};
    var answer = draft || {};
    var errors = [];
    var missedDefense = [];
    var extraDefense = [];
    var wrongAction = [];
    var totalCombos = 0;
    var correctCombos = 0;
    var missedDefenseCombos = 0;
    var extraDefenseCombos = 0;
    var wrongActionCombos = 0;

    Object.keys(source).forEach(function (hand) {
      var expectedCode = normalizeState(source[hand]);
      var chosenCode = normalizeState(answer[hand]);
      var comboCount = handComboCount(hand);
      var matchedCombos = Math.round(comboCount * matchingComboFraction(chosenCode, expectedCode));
      var wrongCombos = comboCount - matchedCombos;
      var chosenFold = ACTION_WEIGHTS[chosenCode].fold;
      var expectedFold = ACTION_WEIGHTS[expectedCode].fold;
      var missedCombos = Math.round(comboCount * Math.max(chosenFold - expectedFold, 0));
      var extraCombos = Math.round(comboCount * Math.max(expectedFold - chosenFold, 0));
      var actionCombos = Math.max(0, wrongCombos - missedCombos - extraCombos);

      totalCombos += comboCount;
      correctCombos += matchedCombos;
      if (!wrongCombos) return;

      var error = {
        hand: hand,
        chosen: chosenCode,
        expected: expectedCode,
        comboCount: comboCount,
        correctCombos: matchedCombos,
        wrongCombos: wrongCombos,
        missedDefenseCombos: missedCombos,
        extraDefenseCombos: extraCombos,
        wrongActionCombos: actionCombos
      };
      errors.push(error);
      if (missedCombos) missedDefense.push(error);
      if (extraCombos) extraDefense.push(error);
      if (actionCombos) wrongAction.push(error);
      missedDefenseCombos += missedCombos;
      extraDefenseCombos += extraCombos;
      wrongActionCombos += actionCombos;
    });

    var totalCells = Object.keys(source).length;
    var correctCells = totalCells - errors.length;
    return {
      total: totalCells,
      correct: correctCells,
      totalCells: totalCells,
      correctCells: correctCells,
      totalCombos: totalCombos,
      correctCombos: correctCombos,
      wrongCombos: totalCombos - correctCombos,
      errors: errors,
      missedDefense: missedDefense,
      extraDefense: extraDefense,
      wrongAction: wrongAction,
      missedDefenseCombos: missedDefenseCombos,
      extraDefenseCombos: extraDefenseCombos,
      wrongActionCombos: wrongActionCombos
    };
  }

  root.PokerBbCallRecall = Object.freeze({
    states: Object.freeze(STATES.slice()),
    meta: Object.freeze(META),
    normalizeState: normalizeState,
    nextState: nextState,
    stateLabel: stateLabel,
    reviewState: reviewState,
    errorType: errorType,
    handComboCount: handComboCount,
    matchingComboFraction: matchingComboFraction,
    gradeDraft: gradeDraft
  });
})(typeof window !== "undefined" ? window : globalThis);
