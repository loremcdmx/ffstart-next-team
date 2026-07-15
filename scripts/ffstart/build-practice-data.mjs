import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const hubRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(process.env.FFSTART_SOURCE_ROOT || join(hubRoot, "../фф старт + путь игрока"));
const manifest = JSON.parse(readFileSync(join(hubRoot, "course/ffstart-manifest.json"), "utf8"));
const outputRoot = join(hubRoot, "assets/ffstart-course/practice");
const lessonById = new Map(manifest.modules.flatMap((module) => module.lessons).map((lesson) => [lesson.id, lesson]));

mkdirSync(outputRoot, { recursive: true });

function readJson(relative) {
  return JSON.parse(readFileSync(join(sourceRoot, relative), "utf8"));
}

function loadWindow(relativeFiles) {
  const sandbox = {
    window: {},
    document: { baseURI: "http://localhost/" },
    console,
    URL,
    CustomEvent: class CustomEvent {},
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  runInNewContext(relativeFiles.map((relative) => readFileSync(join(sourceRoot, relative), "utf8")).join("\n"), sandbox, {
    filename: relativeFiles.join(" + ")
  });
  return sandbox.window;
}

function text(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bbNumber(value, fallback = 0) {
  const match = text(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? number(match[0], fallback) : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function cardCode(card) {
  if (typeof card === "string") {
    const normalized = card.replace(/^10/i, "T");
    return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1).toLowerCase()}` : "";
  }
  if (!Array.isArray(card)) return "";
  const suit = { "♣": "c", "♦": "d", "♥": "h", "♠": "s" }[card[1]] || "";
  return `${String(card[0]).replace(/^10$/, "T").toUpperCase()}${suit}`;
}

function cardDisplay(card) {
  const normalized = cardCode(card);
  const suit = { c: "♣", d: "♦", h: "♥", s: "♠" }[normalized.slice(-1)] || "";
  const rank = suit ? normalized.slice(0, -1) : normalized;
  return `${rank}${suit}`;
}

function cardsFromHandClass(hand) {
  const match = /^([AKQJT2-9])([AKQJT2-9])([so]?)$/i.exec(text(hand));
  if (!match) return [];
  const first = match[1].toUpperCase();
  const second = match[2].toUpperCase();
  if (first === second) return [`${first}s`, `${second}h`];
  if (match[3].toLowerCase() === "s") return [`${first}s`, `${second}s`];
  return [`${first}s`, `${second}h`];
}

const actionLabels = {
  fold: "Пас",
  call: "Колл",
  check: "Чек",
  raise: "Рейз",
  bet: "Ставка",
  open: "Открыть",
  threeBet: "3-бет",
  threebet: "3-бет",
  fourBet: "4-бет",
  jam: "Олл-ин",
  "all-in": "Олл-ин",
  push: "Олл-ин",
  min_open: "Мин-рейз",
  iso: "Изолейт",
  limp: "Лимп"
};

const lessonPrinciples = {
  "course-start": "Сначала прими решение, затем назови его причину и закрепи похожей серией.",
  "poker-history-rules": "Следи за порядком улиц, обязательными ставками и очередью действий.",
  combinations: "Составь лучшую пятёрку из семи карт и сравнивай комбинации по старшему значимому элементу.",
  positions: "Сначала найди BTN: позиция определяет порядок действий и объём информации.",
  "hand-actions": "Выбор действия начинается с уже вложенной суммы, цены продолжения и доступных вариантов.",
  "pairs-kicker": "При равной основной комбинации сравнивай кикеры по одному, от старшего к младшему.",
  "draws-outs": "Считай только чистые ауты: карта должна реально улучшать руку, не создавая очевидной угрозы.",
  "tournament-formats": "Формат выплат, скорость блайндов и нокауты меняют ценность риска.",
  "tournament-navigation": "Стек в BB и стадия турнира важнее номинального количества фишек.",
  "preflop-start": "До решения прочитай позицию, эффективный стек и весь экшен перед собой.",
  "betting-purpose": "Ставка должна либо получать колл от худших рук, либо выбивать руки с долей эквити.",
  "cbet-in-position": "В позиции чаще ставь на досках, где твой диапазон сохраняет преимущество и получает фолды.",
  "play-out-of-position": "Без позиции контролируй размер банка и не ставь автоматически в неудобную структуру доски.",
  "isolation-raise": "Изолейт забирает инициативу и оставляет слабого лимпера один на один; сайз растёт с числом лимперов.",
  "cold-call": "Колл должен выдерживать цену, доминацию, позицию и риск экшена за спиной.",
  "three-bet": "3-бет строится из сильного вэлью и рук с блокерами, которые выигрывают от фолд-эквити.",
  "versus-three-bet": "После 3-бета пересобери диапазон: часть рук продолжает коллом, верх — рейзом, низ — пасом.",
  multiway: "В мультипоте нужны сильнее готовая рука или дро: фолд-эквити ниже, а чужих комбинаций больше.",
  "blind-versus-blind": "В борьбе блайндов диапазоны шире, но позиция BB после флопа остаётся преимуществом.",
  "versus-aggressive": "Против лишней агрессии сохраняй ловушки и блеф-кетчеры, но не превращай любой колл в обязанность.",
  "versus-passive": "Против пассивного поля добирай чаще, а редкую крупную агрессию оценивай особенно строго.",
  "push-fold": "С коротким стеком олл-ин получает ценность от фолд-эквити и снимает трудные постфлоп-решения.",
  "jam-over-raise": "Рестил сравнивает мёртвые деньги, диапазон открытия, блокеры и эффективный стек.",
  "decision-logic": "Сравни цену решения с шансом выиграть и выбирай действие с лучшим ожиданием.",
  "poker-math": "Цена колла равна доплате, делённой на итоговый банк после колла.",
  icm: "Чипы и деньги не равны: перед крупным риском учитывай стеки, выплаты и цену вылета.",
  "poker-world": "Преимущество создают повторяемые решения, а короткий результат остаётся шумным.",
  "poker-profession": "Профессиональный подход соединяет банкролл, режим, обучение и честный разбор.",
  "poker-perspectives": "Рост виден по исчезающим повторным ошибкам, а не по одной удачной серии.",
  microstakes: "На микролимитах простая дисциплина, вэлью и отказ от лишних коллов сильнее показной сложности.",
  "course-feedback": "Выбирай следующий навык по частоте и цене повторяющейся ошибки.",
  resources: "Справочник помогает проверить решение, но сначала нужно определить позицию, стек и ветку экшена.",
  "final-exam": "Собери решение из позиции, стека, экшена, цены и структуры доски — именно в таком порядке."
};

const forbiddenLearnerCopy = /\b(source|sheet|column|row|pack|uuid|pdf|sql|bigquery|clickhouse|mcp|github|canvas|telemetry|hrc|machine|min-open|all-in|add-on|c-bet|3-bet|4-bet)\b|источник|колонк|строк[аеуы]|машин[аеы]/i;

function latinRatio(value) {
  const normalized = text(value);
  const letters = normalized.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  if (!letters) return 0;
  return normalized.replace(/[^A-Za-z]/g, "").length / letters.length;
}

function needsLocalization(value) {
  const normalized = text(value);
  const pokerNotationOnly = /^(?:(?:UTG(?:\+\d)?|EP(?:\+\d)?|MP|HJ|CO|BTN|SB|BB|[AKQJT2-9]{2}[so]?|\d+(?:[.,]\d+)?|%|[+–—→,./:\s])+)+$/;
  if (pokerNotationOnly.test(normalized)) return false;
  const latinWords = (normalized.match(/[A-Za-z]{4,}/g) || []).filter((word) => !/^Start$/i.test(word));
  return forbiddenLearnerCopy.test(normalized) || latinWords.length > 0 || latinRatio(normalized) > 0.72;
}

function localizedActionLabel(value) {
  let label = text(value)
    .replace(/_/g, " ")
    .replace(/\bfreezeout\b/gi, "фризаут")
    .replace(/\bre[ -]?entry\b/gi, "повторный вход")
    .replace(/\brebuy\b/gi, "докупка")
    .replace(/\badd[ -]?on\b/gi, "аддон")
    .replace(/\bmystery bounty\b/gi, "турнир с тайными баунти")
    .replace(/\bmystery\b/gi, "тайный")
    .replace(/\bticket equity\b/gi, "вероятность получить билет")
    .replace(/\bticket pressure\b/gi, "давление баббла сателлита")
    .replace(/\bsteals?\b/gi, "кража блайндов")
    .replace(/\bante\b/gi, "анте")
    .replace(/\bdraws?\b/gi, "дро")
    .replace(/\bstack[ -]?offs?\b/gi, "выставление на весь стек")
    .replace(/\bstack\b/gi, "стек")
    .replace(/\bprofitable\b/gi, "прибыльный")
    .replace(/\btargets?\b/gi, "цели")
    .replace(/\bfuture\b/gi, "будущий")
    .replace(/\bplans?\b/gi, "план")
    .replace(/\bignore\b/gi, "игнорировать")
    .replace(/\b(\d+)[ -]?max\s+столе/gi, "столе на $1 игроков")
    .replace(/\b(\d+)[ -]?max\b/gi, "$1 игроков")
    .replace(/\bbounty\b/gi, "баунти")
    .replace(/\bpayjumps?\b/gi, "скачок выплат")
    .replace(/\bbubble\b/gi, "баббл")
    .replace(/\bsatellites?\b/gi, "сателлит")
    .replace(/\bshort[ -]?stack\b/gi, "короткий стек")
    .replace(/\bdeep[ -]?stack\b/gi, "глубокий стек")
    .replace(/\bdeep\b/gi, "с глубоким стеком")
    .replace(/\blate reg(?:istration)?\b/gi, "поздняя регистрация")
    .replace(/\bmiddle stage\b/gi, "середина турнира")
    .replace(/\bfinal table\b/gi, "финальный стол")
    .replace(/\bchip[ -]?EV\b/gi, "ожидание по фишкам")
    .replace(/\bfold equity\b/gi, "фолд-эквити")
    .replace(/\bcall[ -]?vs[ -]?jam\b/gi, "колл против олл-ина")
    .replace(/\bopen[ /-]?fold\b/gi, "рейз или пас")
    .replace(/\bopen[ /-]?push\b/gi, "первый олл-ин")
    .replace(/\bmin[ -]?open\b/gi, "мин-рейз")
    .replace(/\bopen\b/gi, "рейз")
    .replace(/\breshoves?\b/gi, "рестил")
    .replace(/\brejams?\b/gi, "рестил")
    .replace(/\bflat[ -]?calls?\b/gi, "колл")
    .replace(/\bheads[ -]?up\b/gi, "один на один")
    .replace(/\bsuited\b/gi, "одномастная")
    .replace(/\boffsuit\b/gi, "разномастная")
    .replace(/\bpush\s*\/\s*fold\b/gi, "пуш-фолд")
    .replace(/\bblind vs blind\b/gi, "игра блайнд против блайнда")
    .replace(/\bfirst in\b/gi, "первый вход")
    .replace(/\bsource range\b/gi, "диапазон")
    .replace(/\bmin[ -]?open\b/gi, "мин-рейз")
    .replace(/\bset[ -]?mining\b/gi, "поиск сета")
    .replace(/\bdeep[ -]?stack\b/gi, "глубокий стек")
    .replace(/\bbroadway\b/gi, "бродвей")
    .replace(/\boverfolds?\b/gi, "слишком часто выбрасывает")
    .replace(/\bsqueezes?\b/gi, "сквизит")
    .replace(/\bregulars?\b/gi, "регуляры")
    .replace(/\bbluffs?\b/gi, "блеф")
    .replace(/\bvalue\b/gi, "вэлью")
    .replace(/\bflat\b/gi, "колл")
    .replace(/\brange\b/gi, "диапазон")
    .replace(/\bpressure\b/gi, "давление")
    .replace(/\bFutureEV\b/gi, "будущее преимущество")
    .replace(/\bHRC\b/gi, "расчётная модель")
    .replace(/\bmachine\b/gi, "расчётная модель")
    .replace(/\bsource\b/gi, "базовый")
    .replace(/\bHero\b/gi, "Игрок")
    .replace(/\bpush\b/gi, "олл-ин")
    .replace(/\bshove\b/gi, "олл-ин")
    .replace(/\bcall\b/gi, "колл")
    .replace(/\bfold\b/gi, "пас")
    .replace(/\bcheck\b/gi, "чек")
    .replace(/\braise\b/gi, "рейз");
  const exact = actionLabels[label] || actionLabels[label.toLowerCase()];
  if (exact) return exact;
  label = label
    .replace(/^fold\b/i, "Пас")
    .replace(/^call\b/i, "Колл")
    .replace(/^check\b/i, "Чек")
    .replace(/^raise\b/i, "Рейз")
    .replace(/^bet\b/i, "Ставка")
    .replace(/^open\b/i, "Рейз")
    .replace(/^(?:jam|shove|push|all[ -]?in)\b/i, "Олл-ин")
    .replace(/^limp\b/i, "Лимп")
    .replace(/^3[ -]?bet\b/i, "3-бет")
    .replace(/^4[ -]?bet\b/i, "4-бет")
    .replace(/\bmin[ -]?open\b/gi, "мин-рейз")
    .replace(/\bfold\b/gi, "пас")
    .replace(/\bcall\b/gi, "колл")
    .replace(/\bcheck\b/gi, "чек")
    .replace(/\braise\b/gi, "рейз")
    .replace(/\bpush\/?fold\b/gi, "пуш-фолд");
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : label;
}

function normalizeHandNotation(value) {
  const rankMap = { А: "A", A: "A", К: "K", K: "K", Д: "Q", Q: "Q", В: "J", J: "J", Т: "T", T: "T" };
  const rankOrder = "23456789TJQKA";
  return String(value || "")
    .replace(/(^|[^A-Za-zА-Яа-яЁё0-9])([AАKКQДJВTТ2-9])([AАKКQДJВTТ2-9])([sоo]?)(?=$|[^A-Za-zА-Яа-яЁё0-9])/g, function (_match, prefix, first, second, suffix) {
      let left = rankMap[first] || first;
      let right = rankMap[second] || second;
      if (/^[2-9]$/.test(left) && /^[2-9]$/.test(right) && left !== right && !suffix) return `${prefix}${first}${second}`;
      if (left !== right && rankOrder.indexOf(left) < rankOrder.indexOf(right)) [left, right] = [right, left];
      return `${prefix}${left}${right}${suffix === "о" ? "o" : suffix}`;
    })
    .replace(/(^|[^A-Za-zА-Яа-яЁё0-9])[AА][хx](?=$|[^A-Za-zА-Яа-яЁё0-9])/g, "$1Ax");
}

function editorialPolish(value) {
  let output = normalizeHandNotation(text(value))
    .replace(/\bBU\b/g, "BTN")
    .replace(/У Игрока/g, "У тебя")
    .replace(/Игрока/g, "тебя")
    .replace(/Игроку/g, "тебе")
    .replace(/Игроком/g, "тобой")
    .replace(/Игрок/g, "ты")
    .replace(/(^|\s)ты (?=\d)/gi, "$1у тебя ")
    .replace(/ты проигрывает/gi, "ты проигрываешь")
    .replace(/ты покрывает/gi, "ты покрываешь")
    .replace(/ты рискует/gi, "ты рискуешь")
    .replace(/ты получает/gi, "ты получаешь")
    .replace(/ты отдаёт/gi, "ты отдаёшь")
    .replace(/ты может/gi, "ты можешь")
    .replace(/ты входит/gi, "ты входишь")
    .replace(/ты коллирует/gi, "ты коллируешь")
    .replace(/ты принимает/gi, "ты принимаешь")
    .replace(/ты открывает/gi, "ты открываешь")
    .replace(/ты ставит/gi, "ты ставишь")
    .replace(/ты имеет/gi, "ты имеешь")
    .replace(/ты оста[её]тся/gi, "ты остаёшься")
    .replace(/весь стек ты/gi, "весь твой стек")
    .replace(/Эффективный стек ты/gi, "Твой эффективный стек")
    .replace(/ICM-риск ты/gi, "твой ICM-риск")
    .replace(/к ожидание по фишкам/gi, "к ожиданию по фишкам")
    .replace(/оставляет ты/gi, "оставляет тебя")
    .replace(/покрывает ты/gi, "покрывает тебя")
    .replace(/против ты/gi, "против тебя")
    .replace(/(^|\s)для ты(?=\s|[,.!?;:]|$)/gi, "$1для тебя")
    .replace(/(^|\s)у ты(?=\s|[,.!?;:]|$)/gi, "$1у тебя")
    .replace(/(^|\s)с ты(?=\s|[,.!?;:]|$)/gi, "$1с тобой")
    .replace(/(^|\s)от ты(?=\s|[,.!?;:]|$)/gi, "$1от тебя")
    .replace(/(^|\s)к ты(?=\s|[,.!?;:]|$)/gi, "$1к тебе")
    .replace(/покрытого ты/gi, "тебя, когда твой стек покрывают")
    .replace(/покрывающего ты/gi, "соперника, который покрывает тебя")
    .replace(/пушит в ты/gi, "ставит олл-ин против тебя")
    .replace(/его турниром/gi, "твоим турниром")
    .replace(/Что происходит с твоим турниром\?/gi, "Что происходит дальше?")
    .replace(/^Он вылетает/gi, "Ты вылетаешь")
    .replace(/^Он получает/gi, "Ты получаешь")
    .replace(/Ты покрыт и рискует/gi, "Ты покрыт и рискуешь")
    .replace(/на (\d+) игроков столе/gi, "за столом на $1 игроков")
    .replace(/^Какое лучшее действие на месте ты\s*/i, "Как лучше сыграть ")
    .replace(/^Какое лучшее действие на месте Игрок(?:а)?\s*/i, "Как лучше сыграть ")
    .replace(/^Как мы хотим играть на месте ([A-Z0-9+]+)\?$/i, "Как лучше сыграть на $1?")
    .replace(/^Выбери(?:те)? ветку, в которой вы хотите оказаться\.?$/i, "Выбери линию для этой руки.")
    .replace(/^Выберите ветку, в которую хотите отправить свою руку\.?$/i, "Выбери линию для этой руки.")
    .replace(/^Выберите правильное действие/i, "Выбери лучшее действие")
    .replace(/^Выберите лучшее действие/i, "Выбери лучшее действие")
    .replace(/^Выберите действие/i, "Выбери действие")
    .replace(/Выберите/gi, "выбери")
    .replace(/Выбирайте/gi, "выбирай")
    .replace(/Посмотрите/gi, "посмотри")
    .replace(/Вспомните/gi, "вспомни")
    .replace(/Не бойтесь/gi, "не бойся")
    .replace(/Играйте/gi, "играй")
    .replace(/Используйте/gi, "используй")
    .replace(/Предположите/gi, "оцени")
    .replace(/Подумайте/gi, "подумай")
    .replace(/Возможно,\s*вы\s+подумали/gi, "Возможно, ты решил")
    .replace(/которые\s+вы\s+сможете\s+изучить\s+в\s+дальнейшем/gi, "которые разберёшь позже")
    .replace(/вы\s+хотите/gi, "ты хочешь")
    .replace(/вы\s+сможете/gi, "ты сможешь")
    .replace(/вы\s+можете/gi, "можешь")
    .replace(/У\s+вас/gi, "У тебя")
    .replace(/фолдите\s+сразу/gi, "сразу сдавайся")
    .replace(/можете\s+чек-колить/gi, "можешь сыграть чек-колл")
    .replace(/можете/gi, "можешь")
    .replace(/сможете/gi, "сможешь")
    .replace(/фолдите/gi, "сдавайся")
    .replace(/не\s+сдавайтесь\s+всегда/gi, "не сдавайся автоматически")
    .replace(/не\s+сдавайтесь/gi, "не сдавайся")
    .replace(/сдавайтесь/gi, "сдавайся")
    .replace(/может\s+иметь\s+место\s+быть/gi, "иногда допустим")
    .replace(/может\s+иметь\s+место/gi, "иногда допустим")
    .replace(/которые\s+ты\s+сможешь\s+изучить\s+в\s+дальнейшем/gi, "которые разберёшь позже")
    .replace(/ран-ауу\s+тебя/gi, "карты продолжения")
    .replace(/кару\s+тебя/gi, "карты")
    .replace(/решеним/gi, "решением")
    .replace(/можно\s+усилится/gi, "можно усилиться")
    .replace(/с\s+позицийй/gi, "с позиции")
    .replace(/заколил/gi, "заколлировал")
    .replace(/наши\s+дрова\s+не\s+закрылись/gi, "наше дро не закрылось")
    .replace(/свободной\s+позы/gi, "свободной позиции")
    .replace(/вэлью\s+рукой/gi, "вэлью-рукой")
    .replace(/любая\s+дама\s+нас\s+не\s+устраивает/gi, "остальные дамы нас не устраивают")
    .replace(/сыграть\s+чек-колл\s+даже\s+большую\s+ставку/gi, "сыграть чек-колл даже против крупной ставки")
    .replace(/^Всё\s+верно[!.,:;–—-]*\s*/i, "")
    .replace(/нижней\s+границей\s+Здесь/gi, "нижней границей диапазона здесь")
    .replace(/поэтому\s+Здесь(?=$|[^\p{L}\p{N}_])/gu, "поэтому здесь")
    .replace(/([A-Za-zА-Яа-яЁё0-9)])\s+Здесь\b/g, "$1 здесь")
    .replace(/пас\s+Здесь\s*$/gi, "пас. Здесь.")
    .replace(/(?<![\p{L}\p{N}_])поделать\s+(?=продолженную\s+ставку)/giu, "сделать ")
    .replace(/На\s+крупную\s+ставку\s+тёрне/gi, "На крупную ставку на тёрне")
    .replace(/мы\s+не\s+хотим\s+([^,.!?]+),\s+а\s+играть/gi, "мы не хотим $1, а хотим играть")
    .replace(/,\s*но\s+мы\s+можем\s+добавить\s+0,5\s+блайнда\s+и\s+посмотреть\s+флоп,\s*но\s+на\s+постфлопе\s+играем\s+аккуратно\s+и\s+не\s+телефоним\s+с\s+топпарой\s+в\s+мультипоте/gi, ". Добавляем 0,5 BB и смотрим флоп. На постфлопе играем аккуратно и не переоцениваем топ-пару в мультипоте")
    .replace(/,\s*но\s+мы\s+можем\s+добавить\s+0,5\s+блайнда\s+и\s+посмотреть\s+флоп/gi, ". Добавляем 0,5 BB и смотрим флоп")
    .replace(/низ\s+изолейта\s+будет\s+/gi, "нижняя граница изолейта — ")
    .replace(/\(также\s+говорят\s+«ранауты»\)/gi, "")
    .replace(/при\s+хороших\s+ранаутах\s+на\s+тёрне/gi, "на подходящих картах тёрна")
    .replace(/мы\s+можем\s+поделать\s+продолженную\s+ставку\s+тёрна/gi, "можем сделать продолженную ставку на тёрне")
    .replace(/мы\s+можем\s+поделать\s+продолженную\s+ставку/gi, "можем сделать продолженную ставку")
    .replace(/продолженную\s+ставку\s+тёрна/gi, "продолженную ставку на тёрне")
    .replace(/топ\s+пар(?=$|[^\p{L}\p{N}_])/giu, "топ-пар")
    .replace(/позиции,\s+Сверь/gu, "позиции. Сверь")
    .replace(/с\s+позициий(?=\s+[A-ZА-Я])/gu, "с позиции")
    .replace(/ставить\s+ставку\s+продолжения/gi, "делать продолженную ставку")
    .replace(/более\s+крупным\s+размером\s+ставки/gi, "крупным размером")
    .replace(/крупным\s+размером\s+ставки/gi, "крупным размером")
    .replace(/топ-пара\s+топ-кикер/gi, "топ-пара с топ-кикером")
    .replace(/Безусловно\s+мы/gi, "Безусловно, мы")
    .replace(/\)\s+мы\s+хотим\s+получить\s+оплату/gi, "), и мы хотим получить оплату")
    .replace(/Хотя\s+у\s+нас\s+нет\s+совпадений,\s+но\s+есть/gi, "У нас нет готовой пары, зато есть")
    .replace(/Хотя\s+такой\s+доске/gi, "Хотя на такой доске")
    .replace(/что\s+даёт\s+нам\s+аутов/gi, "что даёт нам много аутов")
    .replace(/что\s+даёт\s+нам\s+много\s+аутов,\s+по\s+которым\s+мы\s+сможем\s+продолжать\s+ставить\s+на\s+следующих\s+улицах/gi, "это даёт много подходящих карт тёрна, на которых можно продолжить ставить")
    .replace(/у\s+нас\s+не\s+рука\s+для\s+вэлью/gi, "это не вэлью-рука")
    .replace(/не\s+стоит\s+так\s+как/gi, "не стоит, так как")
    .replace(/у\s+нас\s+не\s+сильная\s+рука/gi, "у нас недостаточно сильная рука")
    .replace(/доска\s+очень\s+дровяная/gi, "доска очень динамичная")
    .replace(/комбинаций\s+дров/gi, "дро-комбинаций")
    .replace(/Кроме\s+того\s+(?!,)/gi, "Кроме того, ")
    .replace(/например\s+если/gi, "например, если")
    .replace(/если\s+(?:поедут|откроются)\s+наши\s+дро-комбинации\s+в\s+виде\s+флеш-дро\s+или\s+стрит-дро/gi, "если на тёрне откроется флеш-дро или стрит-дро")
    .replace(/будет\s+лучший(?=$|[^\p{L}\p{N}_])/giu, "будет лучшим")
    .replace(/будет\s+лучшая(?=$|[^\p{L}\p{N}_])/giu, "будет лучшей")
    .replace(/правильным\s+действие(?=$|[^\p{L}\p{N}_])/giu, "правильным действием")
    .replace(/негрубая/gi, "не грубая")
    .replace(/изолейт\s+за\s+размер/gi, "изолейт размером")
    .replace(/^\s*[—–-]\s*/u, "")
    .replace(/Сыграв\s+большую\s+ставку\s+с\s+([^,.!?]+)\s+на\s+этой\s+доске\s+и\s+получив\s+рейз,\s+будет\s+ошибкой\s+дальше\s+играть\s+(?:ре)?рейз/gi, "После крупной ставки с $1 на этой доске и рейза соперника продолжать повышать будет ошибкой")
    .replace(/;\s+здесь\s+лучше/gi, ". Здесь лучше")
    .replace(/От\s+чека\s+будет\s+лучше\s+сыграть\s+другие\s+руки/gi, "Чек лучше оставить для других рук")
    .replace(/Для\s+бета\s+(\d+(?:[.,]\d+)?\s*%)/gi, "Для ставки $1")
    .replace(/AKs\s*-\s*слишком/gi, "AKs — слишком")
    .replace(/сильная\s+рука\s+и\s+мы/gi, "сильная рука, и мы")
    .replace(/банк\s+играя\s+4-бет/gi, "банк, играя 4-бет")
    .replace(/руки\s+[—–-]\s+/gi, "руки: ")
    .replace(/Посмотри\s+еще\s+раз/gi, "Посмотри ещё раз")
    .replace(/(?<![\p{L}\p{N}_])ее(?=$|[^\p{L}\p{N}_])/giu, "её")
    .replace(/“([^”\n]{1,160})”/g, "«$1»")
    .replace(/для\s+защиты\s+нашей\s+руки,\s+и\s+чтобы\s+не\s+дать/gi, "для защиты нашей руки, чтобы не дать")
    .replace(/ставим\s+в\s+протект,?\s+для\s+защиты\s+нашей\s+руки\s+и\s+не\s+дать\s+бесплатно\s+посмотреть\s+сопернику\s+последующие\s+улицы/gi, "ставим для защиты руки, чтобы не дать сопернику бесплатно увидеть следующие улицы")
    .replace(/крупнее,\s+чем\s+50\s*%\s+тоже/gi, "крупнее, чем 50 %, тоже")
    .replace(/на\s+флопе\s+или\s+терне/gi, "на флопе или тёрне")
    .replace(/не\s+самым\s+лучшим/gi, "не лучшим")
    .replace(/например\s*:/gi, "например,")
    .replace(/поле\s+очень\s+редко\s+играет\s+3-бет\s+ран(?:иие|ние)\s+позиции\s+в\s+блеф/gi, "поле очень редко 3-бетит в блеф против ранних позиций")
    .replace(/поле\s+очень\s+редко\s+играет\s+3-бет\s+в\s+блеф\s+ран(?:иие|ние)\/средние\s+позиции/gi, "поле очень редко 3-бетит в блеф против ранних и средних позиций")
    .replace(/Префлоп\s+действие/gi, "На префлопе действие")
    .replace(/Шестерки/gi, "Шестёрки")
    .replace(/(?<![\p{L}\p{N}_])идет(?=$|[^\p{L}\p{N}_])/giu, "идёт")
    .replace(/шире\s+EP,\s+но\s+уже\s+BTN/gi, "шире диапазона EP, но уже диапазона BTN")
    .replace(/Повторите/gi, "Повтори")
    .replace(/Запомните/gi, "Запомни")
    .replace(/получить\s+оплату\s+здесь\s+и\s+сейчас\s+топ-пар\s+младше/gi, "получить оплату здесь и сейчас от более слабых топ-пар")
    .replace(/будет\s+лучшим,\s+часто\s+мы\s+хотим/gi, "будет лучшим: мы хотим")
    .replace(/мелкий\s+размер\s+тоже\s+выбирать\s+не\s+лучший\s+выбор/gi, "небольшой размер тоже не лучший")
    .replace(/раниие\/средние\s+позиции/gi, "ранние и средние позиции")
    .replace(/соответственноте\s+у\s+нас/gi, "соответственно, у нас")
    .replace(/крестов(?:ыми|ые)\s+картами/gi, "трефовыми картами")
    .replace(/крестовых\s+карт/gi, "трефовых карт")
    .replace(/Выбери\s+лучшее\s+действие\s+для\s+тебя[.!?]*/gi, "Как сыграть?")
    .replace(/правильной\s+опцией\s+будет\s+чекать\s+и\s+выходить\s+на\s+постфлоп/gi, "лучше сыграть чек и перейти на постфлоп")
    .replace(/^Ты\s+Рейз\s+(\d+(?:[.,]\d+)?\s*BB)\s*·\s*([A-Z0-9+]+)\s+3-бет\s+(\d+(?:[.,]\d+)?\s*BB)\.\s*Ты\s+на\s+([A-Z0-9+]+)\s+с\s+(.+?)\s+и\s+стеком\s+(.+?)\.\s*Как\s+сыграть\?$/i, "Ты открыл до $1 с $4, $2 сделал 3-бет до $3. Как сыграть с $5 при стеке $6?")
    .replace(/карты\s+одинаковой\s+ценности/gi, "карты одного достоинства")
    .replace(/реализуются\s+не\s+часто/gi, "реализуются реже")
    .replace(/с\s+позиции\s+(BTN|SB|BB|CO|HJ|MP|UTG(?:\+\d)?)/g, "с $1")
    .replace(/На\s+начальном\s+этапе\s+здесь/gi, "Здесь")
    .replace(/На\s+вэлью\s+здесь/gi, "Для вэлью здесь")
    .replace(/\bДля\s+Рейза\b/g, "Для рейза")
    .replace(/\bдальше\s+играть\s+рейз\b/gi, "повышать повторно")
    .replace(/мы\s+бы\s+уже\s+играли\s+фолд/gi, "мы бы уже пасовали")
    .replace(/мы\s+бы\s+играли\s+фолд/gi, "мы бы пасовали")
    .replace(/мы\s+играем\s+фолд/gi, "мы пасуем")
    .replace(/хотим\s+играть\s+фолд/gi, "хотим пасовать")
    .replace(/играть\s+фолд/gi, "пасовать")
    .replace(/(^|[^\p{L}])фолд(?=$|[^\p{L}-])/giu, "$1пас")
    .replace(/\bC(?=\s+[2-9TJQKA]{2}\b)/g, "С")
    .replace(/из-за\s+баббл(?=\s|[,.!?]|$)/gi, "из-за баббла")
    .replace(/после\s+лопнувшего\s+баббл(?=\s|[,.!?]|$)/gi, "после завершения баббла")
    .replace(/^Не\s+совсем\s+верно[!.,:;–—-]*\s*/i, "")
    .replace(/^(?:Это\s+)?не\s+совсем\s+верно[!.,:;–—-]*\s*/i, "")
    .replace(/не\s+совсем\s+верно/gi, "не лучший выбор")
    .replace(/^Подумай\s+хорошо\s*[!.,:;–—-]*\s*/i, "")
    .replace(/^Да,\s+/i, "")
    .replace(/\s*Посмотри\s+ещё\s+раз\s+чарты[.!?]*/gi, " Сверь позицию, стек и предшествующий экшен с подходящим чартом.")
    .replace(/^Правильный\s+ответ\s*[—–:;-]?\s*/i, "")
    .replace(/(?:Поэтому\s+)?правильный\s+ответ\s*[—–:;-]\s*/gi, "Здесь ")
    .replace(/Пас\s*[—–-]\s*правильное\s+решение\s+в\s+этой\s+ситуации/gi, "Здесь лучше пас")
    .replace(/будет\s+правильной\s+опцией/gi, "будет лучшим выбором")
    .replace(/самой\s+лучшей/gi, "лучшей")
    .replace(/самая\s+лучшая/gi, "лучшая")
    .replace(/самый\s+лучший/gi, "лучший")
    .replace(/самое\s+лучшее/gi, "лучшее")
    .replace(/лучший\s+розыгрышем/gi, "лучшим розыгрышем")
    .replace(/В\s+данном\s+примере/gi, "Здесь")
    .replace(/на\s+данной\s+структуре/gi, "на этой доске")
    .replace(/С\s+данной\s+рукой/gi, "С этой рукой")
    .replace(/на\s+начальном\s+этапе/gi, "в начале обучения")
    .replace(/топ\s+пару/gi, "топ-пару")
    .replace(/топ\s+пара/gi, "топ-пара")
    .replace(/топ-пару\s+топ-кикер/gi, "топ-пару с топ-кикером")
    .replace(/флеш\s+дро/gi, "флеш-дро")
    .replace(/не\s+вэлью\s+рука/gi, "не рука для вэлью")
    .replace(/с\s+вэлью\s+руками/gi, "с руками для вэлью")
    .replace(/вэлью\s+руками/gi, "руками для вэлью")
    .replace(/ран-ауты/gi, "карты ривера")
    .replace(/рейз\s*\(рейз\)/gi, "рейз")
    .replace(/колл\s*\(колл\)/gi, "колл")
    .replace(/олл-ин\s*\(олл-ин\)/gi, "олл-ин")
    .replace(/и\s+тд(?=$|[^\p{L}])/giu, "и так далее")
    .replace(/является\s+низом\s+диапазона/gi, "является нижней границей диапазона")
    .replace(/был\s+бы\s+низ\s+нашего\s+диапазона/gi, "был бы нижней границей нашего диапазона")
    .replace(/играются\s+через\s+колл/gi, "разыгрываются коллом")
    .replace(/играется\s+через\s+колл/gi, "разыгрывается коллом")
    .replace(/играются\s+через\s+пас/gi, "разыгрываются пасом")
    .replace(/играется\s+через\s+пас/gi, "разыгрывается пасом")
    .replace(/Выбери\s+правильное\s+действие\s+с\s+нашей\s+рукой[.!?]*/gi, "Как лучше сыграть эту руку?")
    .replace(/в\s+(\d+(?:[.,]\d+)?)\s+BB\s+эффективном\s+стеке/gi, "при эффективном стеке $1 BB")
    .replace(/в\s+50\s+BB\s+стеках\s+и\s+больше/gi, "в стеках 50 BB и глубже")
    .replace(/в\s+50\s+BB\s+стеках/gi, "в стеках 50 BB")
    .replace(/продолженную\s+ставку\s+флопа/gi, "продолженную ставку на флопе")
    .replace(/делать\s+продолженную\s+ставку\s+за\s+мелкий\s+размер/gi, "делать небольшую продолженную ставку")
    .replace(/делать\s+продолженную\s+ставку\s+за\s+небольшой\s+размер/gi, "делать небольшую продолженную ставку")
    .replace(/(изолейт(?:а)?|3-бет|контбет)\s+за\s+(мелкий|небольшой|средний|крупный|увеличенный|стандартный|обычный)\s+размер/gi, function (_match, noun, adjective) {
      const genitive = {
        мелкий: "небольшого",
        небольшой: "небольшого",
        средний: "среднего",
        крупный: "крупного",
        увеличенный: "увеличенного",
        стандартный: "стандартного",
        обычный: "обычного"
      }[adjective.toLowerCase()];
      return `${noun} ${genitive} размера`;
    })
    .replace(/изолить\s+за\s+(мелкий|небольшой|средний|крупный|увеличенный|стандартный|обычный)\s+размер/gi, function (_match, adjective) {
      const genitive = {
        мелкий: "небольшого",
        небольшой: "небольшого",
        средний: "среднего",
        крупный: "крупного",
        увеличенный: "увеличенного",
        стандартный: "стандартного",
        обычный: "обычного"
      }[adjective.toLowerCase()];
      return `сделать изолейт ${genitive} размера`;
    })
    .replace(/изолим\s+за\s+(мелкий|небольшой|средний|крупный|увеличенный|стандартный|обычный)\s+размер/gi, function (_match, adjective) {
      const genitive = {
        мелкий: "небольшого",
        небольшой: "небольшого",
        средний: "среднего",
        крупный: "крупного",
        увеличенный: "увеличенного",
        стандартный: "стандартного",
        обычный: "обычного"
      }[adjective.toLowerCase()];
      return `делаем изолейт ${genitive} размера`;
    })
    .replace(/за\s+(мелкий|небольшой|средний|крупный|увеличенный|стандартный|обычный)\s+размер/gi, function (_match, adjective) {
      const instrumental = {
        мелкий: "небольшим",
        небольшой: "небольшим",
        средний: "средним",
        крупный: "крупным",
        увеличенный: "увеличенным",
        стандартный: "стандартным",
        обычный: "обычным"
      }[adjective.toLowerCase()];
      return `${instrumental} размером`;
    })
    .replace(/по\s+хорошим\s+ранаутам/gi, "на подходящих картах продолжения")
    .replace(/чек-колить/gi, "играть чек-колл")
    .replace(/не\s+является\s+является/gi, "не является")
    .replace(/На\s+чекайте/gi, "Не чекай")
    .replace(/Не\s+чекайте/gi, "Не чекай")
    .replace(/[СC]\s+cильной/gi, "С сильной")
    .replace(/олл-ина\s+Здесь/gi, "олл-ина здесь")
    .replace(/дают\s+полезнее\s+маршрут/gi, "дают более полезный маршрут")
    .replace(/ставьте/gi, "ставь")
    .replace(/делайте/gi, "делай")
    .replace(/не рассматривайте/gi, "не рассматривай")
    .replace(/Давайте посчитаем/gi, "Посчитаем")
    .replace(/оппонентами/gi, "соперниками")
    .replace(/оппонентов/gi, "соперников")
    .replace(/оппонентам/gi, "соперникам")
    .replace(/оппонента/gi, "соперника")
    .replace(/оппоненту/gi, "сопернику")
    .replace(/оппоненты/gi, "соперники")
    .replace(/оппонент/gi, "соперник")
    .replace(/в\s+данном\s+споте/gi, "в этой ситуации")
    .replace(/в\s+данном\s+случае/gi, "здесь")
    .replace(/на\s+данном\s+этапе(?:\s+обучения)?/gi, "сейчас")
    .replace(/в\s+данной\s+раздаче/gi, "в этой раздаче")
    .replace(/на\s+позиции\s+(BTN|SB|BB|CO|HJ|MP|UTG(?:\+\d)?)/g, "на $1")
    .replace(/([A-Z2-9]{2}[so]?)\s+является\s+низом\s+нашего\s+диапазона/gi, "$1 — нижняя граница нашего диапазона")
    .replace(/сайзинга/gi, "размера ставки")
    .replace(/сайзингом/gi, "размером ставки")
    .replace(/сайзинги/gi, "размеры ставок")
    .replace(/сайзинга/gi, "размера ставки")
    .replace(/сайзом/gi, "размером")
    .replace(/сайза/gi, "размера")
    .replace(/сайзы/gi, "размеры")
    .replace(/сайзе/gi, "размере")
    .replace(/сайз/gi, "размер")
    .replace(/велью/gi, "вэлью")
    .replace(/ставить\s+сбет/gi, "делать продолженную ставку")
    .replace(/размер\s+сбета/gi, "размер продолженной ставки")
    .replace(/защищаться\s+на\s+сбеты/gi, "защищаться против продолженных ставок")
    .replace(/сбеты/gi, "продолженные ставки")
    .replace(/сбета/gi, "продолженной ставки")
    .replace(/сбет/gi, "контбет")
    .replace(/c[ -]?bet/gi, "контбет")
    .replace(/3\s*бет/gi, "3-бет")
    .replace(/4\s*бет/gi, "4-бет")
    .replace(/опен\s*рейз/gi, "опен-рейз")
    .replace(/колд[ -]?колл/gi, "колл")
    .replace(/рейндж|ренж/gi, "диапазон")
    .replace(/RFI\s*\/\s*call/gi, "диапазон колла после своего рейза")
    .replace(/RFI\s*\/\s*push/gi, "диапазон рестила")
    .replace(/\bRFI\b/g, "первый рейз")
    .replace(/\bvs\s+AI\b/gi, "против олл-ина")
    .replace(/hero[ -]?call/gi, "автоматический колл")
    .replace(/мы\s+хотим\s+играть\s+через\s+/gi, "здесь играем ")
    .replace(/более\s+оптимально/gi, "лучше")
    .replace(/более\s+оптимальн(?:ый|ое|ым|ого|ому)/gi, "лучший")
    .replace(/сам(?:ое|ый)\s+оптимальн(?:ое|ый)/gi, "лучшее")
    .replace(/лучший действием/gi, "лучшим действием")
    .replace(/лучший вариантом/gi, "лучшим вариантом")
    .replace(/ставь увеличенный размер 3-бета/gi, "используй увеличенный размер 3-бета")
    .replace(/редко играет 3-бет в блеф ранние позиции/gi, "редко 3-бетит ранние позиции в блеф")
    .replace(/В данной ситуации/gi, "Здесь")
    .replace(/в данной ситуации/gi, "здесь")
    .replace(/двухсторонн/gi, "двусторонн")
    .replace(/кеш-/gi, "кэш-")
    .replace(/min[ -]?рейз/gi, "мин-рейз")
    .replace(/обычном\s+фризаут\s+MTT/gi, "обычном фризаут-турнире")
    .replace(/\bMTT\b/g, "турнир")
    .replace(/В сателлит(?=\s)/g, "В сателлите")
    .replace(/в сателлит(?=\s)/g, "в сателлите")
    .replace(/В фризаут нет/g, "Во фризауте нет")
    .replace(/в фризаут нет/g, "во фризауте нет")
    .replace(/на баббл(?=\s|[,.!?])/gi, "на баббле")
    .replace(/до баббл(?=\s|[,.!?])/gi, "до баббла")
    .replace(/до скачок выплат/gi, "до скачка выплат")
    .replace(/к реальным скачок выплат/gi, "к реальным скачкам выплат")
    .replace(/маргинального колл(?![а-яё])/gi, "маргинального колла")
    .replace(/колл должен быть заметно сильнее ожидание по фишкам/gi, "для колла нужна заметно более сильная рука, чем в расчёте только по фишкам")
    .replace(/турнир с тайными баунти-фазы/gi, "фазы тайных баунти")
    .replace(/турнир с тайными баунти турнир/gi, "турнир с тайными баунти")
    .replace(/До старта фазы тайных баунти/gi, "До начала фазы тайных баунти")
    .replace(/тайный-конверт/gi, "тайный конверт")
    .replace(/фолдить/gi, "сбрасывать")
    .replace(/коллировать\s+любые\s+две/gi, "коллировать с любыми двумя картами")
    .replace(/\bББ\b/g, "BB")
    .replace(/(\d+)\+ББ/gi, "$1+ BB")
    .replace(/(\d)\+\s*BB\b/gi, "$1+ BB")
    .replace(/QTs\.\s+KQo/g, "QTs, KQo")
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .replace(/\(?7\s*\/\s*\(10\s*\+\s*7\s*\*\s*2\)\)?\s*\*\s*100\s*=\s*29,1\s*%/gi, "7 / (10 + 2 × 7) = 29,2 %")
    .replace(/\(\(?13\s*\/\s*46\)?\s*\*\s*100\s*=\s*28,2\s*%/gi, "13 / 46 = 28,3 %")
    .replace(/"([^"\n]{1,160})"/g, "«$1»")
    .replace(/2\+\s+лимперов/gi, "двух и более лимперов")
    .replace(/(?:Диапазон|Чарт)[^.?!]*(?:вы можете|можете посмотреть)\s*[.!?]*$/i, "")
    .replace(/^(?:Молодец,?\s+это\s+лучший\s+вариант|Молодец|Правильно|Верно|Хорошо|В точку|Так точно)\s*[!.,:;–—-]*\s*/i, "")
    .replace(/^Это\s+(?:лучшее\s+решение|лучший\s+вариант)\s*[!.,:;–—-]*\s*/i, "")
    .replace(/^(?:Это\s+)?(?:неправильный ответ|Неправильно|Неверно|Ответ неверный|Ответ неправильный|Не лучший вариант|Не совсем правильно|Это не совсем правильно|Не совсем так|Близко, но нет)\s*[!.,:;–—-]*\s*/i, "")
    .replace(/(\d+(?:[.,]\d+)?|[AKQJT2-9]{2}[so]?)-(\d+(?:[.,]\d+)?|[AKQJT2-9]{2}[so]?)/g, "$1–$2")
    .replace(/(\d)%/g, "$1 %")
    .replace(/у\s+нас\s+не\s+рука\s+для\s+вэлью/gi, "это не вэлью-рука")
    .replace(/у\s+нас\s+не\s+сильная\s+рука/gi, "у нас недостаточно сильная рука")
    .replace(/Хотя\s+([^.!?]+?),\s+но\s+/gi, "$1, но ")
    .replace(/с\s+сильным\s+вэлью/gi, "с сильной вэлью-рукой")
    .replace(/у\s+нас\s+среднее\s+вэлью/gi, "у нас рука средней силы")
    .replace(/у\s+нас\s+всё\s+же\s+среднее\s+вэлью/gi, "наша рука всё же достаточно сильна для вэлью")
    .replace(/дров\s+хоть\s+и\s+немного/gi, "дро-комбинаций хоть и немного")
    .replace(/В\s+такую\s+доску/gi, "На такой доске")
    .replace(/На\s+такой\s+доске\s+мы\s+всегда\s+хотим\s+ставить\s+со\s+всем\s+диапазоном\s+небольшим\s+размером\s+и\s+наша\s+рука\s+не\s+исключение/gi, "На такой доске ставим небольшим размером со всем диапазоном; эта рука не исключение")
    .replace(/На\s+такой\s+доске\s+мы\s+всегда\s+хотим\s+ставить\s+со\s+всем\s+диапазоном\s+и\s+наша\s+рука\s+не\s+исключение,\s+но\s+небольшим\s+размером/gi, "На такой доске ставим небольшим размером со всем диапазоном; эта рука не исключение")
    .replace(/Мелкий\s+размер\s+будет\s+здесь\s+лучшим,\s+с\s+нашей\s+рукой/gi, "Небольшой размер здесь лучший. С этой рукой")
    .replace(/33\s*%\s+будет\s+лучшим\s+размером\s+ставки/gi, "ставка 33 % будет оптимальной")
    .replace(/при\s+том\s+увеличенным\s+размером/gi, "притом увеличенным размером")
    .replace(/топ-парой\s+топ-кикером/gi, "топ-парой с топ-кикером")
    .replace(/Чтобы\s+собрать\s+одну\s+пару\s+нам/gi, "Чтобы собрать одну пару, нам")
    .replace(/только\s+три\s+\(А\)/gi, "только три туза")
    .replace(/Kх/g, "Kx")
    .replace(/,\s*тем более за олл-ин,\s*поэтому/gi, ". Олл-ин тем более не подходит, поэтому")
    .replace(/изолить с ней за более крупный размер/gi, "сделать с ней изолейт более крупного размера")
    .replace(/с позиций (EP\+\d)/g, "с позиции $1")
    .replace(/Какой диапазон рук ставим олл-ин/gi, "С каким диапазоном рук мы ставим олл-ин")
    .replace(/размер будет здесь лучший/gi, "размер будет здесь лучшим")
    .replace(/также как и/gi, "так же, как и")
    .replace(/Здесь с ([AKQJT2-9]{2}[so]?) здесь/gi, "Здесь с $1")
    .replace(/\b([AKQJT2-9]{2}[so]?) разыгрываются/gi, "$1 разыгрывается")
    .replace(/в 3-бет поте/gi, "в 3-бет-поте")
    .replace(/, какой у нас диапазон/gi, ". Какой у нас диапазон")
    .replace(/на (BB|BTN), против/gi, "на $1 против")
    .replace(/входит в диапазон изолейта на BTN и мы хотим/gi, "входит в диапазон изолейта на BTN, и мы хотим")
    .replace(/пушится только с этих позиций, также мы пушим/gi, "пушится только с этих позиций. Также мы пушим")
    .replace(/лимперов, (JTo|98s) мы/gi, "лимперов. $1 мы")
    .replace(/средних позициях, граница/gi, "средних позициях: граница")
    .replace(/Ответ неточный, ([AKQJT2-9]{2}[so]?)/gi, "Ответ неточный: $1")
    .replace(/со слабой рукой без хороших шансов/gi, "со слабой рукой и без хороших шансов")
    .replace(/8 и 5, или 8 и 10/gi, "8 и 5 или 8 и 10")
    .replace(/4 карты одинаковой масти и нам/gi, "4 карты одинаковой масти, и нам")
    .replace(/QT, KQ выбивая/gi, "QT, KQ, выбивая")
    .replace(/(?<!^)(?<![.!?]\s)Здесь(?=$|[^\p{L}\p{N}_])/gu, "здесь")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([A-Za-zА-Яа-яЁё0-9)])\s+Здесь(?=$|[^\p{L}\p{N}_])/gu, "$1 здесь")
    .replace(/\s{2,}/g, " ")
    .trim();
  output = output.replace(/(^|[.!?]\s+)([а-яё])/g, function (_match, prefix, letter) {
    return `${prefix}${letter.toUpperCase()}`;
  });
  return output;
}

function conciseFeedback(value, maxLength = 460) {
  const normalized = text(value);
  if (normalized.length <= maxLength) return normalized;
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  let result = "";
  for (const sentence of sentences) {
    const candidate = `${result}${result ? " " : ""}${sentence.trim()}`;
    if (candidate.length > maxLength && result) break;
    result = candidate;
    if (result.length >= maxLength) break;
  }
  if (result.length > maxLength) {
    const clipped = result.slice(0, maxLength - 1);
    const boundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "), clipped.lastIndexOf(", "));
    result = `${clipped.slice(0, boundary > 180 ? boundary + 1 : maxLength - 1).trim()}…`;
  }
  return result;
}

function terminalCopy(value, mark = ".") {
  const normalized = text(value);
  return /[.!?…]$/u.test(normalized) ? normalized : `${normalized}${mark}`;
}

function publishedOptionLabel(value, fallback) {
  return editorialPolish(safeLearnerCopy(value, fallback))
    .replace(/^Фолд$/i, "Пас")
    .replace(/^Продолженная ставка\s+(\d+(?:[.,]\d+)?\s*%)$/i, "Ставка $1");
}

function publishedSpotTitle(value, lesson, index) {
  const fallback = `${lesson.title} · ситуация ${index + 1}`;
  const normalized = editorialPolish(safeLearnerCopy(value, fallback));
  return /^(?:Экзамен|Тест)[-\s]?\d+$/i.test(normalized) || /[?!]?[-–]\d+(?:[-–]\d+)*$/.test(normalized)
    ? fallback
    : normalized;
}

function safeLearnerCopy(value, fallback) {
  const normalized = text(value);
  const fallbackCopy = editorialPolish(localizedActionLabel(text(fallback)).replace(/\bHero\b/gi, "Игрок"));
  if (!normalized) return fallbackCopy;
  const translated = localizedActionLabel(normalized)
    .replace(/\bblind vs blind\b/gi, "игра блайнд против блайнда")
    .replace(/\bsuited\b/gi, "одномастные")
    .replace(/\boffsuit\b/gi, "разномастные")
    .replace(/\bedge\b/gi, "преимущество")
    .replace(/машин(?:а|е|ой|ы)/gi, "расчётная модель")
    .replace(/ГТОшн(?:ый|ая|ых|ые|ого|ому)/gi, "равновесный")
    .replace(/,?\s*колонк(?:а|е|и|у|ой)\s+\d+(?:[.,]\d+)?/gi, "")
    .replace(/в расч[её]те\s+расчётная модель/gi, "по расчётной модели")
    .replace(/по версии\s+расчётная модель/gi, "по расчётной модели")
    .replace(/если\s+расчётная модель\s+задать/gi, "если в расчёте разрешить")
    .replace(/расчётная модель\s+впипнет/gi, "диапазон продолжения станет")
    .replace(/с уч[её]том\s+будущее преимущество/gi, "с учётом будущего преимущества")
    .replace(/\([^)]*(?:иконк|картинк)[^)]*\)/gi, "")
    .replace(/\s*\(смотри\s+вложение\s+слева\)/gi, "")
    .replace(/(?:Ты\s+можешь\s+)?(?:посмотреть|увидеть)[^.?!]*(?:иконк|картинк)[^.?!]*[.?!]?/gi, "")
    .replace(/[^.?!]*видно\s+при\s+наведении[^.?!]*[.?!]?/gi, "")
    .replace(/\b(?:jam|shove)\s+all[- ]?in\b/gi, "олл-ин")
    .replace(/\ball[- ]?in\b/gi, "олл-ин")
    .replace(/\badd[- ]?on\b/gi, "адд-он")
    .replace(/\bc[- ]?bet\b/gi, "сбет")
    .replace(/([34])\s*[-‑–—]?\s*(?:bet|бет)/gi, "$1-бет")
    .replace(/(\d+(?:[.,]\d+)?)\s*[бБ][бБ](?![А-Яа-яЁё])/g, "$1 BB")
    .replace(/\bto(?=\s+\d)/gi, "до")
    .replace(/в\s+игра\s+блайнд\s+против\s+блайнда/gi, "в игре блайндов")
    .replace(/нужен\s+первым\s+входом/gi, "нужен для первого входа")
    .replace(/оупен[- ]?рейз/gi, "опен-рейз")
    .replace(/колд\s*колл/gi, "колд-колл")
    .replace(/мультивеях/gi, "мультипотах")
    .replace(/мультивея/gi, "мультипота")
    .replace(/мультивей/gi, "мультипот")
    .replace(/ренджи/gi, "диапазоны")
    .replace(/ренджа/gi, "диапазона")
    .replace(/ренжом/gi, "диапазоном")
    .replace(/ренжу/gi, "диапазону")
    .replace(/ренжа/gi, "диапазона")
    .replace(/ренж/gi, "диапазон")
    .replace(/хочет\s+впипнуть/gi, "хочет разыграть")
    .replace(/впипнет/gi, "войдёт в раздачу")
    .replace(/впипнуть/gi, "войти в раздачу")
    .replace(/впипа/gi, "входа в раздачу")
    .replace(/впип/gi, "вход в раздачу")
    .replace(/опенпуш/gi, "опен-пуш")
    .replace(/сплитит/gi, "делит")
    .replace(/2мя/gi, "двумя")
    .replace(/2х/gi, "двух")
    .replace(/т\.\s*к\./gi, "так как")
    .replace(/т\.\s*е\./gi, "то есть")
    .replace(/т\.\s*ч\./gi, "том числе")
    .replace(/с\s+с\s+/gi, "с ")
    .replace(/сфолдить/gi, "выбросить")
    .replace(/сфолдит/gi, "уйдёт в пас")
    .replace(/сфолдят/gi, "уйдут в пас")
    .replace(/денаим\s+эквити/gi, "не даём реализовать эквити")
    .replace(/отрициательн/gi, "отрицательн")
    .replace(/"залочить"\s+расчётная модель\s+диапазон/gi, "зафиксировать в расчёте диапазон")
    .replace(/по\s+десятой\s+линии/gi, "при этом")
    .replace(/солвер/gi, "расчётная модель")
    .replace(/расчётная модель\s+нажимает\s+здесь\s+колл/gi, "расчётная модель выбирает здесь колл")
    .replace(/выбирает\s+стратегию\s+колла\s+всем\s+диапазоном/gi, "выбирает колл всем диапазоном")
    .replace(/рейз-коллить/gi, "рейзить и коллировать")
    .replace(/рейз-коллит/gi, "рейзит и коллирует")
    .replace(/коллить/gi, "коллировать")
    .replace(/коллит/gi, "коллирует")
    .replace(/не\s+3-бетит/gi, "не играет 3-бет")
    .replace(/3-бетить/gi, "играть 3-бет")
    .replace(/3-бетит/gi, "играет 3-бет")
    .replace(/выбирает\s+колл\s+всем\s+диапазоном,\s+ничего\s+не\s+играет\s+3-бет\s+и\s+не\s+репушит/gi, "выбирает колл всем диапазоном, не используя 3-бет или репуш")
    .replace(/которых\s+покрывает\s+и\s+с\s+JTs,\s+в\s+том\s+числе,\s+коллирует\s+на\s+каждый\s+их\s+пуш\s+по\s+отдельности/gi, "которых покрывает, и с JTs коллирует каждый их пуш по отдельности")
    .replace(/при\s+прибыльности\s+колла\s+с\s+AA\s+в/gi, "при EV колла с AA около")
    .replace(/сайдпот/gi, "побочный банк")
    .replace(/в\s+слабом\s+лайнапе/gi, "за слабым столом")
    .replace(/при\s+слабом\s+лайнапе/gi, "против слабого состава")
    .replace(/лайнапе/gi, "составе стола")
    .replace(/ГТО\s+репуша/gi, "равновесного репуша")
    .replace(/ГТО\s+колла/gi, "равновесного колла")
    .replace(/прямым\s+ШБ/gi, "прямым шансам банка")
    .replace(/9й\s+уровень/gi, "девятый уровень")
    .replace(/попал\(а\)/gi, "попал")
    .replace(/меньше,\s*чем,\s*у/gi, "меньше, чем у")
    .replace(/её\s+EV\s+не\s+так\s+велико\s+\(([^)]+)\)\s+и\s+сильно\s+уступают/gi, "EV этой линии невелик ($1) и сильно уступает")
    .replace(/\s+c\s+(?=[A-Z0-9])/g, " с ")
    .replace(/Слишом/gi, "Слишком")
    .replace(/самое\s+оптимальное/gi, "лучшее")
    .replace(/самый\s+оптимальный/gi, "лучший")
    .replace(/самым\s+оптимальным/gi, "лучшим")
    .replace(/самая\s+оптимальная/gi, "лучшая")
    .replace(/самой\s+оптимальной/gi, "лучшей")
    .replace(/более\s+оптимальным\s+решением/gi, "лучшим решением")
    .replace(/топ\s+пара/gi, "топ-пара")
    .replace(/топ\s+пары/gi, "топ-пары")
    .replace(/топ\s+парой/gi, "топ-парой")
    .replace(/топ\s+кикер/gi, "топ-кикер")
    .replace(/хороший\s+шансы/gi, "хорошие шансы")
    .replace(/самым\s+оптимальным/gi, "оптимальным")
    .replace(/\s+-\s+/g, " — ")
    .replace(/олл-ин(?:\s+олл-ин)+/gi, "олл-ин")
    .replace(/\s*\(\s*\d+\s*балл(?:а|ов)?\s*\)\.?/gi, "")
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .replace(/(-?\d+(?:,\d+)?)\s*[-–—]\s*(-?\d+(?:,\d+)?)\s*\$/g, function (_match, from, to) {
      return `${from.startsWith("-") ? "−$" + from.slice(1) : "$" + from}–${to.startsWith("-") ? "−$" + to.slice(1) : "$" + to}`;
    })
    .replace(/(-?\d+(?:,\d+)?)\s*\$/g, function (_match, amount) {
      return amount.startsWith("-") ? `−$${amount.slice(1)}` : `$${amount}`;
    })
    .replace(/(^|[.!?]\s+)расчётная модель/g, function (_match, prefix) { return `${prefix}Расчётная модель`; })
    .replace(/\b(\d+(?:[.,]\d+)?)BB\b/gi, "$1 BB")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  const polished = editorialPolish(translated);
  return !polished || needsLocalization(polished) ? fallbackCopy : polished;
}

function labelForAction(action) {
  return localizedActionLabel(action);
}

function typeForAction(action) {
  if (/fold|пас/i.test(action)) return "fold";
  if (/call|limp|колл|лимп/i.test(action)) return "call";
  if (/check|чек/i.test(action)) return "check";
  if (/jam|push|all.?in|олл/i.test(action)) return "all-in";
  if (/raise|bet|open|three|four|iso|рейз|бет|став|изол/i.test(action)) return "raise";
  return "choice";
}

function isForcedBlindAction(row, heroPosition = "", fallbackStreet = "preflop") {
  const rowStreet = text(row?.street || fallbackStreet);
  if (rowStreet !== "preflop") return false;
  const rawActor = text(row?.actor || row?.position || row?.seat).toUpperCase();
  const actor = rawActor === "HERO" ? text(heroPosition).toUpperCase() : rawActor;
  const amount = number(row?.amountBb ?? row?.amount_bb, Number.NaN);
  return actor === "SB" && amount <= 0.5 || actor === "BB" && amount <= 1;
}

function actionLineFromRaw(raw, heroPosition = "") {
  const translateLine = (value) => {
    const translated = text(value)
      .replace(/\bdecision\b/gi, "решение")
      .replace(/\beveryone folds to\b/gi, "Все до")
      .replace(/\bfolds to\b/gi, "пас до")
      .replace(/\bopens\b/gi, "рейз")
      .replace(/\bopen\b/gi, "рейз")
      .replace(/\bshoves\b/gi, "олл-ин")
      .replace(/\bshove\b/gi, "олл-ин")
      .replace(/\ball[ -]?in\b/gi, "олл-ин")
      .replace(/\braises to\b/gi, "рейз до")
      .replace(/\braises\b/gi, "рейз")
      .replace(/\braise\b/gi, "рейз")
      .replace(/\bbets\b/gi, "ставка")
      .replace(/\bbet\b/gi, "ставка")
      .replace(/\bcalls\b/gi, "колл")
      .replace(/\bcall\b/gi, "колл")
      .replace(/\bchecks\b/gi, "чек")
      .replace(/\bcheck\b/gi, "чек")
      .replace(/\bfolds\b/gi, "пас")
      .replace(/\bfold\b/gi, "пас")
      .replace(/\blimps\b/gi, "лимп")
      .replace(/\blimp\b/gi, "лимп")
      .replace(/\bHero is\b/gi, "Ты на")
      .replace(/\bHero\b/gi, "Ты")
      .replace(/\bwith\b/gi, "со стеком")
      .replace(/\band\b/gi, "и");
    return needsLocalization(translated) ? "" : translated;
  };
  if (Array.isArray(raw?.table?.actionLine)) return raw.table.actionLine.map(translateLine).filter(Boolean);
  if (Array.isArray(raw?.actionLine)) return raw.actionLine.map(translateLine).filter(Boolean);
  if (Array.isArray(raw?.branch) && raw.branch.length) {
    return raw.branch
      .filter((line) => !/\bdecision\b/i.test(text(line)))
      .map(translateLine)
      .filter(Boolean);
  }
  if (raw?.openerGroup === "sb_limp"
    || raw?.openerPosition === "SB" && number(raw?.openSizeBb) === 1
    || /SB\s+limp/i.test(text(raw?.opener))
    || /SB\s+limps/i.test(text(raw?.tableState))) {
    return ["SB лимп 1 BB"];
  }
  if (text(raw?.tableState)) {
    const line = translateLine(raw.tableState);
    return line ? [line] : [];
  }
  const rows = Array.isArray(raw?.actions) ? raw.actions : [];
  let visibleRows = rows;
  if (raw?.mode === "attack_vs_open") {
    const heroIndex = rows.findIndex((row) => {
      const actor = text(row.actor || row.position || row.seat).toUpperCase();
      return actor === "HERO" || actor === text(heroPosition).toUpperCase();
    });
    visibleRows = heroIndex >= 0 ? rows.slice(0, heroIndex) : rows;
  }
  if (raw?.mode === "defend_vs_3bet") {
    const raises = rows.filter((row) => /bet|raise|all.?in/i.test(text(row.type || row.action)) && !isForcedBlindAction(row, heroPosition, "preflop"));
    return raises.map((row, index) => {
      const rawActor = text(row.actor || row.position || row.seat);
      const actor = /^HERO$/i.test(rawActor) || rawActor.toUpperCase() === text(heroPosition).toUpperCase() ? "Ты" : rawActor;
      const amount = number(row.amountBb ?? row.amount_bb, Number.NaN);
      const action = index === 0 ? actor === "Ты" ? "открыл до" : "рейз" : "3-бет до";
      return [actor, action, Number.isFinite(amount) && amount > 0 ? `${learnerNumber(amount)} BB` : ""].filter(Boolean).join(" ");
    });
  }
  const aggressionByStreet = new Map();
  return visibleRows.filter((row) => {
    const rowStreet = text(row.street || raw?.street || raw?.table?.street || "preflop");
    if (rowStreet !== "preflop") return true;
    return !isForcedBlindAction(row, heroPosition, rowStreet);
  }).map((row) => {
    const rowStreet = text(row.street || raw?.street || raw?.table?.street || "preflop");
    const rawActor = text(row.actor || row.position || row.seat);
    const actor = /^(?:HERO)$/i.test(rawActor) || rawActor.toUpperCase() === text(heroPosition).toUpperCase() ? "Ты" : rawActor;
    const rawAction = text(row.type || row.action);
    let action = labelForAction(rawAction);
    const amount = number(row.amountBb ?? row.amount_bb, Number.NaN);
    if (rowStreet === "preflop" && /bet|raise/i.test(rawAction)) {
      if (Number.isFinite(amount) && amount <= 1) {
        action = "Лимп";
      } else {
        const aggressionCount = (aggressionByStreet.get(rowStreet) || 0) + 1;
        aggressionByStreet.set(rowStreet, aggressionCount);
        action = aggressionCount === 1 ? "Рейз" : aggressionCount === 2 ? "3-бет" : `${aggressionCount + 1}-бет`;
      }
    } else if (rowStreet !== "preflop" && /bet|raise/i.test(rawAction)) {
      const aggressionCount = (aggressionByStreet.get(rowStreet) || 0) + 1;
      aggressionByStreet.set(rowStreet, aggressionCount);
      action = aggressionCount === 1 ? "Ставка" : "Рейз";
    }
    return [actor, action, Number.isFinite(amount) && amount > 0 ? `${learnerNumber(amount)} BB` : ""].filter(Boolean).join(" ");
  }).filter(Boolean);
}

function seatsFromRaw(raw, heroPosition) {
  if (Array.isArray(raw?.table?.seats) && raw.table.seats.length) {
    return raw.table.seats.map((seat) => ({
      label: text(seat.label || seat.position || seat.pos || seat.name),
      state: text(seat.state || (seat.isHero ? "hero" : "waiting")),
      stackBb: roundedNumber(seat.stackBb ?? seat.stack_bb ?? seat.stack) || undefined,
      cards: Array.isArray(seat.cards || seat.hole) ? (seat.cards || seat.hole).map(cardCode).filter(Boolean) : undefined,
      revealCardsAfterAnswer: Boolean(seat.revealCardsAfterAnswer)
    }));
  }
  if (Array.isArray(raw?.seats) && raw.seats.length) {
    return raw.seats.map((seat) => ({
      label: text(seat.pos || seat.position || seat.name || seat.label),
      state: seat.isHero || text(seat.pos || seat.position) === heroPosition ? "hero" : "waiting",
      stackBb: roundedNumber(seat.stackBb ?? seat.stack_bb ?? seat.stack) || undefined,
      cards: Array.isArray(seat.hole || seat.cards) ? (seat.hole || seat.cards).map(cardCode).filter(Boolean) : undefined
    }));
  }
  const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  const fallbackSlot = { EP: "UTG", MP: "HJ" }[text(heroPosition).toUpperCase()];
  return positions.map((position) => {
    const label = position === fallbackSlot ? heroPosition : position;
    return {
      label,
      state: label === heroPosition ? "hero" : /SB|BB/.test(label) ? "blind" : "waiting"
    };
  });
}

function rawHeroCards(raw) {
  const cards = raw?.table?.heroCards || raw?.heroCards || raw?.hero || raw?.hole || [];
  if (Array.isArray(cards) && cards.length) return cards.map(cardCode).filter(Boolean);
  return cardsFromHandClass(raw?.hand).map(cardCode).filter(Boolean);
}

function rawBoard(raw) {
  const board = raw?.table?.boardCards || raw?.boardCards || raw?.board || [];
  return Array.isArray(board) ? board.map(cardCode).filter(Boolean) : [];
}

function normalizeOptions(raw, lessonId) {
  const source = Array.isArray(raw.options) ? raw.options : Array.isArray(raw.actions) && raw.actions.every((value) => typeof value === "string") ? raw.actions : [];
  const correctKey = text(raw.correctKey || raw.correctAction || raw.correctActionType || raw.answerId);
  const principle = lessonPrinciples[lessonId] || "Сверь действие с позицией, стеком, экшеном и ценой продолжения.";
  const normalized = source.map((option, index) => {
    if (typeof option === "string") {
      const correct = option === correctKey;
      return {
        key: option,
        label: labelForAction(option),
        actionType: typeForAction(option),
        correct,
        sourceFeedback: raw.reason
      };
    }
    const key = text(option.key || option.option_key || option.id || `o${index + 1}`);
    const isCorrect = option.correct === true || key === correctKey;
    const action = text(option.actionType || option.action_data?.type || key);
    const amount = number(option.toBb ?? option.amountBb ?? option.action_data?.toBb ?? option.action_data?.amountBb, Number.NaN);
    const fallbackLabel = [labelForAction(action), Number.isFinite(amount) && amount > 0 ? `${amount} BB` : ""].filter(Boolean).join(" ");
    return {
      key,
      label: publishedOptionLabel(option.label || option.text || key, fallbackLabel || labelForAction(key)),
      actionType: text(option.actionType || option.action_data?.type || typeForAction(key)),
      correct: isCorrect,
      sourceFeedback: option.feedback || (isCorrect ? raw.correctFeedback : "")
    };
  });
  const correctOption = normalized.find((option) => option.correct);
  const correctLabel = correctOption?.label || labelForAction(correctKey) || "лучшее действие";
  return normalized.map((option) => {
    const fallback = option.correct
      ? `Верно: ${correctLabel}. ${principle}`
      : `Здесь базовая линия — ${correctLabel}. ${principle}`;
    const label = publishedOptionLabel(option.label, labelForAction(option.key));
    const visibleActionType = typeForAction(label);
    return {
      key: option.key,
      label,
      actionType: visibleActionType,
      correct: option.correct,
      feedback: safeLearnerCopy(option.sourceFeedback, fallback)
    };
  });
}

function derivedToCall(raw, heroPosition = "") {
  const explicit = number(raw?.table?.toCall ?? raw.toCallBb ?? raw.callPriceBb ?? raw.toCall, Number.NaN);
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];
  const decisionStreet = text(raw?.street || raw?.table?.street || "preflop");
  const blindContribution = decisionStreet === "preflop"
    ? text(heroPosition).toUpperCase() === "SB" ? 0.5 : text(heroPosition).toUpperCase() === "BB" ? 1 : 0
    : 0;
  const raises = actions.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const rowStreet = text(row.street || decisionStreet);
    const actor = text(row.actor || row.position || row.seat);
    const amount = number(row.amountBb ?? row.amount_bb, Number.NaN);
    return rowStreet === decisionStreet
      && /bet|raise|all.?in/i.test(text(row.type || row.action))
      && Number.isFinite(amount)
      && !isForcedBlindAction(row, heroPosition, rowStreet);
  });
  if (raises.length) {
    const actorIsHero = (row) => {
      const actor = text(row.actor || row.position || row.seat).toUpperCase();
      return actor === "HERO" || actor === text(heroPosition).toUpperCase();
    };
    const latest = raises.at(-1);
    if (actorIsHero(latest)) return 0;
    const heroAggression = raises.filter(actorIsHero).at(-1);
    const committed = heroAggression
      ? number(heroAggression.amountBb ?? heroAggression.amount_bb)
      : blindContribution;
    return Math.max(0, number(latest.amountBb ?? latest.amount_bb) - committed);
  }
  if (Number.isFinite(explicit) && raw?.mode === "resteal") return Math.max(0, explicit - blindContribution);
  if (Number.isFinite(explicit)) return explicit;
  return 0;
}

function brokenLearnerCopy(value) {
  const normalized = text(value);
  return !normalized || /\?{3,}/.test(normalized) || /^[\W_]+$/.test(normalized);
}

function normalizeSpot(raw, lessonId, index) {
  const positionInQuestion = text(raw.question || raw.prompt).match(/(?:Hero|Игрок|Ты)\s+на\s+([A-Z]{2,3}(?:\+\d)?)/i)?.[1];
  const heroPosition = text(raw?.table?.heroPosition || raw.heroPosition || raw.position || positionInQuestion || "BTN");
  const heroStack = number(raw?.table?.heroStack || raw?.table?.heroBb || raw.heroStackBb || raw.stackBb || raw.stack, 40);
  const pot = number(raw?.table?.pot || raw.potBb || raw.pot, 0);
  const toCall = derivedToCall(raw, heroPosition);
  const boardCards = rawBoard(raw);
  const options = normalizeOptions(raw, lessonId);
  if (options.filter((option) => option.correct).length !== 1) {
    throw new Error(`${lessonId}:${raw.id || index} must expose exactly one correct option`);
  }
  const heroCards = rawHeroCards(raw);
  const principle = lessonPrinciples[lessonId] || "Сначала прочитай позицию, стек, экшен и цену продолжения.";
  const lessonTitle = lessonById.get(lessonId)?.title || "Решение";
  const handLabel = heroCards.length ? heroCards.map(cardDisplay).join(" ") : heroPosition;
  const historyFallback = [
    `Ты на ${heroPosition}`,
    `эффективный стек ${learnerNumber(heroStack)} BB`,
    pot ? `банк ${learnerNumber(pot)} BB` : "",
    toCall ? `к коллу ${learnerNumber(toCall)} BB` : ""
  ].filter(Boolean).join(" · ");
  const correctLabel = options.find((option) => option.correct)?.label || "Лучшее действие";
  const rawWisdom = [raw.reason, raw.correctFeedback, raw.note, raw.decisionModel?.primary, raw.tacticalPlan?.headline, raw.model?.primary]
    .map((value) => text(value))
    .find((value) => value.length >= 24) || "";
  const sourceWisdom = rawWisdom.length <= 280 ? rawWisdom : "";
  const titleFallback = lessonId === "icm"
    ? `${lessonTitle} · ${heroPosition} · ${learnerNumber(heroStack)} BB`
    : `${lessonTitle} · ${handLabel}`;
  const percentageOptions = options.length > 1 && options.every((choice) => /^\d+(?:[.,]\d+)?\s*%$/.test(choice.label));
  const questionFallback = lessonId === "icm" && percentageOptions
    ? `Какую долю стартовых рук стоит продолжать на ${heroPosition} после показанного экшена?`
    : `Как сыграть ${handLabel} в этой ситуации?`;
  const rawHistory = lessonId === "icm" ? "" : raw?.table?.historyLine || raw.tableState || raw.lineLabel || raw.stage || raw.modeLabel;
  return {
    id: `${lessonId}-${text(raw.id || index + 1).replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`,
    title: safeLearnerCopy(raw.title || raw.label, titleFallback),
    question: lessonId === "icm" ? questionFallback : safeLearnerCopy(raw.question || raw.prompt || raw.questionText, questionFallback),
    hint: safeLearnerCopy(text(raw.hint || raw.rangeHint || raw.handHint).length >= 24 ? raw.hint || raw.rangeHint || raw.handHint : "", principle),
    wisdom: safeLearnerCopy(sourceWisdom, `${correctLabel}. ${principle}`),
    errorTag: text(raw.errorTag || (Array.isArray(raw.errorTags) ? raw.errorTags[0] : "") || "decision_miss"),
    table: {
      seats: seatsFromRaw(raw, heroPosition),
      heroPosition,
      heroStack: `${learnerNumber(heroStack)} BB`,
      effectiveStack: `${learnerNumber(heroStack)} BB`,
      pot: `${learnerNumber(pot)} BB`,
      toCall: toCall ? `${learnerNumber(toCall)} BB` : "0 BB",
      heroCards,
      boardCards,
      street: text(raw?.table?.street || raw.street || (boardCards.length >= 5 ? "river" : boardCards.length === 4 ? "turn" : boardCards.length === 3 ? "flop" : "preflop")),
      actionLine: actionLineFromRaw(raw, heroPosition),
      historyLine: safeLearnerCopy(brokenLearnerCopy(rawHistory) ? "" : rawHistory, historyFallback),
      dealerPosition: text(raw?.table?.dealerPosition || raw.dealerPosition || "BTN")
    },
    options
  };
}

function conceptSpot(id, title, question, options, context = "") {
  return {
    id,
    title,
    question,
    hint: context || "Выбери вариант, который помогает принимать решения системно.",
    wisdom: options.find((option) => option.correct)?.feedback || "",
    errorTag: "concept_miss",
    table: {
      seats: [],
      heroPosition: "BTN",
      heroStack: "40 BB",
      effectiveStack: "40 BB",
      pot: "0 BB",
      toCall: "0 BB",
      heroCards: [],
      boardCards: [],
      street: "preflop",
      actionLine: [],
      historyLine: context,
      dealerPosition: "BTN"
    },
    options
  };
}

function option(key, label, correct, feedback) {
  return { key, label, actionType: "choice", correct: Boolean(correct), feedback };
}

function tournamentStageLabel(value) {
  const labels = {
    Early: "ранняя стадия",
    Middle: "середина турнира",
    Bubble: "баббл",
    ITM: "призовая зона",
    Payjump: "перед скачком выплат",
    "Final table": "финальный стол",
    "Late reg": "поздняя регистрация",
    "Post late reg": "регистрация закрыта",
    "Satellite bubble": "баббл сателлита",
    "Ante active": "уровень с анте"
  };
  return labels[text(value)] || editorialPolish(localizedActionLabel(value));
}

const tournamentCopyOverrides = {
  "tournament-format-reentry-02": {
    question: "Ты вылетел из турнира с повторным входом, а поздняя регистрация ещё открыта. Что верно?",
    wisdom: "До конца поздней регистрации можно зарегистрироваться заново; прежний стек не возвращается.",
    labels: {
      0: "Можно зарегистрироваться заново — это новый вход",
      2: "Вылет окончательный, как во фризауте"
    },
    feedback: {
      1: "Прежний стек не восстанавливается: новый вход начинается с нового стартового стека и требует отдельного взноса.",
      2: "Так было бы во фризауте; здесь окно повторного входа ещё открыто."
    }
  },
  "tournament-format-pko-03": {
    question: "В PKO короткий стек 7 BB ставит олл-ин, и ты его покрываешь. Что нужно добавить к обычному расчёту ожидания по фишкам?",
    wisdom: "Когда ты покрываешь соперника в PKO, ценность баунти может расширить прибыльный диапазон продолжения."
  },
  "tournament-format-rebuy-addon-11": {
    question: "У тебя 18 BB в турнире с докупками. До конца периода докупок 4 минуты, аддон доступен после закрытия регистрации. Что верно?",
    wisdom: "Формат с докупками и аддоном влияет на бюджет турнира, но проигрыш текущего стека всё равно завершает этот вход.",
    labels: {
      0: "Аддон не спасает текущую раздачу: это отдельное решение после периода докупок",
      2: "Любая докупка запрещена, как во фризауте"
    },
    feedback: {
      1: "Аддон не является бесплатной страховкой от проигранного стека.",
      2: "Докупки разрешены правилами этого формата, но не меняют математику текущей раздачи."
    }
  },
  "tournament-format-reentry-closed-12": {
    question: "В турнире был разрешён повторный вход, но поздняя регистрация закрылась 12 минут назад. Ты проигрываешь весь стек. Что теперь?",
    wisdom: "Окно повторного входа закрыто, поэтому следующий вылет уже окончательный.",
    labels: { 2: "Тебя вернут за тот же стол со средним стеком" },
    feedback: { 2: "Такого автоматического восстановления стека в турнире нет." }
  },
  "tournament-pko-cover-chain-21": {
    labels: { 0: "За тобой остаётся BB, который покрывает тебя и может изолировать" }
  },
  "tournament-pko-covered-by-pusher-22": {
    title: "PKO: ты не покрываешь пушера",
    question: "Соперник с большим баунти ставит олл-ин 28 BB, у тебя 19 BB. Ты не покрываешь его. Что это значит?",
    wisdom: "Баунти получает только игрок, чей стек позволяет полностью выбить соперника.",
    labels: {
      0: "Сейчас ты не можешь выиграть баунти: твоего стека недостаточно, чтобы выбить соперника",
      1: "Баунти полностью компенсирует риск колла",
      2: "Ты получишь половину баунти даже с меньшим стеком"
    },
    feedback: {
      1: "Если ты не покрываешь соперника, награда за его выбивание не добавляется к цене текущего колла.",
      2: "Меньший стек не может полностью выбить больший, поэтому баунти сейчас недоступно."
    }
  },
  "tournament-ko-flat-bounty-23": {
    title: "Классический KO: фиксированное баунти",
    question: "Чем ценность выбивания в классическом KO отличается от PKO?",
    wisdom: "В классическом KO баунти фиксировано и не растёт после чужих выбиваний.",
    labels: {
      0: "Баунти фиксировано и не растёт после чужих выбиваний",
      1: "Половина баунти всегда увеличивает твоё собственное баунти",
      2: "Фиксированное баунти не влияет на решение о колле"
    }
  },
  "tournament-pko-late-bubble-big-bounty-29": {
    question: "До призов пять вылетов. Соперник с крупным баунти ставит олл-ин 9 BB; у тебя 31 BB, и ты его покрываешь. Что нужно совместить?",
    wisdom: "Награду за выбивание нужно сравнить с ценой потери стека на баббле.",
    labels: {
      0: "Баунти расширяет колл, но давление баббла не превращает его в колл с любыми двумя картами",
      2: "Сбрасывать всё, кроме AA, из-за баббла"
    },
    feedback: {
      1: "Даже крупное баунти не отменяет ценность сохранённого стека и давление баббла.",
      2: "Поскольку ты покрываешь соперника с крупным баунти, диапазон колла может быть шире обычного."
    }
  },
  "tournament-stage-early-04": {
    title: "Первый час турнира",
    labels: { 1: "Играть дисциплинированно и наращивать стек в прибыльных ситуациях" }
  },
  "tournament-stage-bubble-05": {
    question: "У тебя 14 BB, до призов пять вылетов. Большой стек покрывает тебя и ставит олл-ин. Что меняется относительно обычного расчёта ожидания по фишкам?",
    feedback: { 2: "Доминированный туз может стать дорогой ошибкой, если ты рискуешь вылететь." }
  },
  "tournament-stage-itm-06": {
    wisdom: "После баббла часть давления исчезает: снова важны прибыльные решения и возможность нарастить стек.",
    labels: { 0: "Снова важнее ожидание по фишкам и борьба за стек" },
    feedback: { 1: "Так ты часто отдаёшь шанс собрать стек до дорогих стадий." }
  },
  "tournament-stack-bb-07": {
    question: "У тебя 48 000 фишек, блайнды 2 000 / 4 000. Сколько это больших блайндов?"
  },
  "tournament-stack-average-08": {
    wisdom: "С 16 BB решения чаще сводятся к выбору между рейзом и пасом, рестилом и коллом против олл-ина."
  },
  "tournament-final-table-09": {
    question: "У тебя 18 BB, рядом два стека по 5 BB, а чиплидер покрывает всех. Что главное перед маргинальным коллом его олл-ина?",
    labels: { 0: "Скачок выплат и риск вылета важнее обычного ожидания по фишкам" }
  },
  "tournament-stage-late-reg-short-13": {
    question: "Ты входишь в турнир поздно с 9 BB при среднем стеке 41 BB. Как мыслить первую орбиту?",
    labels: { 1: "Разыгрывать мелкие одномастные коннекторы ради глубокого постфлопа" }
  },
  "tournament-stack-effective-14": {
    question: "У тебя 32 BB, у соперника на BTN 78 BB. Какой стек считать эффективным в раздаче между вами?",
    wisdom: "Когда соперник покрывает тебя, под угрозой находится весь твой стек — 32 BB.",
    labels: { 0: "Твой эффективный стек — 32 BB, потому что соперник тебя покрывает" },
    feedback: { 1: "Лишние фишки соперника не могут попасть в банк сверх твоего стека." }
  },
  "tournament-bubble-big-stack-abuse-15": {
    question: "До призов три вылета. У тебя 62 BB, ты покрываешь весь стол; позади стеки 11–18 BB. Какой общий план лучше?"
  },
  "tournament-bubble-covered-medium-16": {
    question: "До призовой зоны остаётся четыре вылета. У тебя 24 BB, BTN ставит олл-ин 70 BB, а за столом есть два стека по 5 BB. Что главное?"
  },
  "tournament-itm-mincash-trap-17": {
    wisdom: "После завершения баббла давление часто снижается, а короткому стеку нужно восстановить фолд-эквити.",
    labels: {
      0: "Вернуться к прибыльным кражам блайндов и рестилам, чтобы наращивать стек",
      1: "Сбрасывать до следующего скачка выплат любой ценой",
      2: "Ставить олл-ин с любыми двумя картами, потому что призы уже начались"
    },
    feedback: {
      1: "Небольшой и далёкий скачок выплат редко оправдывает полный отказ от прибыльных решений.",
      2: "Попадание в призы не отменяет диапазоны и будущую ценность стека."
    }
  },
  "tournament-payjump-27-left-18": {
    question: "Осталось 27 игроков, следующий скачок выплат — на 24-м месте. У тебя 12 BB, за столом два стека короче 6 BB. Большой стек ставит олл-ин. Что меняется?",
    wisdom: "Если рядом есть стеки короче твоего, маргинальный колл против покрывающего стека становится дороже.",
    feedback: {
      1: "Следующие скачки выплат продолжают влиять на цену риска и после попадания в призы.",
      2: "Ты не выбиваешь короткие стеки в этой раздаче, а рискуешь собственным местом."
    },
    labels: {
      0: "Короткие стеки рядом увеличивают цену твоего вылета до скачка выплат",
      1: "Скачок выплат не важен, потому что ты уже в призах"
    }
  },
  "tournament-stack-orbit-cost-24": {
    question: "У тебя 14 BB за столом на 8 игроков. Анте уже включены, и за орбиту уходит примерно 2,2 BB. Что нужно обновить в плане?",
    labels: { 0: "С анте стек убывает быстрее: хорошие возможности для рестила или олл-ина нельзя откладывать надолго" }
  },
  "tournament-final-ladder-shove-28": {
    question: "У тебя 5 BB на финальном столе, рядом два стека по 3 BB, а следующий скачок выплат большой. Что помнить перед олл-ином с BTN?",
    wisdom: "С 5 BB ожидание тоже обходится дорого, но более короткие стеки резко повышают цену неудачного олл-ина.",
    feedback: { 2: "Полное ожидание может уничтожить фолд-эквити и оставить тебя без выбора." }
  },
  "tournament-final-covering-shorts-19": {
    question: "На финальном столе у тебя 44 BB, у чиплидера 71 BB, ещё три стека имеют 6–9 BB. Чиплидер давит на тебя. Какой принцип важнее?"
  },
  "tournament-stage-table-break-26": {
    question: "Что нужно обновить после пересадки за новый стол?",
    wisdom: "Заново отметь, кто покрывает тебя, кого покрываешь ты и где находятся короткие стеки.",
    labels: { 0: "Карту давления: кто покрывает тебя, кого покрываешь ты и где находятся короткие стеки" },
    feedback: { 1: "Новый стол меняет позиции давления и прибыльные цели." }
  },
  "tournament-bubble-short-open-27": {
    question: "До призов шесть вылетов. У тебя 38 BB на BB, SB ставит олл-ин 8 BB. Чем этот колл отличается от колла против чиплидера?",
    labels: { 0: "Ты покрываешь пушера, поэтому в этой раздаче не рискуешь вылететь" },
    feedback: { 1: "Риск вылета отсутствует, когда твоего стека хватает, чтобы покрыть олл-ин соперника." }
  }
};

function applyTournamentCopyOverride(spot, rawId) {
  const override = tournamentCopyOverrides[rawId];
  if (!override) return spot;
  if (override.title) spot.title = override.title;
  if (override.question) spot.question = override.question;
  if (override.wisdom) {
    spot.wisdom = override.wisdom;
    const correct = spot.options.find((choice) => choice.correct);
    if (correct) correct.feedback = override.wisdom;
  }
  for (const [index, label] of Object.entries(override.labels || {})) {
    if (spot.options[Number(index)]) spot.options[Number(index)].label = label;
  }
  for (const [index, feedback] of Object.entries(override.feedback || {})) {
    if (spot.options[Number(index)]) spot.options[Number(index)].feedback = feedback;
  }
  return spot;
}

function buildTournamentSpots(rows, lessonId) {
  return rows.map((raw, index) => {
    const table = raw.table || {};
    const correctKey = text(raw.correctKey);
    const labelOverrides = {
      short_plan: "Нужен план короткого стека, а не глубокий постфлоп",
      ignore_ante: "Игнорировать анте в решениях с коротким стеком"
    };
    const choices = (raw.options || []).map((choice, optionIndex) => option(
      text(choice.key || `o${optionIndex + 1}`),
      labelOverrides[text(choice.actionType)] || choice.label || `План ${optionIndex + 1}`,
      choice.correct === true || text(choice.key) === correctKey,
      choice.feedback || "Сопоставь формат, стадию и цену вылета."
    ));
    const correct = choices.find((choice) => choice.correct);
    const stage = tournamentStageLabel(table.stage);
    const context = [
      stage ? `Стадия: ${stage}` : "",
      number(table.left) ? `игроков осталось: ${number(table.left)}` : "",
      number(table.paid) ? `призовых мест: ${number(table.paid)}` : "",
      number(table.avgBb) ? `средний стек ${number(table.avgBb)} BB` : "",
      Number.isFinite(Number(table.heroBb)) ? `твой стек ${number(table.heroBb)} BB` : ""
    ].filter(Boolean).join(" · ");
    const spot = conceptSpot(
      `${lessonId}-${text(raw.id || index + 1)}`,
      raw.title || lessonById.get(lessonId)?.title || "Турнирное решение",
      raw.question || raw.prompt || "Какой план здесь лучше?",
      choices,
      context || "Сначала определи формат, стадию и эффективный стек."
    );
    spot.hint = "Сначала определи формат, стадию, покрытие стеков и цену вылета.";
    spot.wisdom = correct?.feedback || lessonPrinciples[lessonId];
    spot.table.heroStack = `${number(table.heroBb, 0)} BB`;
    spot.table.effectiveStack = spot.table.heroStack;
    spot.table.historyLine = context;
    return applyTournamentCopyOverride(spot, text(raw.id));
  });
}

function pokerSpot(id, title, question, table, choices, wisdom) {
  return {
    id,
    title,
    question,
    hint: "Прочитай экшен и только потом выбирай действие.",
    wisdom,
    errorTag: "line_miss",
    table,
    options: choices.map((choice) => {
      const inferred = typeForAction(choice.label);
      return inferred !== "choice"
        ? { ...choice, actionType: inferred }
        : choice;
    })
  };
}

function trainingTable({
  heroPosition = "BTN",
  villainPosition = "BB",
  heroStack = 40,
  effectiveStack = heroStack,
  pot = 0,
  toCall = 0,
  heroCards = [],
  boardCards = [],
  street = "preflop",
  actionLine = [],
  historyLine = "",
  dealerPosition = "BTN"
} = {}) {
  return {
    seats: [
      { label: heroPosition, state: "hero" },
      { label: villainPosition, state: /SB|BB/.test(villainPosition) ? "blind" : "waiting" }
    ],
    heroPosition,
    heroStack: `${learnerNumber(heroStack)} BB`,
    effectiveStack: `${learnerNumber(effectiveStack)} BB`,
    pot: `${learnerNumber(pot)} BB`,
    toCall: `${learnerNumber(toCall)} BB`,
    heroCards,
    boardCards,
    street,
    actionLine,
    historyLine,
    dealerPosition
  };
}

function buildRulesSpots() {
  const rows = [
    ["streets", "Как идут улицы в холдеме?", "Префлоп → флоп → тёрн → ривер", "Сначала игроки получают две закрытые карты, затем на стол выходят 3 + 1 + 1 общие карты.", ["Флоп → префлоп → ривер → тёрн", "Префлоп → тёрн → флоп → ривер"]],
    ["blinds", "Зачем нужны SB и BB?", "Они создают обязательный стартовый банк", "Блайнды заставляют игроков бороться за фишки уже до раздачи карт.", ["Они определяют победителя до флопа", "Они заменяют все ставки после флопа"]],
    ["preflop-order", "Кто действует первым на префлопе?", "Первый активный игрок слева от BB", "Префлоп действие начинается слева от большого блайнда и идёт по часовой стрелке.", ["Всегда BTN", "Игрок с самым большим стеком"]],
    ["postflop-order", "Кто действует первым после флопа?", "Первый активный игрок слева от BTN", "После флопа первым говорит ближайший активный игрок слева от кнопки.", ["Игрок, который выиграл прошлую раздачу", "Всегда BB, даже если он уже спасовал"]],
    ["round-end", "Когда заканчивается круг торговли?", "Когда все оставшиеся игроки уравняли ставку или спасовали", "Олл-ин игрок может вложить меньше: тогда формируются основной и при необходимости побочные банки.", ["Сразу после первой ставки", "Когда на столе появится следующая карта независимо от ставок"]],
    ["showdown", "Что происходит после последней ставки на ривере?", "Оставшиеся игроки вскрывают карты и сравнивают лучшие пятёрки", "Если все, кроме одного, спасовали раньше, банк забирают без обязательного вскрытия.", ["Всегда начинается новая торговля", "Побеждает игрок с большим стартовым стеком"]]
  ];
  return rows.map(([id, question, answer, feedback, wrongs]) => conceptSpot(
    `poker-history-rules-${id}`,
    "Порядок раздачи",
    question,
    [
      option("right", answer, true, feedback),
      option("wrong-a", wrongs[0], false, feedback),
      option("wrong-b", wrongs[1], false, feedback)
    ],
    "Восстанови порядок действий, а не угадывай по названию улицы."
  ));
}

function buildHandActionSpots() {
  const spots = [
    pokerSpot(
      "hand-actions-no-bet",
      "Когда перед тобой нет ставки",
      "BB чекнул. Какое действие сейчас недоступно?",
      trainingTable({ heroCards: ["As", "Qd"], boardCards: ["Qh", "7c", "2s"], street: "flop", pot: 5, actionLine: ["BB чек"], historyLine: "Перед тобой нет ставки." }),
      [
        option("call", "Колл", true, "Коллировать нечего: перед тобой нет ставки. Доступны чек или собственная ставка."),
        option("check", "Чек", false, "Чек доступен, потому что перед тобой нет ставки."),
        option("bet", "Ставка", false, "Ставка доступна: ты можешь первым вложить фишки на этой улице.")
      ],
      "Колл появляется только в ответ на уже сделанную ставку."
    ),
    pokerSpot(
      "hand-actions-facing-bet",
      "Когда перед тобой есть ставка",
      "BB поставил 3 BB. Какое действие сейчас недоступно?",
      trainingTable({ heroCards: ["Kh", "Qh"], boardCards: ["Ks", "8d", "3c"], street: "flop", pot: 8, toCall: 3, actionLine: ["BB ставка 3 BB"], historyLine: "Ты отвечаешь на ставку." }),
      [
        option("check", "Чек", true, "Чек недоступен: сначала нужно ответить на ставку — пасом, коллом или рейзом."),
        option("fold", "Пас", false, "Пас доступен в ответ на ставку."),
        option("raise", "Рейз", false, "Рейз доступен: он увеличивает уже сделанную ставку.")
      ],
      "Против ставки доступны пас, колл и рейз; чек — только когда доплачивать не нужно."
    ),
    pokerSpot(
      "hand-actions-call-price",
      "Цена колла",
      "BTN открыл до 2,5 BB, а ты уже поставил 1 BB. Сколько нужно доплатить для колла?",
      trainingTable({ heroPosition: "BB", villainPosition: "BTN", heroCards: ["Qs", "9s"], pot: 4, toCall: 1.5, actionLine: ["BTN рейз до 2,5 BB"], historyLine: "Твой большой блайнд 1 BB уже в банке." }),
      [
        option("one-five", "1,5 BB", true, "Колл равен разнице между текущей ставкой 2,5 BB и уже вложенным 1 BB."),
        option("two-five", "2,5 BB", false, "Это полный размер рейза, но 1 BB уже вложен."),
        option("three-five", "3,5 BB", false, "Блайнд не прибавляют второй раз: считай только доплату.")
      ],
      "Цена колла — только недостающая часть до текущей ставки."
    ),
    pokerSpot(
      "hand-actions-raise",
      "Что делает рейз",
      "Соперник поставил 2 BB. Что означает рейз?",
      trainingTable({ heroPosition: "BTN", villainPosition: "BB", heroCards: ["Jh", "Th"], boardCards: ["9h", "8c", "2h"], street: "flop", pot: 7, toCall: 2, actionLine: ["BB ставка 2 BB"], historyLine: "Перед тобой уже есть ставка." }),
      [
        option("raise", "Увеличить ставку соперника", true, "Рейз не просто уравнивает, а повышает текущую ставку."),
        option("call", "Только уравнять 2 BB", false, "Это колл, а не рейз."),
        option("check", "Не вкладывать фишки и продолжить", false, "Против ставки так сделать нельзя: это был бы чек.")
      ],
      "Колл уравнивает, рейз повышает."
    ),
    pokerSpot(
      "hand-actions-all-in",
      "Олл-ин",
      "Что означает действие «олл-ин»?",
      trainingTable({ heroPosition: "SB", villainPosition: "BB", heroStack: 12, heroCards: ["Ah", "Kd"], pot: 2.5, historyLine: "У тебя осталось 12 BB." }),
      [
        option("all", "Поставить все оставшиеся фишки", true, "Олл-ин завершает твои решения в этой раздаче, но доска и действия соперников могут продолжиться."),
        option("pot", "Поставить ровно размер банка", false, "Ставка размером в банк не обязательно равна всему стеку."),
        option("double", "Автоматически удвоить стек", false, "Олл-ин создаёт риск на весь оставшийся стек, но не гарантирует победу.")
      ],
      "Олл-ин — ставка всеми оставшимися фишками, а не обещание выиграть банк."
    )
  ];
  for (const spot of spots) spot.hint = "Сначала проверь, есть ли перед тобой ставка и сколько уже вложено.";
  return spots;
}

function buildHandRankingSpots(combinations) {
  const hands = combinations.hands || [];
  return hands.map((hand, index) => {
    const distractors = [1, 2, 3, 4, 5, 6]
      .map((offset) => hands[(index + offset) % hands.length])
      .filter((candidate) => candidate.id !== hand.id && !(hand.id === "royal-flush" && candidate.id === "straight-flush"))
      .slice(0, 3);
    const choices = [hand, ...distractors]
      .sort((left, right) => ((left.strength * 7 + index) % 11) - ((right.strength * 7 + index) % 11))
      .map((item) => option(item.id, item.title, item.id === hand.id, item.id === hand.id ? `${hand.ruleLabel} ${hand.tiebreaks?.[0]?.text || ""}` : `Посмотри на лучшие пять карт: это ${hand.title.toLowerCase()}.`));
    const spot = pokerSpot(
      `combinations-${hand.id}`,
      hand.title,
      hand.id === "royal-flush" ? "Как точнее всего называется комбинация игрока?" : "Какая лучшая комбинация у игрока?",
      {
        seats: [
          { label: "BTN", state: "hero" },
          { label: "BB", state: "waiting" }
        ],
        heroPosition: "BTN",
        heroStack: "40 BB",
        effectiveStack: "40 BB",
        pot: "12 BB",
        toCall: "0 BB",
        heroCards: hand.hole.map(cardCode),
        boardCards: hand.board.map(cardCode),
        street: "river",
        actionLine: [],
        historyLine: "Составь лучшую пятёрку из семи доступных карт.",
        dealerPosition: "BTN"
      },
      choices,
      `${hand.short}. ${hand.tiebreaks?.[0]?.text || ""}`
    );
    spot.hint = "Собери лучшую пятёрку из семи доступных карт.";
    return spot;
  });
}

function buildKickerSpots(combinations) {
  return (combinations.hands || []).filter((hand) => ["four", "full-house", "flush", "straight", "three", "two-pair", "pair", "high-card"].includes(hand.id)).map((hand, index) => {
    const spot = pokerSpot(
      `pairs-kicker-${hand.id}`,
      hand.title,
      hand.tiebreaks?.[0]?.title || "Что сравнивать первым?",
      {
        seats: [
          { label: "BTN", state: "hero" },
          { label: "BB", state: "waiting" }
        ],
        heroPosition: "BTN",
        heroStack: "40 BB",
        effectiveStack: "40 BB",
        pot: "12 BB",
        toCall: "0 BB",
        heroCards: hand.hole.map(cardCode),
        boardCards: hand.board.map(cardCode),
        street: "river",
        actionLine: [],
        historyLine: `Пример ${index + 1}: ${hand.coreLabel}`,
        dealerPosition: "BTN"
      },
      [
        option("first", hand.tiebreaks?.[0]?.text || hand.ruleLabel, true, `${hand.ruleLabel} ${hand.tiebreaks?.[1]?.text || ""}`),
        option("suit", "Сначала масть карт", false, "Масть не даёт старшинства: сравниваются ранги и кикеры."),
        option("pot", "Размер банка", false, "Размер банка не меняет старшинство комбинаций.")
      ],
      `${hand.ruleLabel} ${hand.tiebreaks?.[1]?.text || ""}`
    );
    spot.hint = "Сначала назови комбинацию, затем сравни значимые ранги по порядку.";
    return spot;
  });
}

const outsEditorialOverrides = {
  "fdgut-flop": {
    drawLabel: "Флеш-дро + двусторонний стрит-дро",
    outs: 15,
    note: "Девять червей и шесть новых карт на стрит: K♥ и 8♥ уже входят во флеш-ауты. Итого 15 потенциальных аутов."
  },
  "dirty-over-flop": {
    drawLabel: "Гатшот + бэкдор-флеш",
    outs: 4,
    note: "Только четыре десятки сразу дают стрит. Для флеша нужны две бубны подряд, поэтому готового флеш-дро здесь нет."
  },
  "combo-pair-fd-flop-17": {
    outs: 15,
    note: "Девять флеш-аутов и восемь карт на стрит пересекаются по 5♥ и T♥. Итого 15 потенциальных аутов."
  },
  "double-gutter-flop-18": {
    drawLabel: "Двусторонний стрит-дро",
    note: "Любая дама или семёрка завершает стрит: восемь потенциальных аутов."
  },
  "set-to-boat-turn-26": {
    drawLabel: "Фулл-хаус до более сильного фулла или каре",
    outs: 3,
    note: "Рука уже собрала фулл-хаус. Две оставшиеся K и последняя 7 дают более сильный фулл-хаус или каре — три аута на улучшение."
  },
  "fd-two-overs-clean-flop-22": {
    drawLabel: "Натсовое флеш-дро + две чистые оверкарты",
    note: "Девять аутов на флеш, три туза и три короля дают 15 потенциальных аутов на улучшение."
  }
};

function outsWord(value) {
  const amount = Math.abs(Number(value));
  const lastTwo = amount % 100;
  const last = amount % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "аутов";
  if (last === 1) return "аут";
  if (last >= 2 && last <= 4) return "аута";
  return "аутов";
}

function outsCountingNote(spot) {
  const sentences = text(spot.note).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const useful = sentences.filter((sentence) => !/%|правил[оа]|\b(?:колл|фолд|рейз)\b|цена/i.test(sentence));
  return text(useful.join(" ")) || `${spot.outs} ${outsWord(spot.outs)} дают потенциальное улучшение на следующей карте.`;
}

function buildOutsDecisionSpots(outs, lessonId, numeric = false) {
  return (outs.spots || []).map((sourceSpot, index) => {
    const spot = { ...sourceSpot, ...(outsEditorialOverrides[sourceSpot.id] || {}) };
    const equity = Math.min(100, number(spot.outs) * 2);
    const toCall = number(spot.toCall);
    const sourcePot = number(spot.pot);
    const currentPot = toCall > sourcePot ? sourcePot + toCall : sourcePot;
    const price = Math.round((toCall / Math.max(0.01, currentPot + toCall)) * 100);
    const call = equity >= price;
    const countNote = outsCountingNote(spot);
    const table = {
      seats: [
        { label: "BTN", state: "waiting" },
        { label: "BB", state: "hero" }
      ],
      heroPosition: "BB",
      heroStack: "35 BB",
      effectiveStack: "35 BB",
      pot: `${learnerNumber(currentPot)} BB`,
      toCall: `${spot.toCall} BB`,
      heroCards: (spot.hero || []).map(cardCode),
      boardCards: (spot.board || []).map(cardCode),
      street: spot.street,
      actionLine: [`BTN ставка ${spot.toCall} BB`],
      historyLine: spot.drawLabel,
      dealerPosition: "BTN"
    };
    if (numeric) {
      const values = unique([spot.outs, spot.naiveOuts, Math.max(1, number(spot.outs) - 2), number(spot.outs) + 3]).slice(0, 4);
      return pokerSpot(
        `${lessonId}-${spot.id}`,
        spot.drawLabel,
        "Сколько здесь потенциальных аутов на улучшение?",
        table,
        values.map((value) => option(String(value), `${value} ${outsWord(value)}`, Number(value) === Number(spot.outs), Number(value) === Number(spot.outs) ? countNote : `Не все карты одинаково чистые. Здесь рабочий счёт — ${spot.outs} ${outsWord(spot.outs)}.`)),
        countNote
      );
    }
    if (new Set([
      "pair-to-set-turn-25",
      "set-to-boat-turn-26",
      "two-pair-to-boat-river-27",
      "bottom-pair-five-outs-flop-35",
      "top-pair-kicker-outs-flop-36"
    ]).has(spot.id)) {
      const method = "Ауты показывают только шанс усилиться. Для решения с готовой рукой ещё нужны её текущая сила и диапазон соперника.";
      return pokerSpot(
        `${lessonId}-${spot.id}`,
        `${spot.drawLabel}: что считать`,
        "Можно ли принять решение только по аутам на улучшение?",
        table,
        [
          { key: "full-equity", label: "Учесть готовую руку и диапазон", actionType: "choice", correct: true, feedback: method },
          { key: "outs-only", label: "Сравнить только ауты", actionType: "choice", correct: false, feedback: "Так можно ошибочно выбросить уже сильную готовую руку. Нужна полная оценка эквити против диапазона." },
          { key: "automatic-fold", label: "Всегда пасовать без дро", actionType: "choice", correct: false, feedback: "Готовая рука может быть впереди уже сейчас; отсутствие большого числа аутов не означает автоматический пас." }
        ],
        method
      );
    }
    const mathReason = `До следующей карты примерно ${equity} %, цена колла ${price} %. ${countNote}`;
    return pokerSpot(
      `${lessonId}-${spot.id}`,
      `${spot.drawLabel}: цена решения`,
      `До следующей карты около ${equity} % эквити, цена колла ${price} %. Что делать?`,
      table,
      [
        { key: "call", label: `Колл ${spot.toCall} BB`, actionType: "call", correct: call, feedback: call ? `Колл проходит по прямой цене. ${mathReason}` : `Цена ${price} % выше приблизительного эквити ${equity} % — колл не окупается.` },
        { key: "fold", label: "Пас", actionType: "fold", correct: !call, feedback: !call ? `Пас сохраняет фишки: цена ${price} % выше приблизительного эквити ${equity} %. ${countNote}` : `Цена позволяет продолжить. ${mathReason}` }
      ],
      mathReason
    );
  });
}

function buildPositionSpots() {
  const rows = [
    ["btn", "Где BTN?", "Место с дилерской кнопкой", "После BTN остаются только блайнды."],
    ["sb", "Кто ставит малый блайнд?", "Место сразу слева от BTN", "SB ставит половину большого блайнда."],
    ["bb", "Кто ставит большой блайнд?", "Место сразу слева от SB", "BB уже вложил 1 BB и часто получает лучшую цену защиты."],
    ["ep", "Где нужен самый узкий диапазон?", "В ранней позиции", "За EP остаётся больше всего игроков."],
    ["mp", "Что происходит в средней позиции?", "Диапазон становится шире EP, но уже BTN", "Часть стола уже выбросила, часть ещё принимает решение."],
    ["co", "Кто сидит прямо перед BTN?", "CO", "CO — поздняя позиция с хорошей возможностью воровать блайнды."],
    ["order", "Кто ходит первым на префлопе?", "Место сразу слева от BB", "Префлоп первым действует ранняя позиция; после флопа первым говорит ближайший активный игрок слева от BTN."],
    ["postflop", "Почему BTN ценен после флопа?", "Он чаще действует последним", "Информация о действиях соперников повышает качество решения."],
    ["behind", "Что сужает открытие сильнее всего?", "Много игроков за спиной", "Каждый игрок за спиной добавляет шанс встретить сильную руку."],
    ["memory", "Как запомнить порядок конца стола?", "CO → BTN → SB → BB", "Эта цепочка не меняется, даже если стол короткий."]
  ];
  return rows.map(([id, question, correct, feedback]) => conceptSpot(
    `positions-${id}`,
    "Карта стола",
    question,
    [
      option("right", correct, true, feedback),
      option("wrong-a", id === "btn" ? "Место сразу слева от BB" : "Всегда игрок с самым большим стеком", false, "Позицию задаёт кнопка дилера и порядок мест, а не размер стека."),
      option("wrong-b", "Место выбирается случайно каждую улицу", false, "Места фиксированы на раздачу; меняется только порядок действий между префлопом и постфлопом.")
    ],
    "Сначала найди BTN, затем двигайся по часовой стрелке."
  ));
}

function buildBettingPurposeSpots() {
  const spots = [
    pokerSpot(
      "betting-purpose-value-flop",
      "Вэлью с сильной рукой",
      "BB чекнул. Как продолжить с топ-сетом?",
      trainingTable({ heroCards: ["As", "Ad"], boardCards: ["Ah", "7c", "2d"], street: "flop", pot: 5, actionLine: ["BB чек"], historyLine: "Худшие Ax и пары могут заплатить." }),
      [
        { key: "bet", label: "Ставка 2 BB", actionType: "raise", correct: true, feedback: "Ставка получает коллы от худших тузов и пар — это чистое вэлью." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "Чек иногда допустим, но базово сильная рука должна собирать фишки с худших рук." },
        { key: "all-in", label: "Олл-ин 38 BB", actionType: "all-in", correct: false, feedback: "Такой размер чаще выбивает именно те худшие руки, от которых нужен колл." }
      ],
      "Вэлью-ставка хочет получить колл от достаточного числа худших рук."
    ),
    pokerSpot(
      "betting-purpose-semibluff",
      "Полублеф с сильным дро",
      "BB чекнул. Как использовать флеш-дро и двусторонний стрит-дро?",
      trainingTable({ heroCards: ["Qh", "Jh"], boardCards: ["Th", "9c", "2h"], street: "flop", pot: 5, actionLine: ["BB чек"], historyLine: "У руки 15 потенциальных аутов." }),
      [
        { key: "bet", label: "Ставка 2 BB", actionType: "raise", correct: true, feedback: "Ставка может выиграть банк сразу, а при колле рука часто усилится — это полублеф." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "Чек сохраняет эквити, но не использует шанс забрать банк сразу." },
        { key: "fold", label: "Пас", actionType: "fold", correct: false, feedback: "Перед тобой нет ставки, поэтому пас не нужен и недоступен." }
      ],
      "Полублеф соединяет фолд-эквити сейчас и реальные ауты на усиление."
    ),
    pokerSpot(
      "betting-purpose-protection",
      "Вэлью и защита",
      "BB чекнул. Как сыграть с оверпарой на связанной доске?",
      trainingTable({ heroCards: ["9s", "9d"], boardCards: ["8h", "7c", "2s"], street: "flop", pot: 5, actionLine: ["BB чек"], historyLine: "Много оверкарт и стрит-карт могут ухудшить ситуацию." }),
      [
        { key: "bet", label: "Ставка 3 BB", actionType: "raise", correct: true, feedback: "Худшие пары и дро платят, а случайные оверкарты не получают бесплатную карту." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "Чек отдаёт бесплатную карту широкому числу оверкарт и дро." },
        { key: "all-in", label: "Олл-ин", actionType: "all-in", correct: false, feedback: "Переплата риском выбивает худшие руки и оставляет коллы в основном сильным диапазонам." }
      ],
      "Одна ставка может одновременно добирать с худших рук и делать следующую карту дорогой."
    ),
    pokerSpot(
      "betting-purpose-showdown",
      "Шоудаун-вэлью",
      "BB чекнул. Нужна ли ставка со второй парой на сухом флопе?",
      trainingTable({ heroCards: ["As", "7s"], boardCards: ["Kc", "7d", "3h"], street: "flop", pot: 5, actionLine: ["BB чек"], historyLine: "Рука уже часто выигрывает на вскрытии, но плохо получает три улицы колла." }),
      [
        { key: "check", label: "Чек", actionType: "check", correct: true, feedback: "Чек сохраняет банк управляемым и защищает диапазон чека рукой с шоудаун-вэлью." },
        { key: "bet", label: "Ставка 4 BB", actionType: "raise", correct: false, feedback: "Крупная ставка выбивает много худших рук и чаще получает продолжение от лучших." },
        { key: "all-in", label: "Олл-ин", actionType: "all-in", correct: false, feedback: "Олл-ин не соответствует силе руки и цели ставки." }
      ],
      "Если худшие руки редко коллируют, а лучшие редко фолдят, чек часто выполняет задачу лучше ставки."
    ),
    pokerSpot(
      "betting-purpose-river-value",
      "Вэлью на ривере",
      "BB чекнул ривер. Как сыграть с натсовым флешем?",
      trainingTable({ heroCards: ["Ah", "Jh"], boardCards: ["Kh", "7h", "2c", "4s", "9h"], street: "river", pot: 14, actionLine: ["BB чек"], historyLine: "Худшие флеши, сеты и две пары могут заплатить." }),
      [
        { key: "bet", label: "Ставка 10 BB", actionType: "raise", correct: true, feedback: "На ривере усилиться уже нельзя: сильная рука зарабатывает только через ставку и колл худшей руки." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "Чек гарантирует вскрытие, но пропускает добор с большого числа худших рук." },
        { key: "small", label: "Ставка 1 BB", actionType: "raise", correct: false, feedback: "Слишком малая ставка оставляет много вэлью на столе против рук, готовых платить больше." }
      ],
      "На ривере сильная рука выбирает размер по числу худших рук, способных заплатить."
    ),
    pokerSpot(
      "betting-purpose-no-bluff",
      "Когда блеф не выполняет задачу",
      "Пассивный соперник коллировал флоп и тёрн. Ривер ничего не изменил. Что делать с промахнувшимися оверкартами?",
      trainingTable({ heroCards: ["Ah", "Qh"], boardCards: ["Kc", "8d", "4s", "2h", "2c"], street: "river", pot: 18, actionLine: ["BB чек"], historyLine: "Соперник редко сбрасывает готовую пару на ривере." }),
      [
        { key: "check", label: "Чек", actionType: "check", correct: true, feedback: "Если лучшие руки почти не сбрасывают, блеф не достигает своей цели." },
        { key: "bet", label: "Ставка 14 BB", actionType: "raise", correct: false, feedback: "Большой размер не помогает, если диапазон соперника состоит из рук, которые он не собирается сбрасывать." },
        { key: "all-in", label: "Олл-ин", actionType: "all-in", correct: false, feedback: "Риск растёт, но цель блефа всё равно не выполняется без достаточных пасов." }
      ],
      "Блеф прибыльный только тогда, когда выбивает достаточно лучших рук."
    ),
    pokerSpot(
      "betting-purpose-multiway",
      "Ставка против нескольких игроков",
      "Два соперника чекнули. Как сыграть топ-пару со слабым кикером на очень связанной доске?",
      trainingTable({ heroPosition: "CO", villainPosition: "BB", heroCards: ["Kd", "9d"], boardCards: ["Kh", "Qs", "Jh"], street: "flop", pot: 8, actionLine: ["SB чек", "BB чек"], historyLine: "В банке трое; у соперников больше возможных сильных рук и дро." }),
      [
        { key: "check", label: "Чек", actionType: "check", correct: true, feedback: "В мультипоте на связанной доске слабая топ-пара редко получает три улицы от худших рук и плохо переносит рейз." },
        { key: "bet", label: "Ставка 7 BB", actionType: "raise", correct: false, feedback: "Крупная ставка часто оставляет в раздаче сильные пары, две пары, стриты и мощные дро." },
        { key: "all-in", label: "Олл-ин", actionType: "all-in", correct: false, feedback: "Рука не настолько сильна, чтобы рисковать всем стеком против двух диапазонов." }
      ],
      "Чем больше соперников, тем сильнее должна быть причина для ставки."
    ),
    pokerSpot(
      "betting-purpose-thin-river",
      "Тонкий добор на ривере",
      "BB чекнул ривер. Как сыграть с топ-парой и средним кикером?",
      trainingTable({ heroCards: ["Kc", "Td"], boardCards: ["Kh", "8s", "4d", "2c", "7h"], street: "river", pot: 10, actionLine: ["BB чек"], historyLine: "Соперник способен заплатить с K9, K8 и парой ниже короля." }),
      [
        { key: "small", label: "Ставка 4 BB", actionType: "raise", correct: true, feedback: "Небольшая ставка получает колл от нескольких худших пар и не требует рисковать большой частью банка." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "Чек безопасен, но пропускает добор с рук, которые готовы оплатить небольшой размер." },
        { key: "large", label: "Ставка 10 BB", actionType: "raise", correct: false, feedback: "Крупный размер чаще оставляет в продолжении сильные короли и выбивает худшие пары." }
      ],
      "Тонкое вэлью ищет размер, который достаточно часто оплачивают худшие руки."
    ),
    pokerSpot(
      "betting-purpose-blocker-bluff",
      "Блеф с полезным блокером",
      "BB чекнул ривер. У тебя нет пары, но туз пик блокирует натсовый флеш. Как сыграть?",
      trainingTable({ heroCards: ["As", "Qd"], boardCards: ["Ks", "9s", "4s", "2c", "7d"], street: "river", pot: 12, actionLine: ["BB чек"], historyLine: "Соперник часто доходит до ривера с одной парой без пики." }),
      [
        { key: "bet", label: "Ставка 9 BB", actionType: "raise", correct: true, feedback: "Туз пик уменьшает число сильнейших флешей у соперника, а крупная ставка может выбить одну пару." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "На вскрытии туз-хай редко выигрывает; полезный блокер делает эту руку лучше многих других кандидатов для блефа." },
        { key: "small", label: "Ставка 2 BB", actionType: "raise", correct: false, feedback: "Малый размер даёт одной паре слишком простую цену колла и редко выполняет цель блефа." }
      ],
      "Хороший блеф не только слаб на вскрытии, но и блокирует часть сильных рук соперника."
    ),
    pokerSpot(
      "betting-purpose-size-target",
      "Размер под цель",
      "Пассивный соперник часто коллирует с дро и парами. Как ставить две пары на мокром тёрне?",
      trainingTable({ heroCards: ["Kh", "Qd"], boardCards: ["Ks", "Qh", "9s", "8c"], street: "turn", pot: 11, actionLine: ["BB чек"], historyLine: "Много пар и дро готовы продолжать против крупной ставки." }),
      [
        { key: "large", label: "Ставка 9 BB", actionType: "raise", correct: true, feedback: "Сильная рука получает вэлью сейчас, пока пары и многочисленные дро готовы платить." },
        { key: "small", label: "Ставка 2 BB", actionType: "raise", correct: false, feedback: "Малый размер недобирает с диапазона, который способен оплатить заметно больше." },
        { key: "check", label: "Чек", actionType: "check", correct: false, feedback: "Чек пропускает улицу вэлью и бесплатно показывает ривер многочисленным дро." }
      ],
      "Размер ставки растёт, когда худших рук, готовых платить, много и доска быстро меняется."
    ),
    pokerSpot(
      "betting-purpose-small-cbet",
      "Небольшая ставка на сухой доске",
      "BB чекнул сухой флоп с тузом. Как использовать преимущество диапазона с KQ?",
      trainingTable({ heroCards: ["Kc", "Qd"], boardCards: ["Ah", "7s", "2c"], street: "flop", pot: 5, actionLine: ["BB чек"], historyLine: "У префлоп-рейзера больше сильных Ax; доска почти не содержит дро." }),
      [
        { key: "small", label: "Ставка 1,5 BB", actionType: "raise", correct: true, feedback: "Небольшой размер выбивает часть рук без пары и не требует большого риска на статичной доске." },
        { key: "large", label: "Ставка 5 BB", actionType: "raise", correct: false, feedback: "Размер банка рискует слишком многим: слабые руки всё равно уйдут в пас, а тузы продолжат." },
        { key: "all-in", label: "Олл-ин", actionType: "all-in", correct: false, feedback: "Олл-ин не соответствует ни силе руки, ни объёму фолдов, который нужен на такой доске." }
      ],
      "На сухой доске небольшая ставка часто достигает цели с меньшим риском."
    ),
    pokerSpot(
      "betting-purpose-pot-control",
      "Контроль банка",
      "BB чекнул опасный тёрн. Как сыграть топ-пару со слабым кикером?",
      trainingTable({ heroCards: ["Js", "8s"], boardCards: ["Jh", "Tc", "9d", "Qc"], street: "turn", pot: 9, actionLine: ["BB чек"], historyLine: "Закрылись многие стриты; худшим парам трудно коллировать ещё одну крупную ставку." }),
      [
        { key: "check", label: "Чек", actionType: "check", correct: true, feedback: "Чек сохраняет вскрытие и не раздувает банк там, где худшие руки редко платят, а лучшие почти не сбрасывают." },
        { key: "bet", label: "Ставка 7 BB", actionType: "raise", correct: false, feedback: "Крупная ставка получает мало коллов от худших рук и часто встречает продолжение сильного диапазона." },
        { key: "all-in", label: "Олл-ин", actionType: "all-in", correct: false, feedback: "Риск всем стеком не создаёт достаточного вэлью и не выбивает большинство сильных рук." }
      ],
      "Иногда лучшая цель — сохранить шоудаун-вэлью и не строить большой банк без нужных коллов или пасов."
    )
  ];
  for (const spot of spots) spot.hint = "Назови цель ставки: кто хуже заплатит или кто лучше сбросит?";
  return spots;
}

function buildDecisionLogicSpots() {
  const rows = [
    ["outcome", "Ты сделал прибыльный колл, но дро не закрылось. Как оценить решение?", "Решение могло быть верным, даже если эта раздача проиграна", "Качество решения задают доступные данные и ожидание, а не одна карта ривера.", ["Любой проигрыш доказывает ошибку", "Нужно было выбрать действие, которое гарантирует победу"]],
    ["sequence", "В каком порядке собирать решение?", "Позиция → стек → действия до тебя → цена → структура доски", "Такой порядок защищает от решения по одной красивой карте.", ["Сначала нажать привычную кнопку, затем искать причину", "Сначала вспомнить исход прошлой раздачи"]],
    ["effective", "Какой стек определяет максимальный риск один на один?", "Меньший из двух стеков", "Лишние фишки большего стека не могут быть проиграны этому сопернику в текущей раздаче.", ["Всегда средний стек турнира", "Сумма обоих стеков"]],
    ["alternatives", "Что сравнивать перед коллом?", "Ожидание колла, паса и доступного рейза", "Лучшее решение находится сравнением реальных альтернатив, а не оценкой одной кнопки в вакууме.", ["Только шанс выиграть банк", "Только силу своей стартовой руки"]],
    ["uncertainty", "Точный диапазон соперника неизвестен. Что делать?", "Проверить решение на разумном узком и широком диапазоне", "Если действие остаётся лучшим в обоих сценариях, оно устойчивее к ошибке оценки.", ["Придумать одно точное число и считать его фактом", "Игнорировать диапазон полностью"]],
    ["repeat", "После серии повторяется одна и та же ошибка. Какой следующий шаг?", "Выделить пропущенный сигнал и решить похожую серию", "Навык меняется, когда исправляется причина, а не запоминается одна правильная кнопка.", ["Увеличить число столов без разбора", "Разбирать только самую крупную проигранную раздачу"]],
    ["information", "Как поступить, если в условии не хватает позиции опенера или размера ставки?", "Не угадывать: сначала восстановить недостающий контекст", "Без ключевого сигнала точный ответ может быть выдуманным.", ["Выбрать самое агрессивное действие", "Считать все позиции и размеры одинаковыми"]],
    ["review", "Что полезнее записать после сложного решения?", "Сигнал, который перевернул выбор, и свою точку сомнения", "Такая заметка помогает быстро найти повторяющийся лик и задать точный вопрос.", ["Только выигранную или проигранную сумму", "Только название своей руки"]],
    ["fact", "Что в разборе нужно отделить от предположения?", "Факты раздачи — от оценки диапазона и тенденций соперника", "Позиция, стек и размеры известны; диапазон и частоты остаются гипотезой, которую полезно проверять.", ["Считать любую догадку точным фактом", "Игнорировать известные размеры ставок"]],
    ["sensitivity", "Как понять, какой сигнал действительно меняет решение?", "Менять по одному допущению и сравнивать лучший ответ", "Проверка по одному параметру показывает, что именно переворачивает выбор и где проходит граница.", ["Одновременно изменить стек, диапазон и размер", "Сравнить только результаты двух случайных раздач"]]
  ];
  const spots = rows.map(([id, question, answer, feedback, wrongs]) => conceptSpot(
    `decision-logic-${id}`,
    "Логика решения",
    question,
    [
      option("right", answer, true, feedback),
      option("wrong-a", wrongs[0], false, feedback),
      option("wrong-b", wrongs[1], false, feedback)
    ],
    "Отделяй качество решения от результата одной раздачи."
  ));
  const stateSpot = conceptSpot(
    "decision-logic-abc-state",
    "Состояние игрока",
    "Решения стали быстрыми, злость толкает нажать привычную кнопку, а новые сигналы почти не замечаются. Что происходит и что делать?",
    [
      option("reset", "Эмоциональный автопилот: остановиться и восстановить внимание", true, "Ранний стоп не лечит результат, а возвращает способность замечать сигналы и выбирать линию."),
      option("volume", "Осознанная лучшая игра: добавить столы и ускориться", false, "Осознанная игра требует внимания к новым сигналам; импульсивность указывает на противоположное состояние."),
      option("ignore", "Рабочий автоматизм: продолжать без изменений", false, "Если решения диктует эмоция, игнорирование сигнала закрепляет автопилот вместо возврата к рабочему состоянию.")
    ],
    "Лучшая игра — осознанный анализ; рабочая — освоенный автоматизм; эмоциональная — реакция без проверки новых сигналов."
  );
  stateSpot.mediaMoment = { mediaId: "35-start_za_stolom_vebinar_02", start: 1774.39 };
  spots.push(stateSpot);
  return spots;
}

function buildOpponentSpots(kind) {
  const aggressive = kind === "versus-aggressive";
  const scenarios = aggressive ? [
    {
      id: "top-pair",
      question: "Ты поставил небольшой контбет с топ-парой, а агрессивный BB сделал чек-рейз. Что делать?",
      table: trainingTable({ heroCards: ["As", "Qd"], boardCards: ["Qh", "7c", "2s"], street: "flop", pot: 14, toCall: 6, actionLine: ["BB чек", "BTN ставка 2,5 BB", "BB рейз до 8,5 BB"], historyLine: "Соперник часто чек-рейзит и продолжает блефовать." }),
      correct: "call",
      choices: [["call", "Колл 6 BB"], ["fold", "Пас"], ["raise", "Рейз до 20 BB"]],
      feedback: "Колл сохраняет блефы соперника и оставляет решение на тёрн; немедленный рейз выбивает его слабую часть."
    },
    {
      id: "missed-draw",
      question: "На ривере флеш-дро не закрылось, а агрессивный BB поставил крупно. Что делать с валетом как старшей картой?",
      table: trainingTable({ heroCards: ["Jh", "Th"], boardCards: ["Ah", "8h", "3c", "2s", "Kc"], street: "river", pot: 24, toCall: 18, actionLine: ["BB ставка 18 BB"], historyLine: "У тебя нет готовой руки и нет блокера на натсовый флеш." }),
      correct: "fold",
      choices: [["fold", "Пас"], ["call", "Колл 18 BB"], ["raise", "Олл-ин"]],
      feedback: "Высокая агрессия не превращает любую руку в колл: валет как старшая карта почти не выигрывает на вскрытии."
    },
    {
      id: "value",
      question: "Агрессивный BB чекнул ривер. Как сыграть с натсовым флешем?",
      table: trainingTable({ heroCards: ["Ah", "Jh"], boardCards: ["Kh", "7h", "2c", "4s", "9h"], street: "river", pot: 16, actionLine: ["BB чек"], historyLine: "Соперник часто отвечает рейзом на ставки." }),
      correct: "bet",
      choices: [["bet", "Ставка 11 BB"], ["check", "Чек"], ["small", "Ставка 2 BB"]],
      feedback: "Ставь на вэлью: агрессивный профиль может заплатить хуже или сам повысить ставку."
    },
    {
      id: "position",
      question: "Агрессивный BTN открывает широко. Ты на BB с A5s и стеком 28 BB. Как ответить?",
      table: trainingTable({ heroPosition: "BB", villainPosition: "BTN", heroStack: 28, heroCards: ["Ah", "5h"], pot: 4.7, toCall: 1.2, actionLine: ["BTN рейз до 2,2 BB"], historyLine: "Широкий опен BTN даёт больше фолд-эквити ответному 3-бету." }),
      correct: "raise",
      choices: [["raise", "3-бет до 8 BB"], ["call", "Колл 1,2 BB"], ["fold", "Пас"]],
      feedback: "A5s блокирует сильные Ax, сохраняет играбельность при колле и хорошо подходит для 3-бета."
    },
    {
      id: "trap",
      question: "Агрессивный соперник ставит второй баррель на безопасном тёрне. У тебя топ-сет. Как продолжить?",
      table: trainingTable({ heroCards: ["Qs", "Qd"], boardCards: ["Qh", "7c", "2s", "4d"], street: "turn", pot: 21, toCall: 9, actionLine: ["BB ставка 3 BB", "BTN колл", "BB ставка 9 BB"], historyLine: "Рука сильна и почти не нуждается в защите до ривера." }),
      correct: "call",
      choices: [["call", "Колл 9 BB"], ["raise", "Рейз до 25 BB"], ["fold", "Пас"]],
      feedback: "Колл оставляет в диапазоне соперника все блефы и даёт ему возможность поставить ривер."
    },
    {
      id: "turn-raise",
      question: "Ты поставил топ-пару на флопе и тёрне, а соперник ответил крупным рейзом. Как продолжить?",
      table: trainingTable({ heroCards: ["Ah", "Qd"], boardCards: ["Qc", "8d", "3s", "2h"], street: "turn", pot: 44, toCall: 12, actionLine: ["BB чек · флоп", "BTN ставка 4 BB", "BB колл · флоп", "BB чек · тёрн", "BTN ставка 9 BB", "BB рейз до 21 BB"], historyLine: "Новый рейз на тёрне резко усиливает диапазон даже активного соперника." }),
      correct: "fold",
      choices: [["fold", "Пас"], ["call", "Колл 12 BB"], ["raise", "Олл-ин"]],
      feedback: "Топ-пара добирала две улицы, но редкий крупный рейз тёрна меняет диапазон: здесь не нужно защищать прошлые вложения.",
      mediaMoment: { mediaId: "23-protiv_agressii", start: 65.94 }
    },
    {
      id: "second-pair-pressure",
      question: "После крупного колла на флопе соперник снова ставит крупно по бланковому тёрну. Что делать со второй парой?",
      table: trainingTable({ heroPosition: "BB", villainPosition: "BTN", heroCards: ["Jh", "9h"], boardCards: ["Kc", "9d", "4s", "2c"], street: "turn", pot: 30, toCall: 14, actionLine: ["BTN ставка 6 BB · флоп", "BB колл · флоп", "BTN ставка 14 BB · тёрн"], historyLine: "Вторая крупная ставка подряд оставляет меньше случайных блефов, чем один широкий контбет." }),
      correct: "fold",
      choices: [["fold", "Пас"], ["call", "Колл 14 BB"], ["raise", "Олл-ин"]],
      feedback: "Одну ставку вторая пара выдерживает, но повторный крупный баррель по бланку требует намного более сильного блеф-кетчера.",
      mediaMoment: { mediaId: "23-protiv_agressii", start: 205.8 }
    },
    {
      id: "count-missed-draws",
      question: "Широкий BTN поставил три улицы, а на ривере промахнулись стрит- и флеш-дро. Как сыграть второй парой?",
      table: trainingTable({ heroPosition: "BB", villainPosition: "BTN", heroCards: ["Qs", "2d"], boardCards: ["Qh", "9s", "7s", "3c", "Ac"], street: "river", pot: 37, toCall: 13, actionLine: ["BTN ставка 3 BB · флоп", "BB колл · флоп", "BTN ставка 7 BB · тёрн", "BB колл · тёрн", "BTN ставка 13 BB · ривер"], historyLine: "В широком диапазоне BTN промахнулись KJ, KT, JT, T8 и часть флеш-дро; цена колла заметно ниже банка." }),
      correct: "call",
      choices: [["call", "Колл 13 BB"], ["fold", "Пас"], ["raise", "Олл-ин"]],
      feedback: "Колл оправдан не ярлыком «агрессивный», а конкретным числом промахнувшихся дро и приемлемой ценой.",
      mediaMoment: { mediaId: "23-protiv_agressii", start: 128.84 }
    }
  ] : [
    {
      id: "thin-value",
      question: "Пассивный BB чекнул три улицы. У тебя вторая пара на безопасном ривере. Как сыграть?",
      table: trainingTable({ heroCards: ["As", "7s"], boardCards: ["Kc", "7d", "3h", "2s", "2c"], street: "river", pot: 8, actionLine: ["BB чек · флоп", "BTN чек", "BB чек · тёрн", "BTN чек", "BB чек · ривер"], historyLine: "Худшие семёрки и карманные пары могут заплатить небольшой размер." }),
      correct: "bet",
      choices: [["bet", "Ставка 3 BB"], ["check", "Чек"], ["all-in", "Олл-ин"]],
      feedback: "Небольшая ставка добирает с худших пар, не превращая руку в большой банк."
    },
    {
      id: "big-bet",
      question: "Обычно пассивный соперник внезапно ставит почти банк на ривере. Что делать со второй парой?",
      table: trainingTable({ heroCards: ["Kd", "Qd"], boardCards: ["Kh", "8c", "4s", "2d", "Ac"], street: "river", pot: 14, toCall: 12, actionLine: ["BB ставка 12 BB"], historyLine: "Этот соперник редко делает крупные риверные блефы." }),
      correct: "fold",
      choices: [["fold", "Пас"], ["call", "Колл 12 BB"], ["raise", "Олл-ин"]],
      feedback: "Редкая крупная агрессия пассивного профиля обычно смещена к сильным рукам."
    },
    {
      id: "draw",
      question: "Пассивный BB заколлировал флоп. На тёрне появилось больше дро, а у тебя оверпара. Как сыграть?",
      table: trainingTable({ heroCards: ["Ah", "Ad"], boardCards: ["Jh", "Th", "7c", "2s"], street: "turn", pot: 11, actionLine: ["BB чек", "BTN ставка 3 BB", "BB колл", "BB чек"], historyLine: "Пассивный соперник платит с парами и дро, но редко рейзит без сильной руки." }),
      correct: "bet",
      choices: [["bet", "Ставка 8 BB"], ["check", "Чек"], ["small", "Ставка 2 BB"]],
      feedback: "Добирай крупнее сейчас: пары и дро платят, а множество риверов остановит экшен."
    },
    {
      id: "bluff",
      question: "Пассивный соперник коллировал две улицы, а ривер ничего не изменил. Как сыграть с промахнувшимися оверкартами?",
      table: trainingTable({ heroCards: ["Ah", "Qh"], boardCards: ["Kc", "8d", "4s", "2h", "2c"], street: "river", pot: 18, actionLine: ["BB чек"], historyLine: "Готовые пары в его диапазоне редко сбрасывают на третью ставку." }),
      correct: "check",
      choices: [["check", "Чек"], ["bet", "Ставка 14 BB"], ["all-in", "Олл-ин"]],
      feedback: "Чек лучше: блеф не выполняет цель, если соперник почти не сбрасывает готовые пары."
    },
    {
      id: "initiative",
      question: "Пассивный HJ вошёл лимпом. Ты на CO с KJs. Как сыграть?",
      table: trainingTable({ heroPosition: "CO", villainPosition: "HJ", heroCards: ["Ks", "Js"], pot: 2.5, toCall: 1, actionLine: ["HJ лимп 1 BB"], historyLine: "Лимпер часто входит со слабым широким диапазоном." }),
      correct: "raise",
      choices: [["raise", "Изолейт до 4 BB"], ["call", "Колл 1 BB"], ["fold", "Пас"]],
      feedback: "Изолейт забирает инициативу и стремится оставить слабый диапазон один на один в позиции."
    },
    {
      id: "checked-to-river",
      question: "Соперник трижды передал ход чеком, а у тебя нет готовой руки. Как использовать ривер?",
      table: trainingTable({ heroCards: ["7s", "6s"], boardCards: ["Kh", "Qd", "2c", "2h", "5d"], street: "river", pot: 9, actionLine: ["BB чек · флоп", "BTN чек", "BB чек · тёрн", "BTN чек", "BB чек · ривер"], historyLine: "Три чека оставили у соперника много рук без сильной пары; семёрка как старшая почти не выигрывает на вскрытии." }),
      correct: "bet",
      choices: [["bet", "Ставка 4,5 BB"], ["check", "Чек"], ["all-in", "Олл-ин"]],
      feedback: "Средний размер превращает руку без вскрытия в осмысленный блеф после трёх признаков слабости.",
      mediaMoment: { mediaId: "24-protiv_passiva", start: 31.44 }
    },
    {
      id: "delayed-turn",
      question: "Флоп прошёл чек-чек, на тёрне соперник снова чекнул. Что делать с оверкартами и гатшотом?",
      table: trainingTable({ heroCards: ["Qs", "Js"], boardCards: ["9c", "4d", "2s", "8h"], street: "turn", pot: 8, actionLine: ["BB чек · флоп", "BTN чек", "BB чек · тёрн"], historyLine: "Повторный чек ослабляет диапазон; у руки есть четыре десятки на стрит и оверкарты." }),
      correct: "bet",
      choices: [["bet", "Ставка 6 BB"], ["check", "Чек"], ["all-in", "Олл-ин"]],
      feedback: "Отложенная крупная ставка сочетает фолд-эквити с шансом усилиться; после колла план нужно пересобрать на ривере.",
      mediaMoment: { mediaId: "24-protiv_passiva", start: 49.18 }
    },
    {
      id: "delayed-river-stop",
      question: "Ты поставил крупно на тёрне после чек-чек флопа, получил колл и промахнулся на ривере. Как продолжить?",
      table: trainingTable({ heroCards: ["Qs", "Js"], boardCards: ["9c", "4d", "2s", "8h", "3c"], street: "river", pot: 20, actionLine: ["Флоп чек-чек", "BB чек · тёрн", "BTN ставка 6 BB", "BB колл", "BB чек · ривер"], historyLine: "Колл тёрна сохранил у пассивного соперника пары; ривер не усилил твои оверкарты и гатшот." }),
      correct: "check",
      choices: [["check", "Чек"], ["bet", "Ставка 13 BB"], ["all-in", "Олл-ин"]],
      feedback: "Одна отложенная попытка была оправданна, но после колла и промаха второй блеф часто атакует диапазон, который не собирается сдаваться.",
      mediaMoment: { mediaId: "24-protiv_passiva", start: 49.18 }
    }
  ];
  return scenarios.map((scenario) => {
    const choices = scenario.choices.map(([key, label]) => ({
      key,
      label,
      actionType: typeForAction(key),
      correct: key === scenario.correct,
      feedback: key === scenario.correct
        ? scenario.feedback
        : aggressive
          ? "Сверь силу руки с линией: сохраняй блефы соперника, но не превращай его агрессию в автоматический колл."
          : "Сверь профиль с целью: добирай с худших рук, а редкую крупную силу оценивай строго."
    }));
    const spot = pokerSpot(`${kind}-${scenario.id}`, aggressive ? "Против агрессии" : "Против пассивного соперника", scenario.question, scenario.table, choices, scenario.feedback);
    if (scenario.mediaMoment) spot.mediaMoment = scenario.mediaMoment;
    spot.hint = aggressive ? "Отдели частую агрессию от реальной цены конкретного колла." : "Спроси, какие худшие руки заплатят и насколько часто этот профиль блефует.";
    return spot;
  });
}

function buildProfessionSpots(id) {
  const bank = {
    "course-start": [
      ["route", "Как проходить стратегический урок?", "Сначала принять решение, затем разобрать идею и закрепить серией", "Первый ответ создаёт вопрос, теория объясняет его, практика превращает в навык."],
      ["mistake", "Что делать после ошибки?", "Разобрать причину и повторить похожую ситуацию", "Промах полезен, если ты можешь назвать пропущенный сигнал."],
      ["score", "Что важнее одного результата банка?", "Качество решения на дистанции", "Правильный пуш иногда проигрывает, неправильный колл иногда выигрывает."],
      ["pace", "Какой темп лучше новичку?", "Короткие регулярные сессии с разбором", "Автоматизм строится повторением, а не одним марафоном."],
      ["chart", "Как использовать чарт?", "Как карту для проверки, а не как замену чтению спота", "Позиция, стек, сайз и экшен определяют, какой чарт вообще нужен."],
      ["finish", "Когда переходить дальше?", "Когда решение узнаётся без паузы и держится в серии", "Один угаданный ответ ещё не навык."]
    ],
    "poker-world": [
      ["ecosystem", "Что поддерживает покерную экосистему?", "Много игроков разной силы, турниры и честная инфраструктура", "Игра живёт, когда у людей есть понятный вход, безопасные правила и путь роста."],
      ["rake", "Почему рейк важен?", "Он уменьшает тонкое ожидание и требует выбирать более ясные споты", "Маленькое преимущество до комиссии может исчезнуть после неё."],
      ["format", "Почему нельзя смешивать MTT и кеш-стратегию?", "Структура блайндов, вылет и выплаты меняют решения", "В турнире стек измеряется в BB и постоянно меняется."],
      ["edge", "Откуда берётся преимущество игрока?", "Из более качественных повторяемых решений", "Разовая удача не создаёт преимущества; системный процесс создаёт его на дистанции."],
      ["honesty", "Что нельзя контролировать?", "Короткий результат раздач", "Контролируй подготовку, выбор игр, решения и разбор."],
      ["network", "Зачем нужна команда и обучение?", "Чтобы быстрее находить системные ошибки", "Внешняя обратная связь защищает от слепых зон."]
    ],
    "poker-profession": [
      ["routine", "Что делает игру профессией?", "Режим, учёт, обучение и ответственность за риск", "Количество столов само по себе не превращает игру в профессию."],
      ["study", "Когда планировать обучение?", "До того, как усталость съест внимание", "Учебные блоки должны стоять в расписании так же, как игровые."],
      ["volume", "Что считать хорошим объёмом?", "Тот, который сохраняет качество решений", "Лишние столы с автопилотом могут ухудшить результат."],
      ["review", "Что разбирать после сессии?", "Повторяющиеся решения, а не только крупные проигрыши", "Мелкий лик, который повторяется сотни раз, часто дороже одного кулера."],
      ["health", "Что входит в рабочий инструмент игрока?", "Сон, концентрация и эмоциональная устойчивость", "Уставший мозг хуже считает цену и чаще действует заранее."],
      ["risk", "Что отделять от банкролла?", "Деньги на жизнь", "Рабочий риск не должен угрожать базовой безопасности."]
    ],
    "poker-perspectives": [
      ["skills", "Какой навык переносится за пределы покера?", "Решения при неполной информации", "Ты учишься сравнивать риск, цену и альтернативы."],
      ["growth", "Как выглядит реальный рост?", "Меньше повторяющихся ошибок и больше устойчивых решений", "Лимит — следствие, а не единственный показатель прогресса."],
      ["variance", "Почему перспектива длинная?", "Дисперсия скрывает качество на коротком отрезке", "Оценивать процесс нужно сериями решений."],
      ["specialize", "Когда выбирать специализацию?", "После базовой грамотности и честной оценки сильных сторон", "Сначала фундамент, затем формат, расписание и поле."],
      ["technology", "Как технологии помогают игроку?", "Ускоряют практику и разбор, но не снимают ответственность за решение", "Инструмент полезен, когда ведёт к понятному действию."],
      ["next", "Как выбрать следующий шаг?", "По самому дорогому повторяющемуся лику", "Маршрут должен отвечать на реальные ошибки, а не на случайный интерес."]
    ],
    "microstakes": [
      ["simple", "Что сильнее всего на микролимитах?", "Простая дисциплинированная стратегия", "Не нужно выигрывать каждую раздачу сложным блефом."],
      ["value", "Где чаще лежит прибыль?", "В доборах с сильными руками и отказе от лишних коллов", "Поле чаще платит, чем превращает руки в большие блефы."],
      ["rake", "Почему маргинальные коллы опасны?", "Рейк съедает тонкое преимущество", "Выбирай споты с понятным запасом ожидания."],
      ["table", "Что важнее красивой линии?", "Слабости конкретного поля", "Стратегия нужна для реальных соперников, а не для демонстрации сложности."],
      ["bankroll", "Зачем запас бай-инов?", "Чтобы дисперсия не диктовала решения", "Недостаточный банкролл превращает обычный проигрыш в эмоциональное давление."],
      ["move", "Когда подниматься выше?", "Когда есть запас банкролла и устойчивое качество", "Один апстрик — не доказательство готовности."]
    ],
    "course-feedback": [
      ["strong", "Как выбрать сильный навык курса?", "Посмотреть, где держится точность в серии", "Ощущение уверенности проверяется решениями."],
      ["weak", "Как найти главный пробел?", "Сгруппировать ошибки по причине", "Позиция, цена, стек и диапазон дают более полезный маршрут, чем список проигрышей."],
      ["repeat", "Что повторять первым?", "Навык с частой и дорогой ошибкой", "Приоритет — частота × стоимость ошибки."],
      ["plan", "Как оформить следующий месяц?", "Один основной навык, объём практики и день разбора", "Слишком много целей размывают обратную связь."],
      ["signal", "Когда просить помощь?", "Когда причина ошибки неясна после разбора", "Хороший вопрос содержит спот, мысль и точку сомнения."],
      ["finish", "Что значит закончить FF Start?", "Получить базовый процесс самостоятельного решения", "Финиш курса — начало осмысленной практики."]
    ],
    "resources": [
      ["glossary", "Где быстро проверить термин?", "В словаре", "Термин лучше проверять до того, как строить на нём решение."],
      ["matrix", "Где увидеть все 169 стартовых классов рук?", "В матрице рук", "Пары идут по диагонали, suited выше, offsuit ниже."],
      ["rfi", "Какой справочник нужен первым входом?", "Диапазоны опен-рейзов", "Сначала позиция и стек, затем клетка руки."],
      ["iso", "Что открыть против лимпа?", "Диапазоны изолейта", "Количество лимперов и позиция меняют размер и нижнюю границу."],
      ["one-raise", "Что открыть против одного рейзера?", "План fold/call/3-bet", "Не смешивай защиту от рейза с первым входом."],
      ["vs3bet", "Что открыть после 3-бета?", "Диапазоны защиты против 3-бета", "Позиции, сайз и стек определяют ветку fold/call/4-bet."],
      ["bb", "Что проверить на BB?", "Цену колла и чарт защиты", "Вложенный блайнд делает колл дешевле, но не отменяет реализацию."],
      ["bvb", "Что открыть в blind vs blind?", "Отдельную BvB-ветку", "SB и BB играют шире, чем за полным столом."],
      ["push9", "Какой чарт нужен при 8 BB?", "Push/fold 0–9 BB", "В этой зоне min-open часто исчезает из базовой ветки."],
      ["push14", "Какой чарт нужен при 12 BB?", "Push/fold 10–14 BB", "Граница меняется по позиции, анте и давлению выплат."],
      ["reshove", "Что открыть после чужого рейза с коротким стеком?", "Диапазон 3-бет-пуша", "Сначала оцени позицию рейзера и эффективный стек."],
      ["odds", "Что открыть перед пограничным коллом?", "Шансы банка", "Цена = доплата / итоговый банк после колла."]
    ]
  };
  const distractors = {
    "course-start": [
      "Сразу открыть ответы и запоминать кнопки",
      "Пропускать разбор после каждого совпадения",
      "Оценивать навык по одной раздаче",
      "Проходить весь курс одним марафоном без повторения",
      "Выбирать чарт до чтения позиции и экшена",
      "Переходить дальше после первого верного ответа"
    ],
    "poker-world": [
      "Считать один выигранный турнир доказательством преимущества",
      "Игнорировать комиссию в пограничных решениях",
      "Использовать одну стратегию во всех форматах",
      "Оценивать поле только по размеру собственного стека",
      "Компенсировать ошибки простым увеличением числа столов",
      "Считать честность и безопасность площадки неважными"
    ],
    "poker-profession": [
      "Играть без расписания, пока хватает энергии",
      "Смешивать рабочий банкролл с деньгами на жизнь",
      "Разбирать только самые крупные проигрыши",
      "Добавлять столы даже при падении точности",
      "Отменять обучение после удачной недели",
      "Считать сон и концентрацию внешними мелочами"
    ],
    "poker-perspectives": [
      "Судить о росте только по текущему лимиту",
      "Выбирать специализацию до освоения базы",
      "Менять направление после каждой неудачной сессии",
      "Считать дисперсию доказательством отсутствия навыка",
      "Передавать инструменту ответственность за решение",
      "Учить тему только потому, что она выглядит сложнее"
    ],
    microstakes: [
      "Искать сложный блеф в каждой раздаче",
      "Коллировать шире, чтобы быстрее собрать информацию",
      "Игнорировать рейк в пограничных банках",
      "Подниматься по лимитам после одного апстрика",
      "Держать слишком маленький банкролл ради темпа",
      "Выбирать красивую линию вместо слабости поля"
    ],
    "course-feedback": [
      "Повторять только любимые уроки",
      "Собирать все ошибки в одну общую категорию",
      "Ставить сразу пять равных учебных целей",
      "Судить о навыке по ощущению уверенности",
      "Просить помощь без описания своего решения",
      "Считать финиш курса концом обучения"
    ],
    resources: [
      "Открыть случайный чарт с похожим названием",
      "Искать ответ только по силе двух карт",
      "Смешать первый вход и защиту против рейза",
      "Не учитывать позицию и эффективный стек",
      "Использовать диапазон глубокого стека при 8 BB",
      "Считать цену колла по размеру банка до доплаты",
      "Применять диапазон BB к любой позиции",
      "Выбирать ветку без чтения действий до тебя"
    ]
  };
  const hints = {
    "course-start": "Выбирай вариант, который превращает отдельный ответ в повторяемый навык.",
    "poker-world": "Отдели устойчивое преимущество от шума короткого результата.",
    "poker-profession": "Проверь, поддерживает ли решение качество игры на дистанции.",
    "poker-perspectives": "Ищи переносимый навык и измеримый следующий шаг.",
    microstakes: "Предпочитай простую линию с ясным запасом ожидания.",
    "course-feedback": "Смотри на частоту и цену повторяющейся ошибки.",
    resources: "Сначала определи позицию, стек и ветку экшена, затем выбирай справочник."
  };
  const wrongPool = distractors[id] || ["Игнорировать контекст", "Судить по одному исходу"];
  const spots = (bank[id] || []).map(([key, question, answer, feedback], index) => conceptSpot(
    `${id}-${key}`,
    "Решение вне стола",
    question,
    [
      option("target", answer, true, feedback),
      option("wrong-a", wrongPool[(index * 2) % wrongPool.length], false, "Этот вариант пропускает ключевой сигнал вопроса."),
      option("wrong-b", wrongPool[(index * 2 + 1) % wrongPool.length], false, "Сначала выбери критерий, который можно проверить на серии решений.")
    ],
    hints[id] || "Сначала назови критерий решения."
  ));
  if (id === "microstakes") {
    const resetSpot = pokerSpot(
      "microstakes-reset-next-hand",
      "Следующая раздача после переезда",
      "Прошлая раздача закончилась неприятным переездом. В новом неоткрытом банке ты на BTN с AQs и 30 BB. Как сыграть?",
      trainingTable({ heroPosition: "BTN", villainPosition: "BB", heroStack: 30, heroCards: ["As", "Qs"], pot: 2.5, toCall: 0, actionLine: ["До тебя все пас"], historyLine: "В прошлой раздаче ты проиграл олл-ин как фаворит. Новый спот нужно оценить заново." }),
      [
        option("raise", "Рейз 2 BB", true, "Стандартный опен сохраняет качество решения: прошлый ранаут не меняет позицию, стек и силу текущей руки."),
        option("fold", "Пас", false, "Пас под влиянием прошлого результата переносит эмоцию в новую независимую раздачу."),
        option("all-in", "Олл-ин", false, "Резкий олл-ин пытается отыграться, хотя текущий стек оставляет место для обычного опен-рейза.")
      ],
      "После сильной эмоции сначала восстанови контекст новой раздачи, затем действуй по её сигналам."
    );
    resetSpot.mediaMoment = { mediaId: "33-microlim_02", start: 394 };
    spots.push(resetSpot);
  }
  return spots;
}

const shell = loadWindow(["assets/poker-trainer-shell/packs.js"]).FFTrainerShellPacks;
const combinations = loadWindow(["assets/poker-combinations/data.js"]).PokerCombinationsData;
const tournament = loadWindow([
  "assets/poker-tournament/foundation-data.js",
  "assets/poker-tournament/foundation-command-data.js"
]).PokerTournamentFoundationData;
const rangeCall = loadWindow([
  "assets/poker-range-call/data.js",
  "assets/poker-range-call/lab-data.js"
]).PokerRangeCallData;
const bb = loadWindow([
  "assets/poker-bb-defense/data.js",
  "assets/poker-bb-defense/lab-data.js"
]).PokerBbDefenseData;
const short = loadWindow([
  "assets/poker-short-stack/data.js",
  "assets/poker-short-stack/lab-data.js"
]).PokerShortStackData;
const outs = loadWindow([
  "assets/poker-outs/data.js",
  "assets/poker-outs/lab-data.js"
]).PokerOutsData;
const icm = loadWindow([
  "assets/poker-icm-short/data.js",
  "assets/poker-icm-short/lab-data.js"
]).PokerIcmShortData;
const isolation = readJson("assets/poker-isolation/data.lazy.json");
const flop = readJson("assets/poker-postflop-aggressor/data.lazy.json");
const threeBet = readJson("assets/poker-vs-3bet/data.lazy.json");
const exam = readJson("assets/poker-mixed-exam/data.lazy.json");

const firstHand = (shell?.packs || []).find((pack) => pack.id === "trainer-shell-first-hand")?.spots || [];
const tournamentSpots = tournament.spots || [];
const rangeSpots = rangeCall.spots || [];
const bbSpots = bb.spots || [];
const shortSpots = short.spots || [];
const icmSpots = icm.spots || [];

function normalizeMany(rows, lessonId) {
  return rows.map((row, index) => normalizeSpot(row, lessonId, index));
}

function roundedNumber(value) {
  const parsed = number(value, 0);
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function learnerNumber(value) {
  return String(roundedNumber(value)).replace(".", ",");
}

function buildColdCallSpots(rows) {
  return normalizeMany(rows, "cold-call").map((spot, index) => {
    const raw = rows[index];
    const rawOpener = text(raw.opener || raw.openerPosition || "соперник");
    const isSbLimp = /SB\s+limp/i.test(rawOpener) || /SB\s+limps/i.test(text(raw.tableState));
    const opener = isSbLimp ? "SB" : rawOpener;
    const openSize = learnerNumber(raw.openSizeBb || 2.2);
    const price = learnerNumber(raw.callPriceBb || raw.toCallBb || 0);
    const hand = text(raw.hand || spot.table.heroCards.map(cardDisplay).join(" "));
    const correct = spot.options.find((choice) => choice.correct);
    const reason = isSbLimp && (correct?.actionType === "raise" || /raise|iso|рейз|изол/i.test(correct?.key))
      ? `${hand} подходит для изолейта против лимпа SB: блокер и инициатива дают больше, чем пассивный чек.`
      : isSbLimp && (correct?.actionType === "check" || /check|чек/i.test(correct?.key))
        ? `${hand} не получает достаточно фолдов или плохо играет в крупном банке; бесплатный чек сохраняет эквити.`
        : correct?.actionType === "call" || /call|колл/i.test(correct?.key)
      ? `Колл проходит по цене ${price} BB: ${hand} достаточно хорошо реализует эквити против открытия с ${opener}.`
      : correct?.actionType === "raise" || /three|raise|3-бет/i.test(correct?.key)
        ? `3-бет использует блокеры и фолд-эквити; пассивный колл этой рукой реализует эквити хуже.`
        : `Пас сохраняет фишки: против открытия с ${opener} рука ${hand} слишком часто доминирована или плохо реализует эквити.`;
    spot.question = isSbLimp
      ? `SB вошёл лимпом. Ты на BB с ${hand} и бесплатным чеком. Чек или изолейт?`
      : `${opener} открыл до ${openSize} BB. Ты на ${spot.table.heroPosition} с ${hand}, к коллу ${price} BB. Как сыграть?`;
    spot.hint = isSbLimp
      ? "Изолейт должен выигрывать за счёт силы руки, блокеров и инициативы: чек уже доступен бесплатно."
      : "Сверь цену, доминацию, позицию опенера и игроков позади.";
    spot.wisdom = reason;
    spot.table.actionLine = isSbLimp ? ["SB лимп 1 BB"] : [`${opener} рейз до ${openSize} BB`];
    spot.options = spot.options.map((choice) => ({
      ...choice,
      feedback: choice.correct ? reason : `Базовая линия — ${correct.label}. ${reason}`
    }));
    return spot;
  });
}

function buildPreflopStartSpots(rows) {
  return normalizeMany(rows, "preflop-start").map((spot) => {
    if (spot.id !== "preflop-start-first-hand-shell-preflop-kqs-btn") return spot;
    spot.question = "До тебя все спасовали. Ты на BTN с K♠ Q♠ и стеком 40 BB. Как открыть раздачу?";
    spot.table.pot = "1,5 BB";
    spot.table.historyLine = "До тебя все спасовали · ты на BTN · в банке блайнды 1,5 BB";
    return spot;
  });
}

function buildBlindVersusBlindSpots(rows) {
  return normalizeMany(rows, "blind-versus-blind").map((spot, index) => {
    const raw = rows[index];
    const hand = text(raw.hand || spot.table.heroCards.map(cardDisplay).join(" "));
    const isoSize = learnerNumber(raw.isoTargetBb || 3.5);
    const correct = spot.options.find((choice) => choice.correct);
    const isIso = /iso|изол/i.test(correct?.key) || /изол/i.test(correct?.label);
    const reason = isIso
      ? `${hand} входит в диапазон изолейта против лимпа SB. Повышай до ${isoSize} BB и забирай инициативу.`
      : `${hand} слишком слаба для прибыльного изолейта. Чек бесплатно реализует эквити и сохраняет банк небольшим.`;
    spot.question = `SB вошёл лимпом. Ты на BB с ${hand} и стеком ${learnerNumber(raw.stackBb)} BB. Чек или изолейт?`;
    spot.hint = "Чек бесплатный, поэтому изолейт должен выигрывать у него за счёт силы руки и инициативы.";
    spot.wisdom = reason;
    spot.options = spot.options.map((choice) => ({
      ...choice,
      label: /iso|изол/i.test(choice.key) ? `Изолейт до ${isoSize} BB` : choice.label,
      feedback: choice.correct ? reason : `Базовая линия — ${correct.label}. ${reason}`
    }));
    return spot;
  });
}

const cbetCheckSpotIds = new Set([
  "cbet-in-position-test_kontbet_n_09414b96_ai_1764105069_6f100069",
  "cbet-in-position-test_kontbet_n_5214e3fb_start-009-2-main-11",
  "cbet-in-position-test_kontbet_n_5214e3fb_start-009-2-main-17",
  "cbet-in-position-test_kontbet_n_6112eafc_start-009-3-main-9",
  "cbet-in-position-test_kontbet_n_6112eafc_start-009-3-main-10",
  "cbet-in-position-test_kontbet_n_6112eafc_start-009-3-main-13"
]);

function buildCbetSpots(rows) {
  return normalizeMany(rows, "cbet-in-position").map((spot) => {
    if (!cbetCheckSpotIds.has(spot.id)) return spot;
    const reason = "Чек сохраняет эквити и не раздувает банк на доске, которая хорошо попадает в диапазон большого блайнда. Автоматический контбет здесь слишком часто получает продолжение.";
    spot.wisdom = reason;
    spot.options = spot.options.map((choice) => ({
      ...choice,
      correct: choice.actionType === "check" || /^чек$/iu.test(choice.label),
      feedback: choice.actionType === "check" || /^чек$/iu.test(choice.label)
        ? reason
        : `Эта ставка переоценивает преимущество диапазона на динамичной или спаренной доске. ${reason}`
    }));
    return spot;
  });
}

function compoundCheckPlan(choice) {
  const label = text(choice?.label).toLowerCase();
  if (!/^чек[\s–—-]*(?:колл|пас)/iu.test(label)) return "";
  return /пас/iu.test(label) ? "fold" : "call";
}

function roundedHalfBb(value) {
  return Math.max(0.5, Math.round(Number(value || 0) * 2) / 2);
}

function splitCompoundCheckDecisions(spots) {
  return spots.flatMap((spot) => {
    if (bbNumber(spot.table?.toCall) > 0) return [spot];
    const compound = spot.options.filter((choice) => compoundCheckPlan(choice));
    if (!compound.length) return [spot];

    const originalCorrect = spot.options.find((choice) => choice.correct);
    const response = compoundCheckPlan(originalCorrect);
    const checkIsCorrect = Boolean(response);
    const currentOptions = spot.options.filter((choice) => !compoundCheckPlan(choice)).map((choice) => ({
      ...choice,
      correct: checkIsCorrect ? false : choice.correct
    }));
    currentOptions.push({
      key: "check",
      label: "Чек",
      actionType: "check",
      correct: checkIsCorrect,
      feedback: checkIsCorrect
        ? "Сейчас перед тобой нет ставки, поэтому сначала доступен только чек. Решение колл или пас появится после действия соперника."
        : `Чек допустим, но базовая линия здесь — ${originalCorrect?.label || "ставка"}: рука выигрывает от инициативы уже сейчас.`
    });
    const current = {
      ...spot,
      question: `${spot.question.replace(/[?!.]+$/u, "")} Какое действие доступно прямо сейчас?`,
      hint: "Выбирай только действие, которое доступно в текущем состоянии стола.",
      wisdom: checkIsCorrect
        ? "Не объявляй будущий план одним кликом: сначала чек, затем отдельное решение против фактической ставки."
        : spot.wisdom,
      options: currentOptions,
      sequenceId: spot.id,
      sequenceOrder: 1
    };
    if (!checkIsCorrect) return [current];

    const potBeforeBet = Math.max(1, bbNumber(spot.table?.pot));
    const responseLabel = text(originalCorrect.label).toLowerCase();
    const fraction = /круп|>\s*50|75|80/iu.test(responseLabel)
      ? 0.75
      : /мелк|небольш|<\s*50|33/iu.test(responseLabel)
        ? 0.33
        : 0.5;
    const bet = roundedHalfBb(potBeforeBet * fraction);
    const currentPot = roundedNumber(potBeforeBet + bet);
    const callWins = response === "call";
    const originalFeedback = text(originalCorrect.feedback || spot.wisdom);
    const responseReason = originalFeedback
      .replace(/^чек[\s–—-]*(?:колл|пас)[^.!?]*[.!?]?\s*/iu, "")
      || (callWins
        ? "Цена и сила руки позволяют продолжить коллом."
        : "Цена слишком высока для силы руки, поэтому пас сохраняет фишки.");
    const followUp = {
      ...spot,
      id: `${spot.id}-after-check`,
      title: `${spot.title} · ответ на ставку`,
      question: `Ты сыграл чек. Соперник поставил ${learnerNumber(bet)} BB в банк ${learnerNumber(potBeforeBet)} BB. Колл или пас?`,
      hint: "Теперь ставка уже сделана: сравни цену колла с силой руки и диапазоном соперника.",
      wisdom: responseReason,
      table: {
        ...spot.table,
        pot: `${learnerNumber(currentPot)} BB`,
        toCall: `${learnerNumber(bet)} BB`,
        actionLine: [...(spot.table.actionLine || []), `Ты Чек`, `Соперник Ставка ${learnerNumber(bet)} BB`],
        historyLine: `${spot.table.historyLine} · после твоего чека соперник поставил ${learnerNumber(bet)} BB`
      },
      options: [
        {
          key: "call",
          label: `Колл ${learnerNumber(bet)} BB`,
          actionType: "call",
          correct: callWins,
          feedback: callWins ? responseReason : `Здесь лучше пас. ${responseReason}`
        },
        {
          key: "fold",
          label: "Пас",
          actionType: "fold",
          correct: !callWins,
          feedback: !callWins ? responseReason : `Цена позволяет продолжить коллом. ${responseReason}`
        }
      ],
      sequenceId: spot.id,
      sequenceOrder: 2
    };
    return [current, followUp];
  });
}

function buildPushFoldSpots(rows) {
  return normalizeMany(rows, "push-fold").map((spot, index) => {
    const raw = rows[index];
    const hand = text(raw.hand);
    const stack = learnerNumber(raw.stackBb);
    const position = text(raw.position);
    const correct = spot.options.find((choice) => choice.correct);
    const isJam = /jam|push|олл/i.test(correct?.key) || /олл/i.test(correct?.label);
    const range = normalizeHandNotation(text(raw.sourceRange));
    const reason = isJam
      ? `${hand} входит в учебный диапазон первого олл-ина с ${position} при ${stack} BB: ${range}.`
      : `${hand} не входит в учебный диапазон первого олл-ина с ${position} при ${stack} BB: ${range}.`;
    spot.question = `До тебя все спасовали. Ты на ${position} с ${hand} и стеком ${stack} BB. Олл-ин или пас?`;
    spot.hint = "Сверь позицию и стек с диапазоном первого олл-ина.";
    spot.wisdom = reason;
    spot.table.actionLine = unique(spot.table.actionLine);
    spot.options = spot.options.map((choice) => ({
      ...choice,
      label: /min/i.test(choice.key) ? "Мин-рейз" : choice.label,
      feedback: choice.correct ? reason : `Базовая линия — ${correct.label}. ${reason}`
    }));
    return spot;
  });
}

function buildJamOverRaiseSpots(rows) {
  return normalizeMany(rows, "jam-over-raise").map((spot, index) => {
    const raw = rows[index];
    const hand = text(raw.hand);
    const heroPosition = text(raw.position);
    const villain = text(raw.villainPosition || "соперник");
    const stack = learnerNumber(raw.stackBb);
    const correct = spot.options.find((choice) => choice.correct);
    const range = normalizeHandNotation(text(raw.sourceRange));
    let reason;
    if (raw.mode === "call_jam") {
      const jamSize = learnerNumber(raw.jamSizeBb || raw.stackBb);
      const price = learnerNumber(raw.toCallBb);
      const openTotal = number(raw.openSizeBb, 2.1) + (heroPosition === "SB" ? 0.5 : 0);
      spot.question = `Ты открыл с ${heroPosition}, ${villain} поставил олл-ин ${jamSize} BB. Как сыграть ${hand}, если к коллу ${price} BB?`;
      spot.table.actionLine = [`${heroPosition} рейз до ${learnerNumber(openTotal)} BB`, `${villain} олл-ин ${jamSize} BB`];
      spot.table.historyLine = `${heroPosition} открыл до ${learnerNumber(openTotal)} BB · ${villain} поставил олл-ин ${jamSize} BB`;
      reason = /call|колл/i.test(correct?.key)
        ? `${hand} входит в учебный диапазон колла с ${heroPosition} против олл-ина от ${villain}: ${range}.`
        : `${hand} не входит в учебный диапазон колла с ${heroPosition} против олл-ина от ${villain}: ${range}.`;
    } else {
      const openSize = learnerNumber(raw.openSizeBb || raw.toCallBb);
      spot.question = `${villain} открыл до ${openSize} BB. Ты на ${heroPosition} с ${hand} и стеком ${stack} BB. Олл-ин, колл или пас?`;
      reason = /jam|push|олл/i.test(correct?.key)
        ? `${hand} входит в учебный диапазон рестила с ${heroPosition} против открытия от ${villain}: ${range}.`
        : `${hand} не входит в учебный диапазон рестила с ${heroPosition} против открытия от ${villain}: ${range}.`;
    }
    spot.hint = "Сначала прочитай позицию опенера, эффективный стек и цену продолжения.";
    spot.wisdom = reason;
    spot.options = spot.options.map((choice) => ({
      ...choice,
      feedback: choice.correct ? reason : `Базовая линия — ${correct.label}. ${reason}`
    }));
    return spot;
  });
}

function buildIcmSpots(rows) {
  return normalizeMany(rows, "icm").map((spot) => {
    const correct = spot.options.find((choice) => choice.correct);
    const percentageChoices = spot.options.every((choice) => /^\d+(?:[.,]\d+)?\s*%$/.test(choice.label));
    const correctPct = percentageChoices ? number(correct.label.replace("%", "").replace(",", ".")) : 0;
    const common = "Сверь цену продолжения, покрытие стеков, игроков позади и стоимость вылета.";
    const hand = spot.table.heroCards.map(cardDisplay).join(" ");
    const context = [
      `ты на ${spot.table.heroPosition}`,
      hand ? `с ${hand}` : "",
      `стек ${spot.table.effectiveStack}`,
      text(spot.table.toCall) !== "0 BB" ? `к коллу ${spot.table.toCall}` : ""
    ].filter(Boolean).join(" · ");
    if (!percentageChoices) spot.question = `После показанного экшена ${context}. Как продолжить?`;
    spot.hint = common;
    spot.options = spot.options.map((choice) => {
      let feedback;
      if (percentageChoices) {
        const chosen = number(choice.label.replace("%", "").replace(",", "."));
        feedback = choice.correct
          ? `Расчётная граница здесь — ${correct.label}. ${common}`
          : `${chosen < correctPct ? "Этот диапазон слишком узкий" : "Этот диапазон слишком широкий"}. Граница здесь — ${correct.label}. ${common}`;
      } else {
        feedback = choice.correct
          ? `${correct.label} — базовая линия для этой руки при показанных стеках и цене. ${common}`
          : `Здесь лучше ${correct.label}: выбранная линия берёт лишний риск или недобирает доступное преимущество. ${common}`;
      }
      const label = /^Колл(?:\s|$)/i.test(choice.label) && text(spot.table.toCall) !== "0 BB"
        ? `Колл ${spot.table.toCall}`
        : choice.label;
      return { ...choice, label, feedback };
    });
    spot.wisdom = spot.options.find((choice) => choice.correct)?.feedback || common;
    return spot;
  });
}

const finalExamCopyOverrides = {
  "mixed-exam-final_exam_trainer_n_1-01": {
    optionFeedback: {
      o4: "Колл с AQo в этих позициях будет ошибкой. При эффективном стеке 25 BB лучше сделать 3-бет примерно до 6 BB и сдаться на 4-бет."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-09": {
    optionFeedback: {
      o4: "Для защиты подошла бы уязвимая готовая рука, которой важно не дать бесплатную карту. С AJ здесь ставим на вэлью и добираем с рук слабее."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-11": {
    wisdom: "Натсовое флеш-дро ставим в полублеф: часть более сильных A-high и младших пар может сдаться, а после колла у руки остаётся много эквити.",
    optionFeedback: {
      o1: "Готовой руки для вэлью ещё нет. Натсовое флеш-дро ставим в полублеф: можем получить пас сразу или усилиться после колла.",
      o2: "Это не чистый блеф: у натсового флеш-дро много эквити после колла. Поэтому цель ставки — полублеф.",
      o3: "Натсовое флеш-дро ставим в полублеф: часть более сильных A-high и младших пар может сдаться, а после колла у руки остаётся много эквити.",
      o4: "Для защиты ставят уязвимую готовую руку. Здесь готовой руки нет, зато натсовое флеш-дро подходит для полублефа."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-17": {
    question: "BTN заколлировал твой 3-бет до 10 BB. Флоп 9♦ T♠ 7♣, банк 22 BB. Как сыграть с A♠ K♦ на BB?",
    table: {
      actionLine: ["BTN Рейз 2 BB", "BB 3-бет до 10 BB", "BTN Колл"],
      historyLine: "Ты на BB с A♠ K♦ · 3-бет-пот · флоп 9♦ T♠ 7♣ · банк 22 BB"
    }
  },
  "mixed-exam-final_exam_trainer_n_1-08": {
    question: "Как называется это дро?",
    wisdom: "Это бэкдорное флеш-дро: для флеша нужны подходящие карты и на тёрне, и на ривере, поэтому прямых аутов на следующую улицу ещё нет.",
    optionFeedback: {
      o1: "Для стрита нужна другая структура карт. Здесь бэкдорное флеш-дро: флеш соберётся только через две пиковые карты подряд.",
      o2: "Это бэкдорное флеш-дро: флеш соберётся только через пиковые карты и на тёрне, и на ривере.",
      o3: "Гатшота здесь нет. Флеш возможен только через две пиковые карты подряд, поэтому это бэкдорное флеш-дро.",
      o4: "Двойного гатшота здесь нет. Флеш возможен только через две пиковые карты подряд, поэтому это бэкдорное флеш-дро."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-14": {
    question: "Как называется это дро?",
    wisdom: "Это бэкдорное стрит-дро: стрит собирается только через две подходящие карты подряд, поэтому прямых аутов на следующую улицу ещё нет.",
    optionFeedback: {
      o1: "Это бэкдорное стрит-дро: стрит соберётся только через две подходящие карты на тёрне и ривере.",
      o2: "Бэкдорного флеш-дро здесь нет: трёх карт одной масти не набирается. Возможен только бэкдорный стрит.",
      o3: "Прямого стрит-дро здесь нет: одной карты на тёрне недостаточно. Для стрита нужны две подходящие карты подряд.",
      o4: "Дро есть, но бэкдорное: для стрита нужны подходящие карты и на тёрне, и на ривере."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-51": {
    wisdom: "Эффективный стек — 46,5 BB: это весь стек до уже поставленных на этой улице 2,5 BB.",
    optionFeedback: {
      o1: "Эффективный стек — 46,5 BB: 44 BB осталось за спиной и 2,5 BB уже поставлены на этой улице.",
      o2: "8 BB — это банк, а не эффективный стек. У тебя 44 BB за спиной и ещё 2,5 BB уже в ставке: всего 46,5 BB.",
      o3: "44 BB — только остаток за спиной. Добавь уже поставленные 2,5 BB: эффективный стек равен 46,5 BB.",
      o4: "58 BB — стек соперника. В банк между вами может попасть не больше твоих 46,5 BB, поэтому это и есть эффективный стек."
    },
    table: {
      heroStack: "46,5 BB",
      effectiveStack: "46,5 BB",
      historyLine: "Ты на BB · эффективный стек 46,5 BB · после ставки 2,5 BB осталось 44 BB"
    },
    heroSeatStackBb: 46.5
  },
  "mixed-exam-final_exam_trainer_n_1-38": {
    question: "UTG+2 заколлировал твой 3-бет до 8 BB и чекнул флоп 3♠ 5♦ 9♣. Как сыграть с A♦ A♠ на BTN?",
    wisdom: "С оверпарой на сухой доске ставь 50 % банка: этот размер добирает с более слабых пар и не выбивает их слишком часто.",
    table: {
      actionLine: ["UTG+2 Рейз 2 BB", "BTN 3-бет до 8 BB", "UTG+2 Колл", "UTG+2 Чек на флопе"],
      historyLine: "Ты на BTN с A♦ A♠ · 3-бет-пот · флоп 3♠ 5♦ 9♣ · банк 18,5 BB · соперник чекнул"
    },
    optionFeedback: {
      o1: "Треть банка недобирает с более слабых пар. С оверпарой на сухой доске здесь лучше поставить 50 %.",
      o2: "Ставка 50 % добирает с более слабых пар и не выбивает их слишком часто.",
      o3: "Ставка 75 % чаще выбьет руки, с которых хочется добрать. На сухой доске достаточно 50 %.",
      o4: "Чек пропускает улицу вэлью. С оверпарой на сухой доске здесь лучше поставить 50 %."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-54": {
    wisdom: "A2 ставим для защиты: рука недостаточно сильна для вэлью, но ей важно не дать сопернику бесплатно увидеть следующие улицы.",
    optionFeedback: {
      o1: "Для вэлью нужны руки сильнее, например A9, 66 или 22. A2 здесь ставим для защиты.",
      o2: "Это не чистый блеф: у A2 есть готовая пара. Ставка защищает её от бесплатных оверкарт.",
      o3: "Полублеф требует дро с заметным шансом усилиться. A2 уже имеет готовую пару и ставит для защиты.",
      o4: "A2 ставим для защиты: рука недостаточно сильна для вэлью, но ей важно не дать сопернику бесплатную карту."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-43": {
    villainPosition: "UTG+1",
    villainCards: ["Jc", "Js"],
    question: "У соперника на UTG+1 J♣ J♠. Сколько чистых аутов у твоих K♥ Q♥ на тёрне и хватает ли цены для колла 7 BB?",
    wisdom: "Чистых аутов 13: семь червей, три туза и три девятки. Шанс усилиться — 28,3 %, а цена колла — 29,2 %, поэтому колл не проходит.",
    optionFeedback: {
      o1: "Чистых аутов 13: семь червей, три туза и три девятки. J♥ даёт сопернику каре, а 8♥ — фулл-хаус. Шанс усилиться 28,3 % ниже цены колла 29,2 %.",
      o2: "Чистых аутов 13: семь червей, три туза и три девятки. J♥ даёт сопернику каре, а 8♥ — фулл-хаус. Шанс усилиться 28,3 % ниже цены колла 29,2 %.",
      o3: "Цена колла действительно выше шанса усилиться, но чистых аутов 13: семь червей, три туза и три девятки.",
      o4: "Чистых аутов 13: семь червей, три туза и три девятки. Шанс усилиться — 13 из 46, или 28,3 %, что ниже цены колла 29,2 %."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-55": {
    villainPosition: "UTG+1",
    villainCards: ["Jc", "Jh"],
    question: "У соперника на UTG+1 J♣ J♥. Сколько чистых аутов у твоих K♠ Q♠ на тёрне и хватает ли цены для колла 7 BB?",
    wisdom: "Чистых аутов 13: семь пик, три туза и три девятки. Шанс усилиться — 28,3 %, а цена колла — 29,2 %, поэтому колл не проходит.",
    optionFeedback: {
      o1: "Чистых аутов 13: семь пик, три туза и три девятки. J♠ даёт сопернику каре, а 8♠ — фулл-хаус. Шанс усилиться 28,3 % ниже цены колла 29,2 %.",
      o2: "Чистых аутов 13: семь пик, три туза и три девятки. Шанс усилиться — 13 из 46, или 28,3 %, что ниже цены колла 29,2 %.",
      o3: "Цена колла не проходит, и чистых аутов 13: семь пик, три туза и три девятки. J♠ и 8♠ исключаем.",
      o4: "Цена колла действительно выше шанса усилиться, но чистых аутов 13: семь пик, три туза и три девятки."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-57": {
    villainPosition: "BTN",
    villainCards: ["6s", "6d"],
    question: "У соперника 6♠ 6♦. Сколько чистых аутов оставляют A♥ 4♥ впереди после ривера?",
    wisdom: "Чистых аутов семь: три туза и четыре двойки. Шестёрка даёт тебе стрит, но сопернику — фулл-хаус, поэтому её не считаем.",
    optionFeedback: {
      o1: "Три туза — не все ауты: подходят ещё четыре двойки. Всего семь чистых аутов.",
      o2: "Три туза и четыре двойки дают семь чистых аутов.",
      o3: "Шестёрка даёт тебе стрит, но сопернику — фулл-хаус, поэтому её не считаем. Чистых аутов семь.",
      o4: "Часть усилений проигрывает фулл-хаусу соперника. Чистых аутов семь: три туза и четыре двойки."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-06": {
    villainPosition: "SB",
    villainCards: ["Td", "Th"],
    question: "У соперника T♦ T♥ и фулл-хаус. Сколько риверов дадут твоим A♠ K♠ лучшую комбинацию?",
    wisdom: "Восемь риверов выигрывают: три туза, три короля, Q♠ для флеш-рояля и J♥ для каре с тузовым кикером.",
    optionFeedback: {
      o1: "Выигрывают восемь риверов: три туза, три короля, Q♠ и J♥. Остальные дамы дают стрит, который проигрывает фулл-хаусу.",
      o2: "Выигрывают восемь риверов: три туза, три короля, Q♠ для флеш-рояля и J♥ для каре с тузовым кикером.",
      o3: "Стрит и обычный флеш проигрывают фулл-хаусу. Выигрывают только восемь риверов: три туза, три короля, Q♠ и J♥.",
      o4: "Ты пропустил один из восьми риверов: три туза, три короля, Q♠ и J♥."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-13": {
    wisdom: "Четыре четвёрки и четыре девятки дают 8 чистых аутов на стрит.",
    optionFeedback: {
      o1: "Для стрита подходят четыре четвёрки и четыре девятки — всего 8 аутов.",
      o2: "Для стрита подходят четыре четвёрки и четыре девятки — всего 8 аутов.",
      o3: "Четыре четвёрки и четыре девятки дают 8 чистых аутов на стрит.",
      o4: "Для стрита подходят четыре четвёрки и четыре девятки — всего 8 аутов."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-42": {
    question: "Как называется это дро?",
    wisdom: "Это бэкдорное флеш-дро: для флеша нужны подходящие карты и на тёрне, и на ривере, поэтому прямых аутов на следующую улицу ещё нет.",
    optionFeedback: {
      o1: "Для стрита нужна другая структура карт. Здесь бэкдорное флеш-дро: флеш соберётся только через две червовые карты подряд.",
      o2: "Это бэкдорное флеш-дро: флеш соберётся только через червовые карты и на тёрне, и на ривере.",
      o3: "Для прямого флеш-дро нужна ещё одна червовая карта. Пока флеш возможен только через две карты подряд, поэтому дро бэкдорное.",
      o4: "Дро есть, но бэкдорное: для флеша нужны червовые карты и на тёрне, и на ривере."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-17": {
    question: "Какой диапазон рук ставим олл-ин на BTN против опен-рейза с EP+1?"
  },
  "mixed-exam-final_exam_trainer_n_2-21": {
    wisdom: "44 ставим для защиты: пара уязвима к оверкартам, поэтому не даём сопернику бесплатно увидеть следующие улицы.",
    optionFeedback: {
      o1: "44 ставим для защиты: пара уязвима к оверкартам, поэтому не даём сопернику бесплатную карту.",
      o2: "Полублеф требует дро с заметным шансом усилиться. 44 уже имеет готовую пару и ставит для защиты.",
      o3: "Для вэлью нужны руки сильнее, например AQ, 99 или 55. С 44 цель ставки — защита.",
      o4: "Это не чистый блеф: у 44 есть готовая пара. Ставка защищает её от бесплатных оверкарт."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-36": {
    question: "CO заколлировал твой 3-бет до 10 BB. Флоп K♦ Q♦ 8♠, банк 22 BB. Как сыграть с A♦ Q♠ на SB?",
    table: {
      actionLine: ["CO Рейз 2 BB", "SB 3-бет до 10 BB", "CO Колл"],
      historyLine: "Ты на SB с A♦ Q♠ · 3-бет-пот · флоп K♦ Q♦ 8♠ · банк 22 BB"
    }
  },
  "mixed-exam-final_exam_trainer_n_2-50": {
    correctKey: "o3",
    wisdom: "Чек. Против небольшой ставки играем чек-колл, а против крупной — чек-пас.",
    optionLabels: {
      o3: "Чек-колл небольшой ставки"
    },
    optionActionTypes: {
      o3: "call"
    },
    optionFeedback: {
      o1: "Со слабой парой не ставим сами: чекаем, коллируем небольшую ставку и сдаёмся против крупной.",
      o2: "Со слабой парой не ставим сами: чекаем, коллируем небольшую ставку и сдаёмся против крупной.",
      o3: "Верный план: чек-колл против небольшой ставки и чек-пас против крупной.",
      o4: "Чек-пас против любой ставки слишком тайтов: небольшую ставку со слабой парой можно заколлировать."
    }
  },
  "mixed-exam-final_exam_trainer_n_2-52": {
    question: "HJ заколлировал твой 3-бет до 10 BB. Флоп J♦ K♣ 4♣, банк 22 BB. Как сыграть с A♦ K♠ на BB?",
    table: {
      actionLine: ["HJ Рейз 2 BB", "BB 3-бет до 10 BB", "HJ Колл"],
      historyLine: "Ты на BB с A♦ K♠ · 3-бет-пот · флоп J♦ K♣ 4♣ · банк 22 BB"
    }
  },
  "mixed-exam-final_exam_trainer_n_2-60": {
    question: "Соперник открыл 2 BB и заколлировал твой 3-бет до 8 BB. На флопе 2♦ 2♣ 7♣ он чекнул. Как сыграть с 8♦ 8♣?",
    wisdom: "С уязвимой оверпарой на низкой доске ставь 75 % банка: так ты добираешь с более слабых пар и дороже продаёшь сопернику его оверкарты.",
    table: {
      actionLine: ["UTG Пас", "UTG+1 Пас", "UTG+2 Пас", "MP Пас", "HJ Рейз 2 BB", "CO Пас", "BTN 3-бет до 8 BB", "SB Пас", "BB Пас", "HJ Колл", "HJ Чек на флопе"],
      historyLine: "Ты на BTN с 8♦ 8♣ · 3-бет-пот · флоп 2♦ 2♣ 7♣ · банк 18,5 BB · соперник чекнул"
    },
    optionFeedback: {
      o1: "Ставка 75 % банка защищает уязвимую оверпару от оверкарт и добирает с более слабых пар.",
      o2: "Половина банка оставляет оверкартам слишком выгодную цену. С уязвимой оверпарой здесь лучше поставить 75 %.",
      o3: "Треть банка слишком дёшево продаёт сопернику его шесть аутов на оверкарту. Здесь лучше поставить 75 %.",
      o4: "Чек бесплатно реализует эквити оверкарт соперника. С уязвимой оверпарой здесь лучше поставить 75 %."
    }
  },
  "mixed-exam-final_exam_trainer_n_1-27": {
    question: "Сколько карт ривера дадут ровно одну пару, включая спаривание доски?"
  },
  "mixed-exam-final_exam_trainer_n_2-04": {
    question: "Сколько карт ривера дадут ровно две пары с учётом спаривания доски?"
  }
};

function buildFinalExamSpots(rows) {
  return normalizeMany(rows, "final-exam").map((spot, index) => {
    const rowId = text(rows[index].id);
    if (/mixed-exam-final_exam_trainer_n_[12]-(?:6[3-9]|7[0-4])$/.test(rowId)) {
      const hand = text(rows[index].hand || spot.table.heroCards.map(cardDisplay).join(" "));
      const position = text(spot.table.heroPosition);
      const correct = spot.options.find((choice) => choice.correct);
      const opens = correct?.actionType === "raise" || /рейз/i.test(correct?.label || "");
      const reason = opens
        ? `Диапазон позволяет открыть ${hand} с ${position} до 2 BB.`
        : `${hand} находится за границей учебного диапазона первого рейза с ${position}; здесь лучше пас.`;
      spot.wisdom = reason;
      spot.options = spot.options.map((choice) => {
        if (choice.correct) return { ...choice, feedback: reason };
        if (/лимп/i.test(choice.label)) return { ...choice, feedback: `Лимп не входит в базовый план первого входа. ${reason}` };
        if (/пас/i.test(choice.label)) return { ...choice, feedback: `Пас теряет прибыльное открытие. ${reason}` };
        return { ...choice, feedback: `Рейз выходит за учебную границу диапазона. ${reason}` };
      });
    }
    const override = finalExamCopyOverrides[rowId];
    if (!override) return spot;
    if (override.question) spot.question = override.question;
    if (override.wisdom) spot.wisdom = override.wisdom;
    if (override.table) spot.table = { ...spot.table, ...override.table };
    if (Number.isFinite(override.heroSeatStackBb)) {
      spot.table.seats = spot.table.seats.map((seat) => seat.state === "hero" || seat.label === spot.table.heroPosition
        ? { ...seat, stackBb: override.heroSeatStackBb }
        : seat);
    }
    if (override.optionFeedback) {
      spot.options = spot.options.map((choice) => override.optionFeedback[choice.key]
        ? { ...choice, feedback: override.optionFeedback[choice.key] }
        : choice);
    }
    if (override.correctKey || override.optionLabels || override.optionActionTypes) {
      spot.options = spot.options.map((choice) => ({
        ...choice,
        correct: override.correctKey ? choice.key === override.correctKey : choice.correct,
        label: override.optionLabels?.[choice.key] || choice.label,
        actionType: override.optionActionTypes?.[choice.key] || choice.actionType
      }));
    }
    if (override.villainPosition && override.villainCards) {
      spot.table.seats = spot.table.seats.map((seat) => seat.label === override.villainPosition
        ? { ...seat, cards: override.villainCards.map(cardCode), revealCardsAfterAnswer: true }
        : seat);
    }
    return spot;
  });
}

function bySourceRow(rows, values) {
  const wanted = new Set(values);
  return rows.filter((row) => wanted.has(row.sourceRowId) || (Array.isArray(row.sourceRowIds) && row.sourceRowIds.some((value) => wanted.has(value))));
}

function conceptRowsForTournament(mode) {
  return tournamentSpots.filter((spot) => mode.includes(spot.mode));
}

const excludedIsolationSpotIds = new Set([
  "trainer_izol_reiz_1_n_ef346d29_ai_1764102058_0fe59bc1",
  "trainer_izol_reiz_1_n_1e1e8b3e_start-011-2-main-17"
]);

const excludedThreeBetSpotIds = new Set([
  "ai_1764104630_d9931080",
  "start-012-22-main-6",
  "ai_1764104631_19405f1d",
  "start-012-22-main-10"
]);

function hasBoardForDecisionStreet(spot) {
  const count = rawBoard(spot).length;
  const street = text(spot.street || "preflop");
  if (street === "flop") return count >= 3;
  if (street === "turn") return count >= 4;
  if (street === "river") return count >= 5;
  return true;
}

const packs = {
  "course-start": buildProfessionSpots("course-start"),
  "poker-history-rules": buildRulesSpots(),
  combinations: buildHandRankingSpots(combinations),
  positions: buildPositionSpots(),
  "hand-actions": buildHandActionSpots(),
  "pairs-kicker": buildKickerSpots(combinations),
  "draws-outs": buildOutsDecisionSpots(outs, "draws-outs", true),
  "tournament-formats": buildTournamentSpots(conceptRowsForTournament(["format", "bounty"]), "tournament-formats"),
  "tournament-navigation": buildTournamentSpots(conceptRowsForTournament(["stage", "stack", "payout"]), "tournament-navigation"),
  "preflop-start": buildPreflopStartSpots([...firstHand.slice(0, 1), ...rangeSpots.filter((spot) => spot.mode === "range_read").slice(0, 12)]),
  "betting-purpose": buildBettingPurposeSpots(),
  "cbet-in-position": buildCbetSpots(flop.spots.filter((spot) => spot.mode === "cbet_ip")),
  "play-out-of-position": splitCompoundCheckDecisions(normalizeMany(flop.spots.filter((spot) => spot.mode === "oop_flop"), "play-out-of-position")),
  "isolation-raise": normalizeMany([
    ...isolation.spots.filter((spot) => !excludedIsolationSpotIds.has(spot.id)),
    ...flop.spots.filter((spot) => spot.mode === "isolation_flop")
  ], "isolation-raise"),
  "cold-call": buildColdCallSpots(bySourceRow(rangeSpots, ["test_cold_call"])),
  "three-bet": normalizeMany(threeBet.spots.filter((spot) => spot.mode !== "defend_vs_3bet" && hasBoardForDecisionStreet(spot) && !excludedThreeBetSpotIds.has(spot.id)), "three-bet"),
  "versus-three-bet": normalizeMany(threeBet.spots.filter((spot) => spot.mode === "defend_vs_3bet"), "versus-three-bet"),
  multiway: normalizeMany(flop.spots.filter((spot) => spot.mode === "multiway_flop" && spot.id !== "test_multi_poty_n_90f124e2_start-014-3-main-1"), "multiway"),
  "blind-versus-blind": buildBlindVersusBlindSpots(bySourceRow(bbSpots, ["sb_vs_bb_trainer_2_n"])),
  "versus-aggressive": buildOpponentSpots("versus-aggressive"),
  "versus-passive": buildOpponentSpots("versus-passive"),
  "push-fold": buildPushFoldSpots(shortSpots.filter((spot) => spot.mode === "open_jam" && spot.position !== "BB" && spot.sourceColumn === "0.2")),
  "jam-over-raise": buildJamOverRaiseSpots(shortSpots.filter((spot) => (spot.mode === "resteal" || spot.mode === "call_jam") && spot.id !== "short-calljam-24bb-co-sb-aks")),
  "decision-logic": buildDecisionLogicSpots(),
  "poker-math": buildOutsDecisionSpots(outs, "poker-math", false),
  icm: buildIcmSpots(icmSpots.filter((spot) => !new Set([
    "icm-short-icm_repush-02",
    "icm-short-icm_repush-06",
    "icm-short-icm_repush-08",
    "icm-short-icm_repush-09",
    "icm-short-icm_repush-11",
    "icm-short-icm_repush-15",
    "icm-short-expanded-09"
  ]).has(spot.id))),
  "poker-world": buildProfessionSpots("poker-world"),
  "poker-profession": buildProfessionSpots("poker-profession"),
  "poker-perspectives": buildProfessionSpots("poker-perspectives"),
  microstakes: buildProfessionSpots("microstakes"),
  "course-feedback": buildProfessionSpots("course-feedback"),
  resources: buildProfessionSpots("resources"),
  "final-exam": splitCompoundCheckDecisions(buildFinalExamSpots(exam.spots.filter((spot) => number(spot.potBb) !== 999)))
};

function contextualQuestion(question, spot) {
  const normalized = text(question);
  const generic = /^(?:Какое решение здесь лучше|Выбери (?:лучшее )?действие|Выбери линию для этой руки|Как лучше сыграть(?: после опен-рейза от соперника| на [A-Z0-9+]+)?|Как сыграть|Как сыграть .+ в этой ситуации)[.!?]*$/i;
  const genericCbet = /после\s+опен-рейза\s+\d+(?:[.,]\d+)?\s*BB\s+префлоп\s+и\s+колла\s+от\s+соперника\s+на\s+BB/iu;
  const table = spot.table || {};
  const heroCards = Array.isArray(table.heroCards) ? table.heroCards : [];
  if ((!generic.test(normalized) && !genericCbet.test(normalized)) || heroCards.length !== 2) return normalized;

  const hand = heroCards.map(cardDisplay).join(" ");
  const position = text(table.heroPosition || "BTN");
  const stack = text(table.effectiveStack || table.heroStack || "");
  const relevantActions = (table.actionLine || []).filter((line) => !/\sПас(?:\s|$)/i.test(text(line)));
  const actionLead = relevantActions.length ? `${relevantActions.slice(-2).join(" · ")}. ` : "";
  if (text(table.street || "preflop") === "preflop") {
    const lead = actionLead || "До тебя все спасовали. ";
    return editorialPolish(`${lead}Ты на ${position} с ${hand}${stack ? ` и стеком ${stack}` : ""}. Как сыграть?`);
  }

  const streetLabel = { flop: "Флоп", turn: "Тёрн", river: "Ривер" }[text(table.street)] || "Доска";
  const board = (table.boardCards || []).map(cardDisplay).join(" ");
  const boardLead = board ? `${streetLabel} ${board}` : streetLabel;
  if (genericCbet.test(normalized)) {
    return editorialPolish(`${boardLead} · банк ${table.pot}. BB чекнул. Ты на ${position} с ${hand}. Как сыграть?`);
  }
  return editorialPolish(`${boardLead} · банк ${table.pot}. ${actionLead}Ты на ${position} с ${hand}. Как продолжить?`);
}

const visibleSeatActors = /^(UTG\+2|UTG\+1|UTG|EP|MP|LJ|HJ|CO|BTN|SB|BB)\b/iu;
const seatActorAliases = {
  EP: "UTG",
  UTG: "EP",
  MP: "HJ",
  HJ: "MP"
};

function reconcileTableSeats(table, actionLine) {
  const sourceSeats = Array.isArray(table?.seats) ? table.seats.map((seat) => ({ ...seat })) : [];
  if (!sourceSeats.length) return sourceSeats;

  const actorLabels = unique(actionLine.map((line) => text(line).match(visibleSeatActors)?.[1]?.toUpperCase()).filter(Boolean));
  const dealerPosition = text(table?.dealerPosition).toUpperCase();
  if (dealerPosition) actorLabels.push(dealerPosition);

  for (const actor of unique(actorLabels)) {
    if (sourceSeats.some((seat) => text(seat.label).toUpperCase() === actor)) continue;

    const alias = seatActorAliases[actor];
    const aliasSeat = alias && sourceSeats.find((seat) =>
      text(seat.label).toUpperCase() === alias
      && text(seat.state).toLowerCase() !== "hero"
    );
    if (aliasSeat) {
      aliasSeat.label = actor;
      continue;
    }

    sourceSeats.push({
      label: actor,
      state: /^(?:SB|BB)$/u.test(actor) ? "blind" : "waiting",
      stackBb: roundedNumber(table?.effectiveStack || table?.heroStack) || undefined
    });
  }
  return sourceSeats;
}

function polishPublishedSpot(spot, lesson, index) {
  const principle = lessonPrinciples[lesson.id] || "Сначала прочитай позицию, стек, экшен и цену продолжения.";
  const correct = spot.options.find((option) => option.correct);
  const correctLabel = publishedOptionLabel(correct?.label, "лучшее действие");
  const sourceActionLine = unique((spot.table.actionLine || []).map((line) => safeLearnerCopy(line, "")).filter(Boolean));
  const tableActionLine = lesson.id === "cbet-in-position"
    && text(spot.table.street) === "flop"
    && !sourceActionLine.some((line) => !/\sПас(?:\s|$)/iu.test(line))
      ? [`${spot.table.heroPosition || "BTN"} Рейз 2 BB`, "BB Колл", "BB Чек на флопе"]
      : sourceActionLine;
  const tableSeats = reconcileTableSeats(spot.table, tableActionLine);
  const polished = {
    ...spot,
    title: publishedSpotTitle(spot.title, lesson, index),
    question: terminalCopy(contextualQuestion(safeLearnerCopy(spot.question, "Какое решение здесь лучше?"), spot), "?"),
    hint: terminalCopy(safeLearnerCopy(spot.hint, principle)),
    wisdom: terminalCopy(safeLearnerCopy(spot.wisdom, `${correctLabel}. ${principle}`)),
    table: {
      ...spot.table,
      seats: tableSeats,
      actionLine: tableActionLine,
      historyLine: safeLearnerCopy(spot.table.historyLine, `Hero на ${spot.table.heroPosition || "BTN"} · прочитай экшен и цену продолжения.`)
    },
    options: spot.options.map((choice, optionIndex) => {
      const fallbackLabel = choice.correct ? correctLabel : `Вариант ${optionIndex + 1}`;
      const sourceLabel = publishedOptionLabel(choice.label, fallbackLabel);
      const label = choice.actionType === "call" && /^Колл(?:\s+\d+(?:[.,]\d+)?\s*BB)?$/iu.test(sourceLabel) && bbNumber(spot.table.toCall) > 0
        ? `Колл ${spot.table.toCall}`
        : sourceLabel;
      const fallbackFeedback = choice.correct
        ? `Верно: ${correctLabel}. ${principle}`
        : `Здесь базовая линия — ${correctLabel}. ${principle}`;
      return {
        ...choice,
        label,
        feedback: conciseFeedback(terminalCopy(safeLearnerCopy(choice.feedback, fallbackFeedback)))
      };
    })
  };

  const learnerFields = [
    ["title", polished.title],
    ["question", polished.question],
    ["hint", polished.hint],
    ["wisdom", polished.wisdom],
    ["historyLine", polished.table.historyLine],
    ...polished.table.actionLine.map((value, actionIndex) => [`actionLine.${actionIndex}`, value]),
    ...polished.options.flatMap((choice, optionIndex) => [
      [`options.${optionIndex}.label`, choice.label],
      [`options.${optionIndex}.feedback`, choice.feedback]
    ])
  ];
  for (const [field, value] of learnerFields) {
    if (!text(value)) throw new Error(`${lesson.id}:${spot.id}:${field} has empty learner copy`);
    if (needsLocalization(value)) throw new Error(`${lesson.id}:${spot.id}:${field} leaks technical or untranslated copy: ${value}`);
  }
  return polished;
}

function fingerprintText(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function publishedSpotFingerprint(spot) {
  const table = spot.table || {};
  return JSON.stringify({
    question: fingerprintText(spot.question),
    table: {
      heroPosition: fingerprintText(table.heroPosition),
      heroStack: fingerprintText(table.heroStack),
      effectiveStack: fingerprintText(table.effectiveStack),
      pot: fingerprintText(table.pot),
      toCall: fingerprintText(table.toCall),
      heroCards: table.heroCards || [],
      boardCards: table.boardCards || [],
      street: fingerprintText(table.street),
      actionLine: (table.actionLine || []).map(fingerprintText),
      dealerPosition: fingerprintText(table.dealerPosition),
      seats: (table.seats || []).map((seat) => ({
        label: fingerprintText(seat.label),
        state: fingerprintText(seat.state),
        cards: seat.cards || []
      }))
    },
    options: (spot.options || []).map((choice) => ({
      label: fingerprintText(choice.label),
      actionType: fingerprintText(choice.actionType),
      correct: Boolean(choice.correct)
    }))
  });
}

function dedupePublishedSpots(spots) {
  const byFingerprint = new Map();
  const uniqueSpots = [];
  for (const spot of spots) {
    const fingerprint = publishedSpotFingerprint(spot);
    const existing = byFingerprint.get(fingerprint);
    if (existing) {
      existing.sourceSpotIds = unique([...(existing.sourceSpotIds || [existing.id]), spot.id]);
      continue;
    }
    byFingerprint.set(fingerprint, spot);
    uniqueSpots.push(spot);
  }
  return uniqueSpots;
}

const lessons = manifest.modules.flatMap((module) => module.lessons).filter((lesson) => lesson.kind !== "legacy");
const summary = [];
for (const lesson of lessons) {
  const spots = dedupePublishedSpots((packs[lesson.id] || []).map((spot, index) => polishPublishedSpot(spot, lesson, index)));
  if (!spots.length) throw new Error(`${lesson.id} has no practice spots`);
  if (spots.length < lesson.practice.sessionLength) {
    throw new Error(`${lesson.id} has ${spots.length} spots, fewer than the ${lesson.practice.sessionLength} required for a full session`);
  }
  spots.forEach((spot) => {
    if (!spot.id || !spot.question || !spot.table || !Array.isArray(spot.options) || spot.options.filter((option) => option.correct).length !== 1) {
      throw new Error(`${lesson.id}:${spot.id || "unknown"} violates the browser practice contract`);
    }
  });
  const payload = {
    schema: "ffstart-practice-pack-v1",
    version: `${lesson.id}-20260715-ffstart-v20`,
    lessonId: lesson.id,
    trainer: { key: lesson.skillKey, title: lesson.title, version: `${lesson.id}-ffstart-handoff-v14` },
    sessionLength: lesson.practice.sessionLength,
    passScore: lesson.practice.passScore,
    spots
  };
  writeFileSync(join(outputRoot, `${lesson.id}.json`), `${JSON.stringify(payload)}\n`);
  summary.push({ id: lesson.id, spots: spots.length });
}

writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify({ schema: "ffstart-practice-index-v1", packs: summary }, null, 2)}\n`);
console.log(`FFStart practice packs: ${summary.length} lessons, ${summary.reduce((sum, row) => sum + row.spots, 0)} spots`);
summary.forEach((row) => console.log(`${String(row.spots).padStart(4)}  ${row.id}`));
