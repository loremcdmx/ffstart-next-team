# FF Start lesson platform

Shared data-driven runtime for the new FF Start lessons. It owns the lesson flow and presentation; lesson content stays in separate data files.

## Page contract

Load the existing poker-kit renderers, trainer-shell snapshot and practice adapter before the platform. Replace `<release-token>` on every deploy because production assets are immutable:

```html
<link rel="stylesheet" href="/assets/poker-kit/tokens.css?v=<release-token>">
<link rel="stylesheet" href="/assets/poker-kit/decks/decks.css?v=<release-token>">
<link rel="stylesheet" href="/assets/poker-kit/chips/chips.css?v=<release-token>">
<link rel="stylesheet" href="/assets/poker-simulator/simulator-table.css?v=<release-token>">
<link rel="stylesheet" href="/assets/poker-simulator/simulator-polish.css?v=<release-token>">
<link rel="stylesheet" href="/assets/poker-trainer-shell/shell.css?v=<release-token>">
<link rel="stylesheet" href="/assets/lesson-platform/lesson-platform.css?v=<release-token>">

<main data-ffstart-lesson></main>

<!-- keep this dependency order; generated pages in scripts/ffstart/build-course-pages.mjs are canonical -->
<script src="/assets/poker-kit/decks/deck-library.js?v=<release-token>"></script>
<script src="/assets/poker-kit/chips/chip-library.js?v=<release-token>"></script>
<script src="/assets/poker-simulator/simulator-random.js?v=<release-token>"></script>
<script src="/assets/poker-simulator/simulator-board-render.js?v=<release-token>"></script>
<script src="/assets/poker-simulator/simulator-seat-slots.js?v=<release-token>"></script>
<script src="/assets/poker-simulator/simulator-seat-renderer.js?v=<release-token>"></script>
<script src="/assets/poker-simulator/simulator-table-renderer.js?v=<release-token>"></script>
<script src="/assets/poker-trainer-shell/simulator-snapshot.js?v=<release-token>"></script>
<script src="/assets/poker-trainer-shell/simulator-practice.js?v=<release-token>"></script>
<script src="/assets/poker-progress/progress.js?v=<release-token>"></script>
<script src="/assets/lesson-platform/lesson-platform.js?v=<release-token>"></script>
```

Mount one complete lesson:

```js
FFStartLessonPlatform.mount(document.querySelector("[data-ffstart-lesson]"), {
  lesson: FFStartLessons.current,
  practice: FFStartPractice.current
});
```

The first encounter and every practice item use the same `spot` shape accepted by `FFTrainerSimulator.renderDecision`. Each spot must have at least two `options` and exactly one `option.correct`.

## Lesson shape

```js
{
  id: "lesson-key",
  key: "canonical_trainer_key",
  version: "2026-07-14",
  title: "Название урока",
  eyebrow: "FF Старт · модуль",
  encounter: {
    title: "Одна сильная мысль",
    subtitle: "Короткая рамка",
    body: "Зачем ученику принимать это решение",
    support: "На что смотреть до клика",
    spot: { id, question, table, options }
  },
  wisdom: [
    {
      title: "Одна мысль на слайд",
      body: "Объяснение",
      rule: "Правило для запоминания",
      visual: { type: "compare", items: [] }
    }
  ],
  deep: {
    title: "Подробный разбор",
    body: "Общая рамка",
    cards: [
      { title: "Чарт", body: "Как читать", visual: { type: "range-matrix", cells: {} } }
    ]
  },
  practice: {
    title: "Практика",
    body: "Что тренируем",
    passScore: 80
  },
  recall: { // optional
    title: "Восстанови чарт",
    watchSeconds: 10,
    visual: { type: "range-matrix", cells: {}, defaultState: "fold" },
    states: [{ key: "fold", label: "Пас" }, { key: "raise", label: "Рейз" }]
  }
}
```

`practice.spots` is passed separately or inside `lesson.practice`. Feedback is assembled from the selected option, the correct option, `spot.explanation`, and `spot.wisdom`.

## Visuals

Every visual is data-driven. Supported types:

- `ladder` / `bar`
- `compare`
- `flow`
- `seat-map`
- `hand-rank`
- `stack-zones`
- `odds`
- `range-matrix`

The matrix is always 13×13. It uses roving keyboard focus, arrow navigation, click/Enter/Space interaction, optional state cycling, and weighted 1,326-combination scoring in recall mode.

## Runtime behavior

- Later steps remain disabled until the learner answers the first simulator decision.
- Wisdom slides support buttons, dots, Home/End, arrows and pointer swipe; inactive slides are `aria-hidden` and `inert`.
- Practice keeps correct/error/streak counters, renders feedback and the next-hand button inside the shared table controls, and records the completed result.
- Central `FFTrainerEvents.send` and `FFPlayerProgress.setResult` are used when present. An offline browser keeps the same event/result objects in bounded local storage.
- `mount()` returns `go()`, `restartPractice()`, `getState()` and `destroy()`.
