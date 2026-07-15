(function () {
  "use strict";

  const VERSION = "20260715-freeplay-handoff-v4";
  const MOBILE_TABLE_MEDIA = "(max-width: 620px)";
  const MAX_SNAPSHOT_FAILURES = 3;
  const root = document.querySelector("[data-play-session]");
  if (!root) return;

  const state = {
    session: null,
    controller: null,
    pollTimer: 0,
    polling: false,
    completed: false,
    startedAt: "",
    runId: "",
    snapshotFailures: 0,
    deviceBlocked: false
  };

  function query(selector) {
    return root.querySelector(selector);
  }

  function setText(selector, value) {
    const element = query(selector);
    if (element) element.textContent = String(value ?? "");
  }

  function finiteInteger(value, fallback, min = 0, max = 1000) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function sessionIdFromLocation() {
    return String(new URLSearchParams(location.search).get("session") || "").trim();
  }

  function cleanId(value) {
    return String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function randomToken() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeSession(source) {
    const session = source && typeof source === "object" ? source : {};
    const id = cleanId(session.id);
    const mode = String(session.mode || "random").toLowerCase() === "tournament" ? "tournament" : "random";
    const stackSource = session.stack && typeof session.stack === "object" ? session.stack : {};
    const minBb = finiteInteger(stackSource.minBb ?? session.stackMin ?? session.minBb, mode === "tournament" ? 40 : 20, 5, 500);
    const maxBb = Math.max(minBb, finiteInteger(stackSource.maxBb ?? session.stackMax ?? session.maxBb, minBb, 5, 500));
    const hands = finiteInteger(session.hands ?? session.target?.hands, 10, 1, 200);
    const tempo = String(session.tempo || "fast").toLowerCase() === "calm" ? "calm" : "fast";
    return {
      ...session,
      id,
      title: String(session.title || "Игровая сессия"),
      kicker: String(session.kicker || "Игровая пауза"),
      body: String(session.body || session.description || "Сыграй короткую серию и перенеси изученные решения за полный стол."),
      hands,
      mode,
      modeLabel: String(session.modeLabel || (mode === "tournament" ? "Турнир" : "Свободная игра")),
      stack: {
        minBb,
        maxBb,
        label: String(stackSource.label || (minBb === maxBb ? `${minBb} BB` : `${minBb}–${maxBb} BB`))
      },
      tempo,
      duration: String(session.duration || `${hands} раздач`),
      nextRoute: String(session.nextRoute || session.continueHref || "/ffstart"),
      nextLabel: String(session.nextLabel || "Продолжить программу")
    };
  }

  function progressKey() {
    return `ffstart_play_session_${state.session.id}`;
  }

  function trainerMeta() {
    return {
      key: progressKey(),
      title: state.session.title,
      version: VERSION
    };
  }

  function activeProfile() {
    try {
      return window.FFPlayerProgress?.getActiveProfile?.() || null;
    } catch (_error) {
      return null;
    }
  }

  function sendSessionEvent(phase, extra = {}) {
    try {
      if (typeof window.FFTrainerEvents?.send !== "function") return null;
      return window.FFTrainerEvents.send({
        kind: "trainer_session",
        trainer: trainerMeta(),
        profile: activeProfile(),
        client: {
          source: "ffstart-play-session",
          sessionId: state.runId
        },
        session: {
          id: state.runId,
          type: "ffstart_freeplay",
          evaluated: false,
          phase,
          stage: state.session.id,
          targetHands: state.session.hands,
          mode: state.session.mode,
          stackMinBb: state.session.stack.minBb,
          stackMaxBb: state.session.stack.maxBb,
          startedAt: state.startedAt,
          metadata: {
            evaluated: false,
            completed: phase === "session_complete",
            targetHands: state.session.hands,
            completedHands: Math.max(0, Number(extra.completedHands) || 0)
          },
          ...extra
        }
      });
    } catch (_error) {
      return null;
    }
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  }

  function mobileTableBlocked() {
    return Boolean(window.matchMedia?.(MOBILE_TABLE_MEDIA)?.matches);
  }

  function focusAndReveal(element) {
    if (!element) return;
    element.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    element.focus?.({ preventScroll: true });
  }

  function applyDeviceGate() {
    if (state.controller) return;
    state.deviceBlocked = mobileTableBlocked();
    const actions = query("[data-play-actions]");
    const start = query("[data-play-start]");
    const gate = query("[data-play-device-gate]");
    if (actions) actions.classList.toggle("is-device-gated", state.deviceBlocked);
    if (gate) gate.hidden = !state.deviceBlocked;
    if (start) {
      start.hidden = state.deviceBlocked;
      start.disabled = state.deviceBlocked;
    }
    root.querySelectorAll("[data-play-skip]").forEach(function (link) {
      link.textContent = state.deviceBlocked ? "Продолжить уроки →" : "Продолжить уроки без игры →";
    });
  }

  function renderSession() {
    const session = state.session;
    document.title = `${session.title} · FF Start`;
    setText("[data-play-kicker]", session.kicker);
    setText("[data-play-title]", session.title);
    setText("[data-play-body]", session.body);
    setText("[data-play-hands]", `${session.hands} раздач`);
    setText("[data-play-mode]", session.modeLabel);
    setText("[data-play-stack]", session.stack.label);
    setText("[data-play-duration]", session.duration);
    setText("[data-play-progress-target]", session.hands);
    const progress = query("[data-play-progressbar]");
    progress?.setAttribute("aria-valuemax", String(session.hands));
    const next = query("[data-play-continue]");
    if (next) {
      next.href = session.nextRoute;
      next.textContent = session.nextLabel;
    }
    root.querySelectorAll("[data-play-skip]").forEach(function (link) {
      link.href = session.nextRoute;
    });
    const recoveryContinue = query("[data-play-recovery-continue]");
    if (recoveryContinue) recoveryContinue.href = session.nextRoute;
    const start = query("[data-play-start]");
    if (start) start.disabled = false;
    applyDeviceGate();
    root.removeAttribute("aria-busy");
  }

  function simulatorBaseUrl() {
    const url = new URL("/poker-simulator.html", location.href);
    url.searchParams.set("stage", state.session.id);
    url.searchParams.set("mode", state.session.mode);
    url.searchParams.set("stackMin", String(state.session.stack.minBb));
    url.searchParams.set("stackMax", String(state.session.stack.maxBb));
    return url.toString();
  }

  function snapshotHands(snapshot) {
    return Math.max(0, finiteInteger(Math.max(
      Number(snapshot?.hands || 0),
      Number(snapshot?.handLogHands || 0),
      Number(snapshot?.pokerStats?.hands || 0)
    ), 0, 0, 100000));
  }

  function updateProgress(hands) {
    const target = state.session.hands;
    const completedHands = Math.min(target, Math.max(0, hands));
    const percent = target ? Math.min(100, Math.round(completedHands / target * 100)) : 0;
    setText("[data-play-progress-hands]", completedHands);
    const progress = query("[data-play-progressbar]");
    if (progress) {
      progress.setAttribute("aria-valuenow", String(completedHands));
      progress.style.setProperty("--play-progress", `${percent}%`);
    }
    if (!state.completed) {
      setText("[data-play-status]", completedHands
        ? "Продолжай в том же ритме — прогресс считается автоматически."
        : "Стол готов. Первая раздача уже началась.");
    }
    if (hands >= target) completeSession(hands);
  }

  function resultForCompletion(hands) {
    const completedAt = new Date().toISOString();
    const completedHands = Math.max(state.session.hands, hands);
    return {
      schema: "ff-trainer-result-v1",
      skillKey: progressKey(),
      trainerKey: progressKey(),
      trainerTitle: state.session.title,
      version: VERSION,
      status: "passed",
      evaluated: false,
      completed: true,
      completedHands,
      targetHands: state.session.hands,
      attempts: completedHands,
      startedAt: state.startedAt,
      completedAt
    };
  }

  function completeSession(hands) {
    if (state.completed) return;
    state.completed = true;
    window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
    const result = resultForCompletion(hands);
    const session = {
      id: state.runId,
      type: "ffstart_freeplay",
      phase: "session_complete",
      stage: state.session.id,
      startedAt: state.startedAt,
      completedAt: result.completedAt,
      targetHands: state.session.hands,
      completedHands: result.completedHands,
      evaluated: false,
      status: "completed",
      metadata: {
        evaluated: false,
        completed: true,
        targetHands: state.session.hands,
        completedHands: result.completedHands
      }
    };
    try {
      window.FFPlayerProgress?.setResult?.(progressKey(), result, {
        telemetry: false,
        session,
        client: { source: "ffstart-play-session", sessionId: state.runId },
        metadata: {
          stage: state.session.id,
          evaluated: false,
          mode: state.session.mode,
          stackMinBb: state.session.stack.minBb,
          stackMaxBb: state.session.stack.maxBb
        }
      });
    } catch (_error) {
      // Completion remains usable; the canonical progress client owns persistence.
    }
    sendSessionEvent("session_complete", {
      completedAt: result.completedAt,
      completedHands: session.completedHands,
      evaluated: false,
      status: "completed"
    });
    setText("[data-play-status]", "Серия завершена. Можно переходить к следующему шагу.");
    const complete = query("[data-play-complete]");
    if (complete) {
      complete.hidden = false;
      focusAndReveal(complete);
    }
  }

  function stopSnapshotPolling() {
    window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
  }

  function hideSnapshotRecovery() {
    const recovery = query("[data-play-recovery]");
    if (recovery) recovery.hidden = true;
  }

  function showSnapshotRecovery() {
    stopSnapshotPolling();
    const recovery = query("[data-play-recovery]");
    if (recovery) recovery.hidden = false;
    setText("[data-play-status]", "Не получается обновить счёт раздач. Сам стол можно продолжать использовать.");
  }

  function startSnapshotPolling() {
    stopSnapshotPolling();
    if (!state.completed && state.controller && state.snapshotFailures < MAX_SNAPSHOT_FAILURES) {
      state.pollTimer = window.setInterval(pollSnapshot, 750);
    }
  }

  async function pollSnapshot() {
    if (!state.controller || state.polling || state.completed) return;
    state.polling = true;
    try {
      const snapshot = await state.controller.snapshot();
      state.snapshotFailures = 0;
      hideSnapshotRecovery();
      updateProgress(snapshotHands(snapshot));
    } catch (_error) {
      state.snapshotFailures += 1;
      if (!state.completed && state.snapshotFailures >= MAX_SNAPSHOT_FAILURES) {
        showSnapshotRecovery();
      } else if (!state.completed) {
        setText("[data-play-status]", "Стол играет. Обновляем счёт раздач…");
      }
    } finally {
      state.polling = false;
    }
  }

  async function startSession() {
    if (state.controller || !state.session) return;
    if (mobileTableBlocked()) {
      applyDeviceGate();
      return;
    }
    const start = query("[data-play-start]");
    const section = query("[data-play-table-section]");
    const embed = query("[data-play-embed]");
    if (!start || !section || !embed || !window.PokerSimulatorEmbed?.mount) {
      showError("Игровой стол не загрузился. Вернись в программу и попробуй ещё раз.");
      return;
    }

    start.disabled = true;
    start.textContent = "Открываем стол…";
    section.hidden = false;
    state.startedAt = new Date().toISOString();
    state.runId = `${state.session.id}-${randomToken()}`;
    state.snapshotFailures = 0;
    hideSnapshotRecovery();
    sendSessionEvent("session_start");
    section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

    try {
      state.controller = window.PokerSimulatorEmbed.mount(embed, {
        url: simulatorBaseUrl(),
        practice: "ffstart-freeplay",
        hands: state.session.hands,
        tables: 1,
        tempo: state.session.tempo,
        run: state.runId,
        title: `Игровая сессия: ${state.session.title}`,
        timeoutMs: 15000
      });
      await state.controller.ready;
      start.textContent = "Сессия началась";
      setText("[data-play-status]", "Стол готов. Первая раздача уже началась.");
      await pollSnapshot();
      focusAndReveal(query("#play-table-title"));
      startSnapshotPolling();
    } catch (_error) {
      state.controller?.destroy?.();
      state.controller = null;
      section.hidden = true;
      start.disabled = false;
      start.textContent = "Попробовать снова";
      setText("[data-play-status]", "Стол не открылся. Попробуй ещё раз.");
      start.focus({ preventScroll: true });
    }
  }

  async function retrySnapshot() {
    if (!state.controller || state.completed) return;
    const retry = query("[data-play-retry]");
    if (retry) retry.disabled = true;
    state.snapshotFailures = 0;
    hideSnapshotRecovery();
    setText("[data-play-status]", "Проверяем связь со столом…");
    await pollSnapshot();
    if (!state.completed && state.snapshotFailures < MAX_SNAPSHOT_FAILURES) startSnapshotPolling();
    if (retry) retry.disabled = false;
  }

  function showError(message) {
    root.removeAttribute("aria-busy");
    const intro = query("[data-play-intro]");
    const table = query("[data-play-table-section]");
    const error = query("[data-play-error]");
    if (intro) intro.hidden = true;
    if (table) table.hidden = true;
    if (error) error.hidden = false;
    setText("[data-play-error-message]", message);
  }

  async function init() {
    const requestedId = sessionIdFromLocation();
    if (!requestedId) {
      showError("В ссылке не указана игровая сессия. Вернись в программу и выбери игровую паузу.");
      return;
    }
    const response = await fetch("/course/ffstart-manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Программа временно недоступна.");
    const manifest = await response.json();
    const sessions = Array.isArray(manifest.playSessions) ? manifest.playSessions : [];
    const source = sessions.find((entry) => String(entry?.id || "") === requestedId);
    if (!source) {
      showError("Эта игровая сессия не найдена. Вернись в программу и открой её из нужного модуля.");
      return;
    }
    state.session = normalizeSession(source);
    renderSession();
    query("[data-play-start]")?.addEventListener("click", startSession);
    query("[data-play-retry]")?.addEventListener("click", retrySnapshot);
    window.matchMedia?.(MOBILE_TABLE_MEDIA)?.addEventListener?.("change", applyDeviceGate);
  }

  window.addEventListener("pagehide", function () {
    stopSnapshotPolling();
    state.controller?.destroy?.();
  }, { once: true });

  init().catch(function (error) {
    showError(error?.message || "Не удалось открыть игровую сессию.");
  });
})();
