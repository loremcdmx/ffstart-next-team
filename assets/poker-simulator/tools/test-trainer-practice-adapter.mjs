import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const adapterSource = readFileSync(resolve(repo, "assets/poker-trainer-shell/simulator-practice.js"), "utf8");
const calls = { snapshot: [], mount: [], build: [] };
const host = {
  tagName: "DIV",
  innerHTML: "",
  querySelector() { return null; }
};
const iframe = { tagName: "IFRAME", src: "" };
const document = {
  querySelector(selector) { return selector === "#frame" ? iframe : host; },
  createTreeWalker() { return { nextNode: () => false }; },
  createElement() { return { appendChild() {}, dataset: {}, className: "", type: "" }; }
};
const window = {
  location: { hostname: "localhost" },
  document,
  NodeFilter: { SHOW_TEXT: 4 },
  FFTrainerSimulatorSnapshot: {
    renderTable(spot, state) { calls.snapshot.push({ spot, state }); return "<div>table</div>"; }
  },
  PokerSimulatorEmbed: {
    buildSimulatorUrl(options) {
      calls.build.push(options);
      const url = new URL(options.url, "http://localhost:4173/");
      url.searchParams.set("embedded", "1");
      for (const key of ["practice", "hands", "tables", "tempo", "run"]) if (options[key]) url.searchParams.set(key, String(options[key]));
      return url;
    },
    mount(target, options) { calls.mount.push({ target, options }); return { target, options }; }
  }
};
const context = createContext({ window, globalThis: window, URL, console });
new Script(adapterSource, { filename: "simulator-practice.js" }).runInContext(context);
const adapter = window.FFTrainerSimulator;

const spot = { id: "bb-call", table: { heroPosition: "BB" } };
adapter.renderDecision(host, spot, { answered: true });
assert.equal(calls.snapshot.length, 1);
assert.equal(calls.snapshot[0].spot, spot);
assert.equal(calls.snapshot[0].state.answered, true);

adapter.mountPractice(host, { practice: "resteal", hands: 25, tables: 1, tempo: "fast", run: "run-1" });
assert.equal(calls.mount.length, 1, "container mode delegates to PokerSimulatorEmbed.mount");
adapter.mountPractice("#frame", { practice: "rfi-open", hands: 10, tables: 1, tempo: "fast", run: "run-2" });
const url = new URL(iframe.src);
assert.deepEqual(Object.fromEntries(url.searchParams), {
  embedded: "1",
  practice: "rfi-open",
  hands: "10",
  tables: "1",
  tempo: "fast",
  run: "run-2"
});
adapter.mountPractice("#frame", { practice: "rfi-open", tables: 1, tempo: "fast", run: "run-endless" });
const endlessUrl = new URL(iframe.src);
assert.equal(endlessUrl.searchParams.has("hands"), false, "omitting hands preserves an unlimited practice session");
assert.equal(endlessUrl.searchParams.get("practice"), "rfi-open");
assert.equal(endlessUrl.searchParams.get("run"), "run-endless");

for (const lesson of [
  "assets/poker-rfi-open-lesson/lesson.js",
  "assets/poker-bb-call-defense-lesson/lesson.js",
  "assets/poker-resteal-lesson/lesson.js"
]) {
  const source = readFileSync(resolve(repo, lesson), "utf8");
  assert(source.includes("FFTrainerSimulator"), `${lesson} uses the shared adapter`);
  assert(!/\.src\s*=/.test(source), `${lesson} does not build an iframe integration itself`);
}
for (const forbidden of ["seatX", "seatY", "cardX", "cardY", "markerX", "markerY"]) {
  assert(!adapterSource.includes(forbidden), `adapter API exposes no ${forbidden}`);
}

console.log("Trainer practice adapter contract: ok");
