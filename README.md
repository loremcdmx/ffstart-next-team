# FF Poker Learning Hub

Самостоятельный статический продукт с пошаговой программой **FF Start** и общим покерным симулятором.

**Публичная handoff-сборка:** https://ffstart-next-team.vercel.app/ffstart-handoff

**Публичный репозиторий для новой команды:** https://github.com/loremcdmx/ffstart-next-team

Обе ссылки открываются без входа в GitHub или Vercel. Handoff опубликован отдельным проектом; `https://ff-poker-learning-hub.vercel.app` остаётся прежним production baseline и не содержит эту сборку.

## Что входит в FF Start

- 11 последовательных модулей и 36 уроков;
- 33 новых урока-тренажёра на общей пошаговой платформе: решение за учебным столом → слайды мудрости → чарт или схема → практика;
- 3 самостоятельных legacy-тренажёра в том же маршруте: RFI, защита BB коллом и рестил;
- 5 игровых пауз с полными раздачами в общем симуляторе;
- 36 исходных видео (4:44:56) с режимом прослушивания, постерами, русскими captions и текстом по таймкодам;
- 36 активных видео-разборов со 116 точными остановками: вопрос перед просмотром, правило, граница применения, перенос в «Мудрость» и динамический фокус следующей серии за общим столом;
- записи 04, 11 и 12 с конфликтной терминологией или устаревшими диапазонами работают в режиме guided excerpts: ученик запускает только согласованные фрагменты, а актуальное решение берёт из тренажёра;
- 1 151 практическая ситуация в 33 пакетах, включая 8 заданий, точно связанных с видео: шесть многоуличных решений, одно задание по логике решений и одну следующую раздачу после эмоционального результата;
- переключение ролика сразу обновляет «Фокус серии», а CTA «Начать с этого задания →» ведёт к связанной практике и ставит её задания первыми; после уже данного ответа CTA честно меняется на «Начать новую связанную серию →».

Текущее число ситуаций всегда определяется из `assets/ffstart-course/practice/manifest.json`:

```bash
node -e 'const m=require("./assets/ffstart-course/practice/manifest.json"); console.log(m.packs.reduce((sum, pack) => sum + pack.spots, 0))'
```

## Локальный запуск

```bash
npm run dev
```

Откройте `http://127.0.0.1:4173/ffstart`. Локальный сервер поддерживает те же чистые URL, что и Vercel, а также корректные media MIME, `HEAD` и byte ranges для Safari, например `/ffstart/combinations` и `/rfi-open-position-lesson`.

Для передачи следующей команде откройте `http://127.0.0.1:4173/ffstart-handoff` и передайте корневой [`FFSTART_CODEX_HANDOFF.md`](FFSTART_CODEX_HANDOFF.md). Машинная версия всех 52 решений находится в [`course/ffstart-product-plan.json`](course/ffstart-product-plan.json), неизменяемый итог ревью — в [`course/ffstart-review-final.json`](course/ffstart-review-final.json).

## Сборка и проверка FF Start

Media-сборке нужны `ffmpeg` и `ffprobe` в `PATH`; generator проверяет их до чтения архива и выдаёт явную ошибку, если инструментов нет.

```bash
export FFSTART_SOURCE_ROOT="/absolute/path/to/фф старт + путь игрока"
export FFSTART_MEDIA_SOURCE_ROOT="/absolute/path/to/ffstart-private-source"
npm run build:ffstart
npm run check:ffstart
```

`build:ffstart:practice` собирает пакеты ситуаций из зафиксированного внешнего source snapshot, `build:ffstart:media` связывает private media archive с уроками, проверяет 36 авторских active-learning frames и обновляет web-артефакты, а `build:ffstart:pages` пересобирает 33 типовые страницы. Исходные MP4 и master M4A остаются вне deploy-репозитория; в нём хранятся media manifest, постеры, 36 компактных mono AAC, вычитанные VTT и синхронный текст. Видео воспроизводится через hashed Vimeo embed, а CDN URL хранится только как диагностический source reference. Полный `npm run check` остаётся release-gate для всего standalone-хаба, включая три legacy-урока и общий симулятор. Текущая выделенная handoff-сборка опубликована по прямому решению владельца; перед её переносом в другой проект новая команда должна повторно зафиксировать допустимый объём распространения media.

Обычная media-сборка сохраняет редакторские правки в `assets/ffstart-course/media/captions/*.vtt`. Режим `FFSTART_MEDIA_REIMPORT_CAPTIONS=1` заново импортирует raw ASR и очищает реестр approvals; captions и текст остаются скрытыми до новой вычитки и явного `FFSTART_MEDIA_MARK_CAPTIONS_REVIEWED=1`. Любой последующий публичный релиз отдельно требует подтверждённых прав на Vimeo-записи, выделенное аудио и производный текст.

Перед media-релизом отдельно запускается `npm run check:ffstart:media-delivery`. Gate проверяет все 36 hashed Vimeo oEmbed URL и репрезентативные player endpoints; текущий результат — `36/36` и `4/4`. Cold CDN probe по-прежнему показывает полный `200` вместо byte-range `206`, поэтому прямые MP4 не используются как primary player source и отмечаются только предупреждением. Отдельные web-аудиодорожки, синхронные captions и текст остаются same-origin артефактами. Перед новым публичным релизом или переносом материалов команда повторно подтверждает права на видео, аудио и производный текст.

Зафиксированный вход для текущей сборки: `af814314071cdd384a7a694b21a0ea37c922b5c5` в репозитории, заданном через `FFSTART_SOURCE_ROOT`.

## Карта продукта

- `course/ffstart-manifest.json` — порядок модулей, уроков и игровых пауз;
- `assets/ffstart-course/content-foundations.js`, `content-strategy.js` — авторские материалы 33 новых уроков-тренажёров;
- `assets/lesson-platform/` — общий интерфейс и логика пошагового урока;
- `assets/ffstart-course/practice/` — generated-пакеты практики и их индекс;
- `course/ffstart-video-learning.json` — авторские вопросы, правила, границы применения, фокусы практики и точные остановки всех 36 записей;
- `course/ffstart-media.json`, `assets/ffstart-course/media/` и `assets/ffstart-course/media-player.*` — generated-привязки, постеры, captions, тексты и общий active-learning плеер;
- `ffstart-review.html`, `assets/ffstart-course/review.*` и `course/ffstart-review-data.json` — внутренняя страница критики архитектуры с 52 независимыми решениями и резервным сохранением;
- `ffstart-handoff.html`, `assets/ffstart-course/handoff.*`, `FFSTART_CODEX_HANDOFF.md` и `course/ffstart-product-plan.json` — готовый план передачи с целевой программой и архивом материалов на повторное рассмотрение;
- `ffstart/*.html` — generated-страницы 33 уроков; `ffstart/play-session.html` — общая игровая пауза;
- `rfi-open-position-lesson.html`, `bb-call-defense-lesson.html`, `resteal-lesson.html` — три самостоятельных legacy-урока;
- `poker-simulator.html`, `assets/poker-simulator/`, `assets/poker-kit/simulator/` — полный симулятор и общий движок;
- `api/trainer-events.js`, `assets/poker-progress/progress.js` — прогресс и доставка учебных событий.

Подробный контракт передачи, ownership, release-порядок и известные границы: [`docs/FFSTART_HANDOFF.md`](docs/FFSTART_HANDOFF.md). Устройство страницы критики и восстановление решений: [`docs/FFSTART_ARCHITECTURE_REVIEW.md`](docs/FFSTART_ARCHITECTURE_REVIEW.md). Приёмочная матрица видео, связанной практики и адаптивной вёрстки: [`docs/FFSTART_DESIGN_QA.md`](docs/FFSTART_DESIGN_QA.md).

Происхождение первоначального standalone snapshot описано в [`docs/SNAPSHOT_PROVENANCE.md`](docs/SNAPSHOT_PROVENANCE.md).
