import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { runSimulatorEngineScripts } from "../../../scripts/simulator-engine-script-list.mjs";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const document = {
  documentElement: { dataset: {} },
  readyState: "loading",
  addEventListener() {},
  querySelector() { return null; }
};
const window = {
  location: { search: "?embedded=1&practice=rfi-open&hands=10" },
  document,
  addEventListener() {},
  setInterval,
  clearInterval
};
const context = createContext({ window, globalThis: window, document, URL, URLSearchParams, console, setInterval, clearInterval });
const run = (path) => new Script(readFileSync(resolve(repo, path), "utf8"), { filename: path }).runInContext(context);

run("assets/poker-kit/simulator/bot-strategy-profile.js");
runSimulatorEngineScripts({ root: repo, context, Script });
run("assets/poker-simulator/simulator-practice-packs.js");
run("assets/poker-rfi-open-lesson/data.js");
run("assets/poker-rfi-open-lesson/simulator-pack.js");

const engine = window.PokerSimulatorEngine;
const pack = window.PokerRfiOpenSimulatorPack;
const hands = Array.from({ length: 10 }, (_, index) => engine.createTable({
  id: 1,
  handNo: index + 1,
  settings: pack.applyBootSettings({})
}));

assert.deepEqual(hands.map((table) => table.heroPosition), ["UTG", "LJ", "HJ", "CO", "BTN", "UTG", "LJ", "HJ", "CO", "BTN"]);
for (const table of hands) {
  assert.equal(table.status, "playing");
  assert.equal(table.heroTurn, true);
  assert.equal(table.preflopOpenerSeatId, null);
  assert.equal(table.currentBet, 1);
  assert.equal(table.rfiOpenDrill.attempts, 1, "forced folds produce the exact RFI decision in one deal");
  assert.equal(table.rfiOpenDrill.position, table.heroPosition);
}
assert.equal(pack.practiceDescriptor.scenario.freshDeal, true);
assert.equal(typeof pack.practiceDescriptor.defaultBetAmount, "function");
assert(!/engine\.createTable\s*=/.test(readFileSync(resolve(repo, "assets/poker-rfi-open-lesson/simulator-pack.js"), "utf8")));

const defaultBet = window.PokerSimulatorPracticePacks.defaultBetAmount({
  table: hands[0],
  bounds: { min: 2, max: 40 },
  value: 2.2,
  draft: null
});
assert.equal(defaultBet, 2.2);

console.log("RFI simulator practice pack: ok");
