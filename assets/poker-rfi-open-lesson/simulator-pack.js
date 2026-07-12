(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const params = new URLSearchParams(root.location?.search || "");
  const active = params.get("lesson") === "rfi-open";
  const PACK_KEY = "rfi-open-position-demo";
  const OPEN_SIZE_BB = 2.2;
  const OPEN_SIZE_LABEL = "2,2";
  const MAX_ATTEMPTS = 240;
  const enginePositions = ["UTG", "LJ", "HJ", "CO", "BTN"];
  const learningPosition = Object.freeze({ UTG: "EP", LJ: "MP", HJ: "HJ", CO: "CO", BTN: "BTN" });
  const processedEntries = new Set();
  let restartHandlerInstalled = false;
  let learningUiHandlersInstalled = false;
  let limpReturnFocus = null;

  function sessionHands() {
    const count = Number(params.get("hands"));
    return [10, 25, 50, 100].includes(count) ? count : 10;
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

  function installPack(engine) {
    if (!active || !engine?.registerPack || typeof engine.createTable !== "function") return false;
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

    const create = engine.createTable.bind(engine);
    engine.createTable = function createRfiTable(options = {}) {
      const handNo = Math.max(1, Number(options.handNo || 1));
      const position = targetPosition(handNo);
      const settings = {
        ...(options.settings || {}),
        pack: PACK_KEY,
        playerCount: 7,
        simulationMode: "random",
        randomStackMinBb: 40,
        randomStackMaxBb: 40,
        anteBb: 0,
        bigBlindAnteBb: 1,
        lobbyEvents: false
      };
      let selected = null;
      let attempts = 0;
      while (attempts < MAX_ATTEMPTS) {
        attempts += 1;
        const candidate = create({ ...options, settings, testHeroPosition: position });
        if (unopenedHeroTurn(candidate, position)) {
          selected = candidate;
          break;
        }
      }
      if (!selected) {
        throw new Error(`RFI drill failed to generate unopened ${position} spot after ${MAX_ATTEMPTS} attempts`);
      }
      selected.rfiOpenDrill = {
        schema: "poker-rfi-open-drill-hand-v2",
        index: handNo,
        position,
        learningPosition: learningPosition[position],
        attempts
      };
      selected.spot = {
        ...selected.spot,
        prompt: `Все до тебя выбросили. Выбери пас или откройся рейзом ${OPEN_SIZE_LABEL} BB.`,
        tags: [...new Set([...(selected.spot?.tags || []), "rfi-open-demo"])]
      };
      return selected;
    };
    return true;
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
    return Number(frequency || 0) >= 50 ? "open" : "fold";
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
    if (action === "limp") return "колл / лимп";
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
      const mixed = frequency > 0 && frequency < 100;
      const hit = hand === grade.combo;
      const classes = [
        "rfi-review-cell",
        row === column ? "is-pair" : row < column ? "is-suited" : "is-offsuit",
        expected === "open" ? "is-target-open" : "is-target-fold",
        mixed ? "is-mixed" : "",
        mixed && expected === "fold" ? "is-low-mix" : "",
        hit ? "is-hit" : "",
        hit ? (grade.correct ? "is-correct" : "is-wrong") : ""
      ].filter(Boolean).join(" ");
      const weight = mixed ? `<small>${frequency}%</small>` : "";
      return `<span class="${classes}" style="--frequency:${frequency}%" title="${hand}: ${frequency ? `рейз ${frequency}%` : "пас"}"><b>${hand}</b>${weight}</span>`;
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
    const mixed = grade.frequency > 0 && grade.frequency < 100 ? ` · исходный вес ${grade.frequency}%` : "";
    const lastHand = grade.handNo >= sessionHands();
    feedback.innerHTML = `
      <div class="rfi-review-backdrop" aria-hidden="true"></div>
      <section class="rfi-review-board ${verdict.tone === "correct" ? "is-correct" : "is-wrong"}">
        <header class="rfi-review-header">
          <div><span>Разбор завершённой раздачи ${grade.handNo}</span><strong>${grade.position} · ${grade.combo}</strong></div>
          <p>Твоя мишень — чарт позиции. Кольцо показывает сыгранную руку.</p>
        </header>
        <div class="rfi-review-legend"><span class="is-open">Рейз</span><span class="is-fold">Пас</span><span class="is-weighted">Смешанная частота</span><small>Учебное решение: 50% и выше → рейз, ниже 50% → пас</small></div>
        <div class="rfi-review-chart" aria-label="Чарт ${grade.position}; сыгранная рука ${grade.combo}">${reviewChart(grade)}</div>
        <footer class="rfi-review-footer">
          <div><strong id="rfi-review-title">${verdict.title}</strong><p>${verdict.text}</p><small>Ты выбрал: ${actionLabel(grade.action)} · База: ${actionLabel(grade.expected)}${mixed}</small></div>
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
      hud.innerHTML = `<strong>RFI по позициям</strong><span>EP 20 · MP 26 · HJ 32 · CO 47 · BTN 75</span><small>Все до Hero выбросили · рейз ${OPEN_SIZE_LABEL} BB или пас · колл покажет подсказку</small><b data-rfi-score>0 / ${sessionHands()} верно</b>`;
      topbar.prepend(hud);
      let signature = "";
      const update = () => {
        const payload = root.PokerSimulatorApp?.currentSessionPayload?.() || {};
        const entries = completedEntries(payload);
        const grades = entries.map(gradeEntry).filter((grade) => grade.action);
        const correct = grades.filter((grade) => grade.correct).length;
        hud.querySelector("[data-rfi-score]").textContent = `${correct} / ${grades.length || sessionHands()} верно`;
        const latest = grades.at(-1);
        const nextSignature = latest ? `${latest.handNo}:${latest.combo}:${latest.action}` : "";
        if (latest && nextSignature !== signature && !processedEntries.has(nextSignature)) {
          signature = nextSignature;
          processedEntries.add(nextSignature);
          showGrade(latest);
        }
        hud.classList.toggle("is-complete", entries.length >= sessionHands());
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

  const api = {
    active,
    packKey: PACK_KEY,
    storageSuffix: "rfi-open-demo",
    openSizeBb: OPEN_SIZE_BB,
    enginePositions,
    learningPosition,
    sessionHands,
    targetPosition,
    targetLearningPosition,
    applyBootSettings,
    unopenedHeroTurn,
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
  if (!active) return;
  if (root.document?.documentElement?.dataset) {
    root.document.documentElement.dataset.rfiOpenDrill = "true";
    delete root.document.documentElement.dataset.simulatorStageProfile;
  }
  installPack(root.PokerSimulatorEngine);
  installRestartHandler();
  installLearningUiHandlers();
  if (root.document?.readyState === "loading") root.document.addEventListener("DOMContentLoaded", installHud, { once: true });
  else installHud();
})();
