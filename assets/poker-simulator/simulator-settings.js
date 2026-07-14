(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  function model(options = {}) {
    const windowRef = options.windowRef || root;
    const documentRef = options.documentRef || windowRef.document || null;
    const engine = options.engine || {};
    const startModel = options.startModel || {};
    const storageKey = String(options.storageKey || "ff.poker.table-simulator.v0");
    const warn = typeof options.warn === "function" ? options.warn : () => {};
    const bootParams = new URLSearchParams(windowRef.location?.search || "");
    const embeddedMode = bootParams.has("embedded");
    const bootTableCount = bootParams.get("tables") || bootParams.get("tableCount");
    const storageBackend = embeddedMode ? windowRef.sessionStorage : windowRef.localStorage;
    const practicePacks = windowRef.PokerSimulatorPracticePacks;
    const practicePack = practicePacks?.active?.();
    const settingsStorageKey = practicePack?.storageSuffix
      ? `${storageKey}.${practicePack.storageSuffix}`
      : storageKey;
    const uiScaleValues = new Set(["auto", "compact", "standard", "large", "xl"]);
    const deckValues = new Set(["online-four-color", "online", "color-block", "image"]);

    function defaultSettings() {
      return typeof startModel.defaultSettings === "function" ? startModel.defaultSettings() : {};
    }

    function sanitizeTableCount(value) {
      return typeof startModel.sanitizeTableCount === "function" ? startModel.sanitizeTableCount(value) : Number(value) || 1;
    }

    function sanitizePlayerCount(value) {
      return typeof startModel.sanitizePlayerCount === "function" ? startModel.sanitizePlayerCount(value) : Number(value) || 8;
    }

    function sanitizeSimulationMode(value) {
      return typeof startModel.sanitizeSimulationMode === "function" ? startModel.sanitizeSimulationMode(value) : String(value || "random");
    }

    function sanitizeUiScale(value) {
      const normalized = String(value || "auto").trim().toLowerCase();
      return uiScaleValues.has(normalized) ? normalized : "auto";
    }

    // Hand tempo is the single source of pacing for ALL table counts (1/2/4):
    // "fast" = compact motion + snappy cadence, "calm" = full motion. Legacy
    // records predate handTempo and only carry the removed turbo toggle, so
    // migrate them via legacyTurbo (turbo on -> fast, off -> calm).
    function sanitizeHandTempo(value, legacyTurbo) {
      const normalized = String(value || "").trim().toLowerCase();
      if (normalized === "calm" || normalized === "fast") return normalized;
      if (legacyTurbo !== undefined) return legacyTurbo ? "fast" : "calm";
      return "fast";
    }

    function sanitizeSettings(raw = {}) {
      const defaults = defaultSettings();
      const saved = { ...defaults, ...(raw && typeof raw === "object" ? raw : {}) };
      saved.tableCount = sanitizeTableCount(saved.tableCount);
      saved.playerCount = sanitizePlayerCount(saved.playerCount);
      saved.stakesLevel = typeof engine.normalizeStakesLevel === "function" ? (engine.normalizeStakesLevel(saved.stakesLevel) || "mid") : (["micro", "mid", "high"].includes(saved.stakesLevel) ? saved.stakesLevel : "mid");
      saved.difficulty = typeof engine.normalizeDifficulty === "function" ? engine.normalizeDifficulty(saved.difficulty) : saved.difficulty;
      saved.botLineup = typeof engine.normalizeBotLineup === "function" ? engine.normalizeBotLineup(saved.botLineup) : saved.botLineup;
      saved.botStrategyPool = typeof engine.normalizeBotStrategyPool === "function" ? engine.normalizeBotStrategyPool(saved.botStrategyPool) : "auto";
      saved.botPack = typeof engine.normalizeBotPack === "function" ? (engine.normalizeBotPack(saved.botPack) || "hidden-archetypes") : "hidden-archetypes";
      saved.uiScale = sanitizeUiScale(saved.uiScale);
      saved.deck = deckValues.has(saved.deck) ? saved.deck : (defaults.deck || "color-block");
      saved.chips = "black";
      saved.amountMode = saved.amountMode === "chips" ? "chips" : "bb";
      saved.sliderPresets = typeof startModel.sanitizePresetConfig === "function"
        ? startModel.sanitizePresetConfig(saved.sliderPresets)
        : saved.sliderPresets;
      saved.postflopBetPercents = typeof startModel.sanitizePostflopBetPercents === "function"
        ? startModel.sanitizePostflopBetPercents(saved.postflopBetPercents)
        : saved.postflopBetPercents;
      saved.setupCompleted = Boolean(saved.setupCompleted);
      saved.simulationMode = sanitizeSimulationMode(saved.simulationMode);
      const randomRange = typeof startModel.sanitizeRandomStackRange === "function"
        ? startModel.sanitizeRandomStackRange(saved.randomStackMinBb, saved.randomStackMaxBb)
        : { min: Number(saved.randomStackMinBb) || 5, max: Number(saved.randomStackMaxBb) || 150 };
      saved.randomStackMinBb = randomRange.min;
      saved.randomStackMaxBb = randomRange.max;
      saved.tournamentStartingStackBb = typeof startModel.sanitizeBbNumber === "function"
        ? startModel.sanitizeBbNumber(saved.tournamentStartingStackBb, 5, 500, defaults.tournamentStartingStackBb)
        : saved.tournamentStartingStackBb;
      saved.tournamentLevelHands = typeof startModel.sanitizeInteger === "function"
        ? startModel.sanitizeInteger(saved.tournamentLevelHands, 1, 200, defaults.tournamentLevelHands)
        : saved.tournamentLevelHands;
      saved.tournamentBlindLevels = typeof startModel.sanitizeBlindLevels === "function"
        ? startModel.sanitizeBlindLevels(saved.tournamentBlindLevels, defaults.tournamentBlindLevels)
        : saved.tournamentBlindLevels;
      saved.actionTimerSeconds = typeof startModel.sanitizeInteger === "function"
        ? startModel.sanitizeInteger(saved.actionTimerSeconds, 0, 300, defaults.actionTimerSeconds)
        : saved.actionTimerSeconds;
      saved.trainingMode = Boolean(saved.trainingMode);
      // Read tempo from the RAW record (not the defaults-merged `saved`): the
      // default handTempo "fast" would otherwise mask a legacy record that has
      // only turboMode, flipping an explicit turbo-off user to fast on upgrade.
      const rawSettings = raw && typeof raw === "object" ? raw : {};
      saved.handTempo = sanitizeHandTempo(rawSettings.handTempo, rawSettings.turboMode);
      // turboMode is DERIVED from the canonical tempo (the in-game toggle was
      // removed and absorbed into the start-screen tempo selector). "fast"
      // bundles compact motion + the snappier between-hand cadence.
      saved.turboMode = saved.handTempo === "fast";
      saved.sound = Boolean(saved.sound);
      saved.seatAvatars = saved.seatAvatars !== false;
      saved.revealOpponentCardsOnFinish = saved.revealOpponentCardsOnFinish !== false;
      saved.lobbyEvents = saved.lobbyEvents !== false;
      saved.statsScope = saved.statsScope === "session" ? "session" : "allTime";
      return saved;
    }

    function loadSettings() {
      try {
        return sanitizeSettings(JSON.parse(storageBackend?.getItem?.(settingsStorageKey) || "{}"));
      } catch (error) {
        warn("Stored settings could not be parsed; using defaults.", error);
        return defaultSettings();
      }
    }

    function saveSettings(settings) {
      try {
        storageBackend?.setItem?.(settingsStorageKey, JSON.stringify(settings || {}));
        return true;
      } catch (error) {
        warn("Settings were not persisted.", error);
        return false;
      }
    }

    function applyEmbeddedModeFlag() {
      if (embeddedMode && documentRef?.documentElement?.dataset) {
        documentRef.documentElement.dataset.simulatorEmbedded = "true";
      }
    }

    function applyEmbeddedBootParams(settings) {
      if (settings && embeddedMode && bootTableCount) {
        settings.tableCount = sanitizeTableCount(bootTableCount);
      }
      const bootTempo = bootParams.get("tempo") || bootParams.get("handTempo");
      if (settings && embeddedMode && bootTempo) {
        settings.handTempo = sanitizeHandTempo(bootTempo);
        settings.turboMode = settings.handTempo === "fast";
      }
      if (settings && embeddedMode && practicePacks?.applyBootSettings) {
        practicePacks.applyBootSettings(settings);
      }
      return settings;
    }

    function applyPlayerPathBootParams(settings, applyOptions = {}) {
      if (!settings || bootParams.get("source") !== "player-path") return settings;
      const packs = applyOptions.packs || engine.PACKS || {};
      const isSupportedPack = typeof applyOptions.isSupportedPack === "function" ? applyOptions.isSupportedPack : () => true;
      const pack = String(bootParams.get("pack") || "").trim();
      if (pack && packs[pack] && isSupportedPack(packs[pack])) {
        settings.pack = pack;
      }
      const difficulty = String(bootParams.get("difficulty") || "").trim();
      if (difficulty && typeof engine.normalizeDifficulty === "function") {
        settings.difficulty = engine.normalizeDifficulty(difficulty);
      }
      const strategyPool = String(bootParams.get("strategy") || bootParams.get("botStrategyPool") || "").trim();
      if (strategyPool && typeof engine.normalizeBotStrategyPool === "function") {
        settings.botStrategyPool = engine.normalizeBotStrategyPool(strategyPool);
      }
      const botPack = String(bootParams.get("botPack") || bootParams.get("opponents") || bootParams.get("opponentPack") || "").trim();
      if (botPack && typeof engine.normalizeBotPack === "function") {
        settings.botPack = engine.normalizeBotPack(botPack) || settings.botPack || "hidden-archetypes";
      }
      const mode = String(bootParams.get("mode") || bootParams.get("simulationMode") || "").trim();
      if (mode) settings.simulationMode = sanitizeSimulationMode(mode);
      const tableCount = bootParams.get("tables") || bootParams.get("tableCount");
      if (tableCount) settings.tableCount = sanitizeTableCount(tableCount);
      const tempo = String(bootParams.get("tempo") || bootParams.get("handTempo") || "").trim();
      if (tempo) {
        settings.handTempo = sanitizeHandTempo(tempo);
        settings.turboMode = settings.handTempo === "fast";
      }
      settings.setupCompleted = true;
      return settings;
    }

    return {
      bootParams,
      embeddedMode,
      bootTableCount,
      storageBackend,
      sanitizeUiScale,
      sanitizeSettings,
      loadSettings,
      saveSettings,
      applyEmbeddedModeFlag,
      applyEmbeddedBootParams,
      applyPlayerPathBootParams
    };
  }

  root.PokerSimulatorSettings = { model };
  if (typeof module !== "undefined" && module.exports) module.exports = { model };
})();
