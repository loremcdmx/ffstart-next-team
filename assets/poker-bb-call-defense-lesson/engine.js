(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PokerBbCallEngine = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function potModel(openSize) {
    var open = Number(openSize);
    var toCall = Math.max(0, open - 1);
    var potBeforeCall = open + 0.5 + 1 + 1;
    var finalPot = potBeforeCall + toCall;
    var potOdds = finalPot > 0 ? toCall / finalPot : 0;
    return {
      openSize: open,
      toCall: toCall,
      potBeforeCall: potBeforeCall,
      finalPot: finalPot,
      potOdds: potOdds,
      potOddsPct: potOdds * 100
    };
  }

  function equityRealization(rawEquityPct, realizedEquityPct) {
    var raw = Math.max(0, Number(rawEquityPct) || 0);
    var realized = clamp(realizedEquityPct, 0, raw || 0);
    var realizationPct = raw > 0 ? realized / raw * 100 : 0;
    return {
      rawEquityPct: raw,
      realizedEquityPct: realized,
      realizationPct: realizationPct,
      unrealizedSharePct: 100 - realizationPct,
      lostEquityPoints: raw - realized
    };
  }

  function defenseSummary(foldPct, threeBetPct) {
    var fold = clamp(foldPct, 0, 100);
    var continuePct = 100 - fold;
    var hasSplit = Number.isFinite(Number(threeBetPct));
    var threeBet = hasSplit ? clamp(threeBetPct, 0, continuePct) : null;
    return {
      foldPct: fold,
      continuePct: continuePct,
      threeBetPct: threeBet,
      coldCallPct: hasSplit ? continuePct - threeBet : null
    };
  }

  function parseHand(hand) {
    var value = String(hand || "");
    if (value.length === 2) return { pair: true, ranks: [value[0], value[0]], suited: false };
    return { pair: false, ranks: [value[0], value[1]], suited: value[2] === "s" };
  }

  function rankCounts(hand) {
    return parseHand(hand).ranks.reduce(function (out, rank) {
      out[rank] = (out[rank] || 0) + 1;
      return out;
    }, {});
  }

  function choose(n, k) {
    if (k < 0 || n < k) return 0;
    if (k === 0) return 1;
    if (k === 1) return n;
    return n * (n - 1) / 2;
  }

  function combosLeft(villainHand, heroHand) {
    var villain = parseHand(villainHand);
    var hero = parseHand(heroHand);
    var blocked = rankCounts(heroHand);
    if (villain.pair) return choose(4 - (blocked[villain.ranks[0]] || 0), 2);
    var first = 4 - (blocked[villain.ranks[0]] || 0);
    var second = 4 - (blocked[villain.ranks[1]] || 0);
    var sameRanks = !hero.pair && new Set(hero.ranks).size === 2 && hero.ranks.every(function (rank) {
      return villain.ranks.indexOf(rank) >= 0;
    });
    var sharedSuitedBlocker = hero.suited && sameRanks ? 1 : 0;
    if (!villain.suited) {
      var suitedOverlap = Math.max(0, 4 - (blocked[villain.ranks[0]] || 0) - (blocked[villain.ranks[1]] || 0) + sharedSuitedBlocker);
      return Math.max(0, first * second - suitedOverlap);
    }
    return Math.max(0, 4 - (blocked[villain.ranks[0]] || 0) - (blocked[villain.ranks[1]] || 0) + sharedSuitedBlocker);
  }

  function totalCombos(hand) {
    var parsed = parseHand(hand);
    return parsed.pair ? 6 : parsed.suited ? 4 : 12;
  }

  function buildRange(ranking, percent, heroHand) {
    var target = clamp(percent, 0, 100) / 100 * 1326;
    var result = [];
    var nominalCombos = 0;
    for (var index = 0; index < ranking.length; index += 1) {
      var hand = ranking[index];
      var available = combosLeft(hand, heroHand);
      if (available) result.push({ hand: hand, combos: available });
      nominalCombos += totalCombos(hand);
      if (nominalCombos >= target) break;
    }
    return result;
  }

  function equityAgainstRange(heroHand, openPct, ranking, equityFor) {
    var range = buildRange(ranking, openPct, heroHand);
    var weighted = range.reduce(function (out, item) {
      out.combos += item.combos;
      out.equity += item.combos * equityFor(heroHand, item.hand);
      return out;
    }, { combos: 0, equity: 0 });
    return {
      rawEquityPct: weighted.combos ? weighted.equity / weighted.combos * 100 : 0,
      villainCombos: weighted.combos,
      rangeHands: range.length
    };
  }

  function minimumRealizationPct(potOddsPct, rawEquityPct) {
    var raw = Math.max(0, Number(rawEquityPct) || 0);
    if (!raw) return 100;
    return Math.max(0, Number(potOddsPct) || 0) / raw * 100;
  }

  return {
    clamp: clamp,
    potModel: potModel,
    equityRealization: equityRealization,
    defenseSummary: defenseSummary,
    combosLeft: combosLeft,
    totalCombos: totalCombos,
    buildRange: buildRange,
    equityAgainstRange: equityAgainstRange,
    minimumRealizationPct: minimumRealizationPct
  };
});
