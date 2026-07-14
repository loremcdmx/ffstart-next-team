import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const lessonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(lessonRoot, "../..");
const htmlPath = path.join(repoRoot, "bb-call-defense-lesson.html");
const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(path.join(lessonRoot, "lesson.css"), "utf8");
const baseCss = fs.readFileSync(path.join(lessonRoot, "base.css"), "utf8");
const js = fs.readFileSync(path.join(lessonRoot, "lesson.js"), "utf8");
const ffRealization = JSON.parse(fs.readFileSync(path.join(lessonRoot, "data/ff-bb-call-realization.json"), "utf8"));
const practiceAdapter = fs.readFileSync(path.join(repoRoot, "assets/poker-trainer-shell/simulator-practice.js"), "utf8");

const ids = [
  "ideaScreen", "wisdomScreen", "deepScreen", "practiceScreen", "memoryScreen",
  "startLesson", "firstTable", "firstCoach", "wisdomCarouselTrack",
  "sizeDefenseDefaultCopy", "sizeDefensePreview", "sizeDefenseHint",
  "oddsSizeTabs", "rangeSizeTabs", "positionTabs", "rangeChart",
  "realizationRatio", "realizationDetail",
  "practiceSetup", "practiceRun", "practiceTable", "practiceCoach",
  "startPracticeSession", "exitPractice",
  "memorySizeTabs", "memoryPositionTabs", "memoryScenarioTitle", "memoryChart", "memoryHint", "memoryCoach", "memoryCoachBody"
];

for (const id of ids) {
  assert.match(html, new RegExp('id="' + id + '"'), id);
}

const dynamicIds = new Set(["openWisdom", "memoryCoachTitle"]);
for (const selector of js.matchAll(/\$\("#([A-Za-z][A-Za-z0-9_-]*)"\)/g)) {
  if (dynamicIds.has(selector[1])) continue;
  assert.match(html, new RegExp('id="' + selector[1] + '"'), selector[1]);
}

for (const src of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
  const local = src[1].split("?")[0];
  if (!local.startsWith("assets/")) continue;
  assert.ok(fs.existsSync(path.join(repoRoot, local)), local);
}

assert.equal((html.match(/data-wisdom-slide/g) || []).length, 9);
assert.match(js, /button\.className = "wisdom-story-dot"/);
assert.equal((html.match(/data-step-target=/g) || []).length, 5);
assert.equal((html.match(/<small>Стек 60 BB<\/small>/g) || []).length, 2, "intro table keeps both players at 60 BB");
assert.match(html, />5\. Проверка памяти</);
assert.doesNotMatch(html, /Голос тренера встроен|расшифровка очищена от шума ASR|coach-source-note/);
assert.doesNotMatch(html, /Оценка тренера: пропуск одной такой защиты|экспертная оценка, не измерение этого урока/);
assert.match(html, /маленький лишний фолд повторяется и складывается в большой лик на дистанции/);
assert.match(html, /против минрейза с батона эти руки надо защищать/);
assert.match(html, /Рука входит в рейндж защиты\?/);
assert.doesNotMatch(html, /Где рука\?/);
assert.equal((html.match(/data-leak-cards=/g) || []).length, 5);
assert.match(js, /deckKit\.renderCard\(card, \{ theme: "color-block", mini: true, fourColor: true, className: "leak-color-card" \}\)/);
assert.match(css, /\.leak-hand-cards \.poker-deck-card \{[\s\S]*?--poker-card-width:/);
assert.match(js, /function renderMemoryErrorCards\(hand\)/);
assert.match(js, /deckKit\.renderCard\(card, \{ theme: "color-block", mini: true, fourColor: true, className: "memory-error-card" \}\)/);
assert.match(js, /grade\.correctCombos \/ grade\.totalCombos \* 100/);
assert.match(js, /fmtCount\(grade\.correctCombos\)[^\n]+fmtCount\(grade\.totalCombos\)[^\n]+комбинаций/);
assert.match(js, /Пары весят 6 комбо, suited — 4, offsuit — 12/);
assert.match(js, /memoryErrorComboCount\(error, tone\)/);
assert.match(js, /ошибочных комбинаций/);
assert.doesNotMatch(js, /grade\.correct\)[^\n]+grade\.total\)[^\n]+клеток/);
assert.match(html, /memory-combo-score/);
assert.match(js, /Пропущен дефенд/);
assert.match(js, /Лишний дефенд/);
assert.match(js, /Перепутано действие/);
assert.match(js, /is-review-missed/);
assert.match(js, /is-review-extra/);
assert.match(js, /is-review-action/);
assert.match(js, /cell\.classList\.add\("is-review-error-" \+ errorType\)/);
assert.match(js, /memoryErrorTypeLabel\(errorType\)/);
assert.doesNotMatch(js, /grade\.errors\.slice\(0, 6\)/);
assert.match(css, /\.memory-error-cards \.poker-deck-card \{[\s\S]*?--poker-card-width:/);
assert.match(css, /\.memory-error-list \{[\s\S]*?overflow-y: auto/);
assert.match(css, /--memory-error-missed: #ff7889/);
assert.match(css, /--memory-error-extra: #ffe05f/);
assert.match(css, /--memory-error-action: #aa7af3/);
assert.match(css, /\.is-review-error-extra \{[\s\S]*?--memory-review-accent: var\(--memory-error-extra\)/);
assert.match(css, /\.is-review-error-action \{[\s\S]*?--memory-review-accent: var\(--memory-error-action\)/);
assert.match(css, /\.memory-error-item \{[\s\S]*?border-left: 3px solid var\(--memory-error-accent\)/);
assert.doesNotMatch(html, /против BTN 2x это зелёные клетки/);
assert.match(html, /не пасуй заранее: прочитай позицию, сайз и только потом вспомни чарт и прими решение\./);
assert.doesNotMatch(html, /только потом найди клетку/);
const priceEquation = html.match(/<div class="price-equation"[\s\S]*?<\/div>\s*<\/article>/)?.[0];
assert.ok(priceEquation, "price equation");
assert.match(priceEquation, /Доплата сейчас[\s\S]*?1 BB/);
assert.match(priceEquation, /Банк после колла[\s\S]*?5,5 BB/);
assert.match(priceEquation, /Цена колла[\s\S]*?18,2%/);
assert.match(priceEquation, /до учёта реализации и рейка/);
const sizeLadder = html.match(/<div class="size-ladder"[\s\S]*?<\/div>\s*<\/article>/)?.[0];
assert.ok(sizeLadder, "size ladder");
assert.match(sizeLadder, /Опен BTN 2 BB[\s\S]*?90%/);
assert.match(sizeLadder, /Опен BTN 2,5 BB[\s\S]*?55%/);
assert.match(sizeLadder, /Опен BTN 3 BB[\s\S]*?27%/);
assert.equal((sizeLadder.match(/data-size-preview=/g) || []).length, 2);
assert.match(sizeLadder, /data-size-preview="2_5"[\s\S]*?aria-controls="sizeDefensePreview"[\s\S]*?55%/);
assert.match(sizeLadder, /data-size-preview="3_0"[\s\S]*?aria-controls="sizeDefensePreview"[\s\S]*?27%/);
assert.match(sizeLadder, /Наведи на 55% или 27%/);
assert.doesNotMatch(sizeLadder, /18,2%|23,1%|26,7%/);
assert.match(js, /function renderSizeDefensePreview\(sizeKey\)/);
assert.match(js, /Content\.rangeCellFor\(sizeKey, "BTN", hand\)/);
assert.match(js, /100 - scenario\.foldPct/);
assert.match(js, /function comboWeightedDefensePct\(sizeKey\)/);
assert.match(js, /Комбинационно-взвешенная транскрипция 169 клеток/);
assert.match(js, /Цена колла объясняет сужение, а не сама задаёт точную границу/);
assert.match(js, /button\.addEventListener\("pointerleave", restoreFocusedPreview\)/);
assert.match(js, /slide\.toggleAttribute\("inert", !active\)/);
assert.match(css, /\.size-preview-matrix \{[\s\S]*?grid-template-columns: repeat\(13, minmax\(0, 1fr\)\)/);
assert.match(css, /\.size-defense-trigger:focus-visible/);
assert.doesNotMatch(html + js + css, /rangeFacts|range-facts|renderRangeFacts|range-hand-grid|range-scenario-strip|source-boundary|Весь дефенд|Пас диапазона|Это не расчёт твоего личного EV/);
assert.match(html, /assets\/poker-bb-call-defense-lesson\/base\.css/);
assert.doesNotMatch(html, /assets\/poker-resteal-lesson/);
assert.match(js, /if \(chosen\.correct\) state\.stats\.correct \+= 1/);
assert.match(js, /function focusProgress\(target\)/);
assert.match(js, /target\.scrollIntoView\(\{ block: "center", inline: "nearest" \}\)/);
assert.match(js, /#openWisdom[\s\S]+focusProgress\(next\)/);
assert.match(js, /#practiceTable \[data-practice-next\][\s\S]+focusProgress\(next\)/);
assert.match(js, /function renderPracticeRangeProof\(spot\)/);
assert.match(js, /data-matrix-row/);
assert.match(js, /data-practice-next/);
assert.match(js, /config\.hideActionStatus/);
assert.match(js, /FFTrainerSimulator\.renderDecision/);
assert.match(practiceAdapter, /if \(options\.hideActionStatus\) host\.querySelector\("\.action-status"\)\?\.remove\(\)/, "shared adapter owns action-status cleanup");
assert.match(js, /renderRoomTable\(\$\("#firstTable"\), Content\.firstSpot, state\.firstChoice, \{ hideActionStatus: true \}\)/);
assert.match(js, /unlocked:\s*false/, "first-hand answer and persistent lesson unlock are separate state");
assert.match(js, /if \(!state\.unlocked && next !== "idea"\) return;/, "saved lesson unlock controls tab navigation");
assert.match(js, /JSON\.stringify\(\{ step: state\.step, unlocked: state\.unlocked \}\)/);
assert.match(js, /state\.firstChoice = key;\s+state\.unlocked = true;/);
assert.match(js, /K4o — это колл/);
assert.match(js, /Именно такие руки часто пасуют на автопилоте\./);
assert.doesNotMatch(js, /зелёная клетка 100%; именно такие руки часто пасуют на автопилоте/);
assert.doesNotMatch(js, /JSON\.stringify\(\{[^}]*firstChoice/, "first-hand answer is never persisted");
assert.match(js, /var restoredUnlock = Boolean\(saved\.unlocked \|\| saved\.firstChoice\);/, "legacy saved answers migrate to unlock-only progress");
const initSource = js.slice(js.indexOf("  function init()"), js.indexOf("\n\n  if (document.readyState"));
assert.doesNotMatch(initSource, /state\.firstChoice\s*=/, "page load never restores a previous answer");
assert.doesNotMatch(initSource, /has-answer/, "page load never renders the first hand as answered");
assert.match(js, /document\.body\.classList\.add\("practice-is-running"\)/);
assert.match(js, /document\.body\.classList\.remove\("practice-is-running"\)/);
assert.match(js, /if \(next !== "practice" && document\.body\.classList\.contains\("practice-is-running"\)\) stopPractice\(false\)/);
assert.match(js, /function stopPractice\(focusStart\)/);
assert.doesNotMatch(baseCss, /body\.practice-is-running \.topline\s*\{\s*display:\s*none/);
assert.match(baseCss, /body\.practice-is-running \.topline \{[\s\S]*?position: sticky/);
assert.match(baseCss, /body\.practice-is-running \{[^}]*overflow-y: auto/);
assert.match(html, /id="startPracticeSession">Попробовать<\/button>/);
assert.doesNotMatch(html, /data-session-hands|Количество решений|0 \/ 10/);
assert.match(js, /var cycle = Math\.floor\(state\.practiceIndex \/ spots\.length\)/);
assert.match(js, /var offset = \(state\.practiceRun \+ cycle \* 3\) % spots\.length/);
assert.match(js, /tableOptions\.nextLabel = "Следующая раздача"/);
assert.doesNotMatch(js, /state\.practiceHands|makePracticeQueue|renderPracticeComplete|Показать итог|restartPractice|finishPractice/);
assert.doesNotMatch(css, /practice-counts|practice-final-grid|defender-medal/);
assert.match(js, /positionLabels: \{ UTG: "EP" \}/);
assert.match(js, /decimalComma: true/);
assert.ok(practiceAdapter.includes(String.raw`value.replace(/(\d)\.(\d)(?=\s*BB)/g, "$1,$2")`), "shared adapter localizes decimal BB amounts");
assert.doesNotMatch(html, /BB ante 1 BB/);
assert.doesNotMatch(html + js, /practiceSpotTitle|practiceSpotPrompt|practiceKicker/);
assert.doesNotMatch(js, /Цена колла ["'] \+ fmt\(Content\.sizes\[spot\.sizeKey\]/);
assert.doesNotMatch(js, /Посмотри на соседние клетки/);
assert.match(html, /<div class="bb-range-matrix" id="rangeChart" role="grid"/);
assert.doesNotMatch(html, /<img id="rangeChart"/);
assert.match(js, /function renderRangeMatrix\(\)/);
assert.match(js, /function selectRangeHand\(hand, shouldFocus\)/);
assert.match(js, /dataset\.hand = hand/);
assert.match(js, /minimumRealizationPct/);
assert.match(js, /function ensureFfRealizationData\(\)/);
assert.match(js, /Как считаем относительно паса\?/);
assert.match(js, /meanEvVsFoldBb/);
assert.match(js, /exactObserved \+ ";[^\n]+<\/small><\/section>"/);
assert.match(css, /\.ff-realization-card/);
assert.equal(ffRealization.meta.primaryCohort, "all_ff_3_9max");
assert.equal(ffRealization.meta.diagnosticCohort, "exact_7max");
assert.equal(ffRealization.meta.minDisplayN, 500);
assert.equal(ffRealization.meta.minReliableN, 2000);
assert.equal(ffRealization.meta.coverage.primaryHands, 1061045);
assert.equal(Object.keys(ffRealization.rows).length, 2443);
assert.equal(ffRealization.rows["2_0:BTN:A2o"].n, 2421);
assert.equal(ffRealization.rows["2_0:BTN:A2o"].players, 1133);
assert.ok(Math.abs(ffRealization.rows["2_0:BTN:A2o"].meanRealizedEquityPct - 33.1235) < 0.00001);
assert.ok(Math.abs(ffRealization.rows["2_0:BTN:A2o"].meanEvVsFoldBb - 0.750672) < 0.000001);
assert.equal(ffRealization.rows["2_0:BTN:A2o"].exact7.n, 332);
assert.match(js, /function renderMemory\(\)/);
assert.match(js, /function paintMemoryToward\(cell\)/);
assert.match(js, /function handleMemoryMatrixKeydown\(event\)/);
assert.match(js, /Recall\.gradeDraft\(state\.memoryDraft, memoryExpectedMap\(\)\)/);
assert.match(js, /\["idea", "wisdom", "deep", "practice", "memory"\]/);
assert.doesNotMatch(js, /Реализуем примерно 72% сырого эквити/);
assert.doesNotMatch(html, /<svg\b/i);
assert.doesNotMatch(js, /FFTrainerEvents|FFPlayerProgress/);
assert.match(css, /\.spot-fact\.is-price i \{[^}]*width: 40px/);
assert.match(css, /@media \(max-width: 1180px\)[\s\S]*?\.topline \{[\s\S]*?flex-direction: column/);
assert.match(css, /@media \(max-width: 1180px\)[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.lesson-brand h1 \{[\s\S]*?grid-column: 1 \/ -1/);
assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.step-tab:last-child \{[\s\S]*?grid-column: 1 \/ -1/);
assert.match(css, /\.practice-screen\.is-running \.practice-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) clamp\(320px, 24vw, 350px\)/);
assert.doesNotMatch(css, /practice-layout\.has-answer\s*\{[^}]*minmax\(350px, 0\.78fr\)/);
assert.match(css, /\.bb-range-matrix \{[\s\S]*?grid-template-columns: repeat\(13, minmax\(0, 1fr\)\)/);
assert.match(css, /\.bb-range-cell\[aria-selected="true"\]/);
assert.match(css, /\.bb-range-cell:focus-visible/);
assert.match(css, /\.memory-range-matrix\.is-drawing \{[\s\S]*?touch-action: none/);
assert.match(css, /\.memory-range-matrix\.is-review \.memory-range-cell\.is-review-error/);
assert.match(css, /@media \(min-width: 1051px\) and \(max-height: 900px\)[\s\S]*?height: clamp\(390px, calc\(100svh - 360px\), 500px\)/);
assert.match(css, /@media \(min-width: 1051px\) and \(max-width: 1300px\) and \(max-height: 900px\)[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.ok(js.includes('String(cell.raisePct + cell.callPct) + "%"'), "range cells should print source defend frequency");
assert.match(html, /range-data\.js[\s\S]*data\.js[\s\S]*recall\.js[\s\S]*lesson\.js/);

console.log("BB call defense page contract: ok");
