import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

await import("../assets/poker-resteal-lesson/engine.js");
await import("../assets/poker-rfi-open-lesson/simulator-pack.js");
globalThis.window = globalThis;
await import("../assets/poker-rfi-open-lesson/data.js");
delete globalThis.window;

const engine = globalThis.PokerRestealEngine;
const rfi = globalThis.PokerRfiOpenSimulatorPack;
const ranks = json("assets/poker-resteal-lesson/data/rank_vs_random169.json");
const ranking = ranks.hands
  .map((hand, index) => ({ hand, score: ranks.equity_vs_random[index] }))
  .sort((left, right) => right.score - left.score)
  .map((item) => item.hand);
const equity = json("assets/poker-resteal-lesson/data/equity169.json");
const handIndex = new Map(equity.hands.map((hand, index) => [hand, index]));
const equityFor = (hero, villain) => equity.equity[handIndex.get(hero)][handIndex.get(villain)];
const fieldCalls = json("assets/poker-resteal-lesson/data/field_call_range.json");
const fieldOpens = json("assets/poker-resteal-lesson/data/field_opens.json").pooled_25_40;
const fieldVsJam = json("assets/poker-resteal-lesson/data/field_vs_jam.json").pooled;

assert.equal(engine.combosLeft("AKs", "AKs"), 3, "suited same-rank blocker leaves three suited combos");
assert.equal(engine.buildRange(ranking, 12, "AA").at(-1).hand, engine.buildRange(ranking, 12, "QJo").at(-1).hand, "Hero cards do not move the nominal range boundary");

function theoretical(hand) {
  return engine.theoreticalHand({ hand, openPct: 50, callPct: 12, stack: 40, openSize: 2, ante: 1, bounty: 0, ranking, equityFor });
}

assert(theoretical("AA").foldEquity > theoretical("QJo").foldEquity, "AA blockers increase fold equity against fixed ranges");
for (const hand of ["K8o", "Q8o", "84s", "73s", "52s"]) {
  assert(theoretical(hand).ev < 0, `${hand} no longer flips from fold to push through range-boundary leakage`);
}

function callWeights(category) {
  const record = fieldCalls.by_category[category];
  if ((record?.n_known_holecards || 0) >= 500) return record.hands || {};
  const group = ["good_reg", "mid_reg", "weak_reg", "nit"].includes(category) ? "reg" : "fish";
  return fieldCalls.super_groups[group]?.hands || fieldCalls.super_groups[group] || {};
}

function fieldGridPct(category) {
  const openPct = fieldOpens[category].BTN.open_clean_pct * 100;
  const observedFold = fieldVsJam[category].fold_pct;
  const callPct = Math.min(openPct, Math.max(openPct * (1 - observedFold), 12));
  const pushedCombos = equity.hands.reduce((total, hand) => {
    const result = engine.fieldHand({ hand, openPct, callPct, callWeights: callWeights(category), stack: 40, openSize: 2, ante: 1, bounty: 0, ranking, equityFor });
    return total + (result.ev >= 0.5 ? engine.totalCombos(hand) : 0);
  }, 0);
  return pushedCombos / 1326 * 100;
}

const goodRegGrid = fieldGridPct("good_reg");
const nitGrid = fieldGridPct("nit");
const activeFishGrid = fieldGridPct("aggro_fish");
assert(goodRegGrid < 45, `good-reg grid stays in a bounded teaching range (actual ${goodRegGrid.toFixed(1)}%)`);
assert(nitGrid <= activeFishGrid, `nit grid is not wider than active-fish grid (${nitGrid.toFixed(1)}% <= ${activeFishGrid.toFixed(1)}%)`);

assert.deepEqual(rfi.enginePositions, ["UTG", "LJ", "HJ", "CO", "BTN"], "RFI pack uses the 7-max engine vocabulary");
assert.equal(rfi.targetPosition(2), "LJ", "second RFI hand targets engine LJ");
assert.equal(rfi.targetLearningPosition(2), "MP", "engine LJ is presented as learning MP");
assert.equal(rfi.openSizeBb, 2.2, "RFI lesson and simulator use the same 2.2 BB size");

const rfiCss = readFileSync(resolve(root, "assets/poker-rfi-open-lesson/simulator-pack.css"), "utf8");
assert(!rfiCss.includes('.client-controls.is-rfi-opening [data-action="call"] { display:none'), "RFI opening keeps the call button visible as a teaching trap");
assert(rfiCss.includes(".rfi-range-review"), "RFI pack includes the post-hand range target review");
assert(rfiCss.includes(".rfi-limp-warning"), "RFI pack includes the dedicated limp warning dialog");
const rfiPackSource = readFileSync(resolve(root, "assets/poker-rfi-open-lesson/simulator-pack.js"), "utf8");
assert(rfiPackSource.includes("manualNextHand: true"), "RFI waits for post-hand review before dealing the next hand");
assert(rfiPackSource.includes('.client-controls.is-rfi-opening [data-action="call"]'), "RFI intercepts only the unopened limp action");
assert(rfiPackSource.includes("stopImmediatePropagation"), "RFI limp guard stops the invalid action before the engine receives it");
assert.equal(rfi.decisionForFrequency(49), "fold", "sub-50 source weights use the simplified fold action");
assert.equal(rfi.decisionForFrequency(50), "open", "50-percent source weights enter the simplified open action");
assert.equal(rfi.heroPreflopAction({ hero: { seatId: 4 }, handHistory: { actions: [{ street: "preflop", seatId: 4, action: "call" }] } }), "limp", "completed hand grading recognizes a limp");
assert.equal(rfi.heroPreflopAction({ hero: { seatId: 0 }, handHistory: { actions: [{ street: "preflop", seatId: 0, phase: "chips", label: "Hero +2.2 BB" }, { street: "preflop", seatId: 0, phase: "action", label: "Raise to 2.2 BB" }] } }), "open", "RFI grading skips chip movement and finds the first meaningful hero action");
assert.equal(rfi.reviewVerdict({ action: "limp", expected: "open", correct: false }).tone, "wrong", "limp receives an explicit wrong verdict");
const epReviewChart = rfi.reviewChart({ position: "EP", combo: "A9o", correct: true });
assert.equal((epReviewChart.match(/class="rfi-review-cell/g) || []).length, 169, "post-hand review renders all 169 range cells");
assert(epReviewChart.includes("is-hit is-correct"), "post-hand review marks the played combo on the chart");
const actionControls = readFileSync(resolve(root, "assets/poker-simulator/simulator-action-controls.js"), "utf8");
assert(actionControls.includes("rfi-play-again"), "RFI terminal state offers an in-frame restart");

console.log(`✓ resteal field grids: reg ${goodRegGrid.toFixed(1)}% · nit ${nitGrid.toFixed(1)}% · active fish ${activeFishGrid.toFixed(1)}%`);
console.log("✓ learning contracts passed");
