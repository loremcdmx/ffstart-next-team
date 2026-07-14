import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../simulator-cards.js", import.meta.url), "utf8");
const context = { window: {} };
runInNewContext(source, context, { filename: "simulator-cards.js" });

const model = context.window.PokerSimulatorCards.model();
const fallback = model.renderCard("Qh", { hero: true });
assert.match(fallback, /poker-deck-card--color-block/);
assert.match(fallback, /poker-deck-card--suit-h/);
assert.match(fallback, /poker-deck-card--hero/);
assert.match(fallback, /aria-label="Q♥"/);
assert.match(fallback, /data-fallback-card="true"/);
assert.doesNotMatch(fallback, /<span>Qh<\/span>/);

context.window.PokerDeckKit = {
  renderCard(card) { return `<deck-card>${card}</deck-card>`; },
  parseCard() { return { rank: "Q" }; }
};
assert.equal(model.renderCard("Qh"), "<deck-card>Qh</deck-card>");
assert.equal(model.cardRankValue("Qh"), 12);

console.log("simulator cards fallback: ok");
