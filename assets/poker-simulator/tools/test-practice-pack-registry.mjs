import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const source = readFileSync(resolve(repo, "assets/poker-simulator/simulator-practice-packs.js"), "utf8");

function harness(search, engine = null) {
  const window = { location: { search } };
  if (engine) window.PokerSimulatorEngine = engine;
  const context = createContext({ window, globalThis: window, URL, URLSearchParams, console });
  new Script(source, { filename: "simulator-practice-packs.js" }).runInContext(context);
  return window.PokerSimulatorPracticePacks;
}

const legacy = harness("?embedded=1&lesson=resteal");
assert.equal(legacy.requestedId(), "resteal");
assert.equal(legacy.catalogEntry().id, "resteal");
assert(legacy.catalogEntry().scripts.every((path) => path.startsWith("assets/poker-resteal-lesson/")));

let createCalls = 0;
const engine = {
  createTable(options) {
    createCalls += 1;
    return { heroPosition: options.scenarioHeroPosition, status: "playing", settings: options.settings };
  }
};
const registry = harness("?practice=synthetic-bb", engine);
const descriptor = registry.register({
  id: "synthetic-bb",
  aliases: ["bb-only"],
  storageSuffix: "synthetic-bb-v1",
  applyBootSettings(settings) { settings.playerCount = 6; },
  scenario: {
    freshDeal: true,
    maxAttempts: 1,
    heroPosition: "BB",
    settings: { playerCount: 6 },
    accept: (table) => table.heroPosition === "BB",
    decorate(table, { attempts }) { table.practiceAttempts = attempts; return table; }
  }
});

assert.equal(registry.active(), descriptor);
assert.equal(registry.active("?lesson=bb-only"), descriptor, "legacy aliases resolve through the same registry");
const settings = {};
registry.applyBootSettings(settings);
assert.equal(settings.playerCount, 6);
const table = engine.createTable({ settings: {}, handNo: 1, previousTable: { id: 99 } });
assert.equal(createCalls, 1, "a declarative BB-only scenario needs one engine deal");
assert.equal(table.heroPosition, "BB");
assert.equal(table.practiceAttempts, 1);
assert.equal(table.settings.playerCount, 6);
assert.throws(() => registry.register({ id: "synthetic-bb" }), /already registered/);

const inactiveEngine = { calls: 0, createTable() { this.calls += 1; return { heroPosition: "CO" }; } };
const inactive = harness("?practice=not-registered", inactiveEngine);
inactive.register({ id: "other", scenario: { heroPosition: "BB" } });
assert.equal(inactiveEngine.createTable({}).heroPosition, "CO");
assert.equal(inactiveEngine.calls, 1, "inactive packs do not wrap the engine");

for (const file of ["simulator-settings.js", "simulator-betting.js", "simulator-action-controls.js"]) {
  const core = readFileSync(resolve(repo, "assets/poker-simulator", file), "utf8");
  assert(!/Poker(?:RfiOpen|Resteal)SimulatorPack/.test(core), `${file} has no named lesson dependency`);
}
for (const file of [
  "assets/poker-rfi-open-lesson/simulator-pack.js",
  "assets/poker-resteal-lesson/simulator-pack.js"
]) {
  const pack = readFileSync(resolve(repo, file), "utf8");
  assert(!/engine\.createTable\s*=/.test(pack), `${file} does not monkeypatch createTable`);
}

console.log("Practice pack registry contract: ok");
