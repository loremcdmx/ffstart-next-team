(() => {
  "use strict";

  const planUrl = "/course/ffstart-product-plan.json";
  const reviewUrl = "/course/ffstart-review-data.json";
  const moduleRoot = document.querySelector("[data-handoff-modules]");
  const archiveRoot = document.querySelector("[data-handoff-archive]");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function indexReview(review) {
    const lessons = new Map();
    const plays = new Map();
    for (const module of review.modules || []) {
      for (const item of module.items || []) {
        if (item.type === "lesson") lessons.set(item.id, item);
        if (item.type === "play") plays.set(item.id, item);
      }
    }
    return { lessons, plays };
  }

  function lessonDetails(module, id, index) {
    const derived = module.derivedLessons?.[id];
    if (derived) return { title: derived.title, meta: `${derived.practiceSpots} решений · объединённый урок` };
    const lesson = index.lessons.get(id);
    if (!lesson) return { title: id, meta: "целевая версия" };
    const practiceCount = lesson.practice?.bankSize || 0;
    const mediaCount = lesson.media?.count || 0;
    const parts = [`${lesson.minutes} мин`];
    if (practiceCount) parts.push(`${practiceCount} ситуаций`);
    if (mediaCount) parts.push(`${mediaCount} видео`);
    return { title: lesson.title, meta: parts.join(" · ") };
  }

  function playDetails(id, index) {
    const play = index.plays.get(id);
    if (!play) return { title: id, meta: "полный симулятор" };
    return {
      title: play.title,
      meta: `${play.practice?.sessionLength || play.hands || 0} полных раздач`
    };
  }

  function renderPlay(id, index) {
    const play = playDetails(id, index);
    return `<div class="handoff-module__play"><span aria-hidden="true">▶</span><div><small>Игровая пауза</small><strong>${escapeHtml(play.title)}</strong></div><small>${escapeHtml(play.meta)}</small></div>`;
  }

  function renderModules(plan, index) {
    moduleRoot.innerHTML = plan.targetModules.map((module) => {
      const lessons = [];
      module.lessons.forEach((id, lessonIndex) => {
        if (module.playBefore && module.playBeforeLesson === id) lessons.push(renderPlay(module.playBefore, index));
        const lesson = lessonDetails(module, id, index);
        lessons.push(`<div class="handoff-module__lesson"><span>${String(lessonIndex + 1).padStart(2, "0")}</span><strong>${escapeHtml(lesson.title)}</strong><small>${escapeHtml(lesson.meta)}</small></div>`);
      });
      if (module.playBefore && !module.playBeforeLesson) lessons.unshift(renderPlay(module.playBefore, index));
      if (module.playAfter) lessons.push(renderPlay(module.playAfter, index));
      const learningCount = module.lessons.length;
      const playCount = Number(Boolean(module.playBefore || module.playAfter));
      return `
        <article class="handoff-module">
          <header class="handoff-module__head">
            <span class="handoff-module__number">${String(module.order).padStart(2, "0")}</span>
            <div><h3>${escapeHtml(module.title)}</h3><p>${escapeHtml(module.change)}</p></div>
            <span>${learningCount} ${learningCount === 1 ? "урок" : learningCount < 5 ? "урока" : "уроков"}${playCount ? " · игра" : ""}</span>
          </header>
          <div class="handoff-module__body">
            <div class="handoff-module__lessons">${lessons.join("")}</div>
            <aside class="handoff-module__rationale"><span>Почему так</span><p>${escapeHtml(module.change)}</p></aside>
          </div>
        </article>`;
    }).join("");
    moduleRoot.removeAttribute("aria-busy");
  }

  const archiveTitles = {
    "course-start-long-form": "Полный onboarding и длинные вводные",
    "blind-versus-blind": "Блайнд против блайнда",
    "opponent-types-separate": "Два отдельных урока по соперникам",
    resteal: "Рестил 25–40 BB",
    "poker-profession-track": "Покер как профессия"
  };

  function renderArchive(plan) {
    archiveRoot.innerHTML = plan.archive.map((item) => `
      <article class="handoff-archive-card">
        <span>Проверить перед удалением</span>
        <h3>${escapeHtml(archiveTitles[item.id] || item.id)}</h3>
        <p class="handoff-archive-card__source">${escapeHtml(item.source.join(" · "))}</p>
        <dl>
          <div><dt>Что сохранить</dt><dd>${escapeHtml(item.keep)}</dd></div>
          <div><dt>Когда вернуть</dt><dd>${escapeHtml(item.returnIf)}</dd></div>
        </dl>
      </article>`).join("");
    archiveRoot.removeAttribute("aria-busy");
  }

  async function copyCloneCommand(button) {
    const command = document.querySelector("[data-clone-command]")?.textContent?.trim();
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      button.textContent = "Команда скопирована";
    } catch {
      button.textContent = "Выделите команду выше";
    }
  }

  document.querySelector("[data-copy-clone]")?.addEventListener("click", (event) => copyCloneCommand(event.currentTarget));

  Promise.all([
    fetch(planUrl, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`План недоступен: ${response.status}`);
      return response.json();
    }),
    fetch(reviewUrl, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`Карта курса недоступна: ${response.status}`);
      return response.json();
    })
  ]).then(([plan, review]) => {
    const index = indexReview(review);
    renderModules(plan, index);
    renderArchive(plan);
  }).catch((error) => {
    const message = `<div class="course-loading">Не удалось открыть план: ${escapeHtml(error.message)}</div>`;
    moduleRoot.innerHTML = message;
    archiveRoot.innerHTML = message;
    moduleRoot.removeAttribute("aria-busy");
    archiveRoot.removeAttribute("aria-busy");
  });
})();
