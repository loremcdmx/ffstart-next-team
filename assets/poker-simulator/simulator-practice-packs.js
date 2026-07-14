(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const descriptors = new Map();
  const aliases = new Map();
  const installedEngines = new WeakMap();

  // This is the only central edit a new full-simulator practice pack needs.
  // Geometry never belongs here or in a pack: seats/cards/bets remain owned by
  // PokerSimulatorSeatSlots and the shared simulator renderers.
  const catalog = Object.freeze({
    "rfi-open": Object.freeze({
      aliases: Object.freeze(["rfi-open-position"]),
      styles: Object.freeze(["assets/poker-rfi-open-lesson/simulator-pack.css?v=20260714-prod-refresh-1"]),
      scripts: Object.freeze([
        "assets/poker-rfi-open-lesson/data.js?v=20260714-prod-refresh-1",
        "assets/poker-rfi-open-lesson/simulator-pack.js?v=20260714-endless-practice"
      ])
    }),
    resteal: Object.freeze({
      aliases: Object.freeze(["bb-resteal"]),
      styles: Object.freeze(["assets/poker-resteal-lesson/simulator-pack.css?v=20260714-practice-geometry"]),
      scripts: Object.freeze([
        "assets/poker-resteal-lesson/advice.js?v=20260713-2",
        "assets/poker-resteal-lesson/simulator-pack.js?v=20260714-practice-api"
      ])
    })
  });

  function normalizeId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function queryParams(search = root.location?.search || "") {
    return new URLSearchParams(search);
  }

  function requestedId(search) {
    const params = queryParams(search);
    // `practice` is canonical. lesson/drill remain accepted so existing links,
    // bookmarks and production embeds keep working during migration.
    return normalizeId(params.get("practice") || params.get("lesson") || params.get("drill"));
  }

  function catalogEntry(search) {
    const requested = requestedId(search);
    if (!requested) return null;
    for (const [id, entry] of Object.entries(catalog)) {
      if (requested === id || entry.aliases.includes(requested)) return { id, ...entry };
    }
    return null;
  }

  function descriptorFor(value) {
    if (value && typeof value === "object") return value;
    const key = aliases.get(normalizeId(value)) || normalizeId(value);
    return descriptors.get(key) || null;
  }

  function active(search) {
    return descriptorFor(requestedId(search));
  }

  function context(descriptor, extra = {}) {
    const params = queryParams(extra.search);
    return {
      descriptor,
      params,
      requestedId: requestedId(extra.search),
      ...extra
    };
  }

  function scenarioSettings(scenario, ctx, source) {
    const patch = typeof scenario.settings === "function"
      ? scenario.settings(ctx)
      : scenario.settings;
    return { ...(source || {}), ...(patch || {}) };
  }

  function createScenario(descriptor, baseCreateTable, options = {}) {
    const scenario = descriptor?.scenario;
    if (!scenario || typeof baseCreateTable !== "function") return baseCreateTable(options);

    const handNo = Math.max(1, Number(options.handNo || 1));
    const ctx = context(descriptor, { handNo, options });
    if (typeof scenario.create === "function") {
      return scenario.create({ ...ctx, createTable: baseCreateTable });
    }

    const maxAttempts = Math.max(1, Math.min(1000, Number(
      typeof scenario.maxAttempts === "function" ? scenario.maxAttempts(ctx) : scenario.maxAttempts
    ) || 1));
    const heroPosition = String(
      typeof scenario.heroPosition === "function" ? scenario.heroPosition(ctx) : scenario.heroPosition || ""
    );
    const preparedOptions = typeof scenario.prepareOptions === "function"
      ? scenario.prepareOptions(options, ctx) || options
      : options;
    const dealOptions = scenario.freshDeal
      ? { ...preparedOptions, previousTable: null }
      : { ...preparedOptions };
    const settings = scenarioSettings(scenario, ctx, dealOptions.settings);
    const practiceScenario = typeof scenario.practiceScenario === "function"
      ? scenario.practiceScenario(ctx)
      : scenario.practiceScenario;
    let selected = null;
    let fallback = null;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts += 1;
      const candidate = baseCreateTable({
        ...dealOptions,
        settings,
        practiceScenario: practiceScenario || undefined,
        scenarioHeroPosition: heroPosition || undefined
      });
      fallback = candidate;
      const attemptContext = { ...ctx, attempts, candidate };
      if (typeof scenario.accept !== "function" || scenario.accept(candidate, attemptContext)) {
        selected = candidate;
        break;
      }
    }

    if (!selected) {
      if (scenario.onFailure === "error") {
        throw new Error(typeof scenario.failureMessage === "function"
          ? scenario.failureMessage({ ...ctx, attempts })
          : `Practice scenario ${descriptor.id} was not generated after ${attempts} attempts`);
      }
      selected = fallback;
    }
    if (!selected) return selected;
    return typeof scenario.decorate === "function"
      ? (scenario.decorate(selected, { ...ctx, attempts }) || selected)
      : selected;
  }

  function installForEngine(value, engine = root.PokerSimulatorEngine, options = {}) {
    const descriptor = descriptorFor(value);
    if (!descriptor || !engine || typeof engine.createTable !== "function") return false;
    if (!options.force && descriptor !== active(options.search)) return false;

    let state = installedEngines.get(engine);
    if (!state) {
      const baseCreateTable = engine.createTable.bind(engine);
      state = { baseCreateTable, activeDescriptor: null, installed: new Set() };
      installedEngines.set(engine, state);
      engine.createTable = function createPracticeTable(createOptions = {}) {
        const current = state.activeDescriptor || active();
        return current
          ? createScenario(current, state.baseCreateTable, createOptions)
          : state.baseCreateTable(createOptions);
      };
    }

    if (!state.installed.has(descriptor.id)) {
      descriptor.installEngine?.(engine, context(descriptor, { engine }));
      state.installed.add(descriptor.id);
    }
    state.activeDescriptor = descriptor;
    return true;
  }

  function register(definition) {
    if (!definition || typeof definition !== "object") throw new TypeError("Practice pack definition must be an object");
    const id = normalizeId(definition.id);
    if (!id) throw new Error("Practice pack id is required");
    if (descriptors.has(id)) throw new Error(`Practice pack already registered: ${id}`);
    const descriptor = { ...definition, id, aliases: [...new Set((definition.aliases || []).map(normalizeId).filter(Boolean))] };
    descriptors.set(id, descriptor);
    aliases.set(id, id);
    descriptor.aliases.forEach((alias) => {
      if (aliases.has(alias) && aliases.get(alias) !== id) throw new Error(`Practice pack alias already registered: ${alias}`);
      aliases.set(alias, id);
    });
    if (descriptor === active()) installForEngine(descriptor, root.PokerSimulatorEngine);
    return descriptor;
  }

  function applyBootSettings(settings, extra = {}) {
    const descriptor = active(extra.search);
    if (!descriptor || !settings) return settings;
    descriptor.applyBootSettings?.(settings, context(descriptor, extra));
    return settings;
  }

  function defaultBetAmount(payload = {}) {
    const descriptor = active(payload.search);
    if (!descriptor || typeof descriptor.defaultBetAmount !== "function") return payload.value;
    const next = Number(descriptor.defaultBetAmount(payload, context(descriptor, payload)));
    return Number.isFinite(next) ? next : payload.value;
  }

  function decisionClass(payload = {}) {
    const descriptor = active(payload.search);
    if (!descriptor || typeof descriptor.decisionClass !== "function") return "";
    return String(descriptor.decisionClass(payload, context(descriptor, payload)) || "").trim();
  }

  function sessionCompleteAction(payload = {}) {
    const descriptor = active(payload.search);
    if (!descriptor) return null;
    const value = typeof descriptor.sessionCompleteAction === "function"
      ? descriptor.sessionCompleteAction(payload, context(descriptor, payload))
      : descriptor.sessionCompleteAction;
    if (!value) return null;
    return typeof value === "string" ? { action: value, label: "Сыграть ещё" } : value;
  }

  const api = {
    catalog,
    register,
    active,
    requestedId,
    catalogEntry,
    installForEngine,
    createScenario,
    applyBootSettings,
    defaultBetAmount,
    decisionClass,
    sessionCompleteAction,
    list: () => [...descriptors.values()]
  };

  root.PokerSimulatorPracticePacks = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
