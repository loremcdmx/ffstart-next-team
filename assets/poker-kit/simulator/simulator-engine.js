(function () {
  const engineRoot = typeof window !== "undefined" ? window : globalThis;
  const engineParts = engineRoot.PokerSimulatorEngineParts || {};
  if (!engineParts.createTable || !engineParts.showdown || !engineParts.botPostflopIntent) {
    throw new Error("Poker simulator engine parts must load before simulator-engine.js");
  }

  /**
   * Public API exposed on `window.PokerSimulatorEngine`. Pure poker logic
   * without DOM dependencies. Also available as `module.exports` for Node
   * unit tests. Used by `assets/poker-simulator/simulator.js` (the trainer
   * UI) and any future consumer.
   *
   * @typedef {Object} EngineApi
   *
   * @property {number[]} TABLE_COUNTS  Supported table-count presets (1/2/4).
   * @property {number}   PACK_SCHEMA_VERSION  Current VPIP-pack schema (1).
   * @property {number}   BOT_PACK_SCHEMA_VERSION  Current opponent bot-pack schema (2).
   * @property {number[]} PLAYER_COUNTS  Supported seats-per-table (2..9).
   * @property {Object}   BOT_PACK_PROFILE  Registered bot-pack profile manifest.
   * @property {Object}   PACKS  Registered VPIP packs keyed by pack id.
   * @property {Object}   PREFLOP_CHARTS  Preflop ranges by difficulty
   *   ("easy"/"standard"/"pro" plus aliases "loose"/"public"/"nitty").
   * @property {string}   COACH_15_11_SOURCE  Product source for the current
   *   coach-policy overlay.
   * @property {Object<string,number>} RANK_VALUES  Map card rank → numeric
   *   value (A=14, K=13, ..., 2=2).
   *
   * @property {function({id:number, settings:object, handNo:number, previousTable?:object, tournamentHandNo?:number, scenarioHeroPosition?:string, practiceScenario?:object, testHeroPosition?:string}):object} createTable
   *   scenarioHeroPosition is the public practice-pack override for a fresh cash
   *   scenario. It deterministically seats Hero at a valid table position.
   *   testHeroPosition is a TEST-ONLY override (cash deals, valid position only) for
   *   deterministically seating the hero; ignored for carryover/tournament or unknown positions.
   *   Spawn a hand for one table. If `previousTable` is provided with the
   *   same player count, the next hand keeps physical seats/stacks and moves
   *   the dealer/blinds one seat forward.
   *
   * @property {function(string, object):void} registerPack
   *   Register a single validated VPIP pack into `PACKS`.
   *
   * @property {function(object):void} registerPacks
   *   Bulk-register packs by manifest object.
   *
   * @property {function(string, object):{ok:boolean, errors:string[]}} validatePackDefinition
   *   Validate one pack against `PACK_SCHEMA_VERSION`. Returns ok+errors.
   *
   * @property {function(string):Promise<void>} loadPackManifest
   *   Fetch + validate + register a remote manifest JSON.
   *
   * @property {function(object, string, object, object=):object} startHeroAction
   *   Apply the hero's action (`fold`/`check`/`call`/`bet`/`raise`/`all-in`).
   *   Mutates the table; returns the post-action snapshot.
   *
   * @property {function(object, string, number, object):object} resolveBotAction
   *   Run the next bot in turn order. `heroAction` + `heroAmount` provide
   *   context for postflop reads. Mutates the table.
   *
   * @property {function(object, string, number, object):{grade:string, reason:string}} gradeHeroDecision
   *   Score the hero's action against the engine's strategic policy. Used
   *   by training mode + analytics.
   *
   * @property {function(number):string} formatBb
   *   Format chip count as a BB string ("12.5BB", "$15", etc.).
   *
   * @property {function(string):string} difficultyLabel
   *   Russian human label for a difficulty key.
   *
   * @property {function(string):string} normalizeDifficulty
   *   Map "loose"/"public"/"nitty" → canonical "easy"/"standard"/"pro".
   *
   * @property {function(string):string} normalizeBotLineup
   *   Map raw lineup string to canonical id.
   *
   * @property {function(string):string} normalizeBotStrategyPool
   *   Map raw strategy-pool setting to "auto", tier pool, mixed pool, or model:id.
   *
   * @property {function():object} botPackCatalog
   *   Return registered opponent bot packs keyed by pack id.
   *
   * @property {function(string):string} normalizeBotPack
   *   Normalize a bot-pack setting/alias to a registered pack id, or "".
   *
   * @property {function(string):string} botPackLabel
   *   Human label for an opponent bot-pack setting.
   *
   * @property {function(string):string} normalizeStakesLevel
   *   Map raw stakes setting to "micro"/"mid"/"high", or "" when unset.
   *
   * @property {function(string):string} stakesLevelLabel
   *   Russian label for a stakes level.
   *
   * @property {function(string, number, object=):(object[]|null)} createStakesModelPlan
   *   Build the exact-count per-seat model plan for a stakes level (or null).
   *
   * @property {function():object} botStrategyModelCatalog
   *   Return the configured top/standard/weak bot strategy model pools.
   *
   * @property {function(number):string} botStrategySizeLabel
   *   Return the canonical strategy size label for a live table size.
   *
   * @property {function(number):string} botStrategyStackBucketForDepth
   *   Return the canonical strategy stack bucket for an effective stack depth.
   *
   * @property {function(object):string} botStrategyTableStackBucket
   *   Return the current strategy stack bucket for table settings.
   *
   * @property {function(object, object):object|null} strategyModelForSettings
   *   Return the table-size and stack-size adapted strategy model for settings.
   *
   * @property {function(object, object, object=):object|null} adaptStrategyModelToSettings
   *   Move a carried/selected model to the compatible current size/stack variant.
   *
   * @property {function(object[], object):object[]} filterStrategyModelsForSettings
   *   Return strategy models compatible with the current table size/ante/stack.
   *
   * @property {function(object, number):object[]} createBotStrategyModelPlan
   *   Build the randomized per-seat strategy model plan for a table.
   *
   * @property {function(string):string} botLineupLabel
   *   Russian label for a lineup.
   *
   * @property {function(string):string} botStrategyPoolLabel
   *   Human label for the selected strategy model pool.
   *
   * @property {function(string):string} botStyleLabel
   *   Russian label for an individual bot style.
   *
   * @property {function(string):string} streetLabel
   *   Russian label for a street ("preflop"/"flop"/"turn"/"river").
   *
   * @property {function(string[]):number[]} evaluateBest
   *   Best 5-card score from 5..7 cards. Returns a score tuple comparable
   *   via `compareScores`. First element is the hand class (0=high card,
   *   1=pair, ..., 8=straight flush).
   *
   * @property {function(number[], number[]):number} compareScores
   *   Compare two score tuples from `evaluateBest`. Positive = first wins,
   *   negative = second wins, 0 = chop.
   *
   * @property {function(object, number[][]):void} settlePots
   *   Settle the table pot into main + side pots and pay winners. `tiers` is a
   *   best-first list of live (non-folded) seat-id groups, e.g. `[[2],[0,3]]`.
   *   Refunds any uncalled over-shove, awards each layer only to the seats
   *   eligible for it, and is idempotent (guarded by `table.potAwarded`).
   *
   * @property {function(Array<{seatId:number, score:number[]}>):number[][]} rankTiersFromResults
   *   Group seats into best-first tiers (ties share a tier) from
   *   `evaluateBest` score tuples — the `tiers` argument for `settlePots`.
   *
   * @property {function(string[]):object} assessCards
   *   Preflop hand strength assessment for hero's 2 hole cards.
   *
   * @property {function(string[], string[]):object} assessPostflopHand
   *   Made-hand + draws assessment given hole cards + board (3..5 cards).
   *
   * @property {function(string[]):object} assessBoardTexture
   *   Texture flags for a 3..5 card board (paired/coordinated/monotone).
   *
   * @property {function(object):object} snapshotHandHistory
   *   Serialize a completed table for replay/export. Used by replay dialog
   *   and JSON export.
   *
   * @property {function(string[]):string[]} normalizeCombo
   *   Normalize card combo notation (sort, deduplicate, validate).
   *
   * @type {EngineApi}
   */
  const api = {
    TABLE_COUNTS,
    PACK_SCHEMA_VERSION,
    BOT_PACK_SCHEMA_VERSION,
    PLAYER_COUNTS,
    BOT_STRATEGY_PROFILE,
    BOT_PACK_PROFILE,
    PACKS,
    PREFLOP_CHARTS,
    THIRD_LEAGUE_BOT_OVERLAYS,
    COACH_15_11_SOURCE,
    RANK_VALUES,
    createTable,
    registerPack,
    registerPacks,
    validatePackDefinition,
    loadPackManifest,
    startHeroAction,
    forfeitHeroHand,
    resolveBotAction,
    gradeHeroDecision,
    formatBb,
    difficultyLabel,
    normalizeDifficulty,
    normalizeBotLineup,
    normalizeBotStrategyPool,
    botPackCatalog,
    normalizeBotPack,
    botPackDefinition,
    botPackLabel,
    normalizeStakesLevel,
    stakesLevelLabel,
    createStakesModelPlan,
    botStrategyModelCatalog,
    normalizeBotStrategyModel,
    botStrategySizeLabel,
    normalizeBotStrategyStackBucket,
    botStrategyStackBucketForDepth,
    botStrategyTableStackBucket,
    botStrategyStackBucketBounds,
    tableSizedStrategyModelForSettings,
    stackSizedStrategyModelForSettings,
    strategyModelForSettings,
    filterStrategyModelsForSettings,
    createBotPackModelPlan,
    createBotStrategyModelPlan,
    carryoverReplacementStrategyModel,
    adaptStrategyModelToSettings,
    thirdLeagueBotOverlayForSeat,
    botLearningPreflopAdjustment,
    botLineupLabel,
    botStrategyPoolLabel,
    botStyleLabel,
    streetLabel,
    evaluateBest,
    compareScores,
    settlePots,
    rankTiersFromResults,
    assessCards,
    assessPostflopHand,
    assessBoardTexture,
    snapshotHandHistory,
    normalizeCombo,
    setSeatLobbyState,
    tickLobbyForHand,
    // C1a — original-open tracking helpers (exposed for engine-smoke acceptance)
    markPreflopOpenContext,
    markPreflopOpenCaller,
    preflopOpenerPosition,
    isOriginalPreflopOpener,
    isPreflopOpenCaller,
    originalOpenToBb,
    isInPositionVs,
    threeBetTarget,
    coldCallVsThreeBetDecision,
    openDefenseElasticity,
    threeBetDefenseElasticity,
    preHeroContinueDecision,
    botFishLimpDecision,
    botPostflopIntent,
    fourBetPatternsFor,
    botFacingPushFoldDecision,
    // Exposed for the engine accounting smoke (scripts/simulator-engine-smoke.mjs)
    // so the raise-accounting edge cases can be exercised deterministically.
    effectiveAllInCeiling,
    commitCappedPreflopRaise,
    applyVillainPostflopAction,
    // Bot generation stamp (DDMM). Bump whenever the bot policy changes — the seat renderer
    // shows it after each bot's nickname, so the live bot generation is visible on prod.
    // 2906 = 2026-06-29 (size-read defense + canon BB-defense leak-fix).
    BOT_POLICY_VERSION: "2906"
  };

  engineRoot.PokerSimulatorEngine = api;
  if (engineRoot.document?.documentElement) {
    engineRoot.document.documentElement.dataset.pokerSimulatorEngine = "ready";
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
