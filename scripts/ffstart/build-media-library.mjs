import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(
  process.env.FFSTART_MEDIA_SOURCE_ROOT
    || "/Users/loremcdmx/Documents/ffstart-private-source-2026-07-14"
);
const manifestPath = join(repositoryRoot, "course/ffstart-media.json");
const learningPath = join(repositoryRoot, "course/ffstart-video-learning.json");
const reviewManifestPath = join(repositoryRoot, "course/ffstart-caption-review.json");
const outputRoot = join(repositoryRoot, "assets/ffstart-course/media");
const audioRoot = join(outputRoot, "audio");
const posterRoot = join(outputRoot, "posters");
const captionsRoot = join(outputRoot, "captions");
const transcriptRoot = join(outputRoot, "transcripts");
const reimportCaptions = process.env.FFSTART_MEDIA_REIMPORT_CAPTIONS === "1";
const markCaptionsReviewed = process.env.FFSTART_MEDIA_MARK_CAPTIONS_REVIEWED === "1";
const rebuildAudio = process.env.FFSTART_MEDIA_REBUILD_AUDIO === "1";
const libraryVersion = "2026-07-15.media.5";
const assetVersion = "20260715-media-v3";

const supplementalSources = {
  "34-start_za_stolom_vebinar_01": {
    sourceUrl: "https://cdn.funfarm.name/Start/web_new_9_06.mp4",
    fallbackUrl: "https://vimeo.com/1201126519/1c63fc4f55?share=copy&fl=sv&fe=ci"
  },
  "35-start_za_stolom_vebinar_02": {
    sourceUrl: "https://cdn.funfarm.name/Start/web_ps_new.mp4",
    fallbackUrl: "https://vimeo.com/1206944222/4847fa6cc7?share=copy&fl=sv&fe=ci"
  },
  "36-start_za_stolom_vebinar_03": {
    sourceUrl: "https://cdn.funfarm.name/Start/web_select.mp4",
    fallbackUrl: "https://vimeo.com/1209008783/2fc91d1d04?share=copy&fl=sv&fe=ci"
  }
};

const mediaDefinitions = [
  entry("01-chto_vas_zhdet_intro", ["course-start"], "Покер как профессия: что вас ждёт", "Посмотри на обучение как на рабочую среду: практика, поддержка и постепенный рост игрока."),
  entry("02-chto_vas_zhdet", ["course-start"], "Как устроен FF Start", "Разбери ритм курса: сначала идея, затем решение в тренажёре и честная обратная связь."),
  entry("03-poker_kombinacii_1", ["combinations"], "Десять покерных комбинаций", "Пройди комбинации от старшей карты до флеш-рояля и закрепи порядок их силы."),
  entry("04-pozicii_za_stolom", ["positions"], "Позиции и порядок хода", "Увидь, как баттон задаёт позиции и почему одна и та же рука играется по-разному."),
  entry("05-razdacha_deystvia", ["hand-actions"], "Как проходит раздача", "Свяжи улицы, обязательные ставки и доступные действия в одну понятную последовательность."),
  entry("06-pari_kiker", ["pairs-kicker"], "Пары и кикер", "Научись различать виды пар и определять победителя, когда основные комбинации совпали."),
  entry("07-dro_kombinacii", ["draws-outs"], "Дро-комбинации и ауты", "Распознавай незаконченные комбинации и считай карты, которые могут усилить руку."),
  entry("08-vidi_turnirov", ["tournament-formats"], "Виды и форматы турниров", "Сравни форматы по структуре, скорости и выплатам, чтобы понимать задачу до первой раздачи."),
  entry("09-kak_orientirovatsya_v_turn", ["tournament-navigation"], "Как ориентироваться в турнире", "Свяжи стадию турнира, эффективный стек и рост блайндов с планом на раздачу."),
  entry("10-termini_prefop", ["preflop-start"], "Префлоп: первый круг решений", "Разбери вход в раздачу до флопа и роль позиции, стека и предыдущего экшена."),
  entry("11-reindzhi_open_reizov", ["rfi-open-position"], "Какие руки открывать", "Посмотри, почему диапазон первого рейза расширяется по мере приближения к баттону."),
  entry("12-reindzhi_open_reizov_zapomni", ["rfi-open-position", "resources"], "Как запоминать диапазоны", "Освой ориентиры, с которыми диапазон легче восстановить, чем заучить клетку за клеткой."),
  entry("13-strategia_stavok", ["betting-purpose"], "Зачем мы ставим", "Отдели ставки на вэлью от блефа и выбирай размер под цель, а не по привычке."),
  entry("14-kontbet_pozicia", ["cbet-in-position"], "Контбет в позиции", "Разбери, когда преимущество позиции помогает продолжить ставкой, а когда лучше остановиться."),
  entry("15-igra_bez_pozicii", ["play-out-of-position"], "Игра без позиции", "Собери более осторожный план, когда соперник получает информацию о твоём действии первым."),
  entry("16-izol_reiz", ["isolation-raise"], "Изоляционный рейз", "Научись изолировать лимпера с инициативой и заранее понимать, против кого строится банк."),
  entry("17-cold_call_sb", ["cold-call"], "Когда колл выгоден", "Оцени цену колла, позицию и риск игроков за спиной до того, как вложить фишки."),
  entry("18-strategia_3bet", ["three-bet"], "Когда делать 3-бет", "Разбери 3-бет на вэлью и в блеф, учитывая позиции, стеки и диапазон рейзера."),
  entry("19-zashita_3bet", ["versus-three-bet"], "Защита против 3-бета", "Выбирай между пасом, коллом и повышением по силе диапазонов и глубине эффективного стека."),
  entry("20-multi_poty", ["multiway"], "Игра в мультипоте", "Увидь, почему против нескольких соперников нужны сильнее руки и аккуратнее блефы."),
  entry("21-strategia_bb", ["bb-call-defense"], "Защита большого блайнда", "Свяжи цену колла, позицию рейзера и играбельность руки в единую защитную стратегию.", { startAtSeconds: 20 }),
  entry("22-sb_vs_bb", ["blind-versus-blind"], "Блайнд против блайнда", "Разбери широкие диапазоны и давление уже вложенных фишек в игре один на один."),
  entry("23-protiv_agressii", ["versus-aggressive"], "Против агрессивного соперника", "Не соревнуйся в количестве ставок: защищай сильные руки и используй лишнюю агрессию соперника."),
  entry("24-protiv_passiva", ["versus-passive"], "Против пассивного соперника", "Чаще добирай со своими сильными руками и уважай редкую ответную агрессию."),
  entry("25-open_push_short", ["push-fold"], "Олл-ин или пас", "Выбирай первый олл-ин по позиции, стеку и диапазонам игроков, которые ещё не сказали слово."),
  entry("26-3bet_push", ["jam-over-raise"], "Олл-ин против рейза", "Оцени мёртвые деньги, фолд-эквити и силу руки перед рестилом на коротком стеке."),
  entry("27-igrovaya_logika", ["decision-logic"], "Логика игрового решения", "Собирай действие из доступной информации и отделяй качество решения от результата одной раздачи."),
  entry("28-matematika_1", ["poker-math"], "Базовая математика покера", "Сравнивай шансы банка, вероятность усиления и ожидаемую ценность вместо решения на ощущениях."),
  entry("29-icm_finalka", ["icm"], "Когда фишки стоят по-разному", "Пойми, почему давление выплат меняет цену риска на баббле и за финальным столом."),
  entry("30-prof_poker_01", ["poker-world"], "Как устроен покерный мир", "Познакомься с экосистемой обучения, банкролла, анализа и игры на реальных лимитах."),
  entry("31-prof_poker_02", ["poker-profession"], "Профессия: покерист", "Разбери рабочий режим, дисциплину, восстановление и ожидания от профессиональной игры."),
  entry("32-perspective_poker", ["poker-perspectives"], "Перспективы в покере", "Посмотри на рост через качество решений, объём и развитие навыка, а не через обещание быстрых денег."),
  entry("33-microlim_02", ["microstakes"], "Микролимиты без иллюзий", "Научись выдерживать шум короткой дистанции и не менять рабочую стратегию из-за эмоций."),
  entry("34-start_za_stolom_vebinar_01", ["poker-profession", "course-start"], "Что за работа — играть в покер", "Большой разговор о пути игрока, ежедневной работе и переходе от интереса к устойчивой практике.", { eyebrow: "Вебинар", longForm: true }),
  entry("35-start_za_stolom_vebinar_02", ["decision-logic"], "Почему мы играем хуже, чем умеем", "Разбор A-game: что мешает использовать знания за столом и как возвращаться к качественным решениям.", { eyebrow: "Вебинар", longForm: true }),
  entry("36-start_za_stolom_vebinar_03", ["tournament-navigation"], "Как выбирать, что играть", "Большой разбор турнирного селекта: формат, поле, расписание и нагрузка на игровую сессию.", { eyebrow: "Вебинар", longForm: true })
];

function entry(stem, lessonIds, title, summary, options = {}) {
  return {
    stem,
    lessonIds,
    title,
    summary,
    eyebrow: options.eyebrow || "Видео-разбор",
    longForm: Boolean(options.longForm),
    startAtSeconds: Math.max(0, Number(options.startAtSeconds) || 0)
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  assert(existsSync(path), `Required file is missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeIfChanged(path, value) {
  const next = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  if (existsSync(path) && readFileSync(path).equals(next)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}

function copyIfChanged(source, destination) {
  if (existsSync(destination) && readFileSync(source).equals(readFileSync(destination))) return false;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return true;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert(result.status === 0, `${label}: ${String(result.error?.message || result.stderr || result.stdout || `${command} failed`).trim()}`);
  return String(result.stdout || "").trim();
}

function ensureMediaTools() {
  for (const command of ["ffmpeg", "ffprobe"]) {
    const result = spawnSync(command, ["-version"], { encoding: "utf8" });
    assert(result.status === 0, `FF Start media build requires ${command} on PATH (${result.error?.message || "command unavailable"})`);
    assert(new RegExp(`^${command} version`, "i").test(String(result.stdout || "")), `${command} version output is invalid`);
  }
}

function buildAudio(source, destination, durationSeconds, stem) {
  const temporary = `${destination}.tmp.m4a`;
  if (rebuildAudio || !existsSync(destination) || statSync(destination).size === 0) {
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(temporary, { force: true });
    run("ffmpeg", [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
      "-i", source,
      "-map", "0:a:0", "-vn",
      "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "48000",
      "-movflags", "+faststart",
      temporary
    ], `${stem}: audio encode`);
    assert(existsSync(temporary) && statSync(temporary).size > 0, `${stem}: audio encoder produced no file`);
    renameSync(temporary, destination);
  }
  const probe = JSON.parse(run("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,channels,sample_rate:format=duration",
    "-of", "json", destination
  ], `${stem}: audio probe`));
  const stream = probe.streams?.[0] || {};
  const actualDuration = Number(probe.format?.duration);
  assert(Number.isFinite(actualDuration) && Math.abs(actualDuration - durationSeconds) <= 1, `${stem}: web audio duration drift`);
  assert(stream.codec_name === "aac" && Number(stream.channels) === 1 && String(stream.sample_rate) === "48000", `${stem}: web audio codec contract`);
  return statSync(destination).size;
}

function reviewRegistry() {
  if (!existsSync(reviewManifestPath)) return { schema: "ffstart-caption-review-v1", version: "2026-07-15.editorial-1", reviewedMediaIds: [] };
  const registry = readJson(reviewManifestPath);
  assert(registry.schema === "ffstart-caption-review-v1", "Caption review registry schema is invalid");
  assert(Array.isArray(registry.reviewedMediaIds), "Caption review registry needs reviewedMediaIds");
  return registry;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(input).replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  assert(!quoted, "Source CSV ends inside a quoted field");
  const headers = rows.shift() || [];
  return rows.filter((cells) => cells.some(Boolean)).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function urlKey(value) {
  try {
    const url = new URL(String(value));
    return `${url.hostname}${decodeURIComponent(url.pathname)}`;
  } catch (_error) {
    return String(value || "").trim();
  }
}

function approvedUrl(value, type) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:") return "";
    if (type === "video" && url.hostname !== "cdn.funfarm.name") return "";
    if (type === "fallback" && !["vimeo.com", "www.vimeo.com"].includes(url.hostname)) return "";
    return url.href;
  } catch (_error) {
    return "";
  }
}

function vimeoEmbedUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || !["vimeo.com", "www.vimeo.com"].includes(url.hostname)) return "";
    const [videoId, privacyHash] = url.pathname.split("/").filter(Boolean);
    if (!/^\d+$/.test(videoId || "") || !/^[a-z0-9]+$/i.test(privacyHash || "")) return "";
    const embed = new URL(`https://player.vimeo.com/video/${videoId}`);
    embed.searchParams.set("h", privacyHash);
    embed.searchParams.set("dnt", "1");
    embed.searchParams.set("api", "1");
    embed.searchParams.set("title", "0");
    embed.searchParams.set("byline", "0");
    embed.searchParams.set("portrait", "0");
    return embed.href;
  } catch (_error) {
    return "";
  }
}

function fallbackUrlsFromCsv(path) {
  if (!existsSync(path)) return new Map();
  return new Map(parseCsv(readFileSync(path, "utf8")).flatMap((row) => {
    if (!row.materials_link) return [];
    const match = String(row.step_message || "").match(/https:\/\/vimeo\.com\/[^\s)]+/u);
    return match ? [[urlKey(row.materials_link), match[0]]] : [];
  }));
}

function timestampToSeconds(value) {
  const parts = String(value).trim().replace(",", ".").split(":").map(Number);
  assert(parts.length === 2 || parts.length === 3, `Unsupported VTT timestamp: ${value}`);
  const seconds = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  assert(Number.isFinite(seconds), `Invalid VTT timestamp: ${value}`);
  return Math.round(seconds * 1000) / 1000;
}

function secondsToTimestamp(value) {
  const milliseconds = Math.max(0, Math.round(Number(value) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000);
  const seconds = Math.floor(milliseconds % 60_000 / 1000);
  const rest = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(rest).padStart(3, "0")}`;
}

function cleanCueText(value) {
  const cleaned = String(value)
    .replace(/Субтитры создавал DimaTorzok[.!…]?/giu, "")
    .replace(/Продолжение следует[.!…]?/giu, "")
    .replace(/^\[?ДИНАМИЧНАЯ МУЗЫКА\]?$/gimu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/^[\s—–-]+|[\s—–-]+$/g, "")
    .trim();
  return /^[\s.,…!?—–-]+$/u.test(cleaned) || /([А-Яа-яЁё])\1{7,}/u.test(cleaned) ? "" : cleaned;
}

function parseVtt(input) {
  const normalized = String(input).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  assert(/^WEBVTT(?:\s|$)/u.test(normalized), "Caption file must start with WEBVTT");
  const cues = [];
  const lines = normalized.split("\n");
  for (let index = 1; index < lines.length; index += 1) {
    let timingLine = lines[index].trim();
    if (!timingLine) continue;
    if (!timingLine.includes("-->")) {
      if (index + 1 < lines.length && lines[index + 1].includes("-->")) {
        index += 1;
        timingLine = lines[index].trim();
      } else {
        continue;
      }
    }
    const timing = timingLine.match(/^(\S+)\s+-->\s+(\S+)/u);
    assert(timing, `Invalid VTT cue timing: ${timingLine}`);
    const textLines = [];
    while (index + 1 < lines.length && lines[index + 1].trim() !== "") {
      index += 1;
      textLines.push(lines[index]);
    }
    const text = cleanCueText(textLines.join("\n"));
    if (!text) continue;
    cues.push({
      start: timestampToSeconds(timing[1]),
      end: timestampToSeconds(timing[2]),
      text
    });
  }
  return cues;
}

function validateCues(cues, stem, durationSeconds) {
  assert(cues.length > 0, `${stem}: captions contain no usable cues`);
  let previousStart = -1;
  for (const [index, cue] of cues.entries()) {
    assert(Number.isFinite(cue.start) && cue.start >= 0, `${stem}: cue ${index + 1} has an invalid start`);
    assert(Number.isFinite(cue.end) && cue.end > cue.start, `${stem}: cue ${index + 1} has an invalid end`);
    assert(cue.start >= previousStart, `${stem}: cue ${index + 1} is out of order`);
    assert(cue.text && cue.text.length <= 1200, `${stem}: cue ${index + 1} has invalid text`);
    assert(!/Субтитры создавал DimaTorzok|Продолжение следует/iu.test(cue.text), `${stem}: junk caption remained after cleanup`);
    previousStart = cue.start;
  }
  assert(cues.at(-1).end <= Number(durationSeconds) + 5, `${stem}: captions exceed video duration`);
}

function serializeVtt(cues) {
  return `WEBVTT\n\n${cues.map((cue) => `${secondsToTimestamp(cue.start)} --> ${secondsToTimestamp(cue.end)}\n${cue.text}`).join("\n\n")}\n`;
}

function lessonOrder() {
  const manifest = readJson(join(repositoryRoot, "course/ffstart-manifest.json"));
  return manifest.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
}

function validateLearning(value, stem, durationSeconds) {
  const learning = value && typeof value === "object" ? value : {};
  const guided = learning.playback === "guided-excerpts";
  assert(!learning.playback || guided, `${stem}: unsupported learning playback policy`);
  for (const field of ["title", "body", "rule", "watchFor", "practiceCue"]) {
    assert(String(learning[field] || "").trim().length >= 12, `${stem}: learning.${field} needs useful learner-facing copy`);
  }
  assert(Array.isArray(learning.checkpoints) && learning.checkpoints.length >= 2 && learning.checkpoints.length <= 4, `${stem}: needs two to four learning checkpoints`);
  let previousStart = -1;
  for (const checkpoint of learning.checkpoints) {
    assert(Number.isFinite(checkpoint.start) && checkpoint.start >= 0 && checkpoint.start < durationSeconds, `${stem}: checkpoint time is outside the recording`);
    assert(checkpoint.start > previousStart, `${stem}: checkpoint times must be ordered and unique`);
    if (guided) {
      assert(Number.isFinite(checkpoint.end) && checkpoint.end > checkpoint.start && checkpoint.end <= durationSeconds, `${stem}: guided checkpoint needs a safe end inside the recording`);
    } else {
      assert(checkpoint.end == null, `${stem}: checkpoint end is reserved for guided excerpts`);
    }
    assert(String(checkpoint.title || "").trim().length >= 4, `${stem}: checkpoint title is too short`);
    assert(String(checkpoint.body || "").trim().length >= 12, `${stem}: checkpoint body is too short`);
    previousStart = checkpoint.start;
  }
  return learning;
}

function validateLearningCues(learning, cues, stem) {
  for (const checkpoint of learning.checkpoints) {
    const cueStart = cues.some((cue) => Math.abs(Number(cue.start) - checkpoint.start) <= 0.06);
    assert(cueStart, `${stem}: checkpoint ${checkpoint.start} does not start on a reviewed caption cue`);
    if (learning.playback === "guided-excerpts") {
      const cueEnd = cues.some((cue) => Math.abs(Number(cue.end) - checkpoint.end) <= 0.06);
      assert(cueEnd, `${stem}: guided end ${checkpoint.end} does not end on a reviewed caption cue`);
    }
  }
}

function build() {
  ensureMediaTools();
  assert(existsSync(sourceRoot), `FF Start media source root does not exist: ${sourceRoot}`);
  mkdirSync(posterRoot, { recursive: true });
  mkdirSync(captionsRoot, { recursive: true });
  mkdirSync(transcriptRoot, { recursive: true });
  mkdirSync(audioRoot, { recursive: true });

  const downloads = readJson(join(sourceRoot, "video-download-manifest.json"));
  const processing = readJson(join(sourceRoot, "media-processing-manifest.json"));
  const learningLibrary = readJson(learningPath);
  assert(learningLibrary.schema === "ffstart-video-learning-v1", "Video learning library schema is invalid");
  assert(learningLibrary.items && typeof learningLibrary.items === "object", "Video learning library has no items");
  assert(Object.keys(learningLibrary.items).length === mediaDefinitions.length, `Expected ${mediaDefinitions.length} video learning items`);
  const downloadByFilename = new Map((downloads.items || []).map((item) => [item.filename, item]));
  const processingByFilename = new Map((processing.entries || []).map((item) => [item.video, item]));
  const fallbackBySource = fallbackUrlsFromCsv(join(sourceRoot, "ffstart-course-production-2026-07-14.csv"));
  const knownLessons = lessonOrder();
  const knownLessonSet = new Set(knownLessons);
  const reviews = reviewRegistry();
  if (reimportCaptions) reviews.reviewedMediaIds = [];
  let reviewedMediaIds = new Set(reviews.reviewedMediaIds);
  const completed = [];
  const pending = [];

  assert(mediaDefinitions.length === 36, `Expected 36 unique media definitions, got ${mediaDefinitions.length}`);
  assert(new Set(mediaDefinitions.map((definition) => definition.stem)).size === mediaDefinitions.length, "Media stems must be unique");

  for (const definition of mediaDefinitions) {
    definition.lessonIds.forEach((lessonId) => assert(knownLessonSet.has(lessonId), `${definition.stem}: unknown lesson ${lessonId}`));
    const filename = `${definition.stem}.mp4`;
    const download = downloadByFilename.get(filename);
    const supplemental = supplementalSources[definition.stem];
    const sourceUrl = supplemental?.sourceUrl || download?.source_url || download?.download_url || "";
    const fallbackUrl = supplemental?.fallbackUrl || fallbackBySource.get(urlKey(sourceUrl)) || "";
    const videoPath = join(sourceRoot, "media/video", filename);
    const processEntry = processingByFilename.get(filename);
    const sourceAudio = processEntry?.audio ? join(sourceRoot, processEntry.audio) : "";
    const sourceVtt = join(sourceRoot, "media/transcripts", `${definition.stem}.vtt`);
    const sourcePoster = join(sourceRoot, "media/keyframes", definition.stem, "frame-01.jpg");
    const missing = [];
    if (!existsSync(videoPath) || statSync(videoPath).size === 0) missing.push("video");
    if (!processEntry || processEntry.status !== "ok" || !(Number(processEntry.duration_seconds) > 0)) missing.push("metadata");
    if (!sourceAudio || !existsSync(sourceAudio) || statSync(sourceAudio).size === 0) missing.push("audio");
    if (!existsSync(sourceVtt) || statSync(sourceVtt).size === 0) missing.push("captions");
    if (missing.length) {
      pending.push({ stem: definition.stem, missing });
      continue;
    }

    const videoUrl = approvedUrl(sourceUrl, "video");
    const approvedFallback = approvedUrl(fallbackUrl, "fallback");
    const embedUrl = vimeoEmbedUrl(approvedFallback);
    assert(videoUrl, `${definition.stem}: missing or unapproved CDN video URL`);
    assert(approvedFallback, `${definition.stem}: missing or unapproved Vimeo fallback URL`);
    assert(embedUrl, `${definition.stem}: Vimeo fallback cannot produce an approved embed URL`);

    const durationSeconds = Math.round(Number(processEntry.duration_seconds) * 1000) / 1000;
    assert(definition.startAtSeconds < durationSeconds, `${definition.stem}: playback start must be inside the recording`);
    const learning = validateLearning(learningLibrary.items[definition.stem], definition.stem, durationSeconds);
    const audioPath = join(audioRoot, `${definition.stem}.m4a`);
    const audioBytes = buildAudio(sourceAudio, audioPath, durationSeconds, definition.stem);
    const captionPath = join(captionsRoot, `${definition.stem}.vtt`);
    const captionInput = !reimportCaptions && existsSync(captionPath)
      ? readFileSync(captionPath, "utf8")
      : readFileSync(sourceVtt, "utf8");
    const cues = parseVtt(captionInput);
    validateCues(cues, definition.stem, durationSeconds);
    validateLearningCues(learning, cues, definition.stem);
    writeIfChanged(captionPath, serializeVtt(cues));

    const transcriptPayload = {
      schema: "ffstart-transcript-v1",
      mediaId: definition.stem,
      language: "ru",
      durationSeconds,
      cues
    };
    const transcriptPath = join(transcriptRoot, `${definition.stem}.json`);
    writeIfChanged(transcriptPath, `${JSON.stringify(transcriptPayload, null, 2)}\n`);

    let posterUrl = "";
    if (existsSync(sourcePoster) && statSync(sourcePoster).size > 0) {
      const posterPath = join(posterRoot, `${definition.stem}.jpg`);
      copyIfChanged(sourcePoster, posterPath);
      const bytes = readFileSync(posterPath);
      assert(bytes[0] === 0xff && bytes[1] === 0xd8, `${definition.stem}: poster is not a JPEG`);
      posterUrl = `/assets/ffstart-course/media/posters/${definition.stem}.jpg?v=${assetVersion}`;
    }

    completed.push({
      ...definition,
      audioBytes,
      item: {
        id: definition.stem,
        title: definition.title,
        summary: definition.summary,
        eyebrow: definition.eyebrow,
        videoUrl,
        embedUrl,
        audioUrl: `/assets/ffstart-course/media/audio/${definition.stem}.m4a?v=${assetVersion}`,
        fallbackUrl: approvedFallback,
        posterUrl,
        captionsUrl: `/assets/ffstart-course/media/captions/${definition.stem}.vtt?v=${assetVersion}`,
        captionsStatus: reviewedMediaIds.has(definition.stem) ? "reviewed" : "draft",
        transcriptUrl: `/assets/ffstart-course/media/transcripts/${definition.stem}.json?v=${assetVersion}`,
        transcriptStatus: reviewedMediaIds.has(definition.stem) ? "reviewed" : "draft",
        durationSeconds,
        ...(definition.startAtSeconds > 0 ? { startAtSeconds: definition.startAtSeconds } : {}),
        learning,
        longForm: definition.longForm
      }
    });
  }

  if (markCaptionsReviewed) {
    assert(!reimportCaptions, "Cannot reimport and approve captions in the same build");
    reviewedMediaIds = new Set(completed.map((media) => media.item.id));
    for (const media of completed) {
      media.item.captionsStatus = "reviewed";
      media.item.transcriptStatus = "reviewed";
    }
  }

  const reviewPayload = {
    schema: "ffstart-caption-review-v1",
    version: "2026-07-15.editorial-1",
    reviewedMediaIds: mediaDefinitions.map((definition) => definition.stem).filter((stem) => reviewedMediaIds.has(stem))
  };
  writeIfChanged(reviewManifestPath, `${JSON.stringify(reviewPayload, null, 2)}\n`);

  const lessons = {};
  for (const lessonId of knownLessons) {
    const items = completed.filter((media) => media.lessonIds.includes(lessonId)).map((media) => media.item);
    if (items.length) lessons[lessonId] = items;
  }

  const uniqueCompletedDuration = completed.reduce((sum, media) => sum + media.item.durationSeconds, 0);
  const payload = {
    schema: "ffstart-media-library-v1",
    version: libraryVersion,
    totals: {
      expectedUniqueVideos: mediaDefinitions.length,
      availableUniqueVideos: completed.length,
      pendingUniqueVideos: pending.length,
      lessonsWithMedia: Object.keys(lessons).length,
      lessonLinks: Object.values(lessons).reduce((sum, items) => sum + items.length, 0),
      durationSeconds: Math.round(uniqueCompletedDuration * 1000) / 1000,
      audioBytes: completed.reduce((sum, media) => sum + media.audioBytes, 0),
      learningCheckpoints: completed.reduce((sum, media) => sum + media.item.learning.checkpoints.length, 0)
    },
    lessons
  };

  assert(payload.totals.availableUniqueVideos + payload.totals.pendingUniqueVideos === 36, "Media total is inconsistent");
  assert(new Set(completed.map((media) => media.item.id)).size === completed.length, "Completed media IDs are not unique");
  for (const [lessonId, items] of Object.entries(lessons)) {
    assert(knownLessonSet.has(lessonId), `Manifest contains unknown lesson ${lessonId}`);
    for (const item of items) {
      assert(item.captionsStatus === item.transcriptStatus, `${item.id}: review status is inconsistent`);
      assert(["reviewed", "draft"].includes(item.captionsStatus), `${item.id}: unknown review status`);
      assert(item.videoUrl && item.embedUrl && item.audioUrl && item.fallbackUrl && item.captionsUrl && item.transcriptUrl, `${item.id}: required learner media fields are missing`);
      assert(item.learning && item.learning.checkpoints.length >= 2, `${item.id}: video is connected to useful learning decisions`);
    }
  }

  writeIfChanged(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, pending };
}

const result = build();
console.log(`FF Start media library: ${result.payload.totals.availableUniqueVideos}/36 unique videos, ${result.payload.totals.lessonsWithMedia} lessons, ${result.payload.totals.lessonLinks} lesson links.`);
if (result.pending.length) {
  console.log(`Pending derivatives: ${result.pending.map((item) => `${item.stem} (${item.missing.join(", ")})`).join("; ")}`);
}
