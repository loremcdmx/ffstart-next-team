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
      manualNextHand: false,
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
    const event = actions.find((item) => {
      const street = String(item?.street || "preflop");
      const isHero = item?.isHero === true || Number(item?.seatId) === heroSeatId;
      return street === "preflop" && isHero;
    });
    const action = String(event?.action || event?.type || event?.label || "").toLowerCase();
    if (/raise|open|all[- ]?in|\bjam\b/.test(action) || action === "r") return "open";
    if (/fold|пас/.test(action) || action === "f") return "fold";
    return "";
  }

  function gradeEntry(entry = {}) {
    const handNo = Math.max(1, Number(entry.handNo || 1));
    const position = targetLearningPosition(handNo);
    const combo = comboForEntry(entry);
    const frequency = Number(root.PokerRfiData?.frequencies?.[position]?.[combo] || 0);
    const expected = frequency >= 50 ? "open" : "fold";
    const action = heroPreflopAction(entry);
    return { handNo, position, combo, frequency, expected, action, correct: Boolean(action) && action === expected };
  }

  function ensureFeedback() {
    if (!root.document) return null;
    let feedback = root.document.querySelector("[data-rfi-feedback]");
    if (feedback) return feedback;
    feedback = root.document.createElement("aside");
    feedback.className = "rfi-drill-feedback";
    feedback.dataset.rfiFeedback = "";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    root.document.body.appendChild(feedback);
    return feedback;
  }

  function showGrade(grade) {
    const feedback = ensureFeedback();
    if (!feedback || !grade.combo || !grade.action) return;
    const mixed = grade.frequency > 0 && grade.frequency < 100 ? ` · частота ${grade.frequency}%` : "";
    feedback.innerHTML = `<strong>${grade.correct ? "Верно" : "Сверь границу"}: ${grade.combo} · ${grade.position}</strong><span>База: ${grade.expected === "open" ? `рейз ${OPEN_SIZE_LABEL} BB` : "пас"}${mixed}</span>`;
    feedback.classList.add("is-visible", grade.correct ? "is-correct" : "is-wrong");
    feedback.classList.remove(grade.correct ? "is-wrong" : "is-correct");
    root.setTimeout(() => feedback.classList.remove("is-visible"), 4200);
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
      hud.innerHTML = `<strong>RFI по позициям</strong><span>EP 20 · MP 26 · HJ 32 · CO 47 · BTN 75</span><small>Все до Hero выбросили · рейз ${OPEN_SIZE_LABEL} BB или пас</small><b data-rfi-score>0 / ${sessionHands()} верно</b>`;
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
    gradeEntry,
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
  if (root.document?.readyState === "loading") root.document.addEventListener("DOMContentLoaded", installHud, { once: true });
  else installHud();
})();
