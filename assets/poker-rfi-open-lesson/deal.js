(function () {
  "use strict";

  var root = typeof window !== "undefined" ? window : globalThis;
  var RANKS = "AKQJT98765432".split("");
  var SUITS = "cdhs".split("");

  function requireRandomInt(injectedRandomInt) {
    var simulatorRandom = root.PokerSimulatorRandom;
    var source = injectedRandomInt;

    if (source == null && simulatorRandom && typeof simulatorRandom.randomInt === "function") {
      source = simulatorRandom.randomInt.bind(simulatorRandom);
    }
    if (typeof source !== "function") {
      throw new Error("PokerRfiDeal requires PokerSimulatorRandom.randomInt or an injected randomInt(max)");
    }

    return function checkedRandomInt(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError("PokerRfiDeal randomInt max must be a positive integer");
      }
      var value = source(maxExclusive);
      if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
        throw new RangeError("PokerRfiDeal randomInt(max) must return an integer from 0 through max - 1");
      }
      return value;
    };
  }

  function validateBehindLabels(behindLabels) {
    if (!Array.isArray(behindLabels)) {
      throw new TypeError("PokerRfiDeal behindLabels must be an array");
    }
    if (behindLabels.length > 25) {
      throw new RangeError("PokerRfiDeal cannot deal two cards to more than 25 opponents");
    }

    var seen = new Set();
    return behindLabels.map(function (label) {
      if (typeof label !== "string" || label.trim() === "") {
        throw new TypeError("PokerRfiDeal behind labels must be non-empty strings");
      }
      if (seen.has(label)) {
        throw new Error("PokerRfiDeal behind labels must be unique");
      }
      seen.add(label);
      return label;
    });
  }

  function heroCombos(abstractHand) {
    if (typeof abstractHand !== "string") {
      throw new TypeError("PokerRfiDeal hero hand must be an abstract hand string");
    }

    var pairMatch = abstractHand.match(/^([AKQJT98765432])\1$/);
    if (pairMatch) {
      var pairRank = pairMatch[1];
      var pairCombos = [];
      for (var firstSuitIndex = 0; firstSuitIndex < SUITS.length; firstSuitIndex += 1) {
        for (var secondSuitIndex = firstSuitIndex + 1; secondSuitIndex < SUITS.length; secondSuitIndex += 1) {
          pairCombos.push([pairRank + SUITS[firstSuitIndex], pairRank + SUITS[secondSuitIndex]]);
        }
      }
      return pairCombos;
    }

    var shapedMatch = abstractHand.match(/^([AKQJT98765432])([AKQJT98765432])([so])$/);
    if (!shapedMatch || shapedMatch[1] === shapedMatch[2]) {
      throw new Error("PokerRfiDeal hero hand must be a valid pair, suited hand, or offsuit hand");
    }

    var highRank = shapedMatch[1];
    var lowRank = shapedMatch[2];
    var shape = shapedMatch[3];
    var combos = [];
    SUITS.forEach(function (firstSuit) {
      SUITS.forEach(function (secondSuit) {
        if ((shape === "s" && firstSuit === secondSuit) || (shape === "o" && firstSuit !== secondSuit)) {
          combos.push([highRank + firstSuit, lowRank + secondSuit]);
        }
      });
    });
    return combos;
  }

  function makeDeck() {
    var deck = [];
    RANKS.forEach(function (rank) {
      SUITS.forEach(function (suit) {
        deck.push(rank + suit);
      });
    });
    return deck;
  }

  function shuffleDeck(deck, randomInt) {
    for (var index = deck.length - 1; index > 0; index -= 1) {
      var swapIndex = randomInt(index + 1);
      var current = deck[index];
      deck[index] = deck[swapIndex];
      deck[swapIndex] = current;
    }
    return deck;
  }

  function deal(abstractHand, behindLabels, injectedRandomInt) {
    var labels = validateBehindLabels(behindLabels);
    var randomInt = requireRandomInt(injectedRandomInt);
    var combos = heroCombos(abstractHand);
    var heroCards = combos[randomInt(combos.length)].slice();
    var heroSet = new Set(heroCards);
    var deck = makeDeck().filter(function (card) {
      return !heroSet.has(card);
    });

    if (deck.length !== 50) {
      throw new Error("PokerRfiDeal failed to remove exactly two Hero cards from the deck");
    }
    shuffleDeck(deck, randomInt);

    var opponentCardsBySeat = Object.create(null);
    labels.forEach(function (label) {
      opponentCardsBySeat[label] = [deck.pop(), deck.pop()];
    });

    return {
      heroCards: heroCards,
      opponentCardsBySeat: opponentCardsBySeat
    };
  }

  root.PokerRfiDeal = Object.freeze({ deal: deal });
})();
