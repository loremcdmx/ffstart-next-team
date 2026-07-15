import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const manifestPath = join(root, "course/ffstart-manifest.json");
const practiceRoot = join(root, "assets/ffstart-course/practice");
const generatedRoot = join(root, "ffstart");
const contentFiles = [
  "assets/ffstart-course/content-foundations.js",
  "assets/ffstart-course/content-strategy.js"
];

assert.ok(existsSync(manifestPath), "FF Start manifest exists");
for (const file of contentFiles) assert.ok(existsSync(join(root, file)), `${file} exists`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(manifest.schema, "ffstart-course-v1", "course manifest schema");
assert.equal(manifest.modules?.length, 11, "course keeps eleven ordered modules");

const lessons = manifest.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, module })));
const generatedLessons = lessons.filter((lesson) => lesson.kind !== "legacy");
const legacyLessons = lessons.filter((lesson) => lesson.kind === "legacy");
const playSessions = Array.isArray(manifest.playSessions) ? manifest.playSessions : [];

assert.equal(lessons.length, 36, "course exposes thirty-six lessons");
assert.equal(generatedLessons.length, 33, "course exposes thirty-three generated lessons");
assert.equal(legacyLessons.length, 3, "the first three standalone trainers remain in the route");
assert.equal(playSessions.length, 5, "course interleaves five full-simulator game breaks");
assert.deepEqual(manifest.modules.map((module) => module.order), Array.from({ length: 11 }, (_, index) => index + 1), "module order is contiguous");

const lessonIds = lessons.map((lesson) => lesson.id);
const lessonRoutes = lessons.map((lesson) => lesson.route);
assert.equal(new Set(lessonIds).size, lessons.length, "lesson ids are unique");
assert.equal(new Set(lessonRoutes).size, lessons.length, "lesson routes are unique");
assert.equal(new Set(playSessions.map((session) => session.id)).size, playSessions.length, "game-break ids are unique");
assert.equal(new Set(playSessions.map((session) => session.afterLessonId)).size, playSessions.length, "each game break owns one route position");

for (const session of playSessions) {
  assert.ok(session.id && session.title && session.kicker && session.body, `${session.id || "game break"} has complete learner framing`);
  assert.ok(lessonIds.includes(session.afterLessonId), `${session.id} follows a real lesson`);
  assert.ok(Number.isInteger(session.hands) && session.hands >= 5 && session.hands <= 10, `${session.id} is a short five-to-ten hand session`);
  assert.ok(["random", "tournament"].includes(session.mode), `${session.id} uses a supported full-simulator mode`);
  assert.ok(session.modeLabel && session.stack?.label && Number(session.stack?.minBb) > 0 && Number(session.stack?.maxBb) >= Number(session.stack?.minBb), `${session.id} has visible mode and stack boundaries`);
  assert.ok(["calm", "fast"].includes(session.tempo), `${session.id} uses a supported table tempo`);
  assert.ok(lessonRoutes.includes(session.nextRoute), `${session.id} returns to a real lesson route`);
  assert.ok(session.nextLabel && session.duration, `${session.id} has useful continuation and duration copy`);
  assert.equal(Object.hasOwn(session, "passScore"), false, `${session.id} stays ungraded`);
}

const allowedSteps = new Set(["encounter", "wisdom", "deep", "practice", "recall"]);
for (const lesson of lessons) {
  assert.ok(lesson.id && lesson.title && lesson.route && lesson.skillKey, `${lesson.id || "lesson"} has complete navigation metadata`);
  assert.deepEqual(lesson.steps?.slice(0, 4), ["encounter", "wisdom", "deep", "practice"], `${lesson.id} follows encounter → wisdom → deep → practice`);
  assert.ok(lesson.steps.every((step) => allowedSteps.has(step)), `${lesson.id} has only supported lesson steps`);
  assert.ok(Number.isInteger(lesson.minutes) && lesson.minutes > 0, `${lesson.id} has a useful duration`);
  assert.ok(Number.isInteger(lesson.practice?.sessionLength) && lesson.practice.sessionLength > 0, `${lesson.id} has a practice session length`);
  assert.ok(Number.isFinite(lesson.practice?.passScore) && lesson.practice.passScore >= 70 && lesson.practice.passScore <= 100, `${lesson.id} has a valid pass score`);
  assert.equal(lesson.publicStatus, "published", `${lesson.id} is published rather than marked as unfinished`);
}

const generatedFiles = readdirSync(generatedRoot).filter((file) => file.endsWith(".html") && file !== "play-session.html").sort();
assert.deepEqual(generatedFiles, generatedLessons.map((lesson) => `${lesson.id}.html`).sort(), "generated lesson pages match the manifest exactly");

const playPagePath = join(generatedRoot, "play-session.html");
assert.ok(existsSync(playPagePath), "the shared game-break page exists outside the generated lesson count");
const playPage = readFileSync(playPagePath, "utf8");
assert.ok(playPage.includes("<title>Игровая пауза · FF Start</title>"), "game-break page has a learner-facing title");
assert.ok(playPage.includes("/assets/poker-simulator/embed.js"), "game-break page loads the real full-simulator embed runtime");
assert.ok(playPage.includes("/assets/ffstart-course/play-session.js"), "game-break page loads its shared session controller");
assert.ok(playPage.includes("data-play-skip"), "game breaks remain optional when the full simulator is unavailable");
assert.doesNotMatch(playPage, /data-shell-action=|data-trainer-simulator-actions/, "game-break page does not draw fake poker controls");

const playControllerSource = readFileSync(join(root, "assets/ffstart-course/play-session.js"), "utf8");
assert.match(playControllerSource, /querySelectorAll\("\[data-play-skip\]"\)[\s\S]*session\.nextRoute/, "the optional continuation uses the manifest next route");

const courseControllerSource = readFileSync(join(root, "assets/ffstart-course/course.js"), "utf8");
for (const route of [
  '"rfi-open-position": "/rfi-open-position-lesson?from=ffstart"',
  '"bb-call-defense": "/bb-call-defense-lesson?from=ffstart"',
  'resteal: "/resteal-lesson?from=ffstart"'
]) assert.ok(courseControllerSource.includes(route), `legacy course route keeps FF Start context: ${route}`);

const requiredPageDependencies = [
  "/assets/poker-trainer-shell/simulator-snapshot.js",
  "/assets/poker-trainer-shell/simulator-practice.js",
  "/assets/ffstart-course/media-player.js",
  "/assets/lesson-platform/lesson-platform.js",
  "/assets/ffstart-course/content-foundations.js",
  "/assets/ffstart-course/content-strategy.js",
  "/assets/ffstart-course/boot.js"
];
const bootSource = readFileSync(join(root, "assets/ffstart-course/boot.js"), "utf8");
const buildPagesSource = readFileSync(join(root, "scripts/ffstart/build-course-pages.mjs"), "utf8");
const courseSource = readFileSync(join(root, "assets/ffstart-course/course.js"), "utf8");
const overviewSource = readFileSync(join(root, "ffstart.html"), "utf8");
const releaseToken = bootSource.match(/CONTENT_VERSION\s*=\s*"([^"]+)"/)?.[1];
assert.ok(releaseToken, "FF Start boot declares an immutable-asset release token");
for (const lesson of generatedLessons) {
  assert.equal(lesson.route, `/ffstart/${lesson.id}`, `${lesson.id} uses its canonical clean route`);
  const html = readFileSync(join(generatedRoot, `${lesson.id}.html`), "utf8");
  assert.ok(html.includes(`<body data-lesson-id="${lesson.id}">`), `${lesson.id} page identifies its content`);
  assert.ok(html.includes("<main data-ffstart-lesson"), `${lesson.id} page owns one shared lesson mount`);
  let previousDependency = -1;
  for (const dependency of requiredPageDependencies) {
    const dependencyIndex = html.indexOf(dependency);
    assert.ok(dependencyIndex > previousDependency, `${lesson.id} loads ${dependency} in dependency order`);
    previousDependency = dependencyIndex;
  }
  assert.ok(html.includes(releaseToken), `${lesson.id} page carries the current immutable-asset token`);
  assert.ok(html.includes(`/assets/ffstart-course/media-player.css?v=${releaseToken}`), `${lesson.id} loads the shared media styles`);
  const assetUrls = Array.from(html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g), (match) => match[1]);
  for (const assetUrl of assetUrls.filter((url) => url !== "/assets/favicon.svg")) {
    assert.ok(assetUrl.endsWith(`?v=${releaseToken}`), `${lesson.id} versions immutable asset ${assetUrl}`);
  }
  assert.doesNotMatch(html, /data-shell-action=|data-trainer-simulator-actions/, `${lesson.id} does not draw separate poker controls outside the shared simulator`);
}

assert.match(buildPagesSource, new RegExp(`version\\s*=\\s*"${releaseToken}"`), "generated pages use the same immutable-asset release token");
assert.match(courseSource, new RegExp(`CONTENT_VERSION\\s*=\\s*"${releaseToken}"`), "course overview uses the same immutable-asset release token");
assert.match(courseSource, /practice\/manifest\.json\?v=\$\{CONTENT_VERSION\}/, "the immutable practice index is release-versioned");
assert.ok(overviewSource.includes(`course.js?v=${releaseToken}`), "the overview requests the current course runtime URL");
assert.ok(overviewSource.includes(`progress.js?v=${releaseToken}`), "the overview requests the current progress runtime URL");
assert.match(bootSource, /encounter[\s\S]*spot:\s*practicePack\.spots\[0\]/, "the opening decision comes from the real practice pack");
assert.match(bootSource, /lesson\.key\s*=\s*`ffstart_\$\{lessonId\}`/, "each generated lesson records progress under a unique trainer key");
assert.match(bootSource, /FFStartLessonPlatform\.mount\(/, "all generated lessons mount through the shared lesson platform");
assert.match(bootSource, /playSession[\s\S]*ffstart\/play-session\?session=/, "anchored lessons continue into their game break");

const sandbox = { window: {}, console };
for (const file of contentFiles) runInNewContext(readFileSync(join(root, file), "utf8"), sandbox, { filename: file });
const contentById = {
  ...(sandbox.window.FFStartLessonContentFoundations || {}),
  ...(sandbox.window.FFStartLessonContentStrategy || {})
};
assert.deepEqual(Object.keys(contentById).sort(), generatedLessons.map((lesson) => lesson.id).sort(), "content files cover every generated lesson exactly once");

const visibleKeys = new Set([
  "title", "eyebrow", "subtitle", "body", "support", "rule", "label", "value", "detail", "display",
  "question", "hint", "wisdom", "feedback", "historyLine", "actionLine", "centerLabel", "homeLabel", "nextLabel",
  "kicker", "modeLabel", "duration"
]);
const supportedVisuals = new Set(["ladder", "bar", "compare", "flow", "seat-map", "hand-rank", "stack-zones", "odds", "range-matrix"]);
const forbiddenCopy = /\b(?:source|sources|sheet|column|row|pack|uuid|pdf|sql|bigquery|clickhouse|mcp|msp|asr|github|canvas|telemetry|hrc|machine|debug|placeholder|provenance)\b|ссылк[а-яё]*\s+на\s+источник|источник[а-яё]*\s+(?:данн|материал|контент|файл|таблиц|чарт)|методич|исходн[а-яё]*\s+(?:данн|материал|контент|файл|таблиц|чарт|диапазон|матриц|верси)|заглуш|телеметр|машин[а-яё]*|транскрипт|расшифровк|субтитр/i;
const allowedLatinWords = new Set(["start"]);
const copyFailures = [];

function inspectCopy(label, value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return;
  if (forbiddenCopy.test(normalized)) copyFailures.push(`${label}: technical/provenance copy: ${normalized}`);
  const latinWords = (normalized.match(/[A-Za-z]{4,}/g) || []).filter((word) => !allowedLatinWords.has(word.toLowerCase()));
  if (latinWords.length) copyFailures.push(`${label}: untranslated copy (${[...new Set(latinWords)].join(", ")}): ${normalized}`);
}

function inspectVisibleFields(value, label, inheritedVisible = false) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectVisibleFields(item, `${label}[${index}]`, inheritedVisible));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      inspectVisibleFields(child, `${label}.${key}`, visibleKeys.has(key));
    }
    return;
  }
  if (inheritedVisible && typeof value === "string") inspectCopy(label, value);
}

function inspectHtmlCopy(file) {
  const html = readFileSync(join(root, file), "utf8");
  const withoutCode = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<meta\b[^>]*\bname=["']viewport["'][^>]*>/gi, " ");
  inspectCopy(`${file}:text`, withoutCode.replace(/<[^>]+>/g, " "));
  for (const match of withoutCode.matchAll(/\b(?:aria-label|alt|content|title)=["']([^"']+)["']/gi)) {
    inspectCopy(`${file}:${match[0].slice(0, match[0].indexOf("="))}`, match[1]);
  }
}

inspectVisibleFields({ title: manifest.title, subtitle: manifest.subtitle }, "manifest");
for (const module of manifest.modules) inspectVisibleFields({ title: module.title, body: module.promise }, `module.${module.id}`);
for (const session of playSessions) inspectVisibleFields(session, `playSession.${session.id}`);
inspectHtmlCopy("index.html");
inspectHtmlCopy("ffstart.html");
inspectHtmlCopy("ffstart/play-session.html");

const practiceIndex = JSON.parse(readFileSync(join(practiceRoot, "manifest.json"), "utf8"));
assert.equal(practiceIndex.schema, "ffstart-practice-index-v1", "practice index schema");
assert.deepEqual(practiceIndex.packs.map((pack) => pack.id).sort(), generatedLessons.map((lesson) => lesson.id).sort(), "practice index covers every generated lesson exactly once");
for (const lessonId of ["versus-aggressive", "versus-passive"]) {
  const pack = JSON.parse(readFileSync(join(practiceRoot, `${lessonId}.json`), "utf8"));
  const moments = pack.spots.filter((spot) => spot.mediaMoment?.mediaId && Number.isFinite(spot.mediaMoment?.start));
  assert.ok(pack.sessionLength >= 8, `${lessonId}: video-derived decisions form a useful simulator series`);
  assert.ok(moments.length >= 3, `${lessonId}: at least three simulator spots are tied to exact teaching moments`);
}
const indexedPacks = new Map(practiceIndex.packs.map((pack) => [pack.id, pack]));

const platform = require(join(root, "assets/lesson-platform/lesson-platform.js"));
assert.equal(typeof platform.__test?.normalizeLesson, "function", "lesson platform exposes its normalizer for course verification");
assert.equal(typeof platform.__test?.practiceQueue, "function", "lesson platform exposes balanced session generation for course verification");
assert.equal(typeof platform.__test?.actionFamily, "function", "lesson platform exposes action-family classification for course verification");

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function semanticSpotFingerprint(spot) {
  const table = spot.table || {};
  return JSON.stringify({
    question: compactText(spot.question),
    table: {
      heroPosition: compactText(table.heroPosition),
      heroStack: compactText(table.heroStack),
      effectiveStack: compactText(table.effectiveStack),
      pot: compactText(table.pot),
      toCall: compactText(table.toCall),
      heroCards: table.heroCards || [],
      boardCards: table.boardCards || [],
      street: compactText(table.street),
      actionLine: (table.actionLine || []).map(compactText),
      dealerPosition: compactText(table.dealerPosition),
      seats: (table.seats || []).map((seat) => ({ label: compactText(seat.label), state: compactText(seat.state), cards: seat.cards || [] }))
    },
    options: (spot.options || []).map((option) => ({
      label: compactText(option.label),
      actionType: compactText(option.actionType),
      correct: Boolean(option.correct)
    }))
  });
}

let totalSpots = 0;
let mergedDuplicateSources = 0;
const packsById = new Map();
for (const lesson of generatedLessons) {
  const content = contentById[lesson.id];
  assert.ok(content, `${lesson.id} has authored content`);
  assert.equal(content.id, lesson.id, `${lesson.id} content id matches the manifest`);
  assert.equal(content.key, lesson.skillKey, `${lesson.id} content uses the canonical skill key`);
  assert.equal(content.title, lesson.title, `${lesson.id} content title matches the route`);
  assert.ok(content.encounter?.title && content.encounter?.body, `${lesson.id} has a complete opening decision`);
  assert.ok(Array.isArray(content.wisdom) && content.wisdom.length >= 3, `${lesson.id} has at least three wisdom slides`);
  assert.ok(content.wisdom.every((slide) => slide.title && slide.body && supportedVisuals.has(slide.visual?.type)), `${lesson.id} wisdom slides pair one thought with a supported visual`);
  assert.ok(content.deep?.title && content.deep?.body, `${lesson.id} has a complete deep-dive section`);
  assert.ok(Array.isArray(content.deep?.cards) && content.deep.cards.length >= 2, `${lesson.id} has at least two deep-dive cards`);
  assert.ok(content.deep.cards.every((card) => card.title && card.body && supportedVisuals.has(card.visual?.type)), `${lesson.id} deep-dive cards contain supported useful visuals`);
  assert.ok(content.practice?.title && content.practice?.body, `${lesson.id} has authored practice framing`);
  assert.equal(Boolean(content.recall), lesson.steps.includes("recall"), `${lesson.id} recall content matches the promised route`);
  if (content.recall) assert.equal(content.recall.visual?.type, "range-matrix", `${lesson.id} recall uses the interactive 13×13 matrix`);

  const packPath = join(practiceRoot, `${lesson.id}.json`);
  assert.ok(existsSync(packPath), `${lesson.id} practice pack exists`);
  const pack = JSON.parse(readFileSync(packPath, "utf8"));
  packsById.set(lesson.id, pack);
  assert.ok(pack.version.includes(releaseToken), `${lesson.id} practice payload identifies the current release`);
  assert.equal(pack.schema, "ffstart-practice-pack-v1", `${lesson.id} practice schema`);
  assert.equal(pack.lessonId, lesson.id, `${lesson.id} practice identity`);
  assert.equal(pack.trainer?.key, lesson.skillKey, `${lesson.id} practice uses the canonical skill key`);
  assert.equal(pack.sessionLength, lesson.practice.sessionLength, `${lesson.id} practice session matches the manifest`);
  assert.equal(pack.passScore, lesson.practice.passScore, `${lesson.id} practice pass score matches the manifest`);
  assert.ok(Array.isArray(pack.spots) && pack.spots.length >= lesson.practice.sessionLength, `${lesson.id} has enough situations for a complete session`);
  assert.equal(indexedPacks.get(lesson.id)?.spots, pack.spots.length, `${lesson.id} practice index count is current`);
  assert.equal(new Set(pack.spots.map((spot) => spot.id)).size, pack.spots.length, `${lesson.id} situation ids are unique`);
  assert.equal(new Set(pack.spots.map(semanticSpotFingerprint)).size, pack.spots.length, `${lesson.id} has no duplicated decision states`);

  for (const spot of pack.spots) {
    assert.ok(spot.id && spot.title && spot.question && spot.hint && spot.wisdom, `${lesson.id}:${spot.id || "spot"} has complete learner copy`);
    assert.ok(spot.table && Array.isArray(spot.table.seats) && Array.isArray(spot.table.heroCards) && Array.isArray(spot.table.boardCards), `${lesson.id}:${spot.id} has shared simulator table data`);
    assert.ok(Array.isArray(spot.options) && spot.options.length >= 2, `${lesson.id}:${spot.id} offers a real decision`);
    assert.equal(spot.options.filter((option) => option.correct === true).length, 1, `${lesson.id}:${spot.id} has exactly one best answer`);
    assert.ok(spot.options.every((option) => option.key && option.label && option.feedback), `${lesson.id}:${spot.id} gives feedback for every answer`);
    assert.equal(spot.options.some((option) => /чек[\s–—-]*(?:колл|пас)/iu.test(option.label)), false, `${lesson.id}:${spot.id} never collapses two future actions into one button`);
    if (spot.sequenceOrder === 2) {
      assert.ok(Number.parseFloat(String(spot.table.toCall).replace(",", ".")) > 0, `${lesson.id}:${spot.id} follow-up exposes a real call price`);
      assert.match((spot.table.actionLine || []).slice(-2).join(" · "), /Ты Чек[\s\S]*Соперник Ставка/iu, `${lesson.id}:${spot.id} follow-up shows check then opponent bet`);
    }
    if (Array.isArray(spot.sourceSpotIds)) mergedDuplicateSources += spot.sourceSpotIds.length - 1;
  }

  const renderableLesson = structuredClone(content);
  renderableLesson.encounter = { ...renderableLesson.encounter, spot: pack.spots[0] };
  renderableLesson.practice = { ...renderableLesson.practice, passScore: pack.passScore };
  const normalizedLesson = platform.__test.normalizeLesson(renderableLesson, pack);
  assert.ok(normalizedLesson, `${lesson.id} passes the same normalizer used before rendering`);

  const seenSpotIds = new Set();
  const boundedAttempts = Math.ceil(pack.spots.length / pack.sessionLength) * 12 + 20;
  for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
    const queue = platform.__test.practiceQueue(normalizedLesson, attempt);
    assert.equal(new Set(queue.map((spot) => spot.id)).size, queue.length, `${lesson.id} attempt ${attempt + 1} has no repeated situation`);
    queue.forEach((spot) => seenSpotIds.add(spot.id));
    const familyCounts = new Map();
    queue.forEach((spot) => {
      const family = platform.__test.actionFamily(spot);
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    });
    const pokerFamilyCounts = Array.from(familyCounts).filter(([family]) => family !== "choice").map(([, count]) => count);
    if (pokerFamilyCounts.length) {
      const strongestConstantScore = Math.max(...pokerFamilyCounts) / queue.length * 100;
      assert.ok(strongestConstantScore < pack.passScore, `${lesson.id} attempt ${attempt + 1} rejects every constant poker action`);
    }
  }
  assert.equal(seenSpotIds.size, pack.spots.length, `${lesson.id} exposes its complete situation bank within a bounded number of restarts`);

  inspectVisibleFields(content, `content.${lesson.id}`);
  inspectVisibleFields(pack, `practice.${lesson.id}`);
  totalSpots += pack.spots.length;
}

const cbetPack = packsById.get("cbet-in-position");
assert.ok(cbetPack.spots.filter((spot) => spot.options.find((option) => option.correct)?.actionType === "check").length >= 6, "c-bet practice includes deliberate checks rather than rewarding auto-betting");

const videoLinkedSpots = Array.from(packsById.values()).flatMap((pack) => pack.spots).filter((spot) => spot.mediaMoment);
assert.equal(videoLinkedSpots.length, 8, "eight video moments continue into exact learner decisions rather than ending as passive viewing");
assert.equal(packsById.get("versus-aggressive").spots.filter((spot) => spot.mediaMoment?.mediaId === "23-protiv_agressii").length, 3, "the aggression lesson has three linked multi-street simulator decisions");
assert.equal(packsById.get("versus-passive").spots.filter((spot) => spot.mediaMoment?.mediaId === "24-protiv_passiva").length, 3, "the passive-opponent lesson has three linked multi-street simulator decisions");
const stateSpot = packsById.get("decision-logic").spots.find((spot) => spot.id === "decision-logic-abc-state");
assert.equal(stateSpot?.mediaMoment?.mediaId, "35-start_za_stolom_vebinar_02", "the A/B/C-game video continues into the exact mental-state decision");
const resetSpot = packsById.get("microstakes").spots.find((spot) => spot.id === "microstakes-reset-next-hand");
assert.equal(resetSpot?.mediaMoment?.mediaId, "33-microlim_02", "the post-loss video continues into the next real hand");
assert.deepEqual(resetSpot?.table?.heroCards, ["As", "Qs"], "the mental reset is practiced on the shared functional poker table");

const mathPack = packsById.get("poker-math");
for (const suffix of ["pair-to-set-turn-25", "set-to-boat-turn-26", "two-pair-to-boat-river-27", "bottom-pair-five-outs-flop-35", "top-pair-kicker-outs-flop-36"]) {
  const spot = mathPack.spots.find((candidate) => candidate.id.endsWith(suffix));
  assert.ok(spot, `poker math keeps the ${suffix} teaching situation`);
  assert.equal(spot.options.find((option) => option.correct)?.actionType, "choice", `${suffix} does not infer a fold from improvement outs alone`);
}

const hugePriceSpot = mathPack.spots.find((spot) => spot.id.includes("huge-price-turn-28"));
assert.equal(hugePriceSpot.table.pot, "22 BB", "the large-turn-bet example shows the bank after the opponent's 12 BB bet");
assert.match(hugePriceSpot.question, /цена колла 35 %/u, "the large-turn-bet example derives its visible price from the visible bank");

assert.equal(mergedDuplicateSources, 8, "eight duplicate source scenarios are merged into canonical situations");
assert.equal(totalSpots, 1151, "the complete course keeps all 1,151 unique and sequenced practice decisions");
assert.equal(copyFailures.length, 0, `learner-visible copy lint:\n${copyFailures.slice(0, 30).join("\n")}`);

console.log(`FFStart course contract: OK (${manifest.modules.length} modules, ${lessons.length} lessons, ${playSessions.length} game breaks, ${totalSpots} situations)`);
