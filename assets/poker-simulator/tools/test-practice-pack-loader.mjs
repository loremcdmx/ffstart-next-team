import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repo, path), "utf8");

async function boot(search) {
  const loaded = [];
  const scriptNodes = [];
  const registeredPacks = [];
  const listeners = new Map();
  const engine = {
    createTable(options = {}) { return { options }; },
    registerPack(key) { registeredPacks.push(key); return true; }
  };
  const baseCreateTable = engine.createTable;
  let context;

  function assetPath(ref) {
    const url = new URL(String(ref || ""), "http://127.0.0.1:4173/poker-simulator.html");
    return url.pathname.replace(/^\//, "");
  }

  const documentRef = {
    baseURI: "http://127.0.0.1:4173/poker-simulator.html",
    readyState: "loading",
    scripts: scriptNodes,
    documentElement: { dataset: {} },
    addEventListener(type, listener) { listeners.set(`document:${type}`, listener); },
    getElementById() { return null; },
    querySelectorAll(selector) {
      if (selector.includes("script")) return scriptNodes;
      return [];
    },
    createElement(tagName) {
      return { tagName: String(tagName).toUpperCase(), dataset: {}, getAttribute(name) { return this[name] || null; } };
    },
    head: {
      appendChild(node) {
        const ref = node.src || node.href || "";
        loaded.push({ tag: node.tagName, ref: assetPath(ref), feature: node.dataset?.simulatorFeature || "" });
        if (node.tagName === "SCRIPT") scriptNodes.push(node);
        queueMicrotask(() => {
          try {
            if (node.tagName === "SCRIPT") {
              const path = assetPath(node.src);
              runInContext(read(path), context, { filename: path });
            }
            node.onload?.();
          } catch (error) {
            node.onerror?.(error);
          }
        });
        return node;
      }
    }
  };

  const globalRef = {
    URL,
    URLSearchParams,
    WeakMap,
    Map,
    Set,
    Object,
    Array,
    Math,
    Number,
    String,
    Boolean,
    Date,
    RegExp,
    Error,
    TypeError,
    Promise,
    console,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { search, hostname: "127.0.0.1" },
    document: documentRef,
    PokerSimulatorEngine: engine,
    addEventListener(type, listener) { listeners.set(`window:${type}`, listener); }
  };
  globalRef.window = globalRef;
  globalRef.globalThis = globalRef;
  context = createContext(globalRef);

  runInContext(read("assets/poker-simulator/simulator-practice-packs.js"), context, { filename: "simulator-practice-packs.js" });
  runInContext(read("assets/poker-simulator/simulator-feature-loader.js"), context, { filename: "simulator-feature-loader.js" });
  const readyResult = await context.PokerSimulatorFeatureLoader.readyForBoot();
  const settings = {};
  context.PokerSimulatorPracticePacks.applyBootSettings(settings);
  return {
    active: context.PokerSimulatorPracticePacks.active(),
    loaded,
    registeredPacks,
    readyResult,
    engineWrapped: engine.createTable !== baseCreateTable,
    settings
  };
}

const canonical = await boot("?embedded=1&practice=rfi-open&hands=10");
assert.equal(canonical.active?.id, "rfi-open", "canonical practice query registers its descriptor before boot resolves");
assert(canonical.engineWrapped, "canonical pack installs the shared engine scenario wrapper");
assert.deepEqual(canonical.registeredPacks, ["rfi-open-position-demo"], "RFI engine content pack installs once");
assert.deepEqual(
  canonical.loaded.map((entry) => entry.ref),
  [
    "assets/poker-rfi-open-lesson/simulator-pack.css",
    "assets/poker-rfi-open-lesson/data.js",
    "assets/poker-rfi-open-lesson/simulator-pack.js"
  ],
  "RFI style and scripts load in the allowlisted order"
);
assert.equal(canonical.readyResult[1]?.id, "rfi-open", "readyForBoot resolves with the registered canonical descriptor");

const legacy = await boot("?embedded=1&lesson=resteal&hands=10");
assert.equal(legacy.active?.id, "resteal", "legacy lesson query resolves through the same registry");
assert(legacy.engineWrapped, "legacy alias installs the shared engine scenario wrapper");
assert.deepEqual(legacy.registeredPacks, ["resteal-bb-demo"], "Resteal engine content pack installs once");
assert.deepEqual(
  legacy.loaded.map((entry) => entry.ref),
  [
    "assets/poker-resteal-lesson/simulator-pack.css",
    "assets/poker-resteal-lesson/advice.js",
    "assets/poker-resteal-lesson/simulator-pack.js"
  ],
  "Resteal advice loads before its descriptor and boot waits for both"
);
assert.equal(legacy.readyResult[1]?.id, "resteal", "readyForBoot resolves with the registered legacy descriptor");

const freeplay = await boot("?embedded=1&practice=ffstart-freeplay&hands=5&mode=random&stackMin=40&stackMax=80&tempo=calm");
assert.equal(freeplay.active?.id, "ffstart-freeplay", "game-break query registers the real freeplay descriptor");
assert(freeplay.engineWrapped, "the shared registry activates the settings-only freeplay descriptor");
assert.deepEqual(freeplay.registeredPacks, [], "freeplay reuses the simulator's built-in gameplay pack");
assert.deepEqual(
  freeplay.loaded.map((entry) => entry.ref),
  ["assets/ffstart-course/simulator-freeplay-pack.js"],
  "game break loads only its bounded settings descriptor"
);
assert.equal(freeplay.readyResult[1]?.id, "ffstart-freeplay", "readyForBoot resolves with the game-break descriptor");
assert.deepEqual(
  {
    tableCount: freeplay.settings.tableCount,
    playerCount: freeplay.settings.playerCount,
    simulationMode: freeplay.settings.simulationMode,
    min: freeplay.settings.randomStackMinBb,
    max: freeplay.settings.randomStackMaxBb,
    hands: freeplay.settings.sessionHandLimit,
    tempo: freeplay.settings.handTempo,
    statsScope: freeplay.settings.statsScope
  },
  { tableCount: 1, playerCount: 6, simulationMode: "random", min: 40, max: 80, hands: 5, tempo: "calm", statsScope: "session" },
  "game break applies the requested one-table session boundaries"
);
assert.match(
  read("assets/poker-simulator/simulator-render-runtime.js"),
  /const FULL = Object\.freeze\(\[[\s\S]*?"session-hand-limit"/,
  "finishing a bounded game break uses a registered full-render reason"
);

console.log("Practice pack lazy-loader contract: ok");
