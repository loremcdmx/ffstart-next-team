(function () {
  "use strict";

  const CONTENT_VERSION = "20260715-ffstart-v20";

  function allContent() {
    return Object.assign(
      {},
      window.FFStartLessonContentFoundations || {},
      window.FFStartLessonContentStrategy || {}
    );
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function shuffle(rows) {
    const output = rows.slice();
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }

  function routeFor(lesson) {
    return lesson?.route || (lesson?.id ? `/ffstart/${lesson.id}` : "/ffstart");
  }

  function mediaWisdom(item) {
    const learning = item && item.learning;
    if (!learning || !Array.isArray(learning.checkpoints) || !learning.checkpoints.length) return null;
    const steps = [
      { label: "Заметь сигнал", detail: learning.watchFor, tone: "active" },
      { label: "Сформулируй правило", detail: learning.rule, tone: "neutral" }
    ];
    if (learning.boundary) steps.push({ label: "Проверь границу", detail: learning.boundary, tone: "neutral" });
    steps.push({ label: "Перенеси в серию", detail: learning.practiceCue, tone: "correct" });
    return {
      eyebrow: "Из видео в решение",
      title: learning.title,
      body: "Собери мысль из разбора в короткий алгоритм и проверь его в следующей серии.",
      visual: {
        type: "flow",
        ariaLabel: learning.title,
        steps
      }
    };
  }

  function fail(root, message) {
    root.removeAttribute("aria-busy");
    root.innerHTML = `<section class="ffstart-platform"><article class="ffstart-panel ffstart-load-error" role="alert"><p class="ffstart-eyebrow">Урок не загрузился</p><h1>${message}</h1><p>Вернись к программе и открой урок ещё раз.</p><a class="ffstart-btn is-primary" href="/ffstart">К программе</a></article></section>`;
  }

  async function init() {
    const root = document.querySelector("[data-ffstart-lesson]");
    const lessonId = document.body.dataset.lessonId;
    if (!root || !lessonId) return;

    const mediaPromise = fetch(`/course/ffstart-media.json?v=${CONTENT_VERSION}`, { cache: "no-store" })
      .then(function (response) { return response.ok ? response.json() : { lessons: {} }; })
      .catch(function () { return { lessons: {} }; });
    const [manifestResponse, practiceResponse, mediaManifest] = await Promise.all([
      fetch("/course/ffstart-manifest.json", { cache: "no-store" }),
      fetch(`/assets/ffstart-course/practice/${lessonId}.json?v=${CONTENT_VERSION}`, { cache: "no-store" }),
      mediaPromise
    ]);
    if (!manifestResponse.ok || !practiceResponse.ok) throw new Error("Не удалось получить материалы урока.");
    const manifest = await manifestResponse.json();
    const practicePack = await practiceResponse.json();
    const lessons = manifest.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title })));
    const playSession = (Array.isArray(manifest.playSessions) ? manifest.playSessions : [])
      .find((session) => session.afterLessonId === lessonId);
    const index = lessons.findIndex((lesson) => lesson.id === lessonId);
    const meta = lessons[index];
    const content = allContent()[lessonId];
    if (!meta || !content) throw new Error("Материал этого шага пока не найден.");
    if (!Array.isArray(practicePack.spots) || !practicePack.spots.length) throw new Error("В уроке нет практических ситуаций.");

    const lesson = clone(content);
    lesson.id = lessonId;
    lesson.key = `ffstart_${lessonId}`;
    lesson.version = `${lessonId}-${CONTENT_VERSION}`;
    lesson.title = meta.title;
    lesson.eyebrow = `FF Start · ${meta.moduleTitle}`;
    lesson.media = Array.isArray(mediaManifest?.lessons?.[lessonId]) ? mediaManifest.lessons[lessonId] : [];
    const mediaThoughts = lesson.media.map(mediaWisdom).filter(Boolean).slice(0, 2);
    if (mediaThoughts.length) lesson.wisdom = (Array.isArray(lesson.wisdom) ? lesson.wisdom : []).concat(mediaThoughts);
    lesson.homeHref = "/ffstart";
    lesson.homeLabel = "← В программу";
    lesson.nextHref = playSession
      ? `/ffstart/play-session?session=${encodeURIComponent(playSession.id)}`
      : routeFor(lessons[index + 1]);
    lesson.nextLabel = playSession
      ? `Игровая пауза: ${playSession.title} →`
      : lessons[index + 1]
        ? `Следующий урок: ${lessons[index + 1].title} →`
        : "Вернуться к программе →";
    lesson.encounter = Object.assign({}, lesson.encounter, { spot: practicePack.spots[0] });
    lesson.practice = Object.assign({}, lesson.practice, {
      passScore: meta.practice.passScore,
      sessionLength: Math.min(meta.practice.sessionLength, practicePack.spots.length),
      mediaFocus: lesson.media.find(function (item) { return item && item.learning && item.learning.practiceCue; })?.learning.practiceCue || ""
    });

    window.FFStartLessonPlatform.mount(root, {
      lesson,
      practice: Object.assign({}, practicePack, { spots: shuffle(practicePack.spots) })
    });
    root.removeAttribute("aria-busy");
  }

  init().catch(function (error) {
    const root = document.querySelector("[data-ffstart-lesson]");
    if (root) fail(root, error?.message || "Неизвестная ошибка.");
  });
})();
