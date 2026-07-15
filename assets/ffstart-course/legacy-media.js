(function () {
  "use strict";

  const VERSION = "ffstart-legacy-media-v3";

  function openPractice(lessonId) {
    const selector = lessonId === "rfi-open-position"
      ? '[data-go="practice"]'
      : '[data-step-link="practice"]';
    const button = document.querySelector(selector);
    if (button && !button.disabled) button.click();
  }

  async function init() {
    const host = document.querySelector("[data-ffstart-legacy-media]");
    const lessonId = document.body.dataset.lessonId;
    const mediaApi = window.FFStartCourseMedia;
    if (!host || !lessonId || !mediaApi || typeof mediaApi.mount !== "function") return;

    try {
      const response = await fetch("/course/ffstart-media.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      const items = Array.isArray(manifest?.lessons?.[lessonId]) ? manifest.lessons[lessonId] : [];
      if (!items.length) return;

      const player = mediaApi.mount(host, {
        items,
        heading: items.length > 1 ? "Разборы этого урока" : "Посмотри полный разбор",
        body: host.dataset.ffstartMediaHeaderCopy === "none" ? false : undefined,
        practiceTarget: "practice",
        hidePracticeForMediaIds: lessonId === "bb-call-defense" ? ["21-strategia_bb"] : []
      });
      host.dataset.ffstartLegacyMediaVersion = VERSION;
      host.addEventListener("click", function (event) {
        if (event.target.closest && event.target.closest('[data-go-step="practice"]')) openPractice(lessonId);
      });

      const screen = host.closest(".screen");
      const pauseWhenHidden = function () {
        if (!screen || (!screen.hidden && (screen.classList.contains("is-active") || screen.classList.contains("active")))) return;
        player.pause();
      };
      const observer = screen ? new MutationObserver(pauseWhenHidden) : null;
      if (observer) observer.observe(screen, { attributes: true, attributeFilter: ["class", "hidden"] });
      window.addEventListener("pagehide", function () { player.pause(); }, { once: true });
    } catch (_error) {
      host.hidden = true;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
