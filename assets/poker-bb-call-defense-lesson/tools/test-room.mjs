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
  "poker-trainer-shell/simulator-snapshot.js",
  "poker-bb-call-defense-lesson/data.js"
]) {
  runInNewContext(readFileSync(new URL(path, assets), "utf8"), context, { filename: path });
}

const renderer = context.FFTrainerSimulatorSnapshot;
const content = context.PokerBbCallData;
assert.ok(renderer?.renderTable, "snapshot renderer is available");

const lessonCss = readFileSync(new URL("poker-bb-call-defense-lesson/base.css", assets), "utf8");
assert.doesNotMatch(lessonCss, /\.seat--\d[^\{]*\{[^}]*--seat-left/);
assert.doesNotMatch(lessonCss, /\.bet-marker--\d/);
assert.doesNotMatch(lessonCss, /hero-felt-bet[^\{]*\{[^}]*transform/);

const firstTable = renderer.buildTable(content.firstSpot, {});
assert.equal(firstTable.__heroBet, 1);
assert.equal(firstTable.seats.find((seat) => seat.isHero).stack, 38, "BB stack reflects both the live blind and the one-BB ante");
const firstTableUnanswered = renderer.renderTable(content.firstSpot, { answered: false, selectedKey: "" });
assert.doesNotMatch(firstTableUnanswered, /data-answer-state=/, "fresh first hand has no graded action state");
assert.doesNotMatch(firstTableUnanswered, /table-action-result-mark/, "fresh first hand has no result badges");
assert.doesNotMatch(firstTableUnanswered, />Верно<|>Ошибка</, "fresh first hand does not reveal the answer");

const decimalSpot = content.practiceSpots.find((spot) => spot.id === "qq-mp-25");
const decimalTable = renderer.buildTable(decimalSpot, { answered: true, selectedKey: "raise" });
assert.equal(decimalTable.__heroBet, 1, "2.5 BB must not split into a phantom BB action");
assert.equal(decimalTable.seats.find((seat) => seat.isHero).stack, 38, "BB stack stays net of blind and ante at every open size");
assert.equal(decimalTable.seats.find((seat) => seat.position === "MP").committedStreet, 2.5);
assert.ok(!decimalTable.__actions.some((action) => action.seatKey === "BB" && action.amountBb === 5));

const rendered = renderer.renderTable(decimalSpot, { answered: true, selectedKey: "raise" });
assert.match(rendered, /data-marker-geometry="simulator-slot-v1"/);
assert.match(rendered, /data-option-key="raise"/);
assert.match(rendered, />3-бет</);
assert.doesNotMatch(rendered, /3-бет до/);
assert.match(rendered, /data-answer-state="correct"/);
assert.match(rendered, /aria-label="3-бет — верный ответ"/);

console.log("BB call defense room snapshot: ok");
