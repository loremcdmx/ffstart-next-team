import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (path) => readFile(join(root, path), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

const [plan, reviewFinal, reviewData, html, css, runtime, handoff] = await Promise.all([
  readJson("course/ffstart-product-plan.json"),
  readJson("course/ffstart-review-final.json"),
  readJson("course/ffstart-review-data.json"),
  readText("ffstart-handoff.html"),
  readText("assets/ffstart-course/handoff.css"),
  readText("assets/ffstart-course/handoff.js"),
  readText("FFSTART_CODEX_HANDOFF.md")
]);

assert.equal(plan.schema, "ffstart-product-plan-v1", "product plan schema");
assert.equal(reviewFinal.schema, "ffstart-architecture-review-final-v1", "review snapshot schema");
assert.deepEqual(plan.source.reviewSummary, reviewFinal.summary, "product plan uses the final review summary");
assert.deepEqual(reviewFinal.summary, { keep: 40, question: 5, remove: 7, total: 52 }, "review result remains complete");

assert.equal(plan.decisions.length, 52, "all review objects have a recommendation");
assert.equal(new Set(plan.decisions.map((item) => item.reviewId)).size, 52, "recommendations are unique");
for (const decision of plan.decisions) {
  assert.equal(decision.review, reviewFinal.decisions[decision.reviewId], `${decision.reviewId} keeps its reviewed status`);
  assert.ok(decision.action, `${decision.reviewId} has a target action`);
  assert.ok(decision.target, `${decision.reviewId} has a target location`);
  assert.ok(decision.reason, `${decision.reviewId} has a reason`);
}

assert.equal(plan.recommendation.modules, 9, "target has nine modules");
assert.equal(plan.targetModules.length, 9, "nine module specifications exist");
assert.equal(plan.recommendation.lessons, 29, "target has 29 lesson slots");
assert.equal(plan.targetModules.reduce((sum, module) => sum + module.lessons.length, 0), 29, "module lesson counts reconcile");
assert.equal(plan.recommendation.playSessions, 5, "all five simulator breaks stay in the route");
assert.equal(plan.targetModules.filter((module) => module.playBefore || module.playAfter).length, 5, "each play break has a target module");
const consolidation = plan.targetModules.find((module) => module.id === "consolidation");
assert.equal(consolidation.playBefore, "dress-rehearsal", "dress rehearsal stays in consolidation");
assert.equal(consolidation.playBeforeLesson, "final-exam", "dress rehearsal is placed directly before the exam");
assert.equal(plan.recommendation.activePractice.structuredTotal, 1147, "structured practice total is explicit");
assert.equal(plan.recommendation.activePractice.freePlayHands, 37, "free-play hand total is explicit");
const playItems = reviewData.modules.flatMap((module) => module.items || []).filter((item) => item.type === "play");
assert.equal(playItems.reduce((sum, item) => sum + item.hands, 0), 37, "five real simulator breaks reconcile to 37 hands");
assert.equal(plan.archive.length, 5, "archive groups all removed and merged material");
for (const item of plan.archive) {
  assert.ok(item.source.length, `${item.id} preserves source references`);
  assert.ok(item.keep, `${item.id} says what to preserve`);
  assert.ok(item.returnIf, `${item.id} has a measurable reconsideration signal`);
}

const knownLessonIds = new Set(reviewData.modules.flatMap((module) => module.items || []).filter((item) => item.type === "lesson").map((item) => item.id));
for (const module of plan.targetModules) {
  for (const lessonId of module.lessons) {
    assert.ok(knownLessonIds.has(lessonId) || module.derivedLessons?.[lessonId], `${lessonId} maps to an existing or derived lesson`);
  }
}

assert.match(html, /<meta name="robots" content="noindex,nofollow">/, "handoff page is private by default");
assert.match(html, /href="\/FFSTART_CODEX_HANDOFF\.md" download/, "handoff page exposes the Codex file");
assert.match(html, /href="\/course\/ffstart-product-plan\.json" download/, "handoff page exposes the machine plan");
assert.match(html, /data-handoff-modules/, "handoff page owns the target module map");
assert.match(html, /data-handoff-archive/, "handoff page keeps the archive at the end");
assert.match(html, /\/assets\/ffstart-course\/handoff\.js/, "handoff page loads its runtime");
assert.match(runtime, /\/course\/ffstart-product-plan\.json/, "runtime reads the plan source of truth");
assert.match(runtime, /\/course\/ffstart-review-data\.json/, "runtime resolves real lesson metadata");
assert.match(runtime, /renderModules\(plan, index\)/, "runtime renders target modules");
assert.match(runtime, /module\.playBeforeLesson === id/, "runtime places a game break at its exact lesson boundary");
assert.match(runtime, /renderArchive\(plan\)/, "runtime renders the preserved archive");
assert.match(css, /@media \(max-width: 680px\)/, "handoff page has a compact mobile layout");
assert.match(css, /min-height: 44px/, "interactive controls keep touch-sized targets");

assert.match(handoff, /git clone https:\/\/github\.com\/loremcdmx\/ffstart-next-team\.git/, "Codex handoff clones the dedicated repository");
assert.match(handoff, /## 4\. Рекомендуемая программа/, "Codex handoff contains the target curriculum");
assert.match(handoff, /### Полная матрица всех 52 решений/, "Codex handoff contains the complete decision matrix");
for (const decision of plan.decisions) assert.ok(handoff.includes(`| \`${decision.reviewId}\` |`), `${decision.reviewId} is present in the handoff matrix`);
assert.match(handoff, /## 6\. Порядок доработки/, "Codex handoff contains the execution plan");
assert.match(handoff, /«Охота за блайндами» — 6 полных раздач/, "Codex handoff keeps the actual blind-pressure session length");
const archiveHeading = "## 9. Исключённые и объединённые материалы — проверить перед окончательным удалением";
assert.ok(handoff.includes(archiveHeading), "Codex handoff contains the reconsideration archive");
assert.equal(handoff.lastIndexOf("\n## "), handoff.indexOf(`\n${archiveHeading}`), "the reconsideration archive is the final handoff section");
assert.doesNotMatch(handoff, /Five free-play sessions/, "handoff copy is consistently Russian");

console.log("FF Start handoff contract passed (52 decisions · 9 modules · 29 lessons · 5 game breaks).");
