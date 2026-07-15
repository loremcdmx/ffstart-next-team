(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const canonicalId = "ffstart-freeplay";
  const aliases = ["ffstart-play"];

  function paramsFor(search = root.location?.search || "") {
    return new URLSearchParams(search);
  }

  function requestedId(params = paramsFor()) {
    return String(params.get("practice") || params.get("lesson") || params.get("drill") || "").trim().toLowerCase();
  }

  function active(search) {
    const id = requestedId(paramsFor(search));
    return id === canonicalId || aliases.includes(id);
  }

  function integerParam(params, names, fallback, min, max) {
    for (const name of names) {
      const raw = params.get(name);
      if (raw == null || String(raw).trim() === "") continue;
      const value = Number(raw);
      if (Number.isFinite(value)) return Math.max(min, Math.min(max, Math.floor(value)));
    }
    return fallback;
  }

  function sessionSettings(params = paramsFor()) {
    const mode = String(params.get("mode") || params.get("simulationMode") || "random").toLowerCase() === "tournament"
      ? "tournament"
      : "random";
    const stackMin = integerParam(params, ["stackMin", "stackMinBb", "minBb", "randomStackMinBb"], mode === "tournament" ? 40 : 20, 5, 500);
    const stackMax = Math.max(stackMin, integerParam(params, ["stackMax", "stackMaxBb", "maxBb", "randomStackMaxBb"], stackMin, 5, 500));
    const hands = integerParam(params, ["hands", "handCount"], 10, 1, 200);
    const tempo = String(params.get("tempo") || params.get("handTempo") || "fast").toLowerCase() === "calm" ? "calm" : "fast";
    return { mode, stackMin, stackMax, hands, tempo };
  }

  function applyBootSettings(settings, context = {}) {
    if (!settings) return settings;
    const params = context.params instanceof URLSearchParams ? context.params : paramsFor(context.search);
    const id = String(context.requestedId || requestedId(params)).toLowerCase();
    if (id !== canonicalId && !aliases.includes(id)) return settings;
    const session = sessionSettings(params);
    Object.assign(settings, {
      pack: "basic-vpip",
      tableCount: 1,
      playerCount: 6,
      setupCompleted: true,
      autoStart: true,
      simulationMode: session.mode,
      randomStackMinBb: session.stackMin,
      randomStackMaxBb: session.stackMax,
      tournamentStartingStackBb: session.stackMin,
      actionTimerSeconds: 0,
      trainingMode: false,
      manualNextHand: false,
      continueAfterBust: true,
      sessionHandLimit: session.hands,
      demoMode: true,
      lobbyEvents: false,
      revealOpponentCardsOnFinish: true,
      statsScope: "session",
      handTempo: session.tempo,
      turboMode: session.tempo === "fast",
      sound: false
    });
    return settings;
  }

  const descriptor = {
    id: canonicalId,
    aliases,
    storageSuffix: "ffstart-freeplay",
    applyBootSettings
  };

  const api = {
    id: canonicalId,
    aliases,
    active,
    sessionSettings,
    applyBootSettings,
    descriptor
  };

  root.FFStartSimulatorFreeplayPack = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PokerSimulatorPracticePacks?.register?.(descriptor);
})();
