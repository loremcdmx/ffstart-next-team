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
  "poker-resteal-lesson/data.js"
]) {
  runInNewContext(readFileSync(new URL(path, assets), "utf8"), context, { filename: path });
}

const renderer = context.FFTrainerSimulatorSnapshot;
const content = context.PokerRestealData;
assert.ok(renderer?.renderTable, "snapshot renderer is available");
assert.ok(context.PokerChipKit?.renderAmount, "shared chip pack is available");
assert.ok(context.PokerDeckKit?.renderCard, "shared deck pack is available");
assert.equal(content.comparisonFoldBaselineBb, -1.12, "comparison chart anchors fold to BB plus ante");

const lessonCss = readFileSync(new URL("poker-resteal-lesson/lesson.css", assets), "utf8");
const lessonHtml = readFileSync(new URL("../resteal-lesson.html", assets), "utf8");
const lessonJs = readFileSync(new URL("poker-resteal-lesson/lesson.js", assets), "utf8");
assert.doesNotMatch(lessonCss, /\.seat--\d[^\{]*\{[^}]*--seat-left/);
assert.doesNotMatch(lessonCss, /\.bet-marker--\d/);
assert.doesNotMatch(lessonCss, /hero-felt-bet[^\{]*\{[^}]*transform/);
assert.match(lessonCss, /table-action\[data-answer-state\][^\{]*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 16px/);
assert.match(lessonCss, /data-answer-state="correct"[^\{]*\.table-action-result-mark::after\s*\{[^}]*content:\s*"✓"/);
assert.match(lessonCss, /risk-called-outcomes \.risk-share\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(lessonCss, /risk-called-outcomes \.risk-share small\s*\{[^}]*overflow-wrap:\s*break-word/);
assert.match(lessonCss, /font-family:\s*Inter, ui-sans-serif, -apple-system/);
assert.match(lessonCss, /h1, h2, h3\s*\{[^}]*text-wrap:\s*balance/);
assert.match(lessonCss, /\.wisdom-slide\.objection-card\s*\{[^}]*align-items:\s*flex-start[^}]*justify-content:\s*flex-start/);
assert.match(lessonCss, /\.wisdom-slide\.objection-card > small\s*\{[^}]*max-width:\s*68ch/);
assert.match(lessonCss, /\.objection-card > p:not\(\.eyebrow\)\s*\{[^}]*font-size:\s*15px[^}]*line-height:\s*1\.6/);
assert.match(lessonCss, /@media \(max-width: 760px\)[\s\S]*\.wisdom-slide\.objection-card\s*\{[^}]*overflow-y:\s*auto/);
assert.equal((lessonHtml.match(/id="opponentTabs"/g) || []).length, 1, "deep lesson exposes one opponent picker");
assert.doesNotMatch(lessonHtml, /id="presetRow"|id="fieldSummary"|class="range-picture"/);
assert.equal((lessonHtml.match(/id="openPctOut"/g) || []).length, 1, "open frequency is shown once");
assert.match(lessonHtml, /class="fold-summary" id="foldSummary"/);
assert.match(lessonJs, /const field = usesFieldProfile \? fieldMetrics\(state\.opponent\) : null/, "field profile summary keeps observed fold data separate from the recommendation model");
assert.match(lessonJs, /openPct: controls\.openPct,[\s\S]*callPct: controls\.callPct/, "field matrix uses a structural open and continuation range");
assert.match(lessonJs, /foldBaselineFor = \(category\)[\s\S]*advantageOverFold = \(rawEvBb, category\)/, "comparison lines use each category's own fold baseline");
assert.match(lessonJs, /const difference = jamRaw - callRaw/, "jam-call delta stays on the original unrounded observations");
assert.match(lessonHtml, /−0,28 у низких связок против −0,66 паса становится примерно \+0,38 BB/, "comparison methodology explains the category-specific fold rebase");

const introPot = context.PokerChipKit.renderAmount(4.5, { maxVisual: 3, detail: true });
assert.match(introPot, /poker-chip--one/);
assert.match(introPot, /chip-overflow/);
assert.match(context.PokerDeckKit.renderCard("Qh", { theme: "color-block", hero: true, fourColor: true }), /poker-deck-card--suit-h/);

const first = renderer.renderTable(content.firstSpot, {});
assert.match(first, /class="table-shell/);
assert.match(first, /Qh/);
assert.match(first, /Jd/);
assert.match(first, /class="hero-felt-bet"/);
assert.match(first, />1 BB</);
assert.equal((first.match(/data-option-key=/g) || []).length, 4);
assert.match(first, /data-option-key="raise8"/);
assert.match(first, /3-бет до/);
assert.equal(content.firstSpot.hand, "QJo");
assert.equal(content.firstSpot.table.currentBet, 2);
assert.equal(content.firstSpot.table.pot, "4.5 BB");
assert.equal(content.firstSpot.table.anteBb, 1);

const answered = renderer.renderTable(content.firstSpot, { answered: true, selectedKey: "call" });
assert.match(answered, /data-marker-geometry="simulator-slot-v1"/);
assert.match(answered, /data-option-key="jam"[^>]*disabled/);
assert.match(answered, /is-correct/);
assert.match(answered, /is-wrong/);
assert.match(answered, /data-answer-state="correct"/);
assert.match(answered, /data-answer-state="wrong"/);
assert.match(answered, /aria-label="Олл-ин до 30 BB — верный ответ"/);

console.log("PASS resteal room: intro decision renders through the shared simulator snapshot");
