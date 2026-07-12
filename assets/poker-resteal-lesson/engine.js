(function (root, factory) {
  "use strict";
  root.PokerRestealEngine = Object.freeze(factory());
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";
  const RANKS = "AKQJT98765432";

  function parseHand(hand) {
    const value = String(hand || "");
    if (value.length === 2) return { pair: true, ranks: [value[0], value[0]], suited: false };
    return { pair: false, ranks: [value[0], value[1]], suited: value[2] === "s" };
  }

  function rankCounts(hand) {
    return parseHand(hand).ranks.reduce((out, rank) => ((out[rank] = (out[rank] || 0) + 1), out), {});
  }

  function choose(n, k) {
    if (k < 0 || n < k) return 0;
    if (k === 0) return 1;
    if (k === 1) return n;
    return (n * (n - 1)) / 2;
  }

  function combosLeft(villainHand, heroHand) {
    const villain = parseHand(villainHand);
    const hero = parseHand(heroHand);
    const blocked = rankCounts(heroHand);
    if (villain.pair) return choose(4 - (blocked[villain.ranks[0]] || 0), 2);
    const a = 4 - (blocked[villain.ranks[0]] || 0);
    const b = 4 - (blocked[villain.ranks[1]] || 0);
    if (!villain.suited) {
      const suitedOverlap = Math.max(0, 4 - (blocked[villain.ranks[0]] || 0) - (blocked[villain.ranks[1]] || 0));
      return Math.max(0, a * b - suitedOverlap);
    }
    const sameTwoRanks = !hero.pair
      && new Set(hero.ranks).size === 2
      && hero.ranks.every((rank) => villain.ranks.includes(rank));
    const sharedSuitedBlocker = hero.suited && sameTwoRanks ? 1 : 0;
    return Math.max(0, 4 - (blocked[villain.ranks[0]] || 0) - (blocked[villain.ranks[1]] || 0) + sharedSuitedBlocker);
  }

  function totalCombos(hand) {
    return parseHand(hand).pair ? 6 : parseHand(hand).suited ? 4 : 12;
  }

  function jamEv({ stack, openSize, ante = 0, foldEquity, equity, bounty = 0 }) {
    const pot0 = openSize + 1.5 + ante;
    const risk = stack - 1;
    const calledPot = 2 * stack + 0.5 + ante;
    const callChance = 1 - foldEquity;
    return foldEquity * pot0 + callChance * (equity * calledPot - risk) + callChance * equity * bounty;
  }

  function handFromPosition(row, col) {
    if (row === col) return RANKS[row] + RANKS[col];
    return row < col ? RANKS[row] + RANKS[col] + "s" : RANKS[col] + RANKS[row] + "o";
  }

  function buildRange(ranking, percent, heroHand) {
    const target = Math.max(0, Math.min(1, percent / 100)) * 1326;
    const result = [];
    let nominalCombos = 0;
    for (const hand of ranking) {
      const available = heroHand ? combosLeft(hand, heroHand) : totalCombos(hand);
      if (available) result.push({ hand, combos: available });
      // Select the range before seeing Hero's cards. Removal changes only the
      // weights of hands already inside that nominal range.
      nominalCombos += totalCombos(hand);
      if (nominalCombos >= target) break;
    }
    return result;
  }

  function rangeCombos(range) {
    return range.reduce((sum, item) => sum + item.combos, 0);
  }

  function theoreticalHand({ hand, openPct, callPct, stack, openSize, ante, bounty, ranking, equityFor }) {
    const openRange = buildRange(ranking, openPct, hand);
    const callRange = buildRange(ranking, Math.min(callPct, openPct), hand);
    const openCombos = rangeCombos(openRange);
    const callCombos = rangeCombos(callRange);
    const foldEquity = openCombos ? Math.max(0, Math.min(0.999, 1 - callCombos / openCombos)) : 0;
    const equityWeight = callRange.reduce((sum, item) => sum + item.combos * equityFor(hand, item.hand), 0);
    const equity = callCombos ? equityWeight / callCombos : 0;
    return { hand, foldEquity, equity, ev: jamEv({ stack, openSize, ante, foldEquity, equity, bounty }), callCombos, openCombos };
  }

  function fieldHand({ hand, openPct, callPct, callWeights, stack, openSize, ante, bounty, ranking, equityFor }) {
    const openRange = buildRange(ranking, openPct, hand);
    const callRange = buildRange(ranking, Math.min(callPct, openPct), hand);
    const openCombos = rangeCombos(openRange);
    const callCombos = rangeCombos(callRange);
    const foldEquity = openCombos ? Math.max(0, Math.min(0.999, 1 - callCombos / openCombos)) : 0;
    const entries = Object.entries(callWeights || {}).filter(([candidate]) => candidate !== "unknown" && combosLeft(candidate, hand) > 0);
    const weighted = entries.reduce((out, [candidate, count]) => {
      const weight = Number(count) * (combosLeft(candidate, hand) / totalCombos(candidate));
      out.total += weight;
      out.equity += weight * equityFor(hand, candidate);
      return out;
    }, { total: 0, equity: 0 });
    const equity = weighted.total ? weighted.equity / weighted.total : 0;
    return { hand, foldEquity, equity, ev: jamEv({ stack, openSize, ante, foldEquity, equity, bounty }), callCombos, openCombos };
  }

  return { RANKS, parseHand, combosLeft, totalCombos, jamEv, handFromPosition, buildRange, theoreticalHand, fieldHand };
});
