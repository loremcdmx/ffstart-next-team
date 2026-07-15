import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = readJson("course/ffstart-manifest.json");
const media = readJson("course/ffstart-media.json");
const practiceIndex = readJson("assets/ffstart-course/practice/manifest.json");
const practiceById = new Map(practiceIndex.packs.map((pack) => [pack.id, pack]));

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function loadSharedContent() {
  const sandbox = { window: {}, console };
  for (const relativePath of [
    "assets/ffstart-course/content-foundations.js",
    "assets/ffstart-course/content-strategy.js"
  ]) {
    runInNewContext(readFileSync(join(root, relativePath), "utf8"), sandbox, { filename: relativePath });
  }
  return {
    ...(sandbox.window.FFStartLessonContentFoundations || {}),
    ...(sandbox.window.FFStartLessonContentStrategy || {})
  };
}

function loadLegacyPracticeSources() {
  const rfiSandbox = { window: {}, console };
  runInNewContext(
    readFileSync(join(root, "assets/poker-rfi-open-lesson/data.js"), "utf8"),
    rfiSandbox,
    { filename: "assets/poker-rfi-open-lesson/data.js" }
  );

  const bbSandbox = { window: {}, console };
  for (const relativePath of [
    "assets/poker-bb-call-defense-lesson/range-data.js",
    "assets/poker-bb-call-defense-lesson/data.js"
  ]) {
    runInNewContext(readFileSync(join(root, relativePath), "utf8"), bbSandbox, { filename: relativePath });
  }

  return {
    rfi: rfiSandbox.window.PokerRfiData,
    bb: bbSandbox.window.PokerBbCallData
  };
}

const legacyContent = {
  "rfi-open-position": {
    encounter: {
      title: "Позиция управляет шириной опен-рейза",
      body: "Одна и та же рука меняет решение вместе с позицией: чем меньше игроков осталось за спиной, тем шире можно открываться первым входом."
    },
    wisdom: [
      { title: "Меньше игроков — шире опен", visual: { type: "flow" } },
      { title: "Расширяй один чарт — не учи пять заново", visual: { type: "ladder" } },
      { title: "Offsuit-клетка весит втрое больше", visual: { type: "compare" } }
    ],
    deep: {
      title: "Диапазоны по позициям и проверка памяти",
      body: "Пять позиционных чартов, восстановление диапазона по памяти и проверка по комбинациям, а не только по клеткам.",
      cards: [{ title: "Матрицы стартовых рук", visual: { type: "range-matrix" } }]
    },
    practice: {
      title: "Пограничные опен-рейзы",
      body: "Выбирай рейз 2 BB или пас по позиции, затем закрепляй границу в живых раздачах без предыдущих входов."
    },
    recall: true
  },
  "bb-call-defense": {
    encounter: {
      title: "Колл на BB начинается с цены",
      body: "Защита большого блайнда зависит от позиции рейзера, размера опена, формы руки и того, насколько хорошо рука реализует эквити после флопа."
    },
    wisdom: [
      { title: "BB — самая дешёвая точка входа", visual: { type: "odds" } },
      { title: "Потери живут в некрасивых руках", visual: { type: "compare" } },
      { title: "Чем крупнее опен, тем уже защита", visual: { type: "ladder" } },
      { title: "Одномастные и связанные защищаются лучше", visual: { type: "compare" } },
      { title: "Не нажимай пас до того, как увидел рейзера", visual: { type: "flow" } }
    ],
    deep: {
      title: "Цена колла и точные матрицы",
      body: "Сравнение защит новых игроков и лиг, расчёт цены колла, точные матрицы и требуемая реализация выбранной руки.",
      cards: [
        { title: "Цена колла", visual: { type: "odds" } },
        { title: "Диапазон BB", visual: { type: "range-matrix" } },
        { title: "Эквити и нужная реализация", visual: { type: "compare" } }
      ]
    },
    practice: {
      title: "Отработай границу колла",
      body: "Решай префлоп-ситуации за интерактивным столом, а затем восстанови выбранный чарт защиты по памяти."
    },
    recall: true
  },
  resteal: {
    encounter: {
      title: "Рестил выигрывает фишки двумя способами",
      body: "Олл-ин после позднего опена получает прибыль через фолд соперника и через эквити при колле; решение меняют стек, мёртвые деньги и диапазон открытия."
    },
    wisdom: [
      { title: "Один олл-ин — два пути к фишкам", visual: { type: "flow" } },
      { title: "Прибыльное решение не обязано выигрывать каждый раз", visual: { type: "compare" } },
      { title: "Колл возможен, но сложнее в реализации", visual: { type: "compare" } },
      { title: "Чеклист перед пушем", visual: { type: "flow" } },
      { title: "Подстройка соперника меняет будущие решения", visual: { type: "ladder" } }
    ],
    deep: {
      title: "Когда олл-ин приносит фишки",
      body: "Интерактивная матрица показывает влияние стека, размера опена, диапазона открытия и диапазона колла; отдельно разобраны PKO и будущая подстройка.",
      cards: [
        { title: "Матрица прибыльности", visual: { type: "range-matrix" } },
        { title: "Профиль соперника", visual: { type: "compare" } },
        { title: "Риск и награда", visual: { type: "ladder" } }
      ]
    },
    practice: {
      title: "Отработай рестил в полном симуляторе",
      body: "Сыграй 25 полноценных раздач: курс засчитывает завершённую серию, а не процент совпадений с одной кнопкой."
    }
  }
};

const contentById = { ...loadSharedContent(), ...legacyContent };
const legacyPracticeSources = loadLegacyPracticeSources();
const mediaUsage = new Map();
for (const lessonMedia of Object.values(media.lessons || {})) {
  for (const item of lessonMedia) mediaUsage.set(item.id, (mediaUsage.get(item.id) || 0) + 1);
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function visualTypes(content) {
  const cards = [...(content?.wisdom || []), ...(content?.deep?.cards || [])];
  return [...new Set(cards.map((card) => card?.visual?.type).filter(Boolean))];
}

function mediaSummary(lessonId) {
  const items = Array.isArray(media.lessons?.[lessonId]) ? media.lessons[lessonId] : [];
  return {
    count: items.length,
    durationSeconds: items.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0),
    checkpointCount: items.reduce((sum, item) => sum + Number(item.learning?.checkpoints?.length || 0), 0),
    longFormCount: items.filter((item) => item.longForm).length,
    guidedCount: items.filter((item) => item.learning?.playback === "guided-excerpts").length,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: compactText(item.summary),
      learningTitle: compactText(item.learning?.title),
      watchFor: compactText(item.learning?.watchFor),
      rule: compactText(item.learning?.rule),
      practiceCue: compactText(item.learning?.practiceCue),
      checkpointCount: Number(item.learning?.checkpoints?.length || 0),
      durationSeconds: Number(item.durationSeconds || 0),
      longForm: Boolean(item.longForm),
      guided: item.learning?.playback === "guided-excerpts",
      usageCount: mediaUsage.get(item.id) || 1
    }))
  };
}

function normalizeAction(value) {
  const text = String(value || "").toLowerCase();
  if (/all.?in|олл|jam|push|пуш/.test(text)) return "all-in";
  if (/fold|пас/.test(text)) return "fold";
  if (/call|колл/.test(text)) return "call";
  if (/check|чек/.test(text)) return "check";
  if (/raise|bet|рейз|став/.test(text)) return "raise";
  return "choice";
}

function actionDistribution(spots, actionForSpot) {
  const families = {};
  for (const spot of spots) {
    const family = normalizeAction(actionForSpot(spot));
    families[family] = (families[family] || 0) + 1;
  }
  return {
    pokerAction: spots.length,
    tableBackedChoice: 0,
    conceptChoice: 0,
    families
  };
}

function practiceDetails(lesson, content) {
  if (lesson.kind === "legacy") {
    const rfiSpots = legacyPracticeSources.rfi?.spots || [];
    const bbSpots = legacyPracticeSources.bb?.practiceSpots || [];
    const legacy = {
      "rfi-open-position": {
        delivery: "specialized-table",
        bankSize: rfiSpots.length,
        sessionLength: Number(lesson.practice.sessionLength),
        passScore: Number(lesson.practice.passScore),
        grading: "accuracy",
        sourceVersion: legacyPracticeSources.rfi?.version || "",
        interaction: actionDistribution(rfiSpots, (spot) => spot.open ? "raise" : "fold")
      },
      "bb-call-defense": {
        delivery: "specialized-table",
        bankSize: bbSpots.length,
        sessionLength: Number(lesson.practice.sessionLength),
        passScore: Number(lesson.practice.passScore),
        grading: "accuracy",
        sourceVersion: legacyPracticeSources.bb?.version || "",
        interaction: actionDistribution(bbSpots, (spot) => spot.correct)
      },
      resteal: {
        delivery: "full-simulator",
        bankSize: null,
        sessionLength: Number(lesson.practice.sessionLength),
        passScore: null,
        grading: "completion",
        interaction: { pokerAction: null, tableBackedChoice: 0, conceptChoice: 0, families: {} }
      }
    }[lesson.id];
    return {
      trainerKey: lesson.skillKey,
      trainerTitle: lesson.title,
      title: compactText(content.practice?.title),
      summary: compactText(content.practice?.body),
      mediaLinkedSpots: 0,
      ...legacy
    };
  }

  const packMeta = practiceById.get(lesson.id);
  const pack = readJson(`assets/ffstart-course/practice/${lesson.id}.json`);
  const families = {};
  let pokerAction = 0;
  let tableBackedChoice = 0;
  let conceptChoice = 0;

  for (const spot of pack.spots) {
    const hasCards = Array.isArray(spot.table?.heroCards) && spot.table.heroCards.length > 0;
    const correct = (spot.options || []).find((option) => option.correct) || {};
    const family = normalizeAction(correct.actionType || correct.key || correct.label);
    families[family] = (families[family] || 0) + 1;
    if (family !== "choice") pokerAction += 1;
    else if (hasCards) tableBackedChoice += 1;
    else conceptChoice += 1;
  }

  const sampleIndexes = [...new Set([0, Math.floor((pack.spots.length - 1) / 2), pack.spots.length - 1])];
  return {
    delivery: "shared-decision-table",
    trainerKey: pack.trainer?.key || lesson.skillKey,
    trainerTitle: compactText(pack.trainer?.title || lesson.title),
    title: compactText(content.practice?.title),
    summary: compactText(content.practice?.body),
    bankSize: Number(packMeta?.spots ?? pack.spots.length),
    sessionLength: Number(pack.sessionLength || lesson.practice.sessionLength),
    passScore: Number(pack.passScore || lesson.practice.passScore),
    grading: "accuracy",
    interaction: { pokerAction, tableBackedChoice, conceptChoice, families },
    mediaLinkedSpots: pack.spots.filter((spot) => spot.mediaMoment?.mediaId).length,
    sampleQuestions: sampleIndexes.map((index) => compactText(pack.spots[index]?.question)).filter(Boolean)
  };
}

function contentSummary(content) {
  return {
    encounterTitle: compactText(content.encounter?.title),
    encounterSummary: compactText(content.encounter?.body),
    wisdomTitles: (content.wisdom || []).map((card) => compactText(card.title)).filter(Boolean),
    wisdomCount: Number(content.wisdom?.length || 0),
    deepTitle: compactText(content.deep?.title),
    deepSummary: compactText(content.deep?.body),
    deepCardTitles: (content.deep?.cards || []).map((card) => compactText(card.title)).filter(Boolean),
    deepCardCount: Number(content.deep?.cards?.length || 0),
    visualTypes: visualTypes(content),
    recall: Boolean(content.recall)
  };
}

const playByLesson = new Map((manifest.playSessions || []).map((session) => [session.afterLessonId, session]));
let lessonOrder = 0;

const modules = manifest.modules.map((module) => {
  const items = [];
  for (const lesson of module.lessons) {
    lessonOrder += 1;
    const content = contentById[lesson.id];
    if (!content) throw new Error(`Review content missing for ${lesson.id}`);
    items.push({
      reviewId: `lesson:${lesson.id}`,
      type: "lesson",
      id: lesson.id,
      order: lessonOrder,
      title: lesson.title,
      route: lesson.route,
      minutes: lesson.minutes,
      kind: lesson.kind,
      steps: lesson.steps,
      summary: compactText(content.encounter?.body),
      content: contentSummary(content),
      media: mediaSummary(lesson.id),
      practice: practiceDetails(lesson, content)
    });

    const session = playByLesson.get(lesson.id);
    if (session) {
      items.push({
        reviewId: `play:${session.id}`,
        type: "play",
        id: session.id,
        afterLessonId: session.afterLessonId,
        title: session.title,
        route: `/ffstart/play-session?session=${encodeURIComponent(session.id)}`,
        summary: compactText(session.body),
        kicker: session.kicker,
        hands: session.hands,
        mode: session.mode,
        modeLabel: session.modeLabel,
        stackLabel: session.stack?.label,
        tempo: session.tempo,
        duration: session.duration
      });
    }
  }

  const lessonItems = items.filter((item) => item.type === "lesson");
  const playItems = items.filter((item) => item.type === "play");
  const generatedPracticeSpots = lessonItems
    .filter((item) => item.practice.delivery === "shared-decision-table")
    .reduce((sum, item) => sum + Number(item.practice.bankSize || 0), 0);
  const legacyPracticeSpots = lessonItems
    .filter((item) => item.practice.delivery === "specialized-table")
    .reduce((sum, item) => sum + Number(item.practice.bankSize || 0), 0);
  const fullSimulatorPractices = lessonItems.filter((item) => item.practice.delivery === "full-simulator").length;
  return {
    reviewId: `module:${module.id}`,
    type: "module",
    id: module.id,
    order: module.order,
    title: module.title,
    summary: module.promise,
    totals: {
      lessons: lessonItems.length,
      minutes: lessonItems.reduce((sum, item) => sum + item.minutes, 0),
      videoLinks: lessonItems.reduce((sum, item) => sum + item.media.count, 0),
      videoSeconds: lessonItems.reduce((sum, item) => sum + item.media.durationSeconds, 0),
      generatedPracticeSpots,
      legacyPracticeSpots,
      fullSimulatorPractices,
      playSessions: playItems.length
    },
    items
  };
});

const lessons = modules.flatMap((module) => module.items.filter((item) => item.type === "lesson"));
const playSessions = modules.flatMap((module) => module.items.filter((item) => item.type === "play"));
const uniqueMedia = new Map(lessons.flatMap((lesson) => lesson.media.items.map((item) => [item.id, item])));
const generatedPracticeSpots = Number(practiceIndex.totalSpots || practiceIndex.packs.reduce((sum, pack) => sum + Number(pack.spots || 0), 0));
const legacyPracticeSpots = lessons
  .filter((lesson) => lesson.practice.delivery === "specialized-table")
  .reduce((sum, lesson) => sum + Number(lesson.practice.bankSize || 0), 0);
const fullSimulatorPractices = lessons.filter((lesson) => lesson.practice.delivery === "full-simulator").length;
const reviewData = {
  schema: "ffstart-architecture-review-data-v1",
  versions: {
    course: manifest.version,
    media: media.version,
    practice: practiceIndex.schema
  },
  title: "Архитектура FF Start",
  totals: {
    modules: modules.length,
    lessons: lessons.length,
    playSessions: playSessions.length,
    reviewItems: modules.length + lessons.length + playSessions.length,
    lessonMinutes: lessons.reduce((sum, lesson) => sum + lesson.minutes, 0),
    uniqueVideos: uniqueMedia.size,
    videoLinks: lessons.reduce((sum, lesson) => sum + lesson.media.count, 0),
    videoSeconds: [...uniqueMedia.values()].reduce((sum, item) => sum + item.durationSeconds, 0),
    checkpoints: [...uniqueMedia.values()].reduce((sum, item) => sum + item.checkpointCount, 0),
    practice: {
      generatedSpots: generatedPracticeSpots,
      legacySpots: legacyPracticeSpots,
      fullSimulatorLessons: fullSimulatorPractices
    }
  },
  modules
};

const outputArgument = process.argv.indexOf("--output");
if (outputArgument >= 0 && !process.argv[outputArgument + 1]) throw new Error("--output requires a file path");
const outputPath = outputArgument >= 0
  ? resolve(root, process.argv[outputArgument + 1])
  : join(root, "course/ffstart-review-data.json");

writeFileSync(outputPath, `${JSON.stringify(reviewData, null, 2)}\n`);
console.log(`FFStart review data: ${reviewData.totals.reviewItems} решений · ${reviewData.totals.videoLinks} видео-привязок · ${generatedPracticeSpots} сгенерированных ситуаций · ${legacyPracticeSpots} legacy-ситуаций · ${fullSimulatorPractices} legacy-симулятор`);
