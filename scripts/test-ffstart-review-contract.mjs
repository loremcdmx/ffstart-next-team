import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(readFileSync(join(root, relativePath), "utf8"));
const manifest = readJson("course/ffstart-manifest.json");
const media = readJson("course/ffstart-media.json");
const practice = readJson("assets/ffstart-course/practice/manifest.json");
const review = readJson("course/ffstart-review-data.json");
const html = readFileSync(join(root, "ffstart-review.html"), "utf8");
const runtime = readFileSync(join(root, "assets/ffstart-course/review.js"), "utf8");
const styles = readFileSync(join(root, "assets/ffstart-course/review.css"), "utf8");

const generatedReviewDirectory = mkdtempSync(join(tmpdir(), "ffstart-review-contract-"));
try {
  const generatedReviewPath = join(generatedReviewDirectory, "ffstart-review-data.json");
  execFileSync(process.execPath, [join(root, "scripts/ffstart/build-review-data.mjs"), "--output", generatedReviewPath], {
    cwd: root,
    encoding: "utf8"
  });
  assert.deepEqual(readJson("course/ffstart-review-data.json"), JSON.parse(readFileSync(generatedReviewPath, "utf8")), "committed review JSON is identical to a fresh deterministic build");
} finally {
  rmSync(generatedReviewDirectory, { recursive: true, force: true });
}

function loadLegacyPracticeSources() {
  const rfiSandbox = { window: {}, console };
  runInNewContext(readFileSync(join(root, "assets/poker-rfi-open-lesson/data.js"), "utf8"), rfiSandbox);
  const bbSandbox = { window: {}, console };
  for (const relativePath of [
    "assets/poker-bb-call-defense-lesson/range-data.js",
    "assets/poker-bb-call-defense-lesson/data.js"
  ]) runInNewContext(readFileSync(join(root, relativePath), "utf8"), bbSandbox);
  return { rfi: rfiSandbox.window.PokerRfiData, bb: bbSandbox.window.PokerBbCallData };
}

function countFamilies(spots, actionForSpot) {
  const result = {};
  for (const spot of spots) {
    const family = actionForSpot(spot);
    result[family] = (result[family] || 0) + 1;
  }
  return result;
}

const legacySources = loadLegacyPracticeSources();

assert.equal(review.schema, "ffstart-architecture-review-data-v1", "review data schema");
assert.equal(review.versions.course, manifest.version, "review data carries course version");
assert.equal(review.versions.media, media.version, "review data carries media version");
assert.equal(review.versions.practice, practice.schema, "review data carries practice contract");
assert.equal(review.modules.length, 11, "review keeps eleven modules");

const manifestLessons = manifest.modules.flatMap((module) => module.lessons);
const reviewLessons = review.modules.flatMap((module) => module.items.filter((item) => item.type === "lesson"));
const reviewPlay = review.modules.flatMap((module) => module.items.filter((item) => item.type === "play"));
const allReviewItems = review.modules.flatMap((module) => [module, ...module.items]);
const reviewIds = allReviewItems.map((item) => item.reviewId);

assert.equal(reviewLessons.length, 36, "review covers all thirty-six lessons");
assert.equal(reviewPlay.length, 5, "review covers all five game breaks");
assert.equal(allReviewItems.length, 52, "review exposes eleven modules plus forty-one route items");
assert.equal(new Set(reviewIds).size, 52, "review ids are unique");
assert.deepEqual(review.modules.map((module) => module.id), manifest.modules.map((module) => module.id), "module order follows the course manifest");
assert.deepEqual(reviewLessons.map((lesson) => lesson.id), manifestLessons.map((lesson) => lesson.id), "lesson order follows the course manifest");
assert.deepEqual(reviewPlay.map((session) => session.id), manifest.playSessions.map((session) => session.id), "game-break order follows the course manifest");

const reviewLessonById = new Map(reviewLessons.map((lesson) => [lesson.id, lesson]));
for (const lesson of manifestLessons) {
  const row = reviewLessonById.get(lesson.id);
  assert.ok(row, `${lesson.id}: review row exists`);
  assert.ok(row.summary.length >= 35, `${lesson.id}: useful lesson summary`);
  assert.ok(row.content.encounterTitle && row.content.wisdomCount > 0 && row.content.deepTitle, `${lesson.id}: lesson shape is described`);
  assert.ok(row.practice.title && row.practice.summary.length >= 30, `${lesson.id}: practice has a useful summary`);
  assert.ok(Array.isArray(row.media.items), `${lesson.id}: media is explicit even when empty`);
  assert.deepEqual(row.media.items.map((item) => item.id), (media.lessons[lesson.id] || []).map((item) => item.id), `${lesson.id}: media ids match the player library`);
  assert.deepEqual(row.media.items.map((item) => item.title), (media.lessons[lesson.id] || []).map((item) => item.title), `${lesson.id}: media titles match the player library`);
  const indexedPractice = practice.packs.find((pack) => pack.id === lesson.id);
  if (lesson.kind === "legacy") {
    assert.ok(["specialized-table", "full-simulator"].includes(row.practice.delivery), `${lesson.id}: standalone practice is described explicitly`);
  } else {
    assert.equal(row.practice.delivery, "shared-decision-table", `${lesson.id}: shared simulator delivery`);
    assert.equal(row.practice.bankSize, indexedPractice.spots, `${lesson.id}: practice inventory count`);
    const interaction = row.practice.interaction;
    assert.equal(interaction.pokerAction + interaction.tableBackedChoice + interaction.conceptChoice, indexedPractice.spots, `${lesson.id}: interaction classes cover the pack`);
  }
}

const rfiReview = reviewLessonById.get("rfi-open-position");
assert.equal(rfiReview.practice.bankSize, legacySources.rfi.spots.length, "RFI legacy bank size comes from the live trainer data");
assert.equal(rfiReview.practice.sourceVersion, legacySources.rfi.version, "RFI legacy source version is traceable");
assert.deepEqual(rfiReview.practice.interaction.families, countFamilies(legacySources.rfi.spots, (spot) => spot.open ? "raise" : "fold"), "RFI action distribution is computed from live trainer spots");
const bbReview = reviewLessonById.get("bb-call-defense");
assert.equal(bbReview.practice.bankSize, legacySources.bb.practiceSpots.length, "BB legacy bank size comes from the live trainer data");
assert.equal(bbReview.practice.sourceVersion, legacySources.bb.version, "BB legacy source version is traceable");
assert.deepEqual(bbReview.practice.interaction.families, countFamilies(legacySources.bb.practiceSpots, (spot) => spot.correct), "BB action distribution is computed from live trainer spots");

for (const session of reviewPlay) {
  assert.ok(session.summary.length >= 35, `${session.id}: game break summary`);
  assert.ok(session.route.includes(`session=${session.id}`), `${session.id}: opens the exact game break`);
  assert.ok(session.hands >= 5 && session.hands <= 10, `${session.id}: short full-simulator series`);
}

const uniqueMedia = new Map(reviewLessons.flatMap((lesson) => lesson.media.items.map((item) => [item.id, item])));
assert.deepEqual(review.totals, {
  modules: 11,
  lessons: 36,
  playSessions: 5,
  reviewItems: 52,
  lessonMinutes: 1031,
  uniqueVideos: media.totals.availableUniqueVideos,
  videoLinks: media.totals.lessonLinks,
  videoSeconds: media.totals.durationSeconds,
  checkpoints: media.totals.learningCheckpoints,
  practice: {
    generatedSpots: practice.packs.reduce((sum, pack) => sum + pack.spots, 0),
    legacySpots: legacySources.rfi.spots.length + legacySources.bb.practiceSpots.length,
    fullSimulatorLessons: 1
  }
}, "review totals match authoritative compact indexes");
assert.equal(review.modules.reduce((sum, module) => sum + module.totals.generatedPracticeSpots, 0), review.totals.practice.generatedSpots, "module totals reconcile with generated practice inventory");
assert.equal(review.modules.reduce((sum, module) => sum + module.totals.legacyPracticeSpots, 0), review.totals.practice.legacySpots, "module totals reconcile with legacy practice inventory");
assert.equal(review.modules.reduce((sum, module) => sum + module.totals.fullSimulatorPractices, 0), review.totals.practice.fullSimulatorLessons, "module totals reconcile with full-simulator lessons");
assert.ok(review.modules.every((module) => !("practiceSpots" in module.totals)), "module totals never mix generated and legacy practice into one ambiguous number");
assert.equal(uniqueMedia.size, 36, "review data keeps thirty-six unique videos");
assert.deepEqual(reviewLessons.filter((lesson) => !lesson.media.count).map((lesson) => lesson.id), ["poker-history-rules", "resteal", "course-feedback", "final-exam"], "lessons without video stay visible rather than receiving placeholders");

const sandbox = { window: {}, console, Date, Set, Map, Object, String, Number, Array, JSON };
runInNewContext(runtime, sandbox, { filename: "assets/ffstart-course/review.js" });
const api = sandbox.window.FFStartArchitectureReview.__test;
assert.deepEqual([...api.ALLOWED_STATUSES].sort(), ["keep", "question", "remove"], "review allows exactly three verdicts");
const knownIds = new Set(reviewIds);
const normalized = api.normalizeState({
  decisions: {
    "module:welcome": { status: "keep", note: "Сильный вход" },
    "lesson:course-start": { status: "invalid", note: "Нужен новый статус" },
    "lesson:stale": { status: "remove", note: "Старый пункт" }
  }
}, knownIds, review.versions);
assert.equal(normalized.decisions["module:welcome"].status, "keep", "known verdict survives reload normalization");
assert.equal(normalized.decisions["lesson:course-start"].status, "", "unknown verdict value cannot become an active decision");
assert.equal(normalized.decisions["lesson:stale"], undefined, "stale id cannot affect the current program");
assert.equal(normalized.orphaned["lesson:stale"].status, "remove", "stale note stays available for export history");
const exported = api.exportPayload(review, normalized);
assert.equal(exported.snapshot.length, 52, "export contains a readable snapshot of every review item");
assert.equal(exported.decisions["lesson:stale"].status, "remove", "export preserves an orphaned historical decision");
assert.match(api.markdownSummary(review, normalized), /Ревью архитектуры FF Start[\s\S]*Вступление[\s\S]*Как пройти FF Start/, "markdown handoff follows the program structure");
assert.match(api.persistenceResultLabel(0, true), /только в IndexedDB/, "IndexedDB-only save is reported honestly");
assert.match(api.persistenceResultLabel(0, false), /не удалось сохранить/, "complete browser persistence failure is reported honestly");
assert.match(api.persistenceResultLabel(1, true), /localStorage и IndexedDB/, "partial localStorage success is distinguished from total success");
assert.match(api.persistenceResultLabel(2, true), /трёх копиях/, "all three successful copies receive the complete-success label");
const sealed = api.sealState(normalized);
assert.equal(api.verifyStoredState(sealed).checksum, sealed.checksum, "checksummed state survives validation");
assert.equal(api.verifyStoredState({ ...sealed, updatedAt: "corrupted" }), null, "a corrupted local copy is rejected");
const merged = api.mergeStates(
  { decisions: { "module:welcome": { status: "keep", note: "Новая локальная версия", updatedAt: "2026-07-16T12:00:00.000Z" } } },
  { decisions: { "module:welcome": { status: "remove", note: "Старый файл", updatedAt: "2026-07-15T12:00:00.000Z" }, "lesson:course-start": { status: "question", note: "Новый пункт", updatedAt: "2026-07-16T13:00:00.000Z" } } },
  knownIds,
  review.versions
);
assert.equal(merged.decisions["module:welcome"].status, "keep", "import cannot overwrite a newer local decision");
assert.equal(merged.decisions["lesson:course-start"].status, "question", "import still restores a missing decision");
const disjoint = api.mergeStates(
  { decisions: { "module:welcome": { status: "keep", note: "Первая вкладка", updatedAt: "2026-07-16T12:00:00.000Z" } } },
  { decisions: { "lesson:course-start": { status: "question", note: "Вторая вкладка", updatedAt: "2026-07-16T12:00:01.000Z" } } },
  knownIds,
  review.versions
);
assert.equal(disjoint.decisions["module:welcome"].status, "keep", "cross-tab merge keeps a decision unique to the first tab");
assert.equal(disjoint.decisions["lesson:course-start"].status, "question", "cross-tab merge keeps a decision unique to the second tab");
const cleared = api.mergeStates(
  { decisions: { "module:welcome": { status: "", note: "", deleted: true, updatedAt: "2026-07-16T12:00:00.000Z" } } },
  { decisions: { "module:welcome": { status: "remove", note: "Старый файл", updatedAt: "2026-07-15T12:00:00.000Z" } } },
  knownIds,
  review.versions
);
assert.equal(cleared.decisions["module:welcome"].status, "", "an older import cannot resurrect a cleared verdict");
assert.equal(cleared.decisions["module:welcome"].deleted, true, "clear operation remains as a timestamped tombstone");

assert.match(html, /<meta name="robots" content="noindex,nofollow">/, "internal review page stays out of search");
assert.match(html, /data-reviewed-count[\s\S]*data-filter-status[\s\S]*data-review-root/, "page exposes progress, filters, and program mount");
assert.match(html, /Зафиксировать итог[\s\S]*Загрузить решения[\s\S]*Скопировать сводку/, "page supports handoff and continuation");
assert.doesNotMatch(html, /data-review-root[^>]*aria-live/, "the 52-card mount is not announced again after every render");
assert.doesNotMatch(runtime, /FFPlayerProgress|FFTrainerEvents|trainer-events/, "review state never touches learner progress or telemetry");
assert.match(runtime, /for \(const key of \[BACKUP_KEY, STORAGE_KEY\]\)[\s\S]*localStorage\.setItem\(key, serialized\)/, "both localStorage copies are attempted independently");
assert.match(runtime, /indexedDB\.open\(DATABASE_NAME[\s\S]*queueDatabaseState/, "review keeps a queued database copy");
assert.match(runtime, /checksumFor[\s\S]*verifyStoredState/, "review can reject a damaged saved copy");
assert.match(runtime, /databasePendingPayload[\s\S]*drainDatabaseWrites/, "database writes are serialized instead of racing");
const persistSource = runtime.slice(runtime.indexOf("function persistState"), runtime.indexOf("function decisionFor"));
assert.ok(persistSource.indexOf("queueDatabaseState(payload)") > persistSource.indexOf("localStorage.setItem"), "IndexedDB is queued after localStorage attempts regardless of their result");
assert.doesNotMatch(persistSource, /catch\s*\([^)]*\)\s*\{[^}]*return/, "a localStorage exception cannot skip the IndexedDB fallback");
assert.match(persistSource, /queueDatabaseState\(payload\)[\s\S]*\.catch\(function \(\)[\s\S]*persistenceResultLabel\(localCopies, false, message\)/, "an IndexedDB rejection resolves to an honest final save label");
assert.doesNotMatch(runtime, /addEventListener\("pagehide"/, "an unchanged stale tab cannot overwrite newer work while closing");
assert.match(runtime, /addEventListener\("storage"[\s\S]*mergeStates\(state, incoming/, "review merges disjoint work from other tabs");
assert.match(runtime, /mergeStates\(state, candidate/, "import merges instead of replacing newer work");
assert.match(runtime, /keep[\s\S]*question[\s\S]*remove/, "review runtime renders the three exclusive verdicts");
assert.match(styles, /@media \(max-width: 900px\)[\s\S]*@media \(max-width: 620px\)/, "review has tablet and mobile reflow rules");
assert.match(styles, /min-height: 44px/, "mobile decisions keep touch-sized controls");
assert.doesNotMatch(styles, /is-context-only \.review-(?:decision|note)[^{]*\{[^}]*opacity/, "filter context never fades actionable decisions or comments");

console.log("FFStart architecture review contract: OK (52 решений · 36 уроков · 5 игровых пауз)");
