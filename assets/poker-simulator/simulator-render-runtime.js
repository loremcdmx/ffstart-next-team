(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;

  function noop() {}

  function assignFn(target, key, candidate) {
    if (typeof target[key] === "function" || typeof candidate !== "function") return;
    target[key] = candidate;
  }

  function assignValue(target, key, candidate) {
    if (target[key] !== undefined || candidate === undefined || candidate === null) return;
    target[key] = candidate;
  }

  // Fail-LOUD boundary for REQUIRED loose-bag deps (the batch form of the
  // foundation roadmap's requireFn). assignFn() above is intentionally
  // fail-OPEN for genuinely-optional deps; requireFns asserts that a dep this
  // hub actually CALLS unguarded resolved to a function, so a renamed/unloaded
  // producer surfaces at boot naming THIS hub, instead of a silent no-op or a
  // generic "x is not a function" mid-render. Only meaningful in a real DOM
  // runtime — headless source-contract harnesses load these hubs with
  // intentionally-partial mocks, so skip when there is no document.
  const reportedMissingDeps = new Set();

  function requireFns(target, keys, source) {
    if (!root.document) return;
    const missing = (Array.isArray(keys) ? keys : []).filter((key) => typeof target[key] !== "function");
    if (!missing.length) return;
    const signature = `${source}|${missing.join(",")}`;
    if (reportedMissingDeps.has(signature)) return;
    reportedMissingDeps.add(signature);
    const message = `[poker-simulator] ${source}: missing required runtime dependencies: ${missing.join(", ")} — a producer was renamed or failed to load (silent loose-bag wiring).`;
    if (root.console && typeof root.console.error === "function") root.console.error(message);
  }
  // Single source of truth for the render-reason vocabulary. `renderNow` dispatches
  // off these: a reason in TABLE_ONLY paints only the affected tables, one in
  // HUD_ONLY repaints only the session stats, everything else (FULL + the dynamic
  // families) does the heavy full multi-table render. A reason that is in NONE of
  // these buckets still falls through to a full render — but that is exactly the
  // silent perf regression we want to catch, so `warnUnknownRenderReasons` flags it
  // once. Add new reasons HERE (and pick a bucket) rather than inventing a string at
  // the call site.
  const RENDER_REASONS = (function buildRenderReasons() {
    // Scoped to the table DOM only — never touch the rest of the shell/HUD.
    const TABLE_ONLY = Object.freeze([
      "fold-muck-started",
      "fold-muck-ended",
      "bet-marker-landed",
      "bot-response",
      "fold-dim",
      "hero-action-visual",
      "deferred-table-patch",
      "visual-unlock:actionControlUnlockAt",
      "visual-unlock:blindLevelAnnouncementUntil",
      "visual-unlock:boardRevealUntil",
      "visual-unlock:dealRevealUntil",
      "visual-unlock:potFlightUntil"
    ]);
    // Scoped to the session-stats HUD only.
    const HUD_ONLY = Object.freeze(["decision-feedback"]);
    // Intentional full multi-table renders (settings/lifecycle/embed/scheduler).
    const FULL = Object.freeze([
      "action-unlock",
      "amount-mode",
      "bot-lab",
      "deal-all",
      "fold-any-canceled",
      "fold-any-queued",
      "import-session",
      "opponent-note",
      "opponent-note-clear",
      "opponent-note-open",
      "pageshow",
      "replace-table",
      "reset-all",
      "reset-idle",
      "restart-tournament",
      "select-table",
      "session-hand-limit",
      "settings",
      "simulation-settings",
      "table-count",
      "table-count-blocked",
      "table-count-idle",
      "hero-action",
      "pause",
      "resume",
      "bfcache-restore",
      "boot",
      "foreign-tab-session",
      // scheduler/runtime fallbacks (render-loop + renderNow defaults)
      "legacy",
      "flush",
      "raf",
      "sync"
    ]);
    // Table-only families that carry a per-instance suffix. The action-board
    // timer already marks the affected table dirty before scheduling one of
    // these phases, so promoting it to a full render needlessly restarts global
    // repair/clock/shell work on every animation boundary.
    const DYNAMIC_TABLE_ONLY_PREFIXES = Object.freeze(["action-board:"]);
    // Full-render families that carry a per-instance suffix, so they cannot be
    // enumerated as exact strings (e.g. "showdown:phase-180", "api-new-hand").
    const DYNAMIC_FULL_PREFIXES = Object.freeze(["showdown:", "api-", "embed-", "mp-"]);

    const tableOnlySet = new Set(TABLE_ONLY);
    const hudOnlySet = new Set(HUD_ONLY);
    const fullSet = new Set(FULL);

    function isTableOnlyItem(item) {
      if (tableOnlySet.has(item)) return true;
      return DYNAMIC_TABLE_ONLY_PREFIXES.some((prefix) => String(item || "").startsWith(prefix));
    }
    function isHudOnlyItem(item) {
      return hudOnlySet.has(item);
    }
    function isKnownItem(item) {
      if (isTableOnlyItem(item) || hudOnlySet.has(item) || fullSet.has(item)) return true;
      return DYNAMIC_FULL_PREFIXES.some((prefix) => String(item || "").startsWith(prefix));
    }

    return Object.freeze({
      TABLE_ONLY,
      HUD_ONLY,
      FULL,
      DYNAMIC_TABLE_ONLY_PREFIXES,
      DYNAMIC_FULL_PREFIXES,
      isTableOnlyItem,
      isHudOnlyItem,
      isKnownItem
    });
  })();

  function model(options = {}) {
    const perfModel = options.perfModel || {};
    const runtimeBridge = options.runtimeBridge || {};
    const visualRuntime = options.visualRuntime || {};
    const composedVisualRuntime = options.composedVisualRuntime || {};
    const actionRuntime = options.actionRuntime || {};
    const sessionComposition = options.sessionComposition || {};
    const historyBridge = options.historyBridge || {};
    const domControls = options.domControls || {};
    const domPatch = options.domPatch || {};
    const startPanelRuntime = options.startPanelRuntime || {};

    assignFn(options, "perfNow", perfModel.perfNow);
    assignFn(options, "addPerfCount", perfModel.addPerfCount);
    assignFn(options, "recordRenderMetrics", perfModel.recordRenderMetrics);
    assignFn(options, "difficultyLabel", runtimeBridge.difficultyLabel);
    assignFn(options, "renderTable", composedVisualRuntime.renderTable);
    if (typeof startPanelRuntime.renderStartPanel === "function") {
      assignFn(options, "renderStartPanel", () => startPanelRuntime.renderStartPanel());
    }
    assignFn(options, "renderPauseOverlay", visualRuntime.renderPauseOverlay);
    assignFn(options, "repairPendingBotResponses", actionRuntime.repairPendingBotResponses);
    assignFn(options, "clearExpiredRenderedAnimations", composedVisualRuntime.clearExpiredRenderedAnimations);
    assignFn(options, "prepareActionClocks", actionRuntime.prepareActionClocks);
    assignFn(options, "announceHeroTurnForActiveTable", runtimeBridge.announceHeroTurnForActiveTable);
    assignFn(options, "syncPauseButton", visualRuntime.syncPauseButton);
    assignFn(options, "syncDealButton", visualRuntime.syncDealButton);
    assignFn(options, "syncSimulationControls", runtimeBridge.syncSimulationControls);
    assignFn(options, "replayEntries", historyBridge.replayEntries);
    assignFn(options, "renderBotLabOutput", runtimeBridge.renderBotLabOutput);
    assignFn(options, "renderImportStatus", runtimeBridge.renderImportStatus);
    assignFn(options, "renderLeaderboardBody", runtimeBridge.renderLeaderboardBody);
    assignFn(options, "renderSessionStats", sessionComposition.renderSessionStats);
    assignFn(options, "updateAutoDealCountdowns", actionRuntime.updateAutoDealCountdowns);
    assignFn(options, "syncAutoDealCountdownTicker", actionRuntime.syncAutoDealCountdownTicker);
    assignFn(options, "updateActionClocks", actionRuntime.updateActionClocks);
    assignFn(options, "syncActionClockTicker", actionRuntime.syncActionClockTicker);
    assignFn(options, "patchTableShell", domPatch.patchTableShell);
    assignFn(options, "setTextIfChanged", domPatch.setTextIfChanged);
    assignFn(options, "setValueIfChanged", domPatch.setValueIfChanged);
    assignFn(options, "setCheckedIfChanged", domPatch.setCheckedIfChanged);
    assignFn(options, "setDisabledIfChanged", domPatch.setDisabledIfChanged);
    assignFn(options, "setAttributeIfChanged", domPatch.setAttributeIfChanged);
    assignValue(options, "controls", domControls.renderRuntime);

    // Functions renderNow()/renderTables() invoke unguarded on a full render.
    // (Optional deps kept fail-open via typeof-fallbacks below: perfNow,
    // addPerfCount, recordRenderMetrics, difficultyLabel, cssEscape.)
    requireFns(options, [
      "renderTable", "renderStartPanel", "renderPauseOverlay", "renderSessionStats",
      "clearExpiredRenderedAnimations", "repairPendingBotResponses", "prepareActionClocks",
      "announceHeroTurnForActiveTable", "syncPauseButton", "syncDealButton", "syncSimulationControls",
      "replayEntries", "renderBotLabOutput", "renderImportStatus", "renderLeaderboardBody",
      "updateAutoDealCountdowns", "syncAutoDealCountdownTicker", "updateActionClocks", "syncActionClockTicker",
      "patchTableShell", "setTextIfChanged", "setValueIfChanged", "setCheckedIfChanged",
      "setDisabledIfChanged", "setAttributeIfChanged"
    ], "render-runtime");

    const documentRef = options.documentRef || root.document;
    const windowRef = options.windowRef || documentRef?.defaultView || root;
    const state = options.state || {};
    // Fail-open: the per-field self-heal below (renderedTableHtml/dirtyTableIds/
    // metrics) lives behind the renderScheduler slice, so guard the SLICE itself
    // once here. Production always builds it via createInitialState; this keeps a
    // bare/partial state (a hand-rolled caller) from hard-crashing on first deref.
    if (!state.renderScheduler || typeof state.renderScheduler !== "object") state.renderScheduler = {};
    const engine = options.engine || { PACKS: {} };
    const controls = options.controls || {};
    const tableGrid = controls.tableGrid || null;

    const perfNow = typeof options.perfNow === "function" ? options.perfNow : () => Date.now();
    const addPerfCount = typeof options.addPerfCount === "function" ? options.addPerfCount : noop;
    const recordRenderMetrics = typeof options.recordRenderMetrics === "function" ? options.recordRenderMetrics : noop;
    const difficultyLabel = typeof options.difficultyLabel === "function" ? options.difficultyLabel : (value) => String(value || "");
    const cssEscape = typeof options.cssEscape === "function" ? options.cssEscape : (value) => String(value || "");
    const uiScaleValues = new Set(["auto", "compact", "standard", "large", "xl"]);
    const warnedRenderReasons = new Set();

    function currentSettings() {
      if (!state.settings) state.settings = {};
      return state.settings;
    }

    function sanitizeUiScale(value) {
      const normalized = String(value || "auto").trim().toLowerCase();
      return uiScaleValues.has(normalized) ? normalized : "auto";
    }

    function syncUiScaleSetting(value) {
      const scale = sanitizeUiScale(value);
      const rootNode = documentRef?.documentElement;
      if (rootNode?.dataset && rootNode.dataset.simulatorUiScale !== scale) {
        rootNode.dataset.simulatorUiScale = scale;
      }
      return scale;
    }

    function syncChipThemeSetting() {
      const theme = "black";
      const rootNode = documentRef?.documentElement;
      if (rootNode?.dataset && rootNode.dataset.pokerChipTheme !== theme) {
        rootNode.dataset.pokerChipTheme = theme;
      }
      return theme;
    }

    function syncSettingsSelectButtons() {
      (Array.isArray(controls.settingsSelectButtons) ? controls.settingsSelectButtons : []).forEach((button) => {
        const selectId = String(button.dataset.settingsSelectButton || "");
        const select = selectId ? documentRef?.getElementById?.(selectId) : null;
        const selected = Boolean(select && String(select.value) === String(button.dataset.settingsSelectValue || ""));
        options.setAttributeIfChanged(button, "aria-pressed", String(selected));
      });
    }

    function tableList() {
      return Array.isArray(state.tables) ? state.tables : [];
    }

    function renderedTableHtml() {
      if (!(state.renderScheduler.renderedTableHtml instanceof Map)) state.renderScheduler.renderedTableHtml = new Map();
      return state.renderScheduler.renderedTableHtml;
    }

    function dirtyTableIds() {
      if (!(state.renderScheduler.dirtyTableIds instanceof Set)) state.renderScheduler.dirtyTableIds = new Set();
      return state.renderScheduler.dirtyTableIds;
    }

    function resetRenderMetrics() {
      state.renderScheduler.currentRenderMetrics = {
        tableHtmlBuilds: 0,
        skippedTableBuilds: 0,
        generatedHtmlBytes: 0,
        patches: 0,
        patchInnerHtmlBytes: 0,
        sameHtmlHits: 0
      };
    }

    function syncDealerSnapshots() {
      if (!(state.renderScheduler.lastDealerByTable instanceof Map)) state.renderScheduler.lastDealerByTable = new Map();
      tableList().forEach((table) => {
        const dealerSeat = (table.seats || []).find((seat) => seat.dealer);
        if (dealerSeat) state.renderScheduler.lastDealerByTable.set(Number(table.id), Number(dealerSeat.id));
      });
    }

    function renderNow(reason = "sync") {
      const startedAt = perfNow();
      addPerfCount("renderNowCalls");
      resetRenderMetrics();
      try {
        const reasonItems = splitReasonItems(reason);
        const scope = renderReasonScope(reasonItems);
        warnUnknownRenderReasons(reasonItems);
        const settings = currentSettings();
        const uiScale = syncUiScaleSetting(settings.uiScale);
        settings.chips = syncChipThemeSetting();
        const pack = engine.PACKS?.[settings.pack] || engine.PACKS?.["basic-vpip"] || { name: "" };
        const stakesText = engine.stakesLevelLabel?.(settings.stakesLevel) || "";
        const lineupText = !stakesText && settings.botLineup && settings.botLineup !== "single"
          ? ` · ${engine.botLineupLabel?.(settings.botLineup) || settings.botLineup}`
          : "";
        const strategyText = !stakesText && settings.botStrategyPool && settings.botStrategyPool !== "auto"
          ? ` · ${engine.botStrategyPoolLabel?.(settings.botStrategyPool) || settings.botStrategyPool}`
          : "";
        const botPackKey = engine.normalizeBotPack?.(settings.botPack) || "hidden-archetypes";
        const botPackOption = Array.from(controls.botPackSelect?.options || []).find((option) => option.value === botPackKey);
        const botPackText = botPackKey && botPackKey !== "hidden-archetypes"
          ? ` · ${(botPackOption?.textContent || engine.botPackLabel?.(botPackKey) || botPackKey).split(":")[0]}`
          : "";
        if (scope.hudOnly) {
          options.renderSessionStats();
          recordRenderMetrics(reason, startedAt);
          return;
        }
        if (scope.scoped) {
          options.clearExpiredRenderedAnimations();
        } else {
          options.repairPendingBotResponses();
          options.clearExpiredRenderedAnimations();
          options.prepareActionClocks();
        }
        renderTables();
        if (scope.scoped) {
          if (scope.hud) options.renderSessionStats();
          recordRenderMetrics(reason, startedAt);
          return;
        }
        options.announceHeroTurnForActiveTable();
        syncDealerSnapshots();
        options.setTextIfChanged(controls.sessionSubtitle, `${pack.name} · ${stakesText || difficultyLabel(settings.difficulty)}${lineupText}${strategyText}${botPackText} · ${settings.playerCount}-max · ${settings.tableCount} стол${settings.tableCount === 1 ? "" : "а"}`);
        (Array.isArray(controls.countButtons) ? controls.countButtons : []).forEach((button) => {
          options.setAttributeIfChanged(button, "aria-pressed", String(Number(button.dataset.tableCount) === settings.tableCount));
        });
        options.syncPauseButton();
        options.syncDealButton();
        options.setValueIfChanged(controls.packSelect, settings.pack);
        options.setValueIfChanged(controls.stakesSelect, settings.stakesLevel || "mid");
        options.setValueIfChanged(controls.botPackSelect, botPackKey);
        options.setValueIfChanged(controls.difficultySelect, settings.difficulty);
        options.setValueIfChanged(controls.lineupSelect, settings.botLineup);
        options.setValueIfChanged(controls.botStrategyPoolSelect, settings.botStrategyPool || "auto");
        options.setValueIfChanged(controls.playerCountSelect, String(settings.playerCount));
        options.syncSimulationControls();
        options.setValueIfChanged(controls.deckSelect, settings.deck);
        options.setValueIfChanged(controls.uiScaleSelect, uiScale);
        syncSettingsSelectButtons();
        options.setCheckedIfChanged(controls.amountModeToggle, settings.amountMode === "chips");
        options.setCheckedIfChanged(controls.seatAvatarsToggle, settings.seatAvatars !== false);
        options.setValueIfChanged(controls.sliderPresetsInput, settings.sliderPresets);
        options.setValueIfChanged(controls.postflopBetPercentsInput, settings.postflopBetPercents);
        options.setCheckedIfChanged(controls.soundToggle, settings.sound);
        options.setCheckedIfChanged(controls.trainingModeToggle, settings.trainingMode);
        options.setCheckedIfChanged(controls.revealCardsToggle, settings.revealOpponentCardsOnFinish);
        options.setCheckedIfChanged(controls.lobbyEventsToggle, settings.lobbyEvents);
        options.setDisabledIfChanged(controls.replayButton, !options.replayEntries().length);
        if (controls.settingsDialog?.open) {
          options.renderBotLabOutput();
          options.renderImportStatus();
        }
        if (controls.leaderboardDialog?.open) {
          // Per-frame innerHTML rebuilds killed input focus, open selects and
          // hover tooltips inside the dialog; the body itself skips the rebuild
          // when nothing it displays has changed.
          options.renderLeaderboardBody({ onlyIfChanged: true });
        }
        options.renderSessionStats();
        options.updateAutoDealCountdowns();
        options.syncAutoDealCountdownTicker();
        options.updateActionClocks("sync");
        options.syncActionClockTicker();
        recordRenderMetrics(reason, startedAt);
      } finally {
        state.renderScheduler.currentRenderMetrics = null;
      }
    }

    function splitReasonItems(reason = "") {
      return String(reason || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    function warnUnknownRenderReasons(reasonItems) {
      if (!Array.isArray(reasonItems) || !reasonItems.length) return;
      reasonItems.forEach((item) => {
        if (RENDER_REASONS.isKnownItem(item) || warnedRenderReasons.has(item)) return;
        warnedRenderReasons.add(item);
        const consoleRef = typeof console !== "undefined" ? console : null;
        if (consoleRef && typeof consoleRef.warn === "function") {
          consoleRef.warn(
            `[poker-simulator] unknown render reason "${item}" — falling back to a full multi-table render. ` +
            "Register it in PokerSimulatorRenderReasons (TABLE_ONLY / HUD_ONLY / FULL) and pick its scope."
          );
        }
      });
    }

    function renderReasonScope(reason = "") {
      // Accept either the raw reason string or an already-split item array, so a
      // hot caller (renderNow) can split once and reuse it for both the scope
      // and the unknown-reason warning instead of re-splitting per rAF frame.
      const reasons = Array.isArray(reason) ? reason : splitReasonItems(reason);
      if (!reasons.length) return { scoped: false, table: false, hud: false, hudOnly: false };
      const table = reasons.some(isTableOnlyRenderReasonItem);
      const hud = reasons.some(isHudOnlyRenderReasonItem);
      const scoped = reasons.every((item) => isTableOnlyRenderReasonItem(item) || isHudOnlyRenderReasonItem(item));
      return {
        scoped,
        table: scoped && table,
        hud: scoped && hud,
        hudOnly: scoped && hud && !table
      };
    }

    function isTableOnlyRenderReason(reason = "") {
      const scope = renderReasonScope(reason);
      return scope.scoped && scope.table && !scope.hud;
    }

    function isTableOnlyRenderReasonItem(item = "") {
      return RENDER_REASONS.isTableOnlyItem(item);
    }

    function isHudOnlyRenderReason(reason = "") {
      const reasons = splitReasonItems(reason);
      return Boolean(reasons.length) && reasons.every(isHudOnlyRenderReasonItem);
    }

    function isHudOnlyRenderReasonItem(item = "") {
      return RENDER_REASONS.isHudOnlyItem(item);
    }

    function renderTables() {
      if (!tableGrid) return;
      const settings = currentSettings();
      const nextTableCount = String(settings.tableCount);
      if (tableGrid.dataset.count !== nextTableCount) tableGrid.dataset.count = nextTableCount;
      tableGrid.classList.toggle("is-idle", !state.started);
      if (!state.started) {
        renderedTableHtml().clear();
        state.renderScheduler.forceAllTableRender = false;
        dirtyTableIds().clear();
        const html = renderStartPanel().trim();
        if (tableGrid.innerHTML.trim() !== html) tableGrid.innerHTML = html;
        return;
      }
      // The start panel renders as TWO top-level nodes (felt preview + panel)
      // — remove both, or the green idle preview stays painted over live
      // tables forever.
      tableGrid.querySelectorAll(":scope > .simulator-start-panel, :scope > .start-felt-preview").forEach((panel) => panel.remove());
      const forceAll = Boolean(state.renderScheduler.forceAllTableRender);
      const dirtyIds = dirtyTableIds();
      const deferredDirtyIds = new Set();
      const liveIds = new Set(tableList().map((table) => String(table.id)));
      const currentShells = Array.from(tableGrid.querySelectorAll(":scope > .table-shell"));
      const currentShellIds = new Set(currentShells.map((shell) => String(shell.dataset.tableId || "")));
      const canChunkForceAll = forceAll
        && liveIds.size > 1
        && liveIds.size === currentShellIds.size
        && Array.from(liveIds).every((id) => currentShellIds.has(id));
      if (canChunkForceAll) liveIds.forEach((id) => dirtyIds.add(Number(id)));
      const effectiveForceAll = forceAll && !canChunkForceAll;
      const renderDirtyIds = effectiveForceAll ? null : dirtyIdsForThisFrame(dirtyIds);
      currentShells.forEach((shell) => {
        if (!liveIds.has(String(shell.dataset.tableId))) {
          shell.remove();
        }
      });
      Array.from(renderedTableHtml().keys()).forEach((id) => {
        if (!liveIds.has(String(id))) renderedTableHtml().delete(id);
      });

      try {
        tableList().forEach((table, index) => {
          const id = String(table.id);
          const currentAtIndex = tableGrid.children[index];
          const current = currentAtIndex?.dataset?.tableId === id
            ? currentAtIndex
            : tableGrid.querySelector(`:scope > .table-shell[data-table-id="${cssEscape(id)}"]`);

          const tableId = Number(table.id);
          const isDirty = dirtyIds.has(tableId);
          if (current && !effectiveForceAll && !isDirty) {
            addPerfCount("skippedTableBuilds");
            if (state.renderScheduler.currentRenderMetrics) state.renderScheduler.currentRenderMetrics.skippedTableBuilds += 1;
            if (currentAtIndex !== current) tableGrid.insertBefore(current, currentAtIndex || null);
            return;
          }
          if (current && !effectiveForceAll && renderDirtyIds && isDirty && !renderDirtyIds.has(tableId)) {
            deferredDirtyIds.add(tableId);
            addPerfCount("skippedTableBuilds");
            if (state.renderScheduler.currentRenderMetrics) state.renderScheduler.currentRenderMetrics.skippedTableBuilds += 1;
            if (currentAtIndex !== current) tableGrid.insertBefore(current, currentAtIndex || null);
            return;
          }

          const html = options.renderTable(table).trim();
          addPerfCount("tableHtmlBuilds");
          addPerfCount("generatedHtmlBytes", html.length);
          if (state.renderScheduler.currentRenderMetrics) {
            state.renderScheduler.currentRenderMetrics.tableHtmlBuilds += 1;
            state.renderScheduler.currentRenderMetrics.generatedHtmlBytes += html.length;
          }
          const sameHtml = renderedTableHtml().get(id) === html;
          if (current && sameHtml) {
            addPerfCount("sameHtmlHits");
            if (state.renderScheduler.currentRenderMetrics) state.renderScheduler.currentRenderMetrics.sameHtmlHits += 1;
            if (currentAtIndex !== current) tableGrid.insertBefore(current, currentAtIndex || null);
            return;
          }

          const template = documentRef.createElement("template");
          template.innerHTML = html;
          const nextShell = template.content.firstElementChild;
          if (!nextShell) return;
          if (current) {
            options.patchTableShell(current, nextShell, html.length);
          } else {
            tableGrid.insertBefore(nextShell, currentAtIndex || null);
          }
          renderedTableHtml().set(id, html);
        });
      } finally {
        state.renderScheduler.forceAllTableRender = false;
        dirtyIds.clear();
        deferredDirtyIds.forEach((id) => dirtyIds.add(id));
      }
      syncPauseOverlay();
      scheduleDeferredDirtyRender(deferredDirtyIds);
    }

    function dirtyIdsForThisFrame(dirtyIds) {
      if (!(dirtyIds instanceof Set) || dirtyIds.size <= 1) return null;
      if (Number(currentSettings().tableCount || 1) <= 1) return null;
      const preferredId = Number(dirtyIds.values().next().value);
      if (!Number.isFinite(preferredId) || preferredId <= 0) return null;
      return new Set([preferredId]);
    }

    function scheduleDeferredDirtyRender(deferredDirtyIds) {
      if (!(deferredDirtyIds instanceof Set) || !deferredDirtyIds.size) return;
      if (state.renderScheduler.renderRaf) return;
      addPerfCount("scheduleRenderCalls");
      state.renderScheduler.renderRaf = windowRef.requestAnimationFrame(() => {
        state.renderScheduler.renderRaf = 0;
        renderNow("deferred-table-patch");
      });
    }

    function renderStartPanel() {
      return options.renderStartPanel();
    }

    function syncPauseOverlay() {
      if (!tableGrid) return;
      const existing = tableGrid.querySelector(":scope > .pause-overlay");
      const html = options.renderPauseOverlay().trim();
      if (!html) {
        existing?.remove();
        return;
      }
      if (existing && existing.outerHTML === html) {
        tableGrid.append(existing);
        return;
      }
      const template = documentRef.createElement("template");
      template.innerHTML = html;
      const nextOverlay = template.content.firstElementChild;
      if (!nextOverlay) return;
      if (existing) {
        existing.replaceWith(nextOverlay);
      } else {
        tableGrid.append(nextOverlay);
      }
    }

    return {
      renderNow,
      renderTables,
      renderStartPanel,
      syncPauseOverlay
    };
  }

  root.PokerSimulatorRenderReasons = RENDER_REASONS;
  root.PokerSimulatorRenderRuntime = { model };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PokerSimulatorRenderRuntime;
})();
