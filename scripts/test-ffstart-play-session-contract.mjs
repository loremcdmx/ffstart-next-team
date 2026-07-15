import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const page = readFileSync(new URL("ffstart/play-session.html", root), "utf8");
const controller = readFileSync(new URL("assets/ffstart-course/play-session.js", root), "utf8");
const styles = readFileSync(new URL("assets/ffstart-course/play-session.css", root), "utf8");
const progressSource = readFileSync(new URL("assets/poker-progress/progress.js", root), "utf8");
const simulatorPage = readFileSync(new URL("poker-simulator.html", root), "utf8");
const practiceRegistry = readFileSync(new URL("assets/poker-simulator/simulator-practice-packs.js", root), "utf8");
const simulatorRelease = "20260715-ffstart-handoff-v16";

assert.match(page, /data-play-device-gate/, "the phone layout explains why the full table is unavailable");
assert.match(page, /data-play-recovery[\s\S]*data-play-retry[\s\S]*data-play-recovery-continue/, "snapshot recovery offers retry and course continuation");
assert.match(page, /id="play-table-title" tabindex="-1"/, "the mounted table has a programmatic focus target");
assert.match(page, /20260715-freeplay-handoff-v4/g, "the handoff page uses a fresh immutable cache token");
assert.match(styles, /\.play-actions\.is-device-gated \.play-skip/, "the mobile continuation becomes the primary action");

assert.match(controller, /MOBILE_TABLE_MEDIA = "\(max-width: 620px\)"/, "phones are gated before mounting the full simulator");
assert.match(controller, /if \(mobileTableBlocked\(\)\)[\s\S]*applyDeviceGate\(\);[\s\S]*return;/, "the start handler cannot bypass the phone gate");
assert.match(controller, /MAX_SNAPSHOT_FAILURES = 3/, "snapshot failures have a bounded retry threshold");
assert.match(controller, /prefersReducedMotion\(\) \? "auto" : "smooth"/, "scrolling respects reduced-motion preferences");
assert.match(controller, /FFPlayerProgress\?\.setResult/, "completion uses the canonical progress API");
assert.match(controller, /FFTrainerEvents\?\.send/, "free-play lifecycle uses the canonical trainer event API");
assert.match(controller, /setResult\?\.\(progressKey\(\), result, \{[\s\S]*?telemetry: false,/, "unevaluated free play skips the upstream score-shaped progress event");
assert.match(controller, /evaluated: false/, "free play is explicitly marked as unevaluated");
assert.match(controller, /metadata:\s*\{[\s\S]*evaluated: false,[\s\S]*completed:/, "session telemetry carries evaluation semantics through canonical metadata");
assert.doesNotMatch(controller, /score:\s*100|bestScore:\s*100|correct:\s*Math\.max/, "free play never synthesizes a perfect score or correct-answer count");

for (const asset of [
  "simulator-practice-packs",
  "simulator-seat-slots",
  "simulator-betting",
  "simulator-action-controls",
  "simulator-settings",
  "simulator-cards",
  "simulator-table-renderer",
  "simulator-render-runtime",
  "simulator-feature-loader"
]) {
  assert.ok(simulatorPage.includes(`assets/poker-simulator/${asset}.js?v=${simulatorRelease}`), `${asset} uses the current immutable simulator URL`);
}
for (const asset of ["engine-preflop-policy", "engine-tournament-lobby", "simulator-engine"]) {
  assert.ok(simulatorPage.includes(`assets/poker-kit/simulator/${asset}.js?v=${simulatorRelease}`), `${asset} uses the current immutable engine URL`);
}
assert.ok(simulatorPage.includes(`assets/poker-progress/progress.js?v=${simulatorRelease}`), "the full simulator uses the current progress runtime URL");
assert.ok(practiceRegistry.includes(`assets/poker-resteal-lesson/simulator-pack.js?v=${simulatorRelease}`), "the resteal practice registry uses the current pack URL");
assert.ok(practiceRegistry.includes(`assets/ffstart-course/simulator-freeplay-pack.js?v=20260715-freeplay-v1`), "the full simulator registers the FF Start free-play pack");

const storage = new Map();
const windowObject = {
  FF_STATIC_LEARNING_HUB: true,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  location: {
    protocol: "https:",
    pathname: "/ffstart/play-session",
    href: "https://example.test/ffstart/play-session"
  },
  navigator: {},
  setTimeout() { return 1; },
  addEventListener() {},
  dispatchEvent() { return true; }
};
windowObject.window = windowObject;
const documentObject = {
  readyState: "complete",
  visibilityState: "visible",
  querySelectorAll() { return []; },
  addEventListener() {}
};
class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

vm.runInNewContext(progressSource, {
  window: windowObject,
  document: documentObject,
  CustomEvent: TestCustomEvent,
  console,
  Date,
  Math,
  JSON,
  URL,
  URLSearchParams
});

const result = windowObject.FFPlayerProgress.setResult("ffstart_play_session_smoke", {
  status: "passed",
  evaluated: false,
  completed: true,
  completedHands: 10,
  targetHands: 10,
  attempts: 10
});

assert.equal(result.status, "passed", "unevaluated play still records course completion");
assert.equal(result.evaluated, false, "stored completion remains explicitly unevaluated");
assert.equal(result.completedHands, 10, "stored completion keeps played volume");
assert.equal(result.correct, null, "stored completion has no fabricated correct count");
assert.equal(result.score, null, "stored completion has no fabricated score");
assert.equal(result.bestScore, null, "stored completion has no fabricated best score");
assert.equal(windowObject.FFPlayerProgress.getSkillProgress("ffstart_play_session_smoke").percent, null, "unevaluated completion has no display percent");

const archive = JSON.parse(storage.get("ff-trainer-events-v1") || "[]");
assert.equal(archive.length, 1, "setResult writes one canonical progress_result event");
assert.equal(archive[0].kind, "progress_result", "canonical event kind is preserved");
assert.equal(archive[0].result.evaluated, false, "telemetry preserves the unevaluated flag");
assert.equal(archive[0].result.completedHands, 10, "telemetry preserves played volume");
assert.equal(archive[0].result.score, null, "telemetry does not invent an accuracy score");
assert.equal(archive[0].result.correct, null, "telemetry does not invent correct answers");

windowObject.FFPlayerProgress.setResult("ffstart_local_only_smoke", {
  status: "passed",
  evaluated: false,
  completed: true,
  completedHands: 6,
  targetHands: 6,
  attempts: 6
}, { telemetry: false });
assert.equal(JSON.parse(storage.get("ff-trainer-events-v1") || "[]").length, 1, "telemetry:false keeps completion local without emitting a misleading zero-score event");

const scored = windowObject.FFPlayerProgress.setResult("ffstart_scored_smoke", {
  status: "passed",
  attempts: 4,
  correct: 3
});
assert.equal(scored.score, 75, "the existing scored-result path remains unchanged");
assert.equal(scored.bestScore, 75, "the existing scored-result best score remains unchanged");
assert.equal(scored.correct, 3, "the existing scored-result correct count remains unchanged");

console.log("FFStart play-session contract: OK");
