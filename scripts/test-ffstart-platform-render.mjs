import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = require(path.join(repoRoot, "assets/lesson-platform/lesson-platform.js"));
const test = platform.__test;

const spot = {
  id: "first-decision",
  question: "Твоё действие?",
  table: {
    heroCards: ["As", "Kd"],
    heroPosition: "BTN",
    pot: 2.5,
    toCall: 0,
    seats: [{ position: "BTN", stack: 40 }, { position: "BB", stack: 40 }]
  },
  wisdom: "Сначала оцени позицию.",
  options: [
    { key: "fold", label: "Пас", feedback: "Слишком тайтово." },
    { key: "raise", label: "Рейз 2 BB", correct: true, feedback: "Позиция позволяет открыть руку." }
  ]
};

const lesson = test.normalizeLesson({
  id: "platform-test",
  key: "platform_test",
  title: "Тестовый урок",
  encounter: {
    title: "Сначала сыграй",
    body: "Прими решение за функциональным столом.",
    spot
  },
  wisdom: [
    {
      title: "Одна мысль",
      body: "Один слайд объясняет ровно одну идею.",
      rule: "Позиция до карт.",
      visual: {
        type: "compare",
        items: [{ label: "EP", value: "узко" }, { label: "BTN", value: "широко", tone: "accent" }]
      }
    },
    {
      title: "Вторая мысль",
      body: "Сравни границы.",
      visual: { type: "bar", items: [{ label: "EP", value: 20 }, { label: "BTN", value: 60 }] }
    }
  ],
  deep: {
    title: "Читаем форму",
    cards: [{
      title: "Матрица",
      visual: { type: "range-matrix", defaultState: "fold", cells: { AA: "raise", AKs: "raise" } }
    }]
  },
  media: [{
    id: "platform-video",
    title: "Разбор решения",
    videoUrl: "https://cdn.funfarm.name/Start/example.mp4",
    durationSeconds: 120
  }],
  practice: {
    mediaFocus: "Перед ответом назови позицию и цену продолжения."
  },
  recall: {
    title: "Восстанови форму",
    visual: { type: "range-matrix", defaultState: "fold", cells: { AA: "raise" } }
  }
}, { spots: [spot, { ...spot, id: "second-decision" }], passScore: 75 });

const shell = test.renderShell(lesson);
assert.match(shell, /data-step="encounter"/);
assert.match(shell, /data-step="wisdom" hidden/);
assert.match(shell, /data-step="deep" hidden/);
assert.match(shell, /data-ffstart-media-host/, "lesson media mounts inside the existing deep step");
assert.match(shell, /data-step="practice" hidden/);
assert.match(shell, /data-step="recall" hidden/);
assert.match(shell, /role="tab"[^>]+aria-controls="platform-test-panel-encounter"/);
assert.match(shell, /role="tabpanel"[^>]+aria-labelledby="platform-test-tab-encounter"/);
assert.equal((shell.match(/data-step-target=/g) || []).length, 5, "optional recall adds a fifth stage");
assert.equal((shell.match(/data-step-target=[^>]+disabled/g) || []).length, 4, "all steps after the first decision start locked");
assert.equal((shell.match(/data-wisdom-slide=/g) || []).length, 2, "all wisdom thoughts render as slides");
assert.match(shell, /aria-hidden="true" inert data-wisdom-slide="1"/, "inactive wisdom is hidden from assistive interaction");
assert.match(shell, /data-ffstart-table-kind="encounter"/, "encounter table host exists");
assert.match(shell, /data-ffstart-table-kind="practice"/, "practice table host exists");
assert.match(shell, /ffstart-practice-focus[\s\S]*Перед ответом назови позицию и цену продолжения/, "video learning becomes a visible focus above the functional simulator");
assert.match(shell, /data-media-practice-focus/, "the selected video can update the simulator focus without rebuilding the lesson");
assert.equal((shell.match(/ffstart-table-host lesson-table-host/g) || []).length, 2, "both decisions inherit the shared compact simulator profile");
assert.doesNotMatch(shell, /provenance|debug|источник/i, "learner markup contains no provenance or debug copy");
assert.doesNotMatch(test.renderShell({ ...lesson, media: [] }), /data-ffstart-media-host/, "lessons without media keep their existing markup");

const rotatingSpots = Array.from({ length: 60 }, (_, index) => ({
  ...spot,
  id: `rotating-${index + 1}`,
  options: index < 54
    ? [
        { key: "check", label: "Чек", feedback: "Здесь лучше поставить." },
        { key: "bet", label: "Ставка", actionType: "raise", correct: true, feedback: "Ставка использует преимущество диапазона." }
      ]
    : [
        { key: "check", label: "Чек", actionType: "check", correct: true, feedback: "Чек сохраняет реализацию эквити." },
        { key: "bet", label: "Ставка", feedback: "Автоматическая ставка здесь лишняя." }
      ]
}));
const rotatingLesson = { ...lesson, id: "rotating-practice", practice: { ...lesson.practice, spots: rotatingSpots, sessionLength: 14, passScore: 75 } };
const seenRotating = new Set();
for (let attempt = 0; attempt < 6; attempt += 1) {
  const queue = test.practiceQueue(rotatingLesson, attempt);
  assert.equal(queue.length, 14, "rotating practice keeps the promised session length");
  assert.equal(new Set(queue.map((item) => item.id)).size, queue.length, "a practice session has no duplicate situations");
  queue.forEach((item) => seenRotating.add(item.id));
  const familyCounts = queue.reduce((counts, item) => {
    const family = test.actionFamily(item);
    counts[family] = (counts[family] || 0) + 1;
    return counts;
  }, {});
  const passNeeded = Math.ceil(queue.length * rotatingLesson.practice.passScore / 100);
  assert.ok(Math.max(...Object.values(familyCounts)) < passNeeded, "one constant poker action cannot pass a balanced session");
}
assert.equal(seenRotating.size, rotatingSpots.length, "bounded restarts expose the complete practice pool");

const linkedA = { ...spot, id: "linked-a", mediaMoment: { mediaId: "video-a", start: 12 } };
const linkedB = { ...spot, id: "linked-b", mediaMoment: { mediaId: "video-a", start: 48 } };
const linkedOther = { ...spot, id: "linked-other", mediaMoment: { mediaId: "video-b", start: 20 } };
const unlinked = { ...spot, id: "unlinked" };
const mediaLesson = { ...lesson, practice: { ...lesson.practice, spots: [unlinked, linkedA, linkedOther, linkedB], sessionLength: 4 } };
const mediaQueue = test.practiceQueueForMedia(mediaLesson, [unlinked, linkedOther, linkedB, linkedA], "video-a");
assert.deepEqual(mediaQueue.map((item) => item.id), ["linked-a", "linked-b", "unlinked", "linked-other"], "a video CTA starts with the exact linked simulator decisions and preserves the rest of the session");
assert.deepEqual(test.practiceQueueForMedia(mediaLesson, [unlinked, linkedOther], "missing").map((item) => item.id), ["unlinked", "linked-other"], "a video without a linked situation leaves the normal practice queue intact");
const platformSource = readFileSync(path.join(repoRoot, "assets/lesson-platform/lesson-platform.js"), "utf8");
assert.match(platformSource, /mediaId:\s*practice\.mediaId[\s\S]*queueIds:/, "the exact video selection persists together with its focused practice queue");
assert.match(platformSource, /initialItemId:\s*controller\.state\.practice\.mediaId/, "a resumed lesson restores the matching video tab before it updates the practice cue");
assert.match(platformSource, /hasAnswered[\s\S]*resetPracticeState[\s\S]*practiceQueueForMedia/, "an exact CTA starts a fresh focused series even after an earlier answer");
assert.match(platformSource, /Начать новую связанную серию/, "after an answer the exact CTA names the reset instead of discarding progress silently");

const matrix = test.renderVisual({
  type: "range-matrix",
  defaultState: "fold",
  cells: { AA: "raise", AKs: "raise", AKo: "raise" },
  states: ["fold", "raise"],
  interactive: true
});
assert.equal((matrix.match(/data-ffstart-matrix-cell/g) || []).length, 169, "matrix has all 169 starting hands");
assert.equal((matrix.match(/tabindex="0"/g) || []).length, 1, "matrix uses one roving tab stop");
assert.equal((matrix.match(/tabindex="-1"/g) || []).length, 168, "remaining matrix cells are reached with arrow keys");
assert.match(matrix, /data-hand="AA"[^>]*data-matrix-state="raise"/);
assert.match(matrix, /data-hand="AKs"[^>]*data-matrix-state="raise"/);
assert.match(matrix, /data-hand="AKo"[^>]*data-matrix-state="raise"/);

for (const [type, data] of Object.entries({
  ladder: { items: [{ label: "A", value: 1 }] },
  bar: { items: [{ label: "A", value: 1 }] },
  compare: { items: [{ label: "A", value: "1" }] },
  flow: { steps: [{ label: "A" }] },
  "seat-map": { seats: [{ position: "BTN", label: "BTN" }] },
  "hand-rank": { items: [{ label: "Пара" }] },
  "stack-zones": { zones: [{ label: "Короткий", value: "10 BB" }] },
  odds: { pot: "4 BB", call: "1 BB", required: 20, equity: 30 },
  "range-matrix": { cells: {} }
})) {
  assert.ok(test.renderVisual({ type, ...data }).length > 80, `${type} renderer produces complete markup`);
}

const expected = {};
const draft = {};
for (let row = 0; row < 13; row += 1) {
  for (let column = 0; column < 13; column += 1) {
    const hand = test.handAt(row, column);
    expected[hand] = "fold";
    draft[hand] = "fold";
  }
}
expected.AA = "raise";
draft.AA = "raise";
const perfect = test.scoreRecall(draft, expected);
assert.equal(perfect.totalCombos, 1326, "recall is scored by all starting-hand combinations");
assert.equal(perfect.correctCombos, 1326);
assert.equal(perfect.score, 100);

draft.AA = "fold";
const onePairMiss = test.scoreRecall(draft, expected);
assert.equal(onePairMiss.correctCombos, 1320, "a missed pair cell costs six combinations");
assert.equal(onePairMiss.errors, 1);

assert.throws(() => test.normalizeLesson({ id: "broken", title: "Broken" }, { spots: [] }), /encounter/, "incomplete lessons fail before rendering placeholders");

const snapshotContext = { innerWidth: 1280 };
snapshotContext.window = snapshotContext;
snapshotContext.globalThis = snapshotContext;
for (const asset of [
  "assets/poker-kit/decks/deck-library.js",
  "assets/poker-kit/chips/chip-library.js",
  "assets/poker-simulator/simulator-board-render.js",
  "assets/poker-simulator/simulator-seat-slots.js",
  "assets/poker-simulator/simulator-seat-renderer.js",
  "assets/poker-simulator/simulator-table-renderer.js",
  "assets/poker-trainer-shell/simulator-snapshot.js"
]) {
  runInNewContext(readFileSync(path.join(repoRoot, asset), "utf8"), snapshotContext, { filename: asset });
}
const decimalCommaTable = snapshotContext.FFTrainerSimulatorSnapshot.buildTable({
  id: "decimal-comma-action",
  question: "Как сыграть?",
  table: {
    seats: ["EP", "MP", "CO", "BTN", "SB", "BB"].map((label) => ({ label, state: label === "MP" ? "hero" : "waiting" })),
    heroPosition: "MP",
    heroStack: "18 BB",
    effectiveStack: "18 BB",
    pot: "4,6 BB",
    toCall: "2,1 BB",
    heroCards: ["As", "Ks"],
    boardCards: [],
    street: "preflop",
    actionLine: ["EP рейз 2,1 BB"],
    dealerPosition: "BTN"
  },
  options: [
    { key: "fold", label: "Пас", actionType: "fold" },
    { key: "jam", label: "Олл-ин", actionType: "all-in", correct: true }
  ]
}, {});
const epSeat = decimalCommaTable.seats.find((seat) => seat.position === "EP");
assert.equal(epSeat?.committedStreet, 2.1, "decimal comma remains one EP raise action");
assert.ok(!decimalCommaTable.__actions.some((action) => action.seatKey === "BB" && action.amountBb === 1), "decimal comma must not create a phantom BB action");

console.log("FFStart platform render contract: OK");
