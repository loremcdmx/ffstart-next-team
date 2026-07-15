import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const library = JSON.parse(readFileSync(path.join(root, "course/ffstart-media.json"), "utf8"));
const reviews = JSON.parse(readFileSync(path.join(root, "course/ffstart-caption-review.json"), "utf8"));
const course = JSON.parse(readFileSync(path.join(root, "course/ffstart-manifest.json"), "utf8"));
const player = require(path.join(root, "assets/ffstart-course/media-player.js"));
const lessons = course.modules.flatMap((module) => module.lessons);
const lessonIds = new Set(lessons.map((lesson) => lesson.id));
const mediaEntries = Object.entries(library.lessons || {});
const allItems = mediaEntries.flatMap(([, items]) => items);
const uniqueItems = new Map(allItems.map((item) => [item.id, item]));
const guidedMediaIds = new Set(["04-pozicii_za_stolom", "11-reindzhi_open_reizov", "12-reindzhi_open_reizov_zapomni"]);

function assetPath(url) {
  const parsed = new URL(url, "http://local.ff");
  assert.equal(parsed.origin, "http://local.ff", `media companion asset stays same-origin: ${url}`);
  return path.join(root, decodeURIComponent(parsed.pathname).replace(/^\/+/, ""));
}

function cueCount(vtt) {
  return (String(vtt).match(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/g) || []).length;
}

assert.equal(library.schema, "ffstart-media-library-v1");
assert.equal(library.totals.expectedUniqueVideos, 36);
assert.equal(library.totals.availableUniqueVideos, 36, "all current source videos are integrated");
assert.equal(library.totals.pendingUniqueVideos, 0, "the media inventory has no placeholders");
assert.equal(uniqueItems.size, 36, "all 36 unique videos are represented once by media id");
assert.equal(mediaEntries.length, 32, "only lessons with real source material render a media block");
assert.equal(library.totals.lessonLinks, allItems.length);
assert.ok(library.totals.durationSeconds > 17_000, "the complete media duration is recorded");
assert.ok(library.totals.audioBytes > 100_000_000 && library.totals.audioBytes < 180_000_000, "web audio is compact enough to ship separately from video");
assert.equal(library.totals.learningCheckpoints, 116, "all editorially selected learning checkpoints are present");
assert.equal(reviews.schema, "ffstart-caption-review-v1");
assert.equal(new Set(reviews.reviewedMediaIds).size, 36, "all learner-visible text has an explicit editorial approval marker");

for (const [lessonId, items] of mediaEntries) {
  assert.ok(lessonIds.has(lessonId), `${lessonId}: media points to a real lesson`);
  assert.ok(Array.isArray(items) && items.length > 0, `${lessonId}: media list is useful`);
}

for (const [id, item] of uniqueItems) {
  assert.match(id, /^\d{2}-[a-z0-9_]+$/, `${id}: stable media id`);
  assert.ok(item.title && item.summary, `${id}: learner-facing title and summary`);
  assert.match(item.videoUrl, /^https:\/\/cdn\.funfarm\.name\/Start\/.+\.mp4$/i, `${id}: approved CDN video`);
  assert.match(item.embedUrl, /^https:\/\/player\.vimeo\.com\/video\/\d+\?.*\bh=[a-z0-9]+/i, `${id}: approved Vimeo embed with privacy hash`);
  assert.match(item.fallbackUrl, /^https:\/\/(?:www\.)?vimeo\.com\//i, `${id}: approved fallback`);
  assert.ok(Number(item.durationSeconds) > 0, `${id}: measured duration`);
  assert.equal(item.captionsStatus, "reviewed", `${id}: captions are explicitly reviewed before display`);
  assert.equal(item.transcriptStatus, "reviewed", `${id}: text is explicitly reviewed before display`);
  assert.ok(item.learning?.title && item.learning?.body && item.learning?.rule && item.learning?.watchFor && item.learning?.practiceCue, `${id}: recording has a complete active-learning frame`);
  assert.ok(item.learning.checkpoints.length >= 2 && item.learning.checkpoints.length <= 4, `${id}: recording has a focused number of checkpoints`);
  let previousCheckpoint = -1;
  for (const checkpoint of item.learning.checkpoints) {
    assert.ok(checkpoint.start > previousCheckpoint && checkpoint.start < item.durationSeconds, `${id}: checkpoint time is ordered and inside the recording`);
    assert.ok(checkpoint.title && checkpoint.body, `${id}: checkpoint has useful learner copy`);
    previousCheckpoint = checkpoint.start;
  }

  const poster = assetPath(item.posterUrl);
  const audio = assetPath(item.audioUrl);
  const captions = assetPath(item.captionsUrl);
  const transcript = assetPath(item.transcriptUrl);
  for (const file of [poster, audio, captions, transcript]) assert.ok(existsSync(file), `${id}: ${path.basename(file)} exists`);
  assert.match(item.audioUrl, /^\/assets\/ffstart-course\/media\/audio\/.+\.m4a\?v=/, `${id}: audio uses the dedicated same-origin web track`);
  assert.ok(statSync(audio).size > 10_000 && statSync(audio).size < 40 * 1024 * 1024, `${id}: audio derivative has a bounded file size`);

  const vtt = readFileSync(captions, "utf8");
  const transcriptPayload = JSON.parse(readFileSync(transcript, "utf8"));
  assert.match(vtt, /^WEBVTT\s/u, `${id}: valid WebVTT header`);
  assert.ok(cueCount(vtt) > 0, `${id}: captions contain timed cues`);
  assert.equal(transcriptPayload.schema, "ffstart-transcript-v1", `${id}: transcript schema`);
  assert.equal(transcriptPayload.mediaId, id, `${id}: transcript identity`);
  assert.equal(transcriptPayload.cues.length, cueCount(vtt), `${id}: captions and text stay synchronized`);
  let previousStart = -1;
  for (const cue of transcriptPayload.cues) {
    assert.ok(cue.start >= previousStart && cue.end > cue.start, `${id}: ordered positive transcript cue`);
    previousStart = cue.start;
  }
  const guided = item.learning.playback === "guided-excerpts";
  assert.equal(guided, guidedMediaIds.has(id), `${id}: guided playback is reserved for the three recordings with obsolete source claims`);
  for (const checkpoint of item.learning.checkpoints) {
    assert.ok(transcriptPayload.cues.some((cue) => Math.abs(Number(cue.start) - checkpoint.start) <= 0.06), `${id}: checkpoint ${checkpoint.start} starts on a reviewed cue`);
    if (guided) {
      assert.ok(Number(checkpoint.end) > checkpoint.start, `${id}: guided checkpoint has a safe end`);
      assert.ok(transcriptPayload.cues.some((cue) => Math.abs(Number(cue.end) - checkpoint.end) <= 0.06), `${id}: guided checkpoint ${checkpoint.start} ends on a reviewed cue`);
    } else {
      assert.equal(checkpoint.end, undefined, `${id}: unrestricted recordings do not carry artificial stop points`);
    }
  }
  assert.doesNotMatch(vtt, /Субтитры создавал|DimaTorzok|Продолжение следует|ДИНАМИЧНАЯ МУЗЫКА/iu, `${id}: no ASR credit, music marker, or outro junk`);
  assert.doesNotMatch(vtt, /-->[^\n]*\n[\s.,…!?—–-]+(?:\n\n|$)/u, `${id}: no punctuation-only ASR cues`);
  assert.doesNotMatch(vtt, /([А-Яа-яЁё])\1{7,}/u, `${id}: no runaway ASR character repetition`);
  assert.doesNotMatch(vtt, /open[- ]?(?:race|raise|рейс|рейз)|\bкотов\b|\bкатоф(?:а|е|у|ом)?\b|\bбоин(?:ы|ов|а|ом)?\b|изолейд|2,3 банка|волл-ин|метал-команда|\bпри\s+флоп|\bрейзос\b|\bол-ин\b|\bстэк(?:а|е|и|ов|ом)?\b|FanFarm|Unamax|WCube|Chica/iu, `${id}: known poker ASR errors were corrected`);
}

assert.equal(uniqueItems.get("34-start_za_stolom_vebinar_01")?.longForm, true);
assert.ok(uniqueItems.get("34-start_za_stolom_vebinar_01")?.durationSeconds > 2_200);
assert.ok(uniqueItems.get("35-start_za_stolom_vebinar_02")?.durationSeconds > 3_800);
assert.ok(uniqueItems.get("36-start_za_stolom_vebinar_03")?.durationSeconds > 3_500);
assert.equal((library.lessons["course-start"] || []).length, 3, "course opening includes the original intro and the long-form context");
assert.equal((library.lessons["rfi-open-position"] || []).length, 2, "legacy RFI lesson gets both original explanations");
assert.equal((library.lessons["bb-call-defense"] || []).length, 1, "legacy BB lesson gets its original explanation");
const bbDefenseVideo = uniqueItems.get("21-strategia_bb");
assert.equal(bbDefenseVideo?.startAtSeconds, 20, "BB defense recording skips its first 20 seconds");
assert.ok(bbDefenseVideo.learning.checkpoints.every((checkpoint) => checkpoint.start > bbDefenseVideo.startAtSeconds), "BB checkpoints stay after the trimmed intro");
for (const id of ["04-pozicii_za_stolom", "11-reindzhi_open_reizov", "12-reindzhi_open_reizov_zapomni"]) {
  const learning = uniqueItems.get(id)?.learning;
  assert.equal(learning?.playback, "guided-excerpts", `${id}: the learner can open only reviewed excerpts`);
  assert.match(learning?.boundary || "", /стар|прежн|друг/iu, `${id}: the obsolete source claim is explicitly bounded`);
  if (id !== "04-pozicii_za_stolom") {
    assert.match(`${learning?.rule || ""} ${learning?.boundary || ""}`, /актуальн/iu, `${id}: the current trainer chart stays authoritative`);
    assert.doesNotMatch(JSON.stringify(learning), /(?:16|18|22|27|37|54)\s*%/u, `${id}: obsolete RFI percentages are not promoted into active learning`);
  }
}

const captionsFiles = readdirSync(path.join(root, "assets/ffstart-course/media/captions")).filter((name) => name.endsWith(".vtt"));
const posterFiles = readdirSync(path.join(root, "assets/ffstart-course/media/posters")).filter((name) => /\.jpe?g$/i.test(name));
const transcriptFiles = readdirSync(path.join(root, "assets/ffstart-course/media/transcripts")).filter((name) => name.endsWith(".json"));
const audioFiles = readdirSync(path.join(root, "assets/ffstart-course/media/audio")).filter((name) => name.endsWith(".m4a"));
assert.equal(captionsFiles.length, 36);
assert.equal(posterFiles.length, 36);
assert.equal(transcriptFiles.length, 36);
assert.equal(audioFiles.length, 36);

assert.equal(player.__test.safeUrl("javascript:alert(1)", "video"), "");
assert.equal(player.__test.safeUrl("//evil.example/video.mp4", "video"), "");
assert.equal(player.__test.safeUrl("https://evil.example/video.mp4", "video"), "");
assert.equal(player.__test.safeUrl("https://evil.example/video/123?h=secret", "embed"), "");
assert.match(player.__test.safeUrl("https://player.vimeo.com/video/123?h=secret&dnt=1", "embed"), /^https:\/\/player\.vimeo\.com\/video\/123\?/);
assert.equal(player.__test.safeUrl("/assets/ffstart-course/media/example.vtt", "asset"), "/assets/ffstart-course/media/example.vtt");
const reviewed = player.normalizeItems([{
  id: "safe",
  title: "Безопасный разбор",
  videoUrl: "https://cdn.funfarm.name/Start/safe.mp4",
  captionsUrl: "/safe.vtt",
  captionsStatus: "reviewed",
  transcriptUrl: "/safe.json",
  transcriptStatus: "reviewed"
}])[0];
const reviewedMarkup = player.__test.itemMarkup(reviewed);
assert.match(reviewedMarkup, /<video controls playsinline preload="none"/);
assert.match(reviewedMarkup, /<audio controls preload="none"/);
assert.match(reviewedMarkup, /<track kind="captions"/);
assert.match(reviewedMarkup, />Текст видео /);
assert.doesNotMatch(reviewedMarkup, /autoplay|crossorigin/i);
const guided = player.normalizeItems([{
  id: "guided",
  title: "Разбор с решениями",
  videoUrl: "https://cdn.funfarm.name/Start/guided.mp4",
  durationSeconds: 120,
  learning: {
    title: "Собери решение по сигналам",
    body: "Позиция и цена действия меняют границу продолжения.",
    rule: "Сначала контекст, затем кнопка.",
    watchFor: "Как новый сигнал меняет выбранную линию?",
    practiceCue: "Перед каждым ответом назови позицию и цену.",
    checkpoints: [
      { start: 12, title: "Контекст", body: "Найди позицию и действие до тебя." },
      { start: 48, title: "Граница", body: "Сравни цену продолжения с силой диапазона." }
    ]
  }
}])[0];
const guidedMarkup = player.__test.itemMarkup(guided, { practiceTarget: "practice" });
assert.match(guidedMarkup, /data-media-learning/);
assert.equal((guidedMarkup.match(/data-media-seek=/g) || []).length, 2);
assert.match(guidedMarkup, /data-go-step="practice"/);
assert.match(guidedMarkup, /data-media-practice="guided"/);
assert.match(guidedMarkup, /Перейти к практике/);
assert.match(guidedMarkup, /Смотри с задачей/);
const exactPracticeMarkup = player.__test.itemMarkup(guided, { practiceTarget: "practice", practiceMediaIds: ["guided"] });
assert.match(exactPracticeMarkup, /Начать с этого задания/);
assert.match(exactPracticeMarkup, /data-media-practice-exact="true"/, "exact practice buttons can disclose when they start a fresh focused series");
const hiddenPracticeMarkup = player.__test.itemMarkup(guided, { practiceTarget: "practice", hidePracticeForMediaIds: ["guided"] });
assert.doesNotMatch(hiddenPracticeMarkup, /data-go-step="practice"/, "an incompatible lesson can suppress only the misleading practice CTA");
const defaultShellMarkup = player.__test.shellMarkup([reviewed], {});
const copylessShellMarkup = player.__test.shellMarkup([reviewed], { body: false });
assert.match(defaultShellMarkup, /Видео сохраняет примеры и ход мысли/);
assert.doesNotMatch(defaultShellMarkup, /ffstart-media-library__head is-copyless/);
assert.match(copylessShellMarkup, /ffstart-media-library__head is-copyless/);
assert.doesNotMatch(copylessShellMarkup, /Видео сохраняет примеры и ход мысли/);
const resumedMedia = player.normalizeItems([
  { id: "first", title: "Первый разбор", videoUrl: "https://cdn.funfarm.name/Start/first.mp4" },
  { id: "second", title: "Продолженный разбор", videoUrl: "https://cdn.funfarm.name/Start/second.mp4" }
]);
const resumedMarkup = player.__test.shellMarkup(resumedMedia, { initialItemId: "second" });
assert.match(resumedMarkup, /aria-selected="true"[^>]+data-media-select="1"/, "the selected video tab survives a resumed exact-practice session");
assert.match(resumedMarkup, /data-media-stage>[\s\S]*Продолженный разбор/, "the resumed media stage and tab point to the same recording");
const embeddedMarkup = player.__test.itemMarkup(player.normalizeItems([{
  id: "embedded",
  title: "Потоковый разбор",
  videoUrl: "https://cdn.funfarm.name/Start/embedded.mp4",
  embedUrl: "https://player.vimeo.com/video/123?h=secret&dnt=1&api=1",
  audioUrl: "/embedded.m4a",
  captionsUrl: "/embedded.vtt",
  captionsStatus: "reviewed",
  transcriptUrl: "/embedded.json",
  transcriptStatus: "reviewed"
}])[0]);
assert.match(embeddedMarkup, /<iframe[^>]+player\.vimeo\.com\/video\/123/);
assert.match(embeddedMarkup, /loading="lazy"/);
assert.match(embeddedMarkup, /data-media-live-caption/);
assert.match(embeddedMarkup, /data-media-captions/);
assert.doesNotMatch(embeddedMarkup, /<video|cdn\.funfarm\.name\/Start\/embedded\.mp4/, "the range-broken CDN file is not the primary player source");
const trimmedItem = player.normalizeItems([{
  id: "trimmed",
  title: "Без вступления",
  videoUrl: "https://cdn.funfarm.name/Start/trimmed.mp4",
  embedUrl: "https://player.vimeo.com/video/123?h=secret&dnt=1&api=1",
  fallbackUrl: "https://vimeo.com/123/secret?share=copy",
  audioUrl: "/trimmed.m4a",
  transcriptUrl: "/trimmed.json",
  transcriptStatus: "reviewed",
  durationSeconds: 120,
  startAtSeconds: 20
}])[0];
const trimmedMarkup = player.__test.itemMarkup(trimmedItem);
assert.equal(trimmedItem.startAtSeconds, 20);
assert.match(trimmedItem.embedUrl, /#t=20s$/);
assert.match(trimmedItem.fallbackUrl, /#t=20s$/);
assert.match(trimmedMarkup, /data-media-start-at="20"/);
assert.match(trimmedMarkup, /data-start-at="20"/);
assert.equal(player.__test.playbackFloor(trimmedItem, 0), 20);
assert.equal(player.__test.playbackFloor(trimmedItem, 71.78), 71.78);
assert.ok(player.__test.normalizeStartSeconds(200, 120) < 120, "trim start clamps inside duration");
const trimmedTranscriptBody = { innerHTML: "" };
player.__test.renderTranscript(trimmedTranscriptBody, { cues: [
  { start: 0, end: 10, text: "Удалённое вступление" },
  { start: 13, end: 22, text: "Фраза на границе" },
  { start: 23, end: 25, text: "Основной разбор" }
] }, 20);
assert.doesNotMatch(trimmedTranscriptBody.innerHTML, /Удалённое вступление/);
assert.match(trimmedTranscriptBody.innerHTML, /data-media-seek="20"[\s\S]*Фраза на границе/);
assert.match(trimmedTranscriptBody.innerHTML, /data-media-seek="23"[\s\S]*Основной разбор/);
const excerptMarkup = player.__test.itemMarkup(player.normalizeItems([{
  id: "excerpt",
  title: "Только проверенные фрагменты",
  videoUrl: "https://cdn.funfarm.name/Start/excerpt.mp4",
  embedUrl: "https://player.vimeo.com/video/123?h=secret&dnt=1&api=1",
  fallbackUrl: "https://vimeo.com/123/secret",
  transcriptUrl: "/excerpt.json",
  transcriptStatus: "reviewed",
  durationSeconds: 120,
  learning: {
    title: "Отдели сигнал от старой рекомендации",
    body: "Смотри только фрагменты, которые не конфликтуют с текущим уроком.",
    rule: "Текущий тренажёр остаётся источником границы решения.",
    boundary: "Полная запись содержит прежнюю версию стратегии.",
    playback: "guided-excerpts",
    watchFor: "Как контекст меняет решение в текущей версии урока?",
    practiceCue: "Сразу примени актуальную границу за столом.",
    checkpoints: [
      { start: 12, end: 24, title: "Контекст", body: "Сначала найди позицию и действие до тебя." },
      { start: 48, end: 60, title: "Перенос", body: "Затем проверь правило в новой раздаче." }
    ]
  }
}])[0], { practiceTarget: "practice", practiceMediaIds: ["excerpt"] });
assert.match(excerptMarkup, /class="ffstart-media-item is-guided"/);
assert.match(excerptMarkup, /controls=0/);
assert.match(excerptMarkup, /keyboard=0/);
assert.match(excerptMarkup, /tabindex="-1"[^>]+data-media-vimeo/, "guided Vimeo cannot receive stray keyboard focus outside the checkpoint controls");
assert.match(excerptMarkup, /Включай только отмеченные фрагменты/);
assert.doesNotMatch(excerptMarkup, /data-media-mode="audio"|data-media-transcript|Открыть отдельно/, "guided playback exposes neither the obsolete full recording nor parallel audio and transcript paths");
const longCaptionCue = { start: 10, end: 22, text: Array.from({ length: 60 }, (_, index) => `слово${index + 1}`).join(" ") };
const longCaptionChunks = player.__test.captionChunks(longCaptionCue);
assert.ok(longCaptionChunks.length > 1 && longCaptionChunks.every((chunk) => chunk.length <= 132), "long cues are divided into readable live-caption pages");
assert.equal(player.__test.captionTextAt(longCaptionCue, 10), longCaptionChunks[0]);
assert.equal(player.__test.captionTextAt(longCaptionCue, 21.99), longCaptionChunks.at(-1));
const unreviewedMarkup = player.__test.itemMarkup(player.normalizeItems([{
  id: "draft",
  title: "Черновик",
  videoUrl: "https://cdn.funfarm.name/Start/draft.mp4",
  captionsUrl: "/draft.vtt",
  transcriptUrl: "/draft.json"
}])[0]);
assert.doesNotMatch(unreviewedMarkup, /<track|data-media-transcript/, "unreviewed companion text is never learner-visible");

const platformSource = readFileSync(path.join(root, "assets/lesson-platform/lesson-platform.js"), "utf8");
const bootSource = readFileSync(path.join(root, "assets/ffstart-course/boot.js"), "utf8");
const mediaBuildSource = readFileSync(path.join(root, "scripts/ffstart/build-media-library.mjs"), "utf8");
const mediaPlayerSource = readFileSync(path.join(root, "assets/ffstart-course/media-player.js"), "utf8");
assert.match(platformSource, /step !== "deep"[\s\S]{0,120}controller\.media\.pause/, "leaving the chart pauses media");
assert.match(bootSource, /ffstart-media\.json[\s\S]*lesson\.media/, "generated lessons receive the shared media manifest");
assert.match(bootSource, /mediaWisdom[\s\S]*lesson\.wisdom[\s\S]*mediaFocus/, "recording decisions are promoted into wisdom and simulator focus");
assert.match(mediaBuildSource, /FFSTART_MEDIA_REIMPORT_CAPTIONS[\s\S]*reviewedMediaIds\s*=\s*\[\]/, "raw caption reimport clears editorial approval");
assert.match(mediaBuildSource, /player\.vimeo\.com[\s\S]*searchParams\.set\("h"/, "unlisted Vimeo links become hashed embeds");
assert.match(mediaBuildSource, /validateLearningCues[\s\S]*reviewed caption cue/, "the build protects checkpoint alignment to reviewed captions");
assert.match(mediaBuildSource, /21-strategia_bb[\s\S]{0,400}startAtSeconds:\s*20/, "the generated BB media keeps its 20-second trim");
assert.match(mediaPlayerSource, /new Vimeo\.Player[\s\S]*timeupdate[\s\S]*setCurrentTime/, "Vimeo playback, live captions, and transcript seeking stay synchronized");
assert.match(mediaPlayerSource, /startAtSeconds[\s\S]*playbackFloor[\s\S]*enforceNativeStart/, "video and audio share the trim-start floor");
assert.match(mediaPlayerSource, /guidedPlayback[\s\S]*guidedEnd[\s\S]*player\.pause/, "guided excerpts stop at their reviewed end boundary");
assert.match(mediaPlayerSource, /discardScript[\s\S]*script\.remove/, "a failed Vimeo API tag is removed so the next attempt can issue a fresh request");
assert.match(mediaPlayerSource, /paused\.catch[\s\S]*postVimeoCommand/, "a failed Vimeo pause falls back to the iframe command channel");
for (const legacyPage of ["rfi-open-position-lesson.html", "bb-call-defense-lesson.html"]) {
  const html = readFileSync(path.join(root, legacyPage), "utf8");
  assert.match(html, /data-ffstart-legacy-media/, `${legacyPage}: media host`);
  assert.match(html, /media-player\.js[\s\S]*legacy-media\.js/, `${legacyPage}: media dependencies in order`);
  if (legacyPage === "bb-call-defense-lesson.html") {
    assert.match(html, /data-ffstart-legacy-media data-ffstart-media-header-copy="none"/, `${legacyPage}: removes only its media header copy`);
  }
}

console.log(`FFStart media contract: OK (${uniqueItems.size} видео · ${Math.round(library.totals.durationSeconds / 60)} минут · ${allItems.length} привязок)`);
