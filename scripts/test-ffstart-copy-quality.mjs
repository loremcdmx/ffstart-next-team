import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repoRoot, "course/ffstart-manifest.json");
const videoLearningPath = join(repoRoot, "course/ffstart-video-learning.json");
const practiceDir = join(repoRoot, "assets/ffstart-course/practice");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function compact(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizedLabel(value) {
  return compact(value).normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function numericBb(value) {
  if (typeof value === "number") return value;
  const match = compact(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

const manifest = readJson(manifestPath);
const videoLearning = readJson(videoLearningPath);
const videoLearningItems = Object.entries(videoLearning.items || {});
const practiceIndex = readJson(join(practiceDir, "manifest.json"));
const lessons = (manifest.modules || []).flatMap((module) => module.lessons || []);
const nonLegacyLessons = lessons.filter((lesson) => lesson.kind !== "legacy");
const packFiles = readdirSync(practiceDir)
  .filter((file) => file.endsWith(".json") && file !== "manifest.json")
  .sort();
const packs = new Map(
  packFiles.map((file) => {
    const pack = readJson(join(practiceDir, file));
    return [file.slice(0, -5), { file, pack }];
  })
);

const errors = [];
function check(condition, message) {
  if (!condition) errors.push(message);
}

function textEntriesForSpot(lessonId, spot) {
  const prefix = `${lessonId}:${spot.id || "<без id>"}`;
  const entries = [
    ["title", spot.title],
    ["question", spot.question],
    ["hint", spot.hint],
    ["wisdom", spot.wisdom],
    ["historyLine", spot.table?.historyLine],
    ["heroStack", spot.table?.heroStack],
    ["effectiveStack", spot.table?.effectiveStack],
    ["pot", spot.table?.pot],
    ["toCall", spot.table?.toCall]
  ];

  for (const [index, line] of (spot.table?.actionLine || []).entries()) {
    entries.push([`actionLine[${index}]`, line]);
  }
  for (const [index, seat] of (spot.table?.seats || []).entries()) {
    entries.push([`seat[${index}].label`, seat?.label]);
  }
  for (const [index, option] of (spot.options || []).entries()) {
    entries.push([`options[${index}].label`, option?.label]);
    entries.push([`options[${index}].feedback`, option?.feedback]);
  }

  return entries.map(([field, value]) => ({ field: `${prefix}:${field}`, value: compact(value) }));
}

function manifestTextEntries() {
  const entries = [
    ["course.title", manifest.title],
    ["course.subtitle", manifest.subtitle]
  ];

  for (const session of manifest.playSessions || []) {
    for (const field of ["title", "kicker", "body", "modeLabel", "duration", "nextLabel"]) {
      entries.push([`playSessions.${session.id}.${field}`, session[field]]);
    }
    entries.push([`playSessions.${session.id}.stack.label`, session.stack?.label]);
  }

  for (const module of manifest.modules || []) {
    entries.push([`modules.${module.id}.title`, module.title]);
    entries.push([`modules.${module.id}.promise`, module.promise]);
    for (const lesson of module.lessons || []) {
      entries.push([`lessons.${lesson.id}.title`, lesson.title]);
    }
  }

  return entries.map(([field, value]) => ({ field, value: compact(value) }));
}

function videoLearningTextEntries(id, item) {
  const entries = [];
  for (const field of ["title", "body", "rule", "watchFor", "practiceCue", "boundary"]) {
    if (compact(item?.[field])) entries.push([field, item[field]]);
  }
  for (const [index, checkpoint] of (item?.checkpoints || []).entries()) {
    entries.push([`checkpoints[${index}].title`, checkpoint?.title]);
    entries.push([`checkpoints[${index}].body`, checkpoint?.body]);
  }
  return entries.map(([field, value]) => ({ field: `videoLearning.${id}.${field}`, value: compact(value) }));
}

const BAD_COPY_PATTERNS = [
  ["три вопросительных знака", /\?{3,}/u],
  [
    "технический термин источника",
    /\b(?:source|sheet|column|row|pack|uuid|dataset|pdf|sql|bigquery|clickhouse|mcp|github|canvas|telemetry|machine)\b|source[_ -]?(?:row|id)|(?:trainer|test)_[a-z0-9_]+|источник(?:а|е|и|ом|у)?\s+(?:данн\p{L}*|материал\p{L}*|файл\p{L}*|таблиц\p{L}*|строк\p{L}*)|колонк[аеуы]\s+(?:данн\p{L}*|таблиц\p{L}*)|строк[аеуы]\s+(?:данн\p{L}*|таблиц\p{L}*)|машин[аеы]/iu
  ],
  ["служебный путь или файл", /(?:^|[^\p{L}\p{N}_])(?:\/?(?:assets|course|scripts)\/|[a-z0-9_.-]+\.(?:json|mjs|js|html|csv|tsv)\b|localStorage\b|data-[a-z0-9_-]+)/iu],
  ["сырая английская метка скорости", /\b(?:normal|turbo|hyper)\b/iu],
  ["сырая английская поздняя регистрация", /\blate\s+registration\b/iu],
  ["служебное Hero", /\bHero\b/iu],
  ["позиция BU вместо BTN", /\bBU\b/u],
  ["служебное Игрок", /(?:^|[^\p{L}\p{N}_])Игрок(?=$|[^\p{L}\p{N}_])/u],
  ["формальное обращение", /(?:^|[^\p{L}])(?:вы|вам|вас|ваш(?:а|е|и|его|ему|им)?|выберите|выбирайте|посмотрите|вспомните|подумайте|ставьте|можете|хотите|сможете|фолдите|сдавайтесь)(?=$|[^\p{L}])/iu],
  ["сломанная редактура", /ран-ауу|решеним|поделать|позициий|позиции,\s+Сверь|ставку\s+тёрне|ставить\s+ставку\s+продолжения|(?:более\s+)?крупным\s+размером\s+ставки|Хотя\s+[^.!?]+,\s+но|не\s+стоит\s+так\s+как|у\s+нас\s+не\s+(?:рука\s+для\s+вэлью|сильная\s+рука)|не\s+телефоним|топпар|нижней границей Здесь|(?:^|[^\p{L}])ты (?:находится|отдаёт|покрывает|рискует|получает)(?=$|[^\p{L}])/iu],
  ["сломанная параллельность", /мы\s+не\s+хотим\s+[^,.!?]+,\s*а\s+играть/iu],
  ["прописная буква внутри предложения", /(?<!^)(?<![.!?]\s)Здесь(?=$|[^\p{L}\p{N}_])/u],
  ["сломанное склонение баббла", /(?:из-за\s+баббл|после\s+лопнувшего\s+баббл)(?=\s|[,.!?]|$)/iu],
  ["английское Fold в объяснении", /(?:^|[^\p{L}-])fold(?=$|[^\p{L}-])/iu],
  ["русское Фолд в объяснении", /(?:^|[^\p{L}-])фолд(?=$|[^\p{L}-])/iu],
  ["латинская C вместо кириллической С", /(?:^|[^\p{L}])C(?=\s+[2-9TJQKA]{2}\b)/u],
  ["BB без пробела", /\d\+?BB\b/iu],
  ["процент без пробела", /\d%/u],
  ["десятичная точка вместо запятой", /\d\.\d(?=\s*BB\b)/iu],
  ["числовой диапазон через дефис", /\d\s*-\s*\d/u],
  ["диапазон рук через дефис", /\b[2-9TJQKA]{2}[so]?\s*-\s*[2-9TJQKA]{2}[so]?\b/iu],
  ["незавершённый хвост «вы можете»", /(?:^|[^\p{L}])вы можете[.!?…]*$/iu],
  ["незавершённый хвост «можешь»", /(?:^|[^\p{L}])можешь[.!?…]*$/iu]
];

const REDUNDANT_VERDICT_PREFIX = /^(?:молодец|правильно|верно|хорошо|отлично|неверно|неправильно|ошибка|ответ (?:неверный|неправильный)|это (?:неверно|неправильно|не лучший вариант))[!,.?:;\s—–-]+/iu;
const PLACEHOLDER_LABEL = /^(?:Лучшее действие|Вариант\s+\d+|План\s+\d+)$/iu;
const ACTION_LABEL = /(?:^|[^\p{L}])(?:пас|фолд|чек|колл|ставк\p{L}*|\d+\s*[-‑–]?\s*бет\p{L}*|рейз\p{L}*|олл[-‑– ]?ин|изолейт\p{L}*)(?=$|[^\p{L}])/iu;
const HAND_IN_QUESTION = /\b[2-9TJQKA]{2}[so]?\b(?!\s*BB)/iu;
const VISIBLE_RAISE = /(?:рейз|повыс|\b[34]\s*[-‑–]?\s*бет|откр(?:ыл|ыла|ыли)\s+(?:до|на))/iu;
const VISIBLE_SEAT_ACTOR = /^(UTG\+2|UTG\+1|UTG|EP|MP|LJ|HJ|CO|BTN|SB|BB)\b/iu;

function expectedActionType(label) {
  const value = compact(label);
  if (/(?:^|[^\p{L}])чек[-‑– ](?:колл|пас|фолд|рейз)/iu.test(value)) return "";
  if (/(?:^|[^\p{L}])(?:пас|фолд)(?=$|[^\p{L}])/iu.test(value)) return "fold";
  if (/(?:^|[^\p{L}])чек(?=$|[^\p{L}])/iu.test(value)) return "check";
  if (/(?:^|[^\p{L}])олл[-‑– ]?ин(?=$|[^\p{L}])/iu.test(value)) return "all-in";
  if (/(?:^|[^\p{L}])(?:колл|лимп)(?=$|[^\p{L}])/iu.test(value)) return "call";
  if (/(?:^|[^\p{L}])(?:рейз|изолейт|ставк\p{L}*|бет)(?=$|[^\p{L}])/iu.test(value)) return "raise";
  return "";
}

function lineBelongsToHero(line, heroPosition) {
  const normalized = compact(line).toLocaleUpperCase("ru-RU");
  const position = compact(heroPosition).toLocaleUpperCase("ru-RU");
  return normalized === "ТЫ" || normalized.startsWith("ТЫ ") || normalized.startsWith("У ТЕБЯ ") || (position && (normalized === position || normalized.startsWith(`${position} `)));
}

function isActionDecisionWithRepresentedCards(spot) {
  const options = spot.options || [];
  const actionTypes = new Set(["fold", "check", "call", "bet", "raise", "all-in"]);
  const hasAction = options.some((option) => actionTypes.has(compact(option?.actionType).toLowerCase()) || ACTION_LABEL.test(compact(option?.label)));
  const table = spot.table || {};
  const cardsAreRepresented =
    HAND_IN_QUESTION.test(compact(spot.question)) ||
    /[♠♥♦♣]/u.test(compact(spot.question)) ||
    (table.boardCards || []).length > 0 ||
    (table.seats || []).some((seat) => (seat?.cards || []).length > 0);
  return hasAction && cardsAreRepresented;
}

for (const lesson of nonLegacyLessons) {
  check(packs.has(lesson.id), `manifest:${lesson.id}: нет practice-pack для опубликованного урока`);
}

const indexedPacks = new Map((practiceIndex.packs || []).map((entry) => [entry.id, entry]));
for (const [lessonId, { pack }] of packs) {
  check(indexedPacks.has(lessonId), `${lessonId}: pack отсутствует в practice/manifest.json`);
  check(pack.lessonId === lessonId, `${lessonId}: lessonId в pack не совпадает с именем файла`);
  check(Array.isArray(pack.spots) && pack.spots.length > 0, `${lessonId}: pack не содержит ситуаций`);
  if (indexedPacks.has(lessonId) && Array.isArray(pack.spots)) {
    check(indexedPacks.get(lessonId).spots === pack.spots.length, `${lessonId}: число ситуаций не совпадает с practice/manifest.json`);
  }

  for (const spot of pack.spots || []) {
    const spotRef = `${lessonId}:${spot.id || "<без id>"}`;
    const options = Array.isArray(spot.options) ? spot.options : [];
    const correctOptions = options.filter((option) => option?.correct === true);
    check(correctOptions.length === 1, `${spotRef}: должно быть ровно одно правильное действие, найдено ${correctOptions.length}`);
    check(compact(spot.question).length > 0, `${spotRef}: пустой question`);
    check(compact(spot.hint).length > 0, `${spotRef}: пустой hint`);
    check(compact(spot.wisdom).length > 0, `${spotRef}: пустой wisdom`);
    check(/[.!?…][»”')\]]*$/u.test(compact(spot.question)), `${spotRef}: question без завершающего знака`);
    check(/[.!?…][»”')\]]*$/u.test(compact(spot.hint)), `${spotRef}: hint без завершающего знака`);
    check(/[.!?…][»”')\]]*$/u.test(compact(spot.wisdom)), `${spotRef}: wisdom без завершающего знака`);
    check(compact(spot.table?.historyLine).length > 0, `${spotRef}: пустой historyLine`);
    check(Array.isArray(options) && options.length > 0, `${spotRef}: отсутствуют варианты ответа`);
    for (const [index, seat] of (spot.table?.seats || []).entries()) {
      check(compact(seat?.label).length > 0, `${spotRef}: seat[${index}] имеет пустой label`);
    }

    const seenLabels = new Set();
    for (const [index, option] of options.entries()) {
      const label = compact(option?.label);
      const feedback = compact(option?.feedback);
      const normalized = normalizedLabel(label);
      check(label.length > 0, `${spotRef}: options[${index}] имеет пустой label`);
      check(feedback.length > 0, `${spotRef}: options[${index}] имеет пустой feedback`);
      check(/[.!?…][»”')\]]*$/u.test(feedback), `${spotRef}: options[${index}] feedback без завершающего знака`);
      check(!PLACEHOLDER_LABEL.test(label), `${spotRef}: options[${index}] содержит заглушку «${label}»`);
      check(normalized !== "фолд", `${spotRef}: options[${index}] использует «Фолд» вместо «Пас»`);
      check(!seenLabels.has(normalized), `${spotRef}: повторяется label «${label}»`);
      seenLabels.add(normalized);
      check(feedback.length <= 500, `${spotRef}: options[${index}] feedback длиннее 500 символов (${feedback.length})`);
      check(!REDUNDANT_VERDICT_PREFIX.test(feedback), `${spotRef}: options[${index}] feedback начинается с лишнего вердикта`);
      const expectedType = expectedActionType(label);
      if (expectedType && isActionDecisionWithRepresentedCards(spot)) {
        check(compact(option?.actionType).toLowerCase() === expectedType, `${spotRef}: options[${index}] «${label}» имеет actionType «${compact(option?.actionType)}» вместо «${expectedType}»`);
      }
      const callAmount = label.match(/^Колл\s+(\d+(?:[.,]\d+)?)\s*BB$/iu);
      if (callAmount) {
        check(Math.abs(numericBb(callAmount[1]) - numericBb(spot.table?.toCall)) < 0.01, `${spotRef}: options[${index}] показывает колл ${callAmount[1]} BB при цене ${compact(spot.table?.toCall)}`);
      }
    }

    check(!REDUNDANT_VERDICT_PREFIX.test(compact(spot.wisdom)), `${spotRef}: wisdom начинается с лишнего вердикта`);
    check(!/^\s*999(?:[.,]0+)?\s*BB\s*$/iu.test(compact(spot.table?.pot)), `${spotRef}: служебный банк 999 BB`);

    for (const entry of textEntriesForSpot(lessonId, spot)) {
      for (const [description, pattern] of BAD_COPY_PATTERNS) {
        check(!pattern.test(entry.value), `${entry.field}: ${description}: «${entry.value.slice(0, 140)}»`);
      }
    }

    if (isActionDecisionWithRepresentedCards(spot)) {
      check((spot.table?.heroCards || []).length === 2, `${spotRef}: карточное решение не содержит две heroCards`);
    }

    const street = compact(spot.table?.street).toLowerCase();
    const boardCount = (spot.table?.boardCards || []).length;
    const expectedBoardCount = { preflop: 0, flop: 3, turn: 4, river: 5 }[street];
    if (Number.isInteger(expectedBoardCount)) {
      check(boardCount === expectedBoardCount, `${spotRef}: улица ${street} содержит ${boardCount} карт доски вместо ${expectedBoardCount}`);
    }

    const heroPosition = compact(spot.table?.heroPosition).toUpperCase();
    if ((spot.table?.heroCards || []).length === 2) {
      check((spot.table?.seats || []).some((seat) => compact(seat?.state).toLowerCase() === "hero" || compact(seat?.label).toUpperCase() === heroPosition), `${spotRef}: в seats нет места героя для позиции ${heroPosition}`);
    }
    const visibleCards = [
      ...(spot.table?.heroCards || []),
      ...(spot.table?.boardCards || []),
      ...(spot.table?.seats || [])
        .filter((seat) => compact(seat?.state).toLowerCase() !== "hero" && compact(seat?.label).toUpperCase() !== heroPosition)
        .flatMap((seat) => seat?.cards || [])
    ].map((card) => compact(card).toLowerCase()).filter(Boolean);
    const cardCounts = new Map();
    for (const card of visibleCards) cardCounts.set(card, (cardCounts.get(card) || 0) + 1);
    for (const [card, count] of cardCounts) {
      check(count === 1, `${spotRef}: карта ${card} встречается ${count} раза в видимом состоянии`);
    }

    const heroStack = numericBb(spot.table?.heroStack);
    const toCall = numericBb(spot.table?.toCall);
    if (Number.isFinite(heroStack) && Number.isFinite(toCall)) {
      check(toCall <= heroStack + 0.01, `${spotRef}: к коллу ${toCall} BB при стеке ${heroStack} BB`);
    }

    const actionLine = (spot.table?.actionLine || []).map(compact);
    const seatLabels = new Set((spot.table?.seats || []).map((seat) => compact(seat?.label).toUpperCase()));
    if (seatLabels.size > 0) {
      for (const line of actionLine) {
        const actor = compact(line).match(VISIBLE_SEAT_ACTOR)?.[1]?.toUpperCase();
        if (actor) check(seatLabels.has(actor), `${spotRef}: экшен «${line}» относится к ${actor}, но такого места нет на столе`);
      }
      const dealerPosition = compact(spot.table?.dealerPosition).toUpperCase();
      if (dealerPosition) check(seatLabels.has(dealerPosition), `${spotRef}: дилер указан на ${dealerPosition}, но такого места нет на столе`);
    }
    const visibleRaise = actionLine.some((line) => VISIBLE_RAISE.test(line));
    const heroAlreadyActed = actionLine.some((line) => lineBelongsToHero(line, spot.table?.heroPosition));
    if (visibleRaise && !heroAlreadyActed) {
      check(numericBb(spot.table?.toCall) > 0, `${spotRef}: перед героем виден рейз, но toCall равен ${compact(spot.table?.toCall) || "пусто"}`);
    }

    const heroRaiseLine = actionLine.find((line) => lineBelongsToHero(line, spot.table?.heroPosition) && /рейз\s+до\s+\d/iu.test(line));
    const opponentJamLine = [...actionLine].reverse().find((line) => !lineBelongsToHero(line, spot.table?.heroPosition) && /олл[-‑– ]?ин\s+\d/iu.test(line));
    if (heroRaiseLine && opponentJamLine) {
      const heroRaiseTo = numericBb(heroRaiseLine.match(/рейз\s+до\s+(\d+(?:[.,]\d+)?)/iu)?.[1]);
      const opponentJamTo = numericBb(opponentJamLine.match(/олл[-‑– ]?ин\s+(\d+(?:[.,]\d+)?)/iu)?.[1]);
      if (Number.isFinite(heroRaiseTo) && Number.isFinite(opponentJamTo)) {
        const expectedCall = opponentJamTo - heroRaiseTo;
        check(Math.abs(numericBb(spot.table?.toCall) - expectedCall) < 0.01, `${spotRef}: после рейза до ${heroRaiseTo} BB и олл-ина ${opponentJamTo} BB цена должна быть ${expectedCall} BB, получено ${compact(spot.table?.toCall)}`);
      }
    }
  }
}

for (const entry of manifestTextEntries()) {
  for (const [description, pattern] of BAD_COPY_PATTERNS) {
    check(!pattern.test(entry.value), `manifest:${entry.field}: ${description}: «${entry.value.slice(0, 140)}»`);
  }
}

check(videoLearningItems.length === 36, `videoLearning: ожидалось 36 материалов, найдено ${videoLearningItems.length}`);
for (const [id, item] of videoLearningItems) {
  for (const field of ["title", "body", "rule", "watchFor", "practiceCue"]) {
    check(compact(item?.[field]).length > 0, `videoLearning.${id}.${field}: пустое обязательное поле`);
  }
  check(Array.isArray(item?.checkpoints) && item.checkpoints.length > 0, `videoLearning.${id}.checkpoints: нет контрольных точек`);

  const entries = videoLearningTextEntries(id, item);
  for (const entry of entries) {
    for (const [description, pattern] of BAD_COPY_PATTERNS) {
      check(!pattern.test(entry.value), `${entry.field}: ${description}: «${entry.value.slice(0, 140)}»`);
    }
  }

  const combined = entries.map((entry) => entry.value).join(" ");
  if (/\b(?:A|B|C)-game\b/iu.test(combined)) {
    for (const level of ["A", "B", "C"]) {
      check(new RegExp(`\\b${level}-game\\s*[—–-]\\s*[^,.;!?]{3,}`, "iu").test(combined), `videoLearning.${id}: ${level}-game используется без краткой расшифровки`);
    }
  }
  if (/\bABI\b/u.test(combined)) {
    check(/\bABI\s*[—–-]\s*(?:это\s+)?средн(?:ий|его)\s+(?:размер\s+)?бай-?ин/iu.test(combined), `videoLearning.${id}: ABI используется без расшифровки «средний бай-ин»`);
  }
  if (/\bROI\b/u.test(combined)) {
    check(/(?:\bROI\s*[—–-]\s*(?:ожидаемая\s+)?доходность|(?:ожидаемая\s+)?доходность\s*\(ROI\))/iu.test(combined), `videoLearning.${id}: ROI используется без расшифровки «ожидаемая доходность»`);
  }
}

const drawsPack = packs.get("draws-outs")?.pack;
const correctedOuts = [
  ["draws-outs-fdgut-flop", "15 аутов", "Флеш-дро + двусторонний стрит-дро"],
  ["draws-outs-dirty-over-flop", "4 аута", "Гатшот + бэкдор-флеш"],
  ["draws-outs-combo-pair-fd-flop-17", "15 аутов", "Пара + флеш + стрит-дро"],
  ["draws-outs-set-to-boat-turn-26", "3 аута", "Фулл-хаус до более сильного фулла или каре"],
  ["draws-outs-fd-two-overs-clean-flop-22", "15 аутов", "Натсовое флеш-дро + две чистые оверкарты"]
];
for (const [id, expectedCorrectLabel, expectedTitle] of correctedOuts) {
  const spot = drawsPack?.spots?.find((entry) => entry.id === id);
  check(Boolean(spot), `draws-outs:${id}: не найдена критическая ситуация`);
  if (spot) {
    check(compact(spot.title) === expectedTitle, `draws-outs:${id}: ожидался title «${expectedTitle}», получен «${compact(spot.title)}»`);
    check(compact(spot.options?.find((option) => option.correct)?.label) === expectedCorrectLabel, `draws-outs:${id}: ожидался ответ «${expectedCorrectLabel}»`);
  }
}
const pokerMathCleanFlushDraw = packs.get("poker-math")?.pack?.spots?.find((spot) => spot.id === "poker-math-fd-two-overs-clean-flop-22");
check(Boolean(pokerMathCleanFlushDraw), "poker-math:fd-two-overs-clean-flop-22: не найдена контрольная ситуация");
if (pokerMathCleanFlushDraw) {
  check(compact(pokerMathCleanFlushDraw.title).startsWith("Натсовое флеш-дро + две чистые оверкарты"), "poker-math:fd-two-overs-clean-flop-22: неверно названа незакрытая комбинация");
  check(/девять\s+аутов\s+на\s+флеш/iu.test(compact(pokerMathCleanFlushDraw.wisdom)), "poker-math:fd-two-overs-clean-flop-22: объяснение должно считать ауты на флеш, а не готовый флеш");
}
const doubleGutter = drawsPack?.spots?.find((spot) => spot.id === "draws-outs-double-gutter-flop-18");
check(Boolean(doubleGutter), "draws-outs:draws-outs-double-gutter-flop-18: не найдена критическая ситуация");
if (doubleGutter) {
  check(compact(doubleGutter.title) === "Двусторонний стрит-дро", "draws-outs:double-gutter: неверная подпись типа дро");
  check(compact(doubleGutter.options?.find((option) => option.correct)?.label) === "8 аутов", "draws-outs:double-gutter: неверное число аутов");
}

const blindPack = packs.get("blind-versus-blind")?.pack;
for (const spot of blindPack?.spots || []) {
  check((spot.table?.heroCards || []).length === 2, `blind-versus-blind:${spot.id}: нет двух heroCards`);
}

const opponentExpectations = {
  "versus-aggressive-top-pair": { street: "flop", board: 3, ranks: "AQ", question: /топ-пар/iu, actions: [/чек/iu, /ставк/iu, /рейз/iu], toCall: "positive" },
  "versus-aggressive-missed-draw": { street: "river", board: 5, ranks: "JT", question: /(?:промах|дро)/iu, actions: [/ставк/iu], toCall: "positive" },
  "versus-aggressive-value": { street: "river", board: 5, ranks: "AJ", question: /флеш/iu, actions: [/чек/iu], toCall: "zero" },
  "versus-aggressive-position": { street: "preflop", board: 0, ranks: "A5", question: /A5s/iu, actions: [/рейз/iu], toCall: "positive" },
  "versus-aggressive-trap": { street: "turn", board: 4, ranks: "QQ", question: /сет/iu, actions: [/ставк/iu], toCall: "positive" },
  "versus-passive-thin-value": { street: "river", board: 5, ranks: "A7", question: /вторая пара/iu, actions: [/чек/iu], toCall: "zero" },
  "versus-passive-big-bet": { street: "river", board: 5, ranks: "KQ", question: /втор\p{L}*\s+пар/iu, actions: [/ставк/iu], toCall: "positive" },
  "versus-passive-draw": { street: "turn", board: 4, ranks: "AA", question: /оверпар/iu, actions: [/ставк/iu, /колл/iu], toCall: "zero" },
  "versus-passive-bluff": { street: "river", board: 5, ranks: "AQ", question: /(?:промах|оверкар)/iu, actions: [/чек/iu], toCall: "zero" },
  "versus-passive-initiative": { street: "preflop", board: 0, ranks: "KJ", question: /KJs/iu, actions: [/лимп/iu], toCall: "positive" }
};

for (const [id, expected] of Object.entries(opponentExpectations)) {
  const lessonId = id.startsWith("versus-aggressive-") ? "versus-aggressive" : "versus-passive";
  const spot = packs.get(lessonId)?.pack?.spots?.find((entry) => entry.id === id);
  check(Boolean(spot), `${lessonId}:${id}: не найдена контрольная ситуация`);
  if (!spot) continue;
  const actionText = (spot.table?.actionLine || []).join(" · ");
  const ranks = (spot.table?.heroCards || []).map((card) => compact(card).charAt(0).toUpperCase()).join("");
  check(spot.table?.street === expected.street, `${lessonId}:${id}: ожидалась улица ${expected.street}, получена ${spot.table?.street}`);
  check((spot.table?.boardCards || []).length === expected.board, `${lessonId}:${id}: доска не соответствует улице ${expected.street}`);
  check(ranks === expected.ranks, `${lessonId}:${id}: карты героя не соответствуют сценарию (${ranks || "пусто"})`);
  check(expected.question.test(compact(spot.question)), `${lessonId}:${id}: вопрос не описывает контрольный сценарий`);
  for (const pattern of expected.actions) {
    check(pattern.test(actionText), `${lessonId}:${id}: actionLine не содержит ожидаемую часть экшена ${pattern}`);
  }
  if (expected.toCall === "positive") {
    check(numericBb(spot.table?.toCall) > 0, `${lessonId}:${id}: ожидался ненулевой toCall`);
  } else {
    check(numericBb(spot.table?.toCall) === 0, `${lessonId}:${id}: ожидался нулевой toCall`);
  }
}

const pushFoldPack = packs.get("push-fold")?.pack;
const visiblePushContexts = new Map();
for (const spot of pushFoldPack?.spots || []) {
  check(compact(spot.table?.heroPosition).toUpperCase() !== "BB", `push-fold:${spot.id}: BB не может быть первым входящим игроком`);
  const context = JSON.stringify({
    question: compact(spot.question),
    heroPosition: compact(spot.table?.heroPosition),
    heroStack: compact(spot.table?.heroStack),
    effectiveStack: compact(spot.table?.effectiveStack),
    pot: compact(spot.table?.pot),
    toCall: compact(spot.table?.toCall),
    heroCards: [...(spot.table?.heroCards || [])].sort(),
    boardCards: spot.table?.boardCards || [],
    street: compact(spot.table?.street),
    actionLine: (spot.table?.actionLine || []).map(compact),
    seats: (spot.table?.seats || []).map((seat) => [compact(seat?.label), compact(seat?.state), seat?.stackBb ?? null])
  });
  const correctLabel = normalizedLabel(spot.options?.find((option) => option.correct)?.label);
  const previous = visiblePushContexts.get(context);
  if (previous) {
    check(previous.correctLabel === correctLabel, `push-fold:${spot.id}: тот же видимый контекст имеет ответы «${previous.correctLabel}» и «${correctLabel}» (первый: ${previous.id})`);
  } else {
    visiblePushContexts.set(context, { id: spot.id, correctLabel });
  }
}

const finalExamPack = packs.get("final-exam")?.pack;
const revealedVillainScenarios = [
  "mixed-exam-final_exam_trainer_n_1-43",
  "mixed-exam-final_exam_trainer_n_2-55",
  "mixed-exam-final_exam_trainer_n_1-57",
  "mixed-exam-final_exam_trainer_n_2-06"
];
for (const suffix of revealedVillainScenarios) {
  const spot = finalExamPack?.spots?.find((entry) => entry.id.endsWith(suffix));
  check(Boolean(spot), `final-exam:${suffix}: не найдена контрольная ситуация со вскрытием`);
  if (spot) {
    const villain = (spot.table?.seats || []).find((seat) => compact(seat?.state).toLowerCase() !== "hero" && (seat?.cards || []).length === 2);
    check(Boolean(villain), `final-exam:${suffix}: карты соперника не представлены на столе`);
    check(villain?.revealCardsAfterAnswer === true, `final-exam:${suffix}: карты соперника должны открываться после ответа`);
  }
}

const effectiveStackSpot = finalExamPack?.spots?.find((entry) => entry.id.endsWith("mixed-exam-final_exam_trainer_n_1-51"));
check(Boolean(effectiveStackSpot), "final-exam:n_1-51: не найдена контрольная ситуация эффективного стека");
if (effectiveStackSpot) {
  check(numericBb(effectiveStackSpot.table?.heroStack) === 46.5, "final-exam:n_1-51: heroStack должен быть 46,5 BB");
  check(numericBb(effectiveStackSpot.table?.effectiveStack) === 46.5, "final-exam:n_1-51: effectiveStack должен быть 46,5 BB");
  const heroSeat = (effectiveStackSpot.table?.seats || []).find((seat) => compact(seat?.state).toLowerCase() === "hero" || compact(seat?.label).toUpperCase() === compact(effectiveStackSpot.table?.heroPosition).toUpperCase());
  check(Number(heroSeat?.stackBb) === 46.5, "final-exam:n_1-51: стек героя на столе должен быть 46,5 BB");
}

const exactFinalExamQuestions = new Map([
  ["mixed-exam-final_exam_trainer_n_1-27", "Сколько карт ривера дадут ровно одну пару, включая спаривание доски?"],
  ["mixed-exam-final_exam_trainer_n_2-04", "Сколько карт ривера дадут ровно две пары с учётом спаривания доски?"]
]);
for (const [suffix, expectedQuestion] of exactFinalExamQuestions) {
  const spot = finalExamPack?.spots?.find((entry) => entry.id.endsWith(suffix));
  check(compact(spot?.question) === expectedQuestion, `final-exam:${suffix}: контрольный вопрос изменился`);
}

const allSpots = [...packs.values()].flatMap(({ pack }) => pack.spots || []);
const optionCount = allSpots.reduce((total, spot) => total + (spot.options || []).length, 0);
const summary = `FF Start copy quality: ${nonLegacyLessons.length} уроков · ${videoLearningItems.length} видео · ${packs.size} packs · ${allSpots.length} ситуаций · ${optionCount} вариантов`;
console.log(summary);

if (errors.length > 0) {
  const shown = errors.slice(0, 100);
  console.error(`FAIL: ${errors.length} нарушений`);
  for (const error of shown) console.error(`- ${error}`);
  if (errors.length > shown.length) console.error(`- …ещё ${errors.length - shown.length}`);
  process.exitCode = 1;
} else {
  console.log("PASS");
}
