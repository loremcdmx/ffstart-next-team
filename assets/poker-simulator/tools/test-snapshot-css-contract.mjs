import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repo, path), "utf8");
const shell = read("assets/poker-trainer-shell/shell.css");

assert.match(
  shell,
  /\.ff-shell-simulator-snapshot\.table-grid\[data-count="1"\][^{]*\.seat:not\(\.is-hero\)[^{]*\.seat-cards\.hidden-cards\s*\{[^}]*display:\s*none\s*!important/,
  "shared snapshot CSS hides only unrevealed opponent card backs"
);
assert.match(
  shell,
  /\.ff-shell-simulator-snapshot\.table-grid\[data-count="1"\][^{]*\.seat:not\(\.is-hero\)[^{]*\.seat-cards:is\(\.is-revealed, \.is-revealed-live\)\s*\{[^}]*display:\s*flex\s*!important/,
  "shared snapshot CSS displays revealed opponent cards"
);
assert.doesNotMatch(
  shell,
  /\.ff-shell-simulator-snapshot\.table-grid\[data-count="1"\][^{]*\.seat:not\(\.is-hero\)[^{]*\.seat-cards\s*\{[^}]*display:\s*none/,
  "shared snapshot CSS never hides every opponent card state"
);

for (const token of [
  "--hero-card-width: clamp(51px, 6.3cqw, 61.5px)",
  "--sim-1t-seat-w: clamp(108px, 14cqw, 126px)",
  "--sim-1t-seat-h: 46px",
  "--hero-card-pocket-y: -18px",
  "--hero-card-width: clamp(36px, 9.75cqw, 43.5px)",
  "--sim-1t-seat-w: 94px",
  "--sim-1t-seat-h: 40px"
]) {
  assert(shell.includes(token), `shared compact snapshot profile owns ${token}`);
}

const lessonCssFiles = [
  "assets/poker-bb-call-defense-lesson/base.css",
  "assets/poker-bb-call-defense-lesson/lesson.css",
  "assets/poker-rfi-open-lesson/lesson.css",
  "assets/poker-rfi-open-lesson/simulator-pack.css",
  "assets/poker-resteal-lesson/lesson.css",
  "assets/poker-resteal-lesson/simulator-pack.css"
];
const geometryTokens = [
  "--hero-card-width",
  "--hero-card-cap",
  "--hero-card-pocket-y",
  "--sim-1t-hero-card",
  "--sim-1t-seat-w",
  "--sim-1t-seat-h",
  "--seat-cards-",
  "--reveal-card-",
  "--mini-card-width"
];

for (const file of lessonCssFiles) {
  const source = read(file);
  for (const token of geometryTokens) {
    assert(!source.includes(token), `${file} does not own simulator geometry token ${token}`);
  }
  assert.doesNotMatch(source, /\.seat-cards\b/, `${file} does not resize or reposition simulator card containers`);
  assert.doesNotMatch(
    source,
    /\.lesson-table-host\s+\.table-shell\s*\{[^}]*(?:width|height|--seat-|--hero-card|--sim-1t-)/,
    `${file} does not redefine the shared compact table-shell geometry`
  );
  assert.doesNotMatch(
    source,
    /\.lesson-table-host[^,{]*\.seat-(?:panel|position)(?:[^,{]*)\{[^}]*(?:left|right|top|bottom|width|height|padding|transform)\s*:/,
    `${file} does not redefine compact seat coordinates or sizes`
  );
}

console.log("Snapshot CSS ownership contract: ok");
