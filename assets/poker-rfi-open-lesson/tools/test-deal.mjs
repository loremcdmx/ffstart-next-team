import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "deal.js"), "utf8"), context);
const Deal = context.window.PokerRfiDeal;
const cardPattern = /^[AKQJT98765432][cdhs]$/;

assert.ok(Deal);
assert.equal(typeof Deal.deal, "function");
assert.throws(
  () => Deal.deal("AA", ["SB", "BB"]),
  /requires PokerSimulatorRandom\.randomInt/
);

function seededRandomInt(seed) {
  let state = seed >>> 0;
  return (max) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % max;
  };
}

function heroAtIndex(hand, choiceIndex) {
  let calls = 0;
  return Deal.deal(hand, [], (max) => {
    const value = calls === 0 ? choiceIndex : calls % max;
    calls += 1;
    return value;
  }).heroCards;
}

const pairCombos = new Set();
for (let index = 0; index < 6; index += 1) {
  const cards = Array.from(heroAtIndex("AA", index));
  assert.equal(cards[0][0], "A");
  assert.equal(cards[1][0], "A");
  assert.notEqual(cards[0][1], cards[1][1]);
  pairCombos.add(cards.slice().sort().join("|"));
}
assert.equal(pairCombos.size, 6, "AA exposes all six concrete combinations uniformly by index");

const suitedCombos = new Set();
for (let index = 0; index < 4; index += 1) {
  const cards = Array.from(heroAtIndex("K5s", index));
  assert.equal(cards[0][0], "K");
  assert.equal(cards[1][0], "5");
  assert.equal(cards[0][1], cards[1][1]);
  suitedCombos.add(cards.join("|"));
}
assert.equal(suitedCombos.size, 4, "K5s exposes all four concrete combinations uniformly by index");

const offsuitCombos = new Set();
for (let index = 0; index < 12; index += 1) {
  const cards = Array.from(heroAtIndex("K5o", index));
  assert.equal(cards[0][0], "K");
  assert.equal(cards[1][0], "5");
  assert.notEqual(cards[0][1], cards[1][1]);
  offsuitCombos.add(cards.join("|"));
}
assert.equal(offsuitCombos.size, 12, "K5o exposes all twelve concrete combinations uniformly by index");

const fullOrder = ["UTG", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
for (const behindCount of [6, 5, 4, 3, 2]) {
  const behindLabels = fullOrder.slice(fullOrder.length - behindCount);
  const result = Deal.deal("K5o", behindLabels, seededRandomInt(behindCount));
  const dealtSeats = Object.keys(result.opponentCardsBySeat);
  const allCards = Array.from(result.heroCards);

  assert.deepEqual(dealtSeats, behindLabels);
  for (const label of behindLabels) {
    const cards = Array.from(result.opponentCardsBySeat[label]);
    assert.equal(cards.length, 2, `${label} receives exactly two cards`);
    allCards.push(...cards);
  }
  assert.equal(allCards.length, 2 + behindCount * 2);
  assert.equal(new Set(allCards).size, allCards.length, `${behindCount} opponents receive no duplicates`);
  for (const card of allCards) assert.match(card, cardPattern);
}

const first = Deal.deal("K5s", ["SB", "BB"], seededRandomInt(42));
const second = Deal.deal("K5s", ["SB", "BB"], seededRandomInt(42));
assert.equal(JSON.stringify(first), JSON.stringify(second), "injected RNG makes the entire deal deterministic");

context.window.PokerSimulatorRandom = { randomInt: seededRandomInt(7) };
const defaultRandomDeal = Deal.deal("AA", ["SB", "BB"]);
assert.equal(Object.keys(defaultRandomDeal.opponentCardsBySeat).length, 2);

for (const hand of ["", "K5", "KKs", "AAo", "XZ", null]) {
  assert.throws(() => Deal.deal(hand, [], seededRandomInt(1)), /hero hand/);
}
assert.throws(() => Deal.deal("AA", "SB", seededRandomInt(1)), /behindLabels must be an array/);
assert.throws(() => Deal.deal("AA", ["SB", "SB"], seededRandomInt(1)), /labels must be unique/);
assert.throws(() => Deal.deal("AA", [""], seededRandomInt(1)), /non-empty strings/);
assert.throws(
  () => Deal.deal("AA", Array.from({ length: 26 }, (_, index) => `P${index}`), seededRandomInt(1)),
  /more than 25 opponents/
);
assert.throws(() => Deal.deal("AA", [], () => -1), /must return an integer/);
assert.throws(() => Deal.deal("AA", [], () => 0.5), /must return an integer/);
assert.throws(() => Deal.deal("AA", [], (max) => max), /must return an integer/);

console.log("RFI secure deal helper: ok");
