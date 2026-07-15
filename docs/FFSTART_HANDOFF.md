# FF Start: контракт передачи

Документ фиксирует границы продукта, ownership и безопасный порядок доработки. Это не отчёт о конкретном деплое: перед публикацией исполнитель обязан проверить чистый scoped diff, актуальный source pin, все release-gates и production URL.

## 1. Состав продукта

| Часть | Текущее состояние | Источник истины |
| --- | --- | --- |
| Программа | 11 модулей, 36 уроков | `course/ffstart-manifest.json` |
| Новые пошаговые тренажёры | 33 урока-тренажёра на общей lesson platform | manifest + два authored content-файла |
| Legacy-уроки | 3 отдельные реализации: RFI, защита BB коллом, рестил | соответствующие HTML и каталоги `assets/poker-*-lesson/` |
| Практика новых уроков | 33 generated-пакета; сейчас 1 151 ситуация, включая 8 заданий со связью на точный видеофрагмент | `assets/ffstart-course/practice/manifest.json` и JSON-пакеты |
| Свободная игра | 5 игровых пауз по 5–10 полных раздач | `course/ffstart-manifest.json`, `ffstart/play-session.html` |
| Исходный медиакурс | 36 уникальных видео, 4:44:56; 36 active-learning frames, 116 точных остановок, guided excerpts для записей 04/11/12, 36 постеров, VTT и текстов | private media archive + `course/ffstart-video-learning.json` + generated media manifest |
| Игровой движок | единый полный симулятор и shared snapshot для учебных решений | `poker-simulator.html`, `assets/poker-simulator/`, `assets/poker-kit/simulator/` |

Число ситуаций нельзя переносить из старого отчёта. Перед передачей или релизом его нужно пересчитать из текущего practice index:

```bash
node -e 'const m=require("./assets/ffstart-course/practice/manifest.json"); console.log(m.packs.reduce((sum, pack) => sum + pack.spots, 0))'
```

## 2. Ownership: authored и generated

Редактируются вручную:

- `course/ffstart-manifest.json` — маршрут, метаданные уроков, пороги и игровые паузы;
- `course/ffstart-video-learning.json` — смысловой слой всех 36 записей: вопрос перед просмотром, правило, граница применения, фокус практики, политика guided excerpts и 2–4 точных остановки;
- `assets/ffstart-course/content-foundations.js` и `content-strategy.js` — слайды, чарты, объяснения и framing 33 уроков;
- `assets/lesson-platform/` — общий runtime и визуальный слой;
- `assets/ffstart-course/boot.js`, `course.js`, `play-session.js` и соответствующие CSS — загрузка курса, обзор и свободная игра;
- `assets/ffstart-course/media-player.js`, `media-player.css` и `legacy-media.js` — единый video/audio/text runtime новых и legacy-уроков;
- `assets/ffstart-course/media/captions/*.vtt` — редакторская версия субтитров; media generator сохраняет эти правки по умолчанию;
- `ffstart.html` и `ffstart/play-session.html` — обзор и оболочка игровой паузы;
- три legacy-страницы и их собственные asset-каталоги;
- `scripts/ffstart/` — правила преобразования source-данных.

Генерируются и не должны исправляться точечно:

- `assets/ffstart-course/practice/*.json`, включая `practice/manifest.json`, — командой `npm run build:ffstart:practice`;
- `course/ffstart-media.json`, постеры и `assets/ffstart-course/media/transcripts/*.json` — командой `npm run build:ffstart:media` из private media archive;
- 33 файла `ffstart/<lesson-id>.html` — командой `npm run build:ffstart:pages`.

Если ошибка видна в generated JSON, исправление принадлежит generator, manifest или внешнему source snapshot. Если ошибка повторяется во всех новых уроках, сначала проверяется lesson platform. Три legacy-урока не генерируются и остаются отдельными продуктами внутри общего маршрута.

## 3. Внешний source snapshot

Практика собирается из отдельного checkout, который задаётся переменной `FFSTART_SOURCE_ROOT`. Если переменная не задана, generator ищет соседний каталог `../фф старт + путь игрока`; для воспроизводимой передачи всегда задавайте абсолютный путь явно.

Зафиксированный commit текущего входа:

```text
af814314071cdd384a7a694b21a0ea37c922b5c5
```

Проверка перед сборкой:

```bash
export FFSTART_SOURCE_ROOT="/absolute/path/to/фф старт + путь игрока"
test "$(git -C "$FFSTART_SOURCE_ROOT" rev-parse HEAD)" = "af814314071cdd384a7a694b21a0ea37c922b5c5"
git -C "$FFSTART_SOURCE_ROOT" status --short
```

Незакоммиченные изменения во внешнем checkout тоже влияют на читаемые файлы, даже если `HEAD` совпадает. Сборку с dirty source можно использовать только для осознанной разработки; для release provenance нужен чистый или отдельно задокументированный вход и review generated diff.

Generator читает ровно 18 внешних файлов. Их владелец — source-репозиторий; standalone-хаб владеет только преобразованием и опубликованным snapshot:

1. `assets/poker-trainer-shell/packs.js`
2. `assets/poker-combinations/data.js`
3. `assets/poker-tournament/foundation-data.js`
4. `assets/poker-tournament/foundation-command-data.js`
5. `assets/poker-range-call/data.js`
6. `assets/poker-range-call/lab-data.js`
7. `assets/poker-bb-defense/data.js`
8. `assets/poker-bb-defense/lab-data.js`
9. `assets/poker-short-stack/data.js`
10. `assets/poker-short-stack/lab-data.js`
11. `assets/poker-outs/data.js`
12. `assets/poker-outs/lab-data.js`
13. `assets/poker-icm-short/data.js`
14. `assets/poker-icm-short/lab-data.js`
15. `assets/poker-isolation/data.lazy.json`
16. `assets/poker-postflop-aggressor/data.lazy.json`
17. `assets/poker-vs-3bet/data.lazy.json`
18. `assets/poker-mixed-exam/data.lazy.json`

`practice.sourceRows` в course manifest связывает урок с учебными наборами внутри этих файлов. Это provenance curriculum mapping, а не второй источник данных.

## 4. Сборка

Prerequisite media-стадии: доступные в `PATH` `ffmpeg` и `ffprobe`. Generator делает preflight обоих инструментов до обработки; текущий validated archive собран FFmpeg 8.1, но контракт не привязан к одному package-manager path.

```bash
export FFSTART_SOURCE_ROOT="/absolute/path/to/фф старт + путь игрока"
export FFSTART_MEDIA_SOURCE_ROOT="/absolute/path/to/ffstart-private-source"
npm run build:ffstart:practice
npm run build:ffstart:media
npm run build:ffstart:pages
```

Или обе стадии одной командой:

```bash
npm run build:ffstart
```

После сборки обязательно изучить generated diff. Особое внимание: число пакетов, число ситуаций по каждому уроку, единственность правильного действия, цена колла и текущий банк, доступные действия на текущем состоянии стола, learner-visible тексты и cache-version в HTML.

## 5. Проверки

Быстрый продуктовый gate FF Start:

```bash
npm run check:ffstart
```

Он включает contracts общей платформы и рендера, course contract и отдельный copy-quality lint. Перед production release дополнительно нужен общий gate standalone-хаба:

```bash
npm run check
git diff --check
```

Проверка внешней video delivery намеренно не входит в offline gate и запускается отдельно перед публикацией:

```bash
npm run check:ffstart:media-delivery
```

Для UI-изменений одного зелёного Node-gate недостаточно. Проверяются реальные маршруты в браузере минимум на desktop, laptop и mobile: overview, открывающий decision, слайды мудрости, чарт, practice до и после ответа, summary, legacy-переходы и хотя бы одна живая игровая пауза в полном симуляторе. В video-learning слое отдельно проверяются guided excerpts 04/11/12, смена «Фокуса серии» при переключении ролика, общий CTA «Перейти к практике →» и точный CTA «Начать с этого задания →» на всех четырёх уроках со связанной практикой. Полная матрица находится в `docs/FFSTART_DESIGN_QA.md`. Отдельно проверяются console errors, горизонтальный overflow, focus/keyboard и состояние после reload.

## 6. Cache immutability

`vercel.json` отдаёт всё под `/assets/*` с `Cache-Control: public, max-age=31536000, immutable`. Поэтому изменение содержимого под тем же URL без нового cache token недопустимо: часть учеников продолжит видеть старый JS, CSS или JSON целый год.

Release-правило:

1. назначить новый уникальный release token;
2. обновить token в `scripts/ffstart/build-course-pages.mjs`, `assets/ffstart-course/boot.js` и во всех вручную поддерживаемых FF Start HTML/loader URL, которые ссылаются на изменённые assets;
3. заново сгенерировать страницы;
4. проверить, что изменённые CSS/JS и practice JSON запрашиваются с новым `?v=`;
5. не переиспользовать старый token даже после rollback — для следующего содержимого нужен следующий URL.

`course/ffstart-manifest.json` загружается с `cache: "no-store"`, но это не отменяет versioning для файлов под `/assets/`.

## 7. Прогресс и telemetry

Канонические границы клиента:

- завершённый результат пишет `FFPlayerProgress.setResult(...)`;
- решения и сессии отправляет `FFTrainerEvents.send(...)`;
- игровая пауза без оценки сохраняет локальное завершение через `setResult(..., { telemetry: false })`, а upstream получает только `trainer_session` с `evaluated: false`, чтобы score-shaped API не превратил отсутствие оценки в `0%`;
- browser endpoint — `POST /api/trainer-events`;
- serverless proxy в `api/trainer-events.js` пересылает payload в `TRAINER_EVENTS_UPSTREAM`; без env используется `https://ff-start-poker-hub.vercel.app/api/trainer-events`;
- прогресс хранится локально в `localStorage["ff-player-progress-v1"]`;
- очередь событий хранится в ограниченном `localStorage["ff-trainer-events-v1"]`; состояние нового урока — в profile-scoped ключах `ffstart-lesson-progress-v1:<profile-id>:<lesson-key>`.

Этот репозиторий не содержит серверного хранилища telemetry: proxy только пересылает запрос и возвращает ответ upstream. В payload могут быть id/имя/room профиля, route/href/user-agent, выбранное действие, состояние учебного spot и результат; proxy также передаёт upstream входной `X-Forwarded-For`. Не добавляйте email, токены, свободные заметки ученика или другие лишние персональные данные в `metadata`. Не логируйте тела событий и не меняйте upstream без согласованной privacy-проверки. Для отключения внешней доставки на статическом окружении используется `window.FF_STATIC_LEARNING_HUB`.

## 8. Граница деплоя

Production этого продукта — Vercel-проект `ff-poker-learning-hub` и домен `ff-poker-learning-hub.vercel.app`. Внешний `FFSTART_SOURCE_ROOT` является только read-only build input и не является target деплоя. Команды build/check ничего не публикуют.

Перед публикацией:

- получить чистый, reviewable scoped changeset без чужого WIP;
- подтвердить source commit и отсутствие неожиданных source-изменений;
- выполнить build, `npm run check`, browser QA и проверить новый cache token;
- публиковать только из standalone-репозитория;
- после деплоя проверить production `/ffstart`, один новый урок, все три legacy-маршрута, игровую паузу, `/api/trainer-events` contract и отсутствие stale assets.

## 9. Media: текущее состояние и release-граница

Исходный медиакурс выгружен и воспроизводимо обработан в отдельном private archive: 36/36 MP4, 36 выделенных M4A, ffprobe-метаданные, 432 review frames, 36 contact sheets и 36 наборов raw transcript/SRT/VTT. Суммарная длительность — 17 096,472 секунды (4:44:56). Валидатор архива завершён со статусом `ok`, без пропущенных файлов и ошибок.

Standalone-продукт не копирует 14,3 GB исходных MP4. `scripts/ffstart/build-media-library.mjs` связывает все 36 записей с 32 подходящими уроками, строит hashed Vimeo embed из каждой unlisted-ссылки и локально публикует 36 постеров, отредактированные VTT, 36 lazy transcript JSON и 36 отдельных mono AAC-дорожек. Web-аудио занимает 141 624 064 байта вместо исходных 675 917 264 байт и не загружает видеоряд в режиме «Только слушать». Видео встроено в существующий шаг «Чарт», а не образует отдельный формальный таб. Общий плеер синхронизирует Vimeo Player API, видимые русские captions, раскрываемый текст и переход по таймкоду; при уходе с шага воспроизведение останавливается. Если Player API недоступен, сам Vimeo iframe и отдельное аудио сохраняют нативные controls. RFI и защита BB используют тот же компонент. Исходный CDN MP4 хранится в manifest только как диагностический source reference и не попадает в primary player markup.

Транскрипт не является учебным результатом сам по себе. Авторский `course/ffstart-video-learning.json` превращает каждую из 36 записей в active-learning frame: постановку задачи до просмотра, краткий вывод, правило, при необходимости границу применения, фокус следующей практической серии и 2–4 точных момента. Всего валидируются 116 остановок. Клик по остановке переводит Vimeo или audio-only плеер на нужное место; до двух video frames урока автоматически становятся полноценными дополнительными слайдами «Мудрости». При переключении ролика его `practiceCue` сразу обновляет «Фокус серии» над функциональным shared simulator snapshot.

Практика содержит восемь заданий с `mediaMoment`: три многоуличных решения в `versus-aggressive` для записи 23, три в `versus-passive` для записи 24, одно задание про A/B/C-game в `decision-logic` для записи 35 и одну независимую следующую раздачу в `microstakes` для записи 33. Шесть первых задач распределены по сериям из восьми реальных ситуаций; два последних увеличивают общий practice inventory до 1 151. Техническая связь ученику не показывается. Для такого видео CTA называется «Начать с этого задания →» и ставит связанные с выбранной записью задачи первыми. После первого ответа подпись меняется на «Начать новую связанную серию →», поэтому осознанный перезапуск не маскируется под обычный переход. Если точной связи нет, остаётся «Перейти к практике →» и текущая обычная серия не сбрасывается.

Конфликтующие или быстро устаревающие формулировки исходника не повышаются до общих правил. Запись 04 из-за несовместимой терминологии позиций, а записи 11–12 из-за прежних RFI-диапазонов имеют политику `guided-excerpts`: плеер без навигационных controls запускает только проверенные интервалы `start`–`end`, а отдельные аудио, transcript и внешняя ссылка для этих записей не показываются. Стратегической истиной остаются актуальные чарт и практика тренажёра. Советы по ICM, PKO, 4-бетам и размерам ставок получают явную контекстную границу.

Source root задаётся через `FFSTART_MEDIA_SOURCE_ROOT`; без переменной используется локальный private archive `/Users/loremcdmx/Documents/ffstart-private-source-2026-07-14`. Raw-распознавание в archive не редактируется. Learner-facing VTT можно вычитывать вручную: обычная пересборка сохраняет такие правки и заново строит из них синхронный transcript JSON. `FFSTART_MEDIA_REIMPORT_CAPTIONS=1` сознательно сбрасывает VTT к raw source и очищает `course/ffstart-caption-review.json`; captions и текст скрываются до нового редакторского прохода. Только после него явная сборка с `FFSTART_MEDIA_MARK_CAPTIONS_REVIEWED=1` снова разрешает их показ.

`npm run check:ffstart:media-delivery` теперь проверяет delivery того источника, который реально видит ученик: все 36 Vimeo oEmbed URL возвращают правильный hashed player, а четыре репрезентативных player endpoints — `200 text/html` без Vimeo error. Gate зелёный. Тот же скрипт оставляет cold range diagnostic по четырём CDN MP4: сервер всё ещё отвечает полным `200` с `Content-Length` от 566 MB до 2,71 GB, но это предупреждение больше не влияет на трафик плеера, потому что CDN URL не вставляется в primary markup.

Перед публичным релизом остаются две внешние границы, которые локальная интеграция не может подменить:

1. письменное подтверждение прав на публичную раздачу Vimeo-записей, выделенного аудио, captions и производного текста;
2. production smoke на целевом домене: Vimeo embed policy, старт/seek, переключение видео ↔ аудио, captions, transcript timecode, cache policy и объём передачи на мобильной сети.

До подтверждения прав media можно разрабатывать и проверять локально, но нельзя считать разрешённой публичную публикацию. В интерфейсе нет заглушек или обещаний будущего контента: урок либо получает полноценный проверенный media item, либо сохраняет исходную структуру без пустого блока.

## 10. Definition of done для следующей доработки

- изменение сделано в правильном owned source, а generated output пересобран;
- 33 новых урока-тренажёра и 3 legacy-урока остаются в одном последовательном маршруте;
- любой выбор покерного действия происходит на функциональном shared simulator snapshot или в полном симуляторе;
- правильность нельзя пройти одной константной кнопкой при наличии разных action families;
- progress/result и telemetry остаются в канонических контрактах;
- learner-visible текст не содержит provenance, технических терминов или заглушек;
- media inventory остаётся 36/36, все active-learning frames и точные остановки валидны, captions и transcript синхронны, а public rights подтверждены до публикации;
- practice inventory равен 1 151, все 8 video-linked задач доступны, выбранный ролик обновляет фокус, а точный CTA начинает связанную серию и явно называет её перезапуск после уже данного ответа;
- записи 04/11/12 не позволяют выйти за согласованные guided excerpts и не подменяют актуальный тренажёр устаревшей терминологией или диапазонами;
- cache token новый и применён ко всем затронутым immutable assets;
- `npm run check:ffstart`, общий release-gate и browser QA зелёные;
- production smoke выполнен после фактического деплоя, а не выведен из локальной проверки.
