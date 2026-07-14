(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const params = new URLSearchParams(root.location?.search || "");
  const requestedPractice = params.get("practice") || params.get("lesson") || params.get("drill");
  const active = requestedPractice === "rfi-open" || requestedPractice === "rfi-open-position";
  const PACK_KEY = "rfi-open-position-demo";
  const OPEN_SIZE_BB = 2;
  const OPEN_SIZE_LABEL = "2";
  const enginePositions = ["UTG", "LJ", "HJ", "CO", "BTN"];
  const learningPosition = Object.freeze({ UTG: "EP", LJ: "MP", HJ: "HJ", CO: "CO", BTN: "BTN" });
  const processedEntries = new Set();
  let restartHandlerInstalled = false;
  let learningUiHandlersInstalled = false;
  let limpReturnFocus = null;

  function sessionHands(value = params.get("hands")) {
    const count = Number(value);
    return [10, 25, 50, 100].includes(count) ? count : 0;
  }

  function sessionLimitReached(handNo) {
    const limit = sessionHands();
    return limit > 0 && Number(handNo) >= limit;
  }

  function targetPosition(handNo) {
    return enginePositions[(Math.max(1, Number(handNo) || 1) - 1) % enginePositions.length];
  }

  function targetLearningPosition(handNo) {
    return learningPosition[targetPosition(handNo)];
  }

  function applyBootSettings(settings) {
    if (!active || !settings) return settings;
    Object.assign(settings, {
      pack: PACK_KEY,
      tableCount: 1,
      playerCount: 7,
      setupCompleted: true,
      autoStart: true,
      simulationMode: "random",
      randomStackMinBb: 40,
      randomStackMaxBb: 40,
      actionTimerSeconds: 0,
      trainingMode: false,
      manualNextHand: true,
      continueAfterBust: true,
      sessionHandLimit: sessionHands(),
      demoMode: true,
      uiScale: "xl",
      anteBb: 0,
      bigBlindAnteBb: 1,
      lobbyEvents: false,
      revealOpponentCardsOnFinish: true,
      statsScope: "session",
      handTempo: "fast",
      turboMode: true,
      sound: false
    });
    return settings;
  }

  function unopenedHeroTurn(table, position) {
    return Boolean(
      table
      && table.status === "playing"
      && table.heroTurn
      && table.heroPosition === position
      && Number(table.currentBet || 0) <= 1
      && table.preflopOpenerSeatId == null
      && !(table.preflopOpenCallerSeatIds || []).length
    );
  }

  function installEngine(engine) {
    if (!engine?.registerPack) return false;
    engine.registerPack(PACK_KEY, {
      name: "RFI по позициям · урок",
      stackDepths: [40],
      playableWeight: 0.5,
      spots: enginePositions.map((position) => ({
        key: `rfi-${position.toLowerCase()}`,
        title: `${learningPosition[position]} first in`,
        heroPosition: position,
        villainPosition: "BB",
        prompt: `Все до тебя выбросили. Открыть ${OPEN_SIZE_LABEL} BB или пас?`
      }))
    });

    return true;
  }

  function scenarioSettings() {
    return {
      pack: PACK_KEY,
      playerCount: 7,
      simulationMode: "random",
      randomStackMinBb: 40,
      randomStackMaxBb: 40,
      anteBb: 0,
      bigBlindAnteBb: 1,
      lobbyEvents: false
    };
  }

  function practiceScenario() {
    return { defaultBeforeHero: { action: "fold" } };
  }

  function decorateScenario(table, { handNo, attempts }) {
    const position = targetPosition(handNo);
    table.rfiOpenDrill = {
      schema: "poker-rfi-open-drill-hand-v3",
      index: handNo,
      position,
      learningPosition: learningPosition[position],
      attempts
    };
    table.spot = {
      ...table.spot,
      prompt: `Все до тебя выбросили. Выбери пас или откройся рейзом ${OPEN_SIZE_LABEL} BB.`,
      tags: [...new Set([...(table.spot?.tags || []), "rfi-open-demo"])]
    };
    return table;
  }

  function installPack(engine) {
    let registry = root.PokerSimulatorPracticePacks;
    if (!registry && typeof require === "function") {
      try { registry = require("../poker-simulator/simulator-practice-packs.js"); } catch (_) {}
    }
    if (registry?.installForEngine) return registry.installForEngine(practiceDescriptor, engine, { force: true });
    return installEngine(engine);
  }

  function completedEntries(payload = {}) {
    return (Array.isArray(payload.handLog) ? payload.handLog : [])
      .filter((entry) => entry?.handHistory)
      .sort((left, right) => Number(left.handNo || 0) - Number(right.handNo || 0));
  }

  function comboForEntry(entry = {}) {
    return String(entry?.hero?.combo || entry?.handHistory?.combo || entry?.combo || "").trim();
  }

  function heroPreflopAction(entry = {}) {
    const heroSeatId = Number(entry?.hero?.seatId ?? 0);
    const actions = Array.isArray(entry?.handHistory?.actions) ? entry.handHistory.actions : [];
    for (const item of actions) {
      const street = String(item?.street || "preflop");
      const isHero = item?.isHero === true || Number(item?.seatId) === heroSeatId;
      if (street !== "preflop" || !isHero) continue;
      const action = String(item?.action || item?.type || item?.label || "").toLowerCase();
      if (/raise|open|all[- ]?in|\bjam\b/.test(action) || action === "r") return "open";
      if (/fold|пас/.test(action) || action === "f") return "fold";
      if (/call|limp|колл/.test(action) || action === "c") return "limp";
    }
    return "";
  }

  function decisionForFrequency(frequency) {
    const threshold = Number(root.PokerRfiData?.rangeThreshold ?? 75);
    return Number(frequency || 0) > threshold ? "open" : "fold";
  }

  function gradeEntry(entry = {}) {
    const handNo = Math.max(1, Number(entry.handNo || 1));
    const position = targetLearningPosition(handNo);
    const combo = comboForEntry(entry);
    const frequency = Number(root.PokerRfiData?.frequencies?.[position]?.[combo] || 0);
    const expected = decisionForFrequency(frequency);
    const action = heroPreflopAction(entry);
    return { handNo, position, combo, frequency, expected, action, correct: Boolean(action) && action === expected };
  }

  function handAt(row, column) {
    const ranks = root.PokerRfiData?.ranks || "AKQJT98765432".split("");
    return row === column
      ? `${ranks[row]}${ranks[row]}`
      : row < column ? `${ranks[row]}${ranks[column]}s` : `${ranks[column]}${ranks[row]}o`;
  }

  function actionLabel(action) {
    if (action === "open") return `рейз ${OPEN_SIZE_LABEL} BB`;
    if (action === "limp") return "колл";
    return "пас";
  }

  function reviewVerdict(grade) {
    if (grade.action === "limp") {
      return {
        title: "Колл здесь — это лимп",
        text: `В unopened-RFI выбираем только рейз ${OPEN_SIZE_LABEL} BB или пас.`,
        tone: "wrong"
      };
    }
    if (grade.correct && grade.expected === "open") {
      return { title: "Правильно! Попал в диапазон рейза", text: `Эту руку открываем ${OPEN_SIZE_LABEL} BB.`, tone: "correct" };
    }
    if (grade.correct) {
      return { title: "Правильно! Рука вне диапазона", text: "Здесь сохраняем фишки и выбираем пас.", tone: "correct" };
    }
    if (grade.expected === "open") {
      return { title: "Неверно — надо было рейз", text: `Эта рука входит в опен: ставим ${OPEN_SIZE_LABEL} BB.`, tone: "wrong" };
    }
    return { title: "Неверно — надо было пас", text: "Эта рука не входит в учебный диапазон опена.", tone: "wrong" };
  }

  function reviewChart(grade) {
    const ranks = root.PokerRfiData?.ranks || [];
    const frequencies = root.PokerRfiData?.frequencies?.[grade.position] || {};
    return ranks.map((_, row) => ranks.map((__, column) => {
      const hand = handAt(row, column);
      const frequency = Number(frequencies[hand] || 0);
      const expected = decisionForFrequency(frequency);
      const hit = hand === grade.combo;
      const classes = [
        "rfi-review-cell",
        row === column ? "is-pair" : row < column ? "is-suited" : "is-offsuit",
        expected === "open" ? "is-target-open" : "is-target-fold",
        hit ? "is-hit" : "",
        hit ? (grade.correct ? "is-correct" : "is-wrong") : ""
      ].filter(Boolean).join(" ");
      return `<span class="${classes}" title="${hand}: ${expected === "open" ? "рейз" : "пас"}"><b>${hand}</b></span>`;
    }).join("")).join("");
  }

  function ensureFeedback() {
    if (!root.document) return null;
    let feedback = root.document.querySelector("[data-rfi-feedback]");
    if (feedback) return feedback;
    feedback = root.document.createElement("aside");
    feedback.className = "rfi-range-review";
    feedback.dataset.rfiFeedback = "";
    feedback.setAttribute("role", "alertdialog");
    feedback.setAttribute("aria-modal", "true");
    feedback.setAttribute("aria-labelledby", "rfi-review-title");
    feedback.setAttribute("aria-hidden", "true");
    root.document.body.appendChild(feedback);
    return feedback;
  }

  function showGrade(grade) {
    const feedback = ensureFeedback();
    if (!feedback || !grade.combo || !grade.action) return;
    const verdict = reviewVerdict(grade);
    const lastHand = sessionLimitReached(grade.handNo);
    feedback.innerHTML = `
      <div class="rfi-review-backdrop" aria-hidden="true"></div>
      <section class="rfi-review-board ${verdict.tone === "correct" ? "is-correct" : "is-wrong"}">
        <header class="rfi-review-header">
          <div><span>Разбор завершённой раздачи ${grade.handNo}</span><strong>${grade.position} · ${grade.combo}</strong></div>
          <p>Твоя мишень — чарт позиции. Кольцо показывает сыгранную руку.</p>
        </header>
        <div class="rfi-review-legend"><span class="is-open">Диапазон</span><span class="is-pair">Пары</span><span class="is-suited">Suited</span><span class="is-offsuit">Offsuit</span><small>Жёлтая клетка — рейз · исходный вес выше 75%</small></div>
        <div class="rfi-review-chart" aria-label="Чарт ${grade.position}; сыгранная рука ${grade.combo}">${reviewChart(grade)}</div>
        <footer class="rfi-review-footer">
          <div><strong id="rfi-review-title">${verdict.title}</strong><p>${verdict.text}</p><small>Ты выбрал: ${actionLabel(grade.action)} · База: ${actionLabel(grade.expected)}</small></div>
          <button class="rfi-review-next" type="button" data-rfi-review-next data-final="${lastHand ? "true" : "false"}">${lastHand ? "Посмотреть итог" : "Следующая раздача"}</button>
        </footer>
      </section>`;
    feedback.classList.remove("is-visible");
    feedback.setAttribute("aria-hidden", "false");
    root.requestAnimationFrame?.(() => {
      feedback.classList.add("is-visible");
      feedback.querySelector("[data-rfi-review-next]")?.focus({ preventScroll: true });
    });
  }

  function hideGrade() {
    const feedback = root.document?.querySelector?.("[data-rfi-feedback]");
    if (!feedback) return;
    feedback.classList.remove("is-visible");
    feedback.setAttribute("aria-hidden", "true");
  }

  function playLimpTone() {
    const AudioContext = root.AudioContext || root.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      const context = new AudioContext();
      const now = context.currentTime;
      [196, 147].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * 0.09;
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.09);
      });
      context.resume?.();
      root.setTimeout(() => context.close?.(), 360);
      return true;
    } catch (_) {
      return false;
    }
  }

  function ensureLimpWarning() {
    if (!root.document) return null;
    let warning = root.document.querySelector("[data-rfi-limp-warning]");
    if (warning) return warning;
    warning = root.document.createElement("aside");
    warning.className = "rfi-limp-warning";
    warning.dataset.rfiLimpWarning = "";
    warning.setAttribute("role", "alertdialog");
    warning.setAttribute("aria-modal", "true");
    warning.setAttribute("aria-labelledby", "rfi-limp-title");
    warning.setAttribute("aria-hidden", "true");
    warning.innerHTML = `
      <div class="rfi-limp-warning-backdrop" aria-hidden="true"></div>
      <section class="rfi-limp-warning-window">
        <div class="rfi-limp-warning-icon" aria-hidden="true">!</div>
        <div><strong id="rfi-limp-title">Колл здесь — это лимп</strong><p>Когда все до тебя выбросили, выбираем только рейз ${OPEN_SIZE_LABEL} BB или пас.</p></div>
        <button type="button" data-rfi-limp-dismiss>Понятно</button>
      </section>`;
    root.document.body.appendChild(warning);
    return warning;
  }

  function showLimpWarning(source) {
    const warning = ensureLimpWarning();
    if (!warning) return;
    limpReturnFocus = source || root.document?.activeElement || null;
    warning.classList.remove("is-visible");
    warning.setAttribute("aria-hidden", "false");
    warning.dataset.tonePlayed = playLimpTone() ? "true" : "false";
    void warning.offsetWidth;
    warning.classList.add("is-visible");
    root.setTimeout(() => warning.querySelector("[data-rfi-limp-dismiss]")?.focus({ preventScroll: true }), 40);
  }

  function hideLimpWarning() {
    const warning = root.document?.querySelector?.("[data-rfi-limp-warning]");
    if (!warning) return;
    warning.classList.remove("is-visible");
    warning.setAttribute("aria-hidden", "true");
    limpReturnFocus?.focus?.({ preventScroll: true });
    limpReturnFocus = null;
  }

  function installLearningUiHandlers() {
    if (!active || !root.document || learningUiHandlersInstalled) return;
    learningUiHandlersInstalled = true;
    root.document.addEventListener("click", (event) => {
      const limp = event.target?.closest?.('.client-controls.is-rfi-opening [data-action="call"]');
      if (limp) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        showLimpWarning(limp);
        return;
      }
      const dismissLimp = event.target?.closest?.("[data-rfi-limp-dismiss]");
      if (dismissLimp) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        hideLimpWarning();
        return;
      }
      const next = event.target?.closest?.("[data-rfi-review-next]");
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      hideGrade();
      if (next.dataset.final !== "true") root.PokerSimulatorApp?.newHand?.();
    }, true);
    root.document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const warning = root.document.querySelector('[data-rfi-limp-warning][aria-hidden="false"]');
        if (warning) {
          event.preventDefault();
          hideLimpWarning();
          return;
        }
        const review = root.document.querySelector('[data-rfi-feedback][aria-hidden="false"]');
        if (review) {
          event.preventDefault();
          hideGrade();
        }
        return;
      }
      const tag = event.target?.tagName;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || event.target?.isContentEditable || String(event.key).toLowerCase() !== "c") return;
      if (root.document.querySelector('[data-rfi-limp-warning][aria-hidden="false"]')) return;
      const openingCall = root.document.querySelector('.client-controls.is-rfi-opening [data-action="call"]');
      if (!openingCall) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      showLimpWarning(openingCall);
    }, true);
  }

  function restartSession() {
    const url = new URL(root.location.href);
    url.searchParams.set("run", `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    root.location.assign(url.href);
  }

  function installRestartHandler() {
    if (!active || !root.document || restartHandlerInstalled) return;
    restartHandlerInstalled = true;
    root.document.addEventListener("click", (event) => {
      const button = event.target?.closest?.('[data-action="rfi-play-again"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      restartSession();
    }, true);
  }

  function installHud() {
    if (!active || !root.document) return;
    const mount = () => {
      const topbar = root.document.querySelector(".topbar");
      if (!topbar || topbar.querySelector(".rfi-drill-hud")) return false;
      const hud = root.document.createElement("section");
      hud.className = "rfi-drill-hud";
      hud.setAttribute("aria-live", "polite");
      const targets = root.PokerRfiData?.targets || { EP: 20, MP: 24, HJ: 32, CO: 48, BTN: 66 };
      const sessionLimit = sessionHands();
      hud.innerHTML = `<strong>RFI по позициям</strong><span>EP ${targets.EP} · MP ${targets.MP} · HJ ${targets.HJ} · CO ${targets.CO} · BTN ${targets.BTN}</span><small>Все до Hero выбросили · рейз ${OPEN_SIZE_LABEL} BB или пас · колл покажет подсказку</small><b data-rfi-score>${sessionLimit > 0 ? `0 / ${sessionLimit} верно` : "0 верно · 0 сыграно"}</b>`;
      topbar.prepend(hud);
      let signature = "";
      const update = () => {
        const payload = root.PokerSimulatorApp?.currentSessionPayload?.() || {};
        const entries = completedEntries(payload);
        const grades = entries.map(gradeEntry).filter((grade) => grade.action);
        const correct = grades.filter((grade) => grade.correct).length;
        hud.querySelector("[data-rfi-score]").textContent = sessionLimit > 0
          ? `${correct} / ${grades.length || sessionLimit} верно`
          : `${correct} верно · ${grades.length} сыграно`;
        const latest = grades.at(-1);
        const nextSignature = latest ? `${latest.handNo}:${latest.combo}:${latest.action}` : "";
        if (latest && nextSignature !== signature && !processedEntries.has(nextSignature)) {
          signature = nextSignature;
          processedEntries.add(nextSignature);
          showGrade(latest);
        }
        hud.classList.toggle("is-complete", sessionLimit > 0 && entries.length >= sessionLimit);
      };
      update();
      const timer = root.setInterval(update, 300);
      root.addEventListener("pagehide", () => root.clearInterval(timer), { once: true });
      return true;
    };
    if (mount()) return;
    let tries = 0;
    const timer = root.setInterval(() => {
      tries += 1;
      if (mount() || tries > 100) root.clearInterval(timer);
    }, 50);
  }

  const practiceDescriptor = {
    id: "rfi-open",
    aliases: ["rfi-open-position"],
    packKey: PACK_KEY,
    storageSuffix: "rfi-open-demo",
    applyBootSettings,
    installEngine,
    scenario: {
      freshDeal: true,
      maxAttempts: 1,
      onFailure: "error",
      failureMessage: ({ handNo }) => `RFI practice scenario ${targetPosition(handNo)} was not generated`,
      heroPosition: ({ handNo }) => targetPosition(handNo),
      settings: scenarioSettings,
      practiceScenario,
      accept: (table, { handNo }) => unopenedHeroTurn(table, targetPosition(handNo)),
      decorate: decorateScenario
    },
    defaultBetAmount({ table, bounds, value, draft }) {
      if (draft || !table?.rfiOpenDrill || table.street !== "preflop" || table.preflopOpenerSeatId != null || Number(table.currentBet || 0) > 1) return value;
      return Math.min(bounds.max, Math.max(bounds.min, OPEN_SIZE_BB));
    },
    decisionClass({ table }) {
      return table?.rfiOpenDrill
        && table.street === "preflop"
        && table.preflopOpenerSeatId == null
        && Number(table.currentBet || 0) <= 1
        ? "is-rfi-opening"
        : "";
    },
    sessionCompleteAction: { action: "rfi-play-again", label: "Сыграть ещё" }
  };

  const api = {
    active,
    packKey: PACK_KEY,
    storageSuffix: "rfi-open-demo",
    openSizeBb: OPEN_SIZE_BB,
    enginePositions,
    learningPosition,
    sessionHands,
    sessionLimitReached,
    targetPosition,
    targetLearningPosition,
    applyBootSettings,
    unopenedHeroTurn,
    practiceDescriptor,
    installEngine,
    installPack,
    completedEntries,
    comboForEntry,
    heroPreflopAction,
    decisionForFrequency,
    gradeEntry,
    reviewVerdict,
    reviewChart,
    playLimpTone,
    installHud,
    restartSession
  };
  root.PokerRfiOpenSimulatorPack = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PokerSimulatorPracticePacks?.register?.(practiceDescriptor);
  if (!active) return;
  if (root.document?.documentElement?.dataset) {
    root.document.documentElement.dataset.rfiOpenDrill = "true";
    delete root.document.documentElement.dataset.simulatorStageProfile;
  }
  if (!root.PokerSimulatorPracticePacks) installPack(root.PokerSimulatorEngine);
  installRestartHandler();
  installLearningUiHandlers();
  if (root.document?.readyState === "loading") root.document.addEventListener("DOMContentLoaded", installHud, { once: true });
  else installHud();
})();
