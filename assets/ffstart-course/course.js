(function () {
  "use strict";

  const CONTENT_VERSION = "20260715-ffstart-v20";

  const legacyRoutes = {
    "rfi-open-position": "/rfi-open-position-lesson?from=ffstart",
    "bb-call-defense": "/bb-call-defense-lesson?from=ffstart",
    resteal: "/resteal-lesson?from=ffstart"
  };

  function lessonHref(lesson) {
    return legacyRoutes[lesson.id] || `/ffstart/${lesson.id}`;
  }

  function playSessionHref(session) {
    return `/ffstart/play-session?session=${encodeURIComponent(session.id)}`;
  }

  function plural(count, one, few, many) {
    const value = Math.abs(Number(count)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return many;
    if (last === 1) return one;
    if (last > 1 && last < 5) return few;
    return many;
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; } catch (_error) { return fallback; }
  }

  function resultFor(lesson) {
    const local = readJson("ffstart-lesson-progress-v1", {});
    const localResult = local[`ffstart_${lesson.id}`];
    if (localResult) return localResult;
    try {
      return window.FFPlayerProgress?.getSkillProgress?.(`ffstart_${lesson.id}`) || null;
    } catch (_error) {
      return null;
    }
  }

  function lessonStatus(lesson) {
    const result = resultFor(lesson);
    const passed = result?.status === "passed";
    const repeat = result?.status === "repeat";
    const score = Number(result?.bestScore ?? result?.score) || 0;
    const completionOnly = lesson.id === "resteal" && passed && result?.evaluated === false && Number(result?.completedHands) >= 25;
    return { passed, repeat, score, completionOnly, attempts: Number(result?.completedHands ?? result?.attempts) || 0 };
  }

  function playSessionStatus(session) {
    try {
      const result = window.FFPlayerProgress?.getSkillProgress?.(`ffstart_play_session_${session.id}`) || null;
      return { passed: result?.status === "passed" };
    } catch (_error) {
      return { passed: false };
    }
  }

  function lessonMarkup(lesson, globalIndex, packCounts) {
    const status = lessonStatus(lesson);
    const count = packCounts.get(lesson.id) || lesson.practice?.sessionLength || 0;
    const state = status.passed ? "✓" : String(globalIndex + 1).padStart(2, "0");
    const detail = status.passed
      ? status.completionOnly ? `Закреплено · ${status.attempts} раздач` : `Закреплено · ${status.score}%`
      : status.repeat ? `Повторить · ${status.score}%` : "Решение → Мудрость → Чарт → Практика";
    return `<a class="course-lesson ${status.passed ? "is-passed" : ""}" href="${lessonHref(lesson)}">
      <span class="course-lesson__state">${state}</span>
      <span class="course-lesson__copy"><strong>${lesson.title}</strong><small>${detail}</small></span>
      <span class="course-lesson__time">${lesson.minutes} мин</span>
      <span class="course-lesson__practice">${count ? `${count} ${plural(count, "ситуация", "ситуации", "ситуаций")}` : "полный тренажёр"}</span>
      <span class="course-lesson__arrow" aria-hidden="true">→</span>
    </a>`;
  }

  function playSessionMarkup(session) {
    const status = playSessionStatus(session);
    const handLabel = `${session.hands} ${plural(session.hands, "раздача", "раздачи", "раздач")}`;
    return `<a class="course-play ${status.passed ? "is-passed" : ""}" href="${playSessionHref(session)}">
      <span class="course-play__state" aria-hidden="true">${status.passed ? "✓" : "▶"}</span>
      <span class="course-play__copy"><small>Игровая пауза · без оценки</small><strong>${session.title}</strong><span>${status.passed ? "Серия сыграна — сессию можно повторить в любое время." : session.body}</span></span>
      <span class="course-play__meta">${handLabel} · ${session.stack.label}</span>
      <span class="course-play__arrow" aria-hidden="true">→</span>
    </a>`;
  }

  function moduleMarkup(module, moduleIndex, startIndex, packCounts, playByLesson) {
    const minutes = module.lessons.reduce((sum, lesson) => sum + Number(lesson.minutes || 0), 0);
    const playCount = module.lessons.reduce((sum, lesson) => sum + (playByLesson.has(lesson.id) ? 1 : 0), 0);
    const moduleMeta = `${module.lessons.length} ${plural(module.lessons.length, "урок", "урока", "уроков")} · ${minutes} мин${playCount ? ` · ${playCount} ${plural(playCount, "игровая пауза", "игровые паузы", "игровых пауз")}` : ""}`;
    const lessonRows = module.lessons.map((lesson, index) => {
      const playSession = playByLesson.get(lesson.id);
      return `${lessonMarkup(lesson, startIndex + index, packCounts)}${playSession ? playSessionMarkup(playSession) : ""}`;
    }).join("");
    return `<section class="course-module" aria-labelledby="module-${module.id}">
      <header class="course-module__head">
        <span class="course-module__number">${String(moduleIndex + 1).padStart(2, "0")}</span>
        <div><h3 id="module-${module.id}">${module.title}</h3><p>${module.promise}</p></div>
        <span>${moduleMeta}</span>
      </header>
      <div class="course-lessons">${lessonRows}</div>
    </section>`;
  }

  async function init() {
    const [manifestResponse, packsResponse] = await Promise.all([
      fetch("/course/ffstart-manifest.json", { cache: "no-store" }),
      fetch(`/assets/ffstart-course/practice/manifest.json?v=${CONTENT_VERSION}`, { cache: "no-store" })
    ]);
    if (!manifestResponse.ok || !packsResponse.ok) throw new Error("Программа временно недоступна");
    const manifest = await manifestResponse.json();
    const practice = await packsResponse.json();
    const allLessons = manifest.modules.flatMap((module) => module.lessons);
    const playSessions = Array.isArray(manifest.playSessions) ? manifest.playSessions : [];
    const playByLesson = new Map(playSessions.map((session) => [session.afterLessonId, session]));
    const packCounts = new Map(practice.packs.map((pack) => [pack.id, pack.spots]));
    const passed = allLessons.filter((lesson) => lessonStatus(lesson).passed);
    const next = allLessons.find((lesson) => !lessonStatus(lesson).passed) || allLessons[allLessons.length - 1];
    const totalSpots = practice.packs.reduce((sum, pack) => sum + Number(pack.spots || 0), 0);

    let offset = 0;
    document.querySelector("[data-course-modules-list]").innerHTML = manifest.modules.map((module, index) => {
      const markup = moduleMarkup(module, index, offset, packCounts, playByLesson);
      offset += module.lessons.length;
      return markup;
    }).join("");
    document.querySelector("[data-course-lessons]").textContent = allLessons.length;
    document.querySelector("[data-course-modules]").textContent = manifest.modules.length;
    document.querySelector("[data-course-spots]").textContent = totalSpots.toLocaleString("ru-RU");
    const playCount = document.querySelector("[data-course-play-sessions]");
    if (playCount) playCount.textContent = playSessions.length;
    document.querySelector("[data-course-progress]").textContent = `Пройдено уроков: ${passed.length} из ${allLessons.length}`;
    const continueLink = document.querySelector("[data-course-continue]");
    continueLink.href = lessonHref(next);
    continueLink.firstChild.textContent = passed.length ? "Продолжить с места остановки " : "Начать программу ";
  }

  init().catch(function (error) {
    const host = document.querySelector("[data-course-modules-list]");
    if (host) host.innerHTML = `<p class="course-loading">${error.message}</p>`;
  });
})();
