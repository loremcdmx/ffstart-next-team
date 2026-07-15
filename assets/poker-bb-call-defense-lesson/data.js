(function () {
  "use strict";

  var RangeData = window.PokerBbCallRangeData;

  var positions = {
    EP: { label: "EP", tableSeat: "UTG", openerPct: 17 },
    MP: { label: "MP", tableSeat: "MP", openerPct: 20 },
    HJ: { label: "HJ", tableSeat: "HJ", openerPct: 28 },
    CO: { label: "CO", tableSeat: "CO", openerPct: 37 },
    BTN: { label: "BTN", tableSeat: "BTN", openerPct: 52 }
  };

  var sizes = {
    "2_0": { label: "2 BB", openSize: 2, toCall: 1, finalPot: 5.5, potOddsPct: 18.2 },
    "2_5": { label: "2,5 BB", openSize: 2.5, toCall: 1.5, finalPot: 6.5, potOddsPct: 23.1 },
    "3_0": { label: "3 BB", openSize: 3, toCall: 2, finalPot: 7.5, potOddsPct: 26.7 }
  };

  var rangeScenarios = {
    "2_0": {
      EP: { foldPct: 37, threeBetPct: 5, chart: "source/range-2_0-vs-ep.png" },
      MP: { foldPct: 30, threeBetPct: 6, chart: "source/range-2_0-vs-mp.png" },
      HJ: { foldPct: 20, threeBetPct: 7, chart: "source/range-2_0-vs-hj.png" },
      CO: { foldPct: 15, threeBetPct: 8, chart: "source/range-2_0-vs-co.png" },
      BTN: { foldPct: 10, threeBetPct: 9, chart: "source/range-2_0-vs-btn.png" }
    },
    "2_5": {
      EP: { foldPct: 76, chart: "source/range-2_5-vs-ep.png" },
      MP: { foldPct: 71, chart: "source/range-2_5-vs-mp.png" },
      HJ: { foldPct: 54, chart: "source/range-2_5-vs-hj.png" },
      CO: { foldPct: 47, chart: "source/range-2_5-vs-co.png" },
      BTN: { foldPct: 45, chart: "source/range-2_5-vs-btn.png" }
    },
    "3_0": {
      EP: { foldPct: 87, chart: "source/range-3_0-vs-ep.png" },
      MP: { foldPct: 86, chart: "source/range-3_0-vs-mp.png" },
      HJ: { foldPct: 75, chart: "source/range-3_0-vs-hj.png" },
      CO: { foldPct: 74, chart: "source/range-3_0-vs-co.png" },
      BTN: { foldPct: 73, chart: "source/range-3_0-vs-btn.png" }
    }
  };

  var MATRIX_RANKS = "AKQJT98765432";

  function matrixHandAt(row, column) {
    if (row === column) return MATRIX_RANKS[row] + MATRIX_RANKS[column];
    return row < column
      ? MATRIX_RANKS[row] + MATRIX_RANKS[column] + "s"
      : MATRIX_RANKS[column] + MATRIX_RANKS[row] + "o";
  }

  function matrixCellForHand(hand) {
    var match = String(hand || "").trim().match(/^([AKQJT98765432])([AKQJT98765432])([so])?$/i);
    if (!match) throw new Error("Unknown starting hand: " + String(hand || ""));
    var first = match[1].toUpperCase();
    var second = match[2].toUpperCase();
    var suitedness = (match[3] || "").toLowerCase();
    var firstIndex = MATRIX_RANKS.indexOf(first);
    var secondIndex = MATRIX_RANKS.indexOf(second);
    if (first === second) {
      if (suitedness) throw new Error("Pairs do not take a suitedness suffix: " + hand);
      return Object.freeze({ row: firstIndex, column: firstIndex });
    }
    if (!suitedness) throw new Error("Non-pairs require s or o: " + hand);
    var highIndex = Math.min(firstIndex, secondIndex);
    var lowIndex = Math.max(firstIndex, secondIndex);
    return Object.freeze(suitedness === "s"
      ? { row: highIndex, column: lowIndex }
      : { row: lowIndex, column: highIndex });
  }

  function rangeCellFor(sizeKey, position, hand) {
    if (!RangeData) throw new Error("BB range data is not loaded");
    var coordinates = matrixCellForHand(hand);
    var scenario = RangeData.scenarios[sizeKey + ":" + position];
    if (!scenario || scenario.length !== 169) throw new Error("Unknown range scenario: " + sizeKey + ":" + position);
    var sourceCode = scenario[coordinates.row * 13 + coordinates.column];
    var sourceSplit = RangeData.codes[sourceCode];
    if (!sourceSplit) throw new Error("Unknown range action code: " + sourceCode);
    // Keep the generated extraction intact, but simplify partial call/fold
    // weights for the lesson: every such boundary hand is a pure fold.
    var code = sourceSplit.raisePct === 0 && sourceSplit.callPct > 0 && sourceSplit.callPct < 100 ? "F" : sourceCode;
    var split = RangeData.codes[code];
    return Object.freeze({
      hand: matrixHandAt(coordinates.row, coordinates.column),
      row: coordinates.row,
      column: coordinates.column,
      code: code,
      raisePct: split.raisePct,
      callPct: split.callPct,
      foldPct: split.foldPct
    });
  }

  function seats(stack) {
    return ["UTG", "MP", "HJ", "CO", "BTN", "SB", "BB"].map(function (label) {
      return {
        label: label,
        state: label === "BB" ? "hero" : /SB|BB/.test(label) ? "blind" : "waiting",
        // The shared renderer subtracts current-street bets itself. Only the
        // BB ante is outside that ledger and must be reflected up front.
        stackBb: label === "BB" ? stack - 1 : stack
      };
    });
  }

  function actionLineFor(openPosition, openSize) {
    var order = ["UTG", "MP", "HJ", "CO", "BTN"];
    var seat = positions[openPosition].tableSeat;
    var openerIndex = order.indexOf(seat);
    return order.slice(0, Math.max(0, openerIndex)).map(function (position) {
      return position + " fold";
    }).concat([
      // Keep decimal points in the machine-readable action line. The shared
      // snapshot parser treats commas as action separators; presentation is
      // localized to a comma after rendering.
      seat + " open " + String(openSize) + " BB"
    ], order.slice(openerIndex + 1).map(function (position) {
      return position + " fold";
    }), ["SB fold"]);
  }

  function actionLabel(action) {
    if (action === "call") return "Колл";
    if (action === "raise") return "3-бет";
    return "Пас";
  }

  function feedbackFor(correct, hand, sourceCell) {
    return {
      fold: correct === "fold"
        ? "Да. В базовом чарте " + hand + " — белая клетка: основная линия здесь пас."
        : "Пас не совпадает с базовым чартом для этого сайза и позиции.",
      call: correct === "call"
        ? "Да. В базовом чарте " + hand + " — зелёный колл."
        : "Колл не совпадает с цветом клетки в базовом чарте: " + sourceCell + ".",
      raise: correct === "raise"
        ? "Да. В базовом чарте " + hand + " — розовый 3-бет. Сайз выбери по позиции и глубине стека."
        : correct === "call"
          ? "Стандартное решение тут колл."
          : "3-бет не совпадает с базовой клеткой чарта: " + sourceCell + "."
    };
  }

  function spot(config) {
    var sizeKey = config.sizeKey;
    var openPosition = config.openPosition;
    var size = sizes[sizeKey];
    var position = positions[openPosition];
    var feedback = feedbackFor(config.correct, config.hand, config.sourceCell);
    return {
      id: config.id,
      title: config.title,
      hand: config.hand,
      question: position.label + " открыл " + size.label + ". Ты на BB с " + config.hand + ". Что нажмёшь?",
      answer: "Базовая линия — " + actionLabel(config.correct).toLowerCase() + ". " + config.reason,
      cue: config.cue,
      sourceCell: config.sourceCell,
      sourceChart: rangeScenarios[sizeKey][openPosition].chart,
      sourceChartCell: matrixCellForHand(config.hand),
      sizeKey: sizeKey,
      openPosition: openPosition,
      correct: config.correct,
      cards: config.cards,
      table: {
        seats: seats(config.stack || 40),
        heroPosition: "BB",
        heroStack: String((config.stack || 40) - 1) + " BB",
        effectiveStack: String(config.stack || 40) + " BB",
        // Current-street bets remain in front of seats; only the BB ante is in
        // the center so the visual total is not counted twice.
        pot: "1 BB",
        anteBb: 1,
        heroCards: config.cards,
        boardCards: [],
        street: "preflop",
        actionLine: actionLineFor(openPosition, size.openSize),
        historyLine: config.correct === "raise"
          ? "Один на один · после 3-бета опенер ещё может ответить"
          : "Один на один · после колла или паса экшен закрыт",
        toCall: size.toCall,
        currentBet: size.openSize,
        dealerPosition: "BTN"
      },
      options: [
        { key: "fold", label: "Пас", correct: config.correct === "fold", feedback: feedback.fold },
        { key: "call", label: "Колл " + String(size.toCall).replace(".", ",") + " BB", correct: config.correct === "call", feedback: feedback.call },
        { key: "raise", label: "3-бет", correct: config.correct === "raise", feedback: feedback.raise }
      ]
    };
  }

  var firstSpot = spot({
    id: "intro-k4o-vs-btn-minraise",
    title: "Первая раздача",
    hand: "K4o",
    cards: ["Kh", "4d"],
    sizeKey: "2_0",
    openPosition: "BTN",
    correct: "call",
    sourceCell: "колл 100%",
    reason: "Нужно добавить 1 BB в итоговый банк 5,5 BB, а K4o полностью лежит в зелёной части базового чарта против рейза BTN до 2 BB.",
    cue: "Не оценивай руку по внешнему виду: сначала позиция, сайз и клетка в чарте."
  });

  var practiceSpots = [
    spot({ id: "k4o-btn-2", title: "Некрасивый король", hand: "K4o", cards: ["Kh", "4d"], sizeKey: "2_0", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "Именно такие разномастные короли выглядят как пас на автопилоте, но против рейза BTN до 2 BB остаются в зелёной части чарта.", cue: "Главный лик урока: не выкидывай пограничную руку до того, как прочитал позицию и сайз." }),
    spot({ id: "q6o-btn-2", title: "Разномастная дама", hand: "Q6o", cards: ["Qh", "6c"], sizeKey: "2_0", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "Q6o входит в широкую защиту против рейза BTN до 2 BB, хотя визуально кажется слабой.", cue: "BTN минрейзит широко; не сдвигай границу колла до красивых карт." }),
    spot({ id: "q6o-btn-3", title: "Та же рука против рейза 3 BB", hand: "Q6o", cards: ["Qh", "6c"], sizeKey: "3_0", openPosition: "BTN", correct: "fold", sourceCell: "фолд 100%", reason: "При рейзе до 3 BB цена выросла до 26,7%, и Q6o уже белая клетка.", cue: "Сравни с Q6o против рейза до 2 BB: меняется только сайз, но решение переворачивается." }),
    spot({ id: "j6o-btn-2", title: "Разномастный валет", hand: "J6o", cards: ["Jh", "6d"], sizeKey: "2_0", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "J6o — ещё одна частая пропущенная зелёная клетка против рейза BTN до 2 BB.", cue: "Тренируем узнавание до автоматизма: увидел клетку — нажал колл." }),
    spot({ id: "t6o-btn-2", title: "Десятка с шестёркой", hand: "T6o", cards: ["Th", "6c"], sizeKey: "2_0", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "T6o полностью лежит в колле против рейза BTN до 2 BB в базовом чарте.", cue: "Слабый вид руки не отменяет цену 18,2% и широкий диапазон BTN." }),
    spot({ id: "96o-btn-2", title: "Девятка с шестёркой", hand: "96o", cards: ["9h", "6d"], sizeKey: "2_0", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "96o остаётся зелёной клеткой: связанность помогает руке реализовывать эквити.", cue: "Карты ближе друг к другу защищаются лучше, чем низкие разнесённые разномастные руки." }),
    spot({ id: "k4o-ep-2", title: "Та же рука против EP", hand: "K4o", cards: ["Kh", "4d"], sizeKey: "2_0", openPosition: "EP", correct: "fold", sourceCell: "фолд 100%", reason: "Против раннего диапазона K4o уже не хватает: клетка белая.", cue: "Сравни с K4o против BTN: меняется только позиция рейзера." }),
    spot({ id: "tt-btn-2", title: "Сильная пара", hand: "TT", cards: ["Th", "Ts"], sizeKey: "2_0", openPosition: "BTN", correct: "raise", sourceCell: "3-бет 100%", reason: "В базовом чарте TT целиком уходит в розовую часть, а не в колл.", cue: "Урок про колл не означает, что всю защиту нужно разыгрывать коллом." }),
    spot({ id: "83o-co-25", title: "Слабая разномастная", hand: "83o", cards: ["8c", "3d"], sizeKey: "2_5", openPosition: "CO", correct: "fold", sourceCell: "фолд 100%", reason: "Сайз 2,5 BB повышает цену до 23,1%, а 83o остаётся белой клеткой.", cue: "Больший сайз — меньше маргинальных защит." }),
    spot({ id: "ajo-ep-2", title: "Минрейз из ранней", hand: "AJo", cards: ["Ah", "Jc"], sizeKey: "2_0", openPosition: "EP", correct: "call", sourceCell: "колл 100%", reason: "Даже против EP рука заметно выше нижней границы колла на минрейз.", cue: "Позиция сужает защиту, но не превращает сильную руку в пас." }),
    spot({ id: "qq-mp-25", title: "Верх диапазона", hand: "QQ", cards: ["Qh", "Qs"], sizeKey: "2_5", openPosition: "MP", correct: "raise", sourceCell: "3-бет 100%", reason: "QQ — розовая клетка: сильные руки извлекают больше через 3-бет.", cue: "Колл — только одна часть общей защиты BB." }),
    spot({ id: "76s-btn-3", title: "Сьютовый коннектор", hand: "76s", cards: ["7h", "6h"], sizeKey: "3_0", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "Несмотря на цену 26,7%, 76s остаётся зелёной клеткой против BTN в базовом чарте.", cue: "Смотри на связку сайз + позиция + конкретная рука." }),
    spot({ id: "k2s-btn-25", title: "Сьютовый король", hand: "K2s", cards: ["Ks", "2s"], sizeKey: "2_5", openPosition: "BTN", correct: "call", sourceCell: "колл 100%", reason: "Против широкого BTN K2s сохраняется в зелёной части диапазона.", cue: "Поздняя позиция рейзера расширяет защиту." }),
    spot({ id: "55-mp-3", title: "Пара против рейза 3 BB", hand: "55", cards: ["5h", "5c"], sizeKey: "3_0", openPosition: "MP", correct: "call", sourceCell: "колл 100%", reason: "55 остаются зелёной клеткой даже при более дорогом колле.", cue: "Не отправляй готовые пары в пас слишком часто только из-за сайза." }),
    spot({ id: "qts-hj-2", title: "Две связанные карты", hand: "QTs", cards: ["Qd", "Td"], sizeKey: "2_0", openPosition: "HJ", correct: "call", sourceCell: "колл 100%", reason: "QTs хорошо играет после флопа и полностью лежит в колле.", cue: "Сьютовость и связанность помогают реализовывать эквити." }),
    spot({ id: "a2o-ep-2", title: "Слабый туз против EP", hand: "A2o", cards: ["Ah", "2c"], sizeKey: "2_0", openPosition: "EP", correct: "fold", sourceCell: "фолд 100%", reason: "Против раннего узкого диапазона A2o находится в белой части матрицы.", cue: "Дешёвая цена не отменяет доминацию против сильного опена." }),
    spot({ id: "87s-co-25", title: "Сьютовый коннектор против CO", hand: "87s", cards: ["8d", "7d"], sizeKey: "2_5", openPosition: "CO", correct: "call", sourceCell: "колл 100%", reason: "87s остаётся зелёной клеткой против рейза CO до 2,5 BB.", cue: "Играбельные сьютовые руки реализуют больше эквити." }),
    spot({ id: "72o-btn-2", title: "Настоящий низ диапазона", hand: "72o", cards: ["7c", "2d"], sizeKey: "2_0", openPosition: "BTN", correct: "fold", sourceCell: "фолд 100%", reason: "Даже против минрейза BTN часть самого низа остаётся пасом.", cue: "Широкая защита — не защита любых двух карт." }),
    spot({ id: "ako-ep-2", title: "Премиум против EP", hand: "AKo", cards: ["As", "Kd"], sizeKey: "2_0", openPosition: "EP", correct: "raise", sourceCell: "3-бет 100%", reason: "AKo целиком лежит в розовой части матрицы.", cue: "Не прячь премиум в колле по привычке." }),
    spot({ id: "jts-hj-25", title: "JTs против HJ", hand: "JTs", cards: ["Jh", "Th"], sizeKey: "2_5", openPosition: "HJ", correct: "call", sourceCell: "колл 100%", reason: "JTs остаётся в зелёной части против рейза HJ до 2,5 BB.", cue: "Постфлоп-играбельность важна для реализации." }),
    spot({ id: "99-btn-3", title: "Сильная пара против BTN", hand: "99", cards: ["9h", "9s"], sizeKey: "3_0", openPosition: "BTN", correct: "raise", sourceCell: "3-бет 100%", reason: "99 — розовая клетка в базовом чарте против рейза BTN до 3 BB.", cue: "Сильная рука может предпочитать 3-бет даже против крупного сайза." })
  ];

  window.PokerBbCallData = Object.freeze({
    version: "bb-call-defense-alpha-20260712-v2",
    physicalPages: Object.freeze([10, 11]),
    positions: Object.freeze(positions),
    sizes: Object.freeze(sizes),
    rangeScenarios: Object.freeze(rangeScenarios),
    matrixRanks: MATRIX_RANKS,
    matrixHandAt: matrixHandAt,
    matrixCellForHand: matrixCellForHand,
    rangeCellFor: rangeCellFor,
    rangeDataVersion: RangeData && RangeData.version,
    equityRealization: Object.freeze({ rawEquityPct: 38.5, realizedEquityPct: 27.8, scope: "range-example" }),
    equityModel: Object.freeze({
      dataRoot: "assets/poker-resteal-lesson/data/",
      files: Object.freeze(["equity169.json", "rank_vs_random169.json"]),
      version: "showdown-equity-20260711-v2"
    }),
    ffRealizationModel: Object.freeze({
      file: "assets/poker-bb-call-defense-lesson/data/ff-bb-call-realization.json",
      version: "ff-bb-call-realization-20260714-v1",
      minDisplayN: 500,
      minReliableN: 2000
    }),
    leagueDefenseModel: Object.freeze({
      file: "assets/poker-bb-call-defense-lesson/data/ff-bb-defense-ranks.json",
      version: "ff-bb-defense-ranks-20260715-v2"
    }),
    firstSpot: Object.freeze(firstSpot),
    practiceSpots: Object.freeze(practiceSpots)
  });
})();
