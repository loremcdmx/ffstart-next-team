import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const assets = new URL("../../", import.meta.url);
const context = { innerWidth: 1280 };
context.window = context;
context.globalThis = context;

for (const path of [
  "poker-kit/decks/deck-library.js",
  "poker-kit/chips/chip-library.js",
  "poker-simulator/simulator-board-render.js",
  "poker-simulator/simulator-seat-slots.js",
  "poker-simulator/simulator-seat-renderer.js",
  "poker-simulator/simulator-table-renderer.js",
  "poker-trainer-shell/simulator-snapshot.js"
]) {
  runInNewContext(readFileSync(new URL(path, assets), "utf8"), context, { filename: path });
}

const renderer = context.FFTrainerSimulatorSnapshot;
assert.ok(renderer?.renderTable, "snapshot renderer is available");

const revealedCards = {
  CO: ["Qh", "Jd"],
  BTN: ["9c", "8s"],
  SB: ["7h", "2d"],
  BB: ["Ac", "3s"]
};
const spot = {
  id: "rfi-reveal-contract",
  hand: "K5o",
  table: {
    seats: ["UTG", "LJ", "HJ", "CO", "BTN", "SB", "BB"].map((label) => ({
      label,
      state: label === "HJ" ? "hero" : /SB|BB/.test(label) ? "blind" : "waiting",
      stackBb: 40,
      cards: revealedCards[label] || [],
      revealCardsAfterAnswer: Boolean(revealedCards[label])
    })),
    heroPosition: "HJ",
    heroStack: "40 BB",
    effectiveStack: "40 BB",
    pot: "1 BB",
    anteBb: 1,
    heroCards: ["Ks", "5d"],
    boardCards: [],
    street: "preflop",
    actionLine: ["UTG fold", "LJ fold"],
    historyLine: "все до Hero выбросили",
    toCall: 0,
    currentBet: 0,
    dealerPosition: "BTN"
  },
  options: [
    { key: "fold", label: "Пас", correct: true },
    { key: "open", label: "Рейз 2 BB", correct: false }
  ]
};

const normalized = renderer.buildTable(spot, {});
assert.deepEqual(
  Array.from(normalized.seats.filter((seat) => seat.revealCardsAfterAnswer), (seat) => seat.position),
  ["CO", "BTN", "SB", "BB"]
);
assert.deepEqual(Array.from(normalized.seats.find((seat) => seat.position === "CO").cards), revealedCards.CO);

const beforeAnswer = renderer.renderTable(spot, {});
assert.doesNotMatch(beforeAnswer, /is-revealed-live/);
for (const cards of Object.values(revealedCards)) {
  for (const card of cards) assert.doesNotMatch(beforeAnswer, new RegExp(`data-card="${card}"`));
}

const afterAnswer = renderer.renderTable(spot, { answered: true, selectedKey: "fold" });
assert.equal((afterAnswer.match(/is-revealed-live/g) || []).length, 4);
for (const cards of Object.values(revealedCards)) {
  for (const card of cards) assert.match(afterAnswer, new RegExp(`data-card="${card}"`));
}
assert.match(afterAnswer, /data-answer-state="correct"/);

const ordinarySpot = structuredClone(spot);
ordinarySpot.table.seats = ordinarySpot.table.seats.map((seat) => ({
  label: seat.label,
  state: seat.state,
  stackBb: seat.stackBb
}));
const ordinaryAfter = renderer.renderTable(ordinarySpot, { answered: true, selectedKey: "fold" });
assert.doesNotMatch(ordinaryAfter, /is-revealed-live/);

console.log("RFI room reveal contract: ok");
